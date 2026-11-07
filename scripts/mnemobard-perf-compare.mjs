/**
 * Milestone 4G performance regression check (§6). Compares two benchmark JSON files produced on the SAME machine by
 * scripts/mnemobard-4g-benchmark.mjs (machine-local baseline; never absolute budgets across unrelated hardware).
 *
 *   node scripts/mnemobard-perf-compare.mjs <baseline.json> <candidate.json> [--ratio 1.25] [--floor 5] [--markdown out.md]
 *
 * A metric REGRESSES when candidate median > baseline median × ratio AND the increase exceeds `floor` ms (noise floor for
 * sub-millisecond operations). Exit code 1 on any regression, 0 otherwise. Absent metrics (e.g. features new in the
 * candidate) are listed, not compared. This is an explicit benchmark mode, not part of `pnpm check`.
 */
import { readFile, writeFile } from 'node:fs/promises';

const args = process.argv.slice(2), flag = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const [basePath, nextPath] = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
if (!basePath || !nextPath) { console.error('usage: mnemobard-perf-compare.mjs <baseline.json> <candidate.json> [--ratio 1.25] [--floor 5] [--markdown out.md]'); process.exit(2); }
const ratio = Number(flag('--ratio', '1.25')), floor = Number(flag('--floor', '5')), markdown = flag('--markdown');
const [base, next] = await Promise.all([basePath, nextPath].map(async p => JSON.parse(await readFile(p, 'utf8'))));

/** Flatten {area: {workload: {metric: {median,p95}}}} (and scalar ms like openCold) to "area/workload/metric" → stats. */
function metrics(report) {
  const out = new Map();
  for (const area of ['patchbook', 'motif', 'canvas']) {
    const visit = (value, path) => {
      if (!value || typeof value !== 'object') return;
      if (typeof value.median === 'number') { out.set(path, { median: value.median, p95: value.p95, samples: value.samples }); return; }
      for (const [k, v] of Object.entries(value)) if (k !== 'longTasks' && k !== 'raw') { if (typeof v === 'number' && /^open(Cold)?$/.test(k)) out.set(`${path}/${k}`, { median: v, p95: v, samples: 1 }); else visit(v, `${path}/${k}`); }
    };
    visit(report[area], area);
  }
  return out;
}
const a = metrics(base), b = metrics(next), rows = [], regressions = [], missing = [];
for (const [key, now] of b) {
  const then = a.get(key); if (!then) { missing.push(key); continue; }
  const change = then.median ? (now.median - then.median) / then.median * 100 : 0, regressed = now.median > then.median * ratio && now.median - then.median > floor;
  rows.push({ key, then, now, change, regressed }); if (regressed) regressions.push(key);
}
const fmt = n => n === undefined ? '–' : String(+n.toFixed(2));
const lines = [
  `# Performance comparison`, '',
  `Baseline: \`${basePath}\` (${base.label}, ${base.environment?.host?.userAgent?.match(/obsidian\/[\d.]+/)?.[0] ?? '?'}) · Candidate: \`${nextPath}\` (${next.label})`, '',
  `Rule: regression when candidate median > baseline × ${ratio} **and** the increase is > ${floor} ms. Same machine and method required; synthetic native renderer timings (CDP), not end-to-end user latency.`, '',
  '| Metric | Baseline median | Baseline p95 | Candidate median | Candidate p95 | Change | Verdict |', '|---|---:|---:|---:|---:|---:|---|',
  ...rows.map(r => `| ${r.key} | ${fmt(r.then.median)} | ${fmt(r.then.p95)} | ${fmt(r.now.median)} | ${fmt(r.now.p95)} | ${r.change >= 0 ? '+' : ''}${r.change.toFixed(1)}% | ${r.regressed ? '**REGRESSION**' : r.change <= -25 ? 'faster' : 'ok'} |`),
  '', missing.length ? `Not in baseline (not compared): ${missing.map(m => `\`${m}\``).join(', ')}` : '', '',
  regressions.length ? `**${regressions.length} regression(s):** ${regressions.join(', ')}` : '**No regressions beyond the threshold.**', '',
];
const text = lines.join('\n');
if (markdown) await writeFile(markdown, text); console.log(text);
process.exit(regressions.length ? 1 : 0);
