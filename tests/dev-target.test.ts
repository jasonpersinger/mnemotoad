import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';

/** RC: the dev scripts may target only `dev-vault` or `dev-vault-<suffix>` inside the repository, each with its own profile. */
const resolve = (value?: string) => spawnSync(process.execPath, ['--input-type=module', '-e', "const m=await import('./scripts/dev-target.mjs');console.log(m.devVaultName+' '+m.runtimeName);"], { encoding: 'utf8', env: { ...process.env, MNEMOTOAD_DEV_VAULT: value } });
it('defaults to the original disposable vault and profile', () => {
  const env = { ...process.env }; delete env.MNEMOTOAD_DEV_VAULT;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', "const m=await import('./scripts/dev-target.mjs');console.log(m.devVaultName+' '+m.runtimeName);"], { encoding: 'utf8', env });
  expect(r.stdout.trim()).toBe('dev-vault .runtime');
});
it('maps dev-vault-<suffix> to its own isolated profile', () => { expect(resolve('dev-vault-fresh').stdout.trim()).toBe('dev-vault-fresh .runtime-fresh'); });
it('refuses any other vault name or path', () => {
  for (const bad of ['../dev-vault', '/home/user/Vault', 'dev-vault/../x', 'dev-vault-Fresh', 'my-vault', 'dev-vault-']) {
    const r = resolve(bad); expect(r.status).not.toBe(0); expect(r.stderr).toContain('Refusing MNEMOTOAD_DEV_VAULT');
  }
});
