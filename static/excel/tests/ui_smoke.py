#!/usr/bin/env python3
"""
Quadra Office - browser smoke test (real Chromium via Playwright).

Setup once:   pip install playwright && python -m playwright install chromium
Run:          python3 tests/ui_smoke.py

It opens index.html, clicks through the ribbon tabs, dark mode, menus, formulas,
undo/redo, fill down, dialogs, comments, protection, drawing, autosave and search,
and prints PASS/FAIL for each check. It exits with code 1 if any check fails.
"""
import sys
import pathlib, json
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent
url = (ROOT / "index.html").as_uri()
errors, results = [], []
def check(name, ok, extra=""):
    results.append((name, bool(ok), extra))

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1280, "height": 760}, accept_downloads=True)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errors.append("PAGEERROR " + str(e)[:200]))
    pg.on("console", lambda m: errors.append(f"console.{m.type} " + m.text[:200]) if m.type == "error" else None)
    pg.goto(url); pg.evaluate("localStorage.clear()"); pg.reload(); pg.wait_for_timeout(300)
    def click_cell(col, row):
        box = pg.locator("#canvas").bounding_box()
        pg.mouse.click(box["x"] + 40 + col * 64 + 32, box["y"] + 20 + row * 20 + 10)
        pg.wait_for_timeout(30)

    # every ribbon tab renders its groups
    tabs = ["Home", "Insert", "Share", "Page Layout", "Formulas", "Data", "Review", "View", "Help", "Draw"]
    counts = {}
    for t in tabs:
        pg.click(f'.tab[data-tab="{t}"]'); pg.wait_for_timeout(60)
        counts[t] = pg.locator("#ribbon .grp").count()
    check("all 10 ribbon tabs render groups", all(v > 0 for v in counts.values()), json.dumps(counts))
    pg.click('.tab[data-tab="Home"]')

    # theme switch (dark / light) and persistence
    pg.click("#themeSwitch"); pg.wait_for_timeout(80)
    check("dark mode on", pg.evaluate("document.documentElement.dataset.theme") == "dark")
    check("switch reports aria-checked=true", pg.get_attribute("#themeSwitch", "aria-checked") == "true")
    pg.reload(); pg.wait_for_timeout(300)
    check("dark mode persists after reload", pg.evaluate("document.documentElement.dataset.theme") == "dark")
    pg.click("#themeSwitch"); pg.wait_for_timeout(80)

    # 9-dot launcher and profile menu
    pg.click("#btnApps"); pg.wait_for_timeout(60)
    check("9-dot launcher shows 6 apps", pg.locator("#appMenu .app-tile").count() == 6 and pg.is_visible("#appMenu"))
    pg.click("#btnApps"); pg.wait_for_timeout(40)
    pg.click("#btnProfile"); pg.wait_for_timeout(60)
    check("profile menu opens with theme toggle", pg.is_visible("#profileMenu") and pg.locator('#profileMenu [data-profile="theme"]').count() == 1)
    pg.keyboard.press("Escape")

    # File opens backstage
    pg.click('.tab[data-tab="File"]'); pg.wait_for_timeout(80)
    check("File tab opens backstage", pg.is_visible("#backstage"))
    check("ribbon keeps last real tab after File", pg.locator(".tab.active").inner_text() == "Home")
    pg.click("[data-bs-back]"); pg.wait_for_timeout(40)
    check("backstage closes", not pg.is_visible("#backstage"))

    # typing + formulas + undo, using the grid's own keyboard handling
    click_cell(0, 0)
    pg.keyboard.type("10"); pg.keyboard.press("Enter")
    pg.keyboard.type("20"); pg.keyboard.press("Enter")
    pg.keyboard.type("=SUM(A1:A2)"); pg.keyboard.press("Enter"); pg.wait_for_timeout(60)
    val = pg.evaluate("QuadraCore.cellValue(2,0)")
    check("typed formula evaluates (=SUM(A1:A2) -> 30)", val == 30, str(val))
    pg.keyboard.press("Control+z"); pg.wait_for_timeout(60)
    check("Ctrl+Z undoes the last entry", pg.evaluate("QuadraCore.cellValue(2,0)") is None)
    pg.keyboard.press("Control+y"); pg.wait_for_timeout(60)
    check("Ctrl+Y redoes it", pg.evaluate("QuadraCore.cellValue(2,0)") == 30)

    # Fill > Down from the Editing group menu
    pg.evaluate("QuadraCore.run('clearAll')") if False else None
    click_cell(1, 0)
    pg.keyboard.type("=A1*2"); pg.keyboard.press("Enter")
    pg.evaluate("QuadraCore.sel.ar=0; QuadraCore.sel.ac=1; QuadraCore.sel.fr=2; QuadraCore.sel.fc=1; QuadraCore.refresh();")
    pg.click('#ribbon [data-menu="fill"]'); pg.wait_for_timeout(40)
    check("Fill menu opens", pg.is_visible("#popRoot .menu"))
    pg.click('#popRoot [data-cmd="fillDown"]'); pg.wait_for_timeout(60)
    check("Fill Down shifts =A1*2 to B3 as =A3*2", pg.evaluate("QuadraCore.cells.get('2,1') && QuadraCore.cells.get('2,1').v") == "=A3*2")

    # Status bar selection stats and workbook statistics dialog
    check("status bar shows Sum for a numeric selection", "Sum" in pg.inner_text("#selStats"), pg.inner_text("#selStats"))
    pg.click("#btnStats"); pg.wait_for_timeout(60)
    check("Workbook Statistics dialog opens", pg.is_visible(".dlg") and "Formulas" in pg.inner_text(".dlg"))
    pg.keyboard.press("Escape")

    # Formula helper (fx button) lists functions and inserts one
    pg.click("#btnInsertFn"); pg.wait_for_timeout(60)
    pg.fill("#fnSearch", "SUM"); pg.wait_for_timeout(40)
    check("Insert Function search finds SUM", pg.locator(".fn-item").count() >= 1)
    pg.click('.fn-item[data-fn="SUM"]'); pg.wait_for_timeout(60)
    check("picked function opens the cell with =SUM(", pg.input_value("#cellEditor").startswith("=SUM("), pg.input_value("#cellEditor"))

    # Insert > Column chart from numbers in A1:A2
    pg.keyboard.press("Escape")
    pg.evaluate("QuadraCore.sel.ar=0; QuadraCore.sel.ac=0; QuadraCore.sel.fr=2; QuadraCore.sel.fc=0; QuadraCore.refresh();")
    pg.click('.tab[data-tab="Insert"]'); pg.wait_for_timeout(40)
    pg.click('#ribbon [data-cmd="chart"][data-val="column"]'); pg.wait_for_timeout(80)
    check("Column chart preview renders an SVG", pg.locator(".dlg svg.chart rect").count() >= 1)
    pg.keyboard.press("Escape")

    # Review: comments and protection
    pg.click('.tab[data-tab="Review"]'); pg.wait_for_timeout(40)
    click_cell(0, 0)
    pg.evaluate("window.prompt = () => 'check this'")
    pg.click('#ribbon [data-cmd="newComment"]'); pg.wait_for_timeout(40)
    check("New Comment stores a comment on the active cell", pg.evaluate("QuadraCore.getCell(0,0).comment") == "check this")
    pg.click('#ribbon [data-cmd="protectSheet"]'); pg.wait_for_timeout(40)
    check("Protect Sheet turns on", pg.evaluate("QuadraCore.isProtected()") is True)
    pg.click('#ribbon [data-cmd="protectSheet"]'); pg.wait_for_timeout(40)

    # View: gridlines and formula bar switches
    pg.click('.tab[data-tab="View"]'); pg.wait_for_timeout(40)
    pg.click('#ribbon [data-cmd="sheetOpt"][data-val="formulaBar"]'); pg.wait_for_timeout(60)
    check("Formula Bar switch hides the bar", not pg.is_visible(".formula-bar"))
    pg.click('#ribbon [data-cmd="sheetOpt"][data-val="formulaBar"]'); pg.wait_for_timeout(60)
    check("Formula Bar switch shows the bar again", pg.is_visible(".formula-bar"))

    # Draw: pen stroke on the drawing layer
    pg.click('.tab[data-tab="Draw"]'); pg.wait_for_timeout(40)
    pg.click('#ribbon [data-cmd="draw"][data-val="pen"]'); pg.wait_for_timeout(40)
    box = pg.locator("#drawLayer").bounding_box()
    pg.mouse.move(box["x"] + 60, box["y"] + 60); pg.mouse.down()
    pg.mouse.move(box["x"] + 140, box["y"] + 120, steps=8); pg.mouse.up()
    pg.click('#ribbon [data-cmd="draw"][data-val="pointer"]'); pg.wait_for_timeout(40)
    inked = pg.evaluate("""() => { const c = document.getElementById('drawLayer'); const d = c.getContext('2d').getImageData(0,0,c.width,c.height).data;
        let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; }""")
    check("pen stroke leaves ink pixels on the drawing layer", inked > 50, f"ink pixels={inked}")

    # Autosave writes to localStorage and restores on reload
    pg.wait_for_timeout(600)
    saved = pg.evaluate("localStorage.getItem('quadra.workbook.v1')")
    check("autosave writes the workbook", bool(saved) and "=SUM(A1:A2)" in saved)
    pg.reload(); pg.wait_for_timeout(300)
    check("workbook restored after reload", pg.evaluate("QuadraCore.cellValue(2,0)") == 30)

    # Command search
    pg.click("#searchBox"); pg.keyboard.type("sort")
    pg.wait_for_timeout(60)
    check("command search lists sort commands", pg.locator("#popRoot .mi").count() >= 1)
    pg.keyboard.press("Escape")

    # Insert / delete rows and columns (formulas must follow the cells they point to)
    pg.evaluate("localStorage.clear()"); pg.reload(); pg.wait_for_timeout(250)
    click_cell(0, 0); pg.keyboard.type("5"); pg.keyboard.press("Enter")
    click_cell(0, 1); pg.keyboard.type("10"); pg.keyboard.press("Enter")
    click_cell(0, 2); pg.keyboard.type("=A1+A2"); pg.keyboard.press("Enter"); pg.wait_for_timeout(40)
    pg.evaluate("QuadraCore.sel.ar=QuadraCore.sel.fr=1; QuadraCore.sel.ac=QuadraCore.sel.fc=0; QuadraCore.refresh()")
    pg.click('#ribbon [data-menu="insertCells"]'); pg.wait_for_timeout(40)
    pg.click('#popRoot [data-cmd="insertRows"]'); pg.wait_for_timeout(60)
    check("insert row moves values down", pg.evaluate("QuadraCore.cellValue(2,0)") == 10 and pg.evaluate("QuadraCore.getCell(1,0)") is None)
    check("insert row rewrites the formula reference (=A1+A3)", pg.evaluate("QuadraCore.getCell(3,0).v") == "=A1+A3", pg.evaluate("QuadraCore.getCell(3,0).v"))
    check("the moved formula still evaluates to 15", pg.evaluate("QuadraCore.cellValue(3,0)") == 15)
    pg.keyboard.press("Control+z"); pg.wait_for_timeout(60)
    check("Undo removes the inserted row", pg.evaluate("QuadraCore.cellValue(1,0)") == 10 and pg.evaluate("QuadraCore.getCell(3,0)") is None)
    pg.evaluate("QuadraCore.sel.ar=QuadraCore.sel.fr=1; QuadraCore.sel.ac=QuadraCore.sel.fc=0; QuadraCore.refresh()")
    pg.click('#ribbon [data-menu="deleteCells"]'); pg.wait_for_timeout(40)
    pg.click('#popRoot [data-cmd="deleteRows"]'); pg.wait_for_timeout(60)
    # after Undo the sheet is back to A1=5, A2=10, A3==A1+A2; deleting row 2 removes the 10
    check("delete row: the formula that pointed at the deleted cell becomes =A1+#REF!",
          pg.evaluate("(QuadraCore.getCell(1,0)||{}).v") == "=A1+#REF!", pg.evaluate("(QuadraCore.getCell(1,0)||{}).v"))
    check("the formula then shows #REF! on screen", pg.evaluate("QuadraCore.displayText(QuadraCore.cellValue(1,0), {})") == "#REF!")

    # Conditional formatting: highlight A1:A2 values greater than 7
    pg.evaluate("localStorage.clear()"); pg.reload(); pg.wait_for_timeout(250)
    click_cell(0, 0); pg.keyboard.type("5"); pg.keyboard.press("Enter")
    click_cell(0, 1); pg.keyboard.type("10"); pg.keyboard.press("Enter")
    pg.evaluate("QuadraCore.sel.ar=0; QuadraCore.sel.ac=0; QuadraCore.sel.fr=1; QuadraCore.sel.fc=0; QuadraCore.refresh()")
    pg.click('#ribbon [data-menu="condFormat"]'); pg.wait_for_timeout(40)
    pg.once("dialog", lambda d: d.accept("7"))
    pg.click('#popRoot [data-cmd="cfRule"][data-val="gt"]'); pg.wait_for_timeout(80)
    check("conditional rule is stored for the selection", pg.evaluate("QuadraCore.rules.length") == 1)
    check("rule matches values above 7 only", pg.evaluate("!!QuadraCore.ruleFor(1,0,10) && !QuadraCore.ruleFor(0,0,5)"))
    pg.wait_for_timeout(600)
    check("rules are part of the autosaved workbook", '"r":[{' in (pg.evaluate("localStorage.getItem('quadra.workbook.v1')") or ""))
    pg.reload(); pg.wait_for_timeout(250)
    check("rules survive a reload", pg.evaluate("QuadraCore.rules.length") == 1)

    # Coming-soon command shows a message instead of crashing
    pg.evaluate("QuadraCore.run('pivot')")
    b.close()

print("\n".join(f"{'PASS' if ok else 'FAIL'}  {n}" + (f"   [{x}]" if x and not ok else "") for n, ok, x in results))
print(f"\n{sum(1 for _,ok,_ in results if ok)}/{len(results)} checks passed")
print("page errors:", errors if errors else "none")
sys.exit(0 if all(ok for _, ok, _ in results) and not errors else 1)
