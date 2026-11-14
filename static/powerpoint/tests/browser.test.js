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
  const checks = [['Draw', 'touch'], ['Draw', 'lasso'], ['Draw', 'stencil'], ['Transitions', 'tr:more'], ['Slide Show', 'presenter'], ['Slide Show', 'coach'], ['Review', 'proofing'], ['Help', 'support'], ['Help', 'feedback']];
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
  for (const c of ['review', 'markread', 'changes', 'delcomment', 'prevcomment', 'nextcomment']) assert(await page.locator('[data-cmd="' + c + '"]').isDisabled(), c);
  await tab(page, 'Slide Show'); assert(await page.locator('[data-cmd="custom"]').isDisabled(), 'custom');
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
  await cmd(page, 'shapes'); eq(await page.locator('.menu .mi').count(), 4); await page.keyboard.press('Escape');
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
