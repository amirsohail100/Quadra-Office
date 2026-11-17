const {open}=require('./helpers');
(async()=>{const H=await open(),{pg,ok,btn,fresh}=H;const S=()=>pg.evaluate(()=>App.page().strokes||[]);
const drag=async(pts,steps=12)=>{await pg.mouse.move(pts[0][0],pts[0][1]);await pg.mouse.down();for(const p of pts.slice(1))await pg.mouse.move(p[0],p[1],{steps});await pg.mouse.up()};
const menuItem=t=>pg.click('#menu button:text-is("'+t+'")');
await pg.click('[data-tab=Draw]');await fresh();
await btn('Pen');ok(await pg.evaluate(()=>App.state.tool)==='pen'&&await pg.$eval('[title=Pen]',e=>e.classList.contains('act')),'pen active');
await drag([[500,300],[600,350],[700,300]]);let s=await S();ok(s.length===1&&s[0].tool==='pen'&&s[0].pts.length>=10&&s[0].color==='auto'&&(await pg.$$('#ink path.stroke')).length===1,'pen stroke drawn and rendered');
await btn('Red');await drag([[500,380],[600,400]]);s=await S();ok(s[1].color==='#d32f2f','red color');
await btn('Blue');await drag([[500,420],[600,440]]);s=await S();ok(s[2].color==='#1a56c4','blue color');
await btn('Thickness');await menuItem('Thick');ok(await pg.evaluate(()=>App.state.inkW)===6,'thickness state');await drag([[500,460],[600,480]]);s=await S();ok(s[3].w===6,'stroke uses thickness');
await btn('Highlighter');await drag([[500,500],[600,500]]);s=await S();ok(s[4].tool==='hl'&&s[4].w>=12&&await pg.$$eval('#ink path.stroke',a=>+getComputedStyle(a[a.length-1]).strokeOpacity)<1,'highlighter wide and translucent');
await btn('Ink Color');await pg.click('#menu [data-ink="#7719aa"]');await btn('Pen');await drag([[500,540],[600,540]]);s=await S();ok(s[5].color==='#7719aa','ink color menu');
// eraser
await fresh();await btn('Pen');await drag([[450,300],[750,300]],20);await btn('Eraser');await menuItem('Stroke eraser');await drag([[600,280],[600,320]]);ok((await S()).length===0,'stroke eraser');
await btn('Pen');await drag([[450,300],[750,300]],20);await btn('Eraser');await menuItem('Point eraser');await drag([[600,280],[600,320]]);ok((await S()).length===2,'point eraser splits stroke');
await btn('Pen');await drag([[450,400],[550,400]]);await btn('Eraser');await menuItem('Clear all ink');ok((await S()).length===0,'clear all ink');
// lasso
await fresh();await btn('Pen');await drag([[500,300],[600,300]]);await drag([[500,600],[600,600]]);await btn('Lasso Select');await drag([[450,250],[650,250],[650,350],[450,350],[455,255]]);
ok(await pg.evaluate(()=>App.ink.sel.length)===1,'lasso selects one stroke');const x0=(await S())[0].pts[0][0];await drag([[550,300],[600,300]]);ok(Math.abs((await S())[0].pts[0][0]-x0-50)<4,'selection moves');
await pg.keyboard.press('Delete');ok((await S()).length===1,'delete selected ink');
// undo / redo
await fresh();await btn('Pen');await drag([[500,300],[600,300]]);await btn('Undo');ok((await S()).length===0,'ink undo');await btn('Redo');ok((await S()).length===1,'ink redo');
// touch
await fresh();await btn('Pen');const touch=()=>pg.evaluate(()=>{const el=document.getElementById('ink'),o={pointerType:'touch',pointerId:7,isPrimary:true,button:0,buttons:1,bubbles:true},f=(t,x,y)=>el.dispatchEvent(new PointerEvent(t,Object.assign({clientX:x,clientY:y},o)));f('pointerdown',500,300);f('pointermove',550,320);f('pointermove',600,300);f('pointerup',600,300)});
await touch();ok((await S()).length===0,'touch ignored when Draw with Touch is off');await btn('Draw with Touch');ok(await pg.evaluate(()=>App.state.touchDraw),'touch toggle');await touch();ok((await S()).length===1,'touch draws when on');
// ruler
await fresh();await btn('Ruler');ok(await pg.isVisible('#ruler')&&await pg.evaluate(()=>App.state.ruler.on),'ruler shown');
await pg.evaluate(()=>{const c=document.getElementById('canvas'),r=c.getBoundingClientRect(),k=r.width/c.offsetWidth;App.ink.setRuler((450-r.left)/k,(310-r.top)/k,0)});await btn('Pen');
await drag([[480,314],[520,308],[560,316],[600,307]],6);s=await S();ok(new Set(s[0].pts.map(p=>p[1].toFixed(1))).size===1,'ruler snaps stroke straight');
await drag([[480,500],[520,520],[560,490]],6);s=await S();ok(new Set(s[1].pts.map(p=>p[1].toFixed(1))).size>1,'stroke away from ruler is free');
// type tool
await btn('Type');ok(await pg.evaluate(()=>App.state.tool)==='type'&&await pg.$eval('#ink',e=>getComputedStyle(e).pointerEvents)==='none','type tool');await pg.mouse.click(800,450);ok((await H.items()).length===1,'type tool creates text box');
// persistence and zoom accuracy
await fresh();await btn('Pen');await drag([[500,300],[600,320]]);await pg.reload();ok((await S()).length===1,'strokes persist after reload');
await pg.click('[data-tab=Draw]');await btn('Pen');await pg.evaluate(()=>setZoom(150));await fresh();await btn('Pen');await drag([[500,300],[700,400]],8);
const bb=await pg.$$eval('#ink path.stroke',a=>{const r=a[a.length-1].getBoundingClientRect();return[r.left,r.top,r.right,r.bottom]});ok(Math.abs(bb[0]-500)<8&&Math.abs(bb[2]-700)<8&&Math.abs(bb[1]-300)<8&&Math.abs(bb[3]-400)<8,'ink lands under the pointer at 150% zoom');
ok(H.errs.length===0,'no page errors: '+H.errs.join(';'));await H.close();console.log('draw tests passed:',H.n)})().catch(e=>{console.error(e.message);process.exit(1)});
