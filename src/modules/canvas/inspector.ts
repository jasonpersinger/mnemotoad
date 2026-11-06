import { element, button } from '../../ui/dom';
import { musicalPosition, positionTick } from '../../music/positions';
import { diagnosticText, type ArrangementPlan } from '../../arrangement/preflight';
import { findClip, deleteClip } from './commands';
import type { CanvasSession } from './session';
import type { CanvasLibrary } from './library';
export function clipInspector(root: HTMLElement, session: CanvasSession, library: CanvasLibrary, plan: ArrangementPlan, apply: (fn: () => void, form?: HTMLFormElement) => boolean, refresh: () => void, open: (id: string) => void): void {
    const expanded = root.querySelector('details')?.open ?? false;
    const composition = session.draft, id = session.selectedClip;
    root.replaceChildren();
    if (!id) {
        element(root, 'p', 'Select a clip to edit position, repetitions and source review. Use Place motif or double-click empty timeline.', 'mnemobard-hint');
        return;
    }
    const { lane, clip } = findClip(composition, id), resolved = plan.clips.find(c => c.id === id);
    element(root, 'h3', resolved?.title ?? clip.sourceTitle ?? 'Selected clip');
    element(root, 'p', `Lane: ${lane.name} · source UUID ${clip.motifId}`, 'mnemobard-hint');
    const form = element(root, 'form', undefined, 'mnemobard-canvas-clip-form');
    form.setAttribute('aria-label', 'Clip placement');
    const field = (label: string, value: string): HTMLInputElement => { const wrapper = element(form, 'label'); element(wrapper, 'span', label); const input = element(wrapper, 'input'); input.value = value; input.setAttribute('aria-label', label); return input; };
    const position = field('Clip position (bar:beat:tick)', musicalPosition(clip.startTick, 960, composition.data.meter)), start = field('Clip raw start tick', String(clip.startTick));
    start.type = 'number';
    start.min = '0';
    start.step = '1';
    const repeats = field('Clip repetitions', String(clip.repeatCount));
    repeats.type = 'number';
    repeats.min = '1';
    repeats.max = '1000';
    repeats.step = '1';
    repeats.required = true;
    const label = field('Clip label', clip.label ?? '');
    const laneLabel = element(form, 'label');
    element(laneLabel, 'span', 'Clip lane');
    const target = element(laneLabel, 'select');
    target.setAttribute('aria-label', 'Clip lane');
    for (const l of composition.data.lanes) {
        const option = element(target, 'option', l.name);
        option.value = l.id;
    }
    target.value = lane.id;
    let positionEdited = true;
    const pending = element(form, 'span');
    pending.setAttribute('role', 'status');
    form.addEventListener('input', e => { form.dataset.pending = 'true'; pending.textContent = 'Unapplied clip properties'; if (e.target === position)
        positionEdited = true;
    else if (e.target === start) {
        positionEdited = false;
        const tick = Number(start.value);
        if (Number.isSafeInteger(tick) && tick >= 0 && tick <= 1e9)
            position.value = musicalPosition(tick, 960, composition.data.meter);
    } });
    target.addEventListener('change', () => { form.dataset.pending = 'true'; pending.textContent = 'Unapplied clip properties'; });
    const submit = element(form, 'button', 'Apply clip placement');
    submit.type = 'submit';
    submit.className = 'mod-cta';
    button(form, 'Discard clip changes', () => { delete form.dataset.pending; refresh(); });
    form.addEventListener('submit', e => { e.preventDefault(); apply(() => { const tick = positionEdited ? positionTick(position.value, 960, session.draft.data.meter) : Number(start.value); library.move(session, id, target.value, tick, Number(repeats.value), label.value); delete form.dataset.pending; }, form); });
    const actions = element(root, 'div', undefined, 'mnemobard-actions');
    button(actions, 'Duplicate clip', () => apply(() => library.duplicate(session, id)));
    button(actions, 'Delete clip', () => apply(() => session.edit('Delete clip', c => deleteClip(c, id))));
    button(actions, 'Open source MOTIF', () => open(clip.motifId));
    const source = resolved?.source;
    const review = element(root, 'details', undefined, 'mnemobard-canvas-source-review');
    review.open = expanded;
    element(review, 'summary', 'Review saved source');
    element(review, 'p', `Reviewed title/path: ${clip.sourceTitle ?? 'unrecorded'} · ${clip.sourcePath ?? 'unrecorded'}. Current: ${source?.title ?? 'unresolved'} · ${source?.path ?? 'unresolved'}.`);
    element(review, 'p', `Reviewed: ${clip.sourceRevision ?? 'not recorded'} · period ${clip.reviewedLengthTicks ?? 'unknown'} arrangement ticks`);
    element(review, 'p', `Current: ${source?.revision ?? 'unresolved'} · period ${resolved?.periodTicks ?? 'incompatible/unknown'} ticks · ${source?.noteCount ?? '?'} notes`);
    if (source)
        button(review, 'Acknowledge displayed source revision', () => apply(() => library.review(session, id, source.revision)));
    for (const diagnostic of plan.diagnostics.filter(d => d.clipId === id)) {
        const p = element(root, 'p', `${diagnostic.severity.toUpperCase()}: ${diagnosticText(diagnostic)}`);
        p.dataset.diagnostic = diagnostic.code;
    }
}
