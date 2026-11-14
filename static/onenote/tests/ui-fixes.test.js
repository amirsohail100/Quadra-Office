const {chromium}=require('playwright'),assert=require('assert'),path=require('path');let n=0;const ok=(c,m)=>{assert.ok(c,m);n++};
(async()=>{const b=await chromium.launch(),pg=await b.newPage(),errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.goto('file://'+path.resolve(__dirname,'../index.html'));await pg.evaluate(()=>localStorage.clear());await pg.reload();
for(const t of ['Home','Insert','Draw','View','Help']){await pg.click(`[data-tab=${t}]`);ok(await pg.$$eval('#ribbon use[href="#i-na"]',a=>a.length)===0,t+': no warning-style icon')}
await pg.click('[data-tab=Home]');
ok(await pg.$eval('#ribbon',e=>getComputedStyle(e).overflowY)==='hidden','ribbon has no vertical scrollbar');
ok(await pg.$eval('#ribbon select[title=Size], #ribbon .grp:nth-child(3) select:nth-of-type(2)',e=>e.value)==='3','default font size select = 12');
await pg.mouse.click(600,300);await pg.keyboard.type('abc');
ok(await pg.$eval('.ed',e=>getComputedStyle(e).fontSize)==='16px','text box base size is 12pt');
ok(await pg.$eval('.grip',e=>e.offsetHeight)<=4,'grip is thin');
await pg.click('#themeBtn');
ok(await pg.evaluate(()=>getComputedStyle(document.documentElement).colorScheme)==='dark','dark color-scheme (scrollbars, controls)');
ok(await pg.$eval('#ribbon select',e=>getComputedStyle(e).backgroundColor)!=='rgb(255, 255, 255)','ribbon select not white in dark');
ok(await pg.$eval('#zoomSel',e=>getComputedStyle(e).backgroundColor)!=='rgb(255, 255, 255)','zoom select not white in dark');
ok(errs.length===0,'no page errors');await b.close();console.log('ui-fix tests passed:',n)})().catch(e=>{console.error(e.message);process.exit(1)});
