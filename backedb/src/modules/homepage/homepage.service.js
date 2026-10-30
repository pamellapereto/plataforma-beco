import { randomUUID } from 'node:crypto';
import { config } from '../../config.js';
import { requireBecoAdmin } from '../../lib/auth.js';
import { HttpError } from '../../lib/http.js';
import { assertStoredImage } from '../../lib/storage.js';
import { supabaseGateway } from '../../lib/supabase.js';

export const defaultHomepageContent = Object.freeze({
  eyebrow: 'Arte, memória e geração de renda',
  title: 'Feiras que fazem a cultura circular por Sorocaba.',
  introText: 'O sistema BECO organiza as feiras da Associação Cultural de Fomento à Arte e Memória de Sorocaba e Região, aproximando público, expositores e curadoria.',
  imageUrl: 'assets/evento-artesanato-human.jpg',
  imageAlt: 'Público em feira cultural',
  captionTitle: 'Conheça nossas feiras',
  captionText: 'Incentivo à produção artística local e economia criativa.'
});

function cleanFilename(name='imagem') { return String(name).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9._-]/g,'-').replace(/-+/g,'-').slice(-120)||'imagem'; }
function text(value,label,max) { const result=String(value??'').trim();if(!result)throw new HttpError(422,'INVALID_HOME_CONTENT',`Informe ${label}.`);if(result.length>max)throw new HttpError(422,'INVALID_HOME_CONTENT',`${label} deve ter até ${max} caracteres.`);return result; }
function file(input){const originalFilename=text(input?.originalFilename,'o nome da imagem',255);if(!config.upload.allowedMimeTypes.includes(input?.mimeType))throw new HttpError(422,'INVALID_MEDIA_TYPE','Formato de imagem inválido.');if(!Number.isInteger(input?.byteSize)||input.byteSize<=0||input.byteSize>config.upload.maxBytes)throw new HttpError(422,'INVALID_MEDIA_SIZE','Tamanho de imagem inválido.');return {originalFilename,mimeType:input.mimeType,byteSize:input.byteSize};}
function mediaUrl(path){return /^https?:\/\//i.test(path)?path:`${config.supabase.url}${path}`;}
function publicUrl(asset){const base=config.supabase.url?.replace(/\/$/,'')||'';const path=asset.object_path.split('/').map(encodeURIComponent).join('/');return `${base}/storage/v1/object/public/${encodeURIComponent(asset.storage_bucket)}/${path}`;}

export class HomepageService {
  constructor(gateway=supabaseGateway){this.gateway=gateway;}
  async get(){
    const rows=await this.gateway.request('rest/v1/homepage_content?select=*&id=eq.true&limit=1');
    const row=rows[0];if(!row)return {...defaultHomepageContent};
    let imageUrl=defaultHomepageContent.imageUrl;
    if(row.image_asset_id){const assets=await this.gateway.request(`rest/v1/media_assets?select=id,storage_bucket,object_path&id=eq.${row.image_asset_id}&limit=1`);if(assets[0])imageUrl=publicUrl(assets[0]);}
    return {eyebrow:row.eyebrow,title:row.title,introText:row.intro_text,imageUrl,imageAlt:row.image_alt,captionTitle:row.caption_title,captionText:row.caption_text,updatedAt:row.updated_at};
  }
  async adminGet(principal){requireBecoAdmin(principal);return this.get();}
  async update(input,principal){
    requireBecoAdmin(principal);
    const body={id:true,eyebrow:text(input?.eyebrow,'o destaque',120),title:text(input?.title,'o título',180),intro_text:text(input?.introText,'o texto de apresentação',1200),image_alt:text(input?.imageAlt,'a descrição da imagem',255),caption_title:text(input?.captionTitle,'o título da imagem',180),caption_text:text(input?.captionText,'o texto da imagem',500),updated_by_user_id:principal.id,updated_at:new Date().toISOString()};
    await this.gateway.request('rest/v1/homepage_content?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body});
    return this.get();
  }
  async createUploadUrl(input,principal){requireBecoAdmin(principal);const metadata=file(input);const path=`homepage/${randomUUID()}-${cleanFilename(metadata.originalFilename)}`;const signed=await this.gateway.createSignedUploadUrl(config.supabase.publicMediaBucket,path);return {bucket:config.supabase.publicMediaBucket,objectPath:path,uploadUrl:mediaUrl(signed.url||signed.signedURL),token:signed.token};}
  async completeUpload(input,principal){
    requireBecoAdmin(principal);const metadata=file(input);if(!String(input?.objectPath||'').startsWith('homepage/'))throw new HttpError(422,'INVALID_OBJECT_PATH','Caminho da imagem inválido.');await assertStoredImage(this.gateway,config.supabase.publicMediaBucket,input);
    const assets=await this.gateway.request('rest/v1/media_assets',{method:'POST',headers:{Prefer:'return=representation'},body:{owner_user_id:principal.id,storage_bucket:config.supabase.publicMediaBucket,object_path:input.objectPath,original_filename:cleanFilename(metadata.originalFilename),mime_type:metadata.mimeType,byte_size:metadata.byteSize,alt_text:text(input?.altText||'Imagem principal da página inicial','a descrição da imagem',255),visibility:'PUBLIC',review_status:'APPROVED',reviewed_by_user_id:principal.id,reviewed_at:new Date().toISOString()}});
    const asset=assets[0];if(!asset)throw new HttpError(502,'MEDIA_NOT_CREATED','Não foi possível registrar a imagem.');
    const current=await this.gateway.request('rest/v1/homepage_content?select=image_asset_id&id=eq.true&limit=1');
    const contentBody={image_asset_id:asset.id,image_alt:asset.alt_text,updated_by_user_id:principal.id,updated_at:new Date().toISOString()};
    if(current[0])await this.gateway.request('rest/v1/homepage_content?id=eq.true',{method:'PATCH',body:contentBody});
    else await this.gateway.request('rest/v1/homepage_content',{method:'POST',body:{id:true,eyebrow:defaultHomepageContent.eyebrow,title:defaultHomepageContent.title,intro_text:defaultHomepageContent.introText,caption_title:defaultHomepageContent.captionTitle,caption_text:defaultHomepageContent.captionText,...contentBody}});
    const oldId=current[0]?.image_asset_id;if(oldId&&oldId!==asset.id){const old=await this.gateway.request(`rest/v1/media_assets?select=id,storage_bucket,object_path&id=eq.${oldId}&limit=1`);await this.gateway.request(`rest/v1/media_assets?id=eq.${oldId}`,{method:'DELETE'}).catch(()=>undefined);if(old[0])await this.gateway.deleteStorageObjects(old[0].storage_bucket,[old[0].object_path]).catch(()=>undefined);}
    return this.get();
  }
}
