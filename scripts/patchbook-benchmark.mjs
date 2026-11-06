import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { cpus, totalmem, platform } from 'node:os';
await mkdir(new URL('../output/patchbook/milestone-2b/', import.meta.url), { recursive: true });
const output = new URL('../output/patchbook/milestone-2b/benchmark-node.mjs',import.meta.url);
await build({ entryPoints: [new URL('../benchmarks/patchbook.ts',import.meta.url).pathname], bundle: true, platform: 'browser', format: 'esm', outfile: output.pathname });
const { runLibraryBenchmark } = await import(output.href);
const result = { environment: { node: process.version, platform: platform(), cpu: cpus()[0]?.model, logicalCpus: cpus().length, memoryBytes: totalmem() }, ...await runLibraryBenchmark() };
await writeFile(new URL('benchmark-after.json',output),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
