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
