// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { AssetInspector } from '../src/ui/asset-inspector';
import { TFile } from './support/obsidian';
import { deferred } from './support/memory-vault';
function fixture(size = 32) {
  const file = Object.assign(new TFile('Assets/inert.sh'), { name: 'inert.sh', extension: 'sh', stat: { size } });
  const read = vi.fn(async () => '<script>doNotExecute()</script>');
  const inspector = new AssetInspector({ vault: { getAbstractFileByPath: () => file, read } } as unknown as App, file.path); inspector.open();
  const click = () => { const button = [...inspector.contentEl.querySelectorAll('button')].find(button => button.textContent === 'Inspect as text'); if (!button) throw Error('Missing inspection control'); button.click(); };
  return { inspector, read, click };
}
it('opens arbitrary presets as inert metadata and reads text only by explicit action', async () => {
  const { inspector, read, click } = fixture(); expect(read).not.toHaveBeenCalled(); click(); await Promise.resolve();
  expect(inspector.contentEl.querySelector('pre')?.textContent).toBe('<script>doNotExecute()</script>'); expect(inspector.contentEl.querySelector('script')).toBeNull(); inspector.close();
});
it('bounds large-file text inspection and cancels late view updates on closure', async () => {
  const large = fixture(262145); expect(large.inspector.contentEl.querySelector('button')?.disabled).toBe(true); expect(large.read).not.toHaveBeenCalled(); large.inspector.close();
  const normal = fixture(), waiting = deferred<string>(); normal.read.mockImplementation(() => waiting.promise); normal.click(); normal.inspector.close(); waiting.resolve('late'); await Promise.resolve(); expect(normal.inspector.contentEl.textContent).toBe('');
});
