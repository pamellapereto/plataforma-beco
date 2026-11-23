import pg from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('Defina DATABASE_URL em .env.local.');
if (process.env.DATABASE_PROVIDER !== 'postgres') throw new Error('Este seed só pode ser executado com DATABASE_PROVIDER=postgres.');

const client = new pg.Client({ connectionString, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false });
const now = new Date('2026-11-12T12:00:00-03:00');

async function one(sql, values = []) {
  const result = await client.query(sql, values);
  return result.rows[0];
}

async function seed() {
  await client.connect();
  await client.query('begin');
  try {
    const organization = await one(`select * from organizations order by created_at limit 1`);
    if (!organization) throw new Error('Execute npm run db:setup antes do seed.');

    const admin = await one(`select * from app_users where role='BECO_ADMIN' and is_active=true order by created_at limit 1`);
    if (!admin) throw new Error('Cadastre ao menos um administrador local antes do seed.');

    const profiles = await client.query(`
      select e.*, u.email from exhibitors e join app_users u on u.id=e.user_id
      where u.role='EXHIBITOR' order by u.created_at
    `);
    if (!profiles.rows.length) throw new Error('Cadastre ao menos uma conta de expositor local antes do seed.');

    const profileData = [
      ['Ateliê Jeff', 'Peças autorais e objetos decorativos produzidos em pequena escala.', 'Artesanato'],
      ['Jeff Expositor', 'Produtos artesanais que unem memória, afeto e criação contemporânea.', 'Artes visuais'],
      ['Avanti Artesanal', 'Criações manuais para presentear e compor ambientes com identidade.', 'Moda autoral']
    ];
    for (const [index, profile] of profiles.rows.entries()) {
      const data = profileData[index] || [`Expositor ${index + 1}`, 'Produção autoral da economia criativa de Sorocaba.', 'Artesanato'];
      await client.query(`update exhibitors set display_name=$2,bio=$3,city='Sorocaba',state='SP',profile_visibility='PUBLIC',status='APPROVED',updated_at=now() where id=$1`, [profile.id, data[0], data[1]]);
      const category = await one(`select id from exhibitor_categories where name=$1 limit 1`, [data[2]]);
      if (category) await client.query(`insert into exhibitor_category_links(exhibitor_id,category_id) values($1,$2) on conflict do nothing`, [profile.id, category.id]);
    }

    let location = await one(`select * from locations where maps_url='https://maps.google.com/?q=Sorocaba' limit 1`);
    location ||= await one(`
      insert into locations(name,address_line,neighborhood,city,state,maps_url)
      values('Centro Cultural de Sorocaba','Rua da Cultura, 100','Centro','Sorocaba','SP','https://maps.google.com/?q=Sorocaba') returning *
    `);

    const fairSpecs = [
      ['feira-criativa-sorocaba-demo','Feira Criativa Sorocaba','Produção autoral e economia criativa local.'],
      ['encontro-autoral-demo','Encontro Autoral','Arte, design e produção independente em um mesmo território.']
    ];
    const fairs = [];
    for (const spec of fairSpecs) {
      fairs.push(await one(`
        insert into fairs(organization_id,name,slug,short_description,description,is_active)
        values($1,$2,$3,$4,$4,true)
        on conflict(slug) do update set name=excluded.name,short_description=excluded.short_description,description=excluded.description,is_active=true,updated_at=now()
        returning *
      `, [organization.id, spec[1], spec[0], spec[2]]));
    }
    const fairCategories = await client.query(`select id from fair_categories where is_active=true order by name limit 2`);
    for (const fair of fairs) {
      for (const category of fairCategories.rows) {
        await client.query(`insert into fair_category_links(fair_id,category_id) values($1,$2) on conflict do nothing`, [fair.id, category.id]);
      }
    }

    const editionSpecs = [
      [fairs[0].id,'feira-criativa-dezembro-2026-demo','Feira Criativa · Dezembro 2026','REGISTRATION_OPEN','2026-12-06T10:00:00-03:00','2026-12-06T18:00:00-03:00','2026-11-01T09:00:00-03:00','2026-11-30T23:59:00-03:00',30],
      [fairs[0].id,'feira-criativa-novembro-2026-demo','Feira Criativa · Novembro 2026','CURATION','2026-11-22T10:00:00-03:00','2026-11-22T18:00:00-03:00','2026-10-20T09:00:00-03:00','2026-11-10T23:59:00-03:00',24],
      [fairs[1].id,'encontro-autoral-novembro-2026-demo','Encontro Autoral · Novembro 2026','CONFIRMED','2026-11-29T10:00:00-03:00','2026-11-29T18:00:00-03:00','2026-10-01T09:00:00-03:00','2026-10-31T23:59:00-03:00',20],
      [fairs[1].id,'encontro-autoral-outubro-2026-demo','Encontro Autoral · Outubro 2026','FINISHED','2026-10-18T10:00:00-03:00','2026-10-18T18:00:00-03:00','2026-09-01T09:00:00-03:00','2026-09-30T23:59:00-03:00',20]
    ];
    const editions = [];
    for (const spec of editionSpecs) {
      editions.push(await one(`
        insert into fair_editions(fair_id,location_id,created_by_user_id,title,slug,public_description,visitor_guidance,exhibitor_guidance,starts_at,ends_at,registration_opens_at,registration_closes_at,exhibitor_capacity,status)
        values($1,$2,$3,$4,$5,'Edição demonstrativa para testes locais.','Evento aberto ao público.','Consulte as orientações de montagem no painel.',$7,$8,$9,$10,$11,$6)
        on conflict(slug) do update set status=excluded.status,starts_at=excluded.starts_at,ends_at=excluded.ends_at,registration_opens_at=excluded.registration_opens_at,registration_closes_at=excluded.registration_closes_at,updated_at=now()
        returning *
      `, [spec[0], location.id, admin.id, spec[2], spec[1], spec[3], spec[4], spec[5], spec[6], spec[7], spec[8]]));
    }

    const forms = [];
    const fields = [];
    for (const edition of editions) {
      const form = await one(`
        insert into registration_forms(fair_edition_id,title,introduction,required_consents,version,is_published,created_by_user_id)
        values($1,$2,'Conte sobre seu trabalho para apoiar a análise da curadoria.',$3::jsonb,1,true,$4)
        on conflict(fair_edition_id) do update set title=excluded.title,is_published=true,updated_at=now() returning *
      `, [edition.id, `Inscrição · ${edition.title}`, JSON.stringify([{ key: 'responsibility', text: 'Declaro que as informações são verdadeiras.', required: true }]), admin.id]);
      forms.push(form);
      const section = await one(`insert into registration_form_sections(form_id,title,description,position) values($1,'Proposta do expositor','Informações para a curadoria.',0) on conflict(form_id,position) do update set title=excluded.title returning *`, [form.id]);
      const field = await one(`insert into registration_form_fields(section_id,field_key,label,help_text,type,is_required,is_sensitive,is_private,validation,conditional_logic,position) values($1,'presentation','Conte sobre seu trabalho','Apresente produtos, processo criativo e diferenciais.','LONG_TEXT',true,false,true,'{"minLength":20,"maxLength":2000}'::jsonb,'{}'::jsonb,0) on conflict(section_id,field_key) do update set label=excluded.label returning *`, [section.id]);
      fields.push(field);
    }

    const statuses = [
      ['DRAFT','SUBMITTED','AWAITING_UPDATE'],
      ['PHOTO_REVIEW','UNDER_REVIEW','WAITLISTED'],
      ['APPROVED','CONFIRMED','DECLINED'],
      ['CONFIRMED','CONFIRMED','CANCELLED']
    ];
    const applications = [];
    for (let editionIndex = 0; editionIndex < editions.length; editionIndex += 1) {
      const edition = editions[editionIndex];
      for (let profileIndex = 0; profileIndex < profiles.rows.length; profileIndex += 1) {
        const profile = profiles.rows[profileIndex];
        const status = statuses[editionIndex][profileIndex % statuses[editionIndex].length];
        const submitted = status === 'DRAFT' ? null : new Date(now.getTime() - (editionIndex + profileIndex + 2) * 86400000).toISOString();
        const reviewed = ['APPROVED','CONFIRMED','DECLINED','WAITLISTED'].includes(status);
        const application = await one(`
          insert into applications(fair_edition_id,exhibitor_id,registration_form_id,status,requested_space_type,submitted_at,reviewed_by_user_id,reviewed_at,curator_decision_note)
          values($1,$2,$3,$4,'2x2',$5,$6,$7,$8)
          on conflict(fair_edition_id,exhibitor_id) do update set registration_form_id=excluded.registration_form_id,status=excluded.status,submitted_at=excluded.submitted_at,reviewed_by_user_id=excluded.reviewed_by_user_id,reviewed_at=excluded.reviewed_at,curator_decision_note=excluded.curator_decision_note,updated_at=now()
          returning *
        `, [edition.id, profile.id, forms[editionIndex].id, status, submitted, reviewed ? admin.id : null, reviewed ? submitted : null, reviewed ? `Decisão demonstrativa: ${status}.` : null]);
        applications.push(application);
        await client.query(`insert into application_answers(application_id,field_id,value_json) values($1,$2,$3::jsonb) on conflict(application_id,field_id) do update set value_json=excluded.value_json,updated_at=now()`, [application.id, fields[editionIndex].id, JSON.stringify(`Apresentação de ${profile.display_name}: produção autoral, processo criativo e relação com a economia criativa local.`)]);
        await client.query(`insert into application_consents(application_id,consent_key,consent_text) values($1,'responsibility','Declaro que as informações são verdadeiras.') on conflict(application_id,consent_key) do nothing`, [application.id]);
        const note = `Cenário local criado para testar o status ${status}.`;
        await client.query(`insert into application_history(application_id,actor_user_id,status,note,is_visible_to_exhibitor) select $1,$2,$3,$4,true where not exists(select 1 from application_history where application_id=$1 and note=$4)`, [application.id, admin.id, status, note]);
      }
    }

    for (const [editionIndex, edition] of editions.entries()) {
      for (let index = 1; index <= 6; index += 1) {
        await client.query(`insert into fair_spaces(fair_edition_id,code,label,width_m,height_m,x_coordinate,y_coordinate,is_available) values($1,$2,$3,2,2,$4,$5,true) on conflict(fair_edition_id,code) do update set label=excluded.label`, [edition.id, `E${index}`, `Espaço E${index}`, 12 + index * 10, 25 + (index % 2) * 20]);
      }
    }

    const confirmed = applications.filter(item => item.status === 'CONFIRMED');
    for (const [index, application] of confirmed.entries()) {
      const space = await one(`select id from fair_spaces where fair_edition_id=$1 order by code offset $2 limit 1`, [application.fair_edition_id, index % 6]);
      if (space) await client.query(`update applications set assigned_space_id=$2,space_assigned_by_user_id=$3,space_assigned_at=now() where id=$1`, [application.id, space.id, admin.id]);
    }

    const finishedApplications = applications.filter(item => item.fair_edition_id === editions[3].id && item.status === 'CONFIRMED');
    for (const [index, application] of finishedApplications.entries()) {
      await client.query(`insert into application_attendance(application_id,attended,note,recorded_by_user_id) values($1,true,'Presença confirmada no cenário local.',$2) on conflict(application_id) do update set attended=true,note=excluded.note,recorded_by_user_id=excluded.recorded_by_user_id,updated_at=now()`, [application.id, admin.id]);
      await client.query(`insert into event_evaluations(application_id,organization_communication_rating,structure_rating,publicity_rating,audience_rating,overall_rating,sales_rating,comments) values($1,5,4,4,5,5,$2,'Experiência demonstrativa registrada para testar o pós-evento.') on conflict(application_id) do update set overall_rating=excluded.overall_rating,comments=excluded.comments,updated_at=now()`, [application.id, index % 2 ? 4 : 5]);
    }

    await client.query('commit');
    const summary = await one(`select (select count(*) from fairs) fairs,(select count(*) from fair_editions) editions,(select count(*) from applications) applications,(select count(*) from fair_spaces) spaces,(select count(*) from application_attendance) attendance,(select count(*) from event_evaluations) evaluations`);
    console.log('Seed local concluído sem apagar dados existentes.');
    console.table(summary);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    await client.end();
  }
}

seed().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
