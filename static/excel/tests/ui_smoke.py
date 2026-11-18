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
    pg.goto(url); pg.evaluate("QuadraCore.clearSheet(); localStorage.clear()"); pg.reload(); pg.wait_for_timeout(300)
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

    check("the search bar is gone", pg.locator('#searchBox').count() == 0)

    # Insert / delete rows and columns (formulas must follow the cells they point to)
    pg.evaluate("QuadraCore.clearSheet(); localStorage.clear()"); pg.reload(); pg.wait_for_timeout(250)
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
    pg.evaluate("QuadraCore.clearSheet(); localStorage.clear()"); pg.reload(); pg.wait_for_timeout(250)
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

    # Home tab: Format Cells, Cell Styles, indent, text angle, add-ins
    pg.evaluate("QuadraCore.clearSheet(); localStorage.clear()"); pg.reload(); pg.wait_for_timeout(250)
    click_cell(0, 0); pg.keyboard.type("Quote"); pg.keyboard.press("Enter")
    click_cell(0, 0)
    pg.click('#ribbon [data-cmd="indentOut"]'); pg.click('#ribbon [data-cmd="indentOut"]'); pg.wait_for_timeout(40)
    check("increase indent twice -> indent 2", pg.evaluate("QuadraCore.getCell(0,0).s.indent") == 2)
    pg.click('#ribbon [data-cmd="indentIn"]'); pg.wait_for_timeout(40)
    check("decrease indent -> indent 1", pg.evaluate("QuadraCore.getCell(0,0).s.indent") == 1)
    pg.click('#ribbon [data-menu="cellStyles"]'); pg.wait_for_timeout(40)
    pg.click('#popRoot [data-cmd="style"][data-val="bad"]'); pg.wait_for_timeout(60)
    check("Cell Styles > Bad sets red fill and dark red text",
          pg.evaluate("QuadraCore.getCell(0,0).s.fill") == "#ffc7ce" and pg.evaluate("QuadraCore.getCell(0,0).s.color") == "#9c0006")
    pg.click('#ribbon [data-menu="orient"]'); pg.wait_for_timeout(40)
    pg.click('#popRoot [data-cmd="angle"][data-val="90"]'); pg.wait_for_timeout(60)
    check("Orientation > Rotate Text Up sets 90 degrees", pg.evaluate("QuadraCore.getCell(0,0).s.angle") == 90)
    pg.click('#ribbon [data-cmd="formatCells"]'); pg.wait_for_timeout(60)
    check("Format Cells dialog opens with the current values", pg.is_visible(".dlg") and pg.input_value("#fcAngle") == "90")
    pg.select_option("#fcNf", "currency"); pg.fill("#fcAngle", "0")
    pg.click('.dlg .btn.primary'); pg.wait_for_timeout(60)
    check("Format Cells OK applies the number format and clears the angle",
          pg.evaluate("QuadraCore.getCell(0,0).s.nf") == "currency" and pg.evaluate("QuadraCore.getCell(0,0).s.angle") is None)
    pg.click('#ribbon [data-cmd="addins"]'); pg.wait_for_timeout(40)
    check("Add-ins opens a dialog", pg.is_visible(".dlg") and "No add-ins" in pg.inner_text(".dlg"))
    pg.keyboard.press("Escape")

    # Cut must start from the selected cell
    click_cell(0, 0); pg.keyboard.type("Cut me"); pg.keyboard.press("Enter")
    click_cell(0, 0); pg.click('#ribbon [data-cmd="cut"]'); click_cell(9, 0)
    pg.click('#ribbon [data-cmd="paste"]'); pg.wait_for_timeout(60)
    check("Cut then Paste moves the value", pg.evaluate("QuadraCore.getCell(0,9).v") == "Cut me" and pg.evaluate("QuadraCore.getCell(0,0)") is None)

    # Insert tab: checkbox, charts, PivotTable, text box, shapes, picture
    pg.evaluate("QuadraCore.clearSheet(); localStorage.clear()"); pg.reload(); pg.wait_for_timeout(250)
    click_cell(0, 0); pg.keyboard.type("Done"); pg.keyboard.press("Enter")
    click_cell(1, 0)
    pg.click('.tab[data-tab="Insert"]'); pg.wait_for_timeout(40)
    pg.click('#ribbon [data-cmd="checkbox"]'); pg.wait_for_timeout(40)
    check("Checkbox inserted as FALSE", pg.evaluate("QuadraCore.getCell(0,1).v") == "FALSE" and pg.evaluate("QuadraCore.getCell(0,1).s.checkbox") is True)
    box = pg.locator("#canvas").bounding_box()
    pg.mouse.click(box["x"] + 40 + 64 + 8, box["y"] + 20 + 10); pg.wait_for_timeout(40)
    check("clicking the checkbox ticks it", pg.evaluate("QuadraCore.cellValue(0,1)") is True)
    pg.mouse.click(box["x"] + 40 + 64 + 8, box["y"] + 20 + 10); pg.wait_for_timeout(40)
    check("clicking again unticks it", pg.evaluate("QuadraCore.cellValue(0,1)") is False)

    # data for charts and pivot: Region, Sales, Cost
    pg.evaluate("QuadraCore.clearSheet()")
    rows = [("Region", "Sales", "Cost"), ("North", 10, 4), ("South", 20, 8), ("North", 5, 2)]
    for r, row in enumerate(rows):
        for c, v in enumerate(row):
            click_cell(c, r); pg.keyboard.type(str(v)); pg.keyboard.press("Enter")
    for chart, label in [("scatter", "scatter"), ("histogram", "histogram"), ("combo", "combo")]:
        pg.evaluate("QuadraCore.sel.ar=1;QuadraCore.sel.ac=1;QuadraCore.sel.fr=3;QuadraCore.sel.fc=2;QuadraCore.refresh()")
        pg.evaluate(f"QuadraCore.run('chart','{chart}')"); pg.wait_for_timeout(60)
        check(f"{label} chart draws an SVG", pg.locator(".dlg svg.chart").count() == 1 and pg.locator(".dlg svg.chart *").count() > 3)
        pg.keyboard.press("Escape")

    pg.evaluate("QuadraCore.sel.ar=0;QuadraCore.sel.ac=0;QuadraCore.sel.fr=3;QuadraCore.sel.fc=2;QuadraCore.refresh()")
    pg.click('#ribbon [data-menu="pivot"]'); pg.wait_for_timeout(40)
    pg.click('#popRoot [data-cmd="pivot"]'); pg.wait_for_timeout(60)
    pg.click('.dlg .btn.primary'); pg.wait_for_timeout(60)
    check("PivotTable groups by Region and adds Sales (North 15, South 20)",
          pg.evaluate("QuadraCore.getCell(1,4).v") == "North" and pg.evaluate("QuadraCore.cellValue(1,5)") == 15 and pg.evaluate("QuadraCore.cellValue(2,5)") == 20,
          f"E2={pg.evaluate('(QuadraCore.getCell(1,4)||{}).v')}")
    check("PivotTable total is a formula that evaluates to 35", pg.evaluate("QuadraCore.getCell(3,4).v") == "Total" and pg.evaluate("QuadraCore.cellValue(3,5)") == 35)

    pg.click('#ribbon [data-cmd="textBox"]') if False else None
    pg.once("dialog", lambda d: d.accept("Hello box"))
    pg.evaluate("QuadraCore.sel.ar=QuadraCore.sel.fr=0; QuadraCore.sel.ac=QuadraCore.sel.fc=0; QuadraCore.refresh()")
    pg.click('#ribbon [data-cmd="textBox"]'); pg.wait_for_timeout(60)
    check("Text box is drawn on the drawing layer", pg.evaluate("QuadraCore.serialize().length") > 0 and pg.evaluate("(function(){const c=document.getElementById('drawLayer');const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<d.length;i+=4) if(d[i]>0) n++;return n})()") > 50)
    pg.click('#ribbon [data-menu="shapes"]'); pg.wait_for_timeout(40)
    pg.click('#popRoot [data-val="oval"]'); pg.wait_for_timeout(60)
    check("Shape > Oval is added", pg.evaluate("(function(){const c=document.getElementById('drawLayer');const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<d.length;i+=4) if(d[i]>0) n++;return n})()") > 200)
    with pg.expect_file_chooser() as fc:
        pg.click('#ribbon [data-menu="pictures"]'); pg.wait_for_timeout(40)
        pg.click('#popRoot [data-cmd="picturesFile"]')
    fc.value.set_files(str(pathlib.Path(__file__).resolve().parent.parent / "assets" / "icons.svg".replace("icons.svg", "icons.svg")) if False else None) if False else None
    import tempfile, base64
    png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==")
    tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False); tmp.write(png); tmp.close()
    fc.value.set_files(tmp.name); pg.wait_for_timeout(200)
    check("Pictures > This Device draws the picture", pg.evaluate("(function(){const c=document.getElementById('drawLayer');const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<d.length;i+=4) if(d[i]>0) n++;return n})()") > 200)

    # Share tab
    pg.evaluate("QuadraCore.clearSheet(); localStorage.clear()"); pg.reload(); pg.wait_for_timeout(250)
    pg.click('.tab[data-tab="Share"]'); pg.wait_for_timeout(40)
    pg.click('#ribbon [data-cmd="shareBook"]'); pg.wait_for_timeout(60)
    check("Share opens a dialog with the link", pg.is_visible(".dlg") and pg.input_value("#shareUrl").startswith("file:"))
    pg.keyboard.press("Escape")
    pg.click('#ribbon [data-cmd="linkSheet"]'); pg.wait_for_timeout(60)
    check("Link to this Sheet reports it was copied", "copied" in pg.inner_text("#toast").lower())

    # Page Layout: themes, colours and fonts
    pg.click('.tab[data-tab="Page Layout"]'); pg.wait_for_timeout(40)
    pg.click('#ribbon [data-menu="pageTheme"]'); pg.click('#popRoot [data-val="ocean"]'); pg.wait_for_timeout(60)
    check("Theme Ocean sets the accent colour", pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()") == "#0f6cbd")
    pg.click('#ribbon [data-menu="fonts"]'); pg.click('#popRoot [data-val="Georgia"]'); pg.wait_for_timeout(40)
    check("Fonts > Georgia becomes the default font", pg.evaluate("localStorage.getItem('quadra.font')") == "Georgia")
    pg.click('#ribbon [data-menu="colors"]'); pg.click('#popRoot [data-val="#c43e1c"]'); pg.wait_for_timeout(40)
    check("Colors > Orange changes the accent", pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()") == "#c43e1c")

    # page setup values
    pg.click('#ribbon [data-menu="margins"]'); pg.click('#popRoot [data-val="wide"]')
    pg.click('#ribbon [data-menu="orientation"]'); pg.click('#popRoot [data-val="landscape"]')
    pg.click('#ribbon [data-menu="paperSize"]'); pg.click('#popRoot [data-val="Letter"]')
    ps = lambda: pg.evaluate("JSON.parse(localStorage.getItem('quadra.pageSetup') || '{}')")
    check("Margins Wide, Landscape and Letter are saved", ps().get("margins") == "wide" and ps().get("orientation") == "landscape" and ps().get("size") == "Letter", str(ps()))
    pg.select_option('#ribbon select[data-cmd="scaleW"]', "1"); pg.wait_for_timeout(40)
    check("Scale to Fit: width 1 page is saved", ps().get("fitW") is True)
    pg.select_option('#ribbon select[data-cmd="scale"]', "75"); pg.wait_for_timeout(40)
    check("Scale 75% is saved", ps().get("scale") == 75)

    # data for the print preview
    click_cell(0, 0); pg.keyboard.type("Item"); pg.keyboard.press("Enter")
    click_cell(1, 0); pg.keyboard.type("Qty"); pg.keyboard.press("Enter")
    for r in range(1, 40):  # rows below the screen are reached through the Name Box, not by clicking
        pg.fill("#nameBox", f"A{r + 1}"); pg.press("#nameBox", "Enter")
        pg.keyboard.type(f"Row {r}"); pg.keyboard.press("Enter")
    pg.evaluate("QuadraCore.sel.ar=0;QuadraCore.sel.ac=0;QuadraCore.sel.fr=2;QuadraCore.sel.fc=1;QuadraCore.refresh()")
    pg.click('#ribbon [data-menu="printArea"]'); pg.click('#popRoot [data-val="set"]'); pg.wait_for_timeout(40)
    check("Print Area is set from the selection", ps().get("printArea") == {"r1": 0, "c1": 0, "r2": 2, "c2": 1})
    pg.click('#ribbon [data-menu="printArea"]'); pg.click('#popRoot [data-val="clear"]'); pg.wait_for_timeout(40)
    check("Clear Print Area removes it", ps().get("printArea") is None)

    pg.evaluate("QuadraCore.sel.ar=QuadraCore.sel.fr=10;QuadraCore.sel.ac=QuadraCore.sel.fc=0;QuadraCore.refresh()")
    pg.click('#ribbon [data-menu="breaks"]'); pg.click('#popRoot [data-val="insert"]'); pg.wait_for_timeout(40)
    check("Insert Page Break at row 11 is saved", 10 in ps().get("breaks", []))

    pg.once("dialog", lambda d: d.accept("1"))
    pg.click('#ribbon [data-cmd="printTitles"]'); pg.wait_for_timeout(40)
    check("Print Titles: first row repeats", ps().get("titles") == 1)

    # print preview (through File > Print)
    pg.click('.tab[data-tab="File"]'); pg.click('[data-bs="print"]'); pg.wait_for_timeout(40)
    pg.click("#bsPrint"); pg.wait_for_timeout(80)
    check("Print Preview shows the pages", pg.is_visible(".dlg .pv-wrap") and pg.locator(".dlg .pv-page").count() >= 2, pg.inner_text(".dlg .note") if pg.is_visible(".dlg .note") else "")
    pg.keyboard.press("Escape")  # closes the preview and the backstage

    # background picture from a file
    import tempfile, base64
    png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==")
    tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False); tmp.write(png); tmp.close()
    with pg.expect_file_chooser() as fc:
        pg.click('#ribbon [data-menu="background"]'); pg.click('#popRoot [data-val="insert"]')
    fc.value.set_files(tmp.name); pg.wait_for_timeout(250)
    check("Background picture covers the empty grid", pg.evaluate("(function(){const c=document.getElementById('canvas');const d=c.getContext('2d').getImageData(600,300,1,1).data;return [d[0],d[1],d[2]].join(',')})()") != "255,255,255")

    # Formulas tab: names, lookup, errors, evaluate, manual calculation
    pg.evaluate("QuadraCore.clearSheet(); localStorage.clear()"); pg.reload(); pg.wait_for_timeout(250)
    pg.evaluate("QuadraCore.clearSheet()")
    for r, (item, qty) in enumerate([("Pear", 2), ("Plum", 4), ("Fig", 6)]):
        pg.evaluate(f"QuadraCore.setValue({r},0,'{item}'); QuadraCore.setValue({r},1,'{qty}'); QuadraCore.refresh()")
    pg.evaluate("QuadraCore.setValue(4,0,'=1/0'); QuadraCore.refresh()")
    pg.evaluate("QuadraCore.sel.ar=0;QuadraCore.sel.ac=1;QuadraCore.sel.fr=2;QuadraCore.sel.fc=1;QuadraCore.refresh()")
    pg.once("dialog", lambda d: d.accept("Qty"))
    pg.click('.tab[data-tab="Formulas"]'); pg.click('#ribbon [data-cmd="defineName"]'); pg.wait_for_timeout(60)
    check("Define Name stores the selection as a name", pg.evaluate("QuadraCore.getNames().length") == 1 and pg.evaluate("QuadraCore.getNames()[0][0]") == "QTY")
    pg.evaluate("QuadraCore.setValue(5,0,'=SUM(Qty)'); QuadraCore.refresh()")
    check("a formula can use the name (=SUM(Qty) = 12)", pg.evaluate("QuadraCore.cellValue(5,0)") == 12)
    pg.evaluate("QuadraCore.setValue(6,0,'=VLOOKUP(\"Plum\",A1:B3,2,FALSE)'); QuadraCore.refresh()")
    check("VLOOKUP exact match returns 4", pg.evaluate("QuadraCore.cellValue(6,0)") == 4)
    pg.evaluate("QuadraCore.setValue(7,0,'=DATE(2024,3,1)'); QuadraCore.refresh()")
    check("DATE returns the date serial 45352", pg.evaluate("QuadraCore.cellValue(7,0)") == 45352)
    pg.click('#ribbon [data-cmd="errorChecking"]'); pg.wait_for_timeout(60)
    check("Error Checking lists the #DIV/0! cell", pg.is_visible(".dlg") and "#DIV/0!" in pg.inner_text(".dlg"))
    pg.keyboard.press("Escape")
    pg.evaluate("QuadraCore.goTo(5,0)")
    pg.click('#ribbon [data-cmd="evaluateFormula"]'); pg.wait_for_timeout(60)
    check("Evaluate Formula shows the formula with values", pg.is_visible(".dlg") and "SUM(" in pg.inner_text(".dlg") and "Result" in pg.inner_text(".dlg"))
    pg.keyboard.press("Escape")
    pg.click('#ribbon [data-menu="calcOptions"]'); pg.click('#popRoot [data-cmd="calcManual"]'); pg.wait_for_timeout(40)
    pg.evaluate("QuadraCore.setValue(0,1,'10'); QuadraCore.refresh()")
    check("Manual calculation keeps the old formula result", pg.evaluate("QuadraCore.cellValue(5,0)") == 12)
    pg.click('#ribbon [data-cmd="calcSheet"]'); pg.wait_for_timeout(40)
    check("Calculate Sheet updates it", pg.evaluate("QuadraCore.cellValue(5,0)") == 20)
    pg.click('#ribbon [data-menu="calcOptions"]'); pg.click('#popRoot [data-cmd="calcAuto"]'); pg.wait_for_timeout(40)

    # Data tab: CSV import, validation, custom sort, subtotal, forecast, goal seek, text to columns
    pg.evaluate("QuadraCore.clearSheet(); localStorage.clear()"); pg.reload(); pg.wait_for_timeout(250)
    pg.evaluate("QuadraCore.clearSheet()")
    import tempfile
    tmp = tempfile.NamedTemporaryFile(suffix=".csv", delete=False, mode="w", encoding="utf-8")
    tmp.write('Name,Note\nAnn,"Hello, world"\nBen,5\n'); tmp.close()
    pg.click('.tab[data-tab="Data"]')
    with pg.expect_file_chooser() as fc:
        pg.click('#ribbon [data-menu="getData"]'); pg.click('#popRoot [data-cmd="fromText"]')
    fc.value.set_files(tmp.name); pg.wait_for_timeout(200)
    check("CSV import puts the quoted comma value in one cell", pg.evaluate("QuadraCore.getCell(1,1).v") == "Hello, world" and pg.evaluate("QuadraCore.getCell(0,0).v") == "Name")

    pg.evaluate("QuadraCore.goTo(3,0,3,0)")
    pg.click('#ribbon [data-menu="dataTools"]'); pg.click('#popRoot [data-cmd="dataValidation"]'); pg.wait_for_timeout(40)
    pg.select_option("#dvType", "number"); pg.fill("#dvMin", "1"); pg.fill("#dvMax", "10")
    pg.click('.dlg .btn.primary'); pg.wait_for_timeout(40)
    pg.evaluate("QuadraCore.goTo(3,0)"); pg.keyboard.type("50"); pg.keyboard.press("Enter"); pg.wait_for_timeout(40)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(30)  # the refused entry is cancelled
    pg.evaluate("QuadraCore.goTo(3,0)")
    check("Validation refuses 50 in a 1-10 cell", pg.evaluate("QuadraCore.getCell(3,0)") is None or pg.evaluate("QuadraCore.getCell(3,0).v") != "50")

    pg.evaluate("QuadraCore.clearSheet()")
    rows = [("Dept", "Who", "Pay"), ("B", "Zed", 3), ("A", "Amy", 9), ("B", "Ann", 5), ("A", "Bob", 1)]
    for r, row in enumerate(rows):
        for c, v in enumerate(row):
            pg.evaluate(f"QuadraCore.setValue({r},{c},{repr(str(v))})")
    pg.evaluate("QuadraCore.refresh(); QuadraCore.goTo(0,0,4,2)")
    pg.click('#ribbon [data-cmd="customSort"]'); pg.wait_for_timeout(40)
    pg.select_option("#csKey1", "0"); pg.select_option("#csKey2", "2"); pg.select_option("#csOrd2", "desc")
    pg.click('.dlg .btn.primary'); pg.wait_for_timeout(60)
    check("Custom Sort by Dept then Pay (desc) keeps header on top",
          pg.evaluate("QuadraCore.getCell(0,0).v") == "Dept" and pg.evaluate("QuadraCore.getCell(1,2).v") == "9" and pg.evaluate("QuadraCore.getCell(2,2).v") == "1")
    pg.click('#ribbon [data-cmd="reapply"]'); pg.wait_for_timeout(40)
    check("Reapply keeps the sort order", pg.evaluate("QuadraCore.getCell(1,2).v") == "9")

    pg.evaluate("QuadraCore.clearSheet()")
    pg.evaluate("QuadraCore.setValue(0,0,'Dept'); QuadraCore.setValue(0,1,'Pay'); QuadraCore.setValue(1,0,'A'); QuadraCore.setValue(1,1,'2'); QuadraCore.setValue(2,0,'A'); QuadraCore.setValue(2,1,'3'); QuadraCore.setValue(3,0,'B'); QuadraCore.setValue(3,1,'7'); QuadraCore.refresh()")
    pg.evaluate("QuadraCore.goTo(0,0,3,1)")
    pg.click('#ribbon [data-menu="outline"]'); pg.click('#popRoot [data-cmd="subtotal"]'); pg.wait_for_timeout(60)
    check("Subtotal adds a Total row for each group", pg.evaluate("QuadraCore.getCell(3,0).v") == "Total A" and pg.evaluate("QuadraCore.cellValue(3,1)") == 5)

    pg.evaluate("QuadraCore.clearSheet()")
    for r, (xv, yv) in enumerate([(1, 2), (2, 4), (3, 6)]):
        pg.evaluate(f"QuadraCore.setValue({r+1},0,'{xv}'); QuadraCore.setValue({r+1},1,'{yv}')")
    pg.evaluate("QuadraCore.setValue(0,0,'x'); QuadraCore.setValue(0,1,'y'); QuadraCore.refresh(); QuadraCore.goTo(0,0,3,1)")
    pg.click('#ribbon [data-cmd="forecast"]'); pg.wait_for_timeout(60)
    check("Forecast Sheet continues the straight line (x=4 gives y=8)", pg.evaluate("QuadraCore.cellValue(6,0)") == 4 and pg.evaluate("QuadraCore.cellValue(6,1)") == 8, str(pg.evaluate("[QuadraCore.cellValue(6,0), QuadraCore.cellValue(6,1)]")))

    pg.evaluate("QuadraCore.clearSheet()")
    pg.evaluate("QuadraCore.setValue(0,0,'3'); QuadraCore.setValue(0,1,'=A1*A1'); QuadraCore.refresh()")
    pg.evaluate("QuadraCore.goTo(0,1)")
    pg.click('#ribbon [data-menu="whatIf"]'); pg.click('#popRoot [data-cmd="goalSeek"]'); pg.wait_for_timeout(40)
    pg.fill("#gsSet", "B1"); pg.fill("#gsTo", "25"); pg.fill("#gsBy", "A1")
    pg.click('.dlg .btn.primary'); pg.wait_for_timeout(120)
    check("Goal Seek finds A1 = 5 so that B1 = 25", abs(pg.evaluate("QuadraCore.cellValue(0,0)") - 5) < 1e-6, str(pg.evaluate("QuadraCore.cellValue(0,0)")))
    pg.keyboard.press("Control+z"); pg.wait_for_timeout(60)
    check("Undo reverts the Goal Seek result in one step", pg.evaluate("QuadraCore.getCell(0,0).v") == "3")

    pg.evaluate("QuadraCore.clearSheet()")
    pg.evaluate("QuadraCore.setValue(0,0,'a b c'); QuadraCore.refresh(); QuadraCore.goTo(0,0)")
    pg.click('#ribbon [data-menu="dataTools"]'); pg.click('#popRoot [data-cmd="textToColumns"]'); pg.wait_for_timeout(40)
    pg.select_option("#ttDelim", " ")
    pg.click('.dlg .btn.primary'); pg.wait_for_timeout(40)
    check("Text to Columns with a space splits into columns", pg.evaluate("QuadraCore.getCell(0,0).v") == "a" and pg.evaluate("QuadraCore.getCell(0,1).v") == "b")

    # View tab: zoom, focus cell, saved views, navigation, new window
    pg.evaluate("QuadraCore.clearSheet(); localStorage.clear()"); pg.reload(); pg.wait_for_timeout(250)
    pg.evaluate("QuadraCore.clearSheet()")
    pg.evaluate("QuadraCore.setValue(0,0,'Hello'); QuadraCore.refresh()")
    pg.click('.tab[data-tab="View"]'); pg.wait_for_timeout(40)
    pg.click('#ribbon [data-cmd="zoom100"]'); pg.wait_for_timeout(40)
    pg.select_option('#ribbon select[data-cmd="zoomSel"]', "50"); pg.wait_for_timeout(40)
    check("zoom 50% halves the grid cell size", pg.evaluate("[QuadraCore.geom().zoom, QuadraCore.geom().COL_W]") == [0.5, 32], str(pg.evaluate("QuadraCore.geom()")))
    check("zoom label shows 50%", pg.inner_text("#zoomLabel") == "50%")
    pg.click('.sb-icon[data-cmd="zoomIn"]'); pg.wait_for_timeout(40)
    check("status bar zoom in steps to 75%", pg.evaluate("QuadraCore.geom().zoom") == 0.75)
    pg.click('#ribbon [data-cmd="zoom100"]'); pg.wait_for_timeout(40)
    click_cell(0, 0)
    check("after zoom 100% clicks still select the cell", pg.input_value("#nameBox") == "A1")
    pg.click('#ribbon [data-cmd="focusCell"]'); pg.wait_for_timeout(40)
    check("Focus Cell turns on", pg.evaluate("QuadraCore.sheetOpt.focusCell") is True)
    pg.click('#ribbon [data-cmd="focusCell"]'); pg.wait_for_timeout(40)
    pg.once("dialog", lambda d: d.accept("Small"))
    pg.click('#ribbon [data-cmd="saveView"]'); pg.wait_for_timeout(40)
    pg.click('#ribbon [data-cmd="zoom100"]'); pg.wait_for_timeout(40)
    pg.evaluate("localStorage.setItem('quadra.views', JSON.stringify([{name:'Small', zoom:0.5, gridView:true, headingsView:true, formulaBar:true, focusCell:false}]))")
    pg.click('#ribbon [data-menu="sheetView"]'); pg.click('#popRoot [data-val="Custom Views…"]') if False else pg.click('#popRoot [data-cmd="customViews"]'); pg.wait_for_timeout(40)
    pg.click('.dlg [data-apply="0"]'); pg.wait_for_timeout(60)
    check("Custom Views > Apply restores the saved zoom", pg.evaluate("QuadraCore.geom().zoom") == 0.5)
    pg.click('#ribbon [data-cmd="sheetViewDefault"]') if False else None
    pg.click('#ribbon [data-menu="sheetView"]'); pg.click('#popRoot [data-cmd="sheetViewDefault"]'); pg.wait_for_timeout(40)
    check("Sheet View > Default resets zoom to 100%", pg.evaluate("QuadraCore.geom().zoom") == 1)
    pg.evaluate("QuadraCore.setValue(0,0,'Hi'); QuadraCore.setValue(0,25,'x'); QuadraCore.refresh(); QuadraCore.goTo(0,0,0,25)")
    pg.click('#ribbon [data-cmd="zoomSelection"]'); pg.wait_for_timeout(40)
    check("Zoom to Selection fits the selected columns", pg.evaluate("QuadraCore.geom().zoom") < 1)
    pg.click('#ribbon [data-cmd="zoom100"]'); pg.wait_for_timeout(40)
    pg.evaluate("QuadraCore.setValue(2,2,'note'); QuadraCore.refresh(); QuadraCore.getCell(2,2).comment = 'see me'; QuadraCore.refresh()")
    pg.click('#ribbon [data-cmd="navigation"]'); pg.wait_for_timeout(60)
    check("Navigation lists the comment", "see me" in pg.inner_text(".dlg"))
    pg.click('.dlg [data-nav="0"]'); pg.wait_for_timeout(60)
    check("Navigation > Go selects the commented cell", pg.evaluate("[QuadraCore.sel.ar, QuadraCore.sel.ac]") == [2, 2])
    with pg.context.expect_page() as newp:
        pg.click('#ribbon [data-cmd="newWindow"]')
    check("New Window opens the workbook in another tab", newp.value.url.startswith("file:"))
    newp.value.close()

    # Review tab: versions, changes, accessibility, pause protection
    pg.evaluate("QuadraCore.clearSheet(); localStorage.clear()"); pg.reload(); pg.wait_for_timeout(250)
    pg.evaluate("QuadraCore.clearSheet()"); pg.evaluate("QuadraCore.setValue(0,0,'Original'); QuadraCore.refresh()")
    pg.click('.tab[data-tab="Review"]'); pg.wait_for_timeout(40)
    pg.click('#ribbon [data-cmd="version"]'); pg.wait_for_timeout(50)
    pg.once("dialog", lambda d: d.accept("First"))
    pg.click('.dlg .btn:has-text("Save current version")'); pg.wait_for_timeout(60)
    check("Version History saves a version", pg.evaluate("JSON.parse(localStorage.getItem('quadra.versions')||'[]').length") == 1)
    pg.keyboard.press("Escape")
    pg.evaluate("QuadraCore.setValue(0,0,'Changed'); QuadraCore.setValue(1,0,'new'); QuadraCore.refresh()")
    pg.click('#ribbon [data-cmd="showChanges"]'); pg.wait_for_timeout(40)
    check("Show Changes reports the two changed cells", "2 changed" in pg.inner_text("#toast"), pg.inner_text("#toast"))
    pg.click('#ribbon [data-cmd="version"]'); pg.wait_for_timeout(50)
    pg.click('.dlg [data-restore="0"]'); pg.wait_for_timeout(60)
    check("Restore brings back the saved version", pg.evaluate("QuadraCore.getCell(0,0).v") == "Original" and pg.evaluate("QuadraCore.getCell(1,0)") is None)
    pg.click('#ribbon [data-cmd="accessibilityCheck"]') if False else None
    pg.click('#ribbon [data-menu="access"]'); pg.click('#popRoot [data-cmd="accessibilityCheck"]'); pg.wait_for_timeout(40)
    check("Accessibility check opens its report", pg.is_visible(".dlg") and "Accessibility" in pg.inner_text(".dlg"))
    pg.keyboard.press("Escape")
    pg.click('#ribbon [data-cmd="protectSheet"]'); pg.wait_for_timeout(30)
    pg.click('#ribbon [data-cmd="pauseProtection"]'); pg.wait_for_timeout(30)
    check("Pause Protection turns protection off", pg.evaluate("QuadraCore.isProtected()") is False)
    pg.click('#ribbon [data-cmd="pauseProtection"]'); pg.wait_for_timeout(30)
    check("Pause Protection again turns it back on", pg.evaluate("QuadraCore.isProtected()") is True)
    pg.click('#ribbon [data-cmd="protectSheet"]'); pg.wait_for_timeout(30)
    pg.click('#ribbon [data-cmd="spelling"]'); pg.wait_for_timeout(40)
    check("Spelling explains that a dictionary is needed", pg.is_visible(".dlg") and "dictionary" in pg.inner_text(".dlg"))
    pg.keyboard.press("Escape")

    # Help tab: topics, search, shortcuts
    pg.click('.tab[data-tab="Help"]'); pg.wait_for_timeout(40)
    pg.click('#ribbon [data-cmd="help"]'); pg.wait_for_timeout(50)
    check("Help lists topics", pg.locator(".dlg [data-topic]").count() == 9)
    pg.fill("#helpSearch", "zoom"); pg.wait_for_timeout(30)
    check("Help search filters topics", pg.locator('.dlg [data-topic]:visible').count() == 1)
    pg.click('.dlg [data-topic]:visible'); pg.wait_for_timeout(40)
    check("Help topic shows its text", "Zoom changes" in pg.inner_text(".dlg") or "Custom Views" in pg.inner_text(".dlg"))
    pg.keyboard.press("Escape")

    # Draw tab: touch drawing and ink kept between visits
    pg.click('.tab[data-tab="Draw"]'); pg.wait_for_timeout(40)
    pg.click('#ribbon [data-cmd="drawTouch"]'); pg.wait_for_timeout(40)
    check("Draw with Touch stops the finger from scrolling the drawing", pg.evaluate("document.getElementById('drawLayer').style.touchAction") == "none")
    pg.click('#ribbon [data-cmd="draw"][data-val="pen"]'); pg.wait_for_timeout(30)
    box = pg.locator("#drawLayer").bounding_box()
    pg.mouse.move(box["x"] + 100, box["y"] + 100); pg.mouse.down(); pg.mouse.move(box["x"] + 200, box["y"] + 160, steps=6); pg.mouse.up()
    pg.wait_for_timeout(60)
    check("the stroke is saved in this browser", (pg.evaluate("localStorage.getItem('quadra.ink')") or "[]") != "[]")
    pg.reload(); pg.wait_for_timeout(250)
    box = pg.locator("#drawLayer").bounding_box()
    check("the ink is still there after reload", pg.evaluate("(function(){const c=document.getElementById('drawLayer');const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<d.length;i+=4) if(d[i]>0) n++;return n})()") > 20)

    # Immersive Reader reads the selection
    pg.evaluate("QuadraCore.setValue(0,0,'Read me'); QuadraCore.refresh(); QuadraCore.goTo(0,0)")
    pg.click('.tab[data-tab="View"]'); pg.click('#ribbon [data-cmd="immersive"]'); pg.wait_for_timeout(60)
    check("Immersive Reader opens with the selected text", pg.is_visible(".dlg") and "Read me" in pg.inner_text(".dlg"))
    pg.keyboard.press("Escape")

    # Activity button lists the commands run in this session
    pg.click('#ribbon [data-cmd="bold"]') if False else None
    pg.click('.tab[data-tab="Home"]'); pg.click('#ribbon [data-cmd="bold"]'); pg.wait_for_timeout(30)
    pg.click('[data-cmd="activity"]'); pg.wait_for_timeout(50)
    check("Activity lists the bold command just run", pg.is_visible(".dlg") and "bold" in pg.inner_text(".dlg"))
    pg.keyboard.press("Escape")

    # Home extras: Fill Right, Fill Series, Replace, Go To
    pg.evaluate("QuadraCore.clearSheet(); localStorage.clear()"); pg.reload(); pg.wait_for_timeout(250)
    pg.evaluate("QuadraCore.clearSheet(); QuadraCore.setValue(0,0,'=A2+1'); QuadraCore.setValue(1,0,'4'); QuadraCore.setValue(0,1,'word'); QuadraCore.setValue(0,2,'a word'); QuadraCore.refresh()")
    pg.click('.tab[data-tab="Home"]'); pg.evaluate("QuadraCore.goTo(0,0,1,2)")
    pg.click('#ribbon [data-menu="fill"]'); pg.click('#popRoot [data-cmd="fillRight"]'); pg.wait_for_timeout(40)
    check("Fill Right shifts the formula reference (=A2+1 -> =B2+1, =C2+1)", pg.evaluate("QuadraCore.getCell(0,1).v") == "=B2+1" and pg.evaluate("QuadraCore.getCell(0,2).v") == "=C2+1", str(pg.evaluate("[QuadraCore.getCell(0,1)&&QuadraCore.getCell(0,1).v, QuadraCore.getCell(0,2)&&QuadraCore.getCell(0,2).v]")))
    pg.evaluate("QuadraCore.clearSheet(); QuadraCore.setValue(0,0,'1'); QuadraCore.setValue(1,0,'3'); QuadraCore.refresh(); QuadraCore.goTo(0,0,3,0)")
    pg.click('#ribbon [data-menu="fill"]'); pg.wait_for_timeout(20)
    pg.evaluate("(function(){ const i = [...document.querySelectorAll('#popRoot .mi')]; })()")
    pg.evaluate("QuadraCore.run('series')"); pg.wait_for_timeout(30)
    check("Fill Series continues 1, 3 to 5, 7", [pg.evaluate(f"QuadraCore.getCell({r},0).v") for r in range(4)] == ["1", "3", "5", "7"])
    pg.evaluate("QuadraCore.clearSheet(); QuadraCore.setValue(0,0,'cat dog cat'); QuadraCore.refresh()")
    pg.evaluate("QuadraCore.goTo(0,0)"); pg.click('#ribbon [data-menu="find"]'); pg.click('#popRoot [data-cmd="replace"]'); pg.wait_for_timeout(40)
    pg.fill("#rpFind", "cat"); pg.fill("#rpWith", "owl"); pg.click('.dlg .btn.primary'); pg.wait_for_timeout(40)
    check("Replace changes the text", pg.evaluate("QuadraCore.getCell(0,0).v") == "owl dog owl")
    pg.click('#ribbon [data-menu="find"]'); pg.click('#popRoot [data-cmd="goto"]'); pg.wait_for_timeout(40)
    pg.fill("#gtRef", "C12"); pg.click('.dlg .btn.primary'); pg.wait_for_timeout(40)
    check("Go To C12 selects C12", pg.evaluate("[QuadraCore.sel.ar, QuadraCore.sel.ac]") == [11, 2])

    # Sheets: add, switch with separate data, rename
    pg.evaluate("QuadraCore.clearSheet(); localStorage.clear()"); pg.reload(); pg.wait_for_timeout(250)
    pg.evaluate("QuadraCore.setValue(0,0,'first sheet'); QuadraCore.refresh()")
    pg.click("#btnAddSheet"); pg.wait_for_timeout(60)
    check("Add sheet creates Sheet2 and makes it active", pg.locator("#sheetTabs .sheet-tab").count() == 2 and pg.evaluate("QuadraCore.sheetList()[1].active") is True)
    check("the new sheet starts empty", pg.evaluate("QuadraCore.getCell(0,0)") is None)
    pg.evaluate("QuadraCore.setValue(0,0,'second sheet'); QuadraCore.refresh()")
    pg.click('#sheetTabs [data-sheet="0"]'); pg.wait_for_timeout(60)
    check("switching back shows the first sheet's data", pg.evaluate("QuadraCore.getCell(0,0).v") == "first sheet")
    pg.click('#sheetTabs [data-sheet="1"]'); pg.wait_for_timeout(60)
    check("and the second sheet keeps its own data", pg.evaluate("QuadraCore.getCell(0,0).v") == "second sheet")
    pg.once("dialog", lambda d: d.accept("Budget"))
    pg.dblclick('#sheetTabs [data-sheet="1"]'); pg.wait_for_timeout(60)
    check("double-click renames a sheet", pg.evaluate("QuadraCore.sheetList()[1].name") == "Budget")
    pg.reload(); pg.wait_for_timeout(250)
    check("both sheets and their data survive a reload", pg.locator("#sheetTabs .sheet-tab").count() == 2 and pg.evaluate("QuadraCore.sheetList()[1].name") == "Budget")

    # Zoom box is a menu; the chosen zoom is remembered
    pg.click("#zoomBox"); pg.wait_for_timeout(40)
    check("clicking the zoom box opens the zoom list", pg.locator("#popRoot .mi").count() >= 8)
    pg.click('#popRoot [data-val="150"]'); pg.wait_for_timeout(40)
    check("zoom 150% from the list", pg.evaluate("QuadraCore.geom().zoom") == 1.5 and pg.inner_text("#zoomLabel") == "150%")
    pg.reload(); pg.wait_for_timeout(250)
    check("zoom 150% is remembered after reload", pg.evaluate("QuadraCore.geom().zoom") == 1.5)
    pg.evaluate("QuadraCore.run('zoom100')"); pg.wait_for_timeout(30)

    # Coming-soon command shows a message instead of crashing
    pg.evaluate("QuadraCore.run('pivot')")
    b.close()

print("\n".join(f"{'PASS' if ok else 'FAIL'}  {n}" + (f"   [{x}]" if x and not ok else "") for n, ok, x in results))
print(f"\n{sum(1 for _,ok,_ in results if ok)}/{len(results)} checks passed")
print("page errors:", errors if errors else "none")
sys.exit(0 if all(ok for _, ok, _ in results) and not errors else 1)
