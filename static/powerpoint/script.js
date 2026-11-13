/* Quadra PowerPoint - script.js
   Editor core: rendering, slide selection, shape select/move/resize/rotate, text editing, clipboard, undo/redo. */
(function () {
  'use strict';
  const Q = window.QEngine;
  const NS = 'http://www.w3.org/2000/svg';
  const ZOOM_STEPS = [10, 25, 33, 50, 66, 75, 100, 125, 150, 200, 300, 400];
  const ZOOM_KEY = 'quadra-ppt:zoom';
  const MIN_SIZE = 12;

  const el = (tag, cls, st) => { const e = document.createElement(tag); if (cls) e.className = cls; if (st) Object.assign(e.style, st); return e; };
  const svgEl = (tag, attrs) => { const e = document.createElementNS(NS, tag); Object.keys(attrs || {}).forEach((k) => e.setAttribute(k, attrs[k])); return e; };
  const pxOf = (pt) => pt * 4 / 3;

  // ================= rendering (pure DOM builders) =================
  function fontStack(name, tv, ph) {
    if (!name) return ph === 'title' ? tv.heading : tv.body;
    const serif = /georgia|times/i.test(name), mono = /courier|consolas/i.test(name);
    return '"' + name + '", ' + (serif ? 'serif' : mono ? 'monospace' : 'sans-serif');
  }

  function applyTextStyle(tin, sh, tv, editing) {
    const t = sh.ts;
    const sz = pxOf(t.size) * ((t.sub || t.sup) && editing ? 0.75 : 1);
    tin.style.fontFamily = fontStack(t.font, tv, sh.ph);
    tin.style.fontSize = sz + 'px';
    tin.style.fontWeight = t.bold ? '700' : '400';
    tin.style.fontStyle = t.italic ? 'italic' : 'normal';
    const deco = []; if (t.underline) deco.push('underline'); if (t.strike) deco.push('line-through');
    tin.style.textDecoration = deco.join(' ') || 'none';
    tin.style.textAlign = t.align === 'justify' ? 'justify' : t.align;
    tin.style.color = t.color || (sh.fill && !Q.isLineType(sh.type) ? Q.contrastColor(sh.fill) : tv.fg);
    tin.style.textTransform = t.caps === 'upper' ? 'uppercase' : t.caps === 'lower' ? 'lowercase' : t.caps === 'title' ? 'capitalize' : 'none';
  }

  function fillParagraphs(tin, sh) {
    const t = sh.ts;
    if (t.list === 'number') tin.classList.add('num');
    sh.text.split('\n').forEach((line) => {
      const p = el('div', 'sl-para' + (t.list === 'bullet' ? ' bul' : t.list === 'number' ? ' numi' : ''));
      if (!line) p.appendChild(document.createElement('br'));
      else {
        const sp = el('span'); sp.textContent = line;
        if (t.highlight) sp.style.background = t.highlight;
        if (t.sub) { sp.style.verticalAlign = 'sub'; sp.style.fontSize = '.7em'; }
        if (t.sup) { sp.style.verticalAlign = 'super'; sp.style.fontSize = '.7em'; }
        p.appendChild(sp);
      }
      tin.appendChild(p);
    });
  }

  function renderShape(pres, sh, tv, o) {
    const isLine = Q.isLineType(sh.type);
    const hit = isLine ? Math.max(14, sh.h) : sh.h;
    const d = el('div', 'sl-shape sl-' + sh.type);
    d.dataset.sid = sh.id;
    Object.assign(d.style, { left: sh.x + 'px', top: (isLine ? sh.y - hit / 2 : sh.y) + 'px', width: sh.w + 'px', height: hit + 'px' });
    if (sh.rot) d.style.transform = 'rotate(' + sh.rot + 'deg)';
    if (o.hidden && o.hidden.has(sh.id)) { d.style.visibility = 'hidden'; d.dataset.hidden = '1'; }

    if (sh.type === 'rect' || sh.type === 'oval' || sh.type === 'textbox') {
      if (sh.fill) d.style.background = sh.fill;
      if (sh.line && sh.line.color && sh.line.width) d.style.border = sh.line.width + 'px solid ' + sh.line.color;
      if (sh.type === 'oval') d.style.borderRadius = '50%';
    } else if (isLine) {
      const lw = sh.line ? sh.line.width : 4, col = sh.line ? sh.line.color : '#000';
      const svg = svgEl('svg', { viewBox: '0 0 ' + sh.w + ' ' + hit, preserveAspectRatio: 'none' });
      const hs = Math.max(12, lw * 4), y = hit / 2;
      svg.appendChild(svgEl('line', { x1: 0, y1: y, x2: sh.type === 'arrow' ? Math.max(0, sh.w - hs + 1) : sh.w, y2: y, stroke: col, 'stroke-width': lw, 'stroke-linecap': 'butt' }));
      if (sh.type === 'arrow') svg.appendChild(svgEl('polygon', { points: sh.w + ',' + y + ' ' + (sh.w - hs) + ',' + (y - hs / 2) + ' ' + (sh.w - hs) + ',' + (y + hs / 2), fill: col }));
      d.appendChild(svg);
    } else if (sh.type === 'picture') {
      if (sh.src) { const img = el('img'); img.src = sh.src; img.alt = sh.alt || ''; img.draggable = false; d.appendChild(img); }
      else { d.style.background = '#d9d9d9'; d.style.border = '1px solid #aaa'; }
    } else if (sh.type === 'ink') {
      const svg = svgEl('svg', { viewBox: '0 0 ' + sh.w + ' ' + sh.h, preserveAspectRatio: 'none' });
      const ln = sh.line || { color: '#111', width: 3, alpha: 1 };
      svg.appendChild(svgEl('polyline', {
        points: (sh.points || []).map((p) => p[0] + ',' + p[1]).join(' '), fill: 'none', stroke: ln.color, 'stroke-width': ln.width,
        'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: ln.alpha == null ? 1 : ln.alpha,
      }));
      d.appendChild(svg);
    }

    if (Q.canHoldText(sh)) {
      const editing = o.editing === sh.id;
      const empty = !sh.text;
      const showPrompt = empty && sh.ph && o.prompts && !editing;
      const txt = el('div', 'sl-txt');
      txt.style.justifyContent = sh.anchor === 'middle' ? 'center' : sh.anchor === 'bottom' ? 'flex-end' : 'flex-start';
      const tin = el('div', 'sl-tin');
      applyTextStyle(tin, sh, tv, editing);
      if (editing) {
        tin.contentEditable = 'plaintext-only'; tin.spellcheck = false;
        tin.textContent = sh.text; d.classList.add('editing');
        if (sh.ts.list === 'bullet') tin.style.paddingLeft = '0';
      } else if (showPrompt) {
        tin.classList.add('prompt'); tin.textContent = Q.PH_PROMPT[sh.ph] || 'Click to add text';
        if (sh.ts.list === 'bullet') { const p = el('div', 'sl-para bul'); p.textContent = tin.textContent; tin.textContent = ''; tin.appendChild(p); }
      } else fillParagraphs(tin, sh);
      txt.appendChild(tin); d.appendChild(txt);
      if (o.prompts && sh.ph && empty && !editing) d.classList.add('ph-empty');
    }
    if (o.selection && o.selection.has(sh.id)) {
      d.classList.add('selected');
      if (o.handles) {
        const names = isLine ? ['w', 'e'] : ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
        names.forEach((n) => { const h = el('div', 'handle ' + n); h.dataset.h = n; d.appendChild(h); });
        const r = el('div', 'handle rot'); r.dataset.h = 'rot'; d.appendChild(r);
      }
    }
    return d;
  }

  function renderSlide(pres, slide, o) {
    o = o || {};
    const tv = pres.themeVars();
    const s = el('div', 'sl-slide', { width: pres.W + 'px', height: pres.H + 'px', background: tv.bgImage || tv.bg, color: tv.fg });
    s.dataset.slideId = slide.id;
    slide.shapes.forEach((sh) => {
      if (sh.ph && !o.prompts && !sh.text.trim()) return; // empty placeholders never show outside the editor
      s.appendChild(renderShape(pres, sh, tv, o));
    });
    if (pres.footer.show && pres.footer.text) {
      const f = el('div', 'sl-ft', { bottom: '18px', color: tv.fg }); f.textContent = pres.footer.text; s.appendChild(f);
    }
    return s;
  }

  // ================= caret helpers (keep caret when the canvas is rebuilt) =================
  function offsetOf(root, node, off) {
    const r = document.createRange(); r.selectNodeContents(root);
    try { r.setEnd(node, off); } catch (e) { return 0; }
    return r.toString().length;
  }
  function posAt(root, n) {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let acc = 0, node;
    while ((node = w.nextNode())) { const l = node.nodeValue.length; if (acc + l >= n) return [node, n - acc]; acc += l; }
    return [root, root.childNodes.length];
  }
  function readEditable(t) {
    // textContent (not innerText): the browser's trailing placeholder <br> must not become an extra newline
    return t.textContent.replace(/\u00a0/g, ' ');
  }

  // ================= editor state =================
  const E = {
    pres: null, cur: 0, sel: [], editing: null, tool: 'select',
    pen: { color: '#111111', width: 3, alpha: 1 },
    zoom: { mode: 'fit', value: 1 }, showActive: false, focusArea: 'canvas',
    renderSlide, applyTextStyle, ZOOM_STEPS,
  };
  window.QEditor = E;

  const history = new Q.History(100);
  const listeners = {};
  let lastDown = null, gesturePre = null, rebuilding = false, clip = null, pasteCount = 0, dragFrom = null, dropInfo = null, g = null, painter = null;
  let stage, stageScroll, thumbList, sorterEl, notesInput, thumbRaf = 0;

  E.on = (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); };
  E.emit = (ev, a, b) => { (listeners[ev] || []).forEach((fn) => fn(a, b)); };
  const snap = () => JSON.stringify(E.pres.toJSON());
  E.canUndo = () => history.canUndo();
  E.canRedo = () => history.canRedo();

  // ---- history / mutation ----
  E.begin = () => { if (gesturePre == null) gesturePre = snap(); };
  E.endGesture = () => {
    if (gesturePre == null) return;
    const pre = gesturePre; gesturePre = null;
    if (pre !== snap()) { history.push(pre); E.emit('history'); }
  };
  E.live = (fn, kind) => { fn(); changed(kind || 'all'); };
  E.mutate = (fn, kind) => {
    if (gesturePre != null) { fn(); changed(kind || 'all'); return; }
    const pre = snap(); fn();
    if (pre !== snap()) { history.push(pre); E.emit('history'); }
    changed(kind || 'all');
  };
  function changed(kind) {
    E.cur = Q.clamp(E.cur, 0, E.pres.slides.length - 1);
    if (kind === 'text') { scheduleThumbs(); E.emit('change', 'text'); return; }
    if (kind === 'notes') { E.emit('change', 'notes'); return; }
    E.renderCanvas(); scheduleThumbs(); E.emit('change', kind || 'all'); E.emit('selection');
  }
  function restore(s) {
    E.stopEdit(true);
    E.pres = Q.Presentation.fromJSON(s);
    E.cur = Q.clamp(E.cur, 0, E.pres.slides.length - 1);
    const ids = new Set(E.pres.slides[E.cur].shapes.map((x) => x.id));
    E.sel = E.sel.filter((id) => ids.has(id));
    gesturePre = null;
    E.emit('history'); E.fullRender(); E.emit('change', 'all');
  }
  E.undo = () => { if (E.editing) E.stopEdit(); const p = history.undo(snap()); if (p != null) restore(p); };
  E.redo = () => { if (E.editing) E.stopEdit(); const n = history.redo(snap()); if (n != null) restore(n); };
  E.resetHistory = () => { history.clear(); gesturePre = null; E.emit('history'); };

  // ---- accessors ----
  E.slide = () => E.pres.slides[E.cur];
  E.shape = (id) => E.slide().shapes.find((x) => x.id === id) || null;
  E.selShapes = () => E.sel.map((id) => E.shape(id)).filter(Boolean);
  E.z = () => (E.zoom.mode === 'fit' ? fitZoom() : E.zoom.value);
  function fitZoom() {
    if (!stageScroll) return 0.5;
    const w = stageScroll.clientWidth - 44, h = stageScroll.clientHeight - 44;
    if (w <= 0 || h <= 0) return 0.5;
    return Q.clamp(Math.min(w / E.pres.W, h / E.pres.H), 0.1, 4);
  }

  // ---- selection ----
  E.select = (ids) => {
    const next = ids.filter((id) => E.shape(id));
    if (E.editing && !(next.length === 1 && next[0] === E.editing)) E.stopEdit();
    E.sel = next; E.renderCanvas(); E.emit('selection');
  };
  E.selectAll = () => E.select(E.slide().shapes.map((s) => s.id));
  E.selectSlide = (i, force) => {
    i = Q.clamp(i, 0, E.pres.slides.length - 1);
    if (i === E.cur && !force) return;
    E.stopEdit(); E.cur = i; E.sel = [];
    E.renderCanvas(); updateThumbSelection(); syncNotes(); E.emit('slide', i); E.emit('selection');
  };

  // ---- slide commands ----
  E.newSlide = (layout) => {
    E.stopEdit();
    const cl = E.slide().layout;
    layout = layout || (cl === 'title' ? 'titleContent' : cl);
    let at; E.mutate(() => { at = E.pres.addSlide(layout, E.cur); E.cur = at; E.sel = []; }, 'structure');
    E.fullRender(); E.emit('slide', at);
  };
  E.duplicateSlide = (i) => {
    i = i == null ? E.cur : i; E.stopEdit(); let at;
    E.mutate(() => { at = E.pres.duplicateSlide(i); E.cur = at; E.sel = []; }, 'structure');
    E.fullRender(); E.emit('slide', at);
  };
  E.deleteSlide = (i) => {
    i = i == null ? E.cur : i; E.stopEdit(); let at;
    E.mutate(() => { at = E.pres.deleteSlide(i); E.cur = at; E.sel = []; }, 'structure');
    E.fullRender(); E.emit('slide', at);
  };
  E.moveSlide = (from, to) => {
    E.stopEdit(); let at = to;
    E.mutate(() => { at = E.pres.moveSlide(from, to); E.cur = at; }, 'structure');
    E.fullRender(); E.emit('slide', at);
  };
  E.setLayout = (layout, i) => { E.stopEdit(); E.mutate(() => E.pres.setLayout(i == null ? E.cur : i, layout), 'structure'); };

  // ---- shape commands ----
  E.addShape = (type, props) => {
    E.stopEdit(); let sh;
    E.mutate(() => { sh = E.pres.addShape(E.cur, type, props); });
    if (sh) { E.sel = [sh.id]; E.renderCanvas(); E.emit('selection'); }
    return sh;
  };
  E.addPicture = (src, nw, nh, name) => {
    const maxW = E.pres.W * 0.7, maxH = E.pres.H * 0.7;
    const k = Math.min(1, maxW / nw, maxH / nh); const w = Math.round(nw * k), h = Math.round(nh * k);
    return E.addShape('picture', { src, alt: '', w, h, x: Math.round((E.pres.W - w) / 2), y: Math.round((E.pres.H - h) / 2), name });
  };
  E.deleteSel = () => {
    if (!E.sel.length) return;
    const ids = E.sel.slice(); E.stopEdit();
    E.mutate(() => E.pres.removeShapes(E.cur, ids)); E.sel = []; E.renderCanvas(); E.emit('selection');
  };
  E.copy = () => { if (!E.sel.length) return false; clip = E.pres.packShapes(E.cur, E.sel); pasteCount = 0; E.emit('clipboard'); return true; };
  E.cut = () => { if (E.copy()) { E.deleteSel(); return true; } return false; };
  E.hasClip = () => !!(clip && clip.length);
  E.paste = () => {
    if (!E.hasClip()) return false;
    E.stopEdit(); pasteCount++; let ids = [];
    E.mutate(() => { ids = E.pres.pasteShapes(E.cur, clip, 20 * pasteCount, 20 * pasteCount); });
    E.sel = ids; E.renderCanvas(); E.emit('selection'); return true;
  };
  E.duplicate = () => {
    if (!E.sel.length) return false;
    E.stopEdit(); let ids = [];
    E.mutate(() => { ids = E.pres.pasteShapes(E.cur, E.pres.packShapes(E.cur, E.sel), 20, 20); });
    E.sel = ids; E.renderCanvas(); E.emit('selection'); return true;
  };
  E.nudge = (dx, dy) => {
    if (!E.sel.length) return;
    E.mutate(() => E.selShapes().forEach((s) => { s.x += dx; s.y += dy; }));
  };
  E.updateSel = (patch, kind) => {
    if (!E.sel.length) return;
    E.mutate(() => E.sel.forEach((id) => E.pres.updateShape(E.cur, id, patch)), kind);
  };
  E.order = (where) => { if (E.sel.length) E.mutate(() => E.sel.forEach((id) => E.pres.reorderShape(E.cur, id, where))); };
  E.rotateBy = (deg) => { E.mutate(() => E.selShapes().forEach((s) => { s.rot = ((s.rot + deg) % 360 + 360) % 360; })); };

  // ---- text style ----
  E.textShapes = () => E.selShapes().filter(Q.canHoldText);
  E.getStyle = () => { const t = E.textShapes(); return t.length ? t[0].ts : null; };
  E.setStyle = (patch) => {
    const t = E.textShapes(); if (!t.length) return;
    E.mutate(() => t.forEach((s) => E.pres.updateShape(E.cur, s.id, { ts: patch })));
  };
  E.toggleStyle = (key) => {
    const t = E.textShapes(); if (!t.length) return;
    const on = t.every((s) => s.ts[key]); const patch = {}; patch[key] = !on;
    if (!on && key === 'sub') patch.sup = false; if (!on && key === 'sup') patch.sub = false;
    E.setStyle(patch);
  };
  E.stepFont = (dir) => {
    const t = E.textShapes(); if (!t.length) return;
    E.mutate(() => t.forEach((s) => {
      const L = Q.SIZES_PT; let n = s.ts.size;
      if (dir > 0) n = L.find((v) => v > s.ts.size) || L[L.length - 1];
      else { const lower = L.filter((v) => v < s.ts.size); n = lower.length ? lower[lower.length - 1] : L[0]; }
      s.ts.size = n;
    }));
  };
  E.clearFormat = () => {
    const t = E.textShapes(); if (!t.length) return;
    E.mutate(() => t.forEach((s) => {
      const keep = { size: s.ts.size, align: s.ts.align, list: s.ts.list };
      s.ts = Object.assign(Q.DEFAULT_TS(), keep, { size: s.ts.size });
    }));
  };
  E.startPainter = () => {
    const s = E.selShapes()[0]; if (!s) return false;
    painter = { ts: Q.clone(s.ts), fill: s.fill, line: s.line ? Q.clone(s.line) : null }; E.emit('painter'); return true;
  };
  E.painterActive = () => !!painter;

  // ---- text editing ----
  const editEl = () => stage.querySelector('.sl-tin[contenteditable]');
  E.startEdit = (id, opts) => {
    opts = opts || {};
    if (E.editing === id) return;
    E.stopEdit();
    const sh = E.shape(id); if (!sh || !Q.canHoldText(sh)) return;
    E.begin(); E.editing = id; E.sel = [id];
    if (opts.append) sh.text += opts.append; // typed character goes into the model first, so it can never be lost
    E.renderCanvas(); focusEdit(); E.emit('selection'); E.emit('edit');
    if (opts.append) { E.emit('change', 'text'); }
  };
  function focusEdit(caret) {
    const t = editEl(); if (!t) return;
    t.focus();
    const sel = window.getSelection(); const r = document.createRange();
    if (caret) {
      const a = posAt(t, caret[0]), f = posAt(t, caret[1]);
      r.setStart(a[0], a[1]); r.setEnd(f[0], f[1]);
    } else { r.selectNodeContents(t); r.collapse(false); }
    sel.removeAllRanges(); sel.addRange(r);
  }
  E.stopEdit = (silent) => {
    if (!E.editing) return;
    const id = E.editing; E.editing = null;
    const t = editEl(); const sh = E.slide() && E.shape(id);
    if (t && sh) sh.text = readEditable(t);
    if (!silent) { E.endGesture(); E.renderCanvas(); scheduleThumbs(); E.emit('edit'); E.emit('selection'); E.emit('change', 'all'); }
  };

  // ---- tools (ink) ----
  E.setTool = (tool, pen) => {
    if (E.editing) E.stopEdit();
    E.tool = tool; if (pen) E.pen = Object.assign({}, E.pen, pen);
    stage.classList.toggle('tool-pen', tool === 'pen'); stage.classList.toggle('tool-eraser', tool === 'eraser');
    if (tool !== 'select') E.sel = [];
    E.renderCanvas(); E.emit('tool'); E.emit('selection');
  };

  // ================= rendering the app =================
  E.renderCanvas = () => {
    if (!stage || !E.pres) return;
    const pres = E.pres, z = E.z();
    let caret = null;
    const old = E.editing ? editEl() : null;
    if (old) { const s = window.getSelection(); if (s.rangeCount && old.contains(s.anchorNode)) caret = [offsetOf(old, s.anchorNode, s.anchorOffset), offsetOf(old, s.focusNode, s.focusOffset)]; }
    rebuilding = true;
    stage.textContent = '';
    stage.style.width = Math.round(pres.W * z) + 'px'; stage.style.height = Math.round(pres.H * z) + 'px';
    stage.style.setProperty('--inv', String(1 / z));
    const s = renderSlide(pres, E.slide(), { prompts: true, selection: new Set(E.sel), editing: E.editing, handles: E.sel.length === 1 && !E.editing && E.tool === 'select' });
    s.style.transform = 'scale(' + z + ')';
    stage.appendChild(s);
    if (g && g.kind === 'marquee' && g.rect) {
      const m = el('div', 'marquee', { left: g.rect.x * z + 'px', top: g.rect.y * z + 'px', width: g.rect.w * z + 'px', height: g.rect.h * z + 'px' });
      m.style.borderWidth = '1px'; stage.appendChild(m);
    }
    rebuilding = false;
    if (E.editing) focusEdit(caret);
  };

  function buildThumb(i, width, big) {
    const pres = E.pres, s = pres.slides[i];
    const item = el('div', 'thumb-item' + (i === E.cur ? ' active' : ''));
    item.dataset.index = i; item.draggable = true;
    const num = el('div', 'thumb-num'); num.textContent = String(i + 1);
    const card = el('div', 'thumb-card', { width: width + 'px' });
    card.setAttribute('role', 'button'); card.setAttribute('aria-label', 'Slide ' + (i + 1));
    const inner = el('div', 'thumb-inner', { width: width + 'px', height: Math.round(width * pres.H / pres.W) + 'px' });
    const sl = renderSlide(pres, s, {}); sl.style.transform = 'scale(' + (width / pres.W) + ')';
    inner.appendChild(sl); card.appendChild(inner); item.appendChild(num); item.appendChild(card);
    return item;
  }
  E.renderThumbs = () => {
    if (!thumbList) return;
    thumbList.textContent = '';
    E.pres.slides.forEach((s, i) => thumbList.appendChild(buildThumb(i, 196)));
    if (E.view === 'sorter') E.renderSorter();
    E.emit('thumbs');
  };
  E.renderSorter = () => {
    sorterEl.textContent = '';
    E.pres.slides.forEach((s, i) => sorterEl.appendChild(buildThumb(i, 232)));
  };
  function scheduleThumbs() { if (thumbRaf) return; thumbRaf = requestAnimationFrame(() => { thumbRaf = 0; E.renderThumbs(); }); }
  function updateThumbSelection() {
    [thumbList, sorterEl].forEach((c) => c && c.querySelectorAll('.thumb-item').forEach((it) => it.classList.toggle('active', Number(it.dataset.index) === E.cur)));
    const a = thumbList.querySelector('.thumb-item.active'); if (a && a.scrollIntoView) a.scrollIntoView({ block: 'nearest' });
  }
  function syncNotes() {
    if (!notesInput) return;
    if (document.activeElement !== notesInput) notesInput.value = E.slide().notes;
    else notesInput.value = E.slide().notes;
  }
  E.fullRender = () => { E.renderCanvas(); E.renderThumbs(); syncNotes(); E.emit('selection'); };

  // ---- zoom ----
  E.setZoom = (mode, value) => {
    E.zoom = { mode, value: Q.clamp(Number(value) || 1, 0.1, 4) };
    try { localStorage.setItem(ZOOM_KEY, JSON.stringify(E.zoom)); } catch (e) { /* ignore */ }
    E.renderCanvas(); E.emit('zoom');
  };
  E.zoomPercent = () => Math.round(E.z() * 100);
  E.zoomStep = (dir) => {
    const cur = E.z() * 100; let next;
    if (dir > 0) next = ZOOM_STEPS.find((v) => v > cur + 0.5) || ZOOM_STEPS[ZOOM_STEPS.length - 1];
    else { const lo = ZOOM_STEPS.filter((v) => v < cur - 0.5); next = lo.length ? lo[lo.length - 1] : ZOOM_STEPS[0]; }
    E.setZoom('custom', next / 100);
  };
  function loadZoom() {
    try { const z = JSON.parse(localStorage.getItem(ZOOM_KEY)); if (z && (z.mode === 'fit' || z.mode === 'custom')) E.zoom = { mode: z.mode, value: Q.clamp(Number(z.value) || 1, 0.1, 4) }; } catch (e) { /* ignore */ }
  }

  // ---- view mode ----
  E.view = 'normal';
  E.setView = (v) => {
    E.stopEdit(); E.view = v;
    document.getElementById('normalView').hidden = v !== 'normal';
    sorterEl.hidden = v !== 'sorter';
    if (v === 'sorter') E.renderSorter(); else E.renderCanvas();
    E.emit('view');
  };

  // ================= interaction =================
  const hitShape = (pt) => {
    const list = E.slide().shapes, z = E.z();
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i];
      if (s.ph && !s.text && false) continue;
      const line = Q.isLineType(s.type);
      const cx = s.x + s.w / 2, cy = s.y + s.h / 2, a = -s.rot * Math.PI / 180;
      const dx = pt.x - cx, dy = pt.y - cy;
      const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
      const tol = (line ? 6 : 0) / z, hh = line ? Math.max(14, s.h) / 2 : s.h / 2;
      if (Math.abs(lx) <= s.w / 2 + tol && Math.abs(ly) <= hh + tol) return s;
    }
    return null;
  };
  function slidePt(ev) {
    const r = stage.getBoundingClientRect(), z = E.z();
    return { x: (ev.clientX - r.left) / z, y: (ev.clientY - r.top) / z };
  }
  const distSeg = (p, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    let t = l2 ? ((p.x - a[0]) * dx + (p.y - a[1]) * dy) / l2 : 0; t = Q.clamp(t, 0, 1);
    return Math.hypot(p.x - (a[0] + t * dx), p.y - (a[1] + t * dy));
  };
  function inkAt(pt) {
    const list = E.slide().shapes;
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i]; if (s.type !== 'ink' || !s.points || !s.points.length) continue;
      const lw = (s.line ? s.line.width : 3) / 2 + 8; const p = { x: pt.x - s.x, y: pt.y - s.y };
      if (s.points.length === 1 && Math.hypot(p.x - s.points[0][0], p.y - s.points[0][1]) <= lw) return s;
      for (let k = 1; k < s.points.length; k++) if (distSeg(p, s.points[k - 1], s.points[k]) <= lw) return s;
    }
    return null;
  }

  function onPointerDown(ev) {
    if (ev.button !== 0) return;
    E.focusArea = 'canvas';
    const inEdit = E.editing && ev.target.closest && ev.target.closest('.sl-tin[contenteditable]');
    if (inEdit) return; // native caret placement / selection inside the text
    const ae = document.activeElement; if (ae && ae !== document.body && ae.blur && (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT')) ae.blur();
    if (E.editing) E.stopEdit();
    const pt = slidePt(ev);

    if (E.tool === 'pen') {
      const live = svgEl('svg', { class: 'ink-live', viewBox: '0 0 ' + E.pres.W + ' ' + E.pres.H, preserveAspectRatio: 'none' });
      const pl = svgEl('polyline', { fill: 'none', stroke: E.pen.color, 'stroke-width': E.pen.width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: E.pen.alpha });
      live.appendChild(pl); stage.appendChild(live);
      g = { kind: 'ink', pts: [[pt.x, pt.y]], pl };
      pl.setAttribute('points', pt.x + ',' + pt.y); stage.setPointerCapture(ev.pointerId); ev.preventDefault(); return;
    }
    if (E.tool === 'eraser') {
      g = { kind: 'erase' }; stage.setPointerCapture(ev.pointerId); eraseAt(pt); ev.preventDefault(); return;
    }
    const hd = ev.target.closest && ev.target.closest('.handle');
    if (hd && E.sel.length === 1) {
      const sh = E.shape(E.sel[0]); E.begin();
      g = { kind: hd.dataset.h === 'rot' ? 'rotate' : 'resize', handle: hd.dataset.h, start: pt, orig: Q.clone(sh), id: sh.id, shift: ev.shiftKey };
      stage.setPointerCapture(ev.pointerId); ev.preventDefault(); return;
    }
    const hit = hitShape(pt);
    const now = Date.now(), ld = lastDown; lastDown = { t: now, x: ev.clientX, y: ev.clientY, id: hit ? hit.id : null };
    if (hit && E.tool === 'select' && Q.canHoldText(hit) && ld && ld.id === hit.id && now - ld.t < 450 && Math.hypot(ev.clientX - ld.x, ev.clientY - ld.y) < 6) {
      lastDown = null; ev.preventDefault(); E.startEdit(hit.id); return; // double-click (the canvas is rebuilt between clicks, so the native dblclick is unreliable)
    }
    if (hit) {
      if (painter) {
        const p = painter; painter = null; E.emit('painter');
        if (Q.canHoldText(hit)) E.mutate(() => E.pres.updateShape(E.cur, hit.id, { ts: p.ts, fill: p.fill, line: p.line || hit.line }));
        E.select([hit.id]); return;
      }
      if (ev.shiftKey) E.select(E.sel.includes(hit.id) ? E.sel.filter((x) => x !== hit.id) : E.sel.concat(hit.id));
      else if (!E.sel.includes(hit.id)) E.select([hit.id]);
      if (E.sel.includes(hit.id)) {
        E.begin();
        g = { kind: 'move', start: pt, moved: false, origs: E.selShapes().map((s) => ({ id: s.id, x: s.x, y: s.y })) };
        stage.setPointerCapture(ev.pointerId);
      }
      ev.preventDefault();
    } else {
      if (!ev.shiftKey && E.sel.length) E.select([]);
      g = { kind: 'marquee', start: pt, base: ev.shiftKey ? E.sel.slice() : [], rect: null };
      stage.setPointerCapture(ev.pointerId);
    }
  }

  function eraseAt(pt) {
    const hit = inkAt(pt);
    if (hit) E.mutate(() => E.pres.removeShapes(E.cur, [hit.id]));
  }

  function onPointerMove(ev) {
    if (!g) return;
    const pt = slidePt(ev), z = E.z();
    if (g.kind === 'ink') {
      const last = g.pts[g.pts.length - 1];
      if (Math.hypot(pt.x - last[0], pt.y - last[1]) < 1.5) return;
      g.pts.push([pt.x, pt.y]); g.pl.setAttribute('points', g.pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')); return;
    }
    if (g.kind === 'erase') { E.begin(); eraseAt(pt); return; }
    const dx = pt.x - g.start.x, dy = pt.y - g.start.y;
    if (g.kind === 'move') {
      if (!g.moved && Math.hypot(dx, dy) * z < 3) return;
      g.moved = true;
      E.live(() => g.origs.forEach((o) => { const s = E.shape(o.id); if (s) { s.x = Math.round(o.x + dx); s.y = Math.round(o.y + dy); } }));
    } else if (g.kind === 'resize') {
      E.live(() => resizeShape(g, pt, ev));
    } else if (g.kind === 'rotate') {
      E.live(() => {
        const s = E.shape(g.id); const cx = g.orig.x + g.orig.w / 2, cy = g.orig.y + g.orig.h / 2;
        let a = Math.atan2(pt.y - cy, pt.x - cx) * 180 / Math.PI + 90;
        if (ev.shiftKey) a = Math.round(a / 15) * 15;
        s.rot = Math.round(((a % 360) + 360) % 360);
      });
    } else if (g.kind === 'marquee') {
      const x = Math.min(pt.x, g.start.x), y = Math.min(pt.y, g.start.y), w = Math.abs(dx), h = Math.abs(dy);
      g.rect = { x, y, w, h };
      const ids = E.slide().shapes.filter((s) => {
        const hh = Q.isLineType(s.type) ? Math.max(14, s.h) : s.h, sy = Q.isLineType(s.type) ? s.y - hh / 2 : s.y;
        return s.x < x + w && s.x + s.w > x && sy < y + h && sy + hh > y;
      }).map((s) => s.id);
      E.sel = Array.from(new Set(g.base.concat(ids))); E.renderCanvas(); E.emit('selection');
    }
  }

  function resizeShape(gs, pt, ev) {
    const o = gs.orig, s = E.shape(gs.id); if (!s) return;
    const a = o.rot * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
    const dx = pt.x - gs.start.x, dy = pt.y - gs.start.y;
    const ldx = dx * cos + dy * sin, ldy = -dx * sin + dy * cos; // pointer delta in the shape's own frame
    const h = gs.handle, hasE = h.includes('e'), hasW = h.includes('w'), hasN = h.includes('n'), hasS = h.includes('s');
    let nw = o.w, nh = o.h;
    if (hasE) nw = o.w + ldx; if (hasW) nw = o.w - ldx;
    if (hasS) nh = o.h + ldy; if (hasN) nh = o.h - ldy;
    nw = Math.max(MIN_SIZE, nw); nh = Q.isLineType(o.type) ? o.h : Math.max(MIN_SIZE, nh);
    const corner = h.length === 2;
    if (corner && (o.type === 'picture' || ev.shiftKey) && o.h > 0) {
      const ratio = o.w / o.h;
      if (Math.abs(nw / o.w) > Math.abs(nh / o.h)) nh = nw / ratio; else nw = nh * ratio;
    }
    let L = -o.w / 2, R = o.w / 2, T = -o.h / 2, B = o.h / 2;
    if (hasE) R = L + nw; else if (hasW) L = R - nw;
    if (hasS) B = T + nh; else if (hasN) T = B - nh;
    const ox = (L + R) / 2, oy = (T + B) / 2;
    const cx = o.x + o.w / 2 + ox * cos - oy * sin, cy = o.y + o.h / 2 + ox * sin + oy * cos;
    const fw = R - L, fh = B - T;
    s.w = Math.round(fw); s.h = Math.round(fh); s.x = Math.round(cx - fw / 2); s.y = Math.round(cy - fh / 2);
  }

  function onPointerUp(ev) {
    if (!g) return;
    const k = g;
    try { stage.releasePointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
    g = null;
    if (k.kind === 'ink') {
      const live = stage.querySelector('.ink-live'); if (live) live.remove();
      let pts = k.pts; if (pts.length === 1) pts = [pts[0], [pts[0][0] + 0.1, pts[0][1] + 0.1]];
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]), pad = E.pen.width / 2 + 1;
      const x = Math.min.apply(null, xs) - pad, y = Math.min.apply(null, ys) - pad;
      const w = Math.max.apply(null, xs) + pad - x, h = Math.max.apply(null, ys) + pad - y;
      E.mutate(() => E.pres.addShape(E.cur, 'ink', { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), line: { color: E.pen.color, width: E.pen.width, alpha: E.pen.alpha }, points: pts.map((p) => [Math.round((p[0] - x) * 10) / 10, Math.round((p[1] - y) * 10) / 10]) }));
      return;
    }
    if (k.kind === 'marquee') { k.rect = null; E.renderCanvas(); return; }
    E.endGesture(); E.renderCanvas(); scheduleThumbs();
  }

  function onDblClick(ev) {
    if (E.tool !== 'select') return;
    if (E.editing && ev.target.closest && ev.target.closest('.sl-tin[contenteditable]')) return;
    const hit = hitShape(slidePt(ev));
    if (hit && Q.canHoldText(hit)) E.startEdit(hit.id);
  }

  function onStageInput(ev) {
    const t = ev.target.closest && ev.target.closest('.sl-tin[contenteditable]'); if (!t || !E.editing) return;
    const sh = E.shape(E.editing); if (!sh) return;
    sh.text = readEditable(t); changed('text');
  }
  function onStageFocusOut(ev) {
    if (rebuilding || !E.editing) return;
    if (ev.target.closest && ev.target.closest('.sl-tin[contenteditable]')) {
      // focus moved somewhere else (not caused by our own rebuild): commit the text
      setTimeout(() => { if (!rebuilding && E.editing && document.activeElement !== editEl()) E.stopEdit(); }, 0);
    }
  }

  // ---- keyboard ----
  function onKey(ev) {
    if (E.showActive || ev.defaultPrevented) return;
    const t = ev.target, mod = ev.ctrlKey || ev.metaKey, k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
    const inEdit = E.editing && t.closest && t.closest('.sl-tin[contenteditable]');
    const inField = t.closest && t.closest('input,textarea,select,[contenteditable]');
    if (inEdit) {
      if (k === 'Escape') { ev.preventDefault(); E.stopEdit(); return; }
      if (mod && k === 'm') { ev.preventDefault(); E.newSlide(); }
      return; // everything else is native text editing
    }
    if (inField) { if (mod && k === 'm') { ev.preventDefault(); E.newSlide(); } return; }
    if (mod && k === 'm') { ev.preventDefault(); E.newSlide(); return; }
    if (mod && k === 'z') { ev.preventDefault(); if (ev.shiftKey) E.redo(); else E.undo(); return; }
    if (mod && k === 'y') { ev.preventDefault(); E.redo(); return; }
    if (mod && k === 'c') { if (E.copy()) ev.preventDefault(); return; }
    if (mod && k === 'x') { if (E.cut()) ev.preventDefault(); return; }
    if (mod && k === 'v') { if (E.paste()) ev.preventDefault(); return; }
    if (mod && k === 'd') { ev.preventDefault(); if (E.focusArea === 'thumbs' || !E.sel.length) { if (E.focusArea === 'thumbs') E.duplicateSlide(); } else E.duplicate(); return; }
    if (mod && k === 'a') { ev.preventDefault(); if (E.focusArea !== 'thumbs') E.selectAll(); return; }
    if (mod || ev.altKey) return;
    if (k === 'Delete' || k === 'Backspace') {
      ev.preventDefault();
      if (E.focusArea === 'thumbs' || !E.sel.length) { if (E.focusArea === 'thumbs') E.deleteSlide(); } else E.deleteSel();
      return;
    }
    if (k === 'Escape') {
      if (E.tool !== 'select') E.setTool('select'); else if (E.sel.length) E.select([]);
      return;
    }
    if (k === 'Enter' || k === 'F2') {
      if (E.sel.length === 1) { const s = E.shape(E.sel[0]); if (s && Q.canHoldText(s)) { ev.preventDefault(); E.startEdit(s.id); } }
      return;
    }
    if (k.indexOf('Arrow') === 0) {
      if (E.view === 'sorter' || E.focusArea === 'thumbs' || !E.sel.length) {
        const d = k === 'ArrowUp' || k === 'ArrowLeft' ? -1 : k === 'ArrowDown' || k === 'ArrowRight' ? 1 : 0;
        if (d && (E.focusArea === 'thumbs' || E.view === 'sorter' || !E.sel.length)) { ev.preventDefault(); E.selectSlide(E.cur + d); }
        return;
      }
      ev.preventDefault();
      const step = ev.shiftKey ? 1 : 5;
      E.nudge(k === 'ArrowLeft' ? -step : k === 'ArrowRight' ? step : 0, k === 'ArrowUp' ? -step : k === 'ArrowDown' ? step : 0);
      return;
    }
    if (k === 'PageUp') { ev.preventDefault(); E.selectSlide(E.cur - 1); return; }
    if (k === 'PageDown') { ev.preventDefault(); E.selectSlide(E.cur + 1); return; }
    // typing with a shape selected starts text editing and keeps the typed character
    if (ev.key.length === 1 && E.sel.length === 1 && E.tool === 'select') {
      const s = E.shape(E.sel[0]);
      if (s && Q.canHoldText(s)) { ev.preventDefault(); E.startEdit(s.id, { append: ev.key }); }
    }
  }

  // ---- thumbnails: select + drag & drop ----
  function wireThumbs(container, horizontal) {
    container.addEventListener('pointerdown', () => { E.focusArea = 'thumbs'; });
    container.addEventListener('click', (ev) => {
      const it = ev.target.closest('.thumb-item'); if (!it) return;
      E.selectSlide(Number(it.dataset.index));
    });
    container.addEventListener('dragstart', (ev) => {
      const it = ev.target.closest('.thumb-item'); if (!it) return;
      dragFrom = Number(it.dataset.index); it.classList.add('dragging');
      ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', String(dragFrom));
    });
    container.addEventListener('dragover', (ev) => {
      const it = ev.target.closest('.thumb-item'); if (!it || dragFrom == null) return;
      ev.preventDefault(); ev.dataTransfer.dropEffect = 'move';
      const r = it.getBoundingClientRect();
      const before = horizontal ? ev.clientX < r.left + r.width / 2 : ev.clientY < r.top + r.height / 2;
      container.querySelectorAll('.drop-before,.drop-after').forEach((n) => n.classList.remove('drop-before', 'drop-after'));
      it.classList.add(before ? 'drop-before' : 'drop-after');
      dropInfo = { index: Number(it.dataset.index), before };
    });
    container.addEventListener('drop', (ev) => {
      ev.preventDefault();
      if (dragFrom == null || !dropInfo) return;
      let to = dropInfo.index + (dropInfo.before ? 0 : 1); if (dragFrom < to) to--;
      const from = dragFrom; dragFrom = null; dropInfo = null;
      if (from !== to) E.moveSlide(from, to); else E.renderThumbs();
    });
    container.addEventListener('dragend', () => {
      dragFrom = null; dropInfo = null;
      container.querySelectorAll('.dragging,.drop-before,.drop-after').forEach((n) => n.classList.remove('dragging', 'drop-before', 'drop-after'));
    });
  }

  // ================= init =================
  E.init = (pres) => {
    stage = document.getElementById('stage'); stageScroll = document.getElementById('stageScroll');
    thumbList = document.getElementById('thumbList'); sorterEl = document.getElementById('sorter'); notesInput = document.getElementById('notesInput');
    E.pres = pres; E.cur = 0; E.sel = []; E.editing = null; E.resetHistory(); loadZoom();
    stage.addEventListener('pointerdown', onPointerDown);
    stage.addEventListener('pointermove', onPointerMove);
    stage.addEventListener('pointerup', onPointerUp);
    stage.addEventListener('pointercancel', onPointerUp);
    stage.addEventListener('dblclick', onDblClick);
    stage.addEventListener('input', onStageInput);
    stage.addEventListener('focusout', onStageFocusOut);
    document.addEventListener('keydown', onKey);
    wireThumbs(thumbList, false); wireThumbs(sorterEl, true);
    sorterEl.addEventListener('dblclick', (ev) => { if (ev.target.closest('.thumb-item')) E.setView('normal'); });
    thumbList.addEventListener('focus', () => { E.focusArea = 'thumbs'; });
    document.getElementById('center').addEventListener('pointerdown', () => { E.focusArea = 'canvas'; }, true);
    notesInput.addEventListener('focus', () => E.begin());
    notesInput.addEventListener('input', () => { E.slide().notes = notesInput.value; changed('notes'); });
    notesInput.addEventListener('blur', () => E.endGesture());
    if (window.ResizeObserver) new ResizeObserver(() => { if (E.zoom.mode === 'fit' && E.view === 'normal') { E.renderCanvas(); E.emit('zoom'); } }).observe(stageScroll);
    window.addEventListener('resize', () => { if (E.zoom.mode === 'fit') { E.renderCanvas(); E.emit('zoom'); } });
    E.fullRender(); E.emit('zoom'); E.emit('history');
  };

  // replace the whole presentation (New / Open)
  E.replacePresentation = (pres) => {
    E.stopEdit(true); E.pres = pres; E.cur = 0; E.sel = []; E.resetHistory(); E.fullRender(); E.emit('slide', 0); E.emit('change', 'all');
  };
})();
