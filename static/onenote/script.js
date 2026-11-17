const KEY='quadra-onenote-v1';
const App={state:null,timer:null,sel:null,
 load(){let s=null;try{s=JSON.parse(localStorage.getItem(KEY))}catch(e){}
  if(s&&!s.nbs&&s.nb){s.nbs=[s.nb];s.nbId=s.nb.id}
  if(!s||!s.nbs||!s.nbs.length){const nb=QEngine.create('My Notebook');s={nbs:[nb],nbId:nb.id,sec:nb.sections[0].id,page:nb.sections[0].pages[0].id,theme:'light',zoom:100,lines:false,readonly:false}}
  s.nb=s.nbs.find(n=>n.id===s.nbId)||s.nbs[0];this.state=s},
 save(){clearTimeout(this.timer);try{localStorage.setItem(KEY,JSON.stringify(this.persist()));this.status('Saved')}catch(e){this.status('Save failed')}},
 later(){try{const pg=this.page();pg.updated=Date.now();if(Date.now()-(pg.lastSnap||pg.created)>300000){QEngine.snapshot(pg);pg.lastSnap=Date.now()}}catch(e){}this.status('Saving...');clearTimeout(this.timer);this.timer=setTimeout(()=>this.save(),300)},
 persist(){const s=this.state;if(!s.nbs.some(n=>n.id===s.nb.id))s.nbs.push(s.nb);else s.nbs=s.nbs.map(n=>n.id===s.nb.id?s.nb:n);const o=Object.assign({},s,{nbId:s.nb.id});delete o.nb;return o},
 setNb(nb){const s=this.state;if(!s.nbs.some(n=>n.id===nb.id))s.nbs.push(nb);s.nb=nb;s.nbId=nb.id;s.sec=nb.sections[0].id;s.page=nb.sections[0].pages[0].id},
 status(t){const e=document.getElementById('saved');if(e)e.textContent=t},
 sec(){const s=this.state;return s.nb.sections.find(x=>x.id===s.sec)||s.nb.sections[0]},
 page(){const s=this.sec();return s.pages.find(p=>p.id===this.state.page)||s.pages[0]},
 focused(){const a=document.activeElement;return a&&a.classList&&a.classList.contains('ed')?a:null},
 render(){const c=document.getElementById('canvas');c.querySelectorAll('.box').forEach(b=>b.remove());const p=this.page();
  document.getElementById('pageTitle').value=p.title;document.getElementById('stamp').textContent=new Date(p.created).toLocaleString([], {weekday:'long',year:'numeric',month:'long',day:'2-digit',hour:'numeric',minute:'2-digit'});
  p.items.forEach(it=>this.mk(it));this.count();this.applyPage();Ink.render()},
 mk(it){const c=document.getElementById('canvas'),b=document.createElement('div');b.className='box';b.dataset.id=it.id;Object.assign(b.style,{left:it.x+'px',top:it.y+'px',width:it.w+'px'});
  const g=document.createElement('div');g.className='grip';b.appendChild(g);const au=document.createElement('div');au.className='author';const setAu=()=>{au.textContent=(it.author||'Unknown')+' · '+new Date(it.edited||it.created||Date.now()).toLocaleString()};setAu();b.appendChild(au);
  if(it.type==='image'){const i=document.createElement('img');i.src=it.src;i.alt=it.alt||'';i.addEventListener('contextmenu',ev=>{ev.preventDefault();menu({left:ev.clientX,right:ev.clientX,top:ev.clientY,bottom:ev.clientY},[['Alt text…',()=>altDlg(it)],['Delete picture',()=>{QEngine.trashItem(this.state.nb,this.sec(),this.page(),it);this.render();this.save()}]])});b.appendChild(i)}
  else if(it.type==='audio'){const a=document.createElement('div');a.className='att';a.innerHTML='<svg class="ic"><use href="#i-audio"/></svg> '+esc2(it.name)+'<br>';const au=document.createElement('audio');au.controls=true;au.src=it.src;a.appendChild(au);b.appendChild(a)}
  else if(it.type==='file'){const a=document.createElement('div');a.className='att';const l=document.createElement('a');l.href=it.data;l.download=it.name;l.textContent='Download';a.innerHTML='<svg class="ic"><use href="#i-'+(it.kind==='pdf'?'printout':'attach')+'"/></svg> <b>'+esc2(it.name)+'</b> ('+Math.max(1,Math.round(it.size/1024))+' KB) ';a.appendChild(l);if(it.kind==='pdf'){const m=document.createElement('embed');m.type='application/pdf';m.style.cssText='width:100%;height:340px;margin-top:6px';fetch(it.data).then(r=>r.blob()).then(bl=>{m.src=URL.createObjectURL(bl)}).catch(()=>{});a.appendChild(m)}b.appendChild(a)}
  else{const e=document.createElement('div');e.className='ed';e.contentEditable=!this.state.readonly;e.spellcheck=this.state.spell!==false;e.innerHTML=it.html;
   e.addEventListener('input',()=>{it.html=e.innerHTML;it.author=QEngine.getAuthor();it.edited=Date.now();setAu();this.later();this.count()});
   e.addEventListener('keydown',ev=>{if(ev.key==='Tab'){ev.preventDefault();if(!this.cellNav(ev,e))document.execCommand(ev.shiftKey?'outdent':'indent')}});
   e.addEventListener('focus',()=>this.select(null));
   e.addEventListener('click',ev=>{if(ev.target.type==='checkbox'){ev.target.toggleAttribute('checked',ev.target.checked);it.html=e.innerHTML;this.later()}const a=ev.target.closest&&ev.target.closest('a');if(a&&(ev.ctrlKey||ev.metaKey))window.open(a.href,'_blank','noopener')});
   e.addEventListener('blur',()=>setTimeout(()=>{const a=document.activeElement;if(a===e||!e.isConnected)return;if(a&&a.closest&&(a.closest('#ribbon')||a.closest('#menu')||a.closest('dialog')))return;
    if(!QEngine.plain(it.html)&&!/<(img|table|input)/.test(it.html)&&this.page().items.includes(it)){QEngine.removeItem(this.page(),it.id);b.remove();this.save()}},0));b.appendChild(e)}
  const r=document.createElement('div');r.className='rs';b.appendChild(r);
  g.addEventListener('pointerdown',ev=>{this.select(b);const q0=this.canvasPt(ev),sx=q0.x-it.x,sy=q0.y-it.y;g.setPointerCapture(ev.pointerId);
   g.onpointermove=m=>{const q=this.canvasPt(m);it.x=Math.max(0,q.x-sx);it.y=Math.max(0,q.y-sy);b.style.left=it.x+'px';b.style.top=it.y+'px'};g.onpointerup=()=>{g.onpointermove=null;this.save()}});
  r.addEventListener('pointerdown',ev=>{ev.stopPropagation();const sx=this.canvasPt(ev).x-it.w;r.setPointerCapture(ev.pointerId);
   r.onpointermove=m=>{it.w=Math.max(60,this.canvasPt(m).x-sx);b.style.width=it.w+'px'};r.onpointerup=()=>{r.onpointermove=null;this.save()}});
  c.appendChild(b);return b},
 canvasPt(e){const c=document.getElementById('canvas'),r=c.getBoundingClientRect(),k=r.width/c.offsetWidth||1;return{x:(e.clientX-r.left)/k,y:(e.clientY-r.top)/k}},
 applyPage(){const p=this.page(),w=document.getElementById('canvasWrap'),c=document.getElementById('canvas');w.style.background=p.color||'';w.classList.toggle('pc',!!p.color);c.dataset.rule=p.rule||'none'},
 cellNav(ev,e){const n=getSelection().anchorNode,el=n&&(n.nodeType===1?n:n.parentElement),td=el&&el.closest&&el.closest('td');if(!td||!e.contains(td))return false;
  const tr=td.parentElement,tb=tr.parentElement;let all=[...tb.querySelectorAll('td')],i=all.indexOf(td)+(ev.shiftKey?-1:1);
  if(i>=all.length){const nr=tr.cloneNode(true);nr.querySelectorAll('td').forEach(c=>c.innerHTML='&nbsp;');tb.appendChild(nr);all=[...tb.querySelectorAll('td')];e.dispatchEvent(new Event('input'))}
  if(i<0)i=0;const r=document.createRange();r.selectNodeContents(all[i]);r.collapse(true);const s=getSelection();s.removeAllRanges();s.addRange(r);return true},
 select(b){document.querySelectorAll('.box.sel').forEach(x=>x.classList.remove('sel'));this.sel=b?b.dataset.id:null;if(b)b.classList.add('sel')},
 newText(x,y){if(this.state.readonly)return;const it=QEngine.addText(this.page(),x,y,'');const b=this.mk(it);const ed=b.querySelector('.ed');ed.focus();this.save();return ed},
 count(){const p=this.page();const w=p.items.map(i=>QEngine.plain(i.html)).join(' ').split(/\s+/).filter(Boolean).length;document.getElementById('count').textContent=w+' words'},
 init(){this.load();document.documentElement.dataset.theme=this.state.theme;QEngine.setAuthor(this.state.author||'Me');document.body.classList.toggle('authors',!!this.state.showAuthors);Ink.bind();document.body.classList.toggle('lines',!!this.state.lines);
  const c=document.getElementById('canvas');
  c.addEventListener('click',e=>{if(e.target===c||e.target.id==='stamp'){const q=this.canvasPt(e);this.newText(q.x,q.y)}});
  document.getElementById('pageTitle').addEventListener('input',e=>{this.page().title=e.target.value;this.later();this.listPages&&this.listPages()});
  document.addEventListener('keydown',e=>{if(e.key!=='Delete'||this.focused())return;if(Ink.sel.length){Ink.hist();QEngine.removeStrokes(this.page(),Ink.sel);Ink.sel=[];Ink.render();this.save();return}if(this.sel){const it=this.page().items.find(i=>i.id===this.sel);if(it)QEngine.trashItem(this.state.nb,this.sec(),this.page(),it);this.sel=null;this.render();this.save()}});
  addEventListener('pagehide',()=>this.save());document.addEventListener('visibilitychange',()=>{if(document.hidden)this.save()});
  this.render()}};
const esc2=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
window.App=App;
const Ink={undo:{},redo:{},sel:[],cur:null,
 svg(){return document.getElementById('ink')},
 pt(e){const q=App.canvasPt(e);return[q.x,q.y]},
 hist(){const p=App.page(),u=this.undo[p.id]=this.undo[p.id]||[];u.push(JSON.stringify(p.strokes||[]));if(u.length>60)u.shift();this.redo[p.id]=[];this.btns()},
 apply(j){const p=App.page();p.strokes=JSON.parse(j);this.sel=[];this.render();App.save()},
 doUndo(){const p=App.page(),u=this.undo[p.id]||[];if(!u.length)return;(this.redo[p.id]=this.redo[p.id]||[]).push(JSON.stringify(p.strokes||[]));this.apply(u.pop())},
 doRedo(){const p=App.page(),r=this.redo[p.id]||[];if(!r.length)return;(this.undo[p.id]=this.undo[p.id]||[]).push(JSON.stringify(p.strokes||[]));this.apply(r.pop())},
 btns(){if(window.inkBtns)window.inkBtns()},
 col(s){return s.color==='auto'?'var(--fg)':s.color},
 d(pts){if(!pts.length)return'';if(pts.length<3)return'M'+pts.map(q=>q[0]+' '+q[1]).join(' L')+(pts.length===1?' l0.01 0':'');let s='M'+pts[0][0]+' '+pts[0][1];for(let i=1;i<pts.length-1;i++)s+=' Q'+pts[i][0]+' '+pts[i][1]+' '+(pts[i][0]+pts[i+1][0])/2+' '+(pts[i][1]+pts[i+1][1])/2;const l=pts[pts.length-1];return s+' L'+l[0]+' '+l[1]},
 render(){const v=this.svg();if(!v)return;const p=App.page(),NS='http://www.w3.org/2000/svg';v.innerHTML='';(p.strokes||[]).forEach(s=>{const e=document.createElementNS(NS,'path');e.setAttribute('class','stroke');e.dataset.id=s.id;e.setAttribute('d',this.d(s.pts));e.setAttribute('fill','none');e.setAttribute('stroke-width',s.w);e.setAttribute('stroke-linecap','round');e.setAttribute('stroke-linejoin','round');e.style.stroke=this.col(s);if(s.tool==='hl')e.style.strokeOpacity=.4;v.appendChild(e)});
  this.sel=this.sel.filter(id=>(p.strokes||[]).some(s=>s.id===id));
  if(this.sel.length){const b=QEngine.strokesBBox(p,this.sel),r=document.createElementNS(NS,'rect');r.setAttribute('class','selbox');r.setAttribute('x',b[0]-4);r.setAttribute('y',b[1]-4);r.setAttribute('width',b[2]-b[0]+8);r.setAttribute('height',b[3]-b[1]+8);v.appendChild(r)}
  document.body.classList.toggle('inking',['pen','hl','eraser','lasso'].includes(App.state.tool));v.style.touchAction=App.state.touchDraw?'none':'auto';this.ruler();this.btns()},
 snapInfo(q){const R=App.state.ruler;if(!R||!R.on)return null;const o={x:R.x,y:R.y,a:R.a*Math.PI/180,len:R.len},r=QEngine.snapToLine(q,o);return Math.abs(r.d)<=14&&r.t>=-14&&r.t<=o.len+14?o:null},
 proj(q,o){return QEngine.pointOnLine(o,Math.max(0,Math.min(o.len,QEngine.snapToLine(q,o).t)))},
 addPt(c,q){const st=c.st,L=st.pts[st.pts.length-1],Q=c.snap?this.proj(q,c.snap):q,n=Math.floor(Math.hypot(Q[0]-L[0],Q[1]-L[1])/4);for(let i=1;i<=n;i++)st.pts.push([L[0]+(Q[0]-L[0])*i/(n+1),L[1]+(Q[1]-L[1])*i/(n+1)]);st.pts.push(Q)},
 erase(q){const p=App.page(),n=App.state.eraser==='point'?QEngine.pointErase(p,q[0],q[1],10):QEngine.eraseStrokes(p,q[0],q[1],10);if(n){this.sel=[];this.render()}},
 ok(e){return!(e.pointerType==='touch'&&!App.state.touchDraw)},
 down(e){if(!this.ok(e)||(e.pointerType==='mouse'&&e.button!==0))return;const s=App.state,p=App.page();p.strokes=p.strokes||[];const q=this.pt(e);try{this.svg().setPointerCapture(e.pointerId)}catch(x){}e.preventDefault();
  if(s.tool==='pen'||s.tool==='hl'){this.hist();this.sel=[];const o=this.snapInfo(q),st=QEngine.addStroke(p,{tool:s.tool,color:s.inkColor||'auto',w:s.tool==='hl'?(s.inkW||3)*4:(s.inkW||3),pts:[o?this.proj(q,o):q]});this.cur={st,snap:o};this.render();return}
  if(s.tool==='eraser'){this.hist();this.cur={er:1};this.erase(q);return}
  if(s.tool==='lasso'){const b=this.sel.length&&QEngine.strokesBBox(p,this.sel);if(b&&q[0]>=b[0]-4&&q[0]<=b[2]+4&&q[1]>=b[1]-4&&q[1]<=b[3]+4){this.hist();this.cur={mv:q};return}this.sel=[];this.cur={poly:[q]};this.render()}},
 move(e){const c=this.cur;if(!c||!this.ok(e))return;const q=this.pt(e),p=App.page();
  if(c.st){this.addPt(c,q);const el=this.svg().querySelector('path[data-id="'+c.st.id+'"]');if(el)el.setAttribute('d',this.d(c.st.pts))}
  else if(c.er)this.erase(q);
  else if(c.mv){QEngine.moveStrokes(p,this.sel,q[0]-c.mv[0],q[1]-c.mv[1]);c.mv=q;this.render()}
  else if(c.poly){c.poly.push(q);let l=this.svg().querySelector('path.lasso');if(!l){l=document.createElementNS('http://www.w3.org/2000/svg','path');l.setAttribute('class','lasso');l.setAttribute('fill','none');this.svg().appendChild(l)}l.setAttribute('d','M'+c.poly.map(a=>a[0]+' '+a[1]).join(' L'))}},
 up(e){const c=this.cur;if(!c)return;if(c.poly){this.sel=QEngine.lassoSelect(App.page(),c.poly)}this.cur=null;this.render();App.save()},
 bind(){const v=this.svg();v.addEventListener('pointerdown',e=>this.down(e));v.addEventListener('pointermove',e=>this.move(e));v.addEventListener('pointerup',e=>this.up(e));v.addEventListener('pointercancel',e=>this.up(e))},
 ruler(){const c=document.getElementById('canvas');let r=document.getElementById('ruler');const R=App.state.ruler;if(!R||!R.on){if(r)r.style.display='none';return}
  if(!r){r=document.createElement('div');r.id='ruler';r.innerHTML='<div class="rmove" title="Drag to move"></div><div class="rrot" title="Drag to rotate"></div>';c.appendChild(r);const mv=r.querySelector('.rmove'),rt=r.querySelector('.rrot');
   mv.addEventListener('pointerdown',e=>{const q=App.canvasPt(e),R=App.state.ruler,ox=q.x-R.x,oy=q.y-R.y;try{mv.setPointerCapture(e.pointerId)}catch(x){}mv.onpointermove=m=>{const n=App.canvasPt(m);R.x=n.x-ox;R.y=n.y-oy;Ink.ruler()};mv.onpointerup=()=>{mv.onpointermove=null;App.save()}});
   rt.addEventListener('pointerdown',e=>{try{rt.setPointerCapture(e.pointerId)}catch(x){}rt.onpointermove=m=>{const n=App.canvasPt(m),R=App.state.ruler;R.a=Math.atan2(n.y-R.y,n.x-R.x)*180/Math.PI;Ink.ruler()};rt.onpointerup=()=>{rt.onpointermove=null;App.save()}})}
  r.style.display='block';r.style.width=R.len+'px';r.style.left=R.x+'px';r.style.top=R.y+'px';r.style.transform='rotate('+R.a+'deg)'},
 setRuler(x,y,a){const s=App.state;s.ruler=Object.assign({len:520},s.ruler,{on:true,x,y,a});this.ruler();App.save()}};
App.ink=Ink;
