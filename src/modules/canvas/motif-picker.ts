import { Modal, type App } from 'obsidian';
import { element, button } from '../../ui/dom';
import { positionTick, musicalPosition } from '../../music/positions';
import { messageOf } from '../../domain/errors';
import type { CanvasLibrary } from './library';
import type { CanvasSession } from './session';
export class ArrangementMotifPicker extends Modal {
    private active = false;
    constructor(app: App, private readonly library: CanvasLibrary, private readonly session: CanvasSession, private readonly laneId: string, private readonly start: number, private readonly placed: () => void) { super(app); }
    override onOpen(): void {
        this.active = true;
        const root = this.contentEl;
        root.classList.add('mnemobard-canvas-picker');
        element(root, 'h2', 'Place a saved motif');
        element(root, 'p', 'Live reference to a saved UUID. Source notes are never copied into the composition. Unsaved MOTIF edits are excluded.');
        const label = element(root, 'label');
        element(label, 'span', 'Search saved motifs');
        const search = element(label, 'input');
        search.type = 'search';
        search.setAttribute('aria-label', 'Search saved motifs');
        const choose = element(root, 'select');
        choose.setAttribute('aria-label', 'Saved motif to place');
        const inventory = element(root, 'p'), detail = element(root, 'p'), fields = element(root, 'form');
        fields.setAttribute('aria-label', 'Place motif clip');
        const posLabel = element(fields, 'label');
        element(posLabel, 'span', 'Placement (bar:beat:tick)');
        const position = element(posLabel, 'input');
        position.value = musicalPosition(this.start, 960, this.session.draft.data.meter);
        position.setAttribute('aria-label', 'Placement (bar:beat:tick)');
        const countLabel = element(fields, 'label');
        element(countLabel, 'span', 'Repetitions');
        const count = element(countLabel, 'input');
        count.type = 'number';
        count.min = '1';
        count.max = '1000';
        count.step = '1';
        count.value = '1';
        count.required = true;
        count.setAttribute('aria-label', 'Placement repetitions');
        const submit = element(fields, 'button', 'Place motif clip');
        submit.type = 'submit';
        submit.className = 'mod-cta';
        const status = element(root, 'p');
        status.setAttribute('role', 'status');
        const describe = () => { const source = this.library.sources.get(choose.value); detail.textContent = source.status === 'ready' ? `${source.source.title} · PPQ ${source.source.ppq} · complete length ${source.source.lengthTicks} source ticks · ${source.source.noteCount} notes. Exact conversion is validated on placement.` : 'Choose one saved motif. Missing, archived, ambiguous and unsupported sources must be repaired first.'; submit.disabled = source.status !== 'ready'; };
        const list = () => { const matches = this.library.sources.items(search.value); choose.replaceChildren(); element(choose, 'option', 'Select a saved motif').value = ''; for (const state of matches.slice(0, 100))
            if (state.status === 'ready') {
                const option = element(choose, 'option', `${state.source.title} · ${state.source.lengthTicks}/${state.source.ppq} quarters`);
                option.value = state.source.id;
            } inventory.textContent = `${matches.length} matches · at most100 shown; refine search. The full motif length includes trailing silence.`; describe(); };
        search.addEventListener('input', list);
        choose.addEventListener('change', describe);
        list();
        fields.addEventListener('submit', event => { event.preventDefault(); if (!this.active || this.session.disposed)
            return; try {
            const current = this.session.draft, tick = positionTick(position.value, current.data.ppq, current.data.meter);
            this.library.place(this.session, this.laneId, choose.value, tick, Number(count.value));
            this.placed();
            this.close();
        }
        catch (error) {
            status.textContent = messageOf(error);
        } });
        button(root, 'Cancel placement', () => this.close());
        search.focus();
    }
    override onClose(): void { this.active = false; this.contentEl.replaceChildren(); }
}
