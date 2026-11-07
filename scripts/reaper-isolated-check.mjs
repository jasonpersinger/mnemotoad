/**
 * Milestone 4G §7: import an exported arrangement MIDI file into REAPER running with an ISOLATED, disposable configuration.
 *
 * Isolation (documented in the installed binary's own usage text, `strings /usr/lib/REAPER/reaper`):
 *   -cfgfile file.ini : "use full path for alternate resource directory"   → resource dir = <output>/isolated-config
 *   -newinst          : "override preference for new instance checking"   → never hands the file to another REAPER
 * Guards: refuses if any REAPER process is running, if the config path is outside this repository's output/ folder, or if the
 * MIDI file is not a dev-vault export. Takes a metadata-only digest (names, sizes, mtimes — never contents) of ~/.config/REAPER
 * before and after, and fails if it changed. The REAPER project is never saved; the isolated process is terminated at the end.
 *
 * Usage: node scripts/reaper-isolated-check.mjs <dev-vault relative .mid path> [--expand] [--label name]
 *   --expand: in REAPER's "MIDI File Import" dialog explicitly tick "Expand N MIDI tracks to new REAPER tracks" and
 *             "Import MIDI tempo map" (both unticked by REAPER's defaults, which merge everything onto one track).
 */
import { mkdir, writeFile, readFile, rm, access } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { resolve, relative } from 'node:path';

const midiArg = process.argv[2]; if (!midiArg?.startsWith('MNEMOBARD/Exports/') || !midiArg.endsWith('.mid')) throw Error('Pass a dev-vault MNEMOBARD/Exports/*.mid path');
const expand = process.argv.includes('--expand'), label = process.argv[process.argv.indexOf('--label') + 1] ?? (expand ? 'expanded' : 'defaults');
const repo = resolve('.'), out = resolve('output/mnemobard/milestone-4g/reaper', process.argv.includes('--label') ? label : ''), iso = resolve(out, 'isolated-config'), midi = resolve('dev-vault', midiArg);
if (relative(resolve(repo, 'output'), iso).startsWith('..') || iso.startsWith(resolve(homedir(), '.config'))) throw Error('Isolated config must stay inside this repository output/');
const pause = ms => new Promise(r => setTimeout(r, ms));
const sh = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8' });
const reaperRunning = () => sh('pgrep', ['-x', 'reaper']).stdout.trim();
const configDigest = () => sh('bash', ['-c', `find "${homedir()}/.config/REAPER" -printf '%P %s %T@\\n' 2>/dev/null | sort | sha256sum`]).stdout.split(' ')[0];
const env = { ...process.env, DISPLAY: ':1', GDK_BACKEND: 'x11' }; delete env.WAYLAND_DISPLAY;
env.XAUTHORITY = sh('bash', ['-c', 'ls /run/user/$(id -u)/xauth_* | head -1']).stdout.trim();

if (reaperRunning()) throw Error('A REAPER process is already running; refusing (it could be the personal instance).');
await rm(iso, { recursive: true, force: true }); await mkdir(iso, { recursive: true }); await mkdir(out, { recursive: true });
await writeFile(resolve(iso, 'reaper.ini'), '[REAPER]\n'); // empty isolated configuration; REAPER fills in its own defaults
const evidence = { label, expand, midi: midiArg, sha256: sh('sha256sum', [midi]).stdout.split(' ')[0], reaper: sh('pacman', ['-Q', 'reaper']).stdout.trim(), isolatedConfig: relative(repo, iso), command: '', personalConfigDigestBefore: configDigest(), stages: [] };
const signal = name => resolve(iso, name);
const lua = `-- MNEMOBARD 4G isolated import probe (read-only towards MNEMOBARD; never saves the REAPER project)
local base = ${JSON.stringify(iso + '/')}
local function esc(s) return (tostring(s):gsub('\\\\','\\\\\\\\'):gsub('"','\\\\"')) end
local function exists(p) local f = io.open(p, 'r'); if f then f:close() return true end return false end
local function write(p, s) local f = io.open(p, 'w'); f:write(s); f:close() end
local log = {}
local function note(s) log[#log+1] = '"' .. esc(s) .. '"' end
local _, midiimport = reaper.get_config_var_string('midiimport')
note('midiimport=' .. tostring(midiimport))
-- Insert the file at 0:00 on a new track (InsertMedia mode 1). REAPER's own MIDI import handling and any dialog it shows
-- (captured by the harness) decide how tracks/tempo are imported; nothing is pre-configured.
local function collect()
  local parts = {}
  parts[#parts+1] = '"projectLengthSeconds":' .. reaper.GetProjectLength(0)
  local markers = {}
  for i = 0, reaper.CountTempoTimeSigMarkers(0) - 1 do
    local _, time, measure, beat, bpm, num, den, linear = reaper.GetTempoTimeSigMarker(0, i)
    markers[#markers+1] = string.format('{"time":%.9f,"measure":%d,"beat":%.6f,"bpm":%.6f,"num":%d,"den":%d}', time, measure, beat, bpm, num, den)
  end
  parts[#parts+1] = '"tempoMarkers":[' .. table.concat(markers, ',') .. ']'
  local tnum, tden, ttempo = reaper.TimeMap_GetTimeSigAtTime(0, 0)
  parts[#parts+1] = string.format('"timeSigAtZero":{"num":%d,"den":%d,"bpm":%.6f}', tnum, tden, ttempo)
  local tracks = {}
  for t = 0, reaper.CountTracks(0) - 1 do
    local track = reaper.GetTrack(0, t); local _, name = reaper.GetTrackName(track)
    local items = {}
    for i = 0, reaper.CountTrackMediaItems(track) - 1 do
      local item = reaper.GetTrackMediaItem(track, i); local take = reaper.GetActiveTake(item)
      local pos, len = reaper.GetMediaItemInfo_Value(item, 'D_POSITION'), reaper.GetMediaItemInfo_Value(item, 'D_LENGTH')
      local notes, channels = {}, {}
      if take and reaper.TakeIsMIDI(take) then
        local _, count = reaper.MIDI_CountEvts(take)
        for n = 0, count - 1 do
          local _, _, _, s, e, ch, pitch, vel = reaper.MIDI_GetNote(take, n)
          local qs, qe = reaper.MIDI_GetProjQNFromPPQPos(take, s), reaper.MIDI_GetProjQNFromPPQPos(take, e)
          notes[#notes+1] = string.format('[%.6f,%.6f,%d,%d,%d]', qs, qe, ch, pitch, vel)
        end
      end
      local startQN, endQN = reaper.TimeMap2_timeToQN(0, pos), reaper.TimeMap2_timeToQN(0, pos + len)
      items[#items+1] = string.format('{"position":%.9f,"length":%.9f,"startQN":%.6f,"endQN":%.6f,"notes":[%s]}', pos, len, startQN, endQN, table.concat(notes, ','))
    end
    tracks[#tracks+1] = '{"name":"' .. esc(name) .. '","items":[' .. table.concat(items, ',') .. ']}'
  end
  parts[#parts+1] = '"tracks":[' .. table.concat(tracks, ',') .. ']'
  return '{' .. table.concat(parts, ',') .. ',"log":[' .. table.concat(log, ',') .. ']}'
end
local stage = 0
local function step()
  if stage == 0 then
    reaper.SetEditCurPos(0, false, false)
    write(base .. 'inserting', '')
    local ok = reaper.InsertMedia(${JSON.stringify(midi)}, 1)
    note('InsertMedia returned ' .. tostring(ok))
    write(base .. 'result.json', collect())
    write(base .. 'stage1.ready', 'tracks'); stage = 1
  elseif stage == 1 and exists(base .. 'stage1.done') then
    -- Open the first item of the first note track in the built-in MIDI editor (action names logged for verification).
    reaper.Main_OnCommand(40289, 0) -- unselect all items
    local track = reaper.GetTrack(0, 1); local item = track and reaper.GetTrackMediaItem(track, 0)
    if item then reaper.SetMediaItemSelected(item, true) end
    reaper.Main_OnCommand(40153, 0)
    local function name(cmd) local ok, text = pcall(reaper.kbd_getTextFromCmd, cmd, nil); return ok and tostring(text) or ('unavailable: ' .. tostring(text)) end
    write(base .. 'actions.txt', '40289=' .. name(40289) .. '\\n40153=' .. name(40153) .. '\\n41046=' .. name(41046) .. '\\n')
    write(base .. 'stage2.ready', 'editor'); stage = 2
  elseif stage == 2 and exists(base .. 'stage2.done') then
    local editor = reaper.MIDIEditor_GetActive(); if editor then reaper.MIDIEditor_OnCommand(editor, 2) end
    reaper.Main_OnCommand(41046, 0) -- show master tempo envelope
    reaper.UpdateArrange()
    write(base .. 'stage3.ready', 'tempo'); stage = 3
  elseif stage == 3 then return end
  reaper.defer(step)
end
reaper.defer(step)
`;
await writeFile(resolve(iso, 'mnemobard-import.lua'), lua);
const args = ['-newinst', '-nosplash', '-cfgfile', resolve(iso, 'reaper.ini'), resolve(iso, 'mnemobard-import.lua')];
evidence.command = `reaper ${args.map(a => a.replace(repo + '/', '')).join(' ')}`;
const child = spawn('/usr/bin/reaper', args, { env, stdio: ['ignore', 'pipe', 'pipe'], detached: false });
let stderr = ''; child.stdout.on('data', d => { stderr += d; }); child.stderr.on('data', d => { stderr += d; });
/** REAPER's X11 windows on :1 via scripts/x11-window-tool.py (ctypes/libX11; never the whole desktop). */
const tool = (...args) => { const r = sh('python3', ['-I', resolve(repo, 'scripts/x11-window-tool.py'), ...args]); if (r.status !== 0) throw Error('x11 tool: ' + r.stderr); return JSON.parse(r.stdout); };
const reaperWindows = () => tool('list').filter(w => w.viewable && w.width > 40 && w.height > 40 && !/Obsidian/.test(w.name) && (w.pid === child.pid || /REAPER/i.test(w.name) || w.pid === null));
const isMain = w => /REAPER v\d/.test(w.name);
const shot = async (name, which) => { const list = reaperWindows(), target = which ?? list.find(isMain) ?? list[0]; if (!target) { evidence.stages.push({ name, captured: false, reason: 'no REAPER window' }); return; } const r = tool('shot', String(target.id), resolve(out, name)); evidence.stages.push({ name, window: target.name, size: [r.width, r.height], captured: true }); };
const waitFor = async (file, ms) => { for (let t = 0; t < ms; t += 250) { try { await access(signal(file)); return true; } catch { /* not yet */ } if (child.exitCode !== null) return false; await pause(250); } return false; };
try {
  // Any REAPER dialog that is not the main window (first run, evaluation reminder, MIDI import options) is captured as evidence,
  // then accepted with Enter (its default button). Nothing is pre-configured; the defaults are what is recorded.
  for (let t = 0; t < 80 && !(await waitFor('stage1.ready', 500)); t++) {
    const list = reaperWindows();
    if (t % 4 === 3) evidence.stages.push({ waiting: list.map(w => w.name) });
    const dialog = list.find(w => !isMain(w));
    if (dialog && t > 3) {
      const name = dialog.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 40); await pause(800); await shot(`reaper-dialog-${t}-${name}.png`, dialog);
      if (expand && dialog.name === 'MIDI File Import') {
        // Keyboard (XTest pointer clicks do not reach this dialog under Xwayland): focus starts on the first checkbox
        // "Expand N MIDI tracks…"; Space ticks it, Tab moves to "Import MIDI tempo map…", Space ticks it. Verified by the screenshot.
        tool('key', String(dialog.id), 'space', 'Tab', 'space'); await pause(500);
        await shot(`reaper-dialog-${t}-${name}-options-chosen.png`, dialog); evidence.stages.push({ dialog: dialog.name, chosen: ['Expand MIDI tracks to new REAPER tracks', 'Import MIDI tempo map to project tempo map'] });
      } else evidence.stages.push({ dialog: dialog.name, accepted: 'Return (default button)' });
      tool('key', String(dialog.id), 'Return'); await pause(800);
    }
  }
  if (!(await waitFor('stage1.ready', 2000))) throw Error('REAPER did not run the import script (see evidence.stages and stderr).');
  await pause(1500); await shot('17-reaper-import-tracks.png'); await writeFile(signal('stage1.done'), '');
  if (await waitFor('stage2.ready', 20000)) { await pause(1500); const list = reaperWindows(); evidence.stages.push({ editorWindows: list.map(w => w.name) }); await shot('18-reaper-midi-editor.png', list.find(w => !isMain(w) && /MIDI|take/i.test(w.name))); await writeFile(signal('stage2.done'), ''); }
  if (await waitFor('stage3.ready', 20000)) { await pause(1500); await shot('19-reaper-tempo-meter.png'); }
  evidence.result = JSON.parse(await readFile(signal('result.json'), 'utf8'));
  try { evidence.actions = await readFile(signal('actions.txt'), 'utf8'); } catch { /* optional */ }
} finally {
  if (child.exitCode === null) { child.kill('SIGTERM'); await pause(1500); if (child.exitCode === null) child.kill('SIGKILL'); }
  evidence.stderr = stderr.slice(0, 2000);
  evidence.personalConfigDigestAfter = configDigest(); evidence.personalConfigUnchanged = evidence.personalConfigDigestBefore === evidence.personalConfigDigestAfter;
  await writeFile(resolve(out, 'reaper-evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify({ ...evidence, result: evidence.result ? { tracks: evidence.result.tracks.map(t => [t.name, t.items.length, t.items.reduce((n, i) => n + i.notes.length, 0)]), tempo: evidence.result.tempoMarkers, timeSig: evidence.result.timeSigAtZero, log: evidence.result.log } : undefined }, null, 1).slice(0, 3000));
  if (!evidence.personalConfigUnchanged) { console.error('PERSONAL REAPER CONFIG METADATA CHANGED'); process.exitCode = 1; }
}
