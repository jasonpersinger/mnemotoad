/**
 * MNEMOTOAD release candidate — the 21-step cross-module workflow (prompt §14), driven through the real UI of the
 * isolated Obsidian (buttons/fields by their stable labels; services are only read to assert outcomes). Disposable vault
 * only (MNEMOTOAD_DEV_VAULT selects it; the CDP client refuses any other vault). Creates its own "RC …" records.
 *   node scripts/mnemotoad-rc-workflow.mjs                    steps 1–19 + unsaved-draft navigation (then cold-restart Obsidian)
 *   node scripts/mnemotoad-rc-workflow.mjs --verify-restart   steps 20–21 after the restart
 * Output: output/release-candidate/workflow/<vault>-{part1,restart}.json + screenshots
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { connect } from './obsidian-cdp.mjs';
import { devVaultName } from './dev-target.mjs';

const directory = process.env.MNEMOTOAD_WORKFLOW_DIR ?? 'output/release-candidate/workflow', vaultRoot = devVaultName, restart = process.argv.includes('--verify-restart');
await mkdir(directory, { recursive: true });
const c = await connect(), pause = ms => new Promise(r => setTimeout(r, ms)), q = JSON.stringify, stamp = String(Date.now());
const sha = text => createHash('sha256').update(text).digest('hex');
const prefix = `const services=app.plugins.getPlugin('mnemobard').services,leaf=t=>app.workspace.getLeavesOfType('mnemobard-'+t)[0],cv=leaf('canvas')?.view,mv=leaf('motif')?.view,pb=leaf('patchbook')?.view,croot=cv?.contentEl,mroot=mv?.contentEl,proot=pb?.contentEl,prep=cv?.performancePanel?.preparation,modal=cv?.reviewModal?.contentEl;
const assert=(v,m)=>{if(!v)throw Error(m);};const click=(text,scope=document)=>{const all=[...scope.querySelectorAll('button')].filter(b=>!b.disabled),b=all.find(b=>b.textContent===text)??all.find(b=>b.textContent.startsWith(text));assert(b,'Missing button '+text);b.click();};
const input=(label,value,scope=document)=>{const e=[...scope.querySelectorAll('input,textarea,select')].find(e=>e.getAttribute('aria-label')===label);assert(e,'Missing control '+label);e.value=value;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));};
const state=()=>croot?.querySelector('.mnemobard-arrangement-state');`;
async function run(body) { try { return await c.evaluate(`(globalThis.__rc=(async()=>{${prefix}${body}})())`); } finally { await c.evaluate('delete globalThis.__rc'); } }
async function wait(test, tries = 600) { for (let i = 0; i < tries; i++) { if (await run(`return (${test});`)) return; await pause(30); } throw Error('Timed out: ' + test); }
const report = restart ? { ...JSON.parse(await readFile(`${directory}/${vaultRoot}-part1.json`, 'utf8')), restart: { at: new Date().toISOString(), steps: [] } } : { vault: vaultRoot, stamp, at: new Date().toISOString(), steps: [] };
const steps = restart ? report.restart.steps : report.steps;
async function step(n, title, detail) { steps.push({ step: n, title, detail }); console.log(`✓ ${n}. ${title} — ${q(detail).slice(0, 240)}`); await writeFile(`${directory}/${vaultRoot}-${restart ? 'restart' : 'part1'}.json`, JSON.stringify(report, null, 2) + '\n'); }
async function shot(name) { await pause(350); const s = await c.command('Page.captureScreenshot', { format: 'png' }); await writeFile(`${directory}/${name}.png`, Buffer.from(s.data, 'base64')); }
const activate = async t => { await run(`await services.modules.open('${t}');app.workspace.setActiveLeaf(leaf('${t}'),{focus:true});leaf('${t}').view.contentEl.scrollTop=0;`); await pause(250); };
const verifyMidi = path => { const r = spawnSync('python3', ['scripts/verify-midi.py', `${vaultRoot}/${path}`], { encoding: 'utf8' }); let p; try { p = JSON.parse(r.stdout); } catch { p = undefined; } const ons = p?.tracks?.flatMap(t => t.events.filter(e => e[1] === 'on')) ?? []; return { status: r.status, format: p?.format, ppq: p?.ppq, tracks: p?.tracks?.length, noteOns: ons.length }; };
const fileText = async path => readFile(`${vaultRoot}/${path}`, 'utf8');

try {
  await c.command('Page.bringToFront'); await c.command('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
  await run(`app.workspace.leftSplit?.collapse();`);
  if (!restart) {
    const N = { instrument: `RC Lantern organ ${stamp}`, patch: `RC Ember reed ${stamp}`, motif: `RC Ember phrase ${stamp}`, composition: `RC Procession ${stamp}` }; report.names = N;
    // 1. Instrument
    await activate('patchbook'); await run(`click('Instruments',proot);`); await wait(`proot.querySelector('[data-kind="instrument"]')?.getAttribute('aria-pressed')==='true'`);
    await run(`click('New record',proot);`); await wait(`!!proot.querySelector('form')`);
    await run(`input('Name',${q(N.instrument)},proot);click('Save record',proot);`); await wait(`!proot.querySelector('form')&&services.patchbook.query({kind:'instrument'}).some(r=>r.entity.title===${q(N.instrument)})`);
    const instrument = await run(`return services.patchbook.query({kind:'instrument'}).find(r=>r.entity.title===${q(N.instrument)}).entity.id;`); report.ids = { instrument };
    await step(1, 'Create an instrument in PATCHBOOK', { instrument, path: await run(`return services.index.locate(${q(instrument)}).path;`) });
    // 2. Patch linked to the instrument
    await run(`click('Patches',proot);`); await wait(`proot.querySelector('[data-kind="patch"]')?.getAttribute('aria-pressed')==='true'`);
    await run(`click('New record',proot);`); await wait(`!!proot.querySelector('form')`);
    await run(`input('Name',${q(N.patch)},proot);input('Instrument',${q(instrument)},proot);click('Save record',proot);`); await wait(`!proot.querySelector('form')&&services.patchbook.query({kind:'patch'}).some(r=>r.entity.title===${q(N.patch)})`);
    const patch = await run(`return services.patchbook.query({kind:'patch'}).find(r=>r.entity.title===${q(N.patch)}).entity.id;`); report.ids.patch = patch;
    const patchInstrument = await run(`return (await services.repository.read(${q(patch)})).entity.instrumentId;`);
    if (patchInstrument !== instrument) throw Error('patch → instrument link not saved');
    await step(2, 'Create a patch', { patch, instrumentId: patchInstrument });
    // 3–5. Motif: associate patch, compose, save
    await activate('motif'); await run(`click('New motif',mroot);`); await wait(`!!mv.session&&!mv.session.base`);
    await run(`input('Motif name',${q(N.motif)},mroot);mroot.querySelector('.mnemobard-motif-patch').open=true;input('Find PATCHBOOK patch',${q(N.patch)},mroot);input('Choose active patch',${q(patch)},mroot);click('Associate chosen patch',mroot);`);
    await wait(`mv.session.snapshot.patchId===${q(patch)}`);
    await step(3, 'Associate the patch with a MOTIF', { patchId: patch });
    await run(`for(let i=0;i<4;i++)click('Add note',mroot);`); await wait(`mv.session.snapshot.data.notes.length===4`);
    const plan = [['1:1:0', '60'], ['1:2:0', '63'], ['1:3:0', '67'], ['1:4:0', '70']];
    for (let i = 0; i < plan.length; i++) await run(`const n=mv.session.snapshot.data.notes[${i}];mv.session.select([n.id]);mv.selectionChanged();input('Pitch',${q(plan[i][1])},mroot);input('Position (bar:beat:tick)',${q(plan[i][0])},mroot);input('Duration ticks','960',mroot);click('Apply to primary note',mroot);`);
    const notes = await run(`return mv.session.snapshot.data.notes.map(n=>({pitch:n.pitch,startTick:n.startTick,durationTicks:n.durationTicks,velocity:n.velocity})).sort((a,b)=>a.startTick-b.startTick);`);
    if (q(notes.map(n => [n.pitch, n.startTick])) !== q([[60, 0], [63, 960], [67, 1920], [70, 2880]])) throw Error('phrase ' + q(notes));
    await step(4, 'Compose a short phrase', { notes, history: await run(`return mroot.querySelector('.mnemobard-history-depth')?.textContent;`) });
    await run(`click('Save motif',mroot);`); await wait(`!mv.session.dirty&&mv.session.status==='Saved'`);
    const motif = await run(`return mv.session.snapshot.id;`); report.ids.motif = motif;
    await step(5, 'Save the MOTIF', { motif, path: await run(`return services.index.locate(${q(motif)}).path;`), patchId: await run(`return (await services.repository.read(${q(motif)})).entity.patchId;`) });
    // 6–8. CANVAS via the command palette command
    await run(`app.commands.executeCommandById('mnemobard:open-canvas');`); await wait(`!!leaf('canvas')?.view?.contentEl?.querySelector('.mnemobard-module-header')`); await activate('canvas');
    await step(6, 'Open CANVAS', { via: 'command mnemobard:open-canvas (“MNEMOTOAD: Open CANVAS”)' });
    await run(`click('New composition',croot);`); await wait(`!!cv.session&&!cv.session.base`); await run(`input('Composition name',${q(N.composition)},croot);`);
    await step(7, 'Create a composition', { title: N.composition });
    await run(`for(let i=0;i<3&&cv.session.snapshot.data.lanes.length<2;i++)click('Add lane',croot);`); await wait(`cv.session.snapshot.data.lanes.length>=2`);
    await step(8, 'Add lanes', { lanes: await run(`return cv.session.snapshot.data.lanes.length;`) });
    // 9–10. Place and repeat
    await run(`input('Selected lane',cv.session.snapshot.data.lanes[0].id,croot);click('Place motif',croot);`); await wait(`!!cv.picker?.contentEl.querySelector('select')`);
    await run(`input('Search saved motifs',${q(N.motif)},cv.picker.contentEl);`); await wait(`[...cv.picker.contentEl.querySelectorAll('option')].some(o=>o.value===${q(motif)})`);
    await run(`const d=cv.picker.contentEl;input('Saved motif to place',${q(motif)},d);input('Placement (bar:beat:tick)','1:1:0',d);input('Placement repetitions','1',d);click('Place motif clip',d);`); await wait(`!cv.picker?.contentEl.children.length&&cv.session.snapshot.data.lanes[0].clips.length===1`);
    await step(9, 'Place the MOTIF', { clip: await run(`const k=cv.session.snapshot.data.lanes[0].clips[0];return{motifId:k.motifId,startTick:k.startTick,repeatCount:k.repeatCount};`) });
    await run(`const lane=cv.session.snapshot.data.lanes[0];cv.select(lane.id,lane.clips[0].id);`); await wait(`!!croot.querySelector('form.mnemobard-canvas-clip-form')`);
    await run(`input('Clip repetitions','4',croot);click('Apply clip placement',croot);`); await wait(`cv.session.snapshot.data.lanes[0].clips[0].repeatCount===4`);
    await step(10, 'Repeat it', { repeatCount: 4 });
    // 11–13. Compile, play (pause/resume/stop), export
    await run(`click('Compile arrangement',croot);`); await wait(`prep.state==='ready'`); const compiled = await run(`return{text:state().textContent,tone:state().dataset.tone};`);
    if (compiled.tone !== 'ready') throw Error('compile ' + q(compiled));
    await step(11, 'Compile the arrangement', compiled);
    await run(`click('Return to start',croot);click('Play arrangement',croot);`); await wait(`services.musical.state==='playing'`); await pause(700);
    const playing = await run(`return{text:state().textContent,tone:state().dataset.tone};`);
    await run(`click('Pause',croot);`); await wait(`services.musical.state==='paused'`); const paused = await run(`return state().textContent;`);
    await run(`click('Resume',croot);`); await wait(`services.musical.state==='playing'`); await pause(300);
    await run(`click('Stop arrangement',croot);`); await wait(`services.musical.state!=='playing'&&services.musical.state!=='paused'`);
    await step(12, 'Play the arrangement (pause, resume, stop)', { playing, paused, after: await run(`return services.musical.state;`) });
    await run(`croot.querySelector('.mnemobard-arrangement-seek').open=true;click('Export arrangement MIDI',croot);`); await wait(`!!cv.performancePanel.dialog?.contentEl.querySelector('input')`);
    await shot('rc-export-dialog');
    report.export1 = `MNEMOBARD/Exports/rc-workflow-${stamp}-a.mid`;
    await run(`const d=cv.performancePanel.dialog.contentEl;input('New arrangement MIDI destination',${q(report.export1)},d);click('Create arrangement MIDI',d);`); await wait(`cv.performancePanel.dialog.contentEl.textContent.includes('Export created:')`);
    await run(`click('Cancel export',cv.performancePanel.dialog.contentEl);`); await wait(`!cv.performancePanel.dialog?.containerEl.isConnected`);
    const midi1 = verifyMidi(report.export1); if (midi1.status !== 0 || midi1.noteOns !== 16 || midi1.ppq !== 960) throw Error('export 1 ' + q(midi1));
    await step(13, 'Export MIDI', { path: report.export1, independentParser: midi1 });
    await run(`click('Save composition',croot);`); await wait(`!cv.session.dirty`); const composition = await run(`return cv.session.snapshot.id;`); report.ids.composition = composition;
    // 14. Modify the saved MOTIF — first leave an UNSAVED change and navigate away (no silent draft loss), then save.
    await activate('motif'); await run(`await mv.setState({selectedId:${q(motif)}});`); await wait(`mv.session?.snapshot.id===${q(motif)}`);
    await run(`const n=[...mv.session.snapshot.data.notes].sort((a,b)=>a.startTick-b.startTick)[0];mv.session.select([n.id]);mv.selectionChanged();input('Set selected velocity','101',mroot);click('Set velocity',mroot);`); await wait(`mv.session.dirty`);
    const motifPath = await run(`return services.index.locate(${q(motif)}).path;`), savedBefore = sha(await fileText(motifPath));
    await run(`click('Open in CANVAS',mroot.querySelector('[aria-label="Usage in compositions"]')??mroot);`).catch(async () => { await activate('canvas'); });
    await wait(`app.workspace.getActiveViewOfType?.(leaf('canvas').view.constructor)===leaf('canvas').view||app.workspace.activeLeaf===leaf('canvas')`, 200).catch(() => activate('canvas'));
    await pause(600);
    const whileUnsaved = await run(`return{motifStillDirty:leaf('motif').view.session.dirty,draftVelocity:[...leaf('motif').view.session.snapshot.data.notes].sort((a,b)=>a.startTick-b.startTick)[0].velocity,canvasReviewBanner:!leaf('canvas').view.contentEl.querySelector('.mnemobard-review-banner')?.hidden,checkpoints:app.vault.getFiles().filter(f=>f.path.includes('/Recovery/'+${q(motif)}+'/')).length};`);
    const savedUnchanged = sha(await fileText(motifPath)) === savedBefore;
    if (!whileUnsaved.motifStillDirty || whileUnsaved.draftVelocity !== 101 || whileUnsaved.canvasReviewBanner || !savedUnchanged) throw Error('unsaved navigation ' + q({ whileUnsaved, savedUnchanged }));
    await shot('rc-cross-module-navigation');
    report.unsavedNavigation = { ...whileUnsaved, savedNoteUnchanged: savedUnchanged };
    await activate('motif'); await wait(`mv.session?.snapshot.id===${q(motif)}&&mv.session.dirty`);
    await run(`click('Save motif',mroot);`); await wait(`!mv.session.dirty`);
    await step(14, 'Modify the saved MOTIF', { unsavedNavigation: report.unsavedNavigation, savedVelocity: await run(`return Math.max(...(await services.repository.read(${q(motif)})).entity.data.notes.map(n=>n.velocity));`) });
    // 15–17. Review and acknowledge
    await activate('canvas'); await run(`await cv.setState({selectedId:${q(composition)}});`); await wait(`cv.session?.snapshot.id===${q(composition)}`);
    await step(15, 'Return to CANVAS', { composition });
    await wait(`!croot.querySelector('.mnemobard-review-banner').hidden`); const warning = await run(`return{state:state().textContent,banner:croot.querySelector('.mnemobard-review-banner').textContent.slice(0,200)};`);
    await run(`click('Review changed sources',croot.querySelector('.mnemobard-review-banner'));`); await wait(`!!cv.reviewModal?.contentEl.querySelector('.mnemobard-review-detail')`);
    await shot('rc-source-review');
    await step(16, 'Review the changed-source warning', { ...warning, placements: await run(`return modal.querySelectorAll('.mnemobard-review-clips tbody tr').length;`) });
    await run(`click('Acknowledge this source for all',modal);`); await wait(`!!modal.querySelector('[aria-label="Confirm acknowledgement"]')`); await run(`click('Confirm acknowledgement',modal);`); await wait(`modal.textContent.includes('No changed sources')`);
    await run(`click('Close review',modal);`); await wait(`!cv.reviewModal?.containerEl?.isConnected`);
    await step(17, 'Acknowledge the source revision', { reviewedRevision: await run(`return cv.session.snapshot.data.lanes[0].clips[0].sourceRevision;`), motifNoteSha: sha(await fileText(motifPath)) });
    // 18–19. Recompile, export again (velocity change now reaches MIDI), save
    await run(`click('Compile arrangement',croot);`); await wait(`prep.state==='ready'`);
    report.export2 = `MNEMOBARD/Exports/rc-workflow-${stamp}-b.mid`;
    await run(`croot.querySelector('.mnemobard-arrangement-seek').open=true;click('Export arrangement MIDI',croot);`); await wait(`!!cv.performancePanel.dialog?.contentEl.querySelector('input')`);
    await run(`const d=cv.performancePanel.dialog.contentEl;input('New arrangement MIDI destination',${q(report.export2)},d);click('Create arrangement MIDI',d);`); await wait(`cv.performancePanel.dialog.contentEl.textContent.includes('Export created:')`);
    await run(`click('Cancel export',cv.performancePanel.dialog.contentEl);`); await wait(`!cv.performancePanel.dialog?.containerEl.isConnected`);
    const midi2 = verifyMidi(report.export2), bytes1 = await readFile(`${vaultRoot}/${report.export1}`), bytes2 = await readFile(`${vaultRoot}/${report.export2}`);
    const velocityByte = buf => [...buf].some((b, i) => (b & 0xf0) === 0x90 && buf[i + 2] === 101);
    if (midi2.status !== 0 || midi2.noteOns !== 16 || bytes1.equals(bytes2) || !velocityByte(bytes2) || velocityByte(bytes1)) throw Error('export 2 ' + q(midi2));
    await step(18, 'Recompile', { state: await run(`return state().textContent;`), export: report.export2, independentParser: midi2, changedVelocityReachedMidi: true });
    await run(`click('Save composition',croot);`); await wait(`!cv.session.dirty`);
    const compPath = await run(`return services.index.locate(${q(composition)}).path;`); report.paths = { motif: motifPath, composition: compPath };
    report.savedSha = { motif: sha(await fileText(motifPath)), composition: sha(await fileText(compPath)) };
    await step(19, 'Save the composition', { path: compPath, sha: report.savedSha.composition });
    report.rendererExceptions = c.exceptions; await writeFile(`${directory}/${vaultRoot}-part1.json`, JSON.stringify(report, null, 2) + '\n');
    console.log('Part 1 complete. Cold-restart Obsidian, then run with --verify-restart.');
  } else {
    const I = report.ids;
    await step(20, 'Close and reopen Obsidian', { at: report.restart.at, activeDocumentIsMain: await c.evaluate('activeDocument===document') });
    const rel = await run(`await services.index.settled();const r=id=>services.index.resolve(id);const ins=r(${q(I.instrument)}),pat=r(${q(I.patch)}),mot=r(${q(I.motif)}),com=r(${q(I.composition)});
      return{statuses:[ins.status,pat.status,mot.status,com.status],patchInstrument:pat.entity?.instrumentId,motifPatch:mot.entity?.patchId,clip:com.entity?.data.lanes[0].clips[0]&&{motifId:com.entity.data.lanes[0].clips[0].motifId,repeatCount:com.entity.data.lanes[0].clips[0].repeatCount,sourceRevision:com.entity.data.lanes[0].clips[0].sourceRevision},
        motifsUsingPatch:services.index.referencing(${q(I.patch)},'motif').map(e=>e.id),compositionsUsingMotif:services.index.referencing(${q(I.motif)},'composition').map(e=>e.id)};`);
    const motifSha = sha(await fileText(report.paths.motif)), compSha = sha(await fileText(report.paths.composition));
    await activate('canvas'); await run(`await cv.setState({selectedId:${q(I.composition)}});`); await wait(`cv.session?.snapshot.id===${q(I.composition)}`);
    await run(`click('Compile arrangement',croot);`); await wait(`prep.state==='ready'`);
    const canvasState = await run(`return{state:state().textContent,reviewBannerHidden:!!croot.querySelector('.mnemobard-review-banner')?.hidden};`);
    await activate('patchbook'); await run(`await pb.setState({selectedId:${q(I.patch)}});`); await wait(`proot.querySelector('[aria-label="Motifs using this patch"]')?.textContent.includes(${q(report.names.motif)})`);
    const ok = rel.statuses.every(s => s === 'ready') && rel.patchInstrument === I.instrument && rel.motifPatch === I.patch && rel.clip?.motifId === I.motif && rel.clip.repeatCount === 4 && rel.clip.sourceRevision === motifSha
      && rel.motifsUsingPatch.includes(I.motif) && rel.compositionsUsingMotif.includes(I.composition) && motifSha === report.savedSha.motif && compSha === report.savedSha.composition && canvasState.reviewBannerHidden;
    if (!ok) throw Error('restart verification ' + q({ rel, motifSha, compSha, canvasState }));
    await step(21, 'Verify records and relationships remain intact', { ...rel, filesUnchangedByRestart: true, canvasState, patchbookListsMotif: true });
    report.restart.rendererExceptions = c.exceptions; await writeFile(`${directory}/${vaultRoot}-restart.json`, JSON.stringify(report, null, 2) + '\n');
  }
} finally { await c.command('Emulation.clearDeviceMetricsOverride').catch(() => {}); c.close(); }
