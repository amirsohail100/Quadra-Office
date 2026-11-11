/*
 * Quadra Word - UI layer, part 1 of 2 (ribbon, menus, dialogs, layout, zoom, theme, autosave).
 * Part 2 (backstage, find/replace, other dialogs) is appended below and calls QuadraUI.start().
 */
(function () {
  'use strict';
  const E = window.QuadraEngine;
  const Ed = window.QuadraEditor;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const PT = 4 / 3;                      // CSS px per pt
  const ZOOMS = [50, 75, 90, 100, 110, 125, 150, 175, 200];
  const KEY_DOC = 'quadra.doc.v1';
  const KEY_PREFS = 'quadra.prefs.v1';
  const FONTS = [
    ['Quadra Sans', '"Segoe UI", system-ui, sans-serif'], ['Arial', 'Arial, Helvetica, sans-serif'],
    ['Calibri', 'Calibri, Carlito, sans-serif'], ['Georgia', 'Georgia, serif'],
    ['Times New Roman', '"Times New Roman", Times, serif'], ['Courier New', '"Courier New", monospace'],
    ['Verdana', 'Verdana, sans-serif'],
  ];
  const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72];
  const COLORS = ['#000000', '#ffffff', '#e5484d', '#f76b15', '#f5a524', '#30a46c', '#0e7c86', '#3e63dd', '#8e4ec6', '#d6409f', '#6e6e6e', '#b08968'];
  const THEMES = [
    { name: 'Quadra', font: '"Segoe UI", system-ui, sans-serif', accent: '#0e7c86' },
    { name: 'Classic', font: 'Georgia, serif', accent: '#2b4c7e' },
    { name: 'Notes', font: '"Courier New", monospace', accent: '#6b5b95' },
  ];
  const SYMBOLS = ['\u00A9', '\u00AE', '\u2122', '\u00B0', '\u00B1', '\u00D7', '\u00F7', '\u20AC', '\u00A3', '\u00A5', '\u00A7', '\u00B6', '\u2026', '\u2013', '\u2014', '\u2190', '\u2192', '\u2191', '\u2193', '\u2260', '\u2264', '\u2265', '\u221E', '\u03C0', '\u03B1', '\u03B2', '\u03A9', '\u221A', '\u00BD', '\u00BC', '\u00BE'];
  const EMOJI = ['\u{1F600}', '\u{1F602}', '\u{1F60A}', '\u{1F60D}', '\u{1F914}', '\u{1F44D}', '\u{1F44F}', '\u{1F389}', '\u{1F525}', '\u2705', '\u274C', '\u2B50', '\u2764\uFE0F', '\u{1F4CC}', '\u{1F4CE}', '\u{1F4A1}', '\u{1F4C5}', '\u2615'];

  function loadPrefs() {
    const d = { zoom: 100, theme: 'dark', canvas: 'dark', ruler: false, nav: false, view: 'single' };
    try { return Object.assign(d, JSON.parse(localStorage.getItem(KEY_PREFS) || '{}')); } catch (err) { return d; }
  }
  const prefs = loadPrefs();
  function savePrefs() { try { localStorage.setItem(KEY_PREFS, JSON.stringify(prefs)); } catch (err) { /* ignore */ } }

  // Small DOM builder: h('button', {class, onclick, text}, ...children)
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const k of Object.keys(attrs || {})) {
      const v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
    kids.flat().forEach((c) => {
      if (c === null || c === undefined || c === false) return;
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return el;
  }
  function setVar(el, name, v) { if (v) el.style.setProperty(name, v); else el.style.removeProperty(name); }

  // ---------- toast (storage notices only) ----------
  function showToast(text) {
    const el = $('#toast');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(showToast.t);
    showToast.t = setTimeout(() => { el.hidden = true; }, 2400);
  }

  // ---------- dialogs ----------
  const dlg = $('#dlg');
  function closeDialog() { if (dlg.open) dlg.close(); }
  function dialog(title, bodyNode, actions, opts) {
    $('#dlg-title').textContent = title;
    const box = $('#dlg-body');
    box.textContent = '';
    if (bodyNode) box.appendChild(bodyNode);
    const bar = $('#dlg-actions');
    bar.textContent = '';
    (actions || [{ label: 'Close', primary: true }]).forEach((a) => {
      bar.appendChild(h('button', {
        class: 'btn' + (a.primary ? ' primary' : ''), type: 'button',
        onclick: () => { const keep = a.onClick ? a.onClick() : undefined; if (keep !== false) closeDialog(); },
      }, a.label));
    });
    if (opts && opts.modeless) { if (!dlg.open) dlg.show(); } else if (!dlg.open) dlg.showModal();
  }
  dlg.addEventListener('close', () => { try { Ed.focus(); } catch (err) { /* ignore */ } });
  function notAvailable(name) {
    dialog('Not available in this version', h('div', { class: 'stack-d' },
      h('p', { text: '"' + name + '" is not available in Quadra Word v1.' }),
      h('p', { class: 'muted', text: 'Nothing in your document was changed.' })));
  }
  function cannotInsert() {
    dialog('Cannot insert here', h('p', { text: 'Tables, pictures and page breaks cannot be placed inside a table cell in this version. Move the cursor to a normal paragraph and try again.' }));
  }

  // ---------- menus (open upward when there is no room below) ----------
  const menuEl = $('#menu');
  let menuAnchor = null;
  function closeMenu() { menuEl.hidden = true; menuEl.textContent = ''; menuAnchor = null; }
  function placeMenu(anchor) {
    menuEl.style.maxHeight = (innerHeight - 16) + 'px';
    const r = anchor.getBoundingClientRect();
    const mw = menuEl.offsetWidth, mh = menuEl.offsetHeight;
    let top = r.bottom + 4;
    if (top + mh > innerHeight - 8) top = Math.max(8, r.top - mh - 4);
    const left = Math.max(8, Math.min(r.left, innerWidth - mw - 8));
    menuEl.style.top = top + 'px';
    menuEl.style.left = left + 'px';
  }
  function openMenu(anchor, items, opts) {
    closeMenu();
    menuAnchor = anchor;
    if (opts && opts.before) menuEl.appendChild(opts.before);
    (items || []).forEach((it) => {
      if (it === '-') { menuEl.appendChild(h('div', { class: 'menu-sep' })); return; }
      menuEl.appendChild(h('button', {
        class: 'menu-item' + (it.active ? ' on' : ''), type: 'button', role: 'menuitem', disabled: it.disabled,
        onclick: () => { closeMenu(); if (it.run) it.run(); },
      }, h('span', { style: it.css || null, text: it.label }), it.hint ? h('span', { class: 'mi-hint', text: it.hint }) : null));
    });
    menuEl.hidden = false;
    placeMenu(anchor);
  }
  function palette(onPick, withNone) {
    const grid = h('div', { class: 'palette' });
    if (withNone) grid.appendChild(h('button', { class: 'menu-item', style: 'grid-column: span 6', type: 'button', onclick: () => { closeMenu(); onPick(null); }, text: 'No color' }));
    COLORS.forEach((c) => grid.appendChild(h('button', { class: 'sw', type: 'button', style: 'background:' + c, title: c, 'aria-label': 'Color ' + c, onclick: () => { closeMenu(); onPick(c); } })));
    return grid;
  }
  function chipGrid(list, onPick) {
    const g = h('div', { class: 'chips' });
    list.forEach((t) => g.appendChild(h('button', { class: 'chip', type: 'button', text: t, onclick: () => { closeMenu(); onPick(t); } })));
    return g;
  }
  function tablePicker(onPick) {
    const cap = h('div', { class: 'grid-cap', text: 'Insert table' });
    const g = h('div', { class: 'grid' });
    const cells = [];
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const cell = h('span', { class: 'gc', 'data-r': r, 'data-c': c });
      cells.push(cell);
      g.appendChild(cell);
    }
    const mark = (hr, hc) => {
      cells.forEach((x) => x.classList.toggle('on', +x.dataset.r <= hr && +x.dataset.c <= hc));
      cap.textContent = (hr + 1) + ' x ' + (hc + 1) + ' Table';
    };
    g.addEventListener('mouseover', (e) => { const t = e.target.closest('.gc'); if (t) mark(+t.dataset.r, +t.dataset.c); });
    g.addEventListener('click', (e) => { const t = e.target.closest('.gc'); if (t) { closeMenu(); insertTable(+t.dataset.r + 1, +t.dataset.c + 1); } });
    return h('div', { class: 'grid-pick' }, cap, g);
  }

  // ---------- insert helpers used by menus and ribbon ----------
  function insertTable(rows, cols) { if (!Ed.insertTable(rows, cols)) cannotInsert(); }
  function insertPageBreak() { if (!Ed.insertPageBreak()) cannotInsert(); }
  function tableAction(name) {
    if (!Ed.tableOp[name]()) dialog('Not in a table', h('p', { text: 'Click inside a table cell first, then use this command.' }));
  }
  function setDocTheme(patch) { Ed.setDocField('theme', Object.assign({}, Ed.getDoc().theme, patch)); }
  function insertImageFile(file) {
    if (!file || !/^image\//.test(file.type)) return;
    const r = new FileReader();
    r.onload = () => {
      const im = new Image();
      im.onload = () => {
        const max = 468;
        let w = im.naturalWidth, hh = im.naturalHeight;
        if (w > max) { hh = Math.round(hh * max / w); w = max; }
        if (!Ed.insertImage(r.result, w, hh)) cannotInsert();
      };
      im.src = r.result;
    };
    r.readAsDataURL(file);
  }

  // Menu definitions. Each returns { items, before } and is evaluated when the menu opens.
  const inTable = () => Ed.state().inTable;
  const sec = () => Ed.getDoc().section;
  const MENUS = {
    font: () => ({ items: FONTS.map(([name, css]) => ({ label: name, css: 'font-family:' + css, run: () => Ed.setMark('font', name) })) }),
    size: () => ({ items: SIZES.map((n) => ({ label: String(n), run: () => Ed.setMark('size', n) })) }),
    line: () => ({ items: [['Single', 1], ['1.15', 1.15], ['1.5', 1.5], ['Double', 2], ['2.5', 2.5], ['3.0', 3]].map(([l, v]) => ({ label: l, run: () => Ed.setParaProp({ line: v }) })) }),
    highlight: () => ({ before: palette((c) => Ed.setMark('hl', c), true) }),
    fontcolor: () => ({ before: palette((c) => Ed.setMark('color', c), true) }),
    table: () => {
      const t = inTable();
      return {
        before: tablePicker(insertTable),
        items: [
          '-',
          { label: 'Insert Row Below', disabled: !t, run: () => tableAction('insertRowBelow') },
          { label: 'Insert Column Right', disabled: !t, run: () => tableAction('insertColumnRight') },
          { label: 'Merge with Right Cell', disabled: !t, run: () => tableAction('mergeRight') },
          { label: 'Merge with Cell Below', disabled: !t, run: () => tableAction('mergeBelow') },
          { label: 'Delete Table', disabled: !t, run: () => { if (!Ed.deleteTable()) tableAction('none'); } },
        ],
      };
    },
    symbol: () => ({ before: chipGrid(SYMBOLS, (s) => Ed.typeText(s)) }),
    emoji: () => ({ before: chipGrid(EMOJI, (s) => Ed.typeText(s)) }),
    pagenum: () => ({ items: [
      { label: 'Top of Page', run: () => Ed.setDocField('pageNumber', 'top') },
      { label: 'Bottom of Page', run: () => Ed.setDocField('pageNumber', 'bottom') },
      '-',
      { label: 'Remove Page Numbers', run: () => Ed.setDocField('pageNumber', null) },
    ] }),
    zoom: () => ({ items: ZOOMS.map((z) => ({ label: z + '%', active: z === prefs.zoom, run: () => setZoom(z) })) }),
    theme: () => ({ items: THEMES.map((t) => ({ label: t.name, hint: t.font.split(',')[0].replace(/"/g, ''), run: () => setDocTheme({ font: t.font, accent: t.accent }) })) }),
    'design-fonts': () => ({ items: FONTS.map(([name, css]) => ({ label: name, css: 'font-family:' + css, run: () => setDocTheme({ font: css }) })) }),
    'design-colors': () => ({ before: palette((c) => setDocTheme({ accent: c || '' }), true) }),
    spacing: () => ({ items: [
      { label: 'Default (1.15, 8 pt after)', run: () => Ed.setAllParas({ line: 1.15, after: 8 }) },
      { label: 'Compact (1.0, 0 pt after)', run: () => Ed.setAllParas({ line: 1, after: 0 }) },
      { label: 'Relaxed (1.5, 10 pt after)', run: () => Ed.setAllParas({ line: 1.5, after: 10 }) },
    ] }),
    watermark: () => ({ items: ['CONFIDENTIAL', 'DRAFT', 'SAMPLE'].map((t) => ({ label: t, run: () => Ed.setDocField('watermark', t) }))
      .concat(['-', { label: 'Remove Watermark', run: () => Ed.setDocField('watermark', '') }]) }),
    margins: () => ({ items: Object.keys(E.MARGIN_PRESETS).map((k) => {
      const v = E.MARGIN_PRESETS[k];
      return { label: k + ' (' + (v / 72) + ' in)', active: sec().margins.left === v, run: () => Ed.setSection({ margins: { top: v, right: v, bottom: v, left: v } }) };
    }) }),
    orientation: () => ({ items: ['portrait', 'landscape'].map((o) => ({ label: o[0].toUpperCase() + o.slice(1), active: sec().orientation === o, run: () => Ed.setSection({ orientation: o }) })) }),
    papersize: () => ({ items: ['A4', 'Letter', 'Legal'].map((s) => ({ label: s, active: sec().size === s, run: () => Ed.setSection({ size: s }) })) }),
    columns: () => ({ items: [1, 2, 3].map((n) => ({ label: ['One', 'Two', 'Three'][n - 1], active: sec().columns === n, run: () => Ed.setSection({ columns: n }) })) }),
    breaks: () => ({ items: [
      { label: 'Page Break', run: insertPageBreak },
      { label: 'Column Break', run: () => notAvailable('Column Break') },
    ] }),
    fields: () => ({ items: ['Name', 'Address', 'Company', 'Date'].map((f) => ({ label: f, run: () => Ed.typeText('\u00AB' + f + '\u00BB') })) }),
    apps: () => ({ items: [
      { label: 'Excel', hint: 'office.com', run: () => window.open('https://www.office.com/launch/excel', '_blank', 'noopener') },
      { label: 'Word', hint: 'office.com', run: () => window.open('https://www.office.com/launch/word', '_blank', 'noopener') },
      { label: 'PowerPoint', hint: 'office.com', run: () => window.open('https://www.office.com/launch/powerpoint', '_blank', 'noopener') },
    ] }),
    profile: () => ({ items: [
      { label: 'Quadra profile (this browser only)', disabled: true },
      '-',
      { label: 'Account settings', run: () => notAvailable('Account settings') },
    ] }),
  };
  function openNamedMenu(name, anchor) {
    const fn = MENUS[name];
    if (!fn) return;
    const spec = fn() || {};
    openMenu(anchor, spec.items || [], { before: spec.before });
  }

  // ---------- command registry (ribbon buttons, title bar, status bar) ----------
  const CMD = {};
  function runCmd(el, name) {
    const fn = CMD[name];
    if (fn) fn(el);
    else console.warn('No command registered for', name);
  }
  Object.assign(CMD, {
    undo: () => Ed.undo(),
    redo: () => Ed.redo(),
    paste: async () => {
      let t = '';
      try { t = await navigator.clipboard.readText(); } catch (err) {
        dialog('Paste', h('p', { text: 'The browser blocked clipboard access. Press Ctrl+V to paste.' }));
        return;
      }
      Ed.paste(t);
    },
    cut: async () => { const t = Ed.cut(); if (t) { try { await navigator.clipboard.writeText(t); } catch (err) { /* ignore */ } } },
    copy: async () => { const t = Ed.copy(); if (t) { try { await navigator.clipboard.writeText(t); } catch (err) { /* ignore */ } } },
    'clear-format': () => Ed.clearFormat(),
    bold: () => Ed.toggleMark('b'),
    italic: () => Ed.toggleMark('i'),
    underline: () => Ed.toggleMark('u'),
    strike: () => Ed.toggleMark('s'),
    sub: () => Ed.toggleMark('sub'),
    sup: () => Ed.toggleMark('sup'),
    grow: () => Ed.changeSize(2),
    shrink: () => Ed.changeSize(-2),
    bullets: () => Ed.toggleList('bullet'),
    numbering: () => Ed.toggleList('number'),
    outdent: () => Ed.changeIndent(-1),
    indent: () => Ed.changeIndent(1),
    align: (el) => Ed.setParaProp({ align: el.dataset.value }),
    style: (el) => Ed.setStyle(el.dataset.value),
    'select-all': () => Ed.selectAll(),
    picture: () => $('#file-img').click(),
    pagebreak: insertPageBreak,
    'page-color': () => $('#color-page').click(),
    'zoom-in': () => stepZoom(1),
    'zoom-out': () => stepZoom(-1),
    zoom100: () => setZoom(100),
    fit: () => fitZoom(),
    'view-single': () => setView('single'),
    'view-multi': () => setView('multi'),
    'view-toggle': () => setView(prefs.view === 'single' ? 'multi' : 'single'),
    ruler: () => { prefs.ruler = !prefs.ruler; savePrefs(); applyPrefs(); },
    nav: () => { prefs.nav = !prefs.nav; savePrefs(); applyPrefs(); updateNav(); },
    dark: () => toggleTheme(),
    canvas: () => toggleCanvas(),
    'ribbon-collapse': () => {
      document.body.classList.toggle('ribbon-min');
      const on = document.body.classList.contains('ribbon-min');
      $('#ribbon-toggle').setAttribute('aria-label', on ? 'Expand ribbon' : 'Collapse ribbon');
    },
  });

  // ---------- ribbon tabs ----------
  function showTab(name) {
    $$('[role=tab]').forEach((t) => {
      const on = t.dataset.tab === name;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
    });
    $$('.ribbon-panel').forEach((p) => { p.hidden = p.dataset.panel !== name; });
  }

  // ---------- layout, page count, toolbar ----------
  function applyLayout() {
    const d = Ed.getDoc(), s = d.section, sz = E.pageSize(s), m = s.margins;
    const sheet = $('#sheet');
    sheet.style.width = sz.w * PT + 'px';
    sheet.style.minHeight = sz.h * PT + 'px';
    sheet.style.padding = [m.top, m.right, m.bottom, m.left].map((v) => v * PT + 'px').join(' ');
    sheet.style.background = s.pageColor && s.pageColor !== 'auto' ? s.pageColor : '';
    setVar(sheet, '--doc-font', (d.theme && d.theme.font) || '');
    setVar(sheet, '--doc-accent', (d.theme && d.theme.accent) || '');
    const body = $('#doc-body');
    body.style.columnCount = s.columns > 1 ? String(s.columns) : '';
    body.style.columnGap = '24pt';
    ['#hf-header', '#hf-footer'].forEach((sel) => {
      const el = $(sel);
      el.style.left = m.left * PT + 'px';
      el.style.right = m.right * PT + 'px';
    });
    $('#page-rule').textContent = '@page { size: ' + s.size.toLowerCase() + ' ' + s.orientation + '; margin: 0; }';
    const wm = $('#watermark');
    wm.textContent = d.watermark || '';
    wm.hidden = !d.watermark;
  }
  // Pages are estimated from the measured height of the text (the body is one flowing sheet).
  function pageEstimate() {
    const d = Ed.getDoc(), s = d.section, sz = E.pageSize(s), m = s.margins;
    const usable = (sz.h - m.top - m.bottom) * PT;
    const body = $('#doc-body');
    const explicit = d.blocks.filter((b) => b.type === 'pb').length;
    const total = Math.max(explicit + 1, Math.ceil(body.offsetHeight / Math.max(1, usable)));
    let cur = 1;
    const el = Ed.elementFor(Ed.caretKey());
    if (el) {
      const y = (el.getBoundingClientRect().top - body.getBoundingClientRect().top) / (prefs.zoom / 100);
      cur = Math.min(total, Math.max(1, Math.floor(y / usable) + 1));
    }
    return { cur, total };
  }
  function updatePages() {
    const d = Ed.getDoc();
    const { cur, total } = pageEstimate();
    $('#st-page').textContent = 'Page ' + cur + ' of ' + total;
    const wc = Ed.wordCount();
    $('#st-words').textContent = wc.words + (wc.words === 1 ? ' word' : ' words');
    const pn = 'Page ' + cur + ' of ' + total;
    const headText = [d.header, d.pageNumber === 'top' ? pn : ''].filter(Boolean).join('   ');
    const footText = [d.footer, d.pageNumber === 'bottom' ? pn : ''].filter(Boolean).join('   ');
    $('#hf-header').textContent = headText;
    $('#hf-header').hidden = !headText;
    $('#hf-footer').textContent = footText;
    $('#hf-footer').hidden = !footText;
  }
  function setInput(sel, value) {
    const el = $(sel);
    if (el && document.activeElement !== el) el.value = value;
  }
  function updateToolbar() {
    const st = Ed.state(), m = st.marks, p = st.para;
    $$('[data-mark]').forEach((b) => b.setAttribute('aria-pressed', String(!!m[b.dataset.mark])));
    $$('[data-style]').forEach((b) => b.classList.toggle('on', b.dataset.style === p.style));
    $$('[data-align]').forEach((b) => b.classList.toggle('on', b.dataset.align === p.align));
    $$('[data-list]').forEach((b) => b.classList.toggle('on', b.dataset.list === p.list));
    $('#font-name').textContent = m.font || 'Quadra Sans';
    $('#font-size').textContent = String(m.size || 12);
    $('#btn-undo').disabled = !st.canUndo;
    $('#btn-redo').disabled = !st.canRedo;
    setInput('#indent-left', ((p.indent || 0) / 72).toFixed(2) + '"');
    setInput('#indent-right', ((p.indentR || 0) / 72).toFixed(2) + '"');
    setInput('#space-before', (p.before || 0) + ' pt');
    setInput('#space-after', (p.after === undefined ? 8 : p.after) + ' pt');
  }
  function updateNav() {
    if (!prefs.nav) return;
    const list = $('#nav-list');
    list.textContent = '';
    const items = Ed.outline();
    if (!items.length) list.appendChild(h('li', { class: 'muted', text: 'Headings you add will appear here.' }));
    items.forEach((it) => list.appendChild(h('li', {},
      h('button', { type: 'button', style: 'padding-left:' + (8 + it.level * 12) + 'px', text: it.text, onclick: () => Ed.moveTo(it.b) }))));
  }
  function refresh() {
    applyLayout();
    updateToolbar();
    updateNav();
    updatePages();
  }

  // ---------- zoom, theme, view ----------
  function applyZoom() {
    document.documentElement.style.setProperty('--zoom', String(prefs.zoom / 100));
    $('#st-zoom-val').textContent = prefs.zoom + '%';
    $('#view-zoom-val').textContent = prefs.zoom + '%';
    $('#st-slider').value = String(prefs.zoom);
  }
  function setZoom(z) {
    prefs.zoom = Math.max(50, Math.min(200, Math.round(z)));
    savePrefs();
    applyZoom();
    updatePages();
  }
  function stepZoom(dir) {
    const next = dir > 0 ? ZOOMS.find((z) => z > prefs.zoom) : ZOOMS.slice().reverse().find((z) => z < prefs.zoom);
    if (next) setZoom(next);
  }
  function fitZoom() {
    const sz = E.pageSize(sec());
    const avail = $('#sheet-wrap').clientWidth - 48;
    setZoom(Math.floor(avail / (sz.w * PT) * 100));
  }
  function applyTheme() {
    document.documentElement.dataset.theme = prefs.theme;
    document.documentElement.dataset.canvas = prefs.canvas;
    $('#btn-theme').setAttribute('aria-pressed', String(prefs.theme === 'dark'));
    $$('[data-toggle="dark"]').forEach((b) => b.setAttribute('aria-pressed', String(prefs.theme === 'dark')));
  }
  function toggleTheme() { prefs.theme = prefs.theme === 'dark' ? 'light' : 'dark'; savePrefs(); applyTheme(); }
  function toggleCanvas() { prefs.canvas = prefs.canvas === 'dark' ? 'light' : 'dark'; savePrefs(); applyTheme(); }
  function setView(v) {
    prefs.view = v;
    savePrefs();
    applyPrefs();
  }
  function applyPrefs() {
    applyTheme();
    applyZoom();
    document.body.dataset.view = prefs.view;
    document.body.classList.toggle('show-ruler', !!prefs.ruler);
    document.body.classList.toggle('show-nav', !!prefs.nav);
    $('#ruler').hidden = !prefs.ruler;
    $('#nav-pane').hidden = !prefs.nav;
    $$('[data-toggle="ruler"]').forEach((b) => b.setAttribute('aria-pressed', String(!!prefs.ruler)));
    $$('[data-toggle="nav"]').forEach((b) => b.setAttribute('aria-pressed', String(!!prefs.nav)));
    $('#view-single').setAttribute('aria-pressed', String(prefs.view === 'single'));
    $('#view-multi').setAttribute('aria-pressed', String(prefs.view === 'multi'));
    $('#st-pageview').setAttribute('aria-pressed', String(prefs.view === 'multi'));
    $('#sheet').classList.toggle('view-multi', prefs.view === 'multi');
  }

  // ---------- autosave ----------
  let saveTimer = null;
  function setSave(text, ok) {
    const s = $('#save-status');
    s.dataset.ok = String(ok !== false);
    s.querySelector('span').textContent = text;
  }
  function saveNow(manual) {
    clearTimeout(saveTimer);
    try {
      localStorage.setItem(KEY_DOC, JSON.stringify(Ed.getDoc()));
      setSave('Saved', true);
      if (manual) showToast('Saved to this browser');
      return true;
    } catch (err) {
      setSave('Not saved', false);
      showToast('Could not save: browser storage is full or blocked');
      return false;
    }
  }
  function scheduleSave() {
    setSave('Saving...', true);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveNow(false), 400);
  }

  // ---------- image input and drop ----------
  $('#file-img').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    insertImageFile(f);
  });
  $('#color-page').addEventListener('input', (e) => Ed.setSection({ pageColor: e.target.value }));

  // ---------- wiring ----------
  function wire() {
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-cmd],[data-menu],[data-na],[data-tab]');
      if (!el || el.disabled) return;
      if (el.dataset.tab) { if (el.dataset.tab === 'file') CMD['bs-open'](); else showTab(el.dataset.tab); return; }
      if (el.dataset.na) return notAvailable(el.dataset.na);
      if (el.dataset.menu) return openNamedMenu(el.dataset.menu, el);
      if (el.dataset.cmd) return runCmd(el, el.dataset.cmd);
    });
    // Ribbon and status buttons keep focus in the document (so typing continues after a click).
    document.addEventListener('mousedown', (e) => {
      const b = e.target.closest && e.target.closest('button');
      if (b && !b.closest('#menu, #dlg, #backstage, #nav-pane')) e.preventDefault();
    }, true);
    document.addEventListener('pointerdown', (e) => {
      if (menuEl.hidden) return;
      if (menuEl.contains(e.target) || (menuAnchor && menuAnchor.contains(e.target))) return;
      closeMenu();
    }, true);
    $('.menubar').addEventListener('keydown', (e) => {
      const tabs = $$('[role=tab]');
      const i = tabs.indexOf(document.activeElement);
      if (i < 0 || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
      const j = (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      e.preventDefault();
      tabs[j].focus();
      tabs[j].click();
    });
    $('#sheet').addEventListener('mousedown', (e) => {
      if (e.target.id !== 'sheet') return;
      const d = Ed.getDoc();
      let b = d.blocks.length - 1;
      while (b > 0 && d.blocks[b].type !== 'p') b--;
      if (d.blocks[b] && d.blocks[b].type === 'p') Ed.moveTo(b);
    });
    $('#st-slider').addEventListener('input', (e) => setZoom(+e.target.value));
    $('#doc-title').addEventListener('input', (e) => {
      Ed.setTitle(e.target.value || 'Untitled');
      document.title = (e.target.value || 'Untitled') + ' - Quadra Word';
    });
    $$('[data-input]').forEach((inp) => inp.addEventListener('change', () => {
      const v = parseFloat(inp.value);
      if (!isFinite(v)) { updateToolbar(); return; }
      const kind = inp.dataset.input;
      if (kind === 'indent-left') Ed.setParaProp({ indent: Math.max(0, v * 72) });
      if (kind === 'indent-right') Ed.setParaProp({ indentR: Math.max(0, v * 72) });
      if (kind === 'space-before') Ed.setParaProp({ before: Math.max(0, v) });
      if (kind === 'space-after') Ed.setParaProp({ after: Math.max(0, v) });
      Ed.focus();
    }));
    const body = $('#doc-body');
    body.addEventListener('dragover', (e) => e.preventDefault());
    body.addEventListener('drop', (e) => {
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f && /^image\//.test(f.type)) { e.preventDefault(); insertImageFile(f); }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!menuEl.hidden) closeMenu();
        else if (!$('#backstage').hidden) CMD['bs-close']();
        return;
      }
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 's') { e.preventDefault(); saveNow(true); }
      else if (k === 'p') { e.preventDefault(); CMD.print(); }
      else if (k === 'f') { e.preventDefault(); CMD.find(); }
      else if (k === 'h') { e.preventDefault(); CMD.replace(); }
    });
    window.addEventListener('pagehide', () => saveNow(false));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveNow(false); });
  }

  // ---------- startup (called by part 2 after it registers its commands) ----------
  function loadInitialDoc() {
    try {
      const raw = localStorage.getItem(KEY_DOC);
      if (raw) return E.deserialize(raw);
    } catch (err) {
      console.warn('Saved document could not be read; starting a new one.', err);
    }
    return E.createDoc();
  }
  function start() {
    Ed.init({ doc: loadInitialDoc() });
    const d = Ed.getDoc();
    $('#doc-title').value = d.title;
    document.title = d.title + ' - Quadra Word';
    applyPrefs();
    Ed.on('change', () => { refresh(); scheduleSave(); });
    Ed.on('selection', () => { updateToolbar(); updatePages(); });
    wire();
    refresh();
  }

  window.QuadraUI = {
    CMD, h, $, $$, dialog, closeDialog, notAvailable, cannotInsert, showToast,
    openMenu, closeMenu, palette, chipGrid, openNamedMenu, showTab,
    applyLayout, updatePages, refresh, applyPrefs, setZoom, setView, saveNow, scheduleSave, setSave,
    insertImageFile, insertTable, insertPageBreak, setDocTheme, prefs, savePrefs, PT, KEY_DOC, start,
    FONTS, SIZES, THEMES,
  };
})();

/* ===== ui.js part 2 of 2: backstage, dialogs, print, import/export ===== */
(function (U) {
  'use strict';
  const E = window.QuadraEngine;
  const Ed = window.QuadraEditor;
  const { CMD, h, $, $$, dialog, closeDialog, notAvailable, showToast, PT, KEY_DOC } = U;
  const KEY_VER = 'quadra.versions.v1';

  // ---------- find and replace (modeless so the document stays selectable) ----------
  function openFind(replaceMode) {
    const q = h('input', { type: 'text', id: 'f-q', placeholder: 'Find', 'aria-label': 'Find what', autocomplete: 'off' });
    const r = h('input', { type: 'text', id: 'f-r', placeholder: 'Replace with', 'aria-label': 'Replace with', autocomplete: 'off' });
    const cs = h('input', { type: 'checkbox', id: 'f-cs' });
    const msg = h('div', { class: 'hint', id: 'f-msg', role: 'status' });
    const opts = () => ({ matchCase: cs.checked });
    const count = () => {
      const n = E.findAll(Ed.getDoc(), q.value, opts()).length;
      return q.value ? (n + (n === 1 ? ' match' : ' matches')) : '';
    };
    const doFind = () => {
      const ok = Ed.findNext(q.value, opts());
      msg.textContent = ok ? count() : (q.value ? 'No matches' : 'Type something to find');
      msg.classList.toggle('err', !ok && !!q.value);
      return ok;
    };
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doFind(); } });
    const body = h('div', { class: 'stack-d' },
      h('label', { class: 'field' }, 'Find what', q),
      replaceMode ? h('label', { class: 'field' }, 'Replace with', r) : null,
      h('label', { class: 'chk' }, cs, 'Match case'),
      msg);
    const actions = [
      { label: 'Find Next', primary: true, onClick: () => { doFind(); return false; } },
    ];
    if (replaceMode) {
      actions.push({ label: 'Replace', onClick: () => {
        const ok = Ed.replaceCurrent(q.value, r.value, opts());
        msg.textContent = ok ? count() : 'No more matches';
        return false;
      } });
      actions.push({ label: 'Replace All', onClick: () => {
        const n = Ed.replaceAll(q.value, r.value, opts());
        msg.textContent = n + (n === 1 ? ' replacement made' : ' replacements made');
        return false;
      } });
    }
    actions.push({ label: 'Close' });
    dialog(replaceMode ? 'Find and Replace' : 'Find', body, actions, { modeless: true });
    q.focus();
  }

  function openWordCount() {
    const d = Ed.getDoc();
    const wc = E.wordCount(d);
    const pages = $('#st-page').textContent.replace(/^Page \d+ of /, '');
    const rows = [
      ['Words', wc.words], ['Characters (with spaces)', wc.chars],
      ['Characters (no spaces)', wc.charsNoSpaces], ['Paragraphs', wc.paragraphs], ['Pages (estimate)', pages],
    ];
    dialog('Word Count', h('table', { class: 'kv' }, rows.map(([k, v]) => h('tr', {}, h('td', { text: k }), h('td', { text: String(v) })))));
  }

  function openLink() {
    const url = h('input', { type: 'url', placeholder: 'https://example.com', 'aria-label': 'Link address' });
    const err = h('div', { class: 'hint err', role: 'alert' });
    const sel = Ed.selectedText();
    const body = h('div', { class: 'stack-d' },
      h('label', { class: 'field' }, sel ? 'Link the selected text to' : 'Text and link address', url),
      err);
    dialog('Insert Link', body, [
      { label: 'Insert', primary: true, onClick: () => {
        const v = url.value.trim();
        if (!/^(https?:\/\/|mailto:)/i.test(v)) { err.textContent = 'Enter an address that starts with https://, http:// or mailto:'; return false; }
        if (!Ed.insertLink(v)) { err.textContent = 'Links cannot be inserted inside a table cell in this version.'; return false; }
        return true;
      } },
      { label: 'Cancel' },
    ]);
    url.focus();
  }

  function openHeaderFooter() {
    const d = Ed.getDoc();
    const head = h('textarea', { 'aria-label': 'Header text' }, d.header || '');
    const foot = h('textarea', { 'aria-label': 'Footer text' }, d.footer || '');
    const pn = h('select', { 'aria-label': 'Page number position' },
      h('option', { value: '' }, 'No page number'),
      h('option', { value: 'top', selected: d.pageNumber === 'top' ? '' : null }, 'Top of page'),
      h('option', { value: 'bottom', selected: d.pageNumber === 'bottom' ? '' : null }, 'Bottom of page'));
    pn.value = d.pageNumber || '';
    const body = h('div', { class: 'stack-d' },
      h('label', { class: 'field' }, 'Header', head),
      h('label', { class: 'field' }, 'Footer', foot),
      h('label', { class: 'field' }, 'Page numbers', pn),
      h('p', { class: 'muted', text: 'Header and footer appear once at the top and bottom of the sheet on screen and in print.' }));
    dialog('Header and Footer', body, [
      { label: 'Save', primary: true, onClick: () => {
        Ed.setDocField('header', head.value);
        Ed.setDocField('footer', foot.value);
        Ed.setDocField('pageNumber', pn.value || null);
        return true;
      } },
      { label: 'Cancel' },
    ]);
  }

  // ---------- print ----------
  function printDoc() {
    U.applyLayout();
    window.print();
  }

  // ---------- version snapshots (File > Version History) ----------
  function readVersions() {
    try { return JSON.parse(localStorage.getItem(KEY_VER) || '[]'); } catch (err) { return []; }
  }
  function saveVersion(label) {
    const list = readVersions();
    list.unshift({ id: Date.now(), time: new Date().toLocaleString(), title: Ed.getDoc().title, label, doc: JSON.stringify(Ed.getDoc()) });
    try { localStorage.setItem(KEY_VER, JSON.stringify(list.slice(0, 10))); return true; } catch (err) { return false; }
  }

  // ---------- import and export ----------
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = h('a', { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function baseName() { return (Ed.getDoc().title || 'Document').replace(/[\\/:*?"<>|]+/g, '_'); }

  function importHtml(html, title) {
    const root = new DOMParser().parseFromString(html, 'text/html').body;
    const doc = E.createDoc(title);
    doc.blocks = [];
    const runsOf = (node, f, out) => {
      node.childNodes.forEach((n) => {
        if (n.nodeType === 3) { if (n.nodeValue) out.push({ t: n.nodeValue.replace(/\s+/g, ' '), f: Object.assign({}, f) }); return; }
        if (n.nodeType !== 1) return;
        const tag = n.tagName.toLowerCase();
        if (tag === 'br') { out.push({ t: '\n', f: Object.assign({}, f) }); return; }
        const nf = Object.assign({}, f);
        if (tag === 'strong' || tag === 'b') nf.b = true;
        if (tag === 'em' || tag === 'i') nf.i = true;
        if (tag === 'u') nf.u = true;
        if (tag === 's' || tag === 'strike' || tag === 'del') nf.s = true;
        if (tag === 'sup') nf.sup = true;
        if (tag === 'sub') nf.sub = true;
        runsOf(n, nf, out);
      });
      return out;
    };
    const pushPara = (node, props) => {
      const p = E.newPara('', props || {});
      p.runs = runsOf(node, {}, []);
      E.normalize(p);
      doc.blocks.push(p);
    };
    const walk = (node) => {
      node.childNodes.forEach((n) => {
        if (n.nodeType === 3) { if (n.nodeValue.trim()) pushPara({ childNodes: [n] }); return; }
        if (n.nodeType !== 1) return;
        const tag = n.tagName.toLowerCase();
        if (/^h[1-3]$/.test(tag)) pushPara(n, { style: 'Heading ' + tag[1] });
        else if (tag === 'p' || tag === 'li') pushPara(n, { align: n.style.textAlign || 'left' });
        else if (tag === 'ul' || tag === 'ol') {
          Array.from(n.children).filter((c) => c.tagName === 'LI').forEach((li) => pushPara(li, { list: { kind: tag === 'ol' ? 'number' : 'bullet', level: 0 } }));
        } else if (tag === 'table') {
          const rows = Array.from(n.rows).map((tr) => Array.from(tr.cells).map((td) => {
            const cp = E.newPara('', {});
            cp.runs = runsOf(td, {}, []);
            E.normalize(cp);
            return { paras: [cp], colspan: td.colSpan || 1, rowspan: td.rowSpan || 1 };
          }));
          if (rows.length) doc.blocks.push({ type: 'table', rows });
        } else if (tag === 'img') {
          const src = n.getAttribute('src') || '';
          if (/^data:image\//.test(src)) doc.blocks.push({ type: 'img', src, w: +n.getAttribute('width') || 300, h: +n.getAttribute('height') || 200, align: 'left' });
        } else if (n.style && n.style.pageBreakAfter === 'always') {
          doc.blocks.push({ type: 'pb' });
        } else {
          walk(n);
        }
      });
    };
    walk(root);
    if (!doc.blocks.length) doc.blocks.push(E.newPara());
    return doc;
  }

  function importFile(name, text) {
    const title = name.replace(/\.[^.]+$/, '') || 'Document';
    let doc;
    if (/\.json$/i.test(name)) doc = E.deserialize(text);
    else if (/\.html?$/i.test(name)) doc = importHtml(text, title);
    else {
      doc = E.createDoc(title);
      doc.blocks = text.split(/\r?\n/).map((line) => E.newPara(line));
      if (!doc.blocks.length) doc.blocks.push(E.newPara());
    }
    saveVersion('Before opening ' + name);
    Ed.setDoc(doc);
    U.saveNow(false);
    closeBackstage();
    showToast('Opened ' + name);
  }

  // ---------- backstage (File tab) ----------
  const BS = [
    { id: 'new', label: 'New' }, { id: 'open', label: 'Open' }, { id: 'save', label: 'Save As' },
    { id: 'print', label: 'Print' }, { id: 'rename', label: 'Rename' }, { id: 'history', label: 'Version History' },
    { id: 'info', label: 'Info' }, { id: 'share', label: 'Share', na: true }, { id: 'move', label: 'Move File', na: true },
    { id: 'delete', label: 'Delete' },
  ];
  function closeBackstage() { $('#backstage').hidden = true; U.showTab('home'); Ed.focus(); }
  function openBackstage(id) {
    $('#backstage').hidden = false;
    renderBackstage(id || 'info');
  }
  function renderBackstage(id) {
    const list = $('#bs-list');
    list.textContent = '';
    BS.forEach((it) => list.appendChild(h('button', {
      class: 'bs-item' + (it.id === id ? ' on' : ''), type: 'button', 'data-bs': it.id,
      onclick: () => { if (it.na) return notAvailable(it.label); renderBackstage(it.id); },
    }, it.label, it.na ? h('span', { class: 'bs-tag', text: 'n/a' }) : null)));
    const pane = $('#bs-pane');
    pane.textContent = '';
    pane.appendChild(PANES[id]());
  }
  const PANES = {
    new: () => h('div', { class: 'stack-d' },
      h('h2', { text: 'New document' }),
      h('p', { text: 'The current document is kept as a version snapshot first, so you can restore it from Version History.' }),
      h('div', { class: 'row-b' }, h('button', { class: 'btn primary', type: 'button', onclick: () => {
        saveVersion('Before New');
        Ed.setDoc(E.createDoc());
        U.saveNow(false);
        closeBackstage();
        showToast('New document created');
      } }, 'Create blank document'))),
    open: () => {
      const input = h('input', { type: 'file', accept: '.json,.html,.htm,.txt', 'aria-label': 'Choose a file' });
      input.addEventListener('change', () => {
        const f = input.files && input.files[0];
        if (!f) return;
        const r = new FileReader();
        r.onload = () => { try { importFile(f.name, String(r.result)); } catch (err) { showToast('Could not open this file: ' + err.message); } };
        r.readAsText(f);
      });
      return h('div', { class: 'stack-d' },
        h('h2', { text: 'Open' }),
        h('p', { class: 'muted', text: 'Open a Quadra .json file, an .html file, or plain .txt. Your current document is saved as a version first.' }),
        input);
    },
    save: () => {
      const name = baseName();
      const row = (label, fn) => h('button', { class: 'btn', type: 'button', onclick: fn }, label);
      return h('div', { class: 'stack-d' },
        h('h2', { text: 'Save As' }),
        h('p', { class: 'muted', text: 'Quadra also keeps your document in this browser automatically. Download a copy:' }),
        h('div', { class: 'row-b' },
          row('Quadra (.json)', () => download(name + '.json', JSON.stringify(Ed.getDoc()), 'application/json')),
          row('Web page (.html)', () => download(name + '.html', E.toHTML(Ed.getDoc()), 'text/html')),
          row('Plain text (.txt)', () => download(name + '.txt', E.plainText(Ed.getDoc()), 'text/plain'))));
    },
    print: () => {
      const sec = Ed.getDoc().section;
      const { cur, total } = { total: $('#st-page').textContent.split(' of ')[1] || 1 };
      return h('div', { class: 'stack-d' },
        h('h2', { text: 'Print' }),
        h('table', { class: 'kv' },
          h('tr', {}, h('td', { text: 'Paper' }), h('td', { text: sec.size + ', ' + sec.orientation })),
          h('tr', {}, h('td', { text: 'Columns' }), h('td', { text: String(sec.columns) })),
          h('tr', {}, h('td', { text: 'Pages (estimate)' }), h('td', { text: String(total) }))),
        h('p', { class: 'muted', text: 'Print uses the browser print dialog with the page size set above. Print Preview is the browser preview.' }),
        h('div', { class: 'row-b' }, h('button', { class: 'btn primary', type: 'button', onclick: () => printDoc() }, 'Print')));
    },
    rename: () => {
      const input = h('input', { type: 'text', value: Ed.getDoc().title, 'aria-label': 'Document name' });
      return h('div', { class: 'stack-d' },
        h('h2', { text: 'Rename' }),
        h('div', { class: 'row-b' }, input,
          h('button', { class: 'btn primary', type: 'button', onclick: () => {
            const v = input.value.trim() || 'Untitled';
            Ed.setTitle(v);
            $('#doc-title').value = v;
            document.title = v + ' - Quadra Word';
            U.scheduleSave();
            showToast('Renamed to ' + v);
          } }, 'Rename')));
    },
    history: () => {
      const list = readVersions();
      const ul = h('ul', { class: 'hist' });
      if (!list.length) ul.appendChild(h('li', { class: 'muted', text: 'No saved versions yet.' }));
      list.forEach((v) => ul.appendChild(h('li', {},
        h('span', { text: v.time + ' - ' + (v.label || 'Version') }),
        h('button', { class: 'btn', type: 'button', onclick: () => {
          saveVersion('Before restoring ' + v.time);
          Ed.setDoc(E.deserialize(v.doc));
          U.saveNow(false);
          closeBackstage();
          showToast('Restored version from ' + v.time);
        } }, 'Restore'))));
      return h('div', { class: 'stack-d' },
        h('h2', { text: 'Version History' }),
        h('div', { class: 'row-b' }, h('button', { class: 'btn', type: 'button', onclick: () => {
          saveVersion('Manual save');
          renderBackstage('history');
          showToast('Version saved');
        } }, 'Save version now')),
        ul);
    },
    info: () => {
      const d = Ed.getDoc();
      const wc = E.wordCount(d);
      return h('div', { class: 'stack-d' },
        h('h2', { text: 'Info' }),
        h('table', { class: 'kv' },
          h('tr', {}, h('td', { text: 'Title' }), h('td', { text: d.title })),
          h('tr', {}, h('td', { text: 'Words' }), h('td', { text: String(wc.words) })),
          h('tr', {}, h('td', { text: 'Characters' }), h('td', { text: String(wc.chars) })),
          h('tr', {}, h('td', { text: 'Paragraphs' }), h('td', { text: String(wc.paragraphs) })),
          h('tr', {}, h('td', { text: 'Saved in' }), h('td', { text: 'This browser (localStorage)' }))));
    },
    delete: () => h('div', { class: 'stack-d' },
      h('h2', { text: 'Delete' }),
      h('p', { text: 'Deleting clears the current document from this browser. A version snapshot is kept first.' }),
      h('div', { class: 'row-b' }, h('button', { class: 'btn', type: 'button', onclick: () => {
        dialog('Delete this document?', h('p', { text: 'The document in this browser will be cleared. Version snapshots stay available.' }), [
          { label: 'Delete', primary: true, onClick: () => {
            saveVersion('Before delete');
            Ed.setDoc(E.createDoc());
            try { localStorage.removeItem(KEY_DOC); } catch (err) { /* ignore */ }
            U.saveNow(false);
            closeBackstage();
            showToast('Document deleted');
          } },
          { label: 'Cancel' },
        ]);
      } }, 'Delete document'))),
  };
  PANES.share = PANES.info;
  PANES.move = PANES.info;

  // ---------- help dialogs ----------
  const SHORTCUTS = [
    ['Ctrl+B / Ctrl+I / Ctrl+U', 'Bold, italic, underline'],
    ['Ctrl+Z / Ctrl+Y', 'Undo, redo'],
    ['Ctrl+C / Ctrl+X / Ctrl+V', 'Copy, cut, paste'],
    ['Ctrl+A', 'Select all'],
    ['Ctrl+F / Ctrl+H', 'Find, replace'],
    ['Ctrl+S', 'Save to this browser now'],
    ['Ctrl+P', 'Print'],
    ['Tab / Shift+Tab', 'Indent or outdent a list item; move between table cells'],
  ];

  // ---------- commands ----------
  Object.assign(CMD, {
    'bs-open': () => openBackstage('open'),
    'bs-close': () => closeBackstage(),
    print: () => printDoc(),
    find: () => openFind(false),
    replace: () => openFind(true),
    'word-count': () => openWordCount(),
    link: () => openLink(),
    'header-footer': () => openHeaderFooter(),
    toc: () => {
      if (!Ed.insertTOC()) dialog('No headings yet', h('p', { text: 'Apply Title or Heading 1 to 3 to some paragraphs, then insert the table of contents.' }));
    },
    help: () => dialog('Quadra Word Help', h('div', { class: 'stack-d' },
      h('p', { text: 'Quadra Word is a browser word processor. Your document is saved in this browser automatically.' }),
      h('p', { class: 'muted', text: 'Features that are not in this version show a "not available" message and leave your document unchanged.' }))),
    shortcuts: () => dialog('Keyboard Shortcuts', h('table', { class: 'kv' },
      SHORTCUTS.map(([k, v]) => h('tr', {}, h('td', { text: k }), h('td', { text: v }))))),
    whatsnew: () => dialog("What's New", h('div', { class: 'stack-d' },
      h('p', { text: 'Quadra Word v1: formatting, styles, lists, tables, images, page layout, find and replace, autosave and zoom.' }),
      h('p', { class: 'muted', text: 'Not yet available: spelling dictionary, comments, track changes, mail merge, citations.' }))),
  });

  U.openBackstage = openBackstage;
  U.openFind = openFind;
  U.printDoc = printDoc;
  U.start();
})(window.QuadraUI);
