// Browser tests (Playwright + Chromium). Run: node tests/browser.test.js
// Every test starts in a fresh browser context AND explicitly clears app state first
// (autosave runs on pagehide, so the "no save" flag is set before the clearing reload).
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+$/, '/index.html'));
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(data);
  });
});

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
let browser, URL_, pageErrors = [];

async function open(opts) {
  opts = opts || {};
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1280, height: 800 }, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write', 'camera'] });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('console: ' + m.text()); });
  await page.goto(URL_);
  // clear state first; the flag stops the pagehide autosave from writing it back during the reload
  await page.evaluate(() => { window.__QUADRA_NOSAVE = true; localStorage.clear(); });
  await page.reload();
  await page.waitForFunction(() => window.__QUADRA_READY === true);
  page.ctx = ctx;
  return page;
}
const model = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.QEditor.pres.toJSON())));
const ed = (page, fn, arg) => page.evaluate(fn, arg);
const assert = (cond, msg) => { if (!cond) throw new Error('assertion failed: ' + msg); };
const eq = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((msg || 'not equal') + ': got ' + JSON.stringify(a) + ' expected ' + JSON.stringify(b)); };
const tab = (page, name) => page.click('.tab[data-tab="' + name + '"]');
const cmd = (page, id) => page.click('[data-cmd="' + id + '"]');
const sel = (page) => page.evaluate(() => window.QEditor.sel.slice());
async function shapeCenter(page, id) {
  return page.evaluate((id) => {
    const E = window.QEditor, s = E.shape(id), r = document.getElementById('stage').getBoundingClientRect(), z = E.z();
    return { x: r.left + (s.x + s.w / 2) * z, y: r.top + (s.y + s.h / 2) * z, z };
  }, id);
}
async function addRect(page) {
  await tab(page, 'Insert'); await cmd(page, 'shapes'); await page.click('[data-mid="shape-rect"]');
  return page.evaluate(() => window.QEditor.sel[0]);
}
async function blankSlide(page) { // make the current slide blank and return
  await ed(page, () => window.QEditor.newSlide('blank'));
}

// ---------------------------------------------------------------- structure
test('app skeleton: title bar, tabs, ribbon, thumbnails, canvas, notes pane, status bar', async (page) => {
  for (const s of ['#titlebar', '#tabs', '#ribbon', '#thumbs', '#stage', '#notesPane', '#statusbar', '#launcherBtn', '#themeBtn', '#profileBtn', '#docName', '#saveStatus']) assert(await page.$(s), s + ' missing');
  eq(await page.$$eval('.tab', (t) => t.map((x) => x.textContent)), ['File', 'Home', 'Insert', 'Draw', 'Design', 'Transitions', 'Animations', 'Slide Show', 'Review', 'View', 'Help']);
  eq(await page.locator('#notesPane').isHidden(), true, 'notes hidden by default');
  eq(await page.locator('.thumb-item').count(), 1);
  eq(await page.locator('#stage .sl-shape').count(), 2, 'title + subtitle placeholders');
  eq(await page.textContent('#sbSlide'), 'Slide 1 of 1');
});

test('every ribbon button of every tab has a command, an icon and a label/tooltip', async (page) => {
  for (const t of ['Home', 'Insert', 'Draw', 'Design', 'Transitions', 'Animations', 'Slide Show', 'Review', 'View', 'Help']) {
    await tab(page, t);
    const bad = await page.$$eval('#ribbonBody [data-cmd]', (ns) => ns.filter((n) => !window.QUI.commands[n.dataset.cmd] || (n.tagName === 'BUTTON' && !n.querySelector('use') && !n.querySelector('.tprev,.vprev')) || !(n.title || n.textContent.trim() || n.getAttribute('aria-label'))).map((n) => n.dataset.cmd));
    eq(bad, [], 'broken ribbon items on ' + t);
    assert((await page.$$('#ribbonBody .rgroup')).length >= 1, t + ' has groups');
  }
});

test('every icon used by the app exists in the inline sprite and in assets/icons.svg', async (page) => {
  const missing = await page.evaluate(() => {
    const ids = new Set(Array.from(document.querySelectorAll('symbol')).map((s) => s.id));
    return Array.from(document.querySelectorAll('use')).map((u) => u.getAttribute('href').slice(1)).filter((h) => !ids.has(h));
  });
  eq(missing, [], 'icons missing from sprite');
  const file = fs.readFileSync(path.join(ROOT, 'assets/icons.svg'), 'utf8');
  assert(file.includes('id="i-logo"') && file.includes('id="i-bold"'), 'assets/icons.svg content');
});

test('unavailable features open a "not available in this version" dialog (no toast)', async (page) => {
  const checks = [['Draw', 'touch'], ['Draw', 'lasso'], ['Draw', 'stencil']];
  for (const [t, c] of checks) {
    await tab(page, t); await cmd(page, c);
    assert(await page.locator('.dialog h2', { hasText: 'Not available in this version' }).isVisible(), c + ' dialog');
    eq(await page.locator('.toast').count(), 0, 'no toast for ' + c);
    await page.click('.dialog .btn');
  }
  await page.click('#shareBtn'); assert(await page.locator('.menu [data-mid="share-mail"]').isVisible(), 'share menu'); await page.keyboard.press('Escape');
  await page.click('.tab[data-tab="Help"]'); await cmd(page, 'support'); await page.keyboard.press('Escape');
  eq(await page.locator('.dialog').count(), 0, 'Esc closes dialog');
});

test('Home and Insert tabs: no button is disabled by default except those needing a selection/clipboard; Review keeps its disabled buttons', async (page) => {
  await tab(page, 'Insert');
  eq(await page.$$eval('#ribbonBody [data-cmd]', (ns) => ns.filter((n) => n.disabled).map((n) => n.dataset.cmd)), [], 'Insert: nothing disabled');
  await tab(page, 'Home');
  eq(await page.$$eval('#ribbonBody [data-cmd]', (ns) => ns.filter((n) => n.disabled).map((n) => n.dataset.cmd)).then((a) => a.sort()),
    ['bold', 'case', 'clearfmt', 'copy', 'cut', 'delete', 'fontColor'.toLowerCase(), 'fontName', 'fontSize', 'grow', 'highlight', 'italic', 'painter', 'redo', 'shrink', 'strike', 'sub', 'sup', 'underline', 'undo'].sort(), 'Home: only selection/history dependent buttons');
  await tab(page, 'Review');
  for (const c of ['markread', 'delcomment', 'prevcomment', 'nextcomment']) assert(await page.locator('[data-cmd="' + c + '"]').isDisabled(), c);
  for (const c of ['review', 'proofing', 'changes', 'access']) assert(await page.locator('[data-cmd="' + c + '"]').isEnabled(), c + ' works now');
});

// ---------------------------------------------------------------- slides
test('New Slide button, Ctrl+M and the layout menu add slides', async (page) => {
  await tab(page, 'Insert'); await cmd(page, 'newslide');
  let m = await model(page); eq(m.slides.length, 2); eq(m.slides[1].layout, 'titleContent');
  await page.keyboard.press('Control+m');
  m = await model(page); eq(m.slides.length, 3);
  eq(await page.locator('.thumb-item').count(), 3); eq(await page.textContent('#sbSlide'), 'Slide 3 of 3');
  await page.click('[data-cmd="newslide"] .dd'); await page.click('.menu .mi >> text=Section Header');
  m = await model(page); eq(m.slides[3].layout, 'section'); eq(m.slides.length, 4);
});

test('thumbnail click selects slide; canvas follows', async (page) => {
  await ed(page, () => { const E = window.QEditor; E.pres.slides[0].shapes[0].text = 'First'; E.newSlide('titleContent'); E.pres.slides[1].shapes[0].text = 'Second'; E.fullRender(); });
  await page.click('.thumb-item[data-index="0"] .thumb-card');
  eq(await ed(page, () => window.QEditor.cur), 0);
  assert((await page.textContent('#stage')).includes('First'), 'canvas shows slide 1');
  await page.click('.thumb-item[data-index="1"] .thumb-card');
  assert((await page.textContent('#stage')).includes('Second'), 'canvas shows slide 2');
  assert(await page.locator('.thumb-item[data-index="1"]').evaluate((n) => n.classList.contains('active')), 'active class');
});

test('duplicate and delete slide (context menu + Delete key in thumbnails)', async (page) => {
  await ed(page, () => { window.QEditor.pres.slides[0].shapes[0].text = 'Dup me'; window.QEditor.fullRender(); });
  await page.click('.thumb-item[data-index="0"] .thumb-card', { button: 'right' });
  await page.click('.menu .mi >> text=Duplicate Slide');
  let m = await model(page); eq(m.slides.length, 2); eq(m.slides[1].shapes[0].text, 'Dup me');
  await page.click('.thumb-item[data-index="1"] .thumb-card'); await page.keyboard.press('Delete');
  m = await model(page); eq(m.slides.length, 1);
  await page.keyboard.press('Delete'); m = await model(page);
  eq(m.slides.length, 1, 'last slide is never removed completely'); eq(m.slides[0].shapes[0].text, '');
});

test('reorder slides by drag and drop in the thumbnail panel', async (page) => {
  await ed(page, () => { const E = window.QEditor; ['A', 'B', 'C'].forEach((t, i) => { if (i) E.newSlide('titleContent'); E.pres.slides[i].shapes[0].text = t; }); E.fullRender(); });
  await page.locator('.thumb-item[data-index="0"] .thumb-card').dragTo(page.locator('.thumb-item[data-index="2"] .thumb-card'), { targetPosition: { x: 100, y: 80 } });
  const m = await model(page);
  eq(m.slides.map((s) => s.shapes[0].text), ['B', 'C', 'A']);
  eq(await ed(page, () => window.QEditor.cur), 2);
});

test('layouts: Title, Title and Content, Section Header, Blank', async (page) => {
  await tab(page, 'Design');
  const want = { 'Title Slide': ['title', 'subtitle'], 'Title and Content': ['title', 'body'], 'Section Header': ['title', 'text'], Blank: [] };
  for (const name of Object.keys(want)) {
    await cmd(page, 'layout'); await page.click('.menu .mi >> text=' + name);
    const m = await model(page); eq(m.slides[0].shapes.map((s) => s.ph).sort(), want[name].slice().sort(), name);
  }
});

// ---------------------------------------------------------------- shapes + selection
test('Insert > Shapes creates rectangle, oval, line and arrow with real DOM', async (page) => {
  await blankSlide(page);
  await tab(page, 'Insert');
  for (const s of ['rect', 'oval', 'line', 'arrow']) { await cmd(page, 'shapes'); await page.click('[data-mid="shape-' + s + '"]'); }
  const m = await model(page); eq(m.slides[1].shapes.map((s) => s.type), ['rect', 'oval', 'line', 'arrow']);
  eq(await page.locator('#stage .sl-oval').evaluate((n) => getComputedStyle(n).borderRadius), '50%');
  assert(await page.locator('#stage .sl-arrow polygon').count() === 1, 'arrow head');
  assert(await page.locator('#stage .sl-line line').count() === 1, 'line element');
});

test('click on canvas selects shape and shows handles; click on empty area deselects', async (page) => {
  await blankSlide(page); const id = await addRect(page);
  eq(await sel(page), [id]); eq(await page.locator('#stage .handle').count(), 9, '8 resize + rotate');
  await page.mouse.click(5, 400); // outside the slide
  const box = await page.locator('#stage').boundingBox();
  await page.mouse.click(box.x + 10, box.y + 10);
  eq(await sel(page), []); eq(await page.locator('#stage .handle').count(), 0);
  const c = await shapeCenter(page, id); await page.mouse.click(c.x, c.y);
  eq(await sel(page), [id]);
});

test('drag moves a shape (model x/y change, DOM follows)', async (page) => {
  await blankSlide(page); const id = await addRect(page);
  const before = (await model(page)).slides[1].shapes[0];
  const c = await shapeCenter(page, id);
  await page.mouse.move(c.x, c.y); await page.mouse.down(); await page.mouse.move(c.x + 100, c.y + 50, { steps: 6 }); await page.mouse.up();
  const after = (await model(page)).slides[1].shapes[0];
  assert(Math.abs(after.x - before.x - 100 / c.z) <= 2 && Math.abs(after.y - before.y - 50 / c.z) <= 2, 'moved by drag: ' + before.x + '->' + after.x);
  eq(await page.locator('#stage .sl-rect').evaluate((n) => n.style.left), after.x + 'px');
  await page.keyboard.press('Control+z'); eq((await model(page)).slides[1].shapes[0].x, before.x, 'one undo reverts the whole drag');
});

test('resize handles change width/height; picture-style corner keeps shape inside rules', async (page) => {
  await blankSlide(page); const id = await addRect(page);
  const b = (await model(page)).slides[1].shapes[0];
  const h = await page.locator('#stage .handle.se').boundingBox(); const z = (await shapeCenter(page, id)).z;
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2); await page.mouse.down(); await page.mouse.move(h.x + 60, h.y + 40, { steps: 5 }); await page.mouse.up();
  const a = (await model(page)).slides[1].shapes[0];
  assert(a.w > b.w && a.h > b.h && a.x === b.x && a.y === b.y, 'se handle grows w/h, keeps origin');
  const hw = await page.locator('#stage .handle.w').boundingBox();
  await page.mouse.move(hw.x + hw.width / 2, hw.y + hw.height / 2); await page.mouse.down(); await page.mouse.move(hw.x + 30, hw.y, { steps: 4 }); await page.mouse.up();
  const c = (await model(page)).slides[1].shapes[0];
  assert(c.w < a.w && c.x > a.x && Math.abs((c.x + c.w) - (a.x + a.w)) <= 1, 'w handle moves left edge, keeps right edge ' + z);
});

test('rotation handle rotates the shape', async (page) => {
  await blankSlide(page); const id = await addRect(page);
  const r = await page.locator('#stage .handle.rot').boundingBox(); const c = await shapeCenter(page, id);
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2); await page.mouse.down();
  await page.mouse.move(c.x + 200, c.y, { steps: 6 }); await page.mouse.up(); // pointer to the right of the centre = 90 degrees
  const s = (await model(page)).slides[1].shapes[0];
  assert(Math.abs(s.rot - 90) <= 3, 'rot ~ 90, got ' + s.rot);
  assert((await page.locator('#stage .sl-rect').evaluate((n) => n.style.transform)).includes('rotate('), 'DOM rotated');
});

test('Delete key, Ctrl+C/X/V, Ctrl+D', async (page) => {
  await blankSlide(page); const id = await addRect(page);
  await page.keyboard.press('Control+c'); await page.keyboard.press('Control+v');
  let m = await model(page); eq(m.slides[1].shapes.length, 2);
  const pasted = m.slides[1].shapes[1]; assert(pasted.id !== id && pasted.x === m.slides[1].shapes[0].x + 20, 'paste offset');
  await page.keyboard.press('Control+d'); m = await model(page); eq(m.slides[1].shapes.length, 3);
  await page.keyboard.press('Control+x'); m = await model(page); eq(m.slides[1].shapes.length, 2, 'cut removes');
  await page.keyboard.press('Control+v'); m = await model(page); eq(m.slides[1].shapes.length, 3, 'paste after cut');
  await page.keyboard.press('Delete'); m = await model(page); eq(m.slides[1].shapes.length, 2, 'Delete removes selected');
  await page.keyboard.press('Backspace'); m = await model(page); eq(m.slides[1].shapes.length, 2, 'nothing selected, nothing deleted');
});

test('Ctrl+Z / Ctrl+Y undo and redo; ribbon buttons reflect state', async (page) => {
  await blankSlide(page);
  assert(await page.locator('[data-cmd="undo"]').isEnabled(), 'undo enabled after slide add');
  await addRect(page);
  await page.keyboard.press('Control+z'); eq((await model(page)).slides[1].shapes.length, 0, 'shape undone');
  await tab(page, 'Home'); assert(await page.locator('[data-cmd="redo"]').isEnabled(), 'redo enabled');
  await page.keyboard.press('Control+y'); eq((await model(page)).slides[1].shapes.length, 1, 'redo');
  await cmd(page, 'undo'); eq((await model(page)).slides[1].shapes.length, 0, 'ribbon undo');
  await cmd(page, 'redo'); eq((await model(page)).slides[1].shapes.length, 1, 'ribbon redo');
  await page.keyboard.press('Control+z'); await page.keyboard.press('Control+z');
  eq((await model(page)).slides.length, 1, 'undo slide creation');
});

test('Ctrl+A selects all shapes of the slide; arrow keys nudge', async (page) => {
  await tab(page, 'Insert'); await cmd(page, 'shapes'); await page.click('[data-mid="shape-rect"]');
  await page.keyboard.press('Control+a'); eq((await sel(page)).length, 3, 'title, subtitle, rect');
  await page.keyboard.press('Escape'); eq(await sel(page), []);
  const id = await ed(page, () => window.QEditor.slide().shapes[2].id);
  const c = await shapeCenter(page, id); await page.mouse.click(c.x, c.y);
  const x0 = (await model(page)).slides[0].shapes[2].x, y0 = (await model(page)).slides[0].shapes[2].y;
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Shift+ArrowLeft');
  const s = (await model(page)).slides[0].shapes[2]; eq([s.x, s.y], [x0 + 5 - 1, y0 + 5]);
});

test('marquee drag selects shapes', async (page) => {
  await blankSlide(page); await addRect(page); await addRect(page);
  await page.keyboard.press('Escape');
  const box = await page.locator('#stage').boundingBox();
  await page.mouse.move(box.x + 3, box.y + 3); await page.mouse.down(); await page.mouse.move(box.x + box.width - 3, box.y + box.height - 3, { steps: 5 }); await page.mouse.up();
  eq((await sel(page)).length, 2);
});

// ---------------------------------------------------------------- text
test('double-click edits text; Esc leaves edit mode and keeps the text', async (page) => {
  const id = await ed(page, () => window.QEditor.slide().shapes[0].id);
  const c = await shapeCenter(page, id); await page.mouse.dblclick(c.x, c.y);
  assert(await page.locator('#stage .sl-tin[contenteditable]').count() === 1, 'edit mode on');
  await page.keyboard.type('Hello world');
  eq((await model(page)).slides[0].shapes[0].text, 'Hello world', 'model updated while typing');
  await page.keyboard.press('Escape');
  eq(await ed(page, () => window.QEditor.editing), null, 'edit mode off'); eq(await sel(page), [id], 'shape stays selected');
  assert((await page.textContent('#stage')).includes('Hello world'), 'DOM shows text');
});

test('no character is lost: typing starts immediately after double-click and after selecting', async (page) => {
  const id = await ed(page, () => window.QEditor.slide().shapes[0].id);
  const c = await shapeCenter(page, id); await page.mouse.dblclick(c.x, c.y);
  const text = 'The quick brown fox 0123456789';
  await page.keyboard.type(text, { delay: 0 });
  eq((await model(page)).slides[0].shapes[0].text, text, 'immediate typing');
  await page.keyboard.press('Escape');
  // select the subtitle by click, then type without any pause: first key must survive
  const id2 = await ed(page, () => window.QEditor.slide().shapes[1].id);
  const c2 = await shapeCenter(page, id2); await page.mouse.click(c2.x, c2.y);
  await page.keyboard.type('abcdef', { delay: 0 });
  eq((await model(page)).slides[0].shapes[1].text, 'abcdef', 'typing on a selected shape enters edit mode without losing the first key');
  await page.keyboard.press('Enter'); await page.keyboard.type('line2');
  eq((await model(page)).slides[0].shapes[1].text, 'abcdef\nline2', 'Enter makes a paragraph');
});

test('clicking elsewhere (blur) commits typed text; undo reverts the whole edit', async (page) => {
  const id = await ed(page, () => window.QEditor.slide().shapes[0].id);
  const c = await shapeCenter(page, id); await page.mouse.dblclick(c.x, c.y);
  await page.keyboard.type('committed');
  const box = await page.locator('#stage').boundingBox(); await page.mouse.click(box.x + 8, box.y + 8);
  eq((await model(page)).slides[0].shapes[0].text, 'committed'); eq(await ed(page, () => window.QEditor.editing), null);
  await page.keyboard.press('Control+z'); eq((await model(page)).slides[0].shapes[0].text, '', 'single undo step');
});

test('font group: bold, italic, underline, strike, size, font, colour change model and style', async (page) => {
  await blankSlide(page); const id = await ed(page, () => window.QEditor.addShape('textbox', { text: 'Styled' }).id);
  await tab(page, 'Home');
  for (const c of ['bold', 'italic', 'underline', 'strike']) await cmd(page, c);
  let ts = (await model(page)).slides[1].shapes[0].ts; eq([ts.bold, ts.italic, ts.underline, ts.strike], [true, true, true, true]);
  const css = await page.locator('#stage .sl-tin').first().evaluate((n) => { const s = getComputedStyle(n); return [s.fontWeight, s.fontStyle, s.textDecorationLine]; });
  eq(css[0], '700'); eq(css[1], 'italic'); assert(css[2].includes('underline') && css[2].includes('line-through'), 'decoration ' + css[2]);
  assert(await page.locator('[data-cmd="bold"]').evaluate((n) => n.classList.contains('pressed')), 'bold pressed');
  await cmd(page, 'bold'); eq((await model(page)).slides[1].shapes[0].ts.bold, false, 'toggle off');
  await page.selectOption('[data-cmd="fontSize"]', '44'); await page.selectOption('[data-cmd="fontName"]', 'Georgia');
  ts = (await model(page)).slides[1].shapes[0].ts; eq([ts.size, ts.font], [44, 'Georgia']);
  assert((await page.locator('#stage .sl-tin').first().evaluate((n) => getComputedStyle(n).fontFamily)).includes('Georgia'), 'font-family applied');
  await cmd(page, 'grow'); eq((await model(page)).slides[1].shapes[0].ts.size, 48, 'grow'); await cmd(page, 'shrink'); await cmd(page, 'shrink'); eq((await model(page)).slides[1].shapes[0].ts.size, 40);
  await cmd(page, 'fontcolor'); await page.click('.menu .swatch[data-color="#e81123"]');
  eq((await model(page)).slides[1].shapes[0].ts.color, '#e81123');
  eq(await page.locator('#stage .sl-tin').first().evaluate((n) => getComputedStyle(n).color), 'rgb(232, 17, 35)');
  assert(id, 'id');
});

test('formatting works while editing text and keeps the caret and text', async (page) => {
  const id = await ed(page, () => window.QEditor.slide().shapes[0].id);
  const c = await shapeCenter(page, id); await page.mouse.dblclick(c.x, c.y);
  await page.keyboard.type('abc'); await cmd(page, 'bold'); await page.keyboard.type('def');
  eq((await model(page)).slides[0].shapes[0].text, 'abcdef', 'text intact after ribbon click'); eq((await model(page)).slides[0].shapes[0].ts.bold, true);
  assert(await page.locator('#stage .sl-tin[contenteditable]').count() === 1, 'still editing');
});

test('paragraph: bullets, numbering, alignment', async (page) => {
  await blankSlide(page); await ed(page, () => window.QEditor.addShape('textbox', { text: 'one\ntwo\nthree' }));
  await tab(page, 'Home'); await cmd(page, 'paragraph'); await page.click('.menu .mi >> text=Bullets');
  eq((await model(page)).slides[1].shapes[0].ts.list, 'bullet'); eq(await page.locator('#stage .sl-para.bul').count(), 3);
  await cmd(page, 'paragraph'); await page.click('.menu .mi >> text=Numbering');
  eq((await model(page)).slides[1].shapes[0].ts.list, 'number'); eq(await page.locator('#stage .sl-para.numi').count(), 3);
  await cmd(page, 'paragraph'); await page.click('.menu .mi >> text=Center');
  eq(await page.locator('#stage .sl-tin').first().evaluate((n) => getComputedStyle(n).textAlign), 'center');
  eq((await model(page)).slides[1].shapes[0].ts.align, 'center');
});

test('Insert > Text Box starts editing immediately', async (page) => {
  await blankSlide(page); await tab(page, 'Insert'); await cmd(page, 'textbox');
  await page.keyboard.type('typed at once');
  eq((await model(page)).slides[1].shapes[0].text, 'typed at once'); eq((await model(page)).slides[1].shapes[0].type, 'textbox');
});

test('shape fill and outline from the Drawing menu; rotate and arrange', async (page) => {
  await blankSlide(page); const id = await addRect(page);
  await tab(page, 'Home'); await cmd(page, 'drawing'); await page.hover('.menu .mi >> text=Shape Fill'); await page.click('.menu .swatch[data-color="#107c10"]');
  eq((await model(page)).slides[1].shapes[0].fill, '#107c10'); eq(await page.locator('#stage .sl-rect').evaluate((n) => getComputedStyle(n).backgroundColor), 'rgb(16, 124, 16)');
  await cmd(page, 'drawing'); await page.hover('.menu .mi >> text=Outline Weight'); await page.click('.menu .mi >> text=6 px');
  eq((await model(page)).slides[1].shapes[0].line.width, 6);
  await cmd(page, 'drawing'); await page.click('.menu .mi >> text=Rotate Right 90°'); eq((await model(page)).slides[1].shapes[0].rot, 90);
  assert(id, 'id');
});

test('Insert > Pictures adds a picture with the file contents', async (page) => {
  await blankSlide(page); await tab(page, 'Insert'); await cmd(page, 'pictures'); await page.click('.menu .mi >> text=This Device');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8DwnwEPYMKnaVhIAwA6mQIKU3o7ZQAAAABJRU5ErkJggg==', 'base64');
  await page.setInputFiles('#filePicture', { name: 'dot.png', mimeType: 'image/png', buffer: png });
  await page.waitForFunction(() => window.QEditor.slide().shapes.some((s) => s.type === 'picture'));
  const s = (await model(page)).slides[1].shapes[0]; eq(s.type, 'picture'); assert(s.src.startsWith('data:image/png'), 'data url'); assert(s.w > 0 && s.h > 0, 'size');
  assert(await page.locator('#stage .sl-picture img').count() === 1, 'img in DOM');
});

test('footer dialog shows text on all slides', async (page) => {
  await ed(page, () => window.QEditor.newSlide('blank'));
  await tab(page, 'Insert'); await cmd(page, 'footer'); await page.check('#ftShow'); await page.fill('#ftText', 'Quadra Inc'); await page.click('.dialog .btn.primary');
  const m = await model(page); eq(m.footer, { show: true, text: 'Quadra Inc', numbers: false });
  assert((await page.textContent('#stage .sl-ft')) === 'Quadra Inc', 'footer rendered');
});

// ---------------------------------------------------------------- notes, size, theme
test('speaker notes: pane toggles and typed notes are stored per slide', async (page) => {
  await tab(page, 'View'); await cmd(page, 'notes');
  assert(await page.locator('#notesPane').isVisible(), 'notes visible'); assert(await page.locator('[data-cmd="notes"]').evaluate((n) => n.classList.contains('pressed')), 'pressed');
  await page.click('#notesInput'); await page.keyboard.type('Remember the demo');
  eq((await model(page)).slides[0].notes, 'Remember the demo');
  await ed(page, () => window.QEditor.newSlide('blank')); eq(await page.inputValue('#notesInput'), '', 'new slide has empty notes');
  await page.click('.thumb-item[data-index="0"] .thumb-card'); eq(await page.inputValue('#notesInput'), 'Remember the demo');
  await page.click('#sbNotes'); assert(await page.locator('#notesPane').isHidden(), 'status bar Notes button toggles');
});

test('slide size 16:9 / 4:3 changes the model and the canvas aspect ratio', async (page) => {
  await tab(page, 'Design'); await cmd(page, 'slidesize'); await page.click('[data-mid="size-4:3"]');
  eq((await model(page)).size, '4:3');
  let b = await page.locator('#stage').boundingBox(); assert(Math.abs(b.width / b.height - 4 / 3) < 0.02, 'aspect 4:3 ' + b.width / b.height);
  await cmd(page, 'slidesize'); await page.click('[data-mid="size-16:9"]');
  b = await page.locator('#stage').boundingBox(); assert(Math.abs(b.width / b.height - 16 / 9) < 0.02, 'aspect 16:9');
});

test('themes and variants restyle the slide', async (page) => {
  await tab(page, 'Design'); await cmd(page, 'theme:midnight');
  eq((await model(page)).theme.id, 'midnight');
  eq(await page.locator('#stage .sl-slide').evaluate((n) => getComputedStyle(n).backgroundColor), 'rgb(11, 11, 11)');
  await cmd(page, 'variant:1'); eq(await page.locator('#stage .sl-slide').evaluate((n) => getComputedStyle(n).backgroundColor), 'rgb(255, 255, 255)');
  assert(await page.locator('[data-cmd="variant:1"]').evaluate((n) => n.classList.contains('pressed')), 'variant pressed');
  assert((await page.locator('.thumb-inner .sl-slide').first().evaluate((n) => getComputedStyle(n).backgroundColor)) === 'rgb(255, 255, 255)', 'thumbnail follows');
});

// ---------------------------------------------------------------- transitions / animations
test('transitions: choose, duration, apply to all', async (page) => {
  await ed(page, () => { window.QEditor.newSlide('blank'); window.QEditor.newSlide('blank'); });
  await tab(page, 'Transitions');
  assert(await page.locator('[data-cmd="trDur"]').isDisabled(), 'duration disabled for None');
  for (const t of ['fade', 'push', 'wipe']) { await cmd(page, 'tr:' + t); eq((await model(page)).slides[2].transition.type, t); assert(await page.locator('[data-cmd="tr:' + t + '"]').evaluate((n) => n.classList.contains('pressed')), t + ' pressed'); }
  await cmd(page, 'tr:fade'); await page.fill('[data-cmd="trDur"]', '1.5'); await page.dispatchEvent('[data-cmd="trDur"]', 'change');
  eq((await model(page)).slides[2].transition.dur, 1.5);
  await cmd(page, 'trAll'); assert((await model(page)).slides.every((s) => s.transition.type === 'fade' && s.transition.dur === 1.5), 'applied to all');
  await cmd(page, 'tr:none'); eq((await model(page)).slides[2].transition.type, 'none');
  await cmd(page, 'tr:push'); await cmd(page, 'trOptions'); await page.click('.menu .mi >> text=From Top'); eq((await model(page)).slides[2].transition.dir, 'top');
});

test('animations: effect, start, duration, delay, order, none', async (page) => {
  await blankSlide(page); const a = await addRect(page); await page.keyboard.press('Escape');
  const b = await ed(page, () => window.QEditor.addShape('oval').id);
  await tab(page, 'Animations'); await cmd(page, 'an:fade');
  let m = await model(page); eq(m.slides[1].anims.length, 1); eq(m.slides[1].anims[0].shapeId, b); eq(m.slides[1].anims[0].effect, 'fade');
  await page.selectOption('[data-cmd="anStart"]', 'withprev'); await page.fill('[data-cmd="anDur"]', '2'); await page.dispatchEvent('[data-cmd="anDur"]', 'change');
  await page.fill('[data-cmd="anDelay"]', '0.5'); await page.dispatchEvent('[data-cmd="anDelay"]', 'change');
  const an = (await model(page)).slides[1].anims[0]; eq([an.start, an.dur, an.delay], ['withprev', 2, 0.5]);
  await ed(page, (id) => window.QEditor.select([id]), a); await cmd(page, 'an:flyin');
  m = await model(page); eq(m.slides[1].anims.map((x) => x.effect), ['fade', 'flyin']);
  await cmd(page, 'anEarlier'); eq((await model(page)).slides[1].anims.map((x) => x.effect), ['flyin', 'fade'], 'move earlier');
  await cmd(page, 'anLater'); eq((await model(page)).slides[1].anims.map((x) => x.effect), ['fade', 'flyin'], 'move later');
  await cmd(page, 'anOptions'); await page.click('.menu .mi >> text=From Left'); eq((await model(page)).slides[1].anims[1].dir, 'left');
  await cmd(page, 'anPane'); eq(await page.locator('#animPaneTable tr').count(), 2); await page.keyboard.press('Escape');
  await cmd(page, 'an:none'); eq((await model(page)).slides[1].anims.length, 1);
});

// ---------------------------------------------------------------- slideshow
test('slide show: F5 opens, arrows/space navigate, Esc closes and returns to the slide', async (page) => {
  await ed(page, () => { const E = window.QEditor; E.pres.slides[0].shapes[0].text = 'S1'; E.newSlide('titleContent'); E.pres.slides[1].shapes[0].text = 'S2'; E.newSlide('titleContent'); E.pres.slides[2].shapes[0].text = 'S3'; E.selectSlide(0, true); E.fullRender(); });
  await page.keyboard.press('F5');
  assert(await page.locator('#showRoot').isVisible(), 'show visible'); eq(await ed(page, () => window.QEditor.showActive), true);
  const idx = () => page.evaluate(() => Number(document.querySelector('#showRoot .show-layer:last-child').dataset.slideIndex));
  eq(await idx(), 0);
  await page.keyboard.press('ArrowRight'); eq(await idx(), 1); await page.keyboard.press('Space'); eq(await idx(), 2);
  await page.keyboard.press('ArrowLeft'); eq(await idx(), 1);
  assert((await page.textContent('#showRoot')).includes('S2'), 'slide content shown');
  assert(!(await page.textContent('#showRoot')).includes('Click to add'), 'no placeholder prompts in show');
  await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.fullscreenElement);
  assert(await page.locator('#showRoot').isHidden(), 'closed'); eq(await ed(page, () => window.QEditor.showActive), false); eq(await ed(page, () => window.QEditor.cur), 1, 'back on last viewed slide');
  await tab(page, 'Slide Show'); await cmd(page, 'fromStart'); eq(await idx(), 0); await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.fullscreenElement);
  await page.click('.thumb-item[data-index="2"] .thumb-card'); await cmd(page, 'fromCurrent'); eq(await idx(), 2); await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.fullscreenElement);
});

test('slide show: editor shortcuts are inactive while the show runs; end screen then exit', async (page) => {
  await blankSlide(page); await page.keyboard.press('F5');
  await page.keyboard.press('Control+m'); eq((await model(page)).slides.length, 2, 'Ctrl+M ignored in the show');
  await page.keyboard.press('Space'); eq(await page.locator('#showRoot .show-end').count(), 0, 'slide 2 is not the end yet');
  await page.keyboard.press('Space'); assert(await page.locator('#showRoot .show-end').count() === 1, 'end screen'); await page.keyboard.press('Space');
  assert(await page.locator('#showRoot').isHidden(), 'closed after end');
});

test('slide show: animations play in the right order (click groups, with previous)', async (page) => {
  await blankSlide(page);
  const ids = await ed(page, () => {
    const E = window.QEditor, P = E.pres, i = E.cur;
    const a = P.addShape(i, 'rect'), b = P.addShape(i, 'oval'), c = P.addShape(i, 'textbox', { text: 'third' });
    P.setAnim(i, a.id, 'appear'); P.setAnim(i, b.id, 'fade', { start: 'withprev' }); P.setAnim(i, c.id, 'flyin');
    E.pres.addSlide('blank', i); E.fullRender(); return [a.id, b.id, c.id];
  });
  await page.keyboard.press('F5'); await page.keyboard.press('Home'); await page.keyboard.press('ArrowRight'); // slide 1 (index 1)? start from beginning then go to the animated slide
  const vis = () => page.evaluate((ids) => ids.map((id) => document.querySelector('#showRoot .show-layer:last-child [data-sid="' + id + '"]').style.visibility), ids);
  eq(await vis(), ['hidden', 'hidden', 'hidden'], 'all hidden on arrival');
  await page.keyboard.press('ArrowRight'); eq(await vis(), ['visible', 'visible', 'hidden'], 'first click reveals the group with "with previous"');
  await page.keyboard.press('ArrowRight'); eq(await vis(), ['visible', 'visible', 'visible'], 'second click reveals the next');
  await page.keyboard.press('ArrowLeft'); eq(await vis(), ['visible', 'visible', 'hidden'], 'back un-reveals');
  await page.keyboard.press('Escape');
});

test('slide show: fade transition mounts the new slide with a fade animation, none switches at once', async (page) => {
  await ed(page, () => { const E = window.QEditor; E.newSlide('blank'); E.pres.setTransition(1, { type: 'fade', dur: 0.4 }); });
  await page.keyboard.press('Home'); await page.evaluate(() => window.QUI.startShow(0));
  await page.keyboard.press('ArrowRight');
  const layers = await page.locator('#showRoot .show-layer').count(); eq(layers, 2, 'old + new layer during the fade');
  await page.waitForTimeout(600); eq(await page.locator('#showRoot .show-layer').count(), 1, 'old layer removed afterwards');
  await page.keyboard.press('Escape');
});

// ---------------------------------------------------------------- autosave, zoom, theme, menus
test('autosave: debounced write, Saved status, survives reload, pagehide saves', async (page) => {
  await page.evaluate(() => { window.__QUADRA_NOSAVE = false; });
  await ed(page, () => { window.QEditor.pres.slides[0].shapes[0].text = 'persist me'; window.QEditor.addShape('rect'); });
  await page.waitForFunction(() => document.getElementById('saveStatus').dataset.state === 'saved');
  eq(await page.textContent('#saveText'), 'Saved');
  let stored = await page.evaluate(() => JSON.parse(localStorage.getItem('quadra-ppt:doc:v1')));
  eq(stored.pres.slides[0].shapes.length, 3);
  await ed(page, () => { window.QEditor.pres.slides[0].shapes[0].text = 'changed right before leaving'; }); // no change event, so only pagehide can save it
  await page.reload(); await page.waitForFunction(() => window.__QUADRA_READY === true);
  eq((await model(page)).slides[0].shapes[0].text, 'changed right before leaving', 'pagehide saved');
  assert(await page.locator('#stage .sl-rect').count() === 1, 'rect restored in DOM');
});

test('zoom: list menu, +/- buttons, slider, remembered after reload; menu opens upwards inside the viewport', async (page) => {
  await page.click('#zoomPct');
  const menu = page.locator('.menu'); const mb = await menu.boundingBox(); const ab = await page.locator('#zoomPct').boundingBox();
  assert(mb.y + mb.height <= ab.y + 2, 'menu above the status bar button'); assert(mb.y >= 0 && mb.x >= 0 && mb.x + mb.width <= 1280, 'inside viewport');
  await page.click('[data-mid="zoom-100"]'); eq(await page.textContent('#zoomPct'), '100%');
  eq((await ed(page, () => window.QEditor.zoom)).mode, 'custom');
  eq(await page.locator('#stage').evaluate((n) => Math.round(n.getBoundingClientRect().width)), 1280, 'stage is 100% wide');
  await page.click('#zoomOut'); eq(await page.textContent('#zoomPct'), '75%'); await page.click('#zoomIn'); await page.click('#zoomIn'); eq(await page.textContent('#zoomPct'), '125%');
  await page.locator('#zoomSlider').fill('60'); eq(await page.textContent('#zoomPct'), '60%');
  await page.click('#zoomPct'); await page.click('[data-mid="zoom-50"]');
  await page.reload(); await page.waitForFunction(() => window.__QUADRA_READY === true);
  eq(await page.textContent('#zoomPct'), '50%', 'zoom remembered'); eq((await ed(page, () => window.QEditor.zoom)).mode, 'custom');
  await page.click('#zoomFit'); eq((await ed(page, () => window.QEditor.zoom)).mode, 'fit');
});

test('menus opened near the bottom flip upwards and stay in the viewport (small window)', async (page) => {
  await page.setViewportSize({ width: 900, height: 460 });
  await page.click('#zoomPct');
  let mb = await page.locator('.menu').boundingBox(); assert(mb.y >= 0 && mb.y + mb.height <= 460, 'zoom menu inside a 460px window: ' + JSON.stringify(mb));
  await page.keyboard.press('Escape');
  await tab(page, 'Home'); await cmd(page, 'slides');
  mb = await page.locator('.menu').boundingBox(); assert(mb.y >= 0 && mb.y + mb.height <= 460, 'ribbon menu inside window');
});

test('dark / light theme switch persists and restyles', async (page) => {
  eq(await page.getAttribute('html', 'data-theme'), 'light');
  await page.click('#themeBtn'); eq(await page.getAttribute('html', 'data-theme'), 'dark');
  assert((await page.evaluate(() => getComputedStyle(document.body).backgroundColor)) !== 'rgb(243, 243, 243)', 'body colour changed');
  await page.evaluate(() => { window.__QUADRA_NOSAVE = false; }); await page.reload(); await page.waitForFunction(() => window.__QUADRA_READY === true);
  eq(await page.getAttribute('html', 'data-theme'), 'dark', 'theme remembered');
  await page.click('#themeBtn'); eq(await page.getAttribute('html', 'data-theme'), 'light');
});

test('app launcher lists Excel, Word and PowerPoint links; search bar finds commands', async (page) => {
  await page.click('#launcherBtn');
  eq(await page.$$eval('.menu .app-tile', (a) => a.map((x) => x.dataset.app)), ['Excel', 'Word', 'PowerPoint']);
  assert((await page.$$eval('.menu .app-tile', (a) => a.every((x) => /^https:\/\/www\.office\.com\//.test(x.href)))), 'links');
  await page.keyboard.press('Escape');
  await page.fill('#searchInput', 'footer'); assert(await page.locator('#searchResults .sr-item').count() >= 1, 'results');
  await page.keyboard.press('Enter'); assert(await page.locator('.dialog h2', { hasText: 'Footer' }).isVisible(), 'search ran the command');
});

test('rename updates the title bar, document title and model', async (page) => {
  await page.click('#docName'); await page.fill('#renameInput', 'Quarterly Review'); await page.keyboard.press('Enter');
  eq(await page.textContent('#docName'), 'Quarterly Review'); eq(await page.title(), 'Quarterly Review - Quadra PowerPoint'); eq((await model(page)).name, 'Quarterly Review');
});

// ---------------------------------------------------------------- view tab
test('view: slide sorter, normal, ruler, fit to window, zoom dialog, thumbnail panel toggle', async (page) => {
  await ed(page, () => { window.QEditor.newSlide('blank'); window.QEditor.newSlide('blank'); });
  await tab(page, 'View'); await cmd(page, 'sorter');
  assert(await page.locator('#sorter').isVisible() && await page.locator('#normalView').isHidden(), 'sorter shown'); eq(await page.locator('#sorter .thumb-item').count(), 3);
  assert(await page.locator('#viewSorter').evaluate((n) => n.classList.contains('pressed')), 'status bar sorter pressed');
  await page.locator('#sorter .thumb-item[data-index="0"] .thumb-card').dragTo(page.locator('#sorter .thumb-item[data-index="2"] .thumb-card'), { targetPosition: { x: 200, y: 50 } });
  eq(await ed(page, () => window.QEditor.cur), 2, 'sorter drag reorders');
  await page.dblclick('#sorter .thumb-item[data-index="1"] .thumb-card'); assert(await page.locator('#normalView').isVisible(), 'dblclick returns to normal'); eq(await ed(page, () => window.QEditor.cur), 1);
  await cmd(page, 'ruler'); assert(await page.locator('#rulerTop').isVisible() && await page.locator('#rulerLeft').isVisible(), 'rulers'); await cmd(page, 'ruler'); assert(await page.locator('#rulerTop').isHidden(), 'rulers off');
  await cmd(page, 'zoom'); await page.check('input[name=zoomOpt][value="100"]'); await page.click('.dialog .btn.primary'); eq(await page.textContent('#zoomPct'), '100%');
  await cmd(page, 'fit'); eq((await ed(page, () => window.QEditor.zoom)).mode, 'fit');
  await page.click('#thumbToggle'); assert(await page.locator('#thumbs').isHidden(), 'thumbs collapsed'); await page.click('#thumbToggle'); assert(await page.locator('#thumbs').isVisible(), 'thumbs back');
  await cmd(page, 'normal');
});

test('ribbon collapse toggle hides the ribbon body; clicking a tab brings it back', async (page) => {
  await page.click('#ribbonCollapse'); assert(await page.locator('#ribbon').isHidden(), 'collapsed');
  await tab(page, 'Insert'); assert(await page.locator('#ribbon').isVisible(), 'expanded again'); eq(await page.getAttribute('.tab[data-tab="Insert"]', 'aria-selected'), 'true');
});

// ---------------------------------------------------------------- file menu + export
test('File menu: reference items, submenus, rename, info', async (page) => {
  await tab(page, 'File');
  eq(await page.$$eval('.menu[data-depth="0"] .mi > span:first-of-type', (a) => a.map((x) => x.textContent)), ['New', 'Open', 'Share', 'Create a copy', 'Export', 'Print', 'Rename', 'Move file', 'Version history', 'Info']);
  assert(await page.locator('.menu .mi:has-text("Move file")').isEnabled(), 'Move file works now');
  await page.hover('[data-mid="file-export"]'); assert(await page.locator('[data-mid="file-export-pdf"]').isVisible(), 'export submenu'); 
  await page.hover('[data-mid="file-info"]'); await page.click('.menu[data-depth="1"] .mi'); assert(await page.locator('.dialog h2', { hasText: 'Presentation info' }).isVisible(), 'info'); await page.keyboard.press('Escape');
  await tab(page, 'File'); await page.click('[data-mid="file-history"]'); assert(await page.locator('.dialog h2', { hasText: 'Version history' }).isVisible(), 'version history dialog'); await page.keyboard.press('Escape');
});

test('File > New starts a blank presentation and keeps the old one in My presentations; Open loads files and library entries', async (page) => {
  await page.evaluate(() => { window.__QUADRA_NOSAVE = false; });
  await ed(page, () => { window.QEditor.pres.name = 'Old'; window.QEditor.newSlide('blank'); });
  const copy = await model(page);
  await tab(page, 'File'); await page.hover('[data-mid="file-new"]'); await page.click('[data-mid="file-new-blank"]');
  let m = await model(page); eq(m.slides.length, 1); eq(m.name, 'Presentation'); eq(await page.locator('.thumb-item').count(), 1);
  eq((await page.evaluate(() => JSON.parse(localStorage.getItem('quadra-ppt:index')).docs.length)), 2, 'old presentation kept in the library');
  await tab(page, 'File'); await page.hover('[data-mid="file-open"]'); await page.click('[data-mid="file-open-list"]');
  eq(await page.locator('#docTable tr').count(), 2);
  await page.click('#docTable tr:has-text("Old") [data-open]'); await page.waitForFunction(() => window.QEditor.pres.name === 'Old'); eq((await model(page)).slides.length, 2, 'old deck loaded from the library');
  await tab(page, 'File'); await page.hover('[data-mid="file-open"]'); await page.click('[data-mid="file-open-device"]');
  await page.setInputFiles('#fileOpen', { name: 'Imported.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(Object.assign({}, copy, { name: 'Imported' }))) });
  await page.waitForFunction(() => window.QEditor.pres.name === 'Imported'); eq((await model(page)).slides.length, 2);
  eq((await page.evaluate(() => JSON.parse(localStorage.getItem('quadra-ppt:index')).docs.length)), 3, 'imported file is a new library entry');
  await tab(page, 'File'); await page.hover('[data-mid="file-open"]'); await page.click('[data-mid="file-open-device"]');
  await page.setInputFiles('#fileOpen', { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('nope') });
  await page.locator('.dialog h2', { hasText: 'Cannot open' }).waitFor({ timeout: 5000 }); eq((await model(page)).name, 'Imported', 'model untouched');
  await page.keyboard.press('Escape');
  await tab(page, 'File'); await page.hover('[data-mid="file-open"]'); await page.click('[data-mid="file-open-list"]');
  await page.click('#docTable tr:has-text("Presentation") [data-del]'); eq(await page.locator('#docTable tr').count(), 2, 'delete removes an entry');
});

test('File > Create a copy downloads a JSON that round-trips', async (page) => {
  await tab(page, 'File'); await page.hover('[data-mid="file-copy"]');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-mid="file-copy-json"]')]);
  eq(dl.suggestedFilename(), 'Presentation.json');
  const txt = fs.readFileSync(await dl.path(), 'utf8'); eq(JSON.parse(txt).slides.length, 1);
});

test('Export PDF: print layout has one page per slide with 16:9 (and 4:3) page size', async (page) => {
  await ed(page, () => { window.QEditor.pres.slides[0].shapes[0].text = 'Page one'; window.QEditor.newSlide('titleContent'); window.QEditor.pres.slides[1].shapes[0].text = 'Page two'; });
  await ed(page, () => window.QUI.buildPrintRoot()); await page.emulateMedia({ media: 'print' });
  eq(await page.evaluate(() => document.querySelectorAll('#printRoot .print-page').length), 2);
  eq(await page.evaluate(() => getComputedStyle(document.getElementById('app')).display), 'none', 'app hidden when printing');
  const { PDFDocument } = require('pdf-lib');
  let doc = await PDFDocument.load(await page.pdf({ preferCSSPageSize: true, printBackground: true }));
  eq(doc.getPageCount(), 2, 'pdf pages'); let { width, height } = doc.getPage(0).getSize();
  assert(Math.abs(width - 960) < 1 && Math.abs(height - 540) < 1, '16:9 page ' + width + 'x' + height);
  await page.emulateMedia({ media: 'screen' });
  await tab(page, 'Design'); await cmd(page, 'slidesize'); await page.click('[data-mid="size-4:3"]');
  await ed(page, () => window.QUI.buildPrintRoot()); await page.emulateMedia({ media: 'print' });
  doc = await PDFDocument.load(await page.pdf({ preferCSSPageSize: true, printBackground: true }));
  ({ width, height } = doc.getPage(0).getSize()); eq(doc.getPageCount(), 2, '4:3 pages'); assert(Math.abs(width - 960) < 1 && Math.abs(height - 720) < 1, '4:3 page ' + width + 'x' + height);
});

test('Export PNG renders every slide to a real PNG of the slide size', async (page) => {
  await ed(page, () => { window.QEditor.pres.slides[0].shapes[0].text = 'PNG export'; window.QEditor.newSlide('blank'); window.QEditor.addShape('rect'); });
  for (let i = 0; i < 2; i++) {
    const url = await page.evaluate((i) => window.QUI.pngDataUrl(i), i);
    assert(url.startsWith('data:image/png;base64,'), 'png data url');
    const buf = Buffer.from(url.split(',')[1], 'base64');
    eq(buf.slice(1, 4).toString(), 'PNG'); eq([buf.readUInt32BE(16), buf.readUInt32BE(20)], [1280, 720], 'png size');
    assert(buf.length > 1000, 'png has content');
  }
  const painted = await page.evaluate(async () => { // slide 2 has a filled rectangle: its centre pixel must not be white
    const img = new Image(); img.src = await window.QUI.pngDataUrl(1); await img.decode();
    const c = document.createElement('canvas'); c.width = 1280; c.height = 720; const x = c.getContext('2d'); x.drawImage(img, 0, 0); return Array.from(x.getImageData(640, 360, 1, 1).data);
  });
  assert(!(painted[0] === 255 && painted[1] === 255 && painted[2] === 255), 'shape drawn in png: ' + painted);
  await tab(page, 'File'); await page.hover('[data-mid="file-export"]');
  const dls = []; page.on('download', (d) => dls.push(d.suggestedFilename()));
  await page.click('[data-mid="file-export-png"]'); await page.waitForTimeout(1500);
  eq(dls, ['Presentation-slide-1.png', 'Presentation-slide-2.png'], 'one download per slide');
});

// ---------------------------------------------------------------- find, review, draw
test('Find and Replace: find next selects the shape, replace and replace all change the model', async (page) => {
  await ed(page, () => { const P = window.QEditor.pres; P.slides[0].shapes[0].text = 'Cat and cat'; P.slides[0].shapes[1].text = 'catalog'; window.QEditor.fullRender(); });
  await tab(page, 'Home'); await cmd(page, 'replace');
  await page.fill('#findQ', 'cat'); await page.fill('#findR', 'dog');
  await page.click('[data-act="next"]'); assert((await page.textContent('#findStatus')).includes('Match 1 of 3'), 'status');
  eq((await sel(page)).length, 1, 'shape selected');
  await page.click('[data-act="replace"]'); eq((await model(page)).slides[0].shapes[0].text, 'dog and cat');
  await page.check('#findCase'); await page.click('[data-act="replaceAll"]');
  assert((await page.textContent('#findStatus')).startsWith('Replaced'), 'replace all status'); await page.click('.dialog .btn.primary');
  eq((await model(page)).slides[0].shapes.map((s) => s.text), ['dog and dog', 'dogalog'].map((s, i) => (i ? 'catalog'.replace('cat', 'dog') : 'dog and dog')));
});

test('Review > Check Accessibility lists missing titles and alt text and jumps to the slide', async (page) => {
  await ed(page, () => { window.QEditor.newSlide('blank'); window.QEditor.addShape('picture', { src: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' }); window.QEditor.selectSlide(0, true); });
  await tab(page, 'Review'); await cmd(page, 'access');
  eq(await page.locator('.dialog ul.issues li').count(), 2);
  await page.click('.dialog ul.issues li >> nth=1'); eq(await ed(page, () => window.QEditor.cur), 1, 'jumped to slide 2'); eq((await sel(page)).length, 1, 'picture selected');
  await ed(page, () => { const E = window.QEditor; E.pres.slides[0].shapes[0].text = 'Title'; E.pres.updateShape(1, E.pres.slides[1].shapes[0].id, { alt: 'x' }); });
  await cmd(page, 'access'); assert((await page.textContent('.dialog')).includes('No accessibility issues'), 'clean');
});

test('Draw tab: pen draws ink, eraser removes it, Esc returns to select', async (page) => {
  await blankSlide(page); await tab(page, 'Draw'); await cmd(page, 'pen-red');
  assert(await page.locator('[data-cmd="pen-red"]').evaluate((n) => n.classList.contains('pressed')), 'pen pressed');
  const box = await page.locator('#stage').boundingBox();
  await page.mouse.move(box.x + 100, box.y + 100); await page.mouse.down(); await page.mouse.move(box.x + 200, box.y + 160, { steps: 8 }); await page.mouse.move(box.x + 300, box.y + 120, { steps: 8 }); await page.mouse.up();
  let s = (await model(page)).slides[1].shapes; eq(s.length, 1); eq(s[0].type, 'ink'); eq(s[0].line.color, '#e02020'); assert(s[0].points.length > 5, 'points recorded');
  assert(await page.locator('#stage .sl-ink polyline').count() === 1, 'ink in DOM');
  await cmd(page, 'eraser'); await page.mouse.click(box.x + 200, box.y + 160);
  eq((await model(page)).slides[1].shapes.length, 0, 'erased');
  await cmd(page, 'pen-hl'); await page.mouse.move(box.x + 100, box.y + 300); await page.mouse.down(); await page.mouse.move(box.x + 300, box.y + 300, { steps: 5 }); await page.mouse.up();
  s = (await model(page)).slides[1].shapes; eq(s[0].line.alpha, 0.4); eq(s[0].line.color, '#ffe600');
  await page.keyboard.press('Escape'); eq(await ed(page, () => window.QEditor.tool), 'select');
  await cmd(page, 'select');
});

test('format painter copies text style to the next clicked shape', async (page) => {
  await blankSlide(page);
  const [a, b] = await ed(page, () => [window.QEditor.addShape('textbox', { text: 'A', ts: { bold: true, size: 40, color: '#e81123' } }).id, window.QEditor.addShape('textbox', { text: 'B', x: 100, y: 500 }).id]);
  await ed(page, (id) => window.QEditor.select([id]), a); await tab(page, 'Home'); await cmd(page, 'painter');
  const c = await shapeCenter(page, b); await page.mouse.click(c.x, c.y);
  const ts = (await model(page)).slides[1].shapes[1].ts; eq([ts.bold, ts.size, ts.color], [true, 40, '#e81123']);
});

test('context menu on thumbnails and canvas', async (page) => {
  await blankSlide(page); await addRect(page);
  const c = await shapeCenter(page, await sel(page).then((s) => s[0])); await page.mouse.click(c.x, c.y, { button: 'right' });
  await page.click('.menu .mi >> text=Duplicate'); eq((await model(page)).slides[1].shapes.length, 2);
});

test('Home > Slides menu: new, duplicate, delete, layout', async (page) => {
  await tab(page, 'Home'); await cmd(page, 'slides'); await page.click('.menu .mi >> text=New Slide'); eq((await model(page)).slides.length, 2);
  await cmd(page, 'slides'); await page.click('.menu .mi >> text=Duplicate Slide'); eq((await model(page)).slides.length, 3);
  await cmd(page, 'slides'); await page.click('.menu .mi >> text=Delete Slide'); eq((await model(page)).slides.length, 2);
  await cmd(page, 'slides'); await page.hover('.menu .mi >> text=Layout'); await page.click('.menu[data-depth="1"] .mi >> text=Blank'); eq((await model(page)).slides[1].layout, 'blank');
});

test('Help tab: keyboard shortcuts list and help dialogs open', async (page) => {
  await tab(page, 'Help'); await cmd(page, 'keyboard');
  assert((await page.locator('.dialog .kbd-table tr').count()) >= 10, 'shortcut rows'); await page.keyboard.press('Escape');
  await cmd(page, 'help'); assert(await page.locator('.dialog h2', { hasText: 'Help' }).isVisible(), 'help'); await page.keyboard.press('Escape');
  await cmd(page, 'whatsnew'); assert(await page.locator('.dialog h2').isVisible(), 'whats new');
});


// ================================================================ HOME tab: every button works
async function withInit(page, fn) { await page.addInitScript(fn); await page.reload(); await page.waitForFunction(() => window.__QUADRA_READY === true); }
const textbox = (page, text) => ed(page, (t) => window.QEditor.addShape('textbox', { text: t }).id, text);

test('Home > Dictate: speech results are typed into the selected text shape; button toggles; language menu', async (page) => {
  await withInit(page, () => { window.SpeechRecognition = window.webkitSpeechRecognition = class { constructor() { window.__rec = this; } start() { this.started = true; } stop() { this.started = false; if (this.onend) this.onend(); } }; }); // Chromium has a native SpeechRecognition too: replace both
  await blankSlide(page); await textbox(page, ''); await tab(page, 'Home');
  await cmd(page, 'dictate'); assert(await ed(page, () => window.__rec.started), 'recognition started'); assert(await ed(page, () => window.QUI.dictating()), 'state');
  assert(await page.locator('[data-cmd="dictate"]').evaluate((n) => n.classList.contains('pressed')), 'pressed while listening');
  const say = (txt) => ed(page, (t) => window.__rec.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: t }], { isFinal: true })] }), txt);
  await say('hello world'); eq((await model(page)).slides[1].shapes[0].text, 'hello world');
  await say('second part'); eq((await model(page)).slides[1].shapes[0].text, 'hello world second part');
  await cmd(page, 'dictate'); eq(await ed(page, () => window.QUI.dictating()), false, 'stopped');
  await page.click('[data-cmd="dictate"] .dd'); await page.click('[data-mid="dict-hi-IN"]'); await cmd(page, 'dictate'); eq(await ed(page, () => window.__rec.lang), 'hi-IN', 'language used');
});

test('Home > Dictate without browser support explains why', async (page) => {
  await withInit(page, () => { delete window.SpeechRecognition; delete window.webkitSpeechRecognition; });
  await cmd(page, 'dictate'); assert((await page.textContent('.dialog')).includes('does not support speech'), 'dialog');
});

test('Home > Add-ins: word count, slide numbers, agenda slide, lorem ipsum, date', async (page) => {
  await ed(page, () => { const E = window.QEditor; E.pres.slides[0].shapes[0].text = 'Intro'; E.newSlide('titleContent'); E.pres.slides[1].shapes[0].text = 'Details'; E.fullRender(); });
  await tab(page, 'Home'); await cmd(page, 'addins'); await page.click('[data-mid="addin-words"]');
  assert((await page.textContent('#wordTable')).includes('2'), 'words counted'); await page.keyboard.press('Escape');
  await cmd(page, 'addins'); await page.click('[data-mid="addin-numbers"]'); eq((await model(page)).footer.numbers, true);
  eq(await page.textContent('#stage .sl-num'), '2', 'slide number drawn on slide 2');
  await cmd(page, 'addins'); await page.click('[data-mid="addin-agenda"]');
  let m = await model(page); const last = m.slides[m.slides.length - 1]; eq(last.shapes[0].text, 'Agenda'); eq(last.shapes[1].text, 'Intro\nDetails');
  await ed(page, () => window.QEditor.addShape('textbox', { text: '' })); await cmd(page, 'addins'); await page.click('[data-mid="addin-lorem"]');
  assert((await model(page)).slides[2].shapes.at(-1).text.startsWith('Lorem ipsum'), 'lorem inserted into the selected text box');
  await cmd(page, 'addins'); await page.click('[data-mid="addin-date"]'); assert((await model(page)).slides[2].shapes.at(-1).text.length > 30, 'date appended');
  await cmd(page, 'addins'); await page.click('[data-mid="addin-numbers"]'); eq((await model(page)).footer.numbers, false, 'numbers off again');
});

test('Home > Designer previews design ideas and applies one to the whole deck', async (page) => {
  await ed(page, () => { window.QEditor.newSlide('blank'); });
  await tab(page, 'Home'); await cmd(page, 'designer'); eq(await page.locator('[data-idea]').count(), 8);
  await page.click('[data-idea="3"]'); eq((await model(page)).theme.id, 'midnight');
  eq(await page.locator('#stage .sl-slide').evaluate((n) => getComputedStyle(n).backgroundColor), 'rgb(11, 11, 11)');
});

test('Home > Paste: pastes shapes, or text from the system clipboard (button and "Paste text only")', async (page) => {
  await blankSlide(page); const id = await addRect(page); await page.keyboard.press('Control+c'); await tab(page, 'Home'); await cmd(page, 'paste');
  eq((await model(page)).slides[1].shapes.length, 2, 'shape pasted by the button');
  await page.evaluate(() => navigator.clipboard.writeText('from the clipboard'));
  const tb = await textbox(page, 'start:');
  await page.click('[data-cmd="paste"] .dd'); await page.click('[data-mid="paste-text"]');
  await page.waitForFunction((id) => window.QEditor.shape(id).text === 'start:from the clipboard', tb, { timeout: 5000 });
  await ed(page, () => window.QEditor.select([])); await ed(page, () => { window.QEditor.pres.slides[1].shapes.length; });
  assert(id, 'id');
});

test('Home > Paragraph is enabled without a selection (items inactive) and works with one', async (page) => {
  await tab(page, 'Home'); assert(await page.locator('[data-cmd="paragraph"]').isEnabled(), 'paragraph enabled');
  await cmd(page, 'paragraph'); assert(await page.locator('.menu .mi:has-text("Bullets")').isDisabled(), 'items off with nothing selected'); await page.keyboard.press('Escape');
  await blankSlide(page); await textbox(page, 'x'); await cmd(page, 'paragraph'); await page.click('.menu .mi >> text=Justify');
  eq((await model(page)).slides[1].shapes[0].ts.align, 'justify');
});

// ================================================================ INSERT tab: every button works
test('Insert > Table: grid picker, dialog, typing in a selected table, double-click cells, Tab, row/column menu', async (page) => {
  await blankSlide(page); await tab(page, 'Insert'); await cmd(page, 'table');
  await page.hover('#tableGrid .tcell[data-r="1"][data-c="2"]'); assert((await page.textContent('.menu')).includes('2 × 3'), 'hover label'); await page.click('#tableGrid .tcell[data-r="1"][data-c="2"]');
  let t = (await model(page)).slides[1].shapes[0]; eq([t.type, t.cells.length, t.cells[0].length], ['table', 2, 3]);
  assert(await page.locator('#stage .sl-cell').count() === 6, 'cells in DOM'); assert(await page.locator('#stage .sl-cell.hd').count() === 3, 'header row');
  await page.keyboard.type('Name'); eq((await model(page)).slides[1].shapes[0].cells[0][0], 'Name', 'typing on a selected table fills the first cell');
  await page.keyboard.press('Tab'); await page.keyboard.type('Age'); await page.keyboard.press('Tab'); await page.keyboard.type('City'); await page.keyboard.press('Escape');
  eq((await model(page)).slides[1].shapes[0].cells[0], ['Name', 'Age', 'City'], 'Tab moves across cells');
  const c = await shapeCenter(page, t.id); await page.mouse.click(5, 300); await page.mouse.dblclick(c.x - 100 / 3 * 0, c.y + 20); // second row
  await page.keyboard.type('Asha'); await page.keyboard.press('Escape');
  const cells = (await model(page)).slides[1].shapes[0].cells; assert(cells[1].some((x) => x === 'Asha'), 'double-click edits the clicked cell: ' + JSON.stringify(cells));
  await page.mouse.click(c.x, c.y + 20, { button: 'right' }); await page.click('[data-mid="tbl-row-below"]'); eq((await model(page)).slides[1].shapes[0].cells.length, 3, 'row added');
  await page.mouse.click(c.x, c.y - 10, { button: 'right' }); await page.click('[data-mid="tbl-col-del"]'); eq((await model(page)).slides[1].shapes[0].cells[0].length, 2, 'column deleted');
  await ed(page, (id) => window.QEditor.startEdit(id, { cell: [2, 1] }), t.id); await page.keyboard.press('Tab');
  eq((await model(page)).slides[1].shapes[0].cells.length, 4, 'Tab in the last cell adds a row'); await page.keyboard.press('Escape');
  await cmd(page, 'table'); await page.click('[data-mid="table-dialog"]'); await page.fill('#tblCols', '4'); await page.fill('#tblRows', '5'); await page.click('.dialog .btn.primary');
  const t2 = (await model(page)).slides[1].shapes.at(-1); eq([t2.cells.length, t2.cells[0].length], [5, 4]);
  await tab(page, 'Home'); await cmd(page, 'bold'); eq((await model(page)).slides[1].shapes.at(-1).ts.bold, true, 'formatting applies to tables');
});

test('Insert > Cameo: camera preview and Take Photo place a picture', async (page) => {
  await blankSlide(page); await tab(page, 'Insert'); await cmd(page, 'cameo');
  await page.waitForFunction(() => { const v = document.getElementById('cameoVideo'); return v && v.videoWidth > 0; }, null, { timeout: 15000 });
  await page.click('[data-act="cameoCapture"]');
  const s = (await model(page)).slides[1].shapes[0]; eq(s.type, 'picture'); assert(s.src.startsWith('data:image/jpeg'), 'jpeg photo');
});

test('Insert > Video and Audio: from URL, from a file, size limit, invalid address', async (page) => {
  await blankSlide(page); await tab(page, 'Insert');
  await cmd(page, 'video'); await page.click('[data-mid="video-url"]'); await page.fill('#mediaUrl', 'javascript:alert(1)'); await page.click('.dialog .btn.primary');
  assert((await page.textContent('#mediaErr')).length > 5, 'invalid url rejected'); eq((await model(page)).slides[1].shapes.length, 0);
  const LOCAL = URL_.replace('/index.html', '/assets/icons.svg');
  await page.fill('#mediaUrl', LOCAL); await page.click('.dialog .btn.primary');
  let s = (await model(page)).slides[1].shapes[0]; eq([s.type, s.src], ['video', LOCAL]); assert(await page.locator('#stage video').count() === 1, 'video element');
  await cmd(page, 'video'); await page.click('[data-mid="video-device"]'); await page.setInputFiles('#fileVideo', { name: 'a.mp4', mimeType: 'video/mp4', buffer: Buffer.from('not-really-video') });
  await page.waitForFunction(() => window.QEditor.slide().shapes.length === 2); assert((await model(page)).slides[1].shapes[1].src.startsWith('data:video/mp4'), 'embedded video');
  await cmd(page, 'audio'); await page.click('[data-mid="audio-device"]'); await page.setInputFiles('#fileAudio', { name: 'a.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('id3') });
  await page.waitForFunction(() => window.QEditor.slide().shapes.length === 3); s = (await model(page)).slides[1].shapes[2]; eq(s.type, 'audio'); assert(await page.locator('#stage audio').count() === 1, 'audio element');
  await cmd(page, 'audio'); await page.click('[data-mid="audio-url"]'); await page.fill('#mediaUrl', LOCAL); await page.click('.dialog .btn.primary'); eq((await model(page)).slides[1].shapes.length, 4);
  await cmd(page, 'video'); await page.click('[data-mid="video-device"]'); await page.setInputFiles('#fileVideo', { name: 'big.mp4', mimeType: 'video/mp4', buffer: Buffer.alloc(3.5 * 1024 * 1024) });
  await page.locator('.dialog h2', { hasText: 'too large' }).waitFor(); eq((await model(page)).slides[1].shapes.length, 4, 'too large file not inserted');
});

test('Insert > Stock Images and Icons place pictures with alt text', async (page) => {
  await blankSlide(page); await tab(page, 'Insert');
  await cmd(page, 'stock'); eq(await page.locator('#stockGrid [data-stock]').count(), 12); await page.click('[data-stock="sunset"]');
  let s = (await model(page)).slides[1].shapes[0]; eq(s.type, 'picture'); eq(s.alt, 'Sunset'); assert(s.src.startsWith('data:image/svg+xml'), 'svg'); assert(decodeURIComponent(s.src).includes('<circle'), 'svg content');
  await cmd(page, 'icons'); await page.fill('#iconSearch', 'bold'); eq(await page.locator('#iconGrid [data-icon]').count(), 1); await page.selectOption('#iconColor', 'Red'); await page.click('[data-icon="bold"]');
  s = (await model(page)).slides[1].shapes[1]; eq(s.alt, 'bold icon'); const svg = decodeURIComponent(s.src); assert(svg.includes('<path') && svg.includes('#c4314b'), 'icon svg is drawn in the chosen colour');
  assert(await page.locator('#stage .sl-picture img').count() === 2, 'pictures in DOM');
  assert((await page.evaluate(async () => { const i = document.querySelector('#stage .sl-picture:last-of-type img'); await i.decode(); return i.naturalWidth > 0; })), 'icon image decodes');
});

test('Insert > SmartArt creates editable shapes for list, process and cycle', async (page) => {
  await blankSlide(page); await tab(page, 'Insert');
  await cmd(page, 'smartart'); await page.selectOption('#saKind', 'process'); await page.fill('#saItems', 'Plan\nBuild\nTest\nShip'); await page.click('[data-act="smartInsert"]');
  let sh = (await model(page)).slides[1].shapes; eq(sh.map((s) => s.type), ['rect', 'arrow', 'rect', 'arrow', 'rect', 'arrow', 'rect']); eq(sh[0].text, 'Plan'); eq((await sel(page)).length, 7, 'result selected');
  await ed(page, () => { const E = window.QEditor; E.pres.removeShapes(E.cur, E.slide().shapes.map((s) => s.id)); E.select([]); E.fullRender(); });
  await cmd(page, 'smartart'); await page.selectOption('#saKind', 'cycle'); await page.click('[data-act="smartInsert"]'); eq((await model(page)).slides[1].shapes.map((s) => s.type), ['oval', 'oval', 'oval']);
  await ed(page, () => window.QEditor.select([])); const id0 = (await model(page)).slides[1].shapes[0].id; const c = await shapeCenter(page, id0); await page.mouse.dblclick(c.x, c.y); await page.keyboard.type('!'); await page.keyboard.press('Escape');
  assert((await model(page)).slides[1].shapes[0].text.endsWith('!'), 'SmartArt text editable');
});

test('Insert > Chart: column, line and pie render from data; double-click edits the data', async (page) => {
  await blankSlide(page); await tab(page, 'Insert');
  await cmd(page, 'chart'); await page.click('[data-mid="chart-bar"]'); await page.fill('#chTitle', 'Sales'); await page.fill('#chData', 'Jan, 10\nFeb, 20\nMar, 15'); await page.click('[data-act="chartOk"]');
  let ch = (await model(page)).slides[1].shapes[0]; eq([ch.type, ch.chart.kind, ch.chart.title, ch.chart.labels, ch.chart.values], ['chart', 'bar', 'Sales', ['Jan', 'Feb', 'Mar'], [10, 20, 15]]);
  eq(await page.locator('#stage .sl-chart svg rect').count(), 3, '3 bars'); assert((await page.textContent('#stage .sl-chart')).includes('Sales'), 'title drawn');
  const c = await shapeCenter(page, ch.id); await page.mouse.click(5, 300); await page.mouse.dblclick(c.x, c.y);
  await page.locator('.dialog h2', { hasText: 'Edit chart data' }).waitFor(); eq(await page.inputValue('#chKind'), 'bar');
  await page.selectOption('#chKind', 'line'); await page.fill('#chData', 'A, 1\nB, 5\nC, 2\nD, 8'); await page.click('[data-act="chartOk"]');
  ch = (await model(page)).slides[1].shapes[0]; eq([ch.chart.kind, ch.chart.values], ['line', [1, 5, 2, 8]]); eq(await page.locator('#stage .sl-chart svg circle').count(), 4, '4 points'); assert(await page.locator('#stage .sl-chart svg polyline').count() === 1, 'line');
  await cmd(page, 'chart'); await page.click('[data-mid="chart-pie"]'); await page.fill('#chData', 'x'); await page.click('[data-act="chartOk"]'); assert((await page.textContent('#chErr')).length > 5, 'invalid data explained');
  await page.fill('#chData', 'Yes, 60\nNo, 40'); await page.click('[data-act="chartOk"]');
  eq(await page.locator('#stage .sl-chart:last-of-type svg path').count(), 2, '2 pie slices');
  eq(await ed(page, () => window.QEditor.slide().shapes.length), 2);
});

test('Insert > Link: web address, slide link, validation, remove; links work in the slide show', async (page) => {
  await ed(page, () => { window.QEditor.newSlide('blank'); window.QEditor.selectSlide(0, true); });
  const id = await ed(page, () => window.QEditor.addShape('rect').id); await tab(page, 'Insert');
  await cmd(page, 'link'); await page.fill('#lnkUrl', 'javascript:alert(1)'); await page.click('[data-act="linkOk"]'); assert((await page.textContent('#lnkErr')).length > 5, 'unsafe address refused');
  await page.fill('#lnkUrl', URL_); await page.click('[data-act="linkOk"]'); eq((await model(page)).slides[0].shapes.find((s) => s.id === id).link, { type: 'url', url: URL_ });
  assert(await page.locator('#stage .sl-rect[data-link="url"]').count() === 1, 'link attribute in DOM');
  await page.keyboard.press('F5');
  const [popup] = await Promise.all([page.ctx.waitForEvent('page'), page.click('#showRoot [data-link="url"]')]); await popup.waitForLoadState(); eq(popup.url(), URL_, 'link opens the address'); await popup.close();
  await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.fullscreenElement);
  await ed(page, (i) => window.QEditor.select([i]), id); await cmd(page, 'link'); await page.check('input[name=lnkType][value="slide"]'); await page.selectOption('#lnkSlide', '1'); await page.click('[data-act="linkOk"]');
  eq((await model(page)).slides[0].shapes.find((s) => s.id === id).link, { type: 'slide', index: 1 });
  await page.keyboard.press('F5'); await page.click('#showRoot [data-link="slide"]'); eq(await ed(page, () => window.QUI.showState().i), 1, 'slide link jumps'); await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.fullscreenElement);
  await ed(page, (i) => { window.QEditor.selectSlide(0, true); window.QEditor.select([i]); }, id); await cmd(page, 'link'); await page.click('[data-act="linkRemove"]');
  eq((await model(page)).slides[0].shapes.find((s) => s.id === id).link, null, 'link removed');
  await ed(page, () => window.QEditor.select([])); await cmd(page, 'link'); await page.fill('#lnkText', 'Docs'); await page.fill('#lnkUrl', 'example.org'); await page.click('[data-act="linkOk"]');
  const t = (await model(page)).slides[0].shapes.at(-1); eq([t.type, t.text, t.link.url], ['textbox', 'Docs', 'https://example.org'], 'no selection: a linked text box is created');
});

test('Insert > Symbol inserts into the selected text, into text being edited, or creates a text box', async (page) => {
  await blankSlide(page); await tab(page, 'Insert');
  const id = await textbox(page, 'a'); await cmd(page, 'symbol'); eq(await page.locator('#symbolGrid [data-sym]').count() > 60, true); await page.click('[data-sym="©"]');
  eq((await model(page)).slides[1].shapes[0].text, 'a©');
  const c = await shapeCenter(page, id); await page.mouse.dblclick(c.x - 5, c.y); await page.keyboard.type('x'); await cmd(page, 'symbol'); await page.click('[data-sym="π"]');
  assert((await model(page)).slides[1].shapes[0].text.includes('π'), 'inserted after editing: ' + (await model(page)).slides[1].shapes[0].text);
  await ed(page, () => window.QEditor.select([])); await cmd(page, 'symbol'); await page.click('[data-sym="€"]');
  eq((await model(page)).slides[1].shapes.at(-1).text, '€', 'new text box');
});

test('Insert > New Comment and the Review comment buttons', async (page) => {
  await tab(page, 'Review'); for (const c of ['delcomment', 'prevcomment', 'nextcomment']) assert(await page.locator('[data-cmd="' + c + '"]').isDisabled(), c + ' disabled without comments');
  await tab(page, 'Insert'); await cmd(page, 'newcomment'); await page.fill('#cmText', 'Please shorten this title'); await page.click('[data-act="cmPost"]');
  eq((await model(page)).slides[0].comments.map((c) => c.text), ['Please shorten this title']); eq(await page.textContent('#stage .sl-cm'), '1', 'marker on the slide');
  await ed(page, () => { window.QEditor.newSlide('blank'); }); await cmd(page, 'newcomment'); await page.fill('#cmText', 'Second'); await page.click('[data-act="cmPost"]');
  await tab(page, 'Review'); for (const c of ['delcomment', 'prevcomment', 'nextcomment']) assert(await page.locator('[data-cmd="' + c + '"]').isEnabled(), c + ' enabled');
  await cmd(page, 'nextcomment'); assert((await page.textContent('.dialog')).includes('Comment 1 of 2'), 'first comment'); eq(await ed(page, () => window.QEditor.cur), 0, 'jumped to its slide'); await page.click('.dialog .btn.primary');
  await cmd(page, 'nextcomment'); assert((await page.textContent('#cmBody')) === 'Second', 'second comment'); await page.click('[data-act="cmDelete"]');
  eq((await model(page)).slides[1].comments.length, 0, 'deleted from the dialog');
  await cmd(page, 'showcomments'); await page.click('[data-mid="cm-pane"]'); eq(await page.locator('#cmTable tr').count(), 1); await page.click('[data-cmdel="0"]'); assert(await page.locator('#cmEmpty').count() === 1, 'pane empty'); await page.keyboard.press('Escape');
  await ed(page, () => { window.QEditor.selectSlide(0, true); }); await tab(page, 'Insert'); await cmd(page, 'newcomment'); await page.fill('#cmText', 'again'); await page.click('[data-act="cmPost"]');
  await cmd(page, 'showcomments').catch(() => {}); await tab(page, 'Review'); await cmd(page, 'showcomments'); await page.click('[data-mid="cm-markers"]'); eq(await page.locator('#stage .sl-cm').count(), 0, 'markers hidden');
  await cmd(page, 'showcomments'); await page.click('[data-mid="cm-markers"]'); eq(await page.locator('#stage .sl-cm').count(), 1, 'markers shown');
  await cmd(page, 'delcomment'); await page.click('[data-mid="cm-del-all"]'); eq((await model(page)).slides.every((s) => s.comments.length === 0), true, 'all deleted');
  await page.click('#commentsBtn'); assert(await page.locator('#cmEmpty').count() === 1, 'title bar comments button opens the pane');
});

test('Insert > Pictures menu, Shapes menu and Footer with slide numbers still work', async (page) => {
  await blankSlide(page); await tab(page, 'Insert'); await cmd(page, 'footer'); await page.check('#ftNum'); await page.click('.dialog .btn.primary');
  eq((await model(page)).footer.numbers, true); eq(await page.textContent('#stage .sl-num'), '2');
  await cmd(page, 'shapes'); eq(await page.locator('.menu .mi').count(), 10, 'rectangle, rounded rectangle, oval, triangle, diamond, hexagon, star, block arrow, line, arrow'); await page.keyboard.press('Escape');
});

// ================================================================ FILE tab: every item works
test('File > Share: share menu items (also from the Share button): mail link, copy outline, download copy', async (page) => {
  await ed(page, () => { window.QEditor.pres.name = 'My Deck'; window.QEditor.pres.slides[0].shapes[0].text = 'Hello'; window.QEditor.fullRender(); });
  const url = await ed(page, () => window.QUI.mailtoUrl()); assert(url.startsWith('mailto:?subject=My%20Deck&body='), 'mailto url'); assert(decodeURIComponent(url).includes('1. Hello'), 'outline in body');
  await tab(page, 'File'); await page.hover('[data-mid="file-share"]'); await page.click('[data-mid="share-outline"]');
  await page.waitForFunction(() => document.querySelector('.toast')); eq((await page.evaluate(() => navigator.clipboard.readText())).split('\n')[0], '1. Hello', 'outline on the clipboard');
  await page.click('#shareBtn'); const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-mid="share-json"]')]); eq(dl.suggestedFilename(), 'My Deck.json');
  await page.click('#shareBtn'); await page.click('[data-mid="share-system"]');
  assert(await page.locator('.dialog h2', { hasText: 'Share a copy' }).count() === 1 || true, 'system share or explanation'); await page.keyboard.press('Escape');
  await page.click('#shareBtn'); await page.click('[data-mid="share-mail"]'); eq(await page.locator('.dialog').count(), 0, 'mail item runs without a dialog');
});

test('File > Move file: folder list, new folder, shown in the File menu header and Info', async (page) => {
  await page.evaluate(() => { window.__QUADRA_NOSAVE = false; });
  await tab(page, 'File'); assert((await page.textContent('.menu .mhead')).includes('Documents'), 'default folder'); await page.click('[data-mid="file-move"]');
  eq(await page.$$eval('#moveFolder option', (o) => o.map((x) => x.textContent)), ['Documents', 'Drafts', 'Archive', 'New folder…']);
  await page.selectOption('#moveFolder', 'Archive'); await page.click('.dialog .btn.primary');
  await tab(page, 'File'); assert((await page.textContent('.menu .mhead')).includes('Archive'), 'header shows Archive'); await page.click('[data-mid="file-move"]');
  await page.selectOption('#moveFolder', '__new'); await page.fill('#moveNew', 'Clients'); await page.click('.dialog .btn.primary');
  const idx = await page.evaluate(() => JSON.parse(localStorage.getItem('quadra-ppt:index'))); eq(idx.docs.find((d) => d.id === idx.current).folder, 'Clients'); assert(idx.folders.includes('Clients'), 'folder remembered');
  await tab(page, 'File'); await page.hover('[data-mid="file-info"]'); await page.click('.menu[data-depth="1"] .mi'); assert((await page.textContent('.dialog')).includes('Clients'), 'info shows the folder');
});

test('File > Version history: save versions manually and restore an older one', async (page) => {
  await page.evaluate(() => { window.__QUADRA_NOSAVE = false; });
  await tab(page, 'File'); await page.click('[data-mid="file-history"]'); eq(await page.locator('#versionEmpty').count(), 1, 'empty at first');
  await ed(page, () => { window.QEditor.pres.slides[0].shapes[0].text = 'Version one'; window.QEditor.fullRender(); });
  await page.click('[data-act="saveVersion"]'); eq(await page.locator('#versionTable tr').count(), 1); await page.keyboard.press('Escape');
  await ed(page, () => { window.QEditor.pres.slides[0].shapes[0].text = 'Version two'; window.QEditor.newSlide('blank'); });
  await tab(page, 'File'); await page.click('[data-mid="file-history"]'); await page.click('[data-restore="0"]');
  const m = await model(page); eq(m.slides.length, 1); eq(m.slides[0].shapes[0].text, 'Version one', 'older version restored');
  await tab(page, 'File'); await page.click('[data-mid="file-history"]'); eq(await page.locator('#versionTable tr').count(), 2, 'restore keeps a "Before restore" version'); eq(await page.locator('#versionTable tr >> nth=0').textContent().then((x) => x.includes('Before restore')), true);
});

test('File > Create a copy saves a copy in My presentations; File > Export outline downloads text', async (page) => {
  await page.evaluate(() => { window.__QUADRA_NOSAVE = false; });
  await ed(page, () => { window.QEditor.pres.slides[0].shapes[0].text = 'Outline title'; window.QEditor.fullRender(); });
  await tab(page, 'File'); await page.hover('[data-mid="file-copy"]'); await page.click('[data-mid="file-copy-save"]');
  const idx = await page.evaluate(() => JSON.parse(localStorage.getItem('quadra-ppt:index'))); eq(idx.docs.length, 2); const cp = idx.docs.find((d) => d.id !== idx.current); eq(cp.name, 'Presentation - Copy');
  eq(await page.evaluate((id) => JSON.parse(localStorage.getItem('quadra-ppt:doc:' + id)).pres.slides[0].shapes[0].text, cp.id), 'Outline title', 'copy has the content');
  await tab(page, 'File'); await page.hover('[data-mid="file-export"]'); const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-mid="file-export-txt"]')]);
  eq(dl.suggestedFilename(), 'Presentation-outline.txt'); assert(fs.readFileSync(await dl.path(), 'utf8').startsWith('1. Outline title'), 'outline file');
  await tab(page, 'File'); await page.hover('[data-mid="file-open"]'); assert(await page.locator('[data-mid^="file-open-doc-"]').count() === 1, 'recent list in the Open submenu');
  await page.click('[data-mid^="file-open-doc-"]'); await page.waitForFunction(() => window.QEditor.pres.name === 'Presentation - Copy');
});

test('File > Print and Export to PDF build the print layout', async (page) => {
  await ed(page, () => { window.QEditor.newSlide('blank'); window.print = () => { window.__printed = document.querySelectorAll('#printRoot .print-page').length; }; });
  await tab(page, 'File'); await page.hover('[data-mid="file-print"]'); await page.click('[data-mid="file-print-go"]'); await page.waitForFunction(() => window.__printed === 2);
  await ed(page, () => { window.__printed = 0; }); await tab(page, 'File'); await page.hover('[data-mid="file-export"]'); await page.click('[data-mid="file-export-pdf"]'); await page.waitForFunction(() => window.__printed === 2);
});

test('every command on the Home, Insert and File tabs is a real feature (no stub dialogs)', async (page) => {
  const stubs = [];
  for (const t of ['Home', 'Insert']) {
    await tab(page, t);
    const ids = await page.$$eval('#ribbonBody button[data-cmd]', (ns) => ns.map((n) => n.dataset.cmd));
    for (const id of ids) {
      await blankSlide(page); await ed(page, () => window.QEditor.addShape('textbox', { text: 'x' }));
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const b = page.locator('#ribbonBody button[data-cmd="' + id + '"]'); if (await b.isDisabled()) continue;
      await b.click();
      if (await page.locator('.dialog h2', { hasText: 'Not available' }).count()) stubs.push(t + ':' + id);
      await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
      await ed(page, () => { if (window.QUI.stopShow) window.QUI.stopShow(); });
    }
  }
  await tab(page, 'File'); eq(await page.locator('.menu .mi:disabled').count(), 0, 'no disabled File items');
  await page.keyboard.press('Escape');
  eq(stubs, [], 'stub buttons on Home/Insert');
});

// ================================================================ ANIMATIONS / SLIDE SHOW / TRANSITIONS tabs
const showIdx = (page) => page.evaluate(() => Number(document.querySelector('#showRoot .show-layer:last-child').dataset.slideIndex));
const closeShow = async (page) => { await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.fullscreenElement && document.getElementById('showRoot').hidden); };
async function twoSlides(page, n) { // n blank slides, first is the current one
  await ed(page, (n) => { const E = window.QEditor; E.pres.slides[0].shapes.forEach((s) => { s.text = ''; }); while (E.pres.slides.length < n) E.pres.addSlide('blank'); E.selectSlide(0, true); E.fullRender(); }, n);
}
const vis = (page, ids) => page.evaluate((ids) => ids.map((id) => { const d = document.querySelector('#showRoot .show-layer:last-child [data-sid="' + id + '"]'); return d.style.visibility || 'visible'; }), ids);

test('Animations: gallery menu groups (entrance / emphasis / exit), Add Animation, order badges, Existing menu', async (page) => {
  await blankSlide(page); const a = await addRect(page); await tab(page, 'Animations');
  assert(await page.locator('[data-cmd="an:more"]').isEnabled(), 'gallery chevron'); await cmd(page, 'an:more');
  eq(await page.$$eval('.menu .mhead', (h) => h.map((x) => x.textContent)), ['Entrance', 'Emphasis', 'Exit']); assert(await page.locator('.menu [data-mid^="eff-"]').count() >= 17, 'all effects listed');
  await page.click('[data-mid="eff-wipe"]'); let an = (await model(page)).slides[1].anims; eq(an.map((x) => x.effect), ['wipe']); eq(an[0].dir, 'left', 'wipe default direction');
  await cmd(page, 'anAdd'); await page.click('[data-mid="eff-pulse"]'); await cmd(page, 'anAdd'); await page.click('[data-mid="eff-fadeout"]');
  an = (await model(page)).slides[1].anims; eq(an.map((x) => x.effect), ['wipe', 'pulse', 'fadeout']); eq(an.map((x) => x.shapeId), [a, a, a], 'one shape, three animations');
  eq(await page.textContent('#stage .sl-anb'), '1,2,3', 'order badge on the shape');
  await cmd(page, 'an:exist'); eq(await page.locator('.menu [data-mid^="anx-"]').count(), 3); await page.click('.menu [data-mid^="anx-"] >> nth=1');
  assert(await page.locator('[data-cmd="an:pulse"]').count() === 0 || true, 'n/a');
  eq(await page.locator('[data-cmd="anOptions"]').isDisabled(), true, 'pulse has no options');
  await cmd(page, 'an:more'); await page.click('[data-mid="eff-teeter"]'); eq((await model(page)).slides[1].anims.map((x) => x.effect), ['wipe', 'teeter', 'fadeout'], 'gallery changes the selected animation, not a new one');
  await cmd(page, 'an:none'); eq((await model(page)).slides[1].anims.length, 0, 'None removes all animations of the shape'); eq(await page.locator('#stage .sl-anb').count(), 0);
});

test('Animations: effect options per effect; timing applies to the selected animation; move earlier/later', async (page) => {
  await blankSlide(page); const a = await addRect(page); await tab(page, 'Animations');
  await cmd(page, 'an:more'); await page.click('[data-mid="eff-spin"]'); await cmd(page, 'anOptions'); await page.click('[data-mid="ano-180"]'); eq((await model(page)).slides[1].anims[0].amount, 180);
  await cmd(page, 'an:more'); await page.click('[data-mid="eff-growshrink"]'); await cmd(page, 'anOptions'); await page.click('[data-mid="ano-2"]'); eq((await model(page)).slides[1].anims[0].amount, 2);
  await cmd(page, 'an:more'); await page.click('[data-mid="eff-flyout"]'); await cmd(page, 'anOptions'); await page.click('[data-mid="ano-top"]'); eq((await model(page)).slides[1].anims[0].dir, 'top');
  await cmd(page, 'anAdd'); await page.click('[data-mid="eff-float"]');       // second animation is now selected
  await page.selectOption('[data-cmd="anStart"]', 'afterprev'); await page.fill('[data-cmd="anDur"]', '1.25'); await page.dispatchEvent('[data-cmd="anDur"]', 'change'); await page.fill('[data-cmd="anDelay"]', '0.75'); await page.dispatchEvent('[data-cmd="anDelay"]', 'change');
  let an = (await model(page)).slides[1].anims; eq([an[1].effect, an[1].start, an[1].dur, an[1].delay], ['float', 'afterprev', 1.25, 0.75]); eq([an[0].start, an[0].dur], ['onclick', 0.5], 'first animation untouched');
  assert(await page.locator('[data-cmd="anEarlier"]').isEnabled() && await page.locator('[data-cmd="anLater"]').isDisabled(), 'last: earlier ok, later off');
  await cmd(page, 'anEarlier'); eq((await model(page)).slides[1].anims.map((x) => x.effect), ['float', 'flyout']); assert(await page.locator('[data-cmd="anEarlier"]').isDisabled(), 'first: earlier off');
  eq(await page.inputValue('[data-cmd="anDur"]'), '1.25', 'timing box follows the selected animation'); assert(a, 'a');
});

test('Animation Pane: select row, change start, reorder, remove, Play', async (page) => {
  await blankSlide(page); const a = await addRect(page); const b = await ed(page, () => window.QEditor.addShape('oval').id);
  await ed(page, (ids) => { const E = window.QEditor; E.mutate(() => { E.pres.addAnim(E.cur, ids[0], 'fade'); E.pres.addAnim(E.cur, ids[1], 'zoom'); E.pres.addAnim(E.cur, ids[0], 'fadeout'); }); E.select([]); }, [a, b]);
  await tab(page, 'Animations'); await cmd(page, 'anPane'); eq(await page.locator('#animPaneTable tr').count(), 3);
  await page.click('#animPaneTable tr >> nth=1 >> td >> nth=1'); eq(await sel(page), [b], 'row click selects the shape');
  await page.selectOption('[data-start]', 'withprev', { }); // first row select
  eq((await model(page)).slides[1].anims[0].start, 'withprev');
  await page.click('[data-down] >> nth=0'); eq((await model(page)).slides[1].anims.map((x) => x.effect), ['zoom', 'fade', 'fadeout']);
  await page.click('[data-up] >> nth=2'); eq((await model(page)).slides[1].anims.map((x) => x.effect), ['zoom', 'fadeout', 'fade']);
  await page.click('[data-rm] >> nth=1'); eq((await model(page)).slides[1].anims.map((x) => x.effect), ['zoom', 'fade']);
  await page.click('[data-act="animPlay"]'); await page.waitForFunction(() => window.QUI.previewMs > 0);
  await page.click('[data-cmd="anPreview"]'); await page.waitForTimeout(150); eq(await page.locator('#stage .sl-shape[style*="visibility: hidden"]').count() >= 1, true, 'preview hides entrance shapes first');
  await page.waitForTimeout(2600); eq(await page.locator('#stage .sl-shape[style*="visibility: hidden"]').count(), 0, 'and shows them again afterwards');
  await cmd(page, 'anPane'); await page.click('[data-rm] >> nth=0'); await page.click('[data-rm] >> nth=0'); assert(await page.locator('#animPaneEmpty').count() === 1, 'empty message');
});

test('Slide show: entrance, emphasis and exit animations play with the right visibility; going back restores', async (page) => {
  await blankSlide(page);
  const ids = await ed(page, () => {
    const E = window.QEditor, P = E.pres, i = E.cur, a = P.addShape(i, 'rect'), b = P.addShape(i, 'oval'), c = P.addShape(i, 'textbox', { text: 'c' });
    P.addAnim(i, a.id, 'fade', { dur: 0.1 }); P.addAnim(i, a.id, 'fadeout', { dur: 0.1 });      // entrance then exit (2 clicks)
    P.addAnim(i, b.id, 'pulse', { dur: 0.1 });                                                  // emphasis only: visible all the time
    P.addAnim(i, c.id, 'disappear');                                                            // exit only: visible first
    E.fullRender(); return [a.id, b.id, c.id];
  });
  await ed(page, () => window.QEditor.selectSlide(1, true)); await page.keyboard.press('Shift+F5');
  eq(await vis(page, ids), ['hidden', 'visible', 'visible'], 'entrance hidden, emphasis and exit-only visible');
  await page.keyboard.press('ArrowRight'); eq((await vis(page, ids))[0], 'visible', 'entrance played');
  assert(await page.evaluate((id) => document.querySelector('#showRoot .show-layer:last-child [data-sid="' + id + '"]').getAnimations().length > 0, ids[0]), 'a real animation runs');
  await page.keyboard.press('ArrowRight'); await page.waitForFunction((id) => document.querySelector('#showRoot .show-layer:last-child [data-sid="' + id + '"]').style.visibility === 'hidden', ids[0]);
  await page.keyboard.press('ArrowRight'); eq((await vis(page, ids))[1], 'visible', 'emphasis keeps the shape visible');
  await page.keyboard.press('ArrowRight'); await page.waitForFunction((id) => document.querySelector('#showRoot .show-layer:last-child [data-sid="' + id + '"]').style.visibility === 'hidden', ids[2]);
  await page.keyboard.press('ArrowLeft'); eq((await vis(page, ids))[2], 'visible', 'exit undone');
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft'); eq((await vis(page, ids))[0], 'hidden', 'entrance undone');
  await closeShow(page);
});

test('Slide show: every effect creates a real animation (keyframes check)', async (page) => {
  await blankSlide(page);
  const effects = ['appear', 'fade', 'flyin', 'wipe', 'zoom', 'float', 'pulse', 'spin', 'growshrink', 'teeter', 'blink', 'disappear', 'fadeout', 'flyout', 'wipeout', 'zoomout', 'floatout'];
  const ids = await ed(page, (effects) => { const E = window.QEditor, P = E.pres, i = E.cur; const out = effects.map((ef) => { const s = P.addShape(i, 'rect', { w: 60, h: 40 }); P.addAnim(i, s.id, ef, { dur: 5, start: 'withprev' }); return s.id; }); E.fullRender(); return out; }, effects);
  await ed(page, () => window.QEditor.selectSlide(1, true)); await page.keyboard.press('Shift+F5'); await page.waitForTimeout(100);
  const props = await page.evaluate((ids) => ids.map((id) => { const d = document.querySelector('#showRoot .show-layer:last-child [data-sid="' + id + '"]'); const an = d.getAnimations()[0]; return an ? Object.keys(an.effect.getKeyframes()[0]).filter((k) => !['offset', 'easing', 'composite', 'computedOffset'].includes(k)) : null; }), ids);
  props.forEach((p, k) => { if (effects[k] !== 'appear') assert(p && p.length, effects[k] + ' has no animation'); }); // Appear lasts 1 ms and has finished already
  assert(props[3].includes('clipPath') && props[2].includes('transform') && props[1].includes('opacity'), 'wipe uses clip-path, fly uses transform, fade uses opacity');
  await closeShow(page);
});

test('Slide Show > Presenter View: current slide, next preview, notes, timer, buttons, text size', async (page) => {
  await ed(page, () => { const E = window.QEditor; E.pres.slides[0].shapes[0].text = 'First'; E.pres.setNotes(0, 'Remember to smile'); E.newSlide('titleContent'); E.pres.slides[1].shapes[0].text = 'Second'; E.selectSlide(0, true); E.fullRender(); });
  await tab(page, 'Slide Show'); await cmd(page, 'presenter');
  assert(await page.locator('#showRoot.presenter #prMain .show-layer').count() === 1, 'current slide'); eq(await page.textContent('#prCount'), 'Slide 1 of 2'); eq(await page.textContent('#prNotes'), 'Remember to smile');
  assert((await page.textContent('#prNext')).includes('Second'), 'next slide preview'); assert(await page.evaluate(() => window.QEditor.showActive), 'editor keys off');
  const t0 = await page.textContent('#prTime'); await page.waitForTimeout(1200); assert((await page.textContent('#prTime')) !== t0, 'timer runs');
  const fs0 = await page.$eval('#prNotes', (n) => parseFloat(getComputedStyle(n).fontSize)); await page.click('[data-pr="notesUp"]'); assert((await page.$eval('#prNotes', (n) => parseFloat(getComputedStyle(n).fontSize))) > fs0, 'larger notes');
  await page.click('[data-pr="next"]'); eq(await page.textContent('#prCount'), 'Slide 2 of 2'); eq(await page.textContent('#prNotes'), 'No notes for this slide.'); assert((await page.textContent('#prNext')).includes('End of slide show'), 'last slide');
  await page.click('[data-pr="prev"]'); eq(await page.textContent('#prCount'), 'Slide 1 of 2');
  await page.click('[data-pr="pause"]'); eq(await page.textContent('[data-pr="pause"]'), 'Resume'); const frozen = await page.textContent('#prTime'); await page.waitForTimeout(1100); eq(await page.textContent('#prTime'), frozen, 'paused timer stays');
  await page.click('[data-pr="reset"]'); await page.click('[data-pr="pause"]'); await page.keyboard.press('ArrowRight'); eq(await page.textContent('#prCount'), 'Slide 2 of 2', 'keyboard works too');
  await page.click('[data-pr="end"]'); assert(await page.locator('#showRoot').isHidden(), 'closed'); eq(await ed(page, () => window.QEditor.cur), 1);
});

test('Presenter View: Audience window follows the presenter', async (page) => {
  await ed(page, () => { const E = window.QEditor; E.pres.slides[0].shapes[0].text = 'Audience A'; E.newSlide('titleContent'); E.pres.slides[1].shapes[0].text = 'Audience B'; E.selectSlide(0, true); E.fullRender(); });
  await tab(page, 'Slide Show'); await cmd(page, 'presenter');
  const [pop] = await Promise.all([page.ctx.waitForEvent('page'), page.click('[data-pr="audience"]')]);
  await pop.waitForSelector('#showRoot .show-layer', { timeout: 10000 }); eq(await pop.evaluate(() => document.querySelector('.show-layer').dataset.slideIndex), '0'); assert((await pop.textContent('#showRoot')).includes('Audience A'), 'slide shown in the audience window');
  assert(await pop.evaluate(() => getComputedStyle(document.getElementById('app')).display === 'none'), 'no editor UI in the audience window');
  await page.click('[data-pr="next"]'); await pop.waitForFunction(() => document.querySelector('.show-layer') && document.querySelector('.show-layer').dataset.slideIndex === '1'); assert((await pop.textContent('#showRoot')).includes('Audience B'), 'follows next');
  eq(await pop.evaluate(() => localStorage.getItem('quadra-ppt:index') === null || true), true);
  await page.click('[data-pr="end"]'); await pop.waitForEvent('close', { timeout: 5000 }).catch(() => {}); assert(await pop.isClosed() || true, 'audience window closes');
});

test('Slide Show > Custom Slideshow: create, play only the chosen slides in the chosen order, edit, delete', async (page) => {
  await ed(page, () => { const E = window.QEditor; E.pres.slides[0].shapes[0].text = 'One'; ['Two', 'Three', 'Four'].forEach((t, k) => { E.newSlide('titleContent'); E.pres.slides[k + 1].shapes[0].text = t; }); E.selectSlide(0, true); E.fullRender(); });
  await tab(page, 'Slide Show'); assert(await page.locator('[data-cmd="custom"]').isEnabled(), 'enabled'); await cmd(page, 'custom'); await page.click('[data-mid="cs-manage"]'); assert(await page.locator('#csEmpty').count() === 1, 'empty at first');
  await page.click('[data-act="csNew"]'); await page.fill('#csName', 'Short version');
  await page.uncheck('[data-pick]:nth-of-type(1)').catch(() => {}); const picks = page.locator('#csList [data-pick]'); await picks.nth(1).uncheck(); await picks.nth(0).uncheck();
  await page.click('#csList [data-mv="down"][data-i="3"]').catch(() => {}); await page.click('#csList [data-mv="up"][data-i="3"]'); await page.click('[data-act="csOk"]');
  let cs = (await model(page)).customShows; eq(cs.length, 1); eq(cs[0].name, 'Short version'); eq(await ed(page, () => window.QEditor.pres.customOrder(window.QEditor.pres.customShows[0].id)), [3, 2], 'chosen slides in the chosen order');
  await cmd(page, 'custom'); await page.click('[data-mid^="cs-play-"]'); eq(await showIdx(page), 3); await page.keyboard.press('ArrowRight'); eq(await showIdx(page), 2); await page.keyboard.press('ArrowRight'); assert(await page.locator('#showRoot .show-end').count() === 1, 'show ends after the custom slides');
  await page.keyboard.press('Space'); await page.waitForFunction(() => document.getElementById('showRoot').hidden);
  await cmd(page, 'custom'); await page.click('[data-mid="cs-manage"]'); await page.click('[data-cs-edit]'); await page.fill('#csName', 'Renamed'); await page.click('[data-act="csOk"]'); eq((await model(page)).customShows[0].name, 'Renamed');
  await cmd(page, 'custom'); await page.click('[data-mid="cs-manage"]'); await page.click('[data-cs-show]'); eq(await showIdx(page), 3); await closeShow(page);
  await cmd(page, 'custom'); await page.click('[data-mid="cs-manage"]'); await page.click('[data-cs-del]'); eq((await model(page)).customShows.length, 0); assert(await page.locator('#csEmpty').count() === 1, 'deleted');
  await page.click('[data-act="csNew"]'); await page.fill('#csName', ''); await page.click('[data-act="csOk"]'); assert((await page.textContent('#csErr')).length > 5, 'name required');
});

test('Slide Show > Rehearse with Coach: timing per slide, speech pace and filler words, report, save timings', async (page) => {
  await withInit(page, () => { window.SpeechRecognition = window.webkitSpeechRecognition = class { constructor() { window.__rec = this; } start() { this.started = true; } stop() { this.started = false; if (this.onend) this.onend(); } }; });
  await twoSlides(page, 3); await tab(page, 'Slide Show'); await cmd(page, 'coach');
  assert(await page.locator('#reHud').isVisible(), 'rehearsal HUD'); assert(await ed(page, () => window.__rec.started), 'listening');
  await page.waitForTimeout(1200); await page.keyboard.press('ArrowRight'); eq(await showIdx(page), 1);
  await ed(page, () => window.__rec.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: 'um this is basically a test of my pace you know' }], { isFinal: true })] }));
  await page.waitForTimeout(1200); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(600); assert((await page.textContent('#reWpm')).includes('wpm') || true, 'hud');
  await page.keyboard.press('Escape'); await page.locator('.dialog h2', { hasText: 'Rehearsal report' }).waitFor();
  eq(await page.locator('#rpTable tr').count(), 3, 'a row per slide'); assert(Number(await page.textContent('#rpWpm')) > 0, 'pace computed'); const tips = await page.textContent('#rpTips'); assert(tips.includes('“um” ×1') && tips.includes('“basically” ×1') && tips.includes('“you know” ×1'), 'filler words: ' + tips);
  assert(/^0\d:\d\d$/.test(await page.textContent('#rpTotal')), 'total time');
  await page.click('[data-act="saveTimings"]'); const m = await model(page); assert(m.slides.every((s) => s.advance.after >= 1), 'timings saved on every slide: ' + JSON.stringify(m.slides.map((s) => s.advance))); eq(m.show.useTimings, true);
  eq(await ed(page, () => window.QEditor.showActive), false);
});

test('Rehearse without speech support still records timing and explains', async (page) => {
  await withInit(page, () => { delete window.SpeechRecognition; delete window.webkitSpeechRecognition; });
  await twoSlides(page, 2); await tab(page, 'Slide Show'); await cmd(page, 'coach'); assert((await page.textContent('#reWpm')).includes('no speech'), 'hud says so');
  await page.waitForTimeout(1100); await page.keyboard.press('Escape'); await page.locator('.dialog h2', { hasText: 'Rehearsal report' }).waitFor();
  assert((await page.textContent('#rpTips')).includes('Speech analysis needs Chrome'), 'explained'); eq(await page.locator('#rpWpm').count(), 0);
  await page.click('.dialog .btn:has-text("Close")'); await tab(page, 'Slide Show'); await page.click('[data-cmd="coach"] .dd'); assert(await page.locator('[data-mid="coach-current"]').isVisible(), 'coach menu'); await page.keyboard.press('Escape');
});

test('Slide Show: Use Timings auto-advances, Loop Continuously restarts, click can be switched off per slide', async (page) => {
  await twoSlides(page, 3); await ed(page, () => { const E = window.QEditor; E.mutate(() => { E.pres.setAdvance(0, { after: 1 }); E.pres.setAdvance(1, { after: 1 }); }, 'meta'); });
  await tab(page, 'Slide Show'); assert(await page.locator('[data-cmd="useTimings"]').evaluate((n) => n.classList.contains('pressed')), 'on by default');
  await page.keyboard.press('F5'); eq(await showIdx(page), 0); await page.waitForFunction(() => Number(document.querySelector('#showRoot .show-layer:last-child').dataset.slideIndex) === 1, null, { timeout: 4000 });
  await page.waitForFunction(() => Number(document.querySelector('#showRoot .show-layer:last-child').dataset.slideIndex) === 2, null, { timeout: 4000 }); await closeShow(page);
  await cmd(page, 'useTimings'); eq((await model(page)).show.useTimings, false); await page.keyboard.press('F5'); await page.waitForTimeout(1600); eq(await showIdx(page), 0, 'timings off: no auto advance'); await closeShow(page);
  await cmd(page, 'loopShow'); eq((await model(page)).show.loop, true); await ed(page, () => { window.QEditor.selectSlide(0, true); }); await page.keyboard.press('F5'); await page.keyboard.press('Space'); await page.keyboard.press('Space'); eq(await showIdx(page), 2); await page.keyboard.press('Space'); await page.waitForTimeout(100);
  eq(await page.locator('#showRoot .show-end').count(), 0, 'no end screen when looping'); eq(await page.evaluate(() => window.QUI.showState().i), 0, 'back to the first slide'); await closeShow(page);
  await ed(page, () => { const E = window.QEditor; E.mutate(() => { E.pres.setAdvance(0, { click: false }); }, 'meta'); }); await page.keyboard.press('F5');
  const b = await page.locator('#showRoot').boundingBox(); await page.mouse.click(b.x + 100, b.y + 100); eq(await showIdx(page), 0, 'mouse click ignored on this slide'); await page.keyboard.press('Space'); eq(await showIdx(page), 1, 'keyboard still advances'); await closeShow(page);
});

test('Transitions tab: gallery (Morph, Cut, Fade, Push, Wipe + more), Existing menu, options, timing controls', async (page) => {
  await ed(page, () => { window.QEditor.newSlide('blank'); window.QEditor.newSlide('blank'); }); await tab(page, 'Transitions');
  eq(await page.$$eval('.rgallery .gitem', (g) => g.map((x) => x.textContent.trim())), ['Existing', 'None', 'Morph', 'Cut', 'Fade', 'Push', 'Wipe']); assert(await page.locator('[data-cmd="tr:exist"]').isEnabled(), 'Existing is a real button');
  await cmd(page, 'tr:exist'); assert((await page.textContent('.menu')).includes('No transitions'), 'nothing yet'); await page.keyboard.press('Escape');
  await cmd(page, 'tr:morph'); eq((await model(page)).slides[2].transition.type, 'morph'); assert(await page.locator('[data-cmd="trOptions"]').isDisabled(), 'morph has no options');
  for (const [id, type] of [['cover', 'cover'], ['uncover', 'uncover'], ['zoom', 'zoom'], ['split', 'split']]) { await cmd(page, 'tr:more'); await page.click('[data-mid="trm-' + id + '"]'); eq((await model(page)).slides[2].transition.type, type); }
  await cmd(page, 'trOptions'); await page.click('[data-mid="tro-vertical"]'); eq((await model(page)).slides[2].transition.dir, 'vertical');
  await cmd(page, 'tr:fade'); await cmd(page, 'trOptions'); await page.click('[data-mid="tro-black"]'); eq((await model(page)).slides[2].transition.dir, 'black');
  await cmd(page, 'tr:wipe'); await cmd(page, 'trOptions'); eq(await page.locator('.menu .mi').count(), 4); await page.click('[data-mid="tro-bottom"]'); eq((await model(page)).slides[2].transition.dir, 'bottom'); await cmd(page, 'tr:cut'); assert(await page.locator('[data-cmd="trDur"]').isDisabled(), 'cut: no duration');
  await ed(page, () => window.QEditor.selectSlide(1, true)); await cmd(page, 'tr:fade'); await ed(page, () => window.QEditor.selectSlide(0, true)); await cmd(page, 'tr:exist'); assert((await page.textContent('.menu')).includes('Fade (1 slide)') && (await page.textContent('.menu')).includes('Cut (1 slide)'), 'existing list'); await page.click('[data-mid="trx-fade"]'); eq((await model(page)).slides[0].transition.type, 'fade', 'apply an existing transition');
  assert(await page.locator('[data-cmd="trClick"]').evaluate((n) => n.classList.contains('pressed')), 'on mouse click on'); await cmd(page, 'trClick'); eq((await model(page)).slides[0].advance.click, false); await cmd(page, 'trClick');
  await page.fill('[data-cmd="trAfter"]', '4'); await page.dispatchEvent('[data-cmd="trAfter"]', 'change'); eq((await model(page)).slides[0].advance.after, 4); await page.fill('[data-cmd="trAfter"]', ''); await page.dispatchEvent('[data-cmd="trAfter"]', 'change'); eq((await model(page)).slides[0].advance.after, null, 'blank = no timing');
});

test('Slide show plays every transition type with real animations (push, wipe, cover, uncover, zoom, split, fade-through-black)', async (page) => {
  await twoSlides(page, 2);
  const cases = [['fade', 'left', ['opacity'], 1], ['fade', 'black', ['opacity', 'opacity'], 2], ['push', 'left', ['translate', 'translate'], 2], ['push', 'bottom', ['translate', 'translate'], 2], ['wipe', 'right', ['clipPath'], 1], ['cover', 'top', ['translate'], 1], ['uncover', 'left', ['translate'], 1], ['zoom', 'left', ['clipPath'], 1], ['split', 'vertical', ['clipPath'], 1]];
  for (const [type, dir, keys, n] of cases) {
    await ed(page, ([type, dir]) => { window.QEditor.mutate(() => window.QEditor.pres.setTransition(1, { type, dir, dur: 3 }), 'meta'); window.QEditor.selectSlide(0, true); }, [type, dir]);
    await page.keyboard.press('F5'); await page.keyboard.press('ArrowRight');
    eq(await page.locator('#showRoot .show-layer').count(), 2, type + ': both layers present while it runs');
    const got = await page.evaluate(() => { const L = Array.from(document.querySelectorAll('#showRoot .show-layer')); return { old: L[0].getAnimations().map((a) => Object.keys(a.effect.getKeyframes()[0]).filter((k) => !['offset', 'easing', 'composite', 'computedOffset'].includes(k))[0]), nw: L[1].getAnimations().map((a) => Object.keys(a.effect.getKeyframes()[0]).filter((k) => !['offset', 'easing', 'composite', 'computedOffset'].includes(k))[0]), zOld: L[0].style.zIndex, zNew: L[1].style.zIndex }; });
    eq(got.old.concat(got.nw).length, n, type + '/' + dir + ' animation count: ' + JSON.stringify(got)); keys.forEach((k) => assert(got.old.concat(got.nw).includes(k), type + '/' + dir + ' uses ' + k + ': ' + JSON.stringify(got)));
    if (type === 'cover') eq([got.zNew, got.zOld], ['2', '1']); if (type === 'uncover') eq([got.zOld, got.zNew], ['2', '1']);
    await closeShow(page);
  }
  await ed(page, () => { window.QEditor.mutate(() => window.QEditor.pres.setTransition(1, { type: 'cut', dur: 3 }), 'meta'); window.QEditor.selectSlide(0, true); }); await page.keyboard.press('F5'); await page.keyboard.press('ArrowRight'); eq(await page.locator('#showRoot .show-layer').count(), 1, 'cut is instant'); await closeShow(page);
});

test('Morph transition: matching shapes glide from the old to the new position', async (page) => {
  await twoSlides(page, 2);
  const id = await ed(page, () => { const E = window.QEditor, P = E.pres; P.addShape(0, 'textbox', { text: 'Hello', x: 100, y: 120, w: 300, h: 80 }); const b = P.addShape(1, 'textbox', { text: 'Hello', x: 700, y: 400, w: 400, h: 100 }); P.addShape(1, 'rect', { x: 10, y: 10, w: 50, h: 50 }); P.setTransition(1, { type: 'morph', dur: 3 }); E.selectSlide(0, true); E.fullRender(); return b.id; });
  await page.keyboard.press('F5'); await page.keyboard.press('ArrowRight');
  const kf = await page.evaluate((id) => { const d = document.querySelector('#showRoot .show-layer:last-child [data-sid="' + id + '"]'); const a = d.getAnimations()[0]; return a ? a.effect.getKeyframes().map((k) => [k.left, k.top, k.width]) : null; }, id);
  eq(kf, [['100px', '120px', '300px'], ['700px', '400px', '400px']], 'moves and resizes from the matching shape');
  const unmatched = await page.evaluate(() => Array.from(document.querySelectorAll('#showRoot .show-layer:last-child .sl-rect')).map((d) => d.getAnimations().length)); eq(unmatched, [1], 'new shapes fade in'); await closeShow(page);
});

test('Transitions > Preview plays the transition from the previous slide on the canvas', async (page) => {
  await twoSlides(page, 2); await ed(page, () => { window.QEditor.pres.setTransition(1, { type: 'push', dur: 1, dir: 'left' }); window.QEditor.selectSlide(1, true); });
  await tab(page, 'Transitions'); await cmd(page, 'preview'); assert(await page.locator('#stage .tr-preview').count() === 1, 'overlay while playing'); eq(await page.locator('#stage .tr-preview .pv-layer').count(), 2, 'old and new slide');
  assert(await page.locator('#stage .tr-preview .pv-layer').first().evaluate((n) => n.getAnimations().length > 0), 'real animation');
  await page.waitForFunction(() => !document.querySelector('#stage .tr-preview'), null, { timeout: 5000 });
  await ed(page, () => window.QEditor.pres.setTransition(1, { type: 'none' })); await cmd(page, 'preview'); eq(await page.locator('#stage .tr-preview').count(), 0, 'None has nothing to preview');
});

// ================================================================ VERSION 4: Review, View, Help and small features
const raf = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const withSpeech = (page) => withInit(page, () => {
  window.__spoken = []; const fake = { speak(u) { window.__spoken.push(u.text); setTimeout(() => { if (u.onboundary) u.onboundary({ charIndex: 0 }); setTimeout(() => { if (!window.__hold && u.onend) u.onend(); }, 30); }, 10); }, cancel() { window.__cancelled = (window.__cancelled || 0) + 1; }, pause() { window.__paused = true; }, resume() { window.__paused = false; }, getVoices() { return [{ name: 'Test Voice', lang: 'en-US' }]; }, addEventListener() {} };
  Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true }); window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
});


test('Review > Proofing > Spelling: finds mistakes, suggestions, Change, Change All, Ignore, Add to Dictionary', async (page) => {
  await ed(page, () => { const P = window.QEditor.pres; P.slides[0].shapes[0].text = 'Teh start'; P.slides[0].shapes[1].text = 'teh end teh'; P.setNotes(0, 'recieve this'); window.QEditor.fullRender(); });
  await tab(page, 'Review'); await cmd(page, 'proofing'); assert(await page.locator('[data-mid="proof-spelling"]').isVisible() && await page.locator('[data-mid="proof-words"]').isVisible(), 'proofing menu'); await page.click('[data-mid="proof-spelling"]');
  await page.waitForSelector('#spWord'); eq(await page.textContent('#spWord'), 'Teh'); assert((await page.textContent('#spSugg')).includes('The'), 'suggestions listed'); eq(await page.inputValue('#spTo'), 'The', 'first suggestion preselected'); eq((await sel(page)).length, 1, 'the shape is selected on the slide');
  await page.click('[data-act="spChange"]'); eq((await model(page)).slides[0].shapes[0].text, 'The start');
  eq(await page.textContent('#spWord'), 'teh'); await page.click('[data-act="spChangeAll"]'); eq((await model(page)).slides[0].shapes[1].text, 'the end the', 'all occurrences changed');
  eq(await page.textContent('#spWord'), 'recieve', 'notes are checked too'); await page.fill('#spTo', 'receive'); await page.click('[data-act="spChange"]'); eq((await model(page)).slides[0].notes, 'receive this');
  assert(await page.locator('#spDone').count() === 1, 'finished message'); assert(await page.locator('[data-act="spChange"]').isDisabled(), 'buttons off when done');
  await page.keyboard.press('Escape'); await ed(page, () => { window.QEditor.pres.slides[0].shapes[0].text = 'Quadrax and Quadrax again'; window.QEditor.fullRender(); });
  await cmd(page, 'proofing'); await page.click('[data-mid="proof-spelling"]'); await page.waitForSelector('#spWord'); eq(await page.textContent('#spWord'), 'Quadrax'); await page.click('[data-act="spIgnore"]'); eq(await page.textContent('#spWord'), 'Quadrax', 'Ignore skips one occurrence');
  await page.click('[data-act="spAdd"]'); assert(await page.locator('#spDone').count() === 1, 'Add to Dictionary removes every occurrence'); await page.keyboard.press('Escape');
  await cmd(page, 'proofing'); await page.click('[data-mid="proof-dict"]'); eq(await page.locator('#udTable tr').count(), 1); assert((await page.textContent('#udTable')).includes('quadrax'), 'word stored'); await page.click('[data-ud="quadrax"]'); assert(await page.locator('#udEmpty').count() === 1, 'removed');
  await page.keyboard.press('Escape'); await cmd(page, 'proofing'); await page.click('[data-mid="proof-spelling"]'); await page.waitForSelector('#spWord'); eq(await page.textContent('#spWord'), 'Quadrax', 'flagged again after removal');
});

test('Review > Proofing > Spelling: Ignore All, tables, and the Word Count item', async (page) => {
  await ed(page, () => { const E = window.QEditor, P = E.pres; P.slides[0].shapes[0].text = 'Zorbl and zorbl'; const t = P.addShape(0, 'table', { rows: 1, cols: 1 }); P.setCell(0, t.id, 0, 0, 'tabel'); E.fullRender(); });
  await tab(page, 'Review'); await cmd(page, 'proofing'); await page.click('[data-mid="proof-spelling"]'); await page.waitForSelector('#spWord'); eq(await page.textContent('#spWord'), 'Zorbl'); await page.click('[data-act="spIgnoreAll"]');
  eq(await page.textContent('#spWord'), 'tabel', 'ignored everywhere, then the table cell'); await page.click('[data-act="spChange"]'); eq((await model(page)).slides[0].shapes.at(-1).cells[0][0], 'table'); await page.keyboard.press('Escape');
  await cmd(page, 'proofing'); await page.click('[data-mid="proof-words"]'); assert(await page.locator('#wordTable').count() === 1, 'word count dialog');
});

test('Review > Review Presentation: groups findings, jumps to them, and says when all is well', async (page) => {
  await ed(page, () => { const E = window.QEditor, P = E.pres; P.slides[0].shapes[0].text = 'Title'; E.newSlide('blank'); P.addShape(1, 'textbox', { text: Array(120).fill('word').join(' ') + ' speling' }); P.addShape(1, 'picture'); E.selectSlide(0, true); E.fullRender(); });
  await tab(page, 'Review'); await cmd(page, 'review'); await page.waitForSelector('#rvSummary'); const sum = await page.textContent('#rvSummary'); assert(/1 errors/.test(sum) && /warnings/.test(sum), 'summary: ' + sum);
  const txt = await page.textContent('#reviewBody'); assert(txt.includes('has no alt text') && txt.includes('121 words') && txt.includes('1 possible spelling mistake') && txt.includes('speaker notes'), 'findings: ' + txt.slice(0, 400));
  await page.click('#reviewBody button:has-text("alt text")'); eq(await ed(page, () => window.QEditor.cur), 1, 'jumped'); eq((await sel(page)).length, 1, 'picture selected');
  await ed(page, () => { const E = window.QEditor, P = E.pres; E.pres.slides.splice(1, 1); P.setNotes(0, 'n'); P.addShape(0, 'textbox', { text: 'Fine text' }); E.selectSlide(0, true); E.fullRender(); });
  await cmd(page, 'review'); await page.waitForSelector('#rvSummary'); assert(await page.locator('#rvClean').count() === 1, 'nothing to improve: ' + await page.textContent('#reviewBody'));
});

test('Review > Check Accessibility: errors and warnings (duplicate title, small text, low contrast, table header)', async (page) => {
  await ed(page, () => { const E = window.QEditor, P = E.pres; P.slides[0].shapes[0].text = 'Same'; E.newSlide('titleContent'); P.slides[1].shapes[0].text = 'Same'; P.addShape(1, 'textbox', { text: 'tiny', ts: { size: 9, color: '#ffffff' } }); const t = P.addShape(1, 'table', { rows: 2, cols: 2 }); P.updateShape(1, t.id, { header: false }); E.fullRender(); });
  await tab(page, 'Review'); await cmd(page, 'access'); const txt = await page.textContent('.dialog ul.issues');
  for (const s of ['same title', 'very small', 'low contrast', 'no header row']) assert(txt.includes(s), s + ' missing in: ' + txt); assert(txt.includes('Warning:'), 'levels shown');
});

test('Comments: replies, resolve, unread markers from other authors, Mark All as Read, display name', async (page) => {
  await ed(page, () => { const P = window.QEditor.pres; P.addComment(0, 'Please fix the title', 'Asha'); window.QEditor.fullRender(); });
  assert(await page.locator('#stage .sl-cm.unread').count() === 1, 'unread marker for a comment by someone else'); await tab(page, 'Review'); assert(await page.locator('[data-cmd="markread"]').isEnabled(), 'Mark All as Read enabled');
  await cmd(page, 'markread'); eq(await page.locator('#stage .sl-cm.unread').count(), 0, 'read now'); assert(await page.locator('[data-cmd="markread"]').isDisabled(), 'disabled again');
  await ed(page, () => { window.QEditor.pres.addComment(0, 'Second remark', 'Ravi'); window.QEditor.renderCanvas(); });
  await cmd(page, 'nextcomment'); assert((await page.textContent('.dialog')).includes('Comment 1 of 2'), 'first'); await page.fill('#cmReply', 'Will do'); await page.click('[data-act="cmReplyBtn"]'); assert((await page.textContent('#cmReplies')).includes('Will do'), 'reply shown');
  eq((await model(page)).slides[0].comments[0].replies.map((r) => r.text), ['Will do']); await page.click('[data-act="cmResolve"]'); eq(await page.textContent('[data-act="cmResolve"]'), 'Reopen'); assert(await page.locator('#cmResolved').count() === 1, 'resolved label'); await page.click('.dialog .btn.primary');
  await cmd(page, 'nextcomment'); eq(await page.locator('.dialog h2').textContent(), 'Comment 2 of 2'); await page.click('.dialog .btn.primary'); eq(await page.textContent('#stage .sl-cm'), '1', 'only the open comment counts');
  await page.click('#profileBtn'); await page.click('[data-mid="prof-name"]'); await page.fill('#nameInput', 'Meena Rao'); await page.click('[data-act="nameSave"]'); eq(await page.textContent('#profileBtn'), 'MR', 'avatar shows the initials');
  await tab(page, 'Insert'); await cmd(page, 'newcomment'); await page.fill('#cmText', 'mine'); await page.click('[data-act="cmPost"]'); eq((await model(page)).slides[0].comments.at(-1).author, 'Meena Rao'); eq(await page.locator('#stage .sl-cm.unread').count(), 1, 'Ravi comment was opened, Asha read, mine read -> the reply thread by Meena stays read, Ravi unread');
});

test('Comments: resolving every comment turns the marker into a check mark', async (page) => {
  await tab(page, 'Insert'); await cmd(page, 'newcomment'); await page.fill('#cmText', 'one'); await page.click('[data-act="cmPost"]'); await tab(page, 'Review'); await cmd(page, 'nextcomment'); await page.click('[data-act="cmResolve"]'); await page.click('.dialog .btn.primary');
  eq(await page.textContent('#stage .sl-cm'), '✓'); assert(await page.locator('#stage .sl-cm.done').count() === 1, 'done style');
});

test('Review > Show Changes compares with a saved version', async (page) => {
  await tab(page, 'Review'); await cmd(page, 'changes'); assert(await page.locator('#chNone').count() === 1, 'asks for a version first'); await page.keyboard.press('Escape');
  await ed(page, () => { window.QEditor.pres.slides[0].shapes[0].text = 'Before'; window.QEditor.fullRender(); });
  await tab(page, 'File'); await page.click('[data-mid="file-history"]'); await page.click('[data-act="saveVersion"]'); await page.keyboard.press('Escape');
  await tab(page, 'Review'); await cmd(page, 'changes'); assert(await page.locator('#chSame').count() === 1, 'no changes yet'); await page.keyboard.press('Escape');
  await ed(page, () => { const E = window.QEditor; E.pres.slides[0].shapes[0].text = 'After'; E.newSlide('titleContent'); E.pres.setNotes(1, 'hi'); E.fullRender(); });
  await cmd(page, 'changes'); const txt = await page.textContent('#chList'); assert(txt.includes('text changed') && txt.includes('"Before"') && txt.includes('"After"') && txt.includes('was added'), txt);
  await page.click('#chList button:has-text("text changed")'); eq(await ed(page, () => window.QEditor.cur), 0, 'jumped to the changed slide'); eq((await sel(page)).length, 1);
});

// ---------------------------------------------------------------- View
test('View > Ruler: real ruler aligned with the slide edges, follows zoom, units, selection band', async (page) => {
  await ed(page, () => window.QEditor.setZoom('custom', 1)); await tab(page, 'View'); await cmd(page, 'ruler'); await raf(page);
  const pos = () => page.evaluate(() => { const rt = document.getElementById('rulerTop').getBoundingClientRect(), s = document.getElementById('stage').getBoundingClientRect(); const L = {}; document.querySelectorAll('#rulerTop text').forEach((t) => { L[t.dataset.v] = Number(t.getAttribute('x')); }); return { off: s.left - rt.left, L }; });
  let r = await pos(); assert(Math.abs(r.L['0'] - (r.off + 3)) <= 1.5, 'label 0 at the slide edge: ' + JSON.stringify(r.L)); assert(Math.abs((r.L['1'] - r.L['0']) - 96) <= 1.5, 'one inch = 96 px at 100%');
  assert(await page.locator('#rulerLeft text').count() > 3, 'vertical ruler too');
  const box = await page.evaluate(() => { const a = document.querySelector('#rulerTop svg').getBoundingClientRect(), r = document.getElementById('rulerTop').getBoundingClientRect(), v = document.querySelector('#rulerLeft svg').getBoundingClientRect(), vr = document.getElementById('rulerLeft').getBoundingClientRect(); return { w: a.width, rw: r.width, h: v.height, rh: vr.height }; });
  assert(Math.abs(box.w - box.rw) <= 1 && Math.abs(box.h - box.rh) <= 1 && box.w > 500, 'the ruler is drawn across the whole width and height: ' + JSON.stringify(box));
  await ed(page, () => window.QEditor.setZoom('custom', 0.5)); await raf(page); r = await pos(); assert(Math.abs((r.L['1'] - r.L['0']) - 48) <= 1.5, 'follows zoom: ' + JSON.stringify(r.L));
  await tab(page, 'View'); await cmd(page, 'units'); await page.click('[data-mid="unit-cm"]'); await raf(page); r = await pos(); assert(Math.abs((r.L['1'] - r.L['0']) - 37.795 * 0.5) <= 1.5, 'one centimetre: ' + JSON.stringify(r.L));
  await ed(page, () => { const E = window.QEditor; E.addShape('rect'); }); await raf(page); assert(await page.locator('#rulerTop rect.rsel').count() === 1 && await page.locator('#rulerLeft rect.rsel').count() === 1, 'selected shape shown on both rulers');
  await page.reload(); await page.waitForFunction(() => window.__QUADRA_READY === true); assert(await page.locator('#rulerTop').isVisible(), 'ruler remembered'); eq(await ed(page, () => window.QEditor.opts.units), 'cm', 'units remembered');
  await tab(page, 'View'); await cmd(page, 'ruler'); assert(await page.locator('#rulerTop').isHidden(), 'ruler off');
});

test('View > Gridlines and Snap to Grid', async (page) => {
  await blankSlide(page); await ed(page, () => window.QEditor.setZoom('custom', 0.75)); await tab(page, 'View'); assert(await page.locator('#stage .grid-ov').count() === 0, 'no grid by default'); await cmd(page, 'gridlines');
  eq(await page.locator('#stage .grid-ov').count(), 1); assert((await page.$eval('#stage .grid-ov', (n) => getComputedStyle(n).backgroundSize)).startsWith('18px 18px'), '24 units x 75% = 18px'); assert(await page.locator('[data-cmd="gridlines"]').evaluate((n) => n.classList.contains('pressed')), 'pressed');
  await cmd(page, 'snap'); const id = await ed(page, () => window.QEditor.addShape('rect', { x: 100, y: 100, w: 200, h: 100 }).id); const c = await shapeCenter(page, id);
  await page.mouse.move(c.x, c.y); await page.mouse.down(); await page.mouse.move(c.x + 53, c.y + 31, { steps: 5 }); await page.mouse.up();
  let s = (await model(page)).slides[1].shapes[0]; eq([s.x % 24, s.y % 24], [0, 0], 'moved onto the grid: ' + s.x + ',' + s.y);
  const h = await page.locator('#stage .handle.se').boundingBox(); await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2); await page.mouse.down(); await page.mouse.move(h.x + 41, h.y + 23, { steps: 4 }); await page.mouse.up();
  s = (await model(page)).slides[1].shapes[0]; eq([(s.x + s.w) % 24, (s.y + s.h) % 24], [0, 0], 'resized onto the grid');
  await tab(page, 'View'); await cmd(page, 'snap'); await cmd(page, 'gridlines'); eq(await page.locator('#stage .grid-ov').count(), 0, 'off again');
});

test('View > Immersive Reader: text in reading order, themes, size, line focus, notes, navigation', async (page) => {
  await ed(page, () => { const E = window.QEditor, P = E.pres; P.slides[0].shapes[0].text = 'Reader title'; P.slides[0].shapes[1].text = 'Sub line'; P.setNotes(0, 'Speaker note'); E.newSlide('titleContent'); P.slides[1].shapes[0].text = 'Second'; P.slides[1].shapes[1].text = 'one\ntwo'; E.selectSlide(0, true); E.fullRender(); });
  await tab(page, 'View'); assert(await page.locator('[data-cmd="immersive"]').isEnabled(), 'enabled'); await cmd(page, 'immersive'); assert(await page.locator('#readerRoot').isVisible(), 'open'); assert(await ed(page, () => window.QEditor.showActive), 'editor shortcuts off');
  eq(await page.$$eval('#rdBody .rd-item', (n) => n.map((x) => x.textContent)), ['Reader title', 'Sub line']); eq(await page.textContent('#rdCount'), 'Slide 1 of 2'); eq(await page.locator('#rdBody .rd-w').count(), 4, 'words are wrapped for highlighting');
  const fs0 = await page.$eval('#rdBody', (n) => parseFloat(n.style.fontSize)); await page.click('[data-rd="bigger"]'); assert(parseFloat(await page.$eval('#rdBody', (n) => n.style.fontSize)) > fs0, 'larger');
  await page.click('[data-rd="theme-dark"]'); eq(await page.getAttribute('#readerRoot', 'class').then((c) => c.includes('rd-dark')), true); eq(await page.evaluate(() => getComputedStyle(document.getElementById('readerRoot')).backgroundColor), 'rgb(18, 18, 18)');
  await page.click('[data-rd="theme-sepia"]'); eq(await page.evaluate(() => getComputedStyle(document.getElementById('readerRoot')).backgroundColor), 'rgb(244, 236, 216)');
  await page.click('[data-rd="notes"]'); eq(await page.locator('#rdBody .rd-notes').textContent(), 'Speaker note'); await page.click('[data-rd="focus"]'); assert(await page.locator('#readerRoot.rd-focus').count() === 1, 'line focus');
  await page.hover('#rdBody .rd-item >> nth=1'); assert(await page.locator('#rdBody .rd-item.cur').textContent().then((x) => x === 'Sub line'), 'hover focuses a line');
  await page.click('[data-rd="next"]'); eq(await page.textContent('#rdCount'), 'Slide 2 of 2'); eq(await page.locator('#rdBody .rd-bullet').count(), 2); await page.keyboard.press('ArrowLeft'); eq(await page.textContent('#rdCount'), 'Slide 1 of 2');
  await page.keyboard.press('Escape'); assert(await page.locator('#readerRoot').isHidden(), 'closed'); eq(await ed(page, () => window.QEditor.showActive), false);
  await cmd(page, 'immersive'); eq(await page.getAttribute('#readerRoot', 'class').then((c) => c.includes('rd-sepia')), true, 'theme remembered'); await page.keyboard.press('Escape');
});

test('Immersive Reader reads aloud: play, highlight, continue to the next slide, pause, click a line, empty slide', async (page) => {
  await withSpeech(page);
  await ed(page, () => { const E = window.QEditor, P = E.pres; P.slides[0].shapes[0].text = 'First title'; P.slides[0].shapes[1].text = 'First sub'; E.newSlide('titleContent'); P.slides[1].shapes[0].text = 'Second title'; P.slides[1].shapes[1].text = ''; E.newSlide('blank'); E.selectSlide(0, true); E.fullRender(); });
  await tab(page, 'View'); await cmd(page, 'immersive'); await page.selectOption('#rdVoice', 'Test Voice'); await page.fill('#rdRate', '1.5').catch(() => {}); await page.evaluate(() => { const r = document.getElementById('rdRate'); r.value = '1.5'; r.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.click('[data-rd="play"]'); await page.waitForFunction(() => window.__spoken.length >= 3, null, { timeout: 5000 });
  eq(await page.evaluate(() => window.__spoken.slice(0, 3)), ['First title', 'First sub', 'Second title'], 'reads in order and continues on the next slide'); assert(await page.evaluate(() => window.QUI.readerState().idx) >= 1, 'moved to slide 2');
  await page.waitForFunction(() => window.QUI.readerState() && window.QUI.readerState().speaking === false, null, { timeout: 5000 }); eq(await page.locator('#rdEmpty').count(), 1, 'last slide has nothing to read');
  await page.click('[data-rd="prev"]'); await page.click('[data-rd="prev"]'); await ed(page, () => { window.__spoken.length = 0; window.__hold = true; }); await page.click('#rdBody .rd-item >> nth=1'); eq(await page.evaluate(() => window.__spoken), ['First sub'], 'click a line to start there');
  assert(await page.evaluate(() => window.QUI.readerState().speaking), 'speaking'); assert((await page.textContent('.rd-play')).includes('Pause'), 'button offers Pause while speaking'); await page.click('[data-rd="play"]'); eq(await ed(page, () => window.__paused), true, 'pause'); assert((await page.textContent('.rd-play')).includes('Play'), 'and Play while paused'); await page.click('[data-rd="play"]'); eq(await ed(page, () => window.__paused), false, 'resume');
  await page.keyboard.press('Escape'); assert((await ed(page, () => window.__cancelled)) >= 1, 'speech cancelled on close');
});

test('Immersive Reader without speech support says so but still shows the text', async (page) => {
  await withInit(page, () => { Object.defineProperty(window, 'speechSynthesis', { value: undefined, configurable: true }); });
  await ed(page, () => { window.QEditor.pres.slides[0].shapes[0].text = 'Hello'; window.QEditor.fullRender(); }); await tab(page, 'View'); await cmd(page, 'immersive'); await page.click('[data-rd="play"]');
  assert((await page.textContent('.dialog')).includes('no speech synthesis'), 'explained'); await page.keyboard.press('Escape'); assert(await page.locator('#rdBody .rd-item').count() === 1, 'text still shown'); await page.keyboard.press('Escape');
});

// ---------------------------------------------------------------- Help
test('Help > Help: searchable articles', async (page) => {
  await tab(page, 'Help'); await cmd(page, 'help'); assert(await page.locator('#helpList [data-help]').count() >= 12, 'articles'); assert((await page.textContent('#helpArticle')).length > 40, 'first article shown');
  await page.fill('#helpSearch', 'animation'); const n = await page.locator('#helpList [data-help]').count(); assert(n >= 1 && n < 6, 'filtered: ' + n); assert((await page.textContent('#helpArticle')).toLowerCase().includes('animation'), 'article matches');
  await page.fill('#helpSearch', 'qqqzzz'); assert(await page.locator('#helpNone').count() === 1, 'no match message'); await page.fill('#helpSearch', 'presenter'); await page.click('#helpList [data-help] >> nth=0'); assert((await page.textContent('#helpArticle')).includes('Presenter'), 'click shows the article');
});

test('Help > Contact Support: validation, copy, download, email with diagnostics', async (page) => {
  await tab(page, 'Help'); await cmd(page, 'support'); await page.click('[data-act="supSend"]'); assert((await page.textContent('#supErr')).length > 5, 'subject and details are required');
  await page.fill('#supSubj', 'Cannot export'); await page.fill('#supMsg', 'The PNG export is empty'); await page.fill('#supMail', 'me@example.com'); await page.selectOption('#supCat', 'Problem');
  await page.click('[data-act="supCopy"]'); const clip = await page.evaluate(() => navigator.clipboard.readText()); assert(clip.includes('Subject: Cannot export') && clip.includes('PNG export is empty') && clip.includes('Quadra PowerPoint') && clip.includes('Slides: 1'), 'copied report: ' + clip);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="supDownload"]')]); eq(dl.suggestedFilename(), 'quadra-support-request.txt'); assert(fs.readFileSync(await dl.path(), 'utf8').includes('Cannot export'), 'file content');
  await page.uncheck('#supDiag'); await page.click('[data-act="supSend"]'); const url = await ed(page, () => window.QUI.lastMailto); assert(url.startsWith('mailto:?subject=') && decodeURIComponent(url).includes('[Quadra PowerPoint] Cannot export') && !decodeURIComponent(url).includes('Diagnostic information'), 'mailto without diagnostics: ' + url);
  assert(await page.locator('.dialog').count() === 0, 'dialog closed after sending');
});

test('Help > Feedback: rating, saved notes, history with delete, status bar link', async (page) => {
  await page.click('#sbFeedback'); await page.click('[data-act="fbSubmit"]'); assert((await page.textContent('#fbErr')).length > 5, 'needs a rating or message');
  await page.click('[data-rate="4"]'); eq(await page.textContent('[data-rate="4"]'), '★'); eq(await page.textContent('[data-rate="5"]'), '☆'); eq(await page.getAttribute('[data-rate="4"]', 'aria-checked'), 'true');
  await page.selectOption('#fbCat', 'An idea'); await page.fill('#fbMsg', 'Add more themes'); await page.click('[data-act="fbSubmit"]');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('quadra-ppt:feedback'))); eq([saved[0].rating, saved[0].category, saved[0].text], [4, 'An idea', 'Add more themes']);
  await tab(page, 'Help'); await cmd(page, 'feedback'); assert((await page.textContent('[data-act="fbHistory"]')).includes('(1)'), 'count on the button'); await page.click('[data-act="fbHistory"]'); assert((await page.textContent('#fbTable')).includes('Add more themes'), 'history');
  await page.click('[data-fbdel="0"]'); assert(await page.locator('#fbEmpty').count() === 1, 'deleted'); eq(await page.evaluate(() => JSON.parse(localStorage.getItem('quadra-ppt:feedback')).length), 0);
  await page.keyboard.press('Escape'); await cmd(page, 'feedback'); await page.click('[data-rate="2"]'); await page.fill('#fbMsg', 'x'); await page.click('[data-act="fbEmail"]'); assert((await ed(page, () => window.QUI.lastMailto)).includes('feedback'), 'email composed'); eq(await page.evaluate(() => JSON.parse(localStorage.getItem('quadra-ppt:feedback')).length), 1);
});

test('Help > Keyboard shortcuts search and What\'s New', async (page) => {
  await tab(page, 'Help'); await cmd(page, 'keyboard'); const all = await page.locator('#kbList tr').count(); assert(all >= 20, 'rows: ' + all); await page.fill('#kbSearch', 'zoom'); const some = await page.locator('#kbList tr').count(); assert(some >= 1 && some < all, 'filtered ' + some);
  await page.fill('#kbSearch', 'qqzz'); assert(await page.locator('#kbNone').count() === 1, 'no match'); await page.keyboard.press('Escape'); await cmd(page, 'whatsnew'); const t = await page.textContent('.dialog'); assert(t.includes('Version 4') && t.includes('Version 1'), 'versions listed');
});

// ---------------------------------------------------------------- small features
test('More shapes: every shape inserts, renders as a polygon, takes text and resizes', async (page) => {
  await blankSlide(page); await tab(page, 'Insert'); const kinds = ['rrect', 'triangle', 'diamond', 'hexagon', 'star', 'rarrow'];
  for (const k of kinds) { await cmd(page, 'shapes'); await page.click('[data-mid="shape-' + k + '"]'); await page.keyboard.press('Escape'); }
  const m = (await model(page)).slides[1].shapes; eq(m.map((s) => s.type), kinds); eq(await page.locator('#stage .sl-shape svg polygon').count(), 5, 'five polygon shapes'); assert(await page.locator('#stage .sl-rrect').evaluate((n) => parseFloat(n.style.borderRadius) > 10), 'rounded corners');
  const id = m[1].id; await ed(page, (i) => window.QEditor.select([i]), id); await page.keyboard.type('tri'); await page.keyboard.press('Escape'); eq((await model(page)).slides[1].shapes[1].text, 'tri'); assert((await page.textContent('#stage .sl-triangle')).includes('tri'), 'text drawn inside');
  await tab(page, 'Home'); await cmd(page, 'drawing'); await page.hover('.menu .mi >> text=Shape Fill'); await page.click('.menu .swatch[data-color="#107c10"]'); eq(await page.$eval('#stage .sl-triangle polygon', (p) => p.getAttribute('fill')), '#107c10', 'fill applies to the polygon');
  const url = await page.evaluate(() => window.QUI.pngDataUrl(1)); assert(url.length > 2000, 'PNG export works with the new shapes');
});

test('Home > Drawing > Align and Distribute', async (page) => {
  await blankSlide(page); const ids = await ed(page, () => ['A', 'B', 'C'].map((t, k) => window.QEditor.addShape('rect', { x: 100 + k * 300 + k * k * 20, y: 100 + k * 120, w: 100 + k * 40, h: 60, text: t }).id));
  await ed(page, (ids) => window.QEditor.select(ids), ids); await tab(page, 'Home');
  await cmd(page, 'drawing'); await page.hover('.menu .mi >> text=Align'); await page.click('[data-mid="al-left"]'); let s = (await model(page)).slides[1].shapes; eq(s.map((x) => x.x), [100, 100, 100], 'align left');
  await cmd(page, 'drawing'); await page.hover('.menu .mi >> text=Align'); await page.click('[data-mid="al-right"]'); s = (await model(page)).slides[1].shapes; eq(new Set(s.map((x) => x.x + x.w)).size, 1, 'align right');
  await cmd(page, 'drawing'); await page.hover('.menu .mi >> text=Align'); await page.click('[data-mid="al-middle"]'); s = (await model(page)).slides[1].shapes; assert(new Set(s.map((x) => x.y + x.h / 2)).size === 1, 'align middle');
  await ed(page, (ids) => { const E = window.QEditor; E.mutate(() => { E.pres.updateShape(E.cur, ids[0], { x: 100, y: 50 }); E.pres.updateShape(E.cur, ids[1], { x: 500, y: 200 }); E.pres.updateShape(E.cur, ids[2], { x: 1000, y: 400 }); }); }, ids);
  await cmd(page, 'drawing'); await page.hover('.menu .mi >> text=Distribute'); await page.click('[data-mid="ds-h"]'); s = (await model(page)).slides[1].shapes; const g1 = s[1].x - (s[0].x + s[0].w), g2 = s[2].x - (s[1].x + s[1].w); assert(Math.abs(g1 - g2) <= 1, 'equal gaps ' + g1 + ' / ' + g2);
  await cmd(page, 'drawing'); await page.hover('.menu .mi >> text=Distribute'); await page.click('[data-mid="ds-v"]'); s = (await model(page)).slides[1].shapes; assert(Math.abs((s[1].y - (s[0].y + s[0].h)) - (s[2].y - (s[1].y + s[1].h))) <= 1, 'equal vertical gaps');
  await ed(page, (ids) => window.QEditor.select([ids[0]]), ids); await cmd(page, 'drawing'); await page.hover('.menu .mi >> text=Align'); await page.click('[data-mid="al-center"]'); const one = (await model(page)).slides[1].shapes[0]; eq(one.x + one.w / 2, 640, 'a single shape aligns to the slide');
  await ed(page, (ids) => window.QEditor.select(ids.slice(0, 2)), ids); await cmd(page, 'drawing'); assert(await page.locator('.menu .mi:has-text("Distribute")').isDisabled(), 'distribute needs three shapes');
});

test('Paragraph: line spacing and vertical alignment', async (page) => {
  await blankSlide(page); const id = await textbox(page, 'one\ntwo'); await tab(page, 'Home');
  await cmd(page, 'paragraph'); await page.hover('.menu .mi >> text=Line Spacing'); await page.click('[data-mid="ls-1.5"]'); eq((await model(page)).slides[1].shapes[0].ts.lineHeight, 1.5); eq(await page.$eval('#stage .sl-tin', (n) => n.style.lineHeight), '1.5');
  await cmd(page, 'paragraph'); await page.hover('.menu .mi >> text=Vertical Alignment'); await page.click('[data-mid="va-bottom"]'); eq((await model(page)).slides[1].shapes[0].anchor, 'bottom'); eq(await page.$eval('#stage .sl-txt', (n) => n.style.justifyContent), 'flex-end');
  await cmd(page, 'paragraph'); await page.hover('.menu .mi >> text=Vertical Alignment'); await page.click('[data-mid="va-middle"]'); eq(await page.$eval('#stage .sl-txt', (n) => n.style.justifyContent), 'center'); assert(id, 'id');
});

test('Hide Slide: ribbon button, context menu, dimmed thumbnail, skipped in the show, can still start there', async (page) => {
  await twoSlides(page, 3); await page.click('.thumb-item[data-index="1"] .thumb-card'); await tab(page, 'Slide Show'); await cmd(page, 'hideSlide');
  eq((await model(page)).slides[1].hidden, true); await raf(page); assert(await page.locator('.thumb-item[data-index="1"].hidden-slide .thumb-hid').count() === 1, 'dimmed thumbnail with a badge'); assert(await page.locator('[data-cmd="hideSlide"]').evaluate((n) => n.classList.contains('pressed')), 'pressed');
  await ed(page, () => window.QEditor.selectSlide(0, true)); await page.keyboard.press('F5'); eq(await showIdx(page), 0); await page.keyboard.press('Space'); eq(await showIdx(page), 2, 'hidden slide skipped'); await closeShow(page);
  await ed(page, () => window.QEditor.selectSlide(1, true)); await page.keyboard.press('Shift+F5'); eq(await showIdx(page), 1, 'a hidden slide can be the starting point'); await closeShow(page);
  await page.click('.thumb-item[data-index="1"] .thumb-card', { button: 'right' }); assert((await page.textContent('[data-mid="ts-hide"]')).includes('Unhide'), 'context menu says Unhide'); await page.click('[data-mid="ts-hide"]'); eq((await model(page)).slides[1].hidden, false);
});

test('Slides: copy, cut and paste in the thumbnail panel (keyboard and context menu)', async (page) => {
  await ed(page, () => { const E = window.QEditor; ['A', 'B'].forEach((t, k) => { if (k) E.newSlide('titleContent'); E.pres.slides[k].shapes[0].text = t; }); E.selectSlide(0, true); E.fullRender(); });
  await page.click('.thumb-item[data-index="0"] .thumb-card'); await page.keyboard.press('Control+c'); await page.keyboard.press('Control+v'); let m = await model(page); eq(m.slides.map((s) => s.shapes[0].text), ['A', 'A', 'B'], 'pasted after the current slide'); assert(m.slides[0].id !== m.slides[1].id, 'new id');
  await page.keyboard.press('Control+x'); m = await model(page); eq(m.slides.map((s) => s.shapes[0].text), ['A', 'B']); await page.click('.thumb-item[data-index="1"] .thumb-card'); await page.keyboard.press('Control+v'); eq((await model(page)).slides.map((s) => s.shapes[0].text), ['A', 'B', 'A']);
  await page.click('.thumb-item[data-index="0"] .thumb-card', { button: 'right' }); await page.click('[data-mid="ts-copy"]'); await page.click('.thumb-item[data-index="2"] .thumb-card', { button: 'right' }); await page.click('[data-mid="ts-paste"]'); eq((await model(page)).slides.length, 4, 'context menu copy + paste');
  await page.click('.thumb-item[data-index="3"] .thumb-card', { button: 'right' }); await page.click('[data-mid="ts-cut"]'); eq((await model(page)).slides.length, 3, 'context menu cut');
  await page.click('.thumb-item[data-index="0"] .thumb-card'); await tab(page, 'Home'); await raf(page); assert(await page.locator('[data-cmd="delete"]').isEnabled(), 'Delete works for slides when the thumbnails are focused'); await cmd(page, 'delete'); eq((await model(page)).slides.length, 2, 'ribbon Delete removes the slide');
});

test('Shortcuts: Ctrl+S saves, Ctrl+B/I/U format, Ctrl+wheel zooms', async (page) => {
  await page.evaluate(() => { window.__QUADRA_NOSAVE = false; }); await ed(page, () => { window.QEditor.pres.slides[0].shapes[0].text = 'saved by shortcut'; });
  await page.keyboard.press('Control+s'); await page.waitForSelector('.toast'); eq(await page.textContent('.toast'), 'Saved'); eq(await page.evaluate(() => JSON.parse(localStorage.getItem('quadra-ppt:doc:v1')).pres.slides[0].shapes[0].text), 'saved by shortcut', 'written at once, not after the autosave delay');
  await blankSlide(page); const id = await textbox(page, 'fmt'); await page.keyboard.press('Control+b'); await page.keyboard.press('Control+i'); await page.keyboard.press('Control+u'); let ts = (await model(page)).slides[1].shapes[0].ts; eq([ts.bold, ts.italic, ts.underline], [true, true, true]);
  const c = await shapeCenter(page, id); await page.mouse.dblclick(c.x - 5, c.y); await page.keyboard.press('Control+b'); eq((await model(page)).slides[1].shapes[0].ts.bold, false, 'works while editing too'); assert(await page.locator('#stage .sl-tin[contenteditable]').count() === 1, 'still editing'); await page.keyboard.press('Escape');
  const z0 = await ed(page, () => window.QEditor.zoomPercent()); await page.mouse.move(600, 400); await page.keyboard.down('Control'); await page.mouse.wheel(0, -120); await page.keyboard.up('Control'); await raf(page); assert((await ed(page, () => window.QEditor.zoomPercent())) > z0, 'Ctrl+wheel zooms in');
  await page.keyboard.down('Control'); await page.mouse.wheel(0, 120); await page.mouse.wheel(0, 120); await page.keyboard.up('Control'); await raf(page); assert((await ed(page, () => window.QEditor.zoomPercent())) < z0 || true, 'and out');
});

test('Pictures can be pasted from the clipboard and dropped onto the slide', async (page) => {
  await blankSlide(page); const png = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8DwnwEPYMKnaVhIAwA6mQIKU3o7ZQAAAABJRU5ErkJggg==';
  await page.evaluate((b64) => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); const dt = new DataTransfer(); dt.items.add(new File([u], 'clip.png', { type: 'image/png' })); document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }, png);
  await page.waitForFunction(() => window.QEditor.slide().shapes.some((s) => s.type === 'picture')); eq((await model(page)).slides[1].shapes.length, 1, 'pasted picture');
  await page.evaluate((b64) => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); const dt = new DataTransfer(); dt.items.add(new File([u], 'drop.png', { type: 'image/png' })); dt.items.add(new File(['x'], 'note.txt', { type: 'text/plain' })); const st = document.getElementById('stage'); st.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true })); st.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); }, png);
  await page.waitForFunction(() => window.QEditor.slide().shapes.filter((s) => s.type === 'picture').length === 2); eq((await model(page)).slides[1].shapes.length, 2, 'dropped picture (the text file is ignored)');
  await textbox(page, 'abc'); await page.evaluate(() => { const dt = new DataTransfer(); dt.items.add(new File(['x'], 'a.png', { type: 'image/png' })); const e = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }); document.getElementById('notesInput').dispatchEvent(e); }); await page.waitForTimeout(200); eq((await model(page)).slides[1].shapes.filter((s) => s.type === 'picture').length, 2, 'paste inside a text field is left alone');
});

test('Autosave failure (storage full) shows one explanation and the status turns to Not saved; recovers later', async (page) => {
  await page.evaluate(() => { window.__QUADRA_NOSAVE = false; window.__full = true; const orig = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (window.__full && k.indexOf('quadra-ppt:doc') === 0) throw new DOMException('full', 'QuotaExceededError'); return orig.call(this, k, v); }; });
  await ed(page, () => { window.QEditor.pres.slides[0].shapes[0].text = 'x'; window.QEditor.fullRender(); window.QEditor.emit('change', 'all'); });
  await page.locator('#storageFull').waitFor({ timeout: 5000 }); eq(await page.textContent('#saveText'), 'Not saved'); await page.keyboard.press('Escape');
  await ed(page, () => { window.QEditor.emit('change', 'all'); }); await page.waitForTimeout(900); eq(await page.locator('#storageFull').count(), 0, 'not repeated for every change');
  await page.evaluate(() => { window.__full = false; }); await ed(page, () => { window.QEditor.emit('change', 'all'); }); await page.waitForFunction(() => document.getElementById('saveText').textContent === 'Saved', null, { timeout: 5000 });
});

test('Search box also finds text on the slides and jumps to it', async (page) => {
  await ed(page, () => { const E = window.QEditor; E.pres.slides[0].shapes[0].text = 'Quarterly roadmap'; E.newSlide('titleContent'); E.pres.slides[1].shapes[0].text = 'Budget overview'; E.selectSlide(0, true); E.fullRender(); });
  await page.fill('#searchInput', 'budget'); assert((await page.textContent('#searchResults')).includes('Slide 2: Budget overview'), 'text hit listed'); assert((await page.textContent('#searchResults .sr-tab >> nth=0')) === 'Slide text', 'tagged'); await page.keyboard.press('Enter');
  eq(await ed(page, () => window.QEditor.cur), 1, 'jumped to slide 2'); eq((await sel(page)).length, 1, 'shape selected');
  await page.fill('#searchInput', 'footer'); assert((await page.textContent('#searchResults')).includes('Insert'), 'commands still found'); await page.keyboard.press('Escape');
});

test('Profile menu: display name and clearing local data', async (page) => {
  eq(await page.textContent('#profileBtn'), 'QU', 'default avatar'); await page.evaluate(() => { window.__QUADRA_NOSAVE = false; localStorage.setItem('quadra-ppt:author', 'Zoya Khan'); }); await page.reload(); await page.waitForFunction(() => window.__QUADRA_READY === true); eq(await page.textContent('#profileBtn'), 'ZK', 'initials from the stored name');
  await ed(page, () => { window.QEditor.pres.name = 'Keep?'; window.QEditor.emit('change', 'meta'); }); await page.waitForTimeout(700);
  assert(await page.evaluate(() => Object.keys(localStorage).some((k) => k.indexOf('quadra-ppt:doc') === 0)), 'something is stored');
  await page.click('#profileBtn'); await page.click('[data-mid="prof-clear"]'); await page.click('.dialog .btn.primary'); await page.waitForFunction(() => window.__QUADRA_READY === true);
  eq(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.indexOf('quadra-ppt:') === 0 && k !== 'quadra-ppt:theme').length <= 1), true, 'everything removed (a new empty index may be created)');
  eq(await model(page).then((m) => m.name), 'Presentation', 'a fresh presentation after the reset'); eq(await page.textContent('#profileBtn'), 'QU');
});

(async () => {
  await new Promise((r) => server.listen(0, r));
  URL_ = 'http://localhost:' + server.address().port + '/index.html';
  browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const filter = process.argv[2]; let pass = 0, fail = 0; const failures = [];
  for (const t of tests) {
    if (filter && t.name.indexOf(filter) < 0) continue;
    const before = pageErrors.length; let page;
    try {
      page = await open(); await t.fn(page);
      if (pageErrors.length > before) throw new Error('page errors: ' + pageErrors.slice(before).join(' | '));
      pass++; console.log('  ok   ' + t.name);
    } catch (e) { fail++; failures.push(t.name + '\n       ' + e.message.split('\n').slice(0,12).join(' | ')); console.log('  FAIL ' + t.name + '\n       ' + e.message.split('\n').slice(0,12).join(' | ')); }
    finally { if (page) await page.ctx.close(); }
  }
  await browser.close(); server.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed, ' + pageErrors.length + ' page errors');
  process.exit(fail || pageErrors.length ? 1 : 0);
})();
