import { context, build as bundle } from 'esbuild';
const watch = process.argv.includes('--watch');
const production = process.argv.includes('--production');
const worker = await bundle({ entryPoints: ['src/midi/worker.ts'], bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2021', minify: true, legalComments: 'inline' });
const workerSource = worker.outputFiles[0]?.text; if (!workerSource) throw Error('MIDI worker bundle missing');
const build = await context({
  define: { __MNEMOBARD_MIDI_WORKER__: JSON.stringify(workerSource) },
  entryPoints: ['src/main.ts'], outfile: 'main.js', bundle: true,
  external: ['obsidian'], platform: 'browser', format: 'cjs', target: 'es2021',
  sourcemap: production ? false : 'inline', minify: production, logLevel: 'info',
  legalComments: 'inline', metafile: true,
});
if (watch) await build.watch();
else {
  const result = await build.rebuild();
  if (result.metafile.outputs['main.js']?.imports.some(i => i.path !== 'obsidian')) {
    throw new Error('Unexpected external runtime import');
  }
  await build.dispose();
}
