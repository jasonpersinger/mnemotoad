/** Production PATCHBOOK native UI workflow. CDP refuses every non-disposable vault. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { connect, expectedVault } from './obsidian-cdp.mjs';
const client = await connect();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const stamp = String(Date.now());
const names = { instrument: `Ink module ${stamp}`, chain: `Atmosphere ${stamp}`, patch: `Glass veil ${stamp}`, second: `Amber dust ${stamp}`, pending: `Prepared strings ${stamp}` };
const report = { vault: expectedVault, stamp, names, checks: [] };
const prefix = `const plugin=app.plugins.getPlugin('mnemobard'),services=plugin.services,library=services.patchbook;
const view=app.workspace.getLeavesOfType('mnemobard-patchbook')[0]?.view,root=view?.contentEl;
const click=(text,scope=root)=>{const button=[...scope.querySelectorAll('button')].find(b=>b.textContent===text&&!b.disabled);if(!button)throw new Error('Missing active button: '+text);button.click();};
const input=(label,value)=>{const el=[...root.querySelectorAll('input,textarea')].find(e=>e.getAttribute('aria-label')===label);if(!el)throw new Error('Missing input: '+label);el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));};
const select=(label,value)=>{const el=[...root.querySelectorAll('select')].find(e=>e.getAttribute('aria-label')===label);if(!el)throw new Error('Missing select: '+label);el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));};
const find=(kind,title)=>library.query({kind,archived:'all'}).find(item=>item.entity.title===title);
const assert=(condition,message)=>{if(!condition)throw new Error(message);};`;
// Keep the evaluated promise strongly reachable until CDP returns. Chromium can otherwise
// report "Promise was collected" during an asynchronous native file/index operation.
async function run(body) {
  try { return await client.evaluate(`(globalThis.__mnemobardPatchbookValidationTask=(async()=>{${prefix}${body}})())`); }
  finally { await client.evaluate(`delete globalThis.__mnemobardPatchbookValidationTask`); }
}
async function wait(expression) {
  const until = Date.now() + 8000;
  while (Date.now() < until) { if (await run(`return (${expression});`)) return; await pause(40); }
  throw new Error(`Native UI timeout: ${expression}`);
}
async function check(message) {
  report.checks.push(message); console.log(message);
  await mkdir('output/patchbook', { recursive: true }); await writeFile('output/patchbook/partial.json', JSON.stringify(report, null, 2) + '\n');
}
try {
  await client.evaluate(`app.plugins.getPlugin('mnemobard').services.modules.open('patchbook')`);
  report.environment = await run(`return {title:document.title,userAgent:navigator.userAgent,width:innerWidth,height:innerHeight,dpr:devicePixelRatio};`);
  if (process.argv.includes('--verify-restart')) {
    const original = JSON.parse(await readFile('output/patchbook/native.json', 'utf8'));
    const result = await run(`const expected=${JSON.stringify(original.records)};await services.index.start();for(const record of expected){const fresh=await services.repository.read(record.id);assert(fresh.entity.title===record.title,'Cold title changed');assert(fresh.source===record.source,'Cold source changed');}assert(Object.keys(app.commands.commands).filter(k=>k.startsWith('mnemobard:')).length===3,'Duplicate commands after restart');assert(services.settings.current.modules.patchbook,'Module setting did not persist');assert(view.getState().selectedId===${JSON.stringify(original.patches[0].entity.id)},'Workspace selected identity did not restore');assert(root.querySelector('input[type="search"]').value===${JSON.stringify(original.stamp)},'Workspace search hint did not restore');return {records:expected.length,commands:3,enabled:true,workspaceRestored:true,exceptions:0};`);
    result.exceptions = client.exceptions.length;
    if (result.exceptions) throw new Error(`Renderer exceptions during cold verification: ${client.exceptions.join('; ')}`);
    await writeFile('output/patchbook/cold-restart.json', JSON.stringify({ ...result, environment: report.environment }, null, 2) + '\n'); console.log(result);
  } else {
    await run(`click('Instruments');`); await wait(`root.querySelector('[data-kind="instrument"]').getAttribute('aria-pressed')==='true'`);
    await run(`click('New record');`); await wait(`!!root.querySelector('form')`);
    await run(`input('Name',${JSON.stringify(names.instrument)});input('Manufacturer / developer','Workshop');input('Instrument type','Software synthesizer');input('Platform / format','VST3 / desktop');input('Description','A synthetic native-test instrument.');input('Tags (comma-separated)','experimental, digital');click('Save record');`);
    await wait(`!!find('instrument',${JSON.stringify(names.instrument)})&&!root.querySelector('form')`);
    report.instrument = await run(`return find('instrument',${JSON.stringify(names.instrument)});`);
    await check('Created instrument using native workspace form');
    await run(`click('Edit record');`); await wait(`!!root.querySelector('form')`);
    await run(`input('Platform / format','VST3 / Linux / native checked');click('Save record');`); await wait(`!root.querySelector('form')`);
    await run(`assert(find('instrument',${JSON.stringify(names.instrument)}).entity.platform==='VST3 / Linux / native checked','Instrument update did not persist');`);
    await check('Edited instrument metadata through its production form');

    await run(`click('Effects chains');`); await wait(`root.querySelector('[data-kind="effects-chain"]').getAttribute('aria-pressed')==='true'`);
    await run(`click('New record');`); await wait(`!!root.querySelector('form')`);
    await run(`input('Name',${JSON.stringify(names.chain)});click('Add effect');input('Processor 1','Equalizer');input('Stage 1 parameter notes','Low cut at 100 Hz');click('Add effect');input('Processor 2','Tape delay');input('Stage 2 parameter notes','Quarter-note echoes');click('Move stage up');click('Save record');`);
    await wait(`!!find('effects-chain',${JSON.stringify(names.chain)})&&!root.querySelector('form')`);
    report.chain = await run(`const chain=find('effects-chain',${JSON.stringify(names.chain)});assert(chain.entity.steps.map(s=>s.name).join(',')==='Tape delay,Equalizer','Effect ordering changed');return chain;`);
    await check('Created and reordered a structured reusable effects chain');
    await run(`click('Edit record');`); await wait(`!!root.querySelector('form')`);
    await run(`input('Description','Shared delay and equalization settings.');click('Save record');`); await wait(`!root.querySelector('form')`);
    await run(`assert(find('effects-chain',${JSON.stringify(names.chain)}).entity.description==='Shared delay and equalization settings.','Chain update did not persist');`);
    await check('Edited effects-chain metadata without changing stage order');

    for (const [name, detailed] of [[names.patch, true], [names.second, false]]) {
      await run(`click('Patches');`); await wait(`root.querySelector('[data-kind="patch"]').getAttribute('aria-pressed')==='true'`);
      await run(`click('New record');`); await wait(`!!root.querySelector('form')`);
      await run(`input('Name',${JSON.stringify(name)});select('Instrument',${JSON.stringify(report.instrument.entity.id)});input('Category','Pad');input('Tags (comma-separated)','glass, evolving');const checkbox=[...root.querySelectorAll('input[type="checkbox"]')].find(e=>e.value===${JSON.stringify(report.chain.entity.id)});assert(checkbox,'Chain chooser missing');checkbox.click();`);
      if (detailed) await run(`input('Mood / character','hushed');input('Parameter notes','Slow attack; leave space.');input('General notes','Use above the field recording.');const parameters=[...root.querySelectorAll('details')].find(d=>d.querySelector('summary')?.textContent==='Structured parameters');parameters.open=true;click('Add parameter');input('Parameter 1 name','Cutoff');input('Parameter 1 value','1200');input('Parameter 1 unit','Hz');const assets=root.querySelector('.mnemobard-assets-form');assets.open=true;input('Preset files','Assets/native.preset');input('Screenshots','Assets/native-panel.png');input('Audio previews','Assets/native-preview.wav');`);
      await run(`click('Save record');`); await wait(`!!find('patch',${JSON.stringify(name)})&&!root.querySelector('form')`);
    }
    report.patches = await run(`const patches=[find('patch',${JSON.stringify(names.patch)}),find('patch',${JSON.stringify(names.second)})];for(const p of patches){assert(p.entity.instrumentId===${JSON.stringify(report.instrument.entity.id)},'Instrument ID missing');assert(p.entity.effectsChainIds[0]===${JSON.stringify(report.chain.entity.id)},'Chain ID missing');}return patches;`);
    await check('Created two patches sharing stable instrument and effects-chain references');
    const patchId = report.patches[0].entity.id;
    await run(`input('Search register',${JSON.stringify(stamp)});select('Instrument filter',${JSON.stringify(report.instrument.entity.id)});select('Category filter','Pad');select('Tag filter','glass');select('Sort records','title-desc');assert(root.querySelectorAll('.mnemobard-record-list li').length===2,'Combined filtering failed');assert(root.querySelector('.mnemobard-record-list strong').textContent===${JSON.stringify(names.patch)},'Descending sort failed');`);
    await check('Search, combined instrument/category/tag filters and sorting operate in native UI');
    await run(`root.querySelector('[data-record-id="${patchId}"]').click();`); await wait(`root.querySelector('.mnemobard-library-detail h2')?.textContent===${JSON.stringify(names.patch)}`);
    await run(`assert(root.querySelector('.mnemobard-library-issues')?.textContent.includes('missing'),'Missing asset diagnostics absent');click(${JSON.stringify(names.chain)},root.querySelector('.mnemobard-library-detail'));`);
    await wait(`root.querySelector('.mnemobard-library-detail h2')?.textContent===${JSON.stringify(names.chain)}`);
    await run(`assert(root.textContent.includes('Associated patches · 2'),'Reverse associations missing');click(${JSON.stringify(names.patch)},root.querySelector('.mnemobard-library-detail'));`);
    await wait(`root.querySelector('.mnemobard-library-detail h2')?.textContent===${JSON.stringify(names.patch)}`);
    await check('Related record navigation works; missing assets remain actionable metadata');
    await run(`click('Open Markdown record');`); await pause(150);
    await run(`assert(app.workspace.getMostRecentLeaf().view.getViewType()==='markdown','Underlying Markdown did not open');await services.modules.open('patchbook');`);
    await check('Underlying Markdown record opens through workspace navigation');

    await run(`const record=await services.repository.read(${JSON.stringify(patchId)});const file=app.vault.getAbstractFileByPath(record.path);await app.vault.process(file,s=>s.replace('mnemobard_schema: 1',${JSON.stringify('mnemobard_schema: 1\ncustom_bank: blue # retain exact')})+${JSON.stringify('\nUser-authored **Markdown** stays.\n')});await services.index.settled();`); await pause(100);
    await run(`click('Edit record');`); await wait(`!!root.querySelector('form')`);
    const conflictTitle = `Conflicting draft ${stamp}`;
    await run(`input('Name',${JSON.stringify(conflictTitle)});const record=await services.repository.read(${JSON.stringify(patchId)});await app.vault.process(app.vault.getAbstractFileByPath(record.path),s=>s+${JSON.stringify('\nConcurrent external writing.\n')});await services.index.settled();click('Save record');`);
    await wait(`root.textContent.includes('Not saved:')`);
    await run(`const record=await services.repository.read(${JSON.stringify(patchId)});assert(record.entity.title===${JSON.stringify(names.patch)},'Conflict overwrote the source title');assert(record.source.includes('Concurrent external writing.'),'External prose lost');const draft=library.getDrafts().find(s=>s.draft.id===${JSON.stringify(patchId)});assert(draft?.recoveryPath&&draft.draft.title===${JSON.stringify(conflictTitle)},'Conflict draft not retained');`);
    await check('External edit conflict rejects stale save and preserves current note and recovery draft');
    await run(`click('Keep draft & close form');`); await wait(`!root.querySelector('form')`);
    await run(`root.querySelector('.mnemobard-draft-actions').open=true;click('Discard draft…');click('Keep editing');assert(library.getDrafts().length>0,'Cancelled discard removed draft');click('Discard draft…');click('Confirm discard');`);
    await wait(`root.querySelector('.mnemobard-library-detail h2')?.textContent===${JSON.stringify(names.patch)}`);
    await run(`click('Edit record');`); await wait(`!!root.querySelector('form')`);
    await run(`input('General notes','Saved after reviewing the conflict.');click('Save record');`); await wait(`!root.querySelector('form')`);
    await run(`const record=await services.repository.read(${JSON.stringify(patchId)});assert(record.source.includes('custom_bank: blue # retain exact'),'Unknown metadata changed');assert(record.source.includes('User-authored **Markdown** stays.'),'Markdown lost');assert(record.entity.notes==='Saved after reviewing the conflict.','Reviewed update did not save');`);
    await check('Explicit discard confirmation and subsequent edits preserve custom YAML and Markdown');
    await run(`click('Edit record');`); await wait(`!!root.querySelector('form')`);
    await run(`input('General notes','Saved with the native keyboard shortcut.');root.querySelector('textarea[aria-label="General notes"]').focus();`);
    await client.command('Input.dispatchKeyEvent',{type:'keyDown',key:'s',code:'KeyS',windowsVirtualKeyCode:83,modifiers:2});
    await client.command('Input.dispatchKeyEvent',{type:'keyUp',key:'s',code:'KeyS',windowsVirtualKeyCode:83,modifiers:2});
    await wait(`!root.querySelector('form')`);
    await run(`assert((await services.repository.read(${JSON.stringify(patchId)})).entity.notes==='Saved with the native keyboard shortcut.','Native keyboard save failed');`);
    await check('Native Ctrl+S saves the active form through its Obsidian key scope');

    const renamed = `MNEMOBARD/Instruments/Renamed-native-${stamp}.md`;
    await run(`const record=await services.repository.read(${JSON.stringify(report.instrument.entity.id)});plugin.nativeRenameProbe={done:false,error:''};void app.fileManager.renameFile(app.vault.getAbstractFileByPath(record.path),${JSON.stringify(renamed)}).then(()=>{plugin.nativeRenameProbe.done=true;}).catch(error=>{plugin.nativeRenameProbe.error=String(error);plugin.nativeRenameProbe.done=true;});`);
    // A host link-update confirmation can keep renameFile pending. Resolve only its one-time choice in this disposable vault.
    for (let attempt=0;attempt<100;attempt++) {
      const status=await run(`const choice=[...document.querySelectorAll('.modal button')].find(b=>b.textContent==='Just once');if(choice)choice.click();return plugin.nativeRenameProbe;`);
      if(status.error)throw new Error(status.error);
      if(status.done)break;
      if(attempt===99)throw new Error('Native rename/link-update did not complete');
      await pause(100);
    }
    await run(`delete plugin.nativeRenameProbe;await services.index.settled();`);
    await wait(`services.index.resolve(${JSON.stringify(report.instrument.entity.id)}).path===${JSON.stringify(renamed)}`);
    await run(`const record=await services.repository.read(${JSON.stringify(patchId)});assert(record.entity.instrumentId===${JSON.stringify(report.instrument.entity.id)},'Rename changed association');assert(find('patch',${JSON.stringify(names.patch)}).instrumentName===${JSON.stringify(names.instrument)},'Renamed instrument no longer resolves');`);
    await check('Native FileManager rename retains entity identity and patch relationships');

    await run(`click(${JSON.stringify(names.chain)},root.querySelector('.mnemobard-library-detail'));`); await wait(`root.querySelector('.mnemobard-library-detail h2')?.textContent===${JSON.stringify(names.chain)}`);
    await run(`click('Archive record');click('Cancel');assert(!find('effects-chain',${JSON.stringify(names.chain)}).entity.archived,'Cancelled archive changed record');click('Archive record');click('Confirm archive');`);
    await wait(`find('effects-chain',${JSON.stringify(names.chain)})?.entity.archived===true`);
    await wait(`!![...root.querySelectorAll('button')].find(b=>b.textContent==='Restore to library')`);
    await run(`assert(library.related(${JSON.stringify(report.chain.entity.id)}).length===2,'Archive cascaded to patches');click('Restore to library');click('Confirm restore');`);
    await wait(`find('effects-chain',${JSON.stringify(names.chain)})?.entity.archived===false`);
    await check('Archive requires confirmation, retains referenced notes and restores without cascading');

    await run(`click('Instruments');`); await wait(`root.querySelector('[data-kind="instrument"]').getAttribute('aria-pressed')==='true'`);
    await run(`click('New record');`); await wait(`!!root.querySelector('form')`);
    await run(`input('Name',${JSON.stringify(names.pending)});await plugin.setModule('patchbook',false);assert(!app.workspace.getLeavesOfType('mnemobard-patchbook').length,'Module disable left the view');const draft=library.getDrafts().find(s=>s.draft.title===${JSON.stringify(names.pending)});assert(draft?.recoveryPath,'Disable did not checkpoint draft');await plugin.setModule('patchbook',true);await services.modules.open('patchbook');`);
    await wait(`root.textContent.includes(${JSON.stringify(names.pending)})`);
    await run(`click(${JSON.stringify(names.pending)},root.querySelector('.mnemobard-drafts'));`); await wait(`!!root.querySelector('form')`); await run(`click('Save record');`);
    await wait(`!!find('instrument',${JSON.stringify(names.pending)})&&!root.querySelector('form')`);
    await check('Module disable awaits draft recovery, retains data and restores a usable draft after re-enable');

    await run(`const old=services;await app.plugins.disablePlugin('mnemobard');assert(plugin.services===undefined,'Plugin services retained after unload');let rejected=false;try{await old.repository.read(${JSON.stringify(patchId)})}catch{rejected=true;}assert(rejected,'Old repository still live');await app.plugins.enablePlugin('mnemobard');await app.plugins.getPlugin('mnemobard').services.modules.open('patchbook');`);
    await run(`await services.index.start();assert(Object.keys(app.commands.commands).filter(k=>k.startsWith('mnemobard:')).length===3,'Duplicate commands after reload');assert(find('patch',${JSON.stringify(names.patch)})&&find('effects-chain',${JSON.stringify(names.chain)}),'Saved library records missing after reload');`);
    await check('Plugin unload/reload cleans services and restores records without duplicate commands');
    await run(`await app.workspace.getLeavesOfType('mnemobard-patchbook')[0].setViewState({type:'mnemobard-patchbook',active:true,state:{kind:'patch',selectedId:${JSON.stringify(patchId)},search:${JSON.stringify(stamp)},sort:'title-asc',archived:'active'}});app.workspace.requestSaveLayout();await app.workspace.requestSaveLayout.run();`);
    report.records = await run(`const ids=${JSON.stringify([report.instrument.entity.id, report.chain.entity.id, ...report.patches.map(p => p.entity.id)])};const pending=find('instrument',${JSON.stringify(names.pending)});ids.push(pending.entity.id);const records=[];for(const id of ids){const record=await services.repository.read(id);records.push({id,title:record.entity.title,path:record.path,source:record.source});}return records;`);
    const originalTheme=await client.evaluate('app.getTheme()');
    try {
      await client.evaluate('app.workspace.leftSplit.collapse()');
      await client.command('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
      report.themes=[];
      for(const [theme,label] of [['obsidian','dark'],['moonstone','light']]) {
        await client.evaluate(`app.changeTheme(${JSON.stringify(theme)})`); await pause(350);
        const measurement=await run(`root.scrollTop=0;return {theme:app.getTheme(),light:document.body.classList.contains('theme-light'),width:root.clientWidth,scrollWidth:root.scrollWidth,color:getComputedStyle(root).color,background:getComputedStyle(root).getPropertyValue('--background-primary').trim(),formLabels:root.querySelectorAll('[aria-label]').length};`);
        report.themes.push(measurement);
        const screenshot=await client.command('Page.captureScreenshot',{format:'png'});await writeFile(`output/patchbook/native-${label}.png`,Buffer.from(screenshot.data,'base64'));
      }
      await client.command('Emulation.setDeviceMetricsOverride',{width:440,height:900,deviceScaleFactor:1,mobile:false});await pause(100);
      report.narrow=await run(`return {width:root.clientWidth,scrollWidth:root.scrollWidth,columns:getComputedStyle(root.querySelector('.mnemobard-library-panes')).gridTemplateColumns};`);
      const screenshot=await client.command('Page.captureScreenshot',{format:'png'});await writeFile('output/patchbook/native-narrow.png',Buffer.from(screenshot.data,'base64'));
      if(report.narrow.scrollWidth>report.narrow.width+2)throw new Error('Narrow PATCHBOOK pane overflows horizontally');
      await check('Native light/dark themes and narrow desktop pane retain legibility and contained layout');
    } finally {
      await client.evaluate(`app.changeTheme(${JSON.stringify(originalTheme)})`);await client.command('Emulation.clearDeviceMetricsOverride');
    }
    report.exceptions = client.exceptions;
    if (report.exceptions.length) throw new Error(`Renderer exceptions during PATCHBOOK workflow: ${report.exceptions.join('; ')}`);
    await check('Saved five synthetic records and workspace state for cold-restart verification');
    await mkdir('output/patchbook', { recursive: true });
    await writeFile('output/patchbook/native.json', JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ checks: report.checks, exceptions: report.exceptions, records: report.records.length }, null, 2));
  }
} catch (error) {
  await mkdir('output/patchbook', { recursive: true }); await writeFile('output/patchbook/failure.json', JSON.stringify({ ...report, error: String(error), exceptions: client.exceptions }, null, 2) + '\n');
  throw error;
} finally { client.close(); }
