/*
 * Quadra Word - editor core.
 * The document model (engine.js) is the source of truth. The contenteditable body is
 * re-rendered from the model after every change; the caret is restored from model positions.
 * Browser-only: window.QuadraEditor.
 */
(function (global) {
  'use strict';
  const E = global.QuadraEngine;
  const UNDO_LIMIT = 200;
  const VALUE_KEYS = ['font', 'size', 'color', 'hl', 'link'];

  const P = (a, o) => ({ a: Object.assign({}, a), o });
  const listeners = { change: [], selection: [] };
  let doc = E.createDoc();
  let sel = atPos({ a: { b: 0 }, o: 0 });
  let pending = null;          // typing format for a collapsed caret, e.g. { b: true }
  let undoStack = [];
  let redoStack = [];
  let lastKey = null;          // coalescing key for typing
  let lastAt = 0;
  let clip = null;             // internal clipboard: { text, frags }
  let composing = false;
  let els = {};                // addrKey -> DOM element
  let body = null;

  // ---------- small helpers ----------
  function atPos(pos) { return { anchor: P(pos.a, pos.o), focus: P(pos.a, pos.o) }; }
  const key = (a) => E.addrKey(a);
  const isCollapsed = () => E.isCollapsed(sel);
  const posKey = (s) => key(s.anchor.a) + '@' + s.anchor.o + '|' + key(s.focus.a) + '@' + s.focus.o;
  function emit(name) { listeners[name].forEach((fn) => { try { fn(api); } catch (err) { console.error(err); } }); }
  function mk(tag, cls) { const el = document.createElement(tag); if (cls) el.className = cls; return el; }

  // ---------- rendering ----------
  function runNode(r) {
    const f = r.f || {};
    const text = document.createTextNode(r.t);
    if (!E.MARK_KEYS.some((k) => f[k])) return text;
    const span = mk('span');
    const st = span.style;
    if (f.link) { span.className = 'lnk'; span.title = f.link; }
    if (f.b) st.fontWeight = '700';
    if (f.i) st.fontStyle = 'italic';
    const deco = [];
    if (f.u) deco.push('underline');
    if (f.s) deco.push('line-through');
    if (deco.length) st.textDecoration = deco.join(' ');
    if (f.sup) st.verticalAlign = 'super';
    if (f.sub) st.verticalAlign = 'sub';
    if (f.size) st.fontSize = f.size + 'pt';
    if (f.font) st.fontFamily = '"' + String(f.font).replace(/"/g, '') + '", sans-serif';
    if (f.color) st.color = f.color;
    if (f.hl) st.backgroundColor = f.hl;
    span.appendChild(text);
    return span;
  }

  function renderPara(p, addr, tag, marker) {
    const e = mk(tag, 'para st-' + p.style.toLowerCase().replace(/\s+/g, '-'));
    const k = key(addr);
    e.dataset.key = k;
    els[k] = e;
    if (p.list) {
      e.classList.add('li', 'lv' + Math.min(p.list.level, 8), p.list.kind === 'number' ? 'num' : 'bul');
      e.dataset.marker = marker || '';
    }
    const s = e.style;
    s.textAlign = p.align || 'left';
    s.marginLeft = ((p.indent || 0) + (p.list ? 27 + p.list.level * 36 : 0)) + 'pt';
    s.marginRight = (p.indentR || 0) + 'pt';
    s.marginTop = (p.before || 0) + 'pt';
    s.marginBottom = (p.after === undefined ? 8 : p.after) + 'pt';
    s.lineHeight = String(p.line || 1.15);
    if (!p.runs.length) e.appendChild(mk('br'));
    p.runs.forEach((r) => e.appendChild(runNode(r)));
    return e;
  }

  function renderTable(t, b) {
    const tbl = mk('table', 'tbl');
    t.rows.forEach((row, r) => {
      const tr = mk('tr');
      row.forEach((cell, c) => {
        if (cell.covered) return;
        const td = mk('td');
        if (cell.colspan > 1) td.colSpan = cell.colspan;
        if (cell.rowspan > 1) td.rowSpan = cell.rowspan;
        td.appendChild(renderPara(cell.paras[0], { b, r, c }, 'div', ''));
        tr.appendChild(td);
      });
      tbl.appendChild(tr);
    });
    return tbl;
  }

  function renderBlock(blk, b) {
    const k = String(b);
    if (blk.type === 'img') {
      const wrap = mk('div', 'blk-img');
      wrap.contentEditable = 'false';
      wrap.dataset.key = k;
      wrap.style.textAlign = blk.align || 'left';
      const im = new Image();
      im.src = blk.src;
      im.width = blk.w;
      im.height = blk.h;
      im.alt = '';
      wrap.appendChild(im);
      els[k] = wrap;
      return wrap;
    }
    if (blk.type === 'pb') {
      const d = mk('div', 'pb');
      d.contentEditable = 'false';
      d.dataset.key = k;
      els[k] = d;
      return d;
    }
    if (blk.type === 'table') return renderTable(blk, b);
    return mk('div');
  }

  // Incremental render: a top-level block whose content and list marker did not change keeps
  // its existing DOM node, so typing in one paragraph never rebuilds the rest of the page.
  let sigs = [];
  let nodes = [];
  function registerKeys(node) {
    if (node.dataset && node.dataset.key) els[node.dataset.key] = node;
    node.querySelectorAll && node.querySelectorAll('[data-key]').forEach((el) => { els[el.dataset.key] = el; });
  }
  function render() {
    els = {};
    const newNodes = [];
    const newSigs = [];
    let counters = [];
    doc.blocks.forEach((blk, b) => {
      let marker = '';
      if (blk.type === 'p' && blk.list) {
        const L = Math.min(blk.list.level, 8);
        counters.length = L + 1;
        counters[L] = (counters[L] || 0) + 1;
        marker = blk.list.kind === 'number' ? counters[L] + '.' : ['\u2022', '\u25E6', '\u25AA'][L % 3];
      } else if (blk.type !== 'p') {
        counters = [];
      } else {
        counters = [];
      }
      const sig = JSON.stringify([blk, marker]);
      let node;
      if (sigs[b] === sig && nodes[b] && nodes[b].parentNode === body) {
        node = nodes[b];
        registerKeys(node);
      } else {
        node = blk.type === 'p' ? renderPara(blk, { b }, 'p', marker) : renderBlock(blk, b);
      }
      newNodes.push(node);
      newSigs.push(sig);
    });
    // Put nodes in order; only moves nodes that are out of place.
    newNodes.forEach((node, i) => {
      const cur = body.childNodes[i];
      if (cur !== node) body.insertBefore(node, cur || null);
    });
    while (body.childNodes.length > newNodes.length) body.removeChild(body.lastChild);
    nodes = newNodes;
    sigs = newSigs;
  }

  // ---------- caret and selection mapping ----------
  // Finds the text node and offset for character offset `off` inside element `el`.
  function locate(el, off) {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let rem = off, last = null, n;
    while ((n = w.nextNode())) {
      const L = n.nodeValue.length;
      if (rem <= L) return { node: n, off: rem };
      rem -= L;
      last = n;
    }
    return last ? { node: last, off: last.nodeValue.length } : { node: el, off: 0 };
  }
  function pointOf(pos) {
    const e = els[key(pos.a)];
    return e ? locate(e, pos.o) : null;
  }
  function applySelection(opts) {
    const pa = pointOf(sel.anchor), pf = pointOf(sel.focus);
    if (!pa || !pf) return;
    if (!opts || opts.focus !== false) body.focus({ preventScroll: true });
    document.getSelection().setBaseAndExtent(pa.node, pa.off, pf.node, pf.off);
    const e = els[key(sel.focus.a)];
    if (e && e.scrollIntoView && (!opts || opts.scroll !== false)) e.scrollIntoView({ block: 'nearest' });
  }
  // DOM point -> model position (uses the nearest element that carries data-key).
  function domPos(node, off) {
    const base = node.nodeType === 1 ? node : node.parentNode;
    const host = base && base.closest ? base.closest('[data-key]') : null;
    if (!host || !body.contains(host)) return null;
    const r = document.createRange();
    r.selectNodeContents(host);
    r.setEnd(node, off);
    return P(E.keyToAddr(host.dataset.key), r.toString().length);
  }
  function readDomSelection() {
    const s = document.getSelection();
    if (!s || !s.anchorNode || !s.focusNode) return null;
    const a = domPos(s.anchorNode, s.anchorOffset);
    const f = domPos(s.focusNode, s.focusOffset);
    return a && f ? { anchor: a, focus: f } : null;
  }
  function onSelChange() {
    if (!body) return;
    const r = readDomSelection();
    if (!r || posKey(r) === posKey(sel)) return;
    sel = r;
    pending = null;
    emit('selection');
  }
  function setSel(s, opts) {
    sel = s;
    pending = null;
    applySelection(opts);
    emit('selection');
  }

  // ---------- commit: every model change goes through here (undo, render, events) ----------
  function commit(fn, coalesceKey) {
    const before = JSON.stringify(doc);
    const beforeSel = JSON.stringify(sel);
    const coalesce = !!coalesceKey && coalesceKey === lastKey && Date.now() - lastAt < 1500;
    const res = fn();
    const changed = JSON.stringify(doc) !== before;
    if (changed) {
      if (!coalesce) {
        undoStack.push({ doc: before, sel: beforeSel });
        if (undoStack.length > UNDO_LIMIT) undoStack.shift();
      }
      redoStack = [];
    }
    lastKey = coalesceKey || null;
    lastAt = Date.now();
    if (res) sel = res.anchor ? res : atPos(res);
    if (changed) render();
    if (changed || res) applySelection();
    if (changed) emit('change');
    emit('selection');
    return changed;
  }

  // Returns the nearest text paragraph position around block b (used after removing blocks).
  function textPosNear(b) {
    for (let i = Math.min(b, doc.blocks.length - 1); i >= 0; i--) {
      if (doc.blocks[i].type === 'p') return P({ b: i }, E.paraLen(doc.blocks[i]));
    }
    for (let i = Math.max(b, 0); i < doc.blocks.length; i++) {
      if (doc.blocks[i].type === 'p') return P({ b: i }, 0);
    }
    doc.blocks.push(E.newPara());
    return P({ b: doc.blocks.length - 1 }, 0);
  }
  // If the caret sits on an image or page break, add a paragraph after it so text can be typed.
  function ensureText() {
    const a = sel.anchor.a;
    if (E.getPara(doc, a)) return;
    commit(() => {
      doc.blocks.splice(a.b + 1, 0, E.newPara());
      return P({ b: a.b + 1 }, 0);
    }, null);
  }

  // ---------- typing and editing ----------
  function typeText(text) {
    if (!text) return false;
    ensureText();
    const collapsed = isCollapsed();
    return commit(() => {
      const at = collapsed ? sel.anchor : E.deleteRange(doc, sel);
      const p = E.getPara(doc, at.a);
      if (!p) return null;
      return P(at.a, E.insertText(p, at.o, text, pending));
    }, collapsed ? 'type' : null);
  }
  function enter() {
    ensureText();
    return commit(() => {
      const at = isCollapsed() ? sel.anchor : E.deleteRange(doc, sel);
      return E.splitParagraph(doc, at.a, at.o);
    }, null);
  }
  function removeBlockAt(b) {
    return commit(() => {
      doc.blocks.splice(b, 1);
      return textPosNear(b - 1);
    }, null);
  }
  function backspace() {
    if (!isCollapsed()) return commit(() => E.deleteRange(doc, sel), null);
    const a = sel.anchor.a;
    if (!E.getPara(doc, a)) return a.r === undefined ? removeBlockAt(a.b) : false;
    return commit(() => E.deleteBackward(doc, a, sel.anchor.o), null);
  }
  function del() {
    if (!isCollapsed()) return commit(() => E.deleteRange(doc, sel), null);
    const a = sel.anchor.a;
    if (!E.getPara(doc, a)) return a.r === undefined ? removeBlockAt(a.b) : false;
    return commit(() => E.deleteForward(doc, a, sel.anchor.o), null);
  }
  function onTab(shift) {
    const a = sel.anchor.a;
    if (a.r !== undefined) {
      const next = E.adjacentCell(doc, a, shift ? -1 : 1);
      if (next) { setSel(atPos(P(next, 0))); return; }
      if (!shift) {
        const t = doc.blocks[a.b];
        commit(() => {
          const newRow = t.rows.length;
          E.insertRow(doc, a.b, newRow - 1);
          return P({ b: a.b, r: newRow, c: 0 }, 0);
        }, null);
      }
      return;
    }
    const p = E.getPara(doc, a);
    if (p && p.list) {
      commit(() => { E.changeIndent(doc, [a], shift ? -1 : 1); return null; }, null);
      return;
    }
    if (!shift) typeText('\t');
  }

  // ---------- formatting ----------
  function paraAddrs() { return E.rangeAddrs(doc, sel); }
  function markState() {
    const st = {};
    if (isCollapsed()) {
      const p = E.getPara(doc, sel.anchor.a);
      const f = Object.assign({}, p ? E.fmtBefore(p, sel.anchor.o) : {});
      if (pending) E.applyPatch(f, pending);
      E.MARK_KEYS.forEach((k) => { st[k] = f[k] || null; });
    } else {
      const s = E.orderRange(sel).s;
      const p = E.getPara(doc, s.a);
      E.MARK_KEYS.forEach((k) => {
        st[k] = VALUE_KEYS.includes(k) ? (p ? (E.charFmt(p, s.o)[k] || null) : null) : E.rangeAll(doc, sel, k);
      });
    }
    return st;
  }
  function toggleMark(k) {
    if (isCollapsed()) {
      const cur = markState()[k];
      pending = Object.assign({}, pending || {}, { [k]: !cur });
      emit('selection');
      return;
    }
    commit(() => { E.formatRange(doc, sel, { [k]: !E.rangeAll(doc, sel, k) }); return null; }, null);
  }
  function setMark(k, value) {
    if (isCollapsed()) {
      pending = Object.assign({}, pending || {}, { [k]: value || false });
      emit('selection');
      return;
    }
    commit(() => { E.formatRange(doc, sel, { [k]: value || false }); return null; }, null);
  }
  function clearFormat() {
    const off = {};
    E.MARK_KEYS.forEach((k) => { off[k] = false; });
    if (isCollapsed()) { pending = off; emit('selection'); return; }
    commit(() => { E.formatRange(doc, sel, off); return null; }, null);
  }
  function changeSize(delta) {
    const cur = Number(markState().size) || 12;
    setMark('size', Math.max(1, Math.min(400, cur + delta)));
  }
  function setParaProp(patch) {
    return commit(() => { E.setParaProps(doc, paraAddrs(), patch); return null; }, null);
  }
  function setStyle(name) { return setParaProp({ style: name }); }
  function toggleList(kind) {
    return commit(() => { E.toggleList(doc, paraAddrs(), kind); return null; }, null);
  }
  function changeIndent(delta) {
    return commit(() => { E.changeIndent(doc, paraAddrs(), delta); return null; }, null);
  }

  // ---------- clipboard ----------
  function selectedText() { return E.selectedText(doc, sel); }
  function copy() {
    if (isCollapsed()) return '';
    const text = selectedText();
    clip = { text, frags: E.fragments(doc, sel) };
    return text;
  }
  function cut() {
    const t = copy();
    if (!t) return '';
    commit(() => E.deleteRange(doc, sel), null);
    return t;
  }
  function paste(text) {
    if (!text) return false;
    ensureText();
    const frags = clip && clip.text === text ? clip.frags : text.split(/\r?\n/).map((l) => (l ? [{ t: l, f: {} }] : []));
    return commit(() => {
      const at = isCollapsed() ? sel.anchor : E.deleteRange(doc, sel);
      if (at.a.r !== undefined) {
        const p = E.getPara(doc, at.a);
        if (!p) return null;
        return P(at.a, E.insertText(p, at.o, text.replace(/\r?\n/g, ' '), null));
      }
      return E.pasteFragments(doc, at.a, at.o, frags);
    }, null);
  }

  // ---------- undo / redo ----------
  function restore(s) {
    doc = JSON.parse(s.doc);
    sel = JSON.parse(s.sel);
    pending = null;
    lastKey = null;
    clampSel();
    render();
    applySelection();
    emit('change');
    emit('selection');
  }
  function undo() {
    if (!undoStack.length) return false;
    redoStack.push({ doc: JSON.stringify(doc), sel: JSON.stringify(sel) });
    restore(undoStack.pop());
    return true;
  }
  function redo() {
    if (!redoStack.length) return false;
    undoStack.push({ doc: JSON.stringify(doc), sel: JSON.stringify(sel) });
    restore(redoStack.pop());
    return true;
  }

  // ---------- find and selection helpers ----------
  function selectAll() {
    let last = doc.blocks.length - 1;
    while (last > 0 && doc.blocks[last].type !== 'p') last--;
    const lp = doc.blocks[last];
    setSel({ anchor: P({ b: 0 }, 0), focus: P({ b: last }, lp.type === 'p' ? E.paraLen(lp) : 0) });
  }
  function selectRange(a, o, len) {
    setSel({ anchor: P(a, o), focus: P(a, o + len) }, { focus: false });
  }
  function findNext(query, opts) {
    if (!query) return false;
    const ms = E.findAll(doc, query, opts);
    if (!ms.length) return false;
    const from = sel.focus;
    const m = ms.find((x) => {
      const c = E.cmpAddr(x.a, from.a);
      return c > 0 || (c === 0 && x.o >= from.o);
    }) || ms[0];
    selectRange(m.a, m.o, m.len);
    return true;
  }
  function replaceCurrent(query, rep, opts) {
    const txt = selectedText();
    const same = opts && opts.matchCase ? txt === query : txt.toLowerCase() === String(query).toLowerCase();
    if (!query || isCollapsed() || !same) return findNext(query, opts);
    const s = E.orderRange(sel).s;
    commit(() => {
      const o = E.replaceOne(doc, { a: s.a, o: s.o, len: txt.length }, rep);
      return P(s.a, o);
    }, null);
    return findNext(query, opts);
  }
  function replaceAll(query, rep, opts) {
    let n = 0;
    commit(() => { n = E.replaceAll(doc, query, rep, opts); return null; }, null);
    return n;
  }

  // ---------- inserts ----------
  function insertBlock(blocks) {
    if (sel.anchor.a.r !== undefined || sel.focus.a.r !== undefined) return false;
    ensureText();
    let ok = false;
    commit(() => {
      const at = isCollapsed() ? sel.anchor : E.deleteRange(doc, sel);
      const pos = E.insertBlocks(doc, at.a, at.o, blocks);
      ok = !!pos;
      return pos;
    }, null);
    return ok;
  }
  function insertLink(url) {
    if (!isCollapsed()) { setMark('link', url); return true; }
    const start = P(sel.anchor.a, sel.anchor.o);
    if (!typeText(url)) return false;
    const end = P(sel.anchor.a, sel.anchor.o);
    setSel({ anchor: start, focus: end }, { focus: false });
    setMark('link', url);
    setSel(atPos(end), { focus: false });
    return true;
  }
  function tableOp(fn) {
    const a = sel.anchor.a;
    if (a.r === undefined) return false;
    let ok = false;
    commit(() => { ok = !!fn(a); return null; }, null);
    return ok;
  }
  function deleteTable() {
    const a = sel.anchor.a;
    if (a.r === undefined) return false;
    commit(() => {
      E.deleteTable(doc, a.b);
      return textPosNear(a.b - 1);
    }, null);
    return true;
  }
  function insertTOC() {
    const paras = E.tocParas(doc);
    if (!paras.length) return false;
    return insertBlock(paras);
  }

  // ---------- document-level fields ----------
  function setDocField(field, value) {
    return commit(() => { doc[field] = value; return null; }, null);
  }
  function setSection(patch) {
    return commit(() => { E.setSection(doc, patch); return null; }, null);
  }
  function setAllParas(patch) {
    return commit(() => { E.setAllParas(doc, patch); return null; }, null);
  }
  function setTitle(t) {
    doc.title = t;
    emit('change');
  }
  function clampSel() {
    if (!doc.blocks.length) doc.blocks.push(E.newPara());
    const valid = (pos) => !!doc.blocks[pos.a.b] && (pos.a.r === undefined || !!E.getPara(doc, pos.a));
    if (!valid(sel.anchor)) sel = atPos(P({ b: 0 }, 0));
    if (!valid(sel.focus)) sel = atPos(sel.anchor);
    const p = E.getPara(doc, sel.anchor.a);
    const len = p ? E.paraLen(p) : 0;
    if (sel.anchor.o > len) sel = atPos(P(sel.anchor.a, len));
  }

  // ---------- events ----------
  function onKeydown(e) {
    onSelChange();
    if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); onTab(e.shiftKey); return; }
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === 'b' || k === 'i' || k === 'u') { e.preventDefault(); toggleMark({ b: 'b', i: 'i', u: 'u' }[k]); }
    else if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo(); }
    else if (k === 'a') { e.preventDefault(); selectAll(); }
  }
  // All text edits are intercepted here so the model never misses a character.
  function onBeforeInput(e) {
    if (composing || e.isComposing) return;
    onSelChange();
    switch (e.inputType) {
      case 'insertText':
      case 'insertReplacementText':
        e.preventDefault();
        typeText(e.data != null ? e.data : (e.dataTransfer ? e.dataTransfer.getData('text/plain') : ''));
        break;
      case 'insertParagraph': e.preventDefault(); enter(); break;
      case 'insertLineBreak': e.preventDefault(); typeText('\n'); break;
      case 'deleteContentBackward':
      case 'deleteWordBackward':
      case 'deleteSoftLineBackward':
      case 'deleteHardLineBackward':
        e.preventDefault(); backspace(); break;
      case 'deleteContentForward':
      case 'deleteWordForward':
      case 'deleteSoftLineForward':
      case 'deleteHardLineForward':
        e.preventDefault(); del(); break;
      case 'historyUndo': e.preventDefault(); undo(); break;
      case 'historyRedo': e.preventDefault(); redo(); break;
      default:
        e.preventDefault();
    }
  }
  function onPaste(e) {
    e.preventDefault();
    paste((e.clipboardData && e.clipboardData.getData('text/plain')) || '');
  }
  function onCopy(e) {
    const t = copy();
    if (!t) return;
    e.preventDefault();
    e.clipboardData.setData('text/plain', t);
  }
  function onCut(e) {
    const t = copy();
    if (!t) return;
    e.preventDefault();
    e.clipboardData.setData('text/plain', t);
    commit(() => E.deleteRange(doc, sel), null);
  }
  // After an IME composition, the browser has typed into the DOM; copy the change into the model.
  function syncComposition() {
    const a = sel.anchor.a;
    const p = E.getPara(doc, a);
    const el = els[key(a)];
    if (!p || !el) return;
    const dom = el.textContent, old = E.paraText(p);
    if (dom === old) return;
    let pre = 0;
    while (pre < old.length && pre < dom.length && old[pre] === dom[pre]) pre++;
    let suf = 0;
    while (suf < old.length - pre && suf < dom.length - pre && old[old.length - 1 - suf] === dom[dom.length - 1 - suf]) suf++;
    const ins = dom.slice(pre, dom.length - suf);
    commit(() => {
      E.deleteText(p, pre, old.length - suf);
      E.insertRaw(p, pre, ins, E.fmtBefore(p, pre));
      return P(a, pre + ins.length);
    }, null);
  }

  // ---------- state for the UI ----------
  function paraState() {
    const a = sel.anchor.a;
    const p = E.getPara(doc, a);
    if (!p) return { style: '', align: 'left', list: null, level: 0, line: 1.15, indent: 0, indentR: 0, before: 0, after: 8, kind: doc.blocks[a.b] ? doc.blocks[a.b].type : '' };
    return {
      style: p.style, align: p.align, list: p.list ? p.list.kind : null, level: p.list ? p.list.level : 0,
      line: p.line, indent: p.indent, indentR: p.indentR || 0, before: p.before, after: p.after, kind: 'p',
    };
  }
  function state() {
    return {
      marks: markState(),
      para: paraState(),
      collapsed: isCollapsed(),
      inTable: sel.anchor.a.r !== undefined,
      pending: pending ? Object.assign({}, pending) : null,
      canUndo: undoStack.length > 0,
      canRedo: redoStack.length > 0,
    };
  }

  // ---------- public API ----------
  const api = {
    init(opts) {
      body = document.getElementById('doc-body');
      doc = (opts && opts.doc) || E.createDoc();
      clampSel();
      body.addEventListener('beforeinput', onBeforeInput);
      body.addEventListener('keydown', onKeydown);
      body.addEventListener('paste', onPaste);
      body.addEventListener('copy', onCopy);
      body.addEventListener('cut', onCut);
      body.addEventListener('compositionstart', () => { composing = true; });
      body.addEventListener('compositionend', () => { composing = false; syncComposition(); });
      document.addEventListener('selectionchange', onSelChange);
      render();
    },
    on(name, fn) { if (listeners[name]) listeners[name].push(fn); },
    getDoc: () => doc,
    setDoc(d) {
      doc = d;
      undoStack = [];
      redoStack = [];
      pending = null;
      clampSel();
      render();
      applySelection({ focus: false });
      emit('change');
      emit('selection');
    },
    state,
    caretKey: () => key(sel.anchor.a),
    elementFor: (k) => els[k] || null,
    focus() { body.focus({ preventScroll: true }); applySelection({ focus: true }); },
    moveTo(b) { setSel(atPos(P({ b }, 0))); },
    typeText, enter, backspace, del, onTab,
    toggleMark, setMark, clearFormat, changeSize, setStyle, setParaProp, toggleList, changeIndent,
    copy, cut, paste, undo, redo, selectAll, selectRange, findNext, replaceCurrent, replaceAll, selectedText,
    insertTable: (rows, cols) => insertBlock([E.createTable(rows, cols)]),
    insertImage: (src, w, h) => insertBlock([{ type: 'img', src, w, h, align: 'left' }]),
    insertPageBreak: () => insertBlock([{ type: 'pb' }]),
    insertTOC, insertLink,
    tableOp: {
      insertRowBelow: () => tableOp((a) => E.insertRow(doc, a.b, a.r)),
      insertColumnRight: () => tableOp((a) => E.insertColumn(doc, a.b, a.c)),
      mergeRight: () => tableOp((a) => E.mergeCells(doc, a.b, a.r, a.c, a.r, a.c + 1)),
      mergeBelow: () => tableOp((a) => E.mergeCells(doc, a.b, a.r, a.c, a.r + 1, a.c)),
    },
    deleteTable,
    setDocField, setSection, setAllParas, setTitle,
    wordCount: () => E.wordCount(doc),
    outline: () => E.outline(doc),
    pointOf,
  };
  global.QuadraEditor = api;
})(window);
