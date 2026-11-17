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
['Pictures',[B('From Device','imgDev','image'),B('From Camera','camera','camera'),B('From Web','imgWeb','image')]],['Files',[B('Insert File Printout','printout','printout'),B('Insert File Attachment','attach','attach')]],
['Add-ins',[B('Office Add-ins','addins','addin')]],['Links',[B('Insert Link','link','link')]],['Audio',[B('Audio','audio','audio')]],['Symbols',[B('Symbol','sym','omega')]],['Emoji',[B('Emoji','emoji','smile')]],['Time',[B('Date & Time','dt','clock')]]],
Draw:[['Tools',[B('Type','type','type',{act:1}),NA('Lasso Select'),NA('Eraser'),NA('Pen'),NA('Highlighter'),NA('Draw with Touch')]],['Color',[NA('Black'),NA('Blue'),NA('Dark Green'),NA('Red'),NA('Ink Color')]],['Style',[NA('Thickness')]],['Ruler',[NA('Ruler')]]],
View:[['Notebook Views',[NA('Immersive Reader')]],['Zoom',[{zoom:1},B('Zoom to 100%','zoom100','zoom')]],['Page Setup',[B('Page Color','pageColor','doc'),B('Rule Lines','lines','lines')]],['Authors',[NA('Show Authors')]],['Versions',[B('Page Versions','versions','file'),NA('Deleted Notes')]],['Accessibility',[NA('Check Accessibility')]]],
Help:[['Help & Support',[B('Help','help','help'),NA('Give Feedback to Microsoft')]]]};
const $=s=>document.querySelector(s),dlg=$('#dlg');
function say(h){$('#dlgBody').innerHTML=h;if(!dlg.open)dlg.showModal()}
const na=l=>say(`<b>${l}</b><p>This feature is not available in this version of Quadra OneNote.</p>`);
$('#dlgOk').onclick=()=>dlg.close();
function ins(html){const e=target()||App.newText(60,150);if(!e){say('This notebook is in Viewing mode. Switch to Editing to insert.');return}e.focus();document.execCommand('insertHTML',false,html);e.dispatchEvent(new Event('input'))}
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
function run(b,x){const c=b.c;if(c.startsWith('na:'))return na(c.slice(3));if(c.startsWith('menu:'))return colorMenu(x,c.slice(5));if(ACT[c])return ACT[c](x);if(c.startsWith('tag:'))return tag(c.slice(4));
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

function menu(btn,items){const m=$('#menu');m.innerHTML='';items.forEach(([t,f,col])=>{const b=document.createElement('button');b.textContent=t;if(col)b.innerHTML='<span style="display:inline-block;width:12px;height:12px;margin-right:8px;border:1px solid #888;background:'+col+'"></span>'+t;b.onclick=()=>{m.hidden=true;f()};m.appendChild(b)});m.hidden=false;const r=btn.getBoundingClientRect();
 m.style.left=Math.min(r.left,innerWidth-m.offsetWidth-8)+'px';m.style.top=(r.bottom+m.offsetHeight>innerHeight?Math.max(0,r.top-m.offsetHeight):r.bottom)+'px'}
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let lastEd=null,lastRange=null,painter=null,rec=null;
function target(){const e=App.focused(),s=getSelection();if(e&&s.rangeCount&&e.contains(s.anchorNode))return e;
 const t=e||(lastEd&&lastEd.isConnected?lastEd:null);if(!t)return null;t.focus();s.removeAllRanges();
 if(t===lastEd&&lastRange&&t.contains(lastRange.startContainer))s.addRange(lastRange);else{const r=document.createRange();r.selectNodeContents(t);r.collapse(false);s.addRange(r)}return t}
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
// ---- v0.4: Insert and File features ----
const spot=()=>({x:60,y:150+App.page().items.length*70});
function ask(title,body,okLabel,fn){say('<b>'+title+'</b>'+body+'<p><button class="b" id="askOk">'+okLabel+'</button></p>');const f=dlg.querySelector('input');if(f)f.focus();dlg.querySelectorAll('input').forEach(i=>i.onkeydown=e=>{if(e.key==='Enter')$('#askOk').click()});$('#askOk').onclick=()=>{dlg.close();fn()}}
function readFile(f,cb){const r=new FileReader();r.onload=()=>cb(r.result);r.readAsDataURL(f)}
function shrink(src,cb){const i=new Image();i.onload=()=>{const k=Math.min(1,1200/Math.max(i.width,i.height));if(k===1&&src.length<400000)return cb(src,i.width);const c=document.createElement('canvas');c.width=Math.round(i.width*k);c.height=Math.round(i.height*k);c.getContext('2d').drawImage(i,0,0,c.width,c.height);cb(c.toDataURL('image/jpeg',.85),c.width)};i.onerror=()=>cb(src,300);i.src=src}
function placeImage(src,w){const s=spot(),it=QEngine.addImage(App.page(),s.x,s.y,src);it.w=Math.max(60,Math.min(w||300,420));App.render();App.save()}
function addFileItem(f,kind){if(f.size>1500000)return say('<b>File too large</b><p>Files up to 1.5 MB can be stored in the notebook.</p>');readFile(f,d=>{const s=spot();QEngine.addFile(App.page(),s.x,s.y,{name:f.name,size:f.size,mime:f.type,data:d,kind});App.render();App.save()})}
function addin(a){const p=App.page(),sec=App.sec();
 if(a==='stats'){const tx=p.items.map(i=>QEngine.plain(i.html)).join(' ');say('<b>Page statistics</b><p>Words: '+tx.split(/\s+/).filter(Boolean).length+'<br>Characters: '+tx.length+'<br>Text boxes: '+p.items.filter(i=>i.type==='text').length+'<br>Pictures: '+p.items.filter(i=>i.type==='image').length+'</p>')}
 if(a==='callout')ins('<div class="callout" style="border-left:4px solid #7719aa;background:rgba(119,25,170,.12);padding:6px 10px">Note</div><br>');
 if(a==='divider')ins('<hr><br>');
 if(a==='toc')ins('<ul>'+sec.pages.map(x=>'<li>'+esc(x.title||'Untitled Page')+'</li>').join('')+'</ul>')}
$('#dlgBody').addEventListener('click',e=>{const d=e.target.dataset||{};if(d.ins){dlg.close();ins(esc(d.ins))}if(d.ad){dlg.close();addin(d.ad)}});
let arec=null;
Object.assign(ACT,{
 table(){ask('Insert table','<p>Rows <input id="tr" type="number" min="1" max="20" value="3" style="width:60px"> Columns <input id="tc" type="number" min="1" max="12" value="3" style="width:60px"></p>','Insert',()=>{const r=Math.max(1,Math.min(20,+$('#tr').value||3)),c=Math.max(1,Math.min(12,+$('#tc').value||3));ins('<table><tbody>'+('<tr>'+'<td>&nbsp;</td>'.repeat(c)+'</tr>').repeat(r)+'</tbody></table><br>')})},
 imgDev(){pick('image/*',f=>readFile(f,d=>shrink(d,(s,w)=>placeImage(s,w))))},
 imgWeb(){ask('Picture from web','<p>Image address<br><input id="webUrl" style="width:320px" placeholder="https://..."></p>','Insert',()=>{const u=$('#webUrl').value.trim();if(!/^(https?:|data:image\/)/i.test(u))return say('<b>Picture from web</b><p>Enter an address that starts with http:// or https://</p>');placeImage(u,300)})},
 link(){const sel=lastRange&&!lastRange.collapsed?String(lastRange):'';ask('Insert link','<p>Address<br><input id="lkUrl" style="width:320px" placeholder="https://..."></p><p>Text to display<br><input id="lkTxt" style="width:320px" value="'+esc(sel)+'"></p>','Insert',()=>{let u=$('#lkUrl').value.trim();if(!u)return;if(!/^[a-z][a-z0-9+.-]*:/i.test(u))u='https://'+u;const t=$('#lkTxt').value.trim()||u,e=target()||App.newText(60,150);if(!e)return;e.focus();if(sel&&t===sel)document.execCommand('createLink',false,u);else document.execCommand('insertHTML',false,'<a href="'+esc(u)+'">'+esc(t)+'</a>&nbsp;');e.dispatchEvent(new Event('input'))})},
 sym(){say('<b>Symbol</b><p>'+'©®™€£¥°±×÷≠≤≥∞πΩαβγδλμΣ√∫←→↑↓↔✓✗★♥•…§¶½¼¾'.split('').map(c=>'<button data-ins="'+c+'" style="font-size:18px;width:36px;height:36px">'+c+'</button>').join('')+'</p>')},
 emoji(){say('<b>Emoji</b><p>'+Array.from('😊😀😂😍👍🙏🎉🔥💡✅❌⭐❤📌📎📅📝🧠🚀').map(c=>'<button data-ins="'+c+'" style="font-size:20px;width:40px;height:40px">'+c+'</button>').join('')+'</p>')},
 dt(x){menu(x,[['Date',()=>ins(new Date().toLocaleDateString())],['Time',()=>ins(new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}))],['Date & Time',()=>ins(new Date().toLocaleString())]])},
 camera(){if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia)return say('<b>From Camera</b><p>This browser does not support camera access.</p>');
  navigator.mediaDevices.getUserMedia({video:true}).then(st=>{const stop=()=>st.getTracks().forEach(t=>t.stop());ask('From Camera','<p><video id="camV" autoplay muted playsinline style="width:320px;max-width:100%"></video></p>','Take picture',()=>{const v=$('#camV'),c=document.createElement('canvas');c.width=v.videoWidth||320;c.height=v.videoHeight||240;c.getContext('2d').drawImage(v,0,0);stop();placeImage(c.toDataURL('image/jpeg',.85),Math.min(c.width,420))});$('#camV').srcObject=st;dlg.addEventListener('close',stop,{once:true})}).catch(e=>say('<b>From Camera</b><p>Could not open the camera ('+esc(e.name)+'). Allow camera access and try again.</p>'))},
 audio(){const b=document.querySelector('[data-c=audio]');if(arec){arec.stop();return}
  if(!window.MediaRecorder||!navigator.mediaDevices)return say('<b>Audio</b><p>This browser cannot record audio.</p>');
  navigator.mediaDevices.getUserMedia({audio:true}).then(st=>{const ch=[],r=new MediaRecorder(st);arec=r;r.ondataavailable=e=>{if(e.data.size)ch.push(e.data)};
   r.onstop=()=>{st.getTracks().forEach(t=>t.stop());arec=null;if(b)b.classList.remove('act');readFile(new Blob(ch,{type:r.mimeType||'audio/webm'}),d=>{const s=spot();QEngine.addAudio(App.page(),s.x,s.y,d,'Recording '+new Date().toLocaleTimeString());App.render();App.save()})};
   r.start();if(b)b.classList.add('act')}).catch(e=>say('<b>Audio</b><p>Could not use the microphone ('+esc(e.name)+'). Allow microphone access and try again.</p>'))},
 attach(){pick('*/*',f=>addFileItem(f,'file'))},
 printout(){pick('.pdf,.txt,.md,.csv,.json,application/pdf,text/*',f=>{if(f.type==='application/pdf'||/\.pdf$/i.test(f.name))addFileItem(f,'pdf');else f.text().then(t=>{const s=spot();QEngine.addText(App.page(),s.x,s.y,'<b>'+esc(f.name)+'</b><br>'+esc(t).split('\n').join('<br>'));App.render();App.save()})})},
 addins(){say('<b>Office Add-ins</b><p>Built-in add-ins:</p><p><button class="b" data-ad="stats">Page statistics</button> <button class="b" data-ad="callout">Callout box</button> <button class="b" data-ad="divider">Divider line</button> <button class="b" data-ad="toc">Section contents</button></p>')}});
function dl(name,text,mime){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:mime}));a.download=name.replace(/[\\/:*?"<>|]/g,'_');document.body.appendChild(a);a.click();a.remove()}
function nbSwitch(nb){App.setNb(nb);App.render();listAll();App.save()}
function backstage(){if($('#backstage'))return;const d=document.createElement('div');d.id='backstage';
 const K=[['info','Info'],['new','New'],['open','Open'],['backup','Save backup'],['restore','Restore backup'],['export','Export'],['print','Print'],['options','Options']];
 d.innerHTML='<div class="side"><button id="bsBack">← Back</button>'+K.map(([k,l])=>'<button data-k="'+k+'">'+l+'</button>').join('')+'</div><div class="pane" id="bsPane"></div>';document.body.appendChild(d);
 const P=$('#bsPane'),st=App.state;
 const show=k=>{d.querySelectorAll('.side [data-k]').forEach(b=>b.classList.toggle('act',b.dataset.k===k));const nb=st.nb,pages=nb.sections.reduce((a,s)=>a+s.pages.length,0);
  if(k==='info'){P.innerHTML='<h2>Info</h2><p>Notebook name<br><input id="bsName" value="'+esc(nb.name)+'"> <button class="b" id="bsRename">Rename</button></p><p>'+nb.sections.length+' sections · '+pages+' pages · '+st.nbs.length+' notebook(s) in this browser</p><p><button class="b" id="bsDelete"'+(st.nbs.length<2?' disabled':'')+'>Delete this notebook</button></p>';
   $('#bsRename').onclick=()=>{const v=$('#bsName').value.trim();if(!v)return;nb.name=v;listAll();App.save();show('info')};
   $('#bsDelete').onclick=()=>ask('Delete notebook','<p>Delete “'+esc(nb.name)+'” and everything in it? This cannot be undone. Save a backup first if unsure.</p>','Delete',()=>{st.nbs=st.nbs.filter(n=>n.id!==nb.id);nbSwitch(st.nbs[0]);d.remove()})}
  else if(k==='new'){P.innerHTML='<h2>New notebook</h2><p><input id="bsNewName" value="New Notebook"> <button class="b" id="bsCreate">Create</button></p>';$('#bsCreate').onclick=()=>{nbSwitch(QEngine.create($('#bsNewName').value.trim()||'New Notebook'));d.remove()}}
  else if(k==='open'){P.innerHTML='<h2>Open notebook</h2>'+st.nbs.map(n=>'<div class="nbrow" data-id="'+n.id+'"><b>'+esc(n.name)+'</b> · '+n.sections.length+' sections'+(n.id===nb.id?' (open)':'')+'</div>').join('');P.querySelectorAll('.nbrow').forEach(r=>r.onclick=()=>{nbSwitch(st.nbs.find(n=>n.id===r.dataset.id));d.remove()})}
  else if(k==='backup'){P.innerHTML='<h2>Save backup</h2><p>Downloads this notebook as a JSON file you can restore later.</p><button class="b" id="bsDl">Download backup (.json)</button>';$('#bsDl').onclick=()=>dl(nb.name+'.json',JSON.stringify({format:'quadra-onenote',version:1,notebook:nb}),'application/json')}
  else if(k==='restore'){P.innerHTML='<h2>Restore backup</h2><p>Choose a backup file. It is added as a new notebook; nothing is overwritten.</p><button class="b" id="bsRestore">Choose backup file…</button>';$('#bsRestore').onclick=()=>pick('.json,application/json',f=>f.text().then(t=>{let imp;try{imp=QEngine.importNotebook(JSON.parse(t))}catch(x){return say('<b>Restore failed</b><p>This is not a valid Quadra OneNote backup file.</p>')}st.nbs.push(imp);nbSwitch(imp);d.remove()}))}
  else if(k==='export'){P.innerHTML='<h2>Export</h2><p><button class="b" id="bsPdf">Page as PDF</button> <button class="b" id="bsTxtPage">Page as text (.txt)</button></p><p><button class="b" id="bsTxtSec">Section as text (.txt)</button> <button class="b" id="bsTxtNb">Notebook as text (.txt)</button></p><p>PDF uses the browser print dialog: choose “Save as PDF”.</p>';
   $('#bsPdf').onclick=()=>{d.remove();print()};$('#bsTxtPage').onclick=()=>dl((App.page().title||'page')+'.txt',QEngine.pageToText(App.page()),'text/plain');$('#bsTxtSec').onclick=()=>dl(App.sec().name+'.txt',QEngine.sectionToText(App.sec()),'text/plain');$('#bsTxtNb').onclick=()=>dl(nb.name+'.txt',QEngine.notebookToText(nb),'text/plain')}
  else if(k==='print'){P.innerHTML='<h2>Print</h2><p>Prints the current page without the menus.</p><button class="b" id="bsPrint">Print page</button>';$('#bsPrint').onclick=()=>{d.remove();print()}}
  else if(k==='options'){P.innerHTML='<h2>Options</h2><p>Theme <select id="bsTheme"><option value="light">Light</option><option value="dark">Dark</option></select></p><p><label><input type="checkbox" id="bsSpell"> Check spelling while typing</label></p><p>Default zoom <select id="bsZoom">'+[50,75,100,125,150,200].map(z=>'<option>'+z+'</option>').join('')+'</select></p>';
   $('#bsTheme').value=st.theme;$('#bsSpell').checked=st.spell!==false;$('#bsZoom').value=st.zoom||100;
   $('#bsTheme').onchange=e=>{st.theme=e.target.value;document.documentElement.dataset.theme=st.theme;App.save()};$('#bsSpell').onchange=()=>ACT.spell();$('#bsZoom').onchange=e=>setZoom(+e.target.value)}};
 d.onclick=e=>{if(e.target.id==='bsBack')d.remove();else if(e.target.dataset.k)show(e.target.dataset.k)};show('info')}
init();
