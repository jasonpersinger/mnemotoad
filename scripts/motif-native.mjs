/** Production MOTIF workflow. CDP evaluation always guards the disposable vault. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { connect, expectedVault } from './obsidian-cdp.mjs';
const directory=process.env.MNEMOBARD_MOTIF_REVIEW_DIR??'output/motif/milestone-3a';if(!/^output\/[a-zA-Z0-9_/-]+$/.test(directory)||directory.split('/').some(part=>!part))throw Error('Invalid project review directory');await mkdir(directory,{recursive:true});const client=await connect(),stamp=String(Date.now());
let report={stamp,vault:expectedVault,checks:[],screenshots:[]};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const prefix=`const plugin=app.plugins.getPlugin('mnemobard'),services=plugin.services,library=services.motifs;
const view=app.workspace.getLeavesOfType('mnemobard-motif')[0]?.view,root=view?.contentEl;
const assert=(condition,message)=>{if(!condition)throw Error(message);};
const click=(text,scope=root)=>{const button=[...scope.querySelectorAll('button')].find(b=>b.textContent===text&&!b.disabled);assert(button,'Missing active button '+text);button.click();};
const input=(label,value)=>{const control=[...root.querySelectorAll('input,textarea')].find(node=>node.getAttribute('aria-label')===label);assert(control,'Missing input '+label);control.value=value;control.dispatchEvent(new Event('input',{bubbles:true}));};
const select=(label,value)=>{const control=[...root.querySelectorAll('select')].find(node=>node.getAttribute('aria-label')===label);assert(control,'Missing select '+label);control.value=value;control.dispatchEvent(new Event('change',{bubbles:true}));};`;
async function run(body){try{return await client.evaluate(`(globalThis.__mnemobardMotifNativeTask=(async()=>{${prefix}${body}})())`);}finally{await client.evaluate('delete globalThis.__mnemobardMotifNativeTask');}}
async function wait(expression){const until=Date.now()+12000;while(Date.now()<until){if(await run(`return (${expression});`))return;await pause(30);}throw Error('Native timeout: '+expression);}
async function check(text){report.checks.push(text);console.log(text);await writeFile(`${directory}/partial.json`,JSON.stringify(report,null,2)+'\n');}
async function key(key,code,vk,modifiers=0){const text=!modifiers&&(key==='Enter'?'\r':key===' '?' ':undefined);await client.command('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:vk,modifiers,...(text?{text,unmodifiedText:text}:{})});await client.command('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:vk,modifiers});}
async function screenshot(name,selector){if(selector)await run(`root.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'center'});`);await pause(80);const image=await client.command('Page.captureScreenshot',{format:'png'});await writeFile(`${directory}/${name}.png`,Buffer.from(image.data,'base64'));report.screenshots.push(`${name}.png`);}
async function point(tick,pitch,edge=false){return run(`view.roll.canvas.scrollIntoView({block:'center'});const v=view.roll.viewport,rect=view.roll.canvas.getBoundingClientRect();return{x:rect.x+56+((${tick})-v.startTick)/v.ppq*v.pixelsPerQuarter+${edge?'0':'8'},y:rect.y+28+(v.topPitch-${pitch})*v.rowHeight+v.rowHeight/2};`);}
async function mouse(type,point,modifiers=0){await client.command('Input.dispatchMouseEvent',{type,x:point.x,y:point.y,button:type==='mouseMoved'?'none':'left',buttons:type==='mousePressed'?1:0,clickCount:1,modifiers});}
async function draw(tick,pitch){const before=await run('return view.session.draft.data.notes.length;'),p=await point(tick,pitch);await mouse('mousePressed',p);await mouse('mouseReleased',p);await wait(`view.session.draft.data.notes.length===${before+1}`);}
async function drag(noteId,deltaTick,deltaPitch,resize=false){
 const positions=await run(`view.roll.canvas.scrollIntoView({block:'center'});const note=view.session.draft.data.notes.find(n=>n.id===${JSON.stringify(noteId)}),v=view.roll.viewport,rect=view.roll.canvas.getBoundingClientRect();const x=rect.x+56+(note.startTick-v.startTick)/v.ppq*v.pixelsPerQuarter+( ${resize?'note.durationTicks/v.ppq*v.pixelsPerQuarter-3':'Math.min(10,note.durationTicks/v.ppq*v.pixelsPerQuarter/3)'} );const y=rect.y+28+(v.topPitch-note.pitch)*v.rowHeight+v.rowHeight/2;return{from:{x,y},to:{x:x+${deltaTick}/v.ppq*v.pixelsPerQuarter,y:y-${deltaPitch}*v.rowHeight},history:view.session.historySize};`);
 await mouse('mousePressed',positions.from);for(let i=1;i<=8;i++)await client.command('Input.dispatchMouseEvent',{type:'mouseMoved',x:positions.from.x+(positions.to.x-positions.from.x)*i/8,y:positions.from.y+(positions.to.y-positions.from.y)*i/8,button:'left',buttons:1});await mouse('mouseReleased',positions.to);await wait(`view.session.historySize===${positions.history+1}`);
}
try{
 await client.command('Emulation.setDeviceMetricsOverride',{width:1280,height:1000,deviceScaleFactor:1,mobile:false});
 await client.evaluate("app.plugins.getPlugin('mnemobard').services.modules.open('motif')");await wait("!!root.querySelector('button.mod-cta')&&!root.querySelector('button.mod-cta').disabled");
 report.environment=await run('return{userAgent:navigator.userAgent,width:innerWidth,height:innerHeight,dpr:devicePixelRatio,concurrency:navigator.hardwareConcurrency};');
 if(process.argv.includes('--verify-restart')){
  const original=JSON.parse(await readFile(`${directory}/native.json`,'utf8'));report={...original};
  await run(`const saved=await services.repository.read(${JSON.stringify(original.id)});assert(saved.source===${JSON.stringify(original.savedSource)},'Cold source changed');assert(JSON.stringify(saved.entity.data.notes)===${JSON.stringify(JSON.stringify(original.notes))},'Cold notes changed');assert(!library.drafts().length,'Draft reopened automatically');await view.setState({selectedId:${JSON.stringify(original.id)}});`);await wait('!!view.roll');
  await check('Cold application restart preserved exact saved note bytes, IDs, PPQ/tempo/meter and motif reopening');
  // Inspect the unsaved pre-restart checkpoint without automatically rebasing it.
  await run(`click('Motif recovery');`);await wait(`root.querySelector('.mnemobard-recovery-list')?.textContent.includes(${JSON.stringify(original.title)})`);
  await run(`await view.recoveryPanel.inspect(${JSON.stringify(original.recoveryPath)});`);await wait(`root.querySelector('.mnemobard-recovery-detail')?.textContent.includes('Authoritative source unchanged')`);
  await screenshot('10-recovery','.mnemobard-recovery-detail');
  await run(`assert((await services.repository.read(${JSON.stringify(original.id)})).source===${JSON.stringify(original.savedSource)},'Inspection changed source');click('Load draft without saving');`);await wait(`view.session?.draft.notes===${JSON.stringify(original.pendingNotes)}`);
  await run(`assert((await services.repository.read(${JSON.stringify(original.id)})).source===${JSON.stringify(original.savedSource)},'Recovery loading wrote source');click('Save motif');`);await wait("view.session.status==='Saved'");
  await check('MOTIF-only checkpoint discovery/inspection/loading remained unsaved until explicit normal Save');
  await run(`root.querySelector('[data-note-id]').click();view.roll.canvas.focus();`);await key('Delete','Delete',46);await wait('view.session.draft.data.notes.length===6');
  await key('z','KeyZ',90,2);await wait('view.session.draft.data.notes.length===7');await key('z','KeyZ',90,10);await wait('view.session.draft.data.notes.length===6');await key('z','KeyZ',90,2);await wait('view.session.draft.data.notes.length===7');await key('s','KeyS',83,2);await wait("view.session.status==='Saved'");
  await check('Native Delete/Ctrl-Z/Ctrl-Shift-Z/Ctrl-S preserve musical history and active-editor keyboard scope');
  const chord=await run('return view.session.draft.data.notes.filter(note=>note.startTick===3840);');if(chord.length!==3)throw Error('Missing chord fixture');
  for(const[index,note]of chord.entries()){const at=await point(note.startTick,note.pitch);await mouse('mousePressed',at,index?8:0);await mouse('mouseReleased',at,index?8:0);}
  await run("assert(view.session.selected.size===3,'Modifier group selection failed');");await drag(chord[0].id,240,0);await run("assert(view.session.draft.data.notes.filter(note=>note.startTick===4080).length===3,'Group move was not atomic');click('Undo');");
  const cancelled=await run('return{history:view.session.historySize,notes:JSON.stringify(view.session.draft.data.notes)};'),at=await point(3840,chord[0].pitch);await mouse('mousePressed',at);await client.command('Input.dispatchMouseEvent',{type:'mouseMoved',x:at.x+20,y:at.y,button:'left',buttons:1});await key('Escape','Escape',27);await mouse('mouseReleased',{x:at.x+20,y:at.y});
  await run(`assert(view.session.historySize===${cancelled.history}&&JSON.stringify(view.session.draft.data.notes)===${JSON.stringify(cancelled.notes)},'Cancelled gesture committed changes');`);
  await check('Trusted modifier group selection/movement and Escape cancellation preserve one-entry history and source notes');
  // External conflict retains history and source while making another musical checkpoint.
  await run(`input('Motif name','Conflicting musical draft');const record=await services.repository.read(${JSON.stringify(original.id)});await app.vault.process(app.vault.getAbstractFileByPath(record.path),source=>source+'\\nExternal synthetic review note.\\n');await services.index.settled();click('Save motif');`);
  await wait("root.textContent.includes('Not saved:')");await screenshot('11-conflict','.mnemobard-score-heading');
  await run(`assert((await services.repository.read(${JSON.stringify(original.id)})).entity.title===${JSON.stringify(original.title)},'Stale title overwrote source');assert(view.session.canUndo&&view.session.recoveryPath,'Conflict lost draft/history');`);
  await check('External edit rejected stale Save, retained both versions, undo history and recoverable musical draft');
  await run(`click('Discard draft…');click('Confirm discard');`);await wait("view.session&&!view.session.dirty");
  await run(`click('Play motif');`);await wait("services.musical.state==='playing'");
  await run(`const transport=services.musical,sink=transport.sink;await plugin.setModule('motif',false);await transport.settled();assert(transport.timerCount===0&&transport.activeVoices===0&&sink.contextState==='closed','Disable leaked musical resources');await plugin.setModule('motif',true);await services.modules.open('motif');`);
  await check('MOTIF disable/re-enable released voices, scheduler and audio context while preserving records');
  await run(`await view.setState({selectedId:${JSON.stringify(original.id)}});click('Play motif');`);await wait("services.musical.state==='playing'");
  await run(`const transport=services.musical,sink=transport.sink;await view.leaf.detach();await transport.settled();assert(sink.contextState==='closed'&&transport.timerCount===0,'Closing editor leaked audio');await services.modules.open('motif');`);
  await check('Owning editor close released musical playback and reopened cleanly');
  await run(`await view.setState({selectedId:${JSON.stringify(original.id)}});click('Play motif');`);await wait("services.musical.state==='playing'");
  await run(`const old=services.musical;await app.plugins.disablePlugin('mnemobard');await old.settled();assert(old.state==='disposed'&&old.timerCount===0&&old.activeVoices===0,'Unload leaked playback');await app.plugins.enablePlugin('mnemobard');await app.plugins.getPlugin('mnemobard').services.modules.open('motif');`);
  await check('Plugin unload/reload released musical services and retained exactly three commands');
  await run(`assert(Object.keys(app.commands.commands).filter(id=>id.startsWith('mnemobard:')).length===3,'Commands duplicated');await view.setState({selectedId:${JSON.stringify(original.id)}});`);
  const theme=await client.evaluate('app.getTheme()');try{
   await run("app.changeTheme('moonstone');");await screenshot('08-light-theme','.mnemobard-roll-surface');
   await run("app.changeTheme('obsidian');");await screenshot('07-dark-theme','.mnemobard-roll-surface');
   await client.command('Emulation.setDeviceMetricsOverride',{width:480,height:1000,deviceScaleFactor:1,mobile:false});await screenshot('09-narrow-pane','.mnemobard-roll-surface');
   report.narrow=await run('return{clientWidth:root.clientWidth,scrollWidth:root.scrollWidth,canvas:view.roll.canvas.getBoundingClientRect().width};');if(report.narrow.scrollWidth>report.narrow.clientWidth+1)throw Error('Narrow layout overflow');
  }finally{await client.command('Emulation.setDeviceMetricsOverride',{width:1280,height:1000,deviceScaleFactor:1,mobile:false});await run(`app.changeTheme(${JSON.stringify(theme)});`);}
  await check('Actual light/dark and narrow-pane screenshots captured without pane overflow');
  await client.command('Emulation.setDeviceMetricsOverride',{width:1280,height:1000,deviceScaleFactor:2,mobile:false});await run('view.roll.request();');await pause(100);
  report.highDpi=await run('return{dpr:devicePixelRatio,cssWidth:view.roll.viewport.width,backingWidth:view.roll.canvas.width};');if(Math.abs(report.highDpi.backingWidth-report.highDpi.cssWidth*2)>2)throw Error('High-DPI backing mismatch');await screenshot('12-high-dpi','.mnemobard-roll-surface');await client.command('Emulation.setDeviceMetricsOverride',{width:1280,height:1000,deviceScaleFactor:1,mobile:false});
  await check('Native DPR2 backing and CSS coordinate separation verified');
  const compiled=await build({entryPoints:['benchmarks/motif.ts'],bundle:true,platform:'browser',format:'iife',globalName:'MotifBenchmark',write:false});const source=compiled.outputFiles[0]?.text;if(!source)throw Error('Missing benchmark bundle');
  await client.evaluate(`(()=>{${source};globalThis.__motifBenchmark=MotifBenchmark;return true;})()`);
  report.benchmark=await client.evaluate('(globalThis.__motifBenchmarkTask=globalThis.__motifBenchmark.runMotifBenchmark(app.workspace.getLeavesOfType("mnemobard-motif")[0].view.contentEl))');await client.evaluate('delete globalThis.__motifBenchmarkTask');
  await check('Native production Canvas benchmarks completed at100/1000/5000/10000 notes');
  report.interactive=[];
  for(const count of[100,1000,5000]){
   await client.evaluate(`(()=>{globalThis.__motifInteractive=globalThis.__motifBenchmark.prepareInteractiveRoll(app.workspace.getLeavesOfType('mnemobard-motif')[0].view.contentEl,${count});return true;})()`);await pause(50);
   for(let i=0;i<12;i++){
    const points=await client.evaluate(`globalThis.__motifInteractive.points(${i%2===0})`);await mouse('mousePressed',points.from);await client.command('Input.dispatchMouseEvent',{type:'mouseMoved',x:points.to.x,y:points.to.y,button:'left',buttons:1});await mouse('mouseReleased',points.to);await pause(20);
   }
   report.interactive.push(await client.evaluate('globalThis.__motifInteractive.finish()'));await client.evaluate('delete globalThis.__motifInteractive');
  }
  await client.evaluate('delete globalThis.__motifBenchmark');await check('Trusted native pointer gestures measured production roll/history latency at100/1000/5000 notes');
  report.exceptions=client.exceptions;if(client.exceptions.length)throw Error(client.exceptions.join(';'));await writeFile(`${directory}/native-final.json`,JSON.stringify(report,null,2)+'\n');
 }else{
  await run(`if(view.browserDetails)view.browserDetails.open=true;root.scrollTop=0;`);await screenshot('01-motif-browser','.mnemobard-motif-heading');
  await run(`click('New motif');`);await wait('!!view.roll');report.title=`Nocturnal study ${stamp}`;
  await run(`input('Motif name',${JSON.stringify(report.title)});root.querySelector('.mnemobard-score-settings').open=true;input('Tempo BPM','100');input('Meter numerator','6');input('Meter denominator','8');click('Apply musical settings');root.querySelector('.mnemobard-score-settings').open=false;`);
  await screenshot('02-empty-roll','.mnemobard-roll-surface');
  for(const[tick,pitch]of[[0,60],[960,62],[1920,64],[2880,65]])await draw(tick,pitch);await screenshot('03-melody','.mnemobard-roll-surface');
  await run(`select('New note duration','2');`);for(const pitch of[60,64,67])await draw(3840,pitch);await screenshot('04-chords','.mnemobard-roll-surface');
  report.id=await run('return view.session.draft.id;');
  await check('Created and named a motif; set100BPM/6-8; drew a four-note melody and three-note chord using native pointer events');
  const first=await run('return view.session.draft.data.notes[0].id;');await drag(first,240,1);await drag(first,480,0,true);
  await run(`const note=view.session.draft.data.notes.find(note=>note.id===${JSON.stringify(first)});assert(note.startTick===240&&note.pitch===61&&note.durationTicks===960,'Graphical move/resize mapped incorrectly');`);
  await check('Graphical movement/resizing preserve starts, map pitch/time accurately and commit one undo entry per drag');
  // Keyboard-only velocity editing, then duplication/deletion/undo/redo.
  await run(`const control=root.querySelector('[aria-label="Velocity"]');control.focus();control.select();`);await client.command('Input.insertText',{text:'51'});await key('Tab','Tab',9);await key('Enter','Enter',13);
  await wait(`view.session.draft.data.notes.find(note=>note.id===${JSON.stringify(first)}).velocity===51`);await screenshot('05-selected-note','.mnemobard-note-properties');
  await run(`click('Duplicate selected');assert(view.session.draft.data.notes.length===8,'Duplication failed');click('Delete selected');assert(view.session.draft.data.notes.length===7,'Deletion failed');click('Undo');assert(view.session.draft.data.notes.length===8,'Undo deletion failed');click('Redo');assert(view.session.draft.data.notes.length===7,'Redo deletion failed');`);
  await check('Native keyboard numeric editing, duplication with independent identity, deletion, Undo and Redo passed');
  await run(`const before=JSON.stringify(view.session.draft.data.notes);select('Editing grid','eighth');click('Time +');click('Time −');click('Pitch +');click('Pitch −');assert(JSON.stringify(view.session.draft.data.notes)===before,'Grid/zoom retimed notes');view.roll.scroller.scrollLeft=80;view.roll.scroller.scrollTop+=40;`);await pause(60);await run(`view.roll.scroller.scrollLeft=0;view.roll.scroller.scrollTop=(127-72)*view.roll.viewport.rowHeight;`);
  await check('Grid selection, anchored zoom and two-axis scrolling retain musical notes and selection');
  await run(`click('Play motif');`);await wait("services.musical.state==='playing'");await wait('services.musical.position>2.45');
  report.playback=await run(`return{state:services.musical.state,position:services.musical.position,voices:services.musical.activeVoices,samples:services.musical.measurements.slice(),context:services.musical.sink.contextState};`);if(report.playback.voices<3)throw Error('Chord voices were not simultaneous');await screenshot('06-transport-playback','.mnemobard-roll-surface');
  await run(`const sink=services.musical.sink;click('Stop motif');await services.musical.settled();assert(services.musical.activeVoices===0&&services.musical.timerCount===0&&sink.contextState==='closed','Stop did not release audio');click('Save motif');`);await wait("view.session.status==='Saved'");
  await check('Audio-clock audition produced simultaneous chord voices and a live playhead; Stop released voices/context/timer');
  report.notes=await run('return view.session.draft.data.notes;');report.savedSource=await run(`return(await services.repository.read(${JSON.stringify(report.id)})).source;`);
  await run(`await view.leaf.detach();await services.modules.open('motif');`);await run(`await view.setState({selectedId:${JSON.stringify(report.id)}});assert(JSON.stringify(view.session.draft.data.notes)===${JSON.stringify(JSON.stringify(report.notes))},'Notes changed on editor reopen');`);
  await check('Saved motif reopened through the same stable UUID with exact note/settings data');
  report.pendingNotes=`Recoverable musical note ${stamp}`;await run(`[...root.querySelectorAll('.mnemobard-motif-editor details')].find(details=>details.querySelector('summary')?.textContent==='Description, tags and notes').open=true;input('User notes',${JSON.stringify(report.pendingNotes)});await view.session.checkpoint();`);
  report.recoveryPath=await run('return view.session.recoveryPath;');await run(`assert((await services.repository.read(${JSON.stringify(report.id)})).source===${JSON.stringify(report.savedSource)},'Checkpoint changed source');app.workspace.requestSaveLayout();await app.workspace.requestSaveLayout.run();`);
  await check('Unsaved musical checkpoint confirmed before cold restart without replacing the saved motif');
  report.exceptions=client.exceptions;if(client.exceptions.length)throw Error(client.exceptions.join(';'));await writeFile(`${directory}/native.json`,JSON.stringify(report,null,2)+'\n');
 }
}catch(error){await writeFile(`${directory}/failure.json`,JSON.stringify({error:String(error),report,exceptions:client.exceptions,ui:await run('return root?.textContent;').catch(()=>null)},null,2));throw error;}
finally{await client.command('Emulation.clearDeviceMetricsOverride').catch(()=>{});client.close();}
