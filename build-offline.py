from pathlib import Path
root = Path(__file__).resolve().parent
html = (root / 'index.html').read_text()
for src in ('vendor/three.min.js', 'game.js'):
    code = (root / src).read_text().replace('</script', '<\\/script')
    html = html.replace(f'<script src="{src}"></script>', '<script>\n' + code + '\n</script>')
license_text = (root / 'vendor/THREE-LICENSE.txt').read_text()
html = html.replace('<head>', '<head><!-- Three.js license:\n' + license_text + '\n-->')
(root / 'Blue-Passage-offline.html').write_text(html)
print('Built Blue-Passage-offline.html')
