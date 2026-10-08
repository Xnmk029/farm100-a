import {build} from 'esbuild';
await build({entryPoints:['video/single-model-v1/film.ts'],outfile:'video/single-model-v1/public/app.js',bundle:true,platform:'browser',format:'iife',target:'chrome130',sourcemap:true});
