import { context } from 'esbuild';
const watch = process.argv.includes('--watch');
const production = process.argv.includes('--production');
const build = await context({
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
