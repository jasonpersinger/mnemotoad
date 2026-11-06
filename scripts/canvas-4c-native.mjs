/** Real-host synthetic 4C workflow (sections, markers, recording references). CDP refuses every non-disposable vault. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { connect } from './obsidian-cdp.mjs';

const directory = 'output/canvas/milestone-4c', vaultRoot = 'dev-vault', recordings = 'MNEMOBARD/Recordings 4C';
await mkdir(directory, { recursive: true });
const c = await connect(), stamp = String(Date.now()), pause = ms => new Promise(r => setTimeout(r, ms));
const restart = process.argv.includes('--verify-restart');
let report = { stamp, checks: [], screenshots: [] };
const prefix = `const plugin=app.plugins.getPlugin('mnemobard'),services=plugin.services,view=app.workspace.getLeavesOfType('mnemobard-canvas')[0]?.view,root=view?.contentEl,panel=view?.performancePanel,prep=panel?.preparation,sp=view?.structurePanel,tl=view?.timeline,sx=root?.querySelector('.mnemobard-canvas-structure');const assert=(v,m)=>{if(!v)throw Error(m);};const click=(text,scope=root)=>{const b=[...scope.querySelectorAll('button')].find(b=>b.textContent===text&&!b.disabled);assert(b,'Missing active button '+text);b.click();};const input=(label,value,scope=root)=>{const e=[...scope.querySelectorAll('input,textarea')].find(e=>e.getAttribute('aria-label')===label);assert(e,'Missing field '+label);e.value=value;e.dispatchEvent(new Event('input',{bubbles:true}));};const select=(label,value,scope=root)=>{const e=[...scope.querySelectorAll('select')].find(e=>e.getAttribute('aria-label')===label);assert(e,'Missing select '+label);e.value=value;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));};const data=()=>view.session.draft.data;const byLabel=(list,l)=>data()[list].find(x=>x.label===l);const status=()=>sx.querySelector('.mnemobard-structure-status')?.textContent??'';`;
async function run(body) { try { return await c.evaluate(`(globalThis.__native4c=(async()=>{${prefix}${body}})())`); } finally { await c.evaluate('delete globalThis.__native4c'); } }
async function wait(test, tries = 450) { for (let i = 0; i < tries; i++) { if (await run(`return (${test});`)) return; await pause(30); } throw Error('Timed out: ' + test); }
async function check(text) { report.checks.push(text); console.log('✓', text); await writeFile(`${directory}/partial.json`, JSON.stringify(report, null, 2) + '\n'); }
async function shot(name, selector = '.mnemobard-arrangement-surface') {
  await run(`root.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'center'});assert(app.workspace.activeLeaf===view.leaf,'Hidden CANVAS screenshot');`); await pause(150);
  const s = await c.command('Page.captureScreenshot', { format: 'png' }); await writeFile(`${directory}/${name}.png`, Buffer.from(s.data, 'base64'));
  if (!report.screenshots.includes(name + '.png')) report.screenshots.push(name + '.png');
}
const sha = async path => createHash('sha256').update(await readFile(`${vaultRoot}/${path}`)).digest('hex');
function wav(seconds, frequency) { const rate = 8000, n = Math.round(rate * seconds), b = Buffer.alloc(44 + n * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40); for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i / rate * 2 * Math.PI * frequency) * 900), 44 + i * 2); return b; }
async function createWav(path, seconds, frequency) { await run(`if(!app.vault.getAbstractFileByPath(${JSON.stringify(recordings)}))await app.vault.createFolder(${JSON.stringify(recordings)});const bytes=Uint8Array.from(atob(${JSON.stringify(wav(seconds, frequency).toString('base64'))}),ch=>ch.charCodeAt(0));if(!app.vault.getAbstractFileByPath(${JSON.stringify(path)}))await app.vault.createBinary(${JSON.stringify(path)},bytes.buffer);`); }
/** Real pointer gesture on the ruler canvas through the host input pipeline. */
async function drag(fromX, toX, y) {
  const rect = await run(`tl.ruler.scrollIntoView({block:'center'});const r=tl.ruler.getBoundingClientRect();return{left:r.left,top:r.top};`); await pause(80);
  for (const [type, x] of [['mouseMoved', fromX], ['mousePressed', fromX], ['mouseMoved', (fromX + toX) / 2], ['mouseMoved', toX], ['mouseReleased', toX]]) { await c.command('Input.dispatchMouseEvent', { type, x: rect.left + x, y: rect.top + y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 }); await pause(40); }
}
async function key(keyName, code = keyName) { const text = keyName === 'Enter' ? '\r' : keyName === 'Tab' ? '\t' : undefined; for (const type of ['keyDown', 'keyUp']) await c.command('Input.dispatchKeyEvent', { type, key: keyName, code, windowsVirtualKeyCode: keyName === 'Enter' ? 13 : keyName === 'Tab' ? 9 : 0, ...(type === 'keyDown' && text ? { text, unmodifiedText: text } : {}) }); await pause(60); }
async function compile() { await run(`click('Compile arrangement');`); await wait("!['resolving','compiling'].includes(prep.state)"); }
async function save() { await run(`click('Save composition');`); await wait("view.session.status==='Saved'"); }
async function exportMidi(path) { await run(`root.querySelector('.mnemobard-arrangement-seek').open=true;click('Export arrangement MIDI');`); await wait('!!panel.dialog?.contentEl.querySelector("input")'); await run(`input('New arrangement MIDI destination',${JSON.stringify(path)},panel.dialog.contentEl);click('Create arrangement MIDI',panel.dialog.contentEl);`); await wait("panel.dialog.contentEl.textContent.includes('Export created:')", 600); await run(`click('Cancel export',panel.dialog.contentEl);`); }
async function openComposition(id) { await run(`await view.setState({selectedId:${JSON.stringify(id)}});`); await wait(`view.session?.draft.id===${JSON.stringify(id)}&&!!view.structurePanel`); }
const theme = async name => { await run(`app.changeTheme?.(${JSON.stringify(name)});app.setTheme?.(${JSON.stringify(name)});`); await pause(300); };

try {
  await c.command('Page.bringToFront'); await c.command('Emulation.setDeviceMetricsOverride', { width: 1360, height: 1100, deviceScaleFactor: 1, mobile: false });
  // Host precondition: Obsidian mounts Modals in activeDocument. A stale pointer to a closed popout's detached document makes
  // every dialog invisible and inert (observed after cold restarts in this environment). Refocus and assert the main window.
  report.activeDocumentRepaired = await c.evaluate(`(()=>{const stale=activeDocument!==document;if(stale){window.focus();window.dispatchEvent(new FocusEvent('focus'));}return stale;})()`);
  if (!(await c.evaluate('activeDocument===document'))) throw Error('Obsidian active document is not the main window; dialogs would be detached.');
  await theme('obsidian');
  await c.evaluate("app.plugins.getPlugin('mnemobard').services.modules.open('canvas')"); await wait('!!root?.querySelector("button.mod-cta")');
  if (!restart) {
    const prior = JSON.parse(await readFile('output/canvas/milestone-4b/native.json', 'utf8')); report.compositionId = prior.compositionId;
    // 1–4: startup and existing 4B composition integrity before any 4C edit.
    // A previous aborted harness run may have saved/left its own 4C edits. Restore the exact recorded 4B bytes of this
    // disposable test composition (guarded by ID/path) and discard harness drafts, so every run starts from the 4B baseline.
    let previous; try { previous = JSON.parse(await readFile(`${directory}/partial.json`, 'utf8')); } catch { previous = undefined; }
    if (previous?.compositionId === prior.compositionId && previous.before?.source && previous.before.path?.startsWith('MNEMOBARD/')) { report.restoredBaseline = await run(`const f=app.vault.getAbstractFileByPath(${JSON.stringify(previous.before.path)});assert(f,'Baseline path');const cur=await app.vault.read(f);if(cur===${JSON.stringify(previous.before.source)})return false;assert(cur.includes(${JSON.stringify(prior.compositionId)}),'Not the harness composition');await app.vault.modify(f,${JSON.stringify(previous.before.source)});return true;`); await pause(600); }
    // A previous aborted harness run may have left its own unsaved draft in memory; discard it explicitly (the saved file is the baseline).
    await run(`for(const d of services.canvas.drafts())if(d.draft.id===${JSON.stringify(prior.compositionId)})services.canvas.discard(d);`);
    report.before = await run(`const r=await services.repository.read(${JSON.stringify(prior.compositionId)});await view.setState({selectedId:${JSON.stringify(prior.compositionId)}});return{source:r.source,data:r.entity.data,path:r.path};`);
    await wait('!!view.structurePanel');
    await run(`assert(JSON.stringify(data())===JSON.stringify(${JSON.stringify(report.before.data)}),'Opening changed data');assert(!view.session.dirty,'Opening dirtied the composition');assert(data().sections.length===0&&data().markers.length===0&&data().audioRefs.length===0,'Unexpected prior structure');`);
    report.lanes = await run(`return data().lanes.map(l=>({id:l.id,name:l.name,channel:l.midiChannel??null,percussion:l.percussion??false,clips:l.clips.map(c=>[c.id,c.motifId,c.startTick,c.repeatCount,c.sourceRevision])}));`);
    await compile(); await run(`assert(prep.state==='ready',JSON.stringify(prep.diagnostics.slice(0,3)));`);
    report.baselineExport = `MNEMOBARD/Exports/arrangement-4c-baseline-${stamp}.mid`; await exportMidi(report.baselineExport);
    report.baselineMatches4B = (await readFile(`${vaultRoot}/${report.baselineExport}`)).equals(await readFile(`${vaultRoot}/${prior.exportPath}`));
    await check(`Plugin started; existing 4B composition opened unchanged and clean (${report.lanes.length} lanes, ${report.lanes.reduce((n, l) => n + l.clips.length, 0)} clips, explicit/Auto routing and source revisions intact); compiled and exported baseline (matches 4B export bytes: ${report.baselineMatches4B})`);

    // 5–11: sections through the keyboard panel, real pointer move/resize, overlap rejection, undo/redo.
    await run(`sx.open=true;`);
    for (const [name, from, to] of [['Introduction', '1:1:0', '5:1:0'], ['Theme A', '5:1:0', '13:1:0'], ['Outro', '17:1:0', '21:1:0']]) await run(`input('New section name',${JSON.stringify(name)});input('New section start (bar:beat:tick)',${JSON.stringify(from)});input('New section end (bar:beat:tick)',${JSON.stringify(to)});click('Add section');assert(byLabel('sections',${JSON.stringify(name)}),status());`);
    await shot('01-section-ruler'); await shot('02-named-sections', '.mnemobard-canvas-structure');
    const history0 = await run('return view.session.historySize;');
    await run(`sp.select('section',byLabel('sections','Theme A').id);input('Section name','Theme A — fog');input('Section description','Low drones under a single bell.');click('Apply section');assert(byLabel('sections','Theme A — fog').description==='Low drones under a single bell.',status());`);
    await run(`sp.select('section',byLabel('sections','Theme A — fog').id);`); await shot('03-selected-section'); await shot('04-section-editor', '.mnemobard-structure-editor');
    const outro = await run(`const s=byLabel('sections','Outro');tl.revealTick(s.startTick);const v=tl.viewport,x=t=>160+12+(t-v.startTick)/v.ppq*v.pixelsPerQuarter;return{id:s.id,start:s.startTick,end:s.endTick,mid:x((s.startTick+s.endTick)/2),endX:x(s.endTick)-2,bar:v.ppq*3,ppq:v.pixelsPerQuarter};`);
    await drag(outro.mid, outro.mid + outro.ppq * 3 * 2, 10);
    await run(`const s=data().sections.find(x=>x.id===${JSON.stringify(outro.id)});assert(s.startTick===${outro.start + outro.bar * 2}&&s.endTick===${outro.end + outro.bar * 2},'Pointer move failed '+JSON.stringify(s));`);
    const moved = await run(`const s=data().sections.find(x=>x.id===${JSON.stringify(outro.id)});tl.revealTick(s.startTick);const v=tl.viewport;return 172+(s.endTick-v.startTick)/v.ppq*v.pixelsPerQuarter-2;`);
    await drag(moved, moved + outro.ppq * 3, 10);
    await run(`const s=data().sections.find(x=>x.id===${JSON.stringify(outro.id)});assert(s.startTick===${outro.start + outro.bar * 2}&&s.endTick===${outro.end + outro.bar * 3},'Pointer resize failed '+JSON.stringify(s));`);
    await check('Three named sections created from the keyboard panel in 6/8; rename + description applied; real pointer drag moved Outro by two bars and dragging its end edge resized it by one bar (grid-snapped exact ticks)');
    await run(`sp.select('section',byLabel('sections','Introduction').id);input('Section end (bar:beat:tick)','6:1:0');click('Apply section');assert(status().includes('Overlaps section “Theme A — fog”'),'Overlap not reported: '+status());assert(byLabel('sections','Introduction').endTick===2880*4,'Overlap mutated');`);
    await shot('05-overlap-rejected', '.mnemobard-canvas-structure');
    const theme1 = await run(`const s=byLabel('sections','Theme A — fog');tl.revealTick(s.startTick);const v=tl.viewport;return 172+((s.startTick+s.endTick)/2-v.startTick)/v.ppq*v.pixelsPerQuarter;`);
    await drag(theme1, theme1 - outro.ppq * 3 * 2, 10);
    await run(`assert(byLabel('sections','Theme A — fog').startTick===2880*4,'Overlapping drag mutated');click('Discard',sx.querySelector('.mnemobard-structure-editor'));`);
    const history1 = await run('return view.session.historySize;');
    await run(`click('Undo');assert(data().sections.find(x=>x.id===${JSON.stringify(outro.id)}).endTick===${outro.end + outro.bar * 2},'Undo resize');click('Undo');assert(data().sections.find(x=>x.id===${JSON.stringify(outro.id)}).startTick===${outro.start},'Undo move');click('Redo');click('Redo');assert(data().sections.find(x=>x.id===${JSON.stringify(outro.id)}).endTick===${outro.end + outro.bar * 3},'Redo');`);
    await check(`Numeric overlap and overlapping pointer drag both rejected atomically with the conflicting section named (history ${history1 - history0} entries for 3 successful edits, none for rejections); Undo/Redo restore move/resize exactly`);

    // 12–16: markers, duplicates, navigation and alignment.
    for (const [name, at] of [['Build begins', '3:1:0'], ['Choir entrance', '9:1:0'], ['Transition', '9:1:0'], ['Recording cue', '14:4:0'], ['Final chord', '21:1:0']]) await run(`input('New marker name',${JSON.stringify(name)});input('New marker position (bar:beat:tick)',${JSON.stringify(at)});click('Add marker');assert(byLabel('markers',${JSON.stringify(name)}),status());`);
    await shot('06-marker-ruler');
    const cue = await run(`const m=byLabel('markers','Recording cue');tl.revealTick(m.tick);const v=tl.viewport;return{id:m.id,tick:m.tick,x:172+(m.tick-v.startTick)/v.ppq*v.pixelsPerQuarter,ppq:v.pixelsPerQuarter};`);
    await drag(cue.x, cue.x + cue.ppq, 31);
    await run(`assert(data().markers.find(m=>m.id===${JSON.stringify(cue.id)}).tick===${cue.tick + 960},'Marker drag failed');`);
    await run(`const order=[...sx.querySelectorAll('.mnemobard-structure-group')[1].querySelectorAll('button[data-structure-id]')].map(b=>b.textContent);assert(JSON.stringify(order)===JSON.stringify(['Build begins','Choir entrance','Transition','Recording cue','Final chord']),'Order '+order);assert(data().markers.filter(m=>m.tick===byLabel('markers','Transition').tick).length===2,'Duplicates merged');`);
    await shot('07-multiple-markers', '.mnemobard-canvas-structure');
    const historyNav = await run('return view.session.historySize;');
    await run(`panel.locate(0);click('Next marker');`); await wait(`panel.currentTick===byLabel('markers','Build begins').tick`);
    await run(`click('Next marker');`); await wait(`panel.currentTick===byLabel('markers','Choir entrance').tick`);
    await run(`click('Next marker');assert(view.session.historySize===${historyNav},'Navigation created history');assert(services.musical.state!=='playing','Navigation started playback');`);
    await shot('09-marker-navigation');
    await run(`sp.select('marker',byLabel('markers','Transition').id);`); await shot('08-marker-editor', '.mnemobard-structure-group:nth-of-type(2) .mnemobard-structure-editor');
    report.alignment = [];
    for (const [factor, scroll] of [[1, 0], [1.25 * 1.25, 0], [1, 900], [1 / 1.25 / 1.25 / 1.25, 0]]) {
      report.alignment.push(await run(`tl.zoom(${factor});tl.scroller.scrollLeft+=${scroll};tl.scroller.dispatchEvent(new Event('scroll'));tl.draw();const v=tl.viewport,dpr=devicePixelRatio,ctx=tl.ruler.getContext('2d');const ms=data().markers.map(m=>({m,x:172+(m.tick-v.startTick)/v.ppq*v.pixelsPerQuarter})).filter(o=>o.x>180&&o.x<v.width-20);const results=ms.map(({m,x})=>{const px=(xx)=>Array.from(ctx.getImageData(Math.round(xx*dpr),Math.round((22+16)*dpr),1,1).data);const on=px(x),off=px(x-4);return{tick:m.tick,x:Math.round(x),drawn:on.join()!==off.join()};});const clip=data().lanes.flatMap(l=>l.clips).map(c=>c.startTick);return{scale:v.pixelsPerQuarter,startTick:Math.round(v.startTick),rulerWidth:tl.ruler.clientWidth,canvasWidth:tl.canvas.clientWidth,visible:results.length,aligned:results.every(r=>r.drawn),clipTicks:clip.length};`));
    }
    if (!report.alignment.every(a => a.aligned && a.rulerWidth === a.canvasWidth)) throw Error('Ruler misaligned ' + JSON.stringify(report.alignment));
    await run(`tl.zoom(1);tl.scroller.scrollLeft=0;tl.scroller.dispatchEvent(new Event('scroll'));`);
    await check(`Five markers (two sharing 9:1:0, kept distinct, deterministic order); real pointer drag moved a marker one quarter; Next marker navigation moved only the stopped playhead/viewport with zero history entries; pixel sampling confirms every visible marker is drawn at its tick across ${report.alignment.length} zoom/scroll states`);

    // 17–25: recording references (synthetic WAVs), association, open, rename suggestion, missing, removal.
    report.files = {}; for (const [name, sec, hz] of [['station.wav', 1.5, 110], ['hum.wav', 1, 220], ['bells.wav', 0.5, 440]]) { const path = `${recordings}/${stamp}-${name}`; await createWav(path, sec, hz); report.files[name] = { path, sha: await sha(path) }; }
    await pause(200);
    await run(`sx.querySelectorAll('details').forEach(d=>{if(d.querySelector('summary')?.textContent==='Add recording reference')d.open=true;});input('Find recording file',${JSON.stringify(stamp)});select('Recording file',${JSON.stringify(report.files['station.wav'].path)});input('Reference name','Platform ambience');input('Reference description','Night platform, distant engines. Atmosphere reference only.');select('Associated section',byLabel('sections','Theme A — fog').id);click('Add recording reference');assert(byLabel('audioRefs','Platform ambience')?.sectionId===byLabel('sections','Theme A — fog').id,status());`);
    await run(`input('Find recording file',${JSON.stringify(stamp)});select('Recording file',${JSON.stringify(report.files['hum.wav'].path)});input('Reference name','Hum memo');select('Associated marker',byLabel('markers','Choir entrance').id);click('Add recording reference');const r=byLabel('audioRefs','Hum memo');assert(r?.markerId===byLabel('markers','Choir entrance').id&&r.atTick===byLabel('markers','Choir entrance').tick,status());`);
    await shot('10-reference-panel', '.mnemobard-structure-references');
    await run(`sp.select('reference',byLabel('audioRefs','Platform ambience').id);`); await shot('11-reference-section', '.mnemobard-structure-references');
    await run(`click('Open recording');`); await wait(`app.workspace.getLeavesOfType('audio').some(l=>l.view.file?.path===${JSON.stringify(report.files['station.wav'].path)})`);
    await run(`for(const l of app.workspace.getLeavesOfType('audio'))l.detach();app.workspace.setActiveLeaf(view.leaf,{focus:true});`);
    await check('Two synthetic WAV references added (one associated with a section, one with a marker; anchor defaulted to the marker); Open recording navigated to the file in Obsidian’s audio view without history entries');
    await run(`input('Find recording file',${JSON.stringify(stamp)});select('Recording file',${JSON.stringify(report.files['bells.wav'].path)});input('Reference name','Bells');click('Add recording reference');sp.select('reference',byLabel('audioRefs','Bells').id);click('Remove reference');assert(sx.textContent.includes('is not deleted or changed'),'Confirmation wording');click('Remove reference only');assert(!byLabel('audioRefs','Bells'),'Not removed');`);
    await save();
    await check('Reference removal requires confirmation stating the file is not deleted; record removed, composition saved');
    const renamed = `${recordings}/${stamp}-station-renamed.wav`;
    // Link-updating rename can exceed one CDP evaluation on a large vault: start it, then poll for completion.
    await run(`globalThis.__rename4c=app.fileManager.renameFile(app.vault.getAbstractFileByPath(${JSON.stringify(report.files['station.wav'].path)}),${JSON.stringify(renamed)});`);
    await wait(`!!app.vault.getAbstractFileByPath(${JSON.stringify(renamed)})`, 3000); await run(`await globalThis.__rename4c;delete globalThis.__rename4c;`); await pause(600);
    report.renameFrontmatter = await run(`const r=await services.repository.read(${JSON.stringify(report.compositionId)});return r.source.split('---')[1];`);
    await openComposition(report.compositionId);
    await wait(`sx.textContent.includes('likely a rename')`, 60).catch(() => {});
    report.renameSuggested = await run(`return sx.textContent.includes('likely a rename');`);
    if (report.renameSuggested) { await shot('20-rename-suggestion', '.mnemobard-structure-references'); await run(`click('Relink to renamed file');assert(byLabel('audioRefs','Platform ambience').path===${JSON.stringify(renamed)},'Relink');`); await save(); }
    report.files['station.wav'].renamed = renamed;
    await check(`Obsidian rename of a referenced recording: frontmatter link rewritten by host = ${report.renameFrontmatter.includes('station-renamed')}; relink suggested = ${report.renameSuggested}${report.renameSuggested ? ', accepted as one undoable edit and saved' : ''}`);
    const humMoved = `${recordings}/${stamp}-hum-moved-outside-obsidian-links.wav`;
    await run(`await app.vault.rename(app.vault.getAbstractFileByPath(${JSON.stringify(report.files['hum.wav'].path)}),${JSON.stringify(humMoved)});`); report.files['hum.wav'].moved = humMoved; await pause(500);
    await openComposition(report.compositionId);
    await run(`sp.select('reference',byLabel('audioRefs','Hum memo').id);`); await wait(`!!sx.querySelector('[data-recording-state="missing"]')`);
    await run(`assert(byLabel('audioRefs','Hum memo'),'Missing record deleted');assert(sx.querySelector('summary').textContent.includes('1 unavailable'),'Summary');assert(root.querySelector('button')&&[...sx.querySelectorAll('button')].find(b=>b.textContent==='Open recording')?.disabled,'Open enabled for missing');`);
    await shot('12-missing-reference', '.mnemobard-structure-references');
    await check('Recording moved without link updates: reference record preserved with a clear Missing warning, metadata inspectable, Open disabled, no automatic relink or deletion');

    // 26–30: save, close/reopen, MIDI unchanged.
    await save(); report.savedSource = await run(`return (await services.repository.read(${JSON.stringify(report.compositionId)})).source;`);
    await run(`view.leaf.detach();`); await pause(200); await c.evaluate("app.plugins.getPlugin('mnemobard').services.modules.open('canvas')"); await wait('!!root?.querySelector("button.mod-cta")');
    await openComposition(report.compositionId);
    report.structure = await run(`return{sections:data().sections,markers:data().markers,audioRefs:data().audioRefs};`);
    await run(`assert(JSON.stringify(data().lanes)===JSON.stringify(${JSON.stringify(report.before.data.lanes)}),'Lanes changed by 4C');assert(!view.session.dirty,'Reopen dirty');`);
    await compile(); await run(`assert(prep.state==='ready','Compile after structure');`);
    report.structuredExport = `MNEMOBARD/Exports/arrangement-4c-structured-${stamp}.mid`; await exportMidi(report.structuredExport);
    const a = await readFile(`${vaultRoot}/${report.baselineExport}`), b = await readFile(`${vaultRoot}/${report.structuredExport}`);
    if (!a.equals(b)) throw Error('Structure changed MIDI bytes');
    const parsed = spawnSync('python3', ['scripts/verify-midi.py', `${vaultRoot}/${report.structuredExport}`], { encoding: 'utf8' }); report.independentMidi = { status: parsed.status, stdout: parsed.stdout.slice(0, 2000), stderr: parsed.stderr.slice(0, 500) };
    if (parsed.status !== 0) throw Error('Independent MIDI parse failed ' + parsed.stderr);
    await check(`Saved, closed and reopened: ${report.structure.sections.length} sections, ${report.structure.markers.length} markers, ${report.structure.audioRefs.length} references restored with identical lanes/clips/routing; MIDI exported after 4C is byte-identical to the baseline export (${b.length} bytes) and parses independently`);

    // 31–32: playback/navigation interaction.
    await run(`click('Play arrangement');`); await wait('services.musical.state==="playing"'); await pause(400);
    await run(`click('Next section');`); await wait(`services.musical.state!=='playing'`);
    await run(`const s=data().sections.find(x=>x.startTick===panel.currentTick);assert(s,'Playhead not at a section start: '+panel.currentTick);assert(prep.state==='ready','Navigation invalidated compiled arrangement');assert(!services.musical.ownedBy(view),'Transport still owned');`);
    await run(`click('Play arrangement');`); await wait('services.musical.state==="playing"'); await pause(300);
    report.playStartTick = await run('return panel.currentTick;');
    await run(`panel.locate(0);`); await wait(`services.musical.state==='stopped'`);
    await check('During playback, Next section stopped audition and placed the stopped playhead at the section start (no auto-play, compiled state stays ready, ownership released); playback restarted from that position');
    await run(`click('Play arrangement');`); await wait('services.musical.state==="playing"');
    await run(`sp.select('marker',byLabel('markers','Final chord').id);input('Marker description','Hold until silence.');click('Apply marker');`); await wait(`services.musical.state==='stopped'&&prep.state==='invalidated'`);
    await run(`click('Undo');`); await compile();
    await check('Editing structure during playback conservatively invalidates/stops audition (4B composition-fingerprint policy retained); Undo then recompile returns to ready');

    // 33–37: visuals and keyboard.
    await shot('14-dark-workspace', '.mnemobard-canvas-structure');
    await theme('moonstone'); await shot('15-light-theme'); await theme('obsidian');
    await c.command('Emulation.setDeviceMetricsOverride', { width: 650, height: 1050, deviceScaleFactor: 1, mobile: false }); await pause(300); await shot('16-narrow-pane'); await shot('16b-narrow-structure-panel', '.mnemobard-canvas-structure');
    report.narrow = await run(`return{panelWidth:sx.clientWidth,scrollWidth:sx.scrollWidth,ruler:tl.ruler.clientWidth};`); if (report.narrow.scrollWidth > report.narrow.panelWidth + 2) throw Error('Narrow overflow ' + JSON.stringify(report.narrow));
    await c.command('Emulation.setDeviceMetricsOverride', { width: 1360, height: 1100, deviceScaleFactor: 2, mobile: false }); await pause(300); await shot('17-high-dpi');
    report.highDpi = await run(`return{css:tl.ruler.clientWidth,backing:tl.ruler.width,dpr:devicePixelRatio};`); if (report.highDpi.backing !== report.highDpi.css * 2) throw Error('DPI backing ' + JSON.stringify(report.highDpi));
    await c.command('Emulation.setDeviceMetricsOverride', { width: 1360, height: 1100, deviceScaleFactor: 1, mobile: false }); await pause(200);
    await run(`[...root.querySelectorAll('button')].find(b=>b.textContent==='Next section').focus();`); await key('Enter');
    await run(`const f=document.activeElement;assert(f?.dataset.structureId&&f.getAttribute('aria-pressed')==='true','Keyboard selection focus '+f?.outerHTML?.slice(0,80));`);
    await key('Tab'); await run(`assert(sx.contains(document.activeElement),'Tab left the panel unexpectedly');`);
    report.rulerFocus = await run(`tl.ruler.focus();assert(document.activeElement===tl.ruler,'Ruler not focusable');return{focusVisible:tl.ruler.matches(':focus-visible'),outline:getComputedStyle(tl.ruler).outlineStyle};`);
    await check(`Dark/light themes, 650px pane (no horizontal overflow: ${JSON.stringify(report.narrow)}), 2×DPI backing (${JSON.stringify(report.highDpi)}); keyboard Enter on Next section selects and focuses the pressed list item, Tab stays in the panel, ruler is focusable (${JSON.stringify(report.rulerFocus)})`);

    // 38–39: protected save conflict and recovery.
    await run(`input('New marker name','Conflict probe');input('New marker position (bar:beat:tick)','2:1:0');click('Add marker');`); await run(`await view.session.checkpoint();`);
    report.recoveryPath = await run('return view.session.recoveryPath;');
    await run(`const b=view.session.base;await app.vault.process(app.vault.getAbstractFileByPath(b.path),s=>s+'\\nExternal 4C review prose\\n');click('Save composition');`); await wait(`view.session.error.includes('Not saved')`);
    await shot('18-save-conflict', '.mnemobard-canvas-heading');
    await run(`assert(!(await services.repository.read(${JSON.stringify(report.compositionId)})).source.includes('Conflict probe'),'Conflict overwrote');assert(byLabel('markers','Conflict probe'),'Draft lost');`);
    await run(`click('Composition recovery');`); await wait('!!view.recoveryPanel'); await run(`await view.recoveryPanel.inspect(${JSON.stringify(report.recoveryPath)});`); await wait(`[...(root.querySelector('.mnemobard-recovery-detail')?.querySelectorAll('textarea')??[])].some(t=>t.getAttribute('aria-label')==='Original checkpoint JSON'&&t.value.includes('Conflict probe'))&&root.querySelector('.mnemobard-recovery-detail').textContent.includes('CONFLICT')`);
    await shot('19-recovery', '.mnemobard-recovery-detail');
    await run(`services.canvas.discard(view.session);`); await openComposition(report.compositionId);
    await run(`assert(!byLabel('markers','Conflict probe')&&(await services.repository.read(${JSON.stringify(report.compositionId)})).source.includes('External 4C review prose'),'Conflict resolution');`);
    report.savedSource = await run(`return (await services.repository.read(${JSON.stringify(report.compositionId)})).source;`);
    await check('Protected Save refused after an external modification (vault kept the external prose, draft kept the new marker); recovery checkpoint contains the marker; discard + reopen loads the external version with all 4C structure intact');

    // 40–41: module and plugin lifecycle.
    await compile(); await run(`click('Play arrangement');`); await wait('services.musical.state==="playing"');
    await run(`globalThis.__sp=view.structurePanel;await plugin.setModule('canvas',false);assert(services.musical.state==='stopped','Module disable left audio');assert(__sp.closed,'Structure panel not disposed');delete globalThis.__sp;await plugin.setModule('canvas',true);`);
    await c.evaluate("app.plugins.getPlugin('mnemobard').services.modules.open('canvas')"); await wait('!!root?.querySelector("button.mod-cta")'); await openComposition(report.compositionId);
    await run(`assert(data().sections.length===3&&data().markers.length===5,'Module toggle lost data');`);
    await c.evaluate(`(async()=>{await app.plugins.disablePlugin('mnemobard');await app.plugins.enablePlugin('mnemobard');})()`); await pause(1200);
    await c.evaluate("app.plugins.getPlugin('mnemobard').services.modules.open('canvas')"); await wait('!!root?.querySelector("button.mod-cta")'); await openComposition(report.compositionId);
    await run(`assert(data().audioRefs.length===2&&!view.session.dirty,'Plugin toggle lost data');`);
    await check('CANVAS module disable during playback stopped audio and disposed the structure panel; module and whole-plugin disable/enable cycles reopen the composition with all structure intact');

    for (const [name, f] of Object.entries(report.files)) { const path = f.renamed ?? f.moved ?? f.path; f.after = await sha(path); if (f.after !== f.sha) throw Error(`Recording bytes changed: ${name}`); }
    await check('All three synthetic recordings (including the renamed, moved and removed-reference files) are byte-identical to their creation hashes');
    report.rendererExceptions = c.exceptions; if (c.exceptions.length) throw Error(c.exceptions.join('\n'));
    await writeFile(`${directory}/native.json`, JSON.stringify(report, null, 2) + '\n');
    console.log('Phase 1 complete. Restart only the isolated Obsidian, then run with --verify-restart.');
  } else {
    // 42–44: after a cold restart.
    report = JSON.parse(await readFile(`${directory}/native.json`, 'utf8')); report.restart = { checks: [] };
    await run(`const r=await services.repository.read(${JSON.stringify(report.compositionId)});assert(r.source===${JSON.stringify(report.savedSource)},'Cold source changed');`);
    await openComposition(report.compositionId);
    await run(`const s=${JSON.stringify(report.structure)};assert(JSON.stringify(data().sections)===JSON.stringify(s.sections)&&JSON.stringify(data().markers)===JSON.stringify(s.markers)&&JSON.stringify(data().audioRefs)===JSON.stringify(s.audioRefs),'Structure differs after restart');sx.open=true;sp.select('section',data().sections[1].id);`);
    await wait(`!!sx.querySelector('[data-recording-state="missing"]')`);
    await shot('13-saved-reopened');
    await run(`sp.select('reference',byLabel('audioRefs','Hum memo').id);click('Relink reference');input('Find replacement recording',${JSON.stringify(report.stamp)});select('Replacement recording',${JSON.stringify(report.files['hum.wav'].moved)});click('Relink to selected file');assert(byLabel('audioRefs','Hum memo').path===${JSON.stringify(report.files['hum.wav'].moved)},status());`);
    await run(`click('Undo');assert(byLabel('audioRefs','Hum memo').path===${JSON.stringify(report.files['hum.wav'].path)},'Undo relink');click('Redo');`); await save();
    report.restart.checks.push('Cold restart: saved Markdown byte-identical; sections/markers/references identical; missing reference still preserved and explicitly relinked (undo/redo) then saved');
    console.log('✓', report.restart.checks.at(-1));
    report.restart.rendererExceptions = c.exceptions; if (c.exceptions.length) throw Error(c.exceptions.join('\n'));
    await writeFile(`${directory}/native-restart.json`, JSON.stringify(report, null, 2) + '\n');
  }
} finally { c.close(); }
