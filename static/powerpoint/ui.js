/* Quadra PowerPoint - ui.js
   Ribbon, menus, dialogs, File menu, slideshow, autosave, zoom bar, export. */
(function () {
  'use strict';
  const Q = window.QEngine, E = window.QEditor;
  const $ = (id) => document.getElementById(id);
  const THEME_KEY = 'quadra-ppt:theme', UI_KEY = 'quadra-ppt:ui';
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const el = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };
  const ic = (n, cls) => '<svg class="' + (cls || 'ic') + '" aria-hidden="true"><use href="#i-' + n + '"/></svg>';
  const overlay = $('overlayRoot');
  const QUI = window.QUI = {};

  // ================= persistent UI state =================
  let ui = { tab: 'Home', notes: false, ruler: false, thumbsCollapsed: false, ribbonCollapsed: false };
  try { ui = Object.assign(ui, JSON.parse(localStorage.getItem(UI_KEY)) || {}); } catch (e) { /* ignore */ }
  const saveUi = () => { try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch (e) { /* ignore */ } };

  // ================= menus =================
  let menus = [];
  function closeMenus() {
    menus.forEach((m) => m.remove()); menus = [];
    document.removeEventListener('pointerdown', onOutside, true);
    document.querySelectorAll('.tab.open').forEach((t) => t.classList.remove('open'));
  }
  function onOutside(ev) { if (!ev.target.closest('.menu')) closeMenus(); }
  function placeMenu(m, r, side) {
    const vw = window.innerWidth, vh = window.innerHeight, pad = 8;
    m.style.left = '0px'; m.style.top = '0px'; m.style.visibility = 'hidden';
    const w = m.offsetWidth, h = m.offsetHeight;
    let left, top;
    if (side === 'right') {
      left = r.right - 2; if (left + w > vw - pad) left = r.left - w + 2;
      top = r.top - 4; if (top + h > vh - pad) top = vh - h - pad;
    } else {
      left = r.left; if (left + w > vw - pad) left = Math.max(pad, r.right - w);
      top = r.bottom + 2; if (top + h > vh - pad) top = r.top - h - 2; // not enough room below: open upwards
    }
    m.style.left = Math.max(pad, left) + 'px'; m.style.top = Math.max(pad, top) + 'px'; m.style.visibility = '';
  }
  function buildMenu(items, depth, cls) {
    const m = el('div', 'menu' + (cls ? ' ' + cls : '')); m.setAttribute('role', 'menu'); m.dataset.depth = depth;
    items.forEach((it) => {
      if (it.sep) { m.appendChild(el('div', 'msep')); return; }
      if (it.head) { const h = el('div', 'mhead'); h.innerHTML = (it.icon ? ic(it.icon) : '') + '<span>' + esc(it.head) + '</span>'; m.appendChild(h); return; }
      if (it.node) { m.appendChild(it.node); return; }
      const b = el('button', 'mi' + (it.check ? ' check' : '')); b.type = 'button'; b.setAttribute('role', 'menuitem');
      if (it.id) b.dataset.mid = it.id;
      b.innerHTML = (it.icon ? ic(it.icon, 'mi-ic') : (it.check === undefined ? '' : '')) + '<span>' + esc(it.label) + '</span>' +
        (it.key ? '<span class="mi-key">' + esc(it.key) + '</span>' : '') + (it.submenu ? ic('chev-right', 'mi-sub') : '');
      if (it.disabled) b.disabled = true;
      if (it.check === false) { b.classList.remove('check'); b.style.paddingLeft = '38px'; }
      b.addEventListener('mouseenter', () => {
        menus.filter((x) => Number(x.dataset.depth) > depth).forEach((x) => { x.remove(); });
        menus = menus.filter((x) => Number(x.dataset.depth) <= depth);
        if (it.submenu && !it.disabled) openSub(b, it.submenu, depth + 1);
      });
      b.addEventListener('click', () => {
        if (it.submenu) { openSub(b, it.submenu, depth + 1); return; }
        closeMenus(); if (it.run) it.run();
      });
      m.appendChild(b);
    });
    return m;
  }
  function openSub(anchor, items, depth) {
    menus.filter((x) => Number(x.dataset.depth) >= depth).forEach((x) => x.remove());
    menus = menus.filter((x) => Number(x.dataset.depth) < depth);
    const m = buildMenu(items, depth); overlay.appendChild(m); menus.push(m); placeMenu(m, anchor.getBoundingClientRect(), 'right');
  }
  function openMenu(anchor, items, cls) {
    closeMenus();
    const m = buildMenu(items, 0, cls); overlay.appendChild(m); menus.push(m);
    placeMenu(m, anchor.getBoundingClientRect(), 'below');
    setTimeout(() => document.addEventListener('pointerdown', onOutside, true), 0);
    return m;
  }
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && menus.length) { ev.preventDefault(); ev.stopPropagation(); closeMenus(); } }, true);
  QUI.openMenu = openMenu; QUI.closeMenus = closeMenus;

  // ================= dialogs / toast =================
  function showDialog(o) {
    closeMenus();
    const bd = el('div', 'backdrop'); const d = el('div', 'dialog' + (o.wide ? ' wide' : ''));
    d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-label', o.title);
    d.innerHTML = '<h2>' + esc(o.title) + '</h2><div class="dbody"></div><div class="dfoot"></div>';
    const body = d.querySelector('.dbody'); if (typeof o.body === 'string') body.innerHTML = o.body; else if (o.body) body.appendChild(o.body);
    const foot = d.querySelector('.dfoot');
    const close = () => { bd.remove(); document.removeEventListener('keydown', onk, true); };
    (o.buttons || [{ label: 'OK', primary: true }]).forEach((bt) => {
      const b = el('button', 'btn' + (bt.primary ? ' primary' : '')); b.type = 'button'; b.textContent = bt.label; if (bt.act) b.dataset.act = bt.act;
      b.addEventListener('click', () => { if (bt.run && bt.run(d) === false) return; close(); });
      foot.appendChild(b);
    });
    function onk(ev) {
      if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); close(); }
      else if (ev.key === 'Enter' && ev.target.tagName === 'INPUT') { const p = foot.querySelector('.primary'); if (p) { ev.preventDefault(); p.click(); } }
    }
    document.addEventListener('keydown', onk, true);
    bd.appendChild(d); overlay.appendChild(bd);
    const first = d.querySelector('input,select') || foot.querySelector('.primary') || foot.querySelector('button'); if (first) first.focus();
    return { close, el: d };
  }
  const notAvailable = (name) => showDialog({ title: 'Not available in this version', body: '<p><b>' + esc(name) + '</b> is not available in this version of Quadra PowerPoint.</p><p>The rest of the editor works as usual.</p>' });
  QUI.notAvailable = notAvailable; QUI.showDialog = showDialog;
  let toastTimer = 0;
  function toast(msg) {
    document.querySelectorAll('.toast').forEach((t) => t.remove());
    const t = el('div', 'toast'); t.textContent = msg; document.body.appendChild(t);
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.remove(), 1800);
  }

  // ================= colours =================
  const PALETTE = ['#000000', '#ffffff', '#7a7574', '#bfbfbf', '#1f2430', '#f7f4ee', '#c43e1c', '#e81123', '#ff8c00', '#ffd800', '#9be564', '#107c10', '#00b294', '#00b7c3', '#4aa3ff', '#0f6cbd', '#5c2d91', '#e3008c'];
  function colorNode(onPick, noneLabel) {
    const wrap = el('div'); const grid = el('div', 'grid cols6');
    PALETTE.forEach((c) => { const b = el('button', 'swatch'); b.type = 'button'; b.style.background = c; b.title = c; b.dataset.color = c; b.addEventListener('click', () => { closeMenus(); onPick(c); }); grid.appendChild(b); });
    wrap.appendChild(grid);
    if (noneLabel) { const n = el('button', 'mi'); n.type = 'button'; n.textContent = noneLabel; n.addEventListener('click', () => { closeMenus(); onPick(null); }); wrap.appendChild(n); }
    return wrap;
  }
  const colorItems = (onPick, none) => [{ node: colorNode(onPick, none) }];

  // ================= file helpers =================
  const baseName = () => (E.pres.name || 'Presentation').replace(/[\\/:*?"<>|]+/g, '_');
  function download(href, name) { const a = el('a'); a.href = href; a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
  function downloadOutline() {
    const blob = new Blob([E.pres.outlineText()], { type: 'text/plain' });
    const url = URL.createObjectURL(blob); download(url, baseName() + '-outline.txt'); setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  function downloadJson() {
    const blob = new Blob([JSON.stringify(E.pres.toJSON(), null, 1)], { type: 'application/json' });
    const u = URL.createObjectURL(blob); download(u, baseName() + '.json'); setTimeout(() => URL.revokeObjectURL(u), 2000);
  }
  function confirmDialog(title, text, okLabel, onOk) {
    showDialog({ title, body: '<p>' + esc(text) + '</p>', buttons: [{ label: 'Cancel' }, { label: okLabel, primary: true, run: () => { onOk(); } }] });
  }
  function openFromDevice() { $('fileOpen').value = ''; $('fileOpen').click(); }
  $('fileOpen').addEventListener('change', () => {
    const f = $('fileOpen').files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const o = JSON.parse(r.result);
        if (!o || !Array.isArray(o.slides)) throw new Error('bad');
        const p = Q.Presentation.fromJSON(o); switchTo(null, { name: p.name, pres: p });
      } catch (e) { showDialog({ title: 'Cannot open file', body: '<p>This file is not a Quadra PowerPoint presentation (.json).</p>' }); }
    };
    r.readAsText(f);
  });
  function renameDialog() {
    showDialog({
      title: 'Rename', body: '<label class="row">Name <input type="text" id="renameInput" maxlength="80"></label>',
      buttons: [{ label: 'Cancel' }, { label: 'Rename', primary: true, run: (d) => {
        const v = d.querySelector('#renameInput').value.trim();
        if (!v) return false;
        E.mutate(() => { E.pres.name = v; }, 'meta'); syncTitle();
      } }],
    });
    const inp = document.getElementById('renameInput'); inp.value = E.pres.name; inp.select();
  }
  function syncTitle() { $('docName').textContent = E.pres.name; document.title = E.pres.name + ' - Quadra PowerPoint'; }
  function infoDialog() {
    let saved = '—'; const d = readDoc(index.current); if (d && d.saved) saved = new Date(d.saved).toLocaleString();
    showDialog({ title: 'Presentation info', body:
      '<table class="kbd-table"><tr><td>Name</td><td>' + esc(E.pres.name) + '</td></tr><tr><td>Slides</td><td>' + E.pres.slides.length + '</td></tr>' +
      '<tr><td>Slide size</td><td>' + esc(Q.SIZES[E.pres.size].label) + '</td></tr><tr><td>Theme</td><td>' + esc((Q.THEMES.find((t) => t.id === E.pres.theme.id) || {}).name) + '</td></tr>' +
      '<tr><td>Folder</td><td>' + esc((curEntry() || {}).folder || '') + '</td></tr><tr><td>Words</td><td>' + E.pres.wordCount().words + '</td></tr><tr><td>Last autosave</td><td>' + esc(saved) + '</td></tr></table>' });
  }

  // ================= autosave =================
  const saveStatus = $('saveStatus');
  function setStatus(state) {
    const txt = { saved: 'Saved', saving: 'Saving…', error: 'Not saved' }[state];
    saveStatus.dataset.state = state; saveStatus.title = txt; $('saveText').textContent = txt;
    saveStatus.querySelector('use').setAttribute('href', '#i-' + (state === 'saved' ? 'cloud-ok' : state === 'saving' ? 'cloud-wait' : 'cloud-err'));
  }
  let saveTimer = 0;
  function saveNow() {
    clearTimeout(saveTimer);
    if (window.__QUADRA_NOSAVE) return;
    try {
      localStorage.setItem(docKey(index.current), JSON.stringify({ v: 1, saved: Date.now(), cur: E.cur, pres: E.pres.toJSON() }));
      const en = curEntry();
      if (en) { en.name = E.pres.name; en.updated = Date.now(); if (!en.verAt) en.verAt = Date.now(); else if (Date.now() - en.verAt > 300000) snapshotVersion('Autosaved version'); }
      saveIndex(); setStatus('saved');
    } catch (e) { setStatus('error'); }
  }
  QUI.saveNow = saveNow;
  function scheduleSave() { setStatus('saving'); clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 400); }
  window.addEventListener('pagehide', saveNow);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveNow(); });

  // ================= theme (light / dark) =================
  function applyTheme(t) {
    document.documentElement.dataset.theme = t;
    $('themeBtn').querySelector('use').setAttribute('href', '#i-' + (t === 'dark' ? 'sun' : 'moon'));
    try { localStorage.setItem(THEME_KEY, t); } catch (e) { /* ignore */ }
  }
  const toggleTheme = () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');

  // ================= dialogs for features =================
  const SHORTCUTS = [
    ['Ctrl+M', 'New slide'], ['Ctrl+C / X / V', 'Copy, cut, paste shapes'], ['Ctrl+D', 'Duplicate shape (or slide when thumbnails are focused)'],
    ['Ctrl+Z / Ctrl+Y', 'Undo / redo'], ['Ctrl+A', 'Select all shapes on the slide'], ['Delete', 'Delete shape (or slide when thumbnails are focused)'],
    ['Arrow keys', 'Nudge selected shapes by 5 (Shift: 1)'], ['Enter / F2 / double-click', 'Edit text of the selected shape'], ['Typing', 'Starts editing the selected shape'],
    ['Esc', 'Leave text editing, then clear selection'], ['Shift+click', 'Add or remove a shape from the selection'], ['F5', 'Slide show from beginning'],
    ['Shift+F5', 'Slide show from current slide'], ['Space / → / ↓ / Enter', 'Slide show: next'], ['← / ↑ / Backspace', 'Slide show: previous'], ['Esc', 'Slide show: exit'],
  ];
  function shortcutsDialog() {
    showDialog({ title: 'Keyboard shortcuts', wide: true, body: '<table class="kbd-table">' + SHORTCUTS.map((s) => '<tr><td>' + esc(s[0]) + '</td><td>' + esc(s[1]) + '</td></tr>').join('') + '</table>' });
  }
  function helpDialog() {
    showDialog({ title: 'Help', body: '<p><b>Slides:</b> use the panel on the left to select, drag to reorder, right-click for more.</p><p><b>Shapes:</b> Insert → Shapes or Text Box; drag to move, use the handles to resize and rotate.</p><p><b>Text:</b> double-click a shape or just start typing while it is selected.</p><p><b>Slide show:</b> F5. <b>Export:</b> File → Export (PDF or PNG).</p><p>Your work is saved automatically in this browser.</p>' });
  }
  function whatsNewDialog() {
    showDialog({ title: 'What’s new', body: '<p><b>Version 1</b></p><ul><li>Ribbon with all ten tabs plus Draw</li><li>Shapes, text boxes, pictures and pen ink</li><li>Themes, layouts, 16:9 and 4:3 slide size</li><li>Fade transitions and entrance animations in the slide show</li><li>PDF and PNG export, autosave</li></ul>' });
  }
  function aboutDialog() { showDialog({ title: 'About', body: '<p><b>Quadra PowerPoint</b> — version 1</p><p>A browser based presentation editor. Everything stays on your device.</p>' }); }
  function footerDialog() {
    showDialog({
      title: 'Footer', body: '<label class="row"><input type="checkbox" id="ftNum"> Slide number</label><label class="row"><input type="checkbox" id="ftShow"> Show footer on all slides</label><label class="row">Text <input type="text" id="ftText" maxlength="120"></label>',
      buttons: [{ label: 'Cancel' }, { label: 'Apply to All', primary: true, run: (d) => {
        const show = d.querySelector('#ftShow').checked, text = d.querySelector('#ftText').value, numbers = d.querySelector('#ftNum').checked;
        E.mutate(() => { E.pres.footer = { show, text, numbers }; }, 'meta');
      } }],
    });
    $('ftShow').checked = E.pres.footer.show; $('ftText').value = E.pres.footer.text; $('ftNum').checked = !!E.pres.footer.numbers;
  }
  function accessibilityDialog() {
    const issues = E.pres.checkAccessibility();
    const body = el('div');
    if (!issues.length) body.innerHTML = '<p>' + ic('check') + ' No accessibility issues found.</p>';
    else {
      body.innerHTML = '<p>' + issues.length + ' issue' + (issues.length > 1 ? 's' : '') + ' found:</p>';
      const ul = el('ul', 'issues');
      issues.forEach((it) => { const li = el('li'); const a = el('button', 'sb-link'); a.textContent = it.msg; a.dataset.slide = it.slide; if (it.shapeId) a.dataset.shape = it.shapeId; li.appendChild(a); ul.appendChild(li); });
      ul.addEventListener('click', (ev) => {
        const li = ev.target.closest('li'); const a = li && li.querySelector('button'); if (!a) return;
        dlg.close(); E.selectSlide(Number(a.dataset.slide)); if (a.dataset.shape) E.select([a.dataset.shape]);
      });
      body.appendChild(ul);
    }
    const dlg = showDialog({ title: 'Accessibility check', body });
  }
  function animPaneDialog() {
    const s = E.slide();
    const label = (id) => { const sh = E.shape(id); if (!sh) return id; return sh.text ? sh.text.split('\n')[0].slice(0, 28) : sh.type; };
    const names = { appear: 'Appear', fade: 'Fade', flyin: 'Fly In' }, starts = { onclick: 'On Click', withprev: 'With Previous', afterprev: 'After Previous' };
    const rows = s.anims.map((a, i) => '<tr><td>' + (i + 1) + '</td><td>' + esc(label(a.shapeId)) + '</td><td>' + names[a.effect] + '</td><td>' + starts[a.start] + '</td></tr>').join('');
    showDialog({ title: 'Animation Pane', body: rows ? '<table class="kbd-table" id="animPaneTable">' + rows + '</table>' : '<p>This slide has no animations. Select a shape and pick an effect on the Animations tab.</p>' });
  }
  function zoomDialog() {
    const cur = E.zoom.mode === 'fit' ? 'fit' : String(E.zoomPercent());
    const opts = ['200', '150', '100', '75', '50', '25', 'fit'];
    showDialog({
      title: 'Zoom', body: opts.map((o) => '<label class="row"><input type="radio" name="zoomOpt" value="' + o + '"' + (o === cur ? ' checked' : '') + '> ' + (o === 'fit' ? 'Fit' : o + '%') + '</label>').join('') +
        '<label class="row">Percent <input type="number" id="zoomCustom" min="10" max="400" value="' + E.zoomPercent() + '"></label>',
      buttons: [{ label: 'Cancel' }, { label: 'OK', primary: true, run: (d) => {
        const r = d.querySelector('input[name=zoomOpt]:checked'); const custom = Number(d.querySelector('#zoomCustom').value);
        if (r && r.value === 'fit') E.setZoom('fit', 1); else if (r && Number(r.value) !== E.zoomPercent()) E.setZoom('custom', Number(r.value) / 100); else if (custom >= 10 && custom <= 400) E.setZoom('custom', custom / 100);
      } }],
    });
  }

  // find & replace
  let findState = { last: -1 };
  function findDialog(replace) {
    const d = showDialog({
      title: replace ? 'Replace' : 'Find', body: '<label class="row">Find <input type="text" id="findQ"></label>' +
        '<label class="row" id="replRow"' + (replace ? '' : ' hidden') + '>Replace with <input type="text" id="findR"></label><label class="row"><input type="checkbox" id="findCase"> Match case</label><p id="findStatus" class="find-status" style="color:var(--muted)"></p>',
      buttons: [{ label: 'Find Next', act: 'next', run: () => { findNext(); return false; } }, { label: 'Replace', act: 'replace', run: () => { doReplace(); return false; } },
        { label: 'Replace All', act: 'replaceAll', run: () => { doReplaceAll(); return false; } }, { label: 'Close', primary: true }],
    });
    if (!replace) d.el.querySelectorAll('[data-act="replace"],[data-act="replaceAll"]').forEach((b) => { b.hidden = true; });
    findState.last = -1; return d;
  }
  const fq = () => $('findQ').value, fcase = () => $('findCase').checked, fstat = (t) => { $('findStatus').textContent = t; };
  function findNext() {
    const hits = E.pres.findAll(fq(), fcase());
    if (!hits.length) { fstat('No matches found.'); findState.last = -1; return null; }
    findState.last = (findState.last + 1) % hits.length;
    const h = hits[findState.last];
    E.selectSlide(h.slide); E.select([h.shapeId]); fstat('Match ' + (findState.last + 1) + ' of ' + hits.length); return h;
  }
  function doReplace() {
    const hits = E.pres.findAll(fq(), fcase());
    if (!hits.length) { fstat('No matches found.'); return; }
    const k = Math.max(0, findState.last); const h = hits[Math.min(k, hits.length - 1)];
    E.selectSlide(h.slide);
    E.mutate(() => E.pres.replaceAt(h, $('findR').value));
    findState.last = k - 1; findNext();
    if (!E.pres.findAll(fq(), fcase()).length) fstat('Replaced. No more matches.');
  }
  function doReplaceAll() {
    let n = 0; E.mutate(() => { n = E.pres.replaceAll(fq(), $('findR').value, fcase()); });
    E.fullRender(); fstat(n ? 'Replaced ' + n + ' occurrence' + (n > 1 ? 's' : '') + '.' : 'No matches found.');
  }

  // pictures
  function loadPicture(file) {
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 1600, k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        let src = r.result;
        if (k < 1 || file.size > 1500000) {
          const c = el('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          src = c.toDataURL(/jpe?g/i.test(file.type) ? 'image/jpeg' : 'image/png', 0.85);
        }
        const sh = E.addPicture(src, img.naturalWidth * k, img.naturalHeight * k, file.name);
        if (sh) E.mutate(() => { E.pres.updateShape(E.cur, sh.id, { alt: '' }); });
      };
      img.onerror = () => showDialog({ title: 'Cannot insert picture', body: '<p>This file could not be read as an image.</p>' });
      img.src = r.result;
    };
    r.readAsDataURL(file);
  }
  $('filePicture').addEventListener('change', () => { const f = $('filePicture').files[0]; if (f) loadPicture(f); $('filePicture').value = ''; });

  // ================= export: PDF (print) and PNG =================
  function buildPrintRoot() {
    const root = $('printRoot'); root.textContent = '';
    E.pres.slides.forEach((s) => {
      const p = el('div', 'print-page'); p.style.height = E.pres.H + 'px';
      p.appendChild(E.renderSlide(E.pres, s, {})); root.appendChild(p);
    });
    let st = document.getElementById('pageStyle');
    if (!st) { st = el('style'); st.id = 'pageStyle'; document.head.appendChild(st); }
    st.textContent = '@page { size: ' + Q.SIZES[E.pres.size].page + '; margin: 0; }';
  }
  QUI.buildPrintRoot = buildPrintRoot;
  window.addEventListener('beforeprint', () => { E.stopEdit(); buildPrintRoot(); });
  window.addEventListener('afterprint', () => { $('printRoot').textContent = ''; });
  function printDeck() { E.stopEdit(); buildPrintRoot(); setTimeout(() => window.print(), 50); }
  function slideCss() {
    let css = '';
    Array.from(document.styleSheets).forEach((sh) => {
      let rules; try { rules = sh.cssRules; } catch (e) { return; }
      Array.from(rules).forEach((r) => { if (r.selectorText && r.selectorText.indexOf('.sl-') >= 0 && r.selectorText.indexOf('.stage') < 0) css += r.cssText + '\n'; });
    });
    return css;
  }
  function pngDataUrl(i, scale) {
    scale = scale || 1;
    const pres = E.pres, W = pres.W, H = pres.H;
    const node = E.renderSlide(pres, pres.slides[i], {});
    const xml = new XMLSerializer().serializeToString(node);
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '"><foreignObject x="0" y="0" width="' + W + '" height="' + H + '">' +
      '<style xmlns="http://www.w3.org/1999/xhtml">' + slideCss().replace(/</g, '&lt;') + '</style>' + xml + '</foreignObject></svg>';
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const c = el('canvas'); c.width = Math.round(W * scale); c.height = Math.round(H * scale);
        const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, c.width, c.height);
        try { resolve(c.toDataURL('image/png')); } catch (e) { reject(e); }
      };
      img.onerror = () => reject(new Error('render failed'));
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
  }
  QUI.pngDataUrl = pngDataUrl;
  async function exportPng(all) {
    E.stopEdit();
    const list = all ? E.pres.slides.map((s, i) => i) : [E.cur];
    for (let k = 0; k < list.length; k++) {
      try { const u = await pngDataUrl(list[k]); download(u, baseName() + '-slide-' + (list[k] + 1) + '.png'); }
      catch (e) { showDialog({ title: 'Export failed', body: '<p>Slide ' + (list[k] + 1) + ' could not be exported.</p>' }); return; }
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  // ================= slide show =================
  let show = null;
  function playGroup(layer, group) {
    Q.groupTimeline(group).forEach((t) => {
      const d = layer.querySelector('[data-sid="' + t.entry.shapeId + '"]'); if (!d) return;
      d.style.visibility = 'visible'; delete d.dataset.hidden;
      const rot = d.style.transform || '';
      let kf; const a = t.entry;
      if (a.effect === 'fade') kf = [{ opacity: 0 }, { opacity: 1 }];
      else if (a.effect === 'flyin') {
        const sh = E.pres.slides[show ? show.state.i : E.cur].shapes.find((x) => x.id === a.shapeId) || { x: 0, y: 0, w: 0, h: 0 };
        const dx = a.dir === 'left' ? -(sh.x + sh.w + 20) : a.dir === 'right' ? E.pres.W - sh.x + 20 : 0;
        const dy = a.dir === 'top' ? -(sh.y + sh.h + 20) : a.dir === 'bottom' ? E.pres.H - sh.y + 20 : 0;
        kf = [{ transform: 'translate(' + dx + 'px,' + dy + 'px) ' + rot }, { transform: rot || 'none' }];
      } else kf = [{ opacity: 0 }, { opacity: 1 }];
      const dur = a.effect === 'appear' ? 1 : Math.max(1, t.dur * 1000);
      if (d.animate) d.animate(kf, { duration: dur, delay: t.at * 1000, fill: 'backwards', easing: 'ease-out' });
    });
  }
  function startShow(from) {
    if (E.showActive) return;
    E.stopEdit(); closeMenus();
    const root = $('showRoot'); root.hidden = false; root.textContent = '';
    E.showActive = true;
    const state = new Q.ShowState(E.pres, from);
    show = { state, layer: null, usedFs: false, endShown: false };
    const scale = () => Math.min(window.innerWidth / E.pres.W, window.innerHeight / E.pres.H);
    const place = (layer) => { const s = scale(); layer.style.width = E.pres.W + 'px'; layer.style.height = E.pres.H + 'px'; layer.style.transform = 'translate(' + (-E.pres.W * s / 2) + 'px,' + (-E.pres.H * s / 2) + 'px) scale(' + s + ')'; };
    function mount(fade) {
      const layer = el('div', 'show-layer'); layer.dataset.slideIndex = state.i;
      layer.appendChild(E.renderSlide(E.pres, E.pres.slides[state.i], { hidden: new Set(state.hiddenIds().concat(state.auto.map((a) => a.shapeId))) }));
      place(layer); root.appendChild(layer);
      const old = show.layer; show.layer = layer;
      if (fade > 0 && layer.animate) {
        layer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: fade, easing: 'ease-in-out' });
        setTimeout(() => { if (old) old.remove(); }, fade + 20);
      } else if (old) old.remove();
      if (state.auto.length) playGroup(layer, { entries: state.auto });
    }
    function clearEnd() { const e = root.querySelector('.show-end'); if (e) e.remove(); show.endShown = false; }
    function next() {
      if (show.endShown) { stopShow(); return; }
      const r = state.next();
      if (r.kind === 'anim') playGroup(show.layer, r.group);
      else if (r.kind === 'slide') { const t = r.transition; mount(t && ['fade', 'push', 'wipe'].indexOf(t.type) >= 0 ? t.dur * 1000 : 0); }
      else if (r.kind === 'end') { const e = el('div', 'show-end'); e.textContent = 'End of slide show, click to exit.'; root.appendChild(e); show.endShown = true; }
    }
    function prev() {
      if (show.endShown) { clearEnd(); return; }
      const r = state.prev();
      if (r.kind === 'unanim') r.group.entries.forEach((a) => { const d = show.layer.querySelector('[data-sid="' + a.shapeId + '"]'); if (d) { d.style.visibility = 'hidden'; d.dataset.hidden = '1'; } });
      else if (r.kind === 'slide') mount(0);
    }
    function onKey(ev) {
      const k = ev.key;
      if (k === 'Escape') stopShow();
      else if (['ArrowRight', 'ArrowDown', ' ', 'Enter', 'PageDown', 'n', 'N'].indexOf(k) >= 0) next();
      else if (['ArrowLeft', 'ArrowUp', 'Backspace', 'PageUp', 'p', 'P'].indexOf(k) >= 0) prev();
      else if (k === 'Home') { clearEnd(); state.i = 0; state.g = 0; state._enter(false); mount(0); }
      else if (k === 'End') { clearEnd(); state.i = E.pres.slides.length - 1; state._enter(true); mount(0); }
      else return;
      ev.preventDefault(); ev.stopPropagation();
    }
    show.onKey = onKey; show.onClick = (ev) => {
      if (ev.target.closest('video,audio')) return;
      const l = ev.target.closest('[data-link]');
      if (l) {
        if (l.dataset.link === 'url') { window.open(l.dataset.linkTarget, '_blank', 'noopener,noreferrer'); return; }
        if (l.dataset.link === 'slide') { clearEnd(); state.i = Number(l.dataset.linkTarget); state.g = 0; state._enter(false); mount(0); return; }
      }
      next();
    }; show.onCtx = (ev) => { ev.preventDefault(); prev(); };
    show.onResize = () => { if (show.layer) place(show.layer); };
    show.onFs = () => { if (show.usedFs && !document.fullscreenElement) stopShow(); };
    document.addEventListener('keydown', onKey, true); root.addEventListener('click', show.onClick); root.addEventListener('contextmenu', show.onCtx);
    window.addEventListener('resize', show.onResize); document.addEventListener('fullscreenchange', show.onFs);
    mount(0);
    if (root.requestFullscreen) root.requestFullscreen().then(() => { if (show) show.usedFs = document.fullscreenElement === root; else if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {}); /* show was closed before fullscreen finished */ }).catch(() => { /* fullscreen not allowed: stay in the page */ });
  }
  function stopShow() {
    if (!show) return;
    const root = $('showRoot'), s = show; show = null;
    document.removeEventListener('keydown', s.onKey, true); root.removeEventListener('click', s.onClick); root.removeEventListener('contextmenu', s.onCtx);
    window.removeEventListener('resize', s.onResize); document.removeEventListener('fullscreenchange', s.onFs);
    root.hidden = true; root.textContent = ''; E.showActive = false;
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    E.selectSlide(s.state.i, true);
  }
  QUI.startShow = startShow; QUI.stopShow = stopShow; QUI.showState = () => (show ? show.state : null);
  document.addEventListener('keydown', (ev) => {
    if (E.showActive) return;
    if (ev.key === 'F5') { ev.preventDefault(); startShow(ev.shiftKey ? E.cur : 0); }
  });

  // transition / animation previews on the canvas
  function previewTransition() {
    const t = E.slide().transition; if (t.type === 'none' || t.type === 'cut') return;
    const s = $('stage'); if (s.animate) s.animate([{ opacity: 0 }, { opacity: 1 }], { duration: t.dur * 1000, easing: 'ease-in-out' });
  }
  function previewAnimations() {
    const slide = E.slide(); const groups = Q.animGroups(slide); if (!groups.length) return;
    E.select([]);
    const sl = $('stage').querySelector('.sl-slide'); if (!sl) return;
    slide.anims.forEach((a) => { const d = sl.querySelector('[data-sid="' + a.shapeId + '"]'); if (d) d.style.visibility = 'hidden'; });
    let delay = 300;
    groups.forEach((g) => {
      const tl = Q.groupTimeline(g); let end = 0;
      setTimeout(() => playGroup(sl, g), delay);
      tl.forEach((t) => { end = Math.max(end, t.at + t.dur); });
      delay += end * 1000 + 400;
    });
    setTimeout(() => E.renderCanvas(), delay + 200);
  }

  // ================= documents library, versions, share =================
  const INDEX_KEY = 'quadra-ppt:index', VER_PREFIX = 'quadra-ppt:ver:';
  let index = { current: 'v1', docs: [], folders: ['Documents', 'Drafts', 'Archive'] };
  const docKey = (id) => 'quadra-ppt:doc:' + id;
  const entry = (id) => index.docs.find((d) => d.id === id);
  function loadIndex() {
    try { const i = JSON.parse(localStorage.getItem(INDEX_KEY)); if (i && Array.isArray(i.docs)) index = Object.assign(index, i); } catch (e) { /* ignore */ }
    if (!entry(index.current)) index.docs.push({ id: index.current, name: 'Presentation', folder: index.folders[0], updated: Date.now() });
    if (!Array.isArray(index.folders) || !index.folders.length) index.folders = ['Documents', 'Drafts', 'Archive'];
  }
  function saveIndex() { if (window.__QUADRA_NOSAVE) return; try { localStorage.setItem(INDEX_KEY, JSON.stringify(index)); } catch (e) { /* ignore */ } }
  const curEntry = () => entry(index.current);
  const newId = () => 'd' + Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36);
  const readDoc = (id) => { try { const d = JSON.parse(localStorage.getItem(docKey(id))); if (d && d.pres && Array.isArray(d.pres.slides)) return d; } catch (e) { /* ignore */ } return null; };

  function versions(id) { try { const v = JSON.parse(localStorage.getItem(VER_PREFIX + id)); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
  function snapshotVersion(label) {
    const id = index.current; const list = versions(id);
    list.unshift({ t: Date.now(), label: label || 'Autosaved version', slides: E.pres.slides.length, data: JSON.stringify(E.pres.toJSON()) });
    while (list.length > 8) list.pop();
    for (;;) { try { localStorage.setItem(VER_PREFIX + id, JSON.stringify(list)); break; } catch (e) { if (list.length <= 1) return false; list.pop(); } }
    const en = curEntry(); if (en) { en.verAt = Date.now(); saveIndex(); }
    return true;
  }
  function versionDialog() {
    const body = el('div');
    const draw = () => {
      const list = versions(index.current);
      body.innerHTML = '<p>Versions are kept in this browser (latest 8).</p>' + (list.length ? '<table class="kbd-table" id="versionTable">' + list.map((v, k) => '<tr><td>' + esc(new Date(v.t).toLocaleString()) + '</td><td>' + esc(v.label) + ' · ' + v.slides + ' slide' + (v.slides === 1 ? '' : 's') + '</td><td><button class="btn" data-restore="' + k + '">Restore</button></td></tr>').join('') + '</table>' : '<p id="versionEmpty">No saved versions yet.</p>');
    };
    draw();
    body.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-restore]'); if (!b) return;
      const v = versions(index.current)[Number(b.dataset.restore)]; if (!v) return;
      snapshotVersion('Before restore');
      const keep = E.pres.name; const p = Q.Presentation.fromJSON(v.data); p.name = keep;
      E.replacePresentation(p); saveNow(); syncTitle(); dlg.close();
    });
    const dlg = showDialog({ title: 'Version history', wide: true, body, buttons: [{ label: 'Save a version now', act: 'saveVersion', run: () => { snapshotVersion('Saved manually'); draw(); return false; } }, { label: 'Close', primary: true }] });
  }

  function switchTo(id, makeNew) {
    saveNow();
    if (makeNew) {
      const nid = newId(); index.docs.push({ id: nid, name: makeNew.name, folder: (curEntry() || {}).folder || index.folders[0], updated: Date.now() });
      index.current = nid; E.replacePresentation(makeNew.pres);
    } else {
      const d = readDoc(id); if (!d) { showDialog({ title: 'Cannot open', body: '<p>This presentation could not be read.</p>' }); return; }
      index.current = id; E.replacePresentation(Q.Presentation.fromJSON(d.pres));
      if (d.cur > 0) E.selectSlide(Math.min(d.cur, E.pres.slides.length - 1), true);
    }
    saveIndex(); saveNow(); syncTitle();
  }
  function newPresentation() { const p = Q.Presentation.blank(); switchTo(null, { name: p.name, pres: p }); }
  function openFromList() {
    const body = el('div');
    const draw = () => {
      const rows = index.docs.slice().sort((a, b) => (b.updated || 0) - (a.updated || 0));
      body.innerHTML = '<table class="kbd-table" id="docTable">' + rows.map((d) => '<tr data-doc="' + esc(d.id) + '"><td>' + esc(d.name) + (d.id === index.current ? ' (open)' : '') + '</td><td>' + esc(d.folder || '') + '</td><td>' + esc(new Date(d.updated || 0).toLocaleString()) + '</td><td><button class="btn" data-open="' + esc(d.id) + '"' + (d.id === index.current ? ' disabled' : '') + '>Open</button> <button class="btn" data-del="' + esc(d.id) + '"' + (d.id === index.current ? ' disabled' : '') + '>Delete</button></td></tr>').join('') + '</table>';
    };
    draw();
    body.addEventListener('click', (ev) => {
      const o = ev.target.closest('[data-open]'), d = ev.target.closest('[data-del]');
      if (o && !o.disabled) { dlg.close(); switchTo(o.dataset.open); }
      else if (d && !d.disabled) {
        const id = d.dataset.del; index.docs = index.docs.filter((x) => x.id !== id);
        try { localStorage.removeItem(docKey(id)); localStorage.removeItem(VER_PREFIX + id); } catch (e) { /* ignore */ }
        saveIndex(); draw();
      }
    });
    const dlg = showDialog({ title: 'My presentations', wide: true, body, buttons: [{ label: 'Close', primary: true }] });
  }
  function moveDialog() {
    const en = curEntry();
    showDialog({
      title: 'Move file', body: '<label class="row">Folder <select id="moveFolder">' + index.folders.map((f) => '<option' + (f === en.folder ? ' selected' : '') + '>' + esc(f) + '</option>').join('') + '<option value="__new">New folder…</option></select></label><label class="row" id="moveNewRow" hidden>Name <input type="text" id="moveNew" maxlength="40"></label>',
      buttons: [{ label: 'Cancel' }, { label: 'Move', primary: true, run: (d) => {
        let f = d.querySelector('#moveFolder').value;
        if (f === '__new') { f = d.querySelector('#moveNew').value.trim(); if (!f) return false; if (index.folders.indexOf(f) < 0) index.folders.push(f); }
        en.folder = f; saveIndex();
      } }],
    });
    $('moveFolder').addEventListener('change', () => { $('moveNewRow').hidden = $('moveFolder').value !== '__new'; });
  }
  function saveCopy() {
    const copy = Q.Presentation.fromJSON(E.pres.toJSON()); copy.name = E.pres.name + ' - Copy';
    const id = newId();
    try { localStorage.setItem(docKey(id), JSON.stringify({ v: 1, saved: Date.now(), cur: 0, pres: copy.toJSON() })); }
    catch (e) { showDialog({ title: 'Cannot save a copy', body: '<p>The browser storage is full.</p>' }); return; }
    index.docs.push({ id, name: copy.name, folder: (curEntry() || {}).folder || index.folders[0], updated: Date.now() }); saveIndex();
    toast('Copy saved in My presentations');
  }
  function copyText(text) {
    const fallback = () => { const t = el('textarea'); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch (e) { /* ignore */ } t.remove(); };
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).catch(fallback);
    fallback(); return Promise.resolve();
  }
  const mailtoUrl = () => 'mailto:?subject=' + encodeURIComponent(E.pres.name) + '&body=' + encodeURIComponent('Presentation: ' + E.pres.name + '\n\n' + E.pres.outlineText().slice(0, 1500));
  QUI.mailtoUrl = mailtoUrl;
  function shareMenuItems() {
    return [
      { label: 'Share a copy…', icon: 'f-share', id: 'share-system', run: async () => {
        const file = new File([JSON.stringify(E.pres.toJSON())], baseName() + '.json', { type: 'application/json' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: E.pres.name }); } catch (e) { /* cancelled */ } }
        else showDialog({ title: 'Share a copy', body: '<p>This browser has no system share sheet. Use <b>Email a copy</b>, <b>Copy outline</b> or <b>File → Create a copy</b> to send the file.</p>' });
      } },
      { label: 'Email a copy…', icon: 'comment', id: 'share-mail', run: () => { const a = el('a'); a.href = mailtoUrl(); document.body.appendChild(a); a.click(); a.remove(); } },
      { label: 'Copy outline to clipboard', icon: 'f-copy', id: 'share-outline', run: () => copyText(E.pres.outlineText()).then(() => toast('Outline copied')) },
      { label: 'Download a copy (.json)', icon: 'f-export', id: 'share-json', run: downloadJson },
    ];
  }

  // ================= Home extras: dictation, add-ins, designer =================
  let rec = null, dictLang = (navigator.language && /^(en|hi)/i.test(navigator.language)) ? navigator.language : 'en-US';
  function toggleDictation() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { showDialog({ title: 'Dictate', body: '<p>This browser does not support speech recognition. Use Chrome or Edge.</p>' }); return; }
    if (rec) { rec.stop(); return; }
    const r = new SR(); rec = r; r.lang = dictLang; r.continuous = true; r.interimResults = false;
    r.onresult = (ev) => {
      for (let k = ev.resultIndex; k < ev.results.length; k++) {
        if (!ev.results[k].isFinal) continue;
        const t = ev.results[k][0].transcript.trim(); if (!t) continue;
        const sh = E.selShapes()[0]; const has = sh && sh.text && !E.editing;
        E.insertText((has ? ' ' : '') + t);
      }
    };
    r.onend = () => { if (rec === r) rec = null; scheduleRefresh(); };
    r.onerror = (e) => { if (rec === r) rec = null; scheduleRefresh(); if (e.error !== 'no-speech' && e.error !== 'aborted') showDialog({ title: 'Dictate', body: '<p>Speech recognition stopped: ' + esc(e.error) + '. Check the microphone permission.</p>' }); };
    try { r.start(); } catch (e) { rec = null; }
    scheduleRefresh();
  }
  QUI.dictating = () => !!rec;
  const LOREM = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.';
  function wordCountDialog() {
    const c = E.pres.wordCount();
    showDialog({ title: 'Word Count', body: '<table class="kbd-table" id="wordTable"><tr><td>Slides</td><td>' + c.slides + '</td></tr><tr><td>Words</td><td>' + c.words + '</td></tr><tr><td>Characters (no spaces)</td><td>' + c.chars + '</td></tr></table>' });
  }
  function agendaSlide() {
    const titles = E.pres.slides.map((s, i) => { const t = s.shapes.find((x) => x.ph === 'title'); return (t && t.text.trim()) || ''; }).filter(Boolean);
    if (!titles.length) { showDialog({ title: 'Agenda slide', body: '<p>Add titles to your slides first, then the agenda can list them.</p>' }); return; }
    E.newSlide('titleContent');
    E.mutate(() => { const sl = E.slide(); sl.shapes[0].text = 'Agenda'; sl.shapes[1].text = titles.join('\n'); });
    E.fullRender();
  }
  function addinsMenu(b) {
    openMenu(b, [
      { head: 'Built-in add-ins', icon: 'addins' },
      { label: 'Word Count', id: 'addin-words', run: wordCountDialog },
      { label: 'Slide Numbers', id: 'addin-numbers', check: E.pres.footer.numbers ? undefined : false, run: () => E.mutate(() => { E.pres.footer.numbers = !E.pres.footer.numbers; }, 'meta') },
      { label: 'Agenda Slide', id: 'addin-agenda', run: agendaSlide },
      { label: 'Lorem Ipsum Text', id: 'addin-lorem', run: () => E.insertText(LOREM) },
      { label: 'Today’s Date', id: 'addin-date', run: () => E.insertText(new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })) },
    ]);
  }
  const DESIGN_IDEAS = [['plain', 0], ['parchment', 0], ['prism', 0], ['midnight', 0], ['slate', 0], ['ivory', 0], ['nebula', 0], ['plain', 2]];
  function designerDialog() {
    const body = el('div'); body.style.cssText = 'display:grid;grid-template-columns:repeat(2,1fr);gap:10px';
    DESIGN_IDEAS.forEach((idea, k) => {
      const p = Q.Presentation.fromJSON(E.pres.toJSON()); p.setTheme(idea[0], idea[1]);
      const card = el('button', 'btn'); card.type = 'button'; card.dataset.idea = k; card.style.cssText = 'height:auto;padding:6px;text-align:left';
      const w = 250, inner = el('div'); inner.style.cssText = 'width:' + w + 'px;height:' + Math.round(w * p.H / p.W) + 'px;overflow:hidden;position:relative';
      const sl = E.renderSlide(p, p.slides[E.cur], { prompts: true }); sl.style.transform = 'scale(' + (w / p.W) + ')'; inner.appendChild(sl);
      const lab = el('div'); lab.textContent = Q.THEMES.find((t) => t.id === idea[0]).name + (idea[1] ? ' · ' + Q.VARIANTS[idea[1]].name : ''); lab.style.marginTop = '4px';
      card.appendChild(inner); card.appendChild(lab); body.appendChild(card);
    });
    body.addEventListener('click', (ev) => {
      const c = ev.target.closest('[data-idea]'); if (!c) return; const idea = DESIGN_IDEAS[Number(c.dataset.idea)];
      E.mutate(() => E.pres.setTheme(idea[0], idea[1]), 'all'); dlg.close();
    });
    const dlg = showDialog({ title: 'Design Ideas', wide: true, body, buttons: [{ label: 'Close', primary: true }] });
  }
  function pasteText() {
    const done = (t) => { if (t) E.insertText(t); else toast('Clipboard has no text'); };
    if (navigator.clipboard && navigator.clipboard.readText) navigator.clipboard.readText().then(done).catch(() => showDialog({ title: 'Paste', body: '<p>The browser did not allow reading the clipboard. Allow clipboard access and try again.</p>' }));
    else showDialog({ title: 'Paste', body: '<p>This browser cannot read the clipboard from a button. Use Ctrl+V while editing text.</p>' });
  }

  // ================= Insert extras =================
  function tableMenu(b) {
    const node = el('div'); node.style.padding = '8px';
    const info = el('div'); info.textContent = 'Insert Table'; info.style.cssText = 'margin-bottom:6px;color:var(--muted)';
    const grid = el('div', 'tgrid'); grid.id = 'tableGrid';
    for (let r = 0; r < 6; r++) for (let c = 0; c < 8; c++) { const cell = el('button', 'tcell'); cell.type = 'button'; cell.dataset.r = r; cell.dataset.c = c; cell.setAttribute('aria-label', (r + 1) + ' x ' + (c + 1)); grid.appendChild(cell); }
    grid.addEventListener('mouseover', (ev) => {
      const t = ev.target.closest('.tcell'); if (!t) return; const hr = Number(t.dataset.r), hc = Number(t.dataset.c);
      grid.querySelectorAll('.tcell').forEach((x) => x.classList.toggle('on', Number(x.dataset.r) <= hr && Number(x.dataset.c) <= hc)); info.textContent = (hr + 1) + ' × ' + (hc + 1) + ' table';
    });
    grid.addEventListener('click', (ev) => { const t = ev.target.closest('.tcell'); if (!t) return; closeMenus(); E.addTable(Number(t.dataset.r) + 1, Number(t.dataset.c) + 1); });
    node.appendChild(info); node.appendChild(grid);
    openMenu(b, [{ node }, { sep: true }, { label: 'Insert Table…', id: 'table-dialog', run: tableDialog }]);
  }
  function tableDialog() {
    showDialog({ title: 'Insert Table', body: '<label class="row">Columns <input type="number" id="tblCols" min="1" max="12" value="3"></label><label class="row">Rows <input type="number" id="tblRows" min="1" max="20" value="3"></label>',
      buttons: [{ label: 'Cancel' }, { label: 'OK', primary: true, run: (d) => { E.addTable(Q.clamp(Number(d.querySelector('#tblRows').value) || 3, 1, 20), Q.clamp(Number(d.querySelector('#tblCols').value) || 3, 1, 12)); } }] });
  }
  let camStream = null;
  function cameoDialog() {
    const body = el('div'); body.innerHTML = '<video id="cameoVideo" autoplay playsinline muted style="width:100%;border-radius:6px;background:#000;min-height:180px"></video><p id="cameoMsg" style="color:var(--muted)">Starting camera…</p>';
    const stop = () => { if (camStream) { camStream.getTracks().forEach((t) => t.stop()); camStream = null; } };
    const dlg = showDialog({ title: 'Cameo (camera)', body, buttons: [{ label: 'Cancel', run: () => { stop(); } }, { label: 'Take Photo', primary: true, act: 'cameoCapture', run: () => {
      const v = $('cameoVideo'); if (!camStream || !v.videoWidth) return false;
      const c = el('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext('2d').drawImage(v, 0, 0);
      const src = c.toDataURL('image/jpeg', 0.85); stop(); E.addPicture(src, c.width, c.height, 'camera.jpg');
    } }] });
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { $('cameoMsg').textContent = 'This browser cannot access a camera.'; return dlg; }
    navigator.mediaDevices.getUserMedia({ video: true }).then((s) => {
      if (!document.body.contains(body)) { s.getTracks().forEach((t) => t.stop()); return; }
      camStream = s; const v = $('cameoVideo'); v.srcObject = s; $('cameoMsg').textContent = 'Smile! Click Take Photo to place the picture on the slide.';
    }).catch((e) => { $('cameoMsg').textContent = 'Camera not available: ' + e.name + '. Allow the camera permission and try again.'; });
    const obs = new MutationObserver(() => { if (!document.body.contains(body)) { stop(); obs.disconnect(); } }); obs.observe(overlay, { childList: true });
    return dlg;
  }
  function mediaFromFile(kind, file) {
    if (file.size > 3 * 1024 * 1024) { showDialog({ title: 'File too large', body: '<p>Files embedded in the presentation are limited to 3 MB because they are stored in the browser. Use <b>From URL</b> for bigger ' + kind + ' files.</p>' }); return; }
    const r = new FileReader(); r.onload = () => E.addShape(kind, { src: r.result, name: file.name }); r.readAsDataURL(file);
  }
  $('fileVideo').addEventListener('change', () => { const f = $('fileVideo').files[0]; if (f) mediaFromFile('video', f); $('fileVideo').value = ''; });
  $('fileAudio').addEventListener('change', () => { const f = $('fileAudio').files[0]; if (f) mediaFromFile('audio', f); $('fileAudio').value = ''; });
  function mediaUrlDialog(kind) {
    showDialog({ title: 'Insert ' + kind + ' from URL', body: '<label class="row">URL <input type="text" id="mediaUrl" placeholder="https://…"></label><p id="mediaErr" style="color:var(--ic-red)"></p>',
      buttons: [{ label: 'Cancel' }, { label: 'Insert', primary: true, run: (d) => {
        const u = Q.safeUrl(d.querySelector('#mediaUrl').value);
        if (!u || !/^https?:/i.test(u)) { d.querySelector('#mediaErr').textContent = 'Enter a valid http(s) address.'; return false; }
        E.addShape(kind, { src: u, name: u });
      } }] });
  }
  function mediaMenu(b, kind) {
    openMenu(b, [{ label: 'This Device…', icon: kind, id: kind + '-device', run: () => $(kind === 'video' ? 'fileVideo' : 'fileAudio').click() }, { label: 'From URL…', icon: 'link', id: kind + '-url', run: () => mediaUrlDialog(kind) }]);
  }
  function stockDialog() {
    const body = el('div'); body.id = 'stockGrid'; body.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:8px';
    Q.STOCK.forEach((s) => {
      const b = el('button', 'btn'); b.type = 'button'; b.dataset.stock = s.id; b.style.cssText = 'height:auto;padding:4px;text-align:center';
      b.innerHTML = '<img alt="" style="width:100%;display:block;border-radius:4px" src="' + Q.svgUrl(s.svg) + '"><div style="margin-top:2px">' + esc(s.name) + '</div>'; body.appendChild(b);
    });
    body.addEventListener('click', (ev) => { const b = ev.target.closest('[data-stock]'); if (!b) return; const s = Q.STOCK.find((x) => x.id === b.dataset.stock); dlg.close(); const sh = E.addPicture(Q.svgUrl(s.svg), 640, 400, s.name + '.svg'); if (sh) E.mutate(() => { E.pres.updateShape(E.cur, sh.id, { alt: s.name }); }); });
    const dlg = showDialog({ title: 'Stock Images', wide: true, body, buttons: [{ label: 'Close', primary: true }] });
  }
  const ICON_COLORS = { Original: null, Black: '#242424', Blue: '#0f6cbd', Green: '#107c10', Orange: '#d83b01', Red: '#c4314b', White: '#ffffff' };
  function iconSvg(name, color) {
    const sym = document.getElementById('i-' + name); if (!sym) return null;
    let inner = sym.innerHTML.replace(/var\(--ic-[a-z]+,(#[0-9a-fA-F]{3,6})\)/g, color ? color : '$1').replace(/currentColor/g, color || '#242424');
    inner = inner.replace(/&nbsp;/g, ' ');
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="256" height="256" fill="none" stroke="' + (color || '#242424') + '" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';
  }
  function iconsDialog() {
    const names = Array.from(document.querySelectorAll('symbol')).filter((s) => s.getAttribute('viewBox') === '0 0 24 24').map((s) => s.id.slice(2)).filter((n) => n !== 'logo');
    const body = el('div');
    body.innerHTML = '<div class="row" style="display:flex;gap:8px;margin-bottom:8px"><input type="text" id="iconSearch" placeholder="Search icons"><select id="iconColor">' + Object.keys(ICON_COLORS).map((k) => '<option>' + k + '</option>').join('') + '</select></div><div id="iconGrid" style="display:grid;grid-template-columns:repeat(8,1fr);gap:4px;max-height:300px;overflow:auto"></div>';
    const grid = body.querySelector('#iconGrid');
    const draw = () => {
      const q = body.querySelector('#iconSearch').value.trim().toLowerCase(); grid.textContent = '';
      names.filter((n) => !q || n.indexOf(q) >= 0).forEach((n) => { const b = el('button', 'btn'); b.type = 'button'; b.dataset.icon = n; b.title = n; b.style.cssText = 'min-width:0;height:44px;padding:0;display:grid;place-items:center'; b.innerHTML = '<svg style="width:26px;height:26px"><use href="#i-' + n + '"/></svg>'; grid.appendChild(b); });
    };
    draw(); body.querySelector('#iconSearch').addEventListener('input', draw);
    grid.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-icon]'); if (!b) return; const svg = iconSvg(b.dataset.icon, ICON_COLORS[body.querySelector('#iconColor').value]); if (!svg) return;
      dlg.close(); const sh = E.addPicture(Q.svgUrl(svg), 160, 160, b.dataset.icon + '.svg'); if (sh) E.mutate(() => { E.pres.updateShape(E.cur, sh.id, { alt: b.dataset.icon + ' icon' }); });
    });
    const dlg = showDialog({ title: 'Icons', wide: true, body, buttons: [{ label: 'Close', primary: true }] });
  }
  function smartArtDialog() {
    showDialog({ title: 'SmartArt', body: '<label class="row">Layout <select id="saKind"><option value="list">Basic List</option><option value="process">Process</option><option value="cycle">Cycle</option></select></label><label class="row" style="align-items:flex-start">Items <textarea id="saItems" rows="6" style="flex:1;border:1px solid var(--muted);border-radius:4px;background:var(--panel);color:var(--text);padding:6px;font:inherit">First step\nSecond step\nThird step</textarea></label><p style="color:var(--muted)">One item per line (up to 8). The result is made of normal shapes you can edit.</p>',
      buttons: [{ label: 'Cancel' }, { label: 'Insert', primary: true, act: 'smartInsert', run: (d) => {
        const items = d.querySelector('#saItems').value.split('\n').map((x) => x.trim()).filter(Boolean);
        if (!items.length) return false; let ids = [];
        E.mutate(() => { ids = E.pres.addSmartArt(E.cur, d.querySelector('#saKind').value, items); }); E.select(ids);
      } }] });
  }
  function chartDialog(id, kind) {
    const ex = id ? E.shape(id) : null, c = ex ? ex.chart : { kind: kind || 'bar', title: '', labels: ['Q1', 'Q2', 'Q3', 'Q4'], values: [4, 7, 3, 6] };
    showDialog({ title: ex ? 'Edit chart data' : 'Insert Chart', body: '<label class="row">Type <select id="chKind"><option value="bar">Column</option><option value="line">Line</option><option value="pie">Pie</option></select></label><label class="row">Title <input type="text" id="chTitle" maxlength="60"></label><label class="row" style="align-items:flex-start">Data <textarea id="chData" rows="7" style="flex:1;border:1px solid var(--muted);border-radius:4px;background:var(--panel);color:var(--text);padding:6px;font:inherit"></textarea></label><p style="color:var(--muted)">One row per line: label, value</p><p id="chErr" style="color:var(--ic-red)"></p>',
      buttons: [{ label: 'Cancel' }, { label: ex ? 'Update' : 'Insert', primary: true, act: 'chartOk', run: (d) => {
        const labels = [], values = [];
        d.querySelector('#chData').value.split('\n').forEach((ln) => { const m = /^(.*?)[,\t;]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(ln.trim()); if (m) { labels.push(m[1].trim() || '·'); values.push(Number(m[2])); } });
        if (!labels.length) { d.querySelector('#chErr').textContent = 'Enter at least one row like: Q1, 4'; return false; }
        const chart = { kind: d.querySelector('#chKind').value, title: d.querySelector('#chTitle').value.trim(), labels, values };
        if (ex) E.mutate(() => E.pres.updateShape(E.cur, ex.id, { chart: Object.assign({}, ex.chart, chart) })); else E.addShape('chart', { chart });
      } }] });
    $('chKind').value = c.kind; $('chTitle').value = c.title; $('chData').value = c.labels.map((l, k) => l + ', ' + c.values[k]).join('\n');
  }
  E.on('editchart', (id) => chartDialog(id));
  function chartMenu(b) { openMenu(b, [['bar', 'Column Chart'], ['line', 'Line Chart'], ['pie', 'Pie Chart']].map((x) => ({ label: x[1], id: 'chart-' + x[0], icon: 'chart', run: () => chartDialog(null, x[0]) }))); }
  function linkDialog() {
    const sh = E.selShapes()[0], cur = sh && sh.link;
    const opts = E.pres.slides.map((s, i) => '<option value="' + i + '"' + (cur && cur.type === 'slide' && cur.index === i ? ' selected' : '') + '>Slide ' + (i + 1) + '</option>').join('');
    showDialog({ title: 'Insert Link', body: (sh ? '' : '<label class="row">Text to display <input type="text" id="lnkText" value="Link"></label>') +
      '<label class="row"><input type="radio" name="lnkType" value="url"' + (!cur || cur.type === 'url' ? ' checked' : '') + '> Web address <input type="text" id="lnkUrl" placeholder="https://…" value="' + esc(cur && cur.type === 'url' ? cur.url : '') + '"></label>' +
      '<label class="row"><input type="radio" name="lnkType" value="slide"' + (cur && cur.type === 'slide' ? ' checked' : '') + '> Place in this presentation <select id="lnkSlide">' + opts + '</select></label><p id="lnkErr" style="color:var(--ic-red)"></p><p style="color:var(--muted)">Links work in the slide show.</p>',
      buttons: [{ label: 'Cancel' }].concat(cur ? [{ label: 'Remove Link', act: 'linkRemove', run: () => { E.setLink(null); } }] : []).concat([{ label: 'OK', primary: true, act: 'linkOk', run: (d) => {
        const type = d.querySelector('input[name=lnkType]:checked').value;
        const link = type === 'url' ? { type: 'url', url: d.querySelector('#lnkUrl').value } : { type: 'slide', index: Number(d.querySelector('#lnkSlide').value) };
        if (type === 'url' && !Q.safeUrl(link.url)) { d.querySelector('#lnkErr').textContent = 'Enter a valid web address (http, https or mailto).'; return false; }
        if (!sh) {
          const txt = (d.querySelector('#lnkText').value || '').trim() || 'Link';
          const nsh = E.addShape('textbox', { text: txt, ts: { color: '#0f6cbd', underline: true } }); if (nsh) E.setLink(link);
        } else E.setLink(link);
      } }]) });
  }
  const SYMBOLS = '© ® ™ ° ± × ÷ ≈ ≠ ≤ ≥ ∞ π Σ √ ∑ ∆ µ ← ↑ → ↓ ↔ ⇒ ⇔ ★ ☆ ♥ ♦ ♣ ♠ ✓ ✗ ✔ ✘ € £ ¥ ¢ ₹ § ¶ † ‡ • … – — « » “ ” ‘ ’ № ¼ ½ ¾ ² ³ α β γ δ θ λ ω Ω ☀ ☁ ☂ ☎ ✉ ✈ ♪ ♫ ⚠ ✂'.split(' ');
  function symbolDialog() {
    const body = el('div'); body.id = 'symbolGrid'; body.style.cssText = 'display:grid;grid-template-columns:repeat(10,1fr);gap:4px;max-height:300px;overflow:auto';
    SYMBOLS.forEach((ch) => { const b = el('button', 'btn'); b.type = 'button'; b.dataset.sym = ch; b.textContent = ch; b.style.cssText = 'min-width:0;height:36px;padding:0;font-size:18px'; body.appendChild(b); });
    body.addEventListener('click', (ev) => { const b = ev.target.closest('[data-sym]'); if (!b) return; dlg.close(); E.insertText(b.dataset.sym); });
    const dlg = showDialog({ title: 'Symbol', wide: true, body, buttons: [{ label: 'Close', primary: true }] });
  }

  // comments
  let cmCursor = -1;
  function commentDialog() {
    showDialog({ title: 'New Comment', body: '<label class="row" style="align-items:flex-start"><textarea id="cmText" rows="4" placeholder="Type your comment" style="flex:1;border:1px solid var(--muted);border-radius:4px;background:var(--panel);color:var(--text);padding:6px;font:inherit"></textarea></label>',
      buttons: [{ label: 'Cancel' }, { label: 'Post', primary: true, act: 'cmPost', run: (d) => { const t = d.querySelector('#cmText').value.trim(); if (!t) return false; E.mutate(() => E.pres.addComment(E.cur, t), 'meta'); E.renderCanvas(); } }] });
  }
  function viewComment(k) {
    const all = E.pres.allComments(); if (!all.length) return;
    cmCursor = ((k % all.length) + all.length) % all.length; const it = all[cmCursor];
    E.selectSlide(it.slide);
    showDialog({ title: 'Comment ' + (cmCursor + 1) + ' of ' + all.length, body: '<p><b>' + esc(it.comment.author) + '</b> · ' + esc(new Date(it.comment.t).toLocaleString()) + ' · slide ' + (it.slide + 1) + '</p><p id="cmBody">' + esc(it.comment.text) + '</p>',
      buttons: [{ label: 'Delete', act: 'cmDelete', run: () => { E.mutate(() => E.pres.removeComment(it.slide, it.comment.id), 'meta'); E.renderCanvas(); cmCursor = -1; } }, { label: 'Close', primary: true }] });
  }
  function commentsPane() {
    const body = el('div');
    const draw = () => {
      const all = E.pres.allComments();
      body.innerHTML = all.length ? '<table class="kbd-table" id="cmTable">' + all.map((it, k) => '<tr><td>Slide ' + (it.slide + 1) + '</td><td>' + esc(it.comment.text) + '</td><td><button class="btn" data-cmdel="' + k + '">Delete</button></td></tr>').join('') + '</table>' : '<p id="cmEmpty">There are no comments in this presentation.</p>';
    };
    draw();
    body.addEventListener('click', (ev) => { const b = ev.target.closest('[data-cmdel]'); if (!b) return; const it = E.pres.allComments()[Number(b.dataset.cmdel)]; if (it) { E.mutate(() => E.pres.removeComment(it.slide, it.comment.id), 'meta'); E.renderCanvas(); draw(); } });
    showDialog({ title: 'Comments', wide: true, body, buttons: [{ label: 'Close', primary: true }] });
  }

  // ================= commands =================
  const C = {};
  const def = (id, o) => { C[id] = o; };
  const hasSel = () => E.sel.length > 0;
  const hasText = () => E.textShapes().length > 0;
  const style = () => E.getStyle();
  const selAnim = () => (E.sel.length ? E.pres.getAnim(E.cur, E.sel[0]) : null);
  const na = (name) => ({ run: () => notAvailable(name) });
  const dis = () => ({ disabled: true, run: () => {} });
  const layoutItems = (fn) => Q.LAYOUTS.map((l) => ({ label: l.name, check: E.slide().layout === l.id ? undefined : false, run: () => fn(l.id) }));
  const SHAPE_ITEMS = [['rect', 'Rectangle'], ['oval', 'Oval'], ['line', 'Line'], ['arrow', 'Arrow']];
  const shapeMenu = () => SHAPE_ITEMS.map((s) => ({ label: s[1], icon: s[0], id: 'shape-' + s[0], run: () => E.addShape(s[0]) }));
  const setOutline = (patch) => E.mutate(() => E.selShapes().forEach((s) => { if (['picture'].indexOf(s.type) >= 0) return; s.line = Object.assign({ color: '#000000', width: 2, alpha: 1 }, s.line || {}, patch); }));
  const setFill = (c) => E.mutate(() => E.selShapes().forEach((s) => { if (Q.canHoldText(s)) s.fill = c; }));

  def('undo', { run: () => E.undo(), enabled: () => E.canUndo() });
  def('redo', { run: () => E.redo(), enabled: () => E.canRedo() });
  def('paste', { run: (b, ev) => { if (ev && ev.target.closest && ev.target.closest('.dd')) openMenu(b, [{ label: 'Paste', id: 'paste-shapes', icon: 'paste', key: 'Ctrl+V', run: () => { if (E.hasClip()) E.paste(); else pasteText(); } }, { label: 'Paste text only', id: 'paste-text', icon: 'textbox', run: pasteText }]); else if (E.hasClip()) E.paste(); else pasteText(); } });
  def('cut', { run: () => E.cut(), enabled: hasSel });
  def('copy', { run: () => E.copy(), enabled: hasSel });
  def('painter', { run: () => E.startPainter(), enabled: () => E.sel.length === 1 && hasText(), pressed: () => E.painterActive() });
  def('delete', { run: () => E.deleteSel(), enabled: hasSel });
  def('slides', { run: (b) => openMenu(b, [
    { label: 'New Slide', icon: 'newslide', key: 'Ctrl+M', run: () => E.newSlide() },
    { label: 'Duplicate Slide', icon: 'f-copy', run: () => E.duplicateSlide() },
    { label: 'Delete Slide', icon: 'delete', run: () => E.deleteSlide() }, { sep: true },
    { label: 'Layout', icon: 'layout', submenu: layoutItems((l) => E.setLayout(l)) },
  ]) });
  def('fontName', { change: (v) => E.setStyle({ font: v || null }), enabled: hasText, value: () => (style() ? style().font || '' : '') });
  def('fontSize', { change: (v) => E.setStyle({ size: Number(v) }), enabled: hasText, value: () => (style() ? String(style().size) : '') });
  ['bold', 'italic', 'underline', 'strike', 'sub', 'sup'].forEach((k) => def(k, { run: () => E.toggleStyle(k), enabled: hasText, pressed: () => !!(style() && E.textShapes().every((s) => s.ts[k])) }));
  def('highlight', { run: (b) => openMenu(b, colorItems((c) => E.setStyle({ highlight: c }), 'No Highlight')), enabled: hasText });
  def('fontcolor', { run: (b) => openMenu(b, colorItems((c) => E.setStyle({ color: c }), 'Automatic')), enabled: hasText });
  def('case', { run: (b) => openMenu(b, [{ label: 'UPPERCASE', run: () => E.setStyle({ caps: 'upper' }) }, { label: 'lowercase', run: () => E.setStyle({ caps: 'lower' }) }, { label: 'Capitalize Each Word', run: () => E.setStyle({ caps: 'title' }) }, { sep: true }, { label: 'As typed', run: () => E.setStyle({ caps: null }) }]), enabled: hasText });
  def('grow', { run: () => E.stepFont(1), enabled: hasText });
  def('shrink', { run: () => E.stepFont(-1), enabled: hasText });
  def('clearfmt', { run: () => E.clearFormat(), enabled: hasText });
  def('paragraph', { run: (b) => {
    const t = style() || {}; const off = !hasText();
    openMenu(b, [
      { label: 'Bullets', disabled: off, check: t.list === 'bullet' ? undefined : false, run: () => E.setStyle({ list: t.list === 'bullet' ? 'none' : 'bullet' }) },
      { label: 'Numbering', disabled: off, check: t.list === 'number' ? undefined : false, run: () => E.setStyle({ list: t.list === 'number' ? 'none' : 'number' }) }, { sep: true },
      ['left', 'Align Left'], ['center', 'Center'], ['right', 'Align Right'], ['justify', 'Justify'],
    ].map((x) => (Array.isArray(x) ? { label: x[1], disabled: off, check: t.align === x[0] ? undefined : false, run: () => E.setStyle({ align: x[0] }) } : x)));
  } });
  def('drawing', { run: (b) => openMenu(b, [
    { label: 'Shapes', icon: 'shapes', submenu: shapeMenu() },
    { label: 'Shape Fill', submenu: colorItems(setFill, 'No Fill'), disabled: !hasSel() },
    { label: 'Shape Outline', submenu: colorItems((c) => setOutline({ color: c || 'transparent' }), 'No Outline'), disabled: !hasSel() },
    { label: 'Outline Weight', submenu: [1, 2, 4, 6, 8].map((w) => ({ label: w + ' px', run: () => setOutline({ width: w }) })), disabled: !hasSel() }, { sep: true },
    { label: 'Bring to Front', run: () => E.order('front'), disabled: !hasSel() }, { label: 'Send to Back', run: () => E.order('back'), disabled: !hasSel() },
    { label: 'Bring Forward', run: () => E.order('forward'), disabled: !hasSel() }, { label: 'Send Backward', run: () => E.order('backward'), disabled: !hasSel() }, { sep: true },
    { label: 'Rotate Right 90°', run: () => E.rotateBy(90), disabled: !hasSel() }, { label: 'Rotate Left 90°', run: () => E.rotateBy(-90), disabled: !hasSel() },
  ]) });
  def('find', { run: () => findDialog(false) });
  def('replace', { run: () => findDialog(true) });
  def('dictate', { run: (b, ev) => { if (ev && ev.target.closest && ev.target.closest('.dd')) openMenu(b, [['en-US', 'English (US)'], ['en-GB', 'English (UK)'], ['en-IN', 'English (India)'], ['hi-IN', 'Hindi']].map((l) => ({ label: l[1], id: 'dict-' + l[0], check: dictLang === l[0] ? undefined : false, run: () => { dictLang = l[0]; } }))); else toggleDictation(); }, pressed: () => !!rec });
  def('addins', { run: (b) => addinsMenu(b) }); def('designer', { run: designerDialog });

  // insert
  def('newslide', { run: (b, ev) => { if (ev && ev.target.closest('.dd')) openMenu(b, layoutItems((l) => E.newSlide(l))); else E.newSlide(); } });
  def('textbox', { run: () => { const sh = E.addShape('textbox'); if (sh) E.startEdit(sh.id); } });
  def('table', { run: (b) => tableMenu(b) });
  def('pictures', { run: (b) => openMenu(b, [{ label: 'This Device…', icon: 'picture', run: () => $('filePicture').click() }]) });
  def('cameo', { run: cameoDialog }); def('video', { run: (b) => mediaMenu(b, 'video') }); def('audio', { run: (b) => mediaMenu(b, 'audio') });
  def('shapes', { run: (b) => openMenu(b, shapeMenu()) });
  def('stock', { run: stockDialog }); def('icons', { run: iconsDialog }); def('smartart', { run: smartArtDialog }); def('chart', { run: (b) => chartMenu(b) });
  def('link', { run: linkDialog }); def('newcomment', { run: commentDialog }); def('footer', { run: footerDialog }); def('symbol', { run: symbolDialog });

  // draw
  const penCmd = (id, tool, pen) => def(id, { run: () => E.setTool(tool, pen), pressed: () => E.tool === tool && (!pen || E.pen.color === pen.color) });
  def('select', { run: () => E.setTool('select'), pressed: () => E.tool === 'select' });
  def('touch', na('Draw with Touch')); def('lasso', na('Lasso Select')); def('stencil', na('Stencils'));
  penCmd('eraser', 'eraser'); penCmd('pen-black', 'pen', { color: '#111111', width: 3, alpha: 1 });
  penCmd('pen-red', 'pen', { color: '#e02020', width: 3, alpha: 1 }); penCmd('pen-hl', 'pen', { color: '#ffe600', width: 18, alpha: 0.4 });

  // design
  Q.THEMES.forEach((t) => def('theme:' + t.id, { run: () => E.mutate(() => E.pres.setTheme(t.id), 'all'), pressed: () => E.pres.theme.id === t.id }));
  Q.VARIANTS.forEach((v) => def('variant:' + v.id, { run: () => E.mutate(() => E.pres.setTheme(E.pres.theme.id, v.id), 'all'), pressed: () => E.pres.theme.variant === v.id }));
  def('layout', { run: (b) => openMenu(b, layoutItems((l) => E.setLayout(l))) });
  def('slidesize', { run: (b) => openMenu(b, Object.keys(Q.SIZES).map((k) => ({ label: Q.SIZES[k].label, check: E.pres.size === k ? undefined : false, id: 'size-' + k, run: () => E.mutate(() => E.pres.setSize(k)) }))) });

  // transitions
  def('preview', { run: previewTransition });
  Q.TRANSITIONS.forEach((t) => def('tr:' + t, { run: () => E.mutate(() => E.pres.setTransition(E.cur, { type: t }), 'meta'), pressed: () => E.slide().transition.type === t }));
  def('tr:exist', dis()); def('tr:more', na('More transitions'));
  def('trOptions', { run: (b) => openMenu(b, ['left', 'right', 'top', 'bottom'].map((d) => ({ label: 'From ' + d[0].toUpperCase() + d.slice(1), check: E.slide().transition.dir === d ? undefined : false, run: () => E.mutate(() => E.pres.setTransition(E.cur, { dir: d }), 'meta') }))), enabled: () => ['push', 'wipe'].indexOf(E.slide().transition.type) >= 0 });
  def('trDur', { change: (v) => E.mutate(() => E.pres.setTransition(E.cur, { dur: Number(v) }), 'meta'), enabled: () => E.slide().transition.type !== 'none', value: () => E.slide().transition.dur.toFixed(2) });
  def('trAll', { run: () => E.mutate(() => E.pres.applyTransitionToAll(E.cur), 'meta') });

  // animations
  def('anPreview', { run: previewAnimations });
  Q.ANIM_EFFECTS.forEach((ef) => def('an:' + ef, { run: () => E.mutate(() => E.sel.forEach((id) => E.pres.setAnim(E.cur, id, ef)), 'meta'), enabled: hasSel, pressed: () => { const a = selAnim(); return ef === 'none' ? hasSel() && !a : !!a && a.effect === ef; } }));
  def('an:exist', dis());
  def('anOptions', { run: (b) => openMenu(b, ['bottom', 'left', 'right', 'top'].map((d) => ({ label: 'From ' + d[0].toUpperCase() + d.slice(1), check: selAnim().dir === d ? undefined : false, run: () => E.mutate(() => E.pres.setAnim(E.cur, E.sel[0], 'flyin', { dir: d }), 'meta') }))), enabled: () => !!selAnim() && selAnim().effect === 'flyin' });
  def('anStart', { change: (v) => E.mutate(() => E.sel.forEach((id) => { const a = E.pres.getAnim(E.cur, id); if (a) E.pres.setAnim(E.cur, id, a.effect, { start: v }); }), 'meta'), enabled: () => !!selAnim(), value: () => (selAnim() ? selAnim().start : '') });
  def('anDur', { change: (v) => E.mutate(() => E.sel.forEach((id) => { const a = E.pres.getAnim(E.cur, id); if (a) E.pres.setAnim(E.cur, id, a.effect, { dur: Number(v) }); }), 'meta'), enabled: () => !!selAnim(), value: () => (selAnim() ? selAnim().dur.toFixed(2) : '0.00') });
  def('anDelay', { change: (v) => E.mutate(() => E.sel.forEach((id) => { const a = E.pres.getAnim(E.cur, id); if (a) E.pres.setAnim(E.cur, id, a.effect, { delay: Number(v) }); }), 'meta'), enabled: () => !!selAnim(), value: () => (selAnim() ? selAnim().delay.toFixed(2) : '0.00') });
  def('anEarlier', { run: () => E.mutate(() => E.pres.moveAnim(E.cur, selAnim().id, -1), 'meta'), enabled: () => !!selAnim() });
  def('anLater', { run: () => E.mutate(() => E.pres.moveAnim(E.cur, selAnim().id, 1), 'meta'), enabled: () => !!selAnim() });
  def('anPane', { run: animPaneDialog });

  // slide show / review / view / help
  def('fromStart', { run: () => startShow(0) }); def('fromCurrent', { run: () => startShow(E.cur) });
  def('presenter', na('Presenter View')); def('custom', dis()); def('coach', na('Rehearse with Coach'));
  def('review', dis()); def('proofing', na('Proofing')); def('access', { run: accessibilityDialog });
  def('markread', dis()); def('changes', dis());
  const anyComments = () => E.pres.allComments().length > 0;
  def('delcomment', { enabled: anyComments, run: (b) => openMenu(b, [
    { label: 'Delete Comment', id: 'cm-del-one', run: () => { const all = E.pres.allComments(); const it = all[Math.max(0, Math.min(cmCursor, all.length - 1))] || all[0]; E.mutate(() => E.pres.removeComment(it.slide, it.comment.id), 'meta'); E.renderCanvas(); cmCursor = -1; } },
    { label: 'Delete All Comments on this Slide', id: 'cm-del-slide', run: () => { E.mutate(() => { E.slide().comments = []; }, 'meta'); E.renderCanvas(); } },
    { label: 'Delete All Comments', id: 'cm-del-all', run: () => { E.mutate(() => { E.pres.slides.forEach((s) => { s.comments = []; }); }, 'meta'); E.renderCanvas(); } }]) });
  def('prevcomment', { enabled: anyComments, run: () => viewComment((cmCursor < 0 ? 0 : cmCursor) - 1) });
  def('nextcomment', { enabled: anyComments, run: () => viewComment(cmCursor + 1) });
  def('showcomments', { run: (b) => openMenu(b, [{ label: 'Show comment markers', id: 'cm-markers', check: E.showComments !== false ? undefined : false, run: () => { E.showComments = E.showComments === false; E.renderCanvas(); } }, { label: 'Comments pane…', id: 'cm-pane', run: commentsPane }]) });
  const setNotesPane = (on) => { ui.notes = on; saveUi(); applyUi(); };
  def('notes', { run: () => setNotesPane(!ui.notes), pressed: () => ui.notes });
  def('ruler', { run: () => { ui.ruler = !ui.ruler; saveUi(); applyUi(); }, pressed: () => ui.ruler });
  def('sorter', { run: () => E.setView('sorter'), pressed: () => E.view === 'sorter' });
  def('normal', { run: () => E.setView('normal'), pressed: () => E.view === 'normal' });
  def('immersive', dis());
  def('zoom', { run: zoomDialog }); def('fit', { run: () => E.setZoom('fit', 1) });
  def('help', { run: helpDialog }); def('support', na('Contact Support')); def('feedback', na('Feedback')); def('keyboard', { run: shortcutsDialog }); def('whatsnew', { run: whatsNewDialog });

  // ================= ribbon layout =================
  const B = (c, i, l, o) => Object.assign({ t: 'big', c, i, l }, o);
  const S = (c, i, l, o) => Object.assign({ t: 's', c, i, l }, o);
  const col = (...items) => ({ t: 'col', items });
  const row = (...items) => ({ t: 'row', items });
  const TABS = {
    Home: [
      { l: 'Undo', items: [col(S('undo', 'undo', '', { tip: 'Undo (Ctrl+Z)' }), S('redo', 'redo', '', { tip: 'Redo (Ctrl+Y)' }))] },
      { l: 'Clipboard', items: [B('paste', 'paste', 'Paste', { dd: true }), col(S('cut', 'cut', ''), S('copy', 'copy', ''), S('painter', 'painter', '', { tip: 'Format Painter' }))] },
      { l: 'Delete', items: [B('delete', 'delete', 'Delete')] },
      { l: '', items: [B('slides', 'slides', 'Slides', { dd: true })] },
      { l: 'Font', items: [{ t: 'col', items: [
        row({ t: 'select', c: 'fontName', w: 138, opts: [['', 'Theme font']].concat(Q.FONTS.map((f) => [f, f])), tip: 'Font' }, { t: 'select', c: 'fontSize', w: 62, opts: Q.SIZES_PT.map((n) => [String(n), String(n)]), tip: 'Font size' }),
        row(S('bold', 'bold', ''), S('italic', 'italic', ''), S('underline', 'underline', ''), S('strike', 'strike', '', { tip: 'Strikethrough' }), S('sub', 'sub', '', { tip: 'Subscript' }), S('sup', 'sup', '', { tip: 'Superscript' })),
        row(S('highlight', 'highlight', '', { dd: true, tip: 'Text highlight color' }), S('fontcolor', 'fontcolor', '', { dd: true, tip: 'Font color' }), S('case', 'case', '', { dd: true, tip: 'Change case' }), S('grow', 'grow', '', { tip: 'Increase font size' }), S('shrink', 'shrink', '', { tip: 'Decrease font size' }), S('clearfmt', 'clearfmt', '', { tip: 'Clear formatting' })),
      ] }] },
      { l: '', items: [B('paragraph', 'paragraph', 'Paragraph', { dd: true })] },
      { l: '', items: [B('drawing', 'drawing', 'Drawing', { dd: true })] },
      { l: 'Editing', items: [col(S('find', 'find', 'Find'), S('replace', 'replace', 'Replace'))] },
      { l: 'Dictate', items: [B('dictate', 'dictate', 'Dictate', { dd: true })] },
      { l: 'Add-ins', items: [B('addins', 'addins', 'Add-ins', { dd: true })] },
      { l: 'Copilot', items: [B('designer', 'designer', 'Designer')] },
    ],
    Insert: [
      { l: 'Slides', items: [B('newslide', 'newslide', 'New Slide', { dd: true })] },
      { l: 'Text', items: [B('textbox', 'textbox', 'Text Box'), B('table', 'table', 'Table', { dd: true })] },
      { l: 'Media', items: [B('pictures', 'picture', 'Pictures', { dd: true }), B('cameo', 'cameo', 'Cameo'), B('video', 'video', 'Video', { dd: true }), B('audio', 'audio', 'Audio')] },
      { l: 'Illustration', items: [B('shapes', 'shapes', 'Shapes', { dd: true }), B('stock', 'stock', 'Stock Images'), B('icons', 'icons', 'Icons'), B('smartart', 'smartart', 'SmartArt'), B('chart', 'chart', 'Chart', { dd: true })] },
      { l: 'Links', items: [B('link', 'link', 'Link')] },
      { l: 'Comments', items: [B('newcomment', 'newcomment', 'New Comment')] },
      { l: 'Footer', items: [B('footer', 'footer', 'Footer', { dd: true })] },
      { l: 'Symbols', items: [B('symbol', 'symbol', 'Symbol', { dd: true })] },
    ],
    Draw: [
      { l: 'Undo', items: [col(S('undo', 'undo', ''), S('redo', 'redo', ''))] },
      { l: 'Tools', items: [B('select', 'select', 'Select'), B('touch', 'touch', 'Draw with Touch')] },
      { l: 'Pens', items: [B('lasso', 'lasso', '', { tall: true, tip: 'Lasso Select' }), B('eraser', 'pen-eraser', '', { tall: true, tip: 'Eraser' }), B('pen-black', 'pen-black', '', { tall: true, tip: 'Black pen' }), B('pen-red', 'pen-red', '', { tall: true, tip: 'Red pen' }), B('pen-hl', 'pen-hl', '', { tall: true, tip: 'Highlighter' })] },
      { l: 'Stencils', items: [B('stencil', 'stencil', '', { tall: true, tip: 'Ruler' })] },
    ],
    Design: [
      { l: 'Themes', items: [{ t: 'themes' }] },
      { l: 'Variants', items: [{ t: 'variants' }] },
      { l: '', items: [B('layout', 'layout', 'Slide Layout', { dd: true }), B('slidesize', 'slidesize', 'Slide Size', { dd: true })] },
    ],
    Transitions: [
      { l: 'Preview', items: [B('preview', 'preview', 'Preview')] },
      { l: 'Transitions', items: [{ t: 'gallery', cls: '', items: [['tr:exist', 'tr-exist', 'Existing'], ['tr:none', 'tr-none', 'None'], ['tr:more', 'tr-more', 'More'], ['tr:cut', 'tr-cut', 'Cut'], ['tr:fade', 'tr-fade', 'Fade'], ['tr:push', 'tr-push', 'Push'], ['tr:wipe', 'tr-wipe', 'Wipe']] }, B('trOptions', 'options', 'Options', { dd: true })] },
      { l: 'Timing', items: [col({ t: 'num', c: 'trDur', i: 'clock', l: 'Duration', step: 0.25, min: 0, max: 10 }, S('trAll', 'applyall', 'Apply to All'))] },
    ],
    Animations: [
      { l: 'Preview', items: [B('anPreview', 'preview', 'Preview')] },
      { l: 'Animation', items: [{ t: 'gallery', items: [['an:exist', 'tr-exist', 'Existing'], ['an:none', 'an-none', 'None'], ['an:appear', 'an-appear', 'Appear'], ['an:fade', 'an-fade', 'Fade'], ['an:flyin', 'an-fly', 'Fly In']] }, B('anOptions', 'options', 'Effect Options', { dd: true })] },
      { l: 'Timing', items: [col({ t: 'select', c: 'anStart', w: 120, opts: [['onclick', 'On Click'], ['withprev', 'With Previous'], ['afterprev', 'After Previous']], icon: 'start', l: 'Start' }, { t: 'num', c: 'anDur', i: 'clock', l: 'Duration', step: 0.25, min: 0, max: 20 }, { t: 'num', c: 'anDelay', i: 'clock', l: 'Delay', step: 0.25, min: 0, max: 20 })] },
      { l: 'Reorder', items: [B('anEarlier', 'moveup', 'Move Earlier'), B('anLater', 'movedown', 'Move Later')] },
      { l: 'Advanced', items: [B('anPane', 'animpane', 'Animation Pane')] },
    ],
    'Slide Show': [
      { l: 'Start Slide Show', items: [B('fromStart', 'fromstart', 'From Beginning'), B('fromCurrent', 'fromcurrent', 'From Current Slide'), B('presenter', 'presenter', 'Presenter View'), B('custom', 'custom', 'Custom Slideshow', { dd: true })] },
      { l: 'Coach', items: [B('coach', 'coach', 'Rehearse with Coach', { dd: true })] },
    ],
    Review: [
      { l: 'Insights', items: [B('review', 'review', 'Review Presentation')] },
      { l: 'Editor', items: [B('proofing', 'proofing', 'Proofing', { dd: true })] },
      { l: 'Accessibility', items: [B('access', 'access', 'Check Accessibility')] },
      { l: 'Activity', items: [B('markread', 'markread', 'Mark All as Read'), B('changes', 'changes', 'Show Changes')] },
      { l: 'Comments', items: [B('newcomment', 'newcomment', 'New Comment'), B('delcomment', 'delcomment', 'Delete', { dd: true }), B('prevcomment', 'prevcomment', 'Previous'), B('nextcomment', 'nextcomment', 'Next'), B('showcomments', 'showcomments', 'Show Comments', { dd: true })] },
    ],
    View: [
      { l: 'Show', items: [B('notes', 'notes', 'Notes'), B('ruler', 'ruler', 'Ruler')] },
      { l: 'Presentation Views', items: [B('sorter', 'sorter', 'Slide Sorter'), B('normal', 'normal', 'Normal'), B('immersive', 'immersive', 'Immersive Reader')] },
      { l: 'Zoom', items: [B('zoom', 'zoom', 'Zoom'), B('fit', 'fit', 'Fit To Window')] },
    ],
    Help: [
      { l: 'Help', items: [B('help', 'help', 'Help'), B('support', 'support', 'Contact Support'), B('feedback', 'feedback', 'Feedback'), B('keyboard', 'keyboard', 'Keyboard shortcuts'), B('whatsnew', 'whatsnew', 'What’s New')] },
    ],
  };
  const TAB_ORDER = ['File', 'Home', 'Insert', 'Draw', 'Design', 'Transitions', 'Animations', 'Slide Show', 'Review', 'View', 'Help'];

  function buildItem(it) {
    const mk = (cls, html) => { const b = el('button', cls); b.type = 'button'; b.innerHTML = html; return b; };
    let b;
    switch (it.t) {
      case 'big':
        b = mk('rbtn big' + (it.tall ? ' tall' : ''), ic(it.i) + (it.l ? '<span class="lbl">' + esc(it.l) + (it.dd ? ic('chev-down', 'dd') : '') + '</span>' : ''));
        b.dataset.cmd = it.c; b.title = it.tip || it.l; if (it.l) b.setAttribute('aria-label', it.l); else b.setAttribute('aria-label', it.tip || it.c); return b;
      case 's':
        b = mk('rbtn small', ic(it.i) + (it.l ? '<span>' + esc(it.l) + '</span>' : '') + (it.dd ? ic('chev-down', 'dd') : ''));
        b.dataset.cmd = it.c; b.title = it.tip || it.l || it.c; b.setAttribute('aria-label', it.tip || it.l || it.c); return b;
      case 'select': {
        const s = el('select', 'rsel'); s.dataset.cmd = it.c; if (it.w) s.style.width = it.w + 'px'; s.title = it.tip || ''; s.setAttribute('aria-label', it.tip || it.l || it.c);
        it.opts.forEach((o) => { const op = el('option'); op.value = o[0]; op.textContent = o[1]; s.appendChild(op); });
        if (it.l) { const w = el('label', 'rnum'); w.innerHTML = ic(it.icon || 'clock') + '<span>' + esc(it.l) + '</span>'; w.appendChild(s); return w; }
        return s;
      }
      case 'num': {
        const w = el('label', 'rnum'); w.innerHTML = ic(it.i) + '<span>' + esc(it.l) + '</span>';
        const inp = el('input'); inp.type = 'number'; inp.step = it.step; inp.min = it.min; inp.max = it.max; inp.dataset.cmd = it.c; inp.setAttribute('aria-label', it.l); w.appendChild(inp); return w;
      }
      case 'col': { const c = el('div', 'rcol'); it.items.forEach((x) => c.appendChild(buildItem(x))); return c; }
      case 'row': { const r = el('div', 'rrow'); it.items.forEach((x) => r.appendChild(buildItem(x))); return r; }
      case 'gallery': {
        const g = el('div', 'rgallery');
        it.items.forEach((x) => { const gb = mk('gitem', ic(x[1]) + '<span>' + esc(x[2]) + '</span>'); gb.dataset.cmd = x[0]; gb.title = x[2]; g.appendChild(gb); });
        return g;
      }
      case 'themes': {
        const g = el('div', 'rgallery themes-gallery');
        Q.THEMES.forEach((t) => {
          const gb = el('button', 'gitem theme'); gb.type = 'button'; gb.dataset.cmd = 'theme:' + t.id; gb.title = t.name;
          gb.innerHTML = '<span class="tprev" style="background:' + (t.bgImage || t.bg) + ';color:' + t.fg + ';font-family:' + t.heading.replace(/"/g, "'") + '">Aa<span class="sw">' + t.swatch.map((c) => '<i style="background:' + c + '"></i>').join('') + '</span></span>';
          g.appendChild(gb);
        });
        return g;
      }
      case 'variants': {
        const g = el('div', 'rgallery variants-gallery');
        Q.VARIANTS.forEach((v) => {
          const gb = el('button', 'gitem variant'); gb.type = 'button'; gb.dataset.cmd = 'variant:' + v.id; gb.title = v.name;
          gb.innerHTML = '<span class="vprev" data-variant="' + v.id + '"></span>'; g.appendChild(gb);
        });
        return g;
      }
      default: return el('span');
    }
  }
  function buildRibbon(tab) {
    const body = $('ribbonBody'); body.textContent = '';
    (TABS[tab] || []).forEach((g) => {
      const grp = el('div', 'rgroup'); const items = el('div', 'rg-items');
      g.items.forEach((it) => items.appendChild(buildItem(it)));
      const lab = el('div', 'rg-label'); lab.textContent = g.l; grp.appendChild(items); grp.appendChild(lab); body.appendChild(grp);
    });
    refreshRibbon();
  }
  let refreshRaf = 0;
  function scheduleRefresh() { if (refreshRaf) return; refreshRaf = requestAnimationFrame(() => { refreshRaf = 0; refreshRibbon(); }); }
  function refreshRibbon() {
    if (!E.pres) return;
    // variant swatch colours follow the current theme
    const tv = E.pres.themeVars();
    document.querySelectorAll('#ribbonBody [data-variant]').forEach((v) => {
      const vv = Q.VARIANTS[Number(v.dataset.variant)]; const bg = vv.bg || tv.bg;
      v.style.background = vv.bg ? vv.bg : (Q.THEMES.find((t) => t.id === E.pres.theme.id).bgImage || tv.bg);
      v.innerHTML = '<span style="width:34px;height:3px;background:' + tv.accent + ';display:block;border-radius:2px;opacity:.9"></span>';
      v.style.setProperty('--vb', bg);
    });
    document.querySelectorAll('#ribbonBody [data-cmd]').forEach((n) => {
      const c = C[n.dataset.cmd]; if (!c) return;
      const enabled = c.disabled ? false : (c.enabled ? !!c.enabled() : true);
      n.disabled = !enabled;
      if (n.tagName === 'SELECT' || n.tagName === 'INPUT') {
        if (c.value && document.activeElement !== n) { const v = c.value(); if (n.value !== v) n.value = v; }
      } else {
        const p = c.pressed ? !!c.pressed() : false;
        n.classList.toggle('pressed', p); n.setAttribute('aria-pressed', p ? 'true' : 'false');
      }
    });
    $('sbNotes').setAttribute('aria-pressed', ui.notes ? 'true' : 'false');
  }
  QUI.refreshRibbon = refreshRibbon; QUI.commands = C;

  const ribbonBody = $('ribbonBody');
  ribbonBody.addEventListener('mousedown', (ev) => { if (!ev.target.closest('select,input,label')) ev.preventDefault(); }); // keeps focus (and the caret) in the text being edited
  ribbonBody.addEventListener('click', (ev) => {
    const n = ev.target.closest('[data-cmd]'); if (!n || n.disabled || n.tagName === 'SELECT' || n.tagName === 'INPUT') return;
    const c = C[n.dataset.cmd]; if (!c || !c.run) return;
    closeMenus(); c.run(n, ev); refreshRibbon();
  });
  ribbonBody.addEventListener('change', (ev) => {
    const n = ev.target.closest('[data-cmd]'); if (!n) return;
    const c = C[n.dataset.cmd]; if (c && c.change) c.change(n.value, n); refreshRibbon();
  });

  // ================= tabs =================
  function renderTabs() {
    const list = $('tabList'); list.textContent = '';
    TAB_ORDER.forEach((name) => {
      const b = el('button', 'tab' + (name === ui.tab ? ' active' : '')); b.type = 'button'; b.textContent = name; b.dataset.tab = name;
      b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', name === ui.tab ? 'true' : 'false');
      b.addEventListener('click', () => {
        if (name === 'File') { openFileMenu(b); return; }
        setTab(name); if (ui.ribbonCollapsed) { ui.ribbonCollapsed = false; saveUi(); applyUi(); }
      });
      list.appendChild(b);
    });
  }
  function setTab(name) {
    if (!TABS[name]) return; ui.tab = name; saveUi();
    document.querySelectorAll('.tab').forEach((t) => { const a = t.dataset.tab === name; t.classList.toggle('active', a); t.setAttribute('aria-selected', a ? 'true' : 'false'); });
    buildRibbon(name);
  }
  QUI.setTab = setTab;

  function openFileMenu(anchor) {
    anchor.classList.add('open');
    const en = curEntry() || {};
    const recent = index.docs.slice().sort((a, b) => (b.updated || 0) - (a.updated || 0)).filter((d) => d.id !== index.current).slice(0, 5).map((d) => ({ label: d.name, id: 'file-open-doc-' + d.id, run: () => switchTo(d.id) }));
    const m = openMenu(anchor, [
      { head: 'Autosaved to ' + (en.folder || 'Documents'), icon: 'cloud-ok' },
      { label: 'New', icon: 'f-new', id: 'file-new', submenu: [{ label: 'Blank presentation', id: 'file-new-blank', run: newPresentation }] },
      { label: 'Open', icon: 'f-open', id: 'file-open', submenu: [{ label: 'My presentations…', id: 'file-open-list', run: openFromList }, { label: 'From this device…', id: 'file-open-device', run: openFromDevice }].concat(recent.length ? [{ sep: true }].concat(recent) : []) }, { sep: true },
      { label: 'Share', icon: 'f-share', id: 'file-share', submenu: shareMenuItems() },
      { label: 'Create a copy', icon: 'f-copy', id: 'file-copy', submenu: [{ label: 'Save a copy in My presentations', id: 'file-copy-save', run: saveCopy }, { label: 'Download a copy (.json)', id: 'file-copy-json', run: downloadJson }] },
      { label: 'Export', icon: 'f-export', id: 'file-export', submenu: [
        { label: 'Export to PDF', id: 'file-export-pdf', run: printDeck }, { label: 'Current slide as PNG', id: 'file-export-png1', run: () => exportPng(false) },
        { label: 'All slides as PNG', id: 'file-export-png', run: () => exportPng(true) }, { label: 'Outline as text (.txt)', id: 'file-export-txt', run: downloadOutline }, { label: 'Download as .json', run: downloadJson },
      ] },
      { label: 'Print', icon: 'f-print', id: 'file-print', submenu: [{ label: 'Print…', id: 'file-print-go', key: 'Ctrl+P', run: printDeck }] }, { sep: true },
      { label: 'Rename', icon: 'f-rename', id: 'file-rename', run: renameDialog },
      { label: 'Move file', icon: 'f-move', id: 'file-move', run: moveDialog },
      { label: 'Version history', icon: 'f-history', id: 'file-history', run: versionDialog },
      { label: 'Info', icon: 'f-info', id: 'file-info', submenu: [{ label: 'Presentation info…', run: infoDialog }] },
    ], 'file-menu');
    // the File menu stays open until an outside click; closing resets the tab highlight (closeMenus)
    return m;
  }
  QUI.openFileMenu = () => openFileMenu(document.querySelector('.tab[data-tab="File"]'));

  // ================= title bar =================
  $('launcherBtn').addEventListener('click', (ev) => {
    const node = el('div', 'launcher-grid');
    [['Excel', 'X', '#107c41', 'https://www.office.com/launch/excel'], ['Word', 'W', '#185abd', 'https://www.office.com/launch/word'], ['PowerPoint', 'P', '#c43e1c', 'https://www.office.com/launch/powerpoint']].forEach((a) => {
      const t = el('a', 'app-tile'); t.href = a[3]; t.target = '_blank'; t.rel = 'noopener noreferrer'; t.dataset.app = a[0];
      t.innerHTML = '<span class="app-badge" style="background:' + a[2] + '">' + a[1] + '</span><span>' + a[0] + '</span>'; node.appendChild(t);
    });
    openMenu(ev.currentTarget, [{ node }]);
  });
  $('docName').addEventListener('click', renameDialog);
  $('themeBtn').addEventListener('click', toggleTheme);
  $('settingsBtn').addEventListener('click', (ev) => openMenu(ev.currentTarget, [
    { label: document.documentElement.dataset.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme', icon: document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon', run: toggleTheme },
    { label: 'Reset zoom to fit', icon: 'fit', run: () => E.setZoom('fit', 1) },
    { label: 'Keyboard shortcuts', icon: 'keyboard', run: shortcutsDialog }, { sep: true }, { label: 'About', icon: 'f-info', run: aboutDialog },
  ]));
  $('profileBtn').addEventListener('click', (ev) => openMenu(ev.currentTarget, [
    { head: 'Quadra user (this device)', icon: 'logo' }, { label: 'Account settings', run: () => notAvailable('Account settings') }, { label: 'Sign out', run: () => notAvailable('Sign out') },
  ]));
  $('shareBtn').addEventListener('click', (ev) => openMenu(ev.currentTarget, shareMenuItems()));
  $('commentsBtn').addEventListener('click', commentsPane);
  $('moreBtn').addEventListener('click', (ev) => openMenu(ev.currentTarget, [
    { label: 'Print…', icon: 'f-print', run: printDeck }, { label: 'Export to PDF', icon: 'f-export', run: printDeck },
    { label: 'Keyboard shortcuts', icon: 'keyboard', run: shortcutsDialog }, { label: 'About', icon: 'f-info', run: aboutDialog },
  ]));

  // command search
  const searchInput = $('searchInput'), searchResults = $('searchResults');
  let searchIndex = [];
  function buildSearchIndex() {
    const seen = new Set();
    const walk = (items, tab) => items.forEach((it) => {
      if (it.items && it.t !== 'gallery') walk(it.items, tab);
      if ((it.t === 'big' || it.t === 's') && it.l && !seen.has(it.c + tab)) { seen.add(it.c + tab); searchIndex.push({ label: it.l, tab, cmd: it.c }); }
      if (it.t === 'gallery') it.items.forEach((x) => searchIndex.push({ label: x[2], tab, cmd: x[0] }));
    });
    Object.keys(TABS).forEach((tab) => TABS[tab].forEach((g) => walk(g.items, tab)));
    searchIndex.push({ label: 'Rename', tab: 'File', cmd: '_rename' }, { label: 'Print', tab: 'File', cmd: '_print' }, { label: 'Export to PDF', tab: 'File', cmd: '_print' }, { label: 'Slide show', tab: 'Slide Show', cmd: 'fromStart' });
  }
  function runSearch(item) {
    searchResults.hidden = true; searchInput.value = '';
    if (item.cmd === '_rename') return renameDialog(); if (item.cmd === '_print') return printDeck();
    const c = C[item.cmd]; if (!c) return;
    if (c.disabled || (c.enabled && !c.enabled())) { setTab(item.tab); toast(item.label + ' is not available right now'); return; }
    if (c.run) c.run($('searchInput'), {});
  }
  function updateSearch() {
    const q = searchInput.value.trim().toLowerCase(); searchResults.textContent = '';
    if (!q) { searchResults.hidden = true; return; }
    const hits = searchIndex.filter((s) => s.label.toLowerCase().indexOf(q) >= 0).slice(0, 8);
    if (!hits.length) { searchResults.innerHTML = '<div class="sr-empty">No commands found</div>'; searchResults.hidden = false; return; }
    hits.forEach((h, k) => {
      const b = el('button', 'sr-item' + (k === 0 ? ' active' : '')); b.type = 'button'; b.innerHTML = '<span>' + esc(h.label) + '</span><span class="sr-tab">' + esc(h.tab) + '</span>';
      b.addEventListener('mousedown', (ev) => { ev.preventDefault(); runSearch(h); }); searchResults.appendChild(b);
    });
    searchResults.hidden = false; searchResults._hits = hits;
  }
  searchInput.addEventListener('input', updateSearch);
  searchInput.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { const h = searchResults._hits; if (h && h[0] && !searchResults.hidden) runSearch(h[0]); }
    else if (ev.key === 'Escape') { searchInput.value = ''; searchResults.hidden = true; searchInput.blur(); }
  });
  searchInput.addEventListener('blur', () => setTimeout(() => { searchResults.hidden = true; }, 150));

  // ================= status bar / zoom / panels =================
  function updateStatus() { $('sbSlide').textContent = 'Slide ' + (E.cur + 1) + ' of ' + E.pres.slides.length; }
  function updateZoomUi() {
    const p = E.zoomPercent(); $('zoomPct').textContent = p + '%'; $('zoomSlider').value = String(Q.clamp(p, 10, 400));
    $('zoomFit').classList.toggle('pressed', E.zoom.mode === 'fit');
  }
  function applyUi() {
    $('notesPane').hidden = !ui.notes;
    $('rulerTop').hidden = !ui.ruler; $('rulerLeft').hidden = !ui.ruler; document.body.classList.toggle('show-ruler', ui.ruler);
    document.body.classList.toggle('thumbs-collapsed', ui.thumbsCollapsed);
    $('ribbon').classList.toggle('collapsed', ui.ribbonCollapsed);
    $('ribbonCollapse').querySelector('use').setAttribute('href', ui.ribbonCollapsed ? '#i-chev-down' : '#i-chev-up');
    $('thumbToggle').title = ui.thumbsCollapsed ? 'Expand thumbnails' : 'Collapse thumbnails';
    $('sbNotes').setAttribute('aria-pressed', ui.notes ? 'true' : 'false');
    if (E.pres) { E.renderCanvas(); E.emit('zoom'); }
    scheduleRefresh();
  }
  $('zoomOut').addEventListener('click', () => E.zoomStep(-1));
  $('zoomIn').addEventListener('click', () => E.zoomStep(1));
  $('zoomFit').addEventListener('click', () => E.setZoom('fit', 1));
  $('zoomSlider').addEventListener('input', (ev) => E.setZoom('custom', Number(ev.target.value) / 100));
  $('zoomPct').addEventListener('click', (ev) => {
    const cur = E.zoom.mode === 'fit' ? 'fit' : E.zoomPercent();
    const items = [400, 300, 200, 150, 125, 100, 75, 50, 25, 10].map((v) => ({ label: v + '%', id: 'zoom-' + v, check: cur === v ? undefined : false, run: () => E.setZoom('custom', v / 100) }));
    items.push({ sep: true }, { label: 'Fit', id: 'zoom-fit', check: cur === 'fit' ? undefined : false, run: () => E.setZoom('fit', 1) });
    openMenu(ev.currentTarget, items);
  });
  $('sbNotes').addEventListener('click', () => setNotesPane(!ui.notes));
  $('sbFeedback').addEventListener('click', () => notAvailable('Feedback'));
  $('viewNormal').addEventListener('click', () => E.setView('normal'));
  $('viewSorter').addEventListener('click', () => E.setView('sorter'));
  $('viewShow').addEventListener('click', () => startShow(E.cur));
  $('thumbToggle').addEventListener('click', () => { ui.thumbsCollapsed = !ui.thumbsCollapsed; saveUi(); applyUi(); });
  $('ribbonCollapse').addEventListener('click', () => { ui.ribbonCollapsed = !ui.ribbonCollapsed; saveUi(); applyUi(); });

  // thumbnail / canvas context menus
  $('thumbList').addEventListener('contextmenu', (ev) => {
    const it = ev.target.closest('.thumb-item'); if (!it) return;
    ev.preventDefault(); const i = Number(it.dataset.index); E.selectSlide(i);
    const a = { getBoundingClientRect: () => ({ left: ev.clientX, right: ev.clientX, top: ev.clientY, bottom: ev.clientY }) };
    openMenu(a, [
      { label: 'New Slide', icon: 'newslide', run: () => E.newSlide() }, { label: 'Duplicate Slide', icon: 'f-copy', run: () => E.duplicateSlide(i) },
      { label: 'Delete Slide', icon: 'delete', run: () => E.deleteSlide(i) }, { sep: true },
      { label: 'Layout', icon: 'layout', submenu: layoutItems((l) => E.setLayout(l, i)) },
      { label: 'Slide Show from here', icon: 'fromcurrent', run: () => startShow(i) },
    ]);
  });
  $('stage').addEventListener('contextmenu', (ev) => {
    ev.preventDefault();
    const hit = E.hitAt(ev.clientX, ev.clientY);
    if (hit && E.sel.indexOf(hit.shape.id) < 0) E.select([hit.shape.id]);
    const tableItems = hit && hit.shape.type === 'table' ? [{ sep: true },
      { label: 'Insert Row Above', id: 'tbl-row-above', run: () => E.tableOp('addRow', hit.shape.id, hit.cell[0]) }, { label: 'Insert Row Below', id: 'tbl-row-below', run: () => E.tableOp('addRow', hit.shape.id, hit.cell[0] + 1) },
      { label: 'Insert Column Left', id: 'tbl-col-left', run: () => E.tableOp('addCol', hit.shape.id, hit.cell[1]) }, { label: 'Insert Column Right', id: 'tbl-col-right', run: () => E.tableOp('addCol', hit.shape.id, hit.cell[1] + 1) },
      { label: 'Delete Row', id: 'tbl-row-del', run: () => E.tableOp('delRow', hit.shape.id, hit.cell[0]) }, { label: 'Delete Column', id: 'tbl-col-del', run: () => E.tableOp('delCol', hit.shape.id, hit.cell[1]) }] : [];
    const chartItems = hit && hit.shape.type === 'chart' ? [{ sep: true }, { label: 'Edit Data…', id: 'chart-edit', run: () => chartDialog(hit.shape.id) }] : [];
    const linkItems = hit ? [{ sep: true }, { label: 'Link…', id: 'ctx-link', run: linkDialog }] : [];
    const a = { getBoundingClientRect: () => ({ left: ev.clientX, right: ev.clientX, top: ev.clientY, bottom: ev.clientY }) };
    openMenu(a, [
      { label: 'Cut', icon: 'cut', key: 'Ctrl+X', disabled: !hasSel(), run: () => E.cut() }, { label: 'Copy', icon: 'copy', key: 'Ctrl+C', disabled: !hasSel(), run: () => E.copy() },
      { label: 'Paste', icon: 'paste', key: 'Ctrl+V', disabled: !E.hasClip(), run: () => E.paste() }, { label: 'Duplicate', icon: 'f-copy', key: 'Ctrl+D', disabled: !hasSel(), run: () => E.duplicate() },
      { label: 'Delete', icon: 'delete', key: 'Del', disabled: !hasSel(), run: () => E.deleteSel() }, { sep: true },
      { label: 'Bring to Front', disabled: !hasSel(), run: () => E.order('front') }, { label: 'Send to Back', disabled: !hasSel(), run: () => E.order('back') },
    ].concat(linkItems, tableItems, chartItems));
  });
  // a right click must not change the focus area or clear selection of a clicked shape; select it first when it is under the cursor
  $('stage').addEventListener('pointerdown', (ev) => { if (ev.button === 2) { E.focusArea = 'canvas'; } });

  // ================= boot =================
  function loadDoc() {
    loadIndex(); const d = readDoc(index.current);
    return d ? { pres: Q.Presentation.fromJSON(d.pres), cur: Number(d.cur) || 0 } : null;
  }
  const saved = loadDoc();
  let t0 = 'light'; try { t0 = localStorage.getItem(THEME_KEY) || (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); } catch (e) { /* ignore */ }
  applyTheme(t0);
  E.init(saved ? saved.pres : Q.Presentation.blank());
  if (saved && saved.cur > 0) E.selectSlide(Math.min(saved.cur, E.pres.slides.length - 1), true);
  buildSearchIndex(); renderTabs(); setTab(TABS[ui.tab] ? ui.tab : 'Home');
  syncTitle(); updateStatus(); updateZoomUi(); applyUi(); setStatus('saved');
  ['change', 'slide', 'selection', 'history', 'clipboard', 'tool', 'view', 'painter', 'edit'].forEach((ev) => E.on(ev, scheduleRefresh));
  E.on('change', (kind) => { if (kind !== 'notes' || true) scheduleSave(); if (kind === 'meta' || kind === 'all' || kind === 'structure') syncTitle(); updateStatus(); });
  E.on('slide', updateStatus);
  E.on('zoom', updateZoomUi);
  E.on('view', () => { $('viewNormal').classList.toggle('pressed', E.view === 'normal'); $('viewSorter').classList.toggle('pressed', E.view === 'sorter'); $('viewNormal').setAttribute('aria-pressed', String(E.view === 'normal')); $('viewSorter').setAttribute('aria-pressed', String(E.view === 'sorter')); updateZoomUi(); });
  window.__QUADRA_READY = true;
  QUI.exportPng = exportPng; QUI.printDeck = printDeck; QUI.syncTitle = syncTitle;
})();
