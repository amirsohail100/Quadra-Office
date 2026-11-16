#!/usr/bin/env python3
"""Quadra Word - browser tests (Playwright + Chromium).

Every test opens a fresh browser context (empty localStorage), changes the UI, and
checks the real state: the document model (QuadraEditor.getDoc), the DOM, computed
styles, or localStorage. Toast text is never the only evidence.
Every test also fails if the page raised an error or logged a console error.

Run:  PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers python3 tests/test_browser.py
"""
import base64
import json
import os
import pathlib
import tempfile
import unittest

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
URL = (ROOT / "index.html").as_uri()
CHROME = os.environ.get("QUADRA_CHROME", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
PNG_1X1 = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)


def launch(p):
    kwargs = {"args": ["--no-sandbox"]}
    if os.path.exists(CHROME):
        kwargs["executable_path"] = CHROME
    return p.chromium.launch(**kwargs)


class QuadraCase(unittest.TestCase):
    """Base class: shared browser, one fresh context and page per test."""
    playwright = None
    browser = None

    @classmethod
    def setUpClass(cls):
        cls.playwright = sync_playwright().start()
        cls.browser = launch(cls.playwright)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()

    def setUp(self):
        self.ctx = self.browser.new_context(viewport={"width": 1280, "height": 800}, accept_downloads=True)
        self.errors = []
        self.page = self.ctx.new_page()
        self.page.on("pageerror", lambda e: self.errors.append("pageerror: " + str(e)))
        self.page.on("console", lambda m: self.errors.append("console." + m.type + ": " + m.text)
                     if m.type == "error" else None)
        self.page.goto(URL)
        self.page.wait_for_function("window.QuadraEditor && document.querySelectorAll('[role=tab]').length === 10")

    def tearDown(self):
        try:
            self.assertEqual(self.errors, [], "page errors or console errors")
        finally:
            self.ctx.close()

    # ----- helpers -----
    def doc(self):
        return self.page.evaluate("window.QuadraEditor.getDoc()")

    def paras(self):
        return [b for b in self.doc()["blocks"] if b["type"] == "p"]

    def texts(self):
        return ["".join(r["t"] for r in b["runs"]) for b in self.paras()]

    def tab(self, name):
        self.page.click("[role=tab][data-tab=%s]" % name)

    def type_(self, text):
        self.page.keyboard.type(text)

    def focus_body(self):
        self.page.click("#doc-body")

    def run_for(self, text_in_model):
        return self.page.wait_for_function(
            "(t) => window.QuadraEditor.getDoc().blocks.some(b => b.type==='p' && b.runs.map(r=>r.t).join('').includes(t))",
            arg=text_in_model)


class PageAndTabs(QuadraCase):
    def test_page_loads_with_ten_tabs_and_no_placeholder_text(self):
        self.assertEqual(self.page.locator("[role=tab]").count(), 10)
        names = self.page.locator("[role=tab]").all_inner_texts()
        self.assertEqual(names, ["File", "Home", "Insert", "Design", "Layout", "References",
                                  "Mailings", "Review", "View", "Help"])
        html = self.page.content().lower()
        self.assertNotIn("coming soon", html)
        self.assertNotIn("todo", html)

    def test_ribbon_tab_switches_visible_panel(self):
        self.tab("insert")
        self.assertTrue(self.page.locator("#panel-insert").is_visible())
        self.assertFalse(self.page.locator("#panel-home").is_visible())
        self.assertEqual(self.page.get_attribute("#tab-insert", "aria-selected"), "true")

    def test_icon_references_all_exist_in_sprite(self):
        missing = self.page.evaluate("""() => {
          const ids = new Set(Array.from(document.querySelectorAll('symbol')).map(s => s.id));
          return Array.from(document.querySelectorAll('use')).map(u => u.getAttribute('href').slice(1)).filter(id => !ids.has(id));
        }""")
        self.assertEqual(missing, [])

    def test_status_bar_reports_page_and_words(self):
        self.focus_body()
        self.type_("one two three")
        self.assertEqual(self.page.inner_text("#st-words"), "3 words")
        self.assertEqual(self.page.inner_text("#st-page"), "Page 1 of 1")


class Typing(QuadraCase):
    def test_typing_goes_into_document_model(self):
        self.focus_body()
        self.type_("Hello")
        self.assertEqual(self.texts(), ["Hello"])

    def test_enter_creates_new_paragraph(self):
        self.focus_body()
        self.type_("a")
        self.page.keyboard.press("Enter")
        self.type_("b")
        self.assertEqual(self.texts(), ["a", "b"])
        self.assertEqual(self.page.locator("#doc-body > p.para").count(), 2)

    def test_backspace_and_delete_change_model(self):
        self.focus_body()
        self.type_("abc")
        self.page.keyboard.press("Backspace")
        self.assertEqual(self.texts(), ["ab"])
        self.page.keyboard.press("Home")
        self.page.keyboard.press("Delete")
        self.assertEqual(self.texts(), ["b"])

    def test_backspace_at_start_merges_paragraphs(self):
        self.focus_body()
        self.type_("ab")
        self.page.keyboard.press("Enter")
        self.type_("cd")
        self.page.keyboard.press("Home")
        self.page.keyboard.press("Backspace")
        self.assertEqual(self.texts(), ["abcd"])

    def test_select_all_then_delete_leaves_one_empty_paragraph(self):
        self.focus_body()
        self.type_("first")
        self.page.keyboard.press("Enter")
        self.type_("second")
        self.page.keyboard.press("Control+a")
        self.page.keyboard.press("Delete")
        self.assertEqual(self.texts(), [""])

    def test_tab_inserts_tab_character(self):
        self.focus_body()
        self.type_("x")
        self.page.keyboard.press("Tab")
        self.type_("y")
        self.assertEqual(self.texts(), ["x\ty"])

    def test_typing_is_not_lost_under_fast_input(self):
        self.focus_body()
        sentence = "The quick brown fox jumps over the lazy dog 0123456789"
        self.page.keyboard.type(sentence, delay=2)
        self.assertEqual(self.texts(), [sentence])


class Formatting(QuadraCase):
    def test_select_text_then_bold_button_changes_only_selection(self):
        self.focus_body()
        self.type_("hello world")
        self.page.keyboard.press("Home")
        for _ in range(5):
            self.page.keyboard.press("Shift+ArrowRight")
        self.page.click("[data-cmd=bold]")
        runs = self.paras()[0]["runs"]
        self.assertEqual(runs[0], {"t": "hello", "f": {"b": True}})
        self.assertEqual(runs[1]["t"], " world")
        self.assertNotIn("b", runs[1]["f"])
        self.assertEqual(self.page.evaluate("getComputedStyle(document.querySelector('#doc-body span')).fontWeight"), "700")

    def test_ctrl_i_toggles_italic_on_selection(self):
        self.focus_body()
        self.type_("slant")
        self.page.keyboard.press("Control+a")
        self.page.keyboard.press("Control+i")
        self.assertTrue(self.paras()[0]["runs"][0]["f"]["i"])
        self.page.keyboard.press("Control+i")
        self.assertEqual(self.paras()[0]["runs"][0]["f"].get("i"), None)

    def test_collapsed_bold_applies_to_next_typed_text(self):
        self.focus_body()
        self.type_("a")
        self.page.click("[data-cmd=bold]")
        self.type_("B")
        runs = self.paras()[0]["runs"]
        self.assertEqual(runs[-1], {"t": "B", "f": {"b": True}})

    def test_font_size_menu_sets_size_on_selection(self):
        self.focus_body()
        self.type_("big")
        self.page.keyboard.press("Control+a")
        self.page.click("[data-menu=size]")
        self.page.click(".menu-item:has-text('20')")
        self.assertEqual(self.paras()[0]["runs"][0]["f"]["size"], 20)
        self.assertEqual(self.page.evaluate("document.querySelector('#doc-body span').style.fontSize"), "20pt")

    def test_highlight_palette_sets_highlight_color(self):
        self.focus_body()
        self.type_("mark")
        self.page.keyboard.press("Control+a")
        self.page.click("[data-menu=highlight]")
        self.page.locator(".palette .sw").nth(5).click()
        hl = self.paras()[0]["runs"][0]["f"]["hl"]
        self.assertTrue(hl.startswith("#"))

    def test_heading_style_changes_model_and_dom_class(self):
        self.focus_body()
        self.type_("Intro")
        self.page.click("[data-cmd=style][data-value='Heading 1']")
        self.assertEqual(self.paras()[0]["style"], "Heading 1")
        self.assertEqual(self.page.locator("#doc-body .para.st-heading-1").count(), 1)

    def test_center_alignment_sets_text_align(self):
        self.focus_body()
        self.type_("middle")
        self.page.click("[data-cmd=align][data-value=center]")
        self.assertEqual(self.paras()[0]["align"], "center")
        self.assertEqual(self.page.evaluate("getComputedStyle(document.querySelector('#doc-body p')).textAlign"), "center")

    def test_clear_formatting_removes_marks(self):
        self.focus_body()
        self.type_("fmt")
        self.page.keyboard.press("Control+a")
        self.page.keyboard.press("Control+b")
        self.page.click("[data-cmd=clear-format]")
        self.assertEqual(self.paras()[0]["runs"][0]["f"], {})

    def test_undo_and_redo_restore_text(self):
        self.focus_body()
        self.type_("abc")
        self.page.keyboard.press("Control+z")
        self.assertNotIn("abc", " ".join(self.texts()))
        self.page.keyboard.press("Control+y")
        self.assertEqual(self.texts(), ["abc"])

    def test_undo_button_is_disabled_without_history(self):
        self.assertTrue(self.page.is_disabled("#btn-undo"))
        self.focus_body()
        self.type_("z")
        self.page.wait_for_function("!document.querySelector('#btn-undo').disabled")


class Lists(QuadraCase):
    def test_bullets_and_enter_exits_list(self):
        self.focus_body()
        self.page.click("[data-cmd=bullets]")
        self.type_("a")
        self.page.keyboard.press("Enter")
        self.type_("b")
        self.page.keyboard.press("Enter")
        self.page.keyboard.press("Enter")
        paras = self.paras()
        self.assertEqual(paras[0]["list"]["kind"], "bullet")
        self.assertEqual(paras[1]["list"]["kind"], "bullet")
        self.assertIsNone(paras[2]["list"])
        self.assertEqual(self.page.locator("#doc-body .para.li").count(), 2)

    def test_tab_in_list_item_increases_level(self):
        self.focus_body()
        self.page.click("[data-cmd=numbering]")
        self.type_("item")
        self.page.keyboard.press("Tab")
        self.assertEqual(self.paras()[0]["list"]["level"], 1)
        self.page.keyboard.press("Shift+Tab")
        self.assertEqual(self.paras()[0]["list"]["level"], 0)


class Tables(QuadraCase):
    def test_table_grid_inserts_rows_and_columns(self):
        self.focus_body()
        self.tab("insert")
        self.page.click("[data-menu=table]")
        self.page.locator(".gc[data-r='1'][data-c='2']").click()
        tbl = [b for b in self.doc()["blocks"] if b["type"] == "table"][0]
        self.assertEqual(len(tbl["rows"]), 2)
        self.assertEqual(len(tbl["rows"][0]), 3)
        self.assertEqual(self.page.locator("#doc-body table.tbl tr").count(), 2)

    def test_typing_inside_cell_updates_that_cell(self):
        self.focus_body()
        self.tab("insert")
        self.page.click("[data-menu=table]")
        self.page.locator(".gc[data-r='0'][data-c='1']").click()
        self.page.click("#doc-body table.tbl td >> nth=0")
        self.type_("cell")
        tbl = [b for b in self.doc()["blocks"] if b["type"] == "table"][0]
        self.assertEqual("".join(r["t"] for r in tbl["rows"][0][0]["paras"][0]["runs"]), "cell")

    def test_merge_with_right_cell_spans_two_columns(self):
        self.focus_body()
        self.tab("insert")
        self.page.click("[data-menu=table]")
        self.page.locator(".gc[data-r='0'][data-c='1']").click()
        self.page.click("#doc-body table.tbl td >> nth=0")
        self.page.click("[data-menu=table]")
        self.page.click(".menu-item:has-text('Merge with Right Cell')")
        tbl = [b for b in self.doc()["blocks"] if b["type"] == "table"][0]
        self.assertEqual(tbl["rows"][0][0]["colspan"], 2)
        self.assertTrue(tbl["rows"][0][1]["covered"])
        self.assertEqual(self.page.locator("#doc-body table.tbl tr").first.locator("td").count(), 1)


class InsertsAndMedia(QuadraCase):
    def test_picture_from_file_input_adds_image_block(self):
        tmp = pathlib.Path(tempfile.mkdtemp()) / "pixel.png"
        tmp.write_bytes(PNG_1X1)
        self.focus_body()
        self.page.set_input_files("#file-img", str(tmp))
        self.page.wait_for_function("window.QuadraEditor.getDoc().blocks.some(b => b.type === 'img')")
        img = [b for b in self.doc()["blocks"] if b["type"] == "img"][0]
        self.assertTrue(img["src"].startswith("data:image/png"))
        self.assertEqual(self.page.locator("#doc-body .blk-img img").count(), 1)

    def test_page_break_adds_pb_block(self):
        self.focus_body()
        self.type_("before")
        self.tab("insert")
        self.page.click("[data-cmd=pagebreak]")
        types = [b["type"] for b in self.doc()["blocks"]]
        self.assertIn("pb", types)
        self.assertEqual(self.page.locator("#doc-body .pb").count(), 1)

    def test_header_footer_dialog_saves_text(self):
        self.tab("insert")
        self.page.click("[data-cmd=header-footer]")
        self.page.fill("textarea[aria-label='Header text']", "Quarterly report")
        self.page.click("#dlg-actions button.primary")
        self.assertEqual(self.doc()["header"], "Quarterly report")
        self.assertIn("Quarterly report", self.page.inner_text("#hf-header"))

    def test_toc_lists_headings(self):
        self.focus_body()
        self.type_("Introduction")
        self.page.click("[data-cmd=style][data-value='Heading 1']")
        self.tab("references")
        self.page.click("#panel-references [data-cmd=toc]")
        self.assertTrue(any(t == "Introduction" for t in self.texts()))

    def test_symbol_menu_inserts_character(self):
        self.focus_body()
        self.tab("insert")
        self.page.click("[data-menu=symbol]")
        self.page.locator(".chip").first.click()
        self.assertEqual(len(self.texts()[0]), 1)

    def test_link_dialog_adds_link_mark(self):
        self.focus_body()
        self.tab("insert")
        self.page.click("[data-cmd=link]")
        self.page.fill("#dlg input[type=url]", "https://example.com")
        self.page.click("#dlg-actions button.primary")
        self.assertEqual(self.paras()[0]["runs"][0]["f"]["link"], "https://example.com")
        self.assertEqual(self.page.locator("#doc-body span.lnk").count(), 1)


class FindReplace(QuadraCase):
    def test_find_next_moves_selection_to_match_and_reports_count(self):
        self.focus_body()
        self.type_("alpha beta alpha")
        self.page.keyboard.press("Control+f")
        self.page.fill("#f-q", "alpha")
        self.page.click("#dlg-actions button.primary")
        self.assertEqual(self.page.evaluate("document.getSelection().toString()"), "alpha")
        self.assertEqual(self.page.inner_text("#f-msg"), "2 matches")

    def test_replace_all_changes_model_text(self):
        self.focus_body()
        self.type_("a-b-a")
        self.page.keyboard.press("Control+h")
        self.page.fill("#f-q", "a")
        self.page.fill("#f-r", "X")
        self.page.click("#dlg-actions button:has-text('Replace All')")
        self.assertEqual(self.texts(), ["X-b-X"])

    def test_find_with_no_match_says_so(self):
        self.focus_body()
        self.type_("hello")
        self.page.keyboard.press("Control+f")
        self.page.fill("#f-q", "zzz")
        self.page.click("#dlg-actions button.primary")
        self.assertEqual(self.page.inner_text("#f-msg"), "No matches")


class LayoutAndDesign(QuadraCase):
    def test_paper_size_letter_landscape_changes_model_and_sheet(self):
        self.tab("layout")
        self.page.click("[data-menu=papersize]")
        self.page.click(".menu-item:has-text('Letter')")
        self.page.click("[data-menu=orientation]")
        self.page.click(".menu-item:has-text('Landscape')")
        sec = self.doc()["section"]
        self.assertEqual(sec["size"], "Letter")
        self.assertEqual(sec["orientation"], "landscape")
        width = self.page.evaluate("document.getElementById('sheet').getBoundingClientRect().width / parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--zoom'))")
        self.assertAlmostEqual(width, 792 * 4 / 3, delta=2)

    def test_narrow_margins_change_sheet_padding(self):
        self.tab("layout")
        self.page.click("[data-menu=margins]")
        self.page.click(".menu-item:has-text('Narrow')")
        self.assertEqual(self.doc()["section"]["margins"]["left"], 36)
        self.assertEqual(self.page.evaluate("getComputedStyle(document.getElementById('sheet')).paddingLeft"), "48px")

    def test_columns_two_sets_css_column_count(self):
        self.tab("layout")
        self.page.click("[data-menu=columns]")
        self.page.click(".menu-item:has-text('Two')")
        self.assertEqual(self.doc()["section"]["columns"], 2)
        self.assertEqual(self.page.evaluate("getComputedStyle(document.getElementById('doc-body')).columnCount"), "2")

    def test_watermark_menu_shows_overlay(self):
        self.tab("design")
        self.page.click("[data-menu=watermark]")
        self.page.click(".menu-item:has-text('DRAFT')")
        self.assertEqual(self.doc()["watermark"], "DRAFT")
        self.assertTrue(self.page.locator("#watermark").is_visible())

    def test_theme_applies_font_to_sheet(self):
        self.tab("design")
        self.page.click("[data-menu=theme]")
        self.page.click(".menu-item:has-text('Classic')")
        self.assertIn("Georgia", self.doc()["theme"]["font"])
        self.assertIn("Georgia", self.page.evaluate("getComputedStyle(document.getElementById('sheet')).getPropertyValue('--doc-font')"))


class RegressionRound3(QuadraCase):
    """Bugs reported after the previous round. Each test seeds the state the user actually has."""

    def test_legacy_saved_dark_canvas_does_not_stay_black_in_light_mode(self):
        # An older build saved canvas:'dark'. Light mode must still show a light canvas.
        self.ctx.add_init_script("localStorage.setItem('quadra.prefs.v1', JSON.stringify({theme:'light', canvas:'dark'}))")
        self.page.reload()
        self.page.wait_for_function("window.QuadraEditor && document.querySelectorAll('[role=tab]').length === 10")
        bg = self.page.evaluate("getComputedStyle(document.getElementById('canvas')).backgroundColor")
        self.assertEqual(bg, "rgb(201, 209, 218)")

    def test_profile_panel_icons_are_reference_sized(self):
        self.page.click("#btn-profile")
        w = self.page.evaluate("document.querySelector('.menu.panel .pi .ico').getBoundingClientRect().width")
        self.assertLessEqual(w, 17)

    def test_apps_launcher_icon_tiles_are_reference_sized(self):
        self.page.click("#btn-launcher")
        w = self.page.evaluate("document.querySelector('.app-ico').getBoundingClientRect().width")
        self.assertLessEqual(w, 32)


class ProfileAndApps(QuadraCase):
    def test_profile_panel_shows_name_and_local_profile(self):
        self.page.click("#btn-profile")
        self.assertEqual(self.page.inner_text(".panel-name"), "Quadra User")
        self.assertEqual(self.page.inner_text(".panel-sub"), "Local profile")
        labels = self.page.locator(".menu.panel .pi-label").all_inner_texts()
        self.assertEqual(labels, ["Dark mode", "Options", "Account", "Sign out"])

    def test_dark_mode_item_toggles_theme_and_switch_state(self):
        self.page.click("#btn-profile")
        self.page.click(".pi:has-text('Dark mode')")
        self.assertEqual(self.page.get_attribute("html", "data-theme"), "light")
        self.page.click("#btn-profile")
        self.assertEqual(self.page.get_attribute(".menu.panel .switch", "data-on"), "false")
        self.page.keyboard.press("Escape")
        self.assertTrue(self.page.locator("#menu").is_hidden())

    def test_account_dialog_renames_profile_and_avatar_initials(self):
        self.page.click("#btn-profile")
        self.page.click(".pi:has-text('Account')")
        self.page.fill("#dlg input[type=text]", "Asha Rao")
        self.page.click("#dlg-actions button.primary")
        self.assertEqual(self.page.inner_text("#btn-profile"), "AR")
        stored = json.loads(self.page.evaluate("localStorage.getItem('quadra.profile.v1')"))
        self.assertEqual(stored["name"], "Asha Rao")

    def test_options_save_default_paper_used_by_new_document(self):
        self.page.click("#btn-profile")
        self.page.click(".pi:has-text('Options')")
        self.page.select_option("#dlg select", "Letter")
        self.page.click("#dlg-actions button.primary")
        self.page.click("#tab-file")
        self.page.click("[data-bs=new]")
        self.page.click("#bs-pane button.primary")
        self.assertEqual(self.doc()["section"]["size"], "Letter")

    def test_sign_out_resets_profile_name(self):
        self.page.click("#btn-profile")
        self.page.click(".pi:has-text('Account')")
        self.page.fill("#dlg input[type=text]", "Someone Else")
        self.page.click("#dlg-actions button.primary")
        self.page.click("#btn-profile")
        self.page.click(".pi:has-text('Sign out')")
        self.page.click("#dlg-actions button.primary")
        self.assertEqual(self.page.inner_text("#btn-profile"), "QU")

    def test_apps_launcher_lists_six_apps_with_word_current(self):
        self.page.click("#btn-launcher")
        self.assertEqual(self.page.inner_text(".apps-title"), "Quadra apps")
        names = self.page.locator(".app-tile span:not(.app-ico)").all_inner_texts()
        self.assertEqual(names, ["Excel", "Word", "PowerPoint", "Outlook", "OneDrive", "OneNote"])
        self.assertEqual(self.page.locator(".app-tile.current span:not(.app-ico)").inner_text(), "Word")

    def test_apps_launcher_links_open_in_new_tab(self):
        self.page.click("#btn-launcher")
        tile = self.page.locator(".app-tile", has_text="Excel")
        self.assertEqual(tile.get_attribute("target"), "_blank")
        self.assertIn("excel", tile.get_attribute("href"))


class CanvasAndTyping(QuadraCase):
    def test_canvas_follows_light_theme(self):
        self.page.click("#btn-theme")
        bg = self.page.evaluate("getComputedStyle(document.getElementById('canvas')).backgroundColor")
        self.assertEqual(bg, "rgb(201, 209, 218)")

    def test_canvas_follows_dark_theme_after_switching_back(self):
        self.page.click("#btn-theme")
        self.page.click("#btn-theme")
        bg = self.page.evaluate("getComputedStyle(document.getElementById('canvas')).backgroundColor")
        self.assertEqual(bg, "rgb(16, 19, 22)")

    def test_document_body_has_no_focus_box(self):
        self.focus_body()
        self.type_("x")
        outline = self.page.evaluate("getComputedStyle(document.getElementById('doc-body')).outlineStyle")
        self.assertEqual(outline, "none")

    def test_typing_does_not_rebuild_untouched_paragraphs(self):
        self.focus_body()
        self.type_("first")
        self.page.keyboard.press("Enter")
        self.type_("second")
        before = self.page.evaluate("() => { const e = document.querySelector('#doc-body > p'); e.__marker = 'kept'; return e.__marker; }")
        self.type_(" more")
        after = self.page.evaluate("document.querySelector('#doc-body > p').__marker")
        self.assertEqual(before, "kept")
        self.assertEqual(after, "kept")
        self.assertEqual(self.texts(), ["first", "second more"])


class HomeAndInsertFeatures(QuadraCase):
    """Round 4: every button on the Home and Insert tabs does something real."""

    def test_format_painter_copies_bold_and_applies_to_next_selection(self):
        self.focus_body()
        self.type_("Plain text")
        self.page.keyboard.press("Enter")
        self.type_("Bold text")
        self.page.keyboard.down("Shift")
        for _ in range(9):
            self.page.keyboard.press("ArrowLeft")    # select "Bold text" in paragraph 2
        self.page.keyboard.up("Shift")
        self.page.keyboard.press("Control+b")
        self.tab("home")
        self.page.keyboard.press("Control+End")       # caret at the end of "Bold text"
        self.page.keyboard.down("Shift")
        for _ in range(9):
            self.page.keyboard.press("ArrowLeft")    # select "Bold text" again: the painter source
        self.page.keyboard.up("Shift")
        self.page.click("[data-cmd=format-painter]")
        self.assertTrue(self.page.evaluate("window.QuadraEditor.painterArmed()"))
        self.page.keyboard.press("Control+Home")     # collapse to the start of "Plain text"
        self.assertTrue(self.page.evaluate("window.QuadraEditor.painterArmed()"))  # a caret does not use it
        self.page.keyboard.down("Shift")
        for _ in range(5):
            self.page.keyboard.press("ArrowRight")  # select "Plain"
        self.page.keyboard.up("Shift")               # releasing Shift ends the selection gesture
        self.assertFalse(self.page.evaluate("window.QuadraEditor.painterArmed()"))
        first = self.paras()[0]["runs"]
        self.assertEqual(first[0]["t"], "Plain")
        self.assertTrue(first[0]["f"].get("b"))
        self.assertFalse(first[1]["f"].get("b"))
        self.assertEqual(self.texts(), ["Plain text", "Bold text"])

    def test_format_painter_button_shows_pressed_state_and_toggles_off(self):
        self.focus_body()
        self.type_("abc")
        self.tab("home")
        self.page.click("[data-cmd=format-painter]")
        self.assertEqual(self.page.get_attribute("[data-cmd=format-painter] >> nth=0", "aria-pressed"), "true")
        self.page.click("[data-cmd=format-painter] >> nth=0")
        self.assertEqual(self.page.get_attribute("[data-cmd=format-painter] >> nth=0", "aria-pressed"), "false")

    def test_dictate_without_browser_support_says_so_and_changes_nothing(self):
        self.ctx.add_init_script("window.SpeechRecognition = undefined; window.webkitSpeechRecognition = undefined;")
        self.page.reload()
        self.page.wait_for_function("window.QuadraEditor && document.querySelectorAll('[role=tab]').length === 10")
        self.focus_body()
        self.type_("keep")
        self.tab("home")
        self.page.click("[data-cmd=dictate]")
        self.assertIn("not available here", self.page.inner_text("#dlg-title"))
        self.page.click("#dlg-actions button")
        self.assertEqual(self.texts(), ["keep"])

    def test_dictate_types_recognised_speech_into_the_model(self):
        self.ctx.add_init_script("""
          window.SpeechRecognition = class {
            start() { this._on = true; setTimeout(() => {
              this.onresult({ resultIndex: 0, results: [ { 0: { transcript: 'hello there' }, isFinal: true, length: 1 } ] });
            }, 30); }
            stop() { setTimeout(() => this.onend && this.onend(), 10); }
          };""")
        self.page.reload()
        self.page.wait_for_function("window.QuadraEditor && document.querySelectorAll('[role=tab]').length === 10")
        self.focus_body()
        self.tab("home")
        self.page.click("[data-cmd=dictate]")
        self.assertEqual(self.page.get_attribute("[data-cmd=dictate]", "aria-pressed"), "true")
        self.page.wait_for_function("window.QuadraEditor.getDoc().blocks[0].runs.map(r=>r.t).join('').includes('hello there')")
        self.assertIn("hello there", self.texts()[0])

    def test_editor_lists_problems_and_fix_all_repairs_the_text(self):
        self.focus_body()
        self.type_("hello  world.this is wrong")
        self.tab("home")
        self.page.click("[data-cmd=editor]")
        body = self.page.inner_text("#dlg-body")
        self.assertIn("suggestion", body)
        self.assertIn("More than one space", body)
        self.page.click("#dlg-actions button.primary")
        self.assertEqual(self.texts(), ["Hello world. This is wrong"])

    def test_editor_reports_clean_text_with_no_suggestions(self):
        self.focus_body()
        self.type_("This is clean text.")
        self.tab("home")
        self.page.click("[data-cmd=editor]")
        self.assertIn("No suggestions", self.page.inner_text("#dlg-body"))
        self.assertEqual(self.page.locator("#dlg-actions button:has-text('Fix all')").count(), 0)

    def test_shapes_menu_inserts_an_svg_image_block(self):
        self.focus_body()
        self.tab("insert")
        self.page.click("[data-menu=shapes]")
        self.page.locator(".menu-item:has-text('Ellipse')").click()
        img = [b for b in self.doc()["blocks"] if b["type"] == "img"][0]
        self.assertTrue(img["src"].startswith("data:image/svg+xml"))
        self.assertIn("ellipse", img["src"])
        self.assertEqual(self.page.locator("#doc-body .blk-img img").count(), 1)

    def test_bookmark_is_added_listed_and_reachable(self):
        self.focus_body()
        self.type_("Intro paragraph")
        self.page.keyboard.press("Enter")
        self.type_("Second paragraph")
        self.page.keyboard.press("Control+Home")     # caret on paragraph 1
        self.tab("insert")
        self.page.click("[data-cmd=bookmarks]")
        self.page.fill("#dlg input[type=text]", "intro")
        self.page.click("#dlg-actions button:has-text('Add')")
        self.page.wait_for_function("window.QuadraEditor.getDoc().blocks[0].bm === 'intro'")
        self.assertIn("intro (paragraph 1)", self.page.inner_text("#dlg-body"))
        self.page.fill("#dlg input[type=text]", "1bad")
        self.page.click("#dlg-actions button:has-text('Add')")
        self.assertIn("Start with a letter", self.page.inner_text("#dlg-body"))
        self.page.click("#dlg-actions button:has-text('Close')")
        self.page.keyboard.press("Control+End")       # caret now on paragraph 2
        self.page.wait_for_function("window.QuadraEditor.caretKey() === '1'")
        self.tab("insert")
        self.page.click("[data-cmd=bookmarks]")
        self.page.click("#dlg-body button:has-text('Go to')")
        self.assertEqual(self.page.evaluate("window.QuadraEditor.caretKey()"), "0")

    def test_online_video_inserts_label_and_link(self):
        self.focus_body()
        self.tab("insert")
        self.page.click("[data-cmd=video]")
        self.page.fill("#dlg input[type=url]", "https://example.com/watch?v=1")
        self.page.click("#dlg-actions button.primary")
        self.assertEqual(self.texts(), ["Video: https://example.com/watch?v=1"])
        link_runs = [r for r in self.paras()[0]["runs"] if r["f"].get("link")]
        self.assertEqual(link_runs[0]["f"]["link"], "https://example.com/watch?v=1")

    def test_online_video_rejects_non_web_address(self):
        self.focus_body()
        self.tab("insert")
        self.page.click("[data-cmd=video]")
        self.page.fill("#dlg input[type=url]", "javascript:alert(1)")
        self.page.click("#dlg-actions button.primary")
        self.assertIn("starts with https://", self.page.inner_text("#dlg-body"))
        self.assertEqual(self.texts(), [""])

    def test_new_comment_marks_paragraph_lists_and_deletes(self):
        self.focus_body()
        self.type_("Review this line")
        self.tab("insert")
        self.page.click("[data-cmd=comment]")
        self.page.fill("#dlg textarea", "Check the wording")
        self.page.click("#dlg-actions button:has-text('Add comment')")
        self.assertEqual(len(self.doc()["comments"]), 1)
        self.assertEqual(self.page.locator("#doc-body .para.cmt").count(), 1)
        self.assertIn("Check the wording", self.page.inner_text("#dlg-body"))
        self.page.click("#dlg-body button:has-text('Delete')")
        self.assertEqual(self.doc()["comments"], [])
        self.assertEqual(self.page.locator("#doc-body .para.cmt").count(), 0)

    def test_equation_inserts_superscript_and_symbol(self):
        self.focus_body()
        self.tab("insert")
        self.page.click("[data-cmd=equation]")
        self.page.fill("#dlg input[type=text]", "x^2 + pi")
        self.assertEqual(self.page.locator("#dlg .eq-preview sup").inner_text(), "2")
        self.page.click("#dlg-actions button.primary")
        runs = self.paras()[0]["runs"]
        self.assertEqual(runs[1], {"t": "2", "f": {"sup": True}})
        self.assertIn("π", "".join(r["t"] for r in runs))
        supers = self.page.evaluate("Array.from(document.querySelectorAll('#doc-body span')).filter(s => s.style.verticalAlign === 'super').length")
        self.assertEqual(supers, 1)

class DesignLayoutReferences(QuadraCase):
    """Round 5: Page Borders, Line Numbers, Column Break, Update Table, Footnote, Endnote, Citations."""

    def test_page_borders_dialog_draws_border_on_the_sheet_and_saves_it(self):
        self.tab("design")
        self.page.click("[data-cmd=page-borders] >> nth=0")
        self.page.select_option("#dlg select[aria-label='Border style']", "double")
        self.page.select_option("#dlg select[aria-label='Border width']", "3")
        self.page.click("#dlg-actions button.primary")
        self.assertEqual(self.doc()["section"]["pageBorder"]["style"], "double")
        self.assertEqual(self.page.evaluate("getComputedStyle(document.getElementById('sheet')).borderTopStyle"), "double")
        self.assertEqual(self.page.evaluate("getComputedStyle(document.getElementById('sheet')).borderTopWidth"), "3px")

    def test_page_borders_from_layout_tab_can_remove_the_border(self):
        self.tab("layout")
        self.page.click("[data-cmd=page-borders] >> nth=1")
        self.page.select_option("#dlg select[aria-label='Border style']", "single")
        self.page.click("#dlg-actions button.primary")
        self.assertEqual(self.page.evaluate("getComputedStyle(document.getElementById('sheet')).borderTopStyle"), "solid")
        self.tab("layout")
        self.page.click("[data-cmd=page-borders] >> nth=1")
        self.page.select_option("#dlg select[aria-label='Border style']", "none")
        self.page.click("#dlg-actions button.primary")
        self.assertEqual(self.page.evaluate("getComputedStyle(document.getElementById('sheet')).borderTopStyle"), "none")

    def test_line_numbers_continuous_numbers_the_paragraphs(self):
        self.focus_body()
        self.type_("first")
        self.page.keyboard.press("Enter")
        self.type_("second")
        self.tab("layout")
        self.page.click("[data-menu=linenumbers]")
        self.page.locator(".menu-item:has-text('Continuous')").click()
        self.assertTrue(self.doc()["section"]["lineNumbers"])
        self.assertTrue(self.page.evaluate("document.getElementById('doc-body').classList.contains('lines')"))
        # Chrome reports counter-based content unevaluated, so check the rule is applied to every paragraph.
        content = self.page.evaluate("getComputedStyle(document.querySelectorAll('#doc-body .para')[1], '::after').content")
        self.assertEqual(content, "counter(ln)")

    def test_column_break_inserts_a_block_and_a_visible_marker(self):
        self.focus_body()
        self.type_("left column")
        self.tab("layout")
        self.page.click("[data-menu=breaks]")
        self.page.locator(".menu-item:has-text('Column Break')").click()
        self.assertIn("cb", [b["type"] for b in self.doc()["blocks"]])
        self.assertEqual(self.page.locator("#doc-body .cbreak").count(), 1)

    def test_update_table_of_contents_rebuilds_the_entries(self):
        self.focus_body()
        self.type_("One")
        self.page.click("[data-cmd=style][data-value='Heading 1']")
        self.page.keyboard.press("Enter")
        self.tab("references")
        self.page.click("#panel-references [data-cmd=toc]")
        self.type_("Two")
        self.tab("home")
        self.page.click("[data-cmd=style][data-value='Heading 1']")
        self.tab("references")
        self.page.click("[data-cmd=toc-update]")
        toc = [b for b in self.doc()["blocks"] if b.get("toc")]
        self.assertEqual(["".join(r["t"] for r in b["runs"]) for b in toc], ["One", "Two"])

    def test_update_table_without_a_table_explains_it(self):
        self.focus_body()
        self.type_("plain text")
        self.tab("references")
        self.page.click("[data-cmd=toc-update]")
        self.assertIn("No table of contents", self.page.inner_text("#dlg-title"))

    def test_footnote_adds_reference_mark_and_lists_the_note(self):
        self.focus_body()
        self.type_("Claim here")
        self.tab("references")
        self.page.click("[data-cmd=footnote]")
        self.page.fill("#dlg textarea", "Source text")
        self.page.click("#dlg-actions button.primary")
        self.assertEqual(self.doc()["footnotes"][0]["text"], "Source text")
        self.assertTrue(any(r["f"].get("fn") for r in self.paras()[0]["runs"]))
        self.assertEqual(self.page.locator("#doc-body .fnref").get_attribute("data-label"), "1")
        self.assertIn("Source text", self.page.inner_text("#notes-area"))

    def test_endnote_uses_roman_numerals(self):
        self.focus_body()
        self.type_("End here")
        self.tab("references")
        self.page.click("[data-cmd=endnote]")
        self.page.fill("#dlg textarea", "Last word")
        self.page.click("#dlg-actions button.primary")
        self.assertEqual(self.page.locator("#doc-body .fnref").get_attribute("data-label"), "i")
        self.assertIn("Endnotes", self.page.inner_text("#notes-area"))

    def test_clicking_a_note_number_edits_its_text(self):
        self.focus_body()
        self.type_("Claim")
        self.tab("references")
        self.page.click("[data-cmd=footnote]")
        self.page.fill("#dlg textarea", "Old text")
        self.page.click("#dlg-actions button.primary")
        self.page.click("#doc-body .fnref")
        self.assertEqual(self.page.input_value("#dlg textarea"), "Old text")
        self.page.fill("#dlg textarea", "New text")
        self.page.click("#dlg-actions button.primary")
        self.assertEqual(self.doc()["footnotes"][0]["text"], "New text")
        self.assertIn("New text", self.page.inner_text("#notes-area"))

    def test_citations_add_source_cite_it_and_insert_bibliography(self):
        self.focus_body()
        self.type_("As shown ")
        self.tab("references")
        self.page.click("[data-menu=citations]")
        self.page.locator(".menu-item:has-text('Manage sources')").click()
        self.page.fill("#dlg input[aria-label='Author']", "Rao")
        self.page.fill("#dlg input[aria-label='Title']", "Notes")
        self.page.fill("#dlg input[aria-label='Year']", "2020")
        self.page.click("#dlg-actions button:has-text('Add source')")
        self.assertIn("Rao (2020)", self.page.inner_text("#dlg-body"))
        self.page.click("#dlg-actions button:has-text('Close')")
        self.tab("references")
        self.page.click("[data-menu=citations]")
        self.page.locator(".menu-item:has-text('Cite (Rao, 2020)')").click()
        self.assertIn("(Rao, 2020)", self.texts()[0])
        self.tab("references")
        self.page.click("[data-menu=citations]")
        self.page.locator(".menu-item:has-text('Insert bibliography')").click()
        self.assertIn("Rao. Notes. 2020.", self.texts())


class MailingsReviewViewHelp(QuadraCase):
    """Round 6: tracked changes, accessibility, translate, comments list, reading view, support, feedback, mail merge."""

    def _tracking_on(self):
        self.tab("review")
        self.page.click("[data-menu=tracking]")
        self.page.locator(".menu-item:has-text('Turn on Track Changes')").click()

    def test_track_changes_marks_typed_text_as_inserted_and_underlines_it(self):
        self._tracking_on()
        self.focus_body()
        self.type_("added words")
        runs = self.paras()[0]["runs"]
        self.assertTrue(runs[0]["f"].get("ins"))
        deco = self.page.evaluate("getComputedStyle(document.querySelector('#doc-body span')).textDecorationLine")
        self.assertIn("underline", deco)

    def test_backspace_while_tracking_keeps_the_text_and_marks_it_deleted(self):
        self.focus_body()
        self.type_("keep drop")
        self._tracking_on()
        self.focus_body()
        self.page.keyboard.press("End")
        for _ in range(4):
            self.page.keyboard.press("Backspace")
        self.assertEqual(self.texts(), ["keep drop"])
        deleted = [r for r in self.paras()[0]["runs"] if r["f"].get("del")]
        self.assertEqual(deleted[0]["t"], "drop")
        self.assertEqual(self.page.evaluate("getComputedStyle(document.querySelector('#doc-body span')).textDecorationLine"), "line-through")

    def test_accept_all_removes_deleted_text(self):
        self.focus_body()
        self.type_("keep drop")
        self._tracking_on()
        self.focus_body()
        self.page.keyboard.press("End")
        for _ in range(4):
            self.page.keyboard.press("Backspace")
        self.tab("review")
        self.page.click("[data-menu=tracking]")
        self.page.locator(".menu-item:has-text('Accept All Changes')").click()
        self.assertEqual(self.texts(), ["keep "])

    def test_reject_all_brings_back_deleted_text_and_drops_insertions(self):
        self.focus_body()
        self.type_("keep drop")
        self._tracking_on()
        self.focus_body()
        self.page.keyboard.press("End")
        for _ in range(4):
            self.page.keyboard.press("Backspace")
        self.type_("NEW")
        self.tab("review")
        self.page.click("[data-menu=tracking]")
        self.page.locator(".menu-item:has-text('Reject All Changes')").click()
        self.assertEqual(self.texts(), ["keep drop"])

    def test_track_changes_button_shows_pressed_state(self):
        self.tab("review")
        self.page.click("[data-menu=tracking]")
        self.page.locator(".menu-item:has-text('Turn on Track Changes')").click()
        self.page.wait_for_function("document.querySelector('[data-menu=tracking]').getAttribute('aria-pressed') === 'true'")

    def test_accessibility_check_lists_missing_headings(self):
        self.focus_body()
        self.type_("A body paragraph with no heading at all.")
        self.tab("review")
        self.page.click("[data-cmd=accessibility]")
        self.assertIn("headings", self.page.inner_text("#dlg-body"))

    def test_clicking_a_picture_sets_its_alternative_text(self):
        tmp = pathlib.Path(tempfile.mkdtemp()) / "pixel.png"
        tmp.write_bytes(PNG_1X1)
        self.focus_body()
        self.page.set_input_files("#file-img", str(tmp))
        self.page.wait_for_function("window.QuadraEditor.getDoc().blocks.some(b => b.type === 'img')")
        self.page.click("#doc-body .blk-img img")
        self.page.fill("#dlg input[type=text]", "a red dot")
        self.page.click("#dlg-actions button.primary")
        img = [b for b in self.doc()["blocks"] if b["type"] == "img"][0]
        self.assertEqual(img["alt"], "a red dot")

    def test_translate_opens_google_translate_with_the_text_and_target_language(self):
        self.ctx.add_init_script("window.__opened = []; window.open = (u) => { window.__opened.push(u); return null; };")
        self.page.reload()
        self.page.wait_for_function("window.QuadraEditor && document.querySelectorAll('[role=tab]').length === 10")
        self.focus_body()
        self.type_("good morning")
        self.tab("review")
        self.page.click("[data-cmd=translate]")
        self.page.select_option("#dlg select", "hi")
        self.page.click("#dlg-actions button.primary")
        opened = self.page.evaluate("window.__opened[0]")
        self.assertIn("translate.google.com", opened)
        self.assertIn("tl=hi", opened)
        self.assertIn("good%20morning", opened)

    def test_show_comments_lists_comments_from_the_document(self):
        self.focus_body()
        self.type_("Please check this")
        self.tab("insert")
        self.page.click("[data-cmd=comment]")
        self.page.fill("#dlg textarea", "needs a source")
        self.page.click("#dlg-actions button:has-text('Add comment')")
        self.page.click("#dlg-actions button:has-text('Close')")
        self.tab("review")
        self.page.click("[data-cmd=show-comments]")
        self.assertIn("needs a source", self.page.inner_text("#dlg-body"))
        self.assertIn("Comments (1)", self.page.inner_text("#dlg-title"))

    def test_reading_view_hides_ribbon_and_stops_editing_until_escape(self):
        self.focus_body()
        self.type_("read me")
        self.tab("view")
        self.page.click("[data-cmd=reading]")
        self.assertTrue(self.page.evaluate("document.body.classList.contains('reading')"))
        self.assertFalse(self.page.locator("#ribbon").is_visible())
        self.assertEqual(self.page.get_attribute("#doc-body", "contenteditable"), "false")
        self.page.keyboard.press("Escape")
        self.assertFalse(self.page.evaluate("document.body.classList.contains('reading')"))
        self.assertTrue(self.page.locator("#ribbon").is_visible())
        self.assertEqual(self.page.get_attribute("#doc-body", "contenteditable"), "true")

    def test_multiple_pages_draws_page_guides_at_the_real_page_height(self):
        self.tab("view")
        self.page.click("#view-multi")
        self.assertTrue(self.page.evaluate("document.getElementById('sheet').classList.contains('view-multi')"))
        bg = self.page.evaluate("getComputedStyle(document.getElementById('sheet')).backgroundImage")
        self.assertIn("repeating-linear-gradient", bg)
        self.assertTrue(self.page.evaluate("document.getElementById('sheet').style.getPropertyValue('--page-h')").endswith("px"))

    def test_contact_support_shows_diagnostics_and_copy_button(self):
        self.tab("help")
        self.page.click("[data-cmd=support]")
        body = self.page.inner_text("#dlg-body")
        self.assertIn("Quadra Word v1", body)
        self.assertIn("Browser:", body)
        self.assertEqual(self.page.locator("#dlg-body button:has-text('Copy details')").count(), 1)

    def test_feedback_is_saved_in_this_browser(self):
        self.tab("help")
        self.page.click("[data-cmd=feedback]")
        self.page.select_option("#dlg select", "Bug")
        self.page.fill("#dlg textarea", "the zoom box is slow")
        self.page.click("#dlg-actions button:has-text('Save')")
        stored = json.loads(self.page.evaluate("localStorage.getItem('quadra.feedback.v1')"))
        self.assertEqual(stored[0]["type"], "Bug")
        self.assertEqual(stored[0]["text"], "the zoom box is slow")

    def test_envelopes_insert_sender_and_recipient_lines(self):
        self.focus_body()
        self.tab("mailings")
        self.page.click("[data-cmd=envelopes]")
        self.page.fill("#dlg textarea[aria-label='Sender address']", "Asha Rao\nPatna")
        self.page.fill("#dlg textarea[aria-label='Recipient address']", "Sita Devi\nDelhi")
        self.page.click("#dlg-actions button.primary")
        texts = self.texts()
        self.assertIn("Asha Rao", texts)
        self.assertIn("Sita Devi", texts)
        self.assertIn("Delhi", texts)

    def test_labels_insert_a_grid_table_with_the_texts_in_order(self):
        self.focus_body()
        self.tab("mailings")
        self.page.click("[data-cmd=labels]")
        self.page.fill("#dlg textarea", "A\nB\nC")
        self.page.click("#dlg-actions button.primary")
        tbl = [b for b in self.doc()["blocks"] if b["type"] == "table"][0]
        self.assertEqual(len(tbl["rows"]), 3)
        self.assertEqual(len(tbl["rows"][0]), 2)
        self.assertEqual("".join(r["t"] for r in tbl["rows"][0][1]["paras"][0]["runs"]), "B")
        self.assertEqual("".join(r["t"] for r in tbl["rows"][1][0]["paras"][0]["runs"]), "C")

    def test_mail_merge_fields_preview_and_finish_write_the_letters(self):
        self.focus_body()
        self.tab("mailings")
        self.page.click("[data-cmd=merge-start]")
        self.page.fill("#dlg textarea", "Name,City\nAsha Rao,Patna\nSita Devi,Delhi")
        self.page.click("#dlg-actions button.primary")
        self.assertEqual(self.doc()["merge"]["fields"], ["Name", "City"])
        self.page.click("[data-menu=fields]")
        self.assertEqual(self.page.locator(".menu-item:has-text('City')").count(), 1)
        self.page.keyboard.press("Escape")
        self.focus_body()
        self.type_("Dear ")
        self.page.click("[data-menu=fields]")
        self.page.locator(".menu-item:has-text('Name')").click()
        self.type_(", welcome.")
        self.tab("mailings")
        self.page.click("[data-cmd=merge-preview]")
        self.assertIn("Asha Rao", self.page.get_attribute("#dlg iframe", "srcdoc"))
        self.page.click("#dlg-actions button.primary")
        with self.page.expect_download() as dl:
            self.page.click("[data-cmd=merge-finish]")
        content = pathlib.Path(dl.value.path()).read_text(encoding="utf-8")
        self.assertIn("Dear Asha Rao, welcome.", content)
        self.assertIn("Dear Sita Devi, welcome.", content)


class CaretAfterDialog(QuadraCase):
    def test_caret_move_right_after_closing_a_dialog_is_not_overridden(self):
        self.focus_body()
        self.type_("first line")
        self.page.keyboard.press("Enter")
        self.type_("second line")
        self.page.keyboard.press("Control+Home")
        self.page.wait_for_function("window.QuadraEditor.caretKey() === '0'")
        self.tab("insert")
        self.page.click("[data-cmd=bookmarks]")
        self.page.click("#dlg-actions button:has-text('Close')")
        self.page.keyboard.press("Control+End")      # immediately after closing
        self.page.keyboard.type("!")
        self.assertEqual(self.texts(), ["first line", "second line!"])


class ZoomThemeView(QuadraCase):
    def test_zoom_in_steps_and_persists(self):
        self.page.click("[data-cmd=zoom-in]")
        self.assertEqual(self.page.inner_text("#st-zoom-val"), "110%")
        zoom = self.page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--zoom')")
        self.assertAlmostEqual(float(zoom), 1.1, places=2)
        prefs = json.loads(self.page.evaluate("localStorage.getItem('quadra.prefs.v1')"))
        self.assertEqual(prefs["zoom"], 110)

    def test_zoom_menu_opens_inside_viewport_at_bottom_edge(self):
        self.page.click("#st-zoom-val")
        rect = self.page.evaluate("(() => { const r = document.getElementById('menu').getBoundingClientRect(); return {top: r.top, bottom: r.bottom, h: innerHeight}; })()")
        self.assertGreaterEqual(rect["top"], 0)
        self.assertLessEqual(rect["bottom"], rect["h"])
        self.page.click(".menu-item:has-text('150%')")
        self.assertEqual(self.page.inner_text("#st-zoom-val"), "150%")

    def test_dark_light_switch_changes_theme_attribute(self):
        self.assertEqual(self.page.get_attribute("html", "data-theme"), "dark")
        self.page.click("#btn-theme")
        self.assertEqual(self.page.get_attribute("html", "data-theme"), "light")
        self.assertEqual(self.page.evaluate("getComputedStyle(document.body).backgroundColor") != "", True)

    def test_view_navigation_lists_headings(self):
        self.focus_body()
        self.type_("Chapter One")
        self.page.click("[data-cmd=style][data-value='Heading 1']")
        self.tab("view")
        self.page.click("#panel-view [data-cmd=nav]")
        self.assertTrue(self.page.locator("#nav-pane").is_visible())
        self.assertEqual(self.page.locator("#nav-list button").first.inner_text(), "Chapter One")

    def test_ribbon_collapse_hides_ribbon_body(self):
        self.page.click("#ribbon-toggle")
        self.assertFalse(self.page.locator("#ribbon").is_visible())
        self.page.click("#ribbon-toggle")
        self.assertTrue(self.page.locator("#ribbon").is_visible())


class AutosaveAndFile(QuadraCase):
    def test_pagehide_saves_pending_change_immediately(self):
        self.focus_body()
        self.type_("quick save")
        self.page.evaluate("window.dispatchEvent(new Event('pagehide'))")
        saved = json.loads(self.page.evaluate("localStorage.getItem('quadra.doc.v1')"))
        self.assertIn("quick save", json.dumps(saved))

    def test_autosave_then_reload_restores_document(self):
        self.focus_body()
        self.type_("persist me")
        self.page.wait_for_timeout(700)
        self.page.reload()
        self.page.wait_for_function("window.QuadraEditor && window.QuadraEditor.getDoc().blocks.length >= 1")
        self.assertIn("persist me", " ".join(self.texts()))

    def test_title_bar_name_edit_updates_model_and_status(self):
        self.page.fill("#doc-title", "Board notes")
        self.assertEqual(self.doc()["title"], "Board notes")
        self.assertEqual(self.page.title(), "Board notes - Quadra Word")

    def test_backstage_info_and_new_document(self):
        self.focus_body()
        self.type_("to be cleared")
        self.page.click("#tab-file")
        self.assertTrue(self.page.locator("#backstage").is_visible())
        self.page.click("[data-bs=new]")
        self.page.click("#bs-pane button.btn.primary")
        self.assertEqual(self.texts(), [""])
        self.assertFalse(self.page.locator("#backstage").is_visible())
        versions = json.loads(self.page.evaluate("localStorage.getItem('quadra.versions.v1')"))
        self.assertTrue(any("to be cleared" in v["doc"] for v in versions))

    def test_save_as_json_downloads_file(self):
        self.focus_body()
        self.type_("export me")
        self.page.click("#tab-file")
        self.page.click("[data-bs=save]")
        with self.page.expect_download() as dl:
            self.page.click("#bs-pane button:has-text('Quadra (.json)')")
        self.assertTrue(dl.value.suggested_filename.endswith(".json"))

    def test_open_txt_file_replaces_document_paragraphs(self):
        tmp = pathlib.Path(tempfile.mkdtemp()) / "notes.txt"
        tmp.write_text("line one\nline two\n", encoding="utf-8")
        self.page.click("#tab-file")
        self.page.set_input_files("#bs-pane input[type=file]", str(tmp))
        self.page.wait_for_function("window.QuadraEditor.getDoc().title === 'notes'")
        self.assertEqual(self.texts()[:2], ["line one", "line two"])

    def test_print_button_calls_window_print(self):
        self.page.add_init_script("window.__printCount = 0; window.print = () => { window.__printCount++; };")
        self.page.reload()
        self.page.wait_for_function("window.QuadraEditor")
        self.page.click("#tab-file")
        self.page.click("[data-bs=print]")
        self.page.click("#bs-pane button.primary")
        self.assertEqual(self.page.evaluate("window.__printCount"), 1)


class NotAvailable(QuadraCase):
    def test_spelling_shows_not_available_and_keeps_document(self):
        self.focus_body()
        self.type_("unchanged")
        self.tab("review")
        self.page.click("#panel-review [data-na='Spelling dictionary']")
        self.assertTrue(self.page.locator("#dlg").is_visible())
        self.assertIn("not available in Quadra Word v1", self.page.inner_text("#dlg-body"))
        self.page.click("#dlg-actions button")
        self.assertEqual(self.texts(), ["unchanged"])

    def test_word_count_dialog_matches_model(self):
        self.focus_body()
        self.type_("one two three four")
        self.tab("review")
        self.page.click("#panel-review [data-cmd=word-count]")
        rows = self.page.locator("#dlg table.kv tr")
        self.assertEqual(rows.nth(0).locator("td").nth(1).inner_text(), "4")


if __name__ == "__main__":
    unittest.main(verbosity=2)
