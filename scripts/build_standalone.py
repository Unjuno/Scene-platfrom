"""Bundle the independent ES modules + CSS + original sample SVGs as one offline preview.
This is a preview convenience, not a Sites deployment or server app.
"""
from pathlib import Path
import base64
root = Path(__file__).resolve().parents[1] / 'prototype'
html = (root/'index.html').read_text()
css = (root/'styles.css').read_text()
parts=[]
for rel in ['src/machines.mjs','src/domain.mjs','src/storage.mjs','app.mjs']:
    s=(root/rel).read_text()
    if rel == 'app.mjs':
        s='\n'.join(line for line in s.splitlines() if not line.startswith('import '))
    else:
        # The bundle shares lexical definitions in an inline module.
        s=s.replace('export const ', 'const ').replace('export function ','function ').replace('export class ', 'class ')
        s=s.replace('export async function ', 'async function ')
    parts.append(s)
js='\n;\n'.join(parts)
# Preserve import aliases lost when modules are flattened into a single script.
js += '\nconst esc = safeText;\n'
for path in sorted((root/'assets').glob('*.svg')):
    data='data:image/svg+xml;base64,'+base64.b64encode(path.read_bytes()).decode('ascii')
    js=js.replace('assets/'+path.name,data)
assert '</script>' not in js
html=html.replace('<link rel="stylesheet" href="./styles.css">','<style>'+css+'</style>')
html=html.replace('<script type="module" src="./app.mjs"></script>','<script type="module">\n'+js+'\n</script>')
out=Path(__file__).resolve().parents[1] / 'scene-redesign-preview.html'
out.write_text(html)
print('Built:',out,'size:',out.stat().st_size)
