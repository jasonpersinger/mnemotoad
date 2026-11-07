/** 4E: V8 sampling profile of section selection on the open benchmark composition; aggregates self time per function (use a non-minified build). */
import { writeFile } from 'node:fs/promises';
import { connect } from './obsidian-cdp.mjs';
const c = await connect(), label = process.argv[2] ?? 'cpu';
try {
  await c.command('Profiler.enable'); await c.command('Profiler.setSamplingInterval', { interval: 50 });
  await c.evaluate(`(()=>{const v=app.workspace.getLeavesOfType('mnemobard-canvas')[0].view;globalThis.__sel=()=>{const p=v.structurePanel,t=v.timeline,ids=v.session.draft.data.sections.map(x=>x.id);for(let i=0;i<60;i++){p.select('section',ids[i%ids.length]);t.draw();}};__sel();})()`);
  await c.command('Profiler.start'); const t0 = Date.now(); await c.evaluate('__sel()'); const wall = Date.now() - t0; const { profile } = await c.command('Profiler.stop');
  const dt = new Map(); profile.samples.forEach((id, i) => dt.set(id, (dt.get(id) ?? 0) + (profile.timeDeltas[i] ?? 0)));
  const byFn = new Map(), plugin = new Map(), parent = new Map(); for (const n of profile.nodes) for (const ch of n.children ?? []) parent.set(ch, n.id);
  const nodes = new Map(profile.nodes.map(n => [n.id, n]));
  for (const n of profile.nodes) { const us = dt.get(n.id) ?? 0; if (!us) continue; const f = n.callFrame, key = `${f.functionName || '(anon)'} ${f.url.split('/').at(-1)}:${f.lineNumber + 1}`; byFn.set(key, (byFn.get(key) ?? 0) + us);
    // attribute to the nearest plugin frame (main.js) for inclusive-by-plugin-function view
    let cur = n; while (cur && !cur.callFrame.url.includes('plugins%2Fmnemobard')) cur = nodes.get(parent.get(cur.id)); if (cur) { const k = `${cur.callFrame.functionName || '(anon)'}:${cur.callFrame.lineNumber + 1}`; plugin.set(k, (plugin.get(k) ?? 0) + us); } }
  const top = m => [...m].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, us]) => [k, +(us / 1000 / 60).toFixed(3)]);
  const out = { label, selections: 60, wallMs: wall, perSelectMs: +(wall / 60).toFixed(2), selfMsPerSelect: top(byFn), byNearestPluginFrameMsPerSelect: top(plugin) };
  console.log(JSON.stringify(out, null, 1)); await writeFile(`output/canvas/milestone-4e/cpu-profile-${label}.json`, JSON.stringify(out, null, 2) + '\n');
} finally { c.close(); }
