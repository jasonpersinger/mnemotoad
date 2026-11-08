/**
 * MNEMOTOAD release candidate: install/upgrade evidence for a marked disposable vault (MNEMOTOAD_DEV_VAULT selects it;
 * default dev-vault). Read-only except `state --reload`, which reloads the Obsidian window to capture startup console.
 *   node scripts/mnemotoad-rc-upgrade.mjs fs <label>               fingerprint every file under MNEMOBARD/ + plugin data.json (no Obsidian needed)
 *   node scripts/mnemotoad-rc-upgrade.mjs state <label> [--reload]  live plugin state over CDP (+ startup console when reloading)
 *   node scripts/mnemotoad-rc-upgrade.mjs compare <labelA> <labelB> files added/removed/changed between two fs fingerprints
 * Output: output/release-candidate/native/<vault>-<label>-{fs,state}.json
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { devVaultName } from './dev-target.mjs';

const [phase, label, extra] = process.argv.slice(2), dir = 'output/release-candidate/native', vault = devVaultName;
await mkdir(dir, { recursive: true });
const out = (kind, l = label) => `${dir}/${vault}-${l}-${kind}.json`;
const sha = buffer => createHash('sha256').update(buffer).digest('hex');

if (phase === 'fs') {
  const files = {};
  async function walk(path) { let names = []; try { names = await readdir(join(vault, path), { withFileTypes: true }); } catch { return; } for (const e of names) { const p = `${path}/${e.name}`; if (e.isDirectory()) await walk(p); else files[p] = sha(await readFile(join(vault, p))); } }
  await walk('MNEMOBARD');
  let data = null; try { data = await readFile(join(vault, '.obsidian/plugins/mnemobard/data.json'), 'utf8'); } catch { /* fresh vault */ }
  let manifest = null; try { manifest = JSON.parse(await readFile(join(vault, '.obsidian/plugins/mnemobard/manifest.json'), 'utf8')); } catch { /* not installed */ }
  const byFolder = {}; for (const p of Object.keys(files)) { const top = p.split('/')[1] ?? '(root)'; byFolder[top] = (byFolder[top] ?? 0) + 1; }
  const report = { vault, label, at: new Date().toISOString(), installed: manifest && { id: manifest.id, name: manifest.name, version: manifest.version }, dataJson: data, dataJsonSha: data && sha(data), files: Object.keys(files).length, byFolder, digest: sha(JSON.stringify(Object.entries(files).sort())), hashes: files };
  await writeFile(out('fs'), JSON.stringify(report, null, 1) + '\n');
  console.log(JSON.stringify({ ...report, hashes: undefined, dataJson: undefined }));
} else if (phase === 'compare') {
  const a = JSON.parse(await readFile(out('fs', label), 'utf8')), b = JSON.parse(await readFile(out('fs', extra), 'utf8'));
  const keys = new Set([...Object.keys(a.hashes), ...Object.keys(b.hashes)]), diff = { added: [], removed: [], changed: [] };
  for (const k of keys) { if (!(k in a.hashes)) diff.added.push(k); else if (!(k in b.hashes)) diff.removed.push(k); else if (a.hashes[k] !== b.hashes[k]) diff.changed.push(k); }
  const result = { from: label, to: extra, filesFrom: a.files, filesTo: b.files, dataJsonEqual: a.dataJson === b.dataJson, installedFrom: a.installed, installedTo: b.installed, ...diff };
  await writeFile(`${dir}/${vault}-compare-${label}-${extra}.json`, JSON.stringify(result, null, 1) + '\n');
  console.log(JSON.stringify({ ...result, added: diff.added.length, removed: diff.removed.length, changed: diff.changed }));
} else if (phase === 'state') {
  const { connect } = await import('./obsidian-cdp.mjs');
  const c = await connect();
  if (extra === '--reload') {
    // One socket across the reload: the page target survives it, so startup console output and exceptions are captured.
    c.consoleMessages.length = 0; c.exceptions.length = 0;
    await c.command('Runtime.evaluate', { expression: "setTimeout(()=>app.commands.executeCommandById('app:reload'),50),1" });
    await new Promise(r => setTimeout(r, 3000));
    for (let i = 0; i < 60; i++) { try { if (await c.evaluate(`(async()=>{const p=app.plugins.getPlugin('mnemobard');if(!p?.services)return false;await p.services.index.settled();return true;})()`)) break; } catch { /* still loading */ } await new Promise(r => setTimeout(r, 1000)); }
  }
  const state = await c.evaluate(`(async()=>{
    const p=app.plugins.getPlugin('mnemobard'), s=p?.services; if(s) await s.index.settled();
    const kinds={}; for(const h of s?s.index.heads():[]) kinds[h.kind]=(kinds[h.kind]??0)+1;
    const leaves=[]; app.workspace.iterateAllLeaves(l=>{const t=l.view?.getViewType?.(); if(t?.startsWith('mnemobard-')) leaves.push({type:t,deferred:!l.view.contentEl,display:l.view.getDisplayText?.(),eyebrow:l.view.contentEl?.querySelector('.mnemobard-eyebrow')?.textContent??null,mark:!!l.view.contentEl?.querySelector('.mnemobard-module-header > svg.mnemotoad-mark')});});
    const recovery=s?app.vault.getFiles().filter(f=>f.path.includes('/Recovery/')&&f.extension==='json').length:0;
    return {pluginEnabled:app.plugins.enabledPlugins.has('mnemobard'),manifest:p&&{id:p.manifest.id,name:p.manifest.name,version:p.manifest.version},communityName:app.plugins.manifests.mnemobard?.name,
      settings:s&&{creationRoot:s.settings.current.creationRoot,assetDirectory:s.settings.current.assetDirectory,modules:s.settings.current.modules,readOnly:s.settings.readOnly,diagnostic:s.settings.diagnostic?.message??null},
      records:kinds,recoveryCheckpoints:recovery,leaves,commands:Object.keys(app.commands.commands).filter(k=>k.startsWith('mnemobard:')).map(k=>k+' = '+app.commands.commands[k].name),
      theme:document.body.classList.contains('theme-dark')?'dark':'light',activeDocumentIsMain:activeDocument===document};
  })()`);
  const report = { vault, label, at: new Date().toISOString(), ...state, rendererExceptions: c.exceptions, console: c.consoleMessages.filter(m => ['error', 'warning', 'assert'].includes(m.type)), consoleAll: c.consoleMessages.length };
  await writeFile(out('state'), JSON.stringify(report, null, 1) + '\n'); c.close();
  console.log(JSON.stringify(report));
} else { console.error('usage: fs|state|compare'); process.exitCode = 2; }
