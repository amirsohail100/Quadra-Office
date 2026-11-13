#!/usr/bin/env python3
"""Builds assets/icons.svg (SVG sprite) and injects it inline into index.html.
Usage: python3 tools/build_icons.py
Every icon is a <symbol id="i-NAME">. Colours come from CSS variables with fallbacks."""
import os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COL = {
    'blue': 'var(--ic-blue,#0f6cbd)', 'green': 'var(--ic-green,#107c10)',
    'orange': 'var(--ic-orange,#d83b01)', 'red': 'var(--ic-red,#c4314b)',
    'gray': 'var(--ic-gray,#8a8a8a)', 'yellow': '#f2c811', 'purple': '#8764b8',
    'black': '#111', 'white': '#fff', 'skin': '#f6d9a0', 'pink': '#d9a7e0',
}
def col(c): return COL.get(c, 'currentColor') if c else 'currentColor'
def fl(f): return col(f) if f else 'none'
def P(d, c=None, f=None): return f'<path d="{d}" style="stroke:{col(c)};fill:{fl(f)}"/>'
def R(x, y, w, h, r=0, c=None, f=None): return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" style="stroke:{col(c)};fill:{fl(f)}"/>'
def C(x, y, r, c=None, f=None): return f'<circle cx="{x}" cy="{y}" r="{r}" style="stroke:{col(c)};fill:{fl(f)}"/>'
def L(x1, y1, x2, y2, c=None): return P(f'M{x1} {y1}L{x2} {y2}', c)
def T(x, y, s, size=10, c=None): return f'<text x="{x}" y="{y}" font-size="{size}" font-family="Segoe UI,Arial,sans-serif" font-weight="700" style="fill:{col(c)};stroke:none" text-anchor="middle">{s}</text>'

STAR = 'm12 3 2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z'
CHAT = 'M4 6h12v9H9l-3 3v-3H4z'
CLOUD = 'M7 18a4 4 0 0 1-.5-8A5.5 5.5 0 0 1 17 8.5 4.5 4.5 0 0 1 17 18H7'
FOLDER = 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'

ICONS = {
 'logo': ('0 0 24 24', R(2,2,20,20,5,'orange','orange') + C(11.5,11.5,5,'white') + L(14.5,14.5,18,18,'white')),
 'cloud-ok': ('0 0 24 24', P(CLOUD) + P('m9.5 13 2 2 3.5-4','green')),
 'cloud-wait': ('0 0 24 24', P(CLOUD) + P('M9.5 13.5h.01M12 13.5h.01M14.5 13.5h.01','orange')),
 'cloud-err': ('0 0 24 24', P(CLOUD) + P('m10 11.5 4 4M14 11.5l-4 4','red')),
 'search': ('0 0 24 24', C(10.5,10.5,6) + L(15,15,20,20)),
 'settings': ('0 0 24 24', C(12,12,3) + C(12,12,7) + P('M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M18.7 5.3l-1.8 1.8M7.1 16.9l-1.8 1.8')),
 'sun': ('0 0 24 24', C(12,12,4) + P('M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1')),
 'moon': ('0 0 24 24', P('M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z')),
 'comment': ('0 0 24 24', P('M4 5h16v11H10l-4 4v-4H4z')),
 'share': ('0 0 24 24', P('M12 15V4M8 8l4-4 4 4M5 12v8h14v-8')),
 'more': ('0 0 24 24', C(5,12,1.4,None,'cur') + C(12,12,1.4,None,'cur') + C(19,12,1.4,None,'cur')),
 'chev-down': ('0 0 24 24', P('m6 9 6 6 6-6')), 'chev-up': ('0 0 24 24', P('m6 15 6-6 6 6')),
 'chev-right': ('0 0 24 24', P('m9 6 6 6-6 6')), 'chev-left': ('0 0 24 24', P('m15 6-6 6 6 6')),
 'panel-left': ('0 0 24 24', R(3,4,18,16,2) + L(9,4,9,20) + P('m16 9-3 3 3 3')),
 'close': ('0 0 24 24', P('M6 6l12 12M18 6 6 18')),
 'check': ('0 0 24 24', P('m5 12.5 4.5 4.5L19 7.5','green')),
 'f-new': ('0 0 24 24', C(12,12,8,'green') + P('M12 8v8M8 12h8','green')),
 'f-open': ('0 0 24 24', P(FOLDER,'orange','yellow')),
 'f-share': ('0 0 24 24', P('M13 4h7v7M20 4l-9 9M10 6H5v13h13v-5','blue')),
 'f-copy': ('0 0 24 24', R(8,3,11,14,2) + P('M5 7v13h10')),
 'f-export': ('0 0 24 24', P('M3 12h12M11 8l4 4-4 4M20 4v16')),
 'f-print': ('0 0 24 24', P('M7 9V4h10v5M7 17H4v-7h16v7h-3','blue') + R(7,14,10,6,1)),
 'f-rename': ('0 0 24 24', R(3,6,12,12,2) + P('M18 5v14M16 5h4M16 19h4')),
 'f-move': ('0 0 24 24', P(FOLDER,'gray') + P('M12 11v5M10 14l2 2 2-2','blue')),
 'f-history': ('0 0 24 24', P('M4 12a8 8 0 1 0 2.5-5.8M4 4v4h4M12 8v4l3 2')),
 'f-info': ('0 0 24 24', C(12,12,8.5) + P('M12 11v6M12 7.5v.01')),
 'undo': ('0 0 24 24', P('M9 5 4 10l5 5M4 10h9a6 6 0 0 1 0 9h-4')),
 'redo': ('0 0 24 24', P('m15 5 5 5-5 5M20 10h-9a6 6 0 0 0 0 9h4')),
 'paste': ('0 0 24 24', R(5,4,14,17,2,'orange') + R(9,2,6,4,1.5,'gray','white') + R(9,10,10,11,1.5,'blue','white')),
 'cut': ('0 0 24 24', C(7,17,3,'blue') + C(17,17,3,'blue') + P('M8.5 14.5 16 3M15.5 14.5 8 3','blue')),
 'copy': ('0 0 24 24', R(8,8,11,13,2) + P('M5 16V5a2 2 0 0 1 2-2h8')),
 'painter': ('0 0 24 24', R(5,3,13,6,1.5,'orange') + P('M9 9v4h6V9M12 13v8','orange')),
 'delete': ('0 0 24 24', P('M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13M10 11v6M14 11v6','red')),
 'slides': ('0 0 24 24', R(3,5,18,12,2,'blue') + P('M8 21h8M12 17v4','gray')),
 'bold': ('0 0 24 24', P('M7 4h6a4 4 0 0 1 0 8H7zM7 12h7a4 4 0 0 1 0 8H7z')),
 'italic': ('0 0 24 24', P('M10 4h8M6 20h8M14 4 10 20')),
 'underline': ('0 0 24 24', P('M7 4v7a5 5 0 0 0 10 0V4M5 21h14')),
 'strike': ('0 0 24 24', P('M17 7a5 3 0 0 0-5-3C8 4 7 6 7 8s2 3 5 4 5 2 5 4-2 4-5 4a5 3 0 0 1-5-3M4 12h16')),
 'sub': ('0 0 24 24', P('m4 5 8 9M12 5l-8 9') + T(18,21,'2',11)),
 'sup': ('0 0 24 24', P('m4 9 8 9M12 9l-8 9') + T(18,9,'2',11)),
 'highlight': ('0 0 24 24', P('m4 14 8-8 6 6-8 8H5zM14 16l6-6','purple') + R(3,20,18,2,0,'yellow','yellow')),
 'fontcolor': ('0 0 24 24', P('M7 16 12 4l5 12M9 12h6') + R(4,19,16,3,0,'red','red')),
 'case': ('0 0 24 24', T(12,17,'Aa',13)),
 'grow': ('0 0 24 24', P('M4 18 9 6l5 12M6 14h6M17 11V4M14 7l3-3 3 3')),
 'shrink': ('0 0 24 24', P('M4 18 9 6l5 12M6 14h6M17 4v7M14 8l3 3 3-3')),
 'clearfmt': ('0 0 24 24', P('M6 4h12M12 4l-3 12M7 20h6') + P('m15 14 5 5M20 14l-5 5','red')),
 'paragraph': ('0 0 24 24', P('M4 6h16M4 11h16M4 16h10M4 21h13','blue')),
 'drawing': ('0 0 24 24', R(3,4,12,10,2,'blue','blue') + C(16,15,5,'orange','orange') + P('M12 20h8')),
 'find': ('0 0 24 24', C(10,10,5.5) + L(14,14,20,20)),
 'replace': ('0 0 24 24', P('M4 7h12l-3-3M20 17H8l3 3','blue')),
 'dictate': ('0 0 24 24', R(9,3,6,12,3,'blue','blue') + P('M5 11a7 7 0 0 0 14 0M12 18v3','blue')),
 'addins': ('0 0 24 24', R(4,4,7,7,1.5,'orange') + R(13,4,7,7,1.5,'orange') + R(4,13,7,7,1.5,'orange') + R(13,13,7,7,1.5,'orange')),
 'designer': ('0 0 24 24', R(4,9,16,12,2,'blue') + P('M10 4l2 3 3-1-1 3','orange') + L(8,14,16,14,'blue')),
 'newslide': ('0 0 24 24', R(3,5,15,11,2,'blue') + C(18,17,5,'green','white') + P('M18 14.5v5M15.5 17h5','green')),
 'textbox': ('0 0 24 24', R(3,4,18,16,1.5,'blue') + P('M8 9V8h8v1M12 8v8M10 16h4')),
 'table': ('0 0 24 24', R(3,4,18,16,1.5,'blue') + P('M3 10h18M3 15h18M9 4v16M15 4v16')),
 'picture': ('0 0 24 24', R(3,4,18,16,2,'blue') + C(8.5,9.5,1.8,'orange') + P('m3 17 5-5 4 4 3-3 6 6','green')),
 'cameo': ('0 0 24 24', R(3,4,18,16,2) + C(12,10,3) + P('M6 19c1-4 11-4 12 0')),
 'video': ('0 0 24 24', R(3,6,12,12,2) + P('m15 10 6-3v10l-6-3')),
 'audio': ('0 0 24 24', P('M4 10v4h4l5 4V6l-5 4zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11')),
 'shapes': ('0 0 24 24', C(9,9,5.5,'blue','blue') + R(11,11,9,9,1.5,'orange','orange')),
 'stock': ('0 0 24 24', R(3,5,16,13,2) + C(17,17,4) + L(20,20,22,22)),
 'icons': ('0 0 24 24', C(8,9,4,'blue','blue') + P('M13 8l4-4 4 4-4 4z','purple','purple') + C(15,17,4,'green','green')),
 'smartart': ('0 0 24 24', P('M3 8l6-5v10l-6-5z','green','green') + R(11,12,10,8,1.5,'blue') + L(14,15,18,15) + L(14,17.5,18,17.5)),
 'chart': ('0 0 24 24', R(4,11,4,9,0,'blue','blue') + R(10,4,4,16,0,'blue','blue') + R(16,8,4,12,0,'blue','blue')),
 'link': ('0 0 24 24', P('M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 10 18.7l1-1')),
 'newcomment': ('0 0 24 24', P(CHAT) + C(18,6,4,'green','white') + P('M18 4v4M16 6h4','green')),
 'footer': ('0 0 24 24', R(4,3,16,18,2,'blue') + R(4,15,16,3,0,'orange','orange')),
 'symbol': ('0 0 24 24', P('M7 20h3v-2a7 7 0 1 1 4 0v2h3')),
 'rect': ('0 0 24 24', R(4,6,16,12,1.5)),
 'oval': ('0 0 24 24', '<ellipse cx="12" cy="12" rx="8.5" ry="6.5" style="stroke:currentColor;fill:none"/>'),
 'line': ('0 0 24 24', L(4,19,20,5)),
 'arrow': ('0 0 24 24', P('M4 19 20 5M12 5h8v8')),
 'select': ('0 0 24 24', P('M6 3v15l4-4 3 6 3-1.5-3-6h6z')),
 'touch': ('0 0 24 24', P('M9 11V5a1.5 1.5 0 0 1 3 0v5h1.5a2 2 0 0 1 2 2v1h1a2 2 0 0 1 2 2v1c0 3-2 5-5 5h-2c-2 0-3-1-4-3l-2-4 2 1z') + P('M16 4c1 .5 2 1.5 2.5 3','red')),
 'lasso': ('0 0 48 48', '<ellipse cx="22" cy="20" rx="14" ry="12" style="stroke:currentColor;fill:none;stroke-dasharray:4 3"/>' + P('M30 30l8 6M22 32c-3 3-3 6 0 7')),
 'pen-eraser': ('0 0 28 56', R(7,2,14,16,1,'black','skin') + R(7,18,14,12,0,'black','black') + R(7,30,14,10,0,'black','pink') + P('M9 40h10l-2 12h-6z','black','white')),
 'pen-black': ('0 0 28 56', R(5,2,18,16,1,'black','black') + P('M5 18h18l-4 18h-10zM11 36l3 16 3-16','black','black')),
 'pen-red': ('0 0 28 56', R(5,2,18,16,1,'black','red') + P('M5 18h18l-4 18h-10z','black','black') + P('M11 36l3 16 3-16','black','red')),
 'pen-hl': ('0 0 28 56', R(5,2,18,16,1,'black','yellow') + P('M5 18h18l-4 20h-10z','black','black') + P('M9 38h10v6l-6 8h-4z','black','yellow')),
 'stencil': ('0 0 28 56', R(4,6,20,44,3) + P('M4 14h8M4 22h8M4 30h8M4 38h8M16 10v36')),
 'layout': ('0 0 24 24', R(3,4,18,16,2,'blue') + L(3,9,21,9,'blue') + R(6,12,12,5,1)),
 'slidesize': ('0 0 24 24', R(3,6,18,12,1.5,'blue') + P('M6 9h2M6 9v2M18 15h-2M18 15v-2','orange')),
 'preview': ('0 0 24 24', R(3,5,14,14,2) + P('M7 5v14M13 5v14') + C(18,17,5,'green','white') + P('m16.5 15 3 2-3 2z','green','green')),
 'tr-none': ('0 0 24 24', R(4,5,16,14,2,'blue','white')),
 'tr-cut': ('0 0 24 24', R(3,3,13,13,1.5,'blue','white') + R(8,8,13,13,1.5,'blue','white')),
 'tr-fade': ('0 0 24 24', R(3,3,13,13,1.5,'blue','white') + R(8,8,13,13,1.5,'blue','blue')),
 'tr-push': ('0 0 24 24', R(3,3,18,18,2,'blue','white') + P('M12 17V8M8 11l4-4 4 4','blue')),
 'tr-wipe': ('0 0 24 24', R(3,3,18,18,2,'blue','white') + P('M17 12H8M11 8l-4 4 4 4','blue')),
 'tr-more': ('0 0 24 24', R(3,3,13,13,1.5,'blue','white') + R(8,8,13,13,1.5,'blue','white') + P('m6 6 4 4','blue')),
 'tr-exist': ('0 0 24 24', R(3,4,18,16,2,'blue','blue') + P('m12 8 1.2 2.6 2.8.3-2.1 1.9.6 2.8L12 14l-2.5 1.6.6-2.8L8 10.9l2.8-.3z','white','white')),
 'an-none': ('0 0 24 24', P(STAR,'green')),
 'an-appear': ('0 0 24 24', P(STAR,'green','green')),
 'an-fade': ('0 0 24 24', P(STAR,'green','white')),
 'an-fly': ('0 0 24 24', P(STAR,'green','white') + P('M3 19h5','green')),
 'options': ('0 0 24 24', R(4,5,16,14,2,'blue') + C(18,18,3,'gray','white')),
 'clock': ('0 0 24 24', C(12,12,8) + P('M12 7v5l3 2')),
 'applyall': ('0 0 24 24', R(3,5,10,8,1.5,'blue') + R(8,9,10,8,1.5,'blue','white') + P('m16 17 2 2 4-4','green')),
 'start': ('0 0 24 24', P('M8 5v14l11-7z','green')),
 'moveup': ('0 0 24 24', P('M12 20V5M6 11l6-6 6 6','blue')),
 'movedown': ('0 0 24 24', P('M12 4v15M6 13l6 6 6-6','blue')),
 'animpane': ('0 0 24 24', R(3,4,18,16,2,'blue') + P('M7 9h7M7 12h10M7 15h5','blue')),
 'fromstart': ('0 0 24 24', R(3,4,18,12,2) + P('M12 16v4M8 20h8') + P('M10 7v6l5-3z','green','green')),
 'fromcurrent': ('0 0 24 24', R(3,4,18,12,2) + P('M12 16v4M8 20h8') + R(6,7,5,6,0.5,'blue') + P('m14 8 3 2-3 2z','green','green')),
 'presenter': ('0 0 24 24', R(3,4,18,13,2,'blue') + R(6,7,5,5,0.5) + L(13,8,18,8) + L(13,11,18,11) + P('M8 21h8M12 17v4')),
 'custom': ('0 0 24 24', R(3,4,18,12,2,'gray') + P('M8 20h8M12 16v4M9 12l6-6','gray')),
 'coach': ('0 0 24 24', R(5,4,14,12,2,'blue') + P('M8 8h8M8 11h5','blue') + R(10,15,4,6,2,'blue','blue')),
 'review': ('0 0 24 24', R(4,4,13,13,2,'gray') + P('M8 9h5M8 12h3','gray') + P('m19 5 .8 1.7 1.7.8-1.7.8L19 10l-.8-1.7-1.7-.8 1.7-.8z','orange','orange')),
 'proofing': ('0 0 24 24', T(12,11,'ABC',8) + P('m4 16 3 3 6-7','green')),
 'access': ('0 0 24 24', C(12,5,2) + P('M5 9h14M12 9v5l-3 6M12 14l3 6') + C(19,18,3.5,'blue','blue')),
 'markread': ('0 0 24 24', R(4,5,16,12,2,'gray') + P('M8 9h8M8 12h5','gray')),
 'changes': ('0 0 24 24', R(4,5,16,12,2,'gray') + C(15,14,3,'gray')),
 'delcomment': ('0 0 24 24', P(CHAT,'gray') + C(18,6,4,'red') + P('m16.5 4.5 3 3M19.5 4.5l-3 3','red')),
 'prevcomment': ('0 0 24 24', P(CHAT,'gray') + C(18,6,4,'blue') + P('M19.5 6h-3M18 4.5 16.5 6 18 7.5','blue')),
 'nextcomment': ('0 0 24 24', P(CHAT,'gray') + C(18,6,4,'blue') + P('M16.5 6h3M18 4.5 19.5 6 18 7.5','blue')),
 'showcomments': ('0 0 24 24', P('M4 5h16v11H10l-4 4v-4H4z')),
 'notes': ('0 0 24 24', P('M5 3h14v11l-6 7H5z') + P('M13 21v-6h6')),
 'ruler': ('0 0 24 24', R(2,8,20,8,1.5) + P('M6 8v3M10 8v4M14 8v3M18 8v4')),
 'sorter': ('0 0 24 24', R(3,4,8,7,1,'orange') + R(13,4,8,7,1,'orange') + R(3,13,8,7,1,'orange') + R(13,13,8,7,1,'orange')),
 'normal': ('0 0 24 24', R(3,4,18,16,2,'blue') + R(5,6,4,12,0.5,'orange') + R(11,6,8,8,0.5) + L(11,16,19,16)),
 'immersive': ('0 0 24 24', R(5,4,10,14,1.5,'gray') + P('M17 9a4 4 0 0 1 0 6M19 7a7 7 0 0 1 0 10','blue')),
 'zoom': ('0 0 24 24', C(10,10,6) + L(14.5,14.5,20,20)),
 'fit': ('0 0 24 24', R(5,6,14,12,1,'blue') + P('M3 8V4h4M21 8V4h-4M3 16v4h4M21 16v4h-4')),
 'viewnormal': ('0 0 24 24', R(3,5,18,14,2) + R(5,7,4,10,0.5) + R(11,7,8,6,0.5)),
 'viewsorter': ('0 0 24 24', R(4,5,6,6,1) + R(14,5,6,6,1) + R(4,14,6,6,1) + R(14,14,6,6,1)),
 'viewshow': ('0 0 24 24', R(3,4,18,12,2) + P('M12 16v4M8 20h8')),
 'help': ('0 0 24 24', C(12,12,8.5) + P('M9.5 9.5a2.6 2.6 0 1 1 3.7 2.4c-.8.4-1.2 1-1.2 1.8M12 17v.01')),
 'support': ('0 0 24 24', P('M5 13v-2a7 7 0 0 1 14 0v2') + R(3,12,4,6,1.5) + R(17,12,4,6,1.5) + P('M19 18c0 2-3 3-6 3')),
 'feedback': ('0 0 24 24', R(10,3,11,8,2) + P('M4 12a3 3 0 1 0 0 .01M2 20c0-3 2-5 5-5s5 2 5 5M13 14h5l2 2')),
 'keyboard': ('0 0 24 24', R(2,6,20,12,2) + P('M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10')),
 'whatsnew': ('0 0 24 24', P('M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4') + P('M18 4l2-2M20 7h2','blue')),
}


def symbol(name, vb, body):
    return (f'<symbol id="i-{name}" viewBox="{vb}" fill="none" stroke="currentColor" '
            f'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">{body}</symbol>')


def build():
    syms = '\n'.join(symbol(n, vb, b) for n, (vb, b) in ICONS.items())
    sprite = f'<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">\n{syms}\n</svg>\n'
    os.makedirs(os.path.join(ROOT, 'assets'), exist_ok=True)
    with open(os.path.join(ROOT, 'assets', 'icons.svg'), 'w', encoding='utf-8') as f:
        f.write(sprite)
    idx = os.path.join(ROOT, 'index.html')
    if os.path.exists(idx):
        html = open(idx, encoding='utf-8').read()
        pat = re.compile(r'<!--ICONS:START-->.*?<!--ICONS:END-->', re.S)
        if not pat.search(html):
            raise SystemExit('index.html is missing ICONS markers')
        html = pat.sub(lambda m: '<!--ICONS:START-->\n' + sprite + '<!--ICONS:END-->', html)
        open(idx, 'w', encoding='utf-8').write(html)
    print(f'{len(ICONS)} icons written')


if __name__ == '__main__':
    build()
