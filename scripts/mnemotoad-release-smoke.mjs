/**
 * MNEMOTOAD 0.2.0 release smoke test — the steps of the release brief not already driven by
 * scripts/mnemotoad-rc-workflow.mjs: effects chain, motif reopen + audition, clip reposition, read-only recovery
 * inspection, narrow panes, dark/light themes, settings About (mascot, author, version), canonical mascot in the UI and
 * pixel-exact mascot rendering at 1×/2×/4×/8× on dark and light. Disposable vault only (MNEMOTOAD_DEV_VAULT).
 *   node scripts/mnemotoad-release-smoke.mjs                   (after the workflow's part 1)
 *   node scripts/mnemotoad-release-smoke.mjs --verify-restart  (after a cold restart)
 * Output: output/release-final/smoke/<vault>-{part1,restart}.json + screenshots
 */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { connect } from './obsidian-cdp.mjs';
import { devVaultName } from './dev-target.mjs';

const dir = 'output/release-final/smoke', vault = devVaultName, restart = process.argv.includes('--verify-restart');
await mkdir(dir, { recursive: true });
const c = await connect(), q = JSON.stringify, pause = ms => new Promise(r => setTimeout(r, ms)), stamp = String(Date.now());
const W = JSON.parse(await readFile(`${process.env.MNEMOTOAD_WORKFLOW_DIR ?? 'output/release-final/workflow'}/${vault}-part1.json`, 'utf8'));
const mascot = JSON.parse(await readFile('assets/mascot/mascot.json', 'utf8')), manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
const prefix = `const services=app.plugins.getPlugin('mnemobard').services,leaf=t=>app.workspace.getLeavesOfType('mnemobard-'+t)[0],cv=leaf('canvas')?.view,mv=leaf('motif')?.view,pb=leaf('patchbook')?.view,croot=cv?.contentEl,mroot=mv?.contentEl,proot=pb?.contentEl;
const assert=(v,m)=>{if(!v)throw Error(m);};const click=(text,scope=document)=>{const all=[...scope.querySelectorAll('button')].filter(b=>!b.disabled),b=all.find(b=>b.textContent===text)??all.find(b=>b.textContent.startsWith(text));assert(b,'Missing button '+text);b.click();};
const input=(label,value,scope=document)=>{const e=[...scope.querySelectorAll('input,textarea,select')].find(e=>e.getAttribute('aria-label')===label);assert(e,'Missing control '+label);e.value=value;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));};
const cells=svg=>{const out=[];for(const p of svg?.querySelectorAll('path')??[])for(const m of p.getAttribute('d').matchAll(/M(\\d+) (\\d+)h1v1h-1z/g))out.push(m[1]+','+m[2]+','+p.getAttribute('fill'));return out.sort();};`;
const run = async body => { try { return await c.evaluate(`(globalThis.__rs=(async()=>{${prefix}${body}})())`); } finally { await c.evaluate('delete globalThis.__rs'); } };
const wait = async (test, tries = 600) => { for (let i = 0; i < tries; i++) { if (await run(`return (${test});`)) return; await pause(30); } throw Error('Timed out: ' + test); };
const activate = async t => { await run(`await services.modules.open('${t}');app.workspace.setActiveLeaf(leaf('${t}'),{focus:true});leaf('${t}').view.contentEl.scrollTop=0;`); await pause(300); };
const size = async w => { await c.command('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: false }); await pause(400); };
const shot = async name => { await pause(400); const s = await c.command('Page.captureScreenshot', { format: 'png' }); const path = `${dir}/${name}.png`; await writeFile(path, Buffer.from(s.data, 'base64')); return path; };
const expectedCells = []; mascot.rows.forEach((row, y) => [...row].forEach((k, x) => { if (k !== mascot.transparent) expectedCells.push(`${x},${y},${mascot.palette[k]}`); })); expectedCells.sort();
const sha = t => createHash('sha256').update(t).digest('hex');
async function vaultDigest() { const out = []; const walk = async d => { for (const e of await readdir(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) await walk(p); else out.push(`${p} ${sha(await readFile(p))}`); } }; await walk(`${vault}/MNEMOBARD`); out.sort(); return { files: out.length, digest: sha(out.join('\n')) }; }
const report = { vault, at: new Date().toISOString(), restart, steps: [] };
const step = async (n, title, detail) => { report.steps.push({ step: n, title, detail }); console.log(`✓ ${n} ${title} — ${q(detail).slice(0, 220)}`); await writeFile(`${dir}/${vault}-${restart ? 'restart' : 'part1'}.json`, JSON.stringify(report, null, 2) + '\n'); };
const theme0 = await run(`return app.vault.getConfig?.('theme')??'obsidian';`);

try {
  await c.command('Page.bringToFront'); await size(1366); await run(`app.workspace.leftSplit?.collapse();`);
  const plugin = await run(`const p=app.plugins.getPlugin('mnemobard');return{enabled:app.plugins.enabledPlugins.has('mnemobard'),id:p.manifest.id,name:p.manifest.name,version:p.manifest.version,author:p.manifest.author,exceptionsSoFar:0};`);
  if (plugin.id !== 'mnemobard' || plugin.name !== 'MNEMOTOAD' || plugin.version !== manifest.version || plugin.author !== 'Jason Persinger') throw Error('identity ' + q(plugin));
  if (!restart) {
    await step('1–4', 'Plugin loaded; public name MNEMOTOAD; plugin ID mnemobard', plugin);
    await activate('patchbook');
    const pbMark = await run(`return cells(proot.querySelector('.mnemobard-module-header svg.mnemotoad-mark'));`);
    if (q(pbMark) !== q(expectedCells)) throw Error('PATCHBOOK mark is not B2');
    await step('5–6', 'PATCHBOOK open; header mark is exactly B2 — The Curmudgeon', { cells: pbMark.length });
    // 9: effects chain
    await run(`click('Effects chains',proot);`); await wait(`proot.querySelector('[data-kind="effects-chain"]')?.getAttribute('aria-pressed')==='true'`);
    await run(`click('New record',proot);`); await wait(`!!proot.querySelector('form')`);
    const chain = `Release chain ${stamp}`;
    await run(`input('Name',${q(chain)},proot);click('Add effect',proot);input('Processor 1','Spring reverb',proot);input('Stage 1 parameter notes','Short decay',proot);click('Save record',proot);`);
    await wait(`!proot.querySelector('form')&&services.patchbook.query({kind:'effects-chain'}).some(r=>r.entity.title===${q(chain)})`);
    report.chain = await run(`const r=services.patchbook.query({kind:'effects-chain'}).find(r=>r.entity.title===${q(chain)});return{id:r.entity.id,stages:r.entity.steps?.length??r.entity.stages?.length};`);
    await step('7–9', 'Instrument and patch created by the workflow; effects chain created', { instrument: W.ids.instrument, patch: W.ids.patch, chain: report.chain });
    // 13–14: reopen + audition motif
    await activate('motif'); const notes = await run(`await mv.setState({selectedId:${q(W.ids.motif)}});return 1;`).then(() => wait(`mv.session?.snapshot.id===${q(W.ids.motif)}`)).then(() => run(`return JSON.stringify(mv.session.snapshot.data.notes.map(n=>[n.pitch,n.startTick,n.durationTicks,n.velocity]).sort());`));
    await run(`mv.leaf.detach();`); await activate('motif'); await run(`await leaf('motif').view.setState({selectedId:${q(W.ids.motif)}});`); await wait(`leaf('motif').view.session?.snapshot.id===${q(W.ids.motif)}`);
    const reopened = await run(`return JSON.stringify(mv.session.snapshot.data.notes.map(n=>[n.pitch,n.startTick,n.durationTicks,n.velocity]).sort())===${q(notes)}&&!mv.session.dirty;`);
    await run(`click('Play motif',mroot);`); await wait(`services.musical.state==='playing'`); await pause(500); const pos = await run(`return mroot.querySelector('[aria-label="Musical playback position"]')?.textContent;`);
    await run(`click('Stop motif',mroot);`); await wait(`services.musical.state!=='playing'`);
    if (!reopened) throw Error('motif reopen');
    await step('13–14', 'Motif reopened identical (detached and reopened view); auditioned and stopped', { reopened, position: pos });
    // 20: reposition a clip (then Undo — the saved composition stays as the workflow saved it)
    await activate('canvas'); await run(`await cv.setState({selectedId:${q(W.ids.composition)}});`); await wait(`cv.session?.snapshot.id===${q(W.ids.composition)}`);
    await run(`const lane=cv.session.snapshot.data.lanes[0];cv.select(lane.id,lane.clips[0].id);`); await wait(`!!croot.querySelector('form.mnemobard-canvas-clip-form')`);
    await run(`input('Clip position (bar:beat:tick)','2:1:0',croot);click('Apply clip placement',croot);`); await wait(`cv.session.snapshot.data.lanes[0].clips[0].startTick===3840`);
    const moved = await run(`return{startTick:cv.session.snapshot.data.lanes[0].clips[0].startTick,dirty:cv.session.dirty};`);
    await run(`click('Undo',croot);`); await wait(`cv.session.snapshot.data.lanes[0].clips[0].startTick===0`);
    const undone = await run(`return{startTick:cv.session.snapshot.data.lanes[0].clips[0].startTick,dirty:cv.session.dirty,repeatCount:cv.session.snapshot.data.lanes[0].clips[0].repeatCount};`);
    await step(20, 'Clip repositioned to 2:1:0 (tick 3840), then undone to the saved placement', { moved, undone });
    // 25–26: recovery register, read-only
    const before = await vaultDigest();
    await run(`click('Composition recovery',croot);`); await wait(`!!cv.recoveryPanel&&[...cv.recoveryRoot.querySelectorAll('button.mnemobard-recovery-row')].length>0`);
    await wait(`[...cv.recoveryRoot.querySelectorAll('button.mnemobard-recovery-row')].every(b=>b.dataset.integrity)`);
    await run(`cv.recoveryRoot.querySelector('button.mnemobard-recovery-row').click();`); await wait(`!!cv.recoveryRoot.querySelector('.mnemobard-recovery-summary')`);
    const inspected = await run(`const d=cv.recoveryRoot.querySelector('.mnemobard-recovery-detail');return{count:cv.recoveryRoot.querySelector('.mnemobard-recovery-count').textContent,summary:Object.fromEntries([...d.querySelectorAll('.mnemobard-recovery-summary dt')].map(dt=>[dt.textContent,dt.nextElementSibling?.textContent]))};`);
    await shot('recovery-inspector'); const after = await vaultDigest();
    await run(`click('Close composition recovery',croot);`);
    if (before.digest !== after.digest) throw Error('recovery browsing changed files');
    await step('25–26', 'Recovery register opened; checkpoint inspected; vault byte-identical before and after', { ...inspected, files: after.files });
    // 27: narrow panes
    await size(680); const narrow = {};
    for (const t of ['patchbook', 'motif', 'canvas']) { await activate(t); narrow[t] = await run(`const v=leaf('${t}').view.contentEl,h=v.querySelector('.mnemobard-module-header'),m=h.querySelector('svg').getBoundingClientRect(),i=h.querySelector('.mnemobard-module-identity').getBoundingClientRect();return{overflowX:v.scrollWidth-v.clientWidth,markBeside:Math.abs(m.top-i.top)<30&&m.right<=i.left};`); }
    await size(1366);
    if (Object.values(narrow).some(n => n.overflowX > 0 || !n.markBeside)) throw Error('narrow ' + q(narrow));
    await step(27, 'Narrow pane (680 px): no horizontal overflow; header mark beside the module identity', narrow);
    // 28–29: themes
    const themes = {};
    for (const t of ['obsidian', 'moonstone']) {
      await run(`app.changeTheme(${q(t)});`); await pause(400); await activate('canvas');
      // Focus ring measured as a keyboard user sees it: a real Tab key press (programmatic focus may not match :focus-visible).
      await run(`[...cv.contentEl.querySelectorAll('button')].find(b=>!b.disabled).focus();`);
      for (const type of ['keyDown', 'keyUp']) await c.command('Input.dispatchKeyEvent', { type, key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }); await pause(150);
      themes[t] = await run(`const v=cv.contentEl,cta=[...v.querySelectorAll('button.mod-cta')].find(b=>!b.disabled),f=document.activeElement;const cs=e=>getComputedStyle(e);return{body:document.body.classList.contains('theme-dark')?'dark':'light',primary:cs(cta).backgroundColor+' / '+cs(cta).color,focusVisible:f.matches(':focus-visible'),focus:cs(f).outlineColor,play:cs([...v.querySelectorAll('button')].find(x=>x.textContent==='Play arrangement')).backgroundColor};`);
    }
    await run(`app.changeTheme(${q(theme0)});`);
    if (!themes.obsidian.focusVisible || !themes.moonstone.focusVisible || themes.obsidian.focus !== 'rgb(244, 228, 9)' || themes.moonstone.focus !== 'rgb(128, 26, 134)' || !themes.obsidian.primary.startsWith('rgb(128, 26, 134) / rgb(255, 255, 255)')) throw Error('themes ' + q(themes));
    await step('28–29', 'Dark and light themes: violet primary with white label; focus yellow (dark) / violet (light)', themes);
    // 30–32: settings About (popout window in Obsidian 1.15)
    await run(`app.setting.open();`); await pause(1000); await run(`app.setting.openTabById('mnemobard');`); await pause(1000);
    const about = await run(`const a=app.setting.modalEl.querySelector('.mnemotoad-about'),svg=a?.querySelector('svg');return{text:a?.textContent,label:svg?.getAttribute('aria-label'),width:svg?.getAttribute('width'),b2:JSON.stringify(cells(svg))===${q(q(expectedCells))}};`);
    await run(`app.setting.close();`);
    if (!about.b2 || !about.text.includes(`Version ${manifest.version} · by Jason Persinger · MIT License`) || about.width !== '96') throw Error('about ' + q(about));
    await step('30–32', 'Settings About panel: B2 mascot at 4×, author and version shown', { label: about.label, text: about.text.slice(0, 160) });
    // Rendering: clone the live header mark at 1×/2×/4×/8× on dark and light; compare screenshot pixels to the canonical PNG.
    await activate('patchbook');
    const layout = await run(`document.getElementById('rs-scale')?.remove();const box=document.createElement('div');box.id='rs-scale';box.style.cssText='position:fixed;left:0;top:0;z-index:99999;display:flex;gap:0;padding:0;margin:0';const src=proot.querySelector('.mnemobard-module-header svg.mnemotoad-mark');const out=[];
      for(const bg of ['#1c1c1c','#ffffff'])for(const s of [1,2,4,8]){const cell=document.createElement('div');cell.style.cssText='background:'+bg+';padding:8px;line-height:0';const m=src.cloneNode(true);m.setAttribute('width',String(24*s));m.setAttribute('height',String(24*s));cell.append(m);box.append(cell);}
      document.body.append(box);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));for(const m of box.querySelectorAll('svg')){const r=m.getBoundingClientRect();out.push({x:r.left,y:r.top,w:r.width,bg:m.parentElement.style.background});}return out;`);
    const png = await shot('mascot-scales'); await run(`document.getElementById('rs-scale')?.remove();`);
    const check = spawnSync('python3', ['-I', '-c', `
import json,sys
from PIL import Image
shot=Image.open(sys.argv[1]).convert('RGBA');ref=Image.open(sys.argv[2]).convert('RGBA');res=[]
for t in json.loads(sys.argv[3]):
  s=round(t['w']/24);bg=tuple(int(x) for x in t['bg'][4:-1].split(','))+(255,) if t['bg'].startswith('rgb') else None
  e=Image.new('RGBA',(24,24),bg);e.alpha_composite(ref);e=e.resize((24*s,24*s),Image.NEAREST)
  x,y=round(t['x']),round(t['y']);g=shot.crop((x,y,x+24*s,y+24*s))
  res.append({'scale':s,'bg':t['bg'],'integerPosition':t['x']==x and t['y']==y,'exact':g.tobytes()==e.tobytes()})
print(json.dumps(res))`, png, 'assets/mascot/mnemotoad-mascot.png', q(layout)], { encoding: 'utf8' });
    const scales = JSON.parse(check.stdout || '[]');
    if (scales.length !== 8 || scales.some(s => !s.exact)) throw Error('mascot rendering ' + (check.stderr || q(scales)));
    await step('mascot', 'Mascot renders pixel-exact (equal to the canonical PNG, nearest neighbour) at 1×/2×/4×/8× on dark and light', scales);
  } else {
    const I = W.ids;
    const rel = await run(`await services.index.settled();return{statuses:[${q(I.instrument)},${q(I.patch)},${q(I.motif)},${q(I.composition)},${q(report.chainId ?? '')}].map(id=>id?services.index.locate(id).status:null),chain:services.patchbook.query({kind:'effects-chain'}).filter(r=>r.entity.title.startsWith('Release chain')).length};`);
    const prior = JSON.parse(await readFile(`${dir}/${vault}-part1.json`, 'utf8'));
    const chainOk = await run(`return services.index.locate(${q(prior.chain.id)}).status;`);
    for (const t of ['patchbook', 'motif', 'canvas']) await activate(t);
    const marks = await run(`return ['patchbook','motif','canvas'].map(t=>JSON.stringify(cells(leaf(t).view.contentEl.querySelector('.mnemobard-module-header svg.mnemotoad-mark')))===${q(q(expectedCells))});`);
    if (rel.statuses.slice(0, 4).some(s => s !== 'ready') || chainOk !== 'ready' || marks.some(m => !m)) throw Error('restart ' + q({ rel, chainOk, marks }));
    await step('33–34', 'After a cold restart: plugin 0.2.0 loaded; instrument, patch, effects chain, motif and composition all resolve; B2 mark in all three modules', { ...rel, chain: chainOk, marks, plugin });
  }
  report.rendererExceptions = c.exceptions; await writeFile(`${dir}/${vault}-${restart ? 'restart' : 'part1'}.json`, JSON.stringify(report, null, 2) + '\n');
  if (c.exceptions.length) throw Error('renderer exceptions: ' + q(c.exceptions));
} finally { await run(`app.changeTheme(${q(theme0)});`).catch(() => {}); await c.command('Emulation.clearDeviceMetricsOverride').catch(() => {}); c.close(); }
