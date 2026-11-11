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
  const BLOCK_TYPES = ['p', 'img', 'pb', 'table'];
  const MARK_KEYS = ['b', 'i', 'u', 's', 'sup', 'sub', 'font', 'size', 'color', 'hl', 'link'];

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
  function cloneProps(p) { return clone(Object.assign({}, p, { runs: [] })); }
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
      const t = paraText(p);
      words += t.split(/\s+/).filter(Boolean).length;
      chars += t.length;
      charsNoSpaces += t.replace(/\s/g, '').length;
      if (t.trim()) paragraphs++;
    });
    return { words, chars, charsNoSpaces, paragraphs };
  }
  function plainText(doc) {
    return doc.blocks.map((blk) => {
      if (blk.type === 'p') return paraText(blk);
      if (blk.type === 'table') return blk.rows.map((row) => row.filter((c) => !c.covered).map((c) => paraText(c.paras[0])).join('\t')).join('\n');
      if (blk.type === 'pb') return '\f';
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
  function tocParas(doc) { return outline(doc).map((o) => newPara(o.text, { indent: o.level * 18, after: 2 })); }

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

  // ---------- export ----------
  function runHTML(r) {
    const f = r.f || {};
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
  };
});
