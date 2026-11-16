/*
 * Quadra Word - document engine.
 * Pure data + pure functions. No DOM access.
 * Browser: window.QuadraEngine.  Node: module.exports.
 *
 * Document shape:
 *   { v, title, section:{size,orientation,margins:{top,right,bottom,left},columns,pageColor},
 *     header, footer, pageNumber, watermark, theme:{font,accent}, blocks:[...] }
 * Block types:
 *   p     : { type:'p', style, align, indent, indentR, line, before, after, list, runs:[{t,f}] }
 *   img   : { type:'img', src, w, h, align }
 *   pb    : { type:'pb' }
 *   table : { type:'table', rows:[[cell...]] }  cell = { paras:[p], colspan, rowspan, covered? }
 * Addresses: { b } for a top-level block, { b, r, c } for a table cell paragraph.
 * Lengths and offsets are in JavaScript string units (UTF-16).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.QuadraEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PAGE_SIZES = { A4: { w: 595, h: 842 }, Letter: { w: 612, h: 792 }, Legal: { w: 612, h: 1008 } };
  const MARGIN_PRESETS = { Normal: 72, Narrow: 36, Wide: 108 };
  const STYLE_NAMES = ['Normal', 'Title', 'Heading 1', 'Heading 2', 'Heading 3'];
  const HEADING_LEVEL = { Title: 0, 'Heading 1': 1, 'Heading 2': 2, 'Heading 3': 3 };
  const BLOCK_TYPES = ['p', 'img', 'pb', 'cb', 'table'];
  const MARK_KEYS = ['b', 'i', 'u', 's', 'sup', 'sub', 'font', 'size', 'color', 'hl', 'link', 'fn', 'ins', 'del'];

  const clone = (x) => JSON.parse(JSON.stringify(x));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  // ---------- formatting ----------
  // Truthy patch value sets the key, falsy removes it. sup and sub are mutually exclusive.
  function applyPatch(f, patch) {
    for (const k of Object.keys(patch || {})) {
      const v = patch[k];
      if (v) f[k] = v; else delete f[k];
      if (v && k === 'sup') delete f.sub;
      if (v && k === 'sub') delete f.sup;
    }
    return f;
  }
  const fkey = (f) => JSON.stringify(Object.keys(f).sort().map((k) => [k, f[k]]));

  // Drops empty runs, cleans format objects, merges neighbours with equal format.
  function normalize(p) {
    const out = [];
    for (const r of p.runs || []) {
      if (!r.t) continue;
      const f = {};
      for (const k of MARK_KEYS) if (r.f && r.f[k]) f[k] = r.f[k];
      const last = out[out.length - 1];
      if (last && fkey(last.f) === fkey(f)) last.t += r.t;
      else out.push({ t: r.t, f });
    }
    p.runs = out;
    return p;
  }

  function newPara(text, props) {
    const p = { type: 'p', style: 'Normal', align: 'left', indent: 0, indentR: 0, line: 1.15, before: 0, after: 8, list: null, runs: [] };
    if (text) p.runs.push({ t: text, f: {} });
    return Object.assign(p, props || {});
  }
  const makeCell = (text) => ({ paras: [newPara(text)], colspan: 1, rowspan: 1 });
  function createTable(rows, cols) {
    const t = { type: 'table', rows: [] };
    for (let r = 0; r < rows; r++) {
      const row = [];
      for (let c = 0; c < cols; c++) row.push(makeCell(''));
      t.rows.push(row);
    }
    return t;
  }

  // ---------- document ----------
  function createDoc(title) {
    return {
      v: 1,
      title: title || 'Document 2',
      section: { size: 'A4', orientation: 'portrait', margins: { top: 72, right: 72, bottom: 72, left: 72 }, columns: 1, pageColor: 'auto' },
      header: '', footer: '', pageNumber: null, watermark: '',
      theme: { font: '', accent: '' },
      comments: [],
      footnotes: [],
      sources: [],
      blocks: [newPara()],
    };
  }
  function pageSize(section) {
    const s = PAGE_SIZES[section.size] || PAGE_SIZES.A4;
    return section.orientation === 'landscape' ? { w: s.h, h: s.w } : { w: s.w, h: s.h };
  }
  function setSection(doc, patch) {
    const s = doc.section;
    const rest = Object.assign({}, patch || {});
    const margins = rest.margins;
    delete rest.margins;
    Object.assign(s, rest);
    if (margins) s.margins = Object.assign({}, s.margins, margins);
    return s;
  }

  // ---------- addresses ----------
  const addrKey = (a) => (a.r === undefined ? String(a.b) : a.b + ':' + a.r + ':' + a.c);
  function keyToAddr(k) {
    const p = String(k).split(':').map(Number);
    return p.length === 1 ? { b: p[0] } : { b: p[0], r: p[1], c: p[2] };
  }
  const sameAddr = (x, y) => addrKey(x) === addrKey(y);
  function cmpAddr(x, y) {
    if (x.b !== y.b) return x.b - y.b;
    const xr = x.r === undefined ? -1 : x.r, yr = y.r === undefined ? -1 : y.r;
    if (xr !== yr) return xr - yr;
    const xc = x.c === undefined ? -1 : x.c, yc = y.c === undefined ? -1 : y.c;
    return xc - yc;
  }
  function getPara(doc, a) {
    const blk = doc.blocks[a.b];
    if (!blk) return null;
    if (a.r === undefined) return blk.type === 'p' ? blk : null;
    if (blk.type !== 'table') return null;
    const cell = blk.rows[a.r] && blk.rows[a.r][a.c];
    if (!cell || cell.covered || !cell.paras[0]) return null;
    return cell.paras[0];
  }

  // ---------- paragraph text & runs ----------
  const paraText = (p) => p.runs.map((r) => r.t).join('');
  const paraLen = (p) => paraText(p).length;
  function runsSlice(runs, a, b) {
    const out = [];
    let pos = 0;
    for (const r of runs) {
      const s = pos, e = pos + r.t.length;
      pos = e;
      const lo = Math.max(a, s), hi = Math.min(b, e);
      if (hi > lo) out.push({ t: r.t.slice(lo - s, hi - s), f: Object.assign({}, r.f) });
    }
    return out;
  }
  // Format of the character at offset o.
  function charFmt(p, o) {
    let pos = 0;
    for (const r of p.runs) {
      const e = pos + r.t.length;
      if (o >= pos && o < e) return r.f;
      pos = e;
    }
    return {};
  }
  // Format that text typed at offset o inherits (taken from the run on the left, like Word).
  function fmtBefore(p, o) {
    if (o === 0) return p.runs.length ? p.runs[0].f : {};
    let pos = 0;
    for (const r of p.runs) {
      const e = pos + r.t.length;
      if (o > pos && o <= e) return r.f;
      pos = e;
    }
    return p.runs.length ? p.runs[p.runs.length - 1].f : {};
  }
  function setRuns(p, runs) { p.runs = runs; return normalize(p); }
  function insertRaw(p, o, text, f) {
    const len = paraLen(p);
    const at = Math.min(Math.max(0, o), len);
    setRuns(p, [...runsSlice(p.runs, 0, at), { t: text, f: Object.assign({}, f) }, ...runsSlice(p.runs, at, len)]);
    return at + text.length;
  }
  function insertText(p, o, text, patch) {
    const f = applyPatch(Object.assign({}, fmtBefore(p, o)), patch);
    delete f.fn;     // a note reference does not grow when you type after it
    delete f.link;   // nor does a link
    delete f.del;    // nor does a tracked deletion
    return insertRaw(p, o, text, f);
  }
  function deleteText(p, a, b) {
    const len = paraLen(p);
    setRuns(p, [...runsSlice(p.runs, 0, a), ...runsSlice(p.runs, b, len)]);
  }
  function formatText(p, a, b, patch) {
    const len = paraLen(p);
    const mid = runsSlice(p.runs, a, b).map((r) => ({ t: r.t, f: applyPatch(Object.assign({}, r.f), patch) }));
    setRuns(p, [...runsSlice(p.runs, 0, a), ...mid, ...runsSlice(p.runs, b, len)]);
  }

  // ---------- selection ranges ----------
  function orderRange(sel) {
    const { anchor, focus } = sel;
    const c = cmpAddr(anchor.a, focus.a);
    return c < 0 || (c === 0 && anchor.o <= focus.o) ? { s: anchor, e: focus } : { s: focus, e: anchor };
  }
  function isCollapsed(sel) { return sameAddr(sel.anchor.a, sel.focus.a) && sel.anchor.o === sel.focus.o; }

  // Deletes the selected text. Works across top-level paragraphs and within one table cell.
  function deleteRange(doc, sel) {
    const { s, e } = orderRange(sel);
    if (sameAddr(s.a, e.a)) {
      const p = getPara(doc, s.a);
      if (p) deleteText(p, s.o, e.o);
      return { a: s.a, o: s.o };
    }
    if (s.a.r !== undefined || e.a.r !== undefined) return { a: s.a, o: s.o };
    const first = getPara(doc, s.a), last = getPara(doc, e.a);
    if (!first || !last) return { a: s.a, o: s.o };
    const tail = runsSlice(last.runs, e.o, paraLen(last));
    setRuns(first, [...runsSlice(first.runs, 0, s.o), ...tail]);
    doc.blocks.splice(s.a.b + 1, e.a.b - s.a.b);
    return { a: s.a, o: s.o };
  }

  // ---------- editing primitives ----------
  function deleteBackward(doc, a, o) {
    const p = getPara(doc, a);
    if (!p) return { a, o };
    if (o > 0) { deleteText(p, o - 1, o); return { a, o: o - 1 }; }
    if (p.list) { p.list = null; return { a, o }; }
    if (a.r !== undefined || a.b === 0) return { a, o };
    const prev = doc.blocks[a.b - 1];
    if (prev.type === 'p') {
      const prevLen = paraLen(prev);
      setRuns(prev, [...prev.runs, ...p.runs]);
      doc.blocks.splice(a.b, 1);
      return { a: { b: a.b - 1 }, o: prevLen };
    }
    if (prev.type === 'img' || prev.type === 'pb') {
      doc.blocks.splice(a.b - 1, 1);
      return { a: { b: a.b - 1 }, o: 0 };
    }
    return { a, o };
  }
  function deleteForward(doc, a, o) {
    const p = getPara(doc, a);
    if (!p) return { a, o };
    if (o < paraLen(p)) { deleteText(p, o, o + 1); return { a, o }; }
    if (a.r !== undefined) return { a, o };
    const next = doc.blocks[a.b + 1];
    if (!next) return { a, o };
    if (next.type === 'p') { setRuns(p, [...p.runs, ...next.runs]); doc.blocks.splice(a.b + 1, 1); }
    else if (next.type === 'img' || next.type === 'pb') doc.blocks.splice(a.b + 1, 1);
    return { a, o };
  }
  function cloneProps(p) {
    const c = Object.assign({}, p, { runs: [] });
    delete c.bm;   // a bookmark belongs to one paragraph only
    delete c.cm;   // comments belong to the paragraph they were added to
    delete c.toc;  // a new paragraph is not part of the table of contents
    return clone(c);
  }
  // Enter key. Empty list item leaves the list. Headings continue as Normal.
  function splitParagraph(doc, a, o) {
    const p = getPara(doc, a);
    if (!p || a.r !== undefined) return { a, o };
    if (p.list && paraLen(p) === 0) { p.list = null; return { a, o }; }
    const len = paraLen(p);
    const tail = runsSlice(p.runs, o, len);
    setRuns(p, runsSlice(p.runs, 0, o));
    const next = cloneProps(p);
    if (/^(Title|Heading)/.test(p.style)) next.style = 'Normal';
    next.runs = tail;
    normalize(next);
    doc.blocks.splice(a.b + 1, 0, next);
    return { a: { b: a.b + 1 }, o: 0 };
  }
  // Inserts non-text blocks (image, page break, table) at the caret, followed by an empty paragraph.
  function insertBlocks(doc, a, o, blocks) {
    if (a.r !== undefined || !getPara(doc, a)) return null;
    const len = paraLen(doc.blocks[a.b]);
    let idx;
    if (o > 0 && o < len) { splitParagraph(doc, a, o); idx = a.b + 1; }
    else if (o === 0 && len > 0) idx = a.b;
    else idx = a.b + 1;
    doc.blocks.splice(idx, 0, ...blocks, newPara());
    return { a: { b: idx + blocks.length }, o: 0 };
  }

  // ---------- ranges over paragraphs ----------
  function rangeAddrs(doc, sel) {
    const { s, e } = orderRange(sel);
    if (s.a.r !== undefined || e.a.r !== undefined) return [s.a];
    const out = [];
    for (let b = s.a.b; b <= e.a.b; b++) if (doc.blocks[b] && doc.blocks[b].type === 'p') out.push({ b });
    return out;
  }
  // Calls fn(paragraph, fromOffset, toOffset) for every paragraph touched by the selection.
  function eachSpan(doc, sel, fn) {
    const { s, e } = orderRange(sel);
    if (s.a.r !== undefined || e.a.r !== undefined) {
      if (sameAddr(s.a, e.a)) { const p = getPara(doc, s.a); if (p) fn(p, s.o, e.o); }
      return;
    }
    for (let b = s.a.b; b <= e.a.b; b++) {
      const blk = doc.blocks[b];
      if (!blk || blk.type !== 'p') continue;
      fn(blk, b === s.a.b ? s.o : 0, b === e.a.b ? e.o : paraLen(blk));
    }
  }
  function rangeAll(doc, sel, key) {
    let any = false, all = true;
    eachSpan(doc, sel, (p, a, b) => {
      for (const r of runsSlice(p.runs, a, b)) { any = true; if (!r.f[key]) all = false; }
    });
    return any && all;
  }
  function formatRange(doc, sel, patch) {
    eachSpan(doc, sel, (p, a, b) => { if (a < b) formatText(p, a, b, patch); });
  }
  function fragments(doc, sel) {
    const out = [];
    eachSpan(doc, sel, (p, a, b) => out.push(runsSlice(p.runs, a, b)));
    return out;
  }
  const runsText = (runs) => runs.map((r) => r.t).join('');
  function selectedText(doc, sel) { return fragments(doc, sel).map(runsText).join('\n'); }

  // Pastes fragments (arrays of runs). One fragment is inline; more than one creates paragraphs.
  function pasteFragments(doc, a, o, frags) {
    if (a.r !== undefined) return null;
    const p = getPara(doc, a);
    if (!p || !frags.length) return { a, o };
    if (frags.length === 1) {
      let off = o;
      for (const r of frags[0]) off = insertRaw(p, off, r.t, r.f);
      return { a, o: off };
    }
    const len = paraLen(p);
    const tail = runsSlice(p.runs, o, len);
    setRuns(p, [...runsSlice(p.runs, 0, o), ...clone(frags[0])]);
    let idx = a.b;
    for (let i = 1; i < frags.length - 1; i++) {
      const np = cloneProps(p);
      np.runs = clone(frags[i]);
      normalize(np);
      doc.blocks.splice(++idx, 0, np);
    }
    const last = frags[frags.length - 1];
    const lp = cloneProps(p);
    lp.runs = [...clone(last), ...tail];
    normalize(lp);
    doc.blocks.splice(++idx, 0, lp);
    return { a: { b: idx }, o: runsText(last).length };
  }

  // ---------- paragraph properties and lists ----------
  function setParaProps(doc, addrs, patch) {
    for (const a of addrs) { const p = getPara(doc, a); if (p) Object.assign(p, patch); }
  }
  function setAllParas(doc, patch) {
    doc.blocks.forEach((blk) => { if (blk.type === 'p') Object.assign(blk, patch); });
  }
  function toggleList(doc, addrs, kind) {
    const ps = addrs.map((a) => getPara(doc, a)).filter(Boolean);
    const allOn = ps.length > 0 && ps.every((p) => p.list && p.list.kind === kind);
    for (const p of ps) p.list = allOn ? null : { kind, level: p.list ? p.list.level : 0 };
  }
  function changeIndent(doc, addrs, delta) {
    for (const a of addrs) {
      const p = getPara(doc, a);
      if (!p) continue;
      if (p.list) p.list.level = Math.max(0, Math.min(8, p.list.level + delta));
      else p.indent = Math.max(0, (p.indent || 0) + delta * 36);
    }
  }

  // ---------- find / replace / counts ----------
  function forEachPara(doc, fn) {
    doc.blocks.forEach((blk, b) => {
      if (blk.type === 'p') fn(blk, { b });
      else if (blk.type === 'table') {
        blk.rows.forEach((row, r) => row.forEach((cell, c) => {
          if (!cell.covered && cell.paras[0]) fn(cell.paras[0], { b, r, c });
        }));
      }
    });
  }
  function findAll(doc, query, opts) {
    const out = [];
    if (!query) return out;
    const cs = !!(opts && opts.matchCase);
    const q = cs ? query : query.toLowerCase();
    forEachPara(doc, (p, a) => {
      const t = cs ? paraText(p) : paraText(p).toLowerCase();
      let i = 0;
      while ((i = t.indexOf(q, i)) !== -1) { out.push({ a, o: i, len: query.length }); i += query.length; }
    });
    return out;
  }
  function replaceOne(doc, m, rep) {
    const p = getPara(doc, m.a);
    if (!p) return null;
    const f = Object.assign({}, charFmt(p, m.o));
    deleteText(p, m.o, m.o + m.len);
    return insertRaw(p, m.o, rep, f);
  }
  function replaceAll(doc, query, rep, opts) {
    const ms = findAll(doc, query, opts);
    for (let i = ms.length - 1; i >= 0; i--) replaceOne(doc, ms[i], rep);
    return ms.length;
  }
  function wordCount(doc) {
    let words = 0, chars = 0, charsNoSpaces = 0, paragraphs = 0;
    forEachPara(doc, (p) => {
      const t = paraText(p).replace(/\u2060/g, '');
      words += t.split(/\s+/).filter(Boolean).length;
      chars += t.length;
      charsNoSpaces += t.replace(/\s/g, '').length;
      if (t.trim()) paragraphs++;
    });
    return { words, chars, charsNoSpaces, paragraphs };
  }
  function plainText(doc) {
    return doc.blocks.map((blk) => {
      if (blk.type === 'p') return paraText(blk).replace(/\u2060/g, '');
      if (blk.type === 'table') return blk.rows.map((row) => row.filter((c) => !c.covered).map((c) => paraText(c.paras[0])).join('\t')).join('\n');
      if (blk.type === 'pb') return '\f';
      if (blk.type === 'cb') return '';
      return '';
    }).join('\n');
  }
  function outline(doc) {
    const out = [];
    doc.blocks.forEach((blk, b) => {
      if (blk.type === 'p' && HEADING_LEVEL[blk.style] !== undefined && paraText(blk).trim()) {
        out.push({ b, level: HEADING_LEVEL[blk.style], text: paraText(blk) });
      }
    });
    return out;
  }
  function tocParas(doc) { return outline(doc).map((o) => newPara(o.text, { indent: o.level * 18, after: 2, toc: true })); }
  // Rebuilds the table of contents in place. Returns false when there is none.
  function updateToc(doc) {
    const b = doc.blocks.findIndex((blk) => blk.type === 'p' && blk.toc);
    if (b < 0) return false;
    let end = b;
    while (end < doc.blocks.length && doc.blocks[end].type === 'p' && doc.blocks[end].toc) end++;
    doc.blocks.splice(b, end - b, ...tocParas(doc));
    if (!doc.blocks.length) doc.blocks.push(newPara());
    return true;
  }

  // ---------- tables ----------
  function adjacentCell(doc, a, dir) {
    const t = doc.blocks[a.b];
    if (!t || t.type !== 'table') return null;
    const cells = [];
    t.rows.forEach((row, r) => row.forEach((cell, c) => { if (!cell.covered) cells.push({ r, c }); }));
    const i = cells.findIndex((x) => x.r === a.r && x.c === a.c);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= cells.length) return null;
    return { b: a.b, r: cells[j].r, c: cells[j].c };
  }
  function insertRow(doc, b, after) {
    const t = doc.blocks[b];
    if (!t || t.type !== 'table') return false;
    const cols = t.rows[0] ? t.rows[0].length : 1;
    t.rows.splice(after + 1, 0, Array.from({ length: cols }, () => makeCell('')));
    return true;
  }
  function insertColumn(doc, b, after) {
    const t = doc.blocks[b];
    if (!t || t.type !== 'table') return false;
    t.rows.forEach((row) => row.splice(after + 1, 0, makeCell('')));
    return true;
  }
  function deleteTable(doc, b) {
    const t = doc.blocks[b];
    if (!t || t.type !== 'table') return false;
    doc.blocks.splice(b, 1);
    if (!doc.blocks.length) doc.blocks.push(newPara());
    return true;
  }
  // Merges the rectangle (r1,c1)-(r2,c2) into its top-left cell. Refuses if any cell is already merged.
  function mergeCells(doc, b, r1, c1, r2, c2) {
    const t = doc.blocks[b];
    if (!t || t.type !== 'table') return false;
    const R1 = Math.min(r1, r2), R2 = Math.max(r1, r2), C1 = Math.min(c1, c2), C2 = Math.max(c1, c2);
    if (R1 === R2 && C1 === C2) return false;
    for (let r = R1; r <= R2; r++) for (let c = C1; c <= C2; c++) {
      const cell = t.rows[r] && t.rows[r][c];
      if (!cell || cell.covered || cell.colspan > 1 || cell.rowspan > 1) return false;
    }
    const target = t.rows[R1][C1];
    const tp = target.paras[0];
    for (let r = R1; r <= R2; r++) for (let c = C1; c <= C2; c++) {
      if (r === R1 && c === C1) continue;
      const cell = t.rows[r][c];
      const cp = cell.paras[0];
      if (paraLen(cp)) {
        if (paraLen(tp)) tp.runs.push({ t: ' ', f: {} });
        tp.runs.push(...clone(cp.runs));
        normalize(tp);
      }
      cell.covered = true;
      cell.paras = [];
      cell.colspan = 1;
      cell.rowspan = 1;
    }
    target.colspan = C2 - C1 + 1;
    target.rowspan = R2 - R1 + 1;
    return true;
  }


  // ---------- editor (spelling-style checks that are rule based, not a dictionary) ----------
  // Each rule finds positions inside one paragraph's plain text.
  const EDITOR_RULES = [
    { kind: 'double-space', msg: 'More than one space in a row', fixable: true,
      find(t) { const out = []; const re = /\S( {2,})\S/g; let m; while ((m = re.exec(t))) out.push({ o: m.index + 1, len: m[1].length, rep: ' ' }); return out; } },
    { kind: 'space-before-punct', msg: 'Space before punctuation', fixable: true,
      find(t) { const out = []; const re = /\S( +)[,.;:!?]/g; let m; while ((m = re.exec(t))) out.push({ o: m.index + 1, len: m[1].length, rep: '' }); return out; } },
    { kind: 'missing-space', msg: 'No space after punctuation', fixable: true,
      find(t) { const out = []; const re = /[A-Za-z]{2,}[,;:!?.][A-Za-z]{2,}/g; let m; while ((m = re.exec(t))) { const cut = m[0].search(/[,;:!?.][A-Za-z]/) + 1; out.push({ o: m.index + cut, len: 0, rep: ' ' }); } return out; } },
    { kind: 'sentence-start', msg: 'Sentence starts with a small letter', fixable: true,
      find(t) { const out = []; const re = /(^\s*|[.!?]\s+)([a-z])/g; let m; while ((m = re.exec(t))) out.push({ o: m.index + m[1].length, len: 1, rep: m[2].toUpperCase() }); return out; } },
    { kind: 'repeated-word', msg: 'Word repeated (check if it is intended)', fixable: false,
      find(t) { const out = []; const re = /\b([A-Za-z]+) +\1\b/gi; let m; while ((m = re.exec(t))) out.push({ o: m.index, len: m[0].length, rep: m[1] }); return out; } },
  ];
  function editorCheck(doc) {
    const out = [];
    forEachPara(doc, (p, a) => {
      const t = paraText(p);
      for (const rule of EDITOR_RULES) {
        for (const hit of rule.find(t)) {
          out.push({ a: Object.assign({}, a), o: hit.o, len: hit.len, rep: hit.rep, kind: rule.kind, msg: rule.msg, fixable: rule.fixable, excerpt: t.slice(Math.max(0, hit.o - 15), hit.o + 25) });
        }
      }
    });
    return out;
  }
  // Repairs every fixable issue, one at a time from the end of the document, so offsets stay valid.
  function editorFixAll(doc) {
    let fixed = 0;
    for (let guard = 0; guard < 10000; guard++) {
      const fixable = editorCheck(doc).filter((i) => i.fixable);
      if (!fixable.length) break;
      const last = fixable.reduce((best, i) => {
        const c = cmpAddr(i.a, best.a);
        return c > 0 || (c === 0 && i.o > best.o) ? i : best;
      });
      const p = getPara(doc, last.a);
      replaceOne(doc, { a: last.a, o: last.o, len: last.len }, last.rep);
      if (!p) break;
      fixed++;
    }
    return fixed;
  }

  // ---------- equation (plain text with ^ and _ and a few names) ----------
  const SYMBOLS = { pi: 'π', alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', theta: 'θ', lambda: 'λ', mu: 'μ', sigma: 'σ', omega: 'ω',
    Delta: 'Δ', sum: '∑', infinity: '∞', inf: '∞', sqrt: '√', pm: '±', times: '×', div: '÷', neq: '≠', leq: '≤', geq: '≥', approx: '≈', to: '→' };
  const OPS = { '<=': '≤', '>=': '≥', '!=': '≠', '+-': '±', '->': '→', '*': '×' };
  function equationRuns(src) {
    const runs = [];
    let plain = '';
    const flush = () => {
      if (!plain) return;
      let t = plain.replace(/\b[A-Za-z]+\b/g, (w) => (SYMBOLS[w] !== undefined ? SYMBOLS[w] : w));
      t = t.split(/(<=|>=|!=|\+-|->|\*)/).map((part) => (OPS[part] !== undefined ? OPS[part] : part)).join('');
      runs.push({ t, f: {} });
      plain = '';
    };
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (ch === '^' || ch === '_') {
        flush();
        let body = '';
        if (src[i + 1] === '{') {
          const end = src.indexOf('}', i + 2);
          body = end < 0 ? src.slice(i + 2) : src.slice(i + 2, end);
          i = end < 0 ? src.length : end;
        } else if (i + 1 < src.length) {
          body = src[i + 1];
          i += 1;
        }
        if (body) runs.push({ t: body, f: ch === '^' ? { sup: true } : { sub: true } });
      } else {
        plain += ch;
      }
    }
    flush();
    const p = newPara();
    p.runs = runs;
    return normalize(p).runs;
  }

  // ---------- shapes (inserted as svg images) ----------
  function shapeSvg(kind, w, h) {
    const W = w || 200, H = h || 120;
    const stroke = 'stroke="#0e7c86" stroke-width="3" fill="#cfe9ea"';
    const mid = H / 2;
    let body;
    switch (kind) {
      case 'rectangle': body = `<rect x="4" y="4" width="${W - 8}" height="${H - 8}" rx="6" ${stroke}/>`; break;
      case 'ellipse': body = `<ellipse cx="${W / 2}" cy="${H / 2}" rx="${(W - 8) / 2}" ry="${(H - 8) / 2}" ${stroke}/>`; break;
      case 'line': body = `<line x1="4" y1="${mid}" x2="${W - 4}" y2="${mid}" stroke="#0e7c86" stroke-width="3"/>`; break;
      case 'arrow': body = `<line x1="4" y1="${mid}" x2="${W - 18}" y2="${mid}" stroke="#0e7c86" stroke-width="3"/>` +
        `<polygon points="${W - 4},${mid} ${W - 18},${mid - 8} ${W - 18},${mid + 8}" fill="#0e7c86"/>`; break;
      case 'triangle': body = `<polygon points="${W / 2},4 ${W - 4},${H - 4} 4,${H - 4}" ${stroke}/>`; break;
      case 'star': {
        const R = Math.min(W, H) / 2 - 4, r = R * 0.45, pts = [];
        for (let k = 0; k < 10; k++) {
          const ang = -Math.PI / 2 + (k * Math.PI) / 5, rad = k % 2 ? r : R;
          pts.push((W / 2 + rad * Math.cos(ang)).toFixed(1) + ',' + (H / 2 + rad * Math.sin(ang)).toFixed(1));
        }
        body = `<polygon points="${pts.join(' ')}" ${stroke}/>`;
        break;
      }
      default: throw new Error('Unknown shape: ' + kind);
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${body}</svg>`;
  }
  function shapeDataUrl(kind, w, h) {
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(shapeSvg(kind, w, h));
  }

  // ---------- bookmarks (a name on one paragraph) ----------
  const BOOKMARK_RE = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
  function setBookmark(doc, a, name) {
    if (!BOOKMARK_RE.test(name || '')) return false;
    const p = getPara(doc, a);
    if (!p) return false;
    forEachPara(doc, (q) => { if (q.bm === name) delete q.bm; });
    p.bm = name;
    return true;
  }
  function removeBookmark(doc, name) {
    forEachPara(doc, (q) => { if (q.bm === name) delete q.bm; });
  }
  function listBookmarks(doc) {
    const out = [];
    forEachPara(doc, (q, a) => { if (q.bm) out.push({ name: q.bm, a: Object.assign({}, a) }); });
    return out;
  }

  // ---------- comments (text attached to a paragraph) ----------
  function addComment(doc, a, text) {
    const t = String(text || '').trim();
    const p = getPara(doc, a);
    if (!t || !p) return null;
    const id = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    doc.comments.push({ id, text: t, date: new Date().toISOString(), excerpt: paraText(p).slice(0, 60) });
    p.cm = (p.cm || []).concat(id);
    return id;
  }
  function removeComment(doc, id) {
    doc.comments = doc.comments.filter((c) => c.id !== id);
    forEachPara(doc, (q) => {
      if (q.cm) { q.cm = q.cm.filter((x) => x !== id); if (!q.cm.length) delete q.cm; }
    });
  }
  function listComments(doc) {
    const anchored = new Set();
    forEachPara(doc, (q) => (q.cm || []).forEach((id) => anchored.add(id)));
    return doc.comments.map((c) => Object.assign({}, c, { anchored: anchored.has(c.id) }));
  }


  // ---------- footnotes and endnotes ----------
  // The reference is one invisible character (word joiner) carrying the mark fn = note id.
  // Numbers are not stored: they follow the order of the references in the document.
  const NOTE_MARK = '\u2060';
  const roman = (n) => ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'][n - 1] || String(n);
  function insertNote(doc, a, o, kind, text) {
    const t = String(text || '').trim();
    const p = getPara(doc, a);
    if (!p || !t || (kind !== 'footnote' && kind !== 'endnote')) return null;
    const id = 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const at = Math.min(Math.max(0, o), paraLen(p));
    const newOff = insertRaw(p, at, NOTE_MARK, { fn: id });
    doc.footnotes.push({ id, kind, text: t });
    return { id, o: newOff };
  }
  function setNoteText(doc, id, text) {
    const n = doc.footnotes.find((x) => x.id === id);
    const t = String(text || '').trim();
    if (!n || !t) return false;
    n.text = t;
    return true;
  }
  // Each reference, in document order, gets the next number of its own series.
  function noteLabels(doc) {
    const labels = {};
    const count = { footnote: 0, endnote: 0 };
    const kindOf = {};
    (doc.footnotes || []).forEach((n) => { kindOf[n.id] = n.kind; });
    forEachPara(doc, (p) => {
      for (const r of p.runs) {
        if (!r.f.fn || labels[r.f.fn] !== undefined) continue;
        const kind = kindOf[r.f.fn] || 'footnote';
        count[kind]++;
        labels[r.f.fn] = kind === 'endnote' ? roman(count.endnote) : String(count.footnote);
      }
    });
    return labels;
  }
  // Notes that still have a reference in the text, footnotes first, each in reference order.
  function listNotes(doc) {
    const labels = noteLabels(doc);
    const out = [];
    for (const kind of ['footnote', 'endnote']) {
      Object.keys(labels).forEach((id) => {
        const n = doc.footnotes.find((x) => x.id === id);
        if (n && n.kind === kind) out.push({ id, kind, label: labels[id], text: n.text });
      });
    }
    return out;
  }

  // ---------- sources and citations ----------
  function addSource(doc, src) {
    const s = { author: String(src.author || '').trim(), title: String(src.title || '').trim(),
      year: String(src.year || '').trim(), publisher: String(src.publisher || '').trim() };
    if (!s.author && !s.title) return null;
    s.id = 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    doc.sources.push(s);
    return s.id;
  }
  function removeSource(doc, id) { doc.sources = doc.sources.filter((s) => s.id !== id); }
  function listSources(doc) { return doc.sources.slice(); }
  function citationText(src) { return '(' + (src.author || src.title) + ', ' + (src.year || 'n.d.') + ')'; }
  function bibliographyParas(doc) {
    const byAuthor = doc.sources.slice().sort((x, y) => (x.author || x.title).localeCompare(y.author || y.title));
    return byAuthor.map((s) => {
      const parts = [];
      if (s.author) parts.push(s.author + '.');
      if (s.title) parts.push(s.title + '.');
      const tail = [s.publisher, s.year || 'n.d.'].filter(Boolean).join(', ');
      parts.push(tail + '.');
      return newPara(parts.join(' '));
    });
  }


  // ---------- tracked changes ----------
  // Deleting while tracking keeps the text and marks it del. Text that was itself inserted while tracking is removed.
  function trackRangeDelete(p, a, b) {
    const len = paraLen(p);
    const from = Math.max(0, Math.min(a, len));
    const to = Math.max(from, Math.min(b, len));
    if (to <= from) return;
    const out = runsSlice(p.runs, 0, from);
    for (const r of runsSlice(p.runs, from, to)) {
      if (r.f.ins) continue;
      out.push({ t: r.t, f: Object.assign({}, r.f, { del: true }) });
    }
    out.push(...runsSlice(p.runs, to, len));
    setRuns(p, out);
  }
  function countChanges(doc) {
    let inserted = 0, deleted = 0;
    forEachPara(doc, (p) => { for (const r of p.runs) { if (r.f.ins) inserted++; if (r.f.del) deleted++; } });
    return { inserted, deleted };
  }
  function acceptAllChanges(doc) {
    forEachPara(doc, (p) => {
      setRuns(p, p.runs.filter((r) => !r.f.del).map((r) => ({ t: r.t, f: Object.assign({}, r.f, { ins: undefined }) })));
    });
  }
  function rejectAllChanges(doc) {
    forEachPara(doc, (p) => {
      setRuns(p, p.runs.filter((r) => !r.f.ins).map((r) => ({ t: r.t, f: Object.assign({}, r.f, { del: undefined }) })));
    });
  }

  // ---------- accessibility check (read only) ----------
  function accessibilityCheck(doc) {
    const issues = [];
    const hasHeading = doc.blocks.some((b) => b.type === 'p' && HEADING_LEVEL[b.style] !== undefined && paraText(b).trim());
    const hasText = doc.blocks.some((b) => b.type === 'p' && paraText(b).trim());
    if (!hasHeading && hasText) issues.push({ kind: 'no-headings', msg: 'Add headings so screen readers can move through the document.' });
    if (!doc.title || /^Document \d+$/.test(doc.title.trim())) issues.push({ kind: 'default-title', msg: 'Give the document a name instead of the default title.' });
    doc.blocks.forEach((b, i) => {
      if (b.type === 'img' && !(b.alt && String(b.alt).trim())) issues.push({ kind: 'image-no-alt', msg: 'Picture ' + (i + 1) + ' has no alternative text.', b: i });
      if (b.type === 'table') {
        const first = b.rows[0] || [];
        if (first.every((c) => c.covered || !paraText(c.paras[0]).trim())) issues.push({ kind: 'table-no-header', msg: 'Table ' + (i + 1) + ' has an empty first row; use it for column headings.', b: i });
      }
    });
    const empty = doc.blocks.filter((b) => b.type === 'p' && !paraText(b).trim()).length;
    if (empty >= 5) issues.push({ kind: 'empty-paragraphs', msg: empty + ' empty paragraphs. Use spacing settings instead of blank lines.' });
    return issues;
  }
  function setAlt(doc, b, alt) {
    const blk = doc.blocks[b];
    if (!blk || blk.type !== 'img') return false;
    blk.alt = String(alt || '').trim();
    return true;
  }

  // ---------- mail merge ----------
  // CSV: first row is the field names. Quoted values may contain commas. Windows line endings are accepted.
  function parseCsv(text) {
    const s = String(text || '');
    const rows = [];
    let row = [], cell = '', quoted = false;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (quoted) {
        if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else quoted = false; }
        else cell += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && s[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += ch;
    }
    if (cell.length || row.length) { row.push(cell); rows.push(row); }
    const clean = rows.filter((r) => r.some((c) => c.trim() !== ''));
    if (!clean.length) throw new Error('No records found in the data');
    const fields = clean[0].map((f) => f.trim());
    if (fields.some((f) => !f)) throw new Error('Every column needs a name in the first row');
    const records = clean.slice(1).map((r) => {
      const o = {};
      fields.forEach((f, i) => { o[f] = (r[i] || '').trim(); });
      return o;
    });
    if (!records.length) throw new Error('No records found in the data');
    return { fields, records };
  }
  // Returns a copy of the document with «Field» replaced by the record's value.
  function mergeRecord(doc, rec) {
    const out = JSON.parse(JSON.stringify(doc));
    const fields = (doc.merge && doc.merge.fields) || [];
    const fill = (text) => text.replace(/«([^»]+)»/g, (m, name) => (fields.includes(name) ? (rec[name] != null ? String(rec[name]) : '') : m));
    forEachPara(out, (p) => { p.runs.forEach((r) => { r.t = fill(r.t); }); normalize(p); });
    return out;
  }
  // One document with every record, a page break between them.
  function mergeAllCombined(doc) {
    const recs = (doc.merge && doc.merge.records) || [];
    const out = deserialize(serialize(doc));
    out.blocks = [];
    recs.forEach((rec, i) => {
      if (i > 0) out.blocks.push({ type: 'pb' });
      out.blocks.push(...mergeRecord(doc, rec).blocks);
    });
    if (!out.blocks.length) out.blocks.push(newPara());
    return out;
  }

  // ---------- labels and envelopes ----------
  function labelsTable(rows, cols, texts) {
    const t = createTable(rows, cols);
    let i = 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const txt = texts[i++];
      if (txt) insertText(t.rows[r][c].paras[0], 0, txt, null);
    }
    return t;
  }
  function envelopeParas(sender, recipient) {
    const lines = (t) => String(t || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    return [...lines(sender).map((l) => newPara(l)), newPara(''), ...lines(recipient).map((l) => newPara(l))];
  }

  // ---------- export ----------
  let htmlNoteLabels = {};
  function runHTML(r) {
    const f = r.f || {};
    if (f.fn) return '<sup>' + esc(htmlNoteLabels[f.fn] || '') + '</sup>';
    let t = esc(r.t).replace(/\n/g, '<br>');
    const css = [];
    if (f.font) css.push('font-family:' + esc(f.font));
    if (f.size) css.push('font-size:' + Number(f.size) + 'pt');
    if (f.color) css.push('color:' + esc(f.color));
    if (f.hl) css.push('background-color:' + esc(f.hl));
    const deco = [f.u && 'underline', f.s && 'line-through'].filter(Boolean);
    if (deco.length) css.push('text-decoration:' + deco.join(' '));
    if (f.b) t = '<strong>' + t + '</strong>';
    if (f.i) t = '<em>' + t + '</em>';
    if (f.sup) t = '<sup>' + t + '</sup>';
    if (f.sub) t = '<sub>' + t + '</sub>';
    if (f.ins) t = '<ins>' + t + '</ins>';
    if (f.del) t = '<del>' + t + '</del>';
    if (f.link) t = '<a href="' + esc(f.link) + '">' + t + '</a>';
    return css.length ? '<span style="' + css.join(';') + '">' + t + '</span>' : t;
  }
  const inlineHTML = (runs) => runs.map(runHTML).join('') || '<br>';
  function paraHTML(p) {
    const m = /^Heading (\d)$/.exec(p.style);
    const tag = p.style === 'Title' ? 'h1' : m ? 'h' + m[1] : 'p';
    const style = `text-align:${esc(p.align)};margin:${Number(p.before)}pt 0 ${Number(p.after)}pt ${Number(p.indent)}pt;line-height:${Number(p.line)}`;
    return `<${tag} style="${style}">${inlineHTML(p.runs)}</${tag}>`;
  }
  function tableHTML(t) {
    const rows = t.rows.map((row) => '<tr>' + row.filter((c) => !c.covered).map((c) =>
      `<td${c.colspan > 1 ? ` colspan="${c.colspan}"` : ''}${c.rowspan > 1 ? ` rowspan="${c.rowspan}"` : ''}>${inlineHTML(c.paras[0].runs)}</td>`).join('') + '</tr>');
    return '<table>' + rows.join('') + '</table>';
  }
  function toHTML(doc) {
    const s = doc.section, m = s.margins, sz = pageSize(s);
    htmlNoteLabels = noteLabels(doc);
    const parts = [];
    let open = null;
    const close = () => { if (open) { parts.push(open === 'number' ? '</ol>' : '</ul>'); open = null; } };
    for (const blk of doc.blocks) {
      if (blk.type === 'p' && blk.list) {
        if (open !== blk.list.kind) { close(); parts.push(blk.list.kind === 'number' ? '<ol>' : '<ul>'); open = blk.list.kind; }
        parts.push(`<li style="margin-left:${blk.list.level * 36}pt">${inlineHTML(blk.runs)}</li>`);
        continue;
      }
      close();
      if (blk.type === 'p') parts.push(paraHTML(blk));
      else if (blk.type === 'img') parts.push(`<p><img src="${esc(blk.src)}" width="${Number(blk.w)}" height="${Number(blk.h)}" alt=""></p>`);
      else if (blk.type === 'pb') parts.push('<div style="page-break-after:always"></div>');
      else if (blk.type === 'table') parts.push(tableHTML(blk));
    }
    close();
    const notes = listNotes(doc);
    if (notes.length) {
      parts.push('<ol class="notes">' + notes.map((n) => '<li value="' + esc(n.label) + '">' + esc(n.text) + '</li>').join('') + '</ol>');
    }
    const css = `@page{size:${s.size} ${s.orientation};margin:${m.top}pt ${m.right}pt ${m.bottom}pt ${m.left}pt}` +
      `body{font-family:Arial,sans-serif;font-size:12pt;max-width:${sz.w - m.left - m.right}pt;margin:0 auto}` +
      'table{border-collapse:collapse}td{border:1px solid #888;padding:4px}';
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(doc.title)}</title><style>${css}</style></head><body>${parts.join('\n')}</body></html>`;
  }

  // ---------- persistence ----------
  function serialize(doc) { return JSON.stringify(doc); }
  function deserialize(input) {
    const d = typeof input === 'string' ? JSON.parse(input) : clone(input);
    if (!d || typeof d !== 'object' || !Array.isArray(d.blocks) || !d.section || typeof d.section !== 'object') {
      throw new Error('Invalid Quadra document');
    }
    for (const blk of d.blocks) {
      if (!BLOCK_TYPES.includes(blk.type)) throw new Error('Unknown block type: ' + blk.type);
    }
    for (const blk of d.blocks) {
      if (blk.type === 'p') { blk.runs = blk.runs || []; normalize(blk); }
      if (blk.type === 'table') {
        blk.rows.forEach((row) => row.forEach((cell) => {
          cell.paras = cell.paras || [];
          if (!cell.covered && !cell.paras.length) cell.paras.push(newPara());
          cell.paras.forEach(normalize);
        }));
      }
    }
    const base = createDoc();
    if (!d.blocks.length) d.blocks.push(newPara());
    d.section = Object.assign(base.section, d.section);
    d.section.margins = Object.assign({}, base.section.margins, d.section.margins);
    d.title = d.title || 'Document 2';
    d.header = d.header || '';
    d.footer = d.footer || '';
    d.pageNumber = d.pageNumber || null;
    d.watermark = d.watermark || '';
    d.theme = Object.assign({ font: '', accent: '' }, d.theme);
    d.comments = Array.isArray(d.comments) ? d.comments : [];
    d.footnotes = Array.isArray(d.footnotes) ? d.footnotes : [];
    d.sources = Array.isArray(d.sources) ? d.sources : [];
    d.v = 1;
    return d;
  }

  return {
    PAGE_SIZES, MARGIN_PRESETS, STYLE_NAMES, BLOCK_TYPES, MARK_KEYS, HEADING_LEVEL,
    clone, esc, applyPatch, normalize, newPara, makeCell, createTable,
    createDoc, pageSize, setSection,
    addrKey, keyToAddr, sameAddr, cmpAddr, getPara,
    paraText, paraLen, runsSlice, charFmt, fmtBefore, insertRaw, insertText, deleteText, formatText,
    orderRange, isCollapsed, deleteRange, deleteBackward, deleteForward, splitParagraph, insertBlocks,
    rangeAddrs, eachSpan, rangeAll, formatRange, fragments, selectedText, pasteFragments,
    setParaProps, setAllParas, toggleList, changeIndent,
    forEachPara, findAll, replaceOne, replaceAll, wordCount, plainText, outline, tocParas,
    adjacentCell, insertRow, insertColumn, deleteTable, mergeCells,
    toHTML, serialize, deserialize,
    editorCheck, editorFixAll, equationRuns, shapeSvg, shapeDataUrl,
    setBookmark, removeBookmark, listBookmarks, addComment, removeComment, listComments,
    insertNote, setNoteText, noteLabels, listNotes, updateToc,
    addSource, removeSource, listSources, citationText, bibliographyParas, NOTE_MARK,
    trackRangeDelete, countChanges, acceptAllChanges, rejectAllChanges,
    accessibilityCheck, setAlt, parseCsv, mergeRecord, mergeAllCombined, labelsTable, envelopeParas,
  };
});
