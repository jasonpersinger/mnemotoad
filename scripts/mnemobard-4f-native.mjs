/**
 * Real-host Milestone 4F workflow (§13) + screenshots (§14). Disposable vault only (CDP refuses others).
 * Usage: node scripts/mnemobard-4f-native.mjs              (steps 1–22, responsive, themes, keyboard, plugin reload)
 *        node scripts/mnemobard-4f-native.mjs --verify-restart   (steps 23–24 after a cold restart)
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { connect } from './obsidian-cdp.mjs';

const directory = 'output/mnemobard/milestone-4f', vaultRoot = 'dev-vault';
await mkdir(directory, { recursive: true });
const c = await connect(), stamp = String(Date.now()), pause = ms => new Promise(r => setTimeout(r, ms)), restart = process.argv.includes('--verify-restart');
let report = { stamp, checks: [], screenshots: [], observations: {} };
if (restart) report = { ...JSON.parse(await readFile(`${directory}/native-part1.json`, 'utf8')), stamp, checks: [], screenshots: [] };
const prefix = `const plugin=app.plugins.getPlugin('mnemobard'),services=plugin.services,leaf=t=>app.workspace.getLeavesOfType('mnemobard-'+t)[0],cv=leaf('canvas')?.view,mv=leaf('motif')?.view,pb=leaf('patchbook')?.view,root=cv?.contentEl,prep=cv?.performancePanel?.preparation,insp=root?.querySelector('.mnemobard-canvas-inspector');const assert=(v,m)=>{if(!v)throw Error(m);};const click=(text,scope)=>{const b=[...scope.querySelectorAll('button')].find(b=>b.textContent===text&&!b.disabled);assert(b,'Missing active button '+text);b.click();};const input=(label,value,scope)=>{const e=[...scope.querySelectorAll('input,textarea')].find(e=>e.getAttribute('aria-label')===label);assert(e,'Missing field '+label);e.value=value;e.dispatchEvent(new Event('input',{bubbles:true}));};const lastNav=()=>services.navigation.trace?.filter(e=>e.phase==='selected').at(-1);`;
async function run(body) { try { return await c.evaluate(`(globalThis.__n4f=(async()=>{${prefix}${body}})())`); } finally { await c.evaluate('delete globalThis.__n4f'); } }
async function wait(test, tries = 450) { for (let i = 0; i < tries; i++) { if (await run(`return (${test});`)) return; await pause(30); } throw Error('Timed out: ' + test); }
async function check(step, text) { report.checks.push({ step, text }); console.log('✓', step, text); await writeFile(`${directory}/partial${restart ? '-restart' : ''}.json`, JSON.stringify(report, null, 2) + '\n'); }
async function shot(name, scroll) { if (scroll) await run(`const e=${scroll};e?.scrollIntoView({block:'center'});`); await pause(250); const s = await c.command('Page.captureScreenshot', { format: 'png' }); await writeFile(`${directory}/${name}.png`, Buffer.from(s.data, 'base64')); if (!report.screenshots.includes(name + '.png')) report.screenshots.push(name + '.png'); }
const theme = async name => { await run(`app.changeTheme?.(${JSON.stringify(name)});`); await pause(300); };
const activate = async t => { await run(`await services.modules.open('${t}');app.workspace.setActiveLeaf(leaf('${t}'),{focus:true});`); await pause(150); };
const KEYS = { Tab: 9 }; async function key(name) { for (const type of ['keyDown', 'keyUp']) await c.command('Input.dispatchKeyEvent', { type, key: name, code: name, windowsVirtualKeyCode: KEYS[name] ?? 0 }); await pause(80); }
async function exportMidi(path, capture) { await run(`root.querySelector('.mnemobard-arrangement-seek').open=true;click('Export arrangement MIDI',root);`); await wait('!!cv.performancePanel.dialog?.contentEl.querySelector("input")'); await run(`const d=cv.performancePanel.dialog;assert(d.containerEl.isConnected&&d.containerEl.ownerDocument===document,'dialog not visible');input('New arrangement MIDI destination',${JSON.stringify(path)},d.contentEl);`); if (capture) await shot(capture); await run(`click('Create arrangement MIDI',cv.performancePanel.dialog.contentEl);`); await wait("cv.performancePanel.dialog.contentEl.textContent.includes('Export created:')", 600); await run(`click('Cancel export',cv.performancePanel.dialog.contentEl);`); await wait('!cv.performancePanel.dialog?.containerEl.isConnected'); }
const verifyMidi = path => { const r = spawnSync('python3', ['scripts/verify-midi.py', `${vaultRoot}/${path}`], { encoding: 'utf8' }); let parsed; try { parsed = JSON.parse(r.stdout); } catch { parsed = undefined; } return { status: r.status, parsed, stderr: r.stderr.slice(0, 300) }; };
async function external(path, fn, label) { if (!path.startsWith('MNEMOBARD/')) throw Error('Refusing external edit outside MNEMOBARD/'); const before = await readFile(`${vaultRoot}/${path}`, 'utf8'), after = fn(before); if (after === before) throw Error('External edit changed nothing: ' + label); await writeFile(`${vaultRoot}/${path}`, after); return before; }
const pathOf = id => run(`const s=services.index.resolve(${JSON.stringify(id)});return s.status==='ready'?s.path:null;`);

try {
  await c.command('Page.bringToFront'); await c.command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  report.observations[restart ? 'activeDocumentAtRestart' : 'activeDocumentAtStart'] = await c.evaluate('activeDocument===document?"main":"other"');
  await theme('obsidian'); await run('services.navigation.trace=[];');
  if (!restart) {
    // ── Fixture (readable names; created once through the validating repository, reused on reruns) ──
    let fixture; try { fixture = JSON.parse(await readFile(`${directory}/fixture.json`, 'utf8')); } catch { fixture = undefined; }
    const ready = fixture?.sources ? await run(`return ${JSON.stringify(Object.values(fixture).filter(v => typeof v === 'string' && /^[0-9a-f-]{36}$/.test(v)))}.every(id=>services.index.resolve(id).status==='ready');`) : false;
    if (!ready) {
      fixture = await run(`const r=services.repository,u=()=>crypto.randomUUID(),base=(kind,title)=>({id:u(),kind,schemaVersion:1,title,extra:{}}),timing={schemaVersion:1,ppq:960,tempoMicrosecondsPerQuarter:500000,meter:{numerator:4,denominator:4}};
        const inst=await r.create({...base('instrument','Modular voice'),description:'Eurorack formant voice'});const chain=await r.create({...base('effects-chain','Tape and plate'),steps:[{id:u(),name:'Tape saturation'},{id:u(),name:'Plate reverb'}]});
        const patch=await r.create({...base('patch','Night choir'),instrument:'Modular voice',instrumentId:inst.entity.id,effectsChainIds:[chain.entity.id],description:'Breathy formant pad'});
        const notes=(pitches,step,dur)=>pitches.map((p,i)=>({id:u(),pitch:p,startTick:i*step,durationTicks:dur,velocity:72+i}));
        const a=await r.create({...base('motif','Ascending choir'),patchId:patch.entity.id,data:{...timing,lengthTicks:7680,notes:[...notes([60,62,64,65,67,69,71,72],960,960),{id:u(),pitch:48,startTick:0,durationTicks:7680,velocity:60}]}});
        const b=await r.create({...base('motif','Low pulse'),data:{...timing,lengthTicks:3840,notes:notes([36,36,43,36],960,480)}});
        const lost=await r.create({...base('motif','Lost voice'),patchId:'00000000-0000-4000-8000-0000004f0001',data:{...timing,lengthTicks:3840,notes:notes([67,65],960,960)}});
        await services.index.settled();const s=services.canvas.create(),l1=u(),l2=u();
        s.edit('Fixture',c=>({...c,title:'Night procession',description:'4F cross-module fixture',data:{...c.data,lengthTicks:960*4*32,lanes:[{id:l1,name:'Choir',clips:[]},{id:l2,name:'Pulse',clips:[]}]}}));
        services.canvas.place(s,l1,a.entity.id,0,2);services.canvas.place(s,l1,a.entity.id,7680*2,1);services.canvas.place(s,l2,b.entity.id,0,4);await s.save();
        return{instrument:inst.entity.id,chain:chain.entity.id,patch:patch.entity.id,motifA:a.entity.id,motifB:b.entity.id,lost:lost.entity.id,composition:s.draft.id};`);
      fixture.sources = {}; for (const key of ['patch', 'motifA', 'motifB', 'composition']) fixture.sources[key] = await run(`const r=await services.repository.read(${JSON.stringify(fixture[key])});return{path:r.path,source:r.source};`);
      await writeFile(`${directory}/fixture.json`, JSON.stringify(fixture, null, 2) + '\n');
    }
    report.fixture = fixture; const F = fixture, q = JSON.stringify;
    await run(`for(const d of services.canvas.drafts())if(d.draft.id===${q(F.composition)})services.canvas.discard(d);for(const d of services.motifs.drafts())if([${q(F.motifA)},${q(F.motifB)}].includes(d.draft.id))services.motifs.discard?.(d);for(const d of services.patchbook.getDrafts())if(d.draft.id===${q(F.patch)})services.patchbook.discard(d);`);
    // Deterministic reruns: restore the fixture notes' original bytes (guarded to MNEMOBARD/, located by UUID).
    for (const [key, original] of Object.entries(F.sources ?? {})) { const where = await pathOf(F[key]); if (where?.startsWith('MNEMOBARD/') && (await readFile(`${vaultRoot}/${where}`, 'utf8')) !== original.source) { await writeFile(`${vaultRoot}/${where}`, original.source); (report.restored ??= []).push(key); } }
    if (report.restored) { await pause(900); await run(`await services.index.settled();for(const d of services.canvas.drafts())if(d.draft.id===${q(F.composition)})services.canvas.discard(d);const cur=leaf('canvas')?.view?.session;if(cur?.draft.id===${q(F.composition)})services.canvas.discard(cur);`); }
    report.before = { composition: await run(`return (await services.repository.read(${q(F.composition)})).source;`), motifA: await run(`return (await services.repository.read(${q(F.motifA)})).source;`) };

    // 1–3 PATCHBOOK
    report.modules = await run(`return['patchbook','motif','canvas'].map(m=>services.modules.enabled(m));`);
    await activate('patchbook'); await wait('!!leaf("patchbook")?.view?.contentEl.querySelector("nav")'); await shot('01-patchbook-overview');
    await run(`await pb.setState({selectedId:${q(F.patch)}});`); await wait(`pb.currentSession?.draft.id===${q(F.patch)}&&pb.contentEl.textContent.includes('Motifs using this patch')`);
    report.patchbook = await run(`const g=pb.contentEl.querySelector('[aria-label="Motifs using this patch"]');return{heading:g.querySelector('h3').textContent,names:[...g.querySelectorAll('.mnemobard-ref-name')].map(e=>e.textContent)};`);
    await shot('02-patchbook-associated-motifs', `pb.contentEl.querySelector('[aria-label="Motifs using this patch"]')`);
    // 8.1 unsaved PATCHBOOK metadata survives navigation
    await run(`const s=pb.currentSession;s.update({...s.draft,notes:'Unsaved PATCHBOOK note (4F)'});`);
    await check('1–3', `PATCHBOOK opened; patch “Night choir” lists ${report.patchbook.heading} (${report.patchbook.names.join(', ')}); an unsaved metadata edit is pending`);

    // 4–6 MOTIF
    await run(`click('Open in MOTIF',pb.contentEl.querySelector('[aria-label="Motifs using this patch"]'));`); await wait(`leaf('motif')?.view?.session?.draft.id===${q(F.motifA)}&&app.workspace.activeLeaf===leaf('motif')`);
    report.patchDraftKept = await run(`return services.patchbook.getDrafts().some(d=>d.draft.notes==='Unsaved PATCHBOOK note (4F)');`);
    report.motif = await run(`const l=mv.contentEl.querySelector('.mnemobard-motif-links');return{sound:[...l.querySelectorAll('[aria-label="Sound associations"] .mnemobard-ref-row')].map(r=>r.querySelector('.mnemobard-ref-role').textContent+': '+r.querySelector('.mnemobard-ref-name').textContent+' ['+r.dataset.refStatus+']'),usage:l.querySelector('[aria-label="Compositions using this motif"]').textContent.slice(0,140)};`);
    await shot('03-motif-sound-associations', `mv.contentEl.querySelector('.mnemobard-motif-links')`); await shot('04-motif-referencing-compositions', `mv.contentEl.querySelector('[aria-label="Compositions using this motif"]')`);
    const notesBefore = await run('return mv.session.draft.data.notes.length;');
    // Add after the selected B4 (an unselected Add note would stack a C4 on the existing one, which MOTIF correctly refuses).
    await run(`const n=mv.session.draft.data.notes.find(n=>n.pitch===71);mv.session.select([n.id]);click('Add note',mv.contentEl);`); await wait(`mv.session.draft.data.notes.length===${notesBefore + 1}&&mv.session.dirty`);
    await run(`click('Save motif',mv.contentEl);`); await wait('!mv.session.dirty&&mv.session.status==="Saved"');
    if (!report.patchDraftKept) throw Error('PATCHBOOK draft lost');
    await check('4–6', `Open in MOTIF selected “Ascending choir” (PATCHBOOK draft kept: ${report.patchDraftKept}); sound chain ${JSON.stringify(report.motif.sound)}; usage “${report.motif.usage}”; added a note and saved`);

    // 7–11 CANVAS clip, inspect, back to MOTIF and PATCHBOOK, return
    await run(`click('Open in CANVAS',mv.contentEl.querySelector('[aria-label="Compositions using this motif"]'));`);
    await wait(`leaf('canvas')?.view?.session?.draft.id===${q(F.composition)}&&!!leaf('canvas').view.session.selectedClip`);
    report.focus = await run(`const s=cv.session,clip=s.draft.data.lanes.flatMap(l=>l.clips).find(c=>c.id===s.selectedClip);return{motif:clip.motifId,ok:clip.motifId===${q(F.motifA)}};`);
    await run(`cv.performancePanel.preparation.state==='ready'||await cv.performancePanel.preparation.prepare();`);
    report.inspector = await run(`const g=insp.querySelector('[aria-label="Source and sound"]');return[...g.querySelectorAll('.mnemobard-ref-row')].map(r=>r.querySelector('.mnemobard-ref-role').textContent+': '+r.querySelector('.mnemobard-ref-name').textContent+' ['+r.dataset.refStatus+']');`);
    await shot('05-canvas-overview'); await shot('06-canvas-clip-inspector-associations', `insp.querySelector('[aria-label="Source and sound"]')`);
    await run(`click('Open in MOTIF',insp.querySelector('[aria-label="Source and sound"]'));`); await wait(`lastNav()?.to==='motif'&&leaf('motif').view.session?.draft.id===${q(F.motifA)}`);
    await run(`click('Open in PATCHBOOK',mv.contentEl.querySelector('[aria-label="Sound associations"]'));`); await wait(`lastNav()?.to==='patchbook'&&pb.currentSession?.draft.id===${q(F.patch)}`);
    report.patchDraftAfterRoundTrip = await run(`return pb.currentSession.draft.notes==='Unsaved PATCHBOOK note (4F)'&&pb.currentSession.dirty;`);
    await activate('canvas'); report.returned = await run(`return{id:cv.session.draft.id,dirty:cv.session.dirty,clip:cv.session.selectedClip};`);
    if (!report.focus.ok || !report.patchDraftAfterRoundTrip || report.returned.id !== F.composition) throw Error('Chain ' + JSON.stringify({ focus: report.focus, pb: report.patchDraftAfterRoundTrip, returned: report.returned }));
    await check('7–11', `Open in CANVAS opened “Night procession” and selected the motif's clip; inspector ${JSON.stringify(report.inspector)}; Open in MOTIF → Open in PATCHBOOK returned to “Night choir” with its unsaved note still pending; CANVAS kept its state`);

    // 12–13 placement, undo/redo
    const clip0 = await run('return cv.session.selectedClip;'), start0 = await run(`return cv.session.draft.data.lanes.flatMap(l=>l.clips).find(c=>c.id===${q(clip0)}).startTick;`);
    await run(`input('Clip raw start tick',String(${start0}+960),insp);click('Apply clip placement',insp);`); await wait(`cv.session.draft.data.lanes.flatMap(l=>l.clips).find(c=>c.id===${q(clip0)}).startTick===${start0 + 960}`);
    await run(`click('Undo',root);`); const afterUndo = await run(`return cv.session.draft.data.lanes.flatMap(l=>l.clips).find(c=>c.id===${q(clip0)}).startTick;`);
    await run(`click('Redo',root);`); const afterRedo = await run(`return cv.session.draft.data.lanes.flatMap(l=>l.clips).find(c=>c.id===${q(clip0)}).startTick;`);
    await run(`click('Undo',root);`); if (afterUndo !== start0 || afterRedo !== start0 + 960) throw Error('Undo/redo');
    await check('12–13', `Moved the clip by one beat through the inspector; Undo → ${afterUndo}, Redo → ${afterRedo}, Undo again (net unchanged)`);

    // 14–16 compile, transport, export
    // The motif was saved in step 6, so each placing clip must explicitly acknowledge the new source revision (4B rule) — as a user would.
    report.acknowledged = await run(`const ids=[...new Set(cv.plan.diagnostics.filter(d=>d.code==='changed').map(d=>d.clipId))];for(const id of ids){const lane=cv.session.draft.data.lanes.find(l=>l.clips.some(c=>c.id===id));cv.select(lane.id,id);const r=insp.querySelector('.mnemobard-canvas-source-review');r.open=true;click('Acknowledge displayed source revision',r);}return ids.length;`);
    await run(`click('Compile arrangement',root);`); await wait(`prep.state==='ready'`); report.statusText = await run(`return root.querySelector('.mnemobard-arrangement-state').textContent;`);
    await shot('07-canvas-transport-status', `root.querySelector('.mnemobard-canvas-transport')`);
    const st = async () => run('return services.musical.state;');
    await run(`click('Return to start',root);click('Play arrangement',root);`); await wait('services.musical.state==="playing"'); await pause(400);
    const pos1 = await run('return cv.performancePanel.currentTick;'); await run(`click('Pause',root);`); await wait('services.musical.state==="paused"');
    await run(`click('Resume',root);`); await wait('services.musical.state==="playing"'); await pause(300); const pos2 = await run('return cv.performancePanel.currentTick;');
    await run(`click('Stop arrangement',root);`); await wait('services.musical.state==="stopped"');
    await run(`root.querySelector('.mnemobard-arrangement-seek').open=true;input('Arrangement seek (bar:beat:tick)','2:1:0',root);root.querySelector('.mnemobard-arrangement-seek form').requestSubmit();`); await pause(150); const seek = await run('return cv.performancePanel.currentTick;');
    // Completion: the transport plays to the composition's full length (trailing silence, like the MIDI end-of-track); start in the last bar.
    await run(`input('Arrangement seek (bar:beat:tick)','32:1:0',root);root.querySelector('.mnemobard-arrangement-seek form').requestSubmit();`); await pause(150);
    await run(`click('Play arrangement',root);`); await wait('services.musical.state==="playing"'); report.completion = { startedAt: await run('return cv.performancePanel.currentTick;') };
    await wait('services.musical.state==="stopped"', 700); report.completion.diagnostic = await run('return services.musical.diagnosticFor?.(cv)??services.musical.diagnostic??"";');
    report.transport = { pos1, pos2, seek, finalState: await st() };
    if (!(pos2 > pos1 && pos1 > 0) || seek !== 3840) throw Error('Transport ' + JSON.stringify(report.transport));
    report.export1 = `MNEMOBARD/Exports/night-procession-4f-${stamp}-a.mid`; report.export2 = `MNEMOBARD/Exports/night-procession-4f-${stamp}-b.mid`;
    await exportMidi(report.export1, '15-midi-export-dialog'); await exportMidi(report.export2);
    report.deterministic = (await readFile(`${vaultRoot}/${report.export1}`)).equals(await readFile(`${vaultRoot}/${report.export2}`));
    const v = verifyMidi(report.export1), tracks = v.parsed?.tracks ?? [], ons = tracks.flatMap(t => t.events.filter(e => e[1] === 'on'));
    report.midi = { status: v.status, format: v.parsed?.format, ppq: v.parsed?.ppq, tracks: tracks.map(t => t.name.replace(/^[0-9a-f-]{36} · /, '')), endTicks: [...new Set(tracks.map(t => t.endTick))], noteOns: ons.length, channels: [...new Set(ons.map(e => e[2]))], firstOn: tracks[1]?.events[0], ordered: tracks.every(t => t.events.every((e, i, a) => i === 0 || a[i - 1][0] <= e[0])) };
    // Expected note-ons from the SAVED sources: Ascending choir × (2 + 1 repetitions) + Low pulse × 4; 32 bars → endTick 122880 (trailing silence kept).
    report.midi.expectedNoteOns = await run(`const n=id=>services.index.resolve(id).entity.data.notes.length;return n(${q(F.motifA)})*3+n(${q(F.motifB)})*4;`);
    if (v.status !== 0 || !report.deterministic || report.midi.ppq !== 960 || report.midi.noteOns !== report.midi.expectedNoteOns || report.midi.endTicks.join() !== '122880' || report.midi.channels.length !== 2 || !report.midi.ordered) throw Error('MIDI ' + JSON.stringify(report.midi));
    await check('14–16', `Compiled (“${report.statusText}”); play/pause/resume/stop advanced the playhead (${pos1} → ${pos2}), seek 2:1:0 → ${seek}, playback completed (${report.transport.finalState}${report.completion.diagnostic ? ', ' + report.completion.diagnostic : ''}); export deterministic and independently verified ${JSON.stringify(report.midi)}`);

    // 17–18 reopen, persistence
    await run(`if(cv.session.dirty)click('Save composition',root);`); await wait('!cv.session.dirty');
    report.saved = await run(`return (await services.repository.read(${q(F.composition)})).source;`);
    await run(`cv.leaf.detach();`); await activate('canvas'); await run(`await leaf('canvas').view.setState({selectedId:${q(F.composition)}});`); await wait(`leaf('canvas').view.session?.draft.id===${q(F.composition)}`);
    report.reopened = await run(`return{same:(await services.repository.read(${q(F.composition)})).source===${q(report.saved)},dirty:cv.session.dirty,clips:cv.session.draft.data.lanes.flatMap(l=>l.clips).length};`);
    if (!report.reopened.same || report.reopened.dirty || report.reopened.clips !== 3) throw Error('Reopen ' + JSON.stringify(report.reopened));
    await check('17–18', `Closed and reopened “Night procession”: byte-identical, clean, 3 clips`);

    // 19–20 external source changes: motif duration (musical source) and patch metadata (context only)
    await run(`click('Compile arrangement',root);`); await wait(`prep.state==='ready'`);
    const patchPath = await pathOf(F.patch), patchText = await external(patchPath, t => t.replace('Breathy formant pad', 'Breathy formant pad (edited elsewhere)'), 'patch metadata');
    await pause(900); report.afterPatchEdit = await run('return prep.state;');
    await writeFile(`${vaultRoot}/${patchPath}`, patchText);
    const motifPath = await pathOf(F.motifA), motifText = await external(motifPath, t => t.replace('"lengthTicks": 7680', '"lengthTicks": 8640'), 'motif duration');
    await wait(`prep.state==='invalidated'`); await run(`click('Compile arrangement',root);`); await wait(`!['resolving','compiling'].includes(prep.state)`);
    report.afterSourceEdit = await run(`return{state:prep.state,codes:[...new Set(prep.diagnostics.map(d=>d.code))],clipDiag:[...new Set(cv.plan.diagnostics.map(d=>d.code))]};`);
    await writeFile(`${vaultRoot}/${motifPath}`, motifText); await pause(900); await run(`click('Compile arrangement',root);`); await wait(`prep.state==='ready'`, 600);
    if (report.afterPatchEdit !== 'ready' || report.afterSourceEdit.state === 'ready') throw Error('Source/patch external ' + JSON.stringify({ p: report.afterPatchEdit, s: report.afterSourceEdit }));
    await check('19–20', `External patch-metadata edit kept the compilation (${report.afterPatchEdit}); external motif-duration edit invalidated it and blocked compilation (${JSON.stringify(report.afterSourceEdit)}) until the exact text was restored`);

    // 21–22 conflict and recovery copy
    await run(`const s=cv.session;s.edit('Add marker',c=>({...c,data:{...c.data,markers:[...c.data.markers,{id:crypto.randomUUID(),label:'Unsaved 4F cue',tick:1920}]}}));`);
    const compPath = await pathOf(F.composition); await external(compPath, t => t.replace(/^mnemobard_description: .*$/m, 'mnemobard_description: Changed in another app (4F)'), 'composition description');
    await wait(`cv.session.freshness.state==='conflict'`); await shot('10-external-change-conflict', `root.querySelector('.mnemobard-freshness-banner')`);
    await run(`click('Store recovery copy and open recovery',root.querySelector('.mnemobard-freshness-banner'));`); await wait(`root.textContent.includes('Close composition recovery')`);
    report.recovery = { path: await run('return cv.session.recoveryPath;') }; report.recovery.contains = (await readFile(`${vaultRoot}/${report.recovery.path}`, 'utf8')).includes('Unsaved 4F cue');
    report.recovery.listed = await run(`return root.querySelector('.mnemobard-recovery, section')?.textContent.length>0;`);
    report.recovery.diskUntouched = (await readFile(`${vaultRoot}/${compPath}`, 'utf8')).includes('Changed in another app (4F)');
    if (!report.recovery.contains || !report.recovery.diskUntouched) throw Error('Recovery ' + JSON.stringify(report.recovery));
    await run(`click('Close composition recovery',root);`);
    await check('21–22', `External description edit with an unsaved marker → protected conflict; recovery copy stored (${report.recovery.path}) and contains the unsaved cue; the note on disk was not overwritten`);
    // Leave the conflict + draft in place for the restart: the draft is checkpointed and must be recoverable after restart.
    await run('await cv.session.checkpoint();'); report.pendingRecovery = report.recovery.path;

    // Missing reference (MOTIF “Lost voice”), advanced controls, themes, responsive, keyboard
    await activate('motif'); await run(`await mv.setState({selectedId:${q(F.lost)}});`); await wait(`mv.session?.draft.id===${q(F.lost)}`);
    report.missing = await run(`const r=mv.contentEl.querySelector('[aria-label="Sound associations"] .mnemobard-ref-row');return{status:r.dataset.refStatus,text:r.textContent.slice(0,160),patchId:mv.session.draft.patchId};`);
    if (report.missing.status !== 'missing' || report.missing.patchId !== '00000000-0000-4000-8000-0000004f0001') throw Error('Missing ' + JSON.stringify(report.missing));
    await shot('09-missing-reference', `mv.contentEl.querySelector('[aria-label="Sound associations"]')`);
    await activate('canvas');
    await run(`for(const d of root.querySelectorAll('.mnemobard-canvas-tools details'))d.open=false;const r=root.querySelector('.mnemobard-arrangement-routing');r.open=true;root.querySelector('.mnemobard-arrangement-compilation').open=true;`); await shot('08-canvas-advanced-controls', `root.querySelector('.mnemobard-canvas-tools')`);
    await run('root.scrollTop=0;'); await shot('11-dark-full'); await theme('moonstone'); await run('root.scrollTop=0;'); await shot('12-light-full'); await theme('obsidian');
    report.responsive = {};
    for (const [label, width] of [['wide', 1920], ['standard', 1366], ['900', 980], ['600', 680]]) {
      await c.command('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false }); await pause(350);
      report.responsive[label] = await run(`const r=root;const rows=['.mnemobard-canvas-header','.mnemobard-canvas-transport','.mnemobard-canvas-workspace-bar'].map(s=>Math.round(r.querySelector(s).getBoundingClientRect().height));return{content:r.clientWidth,overflow:r.scrollWidth-r.clientWidth,regionHeights:rows,timeline:Math.round(r.querySelector('.mnemobard-arrangement-surface').getBoundingClientRect().width)};`);
      if (label === '600') { await run('root.scrollTop=0;'); await shot('13-narrow-layout'); }
    }
    await c.command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    if (Object.values(report.responsive).some(r => r.overflow > 1)) throw Error('Overflow ' + JSON.stringify(report.responsive));
    await run(`click('Next clip',root);`); await run(`const btns=[...insp.querySelectorAll('[aria-label="Source and sound"] button')];btns[0].focus();`); await key('Tab');
    report.keyboard = await run(`const a=document.activeElement;return{tag:a.tagName,label:a.getAttribute('aria-label')??a.textContent,focusVisible:a.matches(':focus-visible'),outline:getComputedStyle(a).outlineStyle};`);
    await shot('14-keyboard-focus', 'document.activeElement');
    if (!report.keyboard.focusVisible || report.keyboard.outline === 'none') throw Error('Focus ' + JSON.stringify(report.keyboard));
    await check('extras', `Missing patch reference shown, explained and kept (${JSON.stringify(report.missing)}); advanced controls collapsed under More tools; dark/light; responsive without horizontal overflow ${JSON.stringify(report.responsive)}; keyboard focus ring on ${JSON.stringify(report.keyboard)}`);

    // 8.4 plugin reload: an unsaved MOTIF draft is recoverable, never overwriting the saved record
    await activate('motif'); await run(`await mv.setState({selectedId:${q(F.motifB)}});`); await wait(`mv.session?.draft.id===${q(F.motifB)}`);
    const savedB = await run(`return (await services.repository.read(${q(F.motifB)})).source;`);
    const checkpointB = await run(`mv.session.edit('Rename',m=>({...m,title:'Low pulse (unsaved 4F)'}));await mv.session.checkpoint();return mv.session.recoveryPath;`);
    await run(`await app.plugins.disablePlugin('mnemobard');await app.plugins.enablePlugin('mnemobard');`); await wait(`!!app.plugins.getPlugin('mnemobard')?.services`);
    report.pluginReload = await run(`const items=await (async r=>{const all=[];for(let o=0;;){const p=await r.discover(o);all.push(...p.entries);o+=p.entries.length;if(!p.entries.length||o>=p.total)break;}return all;})(services.motifs.recovery);return{checkpoint:${q(checkpointB)},listed:JSON.stringify(items).includes(${q(checkpointB)}),saved:(await services.repository.read(${q(F.motifB)})).source===${q(savedB)}};`).catch(e => ({ error: String(e) }));
    if (!report.pluginReload.listed || !report.pluginReload.saved) throw Error('Plugin reload ' + JSON.stringify(report.pluginReload));
    await check('8.4', `Plugin reload with an unsaved MOTIF draft: checkpoint listed for recovery (${JSON.stringify(report.pluginReload)}); saved motif unchanged`);
    report.trace = await run('return services.navigation.trace??[];');
    await writeFile(`${directory}/navigation-trace.json`, JSON.stringify({ note: 'Phases, modules and UUIDs only.', trace: report.trace }, null, 2) + '\n'); delete report.trace;
    await c.evaluate('app.workspace.requestSaveLayout?.run?.()');
  } else {
    const F = report.fixture, q = JSON.stringify;
    await activate('canvas'); await run(`await leaf('canvas').view.setState({selectedId:${q(F.composition)}});`); await wait(`leaf('canvas').view.session?.draft.id===${q(F.composition)}`);
    report.restart = await run(`const r=await services.repository.read(${q(F.composition)});const list=await (async r=>{const all=[];for(let o=0;;){const p=await r.discover(o);all.push(...p.entries);o+=p.entries.length;if(!p.entries.length||o>=p.total)break;}return all;})(services.canvas.recovery);return{saved:r.source.includes('Changed in another app (4F)'),dirty:cv.session.dirty,clips:cv.session.draft.data.lanes.flatMap(l=>l.clips).length,recoveryListed:JSON.stringify(list).includes(${q(report.pendingRecovery ?? '')})};`);
    report.recoveryFileIntact = (await readFile(`${vaultRoot}/${report.pendingRecovery}`, 'utf8')).includes('Unsaved 4F cue');
    if (!report.restart.saved || report.restart.clips !== 3 || !report.recoveryFileIntact || !report.restart.recoveryListed) throw Error('Restart ' + JSON.stringify(report.restart));
    await run(`click('Compile arrangement',root);`); await wait(`prep.state==='ready'`, 600);
    await check('23–24', `After a cold restart: saved composition intact (external description kept, 3 clips, compiles); recovery copy with the unsaved cue intact on disk (listed in recovery: ${report.restart.recoveryListed})`);
  }
  report.rendererExceptions = c.exceptions; if (c.exceptions.length) throw Error(c.exceptions.join('\n'));
  await writeFile(`${directory}/native-${restart ? 'restart' : 'part1'}.json`, JSON.stringify(report, null, 2) + '\n');
} catch (error) {
  await writeFile(`${directory}/failure${restart ? '-restart' : ''}.json`, JSON.stringify({ error: String(error), report, exceptions: c.exceptions }, null, 2) + '\n');
  console.error('FAILED:', String(error)); process.exitCode = 1;
} finally { c.close(); }
