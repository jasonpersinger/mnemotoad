/** 4E: attribute main-thread time of one clean external refresh (long tasks + V8 samples by nearest plugin frame). */
import { readFile, writeFile } from 'node:fs/promises';
import { connect } from './obsidian-cdp.mjs';
const c = await connect(), label = process.argv[2] ?? 'refresh';
const ev = b => c.evaluate(`(async()=>{const s=app.plugins.getPlugin('mnemobard').services,v=app.workspace.getLeavesOfType('mnemobard-canvas')[0]?.view;${b}})()`);
try {
  await ev(`globalThis.__lt=[];globalThis.__po=new PerformanceObserver(l=>{for(const e of l.getEntries())__lt.push(Math.round(e.duration));});__po.observe({entryTypes:['longtask']});globalThis.__done=false;const ss=v.session;globalThis.__u=ss.subscribe(()=>{if(ss.freshness.state==='refreshed')__done=true;});`);
  await c.command('Profiler.enable'); await c.command('Profiler.setSamplingInterval', { interval: 100 }); await c.command('Profiler.start');
  const path = await ev('return v.session.base.path;'), file = `dev-vault/${path}`, text = await readFile(file, 'utf8');
  await writeFile(file, text.replace(/^mnemobard_notes: .*$/m, `mnemobard_notes: Refresh profile ${Date.now()}`));
  for (let k = 0; k < 100 && !(await ev('return __done;')); k++) await new Promise(r => setTimeout(r, 30));
  await new Promise(r => setTimeout(r, 600));
  const { profile } = await c.command('Profiler.stop');
  const longTasks = await ev('__po.disconnect();__u();return __lt;');
  const dt = new Map(); profile.samples.forEach((id, i) => dt.set(id, (dt.get(id) ?? 0) + (profile.timeDeltas[i] ?? 0)));
  const parent = new Map(), nodes = new Map(profile.nodes.map(n => [n.id, n])); for (const n of profile.nodes) for (const ch of n.children ?? []) parent.set(ch, n.id);
  const inclusive = new Map(), self = new Map();
  for (const n of profile.nodes) { const us = dt.get(n.id) ?? 0; if (!us || n.callFrame.functionName === '(idle)' || n.callFrame.functionName === '(program)') continue;
    const sk = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.includes('mnemobard') ? 'plugin' : n.callFrame.url.split('/').at(-1)}`; self.set(sk, (self.get(sk) ?? 0) + us);
    const seen = new Set(); let cur = n; while (cur) { if (cur.callFrame.url.includes('mnemobard')) { const k = cur.callFrame.functionName || '(anon)'; if (!seen.has(k)) { seen.add(k); inclusive.set(k, (inclusive.get(k) ?? 0) + us); } } cur = nodes.get(parent.get(cur.id)); } }
  const top = (m, n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, us]) => [k, +(us / 1000).toFixed(1)]);
  const out = { label, longTasksMs: longTasks, inclusivePluginMs: top(inclusive, 30), selfMs: top(self, 15) };
  console.log(JSON.stringify(out)); await writeFile(`output/canvas/milestone-4e/refresh-profile-${label}.json`, JSON.stringify(out, null, 2) + '\n');
} finally { c.close(); }
