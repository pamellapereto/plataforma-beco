import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window={location:{protocol:'http:'},localStorage:{getItem:()=>null,setItem(){},removeItem(){}}};
const { applicationChecklist }=await import('../assets/js/controllers/curation-application.controller.js');

const detail=(overrides={})=>({
  application:{status:'UNDER_REVIEW',assigned_space_id:null,...overrides.application},
  media:overrides.media||[],
  exceptionRequest:overrides.exceptionRequest??null
});

test('curation checklist highlights pending media and decision',()=>{
  const items=applicationChecklist(detail({media:[{review_status:'PENDING'}]}));
  assert.equal(items.find(item=>item.label==='Formulário enviado').state,'complete');
  assert.equal(items.find(item=>item.label==='Imagens revisadas').state,'pending');
  assert.equal(items.find(item=>item.label==='Decisão da curadoria').state,'pending');
});

test('curation checklist flags an approved application without a space',()=>{
  const items=applicationChecklist(detail({application:{status:'APPROVED'},media:[{review_status:'APPROVED'}]}));
  assert.equal(items.find(item=>item.label==='Imagens revisadas').state,'complete');
  assert.equal(items.find(item=>item.label==='Decisão da curadoria').state,'complete');
  assert.equal(items.find(item=>item.label==='Espaço definido').state,'attention');
});

test('curation checklist is complete after confirmation and space assignment',()=>{
  const items=applicationChecklist(detail({application:{status:'CONFIRMED',assigned_space_id:'space-1'},media:[{review_status:'APPROVED'}]}));
  assert.equal(items.every(item=>item.state==='complete'),true);
});
