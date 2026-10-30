import pg from 'pg';
import { config } from '../config.js';
import { HttpError } from './http.js';

const { Pool } = pg;
let pool;

function databasePool() {
  if (!config.database.url) throw new HttpError(503, 'POSTGRES_NOT_CONFIGURED', 'DATABASE_URL não foi configurada.');
  pool ||= new Pool({
    connectionString: config.database.url,
    max: Number.isFinite(config.database.poolMax) ? config.database.poolMax : 10,
    ssl: config.database.ssl ? { rejectUnauthorized: false } : false
  });
  return pool;
}

const identifier = value => {
  if (!/^[a-z_][a-z0-9_]*$/i.test(value)) throw new HttpError(400, 'INVALID_DATABASE_QUERY', 'Identificador de banco inválido.');
  return `"${value}"`;
};

function splitTopLevel(value) {
  const result = []; let depth = 0; let current = '';
  for (const char of String(value || '')) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) { result.push(current); current = ''; } else current += char;
  }
  if (current) result.push(current);
  return result;
}

function selectedColumns(raw) {
  if (!raw || raw === '*') return '*';
  const columns = splitTopLevel(raw).filter(item => !item.includes('(')).map(item => {
    const [alias, column] = item.split(':');
    return column ? `${identifier(column)} AS ${identifier(alias)}` : identifier(alias);
  });
  return columns.length ? columns.join(', ') : '*';
}

function decode(value) { return decodeURIComponent(String(value).replace(/\+/g, ' ')); }

function whereClause(params, values) {
  const clauses = [];
  const ignored = new Set(['select', 'order', 'limit', 'offset', 'on_conflict']);
  for (const [rawKey, rawValue] of params.entries()) {
    if (ignored.has(rawKey)) continue;
    const key = identifier(rawKey);
    const value = decode(rawValue);
    const add = item => { values.push(item); return `$${values.length}`; };
    if (value.startsWith('eq.')) clauses.push(`${key} = ${add(value.slice(3))}`);
    else if (value.startsWith('neq.')) clauses.push(`${key} <> ${add(value.slice(4))}`);
    else if (value.startsWith('gt.')) clauses.push(`${key} > ${add(value.slice(3))}`);
    else if (value.startsWith('gte.')) clauses.push(`${key} >= ${add(value.slice(4))}`);
    else if (value.startsWith('lt.')) clauses.push(`${key} < ${add(value.slice(3))}`);
    else if (value.startsWith('lte.')) clauses.push(`${key} <= ${add(value.slice(4))}`);
    else if (value.startsWith('like.')) clauses.push(`${key} LIKE ${add(value.slice(5).replaceAll('*', '%'))}`);
    else if (value.startsWith('ilike.')) clauses.push(`${key} ILIKE ${add(value.slice(6).replaceAll('*', '%'))}`);
    else if (value.startsWith('is.')) clauses.push(`${key} IS ${value.slice(3).toLowerCase() === 'null' ? 'NULL' : value.slice(3).toUpperCase()}`);
    else if (value.startsWith('in.(') && value.endsWith(')')) {
      const entries = splitTopLevel(value.slice(4, -1)).map(decode);
      clauses.push(`${key} IN (${entries.map(add).join(', ')})`);
    } else if (value.startsWith('not.in.(') && value.endsWith(')')) {
      const entries = splitTopLevel(value.slice(8, -1)).map(decode);
      clauses.push(`${key} NOT IN (${entries.map(add).join(', ')})`);
    }
  }
  return clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
}

function orderClause(raw) {
  if (!raw) return '';
  return ` ORDER BY ${splitTopLevel(raw).map(item => {
    const [column, direction = 'asc'] = item.split('.');
    return `${identifier(column)} ${direction.toLowerCase() === 'desc' ? 'DESC' : 'ASC'}`;
  }).join(', ')}`;
}

function postgresError(error) {
  if (error instanceof HttpError) return error;
  if (error.code === '23505') return new HttpError(409, 'RESOURCE_CONFLICT', 'Já existe um registro com esses dados.');
  if (error.code === '23503') return new HttpError(409, 'RELATED_RESOURCE_CONFLICT', 'O registro está vinculado a outro dado do sistema.');
  if (error.code === '42P01') return new HttpError(503, 'DATABASE_SCHEMA_MISSING', 'O schema da aplicação ainda não foi instalado no PostgreSQL.');
  console.error(error);
  return new HttpError(502, 'POSTGRES_REQUEST_FAILED', 'Falha ao consultar o PostgreSQL.');
}

async function rpc(name, body = {}) {
  const entries = Object.entries(body);
  const values = entries.map(([, value]) => value);
  const args = entries.map(([key], index) => `${identifier(key)} => $${index + 1}`).join(', ');
  const result = await databasePool().query(`SELECT * FROM public.${identifier(name)}(${args})`, values);
  if (result.fields.length === 1 && result.rows.length === 1) return result.rows[0][result.fields[0].name];
  return result.rows;
}

async function relatedApplicationSelect(url) {
  const select = url.searchParams.get('select') || '';
  if (select.includes('exhibitor:exhibitors(')) {
    const values = [];
    const where = whereClause(url.searchParams, values);
    const aliasedWhere = where.replace(/"([a-z_][a-z0-9_]*)"/gi, 'a."$1"');
    const sql = `SELECT a.assigned_space_id, jsonb_build_object('display_name', e.display_name) AS exhibitor FROM public.applications a LEFT JOIN public.exhibitors e ON e.id=a.exhibitor_id${aliasedWhere}`;
    return (await databasePool().query(sql, values)).rows;
  }
  if (select.includes('edition:fair_editions!inner(')) {
    const values = [];
    const add = value => { values.push(value); return `$${values.length}`; };
    const ids = splitTopLevel((url.searchParams.get('exhibitor_id') || '').replace(/^in\.\(|\)$/g, ''));
    const clauses = [
      `a.status = ${add((url.searchParams.get('status') || 'eq.CONFIRMED').replace(/^eq\./, ''))}`,
      `a.exhibitor_id IN (${ids.map(add).join(', ')})`,
      `a.fair_edition_id <> ${add((url.searchParams.get('fair_edition_id') || '').replace(/^neq\./, ''))}`,
      `fe.ends_at < ${add((url.searchParams.get('edition.ends_at') || '').replace(/^lt\./, ''))}`,
      `f.organization_id = ${add((url.searchParams.get('edition.fair.organization_id') || '').replace(/^eq\./, ''))}`
    ];
    const limit = Math.max(0, Number(url.searchParams.get('limit') || 500));
    const offset = Math.max(0, Number(url.searchParams.get('offset') || 0));
    const sql = `SELECT a.exhibitor_id, a.fair_edition_id, jsonb_build_object('id',fe.id,'title',fe.title,'ends_at',fe.ends_at,'fair',jsonb_build_object('organization_id',f.organization_id)) AS edition FROM public.applications a JOIN public.fair_editions fe ON fe.id=a.fair_edition_id JOIN public.fairs f ON f.id=fe.fair_id WHERE ${clauses.join(' AND ')} ORDER BY a.id ASC LIMIT ${limit} OFFSET ${offset}`;
    return (await databasePool().query(sql, values)).rows;
  }
  return null;
}

export async function postgresRequest(path, { method = 'GET', body, headers = {} } = {}) {
  try {
    const url = new URL(path, 'http://postgres.local/');
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] !== 'rest' || parts[1] !== 'v1') throw new HttpError(400, 'UNSUPPORTED_POSTGRES_OPERATION', 'Esta operação depende do Supabase.');
    if (parts[2] === 'rpc') return rpc(parts[3], body);
    const table = identifier(parts[2]);
    const values = [];
    const where = whereClause(url.searchParams, values);
    const returning = /return=representation/i.test(headers.Prefer || headers.prefer || '') ? ' RETURNING *' : '';
    let result;
    if (method === 'GET') {
      if (parts[2] === 'applications' && (url.searchParams.get('select') || '').includes('(')) {
        const related = await relatedApplicationSelect(url);
        if (related) return related;
      }
      const limit = url.searchParams.get('limit');
      const offset = url.searchParams.get('offset');
      const paging = `${limit ? ` LIMIT ${Math.max(0, Number(limit))}` : ''}${offset ? ` OFFSET ${Math.max(0, Number(offset))}` : ''}`;
      result = await databasePool().query(`SELECT ${selectedColumns(url.searchParams.get('select'))} FROM public.${table}${where}${orderClause(url.searchParams.get('order'))}${paging}`, values);
      return result.rows;
    }
    if (method === 'POST') {
      const rows = Array.isArray(body) ? body : [body || {}];
      if (!rows.length) return [];
      const columns = [...new Set(rows.flatMap(Object.keys))];
      const insertValues = [];
      const tuples = rows.map(row => `(${columns.map(column => { insertValues.push(row[column] ?? null); return `$${insertValues.length}`; }).join(', ')})`);
      const conflict = url.searchParams.get('on_conflict');
      const updateColumns = conflict ? columns.filter(c => !conflict.split(',').includes(c)) : [];
      const conflictSql = conflict ? ` ON CONFLICT (${conflict.split(',').map(identifier).join(', ')}) ${updateColumns.length ? `DO UPDATE SET ${updateColumns.map(c => `${identifier(c)}=EXCLUDED.${identifier(c)}`).join(', ')}` : 'DO NOTHING'}` : '';
      result = await databasePool().query(`INSERT INTO public.${table} (${columns.map(identifier).join(', ')}) VALUES ${tuples.join(', ')}${conflictSql}${returning}`, insertValues);
      return result.rows;
    }
    if (method === 'PATCH') {
      const entries = Object.entries(body || {});
      const set = entries.map(([key, value]) => { values.push(value); return `${identifier(key)} = $${values.length}`; }).join(', ');
      result = await databasePool().query(`UPDATE public.${table} SET ${set}${where}${returning}`, values);
      return result.rows;
    }
    if (method === 'DELETE') {
      result = await databasePool().query(`DELETE FROM public.${table}${where}${returning}`, values);
      return result.rows;
    }
    throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Operação não suportada pelo adaptador PostgreSQL.');
  } catch (error) { throw postgresError(error); }
}

export async function checkPostgresConnection() {
  const result = await databasePool().query('SELECT current_database() AS database, current_user AS user, version() AS version');
  return result.rows[0];
}

export async function mirrorPostgresAuthUser(user) {
  if (!user?.id) return;
  await databasePool().query(
    'INSERT INTO auth.users (id, email) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email',
    [user.id, user.email || null]
  );
}

export async function closePostgresPool() { if (pool) { await pool.end(); pool = null; } }
