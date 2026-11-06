import type { LibraryEntity, EffectStep, Patch } from '../../domain/entities';
import type { PatchbookLibrary } from './library';
import type { LibrarySession } from './session';

import { element, button } from '../../ui/dom';
export { element, button } from '../../ui/dom';
type TextControl = HTMLInputElement | HTMLTextAreaElement;
function field(parent: HTMLElement, label: string, value: string, change: (value: string) => void, multiline = false): TextControl {
  const wrapper = element(parent, 'label', undefined, 'mnemobard-field'); element(wrapper, 'span', label);
  const input = multiline ? element(wrapper, 'textarea') : element(wrapper, 'input');
  input.value = value; input.setAttribute('aria-label', label); input.addEventListener('input', () => change(input.value));
  if (multiline) (input as HTMLTextAreaElement).rows = 3;
  return input;
}
const optional = (value: string): string | undefined => value.trim() ? value : undefined;
function lines(value: string): string[] { return value.split(/\r?\n/).map(v => v.trim()).filter(Boolean); }
function links(value: string): string[] { return lines(value).map(v => v.startsWith('[[') ? v : `[[${v}]]`); }

/** Native controls; all edits update the shared draft rather than live vault files. */
export function renderLibraryForm(parent: HTMLElement, session: LibrarySession, library: PatchbookLibrary, save: () => void, cancel: () => void, renderAssets?: (root: HTMLElement) => void): HTMLFormElement {
  const draft = session.draft, form = element(parent, 'form', undefined, 'mnemobard-record-form');
  form.setAttribute('aria-label', `Edit ${draft.kind}`);
  const mutate = (change: (value: LibraryEntity) => void): void => { const value = session.draft; change(value); session.update(value); };
  const title = field(form, 'Name', draft.title, value => mutate(e => { e.title = value; })); title.required = true; title.maxLength = 1000;
  if (draft.kind === 'instrument') {
    const group = element(form, 'div', undefined, 'mnemobard-form-grid');
    field(group, 'Manufacturer / developer', draft.manufacturer ?? '', v => mutate(e => { if (e.kind === 'instrument') e.manufacturer = optional(v); }));
    field(group, 'Instrument type', draft.instrumentType ?? '', v => mutate(e => { if (e.kind === 'instrument') e.instrumentType = optional(v); }));
    field(group, 'Platform / format', draft.platform ?? '', v => mutate(e => { if (e.kind === 'instrument') e.platform = optional(v); }));
  }
  if (draft.kind === 'patch') {
    const wrapper = element(form, 'label', undefined, 'mnemobard-field'); element(wrapper, 'span', 'Instrument');
    const select = element(wrapper, 'select'); select.setAttribute('aria-label', 'Instrument');
    const instruments = library.query({ kind: 'instrument' }).filter(item => !item.ambiguous);
    const choices = new Map(instruments.map(item => [item.entity.id.toLowerCase(), item.entity.title]));
    if (draft.instrumentId && !choices.has(draft.instrumentId.toLowerCase())) choices.set(draft.instrumentId.toLowerCase(), `Unavailable instrument · ${draft.instrument || draft.instrumentId}`);
    const first = element(select, 'option', session.base ? `Text only · ${draft.instrument}` : 'Choose an instrument'); first.value = '';
    for (const [id, label] of choices) { const option = element(select, 'option', label); option.value = id; }
    select.value = draft.instrumentId?.toLowerCase() ?? ''; select.required = !session.base;
    select.addEventListener('change', () => mutate(e => {
      if (e.kind !== 'patch') return;
      e.instrumentId = optional(select.value); delete e.instrumentLink;
      if (select.value) e.instrument = choices.get(select.value) ?? e.instrument;
    }));
    if (!instruments.length) element(form, 'p', 'Create an instrument in the Instruments register first. This patch draft will remain available.', 'mnemobard-hint');
    if (session.base && !draft.instrumentId) field(form, 'Instrument name (text record)', draft.instrument, v => mutate(e => { if (e.kind === 'patch') e.instrument = v; }));
    const group = element(form, 'div', undefined, 'mnemobard-form-grid');
    for (const [label, key] of [['Category', 'category'], ['Mood / character', 'character'], ['Preset name', 'preset'], ['Manufacturer / developer', 'manufacturer']] as const) {
      field(group, label, draft[key] ?? '', v => mutate(e => { if (e.kind === 'patch') e[key] = optional(v); }));
    }
    field(form, 'Parameter notes', draft.parameterNotes ?? '', v => mutate(e => { if (e.kind === 'patch') e.parameterNotes = optional(v); }), true);
    parameters(form, session, mutate);
    const chains = element(form, 'fieldset', undefined, 'mnemobard-associations'); element(chains, 'legend', 'Reusable effects chains');
    const options = new Map(library.query({ kind: 'effects-chain' }).filter(item => !item.ambiguous).map(item => [item.entity.id.toLowerCase(), item.entity.title]));
    for (const id of draft.effectsChainIds ?? []) if (!options.has(id.toLowerCase())) options.set(id.toLowerCase(), `Unavailable chain · ${id}`);
    if (!options.size) element(chains, 'p', 'No chains yet. Create one in the Effects chains register.', 'mnemobard-hint');
    for (const [id, label] of options) {
      const row = element(chains, 'label'); const checkbox = element(row, 'input'); checkbox.type = 'checkbox'; checkbox.value = id;
      checkbox.setAttribute('aria-label', `Effects chain: ${label}`); checkbox.checked = draft.effectsChainIds?.some(ref => ref.toLowerCase() === id) ?? false; element(row, 'span', label);
      checkbox.addEventListener('change', () => mutate(e => {
        if (e.kind !== 'patch') return;
        const ids = e.effectsChainIds ?? []; e.effectsChainIds = checkbox.checked ? [...ids.filter(x => x.toLowerCase() !== id), id] : ids.filter(x => x.toLowerCase() !== id);
        delete e.effectsChainLinks; // Regenerated from stable IDs by the application service.
      }));
    }
    if (draft.effects?.length) field(form, 'Existing effect descriptions (one per line)', draft.effects.join('\n'), v => mutate(e => { if (e.kind === 'patch') e.effects = lines(v); }), true);
  }
  if (draft.kind === 'effects-chain') effects(form, session, mutate);
  field(form, 'Description', draft.description ?? '', v => mutate(e => { e.description = optional(v); }), true);
  field(form, 'Tags (comma-separated)', draft.tags?.join(', ') ?? '', v => mutate(e => { e.tags = [...new Set(v.split(',').map(t => t.trim()).filter(Boolean))]; }));
  field(form, 'General notes', draft.notes ?? '', v => mutate(e => { e.notes = optional(v); }), true);
  renderAssets?.(form);
  const assets = element(form, 'details', undefined, 'mnemobard-assets-form'); element(assets, 'summary', 'Advanced references and external links');
  element(assets, 'p', 'Portable vault paths or [[links]], one per line. Prefer the asset selector for validated references.', 'mnemobard-hint');
  for (const [role, label] of [['preset', 'Preset files'], ['image', 'Screenshots'], ['audio', 'Audio previews']] as const) {
    field(assets, label, (draft.assets ?? []).filter(a => a.role === role).map(a => a.link).join('\n'), v => mutate(e => { e.assets = [...(e.assets ?? []).filter(a => a.role !== role), ...links(v).map(link => ({ role, link }))]; }), true);
  }
  field(assets, 'External references (http/https, one per line)', draft.externalReferences?.join('\n') ?? '', v => mutate(e => { e.externalReferences = lines(v); }), true);
  element(form, 'p', 'Custom properties and free-form Markdown remain available in the underlying note. PATCHBOOK preserves them.', 'mnemobard-hint');
  const actions = element(form, 'div', undefined, 'mnemobard-actions');
  const submit = element(actions, 'button', 'Save record', 'mod-cta'); submit.type = 'submit'; submit.dataset.action = 'save';
  button(actions, 'Keep draft & close form', cancel);
  form.addEventListener('submit', event => { event.preventDefault(); save(); });
  return form;
}
function parameters(parent: HTMLElement, session: LibrarySession, mutate: (change: (e: LibraryEntity) => void) => void): void {
  const section = element(parent, 'details'); element(section, 'summary', 'Structured parameters'); const rows = element(section, 'div');
  const render = (): void => {
    rows.replaceChildren(); const current = session.draft; if (current.kind !== 'patch') return;
    (current.parameters ?? []).forEach((parameter, index) => {
      const row = element(rows, 'div', undefined, 'mnemobard-effect-step');
      const update = (change: (p: NonNullable<Patch['parameters']>[number]) => void): void => mutate(e => { if (e.kind === 'patch' && e.parameters?.[index]) change(e.parameters[index]); });
      field(row, `Parameter ${index + 1} name`, parameter.name, v => update(p => { p.name = v; }));
      field(row, `Parameter ${index + 1} value`, String(parameter.value), v => update(p => { p.value = typeof parameter.value === 'number' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : v; }));
      field(row, `Parameter ${index + 1} unit`, parameter.unit ?? '', v => update(p => { if (v.trim()) p.unit = v; else delete p.unit; }));
      button(row, 'Remove parameter', () => { mutate(e => { if (e.kind === 'patch') e.parameters?.splice(index, 1); }); render(); });
    });
  };
  button(section, 'Add parameter', () => { mutate(e => { if (e.kind === 'patch') (e.parameters ??= []).push({ name: '', value: '' }); }); render(); }); render();
}
function effects(parent: HTMLElement, session: LibrarySession, mutate: (change: (e: LibraryEntity) => void) => void): void {
  const section = element(parent, 'section'); element(section, 'h3', 'Signal path');
  element(section, 'p', 'Effects run top to bottom in this documentation. No audio is processed.', 'mnemobard-hint');
  const rows = element(section, 'div');
  const render = (): void => {
    rows.replaceChildren(); const current = session.draft; if (current.kind !== 'effects-chain') return;
    current.steps.forEach((step, index) => {
      const row = element(rows, 'fieldset', undefined, 'mnemobard-effect-step'); element(row, 'legend', `Stage ${String(index + 1).padStart(2, '0')}`);
      const update = (change: (value: EffectStep) => void): void => mutate(e => { if (e.kind === 'effects-chain') { const item = e.steps.find(s => s.id === step.id); if (item) change(item); } });
      field(row, `Processor ${index + 1}`, step.name, v => update(s => { s.name = v; }));
      field(row, `Stage ${index + 1} parameter notes`, step.parameterNotes ?? '', v => update(s => { if (v.trim()) s.parameterNotes = v; else delete s.parameterNotes; }), true);
      field(row, `Stage ${index + 1} preset reference`, step.presetLink ?? '', v => update(s => { if (v.trim()) s.presetLink = v.startsWith('[[') ? v : `[[${v}]]`; else delete s.presetLink; }));
      const actions = element(row, 'div', undefined, 'mnemobard-actions');
      const reorder = (offset: number): void => { mutate(e => { if (e.kind === 'effects-chain') { const [item] = e.steps.splice(index, 1); if (item) e.steps.splice(index + offset, 0, item); } }); render(); };
      button(actions, 'Move stage up', () => reorder(-1)).disabled = index === 0;
      button(actions, 'Move stage down', () => reorder(1)).disabled = index === current.steps.length - 1;
      button(actions, 'Remove stage', () => { mutate(e => { if (e.kind === 'effects-chain') e.steps = e.steps.filter(item => item.id !== step.id); }); render(); });
    });
  };
  button(section, 'Add effect', () => { mutate(e => { if (e.kind === 'effects-chain') e.steps.push({ id: crypto.randomUUID(), name: '' }); }); render(); }); render();
}
