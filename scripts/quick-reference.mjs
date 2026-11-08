/**
 * Builds the MNEMOTOAD dark-mode quick reference (one landscape Letter page) from local sources:
 * docs/quick-reference/quick-reference.html, MNEMOTOAD-quick-reference.pdf and .png. The mascot is drawn as vector pixels
 * from assets/mascot/mascot.json (crisp at any zoom). Rendering uses the Electron runtime (scripts/quick-reference/render.cjs: hidden window, printToPDF + capturePage); no network.
 * Needs an X display (e.g. env -u WAYLAND_DISPLAY DISPLAY=:1 XAUTHORITY=…).
 * Usage: node scripts/quick-reference.mjs
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const out = resolve('docs/quick-reference'), mascot = JSON.parse(await readFile('assets/mascot/mascot.json', 'utf8'));
const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
const paths = new Map();
mascot.rows.forEach((row, y) => [...row].forEach((k, x) => { if (k !== mascot.transparent) paths.set(k, `${paths.get(k) ?? ''}M${x} ${y}h1v1h-1z`); }));
const svg = `<svg class="toad" viewBox="0 3 24 19" role="img" aria-label="MNEMOTOAD mascot, The Curmudgeon" shape-rendering="crispEdges">${[...paths].map(([k, d]) => `<path fill="${mascot.palette[k]}" d="${d}"/>`).join('')}</svg>`;
const key = s => s.split('+').map(k => `<kbd>${k}</kbd>`).join('<i>+</i>');
const row = (keys, text) => `<li><span class="keys">${keys}</span><span>${text}</span></li>`;
const mod = 'Ctrl/⌘';

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>MNEMOTOAD quick reference</title><style>
@page { size: 11in 8.5in; margin: 0; }
:root { --black:#070707; --umber:#28231c; --green:#317b22; --violet:#801a86; --yellow:#f4e409; --text:#ece6d8; --muted:#b4aa97; --line:#4a4033; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 11in; height: 8.5in; overflow: hidden; background: var(--umber); color: var(--text); font: 10.2pt/1.38 "Fira Sans Condensed", "Fira Sans", sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { padding: .4in .5in .32in; display: grid; grid-template-rows: auto auto 1fr auto; gap: .22in; }
::-webkit-scrollbar { display: none; }
header { display: grid; grid-template-columns: auto 1fr auto; align-items: end; gap: .28in; }
.toad { width: 1.35in; height: auto; display: block; }
h1 { font: 900 60pt/.82 "Fira Sans Compressed", sans-serif; letter-spacing: .01em; color: var(--text); }
.tag { margin-top: .06in; font: italic 400 13.5pt/1.2 "Fira Sans Condensed", sans-serif; color: var(--muted); }
.meta { text-align: right; font-size: 9pt; color: var(--muted); line-height: 1.5; }
.meta b { color: var(--text); font-weight: 600; }
.meta code { font: 8.5pt "Hack", monospace; color: var(--text); }
.flow { display: grid; grid-template-columns: repeat(4, 1fr); background: var(--black); border-top: 3px solid var(--violet); }
.flow li { list-style: none; padding: .1in .14in .12in; position: relative; }
.flow li + li { border-left: 1px solid var(--line); }
.flow .n { font: 900 24pt/1 "Fira Sans Compressed", sans-serif; color: var(--violet); float: left; margin: 0 .1in 0 0; }
.flow h2 { font: 700 12.5pt/1.15 "Fira Sans Condensed", sans-serif; }
.flow p { font-size: 9.6pt; color: var(--muted); margin-top: .03in; }
.flow p b, .cols b { color: var(--text); font-weight: 600; }
.cols { display: grid; grid-template-columns: 1fr 1fr 1.1fr; gap: .3in; min-height: 0; }
h3 { font: 800 16pt/1 "Fira Sans Compressed", sans-serif; letter-spacing: .015em; padding-bottom: .05in; margin-bottom: .08in; border-bottom: 1px solid var(--line); }
h3 small { font: 400 8.5pt "Fira Sans Condensed", sans-serif; color: var(--muted); letter-spacing: 0; margin-left: .05in; }
ul.k { list-style: none; display: grid; gap: .072in; }
ul.k li { display: grid; grid-template-columns: 1.42in 1fr; align-items: center; gap: .1in; font-size: 9.9pt; }
.keys { display: flex; flex-wrap: nowrap; align-items: center; gap: 2px; }
.keys i { font-style: normal; color: var(--muted); font-size: 8pt; margin: 0 1px; }
.keys em { font-style: normal; color: var(--muted); font-size: 8.5pt; }
kbd { font: 700 8pt/1 "Hack", monospace; color: var(--black); background: var(--yellow); padding: 3px 5px 4px; min-width: 15px; text-align: center; display: inline-block;
  clip-path: polygon(0 2px, 2px 2px, 2px 0, calc(100% - 2px) 0, calc(100% - 2px) 2px, 100% 2px, 100% calc(100% - 2px), calc(100% - 2px) calc(100% - 2px), calc(100% - 2px) 100%, 2px 100%, 2px calc(100% - 2px), 0 calc(100% - 2px));
  box-shadow: inset 0 -2px 0 rgba(7,7,7,.35); }
.gesture { font: 600 9.4pt "Fira Sans Condensed", sans-serif; color: var(--text); }
.note { font-size: 9pt; line-height: 1.35; color: var(--muted); margin-top: .14in; }
dl { display: grid; gap: .09in; }
dt { font-weight: 700; font-size: 10.2pt; }
dd { font-size: 9.5pt; color: var(--muted); line-height: 1.35; }
footer { display: flex; justify-content: space-between; font-size: 8.8pt; color: var(--muted); border-top: 1px solid var(--line); padding-top: .07in; }
</style></head><body>
<header>
  ${svg}
  <div><h1>MNEMOTOAD</h1><p class="tag">Remember what you’ve yet to compose.</p></div>
  <div class="meta"><b>Quick reference</b>, version ${manifest.version}<br>Open from the command palette:<br><code>MNEMOTOAD: Open PATCHBOOK</code><br><code>MNEMOTOAD: Open MOTIF</code><br><code>MNEMOTOAD: Open CANVAS</code></div>
</header>
<ol class="flow">
  <li><span class="n">1</span><h2>Keep the sound</h2><p><b>PATCHBOOK</b>: Instruments, then <b>New record</b> and <b>Save record</b>. Add a patch and choose its instrument.</p></li>
  <li><span class="n">2</span><h2>Write the phrase</h2><p><b>MOTIF</b>: <b>New motif</b>. Link a patch under <b>PATCHBOOK context</b>, draw notes, <b>Play motif</b>, <b>Save motif</b>.</p></li>
  <li><span class="n">3</span><h2>Arrange the piece</h2><p><b>CANVAS</b>: <b>New composition</b>, <b>Add lane</b>, <b>Place motif</b> with repetitions, then <b>Compile</b> and <b>Play arrangement</b>.</p></li>
  <li><span class="n">4</span><h2>Take it to your DAW</h2><p><b>Export MIDI</b> from MOTIF or <b>Export arrangement MIDI</b> from CANVAS. Each export is a new file in your vault.</p></li>
</ol>
<section class="cols">
  <div><h3>MOTIF<small>with the editor focused</small></h3><ul class="k">
    ${row('<span class="gesture">Click empty grid</span>', 'Draw a note')}
    ${row('<span class="gesture">Drag note / right edge</span>', 'Move / resize')}
    ${row(`<kbd>Shift</kbd><i></i><span class="gesture">click</span>`, 'Add to the selection')}
    ${row(`<kbd>Shift</kbd><i></i><span class="gesture">wheel</span>`, 'Scroll through time')}
    ${row(`<kbd>Ctrl</kbd><i></i><span class="gesture">wheel</span>`, 'Zoom')}
    ${row(`<kbd>←</kbd><kbd>→</kbd>`, 'Nudge one grid step')}
    ${row(`<kbd>↑</kbd><kbd>↓</kbd>`, 'Nudge one semitone')}
    ${row(key(`${mod}+A`), 'Select every note')}
    ${row(`<kbd>Delete</kbd>`, 'Remove selected notes')}
    ${row(`<kbd>Esc</kbd>`, 'Clear the selection')}
    ${row(key(`${mod}+Z`), 'Undo')}
    ${row(key(`${mod}+Y`), `Redo (or ${mod} Shift Z)`)}
    ${row(key(`${mod}+S`), 'Save motif')}
  </ul><p class="note">Nudging works with the roll focused; elsewhere in the editor the arrow keys step between notes. The note inspector edits position, pitch, duration and velocity exactly.</p></div>
  <div><h3>CANVAS<small>timeline or clip focused</small></h3><ul class="k">
    ${row(`<kbd>←</kbd><kbd>→</kbd>`, 'Move one grid step')}
    ${row(key(`${mod}+D`), 'Duplicate the clip')}
    ${row(`<kbd>Delete</kbd>`, 'Delete the clip')}
    ${row(`<kbd>[</kbd><kbd>]</kbd>`, 'Previous / next section')}
    ${row(`<kbd>,</kbd><kbd>.</kbd>`, 'Previous / next marker')}
    ${row(`<kbd>Esc</kbd>`, 'Clear the selection')}
    ${row(key(`${mod}+Z`), 'Undo')}
    ${row(key(`${mod}+Y`), `Redo (or ${mod} Shift Z)`)}
    ${row(key(`${mod}+S`), 'Save composition')}
  </ul><p class="note">Select a clip to set its exact bar:beat:tick position, repetitions and lane. Sections and markers organise the timeline; they never change the MIDI.</p></div>
  <div><h3>Good to know</h3><dl>
    <dt>Source review required</dt><dd>A saved motif changed. Choose <b>Review changed sources</b>, acknowledge, then compile again. Arrangements never change silently.</dd>
    <dt>Saving is protected</dt><dd>If a note changed elsewhere, Save is blocked and your edits stay open. In PATCHBOOK, ${key(`${mod}+S`)} saves the record you are editing.</dd>
    <dt>Recovery register</dt><dd>Drafts and pre-save backups live in <b>MNEMOBARD/Recovery</b>. Inspecting writes nothing; loading asks first and saves nothing.</dd>
    <dt>MIDI</dt><dd>Notes with one tempo and meter. Compositions use 960 PPQ. Imports up to 2 MiB. In REAPER, tick <b>Expand MIDI tracks</b> and <b>Import MIDI tempo map</b>.</dd>
    <dt>Audition</dt><dd>Plain sine tones for checking ideas. No plugins are hosted and no audio is rendered.</dd>
  </dl></div>
</section>
<footer><span>Records are Markdown notes in your vault, under <b>MNEMOBARD/</b>.</span><span>MNEMOTOAD ${manifest.version} by ${manifest.author}, MIT License. Plugin ID <b>mnemobard</b>.</span></footer>
</body></html>`;

await mkdir(out, { recursive: true });
const htmlPath = join(out, 'quick-reference.html'); await writeFile(htmlPath, html);
const r = spawnSync('/usr/lib/electron43/electron', ['--ozone-platform=x11', resolve('scripts/quick-reference/render.cjs'), htmlPath, join(out, 'MNEMOTOAD-quick-reference.pdf'), join(out, 'MNEMOTOAD-quick-reference.png')], { encoding: 'utf8', timeout: 90000 });
if (r.status !== 0) throw Error(`Electron render failed: ${r.stderr}`);
console.log('Wrote docs/quick-reference/{quick-reference.html, MNEMOTOAD-quick-reference.pdf, MNEMOTOAD-quick-reference.png}');
