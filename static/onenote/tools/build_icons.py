import re,pathlib
R=pathlib.Path(__file__).resolve().parent.parent
T=lambda c,s=15:f'<text x="12" y="17" font-size="{s}" text-anchor="middle" font-family="Segoe UI,Arial" fill="currentColor" stroke="none">{c}</text>'
I={'bold':T('B'),'italic':T('I'),'underline':T('U'),'strike':T('S'),'sub':T('x₂',11),'hl':T('A'),'color':T('A'),
'plus':'<path d="M12 5v14M5 12h14"/>','doc':'<path d="M6 3h9l4 4v14H6zM15 3v4h4"/>','table':'<path d="M4 5h16v14H4zM4 10h16M4 15h16M10 5v14M15 5v14"/>',
'image':'<path d="M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4"/><circle cx="9" cy="9" r="1.5"/>','link':'<path d="M10 14a4 4 0 0 0 5 0l3-3a4 4 0 0 0-5-5l-1 1M14 10a4 4 0 0 0-5 0l-3 3a4 4 0 0 0 5 5l1-1"/>',
'undo':'<path d="M9 7L4 12l5 5M4 12h10a6 6 0 0 1 0 8"/>','redo':'<path d="M15 7l5 5-5 5M20 12H10a6 6 0 0 0 0 8"/>',
'search':'<circle cx="10" cy="10" r="6"/><path d="M15 15l6 6"/>','grid':'<path d="M5 5h3v3H5zM10 5h3v3h-3zM15 5h3v3h-3zM5 10h3v3H5zM10 10h3v3h-3zM15 10h3v3h-3zM5 15h3v3H5zM10 15h3v3h-3zM15 15h3v3h-3z"/>',
'book':'<path d="M6 3h12v18H6zM6 17h12"/>','sun':'<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>','user':'<circle cx="12" cy="9" r="4"/><path d="M4 21c1-5 15-5 16 0"/>',
'list':'<path d="M9 6h11M9 12h11M9 18h11M4 6h1M4 12h1M4 18h1"/>','num':'<path d="M10 6h10M10 12h10M10 18h10M4 5v3M4 11h2l-2 3h2M4 17h2v2H4"/>','indent':'<path d="M4 6h16M10 12h10M4 18h16M4 9l3 3-3 3"/>','outdent':'<path d="M4 6h16M10 12h10M4 18h16M7 9l-3 3 3 3"/>',
'left':'<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>','center':'<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>','right':'<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>',
'cut':'<circle cx="7" cy="17" r="2.5"/><circle cx="17" cy="17" r="2.5"/><path d="M8 15L17 4M16 15L7 4"/>','copy':'<path d="M8 8h11v13H8zM5 16V3h11"/>','paste':'<path d="M6 5h12v16H6zM9 3h6v4H9z"/>',
'tag':'<path d="M4 4h8l8 8-8 8-8-8z"/><circle cx="8" cy="8" r="1.2"/>','abc':T('abc',10),'pen':'<path d="M4 20l3-1L19 7l-2-2L5 17z"/>','omega':T('Ω',16),'smile':'<circle cx="12" cy="12" r="8"/><path d="M8 14c2 3 6 3 8 0"/>',
'zoom':'<path d="M6 3h9l4 4v14H6zM9 14h6"/>','help':'<circle cx="12" cy="12" r="9"/>'+T('?',12),'clock':'<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>','file':'<path d="M6 3h9l4 4v14H6z"/>','type':'<path d="M5 4l12 8-5 1-2 5z"/>','lines':'<path d="M4 6h16M4 10h16M4 14h16M4 18h16"/>','na':'<circle cx="12" cy="12" r="8"/><path d="M6 18L18 6"/>'}
sp='<svg xmlns="http://www.w3.org/2000/svg" style="display:none">'+''.join(f'<symbol id="i-{k}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">{v}</symbol>' for k,v in I.items())+'</svg>'
(R/'assets/icons.svg').write_text(sp,encoding='utf-8')
h=R/'index.html';t=h.read_text(encoding='utf-8')
h.write_text(re.sub(r'<!--ICONS-->.*?<!--/ICONS-->',lambda m:'<!--ICONS-->'+sp+'<!--/ICONS-->',t,flags=re.S),encoding='utf-8');print('icons',len(I))
