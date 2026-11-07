import { element, button } from '../../ui/dom';
import { messageOf } from '../../domain/errors';
import type { Composition } from '../../domain/entities';
import { musicalPosition, positionTick } from '../../music/positions';
import type { CanvasLibrary, DuplicateMirror, RenameOffer } from './library';
import type { CanvasSession } from './session';
import {
  addMarker, addSection, deleteMarker, deleteSection, orderedMarkers, orderedSections, removeReference, sectionOverlaps,
  swapSection, updateMarker, updateReference, updateSection, type Marker, type RecordingReference, type Section,
} from './structure';

export type StructureKind = 'section' | 'marker' | 'reference';
export interface StructureHost {
  library: CanvasLibrary;
  session: CanvasSession;
  /** Existing CANVAS edit gate: pending-form guard, refresh, error display. */
  act(fn: () => void, form?: HTMLFormElement): boolean;
  /** Ephemeral navigation: viewport + stopped playhead. Never edits or starts playback. */
  locate(tick: number): void;
  highlight(kind?: 'section' | 'marker', id?: string): void;
  open(path: string): void;
  sourcePath(): string;
  cursorTick(): number;
  readOnly(): boolean;
  /** 4D: the view keeps exactly one inspector context; notified on every structure selection change. */
  selected?(kind: StructureKind | undefined): void;
  /** 4D: true while any other inspector form holds unapplied changes. */
  blocked?(): boolean;
}

/** Keyboard/numeric alternative for every ruler operation plus the recording inspector. */
export class CanvasStructurePanel {
  private readonly details: HTMLDetailsElement;
  private readonly summary: HTMLElement;
  private readonly body: HTMLElement;
  private groups?: HTMLElement;
  private selected?: { kind: StructureKind; id: string };
  private mode?: 'edit' | 'relink' | 'remove';
  /** Same 50-row bound as the clip register: DOM/layout cost stays flat for 500 markers. */
  private pages: Record<StructureKind, number> = { section: 0, marker: 0, reference: 0 };
  private followSelection = true;
  private search = '';
  private timer?: ReturnType<typeof setTimeout>;
  private readonly unsubscribe: () => void;
  private closed = false;
  /** 4D rename workflow: provable link-only conflict offer, refreshed after file events / edits (one disk read per change). */
  private renameOffer?: RenameOffer;
  private renameKey = '';
  private renameJob = 0;
  private fileEpoch = 0;
  /** 4E legacy duplicate mirror links: memoised per file event and draft version (renders on every selection). */
  private duplicateKey = '';
  /** 4E performance: the add-reference form (vault scan + one option per section/marker) is built only while its disclosure is open. */
  private addReferenceOpen = false;
  private duplicateValue: DuplicateMirror[] = [];

  /** `editorRoot` (4D): the shared contextual inspector slot. Without it, editors render inline (4C layout). */
  constructor(root: HTMLElement, private readonly host: StructureHost, private readonly editorRoot?: HTMLElement) {
    this.details = element(root, 'details', undefined, 'mnemobard-canvas-structure');
    this.summary = element(this.details, 'summary');
    this.body = element(this.details, 'div');
    // File events only refresh availability text; coalesced, never reads recordings.
    this.unsubscribe = host.library.subscribeFiles(() => { this.fileEpoch++; if (this.timer === undefined) this.timer = setTimeout(() => { this.timer = undefined; this.refresh(); }, 150); });
    this.render();
  }
  /** session.draft deep-clones on every read; one snapshot per render keeps list rendering linear. Handlers outside render read fresh. */
  private snapshot?: Composition;
  private get model(): Composition { return this.snapshot ?? this.host.session.draft; }
  private pos(tick: number): string { return musicalPosition(tick, this.model.data.ppq, this.model.data.meter); }
  private tick(value: string): number { return positionTick(value, this.model.data.ppq, this.model.data.meter); }
  private get bar(): number { const m = this.model.data.meter; return this.model.data.ppq * 4 / m.denominator * m.numerator; }
  private pending(): boolean { return !!this.body.querySelector('form[data-pending="true"]') || !!this.editorRoot?.querySelector('form[data-pending="true"]'); }
  get selection(): { kind: StructureKind; id: string } | undefined { return this.selected ? { ...this.selected } : undefined; }
  /** Ephemeral: clears the structure selection without touching composition data or history. */
  clear(): boolean {
    if (this.pending()) { this.status('Apply or discard the pending structure form first.'); return false; }
    if (!this.selected) return true;
    this.selected = undefined; this.mode = undefined; this.host.highlight(); this.render(); this.host.selected?.(undefined); return true;
  }

  refresh(): void { if (!this.closed && !this.pending()) this.render(); else this.renderSummary(); }
  /** From the ruler; selection is ephemeral and never enters history. */
  select(kind: StructureKind, id: string, navigate = false): boolean {
    if (this.pending() || this.host.blocked?.()) { this.status('Apply or discard the pending form first.'); return false; }
    this.selected = { kind, id }; this.mode = undefined; this.followSelection = true; if (!this.editorRoot) this.details.open = true;
    this.host.selected?.(kind);
    if (kind !== 'reference') this.host.highlight(kind, id);
    if (navigate) { const tick = this.anchorOf(kind, id); if (tick !== undefined) this.host.locate(tick); }
    this.render();
    const row = [...this.body.querySelectorAll<HTMLElement>('[data-structure-id]')].find(node => node.dataset.structureId === id);
    if (!this.editorRoot || (this.details.open && row)) row?.focus(); else this.editorRoot.querySelector<HTMLElement>('h4')?.focus();
    return true;
  }
  /** Previous/next navigation across ordered sections or markers. */
  step(kind: 'section' | 'marker', direction: -1 | 1): void {
    const items = kind === 'section' ? orderedSections(this.model) : orderedMarkers(this.model);
    if (!items.length) { this.status(`No ${kind}s yet.`); return; }
    // Playhead-relative like a DAW; step through the ordered list only while the selection sits at the
    // playhead, so markers sharing one tick are each reachable. No wrap-around.
    const at = this.host.cursorTick(), when = (i: Section | Marker): number => kind === 'section' ? (i as Section).startTick : (i as Marker).tick;
    const index = this.selected?.kind === kind ? items.findIndex(i => i.id === this.selected?.id) : -1, current = items[index];
    const next = current && when(current) === at ? items[index + direction] : direction > 0 ? items.find(i => when(i) > at) : [...items].reverse().find(i => when(i) < at);
    if (next) this.select(kind, next.id, true); else this.status(direction > 0 ? `Already at the last ${kind}.` : `Already at the first ${kind}.`);
  }
  private anchorOf(kind: StructureKind, id: string): number | undefined {
    const c = this.model;
    return kind === 'section' ? c.data.sections.find(s => s.id === id)?.startTick : kind === 'marker' ? c.data.markers.find(m => m.id === id)?.tick : c.data.audioRefs.find(r => r.id === id)?.atTick;
  }
  private status(text: string): void { for (const root of [this.body, this.editorRoot]) { const node = root?.querySelector('.mnemobard-structure-status'); if (node) node.textContent = text; } }
  /** Wraps the shared gate so validation errors also appear beside the structure form. */
  private edit(fn: () => void, form?: HTMLFormElement, done?: string): void {
    let failure = '';
    const ok = this.host.act(() => { try { fn(); } catch (error) { failure = messageOf(error); throw error; } }, form);
    if (ok) { if (form) delete form.dataset.pending; this.render(); if (done) this.status(done); }
    else this.status(failure || 'Apply or discard pending properties first. Arrangement unchanged.');
  }

  private renderSummary(): void {
    const c = this.model, missing = c.data.audioRefs.filter(r => this.host.library.recordingStatus(r.path).status !== 'available').length;
    this.summary.textContent = `Structure · ${c.data.sections.length} sections · ${c.data.markers.length} markers · ${c.data.audioRefs.length} recordings${missing ? ` · ${missing} unavailable` : ''}`;
  }
  private render(): void {
    if (this.closed) return;
    this.snapshot = this.host.session.draft;
    try { this.renderBody(this.snapshot); } finally { this.snapshot = undefined; }
  }
  private renderBody(c: Composition): void {
    if (this.selected && this.anchorOf(this.selected.kind, this.selected.id) === undefined) { this.selected = undefined; this.mode = undefined; this.host.highlight(); this.host.selected?.(undefined); }
    this.renderSummary();
    this.body.replaceChildren();
    if (this.editorRoot) { this.editorRoot.replaceChildren(); if (this.selected) { const live = element(this.editorRoot, 'p', '', 'mnemobard-structure-status'); live.setAttribute('role', 'status'); } }
    const status = element(this.body, 'p', '', 'mnemobard-structure-status'); status.setAttribute('role', 'status');
    element(this.body, 'p', 'Sections, markers and recording references organize the piece. They never change notes, routing, playback or MIDI export. Navigation does not create undo steps.', 'mnemobard-hint');
    this.groups = element(this.body, 'div', undefined, 'mnemobard-structure-groups');
    this.renderSections(c);
    this.renderMarkers(c);
    this.renderReferences(c);
  }
  private field(form: HTMLElement, text: string, value: string, multiline = false, placeholder = ''): HTMLInputElement | HTMLTextAreaElement {
    const label = element(form, 'label'); element(label, 'span', text);
    const input = multiline ? element(label, 'textarea') : element(label, 'input');
    input.value = value; input.setAttribute('aria-label', text); if (placeholder) input.placeholder = placeholder;
    return input;
  }
  /** Fields first, then submit/discard; any input marks the form pending for the shared gate. */
  private form(parent: HTMLElement, submitText: string, fields: (form: HTMLFormElement) => void, submit: (form: HTMLFormElement) => void): HTMLFormElement {
    const form = element(parent, 'form', undefined, 'mnemobard-structure-form');
    fields(form);
    form.addEventListener('input', () => { form.dataset.pending = 'true'; });
    form.addEventListener('submit', e => { e.preventDefault(); submit(form); });
    const go = element(form, 'button', submitText, 'mod-cta'); go.type = 'submit'; go.disabled = this.host.readOnly();
    button(form, 'Discard', () => { delete form.dataset.pending; this.mode = undefined; this.render(); });
    return form;
  }
  private paged<T extends { id: string }>(box: HTMLElement, kind: StructureKind, items: readonly T[], plural: string): T[] {
    const size = 50, last = Math.max(0, Math.ceil(items.length / size) - 1), at = this.selected?.kind === kind ? items.findIndex(i => i.id === this.selected?.id) : -1;
    if (at >= 0 && this.followSelection) this.pages[kind] = Math.floor(at / size);
    const page = this.pages[kind] = Math.min(this.pages[kind], last);
    if (items.length > size) {
      const nav = element(box, 'div', undefined, 'mnemobard-structure-actions');
      element(nav, 'small', `Showing ${page * size + 1}–${Math.min(items.length, page * size + size)} of ${items.length} ${plural}`);
      const turn = (delta: number) => { if (this.pending()) { this.status('Apply or discard the pending structure form first.'); return; } this.pages[kind] = page + delta; this.followSelection = false; this.render(); };
      if (page > 0) button(nav, `Previous ${plural} page`, () => turn(-1));
      if (page < last) button(nav, `More ${plural}`, () => turn(1));
    }
    return items.slice(page * size, page * size + size);
  }
  private row(list: HTMLElement, kind: StructureKind, id: string, text: string, detail: string): void {
    const item = element(list, 'li'), selected = this.selected?.kind === kind && this.selected.id === id;
    const choose = button(item, text, () => this.select(kind, id, true), selected ? 'is-selected' : undefined);
    choose.dataset.structureId = id; choose.setAttribute('aria-pressed', String(selected));
    choose.setAttribute('aria-label', `${text}. ${detail}. ${kind === 'reference' ? 'Select' : 'Select and jump'}`);
    element(item, 'small', detail);
  }

  private renderSections(c: Composition): void {
    const box = element(this.groups ?? this.body, 'section', undefined, 'mnemobard-structure-group'), sections = orderedSections(c);
    element(box, 'h3', 'Sections');
    for (const [a, b] of sectionOverlaps(c).slice(0, 20)) element(box, 'p', `! “${a.label}” overlaps “${b.label}” (stored by another editor). Both are preserved; adjust either boundary to resolve.`, 'mnemobard-structure-warning');
    if (!sections.length) element(box, 'p', 'No sections. Add one below or double-click the SECTIONS ruler.', 'mnemobard-hint');
    const list = element(box, 'ol', undefined, 'mnemobard-structure-list');
    for (const s of this.paged(box, 'section', sections, 'sections')) this.row(list, 'section', s.id, s.label, `${this.pos(s.startTick)} → ${this.pos(s.endTick)} · ${((s.endTick - s.startTick) / this.bar).toFixed(2).replace(/\.00$/, '')} bars`);
    const current = this.selected?.kind === 'section' ? c.data.sections.find(s => s.id === this.selected?.id) : undefined;
    if (current) this.sectionEditor(this.editorRoot ?? box, current);
    const add = element(box, 'details'); element(add, 'summary', 'Add section');
    const last = sections.at(-1), start = Math.min(last?.endTick ?? this.host.cursorTick(), c.data.lengthTicks - 1), end = Math.min(c.data.lengthTicks, start + this.bar * 4);
    this.form(add, 'Add section', form => {
  this.field(form, 'New section name', `Section ${sections.length + 1}`); this.field(form, 'New section start (bar:beat:tick)', this.pos(start)); this.field(form, 'New section end (bar:beat:tick)', this.pos(end)); this.field(form, 'New section description', '', true, 'Optional');
    }, f => {
      const name = value(f, 'New section name'), from = value(f, 'New section start (bar:beat:tick)'), to = value(f, 'New section end (bar:beat:tick)'), about = value(f, 'New section description');
      this.edit(() => { const id = crypto.randomUUID(); this.host.session.edit('Add section', x => addSection(x, { label: name, startTick: this.tick(from), endTick: this.tick(to), description: about }, id)); this.selected = { kind: 'section', id }; this.host.highlight('section', id); }, f, `Added section “${name.trim()}”.`);
    });
  }
  private sectionEditor(box: HTMLElement, s: Section): void {
    const panel = element(box, 'div', undefined, 'mnemobard-structure-editor'); heading(panel, `Section · ${s.label}`);
    if (this.editorRoot) element(panel, 'p', `${this.pos(s.startTick)} → ${this.pos(s.endTick)}`, 'mnemobard-hint');
    this.form(panel, 'Apply section', form => {
  this.field(form, 'Section name', s.label); this.field(form, 'Section start (bar:beat:tick)', this.pos(s.startTick)); this.field(form, 'Section end (bar:beat:tick)', this.pos(s.endTick)); this.field(form, 'Section description', s.description ?? '', true, 'Optional');
    }, f => {
      const name = value(f, 'Section name'), from = value(f, 'Section start (bar:beat:tick)'), to = value(f, 'Section end (bar:beat:tick)'), about = value(f, 'Section description');
      this.edit(() => this.host.session.edit('Edit section', x => updateSection(x, s.id, { label: name, startTick: this.tick(from), endTick: this.tick(to), description: about })), f, 'Section updated.');
    });
    const actions = element(panel, 'div', undefined, 'mnemobard-structure-actions');
    button(actions, 'Jump to section start', () => this.host.locate(s.startTick));
    button(actions, 'Swap with previous section', () => this.edit(() => this.host.session.edit('Reorder section', x => swapSection(x, s.id, -1)), undefined, 'Section order exchanged; clips were not moved.'));
    button(actions, 'Swap with next section', () => this.edit(() => this.host.session.edit('Reorder section', x => swapSection(x, s.id, 1)), undefined, 'Section order exchanged; clips were not moved.'));
    const linked = this.model.data.audioRefs.filter(r => r.sectionId === s.id).length;
    button(actions, 'Delete section', () => this.edit(() => this.host.session.edit('Delete section', x => deleteSection(x, s.id)), undefined, `Deleted section “${s.label}”${linked ? `; ${linked} recording association(s) cleared, records kept` : ''}. Undo restores it.`), 'mod-warning');
  }

  private renderMarkers(c: Composition): void {
    const box = element(this.groups ?? this.body, 'section', undefined, 'mnemobard-structure-group'), markers = orderedMarkers(c);
    element(box, 'h3', 'Markers');
    if (!markers.length) element(box, 'p', 'No markers. Add one below or double-click the MARKERS ruler.', 'mnemobard-hint');
    const list = element(box, 'ol', undefined, 'mnemobard-structure-list');
    const shared = new Map<number, number>(); for (const m of markers) shared.set(m.tick, (shared.get(m.tick) ?? 0) + 1);
    for (const m of this.paged(box, 'marker', markers, 'markers')) this.row(list, 'marker', m.id, m.label, this.pos(m.tick) + ((shared.get(m.tick) ?? 0) > 1 ? ' · shares position' : ''));
    const current = this.selected?.kind === 'marker' ? c.data.markers.find(m => m.id === this.selected?.id) : undefined;
    if (current) this.markerEditor(this.editorRoot ?? box, current);
    const add = element(box, 'details'); element(add, 'summary', 'Add marker');
    this.form(add, 'Add marker', form => {
  this.field(form, 'New marker name', `Marker ${markers.length + 1}`); this.field(form, 'New marker position (bar:beat:tick)', this.pos(Math.min(this.host.cursorTick(), c.data.lengthTicks))); this.field(form, 'New marker description', '', true, 'Optional');
    }, f => {
      const name = value(f, 'New marker name'), at = value(f, 'New marker position (bar:beat:tick)'), about = value(f, 'New marker description');
      this.edit(() => { const id = crypto.randomUUID(); this.host.session.edit('Add marker', x => addMarker(x, { label: name, tick: this.tick(at), description: about }, id)); this.selected = { kind: 'marker', id }; this.host.highlight('marker', id); }, f, `Added marker “${name.trim()}”.`);
    });
  }
  private markerEditor(box: HTMLElement, m: Marker): void {
    const panel = element(box, 'div', undefined, 'mnemobard-structure-editor'); heading(panel, `Marker · ${m.label}`);
    const twins = this.model.data.markers.filter(x => x.tick === m.tick).length; if (twins > 1) element(panel, 'p', `${twins} markers share ${this.pos(m.tick)}; Previous/Next marker visits each in name order.`, 'mnemobard-hint');
    this.form(panel, 'Apply marker', form => {
  this.field(form, 'Marker name', m.label); this.field(form, 'Marker position (bar:beat:tick)', this.pos(m.tick)); this.field(form, 'Marker description', m.description ?? '', true, 'Optional');
    }, f => {
      const name = value(f, 'Marker name'), at = value(f, 'Marker position (bar:beat:tick)'), about = value(f, 'Marker description');
      this.edit(() => this.host.session.edit('Edit marker', x => updateMarker(x, m.id, { label: name, tick: this.tick(at), description: about })), f, 'Marker updated.');
    });
    const actions = element(panel, 'div', undefined, 'mnemobard-structure-actions');
    button(actions, 'Jump to marker', () => this.host.locate(m.tick));
    const linked = this.model.data.audioRefs.filter(r => r.markerId === m.id).length;
    button(actions, 'Delete marker', () => this.edit(() => this.host.session.edit('Delete marker', x => deleteMarker(x, m.id)), undefined, `Deleted marker “${m.label}”${linked ? `; ${linked} recording association(s) cleared, records kept` : ''}. Undo restores it.`), 'mod-warning');
  }

  private associationSelects(form: HTMLElement, sectionId?: string, markerId?: string): void {
    for (const [text, items, value] of [['Associated section', orderedSections(this.model), sectionId], ['Associated marker', orderedMarkers(this.model), markerId]] as const) {
      const label = element(form, 'label'); element(label, 'span', text);
      const select = element(label, 'select'); select.setAttribute('aria-label', text);
      element(select, 'option', 'None').value = '';
      for (const item of items as readonly (Section | Marker)[]) element(select, 'option', `${item.label} · ${this.pos(typeof item.tick === 'number' ? item.tick : (item as Section).startTick)}`).value = item.id;
      select.value = value && items.some(i => i.id === value) ? value : '';
    }
  }
  private filePicker(form: HTMLElement, label: string, current = ''): void {
    const search = this.field(form, `Find ${label.toLowerCase()}`, this.search, false, 'Filter vault audio by path');
    const wrap = element(form, 'label'); element(wrap, 'span', label);
    const select = element(wrap, 'select'); select.setAttribute('aria-label', label); select.required = true;
    const hidden = element(form, 'p', '', 'mnemobard-hint'); hidden.dataset.unlinkable = 'true';
    const fill = () => { const { files, hidden: skipped } = this.host.library.recordingCandidates(search.value); hidden.textContent = skipped ? `${skipped} audio file(s) hidden: their paths contain characters a portable vault link cannot store (# [ ] | < > : " ? * or a trailing dot/space). Rename them in Obsidian to reference them.` : ''; hidden.hidden = !skipped; select.replaceChildren(); element(select, 'option', files.length ? 'Choose a vault recording…' : 'No matching audio files').value = ''; for (const f of files) element(select, 'option', `${f.path} · ${size(f.size)}`).value = f.path; if (files.some(f => f.path === current)) select.value = current; };
    search.addEventListener('input', () => { this.search = search.value; fill(); });
    fill();
  }
  private renderReferences(c: Composition): void {
    const box = element(this.groups ?? this.body, 'section', undefined, 'mnemobard-structure-group'), refs = [...c.data.audioRefs].sort((a, b) => a.atTick - b.atTick || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0) || (a.id < b.id ? -1 : 1));
    element(box, 'h3', 'Recording references');
    element(box, 'p', 'Links to existing vault audio (field recordings, memos, rough mixes). Files are never copied, moved, renamed, played, analysed or deleted here.', 'mnemobard-hint');
    const suggestion = this.host.library.relinkSuggestion(c, this.host.sourcePath());
    if (suggestion) {
      const note = element(box, 'div', undefined, 'mnemobard-structure-warning');
      element(note, 'p', `“${suggestion.from}” is missing, and this note's recording link now points to “${suggestion.to}” (likely a rename). Relink ${suggestion.referenceIds.length} reference(s)? Nothing changes until you confirm.`);
      button(note, 'Relink to renamed file', () => this.edit(() => this.host.library.relinkRecording(this.host.session, suggestion.referenceIds, suggestion.to), undefined, 'Relinked. Undo restores the previous path.'));
    }
    const duplicates = this.duplicates(c);
    if (duplicates.length) {
      const note = element(box, 'div', undefined, 'mnemobard-structure-warning'); note.dataset.duplicateLinks = 'true';
      const count = duplicates.reduce((n, d) => n + d.remove.length, 0);
      element(note, 'p', `This note lists ${count} duplicate recording link(s) that Obsidian resolves to the same file as ${duplicates.map(d => d.keep).join(', ')} (left by an earlier relink). Remove the duplicates and keep the exact links? Recording references, their notes and associations, and the audio files are unchanged. One Undo step; Save to write it.`);
      const repair = button(note, 'Remove duplicate recording links', () => this.edit(() => { this.host.library.removeDuplicateMirrors(this.host.session); }, undefined, 'Duplicate recording links removed. Undo restores them.'));
      repair.disabled = this.host.readOnly();
    }
    this.detectRename(c);
    const offer = this.renameOffer;
    if (offer) {
      const note = element(box, 'div', undefined, 'mnemobard-structure-warning'); note.dataset.renameOffer = 'true';
      const count = offer.moves.reduce((n, m) => n + m.referenceIds.length, 0);
      element(note, 'p', `Renamed in the vault: ${offer.moves.map(m => `“${m.from}” → “${m.to}”`).join(', ')}. Obsidian updated this note's recording links, so Save would report a protected conflict. Adopt the updated note and relink ${count} reference(s)? Your unsaved edits stay, this is one Undo step, and nothing is written until you Save.`);
      const adopt = button(note, 'Adopt rename and keep my edits', () => {
        if (this.pending() || this.host.blocked?.()) { this.status('Apply or discard the pending form first.'); return; }
        adopt.disabled = true;
        void this.host.library.adoptRename(this.host.session, offer).then(() => { if (this.closed) return; this.renameOffer = undefined; this.renameKey = ''; this.render(); this.status('Relinked; the renamed note is now the save base. Save to keep your edits.'); })
          .catch(error => { if (this.closed) return; adopt.disabled = false; this.status(messageOf(error)); });
      });
      adopt.disabled = this.host.readOnly();
    }
    if (!refs.length) element(box, 'p', 'No recording references.', 'mnemobard-hint');
    const list = element(box, 'ul', undefined, 'mnemobard-structure-list mnemobard-structure-references');
    for (const r of this.paged(box, 'reference', refs, 'recordings')) this.referenceRow(list, c, r);
    const add = element(box, 'details'); element(add, 'summary', 'Add recording reference');
    const build = (): void => { if (add.dataset.built === 'true') return; add.dataset.built = 'true'; this.addReferenceForm(add); };
    add.addEventListener('toggle', () => { this.addReferenceOpen = add.open; if (add.open) build(); });
    if (this.addReferenceOpen) { add.open = true; build(); }
  }
  private addReferenceForm(add: HTMLElement): void {
    this.form(add, 'Add recording reference', form => {
  this.filePicker(form, 'Recording file');
    this.field(form, 'Reference name', '', false, 'Defaults to the file name');
    this.field(form, 'Reference description', '', true, 'Optional notes');
    this.associationSelects(form);
    this.field(form, 'Timeline anchor (bar:beat:tick)', '', false, 'Blank: marker, else section start, else 1:1:0');
    }, f => {
      const path = value(f, 'Recording file'), name = value(f, 'Reference name').trim() || (path.split('/').at(-1) ?? path).replace(/\.[^.]+$/, ''), anchor = value(f, 'Timeline anchor (bar:beat:tick)').trim();
      this.edit(() => this.host.library.addRecording(this.host.session, { label: name, path, description: value(f, 'Reference description'), sectionId: value(f, 'Associated section') || undefined, markerId: value(f, 'Associated marker') || undefined, atTick: anchor ? this.tick(anchor) : undefined }), f, `Added reference “${name}”. The file was not changed.`);
    });
  }
  private referenceRow(list: HTMLElement, c: Composition, r: RecordingReference): void {
    const item = element(list, 'li'), state = this.host.library.recordingStatus(r.path), selected = this.selected?.kind === 'reference' && this.selected.id === r.id;
    const head = button(item, r.label, () => this.select('reference', r.id), selected ? 'is-selected' : undefined);
    head.dataset.structureId = r.id; head.setAttribute('aria-pressed', String(selected));
    const section = c.data.sections.find(s => s.id === r.sectionId), marker = c.data.markers.find(m => m.id === r.markerId);
    element(item, 'small', [r.path, section ? `Section: ${section.label}` : r.sectionId ? 'Section: (deleted)' : '', marker ? `Marker: ${marker.label}` : r.markerId ? 'Marker: (deleted)' : '', `Anchor ${this.pos(r.atTick)}`].filter(Boolean).join(' · '));
    const availability = element(item, 'p', state.status === 'available' ? `Available · ${size(state.file.size)}` : `⚠ ${state.message}`, state.status === 'available' ? 'mnemobard-hint' : 'mnemobard-structure-warning');
    availability.dataset.recordingState = state.status;
    if (r.description) element(item, 'p', r.description, 'mnemobard-structure-description');
    if (!selected) return;
    if (this.editorRoot) { this.referenceEditor(this.editorRoot, c, r, state); return; }
    this.referenceActions(item, r, state);
  }
  /** 4D inspector context: identity, availability, associations and the same safe actions as the inline row. */
  private referenceEditor(root: HTMLElement, c: Composition, r: RecordingReference, state: ReturnType<CanvasLibrary['recordingStatus']>): void {
    const panel = element(root, 'div', undefined, 'mnemobard-structure-editor'); heading(panel, `Recording · ${r.label}`);
    const section = c.data.sections.find(s => s.id === r.sectionId), marker = c.data.markers.find(m => m.id === r.markerId);
    const facts = element(panel, 'dl', undefined, 'mnemobard-context-facts');
    for (const [term, detail] of [['File', r.path], ['Availability', state.status === 'available' ? `Available · ${size(state.file.size)}` : `⚠ ${state.message}`], ['Section', section ? section.label : r.sectionId ? '(deleted)' : 'None'], ['Marker', marker ? marker.label : r.markerId ? '(deleted)' : 'None'], ['Anchor', this.pos(r.atTick)]] as const) { element(facts, 'dt', term); const dd = element(facts, 'dd', detail); if (term === 'Availability' && state.status !== 'available') dd.className = 'mnemobard-structure-warning'; }
    if (r.description) element(panel, 'p', r.description, 'mnemobard-structure-description');
    this.referenceActions(panel, r, state);
  }
  private referenceActions(item: HTMLElement, r: RecordingReference, state: ReturnType<CanvasLibrary['recordingStatus']>): void {
    const actions = element(item, 'div', undefined, 'mnemobard-structure-actions');
    const open = button(actions, 'Open recording', () => this.host.open(r.path)); open.disabled = state.status !== 'available';
    button(actions, 'Jump to anchor', () => this.host.locate(r.atTick));
    button(actions, 'Edit reference', () => { this.mode = 'edit'; this.render(); });
    button(actions, 'Relink reference', () => { this.mode = 'relink'; this.render(); });
    button(actions, 'Remove reference', () => { this.mode = 'remove'; this.render(); }, 'mod-warning');
    if (this.mode === 'edit') {
      this.form(item, 'Apply reference', form => {
        this.field(form, 'Reference label', r.label); this.field(form, 'Reference notes', r.description ?? '', true, 'Optional'); this.associationSelects(form, r.sectionId, r.markerId); this.field(form, 'Reference anchor (bar:beat:tick)', this.pos(r.atTick));
      }, f => {
        const anchor = value(f, 'Reference anchor (bar:beat:tick)');
        this.mode = undefined;
        this.edit(() => this.host.session.edit('Edit recording reference', x => updateReference(x, r.id, { label: value(f, 'Reference label'), description: value(f, 'Reference notes'), sectionId: value(f, 'Associated section'), markerId: value(f, 'Associated marker'), atTick: this.tick(anchor) })), f, 'Reference updated.');
      });
    } else if (this.mode === 'relink') {
      this.form(item, 'Relink to selected file', form => this.filePicker(form, 'Replacement recording', r.path), f => { this.mode = undefined; this.edit(() => this.host.library.relinkRecording(this.host.session, r.id, value(f, 'Replacement recording')), f, 'Relinked. Identity, notes and associations kept.'); });
    } else if (this.mode === 'remove') {
      const confirm = element(item, 'div', undefined, 'mnemobard-confirm');
      element(confirm, 'p', `Remove the reference “${r.label}” from this composition? The file ${r.path} is not deleted or changed. Undo restores the reference.`);
      button(confirm, 'Remove reference only', () => { this.mode = undefined; this.edit(() => this.host.session.edit('Remove recording reference', x => removeReference(x, r.id)), undefined, `Removed reference “${r.label}”. ${r.path} is untouched.`); }, 'mod-warning');
      button(confirm, 'Keep reference', () => { this.mode = undefined; this.render(); });
    }
  }
  private duplicates(c: Composition): DuplicateMirror[] {
    const key = `${this.fileEpoch}:${this.host.session.changeVersion}:${this.host.sourcePath()}`;
    if (key !== this.duplicateKey) { this.duplicateKey = key; this.duplicateValue = this.host.library.duplicateMirrors(c, this.host.sourcePath()); }
    return this.duplicateValue;
  }
  private detectRename(c: Composition): void {
    const s = this.host.session, missing = c.data.audioRefs.filter(r => this.host.library.recordingStatus(r.path).status === 'missing').map(r => r.path).sort().join('|');
    const key = s.base && missing ? `${this.fileEpoch}:${s.changeVersion}:${missing}` : '';
    if (key === this.renameKey) return;
    this.renameKey = key; const job = ++this.renameJob;
    if (!key) { this.renameOffer = undefined; return; }
    void this.host.library.renameConflict(s).then(offer => { if (this.closed || job !== this.renameJob) return; const changed = !!offer !== !!this.renameOffer; this.renameOffer = offer; if (changed) this.refresh(); }, () => { if (job === this.renameJob) this.renameOffer = undefined; });
  }
  dispose(): void { this.closed = true; this.renameJob++; this.unsubscribe(); if (this.timer !== undefined) clearTimeout(this.timer); this.timer = undefined; }
}
/** Focusable (tabindex -1) heading so keyboard focus can land on the inspector after a selection. */
function heading(parent: HTMLElement, text: string): HTMLElement { const h = element(parent, 'h4', text); h.tabIndex = -1; return h; }
function value(form: HTMLFormElement, label: string): string { return form.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[aria-label="${label}"]`)?.value ?? ''; }
function size(bytes: number): string { return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MiB` : bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} KiB` : `${bytes} B`; }
