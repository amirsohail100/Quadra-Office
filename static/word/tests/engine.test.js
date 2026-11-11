'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../engine.js');

const pos = (b, o, r, c) => (r === undefined ? { a: { b }, o } : { a: { b, r, c }, o });
const sel = (a, b) => ({ anchor: a, focus: b });
const text = (doc) => doc.blocks.map((blk) => (blk.type === 'p' ? E.paraText(blk) : blk.type)).join('|');
const withText = (t) => { const d = E.createDoc(); E.insertText(d.blocks[0], 0, t); return d; };

test('typing inserts text into an empty paragraph', () => {
  const d = E.createDoc();
  const o = E.insertText(d.blocks[0], 0, 'Hello', null);
  assert.equal(o, 5);
  assert.equal(E.paraText(d.blocks[0]), 'Hello');
});

test('typing inherits format from the run on the left', () => {
  const d = withText('ab');
  E.formatText(d.blocks[0], 0, 2, { b: true });
  E.insertText(d.blocks[0], 2, 'c', null);
  assert.equal(d.blocks[0].runs.length, 1);
  assert.equal(d.blocks[0].runs[0].f.b, true);
});

test('pending patch overrides inherited format for typed text', () => {
  const d = withText('ab');
  E.insertText(d.blocks[0], 2, 'X', { i: true });
  const runs = d.blocks[0].runs;
  assert.equal(runs[runs.length - 1].t, 'X');
  assert.equal(runs[runs.length - 1].f.i, true);
  assert.equal(runs[0].f.i, undefined);
});

test('partial formatting splits runs and keeps text intact', () => {
  const d = withText('hello world');
  E.formatText(d.blocks[0], 6, 11, { b: true });
  assert.equal(E.paraText(d.blocks[0]), 'hello world');
  assert.equal(d.blocks[0].runs.length, 2);
  assert.equal(d.blocks[0].runs[1].t, 'world');
});

test('format removal with falsy patch deletes the key', () => {
  const d = withText('abc');
  E.formatText(d.blocks[0], 0, 3, { b: true, color: '#ff0000' });
  E.formatText(d.blocks[0], 0, 3, { b: false, color: null });
  assert.deepEqual(d.blocks[0].runs[0].f, {});
});

test('sup and sub are mutually exclusive', () => {
  const f = E.applyPatch({ sub: true }, { sup: true });
  assert.equal(f.sup, true);
  assert.equal(f.sub, undefined);
});

test('backspace removes one char and at paragraph start merges with previous', () => {
  const d = E.createDoc();
  E.insertText(d.blocks[0], 0, 'abc', null);
  const p2 = E.newPara('def');
  d.blocks.push(p2);
  const r = E.deleteBackward(d, { b: 1 }, 0);
  assert.equal(d.blocks.length, 1);
  assert.equal(E.paraText(d.blocks[0]), 'abcdef');
  assert.deepEqual(r, { a: { b: 0 }, o: 3 });
});

test('backspace inside text deletes the previous character', () => {
  const d = withText('abc');
  const r = E.deleteBackward(d, { b: 0 }, 2);
  assert.equal(E.paraText(d.blocks[0]), 'ac');
  assert.equal(r.o, 1);
});

test('backspace on a list item first removes the bullet', () => {
  const d = withText('item');
  d.blocks[0].list = { kind: 'bullet', level: 0 };
  E.deleteBackward(d, { b: 0 }, 0);
  assert.equal(d.blocks[0].list, null);
  assert.equal(E.paraText(d.blocks[0]), 'item');
});

test('delete key at end of paragraph merges the next paragraph', () => {
  const d = withText('ab');
  d.blocks.push(E.newPara('cd'));
  E.deleteForward(d, { b: 0 }, 2);
  assert.equal(E.paraText(d.blocks[0]), 'abcd');
  assert.equal(d.blocks.length, 1);
});

test('enter splits paragraph, keeping runs on each side', () => {
  const d = withText('hello');
  E.formatText(d.blocks[0], 2, 5, { i: true });
  const r = E.splitParagraph(d, { b: 0 }, 2);
  assert.deepEqual(r, { a: { b: 1 }, o: 0 });
  assert.equal(E.paraText(d.blocks[0]), 'he');
  assert.equal(E.paraText(d.blocks[1]), 'llo');
  assert.equal(d.blocks[1].runs[0].f.i, true);
});

test('enter on a heading makes the next paragraph Normal', () => {
  const d = withText('Title here');
  d.blocks[0].style = 'Heading 1';
  E.splitParagraph(d, { b: 0 }, 10);
  assert.equal(d.blocks[1].style, 'Normal');
});

test('enter on an empty list item exits the list', () => {
  const d = E.createDoc();
  d.blocks[0].list = { kind: 'number', level: 0 };
  E.splitParagraph(d, { b: 0 }, 0);
  assert.equal(d.blocks.length, 1);
  assert.equal(d.blocks[0].list, null);
});

test('range delete across paragraphs joins head and tail', () => {
  const d = withText('one two');
  d.blocks.push(E.newPara('three four'));
  d.blocks.push(E.newPara('five'));
  const r = E.deleteRange(d, sel(pos(0, 4), pos(1, 6)));
  assert.equal(d.blocks.length, 2);
  assert.equal(E.paraText(d.blocks[0]), 'one four');
  assert.equal(E.paraText(d.blocks[1]), 'five');
  assert.deepEqual(r, { a: { b: 0 }, o: 4 });
});

test('toggleList applies and removes a list kind', () => {
  const d = withText('a');
  E.toggleList(d, [{ b: 0 }], 'bullet');
  assert.equal(d.blocks[0].list.kind, 'bullet');
  E.toggleList(d, [{ b: 0 }], 'bullet');
  assert.equal(d.blocks[0].list, null);
});

test('changeIndent moves list level within 0..8 and paragraph indent otherwise', () => {
  const d = withText('a');
  E.toggleList(d, [{ b: 0 }], 'bullet');
  E.changeIndent(d, [{ b: 0 }], 1);
  E.changeIndent(d, [{ b: 0 }], 1);
  E.changeIndent(d, [{ b: 0 }], 99);
  assert.equal(d.blocks[0].list.level, 8);
  E.toggleList(d, [{ b: 0 }], 'bullet');
  E.changeIndent(d, [{ b: 0 }], 1);
  assert.equal(d.blocks[0].indent, 36);
  E.changeIndent(d, [{ b: 0 }], -5);
  assert.equal(d.blocks[0].indent, 0);
});

test('findAll returns every occurrence, case-insensitive by default', () => {
  const d = withText('Cat cat CAT');
  const ms = E.findAll(d, 'cat', {});
  assert.equal(ms.length, 3);
  assert.deepEqual(ms.map((m) => m.o), [0, 4, 8]);
  assert.equal(E.findAll(d, 'cat', { matchCase: true }).length, 1);
});

test('replaceAll replaces every match and keeps other text', () => {
  const d = withText('a-b-a-b');
  const n = E.replaceAll(d, 'a', 'XYZ', {});
  assert.equal(n, 2);
  assert.equal(E.paraText(d.blocks[0]), 'XYZ-b-XYZ-b');
});

test('replaceAll keeps formatting of the replaced text', () => {
  const d = withText('foo bar');
  E.formatText(d.blocks[0], 0, 3, { b: true });
  E.replaceAll(d, 'foo', 'baz', {});
  assert.equal(d.blocks[0].runs[0].t, 'baz');
  assert.equal(d.blocks[0].runs[0].f.b, true);
});

test('word count ignores extra whitespace and counts paragraphs', () => {
  const d = withText('  one   two three ');
  d.blocks.push(E.newPara(''));
  d.blocks.push(E.newPara('four'));
  const wc = E.wordCount(d);
  assert.equal(wc.words, 4);
  assert.equal(wc.paragraphs, 2);
});

test('insertBlocks adds an image plus an empty paragraph after the caret', () => {
  const d = withText('hello');
  const r = E.insertBlocks(d, { b: 0 }, 5, [{ type: 'img', src: 'data:image/png;base64,AA', w: 10, h: 10, align: 'left' }]);
  assert.equal(d.blocks.length, 3);
  assert.equal(d.blocks[1].type, 'img');
  assert.equal(d.blocks[2].type, 'p');
  assert.deepEqual(r, { a: { b: 2 }, o: 0 });
});

test('insertBlocks in the middle of a paragraph splits it first', () => {
  const d = withText('helloworld');
  E.insertBlocks(d, { b: 0 }, 5, [{ type: 'pb' }]);
  assert.equal(E.paraText(d.blocks[0]), 'hello');
  assert.equal(d.blocks[1].type, 'pb');
  assert.equal(E.paraText(d.blocks[3]), 'world');
});

test('table cells are addressable and merge into one spanning cell', () => {
  const d = E.createDoc();
  E.insertBlocks(d, { b: 0 }, 0, [E.createTable(2, 3)]);
  const b = d.blocks.findIndex((x) => x.type === 'table');
  assert.ok(b >= 0);
  E.insertText(E.getPara(d, { b, r: 0, c: 0 }), 0, 'A', null);
  E.insertText(E.getPara(d, { b, r: 0, c: 1 }), 0, 'B', null);
  assert.equal(E.mergeCells(d, b, 0, 0, 0, 1), true);
  const merged = d.blocks[b].rows[0][0];
  assert.equal(merged.colspan, 2);
  assert.equal(d.blocks[b].rows[0][1].covered, true);
  assert.equal(E.paraText(merged.paras[0]), 'A B');
  assert.equal(E.getPara(d, { b, r: 0, c: 1 }), null);
});

test('merging an already merged cell is refused', () => {
  const d = E.createDoc();
  E.insertBlocks(d, { b: 0 }, 0, [E.createTable(1, 3)]);
  const b = d.blocks.findIndex((x) => x.type === 'table');
  assert.equal(E.mergeCells(d, b, 0, 0, 0, 1), true);
  assert.equal(E.mergeCells(d, b, 0, 0, 0, 2), false);
});

test('adjacentCell walks row-major and skips covered cells', () => {
  const d = E.createDoc();
  E.insertBlocks(d, { b: 0 }, 0, [E.createTable(2, 2)]);
  const b = d.blocks.findIndex((x) => x.type === 'table');
  E.mergeCells(d, b, 0, 0, 0, 1);
  const next = E.adjacentCell(d, { b, r: 0, c: 0 }, 1);
  assert.deepEqual(next, { b, r: 1, c: 0 });
  assert.equal(E.adjacentCell(d, { b, r: 1, c: 1 }, 1), null);
});

test('pasteFragments with several fragments creates paragraphs and keeps formats', () => {
  const d = withText('ab');
  const frags = [[{ t: 'X', f: { b: true } }], [{ t: 'mid', f: {} }], [{ t: 'Y', f: { i: true } }]];
  const r = E.pasteFragments(d, { b: 0 }, 1, frags);
  assert.equal(d.blocks.length, 3);
  assert.equal(E.paraText(d.blocks[0]), 'aX');
  assert.equal(E.paraText(d.blocks[1]), 'mid');
  assert.equal(E.paraText(d.blocks[2]), 'Yb');
  assert.deepEqual(r, { a: { b: 2 }, o: 1 });
  assert.equal(d.blocks[0].runs[1].f.b, true);
});

test('copy of a selection returns the selected text', () => {
  const d = withText('hello world');
  assert.equal(E.selectedText(d, sel(pos(0, 6), pos(0, 11))), 'world');
});

test('setSection merges margins without losing other fields', () => {
  const d = E.createDoc();
  E.setSection(d, { size: 'Letter', margins: { left: 36 } });
  assert.equal(d.section.size, 'Letter');
  assert.equal(d.section.margins.left, 36);
  assert.equal(d.section.margins.top, 72);
});

test('pageSize swaps width and height in landscape', () => {
  assert.deepEqual(E.pageSize({ size: 'A4', orientation: 'portrait' }), { w: 595, h: 842 });
  assert.deepEqual(E.pageSize({ size: 'A4', orientation: 'landscape' }), { w: 842, h: 595 });
});

test('outline lists headings and toc paragraphs mirror it', () => {
  const d = withText('Intro');
  d.blocks[0].style = 'Heading 1';
  d.blocks.push(E.newPara('Body'));
  d.blocks.push(E.newPara('Sub'));
  d.blocks[2].style = 'Heading 2';
  const o = E.outline(d);
  assert.deepEqual(o.map((x) => [x.level, x.text]), [[1, 'Intro'], [2, 'Sub']]);
  assert.equal(E.tocParas(d).length, 2);
});

test('toHTML escapes text and emits strong and list markup', () => {
  const d = withText('a <b> & c');
  E.formatText(d.blocks[0], 0, 1, { b: true });
  d.blocks.push(E.newPara('item'));
  d.blocks[1].list = { kind: 'bullet', level: 0 };
  const html = E.toHTML(d);
  assert.ok(html.includes('<strong>a</strong>'));
  assert.ok(html.includes('&lt;b&gt; &amp; c'));
  assert.ok(/<ul>\s*<li/.test(html));
});

test('serialize and deserialize round-trip the document', () => {
  const d = withText('round trip');
  E.formatText(d.blocks[0], 0, 5, { u: true });
  const back = E.deserialize(E.serialize(d));
  assert.deepEqual(back.blocks, d.blocks);
  assert.equal(back.section.size, 'A4');
});

test('deserialize rejects garbage input', () => {
  assert.throws(() => E.deserialize('{"nope":1}'), /Invalid Quadra document/);
  assert.throws(() => E.deserialize({ blocks: [{ type: 'video' }], section: {} }), /Unknown block type/);
});
