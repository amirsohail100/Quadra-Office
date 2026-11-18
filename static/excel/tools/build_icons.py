#!/usr/bin/env python3
"""
Builds the Quadra Office icon sprite.

Every icon is a 24x24 SVG symbol drawn with simple primitives. The sprite is:
  * written to assets/icons.svg (standalone copy), and
  * injected inline into index.html between the ICON SPRITE markers.

Inline injection matters: browsers block external <use href="file.svg#id">
references when a page is opened from disk, so the symbols live in the page itself.

Usage:  python3 tools/build_icons.py
"""
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
START = "<!-- ICON SPRITE START -->"
END = "<!-- ICON SPRITE END -->"

# name -> inner SVG markup (24x24 grid). Strokes inherit from the <svg class="ic"> element.
ICONS = {
    # ---- Quick access / clipboard / font ----
    "undo": '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
    "redo": '<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>',
    "paste": '<rect x="6" y="5" width="12" height="16" rx="2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h6"/>',
    "cut": '<circle cx="6" cy="17" r="2.5"/><circle cx="6" cy="7" r="2.5"/><path d="M8 15 19 4M8 9l11 11"/>',
    "copy": '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    "painter": '<rect x="4" y="3" width="12" height="6" rx="1"/><path d="M10 9v4h-2v8h4v-8"/><path d="M18 5h2v5"/>',
    "bold": '<text x="12" y="17" text-anchor="middle" font-size="15" font-weight="700" fill="currentColor" stroke="none">B</text>',
    "italic": '<text x="12" y="17" text-anchor="middle" font-size="15" font-style="italic" fill="currentColor" stroke="none">I</text>',
    "underline": '<text x="12" y="15" text-anchor="middle" font-size="15" fill="currentColor" stroke="none">U</text><path d="M6 20h12"/>',
    "fontColor": '<text x="12" y="15" text-anchor="middle" font-size="14" fill="currentColor" stroke="none">A</text><rect x="5" y="18" width="14" height="3" fill="currentColor"/>',
    "fill": '<path d="M5 11 11 5l7 7-6 6z"/><path d="M18 14s-2 2.2-2 3.5a2 2 0 0 0 4 0C20 16.2 18 14 18 14z"/><path d="M3 20h18"/>',
    "borders": '<rect x="3" y="3" width="18" height="18"/><path d="M3 12h18M12 3v18"/>',
    "fontGrow": '<text x="8" y="19" text-anchor="middle" font-size="12" fill="currentColor" stroke="none">A</text><path d="M18 14V5M15 8l3-3 3 3"/>',
    "fontShrink": '<text x="8" y="19" text-anchor="middle" font-size="12" fill="currentColor" stroke="none">A</text><path d="M18 5v9M15 11l3 3 3-3"/>',
    "strike": '<text x="12" y="16" text-anchor="middle" font-size="14" fill="currentColor" stroke="none">ab</text><path d="M3 12h18"/>',

    # ---- Alignment / number ----
    "alignTop": '<path d="M4 4h16"/><path d="M8 20V9M12 20V12M16 20V9"/>',
    "alignMid": '<path d="M4 12h16"/><path d="M8 19V15M8 9V5M12 17v-2M16 19v-4M16 9V5"/>',
    "alignBot": '<path d="M4 20h16"/><path d="M8 4v11M12 4v8M16 4v11"/>',
    "alignLeft": '<path d="M4 6h16M4 10h10M4 14h14M4 18h8"/>',
    "alignCenter": '<path d="M4 6h16M7 10h10M5 14h14M8 18h8"/>',
    "alignRight": '<path d="M4 6h16M10 10h10M6 14h14M12 18h8"/>',
    "indentIn": '<path d="M4 6h16M10 10h10M10 14h10M4 18h16M4 10l3 2-3 2"/>',
    "indentOut": '<path d="M4 6h16M10 10h10M10 14h10M4 18h16M7 10l-3 2 3 2"/>',
    "orient": '<text x="12" y="16" text-anchor="middle" font-size="13" fill="currentColor" stroke="none">ab</text><path d="M18 4l3 3-3 3"/>',
    "wrap": '<path d="M3 7h18M3 12h13a3 3 0 0 1 0 6h-4"/><path d="M13 16l-2 2 2 2"/><path d="M3 17h5"/>',
    "merge": '<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M8 12h8M8 12l2-2M8 12l2 2M16 12l-2-2M16 12l-2 2"/>',
    "currency": '<text x="12" y="17" text-anchor="middle" font-size="15" fill="currentColor" stroke="none">$</text>',
    "percent": '<text x="12" y="17" text-anchor="middle" font-size="15" fill="currentColor" stroke="none">%</text>',
    "comma": '<text x="12" y="17" text-anchor="middle" font-size="15" fill="currentColor" stroke="none">,</text>',
    "decInc": '<text x="9" y="16" text-anchor="middle" font-size="10" fill="currentColor" stroke="none">.0</text><path d="M16 9l3 3-3 3"/><path d="M14 12h5"/>',
    "decDec": '<text x="15" y="16" text-anchor="middle" font-size="10" fill="currentColor" stroke="none">.0</text><path d="M4 12h5"/><path d="M6 9l-3 3 3 3"/>',

    # ---- Styles / cells / editing ----
    "condFormat": '<rect x="3" y="3" width="18" height="18" rx="2"/><rect x="6" y="6" width="5" height="5" fill="currentColor"/><rect x="13" y="6" width="5" height="5"/><rect x="6" y="13" width="5" height="5"/><rect x="13" y="13" width="5" height="5" fill="currentColor"/>',
    "table": '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 9h18M3 14h18M9 4v16"/>',
    "cellStyles": '<rect x="3" y="5" width="18" height="14" rx="2"/><rect x="7" y="9" width="10" height="6" fill="currentColor"/>',
    "insertCells": '<rect x="3" y="4" width="14" height="16" rx="1"/><path d="M19 9v6M16 12h6"/>',
    "deleteCells": '<rect x="3" y="4" width="14" height="16" rx="1"/><path d="M16 12h6"/>',
    "formatCells": '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 9h18M9 9v11"/>',
    "sum": '<text x="12" y="19" text-anchor="middle" font-size="20" fill="currentColor" stroke="none">\u03a3</text>',
    "fillDown": '<path d="M12 3v13M7 11l5 5 5-5"/><path d="M4 21h16"/>',
    "clear": '<path d="M7 17 3 13l9-9 6 6-5 7z"/><path d="M11 21h10"/>',
    "sortAsc": '<path d="M7 4v16M3 16l4 4 4-4"/><path d="M14 6h6M14 11h4M14 16h2"/>',
    "sortDesc": '<path d="M7 20V4M3 8l4-4 4 4"/><path d="M14 18h6M14 13h4M14 8h2"/>',
    "filter": '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
    "find": '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/>',
    "addins": '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',

    # ---- Insert ----
    "pivot": '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 9h18M3 14h18M9 4v16M15 4v16"/><rect x="9" y="9" width="6" height="5" fill="currentColor"/>',
    "forms": '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 9h8M8 13h5"/><circle cx="16" cy="16" r="2"/>',
    "pictures": '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 17l-6-6-8 8"/>',
    "shapes": '<circle cx="9" cy="9" r="5"/><rect x="12" y="12" width="9" height="9" rx="1"/>',
    "checkbox": '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 12l3 3 5-6"/>',
    "chartColumn": '<path d="M4 20h17"/><rect x="5" y="11" width="3" height="9" fill="currentColor"/><rect x="10.5" y="6" width="3" height="14" fill="currentColor"/><rect x="16" y="9" width="3" height="11" fill="currentColor"/>',
    "chartLine": '<path d="M4 20h17M4 4v16"/><path d="M6 16l4-5 3 3 6-7"/>',
    "chartScatter": '<path d="M4 20h17M4 4v16"/><circle cx="8" cy="14" r="1.6" fill="currentColor"/><circle cx="12" cy="9" r="1.6" fill="currentColor"/><circle cx="16" cy="13" r="1.6" fill="currentColor"/><circle cx="19" cy="6" r="1.6" fill="currentColor"/>',
    "chartPie": '<path d="M12 3a9 9 0 1 0 9 9h-9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>',
    "chartBar": '<path d="M4 4v17M4 20h16"/><rect x="5" y="6" width="10" height="3" fill="currentColor"/><rect x="5" y="11" width="13" height="3" fill="currentColor"/><rect x="5" y="16" width="7" height="3" fill="currentColor"/>',
    "chartStat": '<path d="M4 20h17"/><path d="M6 16V10M11 16V6M16 16v-4"/><path d="M3 4h18" opacity=".5"/>',
    "chartCombo": '<path d="M4 20h17"/><rect x="5" y="12" width="3" height="8" fill="currentColor"/><rect x="10.5" y="8" width="3" height="12" fill="currentColor"/><path d="M6 9l5-4 6 5"/>',
    "chartOther": '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 16l3-4 3 2 4-6"/>',
    "slicer": '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 8h10M7 12h10M7 16h6"/>',
    "link": '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    "comment": '<path d="M4 5h16v11H9l-5 4z"/>',
    "commentNew": '<path d="M4 5h16v11H9l-5 4z"/><path d="M12 8v5M9.5 10.5h5"/>',
    "textBox": '<rect x="3" y="4" width="18" height="16" rx="1" stroke-dasharray="3 2"/><text x="12" y="16" text-anchor="middle" font-size="11" fill="currentColor" stroke="none">A</text>',
    "symbol": '<text x="12" y="18" text-anchor="middle" font-size="18" fill="currentColor" stroke="none">\u03a9</text>',

    # ---- Formulas ----
    "fx": '<text x="12" y="17" text-anchor="middle" font-size="15" font-style="italic" fill="currentColor" stroke="none">fx</text>',
    "fxFinance": '<circle cx="12" cy="12" r="9"/><path d="M14.5 8.5c-.5-1-1.6-1.5-2.5-1.5-1.5 0-2.5.8-2.5 2s1 1.7 2.5 2 2.5.8 2.5 2-1 2-2.5 2c-1 0-2-.5-2.5-1.5M12 6v12"/>',
    "fxLogical": '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7"/><circle cx="12" cy="16.5" r=".6" fill="currentColor"/>',
    "fxText": '<text x="12" y="17" text-anchor="middle" font-size="15" fill="currentColor" stroke="none">A</text><rect x="3" y="3" width="18" height="18" rx="2" opacity=".6"/>',
    "fxDate": '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    "fxLookup": '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/><path d="M7.5 10.5h6"/>',
    "fxMath": '<text x="12" y="17" text-anchor="middle" font-size="16" fill="currentColor" stroke="none">\u03c0</text>',
    "fxMore": '<circle cx="6" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="18" cy="12" r="1.5" fill="currentColor"/>',
    "fxRecent": '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    "nameManager": '<path d="M4 6h10a2 2 0 0 1 2 2v10H6a2 2 0 0 1-2-2z"/><path d="M14 6l6 6-6 6"/>',
    "showFormulas": '<text x="12" y="17" text-anchor="middle" font-size="15" font-style="italic" fill="currentColor" stroke="none">fx</text><circle cx="18" cy="16" r="3"/>',
    "calc": '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h2M12 12h2M8 16h2M12 16h2"/>',

    # ---- Data ----
    "dataPicture": '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 17l-6-6-8 8"/>',
    "activity": '<path d="M2 12h4l2-5 4 10 2-5h8"/>',
    "refresh": '<path d="M20 11a8 8 0 1 0-2.3 5.6"/><path d="M20 4v7h-7"/>',
    "queries": '<ellipse cx="10" cy="6" rx="6" ry="3"/><path d="M4 6v12c0 1.7 2.7 3 6 3s6-1.3 6-3V6"/><path d="M4 12c0 1.7 2.7 3 6 3"/>',
    "workbookLinks": '<rect x="3" y="4" width="8" height="6" rx="1"/><rect x="13" y="14" width="8" height="6" rx="1"/><path d="M11 7h2v8h-2"/>',
    "dataTypes": '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 12h8M12 8v8"/>',
    "customSort": '<path d="M5 4v16M2 17l3 3 3-3"/><path d="M13 6h8M13 11h6M13 16h4"/>',
    "dataTools": '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 9h18M9 4v16"/><circle cx="17" cy="16" r="3" fill="currentColor"/>',
    "outline": '<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/><path d="M11 7h4M7 11v4"/>',
    "whatIf": '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7"/><circle cx="12" cy="16.5" r=".6" fill="currentColor"/>',
    "forecast": '<path d="M3 20h18M5 16l5-5 4 3 6-7"/>',

    # ---- Review ----
    "newComment": '<path d="M4 5h16v11H9l-5 4z"/><path d="M12 8v5M9.5 10.5h5"/>',
    "showComments": '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>',
    "prevComment": '<path d="M12 5 5 12l7 7"/><path d="M19 12H6"/>',
    "nextComment": '<path d="M12 5l7 7-7 7"/><path d="M5 12h13"/>',
    "delComment": '<path d="M4 5h16v11H9l-5 4z"/><path d="M9 8l6 5M15 8l-6 5"/>',
    "showChanges": '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 9h18M9 4v16"/><path d="M14 16l2 2 4-4" />',
    "version": '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/><path d="M3 12l2-2 2 2"/>',
    "spelling": '<text x="12" y="10" text-anchor="middle" font-size="8" fill="currentColor" stroke="none">ABC</text><path d="M4 16l4 4 8-9"/>',
    "accessibility": '<circle cx="12" cy="6" r="2"/><path d="M5 9h14M12 9v12M9 21l3-6 3 6"/>',
    "stats": '<path d="M4 20h17M7 16V9M12 16V5M17 16v-4"/>',
    "protect": '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    "pauseProtect": '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M10 15v2M14 15v2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    "notes": '<path d="M4 4h16v12l-4 4H4z"/><path d="M16 20v-4h4"/>',

    # ---- View ----
    "sheetView": '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 9h18"/>',
    "zoom": '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/>',
    "zoom100": '<text x="12" y="15" text-anchor="middle" font-size="9" fill="currentColor" stroke="none">100%</text><rect x="3" y="4" width="18" height="16" rx="2" opacity=".4"/>',
    "newWindow": '<rect x="3" y="4" width="13" height="16" rx="1"/><path d="M19 8v8M15 12h8"/>',
    "freeze": '<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 9h18M9 3v18"/><path d="M3 9h6v6"/>',
    "fullscreen": '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    "navigation": '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5 13 13l-4.5 2.5L11 11z"/>',
    "headings": '<path d="M3 4h18M3 4v16"/><path d="M6 10h4M6 14h4M6 18h4"/>',
    "gridlines": '<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
    "formulaBar": '<rect x="3" y="7" width="18" height="10" rx="1"/><text x="8" y="15" font-size="9" font-style="italic" fill="currentColor" stroke="none">fx</text>',
    "focusCell": '<rect x="3" y="3" width="18" height="18" rx="1"/><rect x="8" y="8" width="8" height="8" rx="1"/>',
    "immersive": '<path d="M4 5h6a3 3 0 0 1 3 3v12a3 3 0 0 0-3-3H4zM20 5h-6a3 3 0 0 0-3 3v12a3 3 0 0 1 3-3h6z"/>',

    # ---- Share / Help / app chrome ----
    "share": '<circle cx="9" cy="8" r="3.5"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M19 8v6M16 11h6"/>',
    "copyLink": '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    "linkSheet": '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 9h18M9 4v16"/>',
    "help": '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>',
    "keyboard": '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
    "whatsNew": '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    "feedback": '<path d="M4 5h16v11H9l-5 4z"/>',
    "file": '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
    "newFile": '<path d="M6 3h8l4 4v14H6z"/><path d="M12 11v6M9 14h6"/>',
    "open": '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    "save": '<path d="M5 3h11l3 3v13H5z"/><rect x="8" y="3" width="7" height="5"/><rect x="8" y="13" width="8" height="6"/>',
    "print": '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><rect x="7" y="14" width="10" height="6"/>',
    "export": '<path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 14v6h14v-6"/>',
    "rename": '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>',
    "info": '<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><circle cx="12" cy="8" r=".8" fill="currentColor"/>',
    "options": '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
    "moon": '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    "sun": '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    "waffle": '<circle cx="5" cy="5" r="2" fill="currentColor"/><circle cx="12" cy="5" r="2" fill="currentColor"/><circle cx="19" cy="5" r="2" fill="currentColor"/><circle cx="5" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="19" cy="12" r="2" fill="currentColor"/><circle cx="5" cy="19" r="2" fill="currentColor"/><circle cx="12" cy="19" r="2" fill="currentColor"/><circle cx="19" cy="19" r="2" fill="currentColor"/>',
    "search": '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/>',
    "cloudSaved": '<path d="M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9a4 4 0 0 0 1 9z"/><path d="M9 13l2 2 4-4"/>',
    "chevDown": '<path d="M6 9l6 6 6-6"/>',
    "chevUp": '<path d="M6 15l6-6 6 6"/>',
    "check": '<path d="M5 12l5 5 9-10"/>',
    "pen": '<path d="M4 20l1-4L16 5l3 3L8 19z"/>',
    "highlighter": '<path d="M5 19h14"/><path d="M9 15l7-9 3 3-6 8z"/><path d="M6 17l3-3"/>',
    "eraser": '<path d="M7 17 3 13l9-9 6 6-5 7z"/><path d="M11 21h10"/>',
    "pointer": '<path d="M6 3l12 8-5 1 3 6-2 1-3-6-4 3z"/>',
    "touch": '<path d="M9 11V5a1.5 1.5 0 0 1 3 0v5"/><path d="M12 10V4a1.5 1.5 0 0 1 3 0v6"/><path d="M15 10V6a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-3l-2-4a1.5 1.5 0 0 1 2.5-1.5L9 13"/>',
    "pencil": '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
    "profile": '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    "theme": '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>',

    # ---- Apps (colored tiles) ----
    "appExcel": '<rect x="2" y="2" width="20" height="20" rx="4" fill="#107c41" stroke="none"/><text x="12" y="16.5" text-anchor="middle" font-size="12" font-weight="700" fill="#fff" stroke="none">X</text>',
    "appWord": '<rect x="2" y="2" width="20" height="20" rx="4" fill="#185abd" stroke="none"/><text x="12" y="16.5" text-anchor="middle" font-size="12" font-weight="700" fill="#fff" stroke="none">W</text>',
    "appPpt": '<rect x="2" y="2" width="20" height="20" rx="4" fill="#c43e1c" stroke="none"/><text x="12" y="16.5" text-anchor="middle" font-size="12" font-weight="700" fill="#fff" stroke="none">P</text>',
    "appOutlook": '<rect x="2" y="2" width="20" height="20" rx="4" fill="#0f6cbd" stroke="none"/><text x="12" y="16.5" text-anchor="middle" font-size="12" font-weight="700" fill="#fff" stroke="none">O</text>',
    "appDrive": '<rect x="2" y="2" width="20" height="20" rx="4" fill="#0364b8" stroke="none"/><circle cx="12" cy="12" r="5" fill="#fff" stroke="none"/>',
    "appNotes": '<rect x="2" y="2" width="20" height="20" rx="4" fill="#7719aa" stroke="none"/><text x="12" y="16.5" text-anchor="middle" font-size="12" font-weight="700" fill="#fff" stroke="none">N</text>',
}


def build_sprite() -> str:
    parts = ['<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">']
    for name in sorted(ICONS):
        parts.append(f'<symbol id="i-{name}" viewBox="0 0 24 24">{ICONS[name]}</symbol>')
    parts.append("</svg>")
    return "".join(parts)


def main() -> None:
    sprite = build_sprite()

    os.makedirs(os.path.join(ROOT, "assets"), exist_ok=True)
    with open(os.path.join(ROOT, "assets", "icons.svg"), "w", encoding="utf-8") as f:
        f.write(sprite)

    index_path = os.path.join(ROOT, "index.html")
    with open(index_path, encoding="utf-8") as f:
        html = f.read()
    block = f"{START}{sprite}{END}"
    pattern = re.compile(re.escape(START) + r".*?" + re.escape(END), re.S)
    if not pattern.search(html):
        raise SystemExit("index.html is missing the ICON SPRITE markers")
    html = pattern.sub(lambda _: block, html, count=1)
    with open(index_path, "w", encoding="utf-8") as f:
        f.write(html)

    print(f"built {len(ICONS)} icons -> assets/icons.svg and index.html")


if __name__ == "__main__":
    main()
