#!/usr/bin/env node
// Validación rápida: sintaxis de todos los módulos y que los compartidos cargan en Node (como los usa el servidor).
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = [];
const walk = (dir) => {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (f.endsWith('.js')) files.push(p);
  }
};
for (const d of ['src', 'server', 'scripts']) walk(path.join(ROOT, d));
files.push(path.join(ROOT, 'server.js'));

let bad = 0;
for (const f of files) {
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); } catch (e) { bad++; console.error(`✗ ${path.relative(ROOT, f)}\n${e.stderr}`); }
}
for (const m of ['room', 'rules', 'skins', 'mapinfo']) {
  try { await import(path.join(ROOT, 'src/shared', `${m}.js`)); } catch (e) { bad++; console.error(`✗ src/shared/${m}.js no carga en Node: ${e.message}`); }
}
console.log(bad ? `${bad} error(es)` : `OK · ${files.length} archivos`);
process.exit(bad ? 1 : 0);
