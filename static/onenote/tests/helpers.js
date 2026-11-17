const {chromium}=require('playwright'),path=require('path'),http=require('http'),fs=require('fs');
const root=path.resolve(__dirname,'..');
exports.open=async()=>{const srv=http.createServer((q,r)=>{const f=path.join(root,q.url==='/'?'index.html':q.url.split('?')[0]);fs.readFile(f,(e,d)=>{if(e){r.statusCode=404;return r.end('x')}r.setHeader('Content-Type',{'.html':'text/html','.js':'text/javascript','.css':'text/css'}[path.extname(f)]||'text/plain');r.end(d)})}).listen(0);
 const b=await chromium.launch({args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']}),ctx=await b.newContext({acceptDownloads:true});
 await ctx.grantPermissions(['clipboard-read','clipboard-write','camera','microphone']);
 await ctx.addInitScript(()=>{Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{speak(u){window.__spoken=u.text;setTimeout(()=>u.onend&&u.onend(),10)},cancel(){},pause(){},resume(){}}});window.SpeechSynthesisUtterance=class{constructor(t){this.text=t}}});
 const pg=await ctx.newPage(),errs=[];pg.on('pageerror',e=>errs.push(e.message));const base='http://localhost:'+srv.address().port+'/';await pg.goto(base);
 const H={b,ctx,pg,errs,base,srv,n:0,ok(c,m){require('assert').ok(c,m);H.n++},
  html:()=>pg.$eval('.ed',e=>e.innerHTML),btn:t=>pg.click('#ribbon [title="'+t+'"]'),
  st:()=>pg.evaluate(()=>App.state),items:()=>pg.evaluate(()=>App.page().items),
  fresh:async x=>{await pg.evaluate(()=>{const old=App.state.nb,nb=QEngine.create('T');App.state.nbs=App.state.nbs.filter(n=>n.id!==old.id);App.setNb(nb);App.render();listAll()});if(x!==undefined){await pg.mouse.click(600,300);await pg.keyboard.type(x)}},
  close:async()=>{await b.close();srv.close()}};return H};
