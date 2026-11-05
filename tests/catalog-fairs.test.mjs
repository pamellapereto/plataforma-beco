import assert from 'node:assert/strict';
import test from 'node:test';
import { renderFairs } from '../assets/js/views/catalog.view.js';

function fair(overrides={}){
  return {name:'Feira Beco do Inferno',short_description:'Arte e cultura.',editions:[{title:'42ª edição especial',slug:'42-edicao-especial',status:'PUBLISHED',starts_at:'2099-01-10T15:00:00-03:00',ends_at:'2099-01-10T22:00:00-03:00',location:{city:'Sorocaba'},media:[{role:'COVER',url:'https://example.test/capa.jpg'}]}],...overrides};
}

test('fair catalog uses fair.name as the primary card title',()=>{
  const container={innerHTML:''};
  renderFairs(container,[fair()]);
  assert.match(container.innerHTML,/<h3>Feira Beco do Inferno<\/h3>/);
  assert.doesNotMatch(container.innerHTML,/<h3>42ª edição especial<\/h3>/);
});

test('fair catalog falls back to edition.title when fair.name is unavailable',()=>{
  const container={innerHTML:''};
  renderFairs(container,[fair({name:''})]);
  assert.match(container.innerHTML,/<h3>42ª edição especial<\/h3>/);
});

test('fair catalog keeps edition image, status, date, city, and detail link',()=>{
  const container={innerHTML:''};
  renderFairs(container,[fair()]);
  assert.match(container.innerHTML,/src="https:\/\/example\.test\/capa\.jpg"/);
  assert.match(container.innerHTML,/>Programacao publicada<\/span>/);
  assert.match(container.innerHTML,/10 de janeiro de 2099 · Sorocaba/);
  assert.match(container.innerHTML,/href="feira-beco\.html\?edicao=42-edicao-especial"/);
});
