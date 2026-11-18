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
  const TRANSITIONS = ['none', 'cut', 'fade', 'push', 'wipe', 'morph', 'cover', 'uncover', 'zoom', 'split'];
  const TRANSITION_NAMES = { none: 'None', cut: 'Cut', fade: 'Fade', push: 'Push', wipe: 'Wipe', morph: 'Morph', cover: 'Cover', uncover: 'Uncover', zoom: 'Zoom', split: 'Split' };
  const ANIM_INFO = {
    appear: { cat: 'entrance', name: 'Appear' }, fade: { cat: 'entrance', name: 'Fade' }, flyin: { cat: 'entrance', name: 'Fly In' },
    wipe: { cat: 'entrance', name: 'Wipe' }, zoom: { cat: 'entrance', name: 'Zoom' }, float: { cat: 'entrance', name: 'Float In' },
    pulse: { cat: 'emphasis', name: 'Pulse' }, spin: { cat: 'emphasis', name: 'Spin' }, growshrink: { cat: 'emphasis', name: 'Grow/Shrink' },
    teeter: { cat: 'emphasis', name: 'Teeter' }, blink: { cat: 'emphasis', name: 'Blink' },
    disappear: { cat: 'exit', name: 'Disappear' }, fadeout: { cat: 'exit', name: 'Fade Out' }, flyout: { cat: 'exit', name: 'Fly Out' },
    wipeout: { cat: 'exit', name: 'Wipe Out' }, zoomout: { cat: 'exit', name: 'Zoom Out' }, floatout: { cat: 'exit', name: 'Float Out' },
  };
  const ANIM_EFFECTS = ['none'].concat(Object.keys(ANIM_INFO));
  const animCategory = (e) => (ANIM_INFO[e] ? ANIM_INFO[e].cat : null);
  const ANIM_DIR_EFFECTS = ['flyin', 'flyout', 'wipe', 'wipeout', 'float', 'floatout'];
  function animDefaults(effect) {
    const d = { dur: 0.5, dir: 'bottom', amount: 0 };
    if (effect === 'appear' || effect === 'disappear') d.dur = 0;
    if (effect === 'wipe' || effect === 'wipeout') d.dir = 'left';
    if (effect === 'spin') d.amount = 360; if (effect === 'growshrink') d.amount = 1.5; if (effect === 'teeter' || effect === 'pulse' || effect === 'blink') d.dur = 0.5;
    return d;
  }
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
  function contrastRatio(a, b) { const la = luminance(a), lb = luminance(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); }
  function contrastColor(hex) { return luminance(hex) > 0.4 ? '#1b1b1b' : '#ffffff'; }
  function shade(hex, amt) {
    const c = hexToRgb(hex); if (!c) return hex;
    return rgbToHex(...c.map((v) => (amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
  }

  // ---------- text style / shapes ----------
  const DEFAULT_TS = () => ({
    font: null, size: 18, bold: false, italic: false, underline: false, strike: false,
    sub: false, sup: false, color: null, highlight: null, align: 'left', list: 'none', caps: null, lineHeight: 1.2,
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

  const SHAPE_KINDS = ['rect', 'rrect', 'oval', 'triangle', 'diamond', 'hexagon', 'star', 'rarrow'];
  const POLY = { // polygon points on a 100 x 100 box (shapes drawn as SVG)
    triangle: '50,2 98,98 2,98', diamond: '50,2 98,50 50,98 2,50', hexagon: '25,4 75,4 98,50 75,96 25,96 2,50',
    star: '50,2 61,37 98,38 68,60 79,96 50,74 21,96 32,60 2,38 39,37', rarrow: '2,30 60,30 60,6 98,50 60,94 60,70 2,70',
  };
  const SHAPE_NAMES = { rect: 'Rectangle', rrect: 'Rounded Rectangle', oval: 'Oval', triangle: 'Triangle', diamond: 'Diamond', hexagon: 'Hexagon', star: 'Star', rarrow: 'Block Arrow' };
  const TEXT_TYPES = ['rect', 'rrect', 'oval', 'triangle', 'diamond', 'hexagon', 'star', 'rarrow', 'textbox'];
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
    sh.ts.lineHeight = clamp(Number(sh.ts.lineHeight) || 1.2, 0.8, 3);
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
      hidden: !!d.hidden,
      advance: Object.assign({ click: true, after: null }, d.advance || {}),
      comments: (d.comments || []).filter((c) => c && typeof c.text === 'string').map((c) => ({
        id: c.id || '', text: c.text, author: c.author || 'Quadra user', t: Number(c.t) || 0, resolved: !!c.resolved,
        seenBy: Array.isArray(c.seenBy) ? c.seenBy.map(String) : [c.author || 'Quadra user'],
        replies: (Array.isArray(c.replies) ? c.replies : []).filter((r) => r && typeof r.text === 'string').map((r) => ({ author: r.author || 'Quadra user', text: r.text, t: Number(r.t) || 0 })),
      })),
    };
    if (TRANSITIONS.indexOf(s.transition.type) < 0) s.transition.type = 'none';
    s.advance.click = s.advance.click !== false;
    s.advance.after = Number(s.advance.after) > 0 ? clamp(Number(s.advance.after), 0.1, 3600) : null;
    s.anims = s.anims.filter((a) => ANIM_EFFECTS.indexOf(a.effect) > 0).map((a) => Object.assign({ id: '', start: 'onclick', delay: 0 }, animDefaults(a.effect), a));
    s.anims.forEach((a) => { if (ANIM_STARTS.indexOf(a.start) < 0) a.start = 'onclick'; });
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
      this.show = Object.assign({ useTimings: true, loop: false }, d.show || {}); this.show.useTimings = this.show.useTimings !== false; this.show.loop = !!this.show.loop;
      this.customShows = (Array.isArray(d.customShows) ? d.customShows : []).filter((c) => c && typeof c.name === 'string' && Array.isArray(c.slides)).map((c) => ({ id: c.id || '', name: c.name, slides: c.slides.map(String) }));
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
      return { v: 1, name: this.name, size: this.size, theme: clone(this.theme), footer: clone(this.footer), show: clone(this.show), customShows: clone(this.customShows), seq: this.seq, slides: clone(this.slides) };
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
      this.customShows.forEach((c) => { max = Math.max(max, num(c.id)); });
      if (this.seq <= max) this.seq = max + 1;
      const seen = new Set();
      const uniq = (id, p) => { if (!id || seen.has(id)) id = this.nid(p); seen.add(id); return id; };
      this.customShows.forEach((c) => { c.id = uniq(c.id, 'cs'); });
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
      const s = { id: this.nid('s'), layout, shapes: [], notes: '', hidden: false, transition: { type: 'none', dur: 0.7, dir: 'left' }, advance: { click: true, after: null }, anims: [], comments: [] };
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
    // insert a copy of a slide object (from the slide clipboard) after afterIndex, with fresh ids
    pasteSlide(afterIndex, packed) {
      if (!packed) return -1;
      const c = normSlide(clone(packed)), map = {};
      c.id = this.nid('s');
      c.shapes.forEach((sh) => { const n = this.nid('sh'); map[sh.id] = n; sh.id = n; });
      c.anims.forEach((a) => { a.id = this.nid('an'); a.shapeId = map[a.shapeId]; });
      c.comments.forEach((cm) => { cm.id = this.nid('cm'); });
      const at = clamp(afterIndex + 1, 0, this.slides.length); this.slides.splice(at, 0, c); return at;
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
        case 'rect': case 'rrect': case 'oval': case 'triangle': case 'diamond': case 'hexagon': case 'star': case 'rarrow':
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
    // align shapes: with one shape relative to the slide, with several relative to their common bounds
    alignShapes(i, ids, mode) {
      const s = this.slides[i]; if (!s) return 0;
      const list = s.shapes.filter((x) => ids.indexOf(x.id) >= 0); if (!list.length) return 0;
      const box = list.length === 1 ? { l: 0, t: 0, r: this.W, b: this.H } : { l: Math.min.apply(null, list.map((x) => x.x)), t: Math.min.apply(null, list.map((x) => x.y)), r: Math.max.apply(null, list.map((x) => x.x + x.w)), b: Math.max.apply(null, list.map((x) => x.y + x.h)) };
      list.forEach((x) => {
        if (mode === 'left') x.x = box.l; else if (mode === 'right') x.x = box.r - x.w; else if (mode === 'center') x.x = Math.round((box.l + box.r - x.w) / 2);
        else if (mode === 'top') x.y = box.t; else if (mode === 'bottom') x.y = box.b - x.h; else if (mode === 'middle') x.y = Math.round((box.t + box.b - x.h) / 2);
      });
      return list.length;
    }
    distributeShapes(i, ids, axis) {
      const s = this.slides[i]; if (!s) return 0;
      const list = s.shapes.filter((x) => ids.indexOf(x.id) >= 0); if (list.length < 3) return 0;
      const k = axis === 'v' ? 'y' : 'x', len = axis === 'v' ? 'h' : 'w';
      list.sort((a, b) => a[k] - b[k]);
      const first = list[0], last = list[list.length - 1], total = (last[k] + last[len]) - first[k], used = list.reduce((a, x) => a + x[len], 0), gap = (total - used) / (list.length - 1);
      let pos = first[k]; list.forEach((x) => { x[k] = Math.round(pos); pos += x[len] + gap; });
      return list.length;
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
      author = author || 'Quadra user';
      const c = { id: this.nid('cm'), text, author, t: Date.now(), resolved: false, seenBy: [author], replies: [] }; s.comments.push(c); return c;
    }
    _comment(i, id) { const s = this.slides[i]; return s ? s.comments.find((c) => c.id === id) || null : null; }
    replyComment(i, id, text, author) {
      const c = this._comment(i, id); text = String(text || '').trim(); if (!c || !text) return null;
      author = author || 'Quadra user'; const r = { author, text, t: Date.now() }; c.replies.push(r); c.seenBy = [author]; return r;
    }
    setResolved(i, id, on) { const c = this._comment(i, id); if (!c) return false; c.resolved = !!on; return true; }
    markRead(i, id, name) { const c = this._comment(i, id); if (!c) return false; if (c.seenBy.indexOf(name) < 0) c.seenBy.push(name); return true; }
    markAllRead(name) { let n = 0; this.allComments().forEach((x) => { if (x.comment.seenBy.indexOf(name) < 0) { x.comment.seenBy.push(name); n++; } }); return n; }
    unreadCount(name) { return this.allComments().filter((x) => x.comment.seenBy.indexOf(name) < 0).length; }
    setHidden(i, on) { const s = this.slides[i]; if (s) s.hidden = !!on; }
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

    // animations (a shape can have several: entrance, emphasis, exit ...)
    getAnim(i, shapeId) { const s = this.slides[i]; return s ? s.anims.find((a) => a.shapeId === shapeId) || null : null; }
    getAnims(i, shapeId) { const s = this.slides[i]; return s ? s.anims.filter((a) => a.shapeId === shapeId) : []; }
    _applyAnimPatch(a, patch) {
      if (!patch) return;
      if (patch.effect && ANIM_EFFECTS.indexOf(patch.effect) > 0) a.effect = patch.effect;
      if (patch.start && ANIM_STARTS.indexOf(patch.start) >= 0) a.start = patch.start;
      if (patch.dur != null) a.dur = clamp(Number(patch.dur) || 0, 0, 20);
      if (patch.delay != null) a.delay = clamp(Number(patch.delay) || 0, 0, 20);
      if (patch.dir) a.dir = patch.dir;
      if (patch.amount != null && isFinite(Number(patch.amount))) a.amount = Number(patch.amount);
    }
    addAnim(i, shapeId, effect, patch) {
      const s = this.slides[i]; if (!s || !this.getShape(i, shapeId) || ANIM_EFFECTS.indexOf(effect) < 1) return null;
      const a = Object.assign({ id: this.nid('an'), shapeId, effect, start: 'onclick', delay: 0 }, animDefaults(effect));
      this._applyAnimPatch(a, patch); s.anims.push(a); return a;
    }
    updateAnim(i, animId, patch) {
      const s = this.slides[i]; const a = s && s.anims.find((x) => x.id === animId); if (!a) return null;
      if (patch && patch.effect && patch.effect !== a.effect && ANIM_EFFECTS.indexOf(patch.effect) > 0) { Object.assign(a, animDefaults(patch.effect)); }
      this._applyAnimPatch(a, patch); return a;
    }
    removeAnim(i, animId) { const s = this.slides[i]; if (!s) return false; const n = s.anims.length; s.anims = s.anims.filter((a) => a.id !== animId); return s.anims.length < n; }
    // gallery behaviour: change the shape's first animation, create one if none, 'none' removes all of the shape's animations
    setAnim(i, shapeId, effect, patch) {
      const s = this.slides[i]; if (!s || !this.getShape(i, shapeId)) return null;
      if (ANIM_EFFECTS.indexOf(effect) < 0) return null;
      if (effect === 'none') { s.anims = s.anims.filter((a) => a.shapeId !== shapeId); return null; }
      const a = s.anims.find((x) => x.shapeId === shapeId);
      if (!a) return this.addAnim(i, shapeId, effect, patch);
      return this.updateAnim(i, a.id, Object.assign({ effect }, patch || {}));
    }
    moveAnim(i, animId, delta) {
      const s = this.slides[i]; if (!s) return;
      const k = s.anims.findIndex((a) => a.id === animId); if (k < 0) return;
      const to = clamp(k + delta, 0, s.anims.length - 1);
      const [a] = s.anims.splice(k, 1); s.anims.splice(to, 0, a);
    }
    // slide timing / show settings / custom shows
    setAdvance(i, patch) {
      const s = this.slides[i]; if (!s || !patch) return;
      if (patch.click != null) s.advance.click = !!patch.click;
      if ('after' in patch) s.advance.after = Number(patch.after) > 0 ? clamp(Number(patch.after), 0.1, 3600) : null;
    }
    setShowOptions(patch) { if (patch.useTimings != null) this.show.useTimings = !!patch.useTimings; if (patch.loop != null) this.show.loop = !!patch.loop; }
    addCustomShow(name, slideIds) {
      name = String(name || '').trim(); const ids = (slideIds || []).filter((id) => this.slides.some((s) => s.id === id));
      if (!name || !ids.length) return null;
      const c = { id: this.nid('cs'), name, slides: ids }; this.customShows.push(c); return c;
    }
    updateCustomShow(id, name, slideIds) {
      const c = this.customShows.find((x) => x.id === id); if (!c) return null;
      const ids = (slideIds || []).filter((x) => this.slides.some((s) => s.id === x)); name = String(name || '').trim();
      if (!name || !ids.length) return null; c.name = name; c.slides = ids; return c;
    }
    removeCustomShow(id) { const n = this.customShows.length; this.customShows = this.customShows.filter((c) => c.id !== id); return this.customShows.length < n; }
    customOrder(id) {
      const c = this.customShows.find((x) => x.id === id); if (!c) return [];
      return c.slides.map((sid) => this.slides.findIndex((s) => s.id === sid)).filter((k) => k >= 0);
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

    // accessibility: [{ slide, shapeId, level: 'error' | 'warning', msg }]
    checkAccessibility() {
      const issues = [], tv = this.themeVars(), titles = {};
      this.slides.forEach((s, si) => {
        const title = s.shapes.find((sh) => sh.ph === 'title');
        const tt = title ? title.text.trim() : '';
        if (s.layout !== 'blank' && !tt) issues.push({ slide: si, shapeId: title ? title.id : null, level: 'error', msg: 'Slide ' + (si + 1) + ' has no title.' });
        if (tt) { const k = tt.toLowerCase(); if (titles[k] != null) issues.push({ slide: si, shapeId: title.id, level: 'warning', msg: 'Slide ' + (si + 1) + ' has the same title as slide ' + (titles[k] + 1) + '.' }); else titles[k] = si; }
        s.shapes.forEach((sh) => {
          if (sh.type === 'picture' && !String(sh.alt || '').trim()) issues.push({ slide: si, shapeId: sh.id, level: 'error', msg: 'Picture on slide ' + (si + 1) + ' has no alt text.' });
          if (sh.type === 'table' && !sh.header) issues.push({ slide: si, shapeId: sh.id, level: 'warning', msg: 'Table on slide ' + (si + 1) + ' has no header row.' });
          const txt = sh.type === 'table' ? sh.cells.map((r) => r.join(' ')).join(' ') : sh.text;
          if (hasTextStyle(sh) && txt && txt.trim()) {
            if (sh.ts.size < 12) issues.push({ slide: si, shapeId: sh.id, level: 'warning', msg: 'Text on slide ' + (si + 1) + ' is very small (' + sh.ts.size + ' pt).' });
            const fg = sh.ts.color || (sh.fill && canHoldText(sh) ? contrastColor(sh.fill) : tv.fg), bg = sh.fill && canHoldText(sh) ? sh.fill : tv.bg;
            const ratio = contrastRatio(fg, bg);
            if (ratio < 4.5) issues.push({ slide: si, shapeId: sh.id, level: 'warning', msg: 'Text on slide ' + (si + 1) + ' has low contrast (' + ratio.toFixed(1) + ':1, needs 4.5:1).' });
          }
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

  // ---------- reading order text (Immersive Reader) ----------
  function readerText(slide, withNotes) {
    const items = [];
    const sorted = slide.shapes.slice().sort((a, b) => (Math.round(a.y / 24) - Math.round(b.y / 24)) || (a.x - b.x));
    const title = sorted.find((x) => x.ph === 'title');
    if (title && title.text.trim()) items.push({ kind: 'title', text: title.text.trim(), shapeId: title.id });
    sorted.forEach((sh) => {
      if (sh === title) return;
      if (sh.type === 'table') sh.cells.forEach((r, k) => { const line = r.map((c) => c.trim()).filter(Boolean).join(', '); if (line) items.push({ kind: 'table', text: (sh.header && k === 0 ? 'Header: ' : '') + line, shapeId: sh.id }); });
      else if (sh.type === 'picture') { if ((sh.alt || '').trim()) items.push({ kind: 'alt', text: 'Picture: ' + sh.alt.trim(), shapeId: sh.id }); }
      else if (sh.type === 'chart') items.push({ kind: 'alt', text: 'Chart' + (sh.chart.title ? ' ' + sh.chart.title : '') + ': ' + sh.chart.labels.map((l, k) => l + ' ' + sh.chart.values[k]).join(', '), shapeId: sh.id });
      else if (sh.text && sh.text.trim()) {
        let n = 0;
        sh.text.split('\n').forEach((l) => { const t = l.trim(); if (!t) return; n++; items.push({ kind: sh.ts.list === 'bullet' ? 'bullet' : sh.ts.list === 'number' ? 'number' : 'text', n, text: t, shapeId: sh.id }); });
      }
    });
    if (withNotes && slide.notes.trim()) slide.notes.split('\n').forEach((l) => { if (l.trim()) items.push({ kind: 'notes', text: l.trim() }); });
    return items;
  }

  // ---------- compare two versions of a deck (Review > Show Changes) ----------
  function diffPresentations(a, b) {
    const out = [], q = (t) => '"' + String(t).replace(/\s+/g, ' ').slice(0, 40) + (String(t).length > 40 ? '…' : '') + '"';
    const title = (s) => { const t = s.shapes.find((x) => x.ph === 'title'); return t && t.text.trim() ? q(t.text.trim()) : ''; };
    if (a.name !== b.name) out.push({ slide: null, text: 'Presentation renamed to ' + q(b.name) });
    if (a.size !== b.size) out.push({ slide: null, text: 'Slide size changed to ' + SIZES[b.size].label });
    if (a.theme.id !== b.theme.id || a.theme.variant !== b.theme.variant) out.push({ slide: null, text: 'Theme or variant changed' });
    if (JSON.stringify(a.footer) !== JSON.stringify(b.footer)) out.push({ slide: null, text: 'Footer settings changed' });
    const ai = {}, bi = {}; a.slides.forEach((s, k) => { ai[s.id] = k; }); b.slides.forEach((s, k) => { bi[s.id] = k; });
    a.slides.forEach((s, k) => { if (!(s.id in bi)) out.push({ slide: null, text: 'Slide ' + (k + 1) + ' ' + title(s) + ' was removed' }); });
    const common = b.slides.filter((s) => s.id in ai).map((s) => s.id), orderA = a.slides.filter((s) => s.id in bi).map((s) => s.id);
    b.slides.forEach((s, k) => {
      const n = k + 1;
      if (!(s.id in ai)) { out.push({ slide: k, text: 'Slide ' + n + ' ' + title(s) + ' was added' }); return; }
      const o = a.slides[ai[s.id]];
      if (common.indexOf(s.id) !== orderA.indexOf(s.id)) out.push({ slide: k, text: 'Slide ' + n + ' was moved (was slide ' + (ai[s.id] + 1) + ')' });
      if (o.notes !== s.notes) out.push({ slide: k, text: 'Slide ' + n + ': speaker notes changed' });
      if (o.transition.type !== s.transition.type) out.push({ slide: k, text: 'Slide ' + n + ': transition changed to ' + TRANSITION_NAMES[s.transition.type] });
      if (!!o.hidden !== !!s.hidden) out.push({ slide: k, text: 'Slide ' + n + (s.hidden ? ' was hidden' : ' is no longer hidden') });
      if (o.anims.length !== s.anims.length) out.push({ slide: k, text: 'Slide ' + n + ': animations ' + o.anims.length + ' → ' + s.anims.length });
      if (o.comments.length !== s.comments.length) out.push({ slide: k, text: 'Slide ' + n + ': comments ' + o.comments.length + ' → ' + s.comments.length });
      const os = {}; o.shapes.forEach((x) => { os[x.id] = x; });
      s.shapes.forEach((x) => {
        const y = os[x.id];
        if (!y) { out.push({ slide: k, shapeId: x.id, text: 'Slide ' + n + ': added ' + (SHAPE_NAMES[x.type] || x.type) + (x.text ? ' ' + q(x.text) : '') }); return; }
        const tx = (z) => (z.type === 'table' ? JSON.stringify(z.cells) : z.text);
        if (tx(x) !== tx(y)) out.push({ slide: k, shapeId: x.id, text: 'Slide ' + n + ': text changed ' + q(tx(y)) + ' → ' + q(tx(x)) });
        if (x.x !== y.x || x.y !== y.y) out.push({ slide: k, shapeId: x.id, text: 'Slide ' + n + ': ' + (SHAPE_NAMES[x.type] || x.type) + ' moved' });
        if (x.w !== y.w || x.h !== y.h || x.rot !== y.rot) out.push({ slide: k, shapeId: x.id, text: 'Slide ' + n + ': ' + (SHAPE_NAMES[x.type] || x.type) + ' resized or rotated' });
        if (x.fill !== y.fill || JSON.stringify(x.ts) !== JSON.stringify(y.ts)) out.push({ slide: k, shapeId: x.id, text: 'Slide ' + n + ': formatting changed' });
      });
      o.shapes.forEach((y) => { if (!s.shapes.some((x) => x.id === y.id)) out.push({ slide: k, text: 'Slide ' + n + ': removed ' + (SHAPE_NAMES[y.type] || y.type) + (y.text ? ' ' + q(y.text) : '') }); });
    });
    return out;
  }

  // ---------- Review Presentation: checks of a whole deck ----------
  function reviewIssues(pres, spellCount) {
    const out = pres.checkAccessibility().map((i) => Object.assign({}, i, { area: 'Accessibility' }));
    const add = (level, slide, msg, shapeId) => out.push({ area: 'Content', level, slide, shapeId: shapeId || null, msg });
    if (spellCount) add('warning', null, spellCount + ' possible spelling mistake' + (spellCount > 1 ? 's' : '') + '. Use Review > Proofing > Spelling.');
    const fonts = new Set();
    pres.slides.forEach((s, si) => {
      let words = 0, content = false;
      s.shapes.forEach((sh) => {
        if (sh.ts && sh.ts.font) fonts.add(sh.ts.font);
        const t = sh.type === 'table' ? sh.cells.map((r) => r.join(' ')).join(' ') : sh.text;
        if (t && t.trim()) { content = true; words += (t.match(/\S+/g) || []).length; if (sh.type !== 'table') sh.text.split('\n').forEach((l) => { if ((l.match(/\S+/g) || []).length > 25) add('tip', si, 'A paragraph on slide ' + (si + 1) + ' is long (' + (l.match(/\S+/g) || []).length + ' words). Shorter lines are easier to read.', sh.id); }); }
        else if (['textbox', 'rect', 'oval'].indexOf(sh.type) < 0 || sh.type === 'picture' || sh.fill) content = content || (!sh.ph && sh.type !== 'textbox');
      });
      if (words > 100) add('warning', si, 'Slide ' + (si + 1) + ' has ' + words + ' words. Consider splitting it.');
      if (!content) add('warning', si, 'Slide ' + (si + 1) + ' is empty.');
      if (s.anims.length > 8) add('tip', si, 'Slide ' + (si + 1) + ' has ' + s.anims.length + ' animations. Fewer animations keep the audience focused.');
    });
    if (fonts.size > 3) add('warning', null, 'The presentation uses ' + fonts.size + ' different fonts (' + Array.from(fonts).join(', ') + '). Two or three look more consistent.');
    if (pres.slides.length > 1 && !pres.slides.some((s) => s.notes.trim())) add('tip', null, 'No slide has speaker notes.');
    const hid = pres.slides.filter((s) => s.hidden).length; if (hid) add('tip', null, hid + ' slide' + (hid > 1 ? 's are' : ' is') + ' hidden and will be skipped in the slide show.');
    if (new Set(pres.slides.map((s) => s.transition.type)).size > 3) add('tip', null, 'Many different transitions are used. Using one or two looks more professional.');
    return out;
  }

  // ---------- spelling (hunspell-style dictionary: stems + affix rules) ----------
  function makeSpeller(aff, dic) {
    const rules = { PFX: {}, SFX: {} }, stems = new Map();
    String(aff).split('\n').forEach((line) => {
      const t = line.trim().split(/\s+/);
      if ((t[0] !== 'PFX' && t[0] !== 'SFX') || t.length < 4) return;
      if (/^[YN]$/.test(t[2]) && /^\d+$/.test(t[3])) { rules[t[0]][t[1]] = { cross: t[2] === 'Y', list: [] }; return; }
      const r = rules[t[0]][t[1]]; if (!r) return;
      const strip = t[2] === '0' ? '' : t[2], add = (t[3] === '0' ? '' : t[3]).split('/')[0], cond = t[4] || '.';
      let re; try { re = new RegExp(t[0] === 'PFX' ? '^' + cond : cond + '$'); } catch (e) { return; }
      r.list.push({ strip, add, re });
    });
    String(dic).split('\n').forEach((line) => {
      if (!line) return; const k = line.indexOf('/'), w = k < 0 ? line : line.slice(0, k), f = k < 0 ? '' : line.slice(k + 1);
      stems.set(w, (stems.get(w) || '') + f);
    });
    const ok = (f, flag) => f !== undefined && f.indexOf('c') < 0 && (flag == null || f.indexOf(flag) >= 0);
    function suffixStems(w, flag) { // stems that give w when the suffix rule of `flag` is applied
      const out = [], r = rules.SFX[flag]; if (!r) return out;
      r.list.forEach((x) => { if (x.add && !w.endsWith(x.add)) return; const stem = w.slice(0, w.length - x.add.length) + x.strip; if (x.re.test(stem)) out.push(stem); });
      return out;
    }
    function base(w) {
      if (ok(stems.get(w))) return true;
      for (const flag in rules.SFX) for (const stem of suffixStems(w, flag)) if (ok(stems.get(stem), flag)) return true;
      for (const flag in rules.PFX) {
        const r = rules.PFX[flag];
        for (const x of r.list) {
          if (x.add && !w.startsWith(x.add)) continue; const stem = x.strip + w.slice(x.add.length); if (!x.re.test(stem)) continue;
          if (ok(stems.get(stem), flag)) return true;
          if (r.cross) for (const sf in rules.SFX) { if (!rules.SFX[sf].cross) continue; for (const inner of suffixStems(stem, sf)) { const f = stems.get(inner); if (ok(f, flag) && f.indexOf(sf) >= 0) return true; } }
        }
      }
      return false;
    }
    function check(word) {
      const w = String(word).replace(/\u2019/g, "'"); if (!w || /\d/.test(w)) return true;
      if (base(w)) return true;
      const lower = w.toLowerCase();
      if (w !== lower) { if (base(lower)) return true; if (w === w.toUpperCase() && base(lower[0].toUpperCase() + lower.slice(1))) return true; }
      if (w.indexOf('-') > 0) return w.split('-').every((p) => !p || check(p));
      return false;
    }
    const AL = "abcdefghijklmnopqrstuvwxyz'";
    function suggest(word, max) {
      const w = String(word).toLowerCase(), found = [], seen = new Set([w]);
      const tryW = (c, weight) => { if (c && !seen.has(c)) { seen.add(c); if (check(c)) found.push({ c, weight }); } };
      for (let i = 0; i <= w.length; i++) {
        if (i < w.length) tryW(w.slice(0, i) + w.slice(i + 1), 1);
        if (i < w.length - 1) tryW(w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2), 0);
        for (const ch of AL) { if (i < w.length) tryW(w.slice(0, i) + ch + w.slice(i + 1), 2); tryW(w.slice(0, i) + ch + w.slice(i), 1); }
      }
      for (let i = 1; i < w.length; i++) { const a = w.slice(0, i), b = w.slice(i), one = (x) => x.length > 1 || x === 'a' || x === 'i'; if (one(a) && one(b) && check(a) && check(b)) found.push({ c: a + ' ' + b, weight: 0.5 }); }
      found.sort((x, y) => x.weight - y.weight || (y.c[0] === w[0]) - (x.c[0] === w[0]) || x.c.localeCompare(y.c));
      const cap = word[0] !== word[0].toLowerCase();
      return found.slice(0, max || 6).map((x) => (cap ? x.c[0].toUpperCase() + x.c.slice(1) : x.c));
    }
    return { check, suggest, size: stems.size };
  }
  const WORD_RE = /[A-Za-z][A-Za-z'\u2019]*[A-Za-z]|[A-Za-z]/g;
  // words of a text that are not in the dictionary: [{ word, index }]
  function misspellings(text, speller, ignore) {
    const out = [], clean = String(text).replace(/\S*@\S*|\S*:\/\/\S*|www\.\S*/g, (m) => ' '.repeat(m.length));
    let m; WORD_RE.lastIndex = 0;
    while ((m = WORD_RE.exec(clean))) {
      const w = m[0], prev = clean[m.index - 1];
      if (prev && /[0-9_]/.test(prev)) continue;
      if (/[a-z][A-Z]/.test(w)) continue;                       // camelCase / iPhone
      if (w === w.toUpperCase() && w.length <= 6) continue;     // acronyms
      if (ignore && (ignore.has(w) || ignore.has(w.toLowerCase()))) continue;
      if (!speller.check(w)) out.push({ word: w, index: m.index });
    }
    return out;
  }
  // every possible mistake in the deck, in reading order: { slide, shapeId, field, r, c, index, word }
  function spellIssues(pres, speller, ignore) {
    const out = [];
    pres.slides.forEach((s, si) => {
      s.shapes.forEach((sh) => {
        if (sh.type === 'table') sh.cells.forEach((row, r) => row.forEach((cell, c) => misspellings(cell, speller, ignore).forEach((m) => out.push({ slide: si, shapeId: sh.id, field: 'cell', r, c, index: m.index, word: m.word }))));
        else if (sh.text) misspellings(sh.text, speller, ignore).forEach((m) => out.push({ slide: si, shapeId: sh.id, field: 'text', index: m.index, word: m.word }));
      });
      if (s.notes) misspellings(s.notes, speller, ignore).forEach((m) => out.push({ slide: si, shapeId: null, field: 'notes', index: m.index, word: m.word }));
    });
    return out;
  }
  function spellField(pres, o) {
    const s = pres.slides[o.slide]; if (!s) return null;
    if (o.field === 'notes') return { get: () => s.notes, set: (v) => { s.notes = v; } };
    const sh = s.shapes.find((x) => x.id === o.shapeId); if (!sh) return null;
    if (o.field === 'cell') return { get: () => sh.cells[o.r][o.c], set: (v) => { sh.cells[o.r][o.c] = v; } };
    return { get: () => sh.text, set: (v) => { sh.text = v; } };
  }
  function spellText(pres, o) { const f = spellField(pres, o); return f ? f.get() : ''; }
  function spellReplace(pres, o, repl) { const f = spellField(pres, o); if (!f) return false; const t = f.get(); if (t.substr(o.index, o.word.length) !== o.word) return false; f.set(t.slice(0, o.index) + repl + t.slice(o.index + o.word.length)); return true; }
  function spellReplaceAll(pres, speller, word, repl) {
    let n = 0;
    for (;;) { // recompute after every change because indexes move
      const hit = spellIssues(pres, speller, null).find((x) => x.word === word); if (!hit || n > 500) return n;
      if (!spellReplace(pres, hit, repl)) return n; n++;
    }
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
    constructor(pres, start, order) {
      this.pres = pres;
      const startIdx = clamp(start || 0, 0, pres.slides.length - 1);
      this.order = Array.isArray(order) && order.length ? order.filter((k) => pres.slides[k]) : pres.slides.map((x, k) => k).filter((k) => !pres.slides[k].hidden || k === startIdx);
      if (!this.order.length) this.order = [startIdx];
      this.pos = Array.isArray(order) && order.length ? 0 : Math.max(0, this.order.indexOf(startIdx));
      this.i = this.order[this.pos];
      this.g = 0; this.auto = [];
      this._enter(false);
    }
    groups() { return animGroups(this.pres.slides[this.i]); }
    _enter(fromEnd) {
      const gs = this.groups();
      if (fromEnd) { this.g = gs.length; this.auto = []; return; }
      if (gs.length && gs[0].auto) { this.g = 1; this.auto = gs[0].entries.slice(); } else { this.g = 0; this.auto = []; }
    }
    autoDone() { this.auto = []; } // the automatic group has been played by the player
    restart() { this.pos = 0; this.i = this.order[0]; this._enter(false); }
    goTo(slideIndex) { const p = this.order.indexOf(slideIndex); if (p < 0) return false; this.pos = p; this.i = slideIndex; this._enter(false); return true; }
    isLast() { return this.pos >= this.order.length - 1; }
    // shape ids that must be hidden right now: entrance effects not yet played, exit effects already played
    hiddenIds() {
      const gs = this.groups(); const slide = this.pres.slides[this.i], first = {};
      slide.anims.forEach((a) => { if (!(a.shapeId in first)) first[a.shapeId] = a; });
      const hidden = new Set();
      Object.keys(first).forEach((id) => { if (animCategory(first[id].effect) === 'entrance') hidden.add(id); });
      for (let k = this.auto.length ? 1 : 0; k < this.g; k++) {
        gs[k].entries.forEach((a) => { const c = animCategory(a.effect); if (c === 'entrance') hidden.delete(a.shapeId); else if (c === 'exit') hidden.add(a.shapeId); });
      }
      return Array.from(hidden);
    }
    next() {
      const gs = this.groups();
      if (this.g < gs.length) { const group = gs[this.g++]; return { kind: 'anim', group, slide: this.i }; }
      if (this.pos < this.order.length - 1) {
        this.pos++; this.i = this.order[this.pos]; this._enter(false);
        const s = this.pres.slides[this.i];
        return { kind: 'slide', slide: this.i, transition: s.transition, advance: s.advance, auto: this.auto };
      }
      return { kind: 'end' };
    }
    prev() {
      const gs = this.groups();
      const floor = gs.length && gs[0].auto ? 1 : 0;
      if (this.g > floor) { const group = gs[--this.g]; return { kind: 'unanim', group, slide: this.i }; }
      if (this.pos > 0) { this.pos--; this.i = this.order[this.pos]; this._enter(true); return { kind: 'slide', slide: this.i, transition: null, advance: this.pres.slides[this.i].advance, auto: [] }; }
      return { kind: 'none' };
    }
  }

  return {
    W, SIZES, LAYOUTS, PH_PROMPT, FONTS, SIZES_PT, THEMES, VARIANTS, TRANSITIONS, TRANSITION_NAMES, ANIM_EFFECTS, ANIM_INFO, ANIM_STARTS, ANIM_DIR_EFFECTS, animCategory, animDefaults,
    Presentation, History, ShowState, spellText, readerText, diffPresentations, reviewIssues, makeSpeller, misspellings, spellIssues, spellReplace, spellReplaceAll, contrastRatio, SHAPE_KINDS, SHAPE_NAMES, POLY, animGroups, groupTimeline, layoutPlaceholders, normShape,
    canHoldText, hasTextStyle, safeUrl, STOCK, stockUrl, svgUrl, escapeXml: esc, isLineType, DEFAULT_TS, clone, clamp, contrastColor, shade, luminance, hexToRgb,
  };
});
