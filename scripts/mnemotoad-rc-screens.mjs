/**
 * MNEMOTOAD release candidate screenshots (prompt §22) from the running plugin in the disposable dev vault. Read-only:
 * opens the 4F fixture records, toggles theme and pane width, and restores the original theme and sidebars.
 * Screenshots 09, 11 and 15 come from the 21-step workflow run (scripts/mnemotoad-rc-workflow.mjs); 12–13 from
 * scripts/mascot-compare.py. Usage: node scripts/mnemotoad-rc-screens.mjs → output/release-candidate/NN-*.png + screens.json
 */
import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { connect } from './obsidian-cdp.mjs';

const dir = 'output/release-candidate', c = await connect(), q = JSON.stringify, pause = ms => new Promise(r => setTimeout(r, ms));
const F = JSON.parse(await readFile('output/mnemobard/milestone-4f/fixture.json', 'utf8'));
const run = body => c.evaluate(`(async()=>{const s=app.plugins.getPlugin('mnemobard').services,leaf=t=>app.workspace.getLeavesOfType('mnemobard-'+t)[0];${body}})()`);
const size = async w => { await c.command('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: false }); await pause(400); };
const shot = async name => { await pause(500); const s = await c.command('Page.captureScreenshot', { format: 'png' }); await writeFile(`${dir}/${name}.png`, Buffer.from(s.data, 'base64')); out.shots.push(name); };
/** Obsidian 1.15 opens Settings in a popout window (its own page target): screenshot that window, then close it. */
const settingsShot = async name => {
  await run(`app.setting.open();`); await pause(1000); await run(`app.setting.openTabById('mnemobard');`); await pause(1000);
  const target = (await (await fetch('http://127.0.0.1:9227/json/list')).json()).find(p => p.type === 'page' && p.url !== 'app://obsidian.md/index.html');
  if (!target) throw Error('Settings window not found');
  const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r, { once: true }));
  const shotData = await new Promise(res => { ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id === 1) res(m.result.data); }); ws.send(JSON.stringify({ id: 1, method: 'Page.captureScreenshot', params: { format: 'png' } })); });
  ws.close(); await writeFile(`${dir}/${name}.png`, Buffer.from(shotData, 'base64')); out.shots.push(name); await run(`app.setting.close();`); await pause(400);
};
const theme = async t => { await run(`app.changeTheme(${q(t)});`); await pause(400); };
const open = async (type, id) => { await run(`await s.modules.open('${type}');[...leaf('${type}').view.contentEl.querySelectorAll('button')].find(b=>/^Close (composition|motif) recovery$|^Close recovery register$/.test(b.textContent))?.click();const v=leaf('${type}').view;${id ? `await v.setState({selectedId:${q(id)}});` : ''}app.workspace.setActiveLeaf(leaf('${type}'),{focus:true});v.contentEl.scrollTop=0;`); await pause(700); };
const out = { at: new Date().toISOString(), shots: [], theme: await run(`return app.vault.getConfig?.('theme')??'obsidian';`), contrast: {} };
/** Computed brand colours actually applied in this theme (for the report's contrast check). */
const measure = () => run(`const v=leaf('canvas').view.contentEl,cta=v.querySelector('button.mod-cta:not(:disabled)'),b=v.querySelector('button:not(.mod-cta)'),cs=e=>e&&getComputedStyle(e);
  b?.focus();const focus=cs(b)?.outlineColor;const sel=v.querySelector('[aria-pressed="true"]');
  return{bodyTheme:document.body.classList.contains('theme-dark')?'dark':'light',background:cs(v).backgroundColor,primaryBg:cs(cta)?.backgroundColor,primaryText:cs(cta)?.color,primaryLabel:cta?.textContent,focusRing:focus,headerRule:cs(v.querySelector('.mnemobard-module-header')).borderBottomColor,selectionShadow:sel?cs(sel).boxShadow:null};`);
try {
  await run(`app.workspace.leftSplit?.collapse();app.workspace.rightSplit?.collapse();`);
  await size(1366);
  for (const t of ['obsidian', 'moonstone']) {
    await theme(t); const tag = t === 'obsidian' ? 'dark' : 'light';
    await settingsShot(t === 'obsidian' ? '01-branding-dark' : '02-branding-light');
    await open('canvas', F.composition); out.contrast[tag] = await measure();
  }
  await theme('obsidian');
  for (const [n, type, id] of [[3, 'patchbook', F.patch], [5, 'motif', F.motifA], [7, 'canvas', F.composition]]) {
    await size(1366); await open(type, id); await shot(`${String(n).padStart(2, '0')}-${type}-wide`);
    await size(680); await open(type, id); await shot(`${String(n + 1).padStart(2, '0')}-${type}-narrow`);
  }
  await size(1366); await theme('moonstone'); await open('canvas', F.composition); await shot('07b-canvas-wide-light'); await open('motif', F.motifA); await shot('05b-motif-wide-light'); await theme('obsidian');
  await open('canvas', F.composition); await run(`leaf('canvas').view.openRecovery();`); await pause(1500); await run(`leaf('canvas').view.recoveryRoot?.scrollIntoView({block:'start'});`); await shot('10-recovery-register');
  await run(`leaf('canvas').view.openRecovery?.();`).catch(() => {});
  await open('patchbook'); await run(`const v=leaf('patchbook').view;await v.setState({selectedId:null});v.contentEl.scrollTop=0;`); await pause(500); await shot('14-mascot-in-interface');
  for (const [from, to] of [['rc-source-review', '09-source-revision-review'], ['rc-export-dialog', '11-midi-export'], ['rc-cross-module-navigation', '15-cross-module-navigation']]) { await copyFile(`${dir}/workflow/${from}.png`, `${dir}/${to}.png`); out.shots.push(`${to} (from workflow/${from})`); }
  out.rendererExceptions = c.exceptions;
  await writeFile(`${dir}/screens.json`, JSON.stringify(out, null, 2) + '\n'); console.log(JSON.stringify(out, null, 1));
} finally { await run(`app.changeTheme(${q(out.theme)});app.workspace.leftSplit?.expand();`).catch(() => {}); await c.command('Emulation.clearDeviceMetricsOverride').catch(() => {}); c.close(); }
