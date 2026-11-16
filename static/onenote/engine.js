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
function search(nb,q,secId){q=q.toLowerCase();const out=[];if(!q)return out;nb.sections.forEach(s=>{if(secId&&s.id!==secId)return;s.pages.forEach(p=>{const t=(p.title+' '+p.items.map(i=>plain(i.html)+' '+(i.name||'')).join(' ')).toLowerCase();const k=t.indexOf(q);if(k>=0)out.push({sec:s.id,page:p.id,title:p.title||'Untitled Page',snippet:t.slice(Math.max(0,k-20),k+40)})})});return out}

function addFile(p,x,y,o){const it=Object.assign({id:uid(),type:'file',x,y,w:300},o);p.items.push(it);return it}
function addAudio(p,x,y,src,name){const it={id:uid(),type:'audio',x,y,w:300,src,name:name||'Recording'};p.items.push(it);return it}
function toText(h){return String(h||'').replace(/<input[^>]*checked[^>]*>/gi,'[x] ').replace(/<input[^>]*type="checkbox"[^>]*>/gi,'[ ] ').replace(/<(br|hr)\s*\/?>/gi,'\n').replace(/<\/(div|p|li|tr|h[1-6]|blockquote)>/gi,'\n').replace(/<\/td>/gi,'\t').replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/\n+$/,'')}
function pageToText(p){return [p.title||'Untitled Page',''].concat(p.items.map(i=>i.type==='file'?'[Attachment: '+i.name+']':i.type==='audio'?'[Audio: '+i.name+']':i.type==='image'?'[Image]':toText(i.html))).join('\n')}
function sectionToText(s){return ['== '+s.name+' =='].concat(s.pages.map(p=>'--- '+(p.title||'Untitled Page')+' ---\n'+pageToText(p))).join('\n\n')}
function notebookToText(nb){return ['# '+nb.name].concat(nb.sections.map(sectionToText)).join('\n\n')}
function importNotebook(o){const nb=o&&o.format==='quadra-onenote'?o.notebook:o;if(!nb||!Array.isArray(nb.sections))throw new Error('invalid backup');
 nb.id=uid();nb.name=nb.name||'Restored notebook';nb.sections.forEach(s=>{if(!s||!Array.isArray(s.pages))throw new Error('invalid section');s.id=s.id||uid();s.name=s.name||'Untitled Section';s.color=s.color||'#7a7a7a';
  s.pages.forEach(p=>{if(!p||!Array.isArray(p.items))throw new Error('invalid page');p.id=p.id||uid();p.title=p.title||'';p.created=p.created||Date.now();p.versions=Array.isArray(p.versions)?p.versions:[]})});
 if(!nb.sections.length)newSection(nb);return nb}
root.QEngine={addFile,addAudio,toText,pageToText,sectionToText,notebookToText,importNotebook,create,newSection,newPage,addText,addImage,removeItem,plain,snapshot,restore,search,uid};
})(typeof module!=='undefined'?module.exports:window);
