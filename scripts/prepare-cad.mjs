import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('public/vendor/occt', { recursive: true });
for (const file of ['occt-import-js.js', 'occt-import-js.wasm', 'license.occt-import-js.txt', 'license.occt.txt']) {
  await copyFile(`node_modules/occt-import-js/dist/${file}`, `public/vendor/occt/${file}`);
}
