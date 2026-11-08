/**
 * Real-host Milestone 4H workflow (§10) + screenshots (§11). Disposable vault only (the CDP client refuses any other vault).
 * Reuses the 4F "Night procession" fixture (restored byte-for-byte from output/mnemobard/milestone-4f/fixture.json at the
 * start) and creates two disposable large motifs once (5,000 and 10,000 notes, recorded in milestone-4h/fixture.json).
 * Pointer gestures on the piano roll are synthesised at the PianoRoll method level (move()/up()), as in the 4G benchmark.
 * Usage: node scripts/mnemobard-4h-native.mjs [--baseline-build <dir with 4G main.js/styles.css>]   (steps 1–36, 39–40)
 *        node scripts/mnemobard-4h-native.mjs --verify-restart                                    (steps 37–38, 40)
 */
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { connect } from './obsidian-cdp.mjs';

const directory = 'output/mnemobard/milestone-4h', vaultRoot = 'dev-vault', pluginDir = `${vaultRoot}/.obsidian/plugins/mnemobard`;
await mkdir(directory, { recursive: true });
const args = process.argv.slice(2), restart = args.includes('--verify-restart'), baselineBuild = args[args.indexOf('--baseline-build') + 1];
const c = await connect(), stamp = String(Date.now()), pause = ms => new Promise(r => setTimeout(r, ms)), q = JSON.stringify;
let report = { stamp, checks: [], screenshots: [], observations: {} };
if (restart) report = { ...JSON.parse(await readFile(`${directory}/native-part1.json`, 'utf8')), stamp, checks: [], screenshots: [] };
const prefix = `const plugin=app.plugins.getPlugin('mnemobard'),services=plugin.services,leaf=t=>app.workspace.getLeavesOfType('mnemobard-'+t)[0],cv=leaf('canvas')?.view,mv=leaf('motif')?.view,pb=leaf('patchbook')?.view,root=cv?.contentEl,prep=cv?.performancePanel?.preparation,modal=cv?.reviewModal?.contentEl,dlg=cv?.performancePanel?.dialog?.contentEl;const assert=(v,m)=>{if(!v)throw Error(m);};const click=(text,scope=document)=>{const all=[...scope.querySelectorAll('button')].filter(b=>!b.disabled),b=all.find(b=>b.textContent===text)??all.find(b=>b.textContent.startsWith(text));assert(b,'Missing button '+text);b.click();};const input=(label,value,scope=document)=>{const e=[...scope.querySelectorAll('input,textarea,select')].find(e=>e.getAttribute('aria-label')===label);assert(e,'Missing input '+label);e.value=value;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));};const status=()=>root.querySelector('.mnemobard-arrangement-state')?.textContent;const changed=()=>(cv.plan?.diagnostics??[]).filter(d=>d.code==='changed'||d.code==='unreviewed').length;
const gesture=(resize,delta)=>{const r=mv.roll,ids=new Set(mv.session.selected);assert(ids.size,'select first');r.gesture={pointerId:7,x:200,y:200,resize,moved:false,deltaTick:0,deltaPitch:0,ids,notes:r.model.data.notes.filter(x=>ids.has(x.id))};const rect=r.canvas.getBoundingClientRect(),px=delta/960*r.pixels;for(const f of[0.33,0.66,1])r.move({pointerId:7,clientX:rect.left+200+px*f,clientY:rect.top+200});const v=mv.session.changeVersion,t=performance.now();r.up({pointerId:7});r.draw();const ms=performance.now()-t;assert(mv.session.changeVersion!==v,'gesture did not commit');return ms;};
const rows=sel=>Object.fromEntries([...document.querySelectorAll(sel+' dt')].map(dt=>[dt.textContent,dt.nextElementSibling?.textContent]));`;
async function run(body) { try { return await c.evaluate(`(globalThis.__n4h=(async()=>{${prefix}${body}})())`); } finally { await c.evaluate('delete globalThis.__n4h'); } }
async function wait(test, tries = 450) { for (let i = 0; i < tries; i++) { if (await run(`return (${test});`)) return; await pause(30); } throw Error('Timed out: ' + test); }
async function check(step, text) { report.checks.push({ step, text }); console.log('✓', step, text.slice(0, 400)); await writeFile(`${directory}/partial${restart ? '-restart' : ''}.json`, JSON.stringify(report, null, 2) + '\n'); }
async function shot(name, scroll) { if (scroll) await run(`const e=${scroll};e?.scrollIntoView({block:'center'});`); await pause(300); const s = await c.command('Page.captureScreenshot', { format: 'png' }); await writeFile(`${directory}/${name}.png`, Buffer.from(s.data, 'base64')); if (!report.screenshots.includes(name + '.png')) report.screenshots.push(name + '.png'); }
const size = async (width, height = 900) => { await c.command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }); await pause(350); };
const theme = async name => { await run(`app.changeTheme?.(${q(name)});`); await pause(350); };
const activate = async t => { await run(`await services.modules.open('${t}');app.workspace.setActiveLeaf(leaf('${t}'),{focus:true});`); await pause(150); };
const KEYS = { Tab: 9 }; async function key(name) { for (const type of ['keyDown', 'keyUp']) await c.command('Input.dispatchKeyEvent', { type, key: name, code: name, windowsVirtualKeyCode: KEYS[name] ?? 0 }); await pause(80); }
async function exportMidi(path) { await run(`root.querySelector('.mnemobard-arrangement-seek').open=true;click('Export arrangement MIDI',root);`); await wait('!!cv.performancePanel.dialog?.contentEl.querySelector("input")'); await run(`const d=cv.performancePanel.dialog;assert(d.containerEl.isConnected&&d.containerEl.ownerDocument===document,'dialog not visible');input('New arrangement MIDI destination',${q(path)},d.contentEl);click('Create arrangement MIDI',d.contentEl);`); await wait("cv.performancePanel.dialog.contentEl.textContent.includes('Export created:')", 600); await run(`click('Cancel export',cv.performancePanel.dialog.contentEl);`); await wait('!cv.performancePanel.dialog?.containerEl.isConnected'); }
const verifyMidi = path => { const r = spawnSync('python3', ['scripts/verify-midi.py', `${vaultRoot}/${path}`], { encoding: 'utf8' }); let parsed; try { parsed = JSON.parse(r.stdout); } catch { parsed = undefined; } return { status: r.status, parsed, stderr: r.stderr.slice(0, 300) }; };
const sha = buffer => createHash('sha256').update(buffer).digest('hex');
async function external(path, fn, label) { if (!path.startsWith('MNEMOBARD/')) throw Error('Refusing external edit outside MNEMOBARD/'); const before = await readFile(`${vaultRoot}/${path}`, 'utf8'), after = fn(before); if (after === before) throw Error('External edit changed nothing: ' + label); await writeFile(`${vaultRoot}/${path}`, after); return before; }
const pathOf = id => run(`const s=services.index.locate(${q(id)});return s.status==='ready'?s.path:null;`);
const reload = async () => { await run(`await app.plugins.disablePlugin('mnemobard');await app.plugins.enablePlugin('mnemobard');await app.plugins.getPlugin('mnemobard').services.index.settled();`); await pause(500); };
/** Horizontal overflow of an element (0 = none); the piano roll and timeline scroll inside their own scrollers by design. */
const overflow = sel => `(()=>{const e=${sel};return e?Math.max(0,e.scrollWidth-e.clientWidth):-1;})()`;

try {
  await c.command('Page.bringToFront'); await size(1366);
  report.observations[restart ? 'activeDocumentAtRestart' : 'activeDocumentAtStart'] = await c.evaluate('activeDocument===document?"main":"other"');
  if (!restart) {
    report.originalTheme = await run(`return app.vault.getConfig?.('theme')??'obsidian';`); await theme('obsidian');
    // ── Fixtures ──
    const F = JSON.parse(await readFile('output/mnemobard/milestone-4f/fixture.json', 'utf8'));
    let extra; try { extra = JSON.parse(await readFile(`${directory}/fixture.json`, 'utf8')); } catch { extra = undefined; }
    if (!extra || !(await run(`return services.index.locate(${q(extra.large5000)}).status==='ready'&&services.index.locate(${q(extra.large10000)}).status==='ready';`))) {
      extra = await run(`const u=()=>crypto.randomUUID(),make=async(count,title)=>{const notes=[];for(let i=0;i<count;i++)notes.push({id:u(),pitch:48+(i*5)%36,startTick:i*240,durationTicks:200+(i%3)*40,velocity:40+(i%80)});const m=await services.repository.create({id:u(),kind:'motif',schemaVersion:1,title,tags:['disposable-4h'],extra:{},data:{schemaVersion:1,ppq:960,tempoMicrosecondsPerQuarter:500000,meter:{numerator:4,denominator:4},lengthTicks:count*240+3840,notes}});return m.entity.id;};
        const a=await make(5000,'Large phrase 4H (5000 notes)'),b=await make(10000,'Large phrase 4H (10000 notes)');await services.index.settled();return{large5000:a,large10000:b};`);
      await writeFile(`${directory}/fixture.json`, JSON.stringify(extra, null, 2) + '\n');
    }
    report.fixture = { ...F, sources: undefined, ...extra };
    await run(`for(const d of services.canvas.drafts())if(d.draft.id===${q(F.composition)})services.canvas.discard(d);const cur=leaf('canvas')?.view?.session;if(cur?.draft.id===${q(F.composition)})services.canvas.discard(cur);for(const d of services.motifs.drafts())if([${q(F.motifA)},${q(F.motifB)},${q(extra.large5000)},${q(extra.large10000)}].includes(d.draft.id))services.motifs.discard(d);for(const d of services.patchbook.getDrafts())if(d.draft.id===${q(F.patch)})services.patchbook.discard(d);`);
    for (const [k, original] of Object.entries(F.sources ?? {})) { const where = await pathOf(F[k]); if (where?.startsWith('MNEMOBARD/') && (await readFile(`${vaultRoot}/${where}`, 'utf8')) !== original.source) { await writeFile(`${vaultRoot}/${where}`, original.source); (report.restored ??= []).push(k); } }
    if (report.restored) { await pause(900); await run(`await services.index.settled();`); }

    // 1–3 PATCHBOOK → associated MOTIF → the small motif opens
    report.host = await run(`return{ua:navigator.userAgent.match(/obsidian\\/[\\d.]+/)?.[0],vault:app.vault.adapter.getBasePath().split('/').slice(-2).join('/')};`);
    await activate('patchbook'); await run(`await pb.setState({selectedId:${q(F.patch)}});`); await wait(`pb.currentSession?.draft.id===${q(F.patch)}&&pb.contentEl.textContent.includes('Motifs using this patch')`);
    await run(`click('Open in MOTIF',pb.contentEl.querySelector('[aria-label="Motifs using this patch"]'));`); await wait(`leaf('motif')?.view?.session?.draft.id===${q(F.motifA)}`);
    report.small = await run(`return{title:mv.session.draft.title,notes:mv.session.draft.data.notes.length,groups:[...mv.contentEl.querySelectorAll('.mnemobard-tool-group')].map(g=>g.getAttribute('aria-label')+': '+[...g.querySelectorAll('button,select')].map(b=>b.getAttribute('aria-label')??b.textContent).join(', '))};`);
    await run(`const d=mv.contentEl.querySelector('details');if(d)d.open=false;mv.contentEl.querySelector('.mnemobard-score-heading').scrollIntoView();`); await shot('01-motif-editor-dark');
    await run(`mv.contentEl.querySelector('.mnemobard-transforms').open=true;`); await shot('02-motif-toolbar-refined', `mv.contentEl.querySelector('.mnemobard-motif-toolbar')`); await run(`mv.contentEl.querySelector('.mnemobard-transforms').open=false;`);
    await check('1–3', `${report.host.ua} on ${report.host.vault}; PATCHBOOK “Night choir” → Open in MOTIF → “${report.small.title}” (${report.small.notes} notes); toolbar groups ${q(report.small.groups)}`);

    // 4–8 edit a note (velocity), undo, redo, save, reopen
    const target = await run(`const n=mv.session.draft.data.notes.find(n=>n.pitch===64);mv.session.select([n.id]);mv.selectionChanged?.();return{id:n.id,velocity:n.velocity};`);
    const edited = target.velocity === 101 ? 102 : 101;
    await run(`input('Set selected velocity','${edited}',mv.contentEl);click('Set velocity',mv.contentEl);`); await wait(`mv.session.draft.data.notes.find(n=>n.id===${q(target.id)}).velocity===${edited}&&mv.session.dirty`);
    await shot('04-motif-note-selection', `mv.contentEl.querySelector('.mnemobard-roll-surface')`);
    await run(`click('Undo',mv.contentEl);`); const undone = await run(`return{v:mv.session.draft.data.notes.find(n=>n.id===${q(target.id)}).velocity,dirty:mv.session.dirty};`);
    await run(`click('Redo',mv.contentEl);`); const redone = await run(`return mv.session.draft.data.notes.find(n=>n.id===${q(target.id)}).velocity;`);
    await run(`click('Save motif',mv.contentEl);`); await wait('!mv.session.dirty&&mv.session.status==="Saved"');
    await run(`mv.leaf.detach();`); await activate('motif'); await run(`await leaf('motif').view.setState({selectedId:${q(F.motifA)}});`); await wait(`leaf('motif').view.session?.draft.id===${q(F.motifA)}`);
    const reopened = await run(`return{draft:mv.session.draft.data.notes.find(n=>n.id===${q(target.id)}).velocity,saved:(await services.repository.read(${q(F.motifA)})).entity.data.notes.find(n=>n.id===${q(target.id)}).velocity,dirty:mv.session.dirty};`);
    if (undone.v !== target.velocity || undone.dirty || redone !== edited || reopened.draft !== edited || reopened.saved !== edited || reopened.dirty) throw Error('Small edit ' + q({ target, undone, redone, reopened }));
    report.smallEdit = { note: target.id, before: target.velocity, after: edited };
    await check('4–8', `Velocity of E4 ${target.velocity} → ${edited} (Set velocity); Undo → ${undone.v} and clean; Redo → ${redone}; saved; reopened from a fresh leaf: draft and saved record ${reopened.saved}, clean`);

    // 9–14 5,000-note motif: open, select/navigate, move, resize, undo both, saved data intact
    const savedLarge = await run(`return JSON.stringify((await services.repository.read(${q(extra.large5000)})).entity.data.notes);`);
    report.large5000 = { open: await run(`const t=performance.now();await mv.setState({selectedId:${q(extra.large5000)}});assert(mv.session?.draft.id===${q(extra.large5000)},'open');return +(performance.now()-t).toFixed(1);`) };
    await pause(250); await run(`mv.contentEl.querySelector('.mnemobard-score-heading').scrollIntoView();`); await shot('03-motif-large-document');
    report.large5000.select = await run(`mv.contentEl.querySelectorAll('[data-note-id]')[3].click();const a=[...mv.session.selected][0];click('Next note',mv.contentEl);const b=[...mv.session.selected][0];return{first:a,next:b,moved:a!==b,register:mv.contentEl.querySelector('.mnemobard-note-inspector-heading span').textContent};`);
    report.large5000.move = await run(`return +gesture(false,240).toFixed(1);`); report.large5000.resize = await run(`return +gesture(true,240).toFixed(1);`);
    report.large5000.edited = await run(`return{history:mv.session.historySize,dirty:mv.session.dirty};`);
    await run(`click('Undo',mv.contentEl);click('Undo',mv.contentEl);`);
    report.large5000.intact = await run(`return JSON.stringify(mv.session.draft.data.notes)===${q(savedLarge)}&&!mv.session.dirty&&(await services.repository.read(${q(extra.large5000)})).entity.data.notes.length===5000;`);
    if (!report.large5000.select.moved || report.large5000.select.register !== '5000 notes / 1 selected' || !report.large5000.edited.dirty || !report.large5000.intact) throw Error('5000 ' + q(report.large5000));
    await check('9–14', `5,000 notes opened in ${report.large5000.open} ms; selected a note and moved to the next one (${report.large5000.select.register}); move committed in ${report.large5000.move} ms, resize in ${report.large5000.resize} ms; both undone: draft equals the saved notes and is clean`);

    // 15–19 10,000-note motif: open, edit latency, repeated edits, undo/redo, save and reopen
    report.large10000 = { open: await run(`const t=performance.now();await mv.setState({selectedId:${q(extra.large10000)}});assert(mv.session?.draft.id===${q(extra.large10000)},'open');return +(performance.now()-t).toFixed(1);`) };
    await run(`mv.contentEl.querySelectorAll('[data-note-id]')[5].click();`);
    // Alternating move/resize by ±240 ticks (one 1/16 grid step; ±120 would snap to 0 when shrinking).
    report.large10000.latency = await run(`const out=[];for(let i=0;i<8;i++){await new Promise(r=>setTimeout(r,0));out.push(gesture(i%2===1,i%4<2?240:-240));}const s=[...out].sort((a,b)=>a-b);return{samples:out.map(v=>+v.toFixed(1)),median:+s[Math.floor(s.length/2)].toFixed(1),max:+s.at(-1).toFixed(1)};`);
    report.large10000.repeated = await run(`const states=[];for(let i=0;i<6;i++){gesture(false,i%2?-240:480);states.push(JSON.stringify(mv.session.snapshot));}
      // The (unchanged) 16 MiB history estimate keeps only the latest ~3 entries of a 10,000-note motif: check 2 steps.
      const reachable=mv.session.historySize;let exact=reachable>=2;for(let i=5;i>3;i--){exact&&=JSON.stringify(mv.session.snapshot)===states[i];mv.session.undo();}exact&&=JSON.stringify(mv.session.snapshot)===states[3];
      for(let i=4;i<6;i++){mv.session.redo();exact&&=JSON.stringify(mv.session.snapshot)===states[i];}mv.selectionChanged();return{edits:6,reachableHistory:reachable,undoRedoExact:exact,dirty:mv.session.dirty};`);
    const draft10000 = await run(`return JSON.stringify(mv.session.draft.data.notes);`);
    await run(`click('Save motif',mv.contentEl);`); await wait('!mv.session.dirty&&mv.session.status==="Saved"', 900);
    await run(`for(const d of services.motifs.drafts())if(d.draft.id===${q(extra.large10000)})services.motifs.discard(d);mv.leaf.detach();`); await activate('motif');
    await run(`await leaf('motif').view.setState({selectedId:${q(extra.large10000)}});`); await wait(`leaf('motif').view.session?.draft.id===${q(extra.large10000)}`);
    report.large10000.reopened = await run(`const saved=(await services.repository.read(${q(extra.large10000)})).entity.data.notes;return{notes:saved.length,exact:JSON.stringify(saved)===${q(draft10000)}&&JSON.stringify(mv.session.draft.data.notes)===${q(draft10000)},clean:!mv.session.dirty};`);
    report.large10000.notesSha = sha(draft10000);
    if (report.large10000.latency.median >= 50 || !report.large10000.repeated.undoRedoExact || report.large10000.reopened.notes !== 10000 || !report.large10000.reopened.exact || !report.large10000.reopened.clean) throw Error('10000 ' + q(report.large10000));
    await check('15–19', `10,000 notes opened in ${report.large10000.open} ms; native move/resize commit median ${report.large10000.latency.median} ms (max ${report.large10000.latency.max}; ${q(report.large10000.latency.samples)}); 6 repeated edits, 2× undo + 2× redo exact (${q(report.large10000.repeated)}); saved and reopened: 10,000 notes identical to the draft, clean`);

    // 20–23 CANVAS: open the saved composition, review changed sources, inspect the revised dialog
    await activate('canvas'); await run(`await leaf('canvas').view.setState({selectedId:${q(F.composition)}});`); await wait(`leaf('canvas').view.session?.draft.id===${q(F.composition)}`);
    await wait(`changed()>=2&&!root.querySelector('.mnemobard-review-banner').hidden`);
    report.warning = await run(`return{banner:root.querySelector('.mnemobard-review-banner').textContent,status:status()};`);
    await run(`click('Review changed sources',root.querySelector('.mnemobard-review-banner'));`); await wait(`!!cv.reviewModal?.contentEl.querySelector('.mnemobard-review-detail')`);
    const reviewLayout = `const m=modal.closest('.modal'),a=modal.querySelector('.mnemobard-review-actions'),mr=m.getBoundingClientRect(),ar=a.getBoundingClientRect(),go=[...a.querySelectorAll('button')].find(b=>b.textContent.startsWith('Acknowledge'));return{scrollable:m.scrollHeight>m.clientHeight,footerVisible:ar.top>=mr.top-1&&ar.bottom<=mr.bottom+1&&ar.bottom<=innerHeight+1,footerSticky:getComputedStyle(a).position,acknowledge:!!go&&go.getBoundingClientRect().bottom<=Math.min(mr.bottom,innerHeight)+1,overflowX:Math.max(0,m.scrollWidth-m.clientWidth),modalWidth:Math.round(mr.width),viewport:innerWidth};`;
    report.review = await run(`modal.closest('.modal').scrollTop=0;return{summary:rows('.mnemobard-review-summary'),sections:[...modal.querySelectorAll('.mnemobard-review-detail > details')].map(d=>d.querySelector('summary').textContent+(d.open?' (open)':' (collapsed)')),compare:[...modal.querySelectorAll('.mnemobard-review-compare tbody tr')].map(r=>[...r.children].map(x=>x.textContent).join(' | ')),placements:[...modal.querySelectorAll('.mnemobard-review-clips tbody tr')].map(r=>[...r.children].map(x=>x.textContent).join(' | ')),history:modal.textContent.includes('note-by-note comparison is not possible')};`);
    report.review.layout1366 = await run(`modal.closest('.modal').scrollTop=0;${reviewLayout}`);
    await shot('05-canvas-source-review-summary');
    await run(`modal.querySelector('.mnemobard-review-changes').open=true;`); await shot('06-canvas-source-review-details', `modal.querySelector('.mnemobard-review-compare')`);
    report.review.layoutScrolled = await run(reviewLayout);
    await shot('07-canvas-source-review-placements', `modal.querySelector('.mnemobard-review-clips')`);
    await run(`modal.querySelector('.mnemobard-review-changes').open=false;modal.closest('.modal').scrollTop=0;modal.querySelector('.mnemobard-review-summary button').focus();`); await key('Tab');
    report.review.keyboard = await run(`const a=document.activeElement;return{label:a.getAttribute('aria-label')??a.textContent,inReview:!!a.closest('.mnemobard-source-review'),focusVisible:a.matches(':focus-visible'),outline:getComputedStyle(a).outlineStyle};`);
    // Narrow layouts and the light theme while the review is open (§7.6).
    report.review.narrow = {};
    for (const width of [980, 680]) { await size(width); report.review.narrow[width] = await run(`modal.closest('.modal').scrollTop=0;${reviewLayout}`); if (width === 680) await shot('14-narrow-680'); }
    await size(1366); await theme('moonstone'); await run(`modal.closest('.modal').scrollTop=0;`); await shot('15b-light-source-review'); report.review.light = await run(reviewLayout); await theme('obsidian');
    const layouts = [report.review.layout1366, report.review.layoutScrolled, ...Object.values(report.review.narrow), report.review.light];
    if (report.review.placements.length !== 2 || !report.review.history || report.review.summary.Status !== 'Ready to acknowledge' || layouts.some(l => !l.footerVisible || !l.acknowledge || l.overflowX > 1 || l.footerSticky !== 'sticky') || !report.review.keyboard.inReview || !report.review.keyboard.focusVisible || report.review.keyboard.outline === 'none') throw Error('Review ' + q(report.review));
    await check('20–23', `CANVAS “${report.warning.status}”; review summary ${q(report.review.summary)}; sections ${q(report.review.sections)}; placements ${q(report.review.placements)}; Acknowledge visible without scrolling at 1366/980/680 px and after scrolling (sticky footer, no horizontal overflow); keyboard ${q(report.review.keyboard)}`);

    // 24–26 acknowledge (one transaction), undo, redo
    const history = await run('return cv.session.historySize;');
    await run(`click('Acknowledge this source for all',modal);`); await wait(`!!modal.querySelector('[aria-label="Confirm acknowledgement"]')`);
    report.confirmLayout = await run(`const r=modal.querySelector('[aria-label="Confirm acknowledgement"]').getBoundingClientRect();return{visible:r.bottom<=innerHeight+1&&r.top>=0,focused:document.activeElement?.textContent};`);
    await shot('08-canvas-source-review-confirmation');
    await run(`click('Confirm acknowledgement',modal);`); await wait(`modal.textContent.includes('No changed sources')`, 600);
    report.ack = await run(`return{notice:modal.querySelector('.mnemobard-review-notice').textContent,history:cv.session.historySize,changed:changed(),banner:root.querySelector('.mnemobard-review-banner').hidden};`);
    await run(`click('Close review',modal);`); await wait('!cv.reviewModal?.containerEl?.isConnected');
    await run(`click('Undo',root);`); await pause(250); const ackUndo = await run(`return{changed:changed(),banner:!root.querySelector('.mnemobard-review-banner').hidden,history:cv.session.historySize};`);
    await run(`click('Redo',root);`); await pause(250); const ackRedo = await run(`return{changed:changed(),history:cv.session.historySize};`);
    if (!report.confirmLayout.visible || report.ack.history !== history + 1 || report.ack.changed !== 0 || !report.ack.banner || ackUndo.changed < 2 || !ackUndo.banner || ackRedo.changed !== 0) throw Error('Ack ' + q({ c: report.confirmLayout, a: report.ack, ackUndo, ackRedo }));
    await check('24–26', `Confirmed in place (${q(report.confirmLayout)}): “${report.ack.notice}”, one history entry; Undo restored ${ackUndo.changed} pending placements and the banner; Redo acknowledged them again`);

    // 27–33 compile, export workflow (summary + REAPER guidance), export twice, independent verification, golden fixture
    await run(`click('Compile arrangement',root);`); await wait(`prep.state==='ready'`, 600);
    report.compiled = await run('return status();'); await shot('11-canvas-export-ready', `root.querySelector('.mnemobard-canvas-transport')`);
    await run(`root.querySelector('.mnemobard-arrangement-seek').open=true;click('Export arrangement MIDI',root);`); await wait('!!cv.performancePanel.dialog?.contentEl.querySelector("input")');
    report.exportDialog = await run(`const g=dlg.querySelector('details.mnemobard-daw-guidance');return{summary:rows('.mnemobard-export-summary'),guidanceCollapsed:!g.open,ending:dlg.querySelector('.mnemobard-export-summary > p')?.textContent,advancedCollapsed:!dlg.querySelector('.mnemobard-export-advanced').open,overflowX:${overflow("dlg.closest('.modal')")}};`);
    await shot('09-midi-export-summary');
    await run(`dlg.querySelector('details.mnemobard-daw-guidance').open=true;`); report.exportDialog.guidance = await run(`return[...dlg.querySelectorAll('details.mnemobard-daw-guidance li')].map(l=>l.textContent);`);
    await shot('10-reaper-import-guidance', `dlg.querySelector('details.mnemobard-daw-guidance')`);
    report.exportDialog.narrow = {};
    for (const width of [980, 680]) { await size(width); report.exportDialog.narrow[width] = await run(`const m=dlg.closest('.modal'),b=[...dlg.querySelectorAll('button')].find(b=>b.textContent==='Create arrangement MIDI');b.scrollIntoView({block:'nearest'});return{overflowX:Math.max(0,m.scrollWidth-m.clientWidth),createReachable:b.getBoundingClientRect().width>0&&b.getBoundingClientRect().right<=innerWidth};`); }
    await size(1366); await theme('moonstone'); await run(`dlg.closest('.modal').scrollTop=0;`); await shot('15c-light-export-summary'); await theme('obsidian');
    await run(`click('Cancel export',dlg);`); await wait('!cv.performancePanel.dialog?.containerEl.isConnected');
    report.export1 = `MNEMOBARD/Exports/night-procession-4h-${stamp}-a.mid`; report.export2 = `MNEMOBARD/Exports/night-procession-4h-${stamp}-b.mid`;
    await exportMidi(report.export1); await exportMidi(report.export2);
    const bytes1 = await readFile(`${vaultRoot}/${report.export1}`); report.deterministic = bytes1.equals(await readFile(`${vaultRoot}/${report.export2}`));
    const v = verifyMidi(report.export1), tracks = v.parsed?.tracks ?? [], ons = tracks.flatMap(t => t.events.filter(e => e[1] === 'on'));
    report.midi = { sha256: sha(bytes1), status: v.status, format: v.parsed?.format, ppq: v.parsed?.ppq, trackCount: tracks.length, endTicks: [...new Set(tracks.map(t => t.endTick))], noteOns: ons.length, channels: [...new Set(ons.map(e => e[2] + 1))], lastNoteOff: Math.max(...tracks.flatMap(t => t.events.filter(e => e[1] === 'off').map(e => e[0]))) };
    report.midi.summaryMatches = report.exportDialog.summary['MIDI tracks']?.startsWith(`${report.midi.trackCount}:`) && report.exportDialog.summary.Notes === String(report.midi.noteOns) && report.exportDialog.summary.File === `Standard MIDI File · Type ${report.midi.format} · ${report.midi.ppq} PPQ`;
    report.golden = sha(await readFile('tests/fixtures/arrangement-single.mid'));
    const guide = report.exportDialog.guidance.join(' ');
    if (v.status !== 0 || !report.deterministic || !report.midi.summaryMatches || report.midi.endTicks.join() !== '122880' || report.golden !== '85c8ecf39936d1de7612f65d17d3df2f4599472cda8027096bced1c93bb3ab77' || !report.exportDialog.guidanceCollapsed || !guide.includes('Expand 2 MIDI tracks to new REAPER tracks') || !guide.includes('Import MIDI tempo map to project tempo map') || !report.exportDialog.ending || report.exportDialog.overflowX > 1 || Object.values(report.exportDialog.narrow).some(n => n.overflowX > 1 || !n.createReachable)) throw Error('Export ' + q({ e: report.exportDialog, m: report.midi, g: report.golden }));
    await check('27–33', `Compiled (“${report.compiled}”); export summary ${q(report.exportDialog.summary)} matches the independent parse (${q(report.midi)}); REAPER guidance collapsed by default, steps ${q(report.exportDialog.guidance)}; ending explained; two exports byte-identical; golden fixture ${report.golden.slice(0, 12)}… unchanged`);

    // 33b Byte-for-byte against the 4G baseline build in this same Obsidian process (same saved composition, same sources).
    await run(`click('Save composition',root);`); await wait('!cv.session.dirty');
    if (baselineBuild) {
      for (const f of ['main.js', 'styles.css']) await copyFile(`${baselineBuild}/${f}`, `${pluginDir}/${f}`); await reload();
      report.baselineBuild = sha(await readFile(`${pluginDir}/main.js`));
      await activate('canvas'); await run(`await leaf('canvas').view.setState({selectedId:${q(F.composition)}});`); await wait(`leaf('canvas').view.session?.draft.id===${q(F.composition)}`);
      await run(`click('Compile arrangement',root);`); await wait(`prep.state==='ready'`, 600);
      report.exportBaseline = `MNEMOBARD/Exports/night-procession-4g-build-${stamp}.mid`; await exportMidi(report.exportBaseline);
      report.baselineSha = sha(await readFile(`${vaultRoot}/${report.exportBaseline}`));
      for (const f of ['main.js', 'styles.css']) await copyFile(f, `${pluginDir}/${f}`); await reload();
      report.candidateBuild = sha(await readFile(`${pluginDir}/main.js`));
      await activate('canvas'); await run(`await leaf('canvas').view.setState({selectedId:${q(F.composition)}});`); await wait(`leaf('canvas').view.session?.draft.id===${q(F.composition)}`);
      if (report.baselineSha !== report.midi.sha256) throw Error(`Baseline export differs: ${report.baselineSha} vs ${report.midi.sha256}`);
      await check('33b', `Same saved composition exported by the 4G build (${report.baselineBuild.slice(0, 12)}…) and the 4H build (${report.candidateBuild.slice(0, 12)}…) in one Obsidian process: both ${report.midi.sha256.slice(0, 16)}… (byte-identical)`);
    }

    // 34–36 external-change conflict, save blocked, recovery copy
    await run(`const s=cv.session;s.edit('Add marker',c=>({...c,data:{...c.data,markers:[...c.data.markers,{id:crypto.randomUUID(),label:'Unsaved 4H cue',tick:1920}]}}));`);
    const compPath = await pathOf(F.composition); await external(compPath, t => t.replace(/^mnemobard_description: .*$/m, 'mnemobard_description: Changed in another app (4H)'), 'composition description');
    await wait(`cv.session.freshness.state==='conflict'`);
    await run(`click('Save composition',root);`); await pause(400);
    report.saveBlocked = { status: await run('return root.querySelector(".mnemobard-save-status").textContent;'), compile: await run(`click('Compile arrangement',root);await new Promise(r=>setTimeout(r,300));return status();`), diskKept: (await readFile(`${vaultRoot}/${compPath}`, 'utf8')).includes('Changed in another app (4H)') };
    await shot('12-canvas-conflict-protection', `root.querySelector('.mnemobard-freshness-banner')`);
    // §6.5: the blocked compile/export explains the problem, why and what resolves it.
    report.conflictHelp = await run(`const d=root.querySelector('.mnemobard-arrangement-compilation');d.open=true;const p=[...d.querySelectorAll('[data-compile-diagnostic]')].find(x=>x.textContent.includes('changed externally'));return p?{message:p.firstChild.textContent,help:p.querySelector('.mnemobard-diagnostic-help')?.textContent}:null;`);
    await shot('12b-conflict-export-diagnostic', `root.querySelector('.mnemobard-arrangement-compilation')`);
    if (!report.conflictHelp?.help?.includes('compile again')) throw Error('Conflict help ' + q(report.conflictHelp));
    await run(`click('Store recovery copy and open recovery',root.querySelector('.mnemobard-freshness-banner'));`); await wait(`root.textContent.includes('Close composition recovery')`);
    report.recovery = { path: await run('return cv.session.recoveryPath;') }; const disk = await readFile(`${vaultRoot}/${compPath}`, 'utf8');
    report.recovery.contains = (await readFile(`${vaultRoot}/${report.recovery.path}`, 'utf8')).includes('Unsaved 4H cue'); report.recovery.diskUntouched = disk.includes('Changed in another app (4H)') && !disk.includes('Unsaved 4H cue');
    await run(`click('Close composition recovery',root);`); await run('await cv.session.checkpoint();');
    if (!report.saveBlocked.diskKept || !report.recovery.contains || !report.recovery.diskUntouched) throw Error('Conflict ' + q({ s: report.saveBlocked, r: report.recovery }));
    await check('34–36', `External description edit while a marker was unsaved → protected conflict; Save refused (“${report.saveBlocked.status}”), compile status “${report.saveBlocked.compile}” with the explanation “${report.conflictHelp.help}”; disk note kept; recovery copy ${report.recovery.path} holds the unsaved cue`);

    // Narrow MOTIF layouts (980/680) and light-theme MOTIF (part of 39)
    await activate('motif'); await run(`await mv.setState({selectedId:${q(F.motifA)}});`); await wait(`mv.session?.draft.id===${q(F.motifA)}`);
    report.motifLayouts = {};
    for (const width of [1366, 980, 680]) {
      await size(width);
      report.motifLayouts[width] = await run(`const tb=mv.contentEl.querySelector('.mnemobard-motif-toolbar'),buttons=[...tb.querySelectorAll('button,select,summary')],cr=mv.contentEl.getBoundingClientRect(),roll=mv.contentEl.querySelector('.mnemobard-roll-surface').getBoundingClientRect();return{overflowX:${overflow('mv.contentEl')},controls:buttons.length,unreachable:buttons.filter(b=>{const r=b.getBoundingClientRect();return r.width===0||r.left<cr.left-1||r.right>cr.right+1;}).map(b=>b.textContent),roll:{width:Math.round(roll.width),height:Math.round(roll.height)},status:mv.contentEl.querySelector('.mnemobard-save-status')?.getBoundingClientRect().width>0};`);
      if (width === 980) { await run(`mv.contentEl.querySelector('.mnemobard-score-heading').scrollIntoView();`); await shot('13-narrow-980'); }
    }
    await size(1366); await theme('moonstone'); await run(`mv.contentEl.querySelector('.mnemobard-score-heading').scrollIntoView();`); await shot('15-light-theme');
    report.light = await run(`return{body:document.body.classList.contains('theme-light'),toolbarText:getComputedStyle(mv.contentEl.querySelector('.mnemobard-motif-toolbar summary')).color,background:getComputedStyle(mv.contentEl).backgroundColor};`);
    await theme(report.originalTheme === 'moonstone' ? 'moonstone' : 'obsidian');
    if (Object.values(report.motifLayouts).some(l => l.overflowX > 1 || l.unreachable.length || l.roll.width < 300 || !l.status) || !report.light.body) throw Error('Layouts ' + q({ m: report.motifLayouts, l: report.light }));
    await check('39', `Light theme (Moonstone) captured for MOTIF, the source review and the export dialog with the same layout checks; MOTIF at 1366/980/680 px: no horizontal overflow, every toolbar control reachable, roll ${q(Object.fromEntries(Object.entries(report.motifLayouts).map(([w, l]) => [w, l.roll])))}`);
    await c.evaluate('app.workspace.requestSaveLayout?.run?.()');
  } else {
    // 37–38 after a cold restart: recovery listed and intact; saved records intact (motif edits, 10,000-note save, composition)
    const F = report.fixture;
    await activate('canvas'); await run(`await leaf('canvas').view.setState({selectedId:${q(F.composition)}});`); await wait(`leaf('canvas').view.session?.draft.id===${q(F.composition)}`);
    report.restart = await run(`const r=await services.repository.read(${q(F.composition)});const list=[];for(let o=0;;){const p=await services.canvas.recovery.discover(o);list.push(...p.entries);o+=p.entries.length;if(!p.entries.length||o>=p.total)break;}
      const small=(await services.repository.read(${q(F.motifA)})).entity.data.notes.find(n=>n.id===${q(report.smallEdit.note)}).velocity,large=(await services.repository.read(${q(F.large10000)})).entity.data.notes;
      return{saved:r.source.includes('Changed in another app (4H)'),dirty:cv.session.dirty,changed:changed(),recoveryListed:JSON.stringify(list).includes(${q(report.pendingRecovery ?? report.recovery.path)}),smallVelocity:small,largeNotes:large.length,largeJson:JSON.stringify(large)};`);
    report.restart.largeSha = sha(report.restart.largeJson); delete report.restart.largeJson;
    report.recoveryFileIntact = (await readFile(`${vaultRoot}/${report.recovery.path}`, 'utf8')).includes('Unsaved 4H cue');
    await run(`click('Composition recovery',root);`); await wait(`root.textContent.includes('Close composition recovery')&&!root.textContent.includes('Discovering checkpoints')`, 900); await pause(300);
    report.restartRecoveryUi = await run(`return [...root.querySelectorAll('p')].map(p=>p.textContent).find(t=>/checkpoints · showing/.test(t))??null;`);
    await shot('16-recovery-after-restart'); await run(`click('Close composition recovery',root);`);
    await run(`click('Compile arrangement',root);`); await wait(`prep.state==='ready'`, 600);
    if (!report.restart.saved || report.restart.changed || !report.recoveryFileIntact || !report.restart.recoveryListed || report.restart.smallVelocity !== report.smallEdit.after || report.restart.largeNotes !== 10000 || report.restart.largeSha !== report.large10000.notesSha) throw Error('Restart ' + q(report.restart));
    await check('37–38', `After a cold Obsidian restart: recovery copy listed and intact (unsaved cue present); composition note intact with the external edit and every source still acknowledged; MOTIF edit (velocity ${report.restart.smallVelocity}) and the 10,000-note save intact (notes SHA-256 ${report.restart.largeSha.slice(0, 12)}… as saved); compiles`);
  }
  report.rendererExceptions = c.exceptions; if (c.exceptions.length) throw Error(c.exceptions.join('\n'));
  await check('40', `Renderer exceptions during this phase: ${c.exceptions.length}`);
  if (!restart) report.pendingRecovery = report.recovery.path;
  await writeFile(`${directory}/native-${restart ? 'restart' : 'part1'}.json`, JSON.stringify(report, null, 2) + '\n');
} catch (error) {
  await writeFile(`${directory}/failure${restart ? '-restart' : ''}.json`, JSON.stringify({ error: String(error), report, exceptions: c.exceptions }, null, 2) + '\n');
  console.error('FAILED:', String(error)); process.exitCode = 1;
} finally { await size(1440, 1000).catch(() => {}); c.close(); }
