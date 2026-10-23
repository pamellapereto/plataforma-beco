export class HttpError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '86400',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
  Vary: 'Origin'
};

export function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders });
  response.end(JSON.stringify(payload));
}

export function notFound(response) {
  sendJson(response, 404, { error: { code: 'NOT_FOUND', message: 'Rota não encontrada.' } });
}

export function handleError(response, error) {
  if (error instanceof HttpError) {
    sendJson(response, error.statusCode, { error: { code: error.code, message: error.message } });
    return;
  }
  console.error(error);
  sendJson(response, 500, { error: { code: 'INTERNAL_ERROR', message: 'Erro interno da API.' } });
}

function jsonObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'INVALID_JSON', 'Envie um objeto JSON válido.');
  return value;
}

export async function readJson(request, limitBytes = 1024 * 1024) {
  if (request.body !== undefined && request.body !== null) {
    if (typeof request.body === 'object' && !Buffer.isBuffer(request.body)) { if (Buffer.byteLength(JSON.stringify(request.body)) > limitBytes) throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Corpo da requisição excede o limite.'); return jsonObject(request.body); }
    const rawBody = Buffer.isBuffer(request.body) ? request.body.toString('utf8') : String(request.body);
    if (Buffer.byteLength(rawBody) > limitBytes) throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Corpo da requisição excede o limite.');
    try {
      return jsonObject(JSON.parse(rawBody));
    } catch {
      throw new HttpError(400, 'INVALID_JSON', 'JSON inválido.');
    }
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limitBytes) throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Corpo da requisição excede o limite.');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return jsonObject(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  } catch {
    throw new HttpError(400, 'INVALID_JSON', 'JSON inválido.');
  }
}
