/**
 * Which marked disposable vault the dev scripts target. Default `dev-vault` with profile `.runtime` (unchanged).
 * MNEMOTOAD_DEV_VAULT=dev-vault-<suffix> selects another disposable vault inside this repository with its own isolated
 * profile `.runtime-<suffix>` (used for the release-candidate fresh-install check). Nothing else is accepted.
 */
const name = process.env.MNEMOTOAD_DEV_VAULT ?? 'dev-vault', match = /^dev-vault(?:-([a-z0-9]+))?$/.exec(name);
if (!match) throw new Error(`Refusing MNEMOTOAD_DEV_VAULT=${name}: only dev-vault or dev-vault-<suffix> inside the repository.`);
export const devVaultName = name;
export const runtimeName = match[1] ? `.runtime-${match[1]}` : '.runtime';
