/**
 * MNEMOTOAD 0.2.0 final screenshots 01–14 from the running plugin in the disposable dev vault (read-only: opens the 4F
 * fixture records, opens and closes dialogs, toggles theme and pane width; restores the original theme and sidebars).
 * Screenshot 15 (installed package) is captured in the fresh-install vault. Usage: node scripts/mnemotoad-release-screens.mjs
 * → output/release-final/screenshots/NN-*.png + screens.json
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { connect } from './obsidian-cdp.mjs';

const dir = 'output/release-final/screenshots', c = await connect(), q = JSON.stringify, pause = ms => new Promise(r => setTimeout(r, ms));
await mkdir(dir, { recursive: true });
const F = JSON.parse(await readFile('output/mnemobard/milestone-4f/fixture.json', 'utf8'));
const run = body => c.evaluate(`(async()=>{const s=app.plugins.getPlugin('mnemobard').services,leaf=t=>app.workspace.getLeavesOfType('mnemobard-'+t)[0],click=(t,sc)=>[...sc.querySelectorAll('button')].find(b=>b.textContent===t&&!b.disabled)?.click();${body}})()`);
const size = async w => { await c.command('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: false }); await pause(400); };
const out = { at: new Date().toISOString(), shots: [], theme: await run(`return app.vault.getConfig?.('theme')??'obsidian';`), sidebars: await run(`return{left:app.workspace.leftSplit.collapsed,right:app.workspace.rightSplit.collapsed};`) };
const shot = async name => { await pause(500); const s = await c.command('Page.captureScreenshot', { format: 'png' }); await writeFile(`${dir}/${name}.png`, Buffer.from(s.data, 'base64')); out.shots.push(name); };
const theme = async t => { await run(`app.changeTheme(${q(t)});`); await pause(400); };
const open = async (type, id) => { await run(`await s.modules.open('${type}');const v=leaf('${type}').view;[...v.contentEl.querySelectorAll('button')].find(b=>/^Close (composition|motif) recovery$|^Close recovery register$/.test(b.textContent))?.click();${id ? `await v.setState({selectedId:${q(id)}});` : ''}app.workspace.setActiveLeaf(leaf('${type}'),{focus:true});v.contentEl.scrollTop=0;`); await pause(700); };
const settingsShot = async name => {
  await run(`app.setting.open();`); await pause(1000); await run(`app.setting.openTabById('mnemobard');`); await pause(1000);
  const target = (await (await fetch('http://127.0.0.1:9227/json/list')).json()).find(p => p.type === 'page' && p.url !== 'app://obsidian.md/index.html');
  const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r, { once: true }));
  const data = await new Promise(res => { ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id === 1) res(m.result.data); }); ws.send(JSON.stringify({ id: 1, method: 'Page.captureScreenshot', params: { format: 'png' } })); });
  ws.close(); await writeFile(`${dir}/${name}.png`, Buffer.from(data, 'base64')); out.shots.push(name); await run(`app.setting.close();`); await pause(400);
};
try {
  await run(`app.workspace.leftSplit?.collapse();app.workspace.rightSplit?.collapse();`); await size(1366);
  for (const [t, tag] of [['obsidian', 'dark'], ['moonstone', 'light']]) {
    await theme(t);
    await open('patchbook', F.patch); await shot(`${tag === 'dark' ? '01' : '02'}-patchbook-${tag}`);
    await open('motif', F.motifA); await shot(`${tag === 'dark' ? '03' : '04'}-motif-${tag}`);
    await open('canvas', F.composition); await shot(`${tag === 'dark' ? '05' : '06'}-canvas-${tag}`);
  }
  await theme('obsidian');
  await open('motif', F.motifA); await c.command('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 4, mobile: false }); await pause(500);
  const clip = await run(`const r=leaf('motif').view.contentEl.querySelector('.mnemobard-module-header').getBoundingClientRect();return{x:r.left,y:r.top,width:Math.min(r.width,560),height:r.height,scale:1};`);
  { const s = await c.command('Page.captureScreenshot', { format: 'png', clip }); await writeFile(`${dir}/07-mascot-module-header.png`, Buffer.from(s.data, 'base64')); out.shots.push('07-mascot-module-header (device scale 4: each mascot pixel = 8×8 device pixels)'); }
  await size(1366);
  await settingsShot('08-about-panel');
  await size(680);
  await open('patchbook', F.patch); await shot('09-patchbook-narrow');
  await open('motif', F.motifA); await shot('10-motif-narrow');
  await open('canvas', F.composition); await shot('11-canvas-narrow');
  await size(1366);
  await open('motif', F.motifA); await run(`click('Export MIDI',leaf('motif').view.contentEl);`); await pause(900); await shot('12-midi-export'); await run(`leaf('motif').view.midiDialog?.close();`); await pause(300);
  await open('canvas', F.composition); await run(`leaf('canvas').view.openRecovery();`); await pause(1500); await run(`leaf('canvas').view.recoveryRoot?.scrollIntoView({block:'start'});`); await shot('13-recovery-register');
  await open('canvas', F.composition); const banner = await run(`return !leaf('canvas').view.contentEl.querySelector('.mnemobard-review-banner')?.hidden;`);
  if (banner) { await run(`click('Review changed sources',leaf('canvas').view.contentEl.querySelector('.mnemobard-review-banner'));`); await pause(900); await shot('14-source-revision-warning'); await run(`leaf('canvas').view.reviewModal?.close();`); }
  out.sourceReviewBannerShown = banner; out.rendererExceptions = c.exceptions;
  await writeFile(`${dir}/screens.json`, JSON.stringify(out, null, 2) + '\n'); console.log(JSON.stringify(out));
} finally {
  await run(`app.changeTheme(${q(out.theme)});${out.sidebars.left ? '' : 'app.workspace.leftSplit.expand();'}${out.sidebars.right ? '' : 'app.workspace.rightSplit.expand();'}`).catch(() => {});
  await c.command('Emulation.clearDeviceMetricsOverride').catch(() => {}); c.close();
}
