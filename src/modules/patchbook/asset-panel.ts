import { Notice } from 'obsidian';
import type { FoundationServices } from '../../application/services';
import type { AssetReference } from '../../domain/entities';
import { messageOf } from '../../domain/errors';
import { AssetImportError } from './assets';
import { button, element } from './form';
import type { LibrarySession } from './session';

function time(seconds: number): string { const value = Math.max(0, Math.floor(seconds)); return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`; }

/** Record-scoped controls. Async results never apply to a different record. */
export class AssetPanel {
  private importController?: AbortController;
  private readonly cleanups: (() => void)[] = [];
  private readonly list: HTMLElement;
  private readonly feedback: HTMLElement;
  private readonly player: HTMLElement;
  private readonly picker: HTMLElement;
  private active = true;
  constructor(root: HTMLElement, private readonly services: FoundationServices, private readonly session: LibrarySession,
    private readonly owner: object, private readonly editable: boolean, private readonly open: (path: string, role: AssetReference['role']) => void) {
    const section = element(root, 'section', undefined, 'mnemobard-asset-section'); section.setAttribute('aria-label', 'Associated assets');
    element(section, 'h3', 'Assets / listening copies');
    element(section, 'p', editable ? 'Associations are unsaved until Save record. Removing a reference keeps the file.' : 'Recordings, presets and images remain ordinary vault files.', 'mnemobard-hint');
    this.list = element(section, 'div', undefined, 'mnemobard-asset-list');
    this.player = element(section, 'div', undefined, 'mnemobard-audio-preview');
    this.feedback = element(section, 'p', '', 'mnemobard-feedback'); this.feedback.setAttribute('role', 'status');
    this.picker = element(section, 'div', undefined, 'mnemobard-asset-picker');
    if (editable) {
      const actions = element(section, 'div', undefined, 'mnemobard-actions');
      button(actions, 'Select vault asset', () => this.select());
      button(actions, 'Import local file', () => this.importForm());
    }
    this.cleanups.push(services.preview.subscribe(() => this.updatePlayer()), services.assets.subscribe(() => { if (this.active) this.renderList(); }), session.subscribe(() => { if (this.active) this.renderList(); }));
    this.renderList(); this.renderPlayer();
  }
  private say(message: string): void { if (this.active) this.feedback.textContent = message; }
  private apply(reference: AssetReference, replace?: number, previous?: string): void {
    if (!this.active || this.session.disposed) return;
    if (replace !== undefined && this.session.draft.assets?.[replace]?.link !== previous) throw Error('Association changed while selecting. Select it again.');
    this.session.update(this.services.assets.associate(this.session.draft, reference, replace));
    this.renderList(); this.say('Asset association is unsaved. Use Save record to persist it.');
  }
  private renderList(): void {
    this.list.replaceChildren();
    const assets = this.session.draft.assets ?? [];
    if (!assets.length) element(this.list, 'p', 'No assets associated.', 'mnemobard-hint');
    assets.forEach((reference, index) => {
      const row = element(this.list, 'article', undefined, 'mnemobard-asset-row');
      const state = this.services.assets.status(reference, this.session.base?.path);
      element(row, 'strong', state.status === 'valid' ? state.file.name : reference.link);
      element(row, 'p', `${reference.role} · ${state.status === 'valid' ? `${state.file.extension || 'file'} · ${Math.ceil(state.file.size / 1024)} KiB · Valid asset` : `${state.status} reference`}`);
      element(row, 'code', reference.link);
      const actions = element(row, 'div', undefined, 'mnemobard-actions');
      if (state.status === 'valid') {
        button(actions, 'Open asset', () => this.open(state.file.path, reference.role));
        if (reference.role === 'audio') button(actions, 'Play preview', () => {
          try { const resource = this.services.assets.preview(reference, this.session.base?.path); void this.services.preview.play(this.owner, resource.path, resource.url).catch(error => this.say(messageOf(error))); }
          catch (error) { this.say(messageOf(error)); }
        }).setAttribute('aria-label', `Play preview: ${state.file.name}`);
      } else element(row, 'p', state.message, 'mnemobard-library-issues');
      if (this.editable) {
        button(actions, state.status === 'valid' ? 'Replace association' : 'Repair reference', () => this.select(index, reference));
        button(actions, 'Remove association', () => {
          try { this.session.update(this.services.assets.remove(this.session.draft, index)); this.services.preview.stop(this.owner); this.renderList(); this.say('Association removed from this draft. File retained. Save record to persist.'); }
          catch (error) { this.say(messageOf(error)); }
        });
      }
    });
  }
  private select(replace?: number, previous?: AssetReference): void {
    this.importController?.abort(); this.importController = undefined;
    this.picker.replaceChildren(); element(this.picker, 'h4', replace === undefined ? 'Select an existing vault file' : `Replace ${previous?.link ?? 'reference'}`);
    const role = this.role(this.picker, previous?.role ?? 'audio');
    const label = element(this.picker, 'label'); element(label, 'span', 'Find vault asset');
    const search = element(label, 'input'); search.type = 'search'; search.setAttribute('aria-label', 'Find vault asset');
    const rows = element(this.picker, 'div', undefined, 'mnemobard-asset-choices'); let page = 0;
    const render = (): void => {
      rows.replaceChildren(); const files = this.services.assets.files(search.value);
      element(rows, 'p', `${files.length} files · page ${page + 1}. All portable file types can be selected.`);
      for (const file of files.slice(page * 50, page * 50 + 50)) button(rows, file.path, () => {
        try { this.apply(this.services.assets.reference(file.path, role.value as AssetReference['role']), replace, previous?.link); this.picker.replaceChildren(); }
        catch (error) { this.say(messageOf(error)); }
      });
      if (page > 0) button(rows, 'Previous files', () => { page--; render(); });
      if ((page + 1) * 50 < files.length) button(rows, 'More files', () => { page++; render(); });
    };
    search.addEventListener('input', () => { page = 0; render(); }); render();
    button(this.picker, 'Cancel selection', () => this.picker.replaceChildren()); search.focus();
  }
  private role(root: HTMLElement, value: AssetReference['role']): HTMLSelectElement {
    const label = element(root, 'label'); element(label, 'span', 'Asset category');
    const select = element(label, 'select'); select.setAttribute('aria-label', 'Asset category');
    for (const [id, name] of [['audio', 'Audio / sample / field recording'], ['preset', 'Preset / configuration'], ['image', 'Image / screenshot']]) { const option = element(select, 'option', name); option.value = id ?? ''; }
    select.value = value; return select;
  }
  private importForm(): void {
    this.importController?.abort(); this.importController = undefined;
    this.picker.replaceChildren(); element(this.picker, 'h4', 'Import a listening copy or reference file');
    element(this.picker, 'p', 'Copy one explicitly selected file. The original remains unchanged. Imports are limited to 100 MiB; no files are fetched or executed.');
    const label = element(this.picker, 'label'); element(label, 'span', 'Local file');
    const input = element(label, 'input'); input.type = 'file'; input.setAttribute('aria-label', 'Local file');
    const metadata = element(this.picker, 'p', 'No file selected.');
    const role = this.role(this.picker, 'audio');
    const destination = element(this.picker, 'label'); element(destination, 'span', 'Vault import destination');
    const directory = element(destination, 'input'); directory.value = this.services.settings.current.assetDirectory; directory.setAttribute('aria-label', 'Vault import destination');
    const confirm = button(this.picker, 'Confirm copy into vault', () => { void copy(); }, 'mod-cta'); confirm.disabled = true;
    input.addEventListener('change', () => {
      const file = input.files?.[0]; confirm.disabled = !file;
      metadata.textContent = file ? `${file.name} · ${file.type || 'type not supplied'} · ${file.size} bytes. Destination: vault folder below. Name collisions create a unique copy.` : 'No file selected.';
      if (file) role.value = file.type.startsWith('image/') ? 'image' : file.type.startsWith('audio/') ? 'audio' : 'preset';
    });
    const copy = async (): Promise<void> => {
      const file = input.files?.[0]; if (!file || !this.active) return;
      const selectedRole = role.value as AssetReference['role'];
      confirm.disabled = true; input.disabled = true; directory.disabled = true; role.disabled = true;
      this.importController = new AbortController(); const signal = this.importController.signal;
      try {
        const copied = await this.services.assets.import(file, directory.value, true, signal);
        if (!this.active || signal.aborted || this.session.disposed) { new Notice(`Copied ${copied.path}; no association was applied. The file is retained.`); return; }
        try { this.apply(this.services.assets.reference(copied.path, selectedRole)); }
        catch (error) { throw new AssetImportError(`Copied ${copied.path}, but association failed: ${messageOf(error)}. Select the retained vault file later.`, copied.path, error); }
        this.picker.replaceChildren(); this.say(`Copied ${copied.path}. Association is unsaved; Save record. Removing it later keeps the file.`);
      } catch (error) { if (this.active) this.say(messageOf(error)); else if (error instanceof AssetImportError) new Notice(error.message); }
      finally { if (this.active) { confirm.disabled = false; input.disabled = false; directory.disabled = false; role.disabled = false; } }
    };
    button(this.picker, 'Cancel import', () => { this.importController?.abort(); this.picker.replaceChildren(); this.say('Import cancelled. Any already submitted copy is retained; no association will be applied.'); });
  }
  private renderPlayer(): void {
    element(this.player, 'h4', 'Audio audition');
    const label = element(this.player, 'p', '', 'mnemobard-preview-status'); label.setAttribute('role', 'status');
    const actions = element(this.player, 'div', undefined, 'mnemobard-actions');
    button(actions, 'Pause preview', () => this.services.preview.pause(this.owner));
    button(actions, 'Resume preview', () => { void this.services.preview.resume(this.owner); });
    button(actions, 'Stop preview', () => this.services.preview.stop(this.owner));
    const seekLabel = element(this.player, 'label'); element(seekLabel, 'span', 'Playback position');
    const seek = element(seekLabel, 'input'); seek.type = 'range'; seek.min = '0'; seek.step = '0.01'; seek.setAttribute('aria-label', 'Playback position');
    seek.addEventListener('input', () => { try { this.services.preview.seek(this.owner, Number(seek.value)); } catch (error) { this.say(messageOf(error)); } });
    this.updatePlayer();
  }
  private updatePlayer(): void {
    const owned = this.services.preview.ownedBy(this.owner), state = this.services.preview.current;
    this.player.hidden = !owned;
    const status = this.player.querySelector('.mnemobard-preview-status');
    if (status) status.textContent = `${state.status} · ${time(state.position)} / ${time(state.duration)} · ${state.path ?? ''}${state.message ? ' · ' + state.message : ''}`;
    const seek = this.player.querySelector<HTMLInputElement>('input[type="range"]');
    if (seek) { seek.max = String(state.duration); seek.value = String(state.position); seek.disabled = !owned || state.duration === 0 || state.status === 'error'; seek.setAttribute('aria-valuetext', `${time(state.position)} of ${time(state.duration)}`); }
  }
  dispose(): void {
    this.active = false; this.importController?.abort();
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    this.services.preview.stop(this.owner);
  }
}
