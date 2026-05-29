import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = String.raw`c:\Users\pc\Downloads\universfield-bubble-pop-06-351337.mp3`;
const dest = path.join(root, 'public', 'sounds', 'bubble-pop.mp3');

if (!fs.existsSync(src)) {
  console.error(`Source missing: ${src}`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.copyFileSync(src, dest);
console.log(`Copied to ${dest} (${fs.statSync(dest).size} bytes)`);
