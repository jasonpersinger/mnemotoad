/**
 * Real-host Milestone 4E workflow (Prompt012 §17): document freshness, navigation readiness, modal lifecycle, recording
 * references, musical regression, interface regression and restart. External edits are written with node:fs into the marked
 * disposable vault (a genuinely outside-Obsidian change). Deletion is exercised only on a scratch composition created here.
 * Usage: node scripts/canvas-4e-native.mjs            (phases A–G, H 77–79)
 *        node scripts/canvas-4e-native.mjs --verify-restart   (after a cold restart: cold-start navigation, H 80–84)
 */
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { connect } from './obsidian-cdp.mjs';

const directory = 'output/canvas/milestone-4e', vaultRoot = 'dev-vault', recordings = 'MNEMOBARD/Recordings 4E';
await mkdir(directory, { recursive: true });
const c = await connect(), stamp = String(Date.now()), pause = ms => new Promise(r => setTimeout(r, ms));
const restart = process.argv.includes('--verify-restart');
let report = { stamp, checks: [], retries: [], screenshots: [], observations: {}, freshnessEvents: [] };
if (restart) report = { ...JSON.parse(await readFile(`${directory}/native-part1.json`, 'utf8')), stamp, checks: [], screenshots: [] };
const prefix = `const plugin=app.plugins.getPlugin('mnemobard'),services=plugin.services,view=app.workspace.getLeavesOfType('mnemobard-canvas')[0]?.view,root=view?.contentEl,panel=view?.performancePanel,prep=panel?.preparation,sp=view?.structurePanel,tl=view?.timeline,sx=root?.querySelector('.mnemobard-canvas-structure'),ctx=root?.querySelector('.mnemobard-canvas-context'),nav=services?.navigation,mv=app.workspace.getLeavesOfType('mnemobard-motif')[0]?.view,pb=app.workspace.getLeavesOfType('mnemobard-patchbook')[0]?.view;const assert=(v,m)=>{if(!v)throw Error(m);};const click=(text,scope=root)=>{const b=[...scope.querySelectorAll('button')].find(b=>b.textContent===text&&!b.disabled);assert(b,'Missing active button '+text);b.click();};const input=(label,value,scope=root)=>{const e=[...scope.querySelectorAll('input,textarea')].find(e=>e.getAttribute('aria-label')===label);assert(e,'Missing field '+label);e.value=value;e.dispatchEvent(new Event('input',{bubbles:true}));};const select=(label,value,scope=root)=>{const e=[...scope.querySelectorAll('select')].find(e=>e.getAttribute('aria-label')===label);assert(e,'Missing select '+label);e.value=value;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));};const data=()=>view.session.draft.data;const kind=()=>[['none','.mnemobard-context-empty'],['clip','.mnemobard-canvas-inspector'],['lane','.mnemobard-context-lane'],['structure','.mnemobard-context-structure']].filter(([,s])=>!ctx.querySelector(s).hidden).map(([k])=>k).join();const header=()=>ctx.querySelector('.mnemobard-context-header').textContent;const fresh=()=>view.session.freshness;const indicator=()=>root.querySelector('.mnemobard-freshness')?.textContent;const banner=()=>root.querySelector('.mnemobard-freshness-banner');const visible=m=>!!m&&m.containerEl.isConnected&&m.containerEl.ownerDocument===document&&m.contentEl.getBoundingClientRect().width>0;`;
async function run(body) { try { return await c.evaluate(`(globalThis.__native4e=(async()=>{${prefix}${body}})())`); } finally { await c.evaluate('delete globalThis.__native4e'); } }
async function wait(test, tries = 450) { for (let i = 0; i < tries; i++) { if (await run(`return (${test});`)) return; await pause(30); } throw Error('Timed out: ' + test); }
async function check(step, text) { report.checks.push({ step, text }); console.log('✓', step, text); await writeFile(`${directory}/partial${restart ? '-restart' : ''}.json`, JSON.stringify(report, null, 2) + '\n'); }
async function capture(name) { const s = await c.command('Page.captureScreenshot', { format: 'png' }); await writeFile(`${directory}/${name}.png`, Buffer.from(s.data, 'base64')); if (!report.screenshots.includes(name + '.png')) report.screenshots.push(name + '.png'); }
async function shot(name, selector) { await run(`${selector ? `root.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'center'});` : 'root.scrollTop=0;'}assert(app.workspace.activeLeaf===view.leaf,'Hidden CANVAS screenshot');`); await pause(250); await capture(name); }
const sha = async path => createHash('sha256').update(await readFile(`${vaultRoot}/${path}`)).digest('hex');
function wav(seconds, frequency) { const rate = 8000, n = Math.round(rate * seconds), b = Buffer.alloc(44 + n * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40); for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i / rate * 2 * Math.PI * frequency) * 900), 44 + i * 2); return b; }
async function createWav(path, seconds, frequency) { await run(`if(!app.vault.getAbstractFileByPath(${JSON.stringify(recordings)}))await app.vault.createFolder(${JSON.stringify(recordings)});const bytes=Uint8Array.from(atob(${JSON.stringify(wav(seconds, frequency).toString('base64'))}),ch=>ch.charCodeAt(0));if(!app.vault.getAbstractFileByPath(${JSON.stringify(path)}))await app.vault.createBinary(${JSON.stringify(path)},bytes.buffer);`); await wait(`services.canvas.recordingStatus(${JSON.stringify(path)}).status==='available'`); }
const KEYS = { Escape: 27, Tab: 9, ']': 221, '[': 219, '.': 190, ',': 188 };
async function key(name) { for (const type of ['keyDown', 'keyUp']) await c.command('Input.dispatchKeyEvent', { type, key: name, code: name, windowsVirtualKeyCode: KEYS[name] ?? 0 }); await pause(80); }
async function compile() { await run(`click('Compile arrangement');`); await wait("!['resolving','compiling'].includes(prep.state)"); }
async function save() { await run(`click('Save composition');`); await wait("view.session.status==='Saved'"); }
async function exportMidi(path) { await run(`root.querySelector('.mnemobard-arrangement-seek').open=true;click('Export arrangement MIDI');`); await wait('!!panel.dialog?.contentEl.querySelector("input")'); await run(`assert(visible(panel.dialog),'Export dialog not visible in the main window');input('New arrangement MIDI destination',${JSON.stringify(path)},panel.dialog.contentEl);click('Create arrangement MIDI',panel.dialog.contentEl);`); await wait("panel.dialog.contentEl.textContent.includes('Export created:')", 600); await run(`click('Cancel export',panel.dialog.contentEl);`); await wait('!panel.dialog?.containerEl.isConnected'); }
async function openCanvas() { await c.evaluate("app.plugins.getPlugin('mnemobard').services.modules.open('canvas')"); await wait('!!root?.querySelector("button.mod-cta")'); }
async function openComposition(id) { await openCanvas(); await run(`await view.setState({selectedId:${JSON.stringify(id)}});`); await wait(`view.session?.draft.id===${JSON.stringify(id)}&&!!view.structurePanel`); }
async function focusCanvas() { await run(`app.workspace.setActiveLeaf(view.leaf,{focus:true});`); await pause(150); }
const theme = async name => { await run(`app.changeTheme?.(${JSON.stringify(name)});`); await pause(300); };
const verifyMidi = path => { const r = spawnSync('python3', ['scripts/verify-midi.py', `${vaultRoot}/${path}`], { encoding: 'utf8' }); return { status: r.status, stdout: r.stdout.slice(0, 400), stderr: r.stderr.slice(0, 400) }; };
/** Outside-Obsidian edit of the composition note (disposable vault only). `fn` must change the text exactly as intended. */
async function external(fn, label) {
  const path = await run('return view.session.base.path;'); if (!path.startsWith('MNEMOBARD/')) throw Error('Refusing external edit outside MNEMOBARD/');
  const before = await readFile(`${vaultRoot}/${path}`, 'utf8'), after = fn(before); if (after === before) throw Error('External edit changed nothing: ' + label);
  await writeFile(`${vaultRoot}/${path}`, after); report.freshnessEvents.push({ at: Date.now(), label, path, bytes: [before.length, after.length] }); return { path, before, after };
}
const replaceOnce = (text, from, to) => { const n = text.split(from).length - 1; if (n !== 1) throw Error(`Expected one occurrence of ${from}, found ${n}`); return text.replace(from, to); };
const noteFresh = async label => { const f = await run('return{state:fresh().state,areas:fresh().areas??null,musical:fresh().musical??null,reason:fresh().reason??null,rename:fresh().rename??null,indicator:indicator(),dirty:view.session.dirty};'); report.freshnessEvents.push({ at: Date.now(), label, ...f }); return f; };
async function recordingHashes() { const out = []; for (const dir of ['Recordings 4C', 'Recordings 4D', 'Recordings 4E']) { let names = []; try { names = await readdir(`${vaultRoot}/MNEMOBARD/${dir}`); } catch { continue; } for (const n of names) if (n.endsWith('.wav')) out.push(await sha(`MNEMOBARD/${dir}/${n}`)); } return out.sort(); }

try {
  await c.command('Page.bringToFront'); await c.command('Emulation.setDeviceMetricsOverride', { width: 1360, height: 1100, deviceScaleFactor: 1, mobile: false });
  report.observations[restart ? 'activeDocumentAtRestart' : 'activeDocumentAtStart'] = await c.evaluate('activeDocument===document?"main":activeDocument.defaultView?"other-live":"detached"');
  await theme('obsidian');
  const c4 = JSON.parse(await readFile('output/canvas/milestone-4c/native.json', 'utf8')), d4 = JSON.parse(await readFile('output/canvas/milestone-4d/native-part1.json', 'utf8'));
  report.compositionId = c4.compositionId;
  if (!restart) {
    // ── Phase A (1–7) ────────────────────────────────────────────────────────────
    report.modules = await run(`return{patchbook:services.modules.enabled('patchbook'),motif:services.modules.enabled('motif'),canvas:services.modules.enabled('canvas'),navigation:typeof nav?.navigate,freshness:typeof services.canvas.freshness};`);
    if (!Object.values(report.modules).every(v => v === true || v === 'function' || v === 'object')) throw Error('Startup ' + JSON.stringify(report.modules));
    await openCanvas();
    // A previous aborted 4E run is restored to its recorded starting bytes (guarded by UUID and MNEMOBARD/ prefix).
    let previous; try { previous = JSON.parse(await readFile(`${directory}/partial.json`, 'utf8')); } catch { previous = undefined; }
    await run(`for(const d of services.canvas.drafts())if(d.draft.id===${JSON.stringify(report.compositionId)})services.canvas.discard(d);`);
    if (previous?.compositionId === report.compositionId && previous.before?.source) {
      const where = await run(`const s=services.index.resolve(${JSON.stringify(report.compositionId)});return s.status==='ready'?s.path:null;`);
      if (where?.startsWith('MNEMOBARD/')) { const cur = await readFile(`${vaultRoot}/${where}`, 'utf8'); if (cur !== previous.before.source) { await writeFile(`${vaultRoot}/${where}`, previous.before.source); report.restoredStart = where; await pause(800); } }
    }
    // Discard any open session (clean ones too) so Phase A starts from a fresh open, not from a refresh of the restore above.
    await run(`await services.index.settled();for(const v of app.workspace.getLeavesOfType('mnemobard-canvas').map(l=>l.view))if(v.session?.draft.id===${JSON.stringify(report.compositionId)})services.canvas.discard(v.session);`);
    report.before = await run(`const r=await services.repository.read(${JSON.stringify(report.compositionId)});return{source:r.source,path:r.path};`);
    report.audioBefore = await recordingHashes();
    await openComposition(report.compositionId);
    report.start = await run(`const clips=data().lanes.flatMap(l=>l.clips);return{dirty:view.session.dirty,indicator:indicator(),status:view.session.status,sources:clips.map(c=>services.canvas.sources.get(c.motifId).status),counts:{lanes:data().lanes.length,clips:clips.length,sections:data().sections.length,markers:data().markers.length,references:data().audioRefs.length}};`);
    if (report.start.dirty || report.start.indicator !== 'Matches the saved note' || report.start.sources.some(s => s !== 'ready')) throw Error('Phase A start ' + JSON.stringify(report.start));
    await compile(); await run(`assert(prep.state==='ready','compile '+JSON.stringify(prep.diagnostics.slice(0,3)));`);
    report.export0 = `MNEMOBARD/Exports/arrangement-4e-baseline-${stamp}.mid`; await exportMidi(report.export0);
    report.export0MatchesD4 = (await readFile(`${vaultRoot}/${report.export0}`)).equals(await readFile(`${vaultRoot}/${d4.export0}`));
    if (!report.export0MatchesD4) throw Error('Baseline export differs from the 4D baseline export');
    await shot('01-workspace');
    await check('A 1–7', `Plugin started with all modules enabled (${JSON.stringify(report.modules)}); 4C/4D composition opened clean (“${report.start.indicator}”, ${JSON.stringify(report.start.counts)}); all ${report.start.sources.length} clip sources ready; compiled; export byte-identical to the 4D baseline`);

    // ── Phase B (8–24) Document freshness ───────────────────────────────────────
    await run(`click('Next clip');`); report.selectedClip = await run('return view.session.selectedClip;');
    // The arrangement's notes last ~2.6 s: start playback first (its verification completes), then write externally while it
    // plays, and record the transport state at the moment the session publishes the refresh. (Attempt 3 pressed Play right after
    // the write: Play's verification read the changed note before the refresh and failed closed — documented race outcome.)
    const section0 = await run('return data().sections[0].label;'), newLabel = `${section0} (4E external)`;
    const h0 = await run('return view.session.historySize;');
    // Timing-independent: wrap the transport's stop on this instance (harness only, restored below) to record who stops playback.
    await run(`delete globalThis.__refreshAt4e;globalThis.__stops4e=[];const m=services.musical,orig=m.stop;m.stop=function(...a){globalThis.__stops4e.push((new Error().stack??'').split('\\n').slice(2,6).map(x=>x.trim()).join(' | '));return orig.apply(this,a);};globalThis.__restoreStop4e=()=>{m.stop=orig;};const s=view.session;globalThis.__unsub4e=s.subscribe(()=>{if(s.freshness.state==='refreshed'&&!globalThis.__refreshAt4e)globalThis.__refreshAt4e={musical:services.musical.state,prep:prep.state};});`);
    await run(`click('Return to start');click('Play arrangement');`); await wait('services.musical.state==="playing"');
    await external(t => replaceOnce(t, `"label": ${JSON.stringify(section0)}`, `"label": ${JSON.stringify(newLabel)}`), 'clean metadata: section label');
    await wait(`fresh().state==='refreshed'&&data().sections.some(s=>s.label===${JSON.stringify(newLabel)})`);
    await wait('prep.state==="ready"&&prep.prepared?.baseSource===view.session.base.source');
    report.cleanRefresh = await run(`globalThis.__unsub4e?.();globalThis.__restoreStop4e?.();const stops=globalThis.__stops4e??[];return{stops,nonTransportStops:stops.filter(x=>!x.includes('pump')).length,selectedClip:view.session.selectedClip,history:view.session.historySize,canUndo:view.session.canUndo,dirty:view.session.dirty,prep:prep.state,playing:globalThis.__refreshAt4e?.musical,prepAtRefresh:globalThis.__refreshAt4e?.prep,indicator:indicator(),banner:!banner().hidden&&banner().textContent.slice(0,220),areas:fresh().areas};`);
    if (report.cleanRefresh.selectedClip !== report.selectedClip || report.cleanRefresh.history > h0 || report.cleanRefresh.canUndo || report.cleanRefresh.dirty || report.cleanRefresh.prep !== 'ready' || report.cleanRefresh.prepAtRefresh !== 'ready' || report.cleanRefresh.playing !== 'playing' || report.cleanRefresh.stops.length !== 0) throw Error('Clean refresh ' + JSON.stringify(report.cleanRefresh));
    await noteFresh('clean metadata refresh'); await shot('02-clean-external-refresh', '.mnemobard-freshness-banner'); await shot('06-metadata-refresh-compilation-ready', '.mnemobard-arrangement-transport');
    await check('B 8–12', `External metadata edit while clean: view refreshed (“${report.cleanRefresh.indicator}”), clip selection kept by UUID, no undo entry (history ${report.cleanRefresh.history}, canUndo ${report.cleanRefresh.canUndo}), compilation stayed ready and playback was still playing when the refresh published (${report.cleanRefresh.playing}; ${report.cleanRefresh.stops.length} stop calls)`);
    await external(t => t.replace(/"tempoMicrosecondsPerQuarter": 500000/, '"tempoMicrosecondsPerQuarter": 480000'), 'clean musical: tempo');
    await wait(`fresh().state==='refreshed'&&prep.state==='invalidated'&&data().tempoMicrosecondsPerQuarter===480000`);
    report.cleanMusical = await run('return{playing:services.musical.state,prep:prep.state,diag:prep.diagnostics[0]?.message,indicator:indicator(),musical:fresh().musical};');
    if (report.cleanMusical.playing === 'playing' || !report.cleanMusical.musical) throw Error('Musical refresh ' + JSON.stringify(report.cleanMusical));
    await noteFresh('clean musical refresh'); await shot('05-musical-invalidation-external', '.mnemobard-freshness-banner');
    await external(t => t.replace(/"tempoMicrosecondsPerQuarter": 480000/, '"tempoMicrosecondsPerQuarter": 500000'), 'restore tempo'); await wait(`fresh().state==='refreshed'&&data().tempoMicrosecondsPerQuarter===500000`);
    await check('B 13–14', `External musical edit (tempo) while clean: refreshed, playback stopped (${report.cleanMusical.playing}) and compilation invalidated (“${report.cleanMusical.diag}”); indicator “${report.cleanMusical.indicator}”`);

    // 15–20 dirty session
    await run(`const m=data().markers[0];sp.select('marker',m.id);input('Marker name',m.label+' — unsaved 4E edit',ctx);click('Apply marker',ctx);assert(view.session.dirty,'not dirty');`);
    report.dirtyBefore = await run('return{draft:JSON.stringify(view.session.draft),history:view.session.historySize,base:view.session.base.source};');
    await external(t => t.replace(/^mnemobard_notes: .*$/m, 'mnemobard_notes: Edited in another app during 4E'), 'dirty: notes');
    await wait(`fresh().state==='conflict'`);
    report.dirty = await run(`return{same:JSON.stringify(view.session.draft)===${JSON.stringify(report.dirtyBefore.draft)},history:view.session.historySize,baseKept:view.session.base.source===${JSON.stringify(report.dirtyBefore.base)},indicator:indicator(),role:banner().getAttribute('role'),areas:fresh().areas,musical:fresh().musical,buttons:[...banner().querySelectorAll('button')].map(b=>b.textContent)};`);
    if (!report.dirty.same || report.dirty.history !== report.dirtyBefore.history || !report.dirty.baseKept) throw Error('Dirty draft not preserved ' + JSON.stringify(report.dirty));
    await noteFresh('dirty external edit'); await shot('03-dirty-conflict', '.mnemobard-freshness-banner');
    await run(`banner().querySelector('details').open=true;`); await shot('04-freshness-recovery-controls', '.mnemobard-freshness-banner');
    await run(`click('Save composition');`); await wait('!view.session.busy&&view.session.error.startsWith("Not saved")');
    report.dirtySave = await run('return{error:view.session.error,recovery:view.session.recoveryPath??null,disk:(await app.vault.adapter.read(view.session.base.path)).includes("Edited in another app")};');
    const recoveryText = await readFile(`${vaultRoot}/${report.dirtySave.recovery}`, 'utf8'); if (!recoveryText.includes('unsaved 4E edit') || !report.dirtySave.disk) throw Error('Protected save/recovery ' + JSON.stringify(report.dirtySave));
    await run(`click('Store recovery copy and open recovery',banner());`); await wait(`root.textContent.includes('Close composition recovery')`);
    await run(`click('Close composition recovery');click('Reload note version…',banner());click('Store recovery copy, discard edits and reload',banner());`);
    await wait(`root.querySelector('.mnemobard-feedback')?.textContent.includes('Reloaded the note version')&&!!view.session&&!view.session.dirty`);
    report.reloaded = await run(`return{notes:view.session.draft.notes,marker:data().markers[0].label,indicator:indicator(),feedback:root.querySelector('.mnemobard-feedback').textContent};`);
    if (report.reloaded.marker.includes('unsaved 4E edit') || !report.reloaded.notes?.includes('another app')) throw Error('Reload ' + JSON.stringify(report.reloaded));
    await check('B 15–20', `External edit with unsaved edits: draft, undo history (${report.dirty.history}) and base preserved; conflict banner (role=${report.dirty.role}) with ${JSON.stringify(report.dirty.buttons)}; Save blocked (“${report.dirtySave.error.slice(0, 80)}…”) and recovery copy contains the edit; recovery opened; confirmed reload loaded the note version (${report.reloaded.feedback.slice(0, 90)})`);

    // 21 invalid and future-schema content
    const draftBeforeInvalid = await run('return JSON.stringify(view.session.draft);');
    const broken = await external(t => replaceOnce(t, '"ppq": 960,', '"ppq": 960,,'), 'invalid JSON');
    await wait(`fresh().state==='unavailable'`); report.invalid = await run(`return{reason:fresh().reason,message:fresh().message.slice(0,160),same:JSON.stringify(view.session.draft)===${JSON.stringify(draftBeforeInvalid)}};`);
    await writeFile(`${vaultRoot}/${broken.path}`, broken.before.replace('mnemobard_schema: 1', 'mnemobard_schema: 2')); await pause(300);
    await wait(`fresh().state==='unavailable'&&fresh().message.toLowerCase().includes('schema')`); report.future = await run(`return{message:fresh().message.slice(0,160),same:JSON.stringify(view.session.draft)===${JSON.stringify(draftBeforeInvalid)}};`);
    if (!report.invalid.same || !report.future.same || (await readFile(`${vaultRoot}/${broken.path}`, 'utf8')).includes('mnemobard_schema: 1')) throw Error('Invalid content handling');
    await writeFile(`${vaultRoot}/${broken.path}`, broken.before); await wait(`fresh().state==='current'`);
    await check('B 21', `Malformed note → “${report.invalid.reason}” (${report.invalid.message}…); future schema → read-only warning (${report.future.message.slice(0, 80)}…); valid draft kept, note never rewritten; restoring the bytes returns to current`);

    // 22 rapid modifications
    for (const n of [1, 2, 3]) { await external(t => t.replace(/^mnemobard_notes: .*$/m, `mnemobard_notes: Rapid edit ${n}`), `rapid ${n}`); await pause(15); }
    await wait(`view.session.draft.notes==='Rapid edit 3'&&fresh().state==='refreshed'`);
    report.rapid = await run('const disk=await app.vault.adapter.read(view.session.base.path);return{baseIsDisk:view.session.base.source===disk,history:view.session.historySize,dirty:view.session.dirty};');
    if (!report.rapid.baseIsDisk || report.rapid.dirty) throw Error('Rapid ' + JSON.stringify(report.rapid));
    await check('B 22', `Three external writes 15 ms apart converged on the latest note (base equals disk ${report.rapid.baseIsDisk}, clean, no history ${report.rapid.history})`);

    // 23 rename of the composition note (followed by UUID)
    const oldPath = await run('return view.session.base.path;'), newPath = oldPath.replace(/\.md$/, ' (4E renamed).md');
    await run(`await app.fileManager.renameFile(app.vault.getAbstractFileByPath(${JSON.stringify(oldPath)}),${JSON.stringify(newPath)});`);
    await wait(`view.session.base.path===${JSON.stringify(newPath)}&&fresh().state==='current'`);
    await run(`const s=data().sections[1];sp.select('section',s.id);input('Section description','Saved after the note was renamed (4E)',ctx);click('Apply section',ctx);`); await save();
    report.renamedNote = { from: oldPath, to: newPath, contains: (await readFile(`${vaultRoot}/${newPath}`, 'utf8')).includes('Saved after the note was renamed'), oldGone: !(await run(`return !!app.vault.getAbstractFileByPath(${JSON.stringify(oldPath)});`)) };
    if (!report.renamedNote.contains || !report.renamedNote.oldGone) throw Error('Rename ' + JSON.stringify(report.renamedNote));
    await check('B 23', 'Composition note renamed in Obsidian: the session followed it by UUID (no file-name inference), stayed current, and Save wrote to the new path only');

    // 24 deletion (scratch composition only)
    report.deletion = await run(`const s=services.canvas.create();s.edit('Rename',c=>({...c,title:'4E deletion subject ${stamp}'}));await s.save();await view.setState({selectedId:s.draft.id});return{id:s.draft.id,path:s.base.path};`);
    await wait(`view.session?.draft.id===${JSON.stringify(report.deletion.id)}`);
    await run(`click('Add lane');`); const notesBefore = (await readdir(`${vaultRoot}/MNEMOBARD/Compositions`)).length; const deletedSource = await readFile(`${vaultRoot}/${report.deletion.path}`, 'utf8');
    await run(`await app.vault.delete(app.vault.getAbstractFileByPath(${JSON.stringify(report.deletion.path)}));`); await wait(`fresh().state==='unavailable'&&fresh().reason==='missing'`);
    await run(`click('Save composition');`); await wait('!view.session.busy&&view.session.error.startsWith("Not saved")');
    report.deletion.after = { notes: (await readdir(`${vaultRoot}/MNEMOBARD/Compositions`)).length, notesBefore, lanes: await run('return data().lanes.length;'), error: await run('return view.session.error.slice(0,120);'), indicator: await run('return indicator();') };
    if (report.deletion.after.notes !== notesBefore - 1 || report.deletion.after.lanes !== 1) throw Error('Deletion ' + JSON.stringify(report.deletion));
    await run(`await app.vault.create(${JSON.stringify(report.deletion.path)},${JSON.stringify(deletedSource)});`); await wait(`fresh().state==='current'`); await save();
    await check('B 24', `Deleted note (scratch composition): draft kept (${report.deletion.after.lanes} lane), “${report.deletion.after.indicator}”, Save refused (“${report.deletion.after.error}”) and created no replacement note; after the note was restored with the same UUID, Save succeeded`);
    await openComposition(report.compositionId);

    // ── Phase C (25–34) Navigation ─────────────────────────────────────────────
    await run('nav.trace=[];');
    const emptyBefore = await run(`return app.workspace.getLeavesOfType('empty').length;`);
    report.motifId = await run(`click('Next clip');return data().lanes.flatMap(l=>l.clips).find(c=>c.id===view.session.selectedClip).motifId;`);
    await run(`click('Open source MOTIF');`); await wait(`mv?.session?.draft.id===${JSON.stringify(report.motifId)}&&app.workspace.activeLeaf===mv.leaf`);
    await capture('09-canvas-to-motif');
    const assoc = await run(`const m=services.index.all().filter(e=>e.entity?.kind==='motif'&&e.entity.patchId&&services.index.resolve(e.entity.patchId).status==='ready');const p=services.index.all().filter(e=>e.entity?.kind==='patch').map(e=>e.entity.id);return{motif:m[0]?.entity.id,patch:m[0]?.entity.patchId,other:p.find(id=>id.toLowerCase()!==m[0]?.entity.patchId.toLowerCase())};`);
    if (!assoc.motif || !assoc.other) throw Error('No associated motif/patch in the dev vault ' + JSON.stringify(assoc)); report.navigation = { ...assoc };
    const motifToPatch = async (id = assoc.patch) => { await run(`await mv.setState({selectedId:${JSON.stringify(assoc.motif)}});`); await wait(`mv.session?.draft.id===${JSON.stringify(assoc.motif)}`); await run(`await mv.navigatePatch(${JSON.stringify(id)});`); await wait(`pb?.currentSession?.draft.id.toLowerCase()===${JSON.stringify(id.toLowerCase())}`); return run(`return{selected:pb.currentSession.draft.id,current:pb.contentEl.querySelector('[aria-current="true"]')?.textContent??null,leaves:{motif:app.workspace.getLeavesOfType('mnemobard-motif').length,patchbook:app.workspace.getLeavesOfType('mnemobard-patchbook').length,canvas:app.workspace.getLeavesOfType('mnemobard-canvas').length}};`); };
    report.navigation.motifToPatch = await motifToPatch(); await capture('07-motif-to-patchbook');
    await run(`app.workspace.setActiveLeaf(mv.leaf,{focus:true});`); await wait(`app.workspace.activeLeaf===mv.leaf&&mv.session?.draft.id===${JSON.stringify(assoc.motif)}`); await capture('08-patchbook-to-motif');
    await focusCanvas(); report.navigation.returned = await run(`return{id:view.session.draft.id,dirty:view.session.dirty,prep:prep.state};`);
    await check('C 25–28', `CANVAS → MOTIF selected the clip source; MOTIF → PATCHBOOK selected the associated patch (${JSON.stringify(report.navigation.motifToPatch)}); returned to MOTIF by tab activation (no PATCHBOOK → MOTIF link exists in the product) and to CANVAS unchanged (${JSON.stringify(report.navigation.returned)})`);
    // 30 several tabs
    report.navigation.tabsOpened = await run(`const files=app.vault.getMarkdownFiles().filter(f=>f.path.startsWith('MNEMOBARD/Patches/')).slice(0,3);const leaves=[];for(const f of files){const l=app.workspace.getLeaf('tab');await l.openFile(f);leaves.push(l);}globalThis.__tabs4e=leaves;return leaves.length;`);
    report.navigation.withTabs = await motifToPatch(assoc.other);
    await run(`for(const l of globalThis.__tabs4e??[])l.detach();delete globalThis.__tabs4e;`);
    // 31 target closed / disabled and re-enabled
    await run(`for(const l of app.workspace.getLeavesOfType('mnemobard-patchbook'))l.detach();`); report.navigation.targetClosed = await motifToPatch();
    await run(`await plugin.setModule('patchbook',false);await plugin.setModule('patchbook',true);`); report.navigation.afterReenable = await motifToPatch(assoc.other);
    // 32 concurrent: latest wins
    await run(`await mv.setState({selectedId:${JSON.stringify(assoc.motif)}});nav.trace=[];const a=mv.navigatePatch(${JSON.stringify(assoc.patch)}),b=mv.navigatePatch(${JSON.stringify(assoc.other)});await Promise.allSettled([a,b]);`);
    report.navigation.concurrent = await run(`return{selected:pb.currentSession.draft.id,selectedEvents:nav.trace.filter(e=>e.phase==='selected').map(e=>e.target),superseded:nav.trace.filter(e=>e.phase==='superseded').map(e=>e.target),failed:nav.trace.filter(e=>e.phase==='failed').length};`);
    if (report.navigation.concurrent.selected.toLowerCase() !== assoc.other.toLowerCase() || report.navigation.concurrent.selectedEvents.length !== 1 || report.navigation.concurrent.failed) throw Error('Concurrent ' + JSON.stringify(report.navigation.concurrent));
    // failed then successful navigation
    report.navigation.failed = await run(`try{await nav.navigate('motif','patchbook','00000000-0000-4000-8000-0000000004e0',{enabled:()=>services.modules.enabled('patchbook'),open:()=>services.modules.open('patchbook'),view:async()=>pb});return'no error';}catch(e){return String(e.message).slice(0,140);}`);
    report.navigation.afterFailure = await motifToPatch();
    report.navigation.emptyLeaves = { before: emptyBefore, after: await run(`return app.workspace.getLeavesOfType('empty').length;`) };
    const leafCounts = [report.navigation.withTabs, report.navigation.targetClosed, report.navigation.afterReenable, report.navigation.afterFailure].map(n => n.leaves);
    if (leafCounts.some(l => l.motif !== 1 || l.patchbook !== 1 || l.canvas !== 1) || report.navigation.emptyLeaves.after > report.navigation.emptyLeaves.before) throw Error('Orphaned leaves ' + JSON.stringify({ leafCounts, empty: report.navigation.emptyLeaves }));
    await writeFile(`${directory}/navigation-trace.json`, JSON.stringify({ note: 'Development trace: phases, module names and record UUIDs only.', trace: await run('return nav.trace;'), summary: report.navigation }, null, 2) + '\n');
    await run('nav.trace=null;'); await focusCanvas();
    await check('C 30–34', `Navigation with several tabs, with PATCHBOOK closed, after disable/re-enable and after a failed request (“${report.navigation.failed}”) selected the requested UUID; concurrent requests: latest wins (${JSON.stringify(report.navigation.concurrent)}); exactly one leaf per module, no new empty leaves (${JSON.stringify(report.navigation.emptyLeaves)})`);

    // ── Phase D (35–42) Modals ────────────────────────────────────────────────
    await run(`click('Place motif');`); await wait('!!view.picker?.contentEl.querySelector("select")'); report.modals = { picker: await run('const v=visible(view.picker);view.picker.close();return v;') };
    await run(`app.workspace.setActiveLeaf(mv.leaf,{focus:true});`); await pause(200);
    await run(`click('Import MIDI',mv.contentEl);`); await wait('!!mv.midiDialog?.containerEl.isConnected'); report.modals.motifImport = await run('const v=visible(mv.midiDialog);mv.midiDialog.close();return v;');
    await run(`click('Export MIDI',mv.contentEl);`); await wait('!!mv.midiDialog?.containerEl.isConnected'); report.modals.motifExport = await run('const v=visible(mv.midiDialog);mv.midiDialog.close();return v;');
    const preset = await run(`const f=app.vault.getFiles().find(f=>f.extension==='custom-preset');return f?.path??null;`);
    await run(`app.workspace.setActiveLeaf(pb.leaf,{focus:true});`); await pause(200);
    if (preset) { await run(`pb.openAsset(${JSON.stringify(preset)},'preset');`); await wait('!!pb.assetInspector?.containerEl.isConnected'); report.modals.assetInspector = await run('const v=visible(pb.assetInspector)&&pb.assetInspector.contentEl.textContent.includes("Asset inspection");pb.assetInspector.close();return v;'); }
    await focusCanvas(); await run(`root.querySelector('.mnemobard-arrangement-seek').open=true;await prep.prepare();click('Export arrangement MIDI');`); await wait('!!panel.dialog?.containerEl.isConnected');
    report.modals.canvasExport = await run('return visible(panel.dialog);'); await shot('10-modal'); await run(`click('Cancel export',panel.dialog.contentEl);`);
    // 39 recording-reference selection (file picker built on open)
    await run(`sx.open=true;const add=[...sx.querySelectorAll('details')].find(d=>d.querySelector(':scope > summary')?.textContent==='Add recording reference');add.querySelector('summary').click();`); await pause(200);
    report.modals.referencePicker = await run(`const sel=sx.querySelector('select[aria-label="Recording file"]');const r=data().audioRefs[0];sp.select('reference',r.id);return{options:sel?.options.length??0,header:header()};`);
    // 40–41 popout window lifecycle and guarded refusal probe
    report.modals.popout = await run(`const leaf=app.workspace.openPopoutLeaf?.();if(!leaf)return{api:false};await new Promise(r=>setTimeout(r,900));const win=leaf.view.containerEl.win;const during=activeDocument===win.document?'popout':activeDocument===document?'main':'other';leaf.detach();await new Promise(r=>setTimeout(r,700));const after=activeDocument===document?'main':activeDocument.defaultView&&!activeDocument.defaultView.closed?'other-live':'stale-closed';let refusal=null;if(after==='stale-closed'){click('Place motif');refusal={opened:!!view.picker?.containerEl.isConnected,feedback:root.querySelector('.mnemobard-feedback').textContent};}return{api:true,during,after,refusal};`);
    await run(`for(const l of app.workspace.getLeavesOfType('empty'))l.detach();`); await focusCanvas();
    await run(`click('Place motif');`); await wait('!!view.picker?.containerEl.isConnected'); report.modals.afterPopout = await run('const v=visible(view.picker);view.picker.close();return v;');
    if (Object.entries(report.modals).some(([k, v]) => typeof v === 'boolean' && !v)) throw Error('Invisible dialog ' + JSON.stringify(report.modals));
    await check('D 35–42', `All dialogs mounted visibly in the main window: ${JSON.stringify(report.modals)}. Refusal path ${report.modals.popout.refusal ? 'exercised' : 'not reproducible (host returned focus to a live document)'}`);

    // ── Phase E (43–50) Recording references ───────────────────────────────────
    const drone = `${recordings}/drone-${stamp}.wav`; await createWav(drone, 0.4, 220);
    const droneRef = await run(`services.canvas.addRecording(view.session,{label:'Drone 4E',path:${JSON.stringify(drone)},description:'4E clean-rename subject'});return data().audioRefs.at(-1);`); await save();
    report.files = { drone: await sha(drone) }; const droneTo = `${recordings}/drone-renamed-${stamp}.wav`;
    await run(`await app.fileManager.renameFile(app.vault.getAbstractFileByPath(${JSON.stringify(drone)}),${JSON.stringify(droneTo)});`);
    await wait(`fresh().state==='refreshed'&&[...sx.querySelectorAll('button')].some(b=>b.textContent==='Relink to renamed file')`, 400);
    await shot('11-recording-rename', '.mnemobard-structure-warning');
    await run(`click('Relink to renamed file',sx);`); await save();
    report.cleanRename = await run(`const r=data().audioRefs.find(r=>r.id===${JSON.stringify(droneRef.id)});const fm=(await services.repository.read(view.session.draft.id)).source.split('---')[1];return{path:r.path,description:r.description,droneLinks:fm.split('\\n').filter(l=>l.includes(${JSON.stringify(stamp)})&&l.includes('drone')).length};`);
    if (report.cleanRename.path !== droneTo || report.cleanRename.droneLinks !== 1 || await sha(droneTo) !== report.files.drone) throw Error('Clean rename ' + JSON.stringify(report.cleanRename));
    await check('E 43–44', `Clean session: Obsidian's link rewrite refreshed the session automatically; the explicit relink kept the reference UUID and notes (${JSON.stringify(report.cleanRename)}); audio bytes unchanged`);
    const pulse = `${recordings}/pulse-${stamp}.wav`; await createWav(pulse, 0.5, 330);
    report.pulseId = await run(`services.canvas.addRecording(view.session,{label:'Pulse 4E',path:${JSON.stringify(pulse)},description:'4E dirty-rename subject'});return data().audioRefs.at(-1).id;`); await save(); report.files.pulse = await sha(pulse);
    await run(`const m=data().markers[1];sp.select('marker',m.id);input('Marker description','Unsaved 4E marker note',ctx);click('Apply marker',ctx);`);
    const pulseTo = `${recordings}/pulse-renamed-${stamp}.wav`; await run(`await app.fileManager.renameFile(app.vault.getAbstractFileByPath(${JSON.stringify(pulse)}),${JSON.stringify(pulseTo)});`);
    await wait(`fresh().state==='conflict'&&fresh().rename===true&&!!root.querySelector('[data-rename-offer]')`, 400); await noteFresh('dirty recording rename');
    await run(`click('Adopt rename and keep my edits');`); await wait(`data().audioRefs.find(r=>r.id===${JSON.stringify(report.pulseId)}).path===${JSON.stringify(pulseTo)}`); await save();
    report.dirtyRename = await run(`const src=(await services.repository.read(view.session.draft.id)).source;return{edit:src.includes('Unsaved 4E marker note'),link:src.includes(${JSON.stringify('[[' + pulseTo + ']]')}),indicator:indicator()};`);
    if (!report.dirtyRename.edit || !report.dirtyRename.link || await sha(pulseTo) !== report.files.pulse) throw Error('Dirty rename ' + JSON.stringify(report.dirtyRename));
    await check('E 45–46', `Dirty session: conflict classified as a provable recording rename; explicit adoption kept the unsaved marker edit and saved the new link (${JSON.stringify(report.dirtyRename)}); audio bytes unchanged`);
    await run(`const m=data().markers[2];sp.select('marker',m.id);input('Marker description','Unsaved before ambiguous change',ctx);click('Apply marker',ctx);`);
    const pulseTo2 = `${recordings}/pulse-ambiguous-${stamp}.wav`; await run(`await app.fileManager.renameFile(app.vault.getAbstractFileByPath(${JSON.stringify(pulseTo)}),${JSON.stringify(pulseTo2)});`);
    await wait(`(await services.repository.read(view.session.draft.id)).source.includes(${JSON.stringify(pulseTo2.split('/').at(-1))})`, 300);
    await run(`await app.vault.process(app.vault.getAbstractFileByPath(view.session.base.path),t=>t+'\\nExternal paragraph added during 4E.\\n');`);
    await wait(`fresh().state==='conflict'&&fresh().rename===false`, 400); await pause(400);
    report.ambiguous = await run(`return{offer:!!root.querySelector('[data-rename-offer]'),path:data().audioRefs.find(r=>r.id===${JSON.stringify(report.pulseId)}).path};`);
    await run(`click('Save composition');`); await wait('!view.session.busy&&view.session.error.startsWith("Not saved")'); report.ambiguous.recovery = await run('return view.session.recoveryPath??null;');
    if (report.ambiguous.offer || report.ambiguous.path !== pulseTo || !report.ambiguous.recovery) throw Error('Ambiguous ' + JSON.stringify(report.ambiguous));
    await run(`click('Reload note version…',banner());click('Store recovery copy, discard edits and reload',banner());`); await wait(`!!view.session&&!view.session.dirty&&root.querySelector('.mnemobard-feedback').textContent.includes('Reloaded')`);
    await run(`sx.open=true;sp.refresh();`); await wait(`[...sx.querySelectorAll('button')].some(b=>b.textContent==='Relink to renamed file')`, 300); await run(`click('Relink to renamed file',sx);`); await save();
    await check('E 47–48', `Rename combined with an unrelated external edit: no adoption offer and no guessing (${JSON.stringify(report.ambiguous)}); Save blocked with a recovery copy; confirmed reload kept the external paragraph; explicit relink saved`);
    report.legacy = await run(`return{groups:services.canvas.duplicateMirrors(view.session.draft,view.session.base.path),offer:!!root.querySelector('[data-duplicate-links]')};`);
    if (report.legacy.groups.length) {
      await run('sx.open=true;sp.refresh();'); await wait(`!!root.querySelector('[data-duplicate-links]')`); await shot('12-legacy-duplicate', '[data-duplicate-links]');
      const refsBefore = await run('return JSON.stringify(data().audioRefs);'); await run(`click('Remove duplicate recording links');`); await save();
      report.legacy.after = await run(`const fm=(await services.repository.read(view.session.draft.id)).source.split('---')[1];return{refsSame:JSON.stringify(data().audioRefs)===${JSON.stringify(refsBefore)},stationLinks:fm.split('\\n').filter(l=>l.includes('station-renamed')).length,remaining:services.canvas.duplicateMirrors(view.session.draft,view.session.base.path).length};`);
      if (!report.legacy.after.refsSame || report.legacy.after.remaining) throw Error('Legacy repair ' + JSON.stringify(report.legacy));
    }
    report.audioAfter = await recordingHashes(); const before = new Map(); for (const h of report.audioBefore) before.set(h, (before.get(h) ?? 0) + 1);
    report.audioIntact = report.audioBefore.every(h => report.audioAfter.includes(h)) && report.audioAfter.length === report.audioBefore.length + 2;
    if (!report.audioIntact) throw Error('Audio hashes changed');
    await writeFile(`${directory}/audio-hashes.json`, JSON.stringify({ before: report.audioBefore, after: report.audioAfter, created: [report.files.drone, report.files.pulse], intact: report.audioIntact }, null, 2) + '\n');
    await check('E 49–50', `Legacy duplicate mirror links: ${report.legacy.groups.length ? `explicit repair removed ${report.legacy.groups.reduce((n, g) => n + g.remove.length, 0)} duplicate(s) (${JSON.stringify(report.legacy.after)})` : 'none provable (left unchanged)'}; all ${report.audioBefore.length} pre-existing recording hashes unchanged (+2 created by this run)`);

    // ── Phase F (51–64) Musical regression ─────────────────────────────────────
    await compile(); await run(`assert(prep.state==='ready','compile');`);
    report.export1 = `MNEMOBARD/Exports/arrangement-4e-after-freshness-${stamp}.mid`; await exportMidi(report.export1);
    report.export1Identical = (await readFile(`${vaultRoot}/${report.export1}`)).equals(await readFile(`${vaultRoot}/${report.export0}`));
    report.independentMidi = verifyMidi(report.export1); if (report.independentMidi.status !== 0 || !report.export1Identical) throw Error('MIDI ' + JSON.stringify(report.independentMidi));
    await run(`click('Play arrangement');`); await wait('services.musical.state==="playing"');
    await run(`const s=data().sections[0];sp.select('section',s.id);input('Section name',s.label+' ·',ctx);click('Apply section',ctx);`); await pause(400);
    report.playbackMeta = await run('return{state:services.musical.state,prep:prep.state};'); if (report.playbackMeta.state !== 'playing') throw Error('Metadata edit stopped playback');
    await run(`click('Next clip');const clip=view.session.selectedClip;input('Clip raw start tick',String(data().lanes.flatMap(l=>l.clips).find(c=>c.id===clip).startTick+960),ctx);click('Apply clip placement',ctx);`); await pause(300);
    report.afterMove = await run('return{state:services.musical.state,prep:prep.state};'); if (report.afterMove.state === 'playing' || report.afterMove.prep !== 'invalidated') throw Error('Move ' + JSON.stringify(report.afterMove));
    await run(`click('Undo');`); await compile(); report.export2 = `MNEMOBARD/Exports/arrangement-4e-recompiled-${stamp}.mid`; await exportMidi(report.export2);
    report.export2Identical = (await readFile(`${vaultRoot}/${report.export2}`)).equals(await readFile(`${vaultRoot}/${report.export0}`)); if (!report.export2Identical) throw Error('Recompiled export differs');
    await run(`click('Play arrangement');`); await wait('services.musical.state==="playing"');
    report.disable = await run(`await plugin.setModule('canvas',false);await new Promise(r=>setTimeout(r,300));return{state:services.musical.state,voices:services.musical.activeVoices??null,timers:services.musical.timerCount??null,leaves:app.workspace.getLeavesOfType('mnemobard-canvas').length};`);
    if (report.disable.state === 'playing' || report.disable.leaves !== 0) throw Error('Disable ' + JSON.stringify(report.disable));
    await run(`await plugin.setModule('canvas',true);`); await openComposition(report.compositionId);
    await check('F 51–64', `Compiled/exported after all freshness work: byte-identical to the baseline and independently verified (Python ${report.independentMidi.status}); playback continued through a section rename, a clip move stopped it and invalidated, Undo + recompile exported byte-identical; disabling CANVAS during playback → ${JSON.stringify(report.disable)}`);

    // ── Phase G (65–76) Interface regression ───────────────────────────────────
    await run(`click('Next clip');assert(kind()==='clip','clip');`); await shot('13-contextual-inspector', '.mnemobard-canvas-context');
    await run(`const lane=data().lanes[0];select('Selected lane',lane.id);assert(kind()==='lane'&&ctx.querySelector('[aria-label="Routing lane"]').value===lane.id,'lane routing');`);
    await focusCanvas(); await run('tl.canvas.focus();'); await key(']'); report.keyboard = { section: await run(`return{header:header(),focus:document.activeElement?.tagName};`) };
    await run('tl.canvas.focus();'); await key('.'); report.keyboard.marker = await run('return header();');
    await run('tl.canvas.focus();'); await key('Escape'); report.keyboard.escape = await run('return{kind:kind(),focus:document.activeElement===tl.canvas,activeLeafIsCanvas:app.workspace.activeLeaf===view.leaf};');
    await key(']'); await shot('19-keyboard-focus', '.mnemobard-canvas-context');
    if (!/Section/.test(report.keyboard.section.header) || !/Marker/.test(report.keyboard.marker) || report.keyboard.escape.kind !== 'none' || !report.keyboard.escape.focus || !report.keyboard.escape.activeLeafIsCanvas) throw Error('Keyboard ' + JSON.stringify(report.keyboard));
    report.sticky = await run(`root.querySelector('.mnemobard-canvas-diagnostics').open=true;root.scrollTop=0;const t0=root.querySelector('.mnemobard-arrangement-surface').getBoundingClientRect().top;root.scrollTop=900;await new Promise(r=>setTimeout(r,200));const t1=root.querySelector('.mnemobard-arrangement-surface').getBoundingClientRect().top,rootTop=root.getBoundingClientRect().top;return{position:getComputedStyle(root.querySelector('.mnemobard-arrangement-surface')).position,beforeTop:Math.round(t0),afterTop:Math.round(t1),paneTop:Math.round(rootTop),scrolled:root.scrollTop};`);
    await pause(150); await capture('14-sticky-timeline'); await run('root.scrollTop=0;');
    await run(`click('Next clip');`); await shot('16-dark-theme'); await theme('moonstone'); await shot('17-light-theme'); await theme('obsidian');
    await c.command('Emulation.setDeviceMetricsOverride', { width: 620, height: 1000, deviceScaleFactor: 1, mobile: false }); await pause(300);
    report.narrow = await run(`return{clientWidth:root.clientWidth,scrollWidth:root.scrollWidth};`); await shot('15-narrow-pane', '.mnemobard-freshness');
    if (report.narrow.scrollWidth > report.narrow.clientWidth + 1) throw Error('Narrow overflow ' + JSON.stringify(report.narrow));
    await c.command('Emulation.setDeviceMetricsOverride', { width: 1360, height: 1100, deviceScaleFactor: 2, mobile: false }); await pause(300);
    report.highDpi = await run(`tl.draw();return{css:tl.canvas.clientWidth,backing:tl.canvas.width,dpr:devicePixelRatio};`); await shot('18-high-dpi');
    await c.command('Emulation.setDeviceMetricsOverride', { width: 1360, height: 1100, deviceScaleFactor: 1, mobile: false });
    await check('G 65–76', `Inspector (clip, lane routing, section, marker), keys ] . Escape with focus restoration (${JSON.stringify(report.keyboard)}), sticky timeline while scrolling (${JSON.stringify(report.sticky)}), narrow pane (${JSON.stringify(report.narrow)}), dark/light themes and high-DPI (${JSON.stringify(report.highDpi)}) captured`);

    // ── Phase H (77–79) Save and close before the cold restart ──────────────────
    await run(`if(view.session.dirty)click('Save composition');`); await wait("view.session.status==='Saved'");
    report.savedSource = await run('return (await services.repository.read(view.session.draft.id)).source;');
    await run(`view.leaf.detach();`); await pause(300); report.closedLeaves = await run(`return app.workspace.getLeavesOfType('mnemobard-canvas').length;`);
    await c.evaluate('app.workspace.requestSaveLayout?.run?.()');
    await check('H 77–79', `Saved and closed the composition view (${report.closedLeaves} CANVAS leaves); ready for a cold restart`);
  }
  if (restart) {
    // ── Phase C 29: navigation immediately after a cold start (first actions in the session) ──
    await c.evaluate("app.plugins.getPlugin('mnemobard').services.navigation.trace=[]");
    await run(`await services.modules.open('motif');`); await wait('!!mv');
    const a = report.navigation;
    await run(`await mv.navigatePatch(${JSON.stringify(a.patch)});`).catch(e => { report.retries.push({ step: 'C 29', error: String(e) }); throw e; });
    await wait(`pb?.currentSession?.draft.id.toLowerCase()===${JSON.stringify(a.patch.toLowerCase())}`);
    report.coldNavigation = await run(`return{selected:pb.currentSession.draft.id,phases:nav.trace.map(e=>e.phase),hostState:nav.trace.filter(e=>e.phase.startsWith('host')).map(e=>e.phase+':'+e.target)};`);
    await writeFile(`${directory}/navigation-trace-cold-start.json`, JSON.stringify({ note: 'Cold-start trace: phases, module names and record UUIDs only.', trace: await run('return nav.trace;') }, null, 2) + '\n');
    await run('nav.trace=null;');
    await check('C 29', `Cold start: first MOTIF → PATCHBOOK navigation selected the requested patch (${JSON.stringify(report.coldNavigation)})`);
    // ── Phase H 80–84 ──
    await openComposition(report.compositionId);
    report.restart = await run(`const clips=data().lanes.flatMap(l=>l.clips);return{same:(await services.repository.read(view.session.draft.id)).source===${JSON.stringify(report.savedSource)},dirty:view.session.dirty,kind:kind(),selectedClip:view.session.selectedClip??null,indicator:indicator(),sources:[...new Set(clips.map(c=>services.canvas.sources.get(c.motifId).status))]};`);
    if (!report.restart.same || report.restart.dirty || report.restart.kind !== 'none' || report.restart.selectedClip || report.restart.sources.join() !== 'ready') throw Error('Restart ' + JSON.stringify(report.restart));
    await compile(); report.export3 = `MNEMOBARD/Exports/arrangement-4e-after-restart-${stamp}.mid`; await exportMidi(report.export3);
    report.export3Identical = (await readFile(`${vaultRoot}/${report.export3}`)).equals(await readFile(`${vaultRoot}/${report.export0}`)); if (!report.export3Identical) throw Error('Restart export differs');
    await shot('20-final-reopened');
    await check('H 80–84', `Cold restart: composition reopened byte-identical, clean, no stale selection (${JSON.stringify(report.restart)}); sources ready; compiled and exported byte-identical to the baseline`);
  }
  report.rendererExceptions = c.exceptions; if (c.exceptions.length) throw Error(c.exceptions.join('\n'));
  await writeFile(`${directory}/native-${restart ? 'restart' : 'part1'}.json`, JSON.stringify(report, null, 2) + '\n');
} catch (error) {
  await writeFile(`${directory}/failure${restart ? '-restart' : ''}.json`, JSON.stringify({ error: String(error), report, exceptions: c.exceptions, status: await run('return{state:prep?.state,diag:prep?.diagnostics?.slice(0,3),feedback:root?.querySelector(".mnemobard-feedback")?.textContent,fresh:view?.session?.freshness,indicator:root?.querySelector(".mnemobard-freshness")?.textContent};').catch(e => String(e)) }, null, 2) + '\n');
  console.error('FAILED:', String(error)); process.exitCode = 1;
} finally { c.close(); }
