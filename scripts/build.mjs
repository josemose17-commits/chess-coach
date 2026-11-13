import { build } from 'esbuild';
import { mkdir, copyFile, writeFile, rm } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist/engine', { recursive: true });
await build({ entryPoints: ['src/app.js'], bundle: true, format: 'esm', minify: true, outfile: 'dist/app.js' });
for (const name of ['index.html', 'style.css', 'pieces.svg']) await copyFile('web/' + name, 'dist/' + name);
for (const name of ['stockfish-18-lite-single.js', 'stockfish-18-lite-single.wasm']) await copyFile('node_modules/stockfish/bin/' + name, 'dist/engine/' + name);
await copyFile('node_modules/stockfish/Copying.txt', 'dist/engine/LICENSE.txt');
await writeFile('dist/engine/SOURCE.txt', 'Stockfish.js 18.0.8 / Stockfish 18, GPL-3.0. Corresponding source and build instructions: https://github.com/nmrugg/stockfish.js/tree/v18.0.8\nPackage: https://www.npmjs.com/package/stockfish/v/18.0.8\n');
