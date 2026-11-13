(function(root){
const uid=()=>Math.random().toString(36).slice(2,10);
function newPage(sec,title){const p={id:uid(),title:title||'',created:Date.now(),items:[],versions:[]};sec.pages.push(p);return p}
function newSection(nb,name){const s={id:uid(),name:name||'Untitled Section',color:'#7a7a7a',pages:[]};nb.sections.push(s);newPage(s);return s}
function create(name){const nb={id:uid(),name:name||'My Notebook',sections:[]};newSection(nb);return nb}
function addText(p,x,y,html){const it={id:uid(),type:'text',x,y,w:320,html:html||''};p.items.push(it);return it}
function addImage(p,x,y,src){const it={id:uid(),type:'image',x,y,w:240,src};p.items.push(it);return it}
function removeItem(p,id){const n=p.items.length;p.items=p.items.filter(i=>i.id!==id);return n!==p.items.length}
function plain(html){return String(html||'').replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim()}
function snapshot(p){p.versions.push({at:Date.now(),title:p.title,items:JSON.parse(JSON.stringify(p.items))});return p.versions.length}
function restore(p,i){const v=p.versions[i];if(!v)return false;p.title=v.title;p.items=JSON.parse(JSON.stringify(v.items));return true}
function search(nb,q,secId){q=q.toLowerCase();const out=[];if(!q)return out;nb.sections.forEach(s=>{if(secId&&s.id!==secId)return;s.pages.forEach(p=>{const t=(p.title+' '+p.items.map(i=>plain(i.html)).join(' ')).toLowerCase();const k=t.indexOf(q);if(k>=0)out.push({sec:s.id,page:p.id,title:p.title||'Untitled Page',snippet:t.slice(Math.max(0,k-20),k+40)})})});return out}
root.QEngine={create,newSection,newPage,addText,addImage,removeItem,plain,snapshot,restore,search,uid};
})(typeof module!=='undefined'?module.exports:window);
