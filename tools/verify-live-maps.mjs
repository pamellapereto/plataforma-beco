import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {supabaseGateway as gateway,supabaseRequest as db} from '../backedb/src/lib/supabase.js';
import {SpacesService} from '../backedb/src/modules/spaces/spaces.service.js';
import {FairsService} from '../backedb/src/modules/fairs/fairs.service.js';
const run=randomUUID(),suffix=run.slice(0,8),checks=[],users=[];let org,fair,location,report,failed=false;
const row=async(table,body)=>(await db(`rest/v1/${table}`,{method:'POST',body,headers:{Prefer:'return=representation'}}))[0];
const check=async(name,fn)=>{await fn();checks.push({name,status:'PASSED'});};
async function user(role,name){const email=`map-${suffix}-${name}@beco.example`;const result=await gateway.adminCreateAuthUser({email,password:randomBytes(30).toString('base64url')+'Aa1!',fullName:'Map QA'});const u=result.user||result;users.push(u.id);await row('app_users',{id:u.id,email,role,organization_id:role==='BECO_ADMIN'?org.id:null,is_active:true});return {id:u.id,role,organizationId:org.id};}
try{
 report=await row('platform_verifications',{status:'RUNNING',source_revision:'geographic-maps'});
 org=await row('organizations',{legal_name:`Map QA ${suffix}`,display_name:`Map QA ${suffix}`});
 const admin=await user('BECO_ADMIN','admin'),one=await user('EXHIBITOR','one'),two=await user('EXHIBITOR','two');
 const profiles=[];for(const principal of [one,two])profiles.push(await row('exhibitors',{user_id:principal.id,display_name:`Map QA ${profiles.length}`,contact_name:'QA',phone:'15999999999',status:'APPROVED',profile_visibility:'PUBLIC'}));
 location=await row('locations',{name:'QA map',address_line:'Praça de teste',city:'Sorocaba',state:'SP',latitude:-23.5015,longitude:-47.4526});
 fair=await row('fairs',{organization_id:org.id,name:`Map QA ${suffix}`,slug:`map-qa-${suffix}`});
 const edition=await row('fair_editions',{fair_id:fair.id,location_id:location.id,created_by_user_id:admin.id,title:'Map QA',slug:`map-qa-${suffix}`,public_description:'Verificação temporária',starts_at:'2099-01-01T12:00:00Z',ends_at:'2099-01-01T20:00:00Z',exhibitor_capacity:2,status:'PUBLISHED'});
 const form=await row('registration_forms',{fair_edition_id:edition.id,title:'QA',created_by_user_id:admin.id,is_published:true});
 const service=new SpacesService();let spaces;
 await check('create_and_move_geographic_stands',async()=>{spaces=await service.create(edition.id,{spaces:[{code:'A01',widthM:2,heightM:2,latitude:-23.501501,longitude:-47.452601},{code:'A02',widthM:2,heightM:2,latitude:-23.501602,longitude:-47.452702}]},admin);const moved=await service.update(edition.id,spaces[0].id,{latitude:-23.501555,longitude:-47.452666},admin);assert.equal(Number(moved.latitude),-23.501555);});
 await check('reject_invalid_coordinates_and_other_roles',async()=>{await assert.rejects(service.update(edition.id,spaces[0].id,{latitude:91,longitude:0},admin),e=>e.statusCode===422);await assert.rejects(service.list(edition.id,one),e=>e.statusCode===403);await assert.rejects(service.list(edition.id,{...admin,organizationId:randomUUID()}),e=>e.statusCode===404);});
 for(let i=0;i<2;i++){const app=await row('applications',{fair_edition_id:edition.id,exhibitor_id:profiles[i].id,registration_form_id:form.id,status:'APPROVED'});await service.assign(app.id,spaces[i].id,admin);}
 await check('each_exhibitor_receives_only_own_stand',async()=>{for(const [i,principal]of [one,two].entries()){const result=await service.mySpace(principal);assert.equal(result.length,1);assert.equal(result[0].assignedSpace.id,spaces[i].id);assert.equal('spaces'in result[0],false);assert.equal(JSON.stringify(result).includes(spaces[1-i].id),false);assert.equal(result[0].edition.location.city,'Sorocaba');}});
 await check('admin_map_contains_all_assigned_stands',async()=>{const result=await service.list(edition.id,admin);assert.equal(result.length,2);assert.ok(result.every(s=>s.assignedExhibitor));});
 await check('public_event_contains_no_stand_positions',async()=>{const result=await new FairsService().publicEdition(edition.slug);assert.equal(result.confirmedExhibitors.length,2);assert.equal(Number(result.location.latitude),-23.5015);assert.ok(result.confirmedExhibitors.every(e=>!('space'in e)&&!('assignedSpace'in e)&&!('latitude'in e)));assert.ok(spaces.every(space=>!JSON.stringify(result).includes(space.id)));});
}catch(error){failed=true;checks.push({name:'maps_integration',status:'FAILED',code:error.code||'ASSERTION_FAILED',reason:error.message.slice(0,300)});}
finally{
 try{
  if(fair)await db(`rest/v1/fairs?id=eq.${fair.id}`,{method:'DELETE'});
  if(location)await db(`rest/v1/locations?id=eq.${location.id}`,{method:'DELETE'});
  for(const id of users)await gateway.adminDeleteAuthUser(id);
  if(org)await db(`rest/v1/organizations?id=eq.${org.id}`,{method:'DELETE'});
  checks.push({name:'cleanup',status:'PASSED'});
 }catch{failed=true;checks.push({name:'cleanup',status:'FAILED'});}
 if(report)await db(`rest/v1/platform_verifications?id=eq.${report.id}`,{method:'PATCH',body:{status:failed?'FAILED':'PASSED',checks,finished_at:new Date().toISOString()}});
}
if(failed)throw Error('Map integration failed; inspect private report');
console.log('Geographic maps and access controls verified against Supabase.');
