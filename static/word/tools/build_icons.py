#!/usr/bin/env python3
"""Build the Quadra Word icon sprite.

Writes assets/icons.svg and inlines the same <symbol> set into index.html
between the <!-- ICONS:START --> and <!-- ICONS:END --> markers.
All icons are original 24x24 stroke drawings (no Microsoft artwork).
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

# Each value is the inner markup of a 24x24 symbol (stroke = currentColor).
ICONS = {
    "grid": '<circle cx="5" cy="5" r="1.6"/><circle cx="12" cy="5" r="1.6"/><circle cx="19" cy="5" r="1.6"/><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/><circle cx="5" cy="19" r="1.6"/><circle cx="12" cy="19" r="1.6"/><circle cx="19" cy="19" r="1.6"/>',
    "cloud": '<path d="M7 18h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.4 1.5A3.5 3.5 0 0 0 7 18z"/><path d="M9 13l2 2 4-4"/>',
    "moon": '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    "sun": '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    "profile": '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    "undo": '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
    "redo": '<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>',
    "paste": '<rect x="6" y="4" width="12" height="17" rx="2"/><rect x="9" y="2" width="6" height="4" rx="1"/>',
    "cut": '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><path d="M8 8l12 10M8 16L20 6"/>',
    "copy": '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V5a1 1 0 0 1 1-1h11"/>',
    "brush": '<path d="M14 4l6 6-8 8H6v-6z"/><path d="M4 20l3-3"/>',
    "clear": '<path d="M4 20h9M7 16l8-10 4 4-7 8"/><path d="M3 3l18 18"/>',
    "bold": '<path d="M7 4h6a4 4 0 0 1 0 8H7zM7 12h7a4 4 0 0 1 0 8H7z"/>',
    "italic": '<path d="M10 4h8M6 20h8M14 4l-4 16"/>',
    "underline": '<path d="M7 4v7a5 5 0 0 0 10 0V4"/><path d="M5 21h14"/>',
    "strike": '<path d="M4 12h16"/><path d="M16 6.5C15 5 13.5 4 12 4 9 4 7.5 5.5 7.5 7.5c0 4 9 3 9 7.5 0 2-1.5 3.5-4.5 3.5-2 0-3.5-1-4.5-2.5"/>',
    "sub": '<path d="M4 6l8 10M12 6l-8 10"/><path d="M15 19h5M17.5 16v3"/>',
    "sup": '<path d="M4 18L12 8M12 18L4 8"/><path d="M15 11h5M17.5 8v3"/>',
    "highlight": '<path d="M5 19l4-1 9-9-3-3-9 9z"/><path d="M4 22h16"/>',
    "color": '<path d="M12 3l7 13H5z"/><path d="M4 21h16"/>',
    "grow": '<path d="M4 20l5-12 5 12M6.5 14h5"/><path d="M19 4v6M16 7h6"/>',
    "shrink": '<path d="M4 20l5-12 5 12M6.5 14h5"/><path d="M16 7h6"/>',
    "bullets": '<circle cx="5" cy="7" r="1.5"/><circle cx="5" cy="17" r="1.5"/><path d="M10 7h10M10 17h10"/>',
    "numbers": '<path d="M4 6h1v4M4 14h2l-2 3h2"/><path d="M10 7h10M10 17h10"/>',
    "outdent": '<path d="M3 6h18M10 12h11M10 18h11"/><path d="M7 9l-3 3 3 3"/>',
    "indent": '<path d="M3 6h18M10 12h11M10 18h11"/><path d="M4 9l3 3-3 3"/>',
    "al-left": '<path d="M3 6h18M3 10h12M3 14h18M3 18h12"/>',
    "al-center": '<path d="M3 6h18M6 10h12M3 14h18M6 18h12"/>',
    "al-right": '<path d="M3 6h18M9 10h12M3 14h18M9 18h12"/>',
    "al-justify": '<path d="M3 6h18M3 10h18M3 14h18M3 18h18"/>',
    "line": '<path d="M12 4v16M8 8l4-4 4 4M8 16l4 4 4-4"/>',
    "find": '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l6 6"/>',
    "replace": '<circle cx="8" cy="8" r="4"/><path d="M11 11l9 9M16 4h5v5"/>',
    "select": '<path d="M5 3l14 9-6 1-3 6z"/>',
    "mic": '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    "check": '<path d="M5 12l5 5 9-10"/>',
    "link": '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    "table": '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M3 10h18M3 15h18M9 4v16"/>',
    "picture": '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 17l-6-6-8 8"/>',
    "pagebreak": '<path d="M4 4h16M4 20h16"/><path d="M4 12h16" stroke-dasharray="2 2"/>',
    "header": '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 8h16"/>',
    "hash": '<path d="M9 4L7 20M17 4l-2 16M4 9h16M3 15h16"/>',
    "symbol": '<path d="M5 19h14M7 5h10M9 5l-3 14M15 5l3 14"/>',
    "emoji": '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4 4 0 0 0 7 0"/><path d="M9 9h.01M15 9h.01"/>',
    "toc": '<path d="M4 6h10M4 11h14M4 16h10"/><path d="M18 14l2 2-2 2"/>',
    "count": '<path d="M4 7l2-2v12M10 7h10M10 12h10M10 17h10"/>',
    "comment": '<path d="M4 5h16v11H9l-5 4z"/>',
    "track": '<path d="M5 19l2-6 8-8 4 4-8 8z"/><path d="M4 21h16"/>',
    "spell": '<path d="M4 17l4-10 4 10M5.5 13h5"/><path d="M15 9h6M15 14h6M15 19h6"/>',
    "zoom": '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l6 6M8 10.5h5"/>',
    "ruler": '<rect x="2" y="8" width="20" height="8" rx="1"/><path d="M6 8v3M10 8v4M14 8v3M18 8v4"/>',
    "nav": '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M5 8h2M5 12h2"/>',
    "single": '<rect x="6" y="3" width="12" height="18" rx="1.5"/>',
    "multi": '<rect x="2" y="4" width="9" height="16" rx="1"/><rect x="13" y="4" width="9" height="16" rx="1"/>',
    "help": '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7v.5M12 17h.01"/>',
    "keyboard": '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
    "new": '<path d="M6 3h8l4 4v14H6z"/><path d="M12 11v6M9 14h6"/>',
    "open": '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    "save": '<path d="M5 3h11l3 3v13H5z"/><path d="M8 3v5h7V3M8 21v-6h8v6"/>',
    "print": '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
    "rename": '<path d="M4 20h4l10-10-4-4L4 16z"/><path d="M14 6l4 4"/>',
    "history": '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
    "info": '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
    "share": '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6"/>',
    "move": '<path d="M3 7h7l2 2h9v10H3z"/><path d="M9 14h7M13 11l3 3-3 3"/>',
    "delete": '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    "back": '<path d="M15 5l-7 7 7 7"/>',
    "close": '<path d="M6 6l12 12M18 6L6 18"/>',
    "plus": '<path d="M12 5v14M5 12h14"/>',
    "minus": '<path d="M5 12h14"/>',
    "chevron": '<path d="M6 9l6 6 6-6"/>',
    "theme": '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>',
    "design": '<path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-1-1.5-.5-3S16 15 17 15a4 4 0 0 0 0-8c-1.5 0-3 .5-5-4z"/>',
    "margins": '<rect x="5" y="3" width="14" height="18" rx="1"/><rect x="8" y="6" width="8" height="12" stroke-dasharray="2 2"/>',
    "orientation": '<rect x="6" y="3" width="12" height="18" rx="1.5"/><path d="M18 9l3 3-3 3" transform="rotate(0)"/>',
    "page": '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
    "columns": '<rect x="3" y="4" width="8" height="16" rx="1"/><rect x="13" y="4" width="8" height="16" rx="1"/>',
    "watermark": '<path d="M4 20L20 4M7 4l13 13"/><rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="2 3"/>',
    "spacing": '<path d="M4 6h16M4 18h16M12 9v6M9 11l3-3 3 3M9 13l3 3 3-3"/>',
    "fonts": '<path d="M4 19L9 5l5 14M6 14h6"/><path d="M16 9h5M18.5 9v10"/>',
    "accent": '<circle cx="8" cy="9" r="3"/><circle cx="16" cy="9" r="3"/><circle cx="12" cy="16" r="3"/>',
    "fields": '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 10h6M7 14h10"/>',
    "envelope": '<rect x="3" y="6" width="18" height="12" rx="1.5"/><path d="M3 7l9 7 9-7"/>',
    "label": '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 9h8M8 13h5"/>',
    "merge": '<path d="M4 4h16v16H4z"/><path d="M4 12h16M12 4v16"/>',
    "rows": '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M3 12h18"/>',
    "cols": '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M12 4v16"/>',
    "warn": '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>',
    "edit": '<path d="M4 20h4l10-10-4-4L4 16z"/>',
    "cloud-off": '<path d="M7 18h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.4 1.5"/><path d="M3 3l18 18"/>',
    "view": '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    "apps": '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
}

START = "<!-- ICONS:START -->"
END = "<!-- ICONS:END -->"


def build_symbols():
    parts = []
    for name in sorted(ICONS):
        parts.append(
            f'<symbol id="i-{name}" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
            f'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">{ICONS[name]}</symbol>'
        )
    return "".join(parts)


def main():
    symbols = build_symbols()
    sprite = f'<svg xmlns="http://www.w3.org/2000/svg" style="display:none">{symbols}</svg>'

    assets = ROOT / "assets"
    assets.mkdir(exist_ok=True)
    (assets / "icons.svg").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<svg xmlns="http://www.w3.org/2000/svg">' + symbols + "</svg>\n",
        encoding="utf-8",
    )

    index = ROOT / "index.html"
    html = index.read_text(encoding="utf-8")
    if START not in html or END not in html:
        sys.exit("index.html is missing the ICONS markers")
    block = f"{START}\n{sprite}\n{END}"
    html = re.sub(re.escape(START) + r".*?" + re.escape(END), lambda _m: block, html, flags=re.S)
    index.write_text(html, encoding="utf-8")
    print(f"built {len(ICONS)} icons -> assets/icons.svg and index.html")


if __name__ == "__main__":
    main()
