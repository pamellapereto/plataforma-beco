import assert from 'node:assert/strict';
import {supabaseRequest as db} from '../backedb/src/lib/supabase.js';
import {CurationService} from '../backedb/src/modules/curation/curation.service.js';
const checks=[];let failure=false;
try {
 const [admin]=await db('rest/v1/app_users?select=id,organization_id&role=eq.BECO_ADMIN&is_active=eq.true&limit=1');assert.ok(admin);
 const [fair]=await db(`rest/v1/fairs?select=id&organization_id=eq.${admin.organization_id}&limit=1`);assert.ok(fair);
 const [edition]=await db(`rest/v1/fair_editions?select=id,starts_at&fair_id=eq.${fair.id}&limit=1`);assert.ok(edition);
 // Exercise the real joined query even when the selected edition has no applications.
 const rows=await db(`rest/v1/applications?select=exhibitor_id,fair_edition_id,edition:fair_editions!inner(id,title,ends_at,fair:fairs!inner(organization_id))&status=eq.CONFIRMED&edition.fair.organization_id=eq.${admin.organization_id}&edition.ends_at=lt.${encodeURIComponent(new Date().toISOString())}&limit=1`);assert.ok(Array.isArray(rows));checks.push({name:'scoped_history_join',status:'PASSED'});
 const apps=await new CurationService().list(edition.id,{}, {id:admin.id,role:'BECO_ADMIN',organizationId:admin.organization_id});
 for(const a of apps)assert.ok(Number.isInteger(a.participationHistory.previousConfirmedEditions));
 checks.push({name:'curation_list_with_history',status:'PASSED',applications:apps.length});
}catch(error){failure=true;checks.push({name:'curation_history',status:'FAILED',code:error.code||'VERIFICATION_FAILED'});}
await db('rest/v1/platform_verifications',{method:'POST',body:{status:failure?'FAILED':'PASSED',source_revision:'curation-participation-history',finished_at:new Date().toISOString(),checks}});
if(failure)throw Error('History verification failed; inspect private report');
console.log('Curation history integration verified.');
