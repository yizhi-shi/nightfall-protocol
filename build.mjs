import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const result = await build({
  entryPoints: [path.join(root, 'src/main.js')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['chrome100'],
  write: false,
  legalComments: 'none',
  define: { 'process.env.NODE_ENV': '"production"' },
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = fs.readFileSync(path.join(root, 'src/styles.css'), 'utf8');
let html = fs.readFileSync(path.join(root, 'index.template.html'), 'utf8');
html = html.replace('/*__CSS__*/', () => css);
html = html.replace('/*__JS__*/', () => js);
fs.writeFileSync(path.join(root, 'index.html'), html);
const size = fs.statSync(path.join(root, 'index.html')).size;
console.log(`built index.html — ${(size / 1024).toFixed(1)} KiB, js ${(js.length / 1024).toFixed(1)} KiB`);
