// Model tests for engine.js — run: node --test tests/model.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../engine.js');
const { Presentation, History, ShowState } = E;

test('blank presentation has one Title slide with 2 placeholders', () => {
  const p = Presentation.blank();
  assert.equal(p.slides.length, 1);
  assert.equal(p.slides[0].layout, 'title');
  assert.deepEqual(p.slides[0].shapes.map((s) => s.ph), ['title', 'subtitle']);
  assert.equal(p.size, '16:9'); assert.equal(p.H, 720);
});

test('add / duplicate / delete / move slides', () => {
  const p = Presentation.blank();
  const i = p.addSlide('titleContent', 0);
  assert.equal(i, 1); assert.equal(p.slides.length, 2);
  p.slides[1].shapes[0].text = 'Two';
  const d = p.duplicateSlide(1);
  assert.equal(d, 2);
  assert.equal(p.slides[2].shapes[0].text, 'Two');
  assert.notEqual(p.slides[2].id, p.slides[1].id);
  assert.notEqual(p.slides[2].shapes[0].id, p.slides[1].shapes[0].id);
  p.moveSlide(2, 0);
  assert.equal(p.slides[0].shapes[0].text, 'Two');
  const after = p.deleteSlide(0);
  assert.equal(after, 0); assert.equal(p.slides.length, 2);
});

test('deleting the last slide leaves one fresh slide', () => {
  const p = Presentation.blank();
  p.slides[0].shapes[0].text = 'x';
  p.deleteSlide(0);
  assert.equal(p.slides.length, 1);
  assert.equal(p.slides[0].shapes[0].text, '');
});

test('all four layouts create the right placeholders', () => {
  const p = Presentation.blank();
  const kinds = { title: 2, titleContent: 2, section: 2, blank: 0 };
  Object.keys(kinds).forEach((l) => {
    const i = p.addSlide(l);
    assert.equal(p.slides[i].shapes.length, kinds[l], l);
  });
});

test('setLayout keeps text and removes unused empty placeholders', () => {
  const p = Presentation.blank();
  p.slides[0].shapes[0].text = 'Hello';
  p.setLayout(0, 'titleContent');
  assert.equal(p.slides[0].layout, 'titleContent');
  assert.equal(p.slides[0].shapes.find((s) => s.ph === 'title').text, 'Hello');
  p.setLayout(0, 'blank');
  const left = p.slides[0].shapes;
  assert.equal(left.length, 1);            // empty body removed, titled text kept
  assert.equal(left[0].text, 'Hello'); assert.equal(left[0].ph, null);
});

test('addShape creates every shape type with defaults inside the slide', () => {
  const p = Presentation.blank();
  ['rect', 'oval', 'line', 'arrow', 'textbox', 'picture'].forEach((t) => {
    const sh = p.addShape(0, t);
    assert.ok(sh, t); assert.equal(sh.type, t);
    assert.ok(sh.x >= 0 && sh.x + sh.w <= p.W, t + ' x');
  });
  assert.equal(p.addShape(0, 'nope'), null);
  const r = p.slides[0].shapes.find((s) => s.type === 'rect');
  assert.equal(r.fill, p.themeVars().accent);
});

test('shape properties: position, size, fill, outline, rotation', () => {
  const p = Presentation.blank();
  const sh = p.addShape(0, 'rect');
  p.updateShape(0, sh.id, { x: 10, y: 20, w: 300, h: 100, rot: 45, fill: '#ff0000', line: { width: 6 } });
  const g = p.getShape(0, sh.id);
  assert.deepEqual([g.x, g.y, g.w, g.h, g.rot, g.fill, g.line.width], [10, 20, 300, 100, 45, '#ff0000', 6]);
});

test('text style properties', () => {
  const p = Presentation.blank();
  const sh = p.addShape(0, 'textbox');
  p.updateShape(0, sh.id, { text: 'abc', ts: { bold: true, italic: true, underline: true, size: 40, font: 'Georgia', color: '#00ff00', align: 'right', list: 'bullet' } });
  const t = p.getShape(0, sh.id).ts;
  assert.equal(t.bold && t.italic && t.underline, true);
  assert.equal(t.size, 40); assert.equal(t.align, 'right'); assert.equal(t.list, 'bullet');
});

test('remove shapes also removes their animations', () => {
  const p = Presentation.blank();
  const sh = p.addShape(0, 'rect');
  p.setAnim(0, sh.id, 'fade');
  assert.equal(p.slides[0].anims.length, 1);
  assert.equal(p.removeShapes(0, [sh.id]), 1);
  assert.equal(p.slides[0].anims.length, 0);
});

test('z-order', () => {
  const p = Presentation.blank();
  const a = p.addShape(0, 'rect'), b = p.addShape(0, 'oval');
  p.reorderShape(0, a.id, 'front');
  assert.equal(p.slides[0].shapes.at(-1).id, a.id);
  p.reorderShape(0, a.id, 'back');
  assert.equal(p.slides[0].shapes[0].id, a.id);
  assert.ok(b);
});

test('copy / paste gives new ids and offset', () => {
  const p = Presentation.blank();
  const a = p.addShape(0, 'rect');
  const pack = p.packShapes(0, [a.id]);
  const ids = p.pasteShapes(0, pack, 20, 20);
  assert.equal(ids.length, 1); assert.notEqual(ids[0], a.id);
  const n = p.getShape(0, ids[0]);
  assert.equal(n.x, a.x + 20); assert.equal(n.y, a.y + 20);
});

test('speaker notes, transitions, apply to all', () => {
  const p = Presentation.blank(); p.addSlide('blank'); p.addSlide('blank');
  p.setNotes(1, 'remember this'); assert.equal(p.slides[1].notes, 'remember this');
  p.setTransition(0, { type: 'fade', dur: 1.5 });
  p.applyTransitionToAll(0);
  assert.ok(p.slides.every((s) => s.transition.type === 'fade' && s.transition.dur === 1.5));
  p.setTransition(0, { type: 'bogus' });
  assert.equal(p.slides[0].transition.type, 'fade');
  ['none', 'cut', 'fade', 'push', 'wipe'].forEach((t) => { p.setTransition(0, { type: t }); assert.equal(p.slides[0].transition.type, t); });
});

test('slide size 16:9 <-> 4:3 scales vertical geometry', () => {
  const p = Presentation.blank();
  const sh = p.addShape(0, 'rect'); p.updateShape(0, sh.id, { y: 360, h: 180 });
  p.setSize('4:3');
  assert.equal(p.H, 960);
  assert.equal(p.getShape(0, sh.id).y, 480); assert.equal(p.getShape(0, sh.id).h, 240);
  p.setSize('16:9'); assert.equal(p.getShape(0, sh.id).y, 360);
});

test('themes and variants change theme vars', () => {
  const p = Presentation.blank();
  const light = p.themeVars();
  p.setTheme('midnight', 0);
  assert.equal(p.themeVars().bg, '#0b0b0b');
  p.setTheme('midnight', 1);
  assert.equal(p.themeVars().bg, '#ffffff'); assert.notEqual(p.themeVars().fg, '#ffffff');
  assert.notEqual(light.bg, '#0b0b0b');
});

test('JSON round trip and corrupt input', () => {
  const p = Presentation.blank(); p.addSlide('titleContent'); p.addShape(1, 'oval');
  p.name = 'Deck'; p.footer = { show: true, text: 'Foot', numbers: true };
  const q = Presentation.fromJSON(JSON.stringify(p.toJSON()));
  assert.deepEqual(q.toJSON(), p.toJSON());
  const bad = Presentation.fromJSON('{not json');
  assert.equal(bad.slides.length, 1);
  const weird = Presentation.fromJSON({ slides: [{ shapes: [{ type: 'rect', x: 'a' }] }], size: '5:4', theme: { id: 'zz' } });
  assert.equal(weird.size, '16:9'); assert.equal(weird.theme.id, 'plain'); assert.equal(weird.slides[0].shapes[0].x, 0);
});

test('ids stay unique after loading', () => {
  const p = Presentation.blank(); p.addSlide('titleContent');
  const q = Presentation.fromJSON(p.toJSON());
  const ids = [];
  q.slides.forEach((s) => { ids.push(s.id); s.shapes.forEach((x) => ids.push(x.id)); });
  assert.equal(new Set(ids).size, ids.length);
  const n = q.addShape(0, 'rect');
  assert.ok(!ids.includes(n.id));
});

test('find and replace', () => {
  const p = Presentation.blank();
  p.slides[0].shapes[0].text = 'Cat and cat';
  p.slides[0].shapes[1].text = 'concatenate';
  assert.equal(p.findAll('cat', false).length, 3);
  assert.equal(p.findAll('cat', true).length, 2);
  assert.equal(p.replaceAll('cat', 'dog', false), 3);
  assert.equal(p.slides[0].shapes[0].text, 'dog and dog');
  assert.equal(p.slides[0].shapes[1].text, 'condogenate');
  assert.equal(p.replaceAll('zzz', 'y', false), 0);
  p.slides[0].shapes[0].text = 'a.b a.b';
  assert.equal(p.replaceAll('a.b', 'X', true), 2);   // regex chars are literal
  assert.equal(p.slides[0].shapes[0].text, 'X X');
});

test('accessibility check', () => {
  const p = Presentation.blank();
  assert.equal(p.checkAccessibility().length, 1);       // empty title
  p.slides[0].shapes[0].text = 'Title';
  assert.equal(p.checkAccessibility().length, 0);
  const pic = p.addShape(0, 'picture');
  assert.equal(p.checkAccessibility().length, 1);
  p.updateShape(0, pic.id, { alt: 'a cat' });
  assert.equal(p.checkAccessibility().length, 0);
});

test('history undo/redo', () => {
  const h = new History(3);
  h.push('a'); h.push('b');
  assert.equal(h.undo('c'), 'b'); assert.equal(h.undo('b'), 'a');
  assert.equal(h.undo('a'), null);
  assert.equal(h.redo('a'), 'b'); assert.equal(h.redo('b'), 'c');
  assert.equal(h.redo('c'), null);
  h.undo('c'); h.push('x'); assert.equal(h.canRedo(), false);
  h.push('1'); h.push('2'); h.push('3'); assert.equal(h.u.length, 3);
});

function showDeck() {
  const p = Presentation.blank(); p.addSlide('blank');
  const a = p.addShape(0, 'rect'), b = p.addShape(0, 'oval'), c = p.addShape(0, 'textbox');
  p.setAnim(0, a.id, 'appear'); p.setAnim(0, b.id, 'fade', { start: 'withprev' }); p.setAnim(0, c.id, 'flyin', { start: 'onclick' });
  return { p, a, b, c };
}

test('animation groups: onclick starts a group, withprev/afterprev join', () => {
  const { p, a, b, c } = showDeck();
  const g = E.animGroups(p.slides[0]);
  assert.equal(g.length, 2);
  assert.deepEqual(g[0].entries.map((x) => x.shapeId), [a.id, b.id]);
  assert.deepEqual(g[1].entries.map((x) => x.shapeId), [c.id]);
});

test('group timeline orders with-previous and after-previous', () => {
  const p = Presentation.blank();
  const s = [p.addShape(0, 'rect'), p.addShape(0, 'oval'), p.addShape(0, 'textbox')];
  p.setAnim(0, s[0].id, 'fade', { dur: 1 });
  p.setAnim(0, s[1].id, 'fade', { start: 'withprev', dur: 2 });
  p.setAnim(0, s[2].id, 'fade', { start: 'afterprev', dur: 1, delay: 0.5 });
  const tl = E.groupTimeline(E.animGroups(p.slides[0])[0]);
  assert.deepEqual(tl.map((t) => t.at), [0, 0, 2.5]);
});

test('move animation earlier / later changes order', () => {
  const { p, a, c } = showDeck();
  const ca = p.getAnim(0, c.id);
  p.moveAnim(0, ca.id, -2);
  assert.equal(p.slides[0].anims[0].shapeId, c.id);
  assert.ok(a);
});

test('slideshow state: click reveals groups, then next slide, then end', () => {
  const { p, a, b, c } = showDeck();
  const st = new ShowState(p, 0);
  assert.deepEqual(st.hiddenIds().sort(), [a.id, b.id, c.id].sort());
  let r = st.next(); assert.equal(r.kind, 'anim'); assert.equal(r.group.entries.length, 2);
  assert.deepEqual(st.hiddenIds(), [c.id]);
  r = st.next(); assert.equal(r.kind, 'anim');
  assert.deepEqual(st.hiddenIds(), []);
  r = st.next(); assert.equal(r.kind, 'slide'); assert.equal(st.i, 1);
  r = st.next(); assert.equal(r.kind, 'end');
});

test('slideshow state: automatic first group plays on entering', () => {
  const p = Presentation.blank();
  const a = p.addShape(0, 'rect'); p.setAnim(0, a.id, 'fade', { start: 'afterprev' });
  const st = new ShowState(p, 0);
  assert.equal(st.auto.length, 1); assert.equal(st.g, 1);
  assert.equal(st.next().kind, 'end');
});

test('slideshow state: previous goes back through groups then slides', () => {
  const { p } = showDeck();
  const st = new ShowState(p, 0);
  st.next(); st.next(); st.next();
  assert.equal(st.i, 1);
  let r = st.prev(); assert.equal(r.kind, 'slide'); assert.equal(st.i, 0); assert.deepEqual(st.hiddenIds(), []);
  r = st.prev(); assert.equal(r.kind, 'unanim'); assert.equal(st.hiddenIds().length, 1);
  r = st.prev(); assert.equal(r.kind, 'unanim');
  assert.equal(st.prev().kind, 'none');
});

test('slideshow next returns the new slide transition', () => {
  const p = Presentation.blank(); p.addSlide('blank');
  p.setTransition(1, { type: 'fade', dur: 2 });
  const r = new ShowState(p, 0).next();
  assert.equal(r.transition.type, 'fade'); assert.equal(r.transition.dur, 2);
});

test('contrast and shade helpers', () => {
  assert.equal(E.contrastColor('#ffffff'), '#1b1b1b');
  assert.equal(E.contrastColor('#000000'), '#ffffff');
  assert.equal(E.shade('#808080', -0.5), '#404040');
});

test('tables: create, edit cells, add/remove rows and columns', () => {
  const p = Presentation.blank();
  const t = p.addShape(0, 'table', { rows: 2, cols: 3 });
  assert.equal(t.cells.length, 2); assert.equal(t.cells[0].length, 3);
  assert.ok(p.setCell(0, t.id, 1, 2, 'x')); assert.equal(p.getShape(0, t.id).cells[1][2], 'x');
  assert.equal(p.setCell(0, t.id, 9, 9, 'no'), false);
  const h = t.h;
  assert.ok(p.tableOp(0, t.id, 'addRow', 2)); assert.equal(p.getShape(0, t.id).cells.length, 3); assert.equal(p.getShape(0, t.id).h, h / 2 * 3);
  assert.ok(p.tableOp(0, t.id, 'addCol', 0)); assert.equal(p.getShape(0, t.id).cells[0].length, 4); assert.equal(p.getShape(0, t.id).cells[1][3], 'x');
  assert.ok(p.tableOp(0, t.id, 'delCol', 3)); assert.ok(p.tableOp(0, t.id, 'delRow', 0));
  assert.equal(p.getShape(0, t.id).cells.length, 2);
  const one = p.addShape(0, 'table', { rows: 1, cols: 1 });
  assert.equal(p.tableOp(0, one.id, 'delRow', 0), false); assert.equal(p.tableOp(0, one.id, 'delCol', 0), false);
  const q = Presentation.fromJSON(p.toJSON()); assert.deepEqual(q.getShape(0, t.id).cells, p.getShape(0, t.id).cells);
  const bad = E.normShape({ type: 'table', cells: 'oops' }); assert.equal(bad.cells.length, 2);
});

test('charts: defaults, normalisation, kinds', () => {
  const p = Presentation.blank();
  const c = p.addShape(0, 'chart');
  assert.equal(c.chart.kind, 'bar'); assert.deepEqual(c.chart.values, [4, 7, 3, 6]);
  const l = p.addShape(0, 'chart', { chart: { kind: 'pie', labels: ['a', 'b'], values: ['3', 'x'] } });
  assert.equal(l.chart.kind, 'pie'); assert.deepEqual(l.chart.values, [3, 0]);
  assert.equal(E.normShape({ type: 'chart', chart: { kind: 'radar' } }).chart.kind, 'bar');
});

test('media shapes and links are validated', () => {
  const p = Presentation.blank();
  const v = p.addShape(0, 'video', { src: 'https://example.com/a.mp4' }); const a = p.addShape(0, 'audio');
  assert.equal(v.type, 'video'); assert.equal(a.h, 56);
  const r = p.addShape(0, 'rect');
  assert.ok(p.setLink(0, r.id, { type: 'url', url: 'example.com' })); assert.equal(p.getShape(0, r.id).link.url, 'https://example.com');
  assert.equal(p.setLink(0, r.id, { type: 'url', url: 'javascript:alert(1)' }), false);
  assert.equal(E.safeUrl('mailto:a@b.c'), 'mailto:a@b.c'); assert.equal(E.safeUrl('data:text/html,x'), null); assert.equal(E.safeUrl(''), null);
  p.addSlide('blank'); assert.ok(p.setLink(0, r.id, { type: 'slide', index: 1 })); assert.equal(p.setLink(0, r.id, { type: 'slide', index: 5 }), false);
  assert.ok(p.setLink(0, r.id, null)); assert.equal(p.getShape(0, r.id).link, null);
});

test('comments: add, list, remove, survive duplicate and JSON', () => {
  const p = Presentation.blank(); p.addSlide('blank');
  assert.equal(p.addComment(0, '   '), null);
  const c = p.addComment(0, 'Fix title'); p.addComment(1, 'Second');
  assert.equal(p.allComments().length, 2);
  const d = p.duplicateSlide(0); assert.equal(p.slides[d].comments[0].text, 'Fix title'); assert.notEqual(p.slides[d].comments[0].id, c.id);
  const q = Presentation.fromJSON(p.toJSON()); assert.equal(q.allComments().length, 3);
  assert.ok(p.removeComment(0, c.id)); assert.equal(p.removeComment(0, c.id), false);
});

test('SmartArt builds editable shapes for list, process and cycle', () => {
  const p = Presentation.blank(); p.addSlide('blank');
  assert.equal(p.addSmartArt(1, 'list', ['A', 'B', 'C']).length, 3);
  assert.equal(p.addSmartArt(1, 'process', ['A', 'B', 'C']).length, 5);   // 3 boxes + 2 arrows
  assert.equal(p.addSmartArt(1, 'cycle', ['A', 'B', 'C', 'D']).length, 4);
  assert.deepEqual(p.addSmartArt(1, 'list', ['', ' ']), []);
  p.slides[1].shapes.forEach((s) => assert.ok(s.x >= 0 && s.x + s.w <= p.W && s.y >= 0 && s.y + s.h <= p.H, s.type + ' inside slide'));
  assert.equal(p.slides[1].shapes[0].text, 'A');
});

test('stock images, outline text, word count, slide numbers flag', () => {
  assert.equal(E.STOCK.length, 12); assert.ok(E.STOCK.every((s) => s.svg.startsWith('<svg') && s.svg.endsWith('</svg>')));
  assert.ok(E.stockUrl('sunset').startsWith('data:image/svg+xml')); assert.equal(E.stockUrl('nope'), null);
  const p = Presentation.blank(); p.slides[0].shapes[0].text = 'Hello world'; p.slides[0].shapes[1].text = 'one two'; p.setNotes(0, 'note here');
  assert.deepEqual(p.wordCount(), { slides: 1, words: 6, chars: 'Helloworldonetwonotehere'.length });
  assert.ok(p.outlineText().startsWith('1. Hello world')); assert.ok(p.outlineText().includes('- one two'));
  assert.equal(p.footer.numbers, false);
});

test('v3: more transitions, several animations per shape, effect categories', () => {
  const p = Presentation.blank(); p.addSlide('blank');
  ['morph', 'cover', 'uncover', 'zoom', 'split'].forEach((t) => { p.setTransition(1, { type: t }); assert.equal(p.slides[1].transition.type, t); });
  const s = p.addShape(1, 'rect');
  const a = p.addAnim(1, s.id, 'fade'), b = p.addAnim(1, s.id, 'pulse'), c = p.addAnim(1, s.id, 'fadeout');
  assert.equal(p.getAnims(1, s.id).length, 3); assert.deepEqual(['entrance', 'emphasis', 'exit'], [E.animCategory(a.effect), E.animCategory(b.effect), E.animCategory(c.effect)]);
  assert.equal(p.addAnim(1, s.id, 'nope'), null); assert.equal(p.addAnim(1, 'missing', 'fade'), null);
  p.updateAnim(1, b.id, { effect: 'spin' }); assert.equal(p.slides[1].anims[1].amount, 360); p.updateAnim(1, b.id, { amount: 90, start: 'withprev' }); assert.equal(p.slides[1].anims[1].amount, 90);
  assert.equal(p.addAnim(1, s.id, 'wipe').dir, 'left'); assert.equal(p.addAnim(1, s.id, 'appear').dur, 0);
  p.setAnim(1, s.id, 'zoom'); assert.equal(p.slides[1].anims[0].effect, 'zoom'); assert.equal(p.slides[1].anims.length, 5, 'setAnim changes the first one');
  assert.ok(p.removeAnim(1, c.id)); assert.equal(p.removeAnim(1, c.id), false); p.setAnim(1, s.id, 'none'); assert.equal(p.slides[1].anims.length, 0);
  const q = Presentation.fromJSON({ slides: [{ shapes: [{ id: 'x1', type: 'rect' }], anims: [{ shapeId: 'x1', effect: 'bogus' }, { shapeId: 'x1', effect: 'spin', start: 'weird' }] }] });
  assert.equal(q.slides[0].anims.length, 1); assert.equal(q.slides[0].anims[0].start, 'onclick'); assert.equal(q.slides[0].anims[0].amount, 360);
});

test('v3: show state with exit and emphasis effects', () => {
  const p = Presentation.blank();
  const a = p.addShape(0, 'rect'), b = p.addShape(0, 'oval'), c = p.addShape(0, 'textbox');
  p.addAnim(0, a.id, 'fade'); p.addAnim(0, a.id, 'fadeout'); p.addAnim(0, b.id, 'pulse'); p.addAnim(0, c.id, 'disappear');
  const st = new ShowState(p, 0);
  assert.deepEqual(st.hiddenIds(), [a.id], 'entrance hidden; emphasis and exit-only visible');
  st.next(); assert.deepEqual(st.hiddenIds(), []); st.next(); assert.deepEqual(st.hiddenIds(), [a.id], 'exit hides again');
  st.next(); st.next(); assert.deepEqual(st.hiddenIds().sort(), [a.id, c.id].sort()); assert.equal(st.next().kind, 'end');
  st.prev(); assert.deepEqual(st.hiddenIds(), [a.id]); st.prev(); st.prev(); st.prev(); assert.deepEqual(st.hiddenIds(), [a.id]);
});

test('v3: automatic group counts as applied once the player finished it', () => {
  const p = Presentation.blank(); const a = p.addShape(0, 'rect'); p.addAnim(0, a.id, 'fade', { start: 'afterprev' });
  const st = new ShowState(p, 0); assert.deepEqual(st.hiddenIds(), [a.id]); st.autoDone(); assert.deepEqual(st.hiddenIds(), []);
});

test('v3: custom shows and ShowState with an order', () => {
  const p = Presentation.blank(); ['b', 'c', 'd'].forEach(() => p.addSlide('blank'));
  const ids = p.slides.map((s) => s.id);
  assert.equal(p.addCustomShow('', ids), null); assert.equal(p.addCustomShow('x', ['nope']), null);
  const cs = p.addCustomShow(' Short ', [ids[3], ids[1]]); assert.equal(cs.name, 'Short'); assert.deepEqual(p.customOrder(cs.id), [3, 1]);
  const st = new ShowState(p, 0, p.customOrder(cs.id)); assert.equal(st.i, 3); assert.equal(st.next().kind, 'slide'); assert.equal(st.i, 1); assert.equal(st.isLast(), true); assert.equal(st.next().kind, 'end');
  assert.equal(st.prev().kind, 'slide'); assert.equal(st.i, 3); st.restart(); assert.equal(st.i, 3); assert.ok(st.goTo(1)); assert.equal(st.i, 1); assert.equal(st.goTo(2), false);
  p.deleteSlide(1); assert.deepEqual(p.customOrder(cs.id), [2], 'deleted slides drop out (indices shift)');
  assert.ok(p.updateCustomShow(cs.id, 'New name', [ids[0]])); assert.equal(p.customShows[0].name, 'New name'); assert.equal(p.updateCustomShow(cs.id, '', [ids[0]]), null);
  const q = Presentation.fromJSON(p.toJSON()); assert.equal(q.customShows.length, 1); assert.ok(p.removeCustomShow(cs.id)); assert.equal(p.removeCustomShow(cs.id), false);
});

test('v3: slide timings and show options', () => {
  const p = Presentation.blank();
  assert.deepEqual(p.slides[0].advance, { click: true, after: null }); assert.deepEqual(p.show, { useTimings: true, loop: false });
  p.setAdvance(0, { after: 5 }); p.setAdvance(0, { click: false }); assert.deepEqual(p.slides[0].advance, { click: false, after: 5 });
  p.setAdvance(0, { after: 0 }); assert.equal(p.slides[0].advance.after, null); p.setAdvance(0, { after: -3 }); assert.equal(p.slides[0].advance.after, null);
  p.setShowOptions({ loop: true, useTimings: false }); assert.deepEqual(p.show, { useTimings: false, loop: true });
  const q = Presentation.fromJSON(p.toJSON()); assert.deepEqual(q.show, p.show); assert.deepEqual(q.slides[0].advance, p.slides[0].advance);
  const d = p.duplicateSlide(0); assert.deepEqual(p.slides[d].advance, p.slides[0].advance);
});

// ---------------------------------------------------------------- version 4
const DICT = require('../assets/dict-en.js');
const speller = E.makeSpeller(DICT.aff, DICT.dic);

test('v4: new shape types, line height, hidden slides', () => {
  const p = Presentation.blank(); p.addSlide('blank');
  ['rrect', 'triangle', 'diamond', 'hexagon', 'star', 'rarrow'].forEach((t) => { const s = p.addShape(1, t); assert.equal(s.type, t); assert.ok(E.canHoldText(s)); assert.equal(s.ts.align, 'center'); assert.ok(E.SHAPE_NAMES[t]); });
  assert.ok(E.POLY.star.split(' ').length === 10);
  assert.equal(p.addShape(1, 'textbox').ts.lineHeight, 1.2); p.updateShape(1, p.slides[1].shapes[0].id, { ts: { lineHeight: 9 } }); assert.equal(E.normShape(p.slides[1].shapes[0]).ts.lineHeight, 3);
  p.addSlide('blank'); p.setHidden(1, true);
  assert.deepEqual(new ShowState(p, 0).order, [0, 2], 'hidden slide skipped');
  assert.deepEqual(new ShowState(p, 1).order, [0, 1, 2], 'but a hidden slide can be the start'); assert.equal(new ShowState(p, 1).i, 1);
  p.setHidden(0, true); p.setHidden(2, true); assert.equal(new ShowState(p, 0).order.length >= 1, true);
  assert.equal(Presentation.fromJSON(p.toJSON()).slides[1].hidden, true);
});

test('v4: comments have replies, resolved state and per-person unread', () => {
  const p = Presentation.blank(); const c = p.addComment(0, 'Check this', 'Asha');
  assert.deepEqual(c.seenBy, ['Asha']); assert.equal(p.unreadCount('Ravi'), 1); assert.equal(p.unreadCount('Asha'), 0);
  assert.ok(p.markRead(0, c.id, 'Ravi')); assert.equal(p.unreadCount('Ravi'), 0);
  assert.equal(p.replyComment(0, c.id, '  ', 'Ravi'), null); const r = p.replyComment(0, c.id, 'Done', 'Ravi'); assert.equal(r.text, 'Done');
  assert.equal(p.unreadCount('Asha'), 1, 'a reply makes the thread unread for the others'); assert.equal(p.unreadCount('Ravi'), 0);
  assert.ok(p.setResolved(0, c.id, true)); assert.equal(p.slides[0].comments[0].resolved, true);
  p.addComment(0, 'Second', 'Meena'); assert.equal(p.markAllRead('Asha'), 2); assert.equal(p.unreadCount('Asha'), 0);
  const q = Presentation.fromJSON(p.toJSON()); assert.equal(q.slides[0].comments[0].replies.length, 1); assert.equal(q.slides[0].comments[0].resolved, true);
  const old = Presentation.fromJSON({ slides: [{ comments: [{ text: 'legacy', author: 'Zed' }] }] }); assert.deepEqual(old.slides[0].comments[0].seenBy, ['Zed']);
});

test('v4: accessibility levels (duplicate titles, small text, low contrast, table header)', () => {
  const p = Presentation.blank(); p.slides[0].shapes[0].text = 'Same'; p.addSlide('titleContent'); p.slides[1].shapes[0].text = 'Same';
  let i = p.checkAccessibility(); assert.deepEqual(i.map((x) => x.level + ':' + x.msg.slice(0, 25)), ['warning:Slide 2 has the same titl']);
  const t = p.addShape(1, 'textbox', { text: 'tiny', ts: { size: 9, color: '#ffffff' } }); i = p.checkAccessibility();
  assert.ok(i.some((x) => x.msg.includes('very small'))); assert.ok(i.some((x) => x.msg.includes('low contrast') && x.shapeId === t.id));
  const tb = p.addShape(1, 'table', { rows: 2, cols: 2 }); p.updateShape(1, tb.id, { header: false }); assert.ok(p.checkAccessibility().some((x) => x.msg.includes('no header row')));
  assert.ok(E.contrastRatio('#000000', '#ffffff') > 20); assert.ok(p.checkAccessibility().every((x) => x.level === 'error' || x.level === 'warning'));
});

test('v4: reader text follows reading order and covers tables, pictures, charts and notes', () => {
  const p = Presentation.blank(); const s = p.slides[0];
  s.shapes[0].text = 'My title'; s.shapes[1].text = 'Sub';
  p.addShape(0, 'textbox', { text: 'one\ntwo', x: 100, y: 600, ts: { list: 'bullet' } }); p.addShape(0, 'table', { rows: 2, cols: 2, x: 100, y: 400 });
  p.setCell(0, s.shapes[3].id, 0, 0, 'A'); p.setCell(0, s.shapes[3].id, 0, 1, 'B'); p.addShape(0, 'picture', { alt: 'a cat', y: 300 }); p.addShape(0, 'chart', { y: 500, chart: { kind: 'bar', title: 'Sales', labels: ['x', 'y'], values: [1, 2] } }); p.setNotes(0, 'say hi');
  const r = E.readerText(s, true); assert.equal(r[0].kind, 'title'); assert.deepEqual(r.map((x) => x.kind), ['title', 'alt', 'text', 'table', 'alt', 'bullet', 'bullet', 'notes'], 'sorted top to bottom');
  assert.ok(r[3].text.startsWith('Header: A, B')); assert.equal(r[1].text, 'Picture: a cat'); assert.equal(E.readerText(s, false).some((x) => x.kind === 'notes'), false);
});

test('v4: comparing two versions lists the changes', () => {
  const a = Presentation.blank(); a.addSlide('titleContent'); a.slides[0].shapes[0].text = 'Hello'; const b = Presentation.fromJSON(a.toJSON());
  assert.deepEqual(E.diffPresentations(a, b), []);
  b.slides[0].shapes[0].text = 'Hello world'; b.setNotes(1, 'n'); b.setTransition(1, { type: 'fade' }); b.addSlide('blank'); b.deleteSlide(0); b.name = 'New'; b.setHidden(0, true);
  const d = E.diffPresentations(a, b).map((x) => x.text); assert.ok(d.some((x) => x.includes('renamed'))); assert.ok(d.some((x) => x.includes('was removed') && x.includes('Hello'))); assert.ok(d.some((x) => x.includes('was added')));
  assert.ok(d.some((x) => x.includes('speaker notes'))); assert.ok(d.some((x) => x.includes('transition changed to Fade'))); assert.ok(d.some((x) => x.includes('hidden')));
  const c = Presentation.fromJSON(a.toJSON()); c.slides[0].shapes[0].text = 'Changed'; c.slides[0].shapes[0].x += 10; c.moveSlide(0, 1);
  const d2 = E.diffPresentations(a, c).map((x) => x.text); assert.ok(d2.some((x) => x.includes('text changed') && x.includes('Hello') && x.includes('Changed'))); assert.ok(d2.some((x) => x.includes('moved')));
});

test('v4: review finds content problems', () => {
  const p = Presentation.blank(); p.addSlide('blank'); p.slides[0].shapes[0].text = 'Title';
  const words = Array(120).fill('word').join(' '); p.addShape(0, 'textbox', { text: words });
  let i = E.reviewIssues(p, 3).map((x) => x.msg); assert.ok(i.some((m) => m.includes('120') || m.includes('words'))); assert.ok(i.some((m) => m.includes('3 possible spelling'))); assert.ok(i.some((m) => m.includes('Slide 2 is empty'))); assert.ok(i.some((m) => m.includes('speaker notes')));
  ['Arial', 'Georgia', 'Verdana', 'Impact'].forEach((f) => p.addShape(0, 'textbox', { text: 'x', ts: { font: f } })); i = E.reviewIssues(p, 0).map((x) => x.msg); assert.ok(i.some((m) => m.includes('4 different fonts')));
  assert.equal(E.reviewIssues(p, 0).every((x) => ['error', 'warning', 'tip'].includes(x.level) && x.area), true);
});

test('v4: spell checker knows words with affixes, rejects typos, suggests fixes', () => {
  ['hello', 'Hello', 'running', 'cats', 'unhappy', 'rewrite', 'presentation', 'it\'s', 'self-esteem', 'went'].forEach((w) => assert.ok(speller.check(w), w));
  ['teh', 'recieve', 'speling', 'helo', 'qwxzy'].forEach((w) => assert.equal(speller.check(w), false, w));
  assert.ok(speller.suggest('teh').includes('the')); assert.ok(speller.suggest('recieve').includes('receive')); assert.ok(speller.suggest('Helo').includes('Hello')); assert.ok(speller.suggest('alot').includes('a lot'));
  assert.deepEqual(E.misspellings('A tset of speling, NASA iPhone www.qqzz.com 12abc', speller, null).map((m) => m.word), ['tset', 'speling']);
  assert.deepEqual(E.misspellings('speling', speller, new Set(['speling'])), []);
});

test('v4: spelling issues over the deck, replace one and replace all', () => {
  const p = Presentation.blank(); p.slides[0].shapes[0].text = 'Teh start'; p.slides[0].shapes[1].text = 'teh end teh'; p.setNotes(0, 'note: recieve');
  const t = p.addShape(0, 'table', { rows: 1, cols: 1 }); p.setCell(0, t.id, 0, 0, 'wrng');
  let i = E.spellIssues(p, speller, null); assert.deepEqual(i.map((x) => x.field + ':' + x.word), ['text:Teh', 'text:teh', 'text:teh', 'cell:wrng', 'notes:recieve']);
  assert.ok(E.spellReplace(p, i[0], 'The')); assert.equal(p.slides[0].shapes[0].text, 'The start');
  assert.equal(E.spellReplaceAll(p, speller, 'teh', 'the'), 2); assert.equal(p.slides[0].shapes[1].text, 'the end the');
  assert.ok(E.spellReplace(p, E.spellIssues(p, speller, null).find((x) => x.field === 'cell'), 'wrong')); assert.equal(p.getShape(0, t.id).cells[0][0], 'wrong');
  assert.ok(E.spellReplace(p, E.spellIssues(p, speller, null).find((x) => x.field === 'notes'), 'receive')); assert.equal(p.slides[0].notes, 'note: receive');
  assert.deepEqual(E.spellIssues(p, speller, null), []); assert.equal(E.spellReplace(p, { slide: 0, shapeId: 'nope', field: 'text', index: 0, word: 'x' }, 'y'), false);
});
