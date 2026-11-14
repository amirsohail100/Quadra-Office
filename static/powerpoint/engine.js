/* Quadra PowerPoint - engine.js
   DOM-free presentation model. Works in the browser (window.QEngine) and in Node (require). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const W = 1280; // slide width in slide units (1 unit = 1 css px at 100% zoom)
  const SIZES = {
    '16:9': { w: W, h: 720, label: 'Widescreen (16:9)', page: '13.333in 7.5in' },
    '4:3': { w: W, h: 960, label: 'Standard (4:3)', page: '13.333in 10in' },
  };
  const LAYOUTS = [
    { id: 'title', name: 'Title Slide' },
    { id: 'titleContent', name: 'Title and Content' },
    { id: 'section', name: 'Section Header' },
    { id: 'blank', name: 'Blank' },
  ];
  const PH_PROMPT = { title: 'Click to add title', subtitle: 'Click to add subtitle', body: 'Click to add text', text: 'Click to add text' };
  const FONTS = ['Segoe UI', 'Arial', 'Calibri', 'Georgia', 'Times New Roman', 'Trebuchet MS', 'Verdana', 'Courier New', 'Impact'];
  const SIZES_PT = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 54, 60, 72, 80, 96];
  const SANS = '"Segoe UI", system-ui, -apple-system, Arial, sans-serif';
  const SERIF = 'Georgia, "Times New Roman", serif';

  const THEMES = [
    { id: 'parchment', name: 'Parchment', bg: '#efe9e2', fg: '#3a2f28', accent: '#9c6b4e', heading: SERIF, body: SERIF, swatch: ['#9c6b4e', '#c9a98c', '#7d8f69', '#b5b09a'] },
    { id: 'plain', name: 'Plain', bg: '#ffffff', fg: '#1b1b1b', accent: '#0f6cbd', heading: SANS, body: SANS, swatch: ['#0f6cbd', '#107c10', '#d83b01', '#8764b8'] },
    { id: 'prism', name: 'Prism', bg: '#ffffff', fg: '#1b1b1b', accent: '#e3008c', heading: '"Trebuchet MS", ' + SANS, body: '"Trebuchet MS", ' + SANS, swatch: ['#e3008c', '#00b7c3', '#ffb900', '#7a7574'] },
    { id: 'midnight', name: 'Midnight', bg: '#0b0b0b', fg: '#f2f2f2', accent: '#4aa3ff', heading: SANS, body: SANS, swatch: ['#4aa3ff', '#9be564', '#ff8c5a', '#c3a6ff'] },
    { id: 'slate', name: 'Slate', bg: '#0d1514', fg: '#e8f1ef', accent: '#2fb59a', heading: SANS, body: SANS, swatch: ['#2fb59a', '#d9b45b', '#7fa3c7', '#c97b63'] },
    { id: 'ivory', name: 'Ivory', bg: '#f7f4ee', fg: '#222222', accent: '#d9531e', heading: SERIF, body: SANS, swatch: ['#d9531e', '#2f6f73', '#c9a227', '#6b5b95'] },
    { id: 'nebula', name: 'Nebula', bg: '#2a0a4a', bgImage: 'linear-gradient(135deg,#2a0a4a,#8a1c7c 60%,#e8516a)', fg: '#ffffff', accent: '#ffb347', heading: SANS, body: SANS, swatch: ['#ffb347', '#e8516a', '#8a1c7c', '#6be3ff'] },
  ];
  const VARIANTS = [
    { id: 0, name: 'Theme default', bg: null },
    { id: 1, name: 'Light', bg: '#ffffff' },
    { id: 2, name: 'Charcoal', bg: '#1f2430' },
    { id: 3, name: 'Black', bg: '#000000' },
  ];
  const TRANSITIONS = ['none', 'cut', 'fade', 'push', 'wipe'];
  const ANIM_EFFECTS = ['none', 'appear', 'fade', 'flyin'];
  const ANIM_STARTS = ['onclick', 'withprev', 'afterprev'];

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  // ---------- colour helpers ----------
  function hexToRgb(hex) {
    let h = String(hex || '').replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
  }
  function luminance(hex) {
    const c = hexToRgb(hex); if (!c) return 1;
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  }
  function contrastColor(hex) { return luminance(hex) > 0.4 ? '#1b1b1b' : '#ffffff'; }
  function shade(hex, amt) {
    const c = hexToRgb(hex); if (!c) return hex;
    return rgbToHex(...c.map((v) => (amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
  }

  // ---------- text style / shapes ----------
  const DEFAULT_TS = () => ({
    font: null, size: 18, bold: false, italic: false, underline: false, strike: false,
    sub: false, sup: false, color: null, highlight: null, align: 'left', list: 'none', caps: null,
  });

  function layoutPlaceholders(layout, H) {
    const k = H / 720;
    const T = (o) => Object.assign({}, o, { y: Math.round(o.y * k), h: Math.round(o.h * k) });
    switch (layout) {
      case 'title':
        return [
          T({ ph: 'title', x: 160, y: 118, w: 960, h: 252, anchor: 'bottom', ts: { size: 54, align: 'center' } }),
          T({ ph: 'subtitle', x: 160, y: 378, w: 960, h: 176, anchor: 'top', ts: { size: 24, align: 'center' } }),
        ];
      case 'titleContent':
        return [
          T({ ph: 'title', x: 96, y: 40, w: 1088, h: 130, anchor: 'middle', ts: { size: 44, align: 'left' } }),
          T({ ph: 'body', x: 96, y: 190, w: 1088, h: 450, anchor: 'top', ts: { size: 28, align: 'left', list: 'bullet' } }),
        ];
      case 'section':
        return [
          T({ ph: 'title', x: 96, y: 200, w: 1088, h: 200, anchor: 'bottom', ts: { size: 54, align: 'left', bold: true } }),
          T({ ph: 'text', x: 96, y: 416, w: 1088, h: 110, anchor: 'top', ts: { size: 24, align: 'left' } }),
        ];
      default:
        return [];
    }
  }

  const TEXT_TYPES = ['rect', 'oval', 'textbox'];
  function canHoldText(sh) { return TEXT_TYPES.indexOf(sh.type) >= 0; }
  function hasTextStyle(sh) { return canHoldText(sh) || sh.type === 'table'; }
  // links: only http(s) and mailto are allowed (no javascript: etc.)
  function safeUrl(u) {
    u = String(u || '').trim(); if (!u) return null;
    if (/^(https?:|mailto:)/i.test(u)) return u;
    if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return null;
    return 'https://' + u;
  }
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const svgUrl = (svg) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  const STOCK = [
    ['sunset', 'Sunset', '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1f1c5a"/><stop offset=".55" stop-color="#e8516a"/><stop offset="1" stop-color="#ffb347"/></linearGradient></defs><rect width="640" height="400" fill="url(#g)"/><circle cx="320" cy="270" r="70" fill="#ffd36e"/><rect y="270" width="640" height="130" fill="#2a1b3d"/>'],
    ['mountains', 'Mountains', '<rect width="640" height="400" fill="#bfe3f5"/><path d="M0 400 150 150 260 300 380 110 520 300 640 200V400z" fill="#5b7b8c"/><path d="M380 110 340 170 380 150 420 175z" fill="#fff"/>'],
    ['ocean', 'Ocean', '<rect width="640" height="400" fill="#d6f1ff"/><path d="M0 220q80-40 160 0t160 0 160 0 160 0V400H0z" fill="#2a8fd0"/><path d="M0 290q80-40 160 0t160 0 160 0 160 0V400H0z" fill="#0f6cbd"/>'],
    ['forest', 'Forest', '<rect width="640" height="400" fill="#dff3e0"/><path d="M80 380 150 160 220 380zM200 380 290 110 380 380zM360 380 440 180 520 380z" fill="#1f7a3c"/><rect y="370" width="640" height="30" fill="#4a3b2a"/>'],
    ['city', 'City', '<rect width="640" height="400" fill="#1c2540"/><g fill="#2f3d66"><rect x="40" y="170" width="70" height="230"/><rect x="130" y="110" width="90" height="290"/><rect x="240" y="200" width="60" height="200"/><rect x="320" y="90" width="100" height="310"/><rect x="440" y="150" width="70" height="250"/><rect x="530" y="210" width="70" height="190"/></g><g fill="#ffd36e"><rect x="150" y="140" width="12" height="12"/><rect x="180" y="190" width="12" height="12"/><rect x="345" y="130" width="12" height="12"/><rect x="380" y="180" width="12" height="12"/></g>'],
    ['waves', 'Waves', '<rect width="640" height="400" fill="#f7f4ee"/><path d="M0 120q80-60 160 0t160 0 160 0 160 0" stroke="#d9531e" stroke-width="14" fill="none"/><path d="M0 200q80-60 160 0t160 0 160 0 160 0" stroke="#2f6f73" stroke-width="14" fill="none"/><path d="M0 280q80-60 160 0t160 0 160 0 160 0" stroke="#c9a227" stroke-width="14" fill="none"/>'],
    ['dots', 'Dots', '<rect width="640" height="400" fill="#0f6cbd"/>' + Array.from({ length: 40 }, (_, k) => '<circle cx="' + (40 + (k % 10) * 62) + '" cy="' + (50 + Math.floor(k / 10) * 100) + '" r="' + (8 + (k * 7) % 16) + '" fill="#fff" opacity=".35"/>').join('')],
    ['gradient1', 'Gradient Blue', '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0f6cbd"/><stop offset="1" stop-color="#6be3ff"/></linearGradient></defs><rect width="640" height="400" fill="url(#g)"/>'],
    ['gradient2', 'Gradient Fire', '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c43e1c"/><stop offset="1" stop-color="#ffd800"/></linearGradient></defs><rect width="640" height="400" fill="url(#g)"/>'],
    ['stripes', 'Stripes', '<rect width="640" height="400" fill="#242424"/>' + Array.from({ length: 12 }, (_, k) => '<rect x="' + (k * 56 - 40) + '" y="-20" width="26" height="460" fill="#e3008c" opacity=".7" transform="rotate(20 320 200)"/>').join('')],
    ['grid', 'Grid', '<rect width="640" height="400" fill="#f3f3f3"/><g stroke="#bfbfbf" stroke-width="2">' + Array.from({ length: 9 }, (_, k) => '<path d="M' + (k * 80) + ' 0V400M0 ' + (k * 50) + 'H640"/>').join('') + '</g>'],
    ['bubbles', 'Bubbles', '<rect width="640" height="400" fill="#2a0a4a"/><circle cx="130" cy="120" r="70" fill="#e8516a" opacity=".8"/><circle cx="330" cy="250" r="110" fill="#ffb347" opacity=".7"/><circle cx="520" cy="110" r="60" fill="#6be3ff" opacity=".8"/>'],
  ].map((x) => ({ id: x[0], name: x[1], svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 400" width="640" height="400">' + x[2] + '</svg>' }));
  const stockUrl = (id) => { const x = STOCK.find((s) => s.id === id); return x ? svgUrl(x.svg) : null; };
  const isLineType = (t) => t === 'line' || t === 'arrow';

  function normShape(d) {
    const sh = Object.assign({
      id: '', type: 'rect', x: 0, y: 0, w: 200, h: 120, rot: 0, fill: null, line: null,
      text: '', anchor: 'top', ph: null, src: null, alt: '', points: null, link: null, name: '',
      cells: null, header: true, chart: null,
    }, d || {});
    sh.ts = Object.assign(DEFAULT_TS(), (d && d.ts) || {});
    ['x', 'y', 'w', 'h', 'rot'].forEach((k) => { if (typeof sh[k] !== 'number' || !isFinite(sh[k])) sh[k] = 0; });
    if (sh.line && typeof sh.line === 'object') sh.line = Object.assign({ color: '#000000', width: 2, alpha: 1 }, sh.line);
    if (typeof sh.text !== 'string') sh.text = '';
    if (sh.type === 'table') {
      if (!Array.isArray(sh.cells) || !sh.cells.length || !Array.isArray(sh.cells[0])) sh.cells = [['', ''], ['', '']];
      const cols = Math.max(1, Math.max.apply(null, sh.cells.map((r) => (Array.isArray(r) ? r.length : 0))));
      sh.cells = sh.cells.map((r) => { const row = (Array.isArray(r) ? r : []).map((c) => String(c == null ? '' : c)); while (row.length < cols) row.push(''); return row; });
    }
    if (sh.type === 'chart') {
      const c = Object.assign({ kind: 'bar', title: '', labels: [], values: [] }, sh.chart || {});
      if (['bar', 'line', 'pie'].indexOf(c.kind) < 0) c.kind = 'bar';
      c.labels = (c.labels || []).map(String); c.values = (c.values || []).map((v) => (isFinite(Number(v)) ? Number(v) : 0));
      while (c.values.length < c.labels.length) c.values.push(0);
      sh.chart = c;
    }
    if (sh.link && !(sh.link.type === 'url' && safeUrl(sh.link.url)) && !(sh.link.type === 'slide' && Number.isInteger(sh.link.index))) sh.link = null;
    return sh;
  }

  function normSlide(d) {
    const s = {
      id: d.id || '', layout: LAYOUTS.some((l) => l.id === d.layout) ? d.layout : 'blank',
      shapes: (d.shapes || []).map(normShape), notes: typeof d.notes === 'string' ? d.notes : '',
      transition: Object.assign({ type: 'none', dur: 0.7, dir: 'left' }, d.transition || {}),
      anims: (d.anims || []).filter((a) => a && a.shapeId),
      comments: (d.comments || []).filter((c) => c && typeof c.text === 'string').map((c) => ({ id: c.id || '', text: c.text, author: c.author || 'Quadra user', t: Number(c.t) || 0 })),
    };
    if (TRANSITIONS.indexOf(s.transition.type) < 0) s.transition.type = 'none';
    s.anims = s.anims.map((a) => Object.assign({ id: '', effect: 'fade', start: 'onclick', dur: 0.5, delay: 0, dir: 'bottom' }, a));
    return s;
  }

  // ---------- Presentation ----------
  class Presentation {
    constructor(d) {
      d = d || {};
      this.name = typeof d.name === 'string' && d.name.trim() ? d.name : 'Presentation';
      this.size = SIZES[d.size] ? d.size : '16:9';
      this.theme = Object.assign({ id: 'plain', variant: 0 }, d.theme || {});
      if (!THEMES.some((t) => t.id === this.theme.id)) this.theme.id = 'plain';
      if (!VARIANTS.some((v) => v.id === this.theme.variant)) this.theme.variant = 0;
      this.footer = Object.assign({ show: false, text: '', numbers: false }, d.footer || {});
      this.seq = Number(d.seq) > 0 ? Number(d.seq) : 1;
      this.slides = (d.slides || []).filter((s) => s && typeof s === 'object').map(normSlide);
      this._fixIds();
      if (!this.slides.length) this.slides = [this._newSlide('title')];
    }
    static blank() { return new Presentation({}); }
    static fromJSON(o) {
      try { return new Presentation(typeof o === 'string' ? JSON.parse(o) : o); } catch (e) { return new Presentation({}); }
    }
    toJSON() {
      return { v: 1, name: this.name, size: this.size, theme: clone(this.theme), footer: clone(this.footer), seq: this.seq, slides: clone(this.slides) };
    }
    get W() { return W; }
    get H() { return SIZES[this.size].h; }
    nid(p) { return p + (this.seq++); }
    _fixIds() {
      let max = 0;
      const num = (id) => { const m = /(\d+)$/.exec(id || ''); return m ? Number(m[1]) : 0; };
      this.slides.forEach((s) => {
        max = Math.max(max, num(s.id));
        s.shapes.forEach((sh) => { max = Math.max(max, num(sh.id)); });
        s.anims.forEach((a) => { max = Math.max(max, num(a.id)); });
        s.comments.forEach((c) => { max = Math.max(max, num(c.id)); });
      });
      if (this.seq <= max) this.seq = max + 1;
      const seen = new Set();
      const uniq = (id, p) => { if (!id || seen.has(id)) id = this.nid(p); seen.add(id); return id; };
      this.slides.forEach((s) => {
        s.id = uniq(s.id, 's');
        s.shapes.forEach((sh) => { sh.id = uniq(sh.id, 'sh'); });
        s.anims.forEach((a) => { a.id = uniq(a.id, 'an'); });
        s.comments.forEach((c) => { c.id = uniq(c.id, 'cm'); });
        const ids = new Set(s.shapes.map((x) => x.id));
        s.anims = s.anims.filter((a) => ids.has(a.shapeId));
      });
    }
    themeVars() {
      const t = THEMES.find((x) => x.id === this.theme.id) || THEMES[1];
      const v = VARIANTS.find((x) => x.id === this.theme.variant) || VARIANTS[0];
      let bg = t.bg, bgImage = t.bgImage || null, fg = t.fg;
      if (v.bg) { bg = v.bg; bgImage = null; fg = contrastColor(bg); }
      return { bg, bgImage, fg, accent: t.accent, heading: t.heading, body: t.body, muted: luminance(bg) > 0.4 ? '#6b6b6b' : '#b5b5b5', swatch: t.swatch };
    }

    // slides
    _newSlide(layout) {
      const s = { id: this.nid('s'), layout, shapes: [], notes: '', transition: { type: 'none', dur: 0.7, dir: 'left' }, anims: [], comments: [] };
      layoutPlaceholders(layout, this.H).forEach((p) => s.shapes.push(this._phShape(p)));
      return s;
    }
    _phShape(p) {
      return normShape(Object.assign({ id: this.nid('sh'), type: 'textbox' }, p));
    }
    addSlide(layout, afterIndex) {
      layout = LAYOUTS.some((l) => l.id === layout) ? layout : 'titleContent';
      const at = afterIndex == null ? this.slides.length : clamp(afterIndex + 1, 0, this.slides.length);
      this.slides.splice(at, 0, this._newSlide(layout));
      return at;
    }
    duplicateSlide(i) {
      const src = this.slides[i]; if (!src) return -1;
      const c = clone(src);
      const map = {};
      c.id = this.nid('s');
      c.shapes.forEach((sh) => { const n = this.nid('sh'); map[sh.id] = n; sh.id = n; });
      c.anims.forEach((a) => { a.id = this.nid('an'); a.shapeId = map[a.shapeId]; });
      c.comments.forEach((cm) => { cm.id = this.nid('cm'); });
      this.slides.splice(i + 1, 0, c);
      return i + 1;
    }
    deleteSlide(i) {
      if (!this.slides[i]) return i;
      if (this.slides.length === 1) { this.slides = [this._newSlide('title')]; return 0; }
      this.slides.splice(i, 1);
      return Math.min(i, this.slides.length - 1);
    }
    moveSlide(from, to) {
      if (from === to || !this.slides[from]) return from;
      to = clamp(to, 0, this.slides.length - 1);
      const [s] = this.slides.splice(from, 1);
      this.slides.splice(to, 0, s);
      return to;
    }
    setLayout(i, layout) {
      const s = this.slides[i]; if (!s || !LAYOUTS.some((l) => l.id === layout)) return;
      const want = layoutPlaceholders(layout, this.H);
      const used = new Set();
      want.forEach((p) => {
        const ex = s.shapes.find((sh) => sh.ph === p.ph && !used.has(sh.id)) ||
          (p.ph === 'body' && s.shapes.find((sh) => (sh.ph === 'subtitle' || sh.ph === 'text') && !used.has(sh.id))) ||
          (p.ph === 'subtitle' && s.shapes.find((sh) => (sh.ph === 'body' || sh.ph === 'text') && !used.has(sh.id))) ||
          (p.ph === 'text' && s.shapes.find((sh) => (sh.ph === 'body' || sh.ph === 'subtitle') && !used.has(sh.id)));
        if (ex) {
          used.add(ex.id);
          const had = ex.text;
          Object.assign(ex, { ph: p.ph, x: p.x, y: p.y, w: p.w, h: p.h, anchor: p.anchor });
          ex.ts = Object.assign(ex.ts, p.ts || {});
          ex.text = had;
        } else {
          const n = this._phShape(p); used.add(n.id); s.shapes.unshift(n);
        }
      });
      // drop empty placeholders that the new layout does not use
      const dropped = [];
      s.shapes = s.shapes.filter((sh) => {
        if (sh.ph && !used.has(sh.id) && !sh.text.trim()) { dropped.push(sh.id); return false; }
        if (sh.ph && !used.has(sh.id)) sh.ph = null; // keep text, make it a normal text box
        return true;
      });
      s.anims = s.anims.filter((a) => dropped.indexOf(a.shapeId) < 0);
      s.layout = layout;
    }

    // shapes
    getSlide(i) { return this.slides[i] || null; }
    getShape(i, id) { const s = this.slides[i]; return s ? s.shapes.find((x) => x.id === id) || null : null; }
    addShape(i, type, props) {
      const s = this.slides[i]; if (!s) return null;
      const acc = this.themeVars().accent;
      const base = { id: this.nid('sh'), type };
      const W_ = this.W, H_ = this.H;
      const cx = (w) => Math.round((W_ - w) / 2), cy = (h) => Math.round((H_ - h) / 2);
      let d;
      switch (type) {
        case 'rect': case 'oval':
          d = { w: 280, h: 170, x: cx(280), y: cy(170), fill: acc, line: { color: shade(acc, -0.3), width: 2 }, anchor: 'middle', ts: { size: 20, align: 'center' } }; break;
        case 'line': case 'arrow':
          d = { w: 300, h: 0, x: cx(300), y: Math.round(H_ / 2), fill: null, line: { color: acc, width: 4 } }; break;
        case 'textbox':
          d = { w: 420, h: 70, x: cx(420), y: cy(70), anchor: 'top', ts: { size: 24 } }; break;
        case 'picture':
          d = { w: 400, h: 300, x: cx(400), y: cy(300), src: '', alt: '' }; break;
        case 'ink':
          d = { w: 10, h: 10, x: 0, y: 0, line: { color: '#111111', width: 3, alpha: 1 }, points: [] }; break;
        case 'table': {
          const rows = clamp(Math.round((props && props.rows) || 3), 1, 20), cols = clamp(Math.round((props && props.cols) || 3), 1, 12);
          const w = Math.min(1120, cols * 190), h = rows * 56;
          d = { w, h, x: cx(w), y: cy(h), cells: Array.from({ length: rows }, () => Array(cols).fill('')), ts: { size: 18, align: 'left' }, header: true }; break;
        }
        case 'chart':
          d = { w: 640, h: 400, x: cx(640), y: cy(400), chart: { kind: 'bar', title: '', labels: ['Q1', 'Q2', 'Q3', 'Q4'], values: [4, 7, 3, 6] }, ts: { size: 14 } }; break;
        case 'video':
          d = { w: 640, h: 360, x: cx(640), y: cy(360), src: '', name: '' }; break;
        case 'audio':
          d = { w: 380, h: 56, x: cx(380), y: cy(56), src: '', name: '' }; break;
        default: return null;
      }
      const extra = Object.assign({}, props || {}); delete extra.rows; delete extra.cols;
      if (type === 'chart' && props && props.chart) extra.chart = Object.assign({}, d.chart, props.chart);
      const sh = normShape(Object.assign(base, d, extra, { ts: Object.assign({}, d.ts || {}, (props && props.ts) || {}) }));
      s.shapes.push(sh);
      return sh;
    }
    removeShapes(i, ids) {
      const s = this.slides[i]; if (!s) return 0;
      const set = new Set(ids); const n = s.shapes.length;
      s.shapes = s.shapes.filter((x) => !set.has(x.id));
      s.anims = s.anims.filter((a) => !set.has(a.shapeId));
      return n - s.shapes.length;
    }
    updateShape(i, id, patch) {
      const sh = this.getShape(i, id); if (!sh) return null;
      Object.keys(patch).forEach((k) => {
        if (k === 'ts') Object.assign(sh.ts, patch.ts);
        else if (k === 'line' && patch.line && sh.line) Object.assign(sh.line, patch.line);
        else sh[k] = patch[k];
      });
      return sh;
    }
    reorderShape(i, id, where) {
      const s = this.slides[i]; if (!s) return;
      const k = s.shapes.findIndex((x) => x.id === id); if (k < 0) return;
      const [sh] = s.shapes.splice(k, 1);
      if (where === 'front') s.shapes.push(sh);
      else if (where === 'back') s.shapes.unshift(sh);
      else if (where === 'forward') s.shapes.splice(Math.min(k + 1, s.shapes.length), 0, sh);
      else s.shapes.splice(Math.max(k - 1, 0), 0, sh);
    }
    packShapes(i, ids) {
      const s = this.slides[i]; if (!s) return [];
      return s.shapes.filter((x) => ids.indexOf(x.id) >= 0).map((x) => clone(x));
    }
    pasteShapes(i, packed, dx, dy) {
      const s = this.slides[i]; if (!s) return [];
      const out = [];
      packed.forEach((p) => {
        const sh = normShape(clone(p));
        sh.id = this.nid('sh'); sh.x += dx || 0; sh.y += dy || 0;
        s.shapes.push(sh); out.push(sh.id);
      });
      return out;
    }

    // tables
    tableOp(i, id, op, at) {
      const sh = this.getShape(i, id); if (!sh || sh.type !== 'table') return false;
      const rows = sh.cells.length, cols = sh.cells[0].length, rh = sh.h / rows, cw = sh.w / cols;
      if (op === 'addRow') { sh.cells.splice(clamp(at, 0, rows), 0, Array(cols).fill('')); sh.h = Math.round(rh * (rows + 1)); }
      else if (op === 'addCol') { sh.cells.forEach((r) => r.splice(clamp(at, 0, cols), 0, '')); sh.w = Math.round(cw * (cols + 1)); }
      else if (op === 'delRow') { if (rows <= 1) return false; sh.cells.splice(clamp(at, 0, rows - 1), 1); sh.h = Math.round(rh * (rows - 1)); }
      else if (op === 'delCol') { if (cols <= 1) return false; sh.cells.forEach((r) => r.splice(clamp(at, 0, cols - 1), 1)); sh.w = Math.round(cw * (cols - 1)); }
      else return false;
      return true;
    }
    setCell(i, id, r, c, text) { const sh = this.getShape(i, id); if (!sh || sh.type !== 'table' || !sh.cells[r] || sh.cells[r][c] == null) return false; sh.cells[r][c] = String(text); return true; }
    // links (on a shape)
    setLink(i, id, link) {
      const sh = this.getShape(i, id); if (!sh) return false;
      if (!link) { sh.link = null; return true; }
      if (link.type === 'url') { const u = safeUrl(link.url); if (!u) return false; sh.link = { type: 'url', url: u }; return true; }
      if (link.type === 'slide' && Number.isInteger(link.index) && link.index >= 0 && link.index < this.slides.length) { sh.link = { type: 'slide', index: link.index }; return true; }
      return false;
    }
    // comments
    addComment(i, text, author) {
      const s = this.slides[i]; text = String(text || '').trim(); if (!s || !text) return null;
      const c = { id: this.nid('cm'), text, author: author || 'Quadra user', t: Date.now() }; s.comments.push(c); return c;
    }
    removeComment(i, id) { const s = this.slides[i]; if (!s) return false; const n = s.comments.length; s.comments = s.comments.filter((c) => c.id !== id); return s.comments.length < n; }
    allComments() { const out = []; this.slides.forEach((s, si) => s.comments.forEach((c) => out.push({ slide: si, comment: c }))); return out; }
    // SmartArt: builds ordinary shapes (so everything stays editable)
    addSmartArt(i, kind, items) {
      const s = this.slides[i]; items = (items || []).map((t) => String(t).trim()).filter(Boolean).slice(0, 8);
      if (!s || !items.length) return [];
      const acc = this.themeVars().accent, W_ = this.W, H_ = this.H, ids = [];
      const box = (x, y, w, h, text, type) => {
        const sh = this.addShape(i, type || 'rect', { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), text, ts: { size: 20, align: 'center' } }); ids.push(sh.id); return sh;
      };
      const n = items.length;
      if (kind === 'process') {
        const gap = 64, bw = Math.min(220, (1120 - (n - 1) * gap) / n), total = n * bw + (n - 1) * gap, x0 = (W_ - total) / 2, y = H_ / 2 - 50;
        items.forEach((t, k) => {
          box(x0 + k * (bw + gap), y, bw, 100, t);
          if (k < n - 1) { const a = this.addShape(i, 'arrow', { x: Math.round(x0 + k * (bw + gap) + bw + 8), y: Math.round(y + 50), w: gap - 16, h: 0, line: { color: acc, width: 4 } }); ids.push(a.id); }
        });
      } else if (kind === 'cycle') {
        const r = Math.min(H_ * 0.34, 230), cx = W_ / 2, cy = H_ / 2;
        items.forEach((t, k) => { const a = (k / n) * Math.PI * 2 - Math.PI / 2; box(cx + r * 1.5 * Math.cos(a) - 100, cy + r * Math.sin(a) - 40, 200, 80, t, 'oval'); });
      } else {
        const bh = Math.min(70, (H_ - 120) / n - 12), total = n * bh + (n - 1) * 12, y0 = (H_ - total) / 2;
        items.forEach((t, k) => box((W_ - 560) / 2, y0 + k * (bh + 12), 560, bh, t));
      }
      return ids;
    }
    outlineText() {
      const out = [];
      this.slides.forEach((s, i) => {
        const t = s.shapes.find((x) => x.ph === 'title');
        out.push((i + 1) + '. ' + ((t && t.text.trim()) || '(no title)'));
        s.shapes.forEach((x) => {
          if (x === t) return;
          if (x.text && x.text.trim()) x.text.split('\n').forEach((l) => { if (l.trim()) out.push('   - ' + l.trim()); });
          if (x.type === 'table') x.cells.forEach((r) => out.push('   | ' + r.join(' | ')));
        });
        if (s.notes.trim()) out.push('   Notes: ' + s.notes.trim());
      });
      return out.join('\n');
    }
    wordCount() {
      let words = 0, chars = 0;
      const count = (t) => { const m = String(t).trim().match(/\S+/g); words += m ? m.length : 0; chars += String(t).replace(/\s/g, '').length; };
      this.slides.forEach((s) => { s.shapes.forEach((x) => { if (x.text) count(x.text); if (x.type === 'table') x.cells.forEach((r) => r.forEach(count)); }); count(s.notes); });
      return { slides: this.slides.length, words, chars };
    }

    // notes, transitions, size, theme
    setNotes(i, text) { const s = this.slides[i]; if (s) s.notes = String(text); }
    setTransition(i, patch) {
      const s = this.slides[i]; if (!s) return;
      if (patch.type && TRANSITIONS.indexOf(patch.type) < 0) return;
      Object.assign(s.transition, patch);
      if (patch.dur != null) s.transition.dur = clamp(Number(patch.dur) || 0, 0, 10);
    }
    applyTransitionToAll(i) {
      const s = this.slides[i]; if (!s) return;
      this.slides.forEach((o) => { o.transition = clone(s.transition); });
    }
    setSize(key) {
      if (!SIZES[key] || key === this.size) return;
      const k = SIZES[key].h / this.H;
      this.slides.forEach((s) => s.shapes.forEach((sh) => { sh.y = Math.round(sh.y * k); sh.h = Math.round(sh.h * k); }));
      this.size = key;
    }
    setTheme(id, variant) {
      if (THEMES.some((t) => t.id === id)) this.theme.id = id;
      if (variant != null && VARIANTS.some((v) => v.id === variant)) this.theme.variant = variant;
    }

    // animations
    getAnim(i, shapeId) { const s = this.slides[i]; return s ? s.anims.find((a) => a.shapeId === shapeId) || null : null; }
    setAnim(i, shapeId, effect, patch) {
      const s = this.slides[i]; if (!s || !this.getShape(i, shapeId)) return null;
      if (ANIM_EFFECTS.indexOf(effect) < 0) return null;
      if (effect === 'none') { s.anims = s.anims.filter((a) => a.shapeId !== shapeId); return null; }
      let a = s.anims.find((x) => x.shapeId === shapeId);
      if (!a) { a = { id: this.nid('an'), shapeId, effect, start: 'onclick', dur: 0.5, delay: 0, dir: 'bottom' }; s.anims.push(a); }
      a.effect = effect;
      if (patch) {
        if (patch.start && ANIM_STARTS.indexOf(patch.start) >= 0) a.start = patch.start;
        if (patch.dur != null) a.dur = clamp(Number(patch.dur) || 0, 0, 20);
        if (patch.delay != null) a.delay = clamp(Number(patch.delay) || 0, 0, 20);
        if (patch.dir) a.dir = patch.dir;
      }
      return a;
    }
    moveAnim(i, animId, delta) {
      const s = this.slides[i]; if (!s) return;
      const k = s.anims.findIndex((a) => a.id === animId); if (k < 0) return;
      const to = clamp(k + delta, 0, s.anims.length - 1);
      const [a] = s.anims.splice(k, 1); s.anims.splice(to, 0, a);
    }

    // find / replace
    findAll(query, matchCase) {
      const out = []; if (!query) return out;
      const q = matchCase ? query : query.toLowerCase();
      this.slides.forEach((s, si) => s.shapes.forEach((sh) => {
        if (!sh.text) return;
        const t = matchCase ? sh.text : sh.text.toLowerCase();
        let at = 0;
        while ((at = t.indexOf(q, at)) >= 0) { out.push({ slide: si, shapeId: sh.id, index: at, length: query.length }); at += Math.max(q.length, 1); }
      }));
      return out;
    }
    replaceAll(query, repl, matchCase) {
      const hits = this.findAll(query, matchCase); if (!hits.length) return 0;
      const esc = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(esc, matchCase ? 'g' : 'gi');
      const touched = new Set(hits.map((h) => h.slide + ':' + h.shapeId));
      this.slides.forEach((s, si) => s.shapes.forEach((sh) => {
        if (touched.has(si + ':' + sh.id)) sh.text = sh.text.replace(re, () => repl);
      }));
      return hits.length;
    }
    replaceAt(hit, repl) {
      const sh = this.getShape(hit.slide, hit.shapeId); if (!sh) return false;
      sh.text = sh.text.slice(0, hit.index) + repl + sh.text.slice(hit.index + hit.length);
      return true;
    }

    // accessibility
    checkAccessibility() {
      const issues = [];
      this.slides.forEach((s, si) => {
        const title = s.shapes.find((sh) => sh.ph === 'title');
        if (s.layout !== 'blank' && (!title || !title.text.trim())) issues.push({ slide: si, shapeId: title ? title.id : null, msg: 'Slide ' + (si + 1) + ' has no title.' });
        s.shapes.forEach((sh) => {
          if (sh.type === 'picture' && !String(sh.alt || '').trim()) issues.push({ slide: si, shapeId: sh.id, msg: 'Picture on slide ' + (si + 1) + ' has no alt text.' });
        });
      });
      return issues;
    }
  }

  // ---------- history (snapshot based undo/redo) ----------
  class History {
    constructor(limit) { this.limit = limit || 100; this.u = []; this.r = []; }
    push(snap) { this.u.push(snap); if (this.u.length > this.limit) this.u.shift(); this.r = []; }
    canUndo() { return this.u.length > 0; }
    canRedo() { return this.r.length > 0; }
    undo(cur) { if (!this.u.length) return null; this.r.push(cur); return this.u.pop(); }
    redo(cur) { if (!this.r.length) return null; this.u.push(cur); return this.r.pop(); }
    clear() { this.u = []; this.r = []; }
  }

  // ---------- animations / slideshow logic ----------
  function animGroups(slide) {
    const groups = [];
    slide.anims.forEach((a) => {
      if (a.start === 'onclick' || !groups.length) groups.push({ auto: a.start !== 'onclick', entries: [a] });
      else groups[groups.length - 1].entries.push(a);
    });
    return groups;
  }
  // start offset (seconds) of every entry in a group, relative to group start
  function groupTimeline(group) {
    const out = []; let prevStart = 0, prevEnd = 0;
    group.entries.forEach((a, k) => {
      let at = 0;
      if (k > 0) at = a.start === 'afterprev' ? prevEnd : prevStart;
      const begin = at + (a.delay || 0), end = begin + (a.dur || 0);
      out.push({ entry: a, at: begin, dur: a.dur || 0 });
      prevStart = at; prevEnd = end;
    });
    return out;
  }

  class ShowState {
    constructor(pres, start) {
      this.pres = pres; this.i = clamp(start || 0, 0, pres.slides.length - 1);
      this.g = 0; this.auto = [];
      this._enter(false);
    }
    groups() { return animGroups(this.pres.slides[this.i]); }
    _enter(fromEnd) {
      const gs = this.groups();
      if (fromEnd) { this.g = gs.length; this.auto = []; return; }
      if (gs.length && gs[0].auto) { this.g = 1; this.auto = gs[0].entries.slice(); } else { this.g = 0; this.auto = []; }
    }
    // shape ids that must be hidden right now (not yet revealed)
    hiddenIds() {
      const gs = this.groups(); const ids = [];
      this.auto.forEach((a) => ids.push(a.shapeId));
      for (let k = this.g; k < gs.length; k++) gs[k].entries.forEach((a) => ids.push(a.shapeId));
      return ids;
    }
    next() {
      const gs = this.groups();
      if (this.g < gs.length) { const group = gs[this.g++]; return { kind: 'anim', group, slide: this.i }; }
      if (this.i < this.pres.slides.length - 1) {
        this.i++; this._enter(false);
        return { kind: 'slide', slide: this.i, transition: this.pres.slides[this.i].transition, auto: this.auto };
      }
      return { kind: 'end' };
    }
    prev() {
      const gs = this.groups();
      const floor = gs.length && gs[0].auto ? 1 : 0;
      if (this.g > floor) { const group = gs[--this.g]; return { kind: 'unanim', group, slide: this.i }; }
      if (this.i > 0) { this.i--; this._enter(true); return { kind: 'slide', slide: this.i, transition: null, auto: [] }; }
      return { kind: 'none' };
    }
  }

  return {
    W, SIZES, LAYOUTS, PH_PROMPT, FONTS, SIZES_PT, THEMES, VARIANTS, TRANSITIONS, ANIM_EFFECTS, ANIM_STARTS,
    Presentation, History, ShowState, animGroups, groupTimeline, layoutPlaceholders, normShape,
    canHoldText, hasTextStyle, safeUrl, STOCK, stockUrl, svgUrl, escapeXml: esc, isLineType, DEFAULT_TS, clone, clamp, contrastColor, shade, luminance, hexToRgb,
  };
});
