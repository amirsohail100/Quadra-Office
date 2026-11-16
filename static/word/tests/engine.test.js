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

// ---------- round 4: Home and Insert features ----------

test('editor reports double spaces, space before punctuation, missing space and lowercase sentence starts', () => {
  const d = withText('hello  world .this is wrong.Next one');
  const kinds = E.editorCheck(d).map((i) => i.kind);
  assert.ok(kinds.includes('double-space'));
  assert.ok(kinds.includes('space-before-punct'));
  assert.ok(kinds.includes('missing-space'));
  assert.ok(kinds.includes('sentence-start'));
});

test('editorFixAll repairs fixable issues and keeps the sentence text right', () => {
  const d = withText('hello  world.this is wrong');
  const n = E.editorFixAll(d);
  assert.equal(E.paraText(d.blocks[0]), 'Hello world. This is wrong');
  assert.ok(n >= 3);
});

test('editorFixAll leaves repeated words alone and reports them as a suggestion only', () => {
  const d = withText('That that is it');
  const issues = E.editorCheck(d);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].kind, 'repeated-word');
  assert.equal(issues[0].fixable, false);
  E.editorFixAll(d);
  assert.equal(E.paraText(d.blocks[0]), 'That that is it');
});

test('editorFixAll keeps the formatting of the text it repairs', () => {
  const d = withText('bold  text');
  E.formatText(d.blocks[0], 0, 4, { b: true });
  E.editorFixAll(d);
  assert.equal(E.paraText(d.blocks[0]), 'Bold text');
  assert.equal(d.blocks[0].runs[0].f.b, true);
});

test('equationRuns turns ^ into superscript, _ into subscript and names into symbols', () => {
  const runs = E.equationRuns('x^2 + pi');
  assert.deepEqual(runs, [{ t: 'x', f: {} }, { t: '2', f: { sup: true } }, { t: ' + π', f: {} }]);
  const water = E.equationRuns('H_2O');
  assert.deepEqual(water, [{ t: 'H', f: {} }, { t: '2', f: { sub: true } }, { t: 'O', f: {} }]);
});

test('equationRuns accepts braces for longer superscripts', () => {
  assert.deepEqual(E.equationRuns('x^{10}'), [{ t: 'x', f: {} }, { t: '10', f: { sup: true } }]);
});

test('shapeDataUrl builds an svg for every shape and rejects unknown kinds', () => {
  for (const kind of ['rectangle', 'ellipse', 'line', 'arrow', 'triangle', 'star']) {
    const url = E.shapeDataUrl(kind);
    assert.ok(url.startsWith('data:image/svg+xml;charset=utf-8,'), kind);
    assert.ok(decodeURIComponent(url.split(',')[1]).startsWith('<svg'), kind);
  }
  assert.ok(decodeURIComponent(E.shapeDataUrl('ellipse').split(',')[1]).includes('<ellipse'));
  assert.throws(() => E.shapeDataUrl('blob'), /Unknown shape/);
});

test('bookmark names are unique, validated and listed with their paragraph', () => {
  const d = withText('intro text');
  d.blocks.push(E.newPara('second'));
  assert.equal(E.setBookmark(d, { b: 0 }, 'intro'), true);
  assert.equal(E.setBookmark(d, { b: 1 }, 'intro'), true);
  assert.equal(d.blocks[0].bm, undefined);
  assert.equal(d.blocks[1].bm, 'intro');
  assert.equal(E.setBookmark(d, { b: 0 }, '1abc'), false);
  assert.equal(E.setBookmark(d, { b: 0 }, 'has space'), false);
  assert.deepEqual(E.listBookmarks(d).map((x) => [x.name, x.a.b]), [['intro', 1]]);
  E.removeBookmark(d, 'intro');
  assert.equal(E.listBookmarks(d).length, 0);
});

test('splitParagraph does not copy a bookmark or comment into the new paragraph', () => {
  const d = withText('abcdef');
  E.setBookmark(d, { b: 0 }, 'mark');
  const id = E.addComment(d, { b: 0 }, 'note');
  E.splitParagraph(d, { b: 0 }, 3);
  assert.equal(d.blocks[1].bm, undefined);
  assert.equal(d.blocks[1].cm, undefined);
  assert.deepEqual(d.blocks[0].cm, [id]);
});

test('comments attach to a paragraph and disappear with removeComment', () => {
  const d = withText('review this sentence');
  const id = E.addComment(d, { b: 0 }, '  check the wording  ');
  assert.ok(id);
  assert.equal(E.addComment(d, { b: 0 }, '   '), null);
  const list = E.listComments(d);
  assert.equal(list.length, 1);
  assert.equal(list[0].text, 'check the wording');
  assert.equal(list[0].anchored, true);
  E.removeComment(d, id);
  assert.equal(E.listComments(d).length, 0);
  assert.equal(d.blocks[0].cm, undefined);
});

test('a comment whose paragraph was merged away is still listed as not anchored', () => {
  const d = withText('a');
  d.blocks.push(E.newPara('b'));
  E.addComment(d, { b: 1 }, 'second paragraph note');
  E.deleteBackward(d, { b: 1 }, 0);
  const list = E.listComments(d);
  assert.equal(list.length, 1);
  assert.equal(list[0].anchored, false);
});

test('documents saved before round 4 load with empty comments', () => {
  const old = { blocks: [{ type: 'p', runs: [{ t: 'x', f: {} }] }], section: {} };
  const d = E.deserialize(old);
  assert.deepEqual(d.comments, []);
});

// ---------- round 5: Design, Layout and References ----------

test('footnote numbers follow document order, even when a note is inserted earlier', () => {
  const d = withText('first part');
  d.blocks.push(E.newPara('second part'));
  const late = E.insertNote(d, { b: 1 }, 6, 'footnote', 'late note');
  const early = E.insertNote(d, { b: 0 }, 5, 'footnote', 'early note');
  assert.ok(late && early);
  const labels = E.noteLabels(d);
  assert.equal(labels[early.id], '1');
  assert.equal(labels[late.id], '2');
});

test('endnotes use their own roman-numeral series', () => {
  const d = withText('alpha beta');
  const f = E.insertNote(d, { b: 0 }, 5, 'footnote', 'a footnote');
  const e1 = E.insertNote(d, { b: 0 }, 10, 'endnote', 'an endnote');
  const e2 = E.insertNote(d, { b: 0 }, 11, 'endnote', 'another endnote');
  const labels = E.noteLabels(d);
  assert.equal(labels[f.id], '1');
  assert.equal(labels[e1.id], 'i');
  assert.equal(labels[e2.id], 'ii');
});

test('note text can be changed and a note whose reference was deleted is not listed', () => {
  const d = withText('see here');
  const n = E.insertNote(d, { b: 0 }, 8, 'footnote', 'old text');
  E.setNoteText(d, n.id, 'new text');
  assert.equal(E.listNotes(d)[0].text, 'new text');
  E.deleteBackward(d, { b: 0 }, n.o);   // removes the reference mark
  assert.equal(E.listNotes(d).length, 0);
});

test('typing right after a note reference is not part of the reference', () => {
  const d = withText('word');
  const n = E.insertNote(d, { b: 0 }, 4, 'footnote', 'note');
  E.insertText(d.blocks[0], n.o, 'x', null);
  const last = d.blocks[0].runs[d.blocks[0].runs.length - 1];
  assert.equal(last.t, 'x');
  assert.equal(last.f.fn, undefined);
});

test('insertNote refuses empty note text', () => {
  const d = withText('abc');
  assert.equal(E.insertNote(d, { b: 0 }, 1, 'footnote', '   '), null);
  assert.equal(d.footnotes.length, 0);
});

test('updateToc rebuilds the table of contents from the current headings', () => {
  const d = withText('Chapter one');
  d.blocks[0].style = 'Heading 1';
  E.insertBlocks(d, { b: 0 }, 11, E.tocParas(d));
  d.blocks.push(E.newPara('Body'));
  d.blocks.push(E.newPara('Chapter two'));
  d.blocks[d.blocks.length - 1].style = 'Heading 1';
  assert.equal(E.updateToc(d), true);
  const tocTexts = d.blocks.filter((b) => b.toc).map((b) => E.paraText(b));
  assert.deepEqual(tocTexts, ['Chapter one', 'Chapter two']);
});

test('updateToc reports false when the document has no table of contents', () => {
  const d = withText('no toc here');
  assert.equal(E.updateToc(d), false);
});

test('toc paragraphs are marked, and splitting one does not copy the mark', () => {
  const d = withText('Intro');
  d.blocks[0].style = 'Heading 1';
  const toc = E.tocParas(d);
  assert.equal(toc[0].toc, true);
  d.blocks.push(toc[0]);
  E.splitParagraph(d, { b: 1 }, 2);
  assert.equal(d.blocks[2].toc, undefined);
});

test('a column break is a block that can be inserted and saved', () => {
  const d = withText('left');
  E.insertBlocks(d, { b: 0 }, 4, [{ type: 'cb' }]);
  assert.equal(d.blocks[1].type, 'cb');
  const back = E.deserialize(E.serialize(d));
  assert.equal(back.blocks[1].type, 'cb');
});

test('page border and line numbers are stored in the section', () => {
  const d = E.createDoc();
  E.setSection(d, { pageBorder: { style: 'double', width: 3, color: '#333333' }, lineNumbers: true });
  const back = E.deserialize(E.serialize(d));
  assert.deepEqual(back.section.pageBorder, { style: 'double', width: 3, color: '#333333' });
  assert.equal(back.section.lineNumbers, true);
});

test('addSource needs an author or a title and citationText uses author and year', () => {
  const d = E.createDoc();
  assert.equal(E.addSource(d, { author: '', title: '', year: '2020' }), null);
  const id = E.addSource(d, { author: 'Rao', title: 'Notes', year: '2020', publisher: 'Quadra Press' });
  assert.ok(id);
  assert.equal(E.citationText(E.listSources(d)[0]), '(Rao, 2020)');
  E.removeSource(d, id);
  assert.equal(E.listSources(d).length, 0);
});

test('bibliography is sorted by author and formatted with publisher and year', () => {
  const d = E.createDoc();
  E.addSource(d, { author: 'Zed', title: 'Last book', year: '2001', publisher: 'Pub A' });
  E.addSource(d, { author: 'Abe', title: 'First book', year: '1999', publisher: '' });
  const lines = E.bibliographyParas(d).map((p) => E.paraText(p));
  assert.deepEqual(lines, ['Abe. First book. 1999.', 'Zed. Last book. Pub A, 2001.']);
});

test('HTML export shows note references as superscript labels', () => {
  const d = withText('text');
  E.insertNote(d, { b: 0 }, 4, 'footnote', 'note body');
  const html = E.toHTML(d);
  assert.ok(html.includes('<sup>1</sup>'));
  assert.ok(html.includes('note body'));
});

// ---------- round 6: Mailings, Review, View and Help ----------

test('tracked delete keeps the text but marks it deleted, and drops the reader own insertions', () => {
  const d = withText('keep drop');
  E.trackRangeDelete(d.blocks[0], 5, 9);
  assert.equal(E.paraText(d.blocks[0]), 'keep drop');
  const deleted = d.blocks[0].runs.find((r) => r.f.del);
  assert.equal(deleted.t, 'drop');
  // text inserted while tracking is removed for real when it is deleted again
  const e = withText('');
  E.insertText(e.blocks[0], 0, 'new', { ins: true });
  E.trackRangeDelete(e.blocks[0], 0, 3);
  assert.equal(E.paraText(e.blocks[0]), '');
});

test('accept all removes deleted text and clears insertion marks; reject all does the opposite', () => {
  const d = withText('one two three');
  E.trackRangeDelete(d.blocks[0], 4, 8);           // "two " deleted
  E.insertText(d.blocks[0], 0, 'NEW ', { ins: true });
  assert.deepEqual(E.countChanges(d), { inserted: 1, deleted: 1 });
  const accepted = E.deserialize(E.serialize(d));
  E.acceptAllChanges(accepted);
  assert.equal(E.paraText(accepted.blocks[0]), 'NEW one three');
  assert.equal(E.countChanges(accepted).inserted + E.countChanges(accepted).deleted, 0);
  E.rejectAllChanges(d);
  assert.equal(E.paraText(d.blocks[0]), 'one two three');
  assert.equal(E.countChanges(d).inserted + E.countChanges(d).deleted, 0);
});

test('typing right after a deleted word does not inherit the deletion', () => {
  const d = withText('abcd');
  E.trackRangeDelete(d.blocks[0], 2, 4);
  E.insertText(d.blocks[0], 2, 'X', {});
  assert.equal(E.paraText(d.blocks[0]), 'abXcd');
  const deleted = d.blocks[0].runs.filter((r) => r.f.del);
  assert.equal(deleted.length, 1);
  assert.equal(deleted[0].t, 'cd');
});

test('accessibility check reports missing headings, title, alt text and table header', () => {
  const d = withText('A short note without any headings.');
  E.insertBlocks(d, { b: 0 }, 33, [E.createTable(2, 2)]);
  E.insertBlocks(d, { b: 0 }, 33, [{ type: 'img', src: 'data:image/png;base64,AA', w: 10, h: 10, align: 'left' }]);
  d.title = 'Document 2';
  const kinds = E.accessibilityCheck(d).map((i) => i.kind);
  assert.ok(kinds.includes('no-headings'));
  assert.ok(kinds.includes('image-no-alt'));
  assert.ok(kinds.includes('table-no-header'));
  assert.ok(kinds.includes('default-title'));
});

test('a document with headings, alt text and a real title has no accessibility issues', () => {
  const d = withText('Title of the report');
  d.blocks[0].style = 'Heading 1';
  d.title = 'Quarterly report';
  E.insertBlocks(d, { b: 0 }, 19, [{ type: 'img', src: 'data:image/png;base64,AA', w: 10, h: 10, align: 'left', alt: 'a chart' }]);
  assert.deepEqual(E.accessibilityCheck(d), []);
});

test('setAlt stores alternative text for an image block', () => {
  const d = withText('x');
  E.insertBlocks(d, { b: 0 }, 1, [{ type: 'img', src: 'data:image/png;base64,AA', w: 10, h: 10, align: 'left' }]);
  assert.equal(E.setAlt(d, 1, 'logo'), true);
  assert.equal(d.blocks[1].alt, 'logo');
  assert.equal(E.setAlt(d, 0, 'nope'), false);
});

test('parseCsv reads a header row, quoted commas and Windows line endings', () => {
  const r = E.parseCsv('Name,City\r\n"Rao, A",Patna\r\nSita,"Delhi"\r\n');
  assert.deepEqual(r.fields, ['Name', 'City']);
  assert.deepEqual(r.records, [{ Name: 'Rao, A', City: 'Patna' }, { Name: 'Sita', City: 'Delhi' }]);
});

test('parseCsv rejects input with no records', () => {
  assert.throws(() => E.parseCsv('Name,City\n'), /no records/i);
  assert.throws(() => E.parseCsv(''), /no records/i);
});

test('mergeRecord replaces merge fields in text and tables and leaves the original alone', () => {
  const d = withText('Dear «Name», welcome to «City».');
  d.merge = { fields: ['Name', 'City'], records: [{ Name: 'Rao', City: 'Patna' }] };
  E.insertBlocks(d, { b: 0 }, d.blocks[0].runs.reduce((n, r) => n + r.t.length, 0), [E.createTable(1, 1)]);
  E.insertText(E.getPara(d, { b: 1, r: 0, c: 0 }), 0, '«City»', null);
  const merged = E.mergeRecord(d, d.merge.records[0]);
  assert.equal(E.paraText(merged.blocks[0]), 'Dear Rao, welcome to Patna.');
  assert.equal(E.paraText(E.getPara(merged, { b: 1, r: 0, c: 0 })), 'Patna');
  assert.equal(E.paraText(d.blocks[0]), 'Dear «Name», welcome to «City».');
});

test('mergeRecord leaves unknown placeholders and uses empty text for missing values', () => {
  const d = withText('«Name» «Unknown» «Phone»');
  d.merge = { fields: ['Name', 'Phone'], records: [{ Name: 'Rao' }] };
  const merged = E.mergeRecord(d, { Name: 'Rao' });
  assert.equal(E.paraText(merged.blocks[0]), 'Rao «Unknown» ');
});

test('mergeAllCombined puts a page break between records', () => {
  const d = withText('Letter for «Name»');
  d.merge = { fields: ['Name'], records: [{ Name: 'A' }, { Name: 'B' }] };
  const all = E.mergeAllCombined(d);
  assert.equal(all.blocks.filter((b) => b.type === 'pb').length, 1);
  const texts = all.blocks.filter((b) => b.type === 'p').map((b) => E.paraText(b));
  assert.deepEqual(texts, ['Letter for A', 'Letter for B']);
});

test('labelsTable fills a grid in reading order', () => {
  const t = E.labelsTable(2, 2, ['one', 'two', 'three']);
  assert.equal(t.rows.length, 2);
  assert.equal(E.paraText(t.rows[0][0].paras[0]), 'one');
  assert.equal(E.paraText(t.rows[0][1].paras[0]), 'two');
  assert.equal(E.paraText(t.rows[1][0].paras[0]), 'three');
  assert.equal(E.paraText(t.rows[1][1].paras[0]), '');
});

test('envelopeParas writes sender then recipient with a gap between', () => {
  const lines = E.envelopeParas('Asha Rao\nPatna', 'Sita Devi\nDelhi').map((p) => E.paraText(p));
  assert.deepEqual(lines, ['Asha Rao', 'Patna', '', 'Sita Devi', 'Delhi']);
});

test('HTML export marks inserted and deleted text', () => {
  const d = withText('abc');
  E.insertText(d.blocks[0], 3, 'Z', { ins: true });
  E.trackRangeDelete(d.blocks[0], 0, 1);
  const html = E.toHTML(d);
  assert.ok(html.includes('<ins>'));
  assert.ok(html.includes('<del>'));
});
