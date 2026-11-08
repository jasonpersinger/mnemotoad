/**
 * Real-host Milestone 4I workflow (§19) + screenshots (§20). Disposable vault only (the CDP client refuses any other vault).
 * Fixtures: the 4F "Night procession" / "Ascending choir" records, the 4H disposable 5,000- and 10,000-note motifs
 * (output/mnemobard/milestone-4h/fixture.json) and ONE disposable malformed checkpoint created once per output directory (found by its folder UUID) (no malformed checkpoint
 * existed; recovery files are never deleted, so it stays; recorded in milestone-4i/fixture.json).
 * Usage: node scripts/mnemobard-4i-native.mjs                  (recovery 1–19, 21; undo 1–15; themes/viewports)
 *        node scripts/mnemobard-4i-native.mjs --verify-restart (recovery 20; undo 16–17, after a cold restart)
 */
import { mkdir, readFile, writeFile, stat, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { connect } from './obsidian-cdp.mjs';

const directory = process.env.MNEMOBARD_4I_DIR ?? 'output/mnemobard/milestone-4i', vaultRoot = 'dev-vault';
await mkdir(directory, { recursive: true });
const restart = process.argv.includes('--verify-restart'), c = await connect(), pause = ms => new Promise(r => setTimeout(r, ms)), q = JSON.stringify, stamp = String(Date.now());
let report = { stamp, checks: [], screenshots: [], observations: {} };
if (restart) report = { ...JSON.parse(await readFile(`${directory}/native-part1.json`, 'utf8')), stamp, checks: [], screenshots: [] };
const prefix = `const plugin=app.plugins.getPlugin('mnemobard'),services=plugin.services,leaf=t=>app.workspace.getLeavesOfType('mnemobard-'+t)[0],cv=leaf('canvas')?.view,mv=leaf('motif')?.view,reg=cv?.recoveryPanel,mreg=mv?.recoveryPanel,root=cv?.recoveryRoot,mroot=mv?.recoveryRoot;
const assert=(v,m)=>{if(!v)throw Error(m);};const click=(text,scope=document)=>{const all=[...scope.querySelectorAll('button')].filter(b=>!b.disabled),b=all.find(b=>b.textContent===text)??all.find(b=>b.textContent.startsWith(text));assert(b,'Missing button '+text);b.click();};
const set=(scope,label,value)=>{const e=scope.querySelector('[aria-label="'+label+'"]');assert(e,'Missing control '+label);e.value=value;e.dispatchEvent(new Event(e.tagName==='SELECT'||e.type==='date'?'change':'input',{bubbles:true}));};
const count=scope=>scope.querySelector('.mnemobard-recovery-count')?.textContent;const rows=scope=>[...scope.querySelectorAll('button.mnemobard-recovery-row')];
const facts=(scope,sel)=>Object.fromEntries([...scope.querySelectorAll(sel+' dt')].map(dt=>[dt.textContent,dt.nextElementSibling?.textContent]));const detail=scope=>scope.querySelector('.mnemobard-recovery-detail');
const settled=scope=>rows(scope).every(b=>b.dataset.integrity);`;
async function run(body) { try { return await c.evaluate(`(globalThis.__n4i=(async()=>{${prefix}${body}})())`); } finally { await c.evaluate('delete globalThis.__n4i'); } }
async function wait(test, tries = 600) { for (let i = 0; i < tries; i++) { if (await run(`return (${test});`)) return; await pause(30); } throw Error('Timed out: ' + test); }
async function check(step, text) { report.checks.push({ step, text }); console.log('✓', step, text.slice(0, 300)); await writeFile(`${directory}/partial${restart ? '-restart' : ''}.json`, JSON.stringify(report, null, 2) + '\n'); }
async function shot(name, scroll) { if (scroll) await run(`const e=${scroll};e?.scrollIntoView({block:'start'});`); await pause(350); const s = await c.command('Page.captureScreenshot', { format: 'png' }); await writeFile(`${directory}/${name}.png`, Buffer.from(s.data, 'base64')); if (!report.screenshots.includes(name + '.png')) report.screenshots.push(name + '.png'); }
const size = async (width, height = 900) => { await c.command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }); await pause(350); };
const theme = async name => { await run(`app.changeTheme?.(${q(name)});`); await pause(350); };
const activate = async t => { await run(`await services.modules.open('${t}');app.workspace.setActiveLeaf(leaf('${t}'),{focus:true});`); await pause(200); };
const sha = text => createHash('sha256').update(text).digest('hex');
const KEYS = { Tab: 9, Enter: 13 }; async function key(name) { for (const type of ['keyDown', 'keyUp']) await c.command('Input.dispatchKeyEvent', { type, key: name, code: name, windowsVirtualKeyCode: KEYS[name] ?? 0, ...(name === 'Enter' && type === 'keyDown' ? { text: '\r' } : {}) }); await pause(80); }
/** Metadata snapshot of every vault file under MNEMOBARD/ (path, size, mtime) — proves browsing/inspection wrote nothing. */
async function vaultState() { const out = []; const walk = async dir => { for (const e of await readdir(dir, { withFileTypes: true })) { const p = join(dir, e.name); if (e.isDirectory()) await walk(p); else { const s = await stat(p); out.push(`${p} ${s.size} ${s.mtimeMs}`); } } }; await walk(`${vaultRoot}/MNEMOBARD`); out.sort(); return { files: out.length, digest: sha(out.join('\n')), recovery: out.filter(l => l.includes('/Recovery/') && l.split(' ')[0].endsWith('.json')).length }; }
const gesture = `const g=(resize,delta)=>{const r=mv.roll,ids=new Set(mv.session.selected);r.gesture={pointerId:7,x:200,y:200,resize,moved:false,deltaTick:0,deltaPitch:0,ids,notes:r.model.data.notes.filter(x=>ids.has(x.id))};const rect=r.canvas.getBoundingClientRect(),px=delta/960*r.pixels;for(const f of[0.33,0.66,1])r.move({pointerId:7,clientX:rect.left+200+px*f,clientY:rect.top+200});const v=mv.session.changeVersion;r.up({pointerId:7});assert(mv.session.changeVersion!==v,'edit did not commit');};`;

try {
  await c.command('Page.bringToFront'); await size(1366);
  report.observations[restart ? 'activeDocumentAtRestart' : 'activeDocumentAtStart'] = await c.evaluate('activeDocument===document?"main":"other"');
  if (!restart) {
    report.originalTheme = await run(`return app.vault.getConfig?.('theme')??'obsidian';`); await theme('obsidian');
    const F = JSON.parse(await readFile('output/mnemobard/milestone-4f/fixture.json', 'utf8')), L = JSON.parse(await readFile('output/mnemobard/milestone-4h/fixture.json', 'utf8'));
    let fixture; try { fixture = JSON.parse(await readFile(`${directory}/fixture.json`, 'utf8')); } catch { fixture = undefined; }
    if (!fixture) {
      const id = crypto.randomUUID(), path = `MNEMOBARD/Recovery/${id}/malformed-4i-fixture.json`;
      await run(`await app.vault.createFolder(${q(`MNEMOBARD/Recovery/${id}`)}).catch(()=>{});await app.vault.create(${q(path)},'{"format":"mnemobard-editor-draft","schemaVersion":1,"entityId":"${id}","draft":{"title":"Truncated');return true;`);
      fixture = { malformed: path, note: 'Disposable malformed checkpoint created by the 4I native workflow (no malformed checkpoint existed). Recovery files are never deleted.' };
      await writeFile(`${directory}/fixture.json`, JSON.stringify(fixture, null, 2) + '\n');
    }
    report.fixture = { composition: F.composition, motifA: F.motifA, ...L, ...fixture };
    // Clean starting state: no dirty drafts of the fixture records.
    await run(`for(const d of services.motifs.drafts())if([${q(F.motifA)},${q(L.large5000)},${q(L.large10000)}].includes(d.snapshot.id))services.motifs.discard(d);for(const d of services.canvas.drafts())if(d.snapshot.id===${q(F.composition)})services.canvas.discard(d);`);

    // ── Recovery 1–3: open MNEMOBARD, the register, and confirm the count against the files on disk ──
    const disk = await vaultState();
    await activate('canvas'); await run(`click('Composition recovery',cv.contentEl);`); await wait(`!!reg&&settled(root)&&rows(root).length===25`);
    report.register = { count: await run(`return count(root);`), diskRecoveryFiles: disk.recovery };
    await shot('01-recovery-register-overview', `root`);
    if (report.register.count !== `Showing 1–25 of ${disk.recovery} checkpoints`) throw Error('Count ' + q(report.register));
    await check('R1–3', `CANVAS › Composition recovery: “${report.register.count}”; the disk holds ${disk.recovery} checkpoint JSON files in Recovery folders`);
    const before = await vaultState();

    // 4–9: search, CANVAS filter, sort oldest/newest, next page, page size
    await run(`set(root,'Search checkpoints','Night procession');`); await wait(`settled(root)`); report.search = await run(`return{count:count(root),first:rows(root)[0]?.querySelector('strong').textContent};`);
    await shot('02-recovery-search', `root`);
    await run(`set(root,'Search checkpoints','');set(root,'Module','CANVAS');`); await wait(`settled(root)`);
    report.filter = await run(`return{count:count(root),modules:[...new Set(rows(root).map(r=>r.dataset.module))]};`); await shot('03-recovery-module-filter', `root`);
    await run(`set(root,'Sort','oldest');`); await wait(`settled(root)`); report.oldest = await run(`return rows(root)[0].getAttribute('aria-label');`);
    await run(`set(root,'Sort','newest');`); await wait(`settled(root)`); report.newest = await run(`return rows(root)[0].getAttribute('aria-label');`);
    await run(`click('Next page',root);`); await wait(`settled(root)`); report.page2 = await run(`return{count:count(root),pager:root.querySelector('nav[aria-label="Checkpoint pages"]').textContent};`);
    await run(`set(root,'Page size','50');`); await wait(`settled(root)`); report.pageSize = await run(`return{count:count(root),rows:rows(root).length};`);
    await shot('04-recovery-pagination', `root.querySelector('nav[aria-label="Checkpoint pages"]')`);
    if (!/^Showing 1–\d+ of \d+ checkpoints \(filtered from \d+\)/.test(report.search.count) || q(report.filter.modules) !== '["CANVAS"]' || !/^Showing 26–50 of/.test(report.page2.count) || !/^Showing 1–50 of/.test(report.pageSize.count) || report.pageSize.rows !== 50 || report.oldest === report.newest) throw Error('Browse ' + q({ s: report.search, f: report.filter, p: report.page2, z: report.pageSize }));
    await check('R4–9', `Search “Night procession” → ${report.search.count}; Module CANVAS → ${report.filter.count} (${q(report.filter.modules)}); oldest first “${report.oldest.slice(0, 80)}…”, newest first “${report.newest.slice(0, 80)}…”; next page → ${report.page2.count} (${report.page2.pager}); 50 per page → ${report.pageSize.count}`);

    // 10–13: CANVAS inspector (Night procession), technical details, close
    await run(`set(root,'Page size','25');set(root,'Search checkpoints','Night procession');`); await wait(`settled(root)`);
    await run(`rows(root)[0].click();`); await wait(`!!detail(root).querySelector('.mnemobard-recovery-summary')`);
    report.canvasInspector = await run(`const d=detail(root);return{summary:facts(d,'.mnemobard-recovery-summary'),preview:facts(d,'.mnemobard-recovery-preview'),actions:[...d.querySelectorAll('[aria-label="Checkpoint actions"] button')].map(b=>b.textContent),technicalOpen:d.querySelector('details.mnemobard-recovery-technical').open};`);
    await shot('06-recovery-canvas-inspector', `root.querySelector('.mnemobard-recovery-panes')`);
    await run(`detail(root).querySelector('details.mnemobard-recovery-technical').open=true;`); report.technical = await run(`return facts(detail(root),'.mnemobard-recovery-technical');`);
    await run(`click('Close inspector',detail(root));`); report.closed = await run(`return{empty:!detail(root).children.length,focus:document.activeElement?.classList.contains('mnemobard-recovery-row')};`);
    if (report.canvasInspector.summary.Module !== 'CANVAS' || !report.canvasInspector.preview.Composition || report.canvasInspector.technicalOpen || !report.technical['Checkpoint ID'] || !report.closed.empty || !report.closed.focus) throw Error('Canvas inspector ' + q({ i: report.canvasInspector, t: report.technical, c: report.closed }));
    await check('R10–13', `Inspector summary ${q(report.canvasInspector.summary)}; content ${q(report.canvasInspector.preview)}; actions ${q(report.canvasInspector.actions)}; technical details collapsed, then ${Object.keys(report.technical).length} identifiers; Close returned focus to the row`);

    // 15: a MOTIF checkpoint (validated by MOTIF rules from the CANVAS register), 16: malformed, 17: missing source
    await run(`set(root,'Search checkpoints','Ascending choir');set(root,'Module','MOTIF');`); await wait(`settled(root)&&rows(root).length>0`);
    await run(`rows(root)[0].click();`); await wait(`!!detail(root).querySelector('.mnemobard-recovery-preview')`);
    report.motifInspector = await run(`const d=detail(root);return{path:rows(root)[0].dataset.path,summary:facts(d,'.mnemobard-recovery-summary'),preview:facts(d,'.mnemobard-recovery-preview'),actions:[...d.querySelectorAll('[aria-label="Checkpoint actions"] button')].map(b=>b.textContent)};`);
    await shot('05-recovery-motif-inspector', `root.querySelector('.mnemobard-recovery-panes')`);
    await run(`set(root,'Module','all');set(root,'Search checkpoints',${q(fixture.malformed.split('/').at(-2))});`); await wait(`settled(root)&&rows(root).length===1`);
    await run(`rows(root)[0].click();`); await wait(`!!detail(root).querySelector('.mnemobard-recovery-summary')`);
    report.malformed = await run(`const d=detail(root);return{row:rows(root)[0].textContent,integrity:facts(d,'.mnemobard-recovery-summary').Integrity,meaning:d.querySelector('.mnemobard-recovery-meaning').textContent,canLoad:d.textContent.includes('Load draft')};`);
    await shot('08-recovery-malformed-checkpoint', `root.querySelector('.mnemobard-recovery-panes')`);
    await run(`set(root,'Search checkpoints','');`); await wait(`settled(root)`);
    // Page through the register (newest first) like a user until a readable checkpoint of a missing original appears.
    for (let page = 0; page < 60 && !(await run(`return rows(root).some(b=>b.textContent.includes('Original missing')&&b.dataset.integrity==='Readable');`)); page++) { await run(`click('Next page',root);`); await wait(`settled(root)`); }
    await run(`const r=rows(root).find(b=>b.textContent.includes('Original missing')&&b.dataset.integrity==='Readable');assert(r,'no readable missing-source row in the first 60 pages');r.click();`); await wait(`!!detail(root).querySelector('.mnemobard-recovery-summary')`);
    report.missing = await run(`const d=detail(root);return{doc:facts(d,'.mnemobard-recovery-summary')['Original document'],meaning:d.querySelector('.mnemobard-recovery-meaning').textContent,canLoad:d.textContent.includes('Load draft'),actions:[...d.querySelectorAll('[aria-label="Checkpoint actions"] button')].map(b=>b.textContent)};`);
    await shot('07-recovery-missing-source', `root.querySelector('.mnemobard-recovery-panes')`);
    if (report.motifInspector.summary.Module !== 'MOTIF' || !report.motifInspector.preview.Notes || !report.motifInspector.actions.includes('Open in MOTIF recovery') || report.motifInspector.actions.includes('Load draft without saving')
      || !report.malformed.row.includes('Malformed') || !/^(Malformed|Cannot be safely interpreted)/.test(report.malformed.integrity) || report.malformed.canLoad
      || !/^Missing/.test(report.missing.doc) || report.missing.canLoad || !report.missing.meaning.includes('no replacement document')) throw Error('Integrity ' + q({ m: report.motifInspector, x: report.malformed, s: report.missing }));
    await check('R15–17', `MOTIF checkpoint from the CANVAS register: ${q(report.motifInspector.preview)}, actions ${q(report.motifInspector.actions)}; malformed: “${report.malformed.integrity}” (row stays listed; cannot be loaded); missing source: “${report.missing.doc}” — “${report.missing.meaning}”`);

    // 14: browsing and inspecting changed no file
    const after = await vaultState(); report.unchanged = { before: before.digest, after: after.digest, files: after.files };
    if (before.digest !== after.digest) throw Error('Files changed during browsing/inspection');
    await check('R14', `Every MNEMOBARD vault file identical (path, size, mtime) before and after browsing and inspecting: ${after.files} files, digest ${after.digest.slice(0, 16)}…`);

    // Narrow layouts and light theme with the inspector open; keyboard. "stacked": since 4J the narrow inspector sits inline under its row.
    report.layouts = {};
    for (const width of [1366, 980, 680]) {
      await size(width);
      report.layouts[width] = await run(`const r=cv.contentEl.getBoundingClientRect(),controls=[...root.querySelectorAll('input,select,button')];return{overflowX:Math.max(0,cv.contentEl.scrollWidth-cv.contentEl.clientWidth),unreachable:controls.filter(e=>{const b=e.getBoundingClientRect();return b.width===0||b.left<r.left-1||b.right>r.right+1;}).map(e=>e.getAttribute('aria-label')??e.textContent),stacked:!!root.querySelector('li > .mnemobard-recovery-detail')||root.querySelector('.mnemobard-recovery-detail').getBoundingClientRect().top>root.querySelector('.mnemobard-recovery-list').getBoundingClientRect().bottom-1};`);
      if (width === 980) await shot('09-recovery-narrow-980', `root.querySelector('.mnemobard-recovery-controls')`);
      if (width === 680) await shot('10-recovery-narrow-680', `detail(root)`);
    }
    await size(1366); await theme('moonstone'); await shot('11-recovery-light-theme', `root.querySelector('.mnemobard-recovery-count')`);
    report.light = await run(`return{light:document.body.classList.contains('theme-light'),row:getComputedStyle(rows(root)[0]).backgroundColor,text:getComputedStyle(rows(root)[0]).color};`); await theme('obsidian');
    await run(`root.querySelector('[aria-label="Search checkpoints"]').focus();`); await key('Tab');
    report.keyboard = await run(`const a=document.activeElement;return{label:a.getAttribute('aria-label'),visible:a.matches(':focus-visible'),outline:getComputedStyle(a).outlineStyle};`);
    await run(`rows(root)[1].focus();`); await key('Enter'); await wait(`!!detail(root).querySelector('.mnemobard-recovery-summary')`);
    report.keyboard.enterOpens = await run(`return rows(root)[1].getAttribute('aria-current')==='true';`);
    if (Object.values(report.layouts).some(l => l.overflowX > 1 || l.unreachable.length) || !report.layouts[680].stacked || !report.light.light || !report.keyboard.visible || report.keyboard.outline === 'none' || !report.keyboard.enterOpens) throw Error('Layout ' + q({ l: report.layouts, t: report.light, k: report.keyboard }));
    await check('R-layout', `No horizontal overflow and every control reachable at 1366/980/680 px (stacked at 680: ${report.layouts[680].stacked}); light theme rendered; keyboard: Tab focus visible (${q(report.keyboard)}), Enter on a row opens the inspector`);

    // 18: safe navigation to the owning module's register; 19: an open unsaved draft is protected
    await run(`set(root,'Search checkpoints','Ascending choir');set(root,'Module','MOTIF');`); await wait(`settled(root)&&rows(root).length>0`);
    await run(`rows(root)[0].click();`); await wait(`!!detail(root).querySelector('.mnemobard-recovery-preview')`);
    const motifCheckpoint = await run(`return rows(root)[0].dataset.path;`);
    await run(`click('Open in MOTIF recovery',detail(root));`); await wait(`!!leaf('motif')?.view?.recoveryPanel&&!!leaf('motif').view.recoveryRoot.querySelector('.mnemobard-recovery-summary')`);
    report.navigation = await run(`const v=leaf('motif').view,d=v.recoveryRoot.querySelector('.mnemobard-recovery-detail');return{selected:facts(d,'.mnemobard-recovery-technical')['Checkpoint file']??null,actions:[...d.querySelectorAll('[aria-label="Checkpoint actions"] button')].map(b=>b.textContent),status:d.querySelector('.mnemobard-recovery-status')?.textContent};`);
    report.navigation.expected = motifCheckpoint;
    // Open the motif, make it dirty (unsaved), then inspect its checkpoint: loading is refused up front.
    await activate('motif'); await run(`await mv.setState({selectedId:${q(F.motifA)}});`); await wait(`mv.session?.draft.id===${q(F.motifA)}`);
    await run(`const n=mv.session.snapshot.data.notes[0];mv.session.select([n.id]);mv.selectionChanged();set(mv.contentEl,'Set selected velocity',String(n.velocity===90?91:90));click('Set velocity',mv.contentEl);`); await wait(`mv.session.dirty`);
    await run(`click('Motif recovery',mv.contentEl);`); await wait(`!!mv.recoveryPanel&&settled(mv.recoveryRoot)`);
    await run(`set(mroot,'Search checkpoints','Ascending choir');`); await wait(`settled(mroot)&&rows(mroot).length>0`); await run(`rows(mroot)[0].click();`); await wait(`!!detail(mroot).querySelector('.mnemobard-recovery-summary')`);
    report.protected = await run(`const d=detail(mroot);return{message:d.querySelector('.mnemobard-library-issues')?.textContent??null,canLoad:d.textContent.includes('Load draft without saving'),dirty:mv.session.dirty};`);
    await run(`click('Undo',mv.contentEl);`); await wait('!mv.session.dirty');
    const lists = report.navigation.actions.includes('Load draft without saving') || report.navigation.status?.includes('CONFLICT') || report.navigation.status?.includes('unavailable');
    if (report.navigation.selected !== motifCheckpoint || !lists || !report.protected.message?.includes('unsaved draft') || report.protected.canLoad) throw Error('Navigation/protection ' + q({ n: report.navigation, p: report.protected }));
    await check('R18–19', `“Open in MOTIF recovery” opened MOTIF's register with the same checkpoint selected (${q(report.navigation.actions)}); with an unsaved MOTIF draft of “Ascending choir” open, its checkpoint shows “${report.protected.message}” and no load action; draft then undone (clean)`);

    // 21 (re-discovery without restart): Refresh keeps every checkpoint discoverable
    await activate('canvas'); await run(`click('Refresh list',root);set(root,'Search checkpoints','');set(root,'Module','all');`); await wait(`settled(root)`);
    const disk2 = await vaultState(); report.rediscovered = { count: await run(`return count(root);`), disk: disk2.recovery };
    if (!report.rediscovered.count.startsWith(`Showing 1–25 of ${disk2.recovery} checkpoints`)) throw Error('Refresh ' + q(report.rediscovered));
    await check('R21', `Refresh list: ${report.rediscovered.count} (disk ${disk2.recovery} checkpoint files)`);

    // ── Undo 1–4: small motif ──
    await activate('motif'); await run(`await mv.setState({selectedId:${q(F.motifA)}});`); await wait(`mv.session?.draft.id===${q(F.motifA)}`);
    report.small = await run(`const n=mv.session.snapshot.data.notes[1],states=[JSON.stringify(mv.session.snapshot)];mv.session.select([n.id]);mv.selectionChanged();for(const v of [1,2,3].map(k=>((n.velocity+k-1)%120)+1)){set(mv.contentEl,'Set selected velocity',String(v));click('Set velocity',mv.contentEl);states.push(JSON.stringify(mv.session.snapshot));}
      const depth=mv.contentEl.querySelector('.mnemobard-history-depth').textContent;let exact=true;for(let i=3;i>0;i--){exact&&=JSON.stringify(mv.session.snapshot)===states[i];click('Undo',mv.contentEl);}exact&&=JSON.stringify(mv.session.snapshot)===states[0];for(let i=1;i<=3;i++){click('Redo',mv.contentEl);exact&&=JSON.stringify(mv.session.snapshot)===states[i];}
      return{note:n.id,depth,exact,final:JSON.stringify(mv.session.snapshot.data.notes)};`);
    await run(`click('Save motif',mv.contentEl);`); await wait('!mv.session.dirty&&mv.session.status==="Saved"');
    await run(`mv.leaf.detach();`); await activate('motif'); await run(`await leaf('motif').view.setState({selectedId:${q(F.motifA)}});`); await wait(`leaf('motif').view.session?.draft.id===${q(F.motifA)}`);
    report.small.reopened = await run(`return JSON.stringify((await services.repository.read(${q(F.motifA)})).entity.data.notes)===${q(report.small.final)}&&!mv.session.dirty;`);
    if (!report.small.exact || !report.small.reopened || report.small.depth !== '3 undo · 0 redo') throw Error('Small ' + q(report.small));
    await check('U1–4', `“Ascending choir”: 3 velocity edits (${report.small.depth}), undo ×3 / redo ×3 exact; saved; reopened from a fresh leaf identical and clean`);

    // ── Undo 5–15: 5,000 and 10,000 notes ──
    report.large = {};
    for (const [key, id] of [['5000', L.large5000], ['10000', L.large10000]]) {
      await run(`for(const d of services.motifs.drafts())if(d.snapshot.id===${q(id)})services.motifs.discard(d);await mv.setState({selectedId:${q(id)}});`); await wait(`mv.session?.draft.id===${q(id)}`);
      await run(`mv.contentEl.querySelectorAll('[data-note-id]')[5].click();globalThis.__s=[JSON.stringify(mv.session.snapshot)];return true;`);
      for (let b = 0; b < 30; b += 10) await run(`${gesture}for(let i=${b};i<${b + 10};i++){g(i%2===1,i%4<2?240:-240);globalThis.__s.push(JSON.stringify(mv.session.snapshot));}mv.selectionChanged();`);
      report.large[key] = await run(`return{edits:30,retained:mv.session.historySize,indicator:mv.contentEl.querySelector('.mnemobard-history-depth').textContent,historyMiB:+(mv.session.historyBytes/1048576).toFixed(2),ids:JSON.stringify(mv.session.snapshot.data.notes.map(n=>n.id))};`);
      if (key === '10000') { await run(`mv.contentEl.querySelector('.mnemobard-score-heading').scrollIntoView();`); await shot('12-motif-large-document'); await shot('13-motif-undo-depth', `mv.contentEl.querySelector('.mnemobard-motif-toolbar')`); }
      report.large[key].exact = await run(`const s=globalThis.__s,depth=mv.session.historySize,last=s.length-1;let exact=true;for(let i=last;i>last-depth;i--){exact&&=JSON.stringify(mv.session.snapshot)===s[i];mv.session.undo();}exact&&=JSON.stringify(mv.session.snapshot)===s[last-depth];for(let i=last-depth+1;i<=last;i++){mv.session.redo();exact&&=JSON.stringify(mv.session.snapshot)===s[i];}mv.selectionChanged();
        return exact&&JSON.stringify(mv.session.snapshot.data.notes.map(n=>n.id))===${q(report.large[key].ids)};`);
      delete report.large[key].ids;
      if (report.large[key].retained < 25 || !report.large[key].exact) throw Error('Large ' + key + ' ' + q(report.large[key]));
    }
    // Eviction (13–14) on the 10,000-note motif: unshared full-document edits (inline renames copy every note) reach the budget.
    report.eviction = await run(`const title=mv.session.snapshot.title,before=mv.session.historySize;for(let i=0;i<10;i++)mv.session.edit('Rename motif '+i,m=>({...m,title:title+' · '+i}));mv.selectionChanged();
      const depth=mv.session.historySize,bytes=mv.session.historyBytes,notes=JSON.stringify(mv.session.snapshot.data.notes),intact=JSON.stringify(JSON.parse(globalThis.__s.at(-1)).data.notes)===notes;
      mv.session.edit('Restore name',m=>({...m,title}));mv.selectionChanged();delete globalThis.__s;return{retainedBefore:before,retainedAfter:depth,historyMiB:+(bytes/1048576).toFixed(2),budgetMiB:16,intact,title:mv.session.snapshot.title===title};`);
    if (!(report.eviction.retainedAfter < report.eviction.retainedBefore + 10) || report.eviction.historyMiB > 16 || !report.eviction.intact || !report.eviction.title) throw Error('Eviction ' + q(report.eviction));
    const draft = await run(`return JSON.stringify(mv.session.draft.data.notes);`);
    await run(`click('Save motif',mv.contentEl);`); await wait('!mv.session.dirty&&mv.session.status==="Saved"', 900);
    await run(`for(const d of services.motifs.drafts())if(d.snapshot.id===${q(L.large10000)})services.motifs.discard(d);mv.leaf.detach();`); await activate('motif');
    await run(`await leaf('motif').view.setState({selectedId:${q(L.large10000)}});`); await wait(`leaf('motif').view.session?.draft.id===${q(L.large10000)}`);
    report.saved10000 = await run(`const n=(await services.repository.read(${q(L.large10000)})).entity.data.notes;return{notes:n.length,exact:JSON.stringify(n)===${q(draft)},clean:!mv.session.dirty};`); report.saved10000.sha = sha(draft);
    if (report.saved10000.notes !== 10000 || !report.saved10000.exact || !report.saved10000.clean) throw Error('Save 10000 ' + q(report.saved10000));
    await check('U5–15', `5,000 notes: ${q(report.large['5000'])}; 10,000 notes: ${q(report.large['10000'])} (budget 16 MiB, 100 entries); eviction with unshared full-document edits: ${q(report.eviction)}; saved and reopened 10,000 notes identical and clean`);
    await theme(report.originalTheme === 'moonstone' ? 'moonstone' : report.originalTheme === 'system' ? 'system' : 'obsidian');
    await c.evaluate('app.workspace.requestSaveLayout?.run?.()');
  } else {
    // ── After a cold restart: recovery 20; undo 16–17 ──
    await theme('obsidian'); const F = report.fixture, disk = await vaultState();
    await activate('canvas'); await run(`click('Composition recovery',cv.contentEl);`); await wait(`!!reg&&settled(root)&&rows(root).length===25`);
    report.restartRegister = { count: await run(`return count(root);`), disk: disk.recovery };
    await run(`set(root,'Search checkpoints',${q(F.malformed.split('/').at(-2))});`); await wait(`settled(root)&&rows(root).length===1`);
    report.restartRegister.malformedListed = true; await run(`set(root,'Search checkpoints','');`); await wait(`settled(root)`);
    await shot('14-recovery-after-restart', `root`);
    report.restartData = await run(`const s=(await services.repository.read(${q(F.motifA)})).entity.data.notes,l=(await services.repository.read(${q(F.large10000)})).entity.data.notes;return{small:JSON.stringify(s)===${q(report.small.final)},largeNotes:l.length,largeJson:JSON.stringify(l)};`);
    report.restartData.largeSha = sha(report.restartData.largeJson); delete report.restartData.largeJson;
    if (report.restartRegister.count !== `Showing 1–25 of ${disk.recovery} checkpoints` || !report.restartData.small || report.restartData.largeSha !== report.saved10000.sha) throw Error('Restart ' + q({ r: report.restartRegister, d: report.restartData }));
    await check('R20 / U16–17', `After a cold restart: ${report.restartRegister.count} (disk ${disk.recovery}), malformed fixture still listed; “Ascending choir” edits and the 10,000-note save intact (notes SHA-256 ${report.restartData.largeSha.slice(0, 12)}…)`);
    await theme(report.originalTheme === 'moonstone' ? 'moonstone' : report.originalTheme === 'system' ? 'system' : 'obsidian');
  }
  report.rendererExceptions = c.exceptions; if (c.exceptions.length) throw Error(c.exceptions.join('\n'));
  await check('exceptions', `Renderer exceptions during this phase: ${c.exceptions.length}`);
  await writeFile(`${directory}/native-${restart ? 'restart' : 'part1'}.json`, JSON.stringify(report, null, 2) + '\n');
} catch (error) {
  await writeFile(`${directory}/failure${restart ? '-restart' : ''}.json`, JSON.stringify({ error: String(error), report, exceptions: c.exceptions }, null, 2) + '\n');
  console.error('FAILED:', String(error)); process.exitCode = 1;
} finally { await size(1440, 1000).catch(() => {}); c.close(); }
