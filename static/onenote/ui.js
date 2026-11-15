const B=(l,c,i,o)=>Object.assign({l,c,i},o||{});
const NAI={'Dictate':'mic','Feed':'feed','Insert File Printout':'printout','Insert File Attachment':'attach','From Camera':'camera','Office Add-ins':'addin','Audio':'audio','Lasso Select':'lasso','Eraser':'eraser','Pen':'pen','Highlighter':'highlighter','Draw with Touch':'touch','Black':'dot-black','Blue':'dot-blue','Dark Green':'dot-green','Red':'dot-red','Ink Color':'palette','Thickness':'thick','Ruler':'ruler','Immersive Reader':'immersive','Show Authors':'authors','Deleted Notes':'trash','Check Accessibility':'access','Give Feedback to Microsoft':'smile'};
const NA=l=>B(l,'na:'+l,NAI[l]||'doc');
const RIB={
Home:[['Undo',[B('Undo','undo','undo'),B('Redo','redo','redo')]],
['Clipboard',[B('Paste','paste','paste'),B('Cut','cut','cut',{sm:1}),B('Copy','copy','copy',{sm:1}),B('Format Painter','painter','paint',{sm:1})]],
['Font',[{sel:'fontName',opts:['Calibri','Arial','Georgia','Courier New','Verdana']},{sel:'fontSize',def:'3',opts:[['1','8'],['2','10'],['3','12'],['4','14'],['5','18'],['6','24'],['7','36']]},B('Bold','bold','bold',{sm:1}),B('Italic','italic','italic',{sm:1}),B('Underline','underline','underline',{sm:1}),B('Strike','strikeThrough','strike',{sm:1}),B('Subscript','subscript','sub',{sm:1}),B('Highlight','menu:hl','hl',{sm:1}),B('Font color','menu:fg','color',{sm:1}),B('Bullets','insertUnorderedList','list',{sm:1}),B('Numbering','insertOrderedList','num',{sm:1}),B('Outdent','outdent','outdent',{sm:1}),B('Indent','indent','indent',{sm:1}),B('Left','justifyLeft','left',{sm:1}),B('Center','justifyCenter','center',{sm:1}),B('Right','justifyRight','right',{sm:1}),B('Clear formatting','clear','clearfmt',{sm:1})]],
['Styles',[{sel:'formatBlock',opts:[['div','Normal'],['H1','Heading 1'],['H2','Heading 2'],['H3','Heading 3']]}]],
['Tags',[B('To Do','tag:todo','tag'),B('Important','tag:imp','tag'),B('Question','tag:q','tag')]],
['Spelling',[B('Spelling','spell','abc')]],['Dictate',[B('Dictate','dictate','mic')]],['Feed',[B('Feed','feed','feed')]],['Find',[B('Find','find','search')]]],
Insert:[['Notebook',[B('New page','newPage','plus'),B('New Section','newSec','plus')]],['Tables',[B('Table','table','table')]],
['Pictures',[B('From Device','imgDev','image'),NA('From Camera'),B('From Web','imgWeb','image')]],['Files',[NA('Insert File Printout'),NA('Insert File Attachment')]],
['Add-ins',[NA('Office Add-ins')]],['Links',[B('Insert Link','link','link')]],['Audio',[NA('Audio')]],['Symbols',[B('Symbol','sym','omega')]],['Emoji',[B('Emoji','emoji','smile')]],['Time',[B('Date & Time','dt','clock')]]],
Draw:[['Tools',[B('Type','type','type',{act:1}),NA('Lasso Select'),NA('Eraser'),NA('Pen'),NA('Highlighter'),NA('Draw with Touch')]],['Color',[NA('Black'),NA('Blue'),NA('Dark Green'),NA('Red'),NA('Ink Color')]],['Style',[NA('Thickness')]],['Ruler',[NA('Ruler')]]],
View:[['Notebook Views',[NA('Immersive Reader')]],['Zoom',[{zoom:1},B('Zoom to 100%','zoom100','zoom')]],['Page Setup',[B('Page Color','pageColor','doc'),B('Rule Lines','lines','lines')]],['Authors',[NA('Show Authors')]],['Versions',[B('Page Versions','versions','file'),NA('Deleted Notes')]],['Accessibility',[NA('Check Accessibility')]]],
Help:[['Help & Support',[B('Help','help','help'),NA('Give Feedback to Microsoft')]]]};
const $=s=>document.querySelector(s),dlg=$('#dlg');
function say(h){$('#dlgBody').innerHTML=h;if(!dlg.open)dlg.showModal()}
const na=l=>say(`<b>${l}</b><p>This feature is not available in this version of Quadra OneNote.</p>`);
$('#dlgOk').onclick=()=>dlg.close();
function ins(html){const e=target();if(!e){say('Click on the page to start a text box first.');return}e.focus();document.execCommand('insertHTML',false,html);e.dispatchEvent(new Event('input'))}
function pick(f,cb){const i=document.createElement('input');i.type='file';i.accept=f;i.onchange=()=>i.files[0]&&cb(i.files[0]);i.click()}
const ACT={newPage(){const p=QEngine.newPage(App.sec());App.state.page=p.id;listAll();App.save()},
 newSec(){const s=QEngine.newSection(App.state.nb);App.state.sec=s.id;App.state.page=s.pages[0].id;listAll();App.save()},
 table(){ins('<table><tbody>'+'<tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>'.repeat(3)+'</tbody></table><br>')},
 imgDev(){pick('image/*',f=>{const r=new FileReader();r.onload=()=>{QEngine.addImage(App.page(),60,160,r.result);App.render();App.save()};r.readAsDataURL(f)})},
 imgWeb(){const u=prompt('Image URL');if(u){QEngine.addImage(App.page(),60,160,u);App.render();App.save()}},
 link(){const u=prompt('Link address','https://');if(u){const e=target();if(e){e.focus();document.execCommand('createLink',false,u);e.dispatchEvent(new Event('input'))}}},
 sym(){ins('Ω')},emoji(){ins('😊')},dt(){ins(new Date().toLocaleString())},
 find(){$('#railSearch').click();$('#q').focus()},
 spell(){const on=!document.body.spellcheck;document.body.spellcheck=on;document.querySelectorAll('.ed').forEach(e=>e.spellcheck=on)},
 zoom100(){setZoom(100)},lines(){App.state.lines=!App.state.lines;document.body.classList.toggle('lines',App.state.lines);App.save()},
 pageColor(){const cs=['','#fff9db','#e7f5ff','#ebfbee'],s=App.state;s.color=cs[(cs.indexOf(s.color||'')+1)%cs.length];$('#canvasWrap').style.background=s.color||'';App.save()},
 versions(){const p=App.page();QEngine.snapshot(p);App.save();say('<b>Page Versions</b>'+p.versions.map((v,i)=>`<p>${new Date(v.at).toLocaleString()} <button class="b" onclick="QEngine.restore(App.page(),${i});App.render();dlg.close();App.save()">Restore</button></p>`).join(''))},
 help(){say('<b>Shortcuts</b><p>Ctrl+B / I / U, Ctrl+Z / Y, Tab / Shift+Tab, Delete removes the selected box (click its top bar). Click empty page to add a text box.</p>')},
 type(){}};
function tag(k){const m={todo:'<input type="checkbox"> ',imp:'⭐ ',q:'❓ '};ins(m[k])}
function run(b,x){const c=b.c;if(c.startsWith('na:'))return na(c.slice(3));if(c.startsWith('menu:'))return colorMenu(x,c.slice(5));if(ACT[c])return ACT[c]();if(c.startsWith('tag:'))return tag(c.slice(4));
 const[k,v]=c.split(':');if(k==='paste')return navigator.clipboard.readText().then(t=>ins(esc(t).replace(/\n/g,'<br>'))).catch(()=>say('<b>Paste</b><p>The browser blocked clipboard access. Use Ctrl+V to paste.</p>'));
 const e=target();if(!e){say('Click inside a text box first.');return}document.execCommand(k,false,v);e.dispatchEvent(new Event('input'));updateState()}
function renderRibbon(tab){const r=$('#ribbon');r.innerHTML='';(RIB[tab]||[]).forEach(([n,bs])=>{const g=document.createElement('div');g.className='grp';const row=document.createElement('div');row.className='row';
 bs.forEach(b=>{if(b.sel){const s=document.createElement('select');b.opts.forEach(o=>{const op=document.createElement('option');op.value=Array.isArray(o)?o[0]:o;op.textContent=Array.isArray(o)?o[1]:o;s.appendChild(op)});if(b.def)s.value=b.def;else if(b.sel==='fontName')s.value='Calibri';
  s.title=b.sel;s.onchange=()=>{const e=target();if(e){document.execCommand(b.sel,false,s.value);e.dispatchEvent(new Event('input'))}};row.appendChild(s);return}
  if(b.zoom){row.appendChild($('#zoomSel').cloneNode(true)).id='';return}
  const x=document.createElement('button');x.className='rb'+(b.sm?' sm':'')+(b.act?' act':'');x.title=b.l;x.innerHTML=`<svg class="ic"><use href="#i-${b.i}"/></svg><span>${b.l}</span>`;
  x.dataset.c=b.c;if(b.c==='spell'&&App.state.spell!==false)x.classList.add('act');x.onmousedown=e=>e.preventDefault();x.onclick=()=>run(b,x);row.appendChild(x)});
 const s=document.createElement('small');s.textContent=n;g.append(row,s);r.appendChild(g)})}
function listAll(){const st=App.state,sl=$('#secList'),pl=$('#pageList');sl.innerHTML=pl.innerHTML='';
 st.nb.sections.forEach(s=>{const d=document.createElement('div');d.className='item'+(s.id===App.sec().id?' sel':'');d.innerHTML=`<span class="strip" style="background:${s.color}"></span>${s.name}`;
  d.onclick=()=>{st.sec=s.id;st.page=s.pages[0].id;listAll();App.render();App.save()};sl.appendChild(d)});
 App.sec().pages.forEach(p=>{const d=document.createElement('div');d.className='item'+(p.id===App.page().id?' sel':'');d.textContent=p.title||'Untitled Page';d.draggable=true;
  d.onclick=()=>{st.page=p.id;listAll();App.render();App.save()};
  d.ondragstart=e=>e.dataTransfer.setData('text',p.id);d.ondragover=e=>e.preventDefault();
  d.ondrop=e=>{e.preventDefault();const a=App.sec().pages,i=a.findIndex(x=>x.id===e.dataTransfer.getData('text'));if(i<0)return;const[m]=a.splice(i,1);a.splice(a.indexOf(p)+(i<a.indexOf(p)?1:0),0,m);listAll();App.save()};pl.appendChild(d)});
 $('#nbName').textContent=$('#nbName2').textContent=st.nb.name}
App.listPages=listAll;
function setZoom(z){App.state.zoom=z;$('#canvas').style.zoom=z/100;document.querySelectorAll('#zoomSel').forEach(s=>s.value=z);App.save()}
function backstage(){const d=document.createElement('div');d.id='backstage';d.innerHTML='<div class="side"><button id="bsBack">← Back</button><button data-a="new">New notebook</button><button data-a="save">Save backup (JSON)</button><button data-a="restore">Restore backup</button><button data-a="txt">Export page as .txt</button><button data-a="pdf">Export page as PDF</button></div><div style="padding:30px"><h2>'+App.state.nb.name+'</h2><p>Backup, restore and export your notebook.</p></div>';document.body.appendChild(d);
 const dl=(n,t,m)=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([t],{type:m}));a.download=n;a.click()};
 d.onclick=e=>{const a=e.target.dataset.a;if(e.target.id==='bsBack'){d.remove();return}if(!a)return;
  if(a==='new'){const n=prompt('Notebook name','New Notebook');if(n){const nb=QEngine.create(n);Object.assign(App.state,{nb,sec:nb.sections[0].id,page:nb.sections[0].pages[0].id});App.render();listAll();App.save();d.remove()}}
  if(a==='save')dl(App.state.nb.name+'.json',JSON.stringify(App.state.nb),'application/json');
  if(a==='restore')pick('.json',f=>f.text().then(t=>{try{const nb=JSON.parse(t);if(!nb.sections)throw 0;Object.assign(App.state,{nb,sec:nb.sections[0].id,page:nb.sections[0].pages[0].id});App.render();listAll();App.save();d.remove()}catch(x){say('Not a valid backup file.')}}));
  if(a==='txt'){const p=App.page();dl((p.title||'page')+'.txt',p.title+'\n\n'+p.items.map(i=>QEngine.plain(i.html)).join('\n'),'text/plain')}
  if(a==='pdf'){d.remove();print()}}}
function menu(btn,items){const m=$('#menu');m.innerHTML='';items.forEach(([t,f,col])=>{const b=document.createElement('button');b.textContent=t;if(col)b.innerHTML='<span style="display:inline-block;width:12px;height:12px;margin-right:8px;border:1px solid #888;background:'+col+'"></span>'+t;b.onclick=()=>{m.hidden=true;f()};m.appendChild(b)});m.hidden=false;const r=btn.getBoundingClientRect();
 m.style.left=Math.min(r.left,innerWidth-m.offsetWidth-8)+'px';m.style.top=(r.bottom+m.offsetHeight>innerHeight?Math.max(0,r.top-m.offsetHeight):r.bottom)+'px'}
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let lastEd=null,lastRange=null,painter=null,rec=null;
function target(){const e=App.focused();if(e)return e;if(lastEd&&lastEd.isConnected){lastEd.focus();const s=getSelection();s.removeAllRanges();if(lastRange)s.addRange(lastRange);return lastEd}return null}
const STATE=['bold','italic','underline','strikeThrough','subscript','insertUnorderedList','insertOrderedList','justifyLeft','justifyCenter','justifyRight'];
function updateState(){if(!App.focused())return;document.querySelectorAll('#ribbon [data-c]').forEach(x=>{if(STATE.includes(x.dataset.c))try{x.classList.toggle('act',document.queryCommandState(x.dataset.c))}catch(e){}});
 const S=n=>document.querySelector('#ribbon select[title='+n+']'),has=(s,v)=>[...s.options].some(o=>o.value===v);let s;
 if(s=S('fontName')){const f=(document.queryCommandValue('fontName')||'').replace(/["']/g,'');s.value=has(s,f)?f:'Calibri'}
 if(s=S('fontSize')){const z=document.queryCommandValue('fontSize');s.value=has(s,z)?z:'3'}
 if(s=S('formatBlock')){const f=(document.queryCommandValue('formatBlock')||'').toUpperCase();s.value=has(s,f)?f:'div'}}
document.addEventListener('selectionchange',()=>{const s=getSelection();if(s.rangeCount){const n=s.anchorNode,el=n&&(n.nodeType===1?n:n.parentElement),ed=el&&el.closest&&el.closest('.ed');if(ed){lastEd=ed;lastRange=s.getRangeAt(0).cloneRange()}}updateState()});
document.addEventListener('mousedown',e=>{if(!e.target.closest('#menu'))$('#menu').hidden=true});
$('#menu').onmousedown=e=>e.preventDefault();
function colorMenu(btn,kind){const HL=[['Yellow','#ffe066'],['Green','#b2f2bb'],['Cyan','#99e9f2'],['Pink','#fcc2d7'],['No color','transparent']],FG=[['Red','#d32f2f'],['Blue','#1a56c4'],['Green','#1b7a1b'],['Purple','#7719aa'],['Orange','#e8590c'],['Automatic','']];
 menu(btn,(kind==='hl'?HL:FG).map(([n,c])=>[n,()=>{const e=target();if(!e)return say('Click inside a text box first.');document.execCommand(kind==='hl'?'hiliteColor':'foreColor',false,c||getComputedStyle(document.body).color);e.dispatchEvent(new Event('input'))},c&&c!=='transparent'?c:null]))}
Object.assign(ACT,{
 spell(){const s=App.state;s.spell=s.spell===false;document.querySelectorAll('.ed').forEach(e=>e.spellcheck=s.spell);const b=document.querySelector('[data-c=spell]');if(b)b.classList.toggle('act',s.spell);App.save()},
 clear(){const e=target();if(!e)return say('Click inside a text box first.');document.execCommand('removeFormat');document.execCommand('formatBlock',false,'div');e.dispatchEvent(new Event('input'))},
 painter(){const e=target();if(!e)return say('Select some formatted text first.');const q=c=>document.queryCommandState(c);painter={bold:q('bold'),italic:q('italic'),underline:q('underline'),strikeThrough:q('strikeThrough'),subscript:q('subscript'),fore:document.queryCommandValue('foreColor'),back:document.queryCommandValue('backColor'),size:document.queryCommandValue('fontSize')};const b=document.querySelector('[data-c=painter]');if(b)b.classList.add('act')},
 dictate(){const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR)return say('<b>Dictate</b><p>Speech recognition is not supported in this browser. Try Chrome or Edge.</p>');
  const b=document.querySelector('[data-c=dictate]');if(rec){rec.stop();return}if(!target())return say('Click inside a text box first.');
  rec=new SR();rec.lang=navigator.language||'en-US';rec.continuous=true;rec.interimResults=false;
  rec.onresult=e=>{let t='';for(let i=e.resultIndex;i<e.results.length;i++)if(e.results[i].isFinal)t+=e.results[i][0].transcript;if(t)ins(esc(t)+' ')};
  rec.onerror=e=>say('<b>Dictate</b><p>Could not use the microphone ('+esc(e.error)+'). Allow microphone access and try again.</p>');
  rec.onend=()=>{rec=null;if(b)b.classList.remove('act')};rec.start();if(b)b.classList.add('act')},
 feed(){const a=[];App.state.nb.sections.forEach(s=>s.pages.forEach(p=>a.push({s,p,t:p.updated||p.created})));a.sort((x,y)=>y.t-x.t);
  say('<b>Feed: recently edited pages</b>'+a.slice(0,15).map(x=>`<p><button class="b" data-go="${x.s.id}|${x.p.id}">${esc(x.p.title||'Untitled Page')}</button> ${esc(x.s.name)} · ${new Date(x.t).toLocaleString()}</p>`).join(''))}});
document.addEventListener('mouseup',e=>{if(!painter||!e.target.closest||!e.target.closest('.ed'))return;const s=getSelection();if(s.isCollapsed)return;const ed=e.target.closest('.ed'),q=c=>document.queryCommandState(c),P=painter;
 ['bold','italic','underline','strikeThrough','subscript'].forEach(c=>{if(q(c)!==P[c])document.execCommand(c)});
 if(P.fore&&P.fore!==getComputedStyle(ed).color)document.execCommand('foreColor',false,P.fore);if(P.back&&P.back!=='rgba(0, 0, 0, 0)'&&P.back!==getComputedStyle($('#canvasWrap')).backgroundColor)document.execCommand('hiliteColor',false,P.back);if(P.size&&P.size!=='3')document.execCommand('fontSize',false,P.size);
 painter=null;const b=document.querySelector('[data-c=painter]');if(b)b.classList.remove('act');ed.dispatchEvent(new Event('input'))});
$('#dlgBody').addEventListener('click',e=>{const g=e.target.dataset&&e.target.dataset.go;if(g){const[s,p]=g.split('|');App.state.sec=s;App.state.page=p;dlg.close();listAll();App.render();App.save()}});
function init(){App.init();
 const z=$('#zoomSel');[50,75,100,125,150,200].forEach(v=>z.add(new Option(v+'%',v)));z.onchange=e=>setZoom(+e.target.value);
 document.addEventListener('change',e=>{if(e.target.id==='zoomSel')setZoom(+e.target.value)});
 document.querySelectorAll('[data-tab]').forEach(t=>t.onclick=()=>{if(t.dataset.tab==='File')return backstage();document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('on',x===t));renderRibbon(t.dataset.tab)});
 renderRibbon('Home');listAll();setZoom(App.state.zoom||100);if(App.state.color)$('#canvasWrap').style.background=App.state.color;
 $('#addSec').onclick=ACT.newSec;$('#addPage').onclick=ACT.newPage;
 document.querySelectorAll('[data-na]').forEach(b=>b.onclick=()=>na(b.dataset.na));
 $('#themeBtn').onclick=()=>{const s=App.state;s.theme=s.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=s.theme;App.save()};
 $('#modeBtn').onclick=()=>{const s=App.state;s.readonly=!s.readonly;$('#modeBtn').textContent=s.readonly?'Viewing':'Editing';App.render();App.save()};
 $('#launcher').onclick=e=>menu(e.currentTarget,[['Excel','https://www.office.com/launch/excel'],['Word','https://www.office.com/launch/word'],['PowerPoint','https://www.office.com/launch/powerpoint'],['OneNote','https://www.onenote.com']].map(([n,u])=>[n,()=>window.open(u,'_blank','noopener')]));
 $('#railSearch').onclick=()=>{$('#cols').hidden=true;$('#searchPanel').hidden=false;$('#railSearch').classList.add('on');$('#railNb').classList.remove('on')};
 $('#railNb').onclick=()=>{$('#cols').hidden=false;$('#searchPanel').hidden=true;$('#railNb').classList.add('on');$('#railSearch').classList.remove('on')};
 $('#q').oninput=e=>{const r=$('#results');r.innerHTML='';QEngine.search(App.state.nb,e.target.value).forEach(h=>{const d=document.createElement('div');d.className='res';d.textContent=h.title+' — '+h.snippet;
  d.onclick=()=>{App.state.sec=h.sec;App.state.page=h.page;$('#railNb').click();listAll();App.render();App.save()};r.appendChild(d)})};
 document.addEventListener('keydown',e=>{if(e.ctrlKey&&e.key.toLowerCase()==='f'){e.preventDefault();ACT.find()}});
 window.__app=App}
init();
