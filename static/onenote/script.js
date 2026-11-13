const KEY='quadra-onenote-v1';
const App={state:null,timer:null,sel:null,
 load(){let s=null;try{s=JSON.parse(localStorage.getItem(KEY))}catch(e){}
  if(!s||!s.nb){const nb=QEngine.create('My Notebook');s={nb,sec:nb.sections[0].id,page:nb.sections[0].pages[0].id,theme:'light',zoom:100,lines:false,readonly:false}}
  this.state=s},
 save(){clearTimeout(this.timer);try{localStorage.setItem(KEY,JSON.stringify(this.state));this.status('Saved')}catch(e){this.status('Save failed')}},
 later(){this.status('Saving...');clearTimeout(this.timer);this.timer=setTimeout(()=>this.save(),300)},
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
  else{const e=document.createElement('div');e.className='ed';e.contentEditable=!this.state.readonly;e.spellcheck=true;e.innerHTML=it.html;
   e.addEventListener('input',()=>{it.html=e.innerHTML;this.later();this.count()});
   e.addEventListener('keydown',ev=>{if(ev.key==='Tab'){ev.preventDefault();document.execCommand(ev.shiftKey?'outdent':'indent')}});
   e.addEventListener('focus',()=>this.select(null));b.appendChild(e)}
  const r=document.createElement('div');r.className='rs';b.appendChild(r);
  g.addEventListener('pointerdown',ev=>{this.select(b);const sx=ev.clientX-it.x,sy=ev.clientY-it.y;g.setPointerCapture(ev.pointerId);
   g.onpointermove=m=>{it.x=Math.max(0,m.clientX-sx);it.y=Math.max(0,m.clientY-sy);b.style.left=it.x+'px';b.style.top=it.y+'px'};g.onpointerup=()=>{g.onpointermove=null;this.save()}});
  r.addEventListener('pointerdown',ev=>{ev.stopPropagation();const sx=ev.clientX-it.w;r.setPointerCapture(ev.pointerId);
   r.onpointermove=m=>{it.w=Math.max(60,m.clientX-sx);b.style.width=it.w+'px'};r.onpointerup=()=>{r.onpointermove=null;this.save()}});
  c.appendChild(b);return b},
 select(b){document.querySelectorAll('.box.sel').forEach(x=>x.classList.remove('sel'));this.sel=b?b.dataset.id:null;if(b)b.classList.add('sel')},
 newText(x,y){if(this.state.readonly)return;const it=QEngine.addText(this.page(),x,y,'');const b=this.mk(it);b.querySelector('.ed').focus();this.save()},
 count(){const p=this.page();const w=p.items.map(i=>QEngine.plain(i.html)).join(' ').split(/\s+/).filter(Boolean).length;document.getElementById('count').textContent=w+' words'},
 init(){this.load();document.documentElement.dataset.theme=this.state.theme;document.body.classList.toggle('lines',!!this.state.lines);
  const c=document.getElementById('canvas');
  c.addEventListener('click',e=>{if(e.target===c||e.target.id==='stamp'){const r=c.getBoundingClientRect(),z=this.state.zoom/100;this.newText((e.clientX-r.left)/z,(e.clientY-r.top)/z)}});
  document.getElementById('pageTitle').addEventListener('input',e=>{this.page().title=e.target.value;this.later();this.listPages&&this.listPages()});
  document.addEventListener('keydown',e=>{if(e.key==='Delete'&&this.sel&&!this.focused()){QEngine.removeItem(this.page(),this.sel);this.sel=null;this.render();this.save()}});
  addEventListener('pagehide',()=>this.save());document.addEventListener('visibilitychange',()=>{if(document.hidden)this.save()});
  this.render()}};
window.App=App;
