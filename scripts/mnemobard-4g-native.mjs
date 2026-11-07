/**
 * Real-host Milestone 4G workflow (§13) + screenshots (§14). Disposable vault only (CDP refuses others). Reuses the 4F
 * "Night procession" fixture (restored byte-for-byte from output/mnemobard/milestone-4f/fixture.json at the start of each run).
 * Usage: node scripts/mnemobard-4g-native.mjs                  (steps 1–29, 32–39; leaves a protected conflict + recovery copy)
 *        node scripts/mnemobard-4g-native.mjs --verify-restart (steps 30–31 and 39–40 after a cold Obsidian restart)
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { connect } from './obsidian-cdp.mjs';

const directory = 'output/mnemobard/milestone-4g', vaultRoot = 'dev-vault';
await mkdir(directory, { recursive: true });
const c = await connect(), stamp = String(Date.now()), pause = ms => new Promise(r => setTimeout(r, ms)), restart = process.argv.includes('--verify-restart');
let report = { stamp, checks: [], screenshots: [], observations: {} };
if (restart) report = { ...JSON.parse(await readFile(`${directory}/native-part1.json`, 'utf8')), stamp, checks: [], screenshots: [] };
const prefix = `const plugin=app.plugins.getPlugin('mnemobard'),services=plugin.services,leaf=t=>app.workspace.getLeavesOfType('mnemobard-'+t)[0],cv=leaf('canvas')?.view,mv=leaf('motif')?.view,pb=leaf('patchbook')?.view,root=cv?.contentEl,prep=cv?.performancePanel?.preparation,insp=root?.querySelector('.mnemobard-canvas-inspector'),modal=cv?.reviewModal?.contentEl;const assert=(v,m)=>{if(!v)throw Error(m);};const click=(text,scope=document)=>{const all=[...scope.querySelectorAll('button')].filter(b=>!b.disabled),b=all.find(b=>b.textContent===text)??all.find(b=>b.textContent.startsWith(text));assert(b,'Missing button '+text);b.click();};const input=(label,value,scope=document)=>{const e=[...scope.querySelectorAll('input,textarea,select')].find(e=>e.getAttribute('aria-label')===label);assert(e,'Missing input '+label);e.value=value;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));};const status=()=>root.querySelector('.mnemobard-arrangement-state')?.textContent;const changed=()=>(cv.plan?.diagnostics??[]).filter(d=>d.code==='changed'||d.code==='unreviewed').length;`;
async function run(body) { try { return await c.evaluate(`(globalThis.__n4g=(async()=>{${prefix}${body}})())`); } finally { await c.evaluate('delete globalThis.__n4g'); } }
async function wait(test, tries = 450) { for (let i = 0; i < tries; i++) { if (await run(`return (${test});`)) return; await pause(30); } throw Error('Timed out: ' + test); }
async function check(step, text) { report.checks.push({ step, text }); console.log('✓', step, text); await writeFile(`${directory}/partial${restart ? '-restart' : ''}.json`, JSON.stringify(report, null, 2) + '\n'); }
async function shot(name, scroll) { if (scroll) await run(`const e=${scroll};e?.scrollIntoView({block:'center'});`); await pause(250); const s = await c.command('Page.captureScreenshot', { format: 'png' }); await writeFile(`${directory}/${name}.png`, Buffer.from(s.data, 'base64')); if (!report.screenshots.includes(name + '.png')) report.screenshots.push(name + '.png'); }
const theme = async name => { await run(`app.changeTheme?.(${JSON.stringify(name)});`); await pause(300); };
const activate = async t => { await run(`await services.modules.open('${t}');app.workspace.setActiveLeaf(leaf('${t}'),{focus:true});`); await pause(150); };
const KEYS = { Tab: 9, ArrowDown: 40, ArrowUp: 38 }; async function key(name) { for (const type of ['keyDown', 'keyUp']) await c.command('Input.dispatchKeyEvent', { type, key: name, code: name, windowsVirtualKeyCode: KEYS[name] ?? 0 }); await pause(80); }
async function exportMidi(path) { await run(`root.querySelector('.mnemobard-arrangement-seek').open=true;click('Export arrangement MIDI',root);`); await wait('!!cv.performancePanel.dialog?.contentEl.querySelector("input")'); await run(`const d=cv.performancePanel.dialog;assert(d.containerEl.isConnected&&d.containerEl.ownerDocument===document,'dialog not visible');input('New arrangement MIDI destination',${JSON.stringify(path)},d.contentEl);`); await run(`click('Create arrangement MIDI',cv.performancePanel.dialog.contentEl);`); await wait("cv.performancePanel.dialog.contentEl.textContent.includes('Export created:')", 600); await run(`click('Cancel export',cv.performancePanel.dialog.contentEl);`); await wait('!cv.performancePanel.dialog?.containerEl.isConnected'); }
const verifyMidi = path => { const r = spawnSync('python3', ['scripts/verify-midi.py', `${vaultRoot}/${path}`], { encoding: 'utf8' }); let parsed; try { parsed = JSON.parse(r.stdout); } catch { parsed = undefined; } return { status: r.status, parsed, stderr: r.stderr.slice(0, 300) }; };
async function external(path, fn, label) { if (!path.startsWith('MNEMOBARD/')) throw Error('Refusing external edit outside MNEMOBARD/'); const before = await readFile(`${vaultRoot}/${path}`, 'utf8'), after = fn(before); if (after === before) throw Error('External edit changed nothing: ' + label); await writeFile(`${vaultRoot}/${path}`, after); return before; }
const pathOf = id => run(`const s=services.index.locate(${JSON.stringify(id)});return s.status==='ready'?s.path:null;`);
/** Metadata-only snapshot (names, sizes, mtimes; never contents) of the user's REAPER configuration, to prove it was not touched. */
const reaperStat = () => { const r = spawnSync('bash', ['-c', `find "${homedir()}/.config/REAPER" -printf '%P %s %T@\\n' 2>/dev/null | sort | sha256sum`], { encoding: 'utf8' }); return r.stdout.trim().split(' ')[0]; };

try {
  await c.command('Page.bringToFront'); await c.command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  report.observations[restart ? 'activeDocumentAtRestart' : 'activeDocumentAtStart'] = await c.evaluate('activeDocument===document?"main":"other"');
  await theme('obsidian');
  if (!restart) {
    report.reaperConfigBefore = reaperStat();
    // ── Fixture: 4F Night procession (restored) + one 5,000-note motif for 32–34 (created once, reused) ──
    const F = JSON.parse(await readFile('output/mnemobard/milestone-4f/fixture.json', 'utf8')), q = JSON.stringify;
    let extra; try { extra = JSON.parse(await readFile(`${directory}/fixture.json`, 'utf8')); } catch { extra = undefined; }
    if (!extra || !(await run(`return services.index.locate(${q(extra.large)}).status==='ready';`))) {
      extra = await run(`const u=()=>crypto.randomUUID(),notes=[];for(let i=0;i<5000;i++)notes.push({id:u(),pitch:48+(i*5)%36,startTick:i*240,durationTicks:200+(i%3)*40,velocity:40+(i%80)});
        const m=await services.repository.create({id:u(),kind:'motif',schemaVersion:1,title:'Large phrase (5000 notes)',extra:{},data:{schemaVersion:1,ppq:960,tempoMicrosecondsPerQuarter:500000,meter:{numerator:4,denominator:4},lengthTicks:5000*240,notes}});await services.index.settled();return{large:m.entity.id};`);
      await writeFile(`${directory}/fixture.json`, JSON.stringify(extra, null, 2) + '\n');
    }
    report.fixture = { ...F, sources: undefined, large: extra.large };
    await run(`for(const d of services.canvas.drafts())if(d.draft.id===${q(F.composition)})services.canvas.discard(d);const cur=leaf('canvas')?.view?.session;if(cur?.draft.id===${q(F.composition)})services.canvas.discard(cur);for(const d of services.motifs.drafts())if([${q(F.motifA)},${q(F.motifB)},${q(extra.large)}].includes(d.draft.id))services.motifs.discard(d);for(const d of services.patchbook.getDrafts())if(d.draft.id===${q(F.patch)})services.patchbook.discard(d);`);
    for (const [k, original] of Object.entries(F.sources ?? {})) { const where = await pathOf(F[k]); if (where?.startsWith('MNEMOBARD/') && (await readFile(`${vaultRoot}/${where}`, 'utf8')) !== original.source) { await writeFile(`${vaultRoot}/${where}`, original.source); (report.restored ??= []).push(k); } }
    if (report.restored) { await pause(900); await run(`await services.index.settled();`); }
    report.before = { motifA: await run(`return (await services.repository.read(${q(F.motifA)})).source;`) };

    // 1–3 Obsidian running (launched by pnpm dev:obsidian); PATCHBOOK; patch with associated motifs
    report.host = await run(`return{ua:navigator.userAgent.match(/obsidian\\/[\\d.]+/)?.[0],modules:['patchbook','motif','canvas'].map(m=>services.modules.enabled(m)),vault:app.vault.adapter.getBasePath().split('/').slice(-2).join('/')};`);
    await activate('patchbook'); await run(`await pb.setState({selectedId:${q(F.patch)}});`); await wait(`pb.currentSession?.draft.id===${q(F.patch)}&&pb.contentEl.textContent.includes('Motifs using this patch')`);
    report.patchbook = await run(`return pb.contentEl.querySelector('[aria-label="Motifs using this patch"] h3').textContent;`);
    // 8.5: the association summary stays visible (read-only) in edit mode
    await run(`click('Edit record',pb.contentEl);`); await wait(`!!pb.contentEl.querySelector('details[aria-label="Motifs using this patch"]')`);
    report.patchbookEdit = await run(`const d=pb.contentEl.querySelector('details[aria-label="Motifs using this patch"]');d.open=true;return{summary:d.querySelector('summary').textContent,buttons:d.querySelectorAll('button').length,form:!!pb.contentEl.querySelector('form')};`);
    await shot('11-patchbook-edit-associations', `pb.contentEl.querySelector('details[aria-label="Motifs using this patch"]')`);
    await run(`click('Keep draft & close form',pb.contentEl);`); await wait(`pb.contentEl.querySelector('section[aria-label="Motifs using this patch"]')`);
    if (report.patchbookEdit.buttons !== 0 || !report.patchbookEdit.form) throw Error('PATCHBOOK edit ' + JSON.stringify(report.patchbookEdit));
    await check('1–3', `${report.host.ua} on ${report.host.vault}; PATCHBOOK “Night choir” lists ${report.patchbook}; in edit mode the saved summary stays visible read-only (${JSON.stringify(report.patchbookEdit)})`);

    // 4–7 MOTIF, then the composition using it with the clip selected
    await run(`click('Open in MOTIF',pb.contentEl.querySelector('[aria-label="Motifs using this patch"]'));`); await wait(`leaf('motif')?.view?.session?.draft.id===${q(F.motifA)}`);
    await run(`click('Open in CANVAS',mv.contentEl.querySelector('[aria-label="Compositions using this motif"]'));`); await wait(`leaf('canvas')?.view?.session?.draft.id===${q(F.composition)}&&!!leaf('canvas').view.session.selectedClip`);
    report.focus = await run(`const s=cv.session,clip=s.draft.data.lanes.flatMap(l=>l.clips).find(c=>c.id===s.selectedClip);return{motif:clip.motifId===${q(F.motifA)},status:status(),changed:changed()};`);
    if (!report.focus.motif) throw Error('Focus ' + JSON.stringify(report.focus));
    await check('4–7', `Open in MOTIF → “Ascending choir”; Open in CANVAS → “Night procession” with the motif's clip selected (status “${report.focus.status}”, ${report.focus.changed} placements awaiting review)`);

    // 8–11 modify + save the motif in MOTIF, return to CANVAS: source-change warning
    await activate('motif'); const notesBefore = await run('return mv.session.draft.data.notes.length;');
    await run(`const n=mv.session.draft.data.notes.find(n=>n.pitch===71);mv.session.select([n.id]);click('Add note',mv.contentEl);`); await wait(`mv.session.draft.data.notes.length===${notesBefore + 1}&&mv.session.dirty`);
    await run(`click('Save motif',mv.contentEl);`); await wait('!mv.session.dirty&&mv.session.status==="Saved"');
    await activate('canvas'); await wait(`changed()>=2&&!root.querySelector('.mnemobard-review-banner').hidden`);
    report.warning = await run(`return{banner:root.querySelector('.mnemobard-review-banner').textContent,status:status(),diagnostic:[...root.querySelectorAll('.mnemobard-diagnostic-row[data-diagnostic="changed"] button')].map(b=>b.textContent)};`);
    await run(`root.scrollTop=0;`); await shot('01-canvas-source-change-warning');
    if (!report.warning.status.startsWith('Source review required')) throw Error('Warning ' + JSON.stringify(report.warning));
    await check('8–11', `Added a note to “Ascending choir” and saved it; CANVAS shows “${report.warning.banner}” and status “${report.warning.status}”; diagnostics offer ${JSON.stringify([...new Set(report.warning.diagnostic)])}`);

    // 12–14 review interface: overview, affected placements, revision summary; keyboard focus inside the review
    await run(`click('Review changed sources',root.querySelector('.mnemobard-review-banner'));`); await wait(`!!cv.reviewModal?.contentEl.querySelector('.mnemobard-review-detail')`);
    report.review = await run(`return{sources:[...modal.querySelectorAll('[data-review-motif]')].map(b=>b.textContent),compare:[...modal.querySelectorAll('.mnemobard-review-compare tbody tr')].map(r=>[...r.children].map(x=>x.textContent).join(' | ')),placements:[...modal.querySelectorAll('.mnemobard-review-clips tbody tr')].map(r=>[...r.children].map(x=>x.textContent).join(' | ')),timing:modal.querySelector('[data-timing]')?.textContent,history:modal.textContent.includes('note-by-note comparison is not possible')};`);
    await shot('02-source-review-overview');
    await run(`modal.querySelector('.mnemobard-review-sources button').focus();`); await key('Tab');
    report.keyboard = await run(`const a=document.activeElement;return{label:a.getAttribute('aria-label')??a.textContent,inReview:!!a.closest('.mnemobard-source-review'),focusVisible:a.matches(':focus-visible'),outline:getComputedStyle(a).outlineStyle};`);
    await shot('15-keyboard-focus');
    await shot('03-source-review-affected-clips', `modal.querySelector('.mnemobard-review-clips')`); await shot('04-source-review-comparison', `modal.querySelector('.mnemobard-review-compare')`);
    if (report.review.placements.length !== 2 || !report.review.history || !report.keyboard.inReview || !report.keyboard.focusVisible || report.keyboard.outline === 'none') throw Error('Review ' + JSON.stringify({ review: report.review, keyboard: report.keyboard }));
    await check('12–14', `Review changed sources lists ${JSON.stringify(report.review.sources)}; placements ${JSON.stringify(report.review.placements)}; comparison ${JSON.stringify(report.review.compare)}; ${report.review.timing}; keyboard Tab focus ${JSON.stringify(report.keyboard)}`);

    // §9 races natively: (a) the saved motif changes while the confirmation is shown → withdrawn; (b) it changes on disk right before Confirm → refused
    const motifPath = await pathOf(F.motifA);
    await run(`click('Acknowledge this source for all',modal);`); await wait(`!!modal.querySelector('[aria-label="Confirm acknowledgement"]')`);
    let original = await external(motifPath, t => t.replace(/"velocity": (\d+)/, (m, v) => `"velocity": ${Number(v) === 1 ? 2 : Number(v) - 1}`), 'race a');
    await wait(`!modal.querySelector('[aria-label="Confirm acknowledgement"]')&&modal.textContent.includes('review changed while it was open')`, 600);
    report.raceWhileOpen = await run(`return modal.querySelector('.mnemobard-review-notice').textContent;`);
    await writeFile(`${vaultRoot}/${motifPath}`, original); await wait(`!modal.textContent.includes('blocked')&&!!modal.querySelector('.mnemobard-review-actions button.mod-cta')`, 600); await pause(400);
    await run(`click('Acknowledge this source for all',modal);`); await wait(`!!modal.querySelector('[aria-label="Confirm acknowledgement"]')`);
    original = await external(motifPath, t => t.replace(/"velocity": (\d+)/, (m, v) => `"velocity": ${Number(v) === 1 ? 2 : Number(v) - 1}`), 'race b');
    await run(`click('Confirm acknowledgement',modal);`); await wait(`modal.querySelector('.mnemobard-review-notice[role="alert"]')?.textContent.length>0`, 600);
    report.raceBeforeConfirm = await run(`return{notice:modal.querySelector('.mnemobard-review-notice').textContent,stillPending:changed()};`);
    await writeFile(`${vaultRoot}/${motifPath}`, original); await pause(900); await run('await services.index.settled();'); await wait(`!!modal.querySelector('.mnemobard-review-actions button.mod-cta')&&!modal.querySelector('.mnemobard-review-actions button.mod-cta').disabled`, 600);
    if (!/changed/.test(report.raceWhileOpen) || !/changed during the review|review changed/.test(report.raceBeforeConfirm.notice) || report.raceBeforeConfirm.stillPending < 2) throw Error('Races ' + JSON.stringify({ a: report.raceWhileOpen, b: report.raceBeforeConfirm }));
    await check('§9', `Source changed while the confirmation was open → withdrawn (“${report.raceWhileOpen}”); changed on disk right before Confirm → refused (“${report.raceBeforeConfirm.notice}”), nothing acknowledged; exact bytes restored`);

    // 15–16 acknowledge for all eligible clips → warnings clear
    const history = await run('return cv.session.historySize;');
    await run(`click('Acknowledge this source for all',modal);`); await wait(`!!modal.querySelector('[aria-label="Confirm acknowledgement"]')`); await shot('05-source-review-confirmation', `modal.querySelector('[aria-label="Confirm acknowledgement"]')`);
    await run(`click('Confirm acknowledgement',modal);`); await wait(`modal.textContent.includes('No changed sources')`, 600);
    report.ack = await run(`return{notice:modal.querySelector('.mnemobard-review-notice').textContent,history:cv.session.historySize,changed:changed(),banner:root.querySelector('.mnemobard-review-banner').hidden,status:status()};`);
    await shot('06-source-review-completed');
    if (report.ack.history !== history + 1 || report.ack.changed !== 0 || !report.ack.banner) throw Error('Ack ' + JSON.stringify(report.ack));
    await run(`click('Close review',modal);`);
    await check('15–16', `Confirmed: “${report.ack.notice}”; one history entry (+1), no changed placements, banner hidden, status “${report.ack.status}”`);

    // 17–19 undo/redo of the single acknowledgement
    await run(`click('Undo',root);`); await pause(200); const undone = await run(`return{changed:changed(),banner:!root.querySelector('.mnemobard-review-banner').hidden,status:status()};`);
    await run(`click('Redo',root);`); await pause(200); const redone = await run(`return{changed:changed(),status:status()};`);
    if (undone.changed < 2 || !undone.banner || redone.changed !== 0) throw Error('Undo/redo ' + JSON.stringify({ undone, redone }));
    await check('17–19', `Undo restored the review state for every placement in one step (${JSON.stringify(undone)}); Redo acknowledged them again (${JSON.stringify(redone)})`);

    // 20–23 recompile, current status, musical duration labels, export twice + independent verification
    await run(`click('Compile arrangement',root);`); await wait(`prep.state==='ready'`, 600);
    report.compiled = await run('return status();');
    await shot('07-canvas-compiled-current', `root.querySelector('.mnemobard-canvas-transport')`);
    const clipA = await run(`return cv.session.draft.data.lanes.flatMap(l=>l.clips).find(c=>c.motifId===${q(F.motifA)}).id;`);
    await run(`const lane=cv.session.draft.data.lanes.find(l=>l.clips.some(c=>c.id===${q(clipA)}));cv.select(lane.id,${q(clipA)});insp.querySelector('.mnemobard-canvas-source-review').open=true;`);
    report.durations = await run(`return[...insp.querySelectorAll('.mnemobard-canvas-source-review p')].map(p=>p.textContent.replace(/[0-9a-f]{64}/g,'<sha256>')+' ['+p.title+']');`);
    await shot('08-canvas-musical-duration-labels', `root.querySelector('.mnemobard-arrangement-surface')`);
    if (!report.durations.some(t => /2 bars per repetition/.test(t))) throw Error('Durations ' + JSON.stringify(report.durations));
    report.export1 = `MNEMOBARD/Exports/night-procession-4g-${stamp}-a.mid`; report.export2 = `MNEMOBARD/Exports/night-procession-4g-${stamp}-b.mid`;
    await exportMidi(report.export1); await exportMidi(report.export2);
    report.deterministic = (await readFile(`${vaultRoot}/${report.export1}`)).equals(await readFile(`${vaultRoot}/${report.export2}`));
    const v = verifyMidi(report.export1), tracks = v.parsed?.tracks ?? [], ons = tracks.flatMap(t => t.events.filter(e => e[1] === 'on'));
    report.midi = { status: v.status, format: v.parsed?.format, ppq: v.parsed?.ppq, trackCount: tracks.length, tracks: tracks.map(t => t.name.replace(/^[0-9a-f-]{36} · /, '')), endTicks: [...new Set(tracks.map(t => t.endTick))], noteOns: ons.length, channels: [...new Set(ons.map(e => e[2]))], ordered: tracks.every(t => t.events.every((e, i, a) => i === 0 || a[i - 1][0] <= e[0])) };
    report.midi.expectedNoteOns = await run(`const n=id=>services.index.resolve(id).entity.data.notes.length;return n(${q(F.motifA)})*3+n(${q(F.motifB)})*4;`);
    report.midi.sha256 = spawnSync('sha256sum', [`${vaultRoot}/${report.export1}`], { encoding: 'utf8' }).stdout.split(' ')[0];
    report.midi.compiled = await run('return{notes:prep.prepared.arrangement.expandedNotes,events:prep.prepared.arrangement.events.length,length:prep.prepared.arrangement.lengthTicks};');
    if (v.status !== 0 || !report.deterministic || report.midi.ppq !== 960 || report.midi.noteOns !== report.midi.expectedNoteOns || report.midi.compiled.notes !== report.midi.noteOns || report.midi.endTicks.join() !== '122880' || report.midi.channels.length !== 2 || !report.midi.ordered) throw Error('MIDI ' + JSON.stringify(report.midi));
    await check('20–23', `Recompiled (“${report.compiled}”); inspector lengths ${JSON.stringify(report.durations)}; two exports byte-identical and independently verified ${JSON.stringify(report.midi)}`);

    // 24–26 save, close and reopen, acknowledgement persisted
    await run(`click('Save composition',root);`); await wait('!cv.session.dirty');
    report.saved = await run(`return (await services.repository.read(${q(F.composition)})).source;`);
    await run(`cv.leaf.detach();`); await activate('canvas'); await run(`await leaf('canvas').view.setState({selectedId:${q(F.composition)}});`); await wait(`leaf('canvas').view.session?.draft.id===${q(F.composition)}`);
    report.reopened = await run(`const head=services.index.heads().find(h=>h.id===${q(F.motifA)}.toLowerCase());return{same:(await services.repository.read(${q(F.composition)})).source===${q(report.saved)},dirty:cv.session.dirty,changed:changed(),acknowledged:cv.session.draft.data.lanes.flatMap(l=>l.clips).filter(c=>c.motifId===${q(F.motifA)}).every(c=>c.sourceRevision===head.revision),banner:root.querySelector('.mnemobard-review-banner').hidden};`);
    if (!report.reopened.same || report.reopened.dirty || report.reopened.changed || !report.reopened.acknowledged) throw Error('Reopen ' + JSON.stringify(report.reopened));
    await check('24–26', `Saved, closed and reopened: byte-identical, clean, every placement records the current saved revision ${JSON.stringify(report.reopened)}`);

    // 27–29 external note conflict, save blocked, recovery copy
    await run(`const s=cv.session;s.edit('Add marker',c=>({...c,data:{...c.data,markers:[...c.data.markers,{id:crypto.randomUUID(),label:'Unsaved 4G cue',tick:1920}]}}));`);
    const compPath = await pathOf(F.composition); await external(compPath, t => t.replace(/^mnemobard_description: .*$/m, 'mnemobard_description: Changed in another app (4G)'), 'composition description');
    await wait(`cv.session.freshness.state==='conflict'`);
    await run(`click('Save composition',root);`); await pause(400);
    report.saveBlocked = { status: await run('return root.querySelector(".mnemobard-save-status").textContent+" · "+root.querySelector(".mnemobard-feedback").textContent;'), diskKept: (await readFile(`${vaultRoot}/${compPath}`, 'utf8')).includes('Changed in another app (4G)') };
    await run(`click('Store recovery copy and open recovery',root.querySelector('.mnemobard-freshness-banner'));`); await wait(`root.textContent.includes('Close composition recovery')`);
    await shot('16-conflict-recovery', `root.querySelector('.mnemobard-freshness-banner')`);
    report.recovery = { path: await run('return cv.session.recoveryPath;') }; report.recovery.contains = (await readFile(`${vaultRoot}/${report.recovery.path}`, 'utf8')).includes('Unsaved 4G cue');
    report.recovery.diskUntouched = (await readFile(`${vaultRoot}/${compPath}`, 'utf8')).includes('Changed in another app (4G)') && !(await readFile(`${vaultRoot}/${compPath}`, 'utf8')).includes('Unsaved 4G cue');
    await run(`click('Close composition recovery',root);`);
    if (!report.saveBlocked.diskKept || !report.recovery.contains || !report.recovery.diskUntouched) throw Error('Conflict ' + JSON.stringify({ s: report.saveBlocked, r: report.recovery }));
    await run('await cv.session.checkpoint();'); report.pendingRecovery = report.recovery.path;
    await check('27–29', `External description edit with an unsaved marker → protected conflict; Save refused (${report.saveBlocked.status}); note on disk kept; recovery copy ${report.recovery.path} holds the unsaved cue`);

    // 32–35 5,000-note motif: open, select, scroll, zoom, edit, keyboard, no notes lost
    await activate('motif'); const L = extra.large;
    const savedLarge = await run(`return (await services.repository.read(${q(L)})).entity.data.notes;`).then(n => JSON.stringify(n));
    report.large = { open: await run(`const t=performance.now();await mv.setState({selectedId:${q(L)}});assert(mv.session?.draft.id===${q(L)},'open');return +(performance.now()-t).toFixed(1);`) };
    await pause(200); await shot('09-motif-large-document');
    report.large.select = await run(`const b=mv.contentEl.querySelectorAll('[data-note-id]')[3];b.click();return{selected:[...mv.session.selected],register:mv.contentEl.querySelector('.mnemobard-note-inspector-heading span').textContent};`);
    report.large.scroll = await run(`const r=mv.roll;r.scroller.scrollLeft=r.scroller.scrollWidth/2;r.scroller.dispatchEvent(new Event('scroll'));await new Promise(x=>requestAnimationFrame(()=>x()));return{startTick:Math.round(r.viewport.startTick),visible:r.visibleCount};`);
    await run(`click('Time +',mv.contentEl);click('Time +',mv.contentEl);`); await pause(200);
    report.large.zoom = await run('return{pixelsPerQuarter:mv.roll.viewport.pixelsPerQuarter,visible:mv.roll.visibleCount};');
    await shot('10-motif-large-document-scrolled');
    // keyboard alternative: Arrow keys in the note list move the selection in musical order
    await run(`mv.contentEl.querySelector('.mnemobard-note-register').open=true;mv.contentEl.querySelector('[data-note-id]').focus();`); await key('ArrowDown'); await key('ArrowDown');
    report.large.keyboard = await run(`return{selected:[...mv.session.selected].length,focused:document.activeElement?.dataset.noteId??document.activeElement?.tagName};`);
    // edit then undo: delete the selection, undo; the draft must equal the saved notes exactly
    report.large.edit = await run(`const before=mv.session.draft.data.notes.length;click('Delete selected',mv.contentEl);const after=mv.session.draft.data.notes.length;click('Undo',mv.contentEl);return{before,after,restored:mv.session.draft.data.notes.length};`);
    report.large.noLoss = await run(`return JSON.stringify(mv.session.draft.data.notes)===${q(savedLarge)}&&!mv.session.dirty;`);
    if (report.large.edit.after !== 4999 || report.large.edit.restored !== 5000 || !report.large.noLoss || report.large.select.register !== '5000 notes / 1 selected' || report.large.keyboard.selected !== 1) throw Error('Large ' + JSON.stringify(report.large));
    await check('32–35', `5,000-note motif opened in ${report.large.open} ms; selection ${report.large.select.register}; scroll ${JSON.stringify(report.large.scroll)}; zoom ${JSON.stringify(report.large.zoom)}; keyboard ${JSON.stringify(report.large.keyboard)}; delete/undo ${JSON.stringify(report.large.edit)}; notes identical to the saved record and clean: ${report.large.noLoss}`);

    // 36–38 narrow window, dark and light themes (CANVAS with the review interface)
    await activate('canvas'); await run(`await cv.setState({selectedId:${q(F.composition)}});`);
    report.responsive = {};
    for (const [label, width] of [['standard', 1366], ['900', 980], ['600', 680]]) {
      await c.command('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false }); await pause(350);
      report.responsive[label] = await run(`return{content:root.clientWidth,overflow:root.scrollWidth-root.clientWidth,timeline:Math.round(root.querySelector('.mnemobard-arrangement-surface').getBoundingClientRect().width)};`);
      if (label === '600') { await run('root.scrollTop=0;'); await shot('12-canvas-narrow-layout'); }
    }
    await c.command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }); await pause(300);
    if (Object.values(report.responsive).some(r => r.overflow > 1)) throw Error('Overflow ' + JSON.stringify(report.responsive));
    // Themes: CANVAS plus the review dialog (opened on the motif via the clip inspector entry point, then closed unchanged).
    await run(`cv.select(cv.session.draft.data.lanes[0].id,${q(clipA)});insp.querySelector('.mnemobard-canvas-source-review').open=true;`);
    await run('root.scrollTop=0;'); await shot('13-dark-theme');
    await theme('moonstone'); await run('root.scrollTop=0;'); await shot('14-light-theme'); await theme('obsidian');
    await check('36–38', `No horizontal overflow at standard/900/600 px ${JSON.stringify(report.responsive)}; dark and light theme captures`);

    report.trace = undefined;
    await c.evaluate('app.workspace.requestSaveLayout?.run?.()');
  } else {
    // 30–31 after a cold restart: the recovery copy is listed and intact; the saved note (external edit) is intact and compiles
    const F = report.fixture, q = JSON.stringify;
    await activate('canvas'); await run(`await leaf('canvas').view.setState({selectedId:${q(F.composition)}});`); await wait(`leaf('canvas').view.session?.draft.id===${q(F.composition)}`);
    report.restart = await run(`const r=await services.repository.read(${q(F.composition)});const list=await (async r=>{const all=[];for(let o=0;;){const p=await r.discover(o);all.push(...p.entries);o+=p.entries.length;if(!p.entries.length||o>=p.total)break;}return all;})(services.canvas.recovery);return{saved:r.source.includes('Changed in another app (4G)'),dirty:cv.session.dirty,changed:changed(),clips:cv.session.draft.data.lanes.flatMap(l=>l.clips).length,recoveryListed:JSON.stringify(list).includes(${q(report.pendingRecovery ?? '')})};`);
    report.recoveryFileIntact = (await readFile(`${vaultRoot}/${report.pendingRecovery}`, 'utf8')).includes('Unsaved 4G cue');
    if (!report.restart.saved || report.restart.clips !== 3 || report.restart.changed || !report.recoveryFileIntact || !report.restart.recoveryListed) throw Error('Restart ' + JSON.stringify(report.restart));
    await run(`click('Compile arrangement',root);`); await wait(`prep.state==='ready'`, 600);
    await check('30–31', `After a cold restart: recovery copy listed and intact (unsaved cue present); saved note intact with the external edit, acknowledgement still current (${report.restart.changed} pending), compiles`);
    report.reaperConfigAfter = reaperStat();
    await check('40', `No personal vault touched (every CDP evaluation verified the disposable dev-vault; all writes under dev-vault/MNEMOBARD); user REAPER configuration metadata digest unchanged: ${report.reaperConfigBefore === report.reaperConfigAfter}`);
    if (report.reaperConfigBefore !== report.reaperConfigAfter) throw Error('REAPER configuration metadata changed');
  }
  report.rendererExceptions = c.exceptions; if (c.exceptions.length) throw Error(c.exceptions.join('\n'));
  await check('39', `Renderer exceptions during this phase: ${c.exceptions.length}`);
  await writeFile(`${directory}/native-${restart ? 'restart' : 'part1'}.json`, JSON.stringify(report, null, 2) + '\n');
} catch (error) {
  await writeFile(`${directory}/failure${restart ? '-restart' : ''}.json`, JSON.stringify({ error: String(error), report, exceptions: c.exceptions }, null, 2) + '\n');
  console.error('FAILED:', String(error)); process.exitCode = 1;
} finally { c.close(); }
