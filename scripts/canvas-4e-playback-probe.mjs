/** 4E evidence: does a clean, metadata-only external refresh interrupt playback? All trials are recorded (disposable vault only). */
import { readFile, writeFile } from 'node:fs/promises';
import { connect } from './obsidian-cdp.mjs';
const c = await connect(), id = JSON.parse(await readFile('output/canvas/milestone-4c/native.json', 'utf8')).compositionId, trials = [];
const ev = b => c.evaluate(`(async()=>{const s=app.plugins.getPlugin('mnemobard').services,v=app.workspace.getLeavesOfType('mnemobard-canvas')[0]?.view,p=v?.performancePanel?.preparation;${b}})()`);
try {
  await ev(`await s.modules.open('canvas');const w=app.workspace.getLeavesOfType('mnemobard-canvas')[0].view;await w.setState({selectedId:${JSON.stringify(id)}});`);
  for (let i = 0; i < 3; i++) {
    await ev(`if(p.state!=='ready')await p.prepare();globalThis.__t={};const ss=v.session,m=s.musical,orig=m.stop;globalThis.__stops=[];m.stop=function(...a){__stops.push(((new Error().stack??'').includes('pump')?'transport-pump':'other')+' · '+(m.diagnostic??''));return orig.apply(this,a);};globalThis.__restore=()=>{m.stop=orig;};globalThis.__u=ss.subscribe(()=>{if(ss.freshness.state==='refreshed'&&!__t.at)__t.at={musical:m.state,prep:p.state,t:performance.now()};});const btn=t=>[...v.contentEl.querySelectorAll('button')].find(b=>b.textContent===t);btn('Return to start').click();await new Promise(r=>setTimeout(r,50));__t.tick0=v.performancePanel.currentTick;btn('Play arrangement').click();for(let k=0;k<100&&m.state!=='playing';k++)await new Promise(r=>setTimeout(r,10));__t.start=performance.now();`);
    const path = await ev('return v.session.base.path;'); if (!path.startsWith('MNEMOBARD/')) throw Error('path');
    const file = `dev-vault/${path}`, text = await readFile(file, 'utf8'); await writeFile(file, text.replace(/^mnemobard_notes: .*$/m, `mnemobard_notes: Playback probe ${Date.now()}`));
    for (let k = 0; k < 100 && !(await ev('return !!__t.at;')); k++) await new Promise(r => setTimeout(r, 30));
    await new Promise(r => setTimeout(r, 300));
    trials.push(await ev(`__u();__restore();const r={playheadAtPlay:__t.tick0,stateAtRefresh:__t.at?.musical,prepAtRefresh:__t.at?.prep,msFromPlayToRefresh:__t.at?Math.round(__t.at.t-__t.start):null,prepAfter:p.state,baseAdopted:p.prepared?.baseSource===v.session.base.source,stops:__stops,diagnostic:s.musical.diagnostic??null};s.musical.stop();return r;`));
    await new Promise(r => setTimeout(r, 300));
  }
  const out = { note: 'Clean session, metadata-only external edit written while the arrangement plays (~2.6 s of notes). Every trial is recorded. Playhead returned to the start before each Play (an earlier run started from the end of the notes, so the transport ended immediately).', trials };
  console.log(JSON.stringify(out, null, 1)); await writeFile('output/canvas/milestone-4e/playback-during-external-refresh.json', JSON.stringify(out, null, 2) + '\n');
} finally { c.close(); }
