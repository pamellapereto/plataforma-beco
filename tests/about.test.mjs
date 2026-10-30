import assert from 'node:assert/strict';
import test from 'node:test';
import { AboutService, defaultAboutContent } from '../backedb/src/modules/about/about.service.js';
import { HttpError } from '../backedb/src/lib/http.js';

const admin={id:'11111111-1111-4111-8111-111111111111',role:'BECO_ADMIN'};
const input={...defaultAboutContent,historyParagraphs:[...defaultAboutContent.historyParagraphs],facts:defaultAboutContent.facts.map(fact=>({...fact}))};

test('about page returns defaults before customization',async()=>{const service=new AboutService({request:async()=>[]});assert.deepEqual(await service.get(),input);});
test('about page editing requires an administrator',async()=>{const service=new AboutService({});await assert.rejects(()=>service.update(input,{role:'EXHIBITOR'}),error=>error instanceof HttpError&&error.code==='FORBIDDEN');});
test('about page requires three history paragraphs and four facts',async()=>{const service=new AboutService({});await assert.rejects(()=>service.update({...input,historyParagraphs:[]},admin),error=>error instanceof HttpError&&error.code==='INVALID_ABOUT_CONTENT');await assert.rejects(()=>service.update({...input,facts:[]},admin),error=>error instanceof HttpError&&error.code==='INVALID_ABOUT_CONTENT');});
test('administrator can publish about page content',async()=>{let saved;const row={id:true,intro_eyebrow:input.introEyebrow,intro_title:'Título atualizado',intro_text:input.introText,history_eyebrow:input.historyEyebrow,history_title:input.historyTitle,history_paragraphs:input.historyParagraphs,motto_label:input.mottoLabel,motto_text:input.mottoText,facts:input.facts,support_eyebrow:input.supportEyebrow,support_title:input.supportTitle,support_text:input.supportText};const gateway={request:async(path,options)=>{if(path.includes('on_conflict')){saved=options.body;return [row];}return [row];}};const result=await new AboutService(gateway).update({...input,introTitle:'Título atualizado'},admin);assert.equal(saved.intro_title,'Título atualizado');assert.equal(result.introTitle,'Título atualizado');});
