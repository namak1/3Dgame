import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const template = await readFile('index.template.html', 'utf8');
const result = await build({
  entryPoints: ['game.js'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  legalComments: 'none',
  write: false,
});
const bundle = `<script>\n${result.outputFiles[0].text}\n</script>`;
if (!template.includes('<!-- GAME_BUNDLE -->')) throw new Error('Bundle marker is missing from index.template.html');
const html = template.replace('<!-- GAME_BUNDLE -->', bundle);
await writeFile('index.html', html);
await writeFile('Volcano-Island-offline.html', html);
await mkdir('dist', { recursive: true });
await writeFile('dist/index.html', html);
console.log(`Built index.html, Volcano-Island-offline.html, and dist/index.html (${html.length.toLocaleString()} bytes)`);
