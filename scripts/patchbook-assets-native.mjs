/** Prompt005 native UI validation; every evaluation guards the marked disposable vault. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { connect, expectedVault } from './obsidian-cdp.mjs';
const directory = 'output/patchbook/milestone-2b'; await mkdir(directory, { recursive: true });
const client = await connect(), stamp = String(Date.now());
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const prefix = `const plugin=app.plugins.getPlugin('mnemobard'),services=plugin.services,library=services.patchbook;
const view=app.workspace.getLeavesOfType('mnemobard-patchbook')[0]?.view,root=view?.contentEl;
const click=(text,scope=root)=>{const b=[...scope.querySelectorAll('button')].find(b=>b.textContent===text&&!b.disabled);if(!b)throw Error('Missing active button '+text);b.click();};
const input=(label,value)=>{const el=[...root.querySelectorAll('input,textarea')].find(e=>e.getAttribute('aria-label')===label);if(!el)throw Error('Missing input '+label);el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));};
const select=(label,value)=>{const el=[...root.querySelectorAll('select')].find(e=>e.getAttribute('aria-label')===label);if(!el)throw Error('Missing select '+label);el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));};
const assert=(value,message)=>{if(!value)throw Error(message);};`;
async function run(body) { try { return await client.evaluate(`(globalThis.__mnemobardAssetValidationTask=(async()=>{${prefix}${body}})())`); } finally { await client.evaluate('delete globalThis.__mnemobardAssetValidationTask'); } }
async function wait(expression) { const until=Date.now()+12000;while(Date.now()<until){if(await run(`return (${expression});`))return;await pause(40);}throw Error('Native timeout: '+expression); }
let report = { stamp, vault: expectedVault, checks: [], formats: [], screenshots: [] };
async function check(text) { report.checks.push(text); console.log(text); await writeFile(`${directory}/native-partial.json`,JSON.stringify(report,null,2)+'\n'); }
async function screenshot(name, selector) {
  if(selector) await run(`root.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'start'});`);
  await pause(100); const shot=await client.command('Page.captureScreenshot',{format:'png'});await writeFile(`${directory}/${name}.png`,Buffer.from(shot.data,'base64'));report.screenshots.push(`${name}.png`);
}
async function associate(path, role) { await run(`click('Select vault asset');select('Asset category',${JSON.stringify(role)});input('Find vault asset',${JSON.stringify(path)});click(${JSON.stringify(path)},root.querySelector('.mnemobard-asset-choices'));`); }
async function playFile(name) { await run(`const row=[...root.querySelectorAll('.mnemobard-asset-row')].find(row=>row.querySelector('strong')?.textContent===${JSON.stringify(name)});assert(row,'Missing audio row');click('Play preview',row);`);await wait(`['playing','error'].includes(services.preview.current.status)`);return run('return services.preview.current;'); }
try {
  await client.command('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  await client.evaluate(`app.plugins.getPlugin('mnemobard').services.modules.open('patchbook')`); await wait('!!root.querySelector("[data-action=new]")&&!root.querySelector("[data-action=new]").disabled');
  report.environment=await run(`return {userAgent:navigator.userAgent,viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,hardwareConcurrency:navigator.hardwareConcurrency};`);
  if(process.argv.includes('--verify-restart')) {
    const prior=JSON.parse(await readFile(`${directory}/native.json`,'utf8'));report={...prior,restartChecks:[]};
    await run(`const record=await services.repository.read(${JSON.stringify(prior.patchId)});assert(record.source===${JSON.stringify(prior.savedSource)},'Saved source changed on restart');assert(library.getDrafts().length===0,'Draft restored automatically');await view.setState({kind:'patch',selectedId:${JSON.stringify(prior.patchId)},search:${JSON.stringify(prior.stamp)}});click('Recovery register');`);
    await wait(`root.querySelector('.mnemobard-recovery-list')?.textContent.includes(${JSON.stringify(prior.patchTitle)})`);
    // The named draft was saved last; explicitly inspect its checkpoint, not an arbitrary earlier entry.
    await run(`const panel=view.recoveryPanel;assert(panel,'Recovery interface missing');await panel.inspect(${JSON.stringify(prior.recoveryPath)});`);
    await wait(`root.querySelector('.mnemobard-recovery-detail')?.textContent.includes('Authoritative source unchanged')`);
    await screenshot('06-recovery','.mnemobard-recovery-detail');
    await run(`assert((await services.repository.read(${JSON.stringify(prior.patchId)})).source===${JSON.stringify(prior.savedSource)},'Inspection wrote source');click('Load draft without saving');`);
    await wait('!!root.querySelector("form")');
    await run(`assert(root.querySelector('[aria-label="General notes"]').value===${JSON.stringify(prior.pendingNotes)},'Draft did not restore');assert((await services.repository.read(${JSON.stringify(prior.patchId)})).source===${JSON.stringify(prior.savedSource)},'Loading wrote source');click('Save record');`);
    await wait('!root.querySelector("form")');
    await run(`const record=await services.repository.read(${JSON.stringify(prior.patchId)});assert(record.entity.notes===${JSON.stringify(prior.pendingNotes)},'Explicit recovery save failed');assert(await app.vault.read(app.vault.getAbstractFileByPath(${JSON.stringify(prior.recoveryPath)}))===${JSON.stringify(prior.recoveryRaw)},'Checkpoint was modified');`);
    await check('Cold restart preserved authoritative assets; discovery/inspection/load wrote nothing; explicit recovered Save succeeded and checkpoint remained byte-identical');
    const state=await playFile('external.wav'); if(state.status!=='playing')throw Error('Preview failed after restart');
    await run(`await plugin.setModule('patchbook',false);assert(services.preview.current.status==='stopped'&&!services.preview.media,'Disable retained media');await plugin.setModule('patchbook',true);await services.modules.open('patchbook');`);
    await check('Disabling and re-enabling PATCHBOOK releases playback and retains records');
    await run(`await view.setState({kind:'patch',selectedId:${JSON.stringify(prior.patchId)}});`);await wait('root.querySelector(".mnemobard-asset-list")?.textContent.includes("external.wav")');await playFile('external.wav');
    await run(`await view.leaf.detach();assert(services.preview.current.status==='stopped'&&!services.preview.media,'View close retained media');await services.modules.open('patchbook');`);
    await check('Closing owning native view stops and releases preview');
    await run(`await view.setState({kind:'patch',selectedId:${JSON.stringify(prior.patchId)}});`);await playFile('external.wav');
    await run(`const player=services.preview;await app.plugins.disablePlugin('mnemobard');assert(player.current.status==='stopped'&&!player.media&&player.listeners.size===0,'Unload retained media/subscribers');await app.plugins.enablePlugin('mnemobard');await app.plugins.getPlugin('mnemobard').services.modules.open('patchbook');`);
    await check('Plugin unload/reload releases media and listeners without duplicate commands');
    await run(`assert(Object.keys(app.commands.commands).filter(k=>k.startsWith('mnemobard:')).length===3,'Duplicate commands');await view.setState({kind:'patch',selectedId:${JSON.stringify(prior.patchId)},search:${JSON.stringify(prior.stamp)}});`);
    await screenshot('03-patch-assets','.mnemobard-asset-section');
    const theme=await run('return app.getTheme();');
    try {
      await run(`app.changeTheme('moonstone');`);await screenshot('01-main-browser','.mnemobard-library-heading');
      await run(`await view.setState({kind:'instrument',selectedId:${JSON.stringify(prior.instrumentId)},search:${JSON.stringify(prior.stamp)}});`);await screenshot('02-instrument-detail','.mnemobard-library-detail');
      await run(`await view.setState({kind:'patch',selectedId:${JSON.stringify(prior.patchId)},search:${JSON.stringify(prior.stamp)}});`);
      await client.command('Emulation.setDeviceMetricsOverride',{width:440,height:900,deviceScaleFactor:1,mobile:false});await screenshot('07-narrow-pane','.mnemobard-asset-section');
      report.narrow=await run(`return {clientWidth:root.clientWidth,scrollWidth:root.scrollWidth,columns:getComputedStyle(root.querySelector('.mnemobard-library-panes')).gridTemplateColumns};`);
      if(report.narrow.scrollWidth>report.narrow.clientWidth+1)throw Error('Narrow pane overflow');
      await client.command('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});await run(`app.changeTheme('obsidian');`);await screenshot('08-dark-theme','.mnemobard-asset-section');
    }finally{await run(`app.changeTheme(${JSON.stringify(theme)});`);}
    await check('Actual light/dark and narrow-pane layouts captured; no horizontal overflow in measured pane');
    const compiled=await build({entryPoints:['benchmarks/patchbook.ts'],bundle:true,platform:'browser',format:'iife',globalName:'MnemobardBenchmark',write:false});
    const script=compiled.outputFiles[0]?.text;if(!script)throw Error('No benchmark bundle');
    await client.evaluate(`(()=>{${script};globalThis.__mnemobardBenchmark=MnemobardBenchmark;return true;})()`);
    report.benchmark=await client.evaluate(`(globalThis.__mnemobardBenchmarkTask=globalThis.__mnemobardBenchmark.runLibraryBenchmark())`);
    await client.evaluate('(()=>{delete globalThis.__mnemobardBenchmarkTask;delete globalThis.__mnemobardBenchmark;return true;})()');
    await check('Native renderer ran production index/query/navigation/reference benchmarks at100/1000/5000 synthetic in-memory records');
    report.rendererExceptions=client.exceptions; if(client.exceptions.length)throw Error('Native renderer exceptions: '+client.exceptions.join('; '));
    await writeFile(`${directory}/native-final.json`,JSON.stringify(report,null,2)+'\n');
  } else {
    report.assetFolder=`2B Synthetic Assets/${stamp}`;
    await run(`await app.vault.createFolder(${JSON.stringify(report.assetFolder)});`);
    for(const name of ['audition.wav','audition.mp3','audition.ogg','audition.flac','panel.png','sound.custom-preset','unsupported.wav']) {
      const bytes=await readFile(`.runtime/synthetic/milestone-2b/${name}`);
      await run(`await app.vault.createBinary(${JSON.stringify(`${report.assetFolder}/${name}`)},Uint8Array.from(atob(${JSON.stringify(bytes.toString('base64'))}),c=>c.charCodeAt(0)).buffer);`);
    }
    report.instrumentTitle=`Archive instrument ${stamp}`;report.patchTitle=`Dusk register ${stamp}`;
    await run(`await view.switchRegister('instrument');input('Search register',${JSON.stringify(stamp)});click('New record');`);await wait('!!root.querySelector("form")');
    await run(`input('Name',${JSON.stringify(report.instrumentTitle)});input('Manufacturer / developer','Synthetic workshop');input('Instrument type','Experimental synthesizer');click('Save record');`);await wait('!root.querySelector("form")');
    report.instrumentId=await run(`return library.query({kind:'instrument',search:${JSON.stringify(stamp)}})[0].entity.id;`);
    await run(`await view.switchRegister('patch');input('Search register',${JSON.stringify(stamp)});click('New record');`);await wait('!!root.querySelector("form")');
    await run(`input('Name',${JSON.stringify(report.patchTitle)});select('Instrument',${JSON.stringify(report.instrumentId)});input('Category','Atmosphere');`);
    await associate(`${report.assetFolder}/audition.wav`,'audio');
    await run(`click('Select vault asset');input('Find vault asset',${JSON.stringify(report.assetFolder)});`);await screenshot('05a-asset-selection','.mnemobard-asset-picker');await run(`click('Cancel selection');`);
    for(const name of ['audition.mp3','audition.ogg','audition.flac','unsupported.wav'])await associate(`${report.assetFolder}/${name}`,'audio');
    await associate(`${report.assetFolder}/sound.custom-preset`,'preset');await associate(`${report.assetFolder}/panel.png`,'image');
    await run(`click('Import local file');`);
    const doc=await client.command('DOM.getDocument');const node=await client.command('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'.mnemobard-asset-picker input[type=file]'});
    const externalPath=resolve('.runtime/synthetic/milestone-2b/external.wav'), original=await readFile(externalPath);report.externalSha256=createHash('sha256').update(original).digest('hex');
    await client.evaluate('true');await client.command('DOM.setFileInputFiles',{nodeId:node.nodeId,files:[externalPath]});
    await wait(`!root.querySelector('.mnemobard-asset-picker button.mod-cta').disabled`);
    await run(`input('Vault import destination',${JSON.stringify(`${report.assetFolder}/Imported`)});select('Asset category','audio');`);await screenshot('05b-asset-import','.mnemobard-asset-picker');await run(`click('Confirm copy into vault');`);
    await wait(`root.querySelector('.mnemobard-asset-list')?.textContent.includes('external.wav')`);
    const after=await readFile(externalPath);if(!after.equals(original))throw Error('External source was modified');
    await run(`click('Save record');`);await wait('!root.querySelector("form")');
    report.patchId=await run(`return library.query({kind:'patch',search:${JSON.stringify(stamp)}})[0].entity.id;`);
    await run(`const e=(await services.repository.read(${JSON.stringify(report.patchId)})).entity;assert(e.assets.length===8,'Missing persisted asset associations');`);
    await check('Created instrument/patch, selected audio/preset/screenshot, imported confirmed local copy and persisted eight portable references; original hash unchanged');
    await run(`const row=[...root.querySelectorAll('.mnemobard-asset-row')].find(row=>row.querySelector('strong')?.textContent==='sound.custom-preset');click('Open asset',row);`);
    await wait(`document.querySelector('.modal-content')?.textContent.includes('Asset inspection')`);
    await run(`click('Inspect as text',document.querySelector('.modal-content'));`);await wait(`document.querySelector('.mnemobard-asset-text')?.textContent.includes('Synthetic inert preset')`);
    await run(`click('Close inspection',document.querySelector('.modal-content'));`);
    await check('Arbitrary preset opens in inert native inspection; text is read only after explicit request');
    for(const name of ['audition.wav','audition.mp3','audition.ogg','audition.flac','unsupported.wav']) {
      const state=await playFile(name);report.formats.push({name,status:state.status,duration:state.duration,message:state.message});
      if(name==='audition.wav') {
        if(state.status!=='playing')throw Error('WAV did not play');await wait('services.preview.current.duration>7');
        await run(`click('Pause preview');assert(services.preview.current.status==='paused','Pause failed');const seek=root.querySelector('[aria-label="Playback position"]');seek.value='2';seek.dispatchEvent(new Event('input',{bubbles:true}));assert(services.preview.current.position===2,'Seek failed');click('Resume preview');`);await wait(`services.preview.current.status==='playing'`);await screenshot('04-audio-preview','.mnemobard-audio-preview');
      }
      await run(`click('Stop preview');assert(!services.preview.media,'Stopped media retained');`);
    }
    await check('Native WAV/MP3/OGG/FLAC decoder probes, unsupported-file error, pause/resume/seek and stop/release verified');
    await run(`const file=app.vault.getAbstractFileByPath(${JSON.stringify(`${report.assetFolder}/audition.wav`)});await app.vault.rename(file,${JSON.stringify(`${report.assetFolder}/moved-audition.wav`)});`);
    await wait(`root.querySelector('.mnemobard-asset-list')?.textContent.includes('missing reference')`);
    await run(`click('Manage assets');const row=[...root.querySelectorAll('.mnemobard-asset-row')].find(row=>row.textContent.includes('missing reference'));click('Repair reference',row);input('Find vault asset',${JSON.stringify(`${report.assetFolder}/moved-audition.wav`)});click(${JSON.stringify(`${report.assetFolder}/moved-audition.wav`)},root.querySelector('.mnemobard-asset-choices'));click('Save record');`);
    await wait('!root.querySelector("form")');
    await check('Simulated file move without link maintenance; missing reference repaired by explicit file selection and protected Save');
    await playFile('external.wav');await run(`const old=services.preview.media;await view.setState({kind:'instrument',selectedId:${JSON.stringify(report.instrumentId)}});assert(services.preview.current.status==='stopped'&&old.paused&&!old.src,'Navigation retained preview');await view.setState({kind:'patch',selectedId:${JSON.stringify(report.patchId)}});`);
    await check('Record navigation/reopen retains associations');
    report.savedSource=await run(`return (await services.repository.read(${JSON.stringify(report.patchId)})).source;`);
    report.pendingNotes=`Recover after cold restart ${stamp}`;
    await run(`click('Edit record');input('General notes',${JSON.stringify(report.pendingNotes)});await view.currentSession.checkpoint();`);
    report.recoveryPath=await run('return view.currentSession.recoveryPath;');report.recoveryRaw=await run(`return await app.vault.read(app.vault.getAbstractFileByPath(${JSON.stringify(report.recoveryPath)}));`);
    await run(`app.workspace.requestSaveLayout();await app.workspace.requestSaveLayout.run();assert((await services.repository.read(${JSON.stringify(report.patchId)})).source===${JSON.stringify(report.savedSource)},'Draft prematurely saved');`);
    await check('Confirmed unsaved draft checkpoint is durable before application restart; authoritative source unchanged');
    report.rendererExceptions=client.exceptions;if(client.exceptions.length)throw Error('Renderer exceptions: '+client.exceptions.join('; '));
    await writeFile(`${directory}/native.json`,JSON.stringify(report,null,2)+'\n');
  }
} catch(error) {
  await writeFile(`${directory}/native-failure.json`,JSON.stringify({message:String(error),report,exceptions:client.exceptions,ui:await run('return root?.textContent;').catch(()=>null)},null,2));throw error;
} finally { await client.command('Emulation.clearDeviceMetricsOverride').catch(()=>{});client.close(); }
