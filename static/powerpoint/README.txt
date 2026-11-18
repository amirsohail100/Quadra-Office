QUADRA POWERPOINT - version 4 (final)
=====================================
A browser based presentation editor. No server, no framework: plain HTML, CSS and JavaScript.

OPEN IT
  Double-click index.html (Chrome or Edge recommended), or serve the folder with any static server.
  Your work is saved automatically in this browser (localStorage). Use File > Create a copy > Download to keep a file.

FILES
  index.html        page structure (title bar, ribbon, thumbnails, canvas, notes, status bar) + inline icon sprite
  style.css         light and dark theme (CSS variables), slide rendering, presenter view, reader, print styles
  engine.js         presentation model without the DOM (works in the browser and in Node): slides, shapes, tables,
                    charts, animations, transitions, custom shows, comments, spell checker, review, diff, history
  script.js         editor core: rendering, selection, move / resize / rotate, text editing, clipboard, undo / redo,
                    zoom, rulers, grid and snap
  ui.js             ribbon (all tabs), menus, dialogs, File menu, slide show, presenter view, reader, autosave, export
  assets/icons.svg  icon sprite built by tools/build_icons.py (also inlined in index.html)
  assets/dict-en.js English spelling dictionary (hunspell en_US / SCOWL, see dict-en-LICENSE.txt), loaded on demand
  tools/            build_icons.py (sprite), build_dict.py (dictionary)
  tests/            model.test.js (Node) and browser.test.js (Playwright + Chromium)
  test.txt          test overview, manual checklist, known limitations

RUN THE TESTS
  npm install && npx playwright install chromium
  npm test                (model tests, then browser tests)
  python3 tools/build_icons.py     rebuilds the icon sprite (needed only after editing the icon list)

SUPPORT / FEEDBACK ADDRESS
  Contact Support and Feedback open your mail app. To pre-fill a recipient add, before ui.js in index.html:
  <script>window.QUADRA_CONFIG = { supportEmail: 'you@example.com' };</script>
