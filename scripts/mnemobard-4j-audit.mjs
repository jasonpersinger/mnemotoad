/**
 * Milestone 4J interface audit: screenshots + layout metrics of PATCHBOOK, MOTIF and CANVAS (disposable vault only;
 * read-only — opens the 4F fixture records, changes nothing). Run on the baseline and the final build for before/after.
 * Metrics: where each module's main working surface starts (px from the view top), its height, how many controls are
 * rendered above it, and horizontal overflow, at 1366 and 680 px wide.
 * Usage: node scripts/mnemobard-4j-audit.mjs <label>   → output/mnemobard/milestone-4j/<label>/
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { connect } from './obsidian-cdp.mjs';

const label = process.argv[2] ?? 'run', directory = `output/mnemobard/milestone-4j/${label}`, c = await connect(), q = JSON.stringify;
await mkdir(directory, { recursive: true });
const F = JSON.parse(await readFile('output/mnemobard/milestone-4f/fixture.json', 'utf8'));
const run = async body => c.evaluate(`(async()=>{const s=app.plugins.getPlugin('mnemobard').services,leaf=t=>app.workspace.getLeavesOfType('mnemobard-'+t)[0];${body}})()`);
const pause = ms => new Promise(r => setTimeout(r, ms));
const shot = async name => { await pause(400); const s = await c.command('Page.captureScreenshot', { format: 'png' }); await writeFile(`${directory}/${name}.png`, Buffer.from(s.data, 'base64')); };
const size = async w => { await c.command('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: false }); await pause(400); };
/** Metrics for one view: `surface` = selector of the main working surface. */
const metrics = (type, surface) => run(`const v=leaf('${type}').view,root=v.contentEl,top=root.getBoundingClientRect().top,el=root.querySelector(${q(surface)});root.scrollTop=0;
  const r=el?.getBoundingClientRect(),controls=[...root.querySelectorAll('button,select,input,summary')].filter(e=>{const b=e.getBoundingClientRect();return b.width>0&&r&&b.bottom<=r.top+1;});
  return{surfaceTop:r?Math.round(r.top-top):null,surfaceHeight:r?Math.round(r.height):null,controlsAbove:controls.length,overflowX:Math.max(0,root.scrollWidth-root.clientWidth)};`);
const out = { label, theme: await run(`return app.vault.getConfig?.('theme')??'obsidian';`), metrics: {} };
try {
  await run(`app.changeTheme('obsidian');return 1;`);
  for (const w of [1366, 680]) {
    await size(w);
    await run(`await s.modules.open('patchbook');const v=leaf('patchbook').view;await v.setState({selectedId:${q(F.patch)}});app.workspace.setActiveLeaf(leaf('patchbook'),{focus:true});v.contentEl.scrollTop=0;return 1;`);
    out.metrics[`patchbook-${w}`] = await metrics('patchbook', '.mnemobard-library-detail'); await shot(`patchbook-${w}`);
    await run(`await s.modules.open('motif');const v=leaf('motif').view;await v.setState({selectedId:${q(F.motifA)}});app.workspace.setActiveLeaf(leaf('motif'),{focus:true});v.contentEl.scrollTop=0;return 1;`);
    out.metrics[`motif-${w}`] = await metrics('motif', '.mnemobard-roll-surface'); await shot(`motif-${w}`);
    await run(`await s.modules.open('canvas');const v=leaf('canvas').view;await v.setState({selectedId:${q(F.composition)}});app.workspace.setActiveLeaf(leaf('canvas'),{focus:true});v.contentEl.scrollTop=0;return 1;`);
    out.metrics[`canvas-${w}`] = await metrics('canvas', '.mnemobard-arrangement-surface'); await shot(`canvas-${w}`);
  }
  out.rendererExceptions = c.exceptions;
  await writeFile(`${directory}/metrics.json`, JSON.stringify(out, null, 2) + '\n'); console.log(JSON.stringify(out.metrics));
} finally { await run(`app.changeTheme(${q(out.theme)});return 1;`).catch(() => {}); await size(1440); c.close(); }
