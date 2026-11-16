const {open}=require('./helpers');const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
const DU='data:image/png;base64,'+PNG.toString('base64');
(async()=>{const H=await open(),{pg,ok,btn,html,items,fresh}=H,tab=t=>pg.click(`[data-tab=${t}]`);await tab('Insert');
// table
await fresh('');await btn('Table');await pg.fill('#tr','2');await pg.fill('#tc','4');await pg.click('#askOk');ok(await pg.$$eval('.ed tr',a=>a.length)===2&&await pg.$$eval('.ed td',a=>a.length)===8,'table 2x4');
await pg.click('.ed td');await pg.keyboard.type('a');await pg.keyboard.press('Tab');await pg.keyboard.type('b');ok(await pg.$$eval('.ed td',a=>a[1].textContent.trim())==='b','Tab moves to next cell');
for(let i=0;i<6;i++)await pg.keyboard.press('Tab');await pg.keyboard.press('Tab');ok(await pg.$$eval('.ed tr',a=>a.length)===3,'Tab at last cell adds a row');
// insert without a text box
await fresh();await btn('Symbol');await pg.click('[data-ins="Ω"]');ok((await html()).includes('Ω'),'symbol creates box and inserts');
await fresh();await btn('Emoji');await pg.click('[data-ins="🎉"]');ok((await html()).includes('🎉'),'emoji');
await fresh();await btn('Date & Time');await pg.click('#menu button:has-text("Date")');ok(/\d/.test(await html()),'date inserted');
// link
await fresh('hello');await pg.keyboard.press('Control+A');await btn('Insert Link');await pg.fill('#lkUrl',H.base+'?popup');await pg.click('#askOk');ok(/<a href="http:\/\/localhost:\d+\/\?popup"/.test(await html()),'link on selection');
const [pop]=await Promise.all([H.ctx.waitForEvent('page'),pg.click('.ed a',{modifiers:['Control']})]);ok(pop.url().includes('popup'),'ctrl+click opens link');await pop.close();
// pictures
await fresh();await btn('From Web');await pg.fill('#webUrl',DU);await pg.click('#askOk');ok((await items()).some(i=>i.type==='image'&&i.src===DU)&&await pg.$('.box img')!==null,'image from web');
await fresh();let [fc]=await Promise.all([pg.waitForEvent('filechooser'),btn('From Device')]);await fc.setFiles({name:'a.png',mimeType:'image/png',buffer:PNG});await pg.waitForFunction(()=>App.page().items.some(i=>i.type==='image'));H.n++;
await fresh();await btn('From Camera');await pg.waitForFunction(()=>{const v=document.getElementById('camV');return v&&v.videoWidth>0});await pg.click('#askOk');await pg.waitForFunction(()=>App.page().items.some(i=>i.type==='image'&&i.src.startsWith('data:image')));H.n++;
// files, audio
await fresh();[fc]=await Promise.all([pg.waitForEvent('filechooser'),btn('Insert File Attachment')]);await fc.setFiles({name:'notes.txt',mimeType:'text/plain',buffer:Buffer.from('hi')});await pg.waitForFunction(()=>App.page().items.some(i=>i.type==='file'&&i.name==='notes.txt'));
ok((await pg.$eval('.box',e=>e.textContent)).includes('notes.txt')&&await pg.evaluate(()=>QEngine.search(App.state.nb,'notes').length)===1,'attachment shown and searchable');
await fresh();[fc]=await Promise.all([pg.waitForEvent('filechooser'),btn('Insert File Printout')]);await fc.setFiles({name:'doc.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\n%%EOF')});await pg.waitForFunction(()=>App.page().items.some(i=>i.type==='file'&&i.kind==='pdf'));ok(await pg.$('.box embed')!==null,'pdf printout embeds');
await fresh();[fc]=await Promise.all([pg.waitForEvent('filechooser'),btn('Insert File Printout')]);await fc.setFiles({name:'t.txt',mimeType:'text/plain',buffer:Buffer.from('line1\nline2')});await pg.waitForFunction(()=>App.page().items.some(i=>i.type==='text'&&i.html.includes('line1')));H.n++;
await fresh();await btn('Audio');await pg.waitForTimeout(800);await btn('Audio');await pg.waitForFunction(()=>App.page().items.some(i=>i.type==='audio'&&i.src.startsWith('data:audio')),null,{timeout:8000});ok(await pg.$('.box audio')!==null,'audio recorded');
// add-ins
await fresh('word one');await btn('Office Add-ins');await pg.click('[data-ad=stats]');ok(await pg.$eval('#dlg',d=>d.textContent.includes('Words')),'stats add-in');await pg.click('#dlgOk');
await btn('Office Add-ins');await pg.click('[data-ad=divider]');ok(await pg.$('.ed hr')!==null,'divider add-in');
await btn('Office Add-ins');await pg.click('[data-ad=callout]');ok(/callout/.test(await html()),'callout add-in');
await fresh('x');await pg.evaluate(()=>{App.page().title='My Plan'});await btn('Office Add-ins');await pg.click('[data-ad=toc]');ok((await html()).includes('My Plan'),'toc add-in');
// pages and sections
const c0=await pg.evaluate(()=>App.state.nb.sections.length);await btn('New Section');ok(await pg.evaluate(()=>App.state.nb.sections.length)===c0+1,'insert new section');
await btn('New page');ok(await pg.evaluate(()=>App.sec().pages.length)===2,'insert new page');
ok(H.errs.length===0,'no page errors: '+H.errs.join(';'));await H.close();console.log('insert tests passed:',H.n)})().catch(e=>{console.error(e.message);process.exit(1)});
