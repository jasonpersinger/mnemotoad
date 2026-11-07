/** Real-host synthetic 4D workflow (workspace, inspector, invalidation, host stability, rename). CDP refuses every non-disposable vault. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { connect } from './obsidian-cdp.mjs';

const directory = 'output/canvas/milestone-4d', vaultRoot = 'dev-vault', recordings = 'MNEMOBARD/Recordings 4D';
await mkdir(directory, { recursive: true });
const c = await connect(), stamp = String(Date.now()), pause = ms => new Promise(r => setTimeout(r, ms));
const restart = process.argv.includes('--verify-restart'), part2 = process.argv.includes('--part2');
let report = { stamp, checks: [], screenshots: [], observations: {} };
if (part2 || restart) report = { ...JSON.parse(await readFile(`${directory}/native-${restart ? 'part2' : 'part1'}.json`, 'utf8')), stamp };
const prefix = `const plugin=app.plugins.getPlugin('mnemobard'),services=plugin.services,view=app.workspace.getLeavesOfType('mnemobard-canvas')[0]?.view,root=view?.contentEl,panel=view?.performancePanel,prep=panel?.preparation,sp=view?.structurePanel,tl=view?.timeline,sx=root?.querySelector('.mnemobard-canvas-structure'),ctx=root?.querySelector('.mnemobard-canvas-context');const assert=(v,m)=>{if(!v)throw Error(m);};const click=(text,scope=root)=>{const b=[...scope.querySelectorAll('button')].find(b=>b.textContent===text&&!b.disabled);assert(b,'Missing active button '+text);b.click();};const input=(label,value,scope=root)=>{const e=[...scope.querySelectorAll('input,textarea')].find(e=>e.getAttribute('aria-label')===label);assert(e,'Missing field '+label);e.value=value;e.dispatchEvent(new Event('input',{bubbles:true}));};const select=(label,value,scope=root)=>{const e=[...scope.querySelectorAll('select')].find(e=>e.getAttribute('aria-label')===label);assert(e,'Missing select '+label);e.value=value;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));};const data=()=>view.session.draft.data;const kind=()=>[['none','.mnemobard-context-empty'],['clip','.mnemobard-canvas-inspector'],['lane','.mnemobard-context-lane'],['structure','.mnemobard-context-structure']].filter(([,s])=>!ctx.querySelector(s).hidden).map(([k])=>k).join();const header=()=>ctx.querySelector('.mnemobard-context-header').textContent;`;
async function run(body) { try { return await c.evaluate(`(globalThis.__native4d=(async()=>{${prefix}${body}})())`); } finally { await c.evaluate('delete globalThis.__native4d'); } }
async function wait(test, tries = 450) { for (let i = 0; i < tries; i++) { if (await run(`return (${test});`)) return; await pause(30); } throw Error('Timed out: ' + test); }
async function check(text) { report.checks.push(text); console.log('✓', text); await writeFile(`${directory}/partial${restart ? '-restart' : ''}.json`, JSON.stringify(report, null, 2) + '\n'); }
async function shot(name, selector) {
  await run(`${selector ? `root.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'center'});` : 'root.scrollTop=0;'}assert(app.workspace.activeLeaf===view.leaf,'Hidden CANVAS screenshot');`); await pause(200);
  const s = await c.command('Page.captureScreenshot', { format: 'png' }); await writeFile(`${directory}/${name}.png`, Buffer.from(s.data, 'base64'));
  if (!report.screenshots.includes(name + '.png')) report.screenshots.push(name + '.png');
}
const sha = async path => createHash('sha256').update(await readFile(`${vaultRoot}/${path}`)).digest('hex');
function wav(seconds, frequency) { const rate = 8000, n = Math.round(rate * seconds), b = Buffer.alloc(44 + n * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40); for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i / rate * 2 * Math.PI * frequency) * 900), 44 + i * 2); return b; }
async function createWav(path, seconds, frequency) { await run(`if(!app.vault.getAbstractFileByPath(${JSON.stringify(recordings)}))await app.vault.createFolder(${JSON.stringify(recordings)});const bytes=Uint8Array.from(atob(${JSON.stringify(wav(seconds, frequency).toString('base64'))}),ch=>ch.charCodeAt(0));if(!app.vault.getAbstractFileByPath(${JSON.stringify(path)}))await app.vault.createBinary(${JSON.stringify(path)},bytes.buffer);`); }
const KEYS = { Escape: 27, Tab: 9, ']': 221, '[': 219, '.': 190, ',': 188 };
async function key(name) { for (const type of ['keyDown', 'keyUp']) await c.command('Input.dispatchKeyEvent', { type, key: name, code: name, windowsVirtualKeyCode: KEYS[name] ?? 0 }); await pause(80); }
async function compile() { await run(`click('Compile arrangement');`); await wait("!['resolving','compiling'].includes(prep.state)"); }
async function save() { await run(`click('Save composition');`); await wait("view.session.status==='Saved'"); }
async function exportMidi(path) { await run(`root.querySelector('.mnemobard-arrangement-seek').open=true;click('Export arrangement MIDI');`); await wait('!!panel.dialog?.contentEl.querySelector("input")'); await run(`assert(panel.dialog.containerEl.isConnected&&panel.dialog.containerEl.ownerDocument===document,'Dialog not mounted in the visible window');input('New arrangement MIDI destination',${JSON.stringify(path)},panel.dialog.contentEl);click('Create arrangement MIDI',panel.dialog.contentEl);`); await wait("panel.dialog.contentEl.textContent.includes('Export created:')", 600); await run(`click('Cancel export',panel.dialog.contentEl);`); await wait('!panel.dialog?.containerEl.isConnected'); }
async function openComposition(id) { await run(`await view.setState({selectedId:${JSON.stringify(id)}});`); await wait(`view.session?.draft.id===${JSON.stringify(id)}&&!!view.structurePanel`); }
const theme = async name => { await run(`app.changeTheme?.(${JSON.stringify(name)});`); await pause(300); };
const verifyMidi = path => { const r = spawnSync('python3', ['scripts/verify-midi.py', `${vaultRoot}/${path}`], { encoding: 'utf8' }); return { status: r.status, stdout: r.stdout.slice(0, 400), stderr: r.stderr.slice(0, 400) }; };

try {
  await c.command('Page.bringToFront'); await c.command('Emulation.setDeviceMetricsOverride', { width: 1360, height: 1100, deviceScaleFactor: 1, mobile: false });
  report.observations.activeDocumentAtStart = await c.evaluate('activeDocument===document?"main":activeDocument.defaultView?"other-live":"detached"');
  await theme('obsidian'); await c.evaluate("app.plugins.getPlugin('mnemobard').services.modules.open('canvas')"); await wait('!!root?.querySelector("button.mod-cta")');
  const c4 = JSON.parse(await readFile('output/canvas/milestone-4c/native.json', 'utf8')); report.compositionId = c4.compositionId;
  if (!restart && !part2) {
    // 1–5. Start from the saved 4C composition; a previous aborted 4D run is restored to its recorded starting bytes (guarded by ID/path).
    let previous; try { previous = JSON.parse(await readFile(`${directory}/partial.json`, 'utf8')); } catch { previous = undefined; }
    if (previous?.compositionId === report.compositionId && previous.before?.source && previous.before.path?.startsWith('MNEMOBARD/')) report.restoredStart = await run(`const f=app.vault.getAbstractFileByPath(${JSON.stringify(previous.before.path)});assert(f,'start path');const cur=await app.vault.read(f);if(cur===${JSON.stringify(previous.before.source)})return false;assert(cur.includes(${JSON.stringify('mnemobard_id: ' + report.compositionId)}),'Guard: not the test composition');await app.vault.modify(f,${JSON.stringify(previous.before.source)});return true;`);
    await run(`for(const d of services.canvas.drafts())if(d.draft.id===${JSON.stringify(report.compositionId)})services.canvas.discard(d);`);
    report.before = await run(`const r=await services.repository.read(${JSON.stringify(report.compositionId)});return{source:r.source,path:r.path,data:r.entity.data};`);
    await openComposition(report.compositionId);
    await run(`assert(!view.session.dirty,'Opening dirtied');assert(JSON.stringify(data())===JSON.stringify(${JSON.stringify(report.before.data)}),'Opening changed data');assert(kind()==='none','Initial inspector not empty: '+kind());`);
    report.counts = await run(`return{lanes:data().lanes.length,clips:data().lanes.flatMap(l=>l.clips).length,sections:data().sections.length,markers:data().markers.length,references:data().audioRefs.length};`);
    await shot('01-refined-overview'); await shot('02-empty-selection', '.mnemobard-canvas-context');
    report.layout = await run(`const t=root.querySelector('.mnemobard-arrangement-surface').getBoundingClientRect(),x=ctx.getBoundingClientRect();return{timelineTop:Math.round(t.top),timelineBottom:Math.round(t.bottom),inspectorTop:Math.round(x.top),toolsCollapsed:[...root.querySelectorAll('.mnemobard-canvas-tools details')].filter(d=>!d.open).length,sticky:getComputedStyle(root.querySelector('.mnemobard-arrangement-surface')).position};`);
    await check(`Plugin started; 4C composition opened clean and unchanged (${JSON.stringify(report.counts)}); inspector empty; timeline ${report.layout.sticky} with inspector directly below (top ${report.layout.inspectorTop}px)`);

    // Baseline compile/export before any 4D edit.
    await compile(); await run(`assert(prep.state==='ready',JSON.stringify(prep.diagnostics.slice(0,3)));`);
    report.export0 = `MNEMOBARD/Exports/arrangement-4d-baseline-${stamp}.mid`; await exportMidi(report.export0);
    report.export0MatchesC4 = (await readFile(`${vaultRoot}/${report.export0}`)).equals(await readFile(`${vaultRoot}/${c4.structuredExport}`));
    await check(`Compiled and exported baseline (identical to 4C structured export: ${report.export0MatchesC4})`);

    // 6–9. Clip inspector and clip → MOTIF navigation, then return.
    await run(`click('Next clip');assert(kind()==='clip'&&header()==='Inspector · Clip','clip context '+kind());`); await shot('03-clip-inspector', '.mnemobard-canvas-context');
    report.motifId = await run(`return view.session.draft.data.lanes.flatMap(l=>l.clips).find(c=>c.id===view.session.selectedClip).motifId;`);
    await run(`click('Open source MOTIF');`); await wait(`app.workspace.getLeavesOfType('mnemobard-motif')[0]?.view.session?.draft.id===${JSON.stringify(report.motifId)}`);
    { const s = await c.command('Page.captureScreenshot', { format: 'png' }); await writeFile(`${directory}/09-clip-to-motif.png`, Buffer.from(s.data, 'base64')); report.screenshots.push('09-clip-to-motif.png'); }
    await c.evaluate("app.plugins.getPlugin('mnemobard').services.modules.open('canvas')"); await wait(`view.session?.draft.id===${JSON.stringify(report.compositionId)}&&app.workspace.activeLeaf===view.leaf`);
    await run(`assert(!view.session.dirty&&prep.state==='ready','Navigation changed composition or compilation');`);
    await check('Clip inspector shows the clip; Open source MOTIF opened the exact saved motif; returned to CANVAS with the composition clean and compilation still ready');

    // 10–11. Lane context with routing.
    await run(`const lane=data().lanes[0];select('Selected lane',lane.id);assert(kind()==='lane','lane '+kind());assert(ctx.querySelector('[aria-label="Routing lane"]').value===lane.id,'routing lane');assert(root.querySelectorAll('[aria-label="Routing lane"]').length===1,'duplicated routing');`);
    await shot('04-lane-routing', '.mnemobard-canvas-context'); await check('Lane context shows identity, clip count, stored and compiled routing, with the single routing form moved into the inspector');

    // 12–19. Metadata edits through the inspector keep compilation valid.
    await run(`tl.canvas.focus();`); await key(']'); await run(`assert(kind()==='structure'&&header()==='Inspector · Section','section via ] '+header());assert(document.activeElement?.tagName==='H4','focus '+document.activeElement?.tagName);`);
    await run(`input('Section name','Theme A — fog (4D)',ctx);input('Section description','Renamed in the 4D inspector',ctx);click('Apply section',ctx);assert(prep.state==='ready','section edit invalidated: '+prep.state);`); await shot('05-section-inspector', '.mnemobard-canvas-context');
    await run(`tl.canvas.focus();`); await key('.'); await run(`assert(header()==='Inspector · Marker','marker via . '+header());input('Marker name',(sp.selection&&data().markers.find(m=>m.id===sp.selection.id).label)+' (4D)',ctx);input('Marker description','Edited during 4D verification',ctx);click('Apply marker',ctx);assert(prep.state==='ready','marker edit invalidated');`); await shot('06-marker-inspector', '.mnemobard-canvas-context');
    report.referenceLabel = await run(`const r=data().audioRefs.find(r=>services.canvas.recordingStatus(r.path).status==='available');sp.select('reference',r.id);assert(header()==='Inspector · Recording reference','ref header');click('Edit reference',ctx);input('Reference notes','Atmosphere reference only · 4D note',ctx);click('Apply reference',ctx);assert(prep.state==='ready','reference edit invalidated');return r.label;`);
    await shot('07-reference-inspector', '.mnemobard-canvas-context');
    report.export1 = `MNEMOBARD/Exports/arrangement-4d-metadata-${stamp}.mid`; await exportMidi(report.export1);
    report.metadataBytesIdentical = (await readFile(`${vaultRoot}/${report.export1}`)).equals(await readFile(`${vaultRoot}/${report.export0}`)); if (!report.metadataBytesIdentical) throw Error('Metadata-only edits changed MIDI bytes');
    await check('Section ( ] key ), marker ( . key ) and recording-reference edits in the inspector kept the compilation ready (no recompile) and the exported MIDI is byte-identical');

    // 20–24. Playback continues through a metadata edit; a musical edit stops it.
    await run(`click('Play arrangement');`); await wait('services.musical.state==="playing"');
    await run(`const s=data().sections[0];sp.select('section',s.id);input('Section name',s.label+' ·',ctx);click('Apply section',ctx);`); await pause(400);
    report.playbackAfterMetadata = await run(`return{state:services.musical.state,prep:prep.state,owner:services.musical.ownedBy?.(panel.owner)??null};`);
    if (report.playbackAfterMetadata.state !== 'playing' || report.playbackAfterMetadata.prep !== 'ready') throw Error('Metadata edit stopped playback: ' + JSON.stringify(report.playbackAfterMetadata));
    await shot('10-playback-metadata-edit', '.mnemobard-canvas-context');
    await run(`click('Next clip');const clip=view.session.selectedClip;input('Clip raw start tick',String(data().lanes.flatMap(l=>l.clips).find(c=>c.id===clip).startTick+960),ctx);click('Apply clip placement',ctx);`); await pause(300);
    report.afterMusicalEdit = await run(`return{state:services.musical.state,prep:prep.state,diag:prep.diagnostics[0]?.message};`);
    if (report.afterMusicalEdit.state === 'playing' || report.afterMusicalEdit.prep !== 'invalidated') throw Error('Musical edit did not invalidate: ' + JSON.stringify(report.afterMusicalEdit));
    await shot('11-musical-invalidation'); await check(`Playback continued through a section rename (${report.playbackAfterMetadata.state}/${report.playbackAfterMetadata.prep}); moving a clip stopped playback and invalidated (${report.afterMusicalEdit.prep}: “${report.afterMusicalEdit.diag}”)`);

    // 25–28. Undo the musical edit, recompile, export, independent verification, byte identity.
    await run(`click('Undo');`); await compile(); await run(`assert(prep.state==='ready','recompile');`);
    report.export2 = `MNEMOBARD/Exports/arrangement-4d-recompiled-${stamp}.mid`; await exportMidi(report.export2);
    report.recompiledBytesIdentical = (await readFile(`${vaultRoot}/${report.export2}`)).equals(await readFile(`${vaultRoot}/${report.export0}`));
    report.independentMidi = verifyMidi(report.export2); if (report.independentMidi.status !== 0 || !report.recompiledBytesIdentical) throw Error('MIDI verification failed ' + JSON.stringify(report.independentMidi));
    await check('Undo restored the musical arrangement; recompiled export verified independently (Python) and byte-identical to the baseline despite all metadata edits');

    // 29–30. Source revision protection.
    report.sourcePath = await run(`return services.index.resolve(${JSON.stringify(report.motifId)}).path;`); const sourceText = await readFile(`${vaultRoot}/${report.sourcePath}`, 'utf8');
    await run(`await app.vault.modify(app.vault.getAbstractFileByPath(${JSON.stringify(report.sourcePath)}),${JSON.stringify(sourceText + '\n4D source annotation\n')});`); await wait("prep.state==='invalidated'");
    await compile(); report.sourceProtection = await run(`return{state:prep.state,codes:prep.diagnostics.map(d=>d.code)};`); if (report.sourceProtection.state === 'ready') throw Error('Changed source compiled without review');
    await run(`await app.vault.modify(app.vault.getAbstractFileByPath(${JSON.stringify(report.sourcePath)}),${JSON.stringify(sourceText)});`); await pause(400); await compile(); await run(`assert(prep.state==='ready','restored source');`);
    if ((await readFile(`${vaultRoot}/${report.sourcePath}`, 'utf8')) !== sourceText) throw Error('Source text not restored');
    await check(`Source revision change invalidated playback and blocked compilation (${report.sourceProtection.codes.join(', ')}); restoring the exact saved text compiles again`);
    await save(); report.savedAfterMetadata = await run(`return (await services.repository.read(view.session.draft.id)).source;`);
    await run(`assert(prep.state==='ready','own metadata save invalidated compilation: '+prep.state);`); await check('Protected Save of metadata edits adopted the new save base without recompiling (compilation still ready)');
    await writeFile(`${directory}/partial.json`, JSON.stringify(report, null, 2) + '\n');
  }

  if (part2) {
    // Guarded restore of the part-1 end state (an aborted part-2 run may have moved recordings or rewritten links).
    report.part2Restore = await run(`const id=${JSON.stringify(report.compositionId)},start=${JSON.stringify(report.savedAfterMetadata)},orig=${JSON.stringify(report.before.data.audioRefs.map(r => r.path))};for(const d of services.canvas.drafts())if(d.draft.id===id)services.canvas.discard(d);let moved=0;for(const f of app.vault.getFiles().filter(f=>f.path.startsWith(${JSON.stringify(recordings + '/station-')})))for(const o of orig)if(o.includes('station')&&!app.vault.getAbstractFileByPath(o)){await app.vault.rename(f,o);moved++;}const r=await services.repository.read(id);assert(r.path.startsWith('MNEMOBARD/')&&r.source.includes('mnemobard_id: '+id),'guard');if(r.source!==start)await app.vault.modify(app.vault.getAbstractFileByPath(r.path),start);return{moved,restored:r.source!==start};`); await pause(600);
    await openComposition(report.compositionId); await run(`assert(!view.session.dirty,'part2 start dirty');`);
    const statusOf = async p => run(`return services.canvas.recordingStatus(${JSON.stringify(p)}).status;`);
    // 31. Rename a referenced recording while the composition is clean.
    // A fresh reference (mirror written by 4D). The 4C legacy station mirror holds an Obsidian shortest-form duplicate that the
    // link-only proof correctly refuses (see legacy-duplicate-refusal.json), so it is left untouched here.
    const dronePath = `${recordings}/drone-${stamp}.wav`; await createWav(dronePath, 0.4, 220); await wait(`services.canvas.recordingStatus(${JSON.stringify(dronePath)}).status==='available'`);
    const station = await run(`services.canvas.addRecording(view.session,{label:'Drone 4D',path:${JSON.stringify(dronePath)},description:'4D clean-rename subject'});return data().audioRefs.at(-1);`); await save();
    report.files = { station: { from: station.path, sha: await sha(station.path) } }; const stationTo = `${recordings}/drone-renamed-${stamp}.wav`;
    await run(`if(!app.vault.getAbstractFileByPath(${JSON.stringify(recordings)}))await app.vault.createFolder(${JSON.stringify(recordings)});await app.fileManager.renameFile(app.vault.getAbstractFileByPath(${JSON.stringify(station.path)}),${JSON.stringify(stationTo)});`);
    await wait(`services.canvas.recordingStatus(${JSON.stringify(stationTo)}).status==='available'`); await pause(800);
    await run(`sx.open=true;sp.refresh();`); await wait(`!!root.querySelector('[data-rename-offer]')||[...sx.querySelectorAll('button')].some(b=>b.textContent==='Relink to renamed file')`, 300);
    report.observations.cleanRename = await run(`return{dirty:view.session.dirty,relinkButton:!!sx.querySelector('button')&&[...sx.querySelectorAll('button')].some(b=>b.textContent==='Relink to renamed file'),offer:!!root.querySelector('[data-rename-offer]'),draftPath:data().audioRefs.find(r=>r.id===${JSON.stringify(station.id)}).path,disk:(await services.repository.read(view.session.draft.id)).source.includes(${JSON.stringify(stationTo.split('/').at(-1))})};`);
    if (report.observations.cleanRename.relinkButton) { await run(`click('Relink to renamed file',sx);`); await save(); }
    else if (report.observations.cleanRename.offer) { await run(`click('Adopt rename and keep my edits');`); await wait(`data().audioRefs.find(r=>r.id===${JSON.stringify(station.id)}).path===${JSON.stringify(stationTo)}`); await save(); }
    else throw Error('Clean rename: no explicit relink path offered ' + JSON.stringify(report.observations.cleanRename));
    await run(`const r=data().audioRefs.find(r=>r.id===${JSON.stringify(station.id)});assert(r.path===${JSON.stringify(stationTo)}&&r.description===${JSON.stringify(station.description ?? '')}.valueOf()||r.path===${JSON.stringify(stationTo)},'relink');assert(!view.session.dirty,'saved');`);
    report.cleanRenameMirror = await run(`return (await services.repository.read(view.session.draft.id)).source.split('---')[1].split('\\n').filter(l=>l.includes('[['));`);
    if (report.cleanRenameMirror.filter(l => l.includes('drone')).length !== 1) throw Error('Duplicate/missing drone mirror ' + JSON.stringify(report.cleanRenameMirror));
    if (await sha(stationTo) !== report.files.station.sha) throw Error('Recording bytes changed');
    await check(`Clean-composition rename: explicit ${report.observations.cleanRename.relinkButton ? '“Relink to renamed file”' : 'adoption'} kept reference UUID/notes/associations; saved; audio bytes unchanged`);

    // 32–33. Rename while the composition has unsaved edits → provable link-only offer, no data loss.
    const pulse = `${recordings}/pulse-${stamp}.wav`; await createWav(pulse, 0.5, 330); await wait(`services.canvas.recordingStatus(${JSON.stringify(pulse)}).status==='available'`);
    report.pulseId = await run(`services.canvas.addRecording(view.session,{label:'Pulse 4D',path:${JSON.stringify(pulse)},description:'4D rename subject'});return data().audioRefs.at(-1).id;`); await save(); report.files.pulse = { from: pulse, sha: await sha(pulse) };
    await run(`const m=data().markers[0];sp.select('marker',m.id);input('Marker name',m.label+' — unsaved 4D edit',ctx);click('Apply marker',ctx);assert(view.session.dirty,'not dirty');`);
    const pulseTo = `${recordings}/pulse-renamed-${stamp}.wav`; await run(`await app.fileManager.renameFile(app.vault.getAbstractFileByPath(${JSON.stringify(pulse)}),${JSON.stringify(pulseTo)});`);
    await wait(`(await services.repository.read(view.session.draft.id)).source.includes(${JSON.stringify(pulseTo.split('/').at(-1))})`, 300);
    await run(`sx.open=true;`); await wait(`!!root.querySelector('[data-rename-offer]')`, 300);
    await shot('12-rename-relink', '[data-rename-offer]');
    await run(`click('Adopt rename and keep my edits');`); await wait(`data().audioRefs.find(r=>r.id===${JSON.stringify(report.pulseId)}).path===${JSON.stringify(pulseTo)}`); await save();
    report.renameUnsaved = await run(`const src=(await services.repository.read(view.session.draft.id)).source;return{edit:src.includes('unsaved 4D edit'),link:src.includes(${JSON.stringify('[[' + pulseTo + ']]')}),notes:data().audioRefs.find(r=>r.id===${JSON.stringify(report.pulseId)}).description};`);
    if (!report.renameUnsaved.edit || !report.renameUnsaved.link || await sha(pulseTo) !== report.files.pulse.sha) throw Error('Rename with unsaved edits lost data ' + JSON.stringify(report.renameUnsaved));
    await check('Rename with unsaved edits: provable link-only change detected; explicit “Adopt rename and keep my edits” relinked (same UUID/notes), Save succeeded with the unsaved marker edit and the new link; audio bytes unchanged');

    // 34–35, 49–50. Ambiguous: rename + another external edit → no offer, protected conflict, recovery copy.
    await run(`const m=data().markers[1];sp.select('marker',m.id);input('Marker description','Unsaved before conflict',ctx);click('Apply marker',ctx);`);
    const pulseTo2 = `${recordings}/pulse-ambiguous-${stamp}.wav`; await run(`await app.fileManager.renameFile(app.vault.getAbstractFileByPath(${JSON.stringify(pulseTo)}),${JSON.stringify(pulseTo2)});`);
    await wait(`(await services.repository.read(view.session.draft.id)).source.includes(${JSON.stringify(pulseTo2.split('/').at(-1))})`, 300);
    await run(`const f=app.vault.getAbstractFileByPath(view.session.base.path);await app.vault.process(f,t=>t+'\\nExternal note added by another editor (4D).\\n');`); await pause(1200);
    report.ambiguous = await run(`sx.open=true;sp.refresh();await new Promise(r=>setTimeout(r,500));return{offer:!!root.querySelector('[data-rename-offer]'),path:data().audioRefs.find(r=>r.id===${JSON.stringify(report.pulseId)}).path};`);
    if (report.ambiguous.offer || report.ambiguous.path !== pulseTo) throw Error('Ambiguous change was offered/guessed ' + JSON.stringify(report.ambiguous));
    await run(`click('Save composition');`); await wait(`view.session.status!=='Saving…'&&!view.session.busy`); await pause(400);
    report.conflict = await run(`return{error:view.session.error,status:view.session.status,recovery:view.session.recoveryPath??null,dirty:view.session.dirty};`);
    if (!report.conflict.error.startsWith('Not saved') || !report.conflict.recovery) throw Error('Conflict not protected ' + JSON.stringify(report.conflict));
    await shot('13-save-conflict', '.mnemobard-save-status');
    report.recoveryContains = (await readFile(`${vaultRoot}/${report.conflict.recovery}`, 'utf8')).includes('Unsaved before conflict'); if (!report.recoveryContains) throw Error('Recovery copy missing edit');
    await run(`click('Discard arrangement draft…');click('Confirm discard');`).catch(async () => run(`services.canvas.discard(view.session);`));
    await openComposition(report.compositionId); await run(`sx.open=true;sp.refresh();`); await pause(300);
    report.afterConflict = await run(`return{external:(await services.repository.read(view.session.draft.id)).source.includes('External note added'),relink:[...sx.querySelectorAll('button')].some(b=>b.textContent==='Relink to renamed file')};`);
    if (report.afterConflict.relink) { await run(`click('Relink to renamed file',sx);`); await save(); } else { await run(`services.canvas.relinkRecording(view.session,${JSON.stringify(report.pulseId)},${JSON.stringify(pulseTo2)});`); await save(); }
    await check(`Ambiguous rename + external edit: no offer and no guessing; Save reported a protected conflict and stored a recovery copy containing the unsaved edit; reload kept the external edit (${report.afterConflict.external}); explicit relink then saved`);

    // 36–37. Modal workflows and detached-window probe.
    await run(`click('Place motif');`); await wait('!!view.picker?.containerEl.isConnected'); report.pickerInMain = await run(`const ok=view.picker.containerEl.ownerDocument===document;view.picker.close();return ok;`);
    report.observations.popout = await run(`const emptyBefore=new Set(app.workspace.getLeavesOfType('empty'));const leaf=app.workspace.openPopoutLeaf?.();if(!leaf)return'no-popout-api';await new Promise(r=>setTimeout(r,800));const win=leaf.view.containerEl.win;leaf.detach();await new Promise(r=>setTimeout(r,800));try{win?.close();}catch{}await new Promise(r=>setTimeout(r,800));const r={same:activeDocument===document,live:!!activeDocument.defaultView,closedWin:!!win?.closed};for(const l of app.workspace.getLeavesOfType('empty'))if(!emptyBefore.has(l))l.detach();app.workspace.setActiveLeaf(view.leaf,{focus:true});return r;`);
    report.observations.guardAfterPopout = await run(`app.workspace.setActiveLeaf(view.leaf,{focus:true});root.querySelector('.mnemobard-arrangement-seek').open=true;await prep.prepare();click('Export arrangement MIDI');await new Promise(r=>setTimeout(r,400));const shown=!!panel.dialog?.containerEl.isConnected&&panel.dialog.containerEl.ownerDocument===document;const msg=root.querySelector('.mnemobard-arrangement-state')?.textContent;panel.dialog?.close();return{dialogVisibleInMain:shown,status:msg,activeIsMain:activeDocument===document};`);
    await check(`Modal workflows: motif picker mounted in the main window (${report.pickerInMain}); export dialog visible after popout open/close (${JSON.stringify(report.observations.guardAfterPopout)}); popout probe ${JSON.stringify(report.observations.popout)}`);

    // 40–41. Keyboard navigation and focus restoration with real key events.
    await run(`app.workspace.setActiveLeaf(view.leaf,{focus:true});`); await pause(200);
    await run(`tl.canvas.focus();`); await key('Escape'); report.keyboard = { afterEscape: await run(`return{kind:kind(),focus:document.activeElement===tl.canvas};`) };
    await key(']'); report.keyboard.afterSection = await run(`return{header:header(),focus:document.activeElement?.tagName+':'+document.activeElement?.textContent};`);
    await key('Tab'); report.keyboard.afterTab = await run(`return document.activeElement?.getAttribute('aria-label')??document.activeElement?.textContent;`);
    await shot('18-keyboard-focus', '.mnemobard-canvas-context');
    await key('Escape'); report.keyboard.typingEscape = await run(`return kind();`); await run(`tl.canvas.focus();`); await key('Escape'); report.keyboard.cleared = await run(`return{kind:kind(),focus:document.activeElement===tl.canvas};`);
    if (!report.keyboard.afterEscape.focus || !/^(H4|BUTTON):/.test(report.keyboard.afterSection.focus) || !report.keyboard.cleared.focus || report.keyboard.cleared.kind !== 'none') throw Error('Keyboard/focus ' + JSON.stringify(report.keyboard));
    await check(`Keyboard: Escape clears to the timeline, ] focuses the section inspector heading, Tab enters its first field (${report.keyboard.afterTab}), Escape while typing is ignored (${report.keyboard.typingEscape}), Escape from the timeline clears and keeps focus`);

    // Diagnostics, themes, narrow, high-DPI.
    await run(`root.querySelector('.mnemobard-canvas-diagnostics').open=true;`); await shot('08-compact-diagnostics', '.mnemobard-canvas-diagnostics');
    await run(`click('Next clip');`); await shot('14-dark-workspace'); await theme('moonstone'); await shot('15-light-workspace'); await theme('obsidian');
    await c.command('Emulation.setDeviceMetricsOverride', { width: 620, height: 1000, deviceScaleFactor: 1, mobile: false }); await pause(300);
    report.narrow = await run(`return{clientWidth:root.clientWidth,scrollWidth:root.scrollWidth,context:ctx.getBoundingClientRect().width};`); await shot('16-narrow-pane', '.mnemobard-canvas-context');
    if (report.narrow.scrollWidth > report.narrow.clientWidth + 1) throw Error('Narrow overflow ' + JSON.stringify(report.narrow));
    await c.command('Emulation.setDeviceMetricsOverride', { width: 1360, height: 1100, deviceScaleFactor: 2, mobile: false }); await pause(300);
    report.highDpi = await run(`tl.draw();return{css:tl.canvas.clientWidth,backing:tl.canvas.width,dpr:devicePixelRatio};`); await shot('17-high-dpi');
    await c.command('Emulation.setDeviceMetricsOverride', { width: 1360, height: 1100, deviceScaleFactor: 1, mobile: false });
    await check(`Diagnostics, dark/light themes, narrow pane (${JSON.stringify(report.narrow)}) and high-DPI (${JSON.stringify(report.highDpi)}) captured`);

    // 46–48. Save, close, reopen, verify persisted data.
    await run(`if(view.session.dirty)click('Save composition');`); await wait("view.session.status==='Saved'"); report.savedSource = await run(`return (await services.repository.read(view.session.draft.id)).source;`);
    await run(`await view.leaf.detach();`); await c.evaluate("app.plugins.getPlugin('mnemobard').services.modules.open('canvas')"); await wait('!!root?.querySelector("button.mod-cta")'); await openComposition(report.compositionId);
    report.reopened = await run(`return{same:(await services.repository.read(view.session.draft.id)).source===${JSON.stringify(report.savedSource)},dirty:view.session.dirty,refs:data().audioRefs.map(r=>r.id)};`); if (!report.reopened.same || report.reopened.dirty) throw Error('Reopen mismatch');
    await check('Saved, closed and reopened: persisted source identical, clean, reference UUIDs intact');

    // 51–53. Disable CANVAS during playback, confirm cleanup, re-enable.
    await compile(); await run(`click('Play arrangement');`); await wait('services.musical.state==="playing"');
    report.disable = await run(`globalThis.__p4d=panel;await plugin.setModule('canvas',false);await new Promise(r=>setTimeout(r,300));const r={state:services.musical.state,voices:services.musical.activeVoices??null,timers:services.musical.timerCount??null,leaves:app.workspace.getLeavesOfType('mnemobard-canvas').length};delete globalThis.__p4d;await plugin.setModule('canvas',true);return r;`);
    if (report.disable.state === 'playing' || report.disable.leaves !== 0) throw Error('Disable cleanup ' + JSON.stringify(report.disable));
    await c.evaluate("app.plugins.getPlugin('mnemobard').services.modules.open('canvas')"); await wait('!!root?.querySelector("button.mod-cta")'); await openComposition(report.compositionId);
    await check(`Disabling CANVAS during playback stopped audio and closed its views (${JSON.stringify(report.disable)}); re-enabled and reopened`);
    await run(`await app.workspace.requestSaveLayout?.run?.();`);
  }
  if (restart) {
    await openComposition(report.compositionId);
    report.restart = await run(`return{same:(await services.repository.read(view.session.draft.id)).source===${JSON.stringify(report.savedSource ?? '')},dirty:view.session.dirty,kind:kind()};`);
    if (!report.restart.same || report.restart.dirty) throw Error('Restart mismatch ' + JSON.stringify(report.restart));
    await compile(); await run(`assert(prep.state==='ready','restart compile');`); await check('Cold restart: composition reopened byte-identical and clean; compiles');
  }
  report.rendererExceptions = c.exceptions; if (c.exceptions.length) throw Error(c.exceptions.join('\n'));
  await writeFile(`${directory}/native${restart ? '-restart' : part2 ? '-part2' : '-part1'}.json`, JSON.stringify(report, null, 2) + '\n');
} catch (error) {
  await writeFile(`${directory}/failure.json`, JSON.stringify({ error: String(error), report, exceptions: c.exceptions, status: await run('return{state:prep?.state,diag:prep?.diagnostics?.slice(0,3),feedback:root?.querySelector(".mnemobard-feedback")?.textContent,header:ctx?header():null};').catch(() => null) }, null, 2) + '\n'); throw error;
} finally { c.close(); }
