import { Notice, Scope, type WorkspaceLeaf } from 'obsidian';
import { openModal } from '../../ui/modal-host';
import type { FoundationServices } from '../../application/services';
import type { AssetReference, LibraryKind } from '../../domain/entities';
import { messageOf } from '../../domain/errors';
import { validateEntity } from '../../domain/validation';
import type { LibraryQuery } from './query';
import type { LibrarySession } from './session';
import { ModuleView } from '../../ui/module-view';
import { element, button, renderLibraryForm } from './form';
import { AssetPanel } from './asset-panel';
import { RecoveryPanel } from './recovery-panel';
import { AssetInspector } from '../../ui/asset-inspector';

const LABELS: Record<LibraryKind, string> = { instrument: 'Instruments', patch: 'Patches', 'effects-chain': 'Effects chains' };
const SINGULAR: Record<LibraryKind, string> = { instrument: 'instrument', patch: 'patch', 'effects-chain': 'effects chain' };

export class PatchbookView extends ModuleView {
  private inactive = true;
  private epoch = 0;
  private readonly unsubscribers: (() => void)[] = [];
  private unsubscribeSession?: () => void;
  private lifetime = new AbortController();
  private queryState: LibraryQuery = { kind: 'patch', sort: 'title-asc', archived: 'active' };
  private selectedId?: string;
  private currentSession?: LibrarySession;
  private editing = false;
  private loading = true;
  private page = 0;
  private browser?: HTMLElement;
  private detail?: HTMLElement;
  private feedback?: HTMLElement;
  private counters?: HTMLElement;
  private filters?: HTMLElement;
  private tabs?: HTMLElement;
  private draftList?: HTMLElement;
  private saveStatus?: HTMLElement;
  private assetPanel?: AssetPanel;
  private recoveryPanel?: RecoveryPanel;
  private assetInspector?: AssetInspector;
  constructor(leaf: WorkspaceLeaf, private readonly foundation: () => FoundationServices | undefined) {
    super(leaf, 'patchbook', foundation);
    // The host captures a view's scope when it is activated, before async onOpen.
    this.scope = new Scope(this.app.scope);
  }
  private get available(): FoundationServices | undefined { const services = this.foundation(); return services?.modules.enabled('patchbook') ? services : undefined; }
  override async onOpen(): Promise<void> {
    this.release(); this.inactive = false; this.loading = true; this.lifetime = new AbortController();
    const root = this.contentEl; root.replaceChildren(); root.classList.add('mnemobard-module', 'mnemobard-patchbook');
    const services = this.available;
    if (!services) { element(root, 'p', 'PATCHBOOK is disabled. Your vault records are retained.'); return; }
    const header = element(root, 'header', undefined, 'mnemobard-library-heading');
    element(header, 'p', 'MNEMOBARD / SOUND ARCHIVE', 'mnemobard-eyebrow');
    element(header, 'h2', 'PATCHBOOK'); element(header, 'p', 'Keep the sound. Remember the setting.', 'mnemobard-library-caption');
    this.counters = element(header, 'p', undefined, 'mnemobard-register-counts');
    this.tabs = element(root, 'nav', undefined, 'mnemobard-registers'); this.tabs.setAttribute('aria-label', 'Library registers');
    for (const kind of ['instrument', 'patch', 'effects-chain'] as const) {
      const tab = button(this.tabs, LABELS[kind], () => { void this.switchRegister(kind).catch(error => this.fail(error)); }); tab.dataset.kind = kind;
    }
    const toolbar = element(root, 'div', undefined, 'mnemobard-library-toolbar');
    const searchLabel = element(toolbar, 'label', undefined, 'mnemobard-search'); element(searchLabel, 'span', 'Search register');
    const search = element(searchLabel, 'input'); search.type = 'search'; search.value = this.queryState.search ?? ''; search.placeholder = 'Name, instrument, tags, character…'; search.setAttribute('aria-label', 'Search register');
    search.addEventListener('input', () => { this.queryState.search = search.value; this.page = 0; this.renderBrowser(); this.remember(); });
    const create = button(toolbar, 'New record', () => { void this.newRecord().catch(error => this.fail(error)); }, 'mod-cta'); create.dataset.action = 'new'; create.disabled = true;
    this.filters = element(root, 'div', undefined, 'mnemobard-library-filters');
    this.feedback = element(root, 'p', '', 'mnemobard-feedback'); this.feedback.setAttribute('role', 'status'); this.feedback.setAttribute('aria-live', 'polite');
    this.draftList = element(root, 'div', undefined, 'mnemobard-drafts');
    const recoveryRoot = element(root, 'section', undefined, 'mnemobard-recovery');
    button(toolbar, 'Recovery register', () => {
      this.recoveryPanel?.dispose();
      this.recoveryPanel = new RecoveryPanel(recoveryRoot, services, session => {
        if (!this.inactive) { this.recoveryPanel?.dispose(); this.recoveryPanel = undefined; this.attach(session, true); this.say('Recovered draft loaded. Inspect it and explicitly Save record.'); }
      }, path => this.openNote(path));
      button(recoveryRoot, 'Close recovery register', () => { this.recoveryPanel?.dispose(); this.recoveryPanel = undefined; });
    });
    const panes = element(root, 'div', undefined, 'mnemobard-library-panes');
    this.browser = element(panes, 'section', undefined, 'mnemobard-library-browser'); this.browser.setAttribute('aria-label', 'Library records');
    this.detail = element(panes, 'section', undefined, 'mnemobard-library-detail'); this.detail.setAttribute('aria-label', 'Record detail');
    const key = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && this.editing) { event.preventDefault(); this.detail?.querySelector('form')?.requestSubmit(); }
    };
    root.addEventListener('keydown', key); this.unsubscribers.push(() => root.removeEventListener('keydown', key));
    const scope = this.scope ?? new Scope(this.app.scope); this.scope = scope;
    const saveKey = scope.register(['Mod'], 's', () => {
      if (this.inactive || !this.editing) return true;
      this.detail?.querySelector('form')?.requestSubmit(); return false;
    });
    this.unsubscribers.push(() => scope.unregister(saveKey));
    this.unsubscribers.push(services.index.subscribe(() => {
      if (this.inactive) return;
      this.renderFilters(); this.renderBrowser();
      if (!this.editing && this.selectedId && !this.currentSession?.dirty) void this.select(this.selectedId).catch(error => this.fail(error));
    }));
    this.renderFilters(); this.renderBrowser(); this.renderDetail();
    const epoch = this.epoch;
    try {
      await services.index.start(); if (this.inactive) return;
      this.loading = false; create.disabled = services.settings.readOnly;
      this.renderFilters(); this.renderBrowser(); this.renderDetail();
      if (this.selectedId && epoch === this.epoch) await this.select(this.selectedId);
    } catch (error) { this.fail(error); }
  }
  private fail(error: unknown): void { if (!this.inactive && this.feedback) this.feedback.textContent = messageOf(error); }
  private say(message: string): void { if (this.feedback) this.feedback.textContent = message; }
  private remember(): void { if (!this.inactive) this.app.workspace.requestSaveLayout(); }
  private renderFilters(): void {
    const services = this.available, root = this.filters; if (!services || !root) return;
    root.replaceChildren();
    const select = (label: string, options: [string, string][], selected: string, change: (value: string) => void): void => {
      const wrapper = element(root, 'label'); element(wrapper, 'span', label);
      const control = element(wrapper, 'select'); control.setAttribute('aria-label', label);
      for (const [value, text] of options) { const option = element(control, 'option', text); option.value = value; }
      if (selected && !options.some(([value]) => value === selected)) { const option = element(control, 'option', `Unavailable · ${selected}`); option.value = selected; }
      control.value = selected; control.addEventListener('change', () => { change(control.value); this.page = 0; this.renderBrowser(); this.remember(); });
    };
    if (this.queryState.kind === 'patch') {
      select('Instrument filter', [['', 'All instruments'], ...services.patchbook.query({ kind: 'instrument' }).map(item => [item.entity.id, item.entity.title] as [string,string])], this.queryState.instrumentId ?? '', value => { this.queryState.instrumentId = value; });
      const categories = [...new Set(services.patchbook.items().flatMap(item => item.entity.kind === 'patch' && item.entity.category ? [item.entity.category] : []))].sort();
      select('Category filter', [['', 'All categories'], ...categories.map(value => [value, value] as [string,string])], this.queryState.category ?? '', value => { this.queryState.category = value; });
    }
    const tags = [...new Set(services.patchbook.items().filter(item => item.entity.kind === this.queryState.kind).flatMap(item => item.entity.tags ?? []))].sort();
    select('Tag filter', [['', 'All tags'], ...tags.map(value => [value, value] as [string,string])], this.queryState.tag ?? '', value => { this.queryState.tag = value; });
    select('Record visibility', [['active', 'Active records'], ['archived', 'Archived records'], ['all', 'All records']], this.queryState.archived ?? 'active', value => { this.queryState.archived = value as LibraryQuery['archived']; });
    select('Sort records', [['title-asc', 'Name A–Z'], ['title-desc', 'Name Z–A'], ['manufacturer', 'Manufacturer, then name']], this.queryState.sort ?? 'title-asc', value => { this.queryState.sort = value as LibraryQuery['sort']; });
    button(root, 'Clear filters', () => { this.queryState = { kind: this.queryState.kind, sort: 'title-asc', archived: 'active' }; const search = this.contentEl.querySelector<HTMLInputElement>('input[type="search"]'); if (search) search.value = ''; this.page = 0; this.renderFilters(); this.renderBrowser(); this.remember(); });
  }
  private renderBrowser(): void {
    const services = this.available, root = this.browser; if (!services || !root || this.inactive) return;
    if (this.loading) { root.replaceChildren(); element(root, 'p', 'Loading the vault library…', 'mnemobard-hint'); return; }
    const items = services.patchbook.items(), records = services.patchbook.query(this.queryState);
    if (this.counters) this.counters.textContent = ['instrument', 'patch', 'effects-chain'].map(kind => `${items.filter(item => item.entity.kind === kind && !item.entity.archived).length} ${LABELS[kind as LibraryKind].toLowerCase()}`).join(' / ');
    for (const tab of this.tabs?.querySelectorAll<HTMLButtonElement>('button') ?? []) tab.setAttribute('aria-pressed', String(tab.dataset.kind === this.queryState.kind));
    root.replaceChildren(); element(root, 'h3', `${LABELS[this.queryState.kind]} · ${records.length}`);
    if (!records.length) element(root, 'p', items.some(item => item.entity.kind === this.queryState.kind) ? 'No records match these filters. Clear filters to see the register.' : `Your ${LABELS[this.queryState.kind].toLowerCase()} register is empty. Create a record to begin.`, 'mnemobard-empty');
    this.page = Math.min(this.page, Math.max(0, Math.ceil(records.length / 100) - 1));
    const list = element(root, 'ol', undefined, 'mnemobard-record-list');
    records.slice(this.page * 100, (this.page + 1) * 100).forEach((item, index) => {
      const row = element(list, 'li'), entry = button(row, '', () => { void this.select(item.entity.id).catch(error => this.fail(error)); });
      entry.dataset.recordId = item.entity.id; entry.setAttribute('aria-current', String(this.selectedId === item.entity.id));
      element(entry, 'span', String(this.page * 100 + index + 1).padStart(3, '0'), 'mnemobard-record-number');
      const label = element(entry, 'span'); element(label, 'strong', item.entity.title);
      element(label, 'small', item.entity.kind === 'patch' ? item.instrumentName : item.entity.kind === 'instrument' ? [item.entity.manufacturer, item.entity.instrumentType].filter(Boolean).join(' · ') : `${item.entity.steps.length} stages`);
      if (item.entity.archived || item.ambiguous) element(label, 'small', item.ambiguous ? 'Duplicate ID · repair before editing' : 'Archived', 'mnemobard-hint');
    });
    if (records.length > 100) {
      const paging = element(root, 'div', undefined, 'mnemobard-actions');
      button(paging, 'Previous page', () => { this.page--; this.renderBrowser(); }).disabled = this.page === 0;
      element(paging, 'span', `${this.page + 1} / ${Math.ceil(records.length / 100)}`);
      button(paging, 'Next page', () => { this.page++; this.renderBrowser(); }).disabled = (this.page + 1) * 100 >= records.length;
    }
    const errors = services.index.all().filter(item => item.error);
    if (errors.length) {
      const details = element(root, 'details', undefined, 'mnemobard-library-issues'); element(details, 'summary', `${errors.length} unreadable record${errors.length === 1 ? '' : 's'}`);
      for (const item of errors.slice(0, 50)) { element(details, 'p', `${item.path}: ${item.error?.message}`); button(details, 'Open original note', () => { this.openNote(item.path); }); }
    }
    this.renderDrafts();
  }
  private renderDrafts(): void {
    const services = this.available, root = this.draftList; if (!services || !root) return;
    root.replaceChildren(); const drafts = services.patchbook.getDrafts();
    if (!drafts.length) return;
    element(root, 'span', 'Pending drafts: ');
    for (const session of drafts) button(root, session.draft.title || `Untitled ${SINGULAR[session.draft.kind]}`, () => { void this.leaveDraft().then(() => { this.attach(session, true); }).catch(error => this.fail(error)); });
  }
  private async leaveDraft(): Promise<void> { if (this.currentSession?.dirty && !this.currentSession.disposed) await this.currentSession.checkpoint(); }
  private async switchRegister(kind: LibraryKind): Promise<void> {
    await this.leaveDraft(); if (this.inactive) return;
    this.epoch++; this.unsubscribeSession?.(); this.currentSession = undefined; this.selectedId = undefined; this.editing = false;
    this.queryState = { kind, search: this.queryState.search, sort: this.queryState.sort, archived: this.queryState.archived }; this.page = 0;
    this.renderFilters(); this.renderBrowser(); this.renderDetail(); this.say(''); this.remember();
  }
  private async newRecord(): Promise<void> {
    await this.leaveDraft(); if (this.inactive) return;
    if (this.available?.settings.readOnly) { this.say('Settings are read-only. Repair the original settings before creating records.'); return; }
    const session = this.available?.patchbook.create(this.queryState.kind); if (session) this.attach(session, true);
  }
  private async select(id: string): Promise<void> {
    await this.leaveDraft(); if (this.inactive) return;
    const services = this.available; if (!services) return;
    const epoch = ++this.epoch;
    try {
      const session = await services.patchbook.open(id, this.lifetime.signal);
      if (!this.inactive && epoch === this.epoch) this.attach(session, session.dirty);
    } catch (error) { if (!this.inactive && epoch === this.epoch) { this.unsubscribeSession?.(); this.unsubscribeSession = undefined; this.selectedId = id; this.currentSession = undefined; this.editing = false; this.renderDetail(); this.fail(error); } }
  }
  private attach(session: LibrarySession, editing: boolean): void {
    this.available?.preview.stop(this);
    this.epoch++;
    this.unsubscribeSession?.(); this.currentSession = session; this.selectedId = session.draft.id;
    if (this.queryState.kind !== session.draft.kind) {
      this.queryState = { kind: session.draft.kind, sort: this.queryState.sort, archived: this.queryState.archived }; this.page = 0;
      const search = this.contentEl.querySelector<HTMLInputElement>('input[type="search"]'); if (search) search.value = '';
    }
    this.editing = editing;
    this.unsubscribeSession = session.subscribe(() => { if (!this.inactive) { this.updateStatus(); this.renderDrafts(); } });
    this.renderFilters(); this.renderBrowser(); this.renderDetail(); this.say(''); this.remember();
  }
  private updateStatus(): void {
    if (this.saveStatus && this.currentSession) {
      this.saveStatus.textContent = this.currentSession.status;
      const path = this.currentSession.recoveryPath;
      if (path && this.currentSession.dirty) button(this.saveStatus, 'Open recovery copy', () => this.openNote(path));
      const save = this.detail?.querySelector<HTMLButtonElement>('[data-action="save"]'); if (save) save.disabled = this.currentSession.busy;
    }
  }
  private openNote(path: string): void {
    const app = this.app;
    void app.workspace.openLinkText(path, '', true).catch(error => this.fail(error));
  }
  private openAsset(path: string, role: AssetReference['role']): void {
    const extension = path.split('.').at(-1)?.toLowerCase() ?? '';
    // Limit host opening to built-in media/image viewers. Arbitrary presets may
    // be executable extensions, so inspect them inside Obsidian instead.
    if (role !== 'preset' && ['wav', 'mp3', 'ogg', 'flac', 'm4a', 'webm', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(extension)) this.openNote(path);
    else { this.assetInspector?.close(); this.assetInspector = new AssetInspector(this.app, path); openModal(this.contentEl, this.assetInspector, t => this.say(t)); }
  }
  private related(id: string): void { void this.select(id).catch(error => this.fail(error)); }
  private renderDetail(): void {
    const services = this.available, root = this.detail; if (!services || !root || this.inactive) return;
    this.assetPanel?.dispose(); this.assetPanel = undefined;
    root.replaceChildren(); this.saveStatus = undefined;
    if (this.loading) { element(root, 'p', 'Opening the sound archive…', 'mnemobard-hint'); return; }
    const session = this.currentSession;
    if (!session) {
      element(root, 'p', this.selectedId ? 'This record is unavailable. Inspect its source or resolve a duplicate ID before editing.' : 'Select a record, or begin a new entry.', 'mnemobard-empty');
      if (!this.selectedId && !services.patchbook.query({ kind: 'instrument' }).length) {
        element(root, 'h3', 'Begin with an instrument'); element(root, 'p', 'Give your sound source a record, then collect the patches and processing chains that belong with it.', 'mnemobard-hint');
        button(root, 'New instrument', () => { void this.switchRegister('instrument').then(() => this.newRecord()).catch(error => this.fail(error)); }).disabled = services.settings.readOnly;
      }
      return;
    }
    const e = session.draft;
    if (!this.editing && session.base) {
      const resolution = services.index.resolve(e.id);
      if (resolution.status !== 'ready') { element(root, 'p', `This record is ${resolution.status}. Resolve its source before editing.`, 'mnemobard-library-issues'); button(root, 'Open original note', () => this.openNote(session.base?.path ?? '')); return; }
    }
    element(root, 'p', SINGULAR[e.kind].toUpperCase(), 'mnemobard-eyebrow'); element(root, 'h2', e.title || `New ${SINGULAR[e.kind]}`);
    this.saveStatus = element(root, 'p', session.status, 'mnemobard-save-status'); this.saveStatus.setAttribute('role', 'status'); this.saveStatus.setAttribute('aria-live', 'polite');
    if (this.editing) {
      renderLibraryForm(root, session, services.patchbook, () => { void this.save().catch(error => this.fail(error)); }, () => { void this.leaveDraft().then(() => { if (!this.inactive) { this.editing = false; this.renderDetail(); this.renderDrafts(); } }).catch(error => this.fail(error)); }, target => { this.assetPanel = new AssetPanel(target, services, session, this, true, (path, role) => this.openAsset(path, role)); });
      this.discardControls(root, session);
      return;
    }
    const actions = element(root, 'div', undefined, 'mnemobard-actions');
    button(actions, session.dirty ? 'Continue editing draft' : 'Edit record', () => { this.editing = true; this.renderDetail(); this.detail?.querySelector<HTMLInputElement>('input')?.focus(); }).disabled = services.settings.readOnly;
    const state = services.index.resolve(e.id), path = state.status === 'ready' ? state.path : session.base?.path;
    if (path) button(actions, 'Open Markdown record', () => this.openNote(path));
    if (session.base && !session.dirty && !services.settings.readOnly) button(actions, e.archived ? 'Restore to library' : 'Archive record', () => this.archiveControls(root, session));
    if (services.settings.diagnostic) element(root, 'p', services.settings.diagnostic.message, 'mnemobard-library-issues');
    if (session.base) button(actions, 'Reload from note', () => { void this.reload(session).catch(error => this.fail(error)); });
    if (session.dirty) {
      try { validateEntity(e); }
      catch (error) {
        element(root, 'p', `This draft needs attention before it can be saved: ${messageOf(error)}`, 'mnemobard-library-issues');
        this.discardControls(root, session); return;
      }
    }
    const description = (label: string, text: string | undefined): void => { if (text) { element(root, 'h3', label); element(root, 'p', text, 'mnemobard-record-text'); } };
    if (e.archived) element(root, 'p', 'Archived. The Markdown record and its relationships remain in the vault.', 'mnemobard-hint');
    if (e.kind === 'patch') {
      element(root, 'h3', 'Instrument');
      if (e.instrumentId) { const instrument = services.index.resolve(e.instrumentId); button(root, instrument.status === 'ready' ? instrument.entity.title : `${e.instrument} · unavailable`, () => this.related(e.instrumentId ?? '')); }
      else element(root, 'p', `${e.instrument} · text association`);
      description('Category', e.category); description('Character', e.character); description('Preset', e.preset); description('Manufacturer / developer', e.manufacturer); description('Parameter notes', e.parameterNotes);
      if (e.parameters?.length) {
        const table = element(root, 'table'); for (const p of e.parameters) { const row = element(table, 'tr'); element(row, 'th', p.name).scope = 'row'; element(row, 'td', `${p.value}${p.unit ? ' ' + p.unit : ''}`); }
      }
      if (e.effectsChainIds?.length) { element(root, 'h3', 'Effects chains'); for (const id of e.effectsChainIds) { const chain = services.index.resolve(id); button(root, chain.status === 'ready' ? chain.entity.title : `Unavailable chain · ${id}`, () => this.related(id)); } }
      if (e.effects?.length) { element(root, 'h3', 'Effect descriptions'); const list = element(root, 'ol'); for (const effect of e.effects) element(list, 'li', effect); }
    } else if (e.kind === 'instrument') { description('Manufacturer / developer', e.manufacturer); description('Type', e.instrumentType); description('Platform / format', e.platform); }
    else {
      element(root, 'h3', 'Signal path'); const list = element(root, 'ol', undefined, 'mnemobard-signal-path');
      for (const step of e.steps) { const item = element(list, 'li'); element(item, 'strong', step.name); if (step.parameterNotes) element(item, 'p', step.parameterNotes, 'mnemobard-record-text'); if (step.presetLink) element(item, 'code', step.presetLink); }
      if (!e.steps.length) element(root, 'p', 'No stages documented yet.', 'mnemobard-hint');
    }
    description('Description', e.description); description('Tags', e.tags?.join(' · ')); description('General notes', e.notes);
    if (e.kind !== 'patch') {
      const related = services.patchbook.related(e.id); element(root, 'h3', `Associated patches · ${related.length}`);
      for (const patch of related) button(root, `${patch.entity.title}${patch.entity.archived ? ' (archived)' : ''}`, () => this.related(patch.entity.id));
    }
    this.assetPanel = new AssetPanel(root, services, session, this, false, (path, role) => this.openAsset(path, role));
    if (!services.settings.readOnly) button(root, 'Manage assets', () => { this.editing = true; this.renderDetail(); this.detail?.querySelector('.mnemobard-asset-section')?.scrollIntoView({ block: 'nearest' }); });
    if (e.externalReferences?.length) {
      element(root, 'h3', 'External references');
      for (const link of e.externalReferences) { const a = element(root, 'a', link); a.href = link; a.target = '_blank'; a.rel = 'noopener noreferrer'; }
    }
    const problems = services.references.diagnostics(e, path ?? '');
    if (problems.length) { const section = element(root, 'section', undefined, 'mnemobard-library-issues'); element(section, 'h3', 'References to review'); for (const problem of problems) element(section, 'p', problem.message); }
    if (path) element(root, 'p', path, 'mnemobard-source-path');
    if (session.dirty) this.discardControls(root, session);
  }
  private async save(): Promise<void> {
    const session = this.currentSession; if (!session) return;
    await session.save(); if (this.inactive || session !== this.currentSession) return;
    this.editing = session.dirty; this.renderFilters(); this.renderBrowser(); this.renderDetail(); this.say(session.dirty ? 'Saved the submitted version. Newer edits are still pending.' : 'Record saved to the vault.');
  }
  private discardControls(root: HTMLElement, session: LibrarySession): void {
    const section = element(root, 'details', undefined, 'mnemobard-draft-actions'); element(section, 'summary', 'Draft options');
    if (session.recoveryPath) button(section, 'Open recovery copy', () => this.openNote(session.recoveryPath ?? ''));
    button(section, 'Discard draft…', () => {
      const confirmation = element(section, 'div', undefined, 'mnemobard-confirm'); element(confirmation, 'p', 'Discard these unsaved changes? Saved notes and existing recovery copies will remain.');
      button(confirmation, 'Keep editing', () => confirmation.remove());
      button(confirmation, 'Confirm discard', () => { const base = session.base, services = this.available; if (!services) return; services.patchbook.discard(session); this.currentSession = undefined; this.selectedId = undefined; this.editing = false; this.renderBrowser(); this.renderDetail(); if (base) void this.select(base.entity.id).catch(error => this.fail(error)); });
    });
  }
  private async reload(session: LibrarySession): Promise<void> {
    if (session.dirty) { await session.checkpoint(); this.say('Your draft is retained. Discard it explicitly before loading the note version; the recovery copy remains available.'); return; }
    await this.select(session.draft.id);
  }
  private archiveControls(root: HTMLElement, session: LibrarySession): void {
    root.querySelector('.mnemobard-confirm')?.remove(); const confirmation = element(root, 'div', undefined, 'mnemobard-confirm');
    const archived = !session.draft.archived, count = this.available?.patchbook.related(session.draft.id).length ?? 0;
    element(confirmation, 'p', archived ? `Archive this record? Its Markdown note is retained. ${count} patch association(s) will remain and show its archived status.` : 'Restore this record to the active library?');
    button(confirmation, 'Cancel', () => confirmation.remove());
    button(confirmation, archived ? 'Confirm archive' : 'Confirm restore', () => {
      const services = this.available, base = session.base; if (!services || !base) return;
      void services.patchbook.archive(base, archived, true).then(async () => { if (!this.inactive) { this.unsubscribeSession?.(); this.currentSession = undefined; await this.select(base.entity.id); this.renderBrowser(); this.say(archived ? 'Record archived; its note remains in the vault.' : 'Record restored.'); } }).catch(error => this.fail(error));
    });
  }
  override getState(): Record<string, unknown> { return { ...this.queryState, selectedId: this.selectedId }; }
  override async setState(value: unknown): Promise<void> {
    if (!value || typeof value !== 'object') return;
    const state = value as Record<string, unknown>;
    if (['patch', 'instrument', 'effects-chain'].includes(String(state.kind))) this.queryState.kind = state.kind as LibraryKind;
    if (typeof state.search === 'string') this.queryState.search = state.search.slice(0, 1000);
    if (['active', 'archived', 'all'].includes(String(state.archived))) this.queryState.archived = state.archived as LibraryQuery['archived'];
    if (['title-asc', 'title-desc', 'manufacturer'].includes(String(state.sort))) this.queryState.sort = state.sort as LibraryQuery['sort'];
    for (const key of ['instrumentId', 'tag', 'category'] as const) if (typeof state[key] === 'string') this.queryState[key] = state[key];
    if (typeof state.selectedId === 'string') this.selectedId = state.selectedId;
    if (!this.inactive) { const search = this.contentEl.querySelector<HTMLInputElement>('input[type="search"]'); if (search) search.value = this.queryState.search ?? ''; this.renderFilters(); this.renderBrowser(); if (this.selectedId) await this.select(this.selectedId); }
  }
  override release(): void {
    this.assetInspector?.close(); this.assetInspector = undefined;
    this.assetPanel?.dispose(); this.assetPanel = undefined; this.recoveryPanel?.dispose(); this.recoveryPanel = undefined;
    this.foundation()?.preview.stop(this);
    this.inactive = true; this.epoch++; this.lifetime.abort(); this.unsubscribeSession?.(); this.unsubscribeSession = undefined;
    for (const unsubscribe of this.unsubscribers.splice(0)) unsubscribe();
    super.release();
  }
  override async onClose(): Promise<void> {
    this.release(); this.contentEl.replaceChildren();
    try { await this.leaveDraft(); }
    catch (error) { if (!this.currentSession?.disposed) new Notice(`PATCHBOOK draft recovery failed: ${messageOf(error)}. Reopen the library while the plugin is enabled; the in-memory draft is retained.`); }
  }
}
