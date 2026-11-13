const {chromium}=require('playwright'),assert=require('assert'),path=require('path');let n=0;const ok=(c,m)=>{assert.ok(c,m);n++};
(async()=>{const b=await chromium.launch(),pg=await b.newPage(),errs=[];pg.on('pageerror',e=>errs.push(e.message));
const url='file://'+path.resolve(__dirname,'../index.html');await pg.goto(url);await pg.evaluate(()=>localStorage.clear());await pg.reload();
const st=()=>pg.evaluate(()=>window.__app.state);
ok((await pg.$$('#tabs button')).length===6,'6 tabs');
for(const t of ['Insert','Draw','View','Help','Home']){await pg.click(`[data-tab=${t}]`);ok((await pg.$$('#ribbon .rb')).length>0,t+' ribbon')}
let s=await st();const pc=s.nb.sections[0].pages.length;await pg.click('#addPage');s=await st();ok(s.nb.sections[0].pages.length===pc+1,'page added in model');
await pg.click('#addSec');s=await st();ok(s.nb.sections.length===2,'section added');
await pg.mouse.click(600,300);await pg.keyboard.type('hello world');s=await st();
ok(s.nb.sections[1].pages[0].items.some(i=>i.html.includes('hello world')),'typed text in model');
await pg.keyboard.press('Control+A');await pg.click('[title=Bold]');ok(await pg.$eval('.ed',(e)=>!!e.querySelector("b,strong")),'bold in DOM');
await pg.click('[data-tab=Insert]');await pg.click('[title="Insert File Printout"]');ok(await pg.$eval('#dlg',(d)=>d.open&&d.textContent.includes("not available")),'N/A dialog');await pg.click('#dlgOk');
await pg.click('#themeBtn');ok((await st()).theme==='dark','theme dark');
await pg.reload();s=await st();ok(s.nb.sections[1].pages[0].items[0].html.includes('hello world'),'persisted after reload');
await pg.fill('#pageTitle','Alpha');await pg.click('#railSearch');await pg.fill('#q','hello');ok((await pg.$$('.res')).length===1,'search hit');
await pg.click('.res');ok(await pg.$eval('.ed',(e)=>e.textContent.includes("hello")),'search navigates');
ok(errs.length===0,'no page errors: '+errs.join(';'));await b.close();console.log('browser tests passed:',n)})().catch(e=>{console.error(e);process.exit(1)});
