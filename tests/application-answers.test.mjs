import assert from 'node:assert/strict';
import test from 'node:test';
import { HttpError } from '../backedb/src/lib/http.js';
import { ApplicationsService } from '../backedb/src/modules/applications/applications.service.js';
import { validateAnswers } from '../backedb/src/modules/applications/applications.validation.js';

globalThis.window ||= { location:{ protocol:'http:' }, localStorage:{ getItem:()=>null, setItem(){}, removeItem(){} } };
const { enabledApplicationAnswers } = await import('../assets/js/controllers/application.controller.js');

const applicationId='11111111-1111-4111-8111-111111111111';
const editionId='22222222-2222-4222-8222-222222222222';
const toggleId='33333333-3333-4333-8333-333333333333';
const conditionalId='44444444-4444-4444-8444-444444444444';
const numberId='55555555-5555-4555-8555-555555555555';
const imageId='66666666-6666-4666-8666-666666666666';

const fields=[
  {id:toggleId,field_key:'show_extra',type:'CHECKBOX',options:[]},
  {id:conditionalId,field_key:'extra',type:'SHORT_TEXT',options:[],conditional_logic:{fieldKey:'show_extra',operator:'truthy'}},
  {id:numberId,field_key:'quantity',type:'NUMBER',options:[]},
  {id:imageId,field_key:'photo',type:'IMAGE',options:[]}
];
const formDefinition={sections:[{fields}],required_consents:[]};

test('frontend omits disabled, media, null, and undefined answers while preserving false, zero, and empty arrays', () => {
  const controls={
    [`field_${toggleId}`]:{disabled:false},
    [`field_${conditionalId}`]:{disabled:true},
    [`field_${numberId}`]:{disabled:false},
    [`field_${imageId}`]:{disabled:false}
  };
  const values=new Map([[toggleId,false],[conditionalId,null],[numberId,0],[imageId,undefined]]);
  assert.deepEqual(enabledApplicationAnswers(fields,{elements:controls},field=>values.get(field.id)),[
    {fieldId:toggleId,value:false},
    {fieldId:numberId,value:0}
  ]);
  const multi={id:'77777777-7777-4777-8777-777777777777',type:'MULTISELECT'};
  assert.deepEqual(enabledApplicationAnswers([multi],{elements:{[`field_${multi.id}`]:{disabled:false}}},()=>[]),[{fieldId:multi.id,value:[]}]);
});

test('answer validation rejects null and undefined with a controlled error', () => {
  for(const value of [null,undefined])assert.throws(
    ()=>validateAnswers({answers:[{fieldId:toggleId,value}]}),
    error=>error instanceof HttpError&&error.code==='INVALID_ANSWER_VALUE'
  );
});

test('answer validation accepts legitimate falsy values', () => {
  assert.deepEqual(validateAnswers({answers:[
    {fieldId:toggleId,value:false},
    {fieldId:numberId,value:0},
    {fieldId:conditionalId,value:''}
  ]}).map(answer=>answer.value),[false,0,'']);
});

test('service ignores an inapplicable conditional answer and never persists null', async () => {
  let persisted;
  const gateway={request:async(path,options)=>{
    if(path.startsWith('rest/v1/application_answers?select='))return [];
    if(path.startsWith('rest/v1/application_answers?on_conflict=')){persisted=options.body;return options.body;}
    throw new Error(`Unexpected request: ${path}`);
  }};
  const service=new ApplicationsService(gateway,{getByEdition:async()=>formDefinition},{});
  service.applicationAccess=async()=>({id:applicationId,fair_edition_id:editionId,status:'DRAFT'});
  await service.saveAnswers(applicationId,{answers:[
    {fieldId:toggleId,value:false},
    {fieldId:conditionalId,value:'não deve ser gravado'},
    {fieldId:numberId,value:0}
  ]},{role:'EXHIBITOR'});
  assert.deepEqual(persisted.map(row=>[row.field_id,row.value_json]),[[toggleId,false],[numberId,0]]);
  assert.equal(persisted.some(row=>row.value_json==null),false);
});

test('visible required fields still fail final submission when empty', async () => {
  const requiredForm={sections:[{fields:[{id:conditionalId,field_key:'name',label:'Nome',type:'SHORT_TEXT',is_required:true,conditional_logic:{},options:[]}]}],required_consents:[]};
  const gateway={request:async(path)=>path.startsWith('rest/v1/application_answers?select=')?[]:[]};
  const forms={getForApplicant:async()=>requiredForm,getByEdition:async()=>requiredForm};
  const service=new ApplicationsService(gateway,forms,{});
  service.applicationAccess=async()=>({id:applicationId,fair_edition_id:editionId,status:'DRAFT'});
  await assert.rejects(()=>service.submit(applicationId,{consents:[]},{id:'user',role:'EXHIBITOR'}),error=>error instanceof HttpError&&error.code==='REQUIRED_ANSWER_MISSING');
});

test('hidden conditional required fields do not block final submission', async () => {
  const conditionalForm={sections:[{fields:[
    {...fields[0],is_required:false},
    {...fields[1],label:'Complemento',is_required:true}
  ]}],required_consents:[]};
  let transitioned=false;
  const gateway={request:async(path)=>{
    if(path.startsWith('rest/v1/application_answers?select='))return [{field_id:toggleId,value_json:false}];
    if(path==='rest/v1/rpc/submit_application'){transitioned=true;return [{id:applicationId,status:'SUBMITTED'}];}
    return [];
  }};
  const forms={getForApplicant:async()=>conditionalForm,getByEdition:async()=>conditionalForm};
  const service=new ApplicationsService(gateway,forms,{});
  service.applicationAccess=async()=>({id:applicationId,fair_edition_id:editionId,status:'DRAFT'});
  await service.submit(applicationId,{consents:[]},{id:'user',role:'EXHIBITOR'});
  assert.equal(transitioned,true);
});

test('final submission succeeds with persisted non-null answers', async () => {
  const requiredForm={sections:[{fields:[{id:conditionalId,field_key:'name',label:'Nome',type:'SHORT_TEXT',is_required:true,conditional_logic:{},options:[]}]}],required_consents:[]};
  let transitioned=false;
  const gateway={request:async(path)=>{
    if(path.startsWith('rest/v1/application_answers?select='))return [{field_id:conditionalId,value_json:'Artesã'}];
    if(path==='rest/v1/rpc/submit_application'){transitioned=true;return [{id:applicationId,status:'SUBMITTED'}];}
    return [];
  }};
  const forms={getForApplicant:async()=>requiredForm,getByEdition:async()=>requiredForm};
  const service=new ApplicationsService(gateway,forms,{});
  service.applicationAccess=async()=>({id:applicationId,fair_edition_id:editionId,status:'DRAFT'});
  const result=await service.submit(applicationId,{consents:[]},{id:'user',role:'EXHIBITOR'});
  assert.equal(transitioned,true);
  assert.equal(result.status,'SUBMITTED');
});
