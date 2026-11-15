const {chromium}=require('playwright'),assert=require('assert'),path=require('path'),http=require('http'),fs=require('fs');let n=0;const ok=(c,m)=>{assert.ok(c,m);n++};
const root=path.resolve(__dirname,'..');
const srv=http.createServer((q,r)=>{const f=path.join(root,q.url==='/'?'index.html':q.url.split('?')[0]);fs.readFile(f,(e,d)=>{if(e){r.statusCode=404;return r.end()}r.setHeader('Content-Type',{'.html':'text/html','.js':'text/javascript','.css':'text/css'}[path.extname(f)]||'text/plain');r.end(d)})}).listen(0);
(async()=>{const b=await chromium.launch(),ctx=await b.newContext();await ctx.grantPermissions(['clipboard-read','clipboard-write']);
await ctx.addInitScript(()=>{window.SpeechRecognition=window.webkitSpeechRecognition=class{start(){setTimeout(()=>this.onresult({resultIndex:0,results:[Object.assign([{transcript:'hello dictated'}],{isFinal:true})]}),50)}stop(){this.onend&&this.onend()}}});
const pg=await ctx.newPage(),errs=[];pg.on('pageerror',e=>errs.push(e.message));await pg.goto('http://localhost:'+srv.address().port+'/');
const html=()=>pg.$eval('.ed',e=>e.innerHTML),txt=()=>pg.$eval('.ed',e=>e.textContent),btn=t=>pg.click('#ribbon [title="'+t+'"]'),sel=(t,v)=>pg.focus('#ribbon select[title='+t+']').then(()=>pg.selectOption('#ribbon select[title='+t+']',v));
const fresh=async x=>{await pg.evaluate(()=>{const nb=QEngine.create('T');Object.assign(App.state,{nb,sec:nb.sections[0].id,page:nb.sections[0].pages[0].id});App.render();listAll()});await pg.mouse.click(600,300);await pg.keyboard.type(x)};
const all=()=>pg.keyboard.press('Control+A');
const range=(q,a,z,last)=>pg.evaluate(([q,a,z,last])=>{const e=document.querySelector(q);const t=last?e.lastChild:e.firstChild;const r=document.createRange();r.setStart(t,a);r.setEnd(t,z);const s=getSelection();s.removeAllRanges();s.addRange(r)},[q,a,z,last]);
// no border / clutter
await fresh('abc');await pg.mouse.move(5,5);
ok(await pg.$eval('.box',e=>getComputedStyle(e).borderTopWidth+getComputedStyle(e).outlineStyle)==='0pxnone','text box has no border/outline');
ok(await pg.$eval('.rs',e=>getComputedStyle(e).opacity)==='0','resize handle hidden');
await fresh('');await pg.mouse.click(700,400);await pg.waitForTimeout(100);
ok(await pg.$$eval('.box',a=>a.length)===1&&await pg.evaluate(()=>App.page().items.length)===1,'empty box removed when clicking elsewhere');
// font group
await fresh('abc');await all();
for(const [t,re] of [['Bold',/<(b|strong)>/],['Italic',/<(i|em)>/],['Underline',/<u>/],['Strike',/<(strike|s)>/],['Subscript',/<sub>/]]){await btn(t);ok(re.test(await html()),t);if(t==='Bold')ok(await pg.$eval('[data-c=bold]',e=>e.classList.contains('act')),'bold shows active')}
await fresh('abc');await all();await sel('fontName','Georgia');ok(/Georgia/.test(await html()),'font name');
await sel('fontSize','5');ok(/size="5"/.test(await html()),'font size');await sel('formatBlock','H1');ok(/<h1/.test(await html()),'heading style');
await fresh('abc');await all();await btn('Highlight');await pg.click('#menu button:has-text("Yellow")');ok(/background-color/.test(await html()),'highlight');
await btn('Font color');await pg.click('#menu button:has-text("Red")');ok(/color/.test((await html()).replace(/background-color/g,'')),'font color');
await fresh('abc');await all();await btn('Bullets');ok(/<ul>/.test(await html()),'bullets');
await fresh('abc');await all();await btn('Numbering');ok(/<ol>/.test(await html()),'numbering');
await fresh('abc');await all();await btn('Indent');ok(/blockquote/.test(await html()),'indent');await btn('Outdent');ok(!/blockquote/.test(await html()),'outdent');
await fresh('abc');await all();await btn('Center');ok(/text-align: center/.test(await html()),'align center');
await fresh('abc');await all();await btn('Bold');await btn('Undo');ok(!/<b>/.test(await html()),'undo');await btn('Redo');ok(/<b>/.test(await html()),'redo');
await fresh('abc');await all();await btn('Bold');await btn('Clear formatting');ok(!/<b>/.test(await html()),'clear formatting');
// clipboard
await fresh('xyz');await all();await btn('Cut');ok((await txt())==='','cut');await btn('Paste');await pg.waitForFunction(()=>document.querySelector('.ed').textContent.includes('xyz'));n++;
await fresh('copyme');await all();await btn('Copy');await pg.keyboard.press('End');await btn('Paste');await pg.waitForFunction(()=>document.querySelector('.ed').textContent==='copymecopyme');n++;
await fresh('aa bb');await range('.ed',0,2);await btn('Bold');await range('.ed b',0,2);await btn('Format Painter');await range('.ed',1,3,true);await pg.dispatchEvent('.ed','mouseup');ok(/<b>bb<\/b>/.test(await html()),'format painter');
// tags, spelling, dictate, feed, find
await fresh('x');await btn('To Do');ok(/type="checkbox"/.test(await html()),'todo');await pg.click('.ed input[type=checkbox]');ok(/checked/.test(await html()),'todo checked persists in model');
await btn('Important');ok((await html()).includes('⭐'),'important');await btn('Question');ok((await html()).includes('❓'),'question');
await btn('Spelling');ok(await pg.evaluate(()=>App.state.spell===false&&document.querySelector('.ed').spellcheck===false),'spelling off');await btn('Spelling');ok(await pg.evaluate(()=>document.querySelector('.ed').spellcheck===true),'spelling on');
await fresh('');await btn('Dictate');await pg.waitForFunction(()=>document.querySelector('.ed').textContent.includes('hello dictated'));n++;
await fresh('');await pg.fill('#pageTitle','Alpha');await btn('Feed');ok(await pg.$eval('#dlg',d=>d.open&&d.textContent.includes('Alpha')),'feed lists recent page');await pg.click('#dlgOk');
await btn('Find');ok(await pg.$eval('#searchPanel',e=>!e.hidden),'find opens search');
ok(errs.length===0,'no page errors: '+errs.join(';'));await b.close();srv.close();console.log('home tests passed:',n)})().catch(e=>{console.error(e.message);process.exit(1)});
