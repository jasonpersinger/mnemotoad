import type { Motif } from '../../domain/entities';
import type { FoundationServices } from '../../application/services';
import { element } from '../../ui/dom';
import { referenceRow } from '../../ui/reference-row';
import { ReferenceLookup } from '../../storage/reference-status';

/**
 * 4F MOTIF context: the motif's sound chain (patch → instrument → effects chains) and the saved compositions that place it.
 * Read-only; re-renders only when the index revision or the association changes (not on every note edit).
 */
export class MotifLinks {
  private readonly body: HTMLElement;
  private key = '';
  constructor(root: HTMLElement, private readonly services: FoundationServices, private readonly openLibrary: (id: string) => void, private readonly openComposition: (id: string, motifId: string) => void) {
    const details = element(root, 'details', undefined, 'mnemobard-motif-links'); details.open = true; element(details, 'summary', 'Sound and usage');
    this.body = element(details, 'div');
  }
  refresh(motif: Motif): void {
    const key = `${this.services.index.currentRevision}:${motif.id}:${motif.patchId ?? ''}`; if (key === this.key) return; this.key = key;
    const root = this.body, index = this.services.index, lookup = new ReferenceLookup(index); root.replaceChildren();
    const sound = element(root, 'section', undefined, 'mnemobard-ref-group'); sound.setAttribute('aria-label', 'Sound associations'); element(sound, 'h4', 'Sound');
    const library = (id: string) => ({ label: 'Open in PATCHBOOK', run: () => this.openLibrary(id) });
    if (!motif.patchId) element(sound, 'p', 'No patch associated. Choose one under PATCHBOOK context; nothing is associated automatically.', 'mnemobard-hint');
    else {
      const patch = lookup.describe(motif.patchId, 'patch'); referenceRow(sound, 'Patch', patch, library(motif.patchId));
      const state = patch.status === 'ready' || patch.status === 'archived' ? index.resolve(motif.patchId) : undefined;
      if (state?.status === 'ready' && state.entity.kind === 'patch') {
        if (state.entity.instrumentId) referenceRow(sound, 'Instrument', lookup.describe(state.entity.instrumentId, 'instrument'), library(state.entity.instrumentId));
        else if (state.entity.instrument) element(sound, 'p', `Instrument (text only): ${state.entity.instrument}`, 'mnemobard-hint');
        for (const chain of state.entity.effectsChainIds ?? []) referenceRow(sound, 'Effects chain', lookup.describe(chain, 'effects-chain'), library(chain));
      }
    }
    const used = index.referencing(motif.id, 'composition'), usage = element(root, 'section', undefined, 'mnemobard-ref-group'); usage.setAttribute('aria-label', 'Compositions using this motif');
    element(usage, 'h4', `Used in saved compositions · ${used.length}`);
    if (!used.length) element(usage, 'p', 'No saved composition places this motif yet. Unsaved CANVAS drafts are not listed.', 'mnemobard-hint');
    for (const c of used.slice(0, 50)) referenceRow(usage, 'Composition', { id: c.id, expected: 'composition', status: 'ready', title: c.title, path: c.path, message: '' }, { label: 'Open in CANVAS', run: () => this.openComposition(c.id, motif.id) }, `${c.count} placement${c.count === 1 ? '' : 's'}`);
    if (used.length > 50) element(usage, 'p', `${used.length - 50} more compositions; search the CANVAS library.`, 'mnemobard-hint');
  }
}
