#!/usr/bin/env python3
"""Stamp a new version on every CSS/JS reference so phones pick up changes.

Run after editing any file in css/ or js/:   python3 tools/bump_version.py
It rewrites the ?v=... on imports in index.html and js/*.js, and writes
version.json, which open copies of the app check to know when to reload.
"""
import json, pathlib, re, time

root = pathlib.Path(__file__).resolve().parent.parent
version = time.strftime('%Y%m%d%H%M%S')
pattern = re.compile(r"""((?:\./|\.\./|js/|css/)[\w/.-]+\.(?:js|css))(?:\?v=[\w.-]+)?(['"])""")

files = [root / 'index.html', *sorted((root / 'js').glob('*.js'))]
for f in files:
    text = f.read_text()
    new = pattern.sub(lambda m: f"{m.group(1)}?v={version}{m.group(2)}", text)
    if new != text:
        f.write_text(new)
(root / 'version.json').write_text(json.dumps({'version': version}) + '\n')
print('version', version)
