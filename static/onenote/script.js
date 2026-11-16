const KEY='quadra-onenote-v1';
const App={state:null,timer:null,sel:null,
 load(){let s=null;try{s=JSON.parse(localStorage.getItem(KEY))}catch(e){}
  if(s&&!s.nbs&&s.nb){s.nbs=[s.nb];s.nbId=s.nb.id}
  if(!s||!s.nbs||!s.nbs.length){const nb=QEngine.create('My Notebook');s={nbs:[nb],nbId:nb.id,sec:nb.sections[0].id,page:nb.sections[0].pages[0].id,theme:'light',zoom:100,lines:false,readonly:false}}
  s.nb=s.nbs.find(n=>n.id===s.nbId)||s.nbs[0];this.state=s},
 save(){clearTimeout(this.timer);try{localStorage.setItem(KEY,JSON.stringify(this.persist()));this.status('Saved')}catch(e){this.status('Save failed')}},
 later(){try{this.page().updated=Date.now()}catch(e){}this.status('Saving...');clearTimeout(this.timer);this.timer=setTimeout(()=>this.save(),300)},
 persist(){const s=this.state;if(!s.nbs.some(n=>n.id===s.nb.id))s.nbs.push(s.nb);else s.nbs=s.nbs.map(n=>n.id===s.nb.id?s.nb:n);const o=Object.assign({},s,{nbId:s.nb.id});delete o.nb;return o},
 setNb(nb){const s=this.state;if(!s.nbs.some(n=>n.id===nb.id))s.nbs.push(nb);s.nb=nb;s.nbId=nb.id;s.sec=nb.sections[0].id;s.page=nb.sections[0].pages[0].id},
 status(t){const e=document.getElementById('saved');if(e)e.textContent=t},
 sec(){const s=this.state;return s.nb.sections.find(x=>x.id===s.sec)||s.nb.sections[0]},
 page(){const s=this.sec();return s.pages.find(p=>p.id===this.state.page)||s.pages[0]},
 focused(){const a=document.activeElement;return a&&a.classList&&a.classList.contains('ed')?a:null},
 render(){const c=document.getElementById('canvas');c.querySelectorAll('.box').forEach(b=>b.remove());const p=this.page();
  document.getElementById('pageTitle').value=p.title;document.getElementById('stamp').textContent=new Date(p.created).toLocaleString([], {weekday:'long',year:'numeric',month:'long',day:'2-digit',hour:'numeric',minute:'2-digit'});
  p.items.forEach(it=>this.mk(it));this.count()},
 mk(it){const c=document.getElementById('canvas'),b=document.createElement('div');b.className='box';b.dataset.id=it.id;Object.assign(b.style,{left:it.x+'px',top:it.y+'px',width:it.w+'px'});
  const g=document.createElement('div');g.className='grip';b.appendChild(g);
  if(it.type==='image'){const i=document.createElement('img');i.src=it.src;i.alt='';b.appendChild(i)}
  else if(it.type==='audio'){const a=document.createElement('div');a.className='att';a.innerHTML='<svg class="ic"><use href="#i-audio"/></svg> '+esc2(it.name)+'<br>';const au=document.createElement('audio');au.controls=true;au.src=it.src;a.appendChild(au);b.appendChild(a)}
  else if(it.type==='file'){const a=document.createElement('div');a.className='att';const l=document.createElement('a');l.href=it.data;l.download=it.name;l.textContent='Download';a.innerHTML='<svg class="ic"><use href="#i-'+(it.kind==='pdf'?'printout':'attach')+'"/></svg> <b>'+esc2(it.name)+'</b> ('+Math.max(1,Math.round(it.size/1024))+' KB) ';a.appendChild(l);if(it.kind==='pdf'){const m=document.createElement('embed');m.type='application/pdf';m.style.cssText='width:100%;height:340px;margin-top:6px';fetch(it.data).then(r=>r.blob()).then(bl=>{m.src=URL.createObjectURL(bl)}).catch(()=>{});a.appendChild(m)}b.appendChild(a)}
  else{const e=document.createElement('div');e.className='ed';e.contentEditable=!this.state.readonly;e.spellcheck=this.state.spell!==false;e.innerHTML=it.html;
   e.addEventListener('input',()=>{it.html=e.innerHTML;this.later();this.count()});
   e.addEventListener('keydown',ev=>{if(ev.key==='Tab'){ev.preventDefault();if(!this.cellNav(ev,e))document.execCommand(ev.shiftKey?'outdent':'indent')}});
   e.addEventListener('focus',()=>this.select(null));
   e.addEventListener('click',ev=>{if(ev.target.type==='checkbox'){ev.target.toggleAttribute('checked',ev.target.checked);it.html=e.innerHTML;this.later()}const a=ev.target.closest&&ev.target.closest('a');if(a&&(ev.ctrlKey||ev.metaKey))window.open(a.href,'_blank','noopener')});
   e.addEventListener('blur',()=>setTimeout(()=>{const a=document.activeElement;if(a===e||!e.isConnected)return;if(a&&a.closest&&(a.closest('#ribbon')||a.closest('#menu')||a.closest('dialog')))return;
    if(!QEngine.plain(it.html)&&!/<(img|table|input)/.test(it.html)&&this.page().items.includes(it)){QEngine.removeItem(this.page(),it.id);b.remove();this.save()}},0));b.appendChild(e)}
  const r=document.createElement('div');r.className='rs';b.appendChild(r);
  g.addEventListener('pointerdown',ev=>{this.select(b);const sx=ev.clientX-it.x,sy=ev.clientY-it.y;g.setPointerCapture(ev.pointerId);
   g.onpointermove=m=>{it.x=Math.max(0,m.clientX-sx);it.y=Math.max(0,m.clientY-sy);b.style.left=it.x+'px';b.style.top=it.y+'px'};g.onpointerup=()=>{g.onpointermove=null;this.save()}});
  r.addEventListener('pointerdown',ev=>{ev.stopPropagation();const sx=ev.clientX-it.w;r.setPointerCapture(ev.pointerId);
   r.onpointermove=m=>{it.w=Math.max(60,m.clientX-sx);b.style.width=it.w+'px'};r.onpointerup=()=>{r.onpointermove=null;this.save()}});
  c.appendChild(b);return b},
 cellNav(ev,e){const n=getSelection().anchorNode,el=n&&(n.nodeType===1?n:n.parentElement),td=el&&el.closest&&el.closest('td');if(!td||!e.contains(td))return false;
  const tr=td.parentElement,tb=tr.parentElement;let all=[...tb.querySelectorAll('td')],i=all.indexOf(td)+(ev.shiftKey?-1:1);
  if(i>=all.length){const nr=tr.cloneNode(true);nr.querySelectorAll('td').forEach(c=>c.innerHTML='&nbsp;');tb.appendChild(nr);all=[...tb.querySelectorAll('td')];e.dispatchEvent(new Event('input'))}
  if(i<0)i=0;const r=document.createRange();r.selectNodeContents(all[i]);r.collapse(true);const s=getSelection();s.removeAllRanges();s.addRange(r);return true},
 select(b){document.querySelectorAll('.box.sel').forEach(x=>x.classList.remove('sel'));this.sel=b?b.dataset.id:null;if(b)b.classList.add('sel')},
 newText(x,y){if(this.state.readonly)return;const it=QEngine.addText(this.page(),x,y,'');const b=this.mk(it);const ed=b.querySelector('.ed');ed.focus();this.save();return ed},
 count(){const p=this.page();const w=p.items.map(i=>QEngine.plain(i.html)).join(' ').split(/\s+/).filter(Boolean).length;document.getElementById('count').textContent=w+' words'},
 init(){this.load();document.documentElement.dataset.theme=this.state.theme;document.body.classList.toggle('lines',!!this.state.lines);
  const c=document.getElementById('canvas');
  c.addEventListener('click',e=>{if(e.target===c||e.target.id==='stamp'){const r=c.getBoundingClientRect(),z=this.state.zoom/100;this.newText((e.clientX-r.left)/z,(e.clientY-r.top)/z)}});
  document.getElementById('pageTitle').addEventListener('input',e=>{this.page().title=e.target.value;this.later();this.listPages&&this.listPages()});
  document.addEventListener('keydown',e=>{if(e.key==='Delete'&&this.sel&&!this.focused()){QEngine.removeItem(this.page(),this.sel);this.sel=null;this.render();this.save()}});
  addEventListener('pagehide',()=>this.save());document.addEventListener('visibilitychange',()=>{if(document.hidden)this.save()});
  this.render()}};
const esc2=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
window.App=App;
