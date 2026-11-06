import { button, element } from '../../ui/dom';
import { changeNotes, noteName } from './commands';
import type { MotifSession } from './session';
export class NoteInspector {
  private signature = ''; private page = 0;
  constructor(private readonly root: HTMLElement, private readonly session: MotifSession, private readonly changed: () => void, private readonly selected: (id: string, additive: boolean) => void, private readonly fail: (error: unknown) => void) {}
  focusNote(id: string): void { const notes = this.session.draft.data.notes.slice().sort((a, b) => a.startTick - b.startTick || a.pitch - b.pitch || a.id.localeCompare(b.id)); const index = notes.findIndex(note => note.id === id); if (index >= 0) this.page = Math.floor(index / 50); this.refresh(); [...this.root.querySelectorAll<HTMLElement>('[data-note-id]')].find(node => node.dataset.noteId === id)?.focus(); }
  refresh(): void {
    const motif = this.session.draft, chosen = [...this.session.selected], signature = JSON.stringify([motif.data.notes, chosen, this.page]);
    if (this.signature === signature) return; this.signature = signature;
    const focused = this.root.contains(this.root.ownerDocument.activeElement) ? this.root.ownerDocument.activeElement?.getAttribute('aria-label') : null;
    this.root.replaceChildren(); const selected = motif.data.notes.find(note => note.id === chosen.at(-1));
    const header = element(this.root, 'div', undefined, 'mnemobard-note-inspector-heading'); element(header, 'h3', 'Note register'); element(header, 'span', `${motif.data.notes.length} notes / ${chosen.length} selected`);
    if (selected) {
      const form = element(this.root, 'form', undefined, 'mnemobard-note-properties'); form.setAttribute('aria-label', 'Selected note properties');
      const controls = new Map<string, HTMLInputElement>();
      for (const [label, key, min, max] of [['Pitch', 'pitch', 0, 127], ['Start tick', 'startTick', 0, motif.data.lengthTicks - 1], ['Duration ticks', 'durationTicks', 1, motif.data.lengthTicks], ['Velocity', 'velocity', 1, 127]] as const) {
        const wrapper = element(form, 'label'); element(wrapper, 'span', label); const input = element(wrapper, 'input'); input.type = 'number'; input.step = '1'; input.min = String(min); input.max = String(max); input.required = true; input.value = String(selected[key]); input.setAttribute('aria-label', label); controls.set(key, input);
      }
      const apply = element(form, 'button', 'Apply to primary note'); apply.type = 'submit'; apply.setAttribute('aria-label', 'Apply to primary note');
      const pending = element(form, 'p'); pending.setAttribute('role', 'status');
      form.addEventListener('input', () => { form.dataset.pending = 'true'; pending.textContent = 'Unapplied note properties'; });
      button(form, 'Discard note changes', () => { this.signature = ''; this.refresh(); });
      element(form, 'p', `Primary: ${noteName(selected.pitch)}. Exact source ticks; applying does not snap. Other selected notes remain unchanged.`, 'mnemobard-hint');
      form.addEventListener('submit', event => {
        event.preventDefault(); try {
          const values = Object.fromEntries([...controls].map(([key, control]) => [key, Number(control.value)]));
          this.session.edit('Edit note properties', motif => changeNotes(motif, new Set([selected.id]), note => ({ ...note, ...values })));
          delete form.dataset.pending; pending.textContent = ''; this.changed();
        } catch (error) { this.fail(error); }
      });
    } else element(this.root, 'p', 'Select a note on the roll or in the list. Numeric controls use exact source ticks.', 'mnemobard-hint');
    const sorted = motif.data.notes.slice().sort((a, b) => a.startTick - b.startTick || a.pitch - b.pitch || a.id.localeCompare(b.id));
    this.page = Math.min(this.page, Math.max(0, Math.ceil(sorted.length / 50) - 1));
    const list = element(this.root, 'div', undefined, 'mnemobard-note-list'); list.setAttribute('aria-label', 'Accessible note list');
    for (const note of sorted.slice(this.page * 50, this.page * 50 + 50)) {
      const text = `${noteName(note.pitch)} · pitch ${note.pitch} · tick ${note.startTick} · duration ${note.durationTicks} · velocity ${note.velocity}`;
      const control = button(list, text, () => {}); control.dataset.noteId = note.id; control.setAttribute('aria-label', text); control.setAttribute('aria-pressed', String(this.session.selected.has(note.id)));
      control.addEventListener('click', event => this.selected(note.id, event.shiftKey || event.ctrlKey || event.metaKey));
    }
    const pages = element(this.root, 'div', undefined, 'mnemobard-actions');
    if (this.page > 0) button(pages, 'Previous notes', () => { this.page--; this.refresh(); });
    if ((this.page + 1) * 50 < sorted.length) button(pages, 'More notes', () => { this.page++; this.refresh(); });
    element(pages, 'span', `Page ${this.page + 1} · up to50 rows`);
    if (focused) [...this.root.querySelectorAll<HTMLElement>('[aria-label]')].find(node => node.getAttribute('aria-label') === focused)?.focus();
  }
}
