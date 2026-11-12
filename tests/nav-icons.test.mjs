import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const js=readFileSync(new URL('../public/nav-icons.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/nav-icons.css',import.meta.url),'utf8');

test('todas as seções recebem um único SVG 2D de 22px',()=>{
 const names=['dashboard','operation','jobs','machines','clients','calendar','tickets','maintenance','payments','users','settings'];
 const buttons=names.map(name=>{
  const span={className:'',style:'font-size:17px',innerHTML:'⏱',removeAttribute(key){if(key==='style')this.style='';}};
  return {dataset:{nav:name},querySelector(sel){return sel==='span'?span:null},span};
 });
 const doc={querySelectorAll(selector){
  assert.equal(selector,'.sidebar .nav button[data-nav]');
  return buttons;
 }};
 const context={document:doc,render(){}};
 vm.runInNewContext(js,context);
 context.render();
 for(const {span} of buttons){
  assert.equal(span.className,'forma-nav-icon');
  assert.match(span.innerHTML,/<svg /);
  assert.match(span.innerHTML,/width="22" height="22"/);
  assert.match(span.innerHTML,/stroke="currentColor"/);
  assert.doesNotMatch(span.innerHTML,/⏱|🚜|⚒|⚙/);
  assert.equal((span.innerHTML.match(/<svg /g)||[]).length,1);
 }
});
test('estilo responsivo preserva dimensão e não usa ícones coloridos',()=>{
 assert.match(css,/width:22px!important/);
 assert.match(css,/height:22px!important/);
 assert.match(css,/min-width:22px!important/);
 assert.match(css,/@media \(max-width:740px\)/);
 assert.match(css,/\.sidebar\.v3-collapsed/);
});
