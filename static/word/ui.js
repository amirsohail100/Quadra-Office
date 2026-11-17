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
  const BORDER_CSS = { single: 'solid', double: 'double', dashed: 'dashed', dotted: 'dotted' };
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

  const PREFS_VERSION = 2;
  function loadPrefs() {
    const d = { prefsVersion: PREFS_VERSION, zoom: 100, theme: 'dark', canvas: 'auto', ruler: false, nav: false, view: 'single', defaultPaper: 'A4' };
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(KEY_PREFS) || '{}'); } catch (err) { saved = {}; }
    // Prefs saved before version 2 had canvas:'dark' forced by an old build; reset that one choice.
    if (saved.prefsVersion !== PREFS_VERSION) delete saved.canvas;
    return Object.assign(d, saved, { prefsVersion: PREFS_VERSION });
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
  // Closing gives the focus back to the document at once. The browser's 'close' event fires later,
  // so waiting for it would let the next key press land on the page instead of the text.
  function closeDialog() {
    if (dlg.open) dlg.close();
    try { Ed.focus(); } catch (err) { /* ignore: editor not ready */ }
  }
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
  function closeMenu() { menuEl.hidden = true; menuEl.textContent = ''; menuEl.classList.remove('panel'); menuAnchor = null; }
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
      { label: 'Column Break', run: () => { if (!Ed.insertColumnBreak()) cannotInsert(); } },
    ] }),
    fields: () => {
      const m = Ed.getDoc().merge;
      const names = m && m.fields && m.fields.length ? m.fields : ['Name', 'Address', 'Company', 'Date'];
      const items = names.map((f) => ({ label: f, run: () => Ed.typeText('\u00AB' + f + '\u00BB') }));
      if (!(m && m.fields && m.fields.length)) items.push('-', { label: 'Start Mail Merge to use your own fields', disabled: true });
      return { items };
    },
    tracking: () => {
      const on = Ed.isTracking();
      return { items: [
        { label: on ? 'Turn off Track Changes' : 'Turn on Track Changes', active: on, run: () => Ed.setTracking(!on) },
        '-',
        { label: 'Accept All Changes', run: () => { const n = Ed.acceptAllChanges(); showToast(n ? n + (n === 1 ? ' change accepted' : ' changes accepted') : 'No tracked changes'); } },
        { label: 'Reject All Changes', run: () => { const n = Ed.rejectAllChanges(); showToast(n ? n + (n === 1 ? ' change rejected' : ' changes rejected') : 'No tracked changes'); } },
      ] };
    },
    linenumbers: () => ({ items: [
      { label: 'None', active: !sec().lineNumbers, run: () => Ed.setSection({ lineNumbers: false }) },
      { label: 'Continuous', active: !!sec().lineNumbers, run: () => Ed.setSection({ lineNumbers: true }) },
    ] }),
    citations: () => {
      const srcs = Ed.getDoc().sources || [];
      const items = [
        { label: 'Manage sources...', run: () => openSources() },
        { label: 'Insert bibliography', run: () => {
          const paras = E.bibliographyParas(Ed.getDoc());
          if (!paras.length) { dialog('No sources yet', h('p', { text: 'Add a source first with Manage sources.' })); return; }
          Ed.insertParagraphs(paras);
        } },
        '-',
      ];
      if (!srcs.length) items.push({ label: 'No sources yet', disabled: true });
      srcs.forEach((src) => items.push({ label: 'Cite ' + E.citationText(src), run: () => Ed.typeText(E.citationText(src)) }));
      return { items };
    },
    shapes: () => ({ items: [['Rectangle', 'rectangle'], ['Ellipse', 'ellipse'], ['Line', 'line'], ['Arrow', 'arrow'], ['Triangle', 'triangle'], ['Star', 'star']]
      .map(([label, kind]) => ({ label, run: () => { if (!Ed.insertImage(E.shapeDataUrl(kind, 200, 120), 200, 120)) cannotInsert(); } })) }),
    apps: () => ({ panel: appsPanel }),
    profile: () => ({ panel: profilePanel }),
  };
  function openNamedMenu(name, anchor) {
    const fn = MENUS[name];
    if (!fn) return;
    const spec = fn() || {};
    if (spec.panel) return openPanel(anchor, spec.panel);
    openMenu(anchor, spec.items || [], { before: spec.before });
  }
  function openPanel(anchor, build) {
    closeMenu();
    menuAnchor = anchor;
    menuEl.classList.add('panel');
    build(menuEl);
    menuEl.hidden = false;
    placeMenu(anchor);
  }
  function iconEl(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'ico');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#i-' + name);
    svg.appendChild(use);
    return svg;
  }

  // ---------- local profile (title bar avatar, profile panel, Options, Account, Sign out) ----------
  const KEY_PROFILE = 'quadra.profile.v1';
  const DEFAULT_PROFILE = { name: 'Quadra User', mode: 'Local profile' };
  function loadProfile() {
    try { return Object.assign({}, DEFAULT_PROFILE, JSON.parse(localStorage.getItem(KEY_PROFILE) || '{}')); } catch (err) { return Object.assign({}, DEFAULT_PROFILE); }
  }
  let profile = loadProfile();
  function saveProfile() { try { localStorage.setItem(KEY_PROFILE, JSON.stringify(profile)); } catch (err) { /* ignore */ } }
  function initialsOf(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    const a = (parts[0] || 'Q')[0], b = (parts[1] || parts[0] || 'Q')[0];
    return (a + b).toUpperCase();
  }
  function applyProfile() {
    const btn = $('#btn-profile');
    btn.textContent = initialsOf(profile.name);
    btn.setAttribute('aria-label', 'Profile: ' + profile.name);
  }
  function profilePanel(root) {
    const item = (icon, label, run, right) => h('button', {
      class: 'pi', type: 'button', role: 'menuitem',
      onclick: () => { closeMenu(); if (run) run(); },
    }, iconEl(icon), h('span', { class: 'pi-label', text: label }), right || null);
    root.appendChild(h('div', { class: 'panel-head' },
      h('div', { class: 'panel-avatar', text: initialsOf(profile.name) }),
      h('div', {},
        h('div', { class: 'panel-name', text: profile.name }),
        h('div', { class: 'panel-sub', text: profile.mode }))));
    root.appendChild(h('div', { class: 'menu-sep' }));
    root.appendChild(h('div', { class: 'panel-body' },
      item('moon', 'Dark mode', () => toggleTheme(), h('span', { class: 'switch', 'data-on': String(prefs.theme === 'dark') })),
      item('sliders', 'Options', () => openOptions()),
      item('profile', 'Account', () => openAccount())));
    root.appendChild(h('div', { class: 'menu-sep' }));
    root.appendChild(h('div', { class: 'panel-body' },
      item('logout', 'Sign out', () => openSignOut())));
  }
  const APPS = [
    { label: 'Excel', cls: 'excel', letter: 'X', url: 'https://www.office.com/launch/excel' },
    { label: 'Word', cls: 'word', letter: 'W', url: 'https://www.office.com/launch/word', current: true },
    { label: 'PowerPoint', cls: 'ppt', letter: 'P', url: 'https://www.office.com/launch/powerpoint' },
    { label: 'Outlook', cls: 'outlook', letter: 'O', url: 'https://outlook.live.com/mail/' },
    { label: 'OneDrive', cls: 'onedrive', letter: 'D', url: 'https://onedrive.live.com/' },
    { label: 'OneNote', cls: 'onenote', letter: 'N', url: 'https://www.onenote.com/notebooks' },
  ];
  function appsPanel(root) {
    root.appendChild(h('div', { class: 'apps-title', text: 'Quadra apps' }));
    const grid = h('div', { class: 'apps-grid' });
    APPS.forEach((a) => grid.appendChild(h('a', {
      class: 'app-tile' + (a.current ? ' current' : ''), href: a.url, target: '_blank', rel: 'noopener',
      'aria-current': a.current ? 'page' : null,
      onclick: () => closeMenu(),
    }, h('span', { class: 'app-ico ' + a.cls, text: a.letter }), h('span', { text: a.label }))));
    root.appendChild(grid);
  }

  function openOptions() {
    const paper = h('select', { 'aria-label': 'Default paper size' },
      ['A4', 'Letter', 'Legal'].map((v) => h('option', { value: v, selected: prefs.defaultPaper === v ? '' : null }, v)));
    const ruler = h('input', { type: 'checkbox', checked: !!prefs.ruler });
    dialog('Options', h('div', { class: 'stack-d' },
      h('label', { class: 'field' }, 'Paper size for new documents', paper),
      h('label', { class: 'chk' }, ruler, 'Show ruler'),
      h('p', { class: 'muted', text: 'Options are saved in this browser.' })), [
      { label: 'Save', primary: true, onClick: () => {
        prefs.defaultPaper = paper.value;
        prefs.ruler = ruler.checked;
        savePrefs();
        applyPrefs();
        showToast('Options saved');
        return true;
      } },
      { label: 'Cancel' },
    ]);
  }
  function openAccount() {
    const name = h('input', { type: 'text', value: profile.name, maxlength: '40', 'aria-label': 'Display name' });
    dialog('Account', h('div', { class: 'stack-d' },
      h('label', { class: 'profile-field' }, 'Display name', name),
      h('p', { class: 'muted', text: 'This local profile lives only in this browser. Quadra has no account server yet.' })), [
      { label: 'Save', primary: true, onClick: () => {
        profile.name = name.value.trim() || DEFAULT_PROFILE.name;
        saveProfile();
        applyProfile();
        showToast('Profile updated');
        return true;
      } },
      { label: 'Cancel' },
    ]);
    name.focus();
  }
  function openSignOut() {
    dialog('Sign out', h('p', { text: 'Sign out of the local profile? Your documents stay in this browser. The display name goes back to Quadra User.' }), [
      { label: 'Sign out', primary: true, onClick: () => {
        profile = Object.assign({}, DEFAULT_PROFILE);
        saveProfile();
        applyProfile();
        showToast('Signed out of the local profile');
        return true;
      } },
      { label: 'Cancel' },
    ]);
  }


  // ---------- notes, note editor, sources (used by menus and by refresh, so they live in part 1) ----------
  function renderNotes() {
    const area = $('#notes-area');
    const notes = E.listNotes(Ed.getDoc());
    area.textContent = '';
    area.hidden = !notes.length;
    ['footnote', 'endnote'].forEach((kind) => {
      const list = notes.filter((n) => n.kind === kind);
      if (!list.length) return;
      area.appendChild(h('h4', { text: kind === 'footnote' ? 'Footnotes' : 'Endnotes' }));
      area.appendChild(h('ol', {}, list.map((n) => h('li', { title: 'Click to edit', onclick: () => openNoteEditor(n.id) },
        h('sup', { text: n.label }), n.text))));
    });
  }
  function openNoteEditor(id) {
    const n = (Ed.getDoc().footnotes || []).find((x) => x.id === id);
    if (!n) return;
    const ta = h('textarea', { 'aria-label': 'Note text' });
    ta.value = n.text;
    const err = h('div', { class: 'hint err', role: 'alert' });
    dialog(n.kind === 'endnote' ? 'Endnote' : 'Footnote', h('div', { class: 'stack-d' },
      h('label', { class: 'field' }, 'Note text', ta), err), [
      { label: 'Save', primary: true, onClick: () => {
        if (!Ed.setNoteText(id, ta.value)) { err.textContent = 'Note text cannot be empty.'; return false; }
        return true;
      } },
      { label: 'Cancel' },
    ]);
    ta.focus();
  }
  function openSources() {
    const f = {
      author: h('input', { type: 'text', placeholder: 'Author', 'aria-label': 'Author' }),
      title: h('input', { type: 'text', placeholder: 'Title', 'aria-label': 'Title' }),
      year: h('input', { type: 'text', placeholder: 'Year', 'aria-label': 'Year', maxlength: '6' }),
      publisher: h('input', { type: 'text', placeholder: 'Publisher', 'aria-label': 'Publisher' }),
    };
    const err = h('div', { class: 'hint err', role: 'alert' });
    const list = h('div', { class: 'stack-d' });
    const build = () => {
      list.textContent = '';
      const srcs = Ed.getDoc().sources || [];
      if (!srcs.length) list.appendChild(h('p', { class: 'muted', text: 'No sources yet.' }));
      srcs.forEach((src) => list.appendChild(h('div', { class: 'row-b' },
        h('span', { text: (src.author || src.title) + ' (' + (src.year || 'n.d.') + ')' }),
        h('button', { class: 'btn', type: 'button', onclick: () => { Ed.removeSource(src.id); build(); } }, 'Delete'))));
    };
    build();
    dialog('Sources', h('div', { class: 'stack-d' },
      h('div', { class: 'row-b' }, f.author, f.title),
      h('div', { class: 'row-b' }, f.year, f.publisher),
      err, list), [
      { label: 'Add source', primary: true, onClick: () => {
        const id = Ed.addSource({ author: f.author.value, title: f.title.value, year: f.year.value, publisher: f.publisher.value });
        if (!id) { err.textContent = 'Enter an author or a title.'; return false; }
        Object.values(f).forEach((i) => { i.value = ''; });
        err.textContent = '';
        build();
        return false;
      } },
      { label: 'Close' },
    ]);
  }

  // ---------- command registry (ribbon buttons, title bar, status bar) ----------
  const CMD = {};
  function runCmd(el, name) {
    Ed.sync();                       // use the caret the user actually has, not the last one we stored
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
    sheet.style.setProperty('--page-h', sz.h * PT + 'px');
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
    const pb = s.pageBorder;
    sheet.style.border = pb && pb.style && pb.style !== 'none'
      ? (pb.width || 1) + 'px ' + (BORDER_CSS[pb.style] || 'solid') + ' ' + (pb.color || '#000000')
      : '';
    body.classList.toggle('lines', !!s.lineNumbers);
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
    renderNotes();
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
    document.documentElement.dataset.canvas = prefs.canvas === 'auto' ? prefs.theme : prefs.canvas;
    $('#btn-theme').setAttribute('aria-pressed', String(prefs.theme === 'dark'));
    $$('[data-toggle="dark"]').forEach((b) => b.setAttribute('aria-pressed', String(prefs.theme === 'dark')));
  }
  function toggleTheme() { prefs.theme = prefs.theme === 'dark' ? 'light' : 'dark'; savePrefs(); applyTheme(); }
  function toggleCanvas() {
    const cur = prefs.canvas === 'auto' ? prefs.theme : prefs.canvas;
    const next = cur === 'dark' ? 'light' : 'dark';
    prefs.canvas = next === prefs.theme ? 'auto' : next;
    savePrefs();
    applyTheme();
  }
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
        if (document.body.classList.contains('reading')) { CMD.reading(); return; }
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
    applyProfile();
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
        const nd = E.createDoc();
        E.setSection(nd, { size: U.prefs.defaultPaper || 'A4' });
        Ed.setDoc(nd);
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

/* ===== ui.js part 3: Home and Insert features (Format Painter, Dictate, Editor, Video, Bookmarks, Comments, Equation) ===== */
(function (U) {
  'use strict';
  const E = window.QuadraEngine;
  const Ed = window.QuadraEditor;
  const { CMD, h, $$, dialog, closeDialog, showToast } = U;

  // Button pressed-state follows the editor state.
  Ed.on('selection', () => {
    const on = Ed.state().painter;
    $$('[data-cmd=format-painter]').forEach((b) => b.setAttribute('aria-pressed', String(on)));
  });
  const setDictating = (on) => $$('[data-cmd=dictate]').forEach((b) => b.setAttribute('aria-pressed', String(on)));

  // ----- Format Painter: copy the formatting of the selection, apply it to the next selection -----
  CMD['format-painter'] = () => {
    if (Ed.painterArmed()) { Ed.disarmPainter(); return; }
    if (!Ed.armPainter()) showToast('Put the cursor in a paragraph first');
  };

  // ----- Dictate: browser speech recognition (Chrome, Edge). Recognised text is typed at the caret. -----
  let rec = null;
  CMD.dictate = () => {
    if (rec) { rec.stop(); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      dialog('Dictation is not available here', h('p', { text: 'This browser does not support speech recognition. Use a recent Chrome or Edge on a desktop, and allow microphone access.' }));
      return;
    }
    const r = new SR();
    r.continuous = true;
    r.interimResults = false;
    r.lang = navigator.language || 'en-US';
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) Ed.typeText(res[0].transcript.trim() + ' ');
      }
    };
    r.onerror = (e) => { showToast('Dictation stopped: ' + (e.error || 'error')); };
    r.onend = () => { rec = null; setDictating(false); };
    rec = r;
    try { r.start(); setDictating(true); } catch (err) { rec = null; showToast('Could not start dictation'); }
  };

  // ----- Editor: rule-based checks (spacing, punctuation, capital letters). Not a spelling checker. -----
  CMD.editor = () => {
    const issues = E.editorCheck(Ed.getDoc());
    const fixable = issues.filter((i) => i.fixable).length;
    if (!issues.length) {
      dialog('Editor', h('p', { text: 'No suggestions. Spacing, punctuation and capital letters look right. Editor does not check spelling.' }));
      return;
    }
    const list = h('ul', { class: 'hist' }, issues.slice(0, 60).map((i) => h('li', {},
      h('span', { text: i.msg + ': "' + i.excerpt.trim() + '"' }))));
    dialog('Editor', h('div', { class: 'stack-d' },
      h('p', { text: issues.length + (issues.length === 1 ? ' suggestion' : ' suggestions') + (fixable ? ', ' + fixable + ' can be fixed automatically.' : '.') }),
      list,
      h('p', { class: 'muted', text: 'Editor checks spacing, punctuation and capital letters. It does not check spelling.' })),
      fixable ? [
        { label: 'Fix all', primary: true, onClick: () => { const n = Ed.fixEditor(); showToast(n + (n === 1 ? ' fix applied' : ' fixes applied')); return true; } },
        { label: 'Close' },
      ] : undefined);
  };

  // ----- Online Video: inserts a labelled link (no embedded player) -----
  CMD.video = () => {
    const url = h('input', { type: 'url', placeholder: 'https://www.youtube.com/watch?v=...', 'aria-label': 'Video address' });
    const err = h('div', { class: 'hint err', role: 'alert' });
    dialog('Insert Online Video', h('div', { class: 'stack-d' },
      h('label', { class: 'field' }, 'Video address', url),
      h('p', { class: 'muted', text: 'The video is added as a labelled link, not as an embedded player.' }),
      err), [
      { label: 'Insert', primary: true, onClick: () => {
        const v = url.value.trim();
        if (!/^https?:\/\//i.test(v)) { err.textContent = 'Enter an address that starts with https://'; return false; }
        Ed.typeText('Video: ');
        if (!Ed.insertLink(v)) { err.textContent = 'Video links cannot be inserted here.'; return false; }
        return true;
      } },
      { label: 'Cancel' },
    ]);
    url.focus();
  };

  // ----- Bookmarks: a name on the current paragraph; list with Go to and Delete -----
  CMD.bookmarks = () => {
    const name = h('input', { type: 'text', placeholder: 'Name (letters, digits, _)', maxlength: '40', 'aria-label': 'Bookmark name' });
    const err = h('div', { class: 'hint err', role: 'alert' });
    const list = h('div', { class: 'stack-d' });
    const build = () => {
      list.textContent = '';
      const items = E.listBookmarks(Ed.getDoc());
      if (!items.length) list.appendChild(h('p', { class: 'muted', text: 'No bookmarks yet.' }));
      items.forEach((it) => list.appendChild(h('div', { class: 'row-b' },
        h('span', { text: it.name + ' (paragraph ' + (it.a.b + 1) + ')' }),
        h('button', { class: 'btn', type: 'button', onclick: () => { Ed.moveTo(it.a); closeDialog(); } }, 'Go to'),
        h('button', { class: 'btn', type: 'button', onclick: () => { Ed.removeBookmark(it.name); build(); } }, 'Delete'))));
    };
    build();
    dialog('Bookmarks', h('div', { class: 'stack-d' },
      h('label', { class: 'field' }, 'Add a bookmark on the current paragraph', name),
      err, list), [
      { label: 'Add', primary: true, onClick: () => {
        if (!Ed.setBookmark(name.value.trim())) { err.textContent = 'Start with a letter; use only letters, digits or _ (up to 40).'; return false; }
        name.value = ''; err.textContent = ''; build(); return false;
      } },
      { label: 'Close' },
    ]);
    name.focus();
  };

  // ----- New Comment: text attached to the current paragraph; list with Delete -----
  CMD.comment = () => {
    const text = h('textarea', { placeholder: 'Write a comment about this paragraph', 'aria-label': 'Comment text' });
    const err = h('div', { class: 'hint err', role: 'alert' });
    const list = h('div', { class: 'stack-d' });
    const build = () => {
      list.textContent = '';
      const items = E.listComments(Ed.getDoc());
      if (!items.length) list.appendChild(h('p', { class: 'muted', text: 'No comments yet.' }));
      items.forEach((c) => list.appendChild(h('div', { class: 'row-b' },
        h('span', { text: c.text + (c.anchored ? '' : ' (paragraph was merged or removed)') }),
        h('button', { class: 'btn', type: 'button', onclick: () => { Ed.removeComment(c.id); build(); } }, 'Delete'))));
    };
    build();
    dialog('Comments', h('div', { class: 'stack-d' },
      h('label', { class: 'field' }, 'New comment on the current paragraph', text),
      err, list), [
      { label: 'Add comment', primary: true, onClick: () => {
        if (!text.value.trim()) { err.textContent = 'Write something first.'; return false; }
        if (!Ed.addComment(text.value)) { err.textContent = 'Put the cursor in a paragraph first.'; return false; }
        text.value = ''; err.textContent = ''; build(); return false;
      } },
      { label: 'Close' },
    ]);
    text.focus();
  };

  // ----- Equation: ^ superscript, _ subscript, and names such as pi, sqrt, alpha -----
  CMD.equation = () => {
    const src = h('input', { type: 'text', placeholder: 'e.g. x^2 + pi    or    H_2O', 'aria-label': 'Equation', style: 'font-family: monospace' });
    const prev = h('div', { class: 'eq-preview', 'aria-live': 'polite', style: 'min-height: 30px; padding: 8px; border: 1px dashed var(--border); border-radius: 6px; font-size: 16px' });
    const err = h('div', { class: 'hint err', role: 'alert' });
    const draw = () => {
      prev.textContent = '';
      E.equationRuns(src.value).forEach((r) => prev.appendChild(
        r.f.sup ? h('sup', { text: r.t }) : r.f.sub ? h('sub', { text: r.t }) : document.createTextNode(r.t)));
    };
    src.addEventListener('input', draw);
    dialog('Equation', h('div', { class: 'stack-d' },
      h('label', { class: 'field' }, 'Type the equation (^ for superscript, _ for subscript)', src),
      h('div', { class: 'field' }, 'Preview', prev),
      err), [
      { label: 'Insert', primary: true, onClick: () => {
        const runs = E.equationRuns(src.value);
        if (!runs.length) { err.textContent = 'Type an equation first.'; return false; }
        if (!Ed.insertRuns(runs)) { err.textContent = 'Equations cannot be inserted inside a table cell in this version.'; return false; }
        return true;
      } },
      { label: 'Cancel' },
    ]);
    src.focus();
  };
})(window.QuadraUI);

/* ===== ui.js part 4: Design, Layout and References features ===== */
(function (U) {
  'use strict';
  const E = window.QuadraEngine;
  const Ed = window.QuadraEditor;
  const { CMD, h, $, dialog, showToast } = U;

  // ----- Page Borders (Design and Layout tabs): stored in the section, drawn on the sheet and in print -----
  CMD['page-borders'] = () => {
    const pb = Ed.getDoc().section.pageBorder || { style: 'none', width: 1, color: '#000000' };
    const style = h('select', { 'aria-label': 'Border style' },
      [['none', 'None'], ['single', 'Single'], ['double', 'Double'], ['dashed', 'Dashed'], ['dotted', 'Dotted']]
        .map(([v, t]) => h('option', { value: v }, t)));
    style.value = pb.style;
    const width = h('select', { 'aria-label': 'Border width' },
      ['1', '2', '3', '4', '6'].map((w) => h('option', { value: w }, w + ' px')));
    width.value = String(pb.width || 1);
    const color = h('input', { type: 'color', 'aria-label': 'Border color' });
    color.value = pb.color || '#000000';
    dialog('Page Borders', h('div', { class: 'stack-d' },
      h('label', { class: 'field' }, 'Style', style),
      h('label', { class: 'field' }, 'Width', width),
      h('label', { class: 'field' }, 'Color', color),
      h('p', { class: 'muted', text: 'The border is drawn around the page and is included when you print.' })), [
      { label: 'Apply', primary: true, onClick: () => {
        Ed.setSection({ pageBorder: { style: style.value, width: +width.value, color: color.value } });
        return true;
      } },
      { label: 'Cancel' },
    ]);
  };

  // ----- References: Update Table, Footnote and Endnote -----
  CMD['toc-update'] = () => {
    if (!Ed.updateToc()) {
      dialog('No table of contents', h('p', { text: 'There is no table of contents in this document yet. Insert one from the References or Insert tab.' }));
      return;
    }
    showToast('Table of contents updated');
  };

  function noteDialog(kind) {
    const isEnd = kind === 'endnote';
    const ta = h('textarea', { 'aria-label': isEnd ? 'Endnote text' : 'Footnote text', placeholder: isEnd ? 'Text of the endnote' : 'Text of the footnote' });
    const err = h('div', { class: 'hint err', role: 'alert' });
    dialog(isEnd ? 'Insert Endnote' : 'Insert Footnote', h('div', { class: 'stack-d' },
      h('label', { class: 'field' }, 'Note text', ta),
      h('p', { class: 'muted', text: 'The number appears in the text at the cursor. The note is listed at the end of the document.' }),
      err), [
      { label: 'Insert', primary: true, onClick: () => {
        if (!ta.value.trim()) { err.textContent = 'Write the note text first.'; return false; }
        if (!Ed.insertNote(kind, ta.value)) { err.textContent = 'Put the cursor in a normal paragraph (not in a table cell).'; return false; }
        return true;
      } },
      { label: 'Cancel' },
    ]);
    ta.focus();
  }
  CMD.footnote = () => noteDialog('footnote');
  CMD.endnote = () => noteDialog('endnote');

  // Clicking a note number in the text opens its text for editing.
  document.addEventListener('click', (e) => {
    const ref = e.target.closest && e.target.closest('#doc-body .fnref');
    if (!ref) return;
    const id = ref.dataset.fn;
    const n = (Ed.getDoc().footnotes || []).find((x) => x.id === id);
    if (!n) return;
    const ta = h('textarea', { 'aria-label': 'Note text' });
    ta.value = n.text;
    const err = h('div', { class: 'hint err', role: 'alert' });
    dialog(n.kind === 'endnote' ? 'Endnote' : 'Footnote', h('div', { class: 'stack-d' },
      h('label', { class: 'field' }, 'Note text', ta), err), [
      { label: 'Save', primary: true, onClick: () => {
        if (!Ed.setNoteText(id, ta.value)) { err.textContent = 'Note text cannot be empty.'; return false; }
        return true;
      } },
      { label: 'Cancel' },
    ]);
    ta.focus();
  });
})(window.QuadraUI);

/* ===== ui.js part 6: Mailings, Review, View and Help features ===== */
(function (U) {
  'use strict';
  const E = window.QuadraEngine;
  const Ed = window.QuadraEditor;
  const { CMD, h, $, $$, dialog, closeDialog, showToast } = U;

  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = h('a', { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const baseName = () => (Ed.getDoc().title || 'Document').replace(/[\\/:*?"<>|]+/g, '_');
  const hasMerge = () => { const m = Ed.getDoc().merge; return !!(m && m.records && m.records.length); };

  // Pressed state for Track Changes
  Ed.on('selection', () => {
    $$('[data-menu=tracking]').forEach((b) => b.setAttribute('aria-pressed', String(Ed.isTracking())));
  });

  // ----- Mailings: Envelopes and Labels -----
  CMD.envelopes = () => {
    const from = h('textarea', { 'aria-label': 'Sender address', placeholder: 'Your name\nStreet\nCity' });
    const to = h('textarea', { 'aria-label': 'Recipient address', placeholder: 'Recipient name\nStreet\nCity' });
    const err = h('div', { class: 'hint err', role: 'alert' });
    dialog('Envelopes', h('div', { class: 'stack-d' },
      h('label', { class: 'field' }, 'Sender address (one line per row)', from),
      h('label', { class: 'field' }, 'Recipient address (one line per row)', to),
      err), [
      { label: 'Insert', primary: true, onClick: () => {
        const paras = E.envelopeParas(from.value, to.value);
        if (!paras.some((p) => E.paraText(p).trim())) { err.textContent = 'Type at least one address line.'; return false; }
        Ed.insertParagraphs(paras);
        return true;
      } },
      { label: 'Cancel' },
    ]);
    to.focus();
  };

  CMD.labels = () => {
    const rows = h('input', { type: 'number', min: '1', max: '10', value: '3', 'aria-label': 'Rows' });
    const cols = h('input', { type: 'number', min: '1', max: '4', value: '2', 'aria-label': 'Columns' });
    const texts = h('textarea', { 'aria-label': 'Label texts', placeholder: 'One label per line, filled left to right, top to bottom' });
    const err = h('div', { class: 'hint err', role: 'alert' });
    dialog('Labels', h('div', { class: 'stack-d' },
      h('div', { class: 'row-b' },
        h('label', { class: 'field' }, 'Rows (1-10)', rows),
        h('label', { class: 'field' }, 'Columns (1-4)', cols)),
      h('label', { class: 'field' }, 'Label texts', texts),
      err), [
      { label: 'Insert labels', primary: true, onClick: () => {
        const r = parseInt(rows.value, 10), c = parseInt(cols.value, 10);
        if (!(r >= 1 && r <= 10 && c >= 1 && c <= 4)) { err.textContent = 'Rows must be 1-10 and columns 1-4.'; return false; }
        const lines = texts.value.split(/\r?\n/);
        if (!Ed.insertBlocks([E.labelsTable(r, c, lines)])) { err.textContent = 'Labels cannot be inserted inside a table cell.'; return false; }
        return true;
      } },
      { label: 'Cancel' },
    ]);
    texts.focus();
  };

  // ----- Mailings: mail merge (data source is pasted CSV; first row is field names) -----
  CMD['merge-start'] = () => {
    const m = Ed.getDoc().merge;
    const csv = h('textarea', { 'aria-label': 'Recipient data (CSV)', placeholder: 'Name,City\nAsha Rao,Patna\nSita Devi,Delhi' });
    if (m && m.fields) csv.value = [m.fields.join(',')].concat(m.records.map((r) => m.fields.map((f) => r[f] || '').join(','))).join('\n');
    const err = h('div', { class: 'hint err', role: 'alert' });
    dialog('Start Mail Merge', h('div', { class: 'stack-d' },
      h('label', { class: 'field' }, 'Recipients (CSV: first row is the field names)', csv),
      h('p', { class: 'muted', text: 'Insert Field then uses these names. Preview Results shows each letter; Finish & Merge saves them as one file.' }),
      err), [
      { label: 'Use this data', primary: true, onClick: () => {
        let parsed;
        try { parsed = E.parseCsv(csv.value); } catch (e) { err.textContent = e.message; return false; }
        Ed.setDocField('merge', parsed);
        showToast('Mail merge: ' + parsed.records.length + (parsed.records.length === 1 ? ' record' : ' records'));
        return true;
      } },
      { label: 'Cancel' },
    ]);
    csv.focus();
  };

  CMD['merge-preview'] = () => {
    if (!hasMerge()) {
      dialog('No recipients yet', h('p', { text: 'Use Start Mail Merge first to add the recipient data.' }));
      return;
    }
    const doc = Ed.getDoc();
    let i = 0;
    const frame = h('iframe', { sandbox: '', title: 'Merged letter preview', style: 'width: 100%; height: 300px; border: 1px solid var(--border); border-radius: 6px; background: #fff' });
    const label = h('span', { class: 'muted' });
    const show = () => {
      frame.srcdoc = E.toHTML(E.mergeRecord(doc, doc.merge.records[i]));
      label.textContent = 'Record ' + (i + 1) + ' of ' + doc.merge.records.length;
    };
    const prev = h('button', { class: 'btn', type: 'button', onclick: () => { i = Math.max(0, i - 1); show(); } }, 'Previous');
    const next = h('button', { class: 'btn', type: 'button', onclick: () => { i = Math.min(doc.merge.records.length - 1, i + 1); show(); } }, 'Next');
    dialog('Preview Results', h('div', { class: 'stack-d' }, h('div', { class: 'row-b' }, prev, next, label), frame), [{ label: 'Close', primary: true }]);
    show();
  };

  CMD['merge-finish'] = () => {
    if (!hasMerge()) {
      dialog('No recipients yet', h('p', { text: 'Use Start Mail Merge first to add the recipient data.' }));
      return;
    }
    const doc = Ed.getDoc();
    const merged = E.mergeAllCombined(doc);
    download(baseName() + '-merged.html', E.toHTML(merged), 'text/html');
    showToast('Merged ' + doc.merge.records.length + ' letters into one file');
  };

  // ----- Review: Check Accessibility, Translate, Show Comments -----
  CMD.accessibility = () => {
    const issues = E.accessibilityCheck(Ed.getDoc());
    if (!issues.length) {
      dialog('Accessibility check', h('p', { text: 'No issues found. The document has a name, headings, and alternative text for its pictures.' }));
      return;
    }
    const list = h('div', { class: 'stack-d' }, issues.map((i) => h('div', { class: 'row-b' },
      h('span', { text: i.msg }),
      i.b !== undefined ? h('button', { class: 'btn', type: 'button', onclick: () => { Ed.moveTo(i.b); closeDialog(); } }, 'Go to') : null)));
    dialog('Accessibility check', h('div', { class: 'stack-d' },
      h('p', { text: issues.length + (issues.length === 1 ? ' issue' : ' issues') + ' found.' }), list));
  };

  CMD.translate = () => {
    const sel = Ed.selectedText();
    const text = (sel || Ed.getDoc().blocks.filter((b) => b.type === 'p').map((b) => E.paraText(b)).join('\n')).slice(0, 1500);
    if (!text.trim()) { dialog('Nothing to translate', h('p', { text: 'Select some text, or type something first.' })); return; }
    const lang = h('select', { 'aria-label': 'Translate into' },
      [['hi', 'Hindi'], ['en', 'English'], ['es', 'Spanish'], ['fr', 'French'], ['de', 'German'], ['ar', 'Arabic'], ['zh-CN', 'Chinese (Simplified)'], ['ja', 'Japanese']]
        .map(([v, t]) => h('option', { value: v }, t)));
    dialog('Translate', h('div', { class: 'stack-d' },
      h('label', { class: 'field' }, 'Translate into', lang),
      h('p', { class: 'muted', text: (sel ? 'The selected text' : 'The document text (first 1500 characters)') + ' will be sent to Google Translate in a new tab. Quadra does not translate on its own.' })), [
      { label: 'Open translation', primary: true, onClick: () => {
        window.open('https://translate.google.com/?sl=auto&tl=' + encodeURIComponent(lang.value) + '&text=' + encodeURIComponent(text) + '&op=translate', '_blank', 'noopener');
        return true;
      } },
      { label: 'Cancel' },
    ]);
  };

  CMD['show-comments'] = () => {
    const items = E.listComments(Ed.getDoc());
    const list = h('div', { class: 'stack-d' });
    const build = () => {
      list.textContent = '';
      const cur = E.listComments(Ed.getDoc());
      if (!cur.length) list.appendChild(h('p', { class: 'muted', text: 'No comments in this document. Add one with New Comment.' }));
      cur.forEach((c) => list.appendChild(h('div', { class: 'row-b' },
        h('span', { text: c.text + (c.anchored ? '' : ' (paragraph was merged or removed)') }),
        h('button', { class: 'btn', type: 'button', onclick: () => { Ed.removeComment(c.id); build(); } }, 'Delete'))));
    };
    build();
    dialog('Comments (' + items.length + ')', list);
  };

  // ----- View: Reading View (no editing, ribbon hidden, Escape or the button leaves it) -----
  CMD.reading = () => {
    const on = !document.body.classList.contains('reading');
    document.body.classList.toggle('reading', on);
    const body = $('#doc-body');
    body.contentEditable = on ? 'false' : 'true';
    $('#reading-exit').hidden = !on;
    $$('[data-cmd=reading]').forEach((b) => b.setAttribute('aria-pressed', String(on)));
    if (!on) Ed.focus();
  };
  $('#reading-exit').addEventListener('click', () => CMD.reading());

  // ----- Help: Contact Support and Feedback (stored in this browser; nothing is sent) -----
  const KEY_FEEDBACK = 'quadra.feedback.v1';
  const readFeedback = () => { try { return JSON.parse(localStorage.getItem(KEY_FEEDBACK) || '[]'); } catch (err) { return []; } };
  function diagnostics() {
    const d = Ed.getDoc();
    const wc = E.wordCount(d);
    return [
      'Quadra Word v1',
      'Browser: ' + navigator.userAgent,
      'Language: ' + (navigator.language || 'unknown'),
      'Screen: ' + innerWidth + 'x' + innerHeight,
      'Document: ' + d.title + ' (' + wc.words + ' words, ' + wc.paragraphs + ' paragraphs)',
      'Paper: ' + d.section.size + ' ' + d.section.orientation,
      'Saved in this browser: ' + (localStorage.getItem('quadra.doc.v1') ? 'yes' : 'no'),
    ].join('\n');
  }
  CMD.support = () => {
    const text = diagnostics();
    const copy = h('button', { class: 'btn', type: 'button', onclick: async () => {
      try { await navigator.clipboard.writeText(text); showToast('Details copied'); } catch (err) { showToast('Copy failed: select the text and copy it'); }
    } }, 'Copy details');
    dialog('Contact Support', h('div', { class: 'stack-d' },
      h('p', { text: 'Quadra has no support service yet. If something is not working, copy these details and send them with a description of the problem.' }),
      h('pre', { style: 'white-space: pre-wrap; font-size: 12px; background: var(--chrome); padding: 8px; border-radius: 6px; margin: 0', text }),
      h('div', { class: 'row-b' }, copy)));
  };

  CMD.feedback = () => {
    const type = h('select', { 'aria-label': 'Feedback type' }, ['Bug', 'Idea', 'Other'].map((t) => h('option', { value: t }, t)));
    const text = h('textarea', { 'aria-label': 'Feedback', placeholder: 'What happened, or what should be better?' });
    const err = h('div', { class: 'hint err', role: 'alert' });
    dialog('Feedback', h('div', { class: 'stack-d' },
      h('label', { class: 'field' }, 'Type', type),
      h('label', { class: 'field' }, 'Message', text),
      h('p', { class: 'muted', text: 'Feedback is kept in this browser only. Use Copy to send it to us.' }),
      err,
      h('p', { class: 'muted', text: 'Saved on this device: ' + readFeedback().length }) ), [
      { label: 'Save', primary: true, onClick: () => {
        if (!text.value.trim()) { err.textContent = 'Write a message first.'; return false; }
        const list = readFeedback();
        list.push({ type: type.value, text: text.value.trim(), date: new Date().toISOString() });
        try { localStorage.setItem(KEY_FEEDBACK, JSON.stringify(list.slice(-50))); } catch (e) { err.textContent = 'Could not save in this browser.'; return false; }
        showToast('Feedback saved in this browser');
        return true;
      } },
      { label: 'Copy', onClick: async () => {
        const msg = '[' + type.value + '] ' + text.value.trim() + '\n\n' + diagnostics();
        try { await navigator.clipboard.writeText(msg); showToast('Feedback copied'); } catch (e) { err.textContent = 'Copy failed: select the text and copy it.'; }
        return false;
      } },
      { label: 'Close' },
    ]);
    text.focus();
  };

  // ----- Click a picture to set its alternative text (used by Check Accessibility) -----
  document.addEventListener('click', (e) => {
    const wrap = e.target.closest && e.target.closest('#doc-body .blk-img');
    if (!wrap) return;
    const b = +wrap.dataset.key;
    const blk = Ed.getDoc().blocks[b];
    if (!blk || blk.type !== 'img') return;
    const alt = h('input', { type: 'text', 'aria-label': 'Alternative text', maxlength: '200', placeholder: 'Describe the picture for screen readers' });
    alt.value = blk.alt || '';
    dialog('Alternative text', h('div', { class: 'stack-d' },
      h('label', { class: 'field' }, 'Describe this picture', alt),
      h('p', { class: 'muted', text: 'Screen readers read this text instead of the picture.' })), [
      { label: 'Save', primary: true, onClick: () => { Ed.setAlt(b, alt.value); return true; } },
      { label: 'Cancel' },
    ]);
    alt.focus();
  });
})(window.QuadraUI);
