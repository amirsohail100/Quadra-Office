(function () {
  "use strict";

  // ---------- Config ----------
  const HDR_W = 40, HDR_H = 20, COL_W = 64, ROW_H = 20;
  const MAX_ROWS = 1048576, MAX_COLS = 16384;   // Excel's own limits
  const ROW_CHUNK = 500, COL_CHUNK = 100;       // grid grows in chunks as you scroll
  const DEFAULT_SIZE = 11, DEFAULT_FONT = "Calibri";
  const DENSE_LIMIT = 20000;

  // ---------- DOM ----------
  const $ = (s) => document.querySelector(s);
  const wrap = $("#gridWrap"), sizer = $("#sizer"), canvas = $("#canvas");
  const ctx = canvas.getContext("2d");
  const ed = $("#cellEditor"), nameBox = $("#nameBox"), fbInput = $("#formulaInput");
  const toastEl = $("#toast"), colorPicker = $("#colorPicker"), ribbon = $("#ribbon");
  const dpr = window.devicePixelRatio || 1;

  // ---------- State ----------
  let rowCount = 1000, colCount = 100;
  const cells = new Map();                    // "r,c" -> { v: string, s: {style} }
  const S = { ar: 0, ac: 0, fr: 0, fc: 0 };   // anchor = active cell, focus = range end
  let editing = false, dragging = false, clip = null, painter = null;
  let extras = []; // extra selected rectangles added with Ctrl+click
  const pal = {
    cell: "#ffffff", text: "#201f1e", grid: "#e1dfdd", accent: "#107c41",
    header: "#f8f9fa", headerSel: "#e1f0e6", headerText: "#605e5c", headerLine: "#c8c6c4",
    selTint: "rgba(16,124,65,0.12)", border: "#323130"
  };
  const listeners = [];
  const rules = []; // conditional formatting: {r1,c1,r2,c2,op,a,b,fill,color}
  let pendingColor = null, rafId = 0, toastTimer = 0;

  // ---------- Helpers ----------
  const key = (r, c) => r + "," + c;
  const getCell = (r, c) => cells.get(key(r, c));
  function getOrCreate(r, c) {
    const k = key(r, c);
    let cell = cells.get(k);
    if (!cell) { cell = { v: "", s: {} }; cells.set(k, cell); }
    return cell;
  }
  function colName(c) {
    let s = "", n = c;
    do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
    return s;
  }
  const ref = (r, c) => colName(c) + (r + 1);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const activeCell = () => getCell(S.ar, S.ac);
  const activeStyle = () => (activeCell() && activeCell().s) || {};
  const isNum = (v) => typeof v === "string" && v.trim() !== "" && isFinite(Number(v));

  function range() {
    return {
      r1: Math.min(S.ar, S.fr), r2: Math.max(S.ar, S.fr),
      c1: Math.min(S.ac, S.fc), c2: Math.max(S.ac, S.fc)
    };
  }

  // Applies fn to the active range and to every Ctrl+click selection.
  function forTargets(fn) {
    forRange(range(), fn);
    for (const R of extras) forRange(R, fn);
  }

  // Iterates a range. Small ranges: every cell. Huge ranges (whole column, select all): only existing cells.
  function forRange(R, fn) {
    const area = (R.r2 - R.r1 + 1) * (R.c2 - R.c1 + 1);
    if (area <= DENSE_LIMIT) {
      for (let r = R.r1; r <= R.r2; r++) for (let c = R.c1; c <= R.c2; c++) fn(r, c);
    } else {
      for (const k of [...cells.keys()]) {
        const [r, c] = k.split(",").map(Number);
        if (r >= R.r1 && r <= R.r2 && c >= R.c1 && c <= R.c2) fn(r, c);
      }
    }
  }

  function prune() {
    for (const [k, cell] of cells) if (!cell.v && !cell.comment && Object.keys(cell.s).length === 0) cells.delete(k);
  }

  function setValue(r, c, v) {
    if (v === "") {
      const cell = getCell(r, c);
      if (cell) { cell.v = ""; if (!Object.keys(cell.s).length && !cell.comment) cells.delete(key(r, c)); }
      return;
    }
    getOrCreate(r, c).v = v;
  }

  // ---------- Computed values ----------
  const QE = window.QEngine;
  const memo = new Map();       // computed values, cleared on every refresh()
  const computing = new Set();  // cells on the current evaluation path (cycle detection)

  function cellValue(r, c) {
    const k = key(r, c);
    if (memo.has(k)) return memo.get(k);
    const cell = cells.get(k);
    if (!cell || cell.v === "") return null;
    let v;
    if (cell.v.length > 1 && cell.v[0] === "=") {
      if (computing.has(k)) return new QE.CellError(QE.ERR.CIRC);
      computing.add(k);
      try {
        v = QE.computeRaw(cell.v, cellEnv);
      } catch (e) {
        console.error(e);
        v = new QE.CellError(QE.ERR.VALUE);
      } finally {
        computing.delete(k);
      }
    } else {
      v = QE.parseLiteral(cell.v);
    }
    memo.set(k, v);
    return v;
  }
  const cellEnv = { cell: (r, c) => cellValue(r, c), maxRows: MAX_ROWS, maxCols: MAX_COLS };

  function numGeneral(n) {
    return Number.isInteger(n) ? String(n) : String(Number(n.toPrecision(10)));
  }

  // Text shown in a cell for a computed value and its style
  function displayText(v, s) {
    if (v === null) return "";
    if (QE.isError(v)) return v.code;
    if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
    if (typeof v === "string") return v;
    if (!s.nf || s.nf === "general") return numGeneral(v);
    const d = s.dec ?? (s.nf === "percent" ? 0 : 2);
    if (s.nf === "percent") return (v * 100).toFixed(d) + "%";
    const body = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
    const sign = v < 0 ? "-" : "";
    return s.nf === "currency" ? sign + "$" + body : sign + body;
  }

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 1800);
  }

  // ---------- Infinite growth ----------
  function updateSizer() {
    sizer.style.width = HDR_W + colCount * COL_W + "px";
    sizer.style.height = HDR_H + rowCount * ROW_H + "px";
  }

  function growTo(r, c) {
    while (rowCount < Math.min(MAX_ROWS, r + 200)) rowCount = Math.min(MAX_ROWS, rowCount + ROW_CHUNK);
    while (colCount < Math.min(MAX_COLS, c + 20)) colCount = Math.min(MAX_COLS, colCount + COL_CHUNK);
    updateSizer();
  }

  function growIfNeeded() {
    const bottom = wrap.scrollTop + wrap.clientHeight;
    while (rowCount < MAX_ROWS && bottom > HDR_H + (rowCount - 200) * ROW_H)
      rowCount = Math.min(MAX_ROWS, rowCount + ROW_CHUNK);
    const right = wrap.scrollLeft + wrap.clientWidth;
    while (colCount < MAX_COLS && right > HDR_W + (colCount - 20) * COL_W)
      colCount = Math.min(MAX_COLS, colCount + COL_CHUNK);
    updateSizer();
  }

  function ensureVisible(r, c) {
    growTo(r, c);
    const x = HDR_W + c * COL_W, y = HDR_H + r * ROW_H;
    const vw = wrap.clientWidth, vh = wrap.clientHeight;
    if (x - wrap.scrollLeft < HDR_W) wrap.scrollLeft = x - HDR_W;
    else if (x + COL_W - wrap.scrollLeft > vw) wrap.scrollLeft = x + COL_W - vw;
    if (y - wrap.scrollTop < HDR_H) wrap.scrollTop = y - HDR_H;
    else if (y + ROW_H - wrap.scrollTop > vh) wrap.scrollTop = y + ROW_H - vh;
  }

  // ---------- Drawing ----------
  function requestDraw() {
    if (!rafId) rafId = requestAnimationFrame(() => { rafId = 0; draw(); });
  }

  function wrapLines(text, maxW) {
    const lines = [];
    let line = "";
    for (const w of text.split(" ")) {
      const test = line ? line + " " + w : w;
      if (ctx.measureText(test).width <= maxW) line = test;
      else { if (line) lines.push(line); line = w; }
    }
    if (line) lines.push(line);
    return lines;
  }

  function drawCellText(cell, v, text, x, y) {
    const s = cell.s, size = Math.round((s.size || DEFAULT_SIZE) * 1.2), pad = 4;
    ctx.font = `${s.italic ? "italic " : ""}${s.bold ? "bold " : ""}${size}px ${s.font || DEFAULT_FONT}, Arial, sans-serif`;
    ctx.fillStyle = s.color || pal.text;
    const ha = s.ha || (typeof v === "number" ? "right" : typeof v === "boolean" ? "center" : "left");
    const va = s.va || "bottom";
    const tx = ha === "center" ? x + COL_W / 2 : ha === "right" ? x + COL_W - pad : x + pad;
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, COL_W, ROW_H); ctx.clip();
    ctx.textAlign = ha;
    if (s.wrap) {
      ctx.textBaseline = "top";
      wrapLines(text, COL_W - 2 * pad).forEach((ln, i) => ctx.fillText(ln, tx, y + 2 + i * (size + 1)));
    } else {
      ctx.textBaseline = va === "top" ? "top" : va === "middle" ? "middle" : "bottom";
      const ty = va === "top" ? y + 2 : va === "middle" ? y + ROW_H / 2 : y + ROW_H - 3;
      ctx.fillText(text, tx, ty);
      if (s.underline) {
        const w = ctx.measureText(text).width;
        const ux = ha === "center" ? tx - w / 2 : ha === "right" ? tx - w : tx;
        const uy = va === "top" ? ty + size + 1 : va === "middle" ? ty + size / 2 + 1 : ty + 1;
        ctx.fillRect(ux, uy, w, 1);
      }
    }
    ctx.restore();
  }

  function draw() {
    const W = wrap.clientWidth, H = wrap.clientHeight;
    if (!W || !H) return;
    const sx = wrap.scrollLeft, sy = wrap.scrollTop;
    const X = (c) => HDR_W + c * COL_W - sx;
    const Y = (r) => HDR_H + r * ROW_H - sy;
    const c0 = Math.max(0, Math.floor(sx / COL_W));
    const c1 = Math.min(colCount - 1, c0 + Math.ceil(W / COL_W) + 1);
    const r0 = Math.max(0, Math.floor(sy / ROW_H));
    const r1 = Math.min(rowCount - 1, r0 + Math.ceil(H / ROW_H) + 1);
    const R = range();

    ctx.fillStyle = pal.cell;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.beginPath(); ctx.rect(HDR_W, HDR_H, W - HDR_W, H - HDR_H); ctx.clip();

    // 1. selection tint (extra Ctrl+click selections too)
    for (const E of extras) {
      const ex1 = Math.max(HDR_W, X(E.c1)), ey1 = Math.max(HDR_H, Y(E.r1));
      const ex2 = Math.min(W, X(E.c2 + 1)), ey2 = Math.min(H, Y(E.r2 + 1));
      if (ex2 > ex1 && ey2 > ey1) { ctx.fillStyle = pal.selTint; ctx.fillRect(ex1, ey1, ex2 - ex1, ey2 - ey1); }
    }
    const x1 = Math.max(HDR_W, X(R.c1)), y1 = Math.max(HDR_H, Y(R.r1));
    const x2 = Math.min(W, X(R.c2 + 1)), y2 = Math.min(H, Y(R.r2 + 1));
    if (x2 > x1 && y2 > y1) { ctx.fillStyle = pal.selTint; ctx.fillRect(x1, y1, x2 - x1, y2 - y1); }

    // 2. cell fills
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const cell = cells.get(key(r, c));
        const isActive = r === S.ar && c === S.ac;
        const rule = rules.length ? ruleFor(r, c, cellValue(r, c)) : null;
        const f = rule ? rule.fill : isActive ? (cell && cell.s.fill) || pal.cell : cell && cell.s.fill;
        if (f) { ctx.fillStyle = f; ctx.fillRect(X(c), Y(r), COL_W, ROW_H); }
      }
    }

    // 3. gridlines
    ctx.strokeStyle = sheetOpt.gridView ? pal.grid : "rgba(0,0,0,0)"; ctx.lineWidth = 1; ctx.beginPath();
    for (let c = c0; c <= c1 + 1; c++) { const x = Math.floor(X(c)) + 0.5; ctx.moveTo(x, HDR_H); ctx.lineTo(x, H); }
    for (let r = r0; r <= r1 + 1; r++) { const y = Math.floor(Y(r)) + 0.5; ctx.moveTo(HDR_W, y); ctx.lineTo(W, y); }
    ctx.stroke();

    // 3b. cell borders
    ctx.strokeStyle = pal.border; ctx.lineWidth = 1; ctx.beginPath();
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const cell = cells.get(key(r, c));
        if (!cell || !cell.s.border) continue;
        ctx.rect(Math.floor(X(c)) + 0.5, Math.floor(Y(r)) + 0.5, COL_W - 1, ROW_H - 1);
      }
    }
    ctx.stroke();

    // 4. cell text
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (editing && r === S.ar && c === S.ac) continue;
        const cell = cells.get(key(r, c));
        if (!cell) continue;
        const v = cellValue(r, c);
        const text = sheetOpt.showFormulas && cell.v[0] === "=" ? cell.v : displayText(v, cell.s);
        if (text === "") continue;
        const hit = rules.length ? ruleFor(r, c, v) : null;
        drawCellText(hit && hit.color ? { ...cell, s: { ...cell.s, color: hit.color } } : cell, v, text, X(c), Y(r));
      }
    }

    // 4b. comment markers and comment boxes
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const cell = cells.get(key(r, c));
        if (!cell || !cell.comment) continue;
        const x = X(c), y = Y(r);
        ctx.fillStyle = "#ff0000";
        ctx.beginPath();
        ctx.moveTo(x + COL_W - 7, y); ctx.lineTo(x + COL_W, y); ctx.lineTo(x + COL_W, y + 7);
        ctx.closePath(); ctx.fill();
        if (reviewOpt.showAll || cell.showComment) {
          ctx.font = "11px Segoe UI, Arial, sans-serif";
          const text = cell.comment;
          const w = Math.min(240, ctx.measureText(text).width + 12);
          const bx = x + COL_W + 6, by = y;
          ctx.fillStyle = "#ffffe1";
          ctx.fillRect(bx, by, w, 22);
          ctx.strokeStyle = "#7f7f7f";
          ctx.strokeRect(bx + 0.5, by + 0.5, w - 1, 21);
          ctx.fillStyle = "#000";
          ctx.textAlign = "left"; ctx.textBaseline = "middle";
          ctx.fillText(text, bx + 6, by + 11);
        }
      }
    }

    // 5. active cell outline
    ctx.strokeStyle = pal.accent; ctx.lineWidth = 2;
    ctx.strokeRect(X(S.ac) + 1, Y(S.ar) + 1, COL_W - 2, ROW_H - 2);
    ctx.restore();

    // Headings hidden: blank the header bands and stop
    if (!sheetOpt.headingsView) {
      ctx.fillStyle = pal.cell;
      ctx.fillRect(0, 0, W, HDR_H);
      ctx.fillRect(0, 0, HDR_W, H);
      return;
    }

    // 6. column headers (pinned to top)
    ctx.fillStyle = pal.header;
    ctx.fillRect(HDR_W, 0, W - HDR_W, HDR_H);
    ctx.save();
    ctx.beginPath(); ctx.rect(HDR_W, 0, W - HDR_W, HDR_H); ctx.clip();
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (let c = c0; c <= c1; c++) {
      const x = X(c), sel = c >= R.c1 && c <= R.c2;
      if (sel) { ctx.fillStyle = pal.headerSel; ctx.fillRect(x, 0, COL_W, HDR_H); }
      ctx.fillStyle = sel ? pal.accent : pal.headerText;
      ctx.font = (sel ? "600 " : "") + "12px Segoe UI, Arial, sans-serif";
      ctx.fillText(colName(c), x + COL_W / 2, HDR_H / 2);
    }
    ctx.restore();

    // 7. row headers (pinned to left)
    ctx.fillStyle = pal.header;
    ctx.fillRect(0, HDR_H, HDR_W, H - HDR_H);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, HDR_H, HDR_W, H - HDR_H); ctx.clip();
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = "12px Segoe UI, Arial, sans-serif";
    for (let r = r0; r <= r1; r++) {
      const y = Y(r), sel = r >= R.r1 && r <= R.r2;
      if (sel) { ctx.fillStyle = pal.headerSel; ctx.fillRect(0, y, HDR_W, ROW_H); }
      ctx.fillStyle = sel ? pal.accent : pal.headerText;
      ctx.fillText(String(r + 1), HDR_W / 2, y + ROW_H / 2);
    }
    ctx.restore();

    // 8. corner + header borders
    ctx.fillStyle = pal.header;
    ctx.fillRect(0, 0, HDR_W, HDR_H);
    ctx.strokeStyle = pal.headerLine; ctx.lineWidth = 1; ctx.beginPath();
    ctx.moveTo(0, HDR_H + 0.5); ctx.lineTo(W, HDR_H + 0.5);
    ctx.moveTo(HDR_W + 0.5, 0); ctx.lineTo(HDR_W + 0.5, H);
    for (let c = c0; c <= c1 + 1; c++) { const x = Math.floor(X(c)) + 0.5; if (x > HDR_W) { ctx.moveTo(x, 0); ctx.lineTo(x, HDR_H); } }
    for (let r = r0; r <= r1 + 1; r++) { const y = Math.floor(Y(r)) + 0.5; if (y > HDR_H) { ctx.moveTo(0, y); ctx.lineTo(HDR_W, y); } }
    ctx.stroke();
  }

  // ---------- Undo / redo (snapshots of the cell store) ----------
  const undoStack = [], redoStack = [];
  let lastSnap = "[]";
  const snapshot = () => JSON.stringify({ c: Array.from(cells.entries()), r: rules });
  function parseSnap(text) {
    const o = JSON.parse(text);
    return Array.isArray(o) ? { c: o, r: [] } : o;
  }
  function recordHistory() {
    const now = snapshot();
    if (now === lastSnap) return;
    undoStack.push(lastSnap);
    if (undoStack.length > 100) undoStack.shift();
    redoStack.length = 0;
    lastSnap = now;
  }
  function restoreSnap(s) {
    const o = parseSnap(s);
    cells.clear();
    for (const [k, v] of o.c) cells.set(k, v);
    rules.length = 0;
    rules.push(...o.r);
    lastSnap = s;
    refresh();
  }
  function undo() {
    if (!undoStack.length) return toast("Nothing to undo");
    redoStack.push(lastSnap);
    restoreSnap(undoStack.pop());
  }
  function redo() {
    if (!redoStack.length) return toast("Nothing to redo");
    undoStack.push(lastSnap);
    restoreSnap(redoStack.pop());
  }

  // ---------- Conditional formatting ----------
  function matchRule(q, v) {
    if (q.op === "contains") return typeof v === "string" && v.toLowerCase().includes(String(q.a).toLowerCase());
    if (typeof v !== "number") return false;
    if (q.op === "gt") return v > q.a;
    if (q.op === "lt") return v < q.a;
    if (q.op === "eq") return v === q.a;
    if (q.op === "between") return v >= q.a && v <= q.b;
    return false;
  }

  // The last rule that covers the cell and matches its value wins
  function ruleFor(r, c, v) {
    for (let i = rules.length - 1; i >= 0; i--) {
      const q = rules[i];
      if (r < q.r1 || r > q.r2 || c < q.c1 || c > q.c2) continue;
      if (matchRule(q, v)) return q;
    }
    return null;
  }

  function addRule(rule) {
    if (sheetProtected) return toast("Sheet is protected. Unprotect it to edit.");
    const R = range();
    rules.push({ r1: R.r1, c1: R.c1, r2: R.r2, c2: R.c2, op: rule.op, a: rule.a, b: rule.b, fill: rule.fill || null, color: rule.color || null });
    refresh();
    toast("Rule applied to " + ref(R.r1, R.c1) + ":" + ref(R.r2, R.c2));
  }

  function clearRules() {
    const R = range();
    for (let i = rules.length - 1; i >= 0; i--) {
      const q = rules[i];
      if (!(q.r2 < R.r1 || q.r1 > R.r2 || q.c2 < R.c1 || q.c1 > R.c2)) rules.splice(i, 1);
    }
    refresh();
    toast("Rules cleared from the selection");
  }

  // ---------- Insert / delete rows and columns ----------
  // Inserts the selected number of lines before the first selected line, or deletes the selected lines.
  // Cells, comments, formats, formulas (references) and conditional rules all move with the lines.
  function editLines(axis, del) {
    if (sheetProtected) return toast("Sheet is protected. Unprotect it to edit.");
    const R = range();
    const isRow = axis === "row";
    const at = isRow ? R.r1 : R.c1;
    const cnt = isRow ? R.r2 - R.r1 + 1 : R.c2 - R.c1 + 1;
    const limit = isRow ? MAX_ROWS : MAX_COLS;
    const mapPos = (p) => {
      if (!del) return p >= at ? p + cnt : p;
      if (p < at) return p;
      if (p < at + cnt) return -1;
      return p - cnt;
    };
    const mapRef = (rf) => {
      const np = mapPos(isRow ? rf.row : rf.col);
      if (np < 0 || np >= limit) return null;
      return isRow ? { col: rf.col, row: np } : { col: np, row: rf.row };
    };
    const next = new Map();
    for (const [k, cell] of cells) {
      const [r, c] = k.split(",").map(Number);
      const np = mapPos(isRow ? r : c);
      if (np < 0 || np >= limit) continue;
      const nk = isRow ? np + "," + c : r + "," + np;
      next.set(nk, { ...cell, v: cell.v[0] === "=" ? QE.remapFormula(cell.v, mapRef) : cell.v });
    }
    cells.clear();
    for (const [k, v] of next) cells.set(k, v);

    // conditional rules follow the lines they cover
    const lo = (p) => (del ? (p < at ? p : p < at + cnt ? at : p - cnt) : (p >= at ? p + cnt : p));
    const hi = (p) => (del ? (p < at ? p : p < at + cnt ? at - 1 : p - cnt) : (p >= at ? p + cnt : p));
    for (let i = rules.length - 1; i >= 0; i--) {
      const q = rules[i];
      if (isRow) { q.r1 = lo(q.r1); q.r2 = hi(q.r2); } else { q.c1 = lo(q.c1); q.c2 = hi(q.c2); }
      if ((isRow ? q.r2 < q.r1 : q.c2 < q.c1)) rules.splice(i, 1);
    }

    extras = [];
    S.ar = S.fr = isRow ? Math.min(at, limit - 1) : S.ar;
    if (!isRow) S.ac = S.fc = Math.min(at, limit - 1);
    refresh();
    toast((del ? "Deleted " : "Inserted ") + cnt + (isRow ? " row" : " column") + (cnt === 1 ? "" : "s"));
  }

  // ---------- Selection & refresh ----------
  function refresh() {
    recordHistory();
    memo.clear();
    for (const fn of listeners) fn();
    if (document.activeElement !== nameBox) nameBox.value = ref(S.ar, S.ac);
    if (document.activeElement !== fbInput) fbInput.value = activeCell() ? activeCell().v : "";
    updateRibbon();
    requestDraw();
  }

  function moveFocus(dr, dc, extend) {
    if (!extend) extras = [];
    if (extend) {
      S.fr = clamp(S.fr + dr, 0, MAX_ROWS - 1);
      S.fc = clamp(S.fc + dc, 0, MAX_COLS - 1);
      ensureVisible(S.fr, S.fc);
    } else {
      S.ar = S.fr = clamp(S.ar + dr, 0, MAX_ROWS - 1);
      S.ac = S.fc = clamp(S.ac + dc, 0, MAX_COLS - 1);
      ensureVisible(S.ar, S.ac);
    }
    refresh();
  }

  // ---------- In-cell editor ----------
  function openEditor(initial) {
    if (sheetProtected) return toast("Sheet is protected. Unprotect it to edit.");
    const r = S.ar, c = S.ac;
    ensureVisible(r, c);
    const cell = getCell(r, c), s = (cell && cell.s) || {};
    editing = true;
    ed.style.display = "block";
    ed.style.left = HDR_W + c * COL_W + "px";
    ed.style.top = HDR_H + r * ROW_H + "px";
    ed.style.width = COL_W + "px";
    ed.style.height = ROW_H + "px";
    ed.style.font = `${s.italic ? "italic " : ""}${s.bold ? "bold " : ""}${Math.round((s.size || DEFAULT_SIZE) * 1.2)}px ${s.font || DEFAULT_FONT}, Arial, sans-serif`;
    ed.style.color = s.color || pal.text;
    ed.style.background = s.fill || pal.cell;
    ed.style.textAlign = s.ha || "left";
    ed.style.visibility = "visible";
    ed.value = initial !== undefined ? initial : (cell ? cell.v : "");
    fbInput.value = ed.value;
    ed.focus();
    ed.setSelectionRange(ed.value.length, ed.value.length);
    draw();
  }

  function commitEdit(dr, dc) {
    if (!editing) return;
    editing = false;
    const v = ed.value;
    ed.blur();
    ed.style.display = "none";
    setValue(S.ar, S.ac, v);
    if (dr || dc) moveFocus(dr, dc, false); else refresh();
  }

  function cancelEdit() {
    if (!editing) return;
    editing = false;
    ed.blur();
    ed.style.display = "none";
    refresh();
  }

  function positionEditor() {
    if (!editing) return;
    const x = HDR_W + S.ac * COL_W - wrap.scrollLeft;
    const y = HDR_H + S.ar * ROW_H - wrap.scrollTop;
    ed.style.visibility = x < HDR_W || y < HDR_H ? "hidden" : "visible";
  }

  ed.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); commitEdit(e.shiftKey ? -1 : 1, 0); }
    else if (e.key === "Tab") { e.preventDefault(); commitEdit(0, e.shiftKey ? -1 : 1); }
    else if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
  });
  ed.addEventListener("input", () => { fbInput.value = ed.value; });
  ed.addEventListener("blur", () => {
    if (editing && ed.style.display !== "none") commitEdit(0, 0);
  });

  // ---------- Mouse ----------
  function pos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function hit(e) {
    const { x, y } = pos(e);
    const sx = wrap.scrollLeft, sy = wrap.scrollTop;
    if (x < HDR_W && y < HDR_H) return { t: "corner" };
    if (y < HDR_H) return { t: "col", c: clamp(Math.floor((x + sx - HDR_W) / COL_W), 0, colCount - 1) };
    if (x < HDR_W) return { t: "row", r: clamp(Math.floor((y + sy - HDR_H) / ROW_H), 0, rowCount - 1) };
    return {
      t: "cell",
      r: clamp(Math.floor((y + sy - HDR_H) / ROW_H), 0, rowCount - 1),
      c: clamp(Math.floor((x + sx - HDR_W) / COL_W), 0, colCount - 1)
    };
  }

  canvas.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    if (editing) commitEdit(0, 0);
    const h = hit(e);

    if (e.ctrlKey && h.t === "cell") {
      const linked = getCell(h.r, h.c);
      if (linked && linked.link) { window.open(linked.link, "_blank", "noopener"); return; }
    }

    if (painter && h.t === "cell") {
      S.ar = S.fr = h.r; S.ac = S.fc = h.c;
      getOrCreate(h.r, h.c).s = { ...painter.s };
      painter = null;
      refresh();
      return;
    }

    if (e.ctrlKey) {
      if (!e.shiftKey) extras.push(range());
    } else {
      extras = [];
    }
    if (h.t === "corner") {
      S.ar = 0; S.ac = 0; S.fr = MAX_ROWS - 1; S.fc = MAX_COLS - 1;
    } else if (h.t === "col") {
      if (e.shiftKey) { S.fc = h.c; } else { S.ac = S.fc = h.c; S.ar = 0; }
      S.fr = rowCount - 1;
    } else if (h.t === "row") {
      if (e.shiftKey) { S.fr = h.r; } else { S.ar = S.fr = h.r; S.ac = 0; }
      S.fc = colCount - 1;
    } else {
      if (e.shiftKey) { S.fr = h.r; S.fc = h.c; }
      else { S.ar = S.fr = h.r; S.ac = S.fc = h.c; }
      dragging = true;
    }
    refresh();
  });

  canvas.addEventListener("dblclick", (e) => {
    const h = hit(e);
    if (h.t !== "cell") return;
    S.ar = S.fr = h.r; S.ac = S.fc = h.c;
    openEditor();
  });

  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const h = hit(e);
    if (h.t !== "cell") return;
    if (S.fr !== h.r || S.fc !== h.c) { S.fr = h.r; S.fc = h.c; refresh(); }
  });
  window.addEventListener("mouseup", () => { dragging = false; });

  // ---------- Keyboard ----------
  function selectAll() { S.ar = 0; S.ac = 0; S.fr = MAX_ROWS - 1; S.fc = MAX_COLS - 1; refresh(); }

  document.addEventListener("keydown", (e) => {
    if (editing || e.target === ed) return; // the cell editor handles its own keys
    const el = document.activeElement;
    if (el && (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA")) return;

    if (e.ctrlKey || e.metaKey) {
      const actions = {
        b: () => runCmd("bold"), i: () => runCmd("italic"), u: () => runCmd("underline"),
        c: () => copyRange(false), x: () => copyRange(true), v: () => paste(), a: () => selectAll(), d: () => fillDown(), f: () => findSelect(), z: () => undo(), y: () => redo()
      };
      const act = actions[e.key.toLowerCase()];
      if (act) { e.preventDefault(); act(); }
      return;
    }
    if (e.altKey) return;

    const arrows = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (arrows[e.key]) {
      e.preventDefault();
      const [dr, dc] = arrows[e.key];
      moveFocus(dr, dc, e.shiftKey);
      return;
    }
    switch (e.key) {
      case "Enter": e.preventDefault(); moveFocus(e.shiftKey ? -1 : 1, 0, false); return;
      case "Tab": e.preventDefault(); moveFocus(0, e.shiftKey ? -1 : 1, false); return;
      case "Delete": case "Backspace": e.preventDefault(); clearValues(); return;
      case "F2": e.preventDefault(); openEditor(); return;
      case "Escape": return;
    }
    if (e.key.length === 1) { e.preventDefault(); openEditor(e.key); }
  });

  fbInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      setValue(S.ar, S.ac, fbInput.value);
      fbInput.blur();
      if (e.key === "Enter") moveFocus(1, 0, false); else moveFocus(0, 1, false);
    } else if (e.key === "Escape") {
      fbInput.blur();
      refresh();
    }
  });

  nameBox.addEventListener("focus", () => nameBox.select());
  nameBox.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { nameBox.blur(); refresh(); return; }
    if (e.key !== "Enter") return;
    e.preventDefault();
    const m = nameBox.value.trim().toUpperCase().match(/^([A-Z]{1,3})(\d{1,7})$/);
    if (m) {
      let c = 0;
      for (const ch of m[1]) c = c * 26 + (ch.charCodeAt(0) - 64);
      const r = parseInt(m[2], 10) - 1, cc = c - 1;
      if (r >= 0 && r < MAX_ROWS && cc >= 0 && cc < MAX_COLS) {
        S.ar = S.fr = r; S.ac = S.fc = cc;
        ensureVisible(r, cc);
      }
    }
    nameBox.blur();
    refresh();
  });

  // ---------- Values & styles ----------
  function applyStyle(patch) {
    if (sheetProtected) return toast("Sheet is protected. Unprotect it to edit.");
    forTargets((r, c) => {
      const cell = getOrCreate(r, c);
      for (const k in patch) {
        if (patch[k] === null || patch[k] === undefined) delete cell.s[k];
        else cell.s[k] = patch[k];
      }
    });
    refresh();
  }

  function toggleStyle(prop) {
    const on = !!activeStyle()[prop];
    applyStyle({ [prop]: on ? null : true });
  }

  function clearValues() {
    if (sheetProtected) return toast("Sheet is protected. Unprotect it to edit.");
    forTargets((r, c) => { const cell = getCell(r, c); if (cell) cell.v = ""; });
    prune();
    refresh();
  }

  function clearAll() {
    if (sheetProtected) return toast("Sheet is protected. Unprotect it to edit.");
    forTargets((r, c) => cells.delete(key(r, c)));
    refresh();
  }

  function autoSum() {
    if (sheetProtected) return toast("Sheet is protected. Unprotect it to edit.");
    const R = range();
    const isCol = R.c1 === R.c2;
    const tr = isCol ? R.r2 + 1 : R.r1;
    const tc = isCol ? R.c1 : R.c2 + 1;
    if (tr >= MAX_ROWS || tc >= MAX_COLS) return toast("No room for the total");
    growTo(tr, tc);
    setValue(tr, tc, "=SUM(" + ref(R.r1, R.c1) + ":" + ref(R.r2, R.c2) + ")");
    extras = [];
    S.ar = S.fr = tr;
    S.ac = S.fc = tc;
    refresh();
  }

  // ---------- Clipboard ----------
  function copyRange(cut) {
    const R = range();
    const items = [];
    forRange(R, (r, c) => {
      const cell = getCell(r, c);
      if (cell) items.push({ dr: r - R.r1, dc: c - R.c1, v: cell.v, s: { ...cell.s } });
    });
    clip = { items, cut, R };
    toast(cut ? "Cut. Select a cell and press Paste" : "Copied. Select a cell and press Paste");
    refresh();
  }

  function paste() {
    if (sheetProtected) return toast("Sheet is protected. Unprotect it to edit.");
    if (!clip) return toast("Nothing to paste");
    if (clip.cut) forRange(clip.R, (r, c) => cells.delete(key(r, c)));
    const r0 = S.ar, c0 = S.ac;
    let maxR = r0, maxC = c0;
    for (const it of clip.items) {
      const r = r0 + it.dr, c = c0 + it.dc;
      if (r >= MAX_ROWS || c >= MAX_COLS) continue;
      const cell = getOrCreate(r, c);
      cell.v = clip.cut ? it.v : QE.shiftFormula(it.v, r0 - clip.R.r1, c0 - clip.R.c1);
      cell.s = { ...it.s };
      maxR = Math.max(maxR, r); maxC = Math.max(maxC, c);
    }
    growTo(maxR, maxC);
    if (clip.cut) clip = null;
    S.fr = maxR; S.fc = maxC;
    refresh();
  }

  // ---------- Ribbon ----------
  // Table: header row in green with bold text, banded rows below
  function formatAsTable() {
    const R = range();
    if (R.r1 === R.r2 && R.c1 === R.c2) return toast("Select a range first");
    forRange(R, (r, c) => {
      const cell = getOrCreate(r, c);
      const header = r === R.r1;
      cell.s.fill = header ? pal.accent : ((r - R.r1) % 2 ? "#ffffff" : "#e9f3ec");
      cell.s.color = header ? "#ffffff" : pal.text;
      if (header) cell.s.bold = true;
    });
    refresh();
    toast("Range formatted as table");
  }

  // Hyperlink: the typed text in the active cell becomes a link (Ctrl+click opens it)
  function insertHyperlink() {
    const url = window.prompt("Link address", "https://");
    if (!url || url.trim() === "https://") return;
    const link = url.trim();
    const cell = getOrCreate(S.ar, S.ac);
    if (!cell.v) cell.v = link;
    cell.link = link;
    cell.s.color = "#0563c1";
    cell.s.underline = true;
    refresh();
  }

  // Sort the selected rows by the active cell's column. Blanks always go last.
  function sortRange(asc) {
    if (sheetProtected) return toast("Sheet is protected. Unprotect it to edit.");
    const R = range();
    if (R.r1 === R.r2) return toast("Select at least two rows to sort");
    if ((R.r2 - R.r1 + 1) * (R.c2 - R.c1 + 1) > 200000) return toast("Select a smaller range to sort");
    const ki = S.ac - R.c1;
    const rows = [];
    for (let r = R.r1; r <= R.r2; r++) {
      const row = [];
      for (let c = R.c1; c <= R.c2; c++) {
        const cell = getCell(r, c);
        row.push(cell ? { v: cell.v, s: { ...cell.s }, link: cell.link, comment: cell.comment, dv: cellValue(r, c) } : null);
      }
      rows.push(row);
    }
    const isBlank = (cl) => !cl || cl.dv === null;
    rows.sort((a, b) => {
      const x = a[ki], y = b[ki];
      const xb = isBlank(x), yb = isBlank(y);
      if (xb && yb) return 0;
      if (xb) return 1;
      if (yb) return -1;
      const res = QE.compareValues(x.dv, y.dv);
      return asc ? res : -res;
    });
    rows.forEach((row, i) => {
      row.forEach((cl, j) => {
        const r = R.r1 + i, c = R.c1 + j;
        if (!cl) { cells.delete(key(r, c)); return; }
        const cell = getOrCreate(r, c);
        cell.v = cl.v;
        cell.s = cl.s;
        if (cl.link) cell.link = cl.link; else delete cell.link;
        if (cl.comment) cell.comment = cl.comment; else delete cell.comment;
      });
    });
    prune();
    refresh();
    toast(asc ? "Sorted A to Z" : "Sorted Z to A");
  }

  // Copies the top row of each selection down, shifting relative formula references
  function fillDown() {
    if (sheetProtected) return toast("Sheet is protected. Unprotect it to edit.");
    let count = 0;
    for (const R of [range(), ...extras]) {
      if (R.r2 === R.r1) continue;
      if ((R.r2 - R.r1 + 1) * (R.c2 - R.c1 + 1) > 200000) return toast("Select a smaller range to fill");
      for (let c = R.c1; c <= R.c2; c++) {
        const src = getCell(R.r1, c);
        for (let r = R.r1 + 1; r <= R.r2; r++) {
          const cell = getOrCreate(r, c);
          cell.v = src ? QE.shiftFormula(src.v, r - R.r1, 0) : "";
          cell.s = src ? { ...src.s } : {};
          count++;
        }
      }
    }
    if (!count) return toast("Select at least two rows. The top row is the source.");
    prune();
    refresh();
    toast("Filled down");
  }

  // Finds the next cell whose shown text contains the search text (wraps around)
  function findSelect() {
    const q = window.prompt("Find what:", "");
    if (q === null || q === "") return;
    const needle = q.toLowerCase();
    const list = [];
    for (const k of cells.keys()) list.push(k.split(",").map(Number));
    list.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const matches = list.filter(([r, c]) => {
      const cell = getCell(r, c);
      return displayText(cellValue(r, c), cell ? cell.s : {}).toLowerCase().includes(needle);
    });
    if (!matches.length) return toast("Not found");
    const next = matches.find(([r, c]) => r > S.ar || (r === S.ar && c > S.ac)) || matches[0];
    extras = [];
    S.ar = S.fr = next[0];
    S.ac = S.fc = next[1];
    ensureVisible(next[0], next[1]);
    refresh();
    toast(matches.length + " match(es) found");
  }

  // Keeps the first of each identical row (compared on computed values) inside the selection
  function removeDuplicates() {
    if (sheetProtected) return toast("Sheet is protected. Unprotect it to edit.");
    const R = range();
    if (R.r1 === R.r2) return toast("Select at least two rows");
    if ((R.r2 - R.r1 + 1) * (R.c2 - R.c1 + 1) > 200000) return toast("Select a smaller range");
    const seen = new Set();
    const keepRows = [];
    for (let r = R.r1; r <= R.r2; r++) {
      const vals = [];
      for (let c = R.c1; c <= R.c2; c++) {
        const v = cellValue(r, c);
        vals.push(QE.isError(v) ? "E:" + v.code : v);
      }
      const sig = JSON.stringify(vals);
      if (seen.has(sig)) continue;
      seen.add(sig);
      keepRows.push(r);
    }
    const removed = R.r2 - R.r1 + 1 - keepRows.length;
    if (removed === 0) return toast("No duplicate rows found");
    const snap = keepRows.map((r) => {
      const row = [];
      for (let c = R.c1; c <= R.c2; c++) {
        const cl = getCell(r, c);
        row.push(cl ? { v: cl.v, s: { ...cl.s }, link: cl.link, comment: cl.comment } : null);
      }
      return row;
    });
    forRange(R, (r, c) => cells.delete(key(r, c)));
    snap.forEach((row, i) => {
      row.forEach((cl, j) => {
        if (!cl) return;
        const cell = getOrCreate(R.r1 + i, R.c1 + j);
        cell.v = cl.v;
        cell.s = cl.s;
        if (cl.link) cell.link = cl.link;
        if (cl.comment) cell.comment = cl.comment;
      });
    });
    prune();
    refresh();
    toast(removed + " duplicate row(s) removed");
  }

  // Review state
  const reviewOpt = { showAll: false };
  let sheetProtected = false;

  function addComment() {
    const cell = getOrCreate(S.ar, S.ac);
    const text = window.prompt("Comment", cell.comment || "");
    if (text === null) { prune(); return refresh(); }
    if (!text.trim()) { delete cell.comment; delete cell.showComment; prune(); return refresh(); }
    cell.comment = text.trim();
    refresh();
    toast("Comment added");
  }

  function deleteComment() {
    const cell = getCell(S.ar, S.ac);
    if (!cell || !cell.comment) return toast("No comment in this cell");
    delete cell.comment;
    delete cell.showComment;
    prune();
    refresh();
  }

  function toggleCellComment() {
    const cell = getCell(S.ar, S.ac);
    if (!cell || !cell.comment) return toast("No comment in this cell");
    cell.showComment = !cell.showComment;
    refresh();
  }

  // dir = 1 for next, -1 for previous (wraps around)
  function jumpComment(dir) {
    const list = [];
    for (const [k, cell] of cells) {
      if (cell.comment) list.push(k.split(",").map(Number));
    }
    if (!list.length) return toast("No comments in this sheet");
    list.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let target;
    if (dir > 0) {
      target = list.find(([r, c]) => r > S.ar || (r === S.ar && c > S.ac)) || list[0];
    } else {
      target = [...list].reverse().find(([r, c]) => r < S.ar || (r === S.ar && c < S.ac)) || list[list.length - 1];
    }
    S.ar = S.fr = target[0];
    S.ac = S.fc = target[1];
    ensureVisible(S.ar, S.ac);
    refresh();
  }

  // Sheet view options (used by draw)
  const sheetOpt = { gridView: true, gridPrint: false, headingsView: true, headingsPrint: false, formulaBar: true, showFormulas: false };

  function renderRibbon(tab) {
    ribbon.innerHTML = window.QuadraUI ? window.QuadraUI.ribbonHtml(tab) : "";
    updateRibbon();
  }

  function updateRibbon() {
    const st = activeStyle();
    document.querySelectorAll("[data-tgl]").forEach((b) => {
      const k = b.dataset.tgl;
      b.classList.toggle("on", k === "painter" ? !!painter : !!st[k]);
    });
    document.querySelectorAll("[data-cmd][data-val]").forEach((b) => {
      const k = b.dataset.cmd;
      const cur = k === "ha" ? (st.ha || "") : k === "va" ? (st.va || "bottom") : k === "nf" ? (st.nf || "general") : null;
      if (cur !== null) b.classList.toggle("on", cur === b.dataset.val);
    });
    document.querySelectorAll('[data-cmd="sheetOpt"]').forEach((b) => {
      b.classList.toggle("on", !!sheetOpt[b.dataset.val]);
    });
    document.querySelectorAll('[data-tgl-review="showAll"]').forEach((b) => b.classList.toggle("on", reviewOpt.showAll));
    document.querySelectorAll('[data-tgl-review="protect"]').forEach((b) => b.classList.toggle("on", sheetProtected));
    const ff = document.getElementById("fontFamily");
    if (ff) ff.value = st.font || DEFAULT_FONT;
    const fs = document.getElementById("fontSize");
    if (fs) fs.value = String(st.size || DEFAULT_SIZE);
    const nf = document.getElementById("numFmt");
    if (nf) nf.value = st.nf || "general";
  }

  function pickColor(target, current) {
    pendingColor = target;
    colorPicker.value = /^#[0-9a-f]{6}$/i.test(current || "") ? current : (target === "fill" ? "#ffff00" : "#ff0000");
    colorPicker.click();
  }

  colorPicker.addEventListener("change", () => {
    if (pendingColor) applyStyle({ [pendingColor]: colorPicker.value });
    pendingColor = null;
  });

  function runCmd(cmd, val) {
    try {
      return runCmdUnsafe(cmd, val);
    } catch (e) {
      console.error(e);
      toast("This action could not be completed.");
    }
  }

  function runCmdUnsafe(cmd, val) {
    const st = activeStyle();
    switch (cmd) {
      case "paste": return paste();
      case "cut": return copyRange(true);
      case "copy": return copyRange(false);
      case "painter":
        painter = { s: { ...st } };
        toast("Click a cell to apply its format");
        return refresh();
      case "bold": case "italic": case "underline": case "wrap":
        return toggleStyle(cmd);
      case "sizeUp": return applyStyle({ size: clamp((st.size || DEFAULT_SIZE) + 1, 1, 409) });
      case "sizeDown": return applyStyle({ size: clamp((st.size || DEFAULT_SIZE) - 1, 1, 409) });
      case "size": return applyStyle({ size: +val });
      case "font": return applyStyle({ font: val });
      case "fill": return pickColor("fill", st.fill);
      case "fontColor": return pickColor("color", st.color);
      case "ha": case "va": return applyStyle({ [cmd]: val });
      case "merge":
        applyStyle({ ha: "center" });
        return toast("Merge & Center: content centered (cell merging coming later)");
      case "nf": return applyStyle({ nf: val, dec: null });
      case "decUp": case "decDown": {
        const cur = st.dec ?? (st.nf === "percent" ? 0 : 2);
        return applyStyle({ dec: clamp(cur + (cmd === "decUp" ? 1 : -1), 0, 10) });
      }
      case "sheetOpt":
        sheetOpt[val] = !sheetOpt[val];
        if (val === "formulaBar") {
          document.querySelector(".formula-bar").style.display = sheetOpt.formulaBar ? "" : "none";
          resize();
        }
        return refresh();
      case "newComment": return addComment();
      case "deleteComment": return deleteComment();
      case "prevComment": return jumpComment(-1);
      case "nextComment": return jumpComment(1);
      case "showHideComment": return toggleCellComment();
      case "showAllComments":
        reviewOpt.showAll = !reviewOpt.showAll;
        return refresh();
      case "protectSheet":
        sheetProtected = !sheetProtected;
        toast(sheetProtected ? "Sheet protected" : "Sheet unprotected");
        return refresh();
      case "showFormulas":
        sheetOpt.showFormulas = !sheetOpt.showFormulas;
        return refresh();
      case "calcNow":
      case "calcSheet":
        refresh();
        return toast("Formulas are always up to date");
      case "undo": return undo();
      case "redo": return redo();
      case "fillDown": return fillDown();
      case "find": return findSelect();
      case "removeDuplicates": return removeDuplicates();
      case "sortAsc": return sortRange(true);
      case "sortDesc": return sortRange(false);
      case "table": return formatAsTable();
      case "hyperlink": return insertHyperlink();
      case "autoSum": return autoSum();
      case "clearAll": return clearAll();
      default:
        if (window.QuadraUI && window.QuadraUI.command(cmd, val)) return;
        return toast("Coming soon: " + cmd);
    }
  }

  ribbon.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-cmd]");
    if (b) runCmd(b.dataset.cmd, b.dataset.val);
  });
  ribbon.addEventListener("change", (e) => {
    const s = e.target.closest("select[data-cmd]");
    if (s) runCmd(s.dataset.cmd, s.value);
  });

  // Tabs
  document.querySelectorAll(".tab").forEach((t) => {
    t.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
      t.classList.add("active");
      renderRibbon(t.dataset.tab);
    });
  });

  // ---------- Init ----------
  function resize() {
    const W = wrap.clientWidth, H = wrap.clientHeight;
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    growIfNeeded();
    draw();
  }

  wrap.addEventListener("scroll", () => {
    growIfNeeded();
    positionEditor();
    requestDraw();
  });
  window.addEventListener("resize", resize);

  window.addEventListener("error", (e) => {
    console.error(e.error || e.message);
    toast("Unexpected error. The sheet is still usable.");
  });

  updateSizer();
  window.QuadraCore = {
    cells, sel: S, range, getCell, getOrCreate, setValue, cellValue, displayText,
    refresh, toast, applyStyle, forTargets, ensureVisible, sheetOpt, reviewOpt, pal,
    openEditor, run: runCmd, clearAll, clearValues, copyRange, paste,
    getExtras: () => extras,
    isProtected: () => sheetProtected,
    setProtected: (v) => { sheetProtected = !!v; refresh(); },
    setPalette: (p) => { Object.assign(pal, p); requestDraw(); },
    onChange: (fn) => { listeners.push(fn); },
    serialize: snapshot,
    load: (json) => {
      const o = parseSnap(json);
      cells.clear();
      for (const [k, v] of o.c) cells.set(k, v);
      rules.length = 0;
      rules.push(...o.r);
      lastSnap = snapshot();
      undoStack.length = 0;
      redoStack.length = 0;
      refresh();
    },
    clearSheet: () => {
      cells.clear();
      rules.length = 0;
      extras = [];
      S.ar = S.ac = S.fr = S.fc = 0;
      refresh();
    },
    undo, redo, requestDraw, relayout: resize,
    addRule, clearRules, editLines, ruleFor, rules
  };

  renderRibbon("Home");
  resize();
  refresh();
  if (window.QuadraUI && window.QuadraUI.init) window.QuadraUI.init(window.QuadraCore);
})();
