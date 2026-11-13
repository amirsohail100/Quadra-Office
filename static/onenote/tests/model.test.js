const assert=require('assert'),E=require('../engine.js').QEngine;let n=0;const t=(f)=>{f();n++};
const nb=E.create('T');t(()=>assert.equal(nb.sections.length,1));
const s=nb.sections[0],p=s.pages[0];t(()=>assert.equal(E.addText(p,1,2,'<b>hello</b> world').type,'text'));
t(()=>assert.equal(E.search(nb,'hello').length,1));t(()=>assert.equal(E.search(nb,'zzz').length,0));
t(()=>{E.snapshot(p);E.addText(p,0,0,'x');E.restore(p,0);assert.equal(p.items.length,1)});
t(()=>{assert.ok(E.removeItem(p,p.items[0].id));assert.equal(p.items.length,0)});
console.log('model tests passed:',n);
