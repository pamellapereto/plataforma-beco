import assert from 'node:assert/strict';
import test from 'node:test';
import { HttpError } from '../backedb/src/lib/http.js';
import { defaultHomepageContent, HomepageService } from '../backedb/src/modules/homepage/homepage.service.js';

const admin={id:'11111111-1111-4111-8111-111111111111',role:'BECO_ADMIN'};

test('homepage returns branded defaults when no customization exists',async()=>{
  const service=new HomepageService({request:async()=>[]});
  assert.deepEqual(await service.get(),defaultHomepageContent);
});

test('homepage customization is restricted to administrators',async()=>{
  const service=new HomepageService({});
  await assert.rejects(()=>service.update({}, {id:'user',role:'EXHIBITOR'}),error=>error instanceof HttpError&&error.code==='FORBIDDEN');
});

test('administrator can update homepage text while preserving the current image',async()=>{
  let saved;
  const row={id:true,eyebrow:'Novo destaque',title:'Novo título',intro_text:'Novo parágrafo',image_asset_id:null,image_alt:'Descrição',caption_title:'Na foto',caption_text:'Outro parágrafo',updated_at:'2026-10-30T12:00:00Z'};
  const gateway={request:async(path,options)=>{
    if(path.startsWith('rest/v1/homepage_content?on_conflict=')){saved=options.body;return [row];}
    if(path.startsWith('rest/v1/homepage_content?select='))return [row];
    throw new Error(`Unexpected request: ${path}`);
  }};
  const service=new HomepageService(gateway);
  const result=await service.update({eyebrow:'Novo destaque',title:'Novo título',introText:'Novo parágrafo',imageAlt:'Descrição',captionTitle:'Na foto',captionText:'Outro parágrafo'},admin);
  assert.equal(saved.image_asset_id,undefined);
  assert.equal(result.title,'Novo título');
  assert.equal(result.imageUrl,defaultHomepageContent.imageUrl);
});

test('homepage validation rejects empty required text',async()=>{
  const service=new HomepageService({});
  await assert.rejects(()=>service.update({eyebrow:'',title:'Título',introText:'Texto',imageAlt:'Imagem',captionTitle:'Foto',captionText:'Texto'},admin),error=>error instanceof HttpError&&error.code==='INVALID_HOME_CONTENT');
});
