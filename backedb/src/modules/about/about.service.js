import { requireBecoAdmin } from '../../lib/auth.js';
import { HttpError } from '../../lib/http.js';
import { supabaseGateway } from '../../lib/supabase.js';

export const defaultAboutContent=Object.freeze({
  introEyebrow:'Associação Cultural de Fomento à Arte e Memória de Sorocaba e Região',
  introTitle:'Uma rede que transforma memória em encontro, arte e futuro.',
  introText:'O BECO reúne pessoas, histórias e iniciativas que fazem a cultura local circular todos os dias.',
  historyEyebrow:'Nossa história',historyTitle:'Cultura viva, construída em coletivo.',
  historyParagraphs:[
    'A Associação Cultural de Fomento à Arte e Memória de Sorocaba e Região atua como catalisadora de iniciativas culturais, artísticas e educacionais. Sua missão é resgatar e preservar a história e a memória popular da cidade, conectando quem cria, quem empreende e quem participa da vida cultural de Sorocaba.',
    'Além de incentivar a economia local, a Associação cria espaços de inclusão social, saúde mental e geração de renda, usando a arte e a cultura como ferramentas de transformação. Formalizada em março de 2023, ela fortalece ações que já aconteciam há anos, integrando uma rede ampla de colaboradores, artistas, feirantes e comunidades locais.',
    'Com ética, coletividade e desenvolvimento social como compromissos, a Associação realiza eventos que aproximam diversidade cultural, educação e conexões históricas. Já organizou ou participou diretamente de mais de 70 edições de feiras e eventos, em diferentes formas de expressão cultural.'
  ],
  mottoLabel:'Nosso lema',mottoText:'“Cultura, Memória, Geração de Renda, Valorização da arte, cidadania e identidade local.”',
  facts:[{value:'2023',label:'formalização da Associação'},{value:'70+',label:'edições realizadas ou apoiadas'},{value:'4',label:'feiras em movimento'},{value:'1 rede',label:'de cultura local e coletiva'}],
  supportEyebrow:'Rede de apoio',supportTitle:'Senac',supportText:'O fortalecimento da cultura local acontece em parceria. A rede de apoio da Associação conecta instituições, expositores, artistas e moradores para ampliar o acesso à cultura, ao trabalho e à memória de Sorocaba.'
});

function required(value,label,max){const result=String(value??'').trim();if(!result)throw new HttpError(422,'INVALID_ABOUT_CONTENT',`Informe ${label}.`);if(result.length>max)throw new HttpError(422,'INVALID_ABOUT_CONTENT',`${label} deve ter até ${max} caracteres.`);return result;}
function validate(input){
 const paragraphs=Array.isArray(input?.historyParagraphs)?input.historyParagraphs:[];if(paragraphs.length!==3)throw new HttpError(422,'INVALID_ABOUT_CONTENT','Informe os três parágrafos da história.');
 const facts=Array.isArray(input?.facts)?input.facts:[];if(facts.length!==4)throw new HttpError(422,'INVALID_ABOUT_CONTENT','Informe os quatro indicadores da Associação.');
 return {intro_eyebrow:required(input.introEyebrow,'o destaque da introdução',220),intro_title:required(input.introTitle,'o título da introdução',220),intro_text:required(input.introText,'o texto da introdução',1000),history_eyebrow:required(input.historyEyebrow,'o destaque da história',120),history_title:required(input.historyTitle,'o título da história',220),history_paragraphs:paragraphs.map((value,index)=>required(value,`o parágrafo ${index+1} da história`,2500)),motto_label:required(input.mottoLabel,'o rótulo do lema',120),motto_text:required(input.mottoText,'o lema',500),facts:facts.map((fact,index)=>({value:required(fact?.value,`o valor do indicador ${index+1}`,40),label:required(fact?.label,`a descrição do indicador ${index+1}`,180)})),support_eyebrow:required(input.supportEyebrow,'o destaque da rede de apoio',120),support_title:required(input.supportTitle,'o título da rede de apoio',180),support_text:required(input.supportText,'o texto da rede de apoio',1200)};
}
function view(row){return row?{introEyebrow:row.intro_eyebrow,introTitle:row.intro_title,introText:row.intro_text,historyEyebrow:row.history_eyebrow,historyTitle:row.history_title,historyParagraphs:row.history_paragraphs,mottoLabel:row.motto_label,mottoText:row.motto_text,facts:row.facts,supportEyebrow:row.support_eyebrow,supportTitle:row.support_title,supportText:row.support_text,updatedAt:row.updated_at}:{...defaultAboutContent,historyParagraphs:[...defaultAboutContent.historyParagraphs],facts:defaultAboutContent.facts.map(fact=>({...fact}))};}

export class AboutService{
 constructor(gateway=supabaseGateway){this.gateway=gateway;}
 async get(){const rows=await this.gateway.request('rest/v1/about_content?select=*&id=eq.true&limit=1');return view(rows[0]);}
 async adminGet(principal){requireBecoAdmin(principal);return this.get();}
 async update(input,principal){requireBecoAdmin(principal);const body={id:true,...validate(input),updated_by_user_id:principal.id,updated_at:new Date().toISOString()};await this.gateway.request('rest/v1/about_content?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body});return this.get();}
}
