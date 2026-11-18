#!/usr/bin/env python3
"""Builds assets/dict-en.js (spell-check dictionary) from the hunspell en_US files (SCOWL word lists, permissive licence).
Usage: python3 tools/build_dict.py [/usr/share/hunspell]"""
import json, os, sys
src = sys.argv[1] if len(sys.argv) > 1 else '/usr/share/hunspell'
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
aff = open(os.path.join(src, 'en_US.aff'), encoding='utf-8').read()
lines = open(os.path.join(src, 'en_US.dic'), encoding='utf-8').read().split('\n')[1:]
dic = '\n'.join(l.split('\t')[0].split(' ')[0] for l in lines if l.strip())
out = '/* English (US) spelling dictionary: hunspell en_US (SCOWL). Loaded on demand by Review > Proofing. */\n(function(){var d=' + json.dumps({'aff': aff, 'dic': dic}) + ';if(typeof module==="object"&&module.exports)module.exports=d;else window.QDICT=d;})();\n'
open(os.path.join(root, 'assets', 'dict-en.js'), 'w', encoding='utf-8').write(out)
print(len(dic.split('\n')), 'entries,', len(out) // 1024, 'KB')
