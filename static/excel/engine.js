/*
 * Quadra Office - formula engine
 * Pure JavaScript with no DOM access, so it can be tested in Node.js.
 *
 * Public API (window.QEngine):
 *   parseLiteral(text)              -> number | boolean | string | null
 *   computeRaw(raw, env)            -> computed value of a raw cell text (formula or literal)
 *   evaluateFormula(src, env)       -> computed value of a formula WITHOUT the leading "="
 *   shiftFormula(raw, dr, dc)       -> formula with relative references moved by dr rows and dc columns
 *   compareValues(a, b)             -> -1 | 0 | 1 using Excel ordering (numbers < text < booleans)
 *   isError(v), CellError, ERR      -> error values such as #DIV/0!
 *
 * env must provide:
 *   cell(row, col)  -> computed value of that cell (number, string, boolean, null or CellError)
 *   maxRows, maxCols
 */
(function (root) {
  "use strict";

  const ERR = {
    DIV0: "#DIV/0!", VALUE: "#VALUE!", REF: "#REF!", NAME: "#NAME?",
    NUM: "#NUM!", NA: "#N/A", CIRC: "#CIRC!"
  };

  class CellError {
    constructor(code) { this.code = code; }
    toString() { return this.code; }
  }
  const err = (code) => new CellError(code);
  const isError = (v) => v instanceof CellError;

  class RangeVal {
    constructor(values) { this.values = values; }
  }

  const MAX_RANGE_CELLS = 200000;
  const REF_RE = /^(\$?)([A-Za-z]{1,3})(\$?)(\d+)$/;
  const NUM_RE = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i;
  const WORD_RE = /^[A-Za-z_$][A-Za-z0-9_.$]*/;
  const ERRLIT_RE = /^#(REF!|DIV\/0!|VALUE!|NAME\?|NUM!|N\/A)/i;
  const OPS2 = ["<=", ">=", "<>"];
  const OPS1 = "+-*/^&=<>():,%";
  const PLAIN_NUM_RE = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;

  function colToIndex(letters) {
    let n = 0;
    for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
  }

  function indexToCol(c) {
    let s = "", n = c;
    do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
    return s;
  }

  // Plain cell text -> value. Blank -> null, numbers -> number, TRUE/FALSE -> boolean, else text.
  function parseLiteral(text) {
    if (text === null || text === undefined) return null;
    const s = String(text);
    const t = s.trim();
    if (t === "") return null;
    const up = t.toUpperCase();
    if (up === "TRUE") return true;
    if (up === "FALSE") return false;
    if (PLAIN_NUM_RE.test(t)) return Number(t);
    return s;
  }

  // ---------- Tokenizer ----------
  function tokenize(src) {
    const out = [];
    let i = 0;
    while (i < src.length) {
      const ch = src[i];
      if (/\s/.test(ch)) { i++; continue; }
      const rest = src.slice(i);

      if (ch === '"') {
        let j = i + 1, s = "";
        for (;;) {
          if (j >= src.length) throw new SyntaxError("unterminated string");
          if (src[j] === '"') {
            if (src[j + 1] === '"') { s += '"'; j += 2; continue; }
            break;
          }
          s += src[j++];
        }
        out.push({ t: "str", v: s, start: i, end: j + 1 });
        i = j + 1;
        continue;
      }

      const eh = ERRLIT_RE.exec(rest);
      if (eh) {
        out.push({ t: "errlit", v: eh[0].toUpperCase(), start: i, end: i + eh[0].length });
        i += eh[0].length;
        continue;
      }

      const two = rest.slice(0, 2);
      if (OPS2.includes(two)) { out.push({ t: "op", v: two, start: i, end: i + 2 }); i += 2; continue; }
      if (OPS1.includes(ch)) { out.push({ t: "op", v: ch, start: i, end: i + 1 }); i++; continue; }

      let m = NUM_RE.exec(rest);
      if (m) {
        out.push({ t: "num", v: Number(m[0]), start: i, end: i + m[0].length });
        i += m[0].length;
        continue;
      }

      m = WORD_RE.exec(rest);
      if (m) {
        const w = m[0];
        const start = i;
        i += w.length;
        if (src[i] === "(") { out.push({ t: "func", v: w.toUpperCase(), start, end: i }); continue; }
        const rm = REF_RE.exec(w);
        if (rm) {
          out.push({
            t: "ref",
            v: { col: colToIndex(rm[2]), row: parseInt(rm[4], 10) - 1, absC: rm[1] === "$", absR: rm[3] === "$" },
            start, end: i
          });
          continue;
        }
        const up = w.toUpperCase();
        if (up === "TRUE" || up === "FALSE") { out.push({ t: "bool", v: up === "TRUE", start, end: i }); continue; }
        out.push({ t: "name", v: w, start, end: i });
        continue;
      }

      throw new SyntaxError("unexpected character " + ch);
    }
    return out;
  }

  // ---------- Parser (recursive descent, Excel precedence) ----------
  // comparison < concat(&) < add < mul < power(^) < unary(-,+) < percent < primary
  function parse(tokens) {
    if (tokens.length === 0) throw new SyntaxError("empty formula");
    let p = 0;
    const isOp = (v) => p < tokens.length && tokens[p].t === "op" && tokens[p].v === v;
    const expectOp = (v) => {
      if (!isOp(v)) throw new SyntaxError("expected " + v);
      p++;
    };

    function binary(sub, ops) {
      let left = sub();
      while (p < tokens.length && tokens[p].t === "op" && ops.includes(tokens[p].v)) {
        const op = tokens[p++].v;
        left = { type: "bin", op, left, right: sub() };
      }
      return left;
    }

    function parseCompare() { return binary(parseConcat, ["=", "<>", "<", ">", "<=", ">="]); }
    function parseConcat() { return binary(parseAdd, ["&"]); }
    function parseAdd() { return binary(parseMul, ["+", "-"]); }
    function parseMul() { return binary(parsePow, ["*", "/"]); }
    function parsePow() { return binary(parseUnary, ["^"]); }

    function parseUnary() {
      if (isOp("-") || isOp("+")) {
        const op = tokens[p++].v;
        return { type: "unary", op, arg: parseUnary() };
      }
      return parsePostfix();
    }

    function parsePostfix() {
      let e = parsePrimary();
      while (isOp("%")) { p++; e = { type: "pct", arg: e }; }
      return e;
    }

    function parsePrimary() {
      const t = tokens[p];
      if (!t) throw new SyntaxError("unexpected end of formula");
      if (t.t === "num" || t.t === "str" || t.t === "bool") { p++; return { type: "lit", v: t.v }; }
      if (t.t === "errlit") { p++; return { type: "err", code: t.v }; }
      if (t.t === "name") { p++; return { type: "err", code: ERR.NAME }; }
      if (t.t === "ref") {
        p++;
        if (isOp(":")) {
          p++;
          const b = tokens[p++];
          if (!b || b.t !== "ref") throw new SyntaxError("bad range");
          return { type: "range", a: t.v, b: b.v };
        }
        return { type: "ref", col: t.v.col, row: t.v.row, absC: t.v.absC, absR: t.v.absR };
      }
      if (t.t === "func") {
        p++;
        expectOp("(");
        const args = [];
        if (!isOp(")")) {
          for (;;) {
            args.push(parseCompare());
            if (isOp(",")) { p++; continue; }
            break;
          }
        }
        expectOp(")");
        return { type: "call", name: t.v, args };
      }
      if (isOp("(")) {
        p++;
        const e = parseCompare();
        expectOp(")");
        return e;
      }
      throw new SyntaxError("unexpected token");
    }

    const ast = parseCompare();
    if (p !== tokens.length) throw new SyntaxError("unexpected trailing input");
    return ast;
  }

  // ---------- Value helpers ----------
  function toNumber(v) {
    if (isError(v)) return v;
    if (v === null) return 0;
    if (typeof v === "number") return v;
    if (typeof v === "boolean") return v ? 1 : 0;
    const t = String(v).trim();
    if (PLAIN_NUM_RE.test(t)) return Number(t);
    return err(ERR.VALUE);
  }

  function numToText(n) {
    if (Number.isInteger(n)) return String(n);
    return String(Number(n.toPrecision(15)));
  }

  function toText(v) {
    if (isError(v)) return v;
    if (v === null) return "";
    if (typeof v === "number") return numToText(v);
    if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
    return String(v);
  }

  function toBool(v) {
    if (isError(v)) return v;
    if (v === null) return false;
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v !== 0;
    const u = String(v).toUpperCase();
    if (u === "TRUE") return true;
    if (u === "FALSE") return false;
    return err(ERR.VALUE);
  }

  function scalarOf(v) {
    if (v instanceof RangeVal) return v.values.length === 1 ? v.values[0] : err(ERR.VALUE);
    return v;
  }

  function rank(v) {
    if (typeof v === "number") return 0;
    if (typeof v === "string") return 1;
    return 2;
  }

  // Excel ordering. Blank behaves as 0 / "" / FALSE depending on the other side.
  function compareValues(a, b) {
    if (a === null && b === null) return 0;
    if (a === null) a = typeof b === "number" ? 0 : typeof b === "boolean" ? false : "";
    if (b === null) b = typeof a === "number" ? 0 : typeof a === "boolean" ? false : "";
    const ra = rank(a), rb = rank(b);
    if (ra !== rb) return ra < rb ? -1 : 1;
    if (ra === 0) return a < b ? -1 : a > b ? 1 : 0;
    if (ra === 1) {
      const x = a.toLowerCase(), y = b.toLowerCase();
      return x < y ? -1 : x > y ? 1 : 0;
    }
    return a === b ? 0 : (a ? 1 : -1);
  }

  function arith(op, a, b) {
    if (isError(a)) return a;
    if (isError(b)) return b;
    const x = toNumber(a);
    if (isError(x)) return x;
    const y = toNumber(b);
    if (isError(y)) return y;
    let r;
    switch (op) {
      case "+": r = x + y; break;
      case "-": r = x - y; break;
      case "*": r = x * y; break;
      case "/":
        if (y === 0) return err(ERR.DIV0);
        r = x / y;
        break;
      case "^": r = Math.pow(x, y); break;
      default: return err(ERR.VALUE);
    }
    return Number.isFinite(r) ? r : err(ERR.NUM);
  }

  function roundHalfAway(n, d) {
    const sign = n < 0 ? -1 : 1;
    const r = Math.round(Number(Math.abs(n) + "e" + d));
    const out = Number(r + "e" + (-d));
    return Number.isFinite(out) ? sign * out : err(ERR.NUM);
  }

  // ---------- Evaluator ----------
  function evaluate(node, env) {
    switch (node.type) {
      case "lit": return node.v;
      case "err": return err(node.code);
      case "ref": {
        if (node.row < 0 || node.col < 0 || node.row >= env.maxRows || node.col >= env.maxCols) return err(ERR.REF);
        return env.cell(node.row, node.col);
      }
      case "range": {
        const r1 = Math.min(node.a.row, node.b.row), r2 = Math.max(node.a.row, node.b.row);
        const c1 = Math.min(node.a.col, node.b.col), c2 = Math.max(node.a.col, node.b.col);
        if (r1 < 0 || c1 < 0 || r2 >= env.maxRows || c2 >= env.maxCols) return err(ERR.REF);
        if ((r2 - r1 + 1) * (c2 - c1 + 1) > MAX_RANGE_CELLS) return err(ERR.VALUE);
        const values = [];
        for (let r = r1; r <= r2; r++) {
          for (let c = c1; c <= c2; c++) values.push(env.cell(r, c));
        }
        return new RangeVal(values);
      }
      case "unary": {
        const n = toNumber(scalarOf(evaluate(node.arg, env)));
        if (isError(n)) return n;
        return node.op === "-" ? -n : n;
      }
      case "pct": {
        const n = toNumber(scalarOf(evaluate(node.arg, env)));
        return isError(n) ? n : n / 100;
      }
      case "bin": {
        const a = scalarOf(evaluate(node.left, env));
        const b = scalarOf(evaluate(node.right, env));
        switch (node.op) {
          case "+": case "-": case "*": case "/": case "^":
            return arith(node.op, a, b);
          case "&": {
            const x = toText(a);
            if (isError(x)) return x;
            const y = toText(b);
            if (isError(y)) return y;
            return x + y;
          }
          default: {
            if (isError(a)) return a;
            if (isError(b)) return b;
            const c = compareValues(a, b);
            switch (node.op) {
              case "=": return c === 0;
              case "<>": return c !== 0;
              case "<": return c < 0;
              case ">": return c > 0;
              case "<=": return c <= 0;
              case ">=": return c >= 0;
              default: return err(ERR.VALUE);
            }
          }
        }
      }
      case "call": return callFunction(node.name, node.args, env);
      default: return err(ERR.VALUE);
    }
  }

  // Every argument flattened into one list. Errors are returned immediately.
  function flatArgs(args, env) {
    const out = [];
    for (const a of args) {
      const v = evaluate(a, env);
      if (v instanceof RangeVal) {
        for (const x of v.values) {
          if (isError(x)) return x;
          out.push(x);
        }
      } else {
        if (isError(v)) return v;
        out.push(v);
      }
    }
    return out;
  }

  // Numbers for SUM/AVERAGE/MIN/MAX. Inside ranges only real numbers count (Excel rule).
  // Typed-in arguments are converted to numbers.
  function numbersIn(args, env) {
    const out = [];
    for (const a of args) {
      const v = evaluate(a, env);
      if (v instanceof RangeVal) {
        for (const x of v.values) {
          if (isError(x)) return x;
          if (typeof x === "number") out.push(x);
        }
      } else {
        if (isError(v)) return v;
        if (v === null) continue;
        const n = toNumber(v);
        if (isError(n)) return n;
        out.push(n);
      }
    }
    return out;
  }

  function callFunction(name, args, env) {
    const n = args.length;
    const argc = (min, max) => n >= min && n <= max;
    const one = (i) => scalarOf(evaluate(args[i], env));

    switch (name) {
      case "SUM": {
        const ns = numbersIn(args, env);
        if (isError(ns)) return ns;
        let s = 0;
        for (const x of ns) s += x;
        return s;
      }
      case "AVERAGE": {
        const ns = numbersIn(args, env);
        if (isError(ns)) return ns;
        if (ns.length === 0) return err(ERR.DIV0);
        let s = 0;
        for (const x of ns) s += x;
        return s / ns.length;
      }
      case "MIN":
      case "MAX": {
        const ns = numbersIn(args, env);
        if (isError(ns)) return ns;
        if (ns.length === 0) return 0;
        let best = ns[0];
        for (const x of ns) {
          if (name === "MIN" ? x < best : x > best) best = x;
        }
        return best;
      }
      case "COUNT": {
        let c = 0;
        for (const a of args) {
          const v = evaluate(a, env);
          if (v instanceof RangeVal) {
            for (const x of v.values) if (typeof x === "number") c++;
          } else if (typeof v === "number") c++;
        }
        return c;
      }
      case "COUNTA": {
        let c = 0;
        for (const a of args) {
          const v = evaluate(a, env);
          if (v instanceof RangeVal) {
            for (const x of v.values) if (x !== null) c++;
          } else if (v !== null) c++;
        }
        return c;
      }
      case "IF": {
        if (!argc(2, 3)) return err(ERR.VALUE);
        const c = toBool(one(0));
        if (isError(c)) return c;
        if (c) return scalarOf(evaluate(args[1], env));
        return n === 3 ? scalarOf(evaluate(args[2], env)) : false;
      }
      case "IFERROR": {
        if (!argc(2, 2)) return err(ERR.VALUE);
        const v = one(0);
        return isError(v) ? scalarOf(evaluate(args[1], env)) : v;
      }
      case "AND":
      case "OR": {
        if (!argc(1, 255)) return err(ERR.VALUE);
        const vals = flatArgs(args, env);
        if (isError(vals)) return vals;
        const bs = [];
        for (const x of vals) {
          if (x === null || typeof x === "string") continue;
          bs.push(toBool(x));
        }
        if (bs.length === 0) return err(ERR.VALUE);
        return name === "AND" ? bs.every((b) => b === true) : bs.some((b) => b === true);
      }
      case "NOT": {
        if (!argc(1, 1)) return err(ERR.VALUE);
        const b = toBool(one(0));
        return isError(b) ? b : !b;
      }
      case "ROUND": {
        if (!argc(2, 2)) return err(ERR.VALUE);
        const x = toNumber(one(0));
        if (isError(x)) return x;
        const d = toNumber(one(1));
        if (isError(d)) return d;
        return roundHalfAway(x, Math.trunc(d));
      }
      case "ABS": {
        if (!argc(1, 1)) return err(ERR.VALUE);
        const x = toNumber(one(0));
        return isError(x) ? x : Math.abs(x);
      }
      case "INT": {
        if (!argc(1, 1)) return err(ERR.VALUE);
        const x = toNumber(one(0));
        return isError(x) ? x : Math.floor(x);
      }
      case "SQRT": {
        if (!argc(1, 1)) return err(ERR.VALUE);
        const x = toNumber(one(0));
        if (isError(x)) return x;
        return x < 0 ? err(ERR.NUM) : Math.sqrt(x);
      }
      case "POWER": {
        if (!argc(2, 2)) return err(ERR.VALUE);
        return arith("^", one(0), one(1));
      }
      case "MOD": {
        if (!argc(2, 2)) return err(ERR.VALUE);
        const x = toNumber(one(0));
        if (isError(x)) return x;
        const y = toNumber(one(1));
        if (isError(y)) return y;
        if (y === 0) return err(ERR.DIV0);
        return x - y * Math.floor(x / y);
      }
      case "PI": {
        if (!argc(0, 0)) return err(ERR.VALUE);
        return Math.PI;
      }
      case "CONCATENATE":
      case "CONCAT": {
        if (!argc(1, 255)) return err(ERR.VALUE);
        const vals = flatArgs(args, env);
        if (isError(vals)) return vals;
        let s = "";
        for (const x of vals) {
          const t = toText(x);
          if (isError(t)) return t;
          s += t;
        }
        return s;
      }
      case "LEN": {
        if (!argc(1, 1)) return err(ERR.VALUE);
        const t = toText(one(0));
        return isError(t) ? t : t.length;
      }
      case "UPPER":
      case "LOWER":
      case "TRIM": {
        if (!argc(1, 1)) return err(ERR.VALUE);
        const t = toText(one(0));
        if (isError(t)) return t;
        if (name === "UPPER") return t.toUpperCase();
        if (name === "LOWER") return t.toLowerCase();
        return t.trim().replace(/\s+/g, " ");
      }
      case "LEFT":
      case "RIGHT": {
        if (!argc(1, 2)) return err(ERR.VALUE);
        const t = toText(one(0));
        if (isError(t)) return t;
        const k = n === 2 ? toNumber(one(1)) : 1;
        if (isError(k)) return k;
        if (k < 0) return err(ERR.VALUE);
        const cnt = Math.floor(k);
        if (name === "LEFT") return t.slice(0, cnt);
        return cnt === 0 ? "" : t.slice(-cnt);
      }
      case "MID": {
        if (!argc(3, 3)) return err(ERR.VALUE);
        const t = toText(one(0));
        if (isError(t)) return t;
        const start = toNumber(one(1));
        if (isError(start)) return start;
        const len = toNumber(one(2));
        if (isError(len)) return len;
        if (start < 1 || len < 0) return err(ERR.VALUE);
        return t.substr(Math.floor(start) - 1, Math.floor(len));
      }
      default:
        return err(ERR.NAME);
    }
  }

  // Rewrites every reference in a formula. mapRef({col,row,absC,absR}) returns
  // {col,row} for the new place, or null when the referenced cell was deleted (-> #REF!).
  function remapFormula(raw, mapRef) {
    if (typeof raw !== "string" || raw.length < 2 || raw[0] !== "=") return raw;
    const body = raw.slice(1);
    let tokens;
    try { tokens = tokenize(body); } catch (e) { return raw; }
    let out = body;
    for (let i = tokens.length - 1; i >= 0; i--) {
      const t = tokens[i];
      if (t.t !== "ref") continue;
      const v = t.v;
      const m = mapRef(v);
      const text = m
        ? (v.absC ? "$" : "") + indexToCol(m.col) + (v.absR ? "$" : "") + (m.row + 1)
        : ERR.REF;
      out = out.slice(0, t.start) + text + out.slice(t.end);
    }
    return "=" + out;
  }

  // ---------- Public functions ----------
  function evaluateFormula(src, env) {
    try {
      const ast = parse(tokenize(src));
      const v = scalarOf(evaluate(ast, env));
      if (typeof v === "number" && !Number.isFinite(v)) return err(ERR.NUM);
      return v;
    } catch (e) {
      if (e instanceof SyntaxError) return err(ERR.VALUE);
      throw e;
    }
  }

  function computeRaw(raw, env) {
    if (typeof raw === "string" && raw.length > 1 && raw[0] === "=") {
      return evaluateFormula(raw.slice(1), env);
    }
    return parseLiteral(raw);
  }

  // Copy a formula to another place: relative refs move, $ refs stay.
  function shiftFormula(raw, dr, dc, maxRows = 1048576, maxCols = 16384) {
    if (typeof raw !== "string" || raw.length < 2 || raw[0] !== "=") return raw;
    const body = raw.slice(1);
    let tokens;
    try { tokens = tokenize(body); } catch (e) { return raw; }
    let out = body;
    for (let i = tokens.length - 1; i >= 0; i--) {
      const t = tokens[i];
      if (t.t !== "ref") continue;
      const v = t.v;
      const col = v.absC ? v.col : v.col + dc;
      const row = v.absR ? v.row : v.row + dr;
      let text;
      if (col < 0 || row < 0 || col >= maxCols || row >= maxRows) {
        text = ERR.REF;
      } else {
        text = (v.absC ? "$" : "") + indexToCol(col) + (v.absR ? "$" : "") + (row + 1);
      }
      out = out.slice(0, t.start) + text + out.slice(t.end);
    }
    return "=" + out;
  }

  const QEngine = {
    ERR,
    CellError,
    isError,
    parseLiteral,
    computeRaw,
    evaluateFormula,
    shiftFormula,
    remapFormula,
    compareValues,
    colToIndex,
    indexToCol,
    tokenize,
    parse
  };

  root.QEngine = QEngine;
  if (typeof module !== "undefined" && module.exports) module.exports = QEngine;
})(typeof globalThis !== "undefined" ? globalThis : window);
