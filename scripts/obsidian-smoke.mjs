import { mkdir, writeFile } from 'node:fs/promises';
import { connect, expectedVault } from './obsidian-cdp.mjs';

const client=await connect();
try {
  const result=await client.evaluate(`(async()=>{
    const assert=(ok,description)=>{if(!ok)throw new Error(description);};
    let plugin=app.plugins.getPlugin('mnemobard');
    assert(plugin?.services,'MNEMOBARD must be enabled in the isolated vault');
    const modules=['patchbook','motif','canvas'];
    for(const module of modules) {
      await plugin.setModule(module,true);
      assert(app.commands.executeCommandById('mnemobard:open-'+module),'Native command failed');
      await plugin.services.modules.open(module);
      await plugin.services.modules.open(module);
      assert(app.workspace.getLeavesOfType('mnemobard-'+module).length===1,'Duplicate view: '+module);
    }
    assert(document.querySelectorAll('.mnemobard-module').length>=3,'Three view shells were not rendered');
    await app.setting.open(); await app.setting.openTabById('mnemobard');
    await new Promise(requestAnimationFrame);
    assert(app.setting.activeTab?.containerEl?.textContent.includes('PATCHBOOK interface'),'Native settings did not render');
    app.setting.close();
    const services=plugin.services, repository=services.repository;
    await services.index.start();
    const patch={id:crypto.randomUUID(),kind:'patch',schemaVersion:1,title:'Foundation smoke patch',instrument:'Synthetic fixture',extra:{custom:'keep'}};
    const created=await repository.create(patch);
    const file=app.vault.getFileByPath(created.path); assert(file,'Patch creation did not reach the native Vault');
    await app.vault.modify(file,created.source+'\\nUnrelated **native writing**.\\n');
    const base=await repository.read(patch.id), saved=await repository.save(base,{...base.entity,title:'Foundation smoke saved'});
    assert(saved.source.includes('Unrelated **native writing**.'),'Prose was lost');
    assert(saved.entity.id===patch.id,'Identity changed');
    const moved=created.path.replace(/\\.md$/,'-renamed.md'); await app.vault.rename(file,moved); await services.index.settled();
    const renamed=await repository.read(patch.id); assert(renamed.path===moved,'Renamed ID did not resolve');
    await app.vault.modify(app.vault.getFileByPath(moved),renamed.source+'\\nExternal edit.\\n');
    let conflict=false;
    try{await repository.save(renamed,{...renamed.entity,title:'Unconfirmed draft'});}catch(error){conflict=error.code==='conflict';}
    assert(conflict,'Stale native write was accepted');
    const recoveryPath=await repository.saveDraftCopy(renamed,{...renamed.entity,title:'Retained draft'});
    const recovery=JSON.parse(await app.vault.read(app.vault.getFileByPath(recoveryPath)));
    assert(recovery.originalSource===renamed.source&&recovery.draft.title==='Retained draft','Recovery copy was incomplete');
    const motif={id:crypto.randomUUID(),kind:'motif',schemaVersion:1,title:'Foundation smoke motif',extra:{},patchId:patch.id,
      data:{schemaVersion:1,ppq:1000,tempoMicrosecondsPerQuarter:500000,meter:{numerator:4,denominator:4},lengthTicks:4000,notes:[]}};
    await repository.create(motif);
    const composition={id:crypto.randomUUID(),kind:'composition',schemaVersion:1,title:'Foundation smoke composition',extra:{},
      data:{schemaVersion:1,ppq:960,tempoMicrosecondsPerQuarter:500000,meter:{numerator:4,denominator:4},lengthTicks:3840,
        lanes:[{id:'lane',name:'Fixture lane',midiChannel:0,patchId:patch.id,clips:[{id:'clip',motifId:motif.id,startTick:0,repeatCount:1}]}],markers:[],sections:[],audioRefs:[]}};
    const compositionRecord=await repository.create(composition);
    assert(services.references.diagnostics(composition).length===0,'Valid references produced a diagnostic');
    await plugin.setModule('motif',false);
    assert(app.workspace.getLeavesOfType('mnemobard-motif').length===0,'Disabling a module did not close its view');
    assert(await app.vault.read(app.vault.getFileByPath(compositionRecord.path))===compositionRecord.source,'Module disable changed stored music');
    await app.plugins.disablePlugin('mnemobard');
    assert(plugin.services===undefined,'Old plugin services retained after unload');
    assert(Object.keys(app.commands.commands).filter(k=>k.startsWith('mnemobard:')).length===0,'Commands retained after unload');
    let disposed=false;try{await repository.create(patch);}catch(error){disposed=error.code==='disposed';}
    assert(disposed,'Old repository still accepts work');
    await app.plugins.enablePlugin('mnemobard');
    plugin=app.plugins.getPlugin('mnemobard'); await plugin.services.index.start();
    assert(!plugin.services.modules.enabled('motif'),'Saved settings did not reload');
    assert((await plugin.services.repository.read(motif.id)).entity.data.ppq===1000,'Source PPQ contract did not survive reload');
    assert((await plugin.services.repository.read(patch.id)).source.includes('External edit.'),'External edit was lost after reload');
    await plugin.setModule('motif',true);
    for(const module of modules)await plugin.services.modules.open(module);
    const count=Object.keys(app.commands.commands).filter(k=>k.startsWith('mnemobard:')).length;
    assert(count===3,'Reload duplicated native commands');
    for(const module of modules)assert(app.workspace.getLeavesOfType('mnemobard-'+module).length===1,'Reload duplicated views');
    return {vault:app.vault.adapter.getBasePath(),windowTitle:document.title,checks:[
      'native load and three commands','three view shells and repeated open deduplication','native settings rendering',
      'native Vault create/update and prose retention','identity after native rename','stale-write rejection','original/draft recovery copy',
      'all three typed entity records and reference resolution','module-disable view cleanup and data preservation',
      'plugin unload command cleanup and closed old repository','re-enable settings/data persistence and no command/view duplicates'
    ],fixtureIds:[patch.id,motif.id,composition.id],recoveryPath,commandCount:count};
  })()`);
  if(result.vault!==expectedVault)throw new Error('Unexpected evidence vault');
  if(client.exceptions.length)throw new Error('Renderer exceptions: '+client.exceptions.join('\n'));
  const review=process.env.MNEMOBARD_FOUNDATION_REVIEW_DIR??'output/playwright';
  if(!/^output\/[a-zA-Z0-9_/-]+$/.test(review)||review.split('/').some(part=>!part))throw Error('Invalid project review directory');
  const directory=new URL('../'+review+'/',import.meta.url);await mkdir(directory,{recursive:true});
  const shot=await client.command('Page.captureScreenshot',{format:'png'});
  await writeFile(new URL('milestone-1a-native.png',directory),Buffer.from(shot.data,'base64'));
  await writeFile(new URL('milestone-1a-native.json',directory),JSON.stringify({...result,rendererExceptions:client.exceptions,recordedAt:new Date().toISOString()},null,2)+'\n');
  console.log(JSON.stringify(result,null,2));
} finally {client.close();}
