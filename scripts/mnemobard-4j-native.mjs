/**
 * Real-host Milestone 4J workflow validation (§15 A–E) + screenshots (§18). Disposable vault only (the CDP client refuses any
 * other vault). Creates its own disposable records ("4J Lantern phrase/arrangement <stamp>"), reuses the 4F "Night choir"
 * patch and "Ascending choir" motif and the 4H 10,000-note fixture. Records the original theme and restores it.
 * Usage: node scripts/mnemobard-4j-native.mjs                  (workflows A–E, responsive, keyboard/dialogs, screenshots 01–20)
 *        node scripts/mnemobard-4j-native.mjs --verify-restart (E8: after a cold restart)
 */
import { mkdir, readFile, writeFile, stat, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { connect } from './obsidian-cdp.mjs';

const directory = process.env.MNEMOBARD_4J_DIR ?? 'output/mnemobard/milestone-4j', vaultRoot = 'dev-vault';
await mkdir(directory, { recursive: true });
const restart = process.argv.includes('--verify-restart'), c = await connect(), pause = ms => new Promise(r => setTimeout(r, ms)), q = JSON.stringify, stamp = String(Date.now());
let report = { stamp, checks: [], screenshots: [], observations: {} };
if (restart) report = { ...JSON.parse(await readFile(`${directory}/native-part1.json`, 'utf8')), stamp, checks: [], screenshots: [] };
const prefix = `const plugin=app.plugins.getPlugin('mnemobard'),services=plugin.services,leaf=t=>app.workspace.getLeavesOfType('mnemobard-'+t)[0],cv=leaf('canvas')?.view,mv=leaf('motif')?.view,pb=leaf('patchbook')?.view,croot=cv?.contentEl,mroot=mv?.contentEl,proot=pb?.contentEl,prep=cv?.performancePanel?.preparation,modal=cv?.reviewModal?.contentEl,reg=cv?.recoveryPanel;
const assert=(v,m)=>{if(!v)throw Error(m);};const click=(text,scope=document)=>{const all=[...scope.querySelectorAll('button')].filter(b=>!b.disabled),b=all.find(b=>b.textContent===text)??all.find(b=>b.textContent.startsWith(text));assert(b,'Missing button '+text);b.click();};
const input=(label,value,scope=document)=>{const e=[...scope.querySelectorAll('input,textarea,select')].find(e=>e.getAttribute('aria-label')===label);assert(e,'Missing control '+label);e.value=value;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));};
const rows=s=>[...s.querySelectorAll('button.mnemobard-recovery-row')];const settled=s=>rows(s).every(b=>b.dataset.integrity);const facts=(s,sel)=>Object.fromEntries([...s.querySelectorAll(sel+' dt')].map(dt=>[dt.textContent,dt.nextElementSibling?.textContent]));
const state=()=>croot?.querySelector('.mnemobard-arrangement-state');`;
async function run(body) { try { return await c.evaluate(`(globalThis.__n4j=(async()=>{${prefix}${body}})())`); } finally { await c.evaluate('delete globalThis.__n4j'); } }
async function wait(test, tries = 600) { for (let i = 0; i < tries; i++) { if (await run(`return (${test});`)) return; await pause(30); } throw Error('Timed out: ' + test); }
async function check(step, text) { report.checks.push({ step, text }); console.log('✓', step, text.slice(0, 260)); await writeFile(`${directory}/partial${restart ? '-restart' : ''}.json`, JSON.stringify(report, null, 2) + '\n'); }
async function shot(name, scroll) { if (scroll) await run(`const e=${scroll};e?.scrollIntoView({block:'start'});`); await pause(350); const s = await c.command('Page.captureScreenshot', { format: 'png' }); await writeFile(`${directory}/${name}.png`, Buffer.from(s.data, 'base64')); if (!report.screenshots.includes(name + '.png')) report.screenshots.push(name + '.png'); }
const size = async (width, height = 900) => { await c.command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }); await pause(350); };
const theme = async name => { await run(`app.changeTheme?.(${q(name)});`); await pause(350); };
const activate = async t => { await run(`await services.modules.open('${t}');app.workspace.setActiveLeaf(leaf('${t}'),{focus:true});leaf('${t}').view.contentEl.scrollTop=0;`); await pause(200); };
const sha = text => createHash('sha256').update(text).digest('hex');
const KEYS = { Tab: 9, Escape: 27 }; async function key(name) { for (const type of ['keyDown', 'keyUp']) await c.command('Input.dispatchKeyEvent', { type, key: name, code: name, windowsVirtualKeyCode: KEYS[name] ?? 0 }); await pause(100); }
const verifyMidi = path => { const r = spawnSync('python3', ['scripts/verify-midi.py', `${vaultRoot}/${path}`], { encoding: 'utf8' }); let parsed; try { parsed = JSON.parse(r.stdout); } catch { parsed = undefined; } return { status: r.status, tracks: parsed?.tracks?.length, ppq: parsed?.ppq, noteOns: parsed?.tracks?.flatMap(t => t.events.filter(e => e[1] === 'on')).length }; };
async function vaultDigest() { const out = []; const walk = async dir => { for (const e of await readdir(dir, { withFileTypes: true })) { const p = join(dir, e.name); if (e.isDirectory()) await walk(p); else { const s = await stat(p); out.push(`${p} ${s.size} ${s.mtimeMs}`); } } }; await walk(`${vaultRoot}/MNEMOBARD`); out.sort(); return sha(out.join('\n')); }
/** Layout check of one module view: horizontal overflow and controls outside the view. */
const layout = type => run(`const v=leaf('${type}').view,root=v.contentEl,r=root.getBoundingClientRect();const controls=[...root.querySelectorAll('button,select,input,summary')].filter(e=>e.getBoundingClientRect().width>0&&!e.closest('details:not([open])>:not(summary)'));return{overflowX:Math.max(0,root.scrollWidth-root.clientWidth),outside:controls.filter(e=>{const b=e.getBoundingClientRect();return b.left<r.left-1||b.right>r.right+1;}).map(e=>e.getAttribute('aria-label')??e.textContent).slice(0,5)};`);

try {
  await c.command('Page.bringToFront'); await size(1366);
  report.observations[restart ? 'activeDocumentAtRestart' : 'activeDocumentAtStart'] = await c.evaluate('activeDocument===document?"main":"other"');
  if (!restart) {
    report.originalTheme = await run(`return app.vault.getConfig?.('theme')??'obsidian';`); await theme('obsidian');
    const F = JSON.parse(await readFile('output/mnemobard/milestone-4f/fixture.json', 'utf8')), L = JSON.parse(await readFile('output/mnemobard/milestone-4h/fixture.json', 'utf8'));
    const motifTitle = `4J Lantern phrase ${stamp}`, compTitle = `4J Lantern arrangement ${stamp}`; report.fixture = { patch: F.patch, choir: F.motifA, large10000: L.large10000, motifTitle, compTitle };

    // ── Workflow A: create a motif ──
    await activate('motif'); await run(`click('New motif',mroot);`); await wait(`!!leaf('motif').view.session&&!leaf('motif').view.session.base`);
    await run(`input('Motif name',${q(motifTitle)},mroot);mroot.querySelector('.mnemobard-score-settings').open=true;input('Tempo BPM','96',mroot);input('Meter numerator','3',mroot);input('Meter denominator','4',mroot);click('Apply musical settings',mroot);`);
    await wait(`mv.session.snapshot.data.tempoMicrosecondsPerQuarter===625000&&mv.session.snapshot.data.meter.numerator===3`);
    await run(`for(let i=0;i<4;i++)click('Add note',mroot);`); await wait(`mv.session.snapshot.data.notes.length===4`);
    await run(`const n=mv.session.snapshot.data.notes[1];mv.session.select([n.id]);mv.selectionChanged();input('Pitch','67',mroot);input('Duration ticks','480',mroot);input('Velocity','90',mroot);input('Position (bar:beat:tick)','1:3:0',mroot);click('Apply to primary note',mroot);`);
    report.a = await run(`const n=mv.session.snapshot.data.notes[1];return{note:{pitch:n.pitch,startTick:n.startTick,durationTicks:n.durationTicks,velocity:n.velocity},identity:mroot.querySelector('.mnemobard-note-identity')?.textContent,depth:mroot.querySelector('.mnemobard-history-depth').textContent};`);
    const edited = q(report.a.note);
    await run(`click('Undo',mroot);`); report.a.undo = await run(`const n=mv.session.snapshot.data.notes[1];return n.pitch!==67||n.velocity!==90;`);
    await run(`click('Redo',mroot);`); report.a.redo = await run(`const n=mv.session.snapshot.data.notes[1];return JSON.stringify({pitch:n.pitch,startTick:n.startTick,durationTicks:n.durationTicks,velocity:n.velocity})===${q(edited)};`);
    await run(`click('Play motif',mroot);`); await wait(`services.musical.state==='playing'`); report.a.played = await run(`const p=mroot.querySelector('[aria-label="Musical playback position"]').textContent;click('Stop motif',mroot);return p;`);
    await run(`click('Save motif',mroot);`); await wait(`!mv.session.dirty&&mv.session.status==='Saved'`); const motifId = await run(`return mv.session.snapshot.id;`); report.fixture.motif = motifId;
    await shot('04-motif-workspace');
    await run(`const n=mv.session.snapshot.data.notes[1];mv.session.select([n.id]);mv.selectionChanged();`); await shot('05-motif-selected-note', `mroot.querySelector('.mnemobard-note-inspector')`);
    await run(`mroot.querySelector('.mnemobard-transforms').open=true;`); await shot('06-motif-transformations', `mroot.querySelector('.mnemobard-motif-toolbar')`); await run(`mroot.querySelector('.mnemobard-transforms').open=false;`);
    const savedNotes = await run(`return JSON.stringify(mv.session.snapshot.data.notes);`);
    await run(`mv.leaf.detach();`); await activate('motif'); await run(`await leaf('motif').view.setState({selectedId:${q(motifId)}});`); await wait(`leaf('motif').view.session?.snapshot.id===${q(motifId)}`);
    report.a.reopened = await run(`return JSON.stringify(mv.session.snapshot.data.notes)===${q(savedNotes)}&&!mv.session.dirty;`);
    await run(`click('Export MIDI',mroot);`); await wait(`!!mv.midiDialog?.contentEl.querySelector('[aria-label="New vault MIDI destination"]')`);
    report.a.dialogFocus = await run(`const m=mv.midiDialog;return{inside:m.containerEl.contains(document.activeElement)||m.modalEl?.contains(document.activeElement)};`);
    report.a.export = `MNEMOBARD/Exports/4j-motif-${stamp}.mid`;
    await run(`const d=mv.midiDialog.contentEl;input('New vault MIDI destination',${q(report.a.export)},d);click('Create MIDI file',d);`); await wait(`mv.midiDialog.contentEl.textContent.includes('Export created:')`, 600);
    await key('Escape'); report.a.escapeClosed = await run(`return !mv.midiDialog?.containerEl?.isConnected;`);
    report.a.midi = verifyMidi(report.a.export);
    if (!report.a.undo || !report.a.redo || !report.a.reopened || report.a.midi.status !== 0 || report.a.midi.noteOns !== 4 || report.a.midi.ppq !== 960 || !report.a.escapeClosed) throw Error('Workflow A ' + q(report.a));
    await check('A1–10', `New motif “${motifTitle}”: 96 BPM 3/4 applied; 4 notes added; primary note edited ${edited} (${report.a.identity}); undo/redo exact; played (“${report.a.played}”) and stopped; saved; reopened identical; exported and independently verified (${q(report.a.midi)}); export dialog focus inside: ${report.a.dialogFocus.inside}; Escape closed it`);

    // ── Workflow B: connect PATCHBOOK ──
    await activate('patchbook'); await run(`input('Search register','',proot);await pb.setState({selectedId:${q(F.patch)}});`); await wait(`pb.currentSession?.snapshot.id===${q(F.patch)}`);
    await shot('01-patchbook-library');
    report.b = await run(`const d=proot.querySelector('.mnemobard-library-detail');return{title:d.querySelector('h2,h3')?.textContent,text:d.textContent.includes('Modular voice')&&d.textContent.includes('Tape and plate')};`);
    await run(`click('Edit record',proot);`); await wait(`!!proot.querySelector('.mnemobard-library-detail form')`); await shot('02-patchbook-record-editor');
    await run(`click('Keep draft & close form',proot);`); await wait(`!proot.querySelector('.mnemobard-library-detail form')`);
    await activate('motif'); await run(`await mv.setState({selectedId:${q(motifId)}});`); await wait(`mv.session?.snapshot.id===${q(motifId)}`);
    await run(`mroot.querySelector('.mnemobard-motif-patch').open=true;input('Find PATCHBOOK patch','Night choir',mroot);input('Choose active patch',${q(F.patch)},mroot);click('Associate chosen patch',mroot);`); await wait(`mv.session.snapshot.patchId===${q(F.patch)}`);
    await run(`click('Save motif',mroot);`); await wait(`!mv.session.dirty`);
    await activate('patchbook'); await run(`await pb.setState({selectedId:${q(F.patch)}});`); await wait(`proot.querySelector('[aria-label="Motifs using this patch"]')?.textContent.includes(${q(motifTitle)})`);
    await shot('03-patchbook-associations', `proot.querySelector('[aria-label="Motifs using this patch"]')`);
    await run(`const row=[...proot.querySelectorAll('[aria-label="Motifs using this patch"] .mnemobard-ref-row, [aria-label="Motifs using this patch"] li, [aria-label="Motifs using this patch"] > div')].find(r=>r.textContent.includes(${q(motifTitle)}));click('Open in MOTIF',row??proot.querySelector('[aria-label="Motifs using this patch"]'));`);
    await wait(`leaf('motif')?.view?.session?.snapshot.id===${q(motifId)}||leaf('motif')?.view?.session?.snapshot.id===${q(F.motifA)}`);
    report.b.navigated = await run(`return leaf('motif').view.session.snapshot.title;`);
    await run(`await leaf('motif').view.setState({selectedId:${q(motifId)}});`); await wait(`mv.session?.snapshot.id===${q(motifId)}`);
    await run(`click('Open in PATCHBOOK',mroot.querySelector('[aria-label="Sound associations"]'));`); await wait(`leaf('patchbook')?.view?.currentSession?.snapshot.id===${q(F.patch)}`);
    report.b.persisted = await run(`return (await services.repository.read(${q(motifId)})).entity.patchId===${q(F.patch)}&&services.index.referencing(${q(F.patch)},'motif').some(r=>r.id===${q(motifId)});`);
    if (!report.b.text || !report.b.persisted) throw Error('Workflow B ' + q(report.b));
    await check('B1–7', `“Night choir” found (instrument Modular voice, chain Tape and plate); editor opened and closed; “${motifTitle}” associated and saved; PATCHBOOK lists it under “Motifs using this patch”; navigated PATCHBOOK → MOTIF (“${report.b.navigated}”) and MOTIF → PATCHBOOK; association persisted in the saved records`);

    // ── Workflow C: arrange a composition ──
    await activate('canvas'); await run(`click('New composition',croot);`); await wait(`!!leaf('canvas').view.session&&!leaf('canvas').view.session.base`);
    await run(`input('Composition name',${q(compTitle)},croot);for(let i=0;i<3&&cv.session.snapshot.data.lanes.length<2;i++)click('Add lane',croot);`); await wait(`cv.session.snapshot.data.lanes.length>=2`);
    const place = async (laneIndex, id, at, reps, search) => { await run(`input('Selected lane',cv.session.snapshot.data.lanes[${laneIndex}].id,croot);click('Place motif',croot);`); await wait(`!!cv.picker?.contentEl.querySelector('select')`); await run(`const d=cv.picker.contentEl;input('Search saved motifs',${q(search)},d);`); await wait(`[...cv.picker.contentEl.querySelectorAll('option')].some(o=>o.value===${q(id)})`); await run(`const d=cv.picker.contentEl;input('Saved motif to place',${q(id)},d);input('Placement (bar:beat:tick)',${q(at)},d);input('Placement repetitions',${q(reps)},d);click('Place motif clip',d);`); await wait(`!cv.picker?.contentEl.children.length`); };
    await place(0, motifId, '1:1:0', '2', motifTitle); await place(1, F.motifA, '1:1:0', '1', 'Ascending choir');
    report.c = { clips: await run(`return cv.session.snapshot.data.lanes.map(l=>l.clips.length);`) };
    await run(`const lane=cv.session.snapshot.data.lanes[1],clip=lane.clips[0];cv.select(lane.id,clip.id);`); await wait(`!!croot.querySelector('form.mnemobard-canvas-clip-form')`);
    await run(`input('Clip position (bar:beat:tick)','3:1:0',croot);input('Clip repetitions','3',croot);click('Apply clip placement',croot);`);
    await wait(`cv.session.snapshot.data.lanes[1].clips[0].repeatCount===3`); report.c.moved = await run(`const c=cv.session.snapshot.data.lanes[1].clips[0],m=cv.session.snapshot.data.meter;return{startTick:c.startTick,expected:2*m.numerator*3840/m.denominator,repeatCount:c.repeatCount};`);
    await shot('09-canvas-selected-clip');
    await run(`const more=croot.querySelector('.mnemobard-canvas-more-tools')??[...croot.querySelectorAll('details')].find(d=>d.querySelector('summary')?.textContent.startsWith('Structure'));if(more)more.open=true;for(const d of croot.querySelectorAll('details'))if(d.querySelector('summary')?.textContent.startsWith('Structure'))d.open=true;input('New section name','Opening',croot);input('New section start (bar:beat:tick)','1:1:0',croot);input('New section end (bar:beat:tick)','3:1:0',croot);click('Add section',croot);`);
    await run(`for(const d of croot.querySelectorAll('details'))if(d.querySelector('summary')?.textContent==='Add marker')d.open=true;input('New marker name','Turn',croot);input('New marker position (bar:beat:tick)','3:1:0',croot);[...croot.querySelectorAll('button')].find(b=>b.textContent==='Add marker')?.click();`);
    await wait(`cv.session.snapshot.data.sections.length===1&&cv.session.snapshot.data.markers.length===1`);
    await run(`click('Compile arrangement',croot);`); await wait(`prep.state==='ready'`, 600); report.c.compiled = await run(`return{text:state().textContent,tone:state().dataset.tone};`);
    await run(`click('Return to start',croot);click('Play arrangement',croot);`); await wait(`services.musical.state==='playing'`); report.c.playing = await run(`return{text:state().textContent,tone:state().dataset.tone};`);
    await shot('10-canvas-transport-active', `croot.querySelector('.mnemobard-canvas-transport')`); await run(`click('Stop arrangement',croot);`);
    await run(`click('Save composition',croot);`); await wait(`!cv.session.dirty`); const compId = await run(`return cv.session.snapshot.id;`); report.fixture.composition = compId;
    const savedComp = await run(`return JSON.stringify(cv.session.snapshot.data);`);
    await run(`croot.scrollTop=0;`); await shot('08-canvas-arrangement');
    await run(`cv.leaf.detach();`); await activate('canvas'); await run(`await leaf('canvas').view.setState({selectedId:${q(compId)}});`); await wait(`leaf('canvas').view.session?.snapshot.id===${q(compId)}`);
    report.c.reopened = await run(`return JSON.stringify(cv.session.snapshot.data)===${q(savedComp)}&&!cv.session.dirty;`);
    await run(`click('Compile arrangement',croot);`); await wait(`prep.state==='ready'`, 600);
    await run(`croot.querySelector('.mnemobard-arrangement-seek').open=true;click('Export arrangement MIDI',croot);`); await wait(`!!cv.performancePanel.dialog?.contentEl.querySelector('input')`);
    report.c.exportFocus = await run(`const d=cv.performancePanel.dialog;return d.containerEl.contains(document.activeElement);`);
    await shot('12-canvas-midi-export'); report.c.export = `MNEMOBARD/Exports/4j-arrangement-${stamp}.mid`;
    await run(`const d=cv.performancePanel.dialog.contentEl;input('New arrangement MIDI destination',${q(report.c.export)},d);click('Create arrangement MIDI',d);`); await wait(`cv.performancePanel.dialog.contentEl.textContent.includes('Export created:')`, 600);
    await run(`click('Cancel export',cv.performancePanel.dialog.contentEl);`); await wait(`!cv.performancePanel.dialog?.containerEl.isConnected`);
    report.c.midi = verifyMidi(report.c.export);
    if (q(report.c.clips) !== '[1,1]' || report.c.moved.startTick !== report.c.moved.expected || report.c.moved.repeatCount !== 3 || !report.c.reopened || report.c.midi.status !== 0 || report.c.playing.tone !== 'active' || report.c.compiled.tone !== 'ready') throw Error('Workflow C ' + q(report.c));
    await check('C1–11', `New composition “${compTitle}” with 2 lanes; placed “${motifTitle}” ×2 and “Ascending choir”; moved the second clip to 3:1:0 and set ×3 (${q(report.c.moved)}); added section “Opening” and marker “Turn”; compiled (“${report.c.compiled.text}”); played (“${report.c.playing.text}”); saved and reopened identical; exported and independently verified (${q(report.c.midi)}); export dialog focus inside: ${report.c.exportFocus}`);

    // ── Workflow D: handle source changes ──
    const placementsBefore = await run(`return JSON.stringify(cv.session.snapshot.data.lanes.map(l=>l.clips.map(c=>({id:c.id,motifId:c.motifId,startTick:c.startTick,repeatCount:c.repeatCount}))));`);
    await activate('motif'); await run(`await mv.setState({selectedId:${q(motifId)}});`); await wait(`mv.session?.snapshot.id===${q(motifId)}`);
    await run(`const n=mv.session.snapshot.data.notes[0];mv.session.select([n.id]);mv.selectionChanged();input('Set selected velocity',String(n.velocity===70?71:70),mroot);click('Set velocity',mroot);click('Save motif',mroot);`); await wait(`!mv.session.dirty`);
    const motifPath = await run(`return services.index.locate(${q(motifId)}).path;`), motifBytes = sha(await readFile(`${vaultRoot}/${motifPath}`, 'utf8'));
    const compPath = await run(`return services.index.locate(${q(compId)}).path;`), compBytes = sha(await readFile(`${vaultRoot}/${compPath}`, 'utf8'));
    await activate('canvas'); await wait(`!croot.querySelector('.mnemobard-review-banner').hidden`);
    report.d = { status: await run(`return state().textContent;`) };
    await run(`click('Review changed sources',croot.querySelector('.mnemobard-review-banner'));`); await wait(`!!cv.reviewModal?.contentEl.querySelector('.mnemobard-review-detail')`);
    report.d.review = await run(`return{summary:facts(modal,'.mnemobard-review-summary'),placements:modal.querySelectorAll('.mnemobard-review-clips tbody tr').length,openMotif:[...modal.querySelectorAll('button')].some(b=>b.textContent==='Open motif in MOTIF')};`);
    await shot('11-canvas-source-review');
    await run(`click('Acknowledge this source for all',modal);`); await wait(`!!modal.querySelector('[aria-label="Confirm acknowledgement"]')`); await run(`click('Confirm acknowledgement',modal);`); await wait(`modal.textContent.includes('No changed sources')`, 600);
    await run(`click('Close review',modal);`); await wait(`!cv.reviewModal?.containerEl?.isConnected`);
    await run(`click('Compile arrangement',croot);`); await wait(`prep.state==='ready'`, 600);
    report.d.after = { placementsUnchanged: (await run(`return JSON.stringify(cv.session.snapshot.data.lanes.map(l=>l.clips.map(c=>({id:c.id,motifId:c.motifId,startTick:c.startTick,repeatCount:c.repeatCount}))));`)) === placementsBefore,
      motifFileUnchanged: sha(await readFile(`${vaultRoot}/${motifPath}`, 'utf8')) === motifBytes, compositionFileUnchanged: sha(await readFile(`${vaultRoot}/${compPath}`, 'utf8')) === compBytes, status: await run(`return state().textContent;`), dirty: await run(`return cv.session.dirty;`) };
    if (!report.d.status.includes('Source review required') || report.d.review.placements !== 1 || !report.d.after.placementsUnchanged || !report.d.after.motifFileUnchanged || !report.d.after.compositionFileUnchanged || !report.d.after.dirty) throw Error('Workflow D ' + q(report.d));
    await run(`click('Save composition',croot);`); await wait(`!cv.session.dirty`);
    await check('D1–7', `Changed and saved “${motifTitle}”; CANVAS showed “${report.d.status}”; review summary ${q(report.d.review.summary)} with ${report.d.review.placements} placement and an “Open motif in MOTIF” route; acknowledged explicitly; recompiled (“${report.d.after.status}”); placements identical, motif note and composition note byte-identical until the explicit Save (draft dirty: ${report.d.after.dirty}); then saved`);

    // ── Workflow E: recovery (conflict checkpoint, search/filter/inspect, consent, read-only) ──
    await run(`cv.session.edit('Rename lane',c=>({...c,data:{...c.data,lanes:c.data.lanes.map((l,i)=>i===0?{...l,name:'Lantern lane (unsaved)'}:l)}}));`); await pause(900); await run(`await cv.session.checkpoint();`);
    await run(`cv.session.undo();cv.session.edit('Rename composition',c=>({...c,title:c.title+' ·'}));`); await run(`click('Save composition',croot);`); await wait(`!cv.session.dirty`);
    const before = await vaultDigest();
    await run(`click('Composition recovery',croot);`); await wait(`!!leaf('canvas').view.recoveryPanel&&settled(leaf('canvas').view.recoveryRoot)`);
    await shot('13-recovery-wide', `leaf('canvas').view.recoveryRoot`);
    const rroot = `leaf('canvas').view.recoveryRoot`;
    await run(`const r=${rroot};input('Search checkpoints',${q(compTitle)},r);input('Module','CANVAS',r);input('Checkpoint type','Unsaved draft of a saved record',r);`); await wait(`settled(${rroot})&&rows(${rroot}).length>0`);
    report.e = { count: await run(`return ${rroot}.querySelector('.mnemobard-recovery-count').textContent;`) };
    await run(`rows(${rroot})[0].click();`); await wait(`!!${rroot}.querySelector('.mnemobard-recovery-summary')`);
    report.e.inspect = await run(`const d=${rroot}.querySelector('.mnemobard-recovery-detail'),load=[...d.querySelectorAll('button')].find(b=>b.textContent==='Load draft without saving'),box=d.querySelector('.mnemobard-recovery-consent input');
      const disabledBefore=load?.disabled;box.click();const enabledAfter=!load.disabled;box.click();return{summary:facts(d,'.mnemobard-recovery-summary'),preview:facts(d,'.mnemobard-recovery-preview'),status:d.querySelector('.mnemobard-recovery-status')?.textContent,disabledBefore,enabledAfter,disabledAgain:load.disabled};`);
    await shot('14-recovery-selected', `${rroot}.querySelector('.mnemobard-recovery-panes')`);
    await size(680); await run(`rows(${rroot})[0].click();`); await wait(`!!${rroot}.querySelector('li > .mnemobard-recovery-detail')`); await shot('15-recovery-narrow', `${rroot}.querySelector('li > .mnemobard-recovery-detail')`); report.e.narrowInline = true; await size(1366);
    report.e.readOnly = (await vaultDigest()) === before;
    if (!report.e.inspect.status?.startsWith('CONFLICT') || !report.e.inspect.disabledBefore || !report.e.inspect.enabledAfter || !report.e.inspect.disabledAgain || !report.e.readOnly) throw Error('Workflow E ' + q(report.e));
    await check('E1–7', `Register search + CANVAS + “Unsaved draft of a saved record”: ${report.e.count}; inspected (${q(report.e.inspect.preview)}); changed-source conflict shown (“${report.e.inspect.status}”); Load disabled until the consent box is ticked, disabled again when unticked (nothing loaded); inline inspector under its row at 680 px; every vault file identical before and after browsing`);
    await run(`click('Close composition recovery',croot);`);

    // ── Large document, responsive layouts, keyboard, themes ──
    await activate('motif'); await run(`await mv.setState({selectedId:${q(L.large10000)}});`); await wait(`mv.session?.snapshot.id===${q(L.large10000)}`); await shot('07-motif-10000-notes');
    report.layouts = {};
    for (const width of [1366, 980, 680]) {
      await size(width); report.layouts[width] = {};
      for (const [type, id] of [['patchbook', F.patch], ['motif', motifId], ['canvas', compId]]) {
        await activate(type); await run(`await leaf('${type}').view.setState({selectedId:${q(id)}});`); await pause(250);
        report.layouts[width][type] = await layout(type);
        if (width === 680) await shot({ patchbook: '18-patchbook-narrow', motif: '16-motif-narrow', canvas: '17-canvas-narrow' }[type]);
      }
    }
    await size(1366);
    await activate('motif'); await run(`mroot.querySelector('[aria-label="Motif name"]').focus();`); await key('Tab');
    report.keyboard = await run(`const a=document.activeElement;return{label:a.getAttribute('aria-label')??a.textContent,visible:a.matches(':focus-visible'),outline:getComputedStyle(a).outlineStyle};`);
    await activate('canvas'); await run(`croot.scrollTop=0;`); await shot('19-dark-overview');
    await theme('moonstone'); await shot('20-light-overview'); report.light = await run(`return document.body.classList.contains('theme-light');`); await theme('obsidian');
    const bad = Object.entries(report.layouts).flatMap(([w, m]) => Object.entries(m).filter(([, l]) => l.overflowX > 1 || l.outside.length).map(([t, l]) => `${w}/${t}: ${q(l)}`));
    if (bad.length || !report.keyboard.visible || report.keyboard.outline === 'none' || !report.light) throw Error('Layout ' + q({ bad, k: report.keyboard }));
    await check('G/H', `No horizontal overflow and no control outside the view in PATCHBOOK, MOTIF and CANVAS at 1366/980/680 px; keyboard Tab focus visible (${q(report.keyboard)}); 10,000-note motif opened; dark and light overviews captured`);
    await theme(report.originalTheme === 'moonstone' ? 'moonstone' : report.originalTheme === 'system' ? 'system' : 'obsidian');
    await c.evaluate('app.workspace.requestSaveLayout?.run?.()');
  } else {
    const R = report.fixture; await theme('obsidian');
    await activate('canvas'); await run(`click('Composition recovery',croot);`); await wait(`!!leaf('canvas').view.recoveryPanel&&settled(leaf('canvas').view.recoveryRoot)`);
    await run(`input('Search checkpoints',${q(R.compTitle)},leaf('canvas').view.recoveryRoot);`); await wait(`settled(leaf('canvas').view.recoveryRoot)`);
    report.restart = await run(`const r=leaf('canvas').view.recoveryRoot;return{count:r.querySelector('.mnemobard-recovery-count').textContent,rows:rows(r).length,motif:(await services.repository.read(${q(R.motif)})).entity.patchId===${q(R.patch)},composition:(await services.repository.read(${q(R.composition)})).entity.data.lanes.flatMap(l=>l.clips).length};`);
    if (!report.restart.rows || !report.restart.motif || report.restart.composition !== 2) throw Error('Restart ' + q(report.restart));
    await check('E8', `After a cold restart: ${report.restart.count} for “${R.compTitle}”; the motif's PATCHBOOK association and the composition's 2 clips are intact`);
    await theme(report.originalTheme === 'moonstone' ? 'moonstone' : report.originalTheme === 'system' ? 'system' : 'obsidian');
  }
  report.rendererExceptions = c.exceptions; if (c.exceptions.length) throw Error(c.exceptions.join('\n'));
  await check('exceptions', `Renderer exceptions during this phase: ${c.exceptions.length}`);
  await writeFile(`${directory}/native-${restart ? 'restart' : 'part1'}.json`, JSON.stringify(report, null, 2) + '\n');
} catch (error) {
  await writeFile(`${directory}/failure${restart ? '-restart' : ''}.json`, JSON.stringify({ error: String(error), report, exceptions: c.exceptions }, null, 2) + '\n');
  console.error('FAILED:', String(error)); process.exitCode = 1;
} finally { await size(1440, 1000).catch(() => {}); c.close(); }
