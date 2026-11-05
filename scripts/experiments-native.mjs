/** Native experiment runner. The imported CDP evaluator refuses every non-disposable vault. */
import { mkdir, writeFile } from 'node:fs/promises';
import { cpus, totalmem, release, platform } from 'node:os';
import { connect, expectedVault } from './obsidian-cdp.mjs';
const c = await connect();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const report = { vault: expectedVault, hardware: { cpu: cpus()[0]?.model, logicalCpus: cpus().length, ramBytes: totalmem(), os: platform(), kernel: release() }, launch: '--disable-gpu; isolated profile; native desktop, no personal vault', checks: [] };
function assert(ok, message) { if (!ok) throw new Error(message); report.checks.push(message); }
const plugin = "app.plugins.getPlugin('mnemobard-experiments')";
const lab = `${plugin}.lab`;
try {
  await c.evaluate('app.plugins.loadManifests()');
  report.environment = await c.evaluate(`({ title:document.title, userAgent:navigator.userAgent, width:innerWidth, height:innerHeight, dpr:devicePixelRatio, defaultEnabled:app.plugins.enabledPlugins.has('mnemobard-experiments') })`);
  assert(!report.environment.defaultEnabled, 'Experimental plugin disabled by default');
  await c.evaluate(`app.plugins.enablePlugin('mnemobard-experiments')`);
  await c.evaluate(`${plugin}.open()`);
  report.offlineAudio = await c.evaluate(`${plugin}.offlineProbe()`);
  assert(JSON.stringify(report.offlineAudio.expectedFrames) === JSON.stringify(report.offlineAudio.observedFrames), 'OfflineAudioContext onsets match requested sample frames (algorithm only)');
  report.beforeAudio = await c.evaluate(`${lab}.snapshot()`);
  assert(report.beforeAudio.audio.state === 'not-created', 'No AudioContext before playback');
  // Trusted native input starts audio, rather than relying on synthetic click activation.
  const button = await c.evaluate(`(()=>{const el=[...document.querySelectorAll('button')].find(el=>el.textContent==='Play experimental tone');const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  await c.command('Input.dispatchMouseEvent', { type: 'mousePressed', ...button, button: 'left', clickCount: 1 });
  await c.command('Input.dispatchMouseEvent', { type: 'mouseReleased', ...button, button: 'left', clickCount: 1 });
  await pause(3200);
  report.playback = await c.evaluate(`${lab}.snapshot()`);
  assert(report.playback.state === 'playing' && report.playback.audio.state === 'running', 'Real AudioContext playback and repeated cycles running');
  assert(report.playback.samples.length >= 12, 'Several real scheduling cycles observed');
  await c.evaluate(`${lab}.pause()`); report.pause = await c.evaluate(`${lab}.snapshot()`);
  assert(report.pause.state === 'paused' && report.pause.voices === 0 && report.pause.timerCount === 0, 'Pause cancels voices and timer');
  assert(await c.evaluate(`${lab}.resume()`), 'Resume succeeds');
  await pause(100);
  await c.evaluate(`${lab}.stop()`);
  const cycleResult = await c.evaluate(`(async()=>{for(let i=0;i<50;i++){await ${lab}.play();${lab}.stop();}return ${lab}.snapshot();})()`);
  report.startStop = cycleResult;
  assert(cycleResult.voices === 0 && cycleResult.timerCount === 0 && cycleResult.created === cycleResult.released, '50 real start/stop cycles release every created voice and timer');
  await c.evaluate(`${lab}.play()`);
  await c.evaluate(`(()=>{const until=performance.now()+250;while(performance.now()<until){}return true;})()`);
  await pause(75); report.stall = await c.evaluate(`${lab}.snapshot()`);
  assert(report.stall.state === 'stopped' && /stalled/.test(report.stall.diagnostic), '250 ms main-thread stall stops transport without late burst');
  await c.evaluate(`${lab}.play()`);
  await c.evaluate(`window.dispatchEvent(new Event('blur'))`);
  report.blur = await c.evaluate(`${lab}.snapshot()`);
  assert(report.blur.state === 'stopped' && report.blur.voices === 0, 'Window blur policy cancels playback (synthetic event)');

  // Native pointer selection/drag feedback; timestamps cover dispatch-to-handler/layout, not physical display latency.
  const point = await c.evaluate(`(()=>{const surface=document.querySelector('[aria-label^="Experimental musical grid"]');surface.scrollIntoView();const r=surface.getBoundingClientRect(),note=${lab}.probe.rectangles.find(note=>note.x>=0&&note.y>=0);return {x:r.x+note.x+note.width/2,y:r.y+note.y+3};})()`);
  for (let i = 0; i < 20; i++) {
    await c.command('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
    await c.command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x + 10, y: point.y, button: 'left', buttons: 1 });
    await c.command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x + 10, y: point.y, button: 'left', clickCount: 1 });
  }
  await c.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  await c.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  report.input = await c.evaluate(`${lab}.snapshot()`);
  await mkdir('output/experiments', { recursive: true });
  const screenshot = await c.command('Page.captureScreenshot', { format: 'png' });
  await writeFile('output/experiments/native.png', Buffer.from(screenshot.data, 'base64'));

  await c.evaluate(`${plugin}.beginBenchmark()`);
  const deadline = Date.now() + 600000;
  while (true) {
    await pause(1000);
    const status = await c.evaluate(`({running:${plugin}.benchmarkRunning,error:${plugin}.benchmarkError,progress:${plugin}.progress,count:${plugin}.results.length})`);
    console.log(status.progress);
    report.rendering = await c.evaluate(`${plugin}.results`);
    await writeFile('output/experiments/native-partial.json', JSON.stringify(report, null, 2) + '\n');
    if (status.error) throw new Error(status.error);
    if (!status.running) break;
    if (Date.now() > deadline) throw new Error('Benchmark timeout');
  }
  report.rendering = await c.evaluate(`${plugin}.results`);
  assert(report.rendering.length === 21, '21 bounded rendering cases completed in native Obsidian');
  await c.command('HeapProfiler.collectGarbage');
  report.heapBeforeReopen = await c.evaluate(`performance.memory.usedJSHeapSize`);
  report.viewCycles = await c.evaluate(`(async()=>{const closed=[];for(let i=0;i<20;i++){await ${plugin}.open();const view=${lab};await view.play();app.workspace.getLeavesOfType('mnemobard-feasibility-lab')[0].detach();await view.shutdown();const s=view.snapshot();if(s.state!=='disposed'||s.timerCount||s.voices||s.audio.state!=='closed')throw new Error('View resource leak');closed.push({state:s.state,voices:s.voices,timers:s.timerCount,audio:s.audio.state});}await ${plugin}.open();return closed;})()`);
  await c.command('HeapProfiler.collectGarbage');
  report.heapAfterReopen = await c.evaluate(`performance.memory.usedJSHeapSize`);
  assert(report.viewCycles.length === 20, '20 native play/view-close cycles close contexts and release resources');

  // Verify animation-frame cancellation when a benchmark view closes mid-run.
  await c.evaluate(`${plugin}.beginBenchmark()`); await pause(50);
  await c.evaluate(`app.workspace.getLeavesOfType('mnemobard-feasibility-lab')[0].detach()`); await pause(100);
  report.cancelledBenchmark = await c.evaluate(`({running:${plugin}.benchmarkRunning,error:${plugin}.benchmarkError})`);
  assert(!report.cancelledBenchmark.running && !!report.cancelledBenchmark.error, 'Closing benchmark view cancels pending animation frame/work');
  await c.evaluate(`${plugin}.open()`); await c.evaluate(`${lab}.play()`);
  report.unload = await c.evaluate(`(async()=>{const old=${lab},ownedLeaf=app.workspace.getLeavesOfType('mnemobard-feasibility-lab')[0];await app.plugins.disablePlugin('mnemobard-experiments');await old.shutdown();const result={snapshot:old.snapshot(),commandRemaining:!!app.commands.commands['mnemobard-experiments:open']};ownedLeaf?.detach();return result;})()`);
  assert(report.unload.snapshot.state === 'disposed' && report.unload.snapshot.voices === 0 && report.unload.snapshot.timerCount === 0 && report.unload.snapshot.audio.state === 'closed' && !report.unload.commandRemaining, 'Experimental plugin unload closes audio and removes command');
  report.exceptions = c.exceptions;
  assert(c.exceptions.length === 0, 'No observed renderer exceptions in native experiment workload');
  await mkdir('output/experiments', { recursive: true });
  await writeFile('output/experiments/native.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ checks: report.checks, environment: report.environment, cases: report.rendering.length }, null, 2));
} finally {
  try { await c.evaluate(`app.plugins.disablePlugin('mnemobard-experiments')`); } finally { c.close(); }
}
