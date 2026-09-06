import { build as esbuild } from 'esbuild';
import { build as vite } from 'vite';
import {mkdir} from 'node:fs/promises';
await mkdir('dist',{recursive:true});
await esbuild({entryPoints:{main:'apps/desktop/src/main/index.ts',preload:'apps/desktop/src/preload/index.ts',worker:'packages/runner/worker.ts'},outdir:'dist',outExtension:{'.js':'.cjs'},bundle:true,platform:'node',format:'cjs',external:['electron','quickjs-emscripten'],sourcemap:true});
await vite({root:'apps/desktop',base:'./',build:{outDir:'../../dist/renderer',emptyOutDir:true,chunkSizeWarningLimit:5000},logLevel:'warn'});
