(function(root){
const uid=()=>Math.random().toString(36).slice(2,10);
function newPage(sec,title){const p={id:uid(),title:title||'',created:Date.now(),items:[],versions:[],strokes:[],color:'',rule:'none'};sec.pages.push(p);return p}
function newSection(nb,name){const s={id:uid(),name:name||'Untitled Section',color:'#7a7a7a',pages:[]};nb.sections.push(s);newPage(s);return s}
function create(name){const nb={id:uid(),name:name||'My Notebook',sections:[]};newSection(nb);return nb}
function addText(p,x,y,html){const it={id:uid(),type:'text',x,y,w:320,html:html||'',author,edited:Date.now()};p.items.push(it);return it}
function addImage(p,x,y,src){const it={id:uid(),type:'image',x,y,w:240,src,author,edited:Date.now()};p.items.push(it);return it}
function removeItem(p,id){const n=p.items.length;p.items=p.items.filter(i=>i.id!==id);return n!==p.items.length}
function plain(html){return String(html||'').replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim()}
function snapshot(p){p.versions=p.versions||[];p.versions.push({at:Date.now(),title:p.title,items:JSON.parse(JSON.stringify(p.items)),strokes:JSON.parse(JSON.stringify(p.strokes||[]))});if(p.versions.length>30)p.versions.shift();return p.versions.length}
function restore(p,i){const v=(p.versions||[])[i];if(!v)return false;p.title=v.title;p.items=JSON.parse(JSON.stringify(v.items));p.strokes=JSON.parse(JSON.stringify(v.strokes||[]));return true}
function search(nb,q,secId){q=q.toLowerCase();const out=[];if(!q)return out;nb.sections.forEach(s=>{if(secId&&s.id!==secId)return;s.pages.forEach(p=>{const t=(p.title+' '+p.items.map(i=>plain(i.html)+' '+(i.name||'')).join(' ')).toLowerCase();const k=t.indexOf(q);if(k>=0)out.push({sec:s.id,page:p.id,title:p.title||'Untitled Page',snippet:t.slice(Math.max(0,k-20),k+40)})})});return out}

function addFile(p,x,y,o){const it=Object.assign({id:uid(),type:'file',x,y,w:300,author,edited:Date.now()},o);p.items.push(it);return it}
function addAudio(p,x,y,src,name){const it={id:uid(),type:'audio',x,y,w:300,src,name:name||'Recording',author,edited:Date.now()};p.items.push(it);return it}
function toText(h){return String(h||'').replace(/<input[^>]*checked[^>]*>/gi,'[x] ').replace(/<input[^>]*type="checkbox"[^>]*>/gi,'[ ] ').replace(/<(br|hr)\s*\/?>/gi,'\n').replace(/<\/(div|p|li|tr|h[1-6]|blockquote)>/gi,'\n').replace(/<\/td>/gi,'\t').replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/\n+$/,'')}
function pageToText(p){return [p.title||'Untitled Page',''].concat(p.items.map(i=>i.type==='file'?'[Attachment: '+i.name+']':i.type==='audio'?'[Audio: '+i.name+']':i.type==='image'?'[Image]':toText(i.html))).join('\n')}
function sectionToText(s){return ['== '+s.name+' =='].concat(s.pages.map(p=>'--- '+(p.title||'Untitled Page')+' ---\n'+pageToText(p))).join('\n\n')}
function notebookToText(nb){return ['# '+nb.name].concat(nb.sections.map(sectionToText)).join('\n\n')}
function importNotebook(o){const nb=o&&o.format==='quadra-onenote'?o.notebook:o;if(!nb||!Array.isArray(nb.sections))throw new Error('invalid backup');
 nb.trash=Array.isArray(nb.trash)?nb.trash:[];nb.id=uid();nb.name=nb.name||'Restored notebook';nb.sections.forEach(s=>{if(!s||!Array.isArray(s.pages))throw new Error('invalid section');s.id=s.id||uid();s.name=s.name||'Untitled Section';s.color=s.color||'#7a7a7a';
  s.pages.forEach(p=>{if(!p||!Array.isArray(p.items))throw new Error('invalid page');p.id=p.id||uid();p.title=p.title||'';p.created=p.created||Date.now();p.versions=Array.isArray(p.versions)?p.versions:[];p.strokes=Array.isArray(p.strokes)?p.strokes:[];p.color=p.color||'';p.rule=p.rule||'none'})});
 if(!nb.sections.length)newSection(nb);return nb}

let author='Me';
function ensure(p){p.strokes=p.strokes||[];p.versions=p.versions||[];return p}
function addStroke(p,o){ensure(p);const s={id:uid(),tool:o.tool||'pen',color:o.color||'auto',w:o.w||3,pts:o.pts||[]};p.strokes.push(s);return s}
function eraseStrokes(p,x,y,r){ensure(p);const n=p.strokes.length;p.strokes=p.strokes.filter(s=>!s.pts.some(q=>Math.hypot(q[0]-x,q[1]-y)<=r+s.w/2));return n-p.strokes.length}
function pointErase(p,x,y,r){ensure(p);const out=[];let ch=0;p.strokes.forEach(s=>{const near=q=>Math.hypot(q[0]-x,q[1]-y)<=r+s.w/2;if(!s.pts.some(near)){out.push(s);return}ch++;let seg=[];s.pts.forEach(q=>{if(near(q)){if(seg.length)out.push(Object.assign({},s,{id:uid(),pts:seg}));seg=[]}else seg.push(q)});if(seg.length)out.push(Object.assign({},s,{id:uid(),pts:seg}))});p.strokes=out;return ch}
function pointInPoly(pt,poly){let c=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>pt[1])!==(b[1]>pt[1])&&pt[0]<(b[0]-a[0])*(pt[1]-a[1])/(b[1]-a[1])+a[0])c=!c}return c}
function lassoSelect(p,poly){ensure(p);return p.strokes.filter(s=>s.pts.length&&s.pts.filter(q=>pointInPoly(q,poly)).length>=s.pts.length/2).map(s=>s.id)}
function moveStrokes(p,ids,dx,dy){ensure(p).strokes.forEach(s=>{if(ids.includes(s.id))s.pts=s.pts.map(q=>[q[0]+dx,q[1]+dy])})}
function removeStrokes(p,ids){ensure(p);const n=p.strokes.length;p.strokes=p.strokes.filter(s=>!ids.includes(s.id));return n-p.strokes.length}
function strokesBBox(p,ids){let a=1e9,b=1e9,c=-1e9,d=-1e9;ensure(p).strokes.forEach(s=>{if(!ids.includes(s.id))return;s.pts.forEach(q=>{a=Math.min(a,q[0]-s.w);b=Math.min(b,q[1]-s.w);c=Math.max(c,q[0]+s.w);d=Math.max(d,q[1]+s.w)})});return[a,b,c,d]}
function snapToLine(pt,o){const c=Math.cos(o.a),s=Math.sin(o.a),dx=pt[0]-o.x,dy=pt[1]-o.y;return{t:dx*c+dy*s,d:-dx*s+dy*c}}
function pointOnLine(o,t){return[o.x+t*Math.cos(o.a),o.y+t*Math.sin(o.a)]}
function lum(c){const f=v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)};return .2126*f(c[0])+.7152*f(c[1])+.0722*f(c[2])}
function parseColor(s){s=String(s).trim().toLowerCase();let m=s.match(/^#([0-9a-f]{6})$/);if(m)return[0,2,4].map(i=>parseInt(m[1].substr(i,2),16));m=s.match(/^#([0-9a-f]{3})$/);if(m)return m[1].split('').map(h=>parseInt(h+h,16));m=s.match(/rgba?\(\s*(\d+)\D+(\d+)\D+(\d+)/);return m?[+m[1],+m[2],+m[3]]:null}
function contrast(a,b){const A=lum(a),B=lum(b),hi=Math.max(A,B),lo=Math.min(A,B);return(hi+.05)/(lo+.05)}
function checkAccessibility(nb){const out=[];nb.sections.forEach(s=>s.pages.forEach(p=>{const bg=parseColor(p.color||'#ffffff')||[255,255,255],at={sec:s.id,page:p.id};
 if(!(p.title||'').trim())out.push(Object.assign({type:'title',msg:'Page has no title'},at));
 p.items.forEach(it=>{if(it.type==='image'&&!(it.alt||'').trim())out.push(Object.assign({type:'alt',msg:'Picture has no alt text',item:it.id},at));
  if(it.type==='text'){const re=/(?:color="([^"]+)"|[^-]color:\s*([^;"]+))/gi;let m,bad=false;while((m=re.exec(it.html||''))){const c=parseColor(m[1]||m[2]);if(c&&contrast(c,bg)<3)bad=true}if(bad)out.push(Object.assign({type:'contrast',msg:'Text color has low contrast',item:it.id},at))}})}));return out}
function trashList(nb){return nb.trash||(nb.trash=[])}
function itemLabel(i){return i.type==='text'?(plain(i.html).slice(0,40)||'(empty text box)'):i.type==='image'?'Picture':(i.name||i.type)}
function trashItem(nb,sec,page,item){removeItem(page,item.id);trashList(nb).push({id:uid(),kind:'item',at:Date.now(),label:itemLabel(item),secId:sec.id,pageId:page.id,data:JSON.parse(JSON.stringify(item))})}
function trashPage(nb,sec,page){const i=sec.pages.indexOf(page);if(i<0)return;sec.pages.splice(i,1);trashList(nb).push({id:uid(),kind:'page',at:Date.now(),label:page.title||'Untitled Page',secId:sec.id,index:i,data:page});if(!sec.pages.length)newPage(sec)}
function trashSection(nb,sec){const i=nb.sections.indexOf(sec);if(i<0)return;nb.sections.splice(i,1);trashList(nb).push({id:uid(),kind:'section',at:Date.now(),label:sec.name,index:i,data:sec});if(!nb.sections.length)newSection(nb)}
function restoreTrash(nb,id,cur){const t=trashList(nb),k=t.findIndex(x=>x.id===id);if(k<0)return null;const e=t.splice(k,1)[0];
 if(e.kind==='section'){nb.sections.splice(Math.min(e.index,nb.sections.length),0,e.data);return{sec:e.data.id,page:e.data.pages[0].id}}
 if(e.kind==='page'){const s=nb.sections.find(x=>x.id===e.secId)||cur.sec;s.pages.splice(Math.min(e.index,s.pages.length),0,e.data);return{sec:s.id,page:e.data.id}}
 let s=nb.sections.find(x=>x.id===e.secId),p=s&&s.pages.find(x=>x.id===e.pageId);if(!p){s=cur.sec;p=cur.page}p.items.push(e.data);return{sec:s.id,page:p.id}}
function purgeOne(nb,id){nb.trash=trashList(nb).filter(x=>x.id!==id)}
function emptyTrash(nb){nb.trash=[]}
function purgeTrash(nb,now,days){const lim=(days||60)*864e5;nb.trash=trashList(nb).filter(x=>now-x.at<=lim)}
function duplicatePage(sec,p){const c=JSON.parse(JSON.stringify(ensure(p)));c.id=uid();c.title=(p.title||'Untitled Page')+' (copy)';c.created=Date.now();c.versions=[];c.items.forEach(i=>{i.id=uid()});c.strokes.forEach(s=>{s.id=uid()});sec.pages.splice(sec.pages.indexOf(p)+1,0,c);return c}
function setAuthor(n){author=n||'Me'}function getAuthor(){return author}
root.QEngine={addStroke,eraseStrokes,pointErase,pointInPoly,lassoSelect,moveStrokes,removeStrokes,strokesBBox,snapToLine,pointOnLine,contrast,parseColor,checkAccessibility,trashItem,trashPage,trashSection,restoreTrash,purgeOne,emptyTrash,purgeTrash,duplicatePage,setAuthor,getAuthor,addFile,addAudio,toText,pageToText,sectionToText,notebookToText,importNotebook,create,newSection,newPage,addText,addImage,removeItem,plain,snapshot,restore,search,uid};
})(typeof module!=='undefined'?module.exports:window);
