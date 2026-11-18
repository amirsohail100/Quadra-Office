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
  let ui = { tab: 'Home', notes: false, ruler: false, thumbsCollapsed: false, ribbonCollapsed: false, grid: false, snap: false, units: /-IN$|^hi/i.test(navigator.language || '') ? 'cm' : 'in', reader: null };
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
      saveIndex(); setStatus('saved'); storageWarned = false;
    } catch (e) {
      setStatus('error');
      if (!storageWarned) { storageWarned = true; showDialog({ title: 'Cannot save', body: '<p id="storageFull">The browser storage is full, so the latest changes are not saved. Remove large pictures or old presentations (File → Open → My presentations), or download a copy with File → Create a copy.</p>' }); }
    }
  }
  let storageWarned = false;
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
      issues.forEach((it) => { const li = el('li'); const a = el('button', 'sb-link'); a.textContent = (it.level === 'error' ? 'Error: ' : 'Warning: ') + it.msg; a.dataset.slide = it.slide; if (it.shapeId) a.dataset.shape = it.shapeId; li.appendChild(a); ul.appendChild(li); });
      ul.addEventListener('click', (ev) => {
        const li = ev.target.closest('li'); const a = li && li.querySelector('button'); if (!a) return;
        dlg.close(); E.selectSlide(Number(a.dataset.slide)); if (a.dataset.shape) E.select([a.dataset.shape]);
      });
      body.appendChild(ul);
    }
    const dlg = showDialog({ title: 'Accessibility check', body });
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

  // ================= animation effects =================
  const isLineT = (t) => t === 'line' || t === 'arrow';
  const boxTop = (s) => (isLineT(s.type) ? s.y - Math.max(14, s.h) / 2 : s.y);
  const boxH = (s) => (isLineT(s.type) ? Math.max(14, s.h) : s.h);
  const shapeLabel = (sh) => (!sh ? '?' : sh.text && sh.text.trim() ? sh.text.trim().split('\n')[0].slice(0, 26) : sh.type === 'table' ? 'Table' : sh.type === 'chart' ? 'Chart' : sh.type.charAt(0).toUpperCase() + sh.type.slice(1));
  function effectSpec(a, sh, W, H, rot) {
    const R = rot ? rot + ' ' : '', base = rot || 'none';
    const off = (dir, far) => {
      const f = far ? 1 : 0;
      const dx = dir === 'left' ? (f ? -(sh.x + sh.w + 20) : -60) : dir === 'right' ? (f ? W - sh.x + 20 : 60) : 0;
      const dy = dir === 'top' ? (f ? -(sh.y + sh.h + 20) : -60) : dir === 'bottom' ? (f ? H - sh.y + 20 : 60) : 0;
      return [dx, dy];
    };
    const wipeFrom = { left: 'inset(0 100% 0 0)', right: 'inset(0 0 0 100%)', top: 'inset(0 0 100% 0)', bottom: 'inset(100% 0 0 0)' }[a.dir] || 'inset(0 100% 0 0)';
    const full = 'inset(0 0 0 0)';
    switch (a.effect) {
      case 'appear': return { kf: [{ opacity: 0 }, { opacity: 1 }], dur: 1 };
      case 'fade': return { kf: [{ opacity: 0 }, { opacity: 1 }] };
      case 'flyin': { const o = off(a.dir, true); return { kf: [{ transform: 'translate(' + o[0] + 'px,' + o[1] + 'px) ' + rot }, { transform: base }] }; }
      case 'wipe': return { kf: [{ clipPath: wipeFrom }, { clipPath: full }] };
      case 'zoom': return { kf: [{ transform: R + 'scale(.1)', opacity: 0 }, { transform: R + 'scale(1)', opacity: 1 }] };
      case 'float': { const o = off(a.dir, false); return { kf: [{ transform: 'translate(' + o[0] + 'px,' + o[1] + 'px) ' + rot, opacity: 0 }, { transform: base, opacity: 1 }] }; }
      case 'pulse': return { kf: [{ transform: R + 'scale(1)' }, { transform: R + 'scale(1.15)' }, { transform: R + 'scale(1)' }] };
      case 'spin': return { kf: [{ transform: R + 'rotate(0deg)' }, { transform: R + 'rotate(' + (a.amount || 360) + 'deg)' }] };
      case 'growshrink': return { kf: [{ transform: R + 'scale(1)' }, { transform: R + 'scale(' + (a.amount || 1.5) + ')' }], fill: 'forwards' };
      case 'teeter': return { kf: [0, -8, 8, -8, 8, 0].map((d) => ({ transform: R + 'rotate(' + d + 'deg)' })) };
      case 'blink': return { kf: [1, 0, 1, 0, 1].map((o) => ({ opacity: o })) };
      case 'disappear': return { kf: [{ opacity: 1 }, { opacity: 0 }], dur: 1 };
      case 'fadeout': return { kf: [{ opacity: 1 }, { opacity: 0 }] };
      case 'flyout': { const o = off(a.dir, true); return { kf: [{ transform: base }, { transform: 'translate(' + o[0] + 'px,' + o[1] + 'px) ' + rot }] }; }
      case 'wipeout': return { kf: [{ clipPath: full }, { clipPath: { left: 'inset(0 0 0 100%)', right: 'inset(0 100% 0 0)', top: 'inset(100% 0 0 0)', bottom: 'inset(0 0 100% 0)' }[a.dir] || 'inset(0 0 0 100%)' }] };
      case 'zoomout': return { kf: [{ transform: R + 'scale(1)', opacity: 1 }, { transform: R + 'scale(.1)', opacity: 0 }] };
      case 'floatout': { const o = off(a.dir, false); return { kf: [{ transform: base, opacity: 1 }, { transform: 'translate(' + o[0] + 'px,' + o[1] + 'px) ' + rot, opacity: 0 }] }; }
      default: return { kf: [{ opacity: 0 }, { opacity: 1 }] };
    }
  }
  // plays one animation group (entrance shows, emphasis wiggles, exit hides) inside a rendered slide
  function playGroup(layer, group, slide) {
    const W = E.pres.W, H = E.pres.H;
    Q.groupTimeline(group).forEach((t) => {
      const a = t.entry, d = layer.querySelector('[data-sid="' + a.shapeId + '"]'), sh = slide.shapes.find((x) => x.id === a.shapeId);
      if (!d || !sh) return;
      const cat = Q.animCategory(a.effect), spec = effectSpec(a, sh, W, H, d.style.transform || '');
      if (cat === 'entrance') { d.style.visibility = 'visible'; delete d.dataset.hidden; }
      const dur = Math.max(1, spec.dur != null ? spec.dur : t.dur * 1000), delay = t.at * 1000;
      if (d.animate) d.animate(spec.kf, { duration: dur, delay, fill: spec.fill || (cat === 'entrance' ? 'backwards' : cat === 'exit' ? 'both' : 'none'), easing: 'ease-out' });
      if (cat === 'exit') d._exitTimer = setTimeout(() => { d.style.visibility = 'hidden'; d.dataset.hidden = '1'; }, delay + dur + 20);
    });
  }
  function unplayGroup(layer, group) {
    group.entries.forEach((a) => {
      const d = layer.querySelector('[data-sid="' + a.shapeId + '"]'); if (!d) return;
      const cat = Q.animCategory(a.effect); clearTimeout(d._exitTimer);
      if (d.getAnimations) d.getAnimations().forEach((x) => x.cancel());
      if (cat === 'entrance') { d.style.visibility = 'hidden'; d.dataset.hidden = '1'; } else if (cat === 'exit') { d.style.visibility = 'visible'; delete d.dataset.hidden; }
    });
  }

  // ================= slide transitions =================
  const VEC = (w, h) => ({ left: [-w, 0], right: [w, 0], top: [0, -h], bottom: [0, h] });
  const WIPE_FROM = { left: 'inset(0 100% 0 0)', right: 'inset(0 0 0 100%)', top: 'inset(0 0 100% 0)', bottom: 'inset(100% 0 0 0)' };
  const trPx = (v) => v[0] + 'px ' + v[1] + 'px';
  // old/new layers are absolutely positioned elements; size = visible size in pixels. Returns the duration in ms (0 = instant)
  function runTransition(oldL, newL, tr, size, oldSlide, newSlide) {
    const type = (tr && tr.type) || 'none', dur = Math.max(0, ((tr && tr.dur) || 0) * 1000), dir = (tr && tr.dir) || 'left';
    if (!oldL || !newL.animate || type === 'none' || type === 'cut' || dur < 20) { if (oldL) oldL.remove(); return 0; }
    const v = VEC(size.w, size.h), o = { duration: dur, easing: 'ease-in-out', fill: 'both' };
    const opp = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' };
    if (type === 'fade') {
      if (dir === 'black') {
        oldL.animate([{ opacity: 1 }, { opacity: 0 }], { duration: dur / 2, fill: 'forwards' });
        newL.animate([{ opacity: 0 }, { opacity: 1 }], { duration: dur / 2, delay: dur / 2, fill: 'both' });
      } else newL.animate([{ opacity: 0 }, { opacity: 1 }], o);
    } else if (type === 'push') {
      const a = v[dir] || v.left, b = v[opp[dir]] || v.right;
      newL.animate([{ translate: trPx(a) }, { translate: '0px 0px' }], o); oldL.animate([{ translate: '0px 0px' }, { translate: trPx(b) }], o);
    } else if (type === 'cover') {
      newL.style.zIndex = 2; oldL.style.zIndex = 1; newL.animate([{ translate: trPx(v[dir] || v.left) }, { translate: '0px 0px' }], o);
    } else if (type === 'uncover') {
      oldL.style.zIndex = 2; newL.style.zIndex = 1; oldL.animate([{ translate: '0px 0px' }, { translate: trPx(v[dir] || v.left) }], o);
    } else if (type === 'wipe') {
      newL.animate([{ clipPath: WIPE_FROM[dir] || WIPE_FROM.left }, { clipPath: 'inset(0 0 0 0)' }], o);
    } else if (type === 'zoom') {
      newL.animate([{ clipPath: 'inset(50% 50% 50% 50%)', opacity: 0.2 }, { clipPath: 'inset(0 0 0 0)', opacity: 1 }], o);
    } else if (type === 'split') {
      newL.animate([{ clipPath: dir === 'vertical' ? 'inset(50% 0 50% 0)' : 'inset(0 50% 0 50%)' }, { clipPath: 'inset(0 0 0 0)' }], o);
    } else if (type === 'morph') {
      runMorph(oldL, newL, oldSlide, newSlide, dur); return dur;
    }
    setTimeout(() => oldL.remove(), dur + 30);
    return dur;
  }
  function matchShape(oldSlide, ns, used) {
    if (!oldSlide) return null;
    const free = (x) => !used.has(x.id);
    return oldSlide.shapes.find((x) => free(x) && x.id === ns.id) ||
      oldSlide.shapes.find((x) => free(x) && x.type === ns.type && ns.text && x.text === ns.text) ||
      oldSlide.shapes.find((x) => free(x) && x.type === ns.type && ns.ph && x.ph === ns.ph) || null;
  }
  // Morph: shapes that exist on both slides glide from their old position/size to the new one; the rest fade in
  function runMorph(oldL, newL, oldSlide, newSlide, dur) {
    const used = new Set(), o = { duration: dur, easing: 'ease-in-out', fill: 'backwards' };
    newL.animate([{ opacity: 0 }, { opacity: 1 }], { duration: dur * 0.3, fill: 'backwards' });
    oldL.animate([{ opacity: 1 }, { opacity: 0 }], { duration: dur, fill: 'forwards' });
    (newSlide ? newSlide.shapes : []).forEach((ns) => {
      const d = newL.querySelector('[data-sid="' + ns.id + '"]'); if (!d) return;
      const os = matchShape(oldSlide, ns, used);
      if (os) {
        used.add(os.id);
        d.animate([{ left: os.x + 'px', top: boxTop(os) + 'px', width: os.w + 'px', height: boxH(os) + 'px', transform: 'rotate(' + (os.rot || 0) + 'deg)' },
          { left: ns.x + 'px', top: boxTop(ns) + 'px', width: ns.w + 'px', height: boxH(ns) + 'px', transform: 'rotate(' + (ns.rot || 0) + 'deg)' }], o);
      } else d.animate([{ opacity: 0 }, { opacity: 1 }], o);
    });
    setTimeout(() => oldL.remove(), dur + 30);
  }
  function previewTransition() {
    const idx = E.cur, tr = E.slide().transition; if (tr.type === 'none') return;
    const stage = $('stage'); if (!stage.querySelector('.sl-slide')) return;
    const z = E.z(), pres = E.pres, size = { w: pres.W * z, h: pres.H * z };
    const ov = el('div', 'tr-preview'); ov.style.cssText = 'position:absolute;inset:0;overflow:hidden;z-index:5;background:#000';
    const mk = (slide) => { const w = el('div', 'pv-layer'); w.style.cssText = 'position:absolute;inset:0;overflow:hidden'; if (slide) { const sl = E.renderSlide(pres, slide, {}); sl.style.transform = 'scale(' + z + ')'; w.appendChild(sl); } else w.style.background = '#000'; return w; };
    const oldSlide = idx > 0 ? pres.slides[idx - 1] : null, oldL = mk(oldSlide), newL = mk(pres.slides[idx]); newL.style.zIndex = 1;
    ov.appendChild(oldL); ov.appendChild(newL); stage.appendChild(ov);
    const ms = runTransition(oldL, newL, tr, size, oldSlide, pres.slides[idx]);
    setTimeout(() => ov.remove(), Math.max(ms, 50) + 250);
  }
  function previewAnimations() {
    const slide = E.slide(); const groups = Q.animGroups(slide); if (!groups.length) return;
    E.select([]);
    const sl = $('stage').querySelector('.sl-slide'); if (!sl) return;
    const first = {}; slide.anims.forEach((a) => { if (!(a.shapeId in first)) first[a.shapeId] = a; });
    Object.keys(first).forEach((id) => { if (Q.animCategory(first[id].effect) === 'entrance') { const d = sl.querySelector('[data-sid="' + id + '"]'); if (d) d.style.visibility = 'hidden'; } });
    let delay = 300;
    groups.forEach((g) => {
      let end = 0; setTimeout(() => playGroup(sl, g, slide), delay);
      Q.groupTimeline(g).forEach((t) => { end = Math.max(end, t.at + t.dur); });
      delay += end * 1000 + 400;
    });
    setTimeout(() => E.renderCanvas(), delay + 200);
    QUI.previewMs = delay + 200;
  }

  // ================= slide show (full screen), presenter view, audience window, rehearsal =================
  let show = null;
  const AUDIENCE = new URLSearchParams(location.search).has('audience');
  if (AUDIENCE) window.__QUADRA_NOSAVE = true;
  const fmtTime = (sec) => { sec = Math.max(0, Math.round(sec)); return String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0'); };
  const FILLERS = /\b(um+|uh+|er+m?|ah+|like|basically|actually|literally|you know)\b/gi;
  function startShow(from, opts) {
    opts = opts || {};
    if (E.showActive) return;
    E.stopEdit(); closeMenus();
    const root = $('showRoot'); root.hidden = false; root.textContent = ''; root.classList.toggle('presenter', !!opts.presenter);
    E.showActive = true;
    const pres = E.pres, state = new Q.ShowState(pres, from, opts.order);
    const S = show = { state, layer: null, usedFs: false, endShown: false, opts, t0: Date.now(), paused: false, pausedAt: 0, pausedTotal: 0, advTimer: 0, ticker: 0, noteSize: 22, ch: null, aud: null };
    let host = root;
    if (opts.presenter) {
      root.innerHTML = '<div class="pr-grid"><div class="pr-top"><span class="pr-time" id="prTime">00:00</span><span class="pr-count" id="prCount"></span><span class="pr-spacer"></span><button class="pr-btn" data-pr="pause">Pause</button><button class="pr-btn" data-pr="reset">Reset timer</button></div>' +
        '<div class="pr-main" id="prMain"></div><div class="pr-side"><div class="pr-label">Next slide</div><div class="pr-next" id="prNext"></div><div class="pr-label">Notes <span class="pr-notes-size"><button class="pr-btn sm" data-pr="notesDown" aria-label="Smaller text">A−</button><button class="pr-btn sm" data-pr="notesUp" aria-label="Larger text">A+</button></span></div><div class="pr-notes" id="prNotes"></div></div>' +
        '<div class="pr-bar"><button class="pr-btn" data-pr="prev">Previous</button><button class="pr-btn" data-pr="next">Next</button><button class="pr-btn" data-pr="audience">Audience window</button><span class="pr-spacer"></span><button class="pr-btn end" data-pr="end">End show</button></div></div>';
      host = $('prMain');
    }
    S.host = host;
    if (opts.rehearse) {
      S.rec = { slideTimes: {}, cur: Date.now(), words: 0, fillers: {}, speech: false };
      const hud = el('div', 're-hud'); hud.id = 'reHud'; hud.innerHTML = '<span id="reTime">00:00</span><span id="reSlide">slide 00:00</span><span id="reWpm"></span><button class="pr-btn sm" data-re="stop">Stop</button>'; root.appendChild(hud);
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SR) {
        try {
          const r = new SR(); S.rec.sr = r; r.lang = dictLang; r.continuous = true; r.interimResults = false; S.rec.speech = true;
          r.onresult = (ev) => {
            for (let k = ev.resultIndex; k < ev.results.length; k++) {
              if (!ev.results[k].isFinal) continue; const t = ev.results[k][0].transcript || '';
              S.rec.words += (t.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;
              (t.match(FILLERS) || []).forEach((f) => { const key = f.toLowerCase(); S.rec.fillers[key] = (S.rec.fillers[key] || 0) + 1; });
            }
          };
          r.onend = () => { if (show === S && S.rec.sr === r) { try { r.start(); } catch (e) { /* ignore */ } } };
          r.onerror = () => { /* keep timing even if speech fails */ };
          r.start();
        } catch (e) { S.rec.speech = false; }
      }
    }
    const area = () => (opts.presenter ? { w: host.clientWidth || 640, h: host.clientHeight || 360 } : { w: window.innerWidth, h: window.innerHeight });
    const place = (layer) => { const a = area(), s = Math.min(a.w / pres.W, a.h / pres.H); layer.style.width = pres.W + 'px'; layer.style.height = pres.H + 'px'; layer.style.transform = 'translate(' + (-pres.W * s / 2) + 'px,' + (-pres.H * s / 2) + 'px) scale(' + s + ')'; };
    const elapsed = () => ((S.paused ? S.pausedAt : Date.now()) - S.t0 - S.pausedTotal) / 1000;
    const slideObj = () => pres.slides[state.i];
    const hiddenNow = () => new Set(state.hiddenIds());
    function broadcast(full) {
      if (!S.ch || show !== S) return;
      const msg = { type: full ? 'full' : 'nav', i: state.i, hidden: Array.from(hiddenNow()) };
      if (full) msg.doc = pres.toJSON();
      S.ch.postMessage(msg);
    }
    function updatePanels() {
      if (!opts.presenter) return;
      $('prCount').textContent = 'Slide ' + (state.pos + 1) + ' of ' + state.order.length;
      const n = $('prNotes'); n.textContent = slideObj().notes.trim() || 'No notes for this slide.'; n.classList.toggle('empty', !slideObj().notes.trim()); n.style.fontSize = S.noteSize + 'px';
      const nx = $('prNext'); nx.textContent = '';
      if (state.isLast()) { nx.innerHTML = '<div class="pr-end">End of slide show</div>'; }
      else { const ns = pres.slides[state.order[state.pos + 1]], w = 300, box = el('div'); box.style.cssText = 'position:relative;width:' + w + 'px;height:' + Math.round(w * pres.H / pres.W) + 'px;overflow:hidden'; const sl = E.renderSlide(pres, ns, {}); sl.style.transform = 'scale(' + (w / pres.W) + ')'; box.appendChild(sl); nx.appendChild(box); }
    }
    function tickHud() {
      if (opts.presenter) $('prTime').textContent = fmtTime(elapsed());
      if (opts.rehearse) {
        const r = S.rec, now = Date.now(), total = (now - S.t0) / 1000;
        $('reTime').textContent = 'total ' + fmtTime(total); $('reSlide').textContent = 'slide ' + fmtTime((now - r.cur) / 1000 + (r.slideTimes[state.i] || 0));
        $('reWpm').textContent = r.speech ? (r.words && total > 5 ? Math.round(r.words / (total / 60)) + ' wpm' : 'listening…') : 'no speech analysis';
      }
    }
    S.ticker = setInterval(tickHud, 500);
    function recordSlideTime(idx) { if (!S.rec) return; const now = Date.now(); S.rec.slideTimes[idx] = (S.rec.slideTimes[idx] || 0) + (now - S.rec.cur) / 1000; S.rec.cur = now; }
    function scheduleAdvance() {
      clearTimeout(S.advTimer);
      const adv = slideObj().advance;
      if (pres.show.useTimings && adv && adv.after > 0 && !opts.rehearse && !S.endShown) S.advTimer = setTimeout(() => { const gs = state.groups(); state.g = gs.length; state.auto = []; next(true); }, adv.after * 1000);
    }
    function mount(tr, oldIdx) {
      const layer = el('div', 'show-layer'); layer.dataset.slideIndex = state.i;
      const slide = slideObj();
      layer.appendChild(E.renderSlide(pres, slide, { hidden: hiddenNow() }));
      place(layer); host.appendChild(layer);
      const old = S.layer; S.layer = layer;
      if (old && tr) runTransition(old, layer, tr, area(), pres.slides[oldIdx], slide); else if (old) old.remove();
      if (state.auto.length) { playGroup(layer, { entries: state.auto }, slide); state.autoDone(); }
      updatePanels(); broadcast(false); scheduleAdvance();
    }
    function clearEnd() { const e = root.querySelector('.show-end'); if (e) e.remove(); S.endShown = false; }
    function next(auto) {
      if (S.endShown) { stopShow(); return; }
      const oldIdx = state.i, r = state.next();
      if (r.kind === 'anim') { playGroup(S.layer, r.group, slideObj()); updatePanels(); broadcast(false); }
      else if (r.kind === 'slide') { recordSlideTime(oldIdx); mount(r.transition, oldIdx); }
      else if (r.kind === 'end') {
        if (pres.show.loop && !opts.rehearse) { recordSlideTime(oldIdx); state.restart(); mount({ type: 'fade', dur: 0.4 }, oldIdx); }
        else { const e = el('div', 'show-end'); e.textContent = 'End of slide show, click to exit.'; root.appendChild(e); S.endShown = true; clearTimeout(S.advTimer); }
      }
    }
    function prev() {
      if (S.endShown) { clearEnd(); scheduleAdvance(); return; }
      const oldIdx = state.i, r = state.prev();
      if (r.kind === 'unanim') { unplayGroup(S.layer, r.group); updatePanels(); broadcast(false); }
      else if (r.kind === 'slide') { recordSlideTime(oldIdx); mount(null, oldIdx); }
    }
    S.next = next; S.prev = prev;
    function onKey(ev) {
      const k = ev.key;
      if (k === 'Escape') stopShow();
      else if (['ArrowRight', 'ArrowDown', ' ', 'Enter', 'PageDown', 'n', 'N'].indexOf(k) >= 0) next();
      else if (['ArrowLeft', 'ArrowUp', 'Backspace', 'PageUp', 'p', 'P'].indexOf(k) >= 0) prev();
      else if (k === 'Home') { clearEnd(); const o = state.i; state.restart(); mount(null, o); }
      else if (k === 'End') { clearEnd(); const o = state.i; state.pos = state.order.length - 1; state.i = state.order[state.pos]; state._enter(true); mount(null, o); }
      else return;
      ev.preventDefault(); ev.stopPropagation();
    }
    S.onKey = onKey;
    S.onClick = (ev) => {
      const pr = ev.target.closest('[data-pr]'), re = ev.target.closest('[data-re]');
      if (re) { stopShow(); return; }
      if (pr) {
        const a = pr.dataset.pr;
        if (a === 'prev') prev(); else if (a === 'next') next(); else if (a === 'end') stopShow();
        else if (a === 'pause') { if (S.paused) { S.pausedTotal += Date.now() - S.pausedAt; S.paused = false; pr.textContent = 'Pause'; } else { S.paused = true; S.pausedAt = Date.now(); pr.textContent = 'Resume'; } tickHud(); }
        else if (a === 'reset') { S.t0 = Date.now(); S.pausedTotal = 0; S.pausedAt = Date.now(); tickHud(); }
        else if (a === 'notesUp' || a === 'notesDown') { S.noteSize = Q.clamp(S.noteSize + (a === 'notesUp' ? 2 : -2), 12, 48); updatePanels(); }
        else if (a === 'audience') openAudience();
        return;
      }
      if (opts.presenter && !ev.target.closest('#prMain')) return;
      if (ev.target.closest('video,audio')) return;
      const l = ev.target.closest('[data-link]');
      if (l) {
        if (l.dataset.link === 'url') { window.open(l.dataset.linkTarget, '_blank', 'noopener,noreferrer'); return; }
        if (l.dataset.link === 'slide') { clearEnd(); const o = state.i; if (!state.goTo(Number(l.dataset.linkTarget))) state.i = Number(l.dataset.linkTarget); mount(null, o); return; }
      }
      if (slideObj().advance && slideObj().advance.click === false) return; // this slide advances only by its timing
      next();
    };
    S.onCtx = (ev) => { ev.preventDefault(); prev(); };
    S.onResize = () => { if (S.layer) place(S.layer); };
    S.onFs = () => { if (S.usedFs && !document.fullscreenElement) stopShow(); };
    function openAudience() {
      if (!window.BroadcastChannel) { showDialog({ title: 'Audience window', body: '<p>This browser cannot link two windows.</p>' }); return; }
      if (!S.ch) { S.ch = new BroadcastChannel('quadra-show'); S.ch.onmessage = (m) => { if (m.data && m.data.type === 'hello') broadcast(true); }; }
      S.aud = window.open(location.href.split('?')[0].split('#')[0] + '?audience=1', 'quadra-audience', 'popup=yes,width=960,height=540');
      setTimeout(() => broadcast(true), 600);
    }
    S.openAudience = openAudience;
    document.addEventListener('keydown', onKey, true); root.addEventListener('click', S.onClick); root.addEventListener('contextmenu', S.onCtx);
    window.addEventListener('resize', S.onResize); document.addEventListener('fullscreenchange', S.onFs);
    mount(null, state.i); tickHud();
    if (!opts.presenter && root.requestFullscreen) root.requestFullscreen().then(() => { if (show) show.usedFs = document.fullscreenElement === root; else if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {}); }).catch(() => { /* fullscreen not allowed: stay in the page */ });
  }
  function stopShow() {
    if (!show) return;
    const root = $('showRoot'), s = show; show = null;
    clearTimeout(s.advTimer); clearInterval(s.ticker);
    document.removeEventListener('keydown', s.onKey, true); root.removeEventListener('click', s.onClick); root.removeEventListener('contextmenu', s.onCtx);
    window.removeEventListener('resize', s.onResize); document.removeEventListener('fullscreenchange', s.onFs);
    if (s.ch) { const ch = s.ch; s.ch = null; ch.postMessage({ type: 'close' }); ch.close(); }
    let rec = null;
    if (s.rec) {
      const now = Date.now(); s.rec.slideTimes[s.state.i] = (s.rec.slideTimes[s.state.i] || 0) + (now - s.rec.cur) / 1000;
      if (s.rec.sr) { const r = s.rec.sr; s.rec.sr = null; try { r.onend = null; r.stop(); } catch (e) { /* ignore */ } }
      rec = s.rec; rec.total = (now - s.t0) / 1000;
    }
    root.hidden = true; root.textContent = ''; root.classList.remove('presenter'); E.showActive = false;
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    E.selectSlide(s.state.i, true);
    if (rec) rehearsalReport(rec);
  }
  QUI.startShow = startShow; QUI.stopShow = stopShow; QUI.showState = () => (show ? show.state : null);
  document.addEventListener('keydown', (ev) => {
    if (E.showActive) return;
    if (ev.key === 'F5') { ev.preventDefault(); startShow(ev.shiftKey ? E.cur : 0); }
  });

  function rehearsalReport(rec) {
    const visited = Object.keys(rec.slideTimes).map(Number).filter((i) => E.pres.slides[i]).sort((a, b) => a - b);
    const total = rec.total || visited.reduce((a, i) => a + rec.slideTimes[i], 0);
    const wpm = rec.speech && rec.words && total > 0 ? Math.round(rec.words / (total / 60)) : null;
    const fillerTotal = Object.keys(rec.fillers).reduce((a, k) => a + rec.fillers[k], 0);
    const tips = [];
    if (wpm == null) tips.push(rec.speech ? 'No speech was recognised. Check the microphone and speak while rehearsing.' : 'Speech analysis needs Chrome or Edge with a microphone. Timing was still recorded.');
    else if (wpm > 170) tips.push('You spoke quickly (' + wpm + ' words per minute). Aim for about 120–160.');
    else if (wpm < 100) tips.push('Your pace was slow (' + wpm + ' words per minute). Aim for about 120–160.');
    else tips.push('Good pace: ' + wpm + ' words per minute.');
    if (fillerTotal) tips.push('Filler words: ' + Object.keys(rec.fillers).map((k) => '“' + k + '” ×' + rec.fillers[k]).join(', ') + '.');
    else if (wpm != null) tips.push('No filler words detected.');
    const longest = visited.slice().sort((a, b) => rec.slideTimes[b] - rec.slideTimes[a])[0];
    if (longest != null && visited.length > 1 && rec.slideTimes[longest] > total * 0.5) tips.push('Slide ' + (longest + 1) + ' took more than half of the time.');
    const body = el('div'); body.id = 'rehearseReport';
    body.innerHTML = '<p><b>Total time:</b> <span id="rpTotal">' + fmtTime(total) + '</span> · <b>Slides:</b> ' + visited.length + (wpm != null ? ' · <b>Pace:</b> <span id="rpWpm">' + wpm + '</span> wpm' : '') + '</p>' +
      '<table class="kbd-table" id="rpTable">' + visited.map((i) => '<tr data-slide="' + i + '"><td>Slide ' + (i + 1) + '</td><td>' + fmtTime(rec.slideTimes[i]) + '</td></tr>').join('') + '</table><ul class="issues" id="rpTips">' + tips.map((t) => '<li>' + esc(t) + '</li>').join('') + '</ul>';
    showDialog({ title: 'Rehearsal report', wide: true, body, buttons: [{ label: 'Close' }, { label: 'Save timings', primary: true, act: 'saveTimings', run: () => {
      E.mutate(() => { visited.forEach((i) => E.pres.setAdvance(i, { after: Math.max(1, Math.round(rec.slideTimes[i])) })); E.pres.setShowOptions({ useTimings: true }); }, 'meta');
    } }] });
  }

  // audience window (opened by the presenter view)
  function startAudience() {
    document.body.classList.add('audience'); E.showActive = true;
    const root = $('showRoot'); root.hidden = false; root.textContent = '';
    let pres = null, layer = null, last = null;
    const render = () => {
      if (!pres || !last) return;
      const slide = pres.slides[last.i]; if (!slide) return;
      if (layer) layer.remove();
      layer = el('div', 'show-layer'); layer.dataset.slideIndex = last.i;
      layer.appendChild(E.renderSlide(pres, slide, { hidden: new Set(last.hidden) }));
      const s = Math.min(window.innerWidth / pres.W, window.innerHeight / pres.H);
      layer.style.width = pres.W + 'px'; layer.style.height = pres.H + 'px'; layer.style.transform = 'translate(' + (-pres.W * s / 2) + 'px,' + (-pres.H * s / 2) + 'px) scale(' + s + ')';
      root.appendChild(layer);
    };
    const ch = new BroadcastChannel('quadra-show');
    ch.onmessage = (m) => {
      const d = m.data || {};
      if (d.type === 'full') { pres = Q.Presentation.fromJSON(d.doc); last = d; render(); }
      else if (d.type === 'nav') { last = d; render(); }
      else if (d.type === 'close') window.close();
    };
    const hello = setInterval(() => { if (pres) clearInterval(hello); else ch.postMessage({ type: 'hello' }); }, 400); ch.postMessage({ type: 'hello' });
    window.addEventListener('resize', render);
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') window.close(); });
    root.innerHTML = '<div class="show-end">Waiting for the presenter…</div>';
  }

  // animation pane (live list of the slide's animations)
  let selAnimId = null;
  const selAnim = () => {
    if (!E.sel.length) return null; const list = E.pres.getAnims(E.cur, E.sel[0]); if (!list.length) return null;
    return list.find((a) => a.id === selAnimId) || list[0];
  };
  const effName = (e) => (Q.ANIM_INFO[e] ? Q.ANIM_INFO[e].name : e);
  function effectMenuItems(onPick) {
    const out = [];
    [['entrance', 'Entrance'], ['emphasis', 'Emphasis'], ['exit', 'Exit']].forEach((c) => {
      out.push({ head: c[1] });
      Object.keys(Q.ANIM_INFO).filter((k) => Q.ANIM_INFO[k].cat === c[0]).forEach((k) => out.push({ label: Q.ANIM_INFO[k].name, id: 'eff-' + k, icon: c[0] === 'entrance' ? 'an-appear' : c[0] === 'emphasis' ? 'an-fade' : 'an-none', run: () => onPick(k) }));
    });
    return out;
  }
  function animPaneDialog() {
    const body = el('div'); body.id = 'animPane';
    const draw = () => {
      const s = E.slide();
      if (!s.anims.length) { body.innerHTML = '<p id="animPaneEmpty">This slide has no animations. Select a shape and pick an effect on the Animations tab.</p>'; return; }
      const starts = { onclick: 'On Click', withprev: 'With Previous', afterprev: 'After Previous' };
      body.innerHTML = '<table class="kbd-table" id="animPaneTable">' + s.anims.map((a, k) => '<tr data-anim="' + a.id + '"' + (selAnim() && selAnim().id === a.id ? ' class="sel"' : '') + '><td>' + (k + 1) + '</td><td>' + esc(shapeLabel(E.shape(a.shapeId))) + '</td><td>' + esc(effName(a.effect)) + '<br><small>' + Q.animCategory(a.effect) + '</small></td><td><select data-start="' + a.id + '">' + Object.keys(starts).map((v) => '<option value="' + v + '"' + (a.start === v ? ' selected' : '') + '>' + starts[v] + '</option>').join('') + '</select></td><td style="white-space:nowrap"><button class="btn" data-up="' + a.id + '" aria-label="Move up" style="min-width:34px;padding:0">↑</button> <button class="btn" data-down="' + a.id + '" aria-label="Move down" style="min-width:34px;padding:0">↓</button> <button class="btn" data-rm="' + a.id + '" aria-label="Remove" style="min-width:34px;padding:0">✕</button></td></tr>').join('') + '</table>';
    };
    draw();
    body.addEventListener('click', (ev) => {
      const t = ev.target;
      const act = (fn) => { fn(); draw(); };
      if (t.closest('[data-up]')) act(() => E.mutate(() => E.pres.moveAnim(E.cur, t.closest('[data-up]').dataset.up, -1), 'meta'));
      else if (t.closest('[data-down]')) act(() => E.mutate(() => E.pres.moveAnim(E.cur, t.closest('[data-down]').dataset.down, 1), 'meta'));
      else if (t.closest('[data-rm]')) act(() => E.mutate(() => E.pres.removeAnim(E.cur, t.closest('[data-rm]').dataset.rm), 'meta'));
      else if (t.tagName !== 'SELECT' && t.closest('[data-anim]')) { const a = E.slide().anims.find((x) => x.id === t.closest('[data-anim]').dataset.anim); if (a) { selAnimId = a.id; E.select([a.shapeId]); draw(); } }
    });
    body.addEventListener('change', (ev) => { const s = ev.target.closest('[data-start]'); if (s) { E.mutate(() => E.pres.updateAnim(E.cur, s.dataset.start, { start: s.value }), 'meta'); draw(); } });
    const dlg = showDialog({ title: 'Animation Pane', wide: true, body, buttons: [{ label: 'Play', act: 'animPlay', run: () => { dlg.close(); previewAnimations(); return false; } }, { label: 'Close', primary: true }] });
  }

  // custom shows
  function customMenu(b) {
    const items = E.pres.customShows.map((c) => ({ label: c.name, id: 'cs-play-' + c.id, icon: 'play', run: () => startShow(0, { order: E.pres.customOrder(c.id) }) }));
    if (items.length) items.push({ sep: true });
    items.push({ label: 'Custom Shows…', id: 'cs-manage', run: customManager });
    openMenu(b, items);
  }
  function customManager() {
    const body = el('div');
    const draw = () => {
      const cs = E.pres.customShows;
      body.innerHTML = (cs.length ? '<table class="kbd-table" id="csTable">' + cs.map((c) => '<tr data-cs="' + c.id + '"><td>' + esc(c.name) + '</td><td>' + E.pres.customOrder(c.id).length + ' slides</td><td style="white-space:nowrap"><button class="btn" data-cs-show="' + c.id + '">Show</button> <button class="btn" data-cs-edit="' + c.id + '">Edit</button> <button class="btn" data-cs-del="' + c.id + '">Delete</button></td></tr>').join('') + '</table>' : '<p id="csEmpty">No custom shows yet. A custom show plays only the slides you choose, in the order you choose.</p>');
    };
    draw();
    body.addEventListener('click', (ev) => {
      const sh = ev.target.closest('[data-cs-show]'), ed = ev.target.closest('[data-cs-edit]'), de = ev.target.closest('[data-cs-del]');
      if (sh) { const id = sh.dataset.csShow; dlg.close(); startShow(0, { order: E.pres.customOrder(id) }); }
      else if (ed) { dlg.close(); customEditor(ed.dataset.csEdit); }
      else if (de) { E.mutate(() => E.pres.removeCustomShow(de.dataset.csDel), 'meta'); draw(); }
    });
    const dlg = showDialog({ title: 'Custom Shows', wide: true, body, buttons: [{ label: 'New…', act: 'csNew', run: () => { customEditor(null); } }, { label: 'Close', primary: true }] });
  }
  function customEditor(id) {
    const ex = id ? E.pres.customShows.find((c) => c.id === id) : null;
    const all = E.pres.slides.map((s) => s.id);
    let list = ex ? ex.slides.filter((x) => all.indexOf(x) >= 0).concat(all.filter((x) => ex.slides.indexOf(x) < 0)) : all.slice();
    const chosen = new Set(ex ? ex.slides : all);
    const body = el('div');
    const title = (sid) => { const k = E.pres.slides.findIndex((s) => s.id === sid), sl = E.pres.slides[k], t = sl.shapes.find((x) => x.ph === 'title'); return (k + 1) + '. ' + ((t && t.text.trim()) || '(no title)'); };
    const draw = () => {
      body.innerHTML = '<label class="row">Name <input type="text" id="csName" maxlength="60" value="' + esc(ex ? ex.name : '') + '"></label><div id="csList" style="max-height:260px;overflow:auto">' + list.map((sid, k) => '<div class="row" data-sid="' + sid + '" style="display:flex;gap:6px;align-items:center;margin:3px 0"><input type="checkbox" data-pick="' + sid + '"' + (chosen.has(sid) ? ' checked' : '') + '><span style="flex:1">' + esc(title(sid)) + '</span><button class="btn" data-mv="up" data-i="' + k + '" style="min-width:32px;padding:0" aria-label="Move up">↑</button><button class="btn" data-mv="down" data-i="' + k + '" style="min-width:32px;padding:0" aria-label="Move down">↓</button></div>').join('') + '</div><p id="csErr" style="color:var(--ic-red)"></p>';
    };
    draw();
    body.addEventListener('change', (ev) => { const p = ev.target.closest('[data-pick]'); if (p) { if (p.checked) chosen.add(p.dataset.pick); else chosen.delete(p.dataset.pick); } });
    body.addEventListener('click', (ev) => {
      const m = ev.target.closest('[data-mv]'); if (!m) return;
      const name = body.querySelector('#csName').value; const k = Number(m.dataset.i), to = m.dataset.mv === 'up' ? k - 1 : k + 1;
      if (to < 0 || to >= list.length) return; const t = list[k]; list[k] = list[to]; list[to] = t; draw(); body.querySelector('#csName').value = name;
    });
    showDialog({ title: ex ? 'Edit custom show' : 'New custom show', wide: true, body, buttons: [{ label: 'Cancel' }, { label: 'OK', primary: true, act: 'csOk', run: () => {
      const name = body.querySelector('#csName').value.trim(), ids = list.filter((s) => chosen.has(s));
      if (!name || !ids.length) { body.querySelector('#csErr').textContent = 'Enter a name and choose at least one slide.'; return false; }
      E.mutate(() => { if (ex) E.pres.updateCustomShow(ex.id, name, ids); else E.pres.addCustomShow(name, ids); }, 'meta');
    } }] });
  }
  function coachMenu(b) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    openMenu(b, [
      { label: 'Start rehearsing', icon: 'coach', id: 'coach-start', run: () => startShow(0, { rehearse: true }) },
      { label: 'Rehearse from current slide', icon: 'fromcurrent', id: 'coach-current', run: () => startShow(E.cur, { rehearse: true }) },
      { sep: true },
      { label: 'Language', icon: 'dictate', submenu: [['en-US', 'English (US)'], ['en-GB', 'English (UK)'], ['en-IN', 'English (India)'], ['hi-IN', 'Hindi']].map((l) => ({ label: l[1], id: 'coach-' + l[0], check: dictLang === l[0] ? undefined : false, run: () => { dictLang = l[0]; } })) },
      { label: SR ? 'Speech analysis available' : 'Speech analysis unavailable in this browser', disabled: true },
    ]);
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
      buttons: [{ label: 'Cancel' }, { label: 'Post', primary: true, act: 'cmPost', run: (d) => { const t = d.querySelector('#cmText').value.trim(); if (!t) return false; E.mutate(() => E.pres.addComment(E.cur, t, getAuthor()), 'meta'); E.renderCanvas(); } }] });
  }
  function viewComment(k) { commentView(k); }
  function commentsPane() {
    const body = el('div'); let dlg;
    const draw = () => {
      const all = E.pres.allComments(), me = getAuthor();
      body.innerHTML = all.length ? '<table class="kbd-table" id="cmTable">' + all.map((it, k) => '<tr' + (it.comment.resolved ? ' style="opacity:.55"' : '') + '><td>Slide ' + (it.slide + 1) + '</td><td>' + (it.comment.seenBy.indexOf(me) < 0 ? '<b>● </b>' : '') + esc(it.comment.author) + ': ' + esc(it.comment.text) + (it.comment.replies.length ? ' <small>(' + it.comment.replies.length + ' repl' + (it.comment.replies.length > 1 ? 'ies' : 'y') + ')</small>' : '') + (it.comment.resolved ? ' <small>resolved</small>' : '') + '</td><td style="white-space:nowrap"><button class="btn" data-cmopen="' + k + '">Open</button> <button class="btn" data-cmdel="' + k + '">Delete</button></td></tr>').join('') + '</table>' : '<p id="cmEmpty">There are no comments in this presentation.</p>';
    };
    draw();
    body.addEventListener('click', (ev) => {
      const o = ev.target.closest('[data-cmopen]'), b = ev.target.closest('[data-cmdel]');
      if (o) { dlg.close(); commentView(Number(o.dataset.cmopen)); }
      else if (b) { const it = E.pres.allComments()[Number(b.dataset.cmdel)]; if (it) { E.mutate(() => E.pres.removeComment(it.slide, it.comment.id), 'meta'); E.renderCanvas(); draw(); } }
    });
    dlg = showDialog({ title: 'Comments', wide: true, body, buttons: [{ label: 'Close', primary: true }] });
  }

  // ================= display name (comment author, avatar) =================
  const AUTHOR_KEY = 'quadra-ppt:author', CONFIG = Object.assign({ supportEmail: '', version: '4.0' }, window.QUADRA_CONFIG || {});
  const getAuthor = () => { try { return (localStorage.getItem(AUTHOR_KEY) || '').trim() || 'Quadra user'; } catch (e) { return 'Quadra user'; } };
  const initials = (n) => n.trim().split(/\s+/).slice(0, 2).map((w) => w.charAt(0)).join('').toUpperCase() || 'Q';
  function applyAuthor() { const n = getAuthor(); $('profileBtn').textContent = initials(n); $('profileBtn').title = n; E.author = getAuthor; }
  function nameDialog() {
    showDialog({ title: 'Display name', body: '<p>This name is used for your comments and replies.</p><label class="row">Name <input type="text" id="nameInput" maxlength="40"></label>',
      buttons: [{ label: 'Cancel' }, { label: 'Save', primary: true, act: 'nameSave', run: (d) => { const v = d.querySelector('#nameInput').value.trim(); if (!v) return false; try { localStorage.setItem(AUTHOR_KEY, v); } catch (e) { /* ignore */ } applyAuthor(); E.renderCanvas(); scheduleRefresh(); } }] });
    $('nameInput').value = getAuthor(); $('nameInput').select();
  }
  function clearLocalData() {
    confirmDialog('Clear local data', 'This deletes every presentation, version, setting and feedback note stored by Quadra PowerPoint in this browser. Download anything you want to keep first. Continue?', 'Delete everything', () => {
      window.__QUADRA_NOSAVE = true;
      try { Object.keys(localStorage).filter((k) => k.indexOf('quadra-ppt:') === 0).forEach((k) => localStorage.removeItem(k)); } catch (e) { /* ignore */ }
      location.reload();
    });
  }

  // ================= proofing: spelling, custom dictionary, review =================
  let spellerP = null;
  function loadSpeller() {
    if (spellerP) return spellerP;
    spellerP = new Promise((res, rej) => {
      const make = () => { try { res(Q.makeSpeller(window.QDICT.aff, window.QDICT.dic)); } catch (e) { spellerP = null; rej(e); } };
      if (window.QDICT) { make(); return; }
      const s = el('script'); s.src = 'assets/dict-en.js'; s.onload = make; s.onerror = () => { spellerP = null; rej(new Error('dictionary')); }; document.head.appendChild(s);
    });
    return spellerP;
  }
  const UD_KEY = 'quadra-ppt:userdict';
  const userDict = () => { try { return new Set(JSON.parse(localStorage.getItem(UD_KEY)) || []); } catch (e) { return new Set(); } };
  const saveUserDict = (set) => { try { localStorage.setItem(UD_KEY, JSON.stringify(Array.from(set))); } catch (e) { /* ignore */ } };
  async function spellingDialog() {
    let sp; try { sp = await loadSpeller(); } catch (e) { showDialog({ title: 'Spelling', body: '<p>The dictionary file (assets/dict-en.js) could not be loaded.</p>' }); return; }
    const session = new Set(), ignored = new Set(); let cur = null;
    const ignoreSet = () => { const s = userDict(); session.forEach((w) => s.add(w)); return s; };
    const key = (o) => [o.slide, o.shapeId, o.field, o.r, o.c, o.index, o.word].join('|');
    const body = el('div'); body.id = 'spellBody';
    let dlg;
    const draw = () => {
      cur = Q.spellIssues(E.pres, sp, ignoreSet()).find((o) => !ignored.has(key(o)));
      const btns = dlg ? dlg.el.querySelectorAll('[data-act^="sp"]') : [];
      if (!cur) { body.innerHTML = '<p id="spDone">Spell check complete. No more possible mistakes.</p>'; btns.forEach((b) => { b.disabled = true; }); return; }
      btns.forEach((b) => { b.disabled = false; });
      if (E.cur !== cur.slide) E.selectSlide(cur.slide);
      if (cur.shapeId) E.select([cur.shapeId]);
      const text = Q.spellText(E.pres, cur), ctx = text.slice(Math.max(0, cur.index - 28), cur.index + cur.word.length + 28).replace(/\n/g, ' ');
      const sug = sp.suggest(cur.word, 6);
      body.innerHTML = '<p>Not in dictionary: <b id="spWord">' + esc(cur.word) + '</b> <span style="color:var(--muted)">(slide ' + (cur.slide + 1) + ')</span></p><p id="spCtx" style="color:var(--muted)">…' + esc(ctx) + '…</p><label class="row">Change to <input type="text" id="spTo" value="' + esc(sug[0] || cur.word) + '"></label><select id="spSugg" size="6" style="width:100%;border:1px solid var(--muted);border-radius:4px;background:var(--panel);color:var(--text)">' + (sug.length ? sug.map((x) => '<option>' + esc(x) + '</option>').join('') : '<option disabled>(no suggestions)</option>') + '</select>';
      body.querySelector('#spSugg').addEventListener('change', (ev) => { body.querySelector('#spTo').value = ev.target.value; });
    };
    const to = () => body.querySelector('#spTo').value.trim();
    dlg = showDialog({ title: 'Spelling', wide: true, body, buttons: [
      { label: 'Ignore', act: 'spIgnore', run: () => { if (cur) ignored.add(key(cur)); draw(); return false; } },
      { label: 'Ignore All', act: 'spIgnoreAll', run: () => { if (cur) session.add(cur.word.toLowerCase()); draw(); return false; } },
      { label: 'Add to Dictionary', act: 'spAdd', run: () => { if (cur) { const u = userDict(); u.add(cur.word.toLowerCase()); saveUserDict(u); } draw(); return false; } },
      { label: 'Change', act: 'spChange', run: () => { if (cur && to()) { const c = cur, r = to(); E.mutate(() => Q.spellReplace(E.pres, c, r)); } draw(); return false; } },
      { label: 'Change All', act: 'spChangeAll', run: () => { if (cur && to()) { const w = cur.word, r = to(); E.mutate(() => Q.spellReplaceAll(E.pres, sp, w, r)); } draw(); return false; } },
      { label: 'Close', primary: true }] });
    draw();
  }
  function customDictDialog() {
    const body = el('div');
    const draw = () => { const w = Array.from(userDict()).sort(); body.innerHTML = w.length ? '<table class="kbd-table" id="udTable">' + w.map((x) => '<tr><td>' + esc(x) + '</td><td><button class="btn" data-ud="' + esc(x) + '">Remove</button></td></tr>').join('') + '</table>' : '<p id="udEmpty">Your custom dictionary is empty. Use "Add to Dictionary" while checking spelling.</p>'; };
    draw(); body.addEventListener('click', (ev) => { const b = ev.target.closest('[data-ud]'); if (!b) return; const u = userDict(); u.delete(b.dataset.ud); saveUserDict(u); draw(); });
    showDialog({ title: 'Custom dictionary', body, buttons: [{ label: 'Close', primary: true }] });
  }
  function proofingMenu(b) {
    openMenu(b, [
      { label: 'Spelling…', icon: 'spell', id: 'proof-spelling', run: spellingDialog },
      { label: 'Word Count', icon: 'footer', id: 'proof-words', run: wordCountDialog },
      { label: 'Custom dictionary…', icon: 'f-open', id: 'proof-dict', run: customDictDialog }, { sep: true },
      { label: 'Language: English (US)', disabled: true, check: undefined },
    ]);
  }
  async function reviewDialog() {
    let n = null; try { const sp = await loadSpeller(); n = Q.spellIssues(E.pres, sp, userDict()).length; } catch (e) { /* review without spelling */ }
    const issues = Q.reviewIssues(E.pres, n);
    const cnt = (l) => issues.filter((i) => i.level === l).length;
    const body = el('div'); body.id = 'reviewBody';
    const icon = { error: '●', warning: '▲', tip: '◆' }, col = { error: 'var(--ic-red)', warning: 'var(--ic-orange)', tip: 'var(--ic-blue)' };
    body.innerHTML = '<p id="rvSummary"><b>' + cnt('error') + '</b> errors · <b>' + cnt('warning') + '</b> warnings · <b>' + cnt('tip') + '</b> tips' + (n == null ? ' · spelling was not checked' : '') + '</p>' +
      (issues.length ? ['Accessibility', 'Content'].map((area) => { const list = issues.filter((i) => i.area === area); return list.length ? '<h3 style="margin:10px 0 4px;font-size:14px">' + area + '</h3><ul class="issues">' + list.map((i) => '<li data-level="' + i.level + '"><button class="sb-link" data-slide="' + (i.slide == null ? '' : i.slide) + '" data-shape="' + (i.shapeId || '') + '"><span style="color:' + col[i.level] + '">' + icon[i.level] + '</span> ' + esc(i.msg) + '</button></li>').join('') + '</ul>' : ''; }).join('') : '<p id="rvClean">' + '✓ Nothing to improve. Nice work!' + '</p>');
    body.addEventListener('click', (ev) => { const b = ev.target.closest('[data-slide]'); if (!b || b.dataset.slide === '') return; dlg.close(); E.selectSlide(Number(b.dataset.slide)); if (b.dataset.shape) E.select([b.dataset.shape]); });
    const dlg = showDialog({ title: 'Review Presentation', wide: true, body });
  }
  function changesDialog() {
    const vs = versions(index.current);
    if (!vs.length) { showDialog({ title: 'Show Changes', body: '<p id="chNone">There is no earlier version to compare with yet. Open <b>File → Version history</b> and choose <b>Save a version now</b>; later you can see what changed since then.</p>' }); return; }
    const body = el('div'); body.id = 'changesBody';
    const draw = (k) => {
      const old = Q.Presentation.fromJSON(vs[k].data), list = Q.diffPresentations(old, E.pres);
      body.querySelector('#chList').innerHTML = list.length ? '<ul class="issues">' + list.map((c) => '<li><button class="sb-link" data-slide="' + (c.slide == null ? '' : c.slide) + '" data-shape="' + (c.shapeId || '') + '">' + esc(c.text) + '</button></li>').join('') + '</ul>' : '<p id="chSame">No changes since this version.</p>';
    };
    body.innerHTML = '<label class="row">Compare with <select id="chVer">' + vs.map((v, k) => '<option value="' + k + '">' + esc(new Date(v.t).toLocaleString() + ' · ' + v.label) + '</option>').join('') + '</select></label><div id="chList"></div>';
    body.querySelector('#chVer').addEventListener('change', (ev) => draw(Number(ev.target.value)));
    body.addEventListener('click', (ev) => { const b = ev.target.closest('[data-slide]'); if (!b || b.dataset.slide === '') return; dlg.close(); E.selectSlide(Math.min(Number(b.dataset.slide), E.pres.slides.length - 1)); if (b.dataset.shape && E.shape(b.dataset.shape)) E.select([b.dataset.shape]); });
    const dlg = showDialog({ title: 'Show Changes', wide: true, body }); draw(0);
  }

  // ================= comments (replies, resolve, unread) =================
  function commentView(k) {
    const all = E.pres.allComments(); if (!all.length) return;
    cmCursor = ((k % all.length) + all.length) % all.length; const it = all[cmCursor], me = getAuthor();
    E.selectSlide(it.slide);
    if (it.comment.seenBy.indexOf(me) < 0) { E.mutate(() => E.pres.markRead(it.slide, it.comment.id, me), 'meta'); E.renderCanvas(); }
    const body = el('div');
    const draw = () => {
      const c = E.pres.allComments().find((x) => x.comment.id === it.comment.id).comment;
      body.innerHTML = '<p><b>' + esc(c.author) + '</b> · ' + esc(new Date(c.t).toLocaleString()) + ' · slide ' + (it.slide + 1) + (c.resolved ? ' · <span id="cmResolved" style="color:var(--ic-green)">Resolved</span>' : '') + '</p><p id="cmBody">' + esc(c.text) + '</p>' +
        (c.replies.length ? '<div id="cmReplies">' + c.replies.map((r) => '<p style="margin:4px 0 4px 14px;border-left:3px solid var(--border);padding-left:8px"><b>' + esc(r.author) + '</b>: ' + esc(r.text) + '</p>').join('') + '</div>' : '') +
        '<label class="row" style="align-items:flex-start"><textarea id="cmReply" rows="2" placeholder="Reply" style="flex:1;border:1px solid var(--muted);border-radius:4px;background:var(--panel);color:var(--text);padding:6px;font:inherit"></textarea></label>';
      dlg.el.querySelector('[data-act="cmResolve"]').textContent = c.resolved ? 'Reopen' : 'Resolve';
    };
    const dlg = showDialog({ title: 'Comment ' + (cmCursor + 1) + ' of ' + all.length, body, buttons: [
      { label: 'Reply', act: 'cmReplyBtn', run: () => { const t = body.querySelector('#cmReply').value.trim(); if (t) { E.mutate(() => E.pres.replyComment(it.slide, it.comment.id, t, me), 'meta'); draw(); } return false; } },
      { label: 'Resolve', act: 'cmResolve', run: () => { const c = E.pres.allComments().find((x) => x.comment.id === it.comment.id).comment; E.mutate(() => E.pres.setResolved(it.slide, it.comment.id, !c.resolved), 'meta'); E.renderCanvas(); draw(); return false; } },
      { label: 'Delete', act: 'cmDelete', run: () => { E.mutate(() => E.pres.removeComment(it.slide, it.comment.id), 'meta'); E.renderCanvas(); cmCursor = -1; } },
      { label: 'Close', primary: true }] });
    draw();
  }

  // ================= Immersive Reader =================
  let reader = null;
  function startReader() {
    if (E.showActive) return;
    E.stopEdit(); closeMenus(); E.showActive = true;
    const root = $('readerRoot'); root.hidden = false;
    const P = Object.assign({ theme: 'light', size: 30, rate: 1, voice: '', focus: false, notes: false, continuous: true }, ui.reader || {});
    const R = reader = { idx: E.cur, P, items: [], cur: -1, speaking: false, paused: false, utter: null };
    const synth = window.speechSynthesis;
    const save = () => { ui.reader = { theme: P.theme, size: P.size, rate: P.rate, voice: P.voice, focus: P.focus, notes: P.notes, continuous: P.continuous }; saveUi(); };
    root.className = 'rd-' + P.theme; root.classList.toggle('rd-focus', P.focus);
    root.innerHTML = '<div class="rd-top"><button class="rd-btn" data-rd="close" aria-label="Close reader">✕ Close</button><button class="rd-btn" data-rd="prev" aria-label="Previous slide">◀</button><span id="rdCount"></span><button class="rd-btn" data-rd="next" aria-label="Next slide">▶</button><span class="rd-gap"></span>' +
      '<button class="rd-btn rd-play" data-rd="play">▶ Play</button><label>Speed <input type="range" id="rdRate" min="0.5" max="2" step="0.1"></label><select id="rdVoice" aria-label="Voice"></select><span class="rd-gap"></span>' +
      '<button class="rd-btn" data-rd="smaller" aria-label="Smaller text">A−</button><button class="rd-btn" data-rd="bigger" aria-label="Larger text">A+</button>' +
      '<button class="rd-btn" data-rd="theme-light">White</button><button class="rd-btn" data-rd="theme-sepia">Sepia</button><button class="rd-btn" data-rd="theme-dark">Dark</button>' +
      '<button class="rd-btn" data-rd="focus" aria-pressed="false">Line focus</button><button class="rd-btn" data-rd="notes" aria-pressed="false">Notes</button></div><div class="rd-body" id="rdBody"></div>';
    const body = $('rdBody');
    const voices = () => (synth && synth.getVoices ? synth.getVoices() : []);
    const fillVoices = () => { const sel = $('rdVoice'); sel.innerHTML = '<option value="">Default voice</option>' + voices().map((v) => '<option value="' + esc(v.name) + '"' + (v.name === P.voice ? ' selected' : '') + '>' + esc(v.name) + '</option>').join(''); };
    function syncControls() {
      $('rdCount').textContent = 'Slide ' + (R.idx + 1) + ' of ' + E.pres.slides.length; $('rdRate').value = P.rate;
      root.className = 'rd-' + P.theme; root.classList.toggle('rd-focus', P.focus); body.style.fontSize = P.size + 'px';
      root.querySelector('[data-rd="focus"]').setAttribute('aria-pressed', String(P.focus)); root.querySelector('[data-rd="notes"]').setAttribute('aria-pressed', String(P.notes));
      const pb = root.querySelector('.rd-play'); pb.textContent = R.speaking && !R.paused ? '❚❚ Pause' : '▶ Play';
    }
    function render() {
      R.items = Q.readerText(E.pres.slides[R.idx], P.notes); R.cur = -1; body.textContent = '';
      if (!R.items.length) { body.innerHTML = '<p class="rd-empty" id="rdEmpty">This slide has no text to read.</p>'; }
      R.items.forEach((it, k) => {
        const d = el('div', 'rd-item rd-' + it.kind); d.dataset.k = k;
        if (it.kind === 'bullet') d.dataset.mark = '•'; else if (it.kind === 'number') d.dataset.mark = it.n + '.';
        let last = 0; String(it.text).replace(/\S+/g, (w, at) => { if (at > last) d.appendChild(document.createTextNode(it.text.slice(last, at))); const s = el('span', 'rd-w'); s.dataset.at = at; s.textContent = w; d.appendChild(s); last = at + w.length; return w; });
        body.appendChild(d);
      });
      syncControls();
    }
    function mark(k) { R.cur = k; body.querySelectorAll('.rd-item').forEach((n) => n.classList.toggle('cur', Number(n.dataset.k) === k)); body.querySelectorAll('.rd-w.on').forEach((n) => n.classList.remove('on')); }
    function stopSpeech() { R.speaking = false; R.paused = false; if (synth) { try { synth.cancel(); } catch (e) { /* ignore */ } } syncControls(); }
    function speak(k) {
      if (!synth || typeof SpeechSynthesisUtterance === 'undefined') { showDialog({ title: 'Read aloud', body: '<p>This browser has no speech synthesis. The text can still be read on screen.</p>' }); return; }
      if (k >= R.items.length) { // slide finished
        if (P.continuous && R.idx < E.pres.slides.length - 1) { R.idx++; render(); R.speaking = true; speak(0); } else { R.speaking = false; mark(-1); syncControls(); }
        return;
      }
      R.speaking = true; R.paused = false; mark(k); syncControls();
      const u = new SpeechSynthesisUtterance(R.items[k].text); R.utter = u; u.rate = P.rate;
      const v = voices().find((x) => x.name === P.voice); if (v) u.voice = v;
      u.onboundary = (ev) => { const ws = body.querySelectorAll('.rd-item.cur .rd-w'); let hit = null; ws.forEach((w) => { if (Number(w.dataset.at) <= ev.charIndex) hit = w; }); body.querySelectorAll('.rd-w.on').forEach((n) => n.classList.remove('on')); if (hit) hit.classList.add('on'); };
      u.onend = () => { if (R.utter === u && R.speaking) speak(k + 1); };
      u.onerror = () => { if (R.utter === u) { R.speaking = false; syncControls(); } };
      synth.speak(u);
    }
    function go(d) { stopSpeech(); R.idx = Q.clamp(R.idx + d, 0, E.pres.slides.length - 1); render(); }
    function close() {
      stopSpeech(); document.removeEventListener('keydown', onKey, true); root.removeEventListener('click', onClick); root.removeEventListener('mouseover', onOver);
      root.hidden = true; root.textContent = ''; reader = null; E.showActive = false; E.selectSlide(R.idx, true); save();
    }
    function onClick(ev) {
      const it = ev.target.closest('.rd-item'); if (it && !ev.target.closest('[data-rd]')) { stopSpeech(); speak(Number(it.dataset.k)); return; }
      const b = ev.target.closest('[data-rd]'); if (!b) return; const a = b.dataset.rd;
      if (a === 'close') close(); else if (a === 'prev') go(-1); else if (a === 'next') go(1);
      else if (a === 'play') { if (R.speaking && !R.paused) { R.paused = true; if (synth) synth.pause(); syncControls(); } else if (R.speaking && R.paused) { R.paused = false; if (synth) synth.resume(); syncControls(); } else speak(Math.max(0, R.cur)); }
      else if (a === 'bigger') { P.size = Math.min(72, P.size + 4); syncControls(); save(); } else if (a === 'smaller') { P.size = Math.max(16, P.size - 4); syncControls(); save(); }
      else if (a.indexOf('theme-') === 0) { P.theme = a.slice(6); syncControls(); save(); }
      else if (a === 'focus') { P.focus = !P.focus; syncControls(); save(); } else if (a === 'notes') { P.notes = !P.notes; stopSpeech(); render(); save(); }
    }
    function onOver(ev) { if (!P.focus || R.speaking) return; const it = ev.target.closest('.rd-item'); if (it) mark(Number(it.dataset.k)); }
    function onKey(ev) {
      if (document.querySelector('.backdrop')) return; // a dialog is open: it handles the keys
      if (ev.target.closest && ev.target.closest('select,input')) { if (ev.key === 'Escape') close(); return; }
      if (ev.key === 'Escape') close(); else if (ev.key === 'ArrowRight' || ev.key === 'PageDown') go(1); else if (ev.key === 'ArrowLeft' || ev.key === 'PageUp') go(-1);
      else if (ev.key === ' ') root.querySelector('.rd-play').click(); else return;
      ev.preventDefault(); ev.stopPropagation();
    }
    root.addEventListener('click', onClick); root.addEventListener('mouseover', onOver); document.addEventListener('keydown', onKey, true);
    $('rdRate').addEventListener('input', (ev) => { P.rate = Number(ev.target.value); save(); });
    $('rdVoice').addEventListener('change', (ev) => { P.voice = ev.target.value; save(); });
    if (synth && synth.addEventListener) synth.addEventListener('voiceschanged', fillVoices);
    fillVoices(); render();
  }
  QUI.startReader = startReader; QUI.readerState = () => (reader ? { idx: reader.idx, cur: reader.cur, speaking: reader.speaking, paused: reader.paused, items: reader.items.length } : null);

  // ================= Help, support, feedback, shortcuts =================
  const HELP = [
    ['Getting started', 'Click a slide in the left panel, then click a placeholder or pick Insert → Text Box. Your work is saved automatically in this browser. Use File → Create a copy to keep a file.'],
    ['Slides and layouts', 'Home → Slides or Ctrl+M adds a slide. Drag thumbnails to reorder, right-click for duplicate, delete, hide and layout. Design → Slide Layout changes the layout; Design → Slide Size switches between 16:9 and 4:3.'],
    ['Shapes and text', 'Insert → Shapes adds rectangles, ovals, arrows and more. Drag to move, use the round handles to resize and rotate. Double-click or just start typing to edit text. Home → Drawing has fill, outline, align and arrange.'],
    ['Pictures, icons and media', 'Insert → Pictures, Stock Images and Icons add pictures; you can also drop or paste an image onto the slide. Video and audio can come from a file (up to 3 MB) or a web address. Cameo takes a photo with your camera.'],
    ['Tables and charts', 'Insert → Table, then double-click a cell and use Tab to move. Right-click a table for rows and columns. Insert → Chart makes column, line or pie charts; double-click a chart to edit its data.'],
    ['Animations', 'Select a shape and pick an effect on the Animations tab. Add Animation lets one shape have several effects. Animation Pane lists them in order; Start decides On Click, With Previous or After Previous.'],
    ['Transitions', 'Pick a transition on the Transitions tab, set Duration and Options, and use Apply to All. "After" advances the slide automatically; Slide Show → Use Timings turns that on or off.'],
    ['Slide show and presenter view', 'F5 starts from the beginning, Shift+F5 from the current slide. Presenter View shows notes, the next slide and a timer; Audience window shows the slides in a second window. Custom Slideshow plays only the slides you choose.'],
    ['Rehearse with Coach', 'Slide Show → Rehearse with Coach times every slide and, in Chrome or Edge with a microphone, measures speaking pace and filler words. Save timings stores the slide times.'],
    ['Review: spelling, accessibility, comments', 'Review → Proofing → Spelling checks every slide, table and note. Check Accessibility lists missing titles, alt text, small text and low contrast. Comments support replies, Resolve and unread tracking. Show Changes compares with a saved version.'],
    ['View: ruler, grid, immersive reader', 'View → Ruler, Gridlines and Snap to Grid help with alignment; Units switches inches and centimetres. Immersive Reader shows large text and can read the slide aloud with the browser voice.'],
    ['Export, print and share', 'File → Export gives PDF (through the print dialog), PNG pictures of every slide, JSON and a text outline. File → Share can email an outline or use your device share sheet.'],
    ['Files, folders and versions', 'File → New keeps your old presentation in My presentations. Move file puts it in a folder. Version history keeps up to 8 earlier versions that you can restore.'],
  ];
  function helpDialog() {
    const body = el('div'); body.innerHTML = '<input type="text" id="helpSearch" placeholder="Search help" aria-label="Search help" style="width:100%;height:32px;border:1px solid var(--muted);border-radius:4px;background:var(--panel);color:var(--text);padding:0 8px;margin-bottom:8px"><div style="display:grid;grid-template-columns:230px 1fr;gap:12px"><div id="helpList" style="max-height:340px;overflow:auto"></div><div id="helpArticle" style="max-height:340px;overflow:auto"></div></div>';
    const list = body.querySelector('#helpList'), art = body.querySelector('#helpArticle');
    const show = (k) => { art.innerHTML = '<h3 style="margin-top:0">' + esc(HELP[k][0]) + '</h3><p>' + esc(HELP[k][1]) + '</p>'; list.querySelectorAll('button').forEach((b) => b.classList.toggle('active', Number(b.dataset.help) === k)); };
    const draw = () => {
      const q = body.querySelector('#helpSearch').value.trim().toLowerCase();
      const hits = HELP.map((h, k) => k).filter((k) => !q || (HELP[k][0] + ' ' + HELP[k][1]).toLowerCase().indexOf(q) >= 0);
      list.innerHTML = hits.length ? hits.map((k) => '<button class="mi" data-help="' + k + '" style="display:block;width:100%;text-align:left;padding:6px 8px;border-radius:4px">' + esc(HELP[k][0]) + '</button>').join('') : '<p id="helpNone" style="color:var(--muted)">No articles match.</p>';
      if (hits.length) show(hits[0]); else art.innerHTML = '';
    };
    body.querySelector('#helpSearch').addEventListener('input', draw); list.addEventListener('click', (ev) => { const b = ev.target.closest('[data-help]'); if (b) show(Number(b.dataset.help)); });
    draw(); showDialog({ title: 'Help', wide: true, body, buttons: [{ label: 'Contact Support', run: () => { setTimeout(supportDialog, 0); } }, { label: 'Close', primary: true }] });
  }
  function diagnostics() {
    let used = 0; try { Object.keys(localStorage).filter((k) => k.indexOf('quadra-ppt:') === 0).forEach((k) => { used += (localStorage.getItem(k) || '').length; }); } catch (e) { /* ignore */ }
    return ['Quadra PowerPoint ' + CONFIG.version, 'Browser: ' + navigator.userAgent, 'Language: ' + navigator.language, 'Screen: ' + screen.width + 'x' + screen.height + ' @' + (window.devicePixelRatio || 1) + 'x', 'Slides: ' + E.pres.slides.length + ' (' + E.pres.size + ')', 'Theme: ' + document.documentElement.dataset.theme, 'Stored data: ' + Math.round(used / 1024) + ' KB', 'Online: ' + navigator.onLine].join('\n');
  }
  QUI.diagnostics = diagnostics;
  function supportText(d) {
    const g = (id) => d.querySelector('#' + id);
    return 'Category: ' + g('supCat').value + '\nFrom: ' + (g('supName').value.trim() || getAuthor()) + (g('supMail').value.trim() ? ' <' + g('supMail').value.trim() + '>' : '') + '\nSubject: ' + g('supSubj').value.trim() + '\n\n' + g('supMsg').value.trim() + (g('supDiag').checked ? '\n\n--- Diagnostic information ---\n' + diagnostics() : '');
  }
  function supportDialog() {
    const dlg = showDialog({ title: 'Contact Support', wide: true, body: '<label class="row">Your name <input type="text" id="supName"></label><label class="row">Email (optional) <input type="text" id="supMail" placeholder="you@example.com"></label><label class="row">Category <select id="supCat"><option>Problem</option><option>Question</option><option>Feature request</option><option>Other</option></select></label><label class="row">Subject <input type="text" id="supSubj" maxlength="100"></label><label class="row" style="align-items:flex-start">Details <textarea id="supMsg" rows="5" style="flex:1;border:1px solid var(--muted);border-radius:4px;background:var(--panel);color:var(--text);padding:6px;font:inherit"></textarea></label><label class="row"><input type="checkbox" id="supDiag" checked> Include diagnostic information</label><p id="supErr" style="color:var(--ic-red)"></p><p style="color:var(--muted)">Nothing is sent automatically. Use Send email (opens your mail app) or copy / download the report.</p>',
      buttons: [{ label: 'Cancel' },
        { label: 'Copy', act: 'supCopy', run: (d) => { if (!valid(d)) return false; copyText(supportText(d)).then(() => toast('Report copied')); return false; } },
        { label: 'Download', act: 'supDownload', run: (d) => { if (!valid(d)) return false; const u = URL.createObjectURL(new Blob([supportText(d)], { type: 'text/plain' })); download(u, 'quadra-support-request.txt'); setTimeout(() => URL.revokeObjectURL(u), 2000); return false; } },
        { label: 'Send email', primary: true, act: 'supSend', run: (d) => { if (!valid(d)) return false; const a = el('a'); a.href = 'mailto:' + encodeURIComponent(CONFIG.supportEmail).replace(/%40/g, '@') + '?subject=' + encodeURIComponent('[Quadra PowerPoint] ' + d.querySelector('#supSubj').value.trim()) + '&body=' + encodeURIComponent(supportText(d)); QUI.lastMailto = a.href; document.body.appendChild(a); a.click(); a.remove(); } }] });
    function valid(d) { if (!d.querySelector('#supSubj').value.trim() || !d.querySelector('#supMsg').value.trim()) { d.querySelector('#supErr').textContent = 'Please enter a subject and some details.'; return false; } d.querySelector('#supErr').textContent = ''; return true; }
    dlg.el.querySelector('#supName').value = getAuthor();
  }
  const FB_KEY = 'quadra-ppt:feedback';
  const fbList = () => { try { const l = JSON.parse(localStorage.getItem(FB_KEY)); return Array.isArray(l) ? l : []; } catch (e) { return []; } };
  function feedbackDialog() {
    let rating = 0;
    const dlg = showDialog({ title: 'Give Feedback', wide: true, body: '<p>How is Quadra PowerPoint working for you?</p><div id="fbStars" role="radiogroup" aria-label="Rating" style="display:flex;gap:6px;margin-bottom:8px">' + [1, 2, 3, 4, 5].map((n) => '<button class="btn" data-rate="' + n + '" role="radio" aria-checked="false" aria-label="' + n + ' star' + (n > 1 ? 's' : '') + '" style="min-width:44px;font-size:20px;padding:0">☆</button>').join('') + '</div><label class="row">Type <select id="fbCat"><option>Something I like</option><option>Something I dislike</option><option>An idea</option><option>A problem</option></select></label><label class="row" style="align-items:flex-start">Message <textarea id="fbMsg" rows="5" style="flex:1;border:1px solid var(--muted);border-radius:4px;background:var(--panel);color:var(--text);padding:6px;font:inherit"></textarea></label><label class="row"><input type="checkbox" id="fbDiag"> Include diagnostic information when emailing</label><p id="fbErr" style="color:var(--ic-red)"></p>',
      buttons: [{ label: 'My feedback (' + fbList().length + ')', act: 'fbHistory', run: () => { setTimeout(feedbackHistory, 0); } }, { label: 'Cancel' },
        { label: 'Save and email', act: 'fbEmail', run: (d) => submit(d, true) }, { label: 'Save', primary: true, act: 'fbSubmit', run: (d) => submit(d, false) }] });
    dlg.el.querySelector('#fbStars').addEventListener('click', (ev) => { const b = ev.target.closest('[data-rate]'); if (!b) return; rating = Number(b.dataset.rate); dlg.el.querySelectorAll('[data-rate]').forEach((x) => { const on = Number(x.dataset.rate) <= rating; x.textContent = on ? '★' : '☆'; x.setAttribute('aria-checked', String(Number(x.dataset.rate) === rating)); }); });
    function submit(d, mail) {
      const msg = d.querySelector('#fbMsg').value.trim(); if (!rating && !msg) { d.querySelector('#fbErr').textContent = 'Choose a rating or write a message.'; return false; }
      const item = { t: Date.now(), rating, category: d.querySelector('#fbCat').value, text: msg }; const l = fbList(); l.unshift(item);
      try { localStorage.setItem(FB_KEY, JSON.stringify(l.slice(0, 50))); } catch (e) { /* ignore */ }
      if (mail) { const a = el('a'); a.href = 'mailto:' + encodeURIComponent(CONFIG.supportEmail).replace(/%40/g, '@') + '?subject=' + encodeURIComponent('[Quadra PowerPoint feedback] ' + item.rating + '/5') + '&body=' + encodeURIComponent(item.category + '\n' + item.rating + '/5\n\n' + msg + (d.querySelector('#fbDiag').checked ? '\n\n' + diagnostics() : '')); QUI.lastMailto = a.href; document.body.appendChild(a); a.click(); a.remove(); }
      toast('Thank you for your feedback');
    }
  }
  function feedbackHistory() {
    const body = el('div');
    const draw = () => { const l = fbList(); body.innerHTML = l.length ? '<table class="kbd-table" id="fbTable">' + l.map((f, k) => '<tr><td>' + esc(new Date(f.t).toLocaleDateString()) + '</td><td>' + (f.rating ? '★'.repeat(f.rating) : '') + ' ' + esc(f.category) + '<br>' + esc(f.text) + '</td><td><button class="btn" data-fbdel="' + k + '">Delete</button></td></tr>').join('') + '</table>' : '<p id="fbEmpty">You have not saved any feedback yet.</p>'; };
    draw(); body.addEventListener('click', (ev) => { const b = ev.target.closest('[data-fbdel]'); if (!b) return; const l = fbList(); l.splice(Number(b.dataset.fbdel), 1); try { localStorage.setItem(FB_KEY, JSON.stringify(l)); } catch (e) { /* ignore */ } draw(); });
    showDialog({ title: 'My feedback', wide: true, body, buttons: [{ label: 'Close', primary: true }] });
  }
  const SHORTCUT_GROUPS = [
    ['Slides', [['Ctrl+M', 'New slide'], ['Ctrl+D', 'Duplicate the slide (thumbnails focused) or the shape'], ['Ctrl+C / X / V', 'Copy, cut, paste slides (thumbnails focused) or shapes'], ['Delete', 'Delete the slide (thumbnails focused) or the shape'], ['Page Up / Page Down', 'Previous / next slide'], ['Ctrl+Mouse wheel', 'Zoom']]],
    ['Shapes and text', [['Arrow keys', 'Nudge by 5 (Shift: 1)'], ['Shift+click', 'Add or remove from the selection'], ['Ctrl+A', 'Select all shapes'], ['Enter / F2 / double-click', 'Edit text'], ['Typing', 'Starts editing the selected shape'], ['Tab', 'Next table cell (adds a row at the end)'], ['Ctrl+B / I / U', 'Bold, italic, underline'], ['Esc', 'Leave editing, then clear selection']]],
    ['General', [['Ctrl+Z / Ctrl+Y', 'Undo / redo'], ['Ctrl+S', 'Save now (autosave is always on)'], ['Ctrl+V', 'Paste a picture from the clipboard']]],
    ['Slide show', [['F5', 'From the beginning'], ['Shift+F5', 'From the current slide'], ['Space / → / ↓ / Enter', 'Next'], ['← / ↑ / Backspace', 'Previous'], ['Home / End', 'First / last slide'], ['Esc', 'Exit']]],
  ];
  function shortcutsDialog() {
    const body = el('div'); body.innerHTML = '<input type="text" id="kbSearch" placeholder="Search shortcuts" aria-label="Search shortcuts" style="width:100%;height:32px;border:1px solid var(--muted);border-radius:4px;background:var(--panel);color:var(--text);padding:0 8px;margin-bottom:8px"><div id="kbList" style="max-height:360px;overflow:auto"></div>';
    const draw = () => {
      const q = body.querySelector('#kbSearch').value.trim().toLowerCase();
      const html = SHORTCUT_GROUPS.map((g) => { const rows = g[1].filter((r) => !q || (r[0] + ' ' + r[1]).toLowerCase().indexOf(q) >= 0); return rows.length ? '<h3 style="margin:10px 0 2px;font-size:14px">' + g[0] + '</h3><table class="kbd-table">' + rows.map((r) => '<tr><td>' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td></tr>').join('') + '</table>' : ''; }).join('');
      body.querySelector('#kbList').innerHTML = html || '<p id="kbNone" style="color:var(--muted)">No shortcuts match.</p>';
    };
    body.querySelector('#kbSearch').addEventListener('input', draw); draw();
    showDialog({ title: 'Keyboard shortcuts', wide: true, body });
  }
  function whatsNewDialog() {
    showDialog({ title: 'What’s new', wide: true, body: '<h3 style="margin:0">Version 4</h3><ul><li>Review: spelling check with custom dictionary, Review Presentation, Show Changes, comment replies / resolve / unread</li><li>View: real ruler (inches or cm), gridlines, snap to grid, Immersive Reader with read-aloud</li><li>Help: searchable help, Contact Support and Feedback forms, searchable shortcuts</li><li>More shapes, align and distribute, line spacing, hide slide, slide copy / paste, drop or paste pictures</li></ul><h3 style="margin:8px 0 0">Version 3</h3><ul><li>Animations, Slide Show and Transitions tabs: 17 effects, Presenter View, custom shows, rehearsal, real transitions</li></ul><h3 style="margin:8px 0 0">Version 2</h3><ul><li>Tables, charts, SmartArt, media, links, comments, add-ins, versions and folders</li></ul><h3 style="margin:8px 0 0">Version 1</h3><ul><li>Editor, ribbon, slide show, autosave, PDF and PNG export</li></ul>' });
  }

  // ================= commands =================
  const C = {};
  const def = (id, o) => { C[id] = o; };
  const hasSel = () => E.sel.length > 0;
  const hasText = () => E.textShapes().length > 0;
  const style = () => E.getStyle();
  const na = (name) => ({ run: () => notAvailable(name) });
  const dis = () => ({ disabled: true, run: () => {} });
  const layoutItems = (fn) => Q.LAYOUTS.map((l) => ({ label: l.name, check: E.slide().layout === l.id ? undefined : false, run: () => fn(l.id) }));
  const SHAPE_ITEMS = Q.SHAPE_KINDS.map((k) => [k, Q.SHAPE_NAMES[k]]).concat([['line', 'Line'], ['arrow', 'Arrow']]);
  const shapeMenu = () => SHAPE_ITEMS.map((s) => ({ label: s[1], icon: s[0], id: 'shape-' + s[0], run: () => E.addShape(s[0]) }));
  const setOutline = (patch) => E.mutate(() => E.selShapes().forEach((s) => { if (['picture'].indexOf(s.type) >= 0) return; s.line = Object.assign({ color: '#000000', width: 2, alpha: 1 }, s.line || {}, patch); }));
  const setFill = (c) => E.mutate(() => E.selShapes().forEach((s) => { if (Q.canHoldText(s)) s.fill = c; }));

  def('undo', { run: () => E.undo(), enabled: () => E.canUndo() });
  def('redo', { run: () => E.redo(), enabled: () => E.canRedo() });
  def('paste', { run: (b, ev) => { if (ev && ev.target.closest && ev.target.closest('.dd')) openMenu(b, [{ label: 'Paste', id: 'paste-shapes', icon: 'paste', key: 'Ctrl+V', run: () => { if (E.hasClip()) E.paste(); else pasteText(); } }, { label: 'Paste text only', id: 'paste-text', icon: 'textbox', run: pasteText }]); else if (E.hasClip()) E.paste(); else pasteText(); } });
  def('cut', { run: () => E.cut(), enabled: hasSel });
  def('copy', { run: () => E.copy(), enabled: hasSel });
  def('painter', { run: () => E.startPainter(), enabled: () => E.sel.length === 1 && hasText(), pressed: () => E.painterActive() });
  def('delete', { run: () => { if (E.focusArea === 'thumbs') E.deleteSlide(); else E.deleteSel(); }, enabled: () => E.focusArea === 'thumbs' || hasSel() });
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
    const t = style() || {}, off = !hasText(), first = E.textShapes()[0], anchor = first ? first.anchor : 'top';
    const setAnchor = (a) => () => E.mutate(() => E.textShapes().forEach((s) => { s.anchor = a; }));
    openMenu(b, [
      { label: 'Bullets', disabled: off, check: t.list === 'bullet' ? undefined : false, run: () => E.setStyle({ list: t.list === 'bullet' ? 'none' : 'bullet' }) },
      { label: 'Numbering', disabled: off, check: t.list === 'number' ? undefined : false, run: () => E.setStyle({ list: t.list === 'number' ? 'none' : 'number' }) }, { sep: true },
    ].concat([['left', 'Align Left'], ['center', 'Center'], ['right', 'Align Right'], ['justify', 'Justify']].map((x) => ({ label: x[1], disabled: off, check: t.align === x[0] ? undefined : false, run: () => E.setStyle({ align: x[0] }) })),
      [{ sep: true }, { label: 'Line Spacing', disabled: off, submenu: [1, 1.15, 1.5, 2].map((v) => ({ label: String(v), id: 'ls-' + v, check: Math.abs((t.lineHeight || 1.2) - v) < 0.01 ? undefined : false, run: () => E.setStyle({ lineHeight: v }) })) },
        { label: 'Vertical Alignment', disabled: off, submenu: [['top', 'Top'], ['middle', 'Middle'], ['bottom', 'Bottom']].map((x) => ({ label: x[1], id: 'va-' + x[0], check: anchor === x[0] ? undefined : false, run: setAnchor(x[0]) })) }]));
  } });
  def('drawing', { run: (b) => openMenu(b, [
    { label: 'Shapes', icon: 'shapes', submenu: shapeMenu() },
    { label: 'Shape Fill', submenu: colorItems(setFill, 'No Fill'), disabled: !hasSel() },
    { label: 'Shape Outline', submenu: colorItems((c) => setOutline({ color: c || 'transparent' }), 'No Outline'), disabled: !hasSel() },
    { label: 'Outline Weight', submenu: [1, 2, 4, 6, 8].map((w) => ({ label: w + ' px', run: () => setOutline({ width: w }) })), disabled: !hasSel() }, { sep: true },
    { label: 'Bring to Front', run: () => E.order('front'), disabled: !hasSel() }, { label: 'Send to Back', run: () => E.order('back'), disabled: !hasSel() },
    { label: 'Bring Forward', run: () => E.order('forward'), disabled: !hasSel() }, { label: 'Send Backward', run: () => E.order('backward'), disabled: !hasSel() }, { sep: true },
    { label: 'Rotate Right 90°', run: () => E.rotateBy(90), disabled: !hasSel() }, { label: 'Rotate Left 90°', run: () => E.rotateBy(-90), disabled: !hasSel() }, { sep: true },
    { label: 'Align', disabled: !hasSel(), submenu: [['left', 'Align Left'], ['center', 'Align Center'], ['right', 'Align Right'], ['top', 'Align Top'], ['middle', 'Align Middle'], ['bottom', 'Align Bottom']].map((x) => ({ label: x[1], id: 'al-' + x[0], run: () => E.align(x[0]) })) },
    { label: 'Distribute', disabled: E.sel.length < 3, submenu: [['h', 'Distribute Horizontally'], ['v', 'Distribute Vertically']].map((x) => ({ label: x[1], id: 'ds-' + x[0], run: () => E.distribute(x[0]) })) },
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
  const capw = (x) => x.charAt(0).toUpperCase() + x.slice(1);
  def('tr:exist', { run: (b) => {
    const count = {}; E.pres.slides.forEach((s) => { if (s.transition.type !== 'none') count[s.transition.type] = (count[s.transition.type] || 0) + 1; });
    const keys = Object.keys(count);
    openMenu(b, keys.length ? keys.map((k) => ({ label: Q.TRANSITION_NAMES[k] + ' (' + count[k] + ' slide' + (count[k] > 1 ? 's' : '') + ')', id: 'trx-' + k, icon: 'tr-' + (['none', 'cut', 'fade', 'push', 'wipe'].indexOf(k) >= 0 ? k : 'more'), run: () => E.mutate(() => E.pres.setTransition(E.cur, { type: k }), 'meta') })) : [{ label: 'No transitions in this presentation', disabled: true }]);
  } });
  def('tr:more', { run: (b) => openMenu(b, ['cover', 'uncover', 'zoom', 'split'].map((t) => ({ label: Q.TRANSITION_NAMES[t], id: 'trm-' + t, check: E.slide().transition.type === t ? undefined : false, run: () => E.mutate(() => E.pres.setTransition(E.cur, { type: t }), 'meta') }))) });
  function trOptionItems() {
    const t = E.slide().transition, set = (d) => () => E.mutate(() => E.pres.setTransition(E.cur, { dir: d }), 'meta');
    if (['push', 'wipe', 'cover', 'uncover'].indexOf(t.type) >= 0) return ['left', 'right', 'top', 'bottom'].map((d) => ({ label: 'From ' + capw(d), id: 'tro-' + d, check: t.dir === d ? undefined : false, run: set(d) }));
    if (t.type === 'split') return [['horizontal', 'Horizontal'], ['vertical', 'Vertical']].map((x) => ({ label: x[1], id: 'tro-' + x[0], check: ((t.dir === 'vertical') === (x[0] === 'vertical')) ? undefined : false, run: set(x[0]) }));
    if (t.type === 'fade') return [['smooth', 'Smoothly'], ['black', 'Through Black']].map((x) => ({ label: x[1], id: 'tro-' + x[0], check: ((t.dir === 'black') === (x[0] === 'black')) ? undefined : false, run: set(x[0]) }));
    return [];
  }
  def('trOptions', { run: (b) => openMenu(b, trOptionItems()), enabled: () => trOptionItems().length > 0 });
  def('trDur', { change: (v) => E.mutate(() => E.pres.setTransition(E.cur, { dur: Number(v) }), 'meta'), enabled: () => ['none', 'cut'].indexOf(E.slide().transition.type) < 0, value: () => E.slide().transition.dur.toFixed(2) });
  def('trAll', { run: () => E.mutate(() => E.pres.applyTransitionToAll(E.cur), 'meta') });
  def('trClick', { run: () => E.mutate(() => E.pres.setAdvance(E.cur, { click: !E.slide().advance.click }), 'meta'), pressed: () => E.slide().advance.click });
  def('trAfter', { change: (v) => E.mutate(() => E.pres.setAdvance(E.cur, { after: v === '' ? null : Number(v) }), 'meta'), value: () => (E.slide().advance.after ? String(E.slide().advance.after) : '') });

  // animations
  def('anPreview', { run: previewAnimations, enabled: () => E.slide().anims.length > 0 });
  const pickEffect = (ef) => E.mutate(() => E.sel.forEach((id, k) => {
    const cur = k === 0 ? selAnim() : null;
    if (ef === 'none') E.pres.setAnim(E.cur, id, 'none'); else if (cur) E.pres.updateAnim(E.cur, cur.id, { effect: ef }); else E.pres.setAnim(E.cur, id, ef);
  }), 'meta');
  Q.ANIM_EFFECTS.forEach((ef) => def('an:' + ef, { run: () => pickEffect(ef), enabled: hasSel, pressed: () => { const a = selAnim(); return ef === 'none' ? hasSel() && !a : !!a && a.effect === ef; } }));
  def('an:exist', { run: (b) => {
    const s = E.slide();
    openMenu(b, s.anims.length ? s.anims.map((a, k) => ({ label: (k + 1) + '. ' + effName(a.effect) + ' – ' + shapeLabel(E.shape(a.shapeId)), id: 'anx-' + a.id, run: () => { selAnimId = a.id; E.select([a.shapeId]); } })) : [{ label: 'No animations on this slide', disabled: true }]);
  } });
  def('an:more', { run: (b) => openMenu(b, effectMenuItems(pickEffect)), enabled: hasSel });
  def('anAdd', { run: (b) => openMenu(b, effectMenuItems((ef) => { let last = null; E.mutate(() => E.sel.forEach((id) => { const a = E.pres.addAnim(E.cur, id, ef); if (a) last = a; }), 'meta'); if (last) selAnimId = last.id; })), enabled: hasSel });
  function anOptionItems() {
    const a = selAnim(); if (!a) return [];
    const set = (patch) => () => E.mutate(() => E.pres.updateAnim(E.cur, a.id, patch), 'meta');
    if (Q.ANIM_DIR_EFFECTS.indexOf(a.effect) >= 0) return ['bottom', 'left', 'right', 'top'].map((d) => ({ label: 'From ' + capw(d), id: 'ano-' + d, check: a.dir === d ? undefined : false, run: set({ dir: d }) }));
    if (a.effect === 'spin') return [[90, 'Quarter Spin'], [180, 'Half Spin'], [360, 'Full Spin'], [720, 'Two Spins'], [-360, 'Full Spin Counterclockwise']].map((x) => ({ label: x[1], id: 'ano-' + x[0], check: a.amount === x[0] ? undefined : false, run: set({ amount: x[0] }) }));
    if (a.effect === 'growshrink') return [[0.25, 'Tiny'], [0.5, 'Smaller'], [1.5, 'Larger'], [2, 'Huge']].map((x) => ({ label: x[1], id: 'ano-' + x[0], check: a.amount === x[0] ? undefined : false, run: set({ amount: x[0] }) }));
    return [];
  }
  def('anOptions', { run: (b) => openMenu(b, anOptionItems()), enabled: () => anOptionItems().length > 0 });
  const setSel = (patch) => () => 0;
  def('anStart', { change: (v) => { const a = selAnim(); if (a) E.mutate(() => E.pres.updateAnim(E.cur, a.id, { start: v }), 'meta'); }, enabled: () => !!selAnim(), value: () => (selAnim() ? selAnim().start : 'onclick') });
  def('anDur', { change: (v) => { const a = selAnim(); if (a) E.mutate(() => E.pres.updateAnim(E.cur, a.id, { dur: Number(v) }), 'meta'); }, enabled: () => !!selAnim(), value: () => (selAnim() ? selAnim().dur.toFixed(2) : '0.00') });
  def('anDelay', { change: (v) => { const a = selAnim(); if (a) E.mutate(() => E.pres.updateAnim(E.cur, a.id, { delay: Number(v) }), 'meta'); }, enabled: () => !!selAnim(), value: () => (selAnim() ? selAnim().delay.toFixed(2) : '0.00') });
  def('anEarlier', { run: () => E.mutate(() => E.pres.moveAnim(E.cur, selAnim().id, -1), 'meta'), enabled: () => !!selAnim() && E.slide().anims.indexOf(selAnim()) > 0 });
  def('anLater', { run: () => E.mutate(() => E.pres.moveAnim(E.cur, selAnim().id, 1), 'meta'), enabled: () => !!selAnim() && E.slide().anims.indexOf(selAnim()) < E.slide().anims.length - 1 });
  def('anPane', { run: animPaneDialog });

  // slide show / review / view / help
  def('fromStart', { run: () => startShow(0) }); def('fromCurrent', { run: () => startShow(E.cur) });
  def('presenter', { run: () => startShow(E.cur, { presenter: true }) });
  def('custom', { run: (b) => customMenu(b) });
  def('coach', { run: (b, ev) => { if (ev && ev.target.closest && ev.target.closest('.dd')) coachMenu(b); else startShow(0, { rehearse: true }); } });
  def('useTimings', { run: () => E.mutate(() => E.pres.setShowOptions({ useTimings: !E.pres.show.useTimings }), 'meta'), pressed: () => E.pres.show.useTimings });
  def('loopShow', { run: () => E.mutate(() => E.pres.setShowOptions({ loop: !E.pres.show.loop }), 'meta'), pressed: () => E.pres.show.loop });
  def('review', { run: reviewDialog }); def('proofing', { run: (b) => proofingMenu(b) }); def('access', { run: accessibilityDialog });
  def('markread', { enabled: () => E.pres.unreadCount(getAuthor()) > 0, run: () => { E.mutate(() => E.pres.markAllRead(getAuthor()), 'meta'); E.renderCanvas(); } }); def('changes', { run: changesDialog });
  const anyComments = () => E.pres.allComments().length > 0;
  def('delcomment', { enabled: anyComments, run: (b) => openMenu(b, [
    { label: 'Delete Comment', id: 'cm-del-one', run: () => { const all = E.pres.allComments(); const it = all[Math.max(0, Math.min(cmCursor, all.length - 1))] || all[0]; E.mutate(() => E.pres.removeComment(it.slide, it.comment.id), 'meta'); E.renderCanvas(); cmCursor = -1; } },
    { label: 'Delete All Comments on this Slide', id: 'cm-del-slide', run: () => { E.mutate(() => { E.slide().comments = []; }, 'meta'); E.renderCanvas(); } },
    { label: 'Delete All Comments', id: 'cm-del-all', run: () => { E.mutate(() => { E.pres.slides.forEach((s) => { s.comments = []; }); }, 'meta'); E.renderCanvas(); } }]) });
  def('prevcomment', { enabled: anyComments, run: () => commentView((cmCursor < 0 ? 0 : cmCursor) - 1) });
  def('nextcomment', { enabled: anyComments, run: () => commentView(cmCursor + 1) });
  def('showcomments', { run: (b) => openMenu(b, [{ label: 'Show comment markers', id: 'cm-markers', check: E.showComments !== false ? undefined : false, run: () => { E.showComments = E.showComments === false; E.renderCanvas(); } }, { label: 'Comments pane…', id: 'cm-pane', run: commentsPane }]) });
  const setNotesPane = (on) => { ui.notes = on; saveUi(); applyUi(); };
  def('notes', { run: () => setNotesPane(!ui.notes), pressed: () => ui.notes });
  def('ruler', { run: () => { ui.ruler = !ui.ruler; saveUi(); applyUi(); }, pressed: () => ui.ruler });
  def('sorter', { run: () => E.setView('sorter'), pressed: () => E.view === 'sorter' });
  def('normal', { run: () => E.setView('normal'), pressed: () => E.view === 'normal' });
  def('immersive', { run: startReader });
  def('gridlines', { run: () => { ui.grid = !ui.grid; saveUi(); applyUi(); }, pressed: () => ui.grid });
  def('snap', { run: () => { ui.snap = !ui.snap; saveUi(); applyUi(); }, pressed: () => ui.snap });
  def('units', { run: (b) => openMenu(b, [['in', 'Inches'], ['cm', 'Centimetres']].map((x) => ({ label: x[1], id: 'unit-' + x[0], check: ui.units === x[0] ? undefined : false, run: () => { ui.units = x[0]; saveUi(); applyUi(); } }))) });
  def('hideSlide', { run: () => E.mutate(() => E.pres.setHidden(E.cur, !E.slide().hidden), 'meta'), pressed: () => !!E.slide().hidden });
  def('zoom', { run: zoomDialog }); def('fit', { run: () => E.setZoom('fit', 1) });
  def('help', { run: helpDialog }); def('support', { run: supportDialog }); def('feedback', { run: feedbackDialog }); def('keyboard', { run: shortcutsDialog }); def('whatsnew', { run: whatsNewDialog });

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
      { l: 'Transitions', items: [{ t: 'gallery', more: 'tr:more', items: [['tr:exist', 'tr-exist', 'Existing'], ['tr:none', 'tr-none', 'None'], ['tr:morph', 'tr-more', 'Morph'], ['tr:cut', 'tr-cut', 'Cut'], ['tr:fade', 'tr-fade', 'Fade'], ['tr:push', 'tr-push', 'Push'], ['tr:wipe', 'tr-wipe', 'Wipe']] }, B('trOptions', 'options', 'Options', { dd: true })] },
      { l: 'Timing', items: [col({ t: 'num', c: 'trDur', i: 'clock', l: 'Duration', step: 0.25, min: 0, max: 10 }, S('trAll', 'applyall', 'Apply to All')), col(S('trClick', 'select', 'On Mouse Click'), { t: 'num', c: 'trAfter', i: 'clock', l: 'After', step: 1, min: 0, max: 3600, blank: true })] },
    ],
    Animations: [
      { l: 'Preview', items: [B('anPreview', 'preview', 'Preview')] },
      { l: 'Animation', items: [{ t: 'gallery', more: 'an:more', items: [['an:exist', 'tr-exist', 'Existing'], ['an:none', 'an-none', 'None'], ['an:appear', 'an-appear', 'Appear'], ['an:fade', 'an-fade', 'Fade'], ['an:flyin', 'an-fly', 'Fly In']] }, B('anOptions', 'options', 'Effect Options', { dd: true })] },
      { l: 'Timing', items: [col({ t: 'select', c: 'anStart', w: 120, opts: [['onclick', 'On Click'], ['withprev', 'With Previous'], ['afterprev', 'After Previous']], icon: 'start', l: 'Start' }, { t: 'num', c: 'anDur', i: 'clock', l: 'Duration', step: 0.25, min: 0, max: 20 }, { t: 'num', c: 'anDelay', i: 'clock', l: 'Delay', step: 0.25, min: 0, max: 20 })] },
      { l: 'Reorder', items: [B('anEarlier', 'moveup', 'Move Earlier'), B('anLater', 'movedown', 'Move Later')] },
      { l: 'Advanced Animation', items: [B('anAdd', 'an-appear', 'Add Animation', { dd: true }), B('anPane', 'animpane', 'Animation Pane')] },
    ],
    'Slide Show': [
      { l: 'Start Slide Show', items: [B('fromStart', 'fromstart', 'From Beginning'), B('fromCurrent', 'fromcurrent', 'From Current Slide'), B('presenter', 'presenter', 'Presenter View'), B('custom', 'custom', 'Custom Slideshow', { dd: true })] },
      { l: 'Set Up', items: [col(S('useTimings', 'clock', 'Use Timings'), S('loopShow', 'loop', 'Loop Continuously'), S('hideSlide', 'hide', 'Hide Slide'))] },
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
      { l: 'Show', items: [B('notes', 'notes', 'Notes'), B('ruler', 'ruler', 'Ruler'), col(S('gridlines', 'grid', 'Gridlines'), S('snap', 'snap', 'Snap to Grid'), S('units', 'ruler', 'Units', { dd: true }))] },
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
        if (it.more) { const mb = mk('gmore', ic('chev-down')); mb.dataset.cmd = it.more; mb.title = 'More'; mb.setAttribute('aria-label', 'More'); g.appendChild(mb); }
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
    { head: getAuthor() + ' (this device)', icon: 'logo' }, { label: 'Change display name…', id: 'prof-name', icon: 'f-rename', run: nameDialog }, { label: 'Your feedback', id: 'prof-feedback', icon: 'feedback', run: feedbackHistory }, { sep: true }, { label: 'Clear local data…', id: 'prof-clear', icon: 'delete', run: clearLocalData },
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
    if (item.slide != null) { E.selectSlide(item.slide); if (item.shapeId) E.select([item.shapeId]); return; }
    if (item.cmd === '_rename') return renameDialog(); if (item.cmd === '_print') return printDeck();
    const c = C[item.cmd]; if (!c) return;
    if (c.disabled || (c.enabled && !c.enabled())) { setTab(item.tab); toast(item.label + ' is not available right now'); return; }
    if (c.run) c.run($('searchInput'), {});
  }
  function updateSearch() {
    const q = searchInput.value.trim().toLowerCase(); searchResults.textContent = '';
    if (!q) { searchResults.hidden = true; return; }
    const hits = searchIndex.filter((s) => s.label.toLowerCase().indexOf(q) >= 0).slice(0, 8);
    let nText = 0;
    E.pres.slides.forEach((s, i) => s.shapes.forEach((x) => {
      const t = x.type === 'table' ? x.cells.map((r) => r.join(' ')).join(' ') : x.text;
      if (nText < 5 && t && t.toLowerCase().indexOf(q) >= 0) { nText++; const at = t.toLowerCase().indexOf(q); hits.push({ label: 'Slide ' + (i + 1) + ': ' + t.slice(Math.max(0, at - 12), at + 28).replace(/\n/g, ' '), tab: 'Slide text', slide: i, shapeId: x.id }); }
    }));
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
    E.opts.grid = !!ui.grid; E.opts.snap = !!ui.snap; E.opts.units = ui.units === 'cm' ? 'cm' : 'in'; E.opts.rulers = !!ui.ruler;
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
  $('sbFeedback').addEventListener('click', feedbackDialog);
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
      { label: 'Copy Slide', id: 'ts-copy', run: () => E.copySlide(i) }, { label: 'Cut Slide', id: 'ts-cut', run: () => E.cutSlide(i) }, { label: 'Paste Slide', id: 'ts-paste', disabled: !E.hasSlideClip(), run: () => E.pasteSlide() }, { sep: true },
      { label: E.pres.slides[i].hidden ? 'Unhide Slide' : 'Hide Slide', id: 'ts-hide', icon: 'hide', run: () => E.mutate(() => E.pres.setHidden(i, !E.pres.slides[i].hidden), 'meta') },
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
  document.addEventListener('keydown', (ev) => { if (E.showActive) return; if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's') { ev.preventDefault(); saveNow(); toast('Saved'); } });
  document.addEventListener('paste', (ev) => {
    if (E.showActive || (ev.target.closest && ev.target.closest('input,textarea,[contenteditable]'))) return;
    const files = Array.from((ev.clipboardData && ev.clipboardData.files) || []).filter((f) => /^image\//.test(f.type)); if (files.length) { ev.preventDefault(); files.forEach(loadPicture); }
  });
  E.on('dropfiles', (files) => files.filter((f) => /^image\//.test(f.type)).forEach(loadPicture));
  applyAuthor();
  buildSearchIndex(); renderTabs(); setTab(TABS[ui.tab] ? ui.tab : 'Home');
  syncTitle(); updateStatus(); updateZoomUi(); applyUi(); setStatus('saved');
  ['change', 'slide', 'selection', 'history', 'clipboard', 'tool', 'view', 'painter', 'edit'].forEach((ev) => E.on(ev, scheduleRefresh));
  E.on('change', (kind) => { if (kind !== 'notes' || true) scheduleSave(); if (kind === 'meta' || kind === 'all' || kind === 'structure') syncTitle(); updateStatus(); });
  E.on('slide', updateStatus);
  E.on('zoom', updateZoomUi);
  E.on('view', () => { $('viewNormal').classList.toggle('pressed', E.view === 'normal'); $('viewSorter').classList.toggle('pressed', E.view === 'sorter'); $('viewNormal').setAttribute('aria-pressed', String(E.view === 'normal')); $('viewSorter').setAttribute('aria-pressed', String(E.view === 'sorter')); updateZoomUi(); });
  if (AUDIENCE) startAudience();
  window.__QUADRA_READY = true;
  QUI.exportPng = exportPng; QUI.printDeck = printDeck; QUI.syncTitle = syncTitle;
})();
