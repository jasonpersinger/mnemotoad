import { element, button } from './dom';
import type { ReferenceView } from '../storage/reference-status';

/**
 * 4F shared presentation of one cross-module reference: readable name first (truncated, full name on hover),
 * status + explanation when not ready, one navigation action, UUID only as advanced detail. No writes.
 */
export function referenceRow(parent: HTMLElement, role: string, view: ReferenceView, open?: { label: string; run: () => void }, extra?: string): HTMLElement {
  const row = element(parent, 'div', undefined, 'mnemobard-ref-row'); row.dataset.refStatus = view.status; row.dataset.refId = view.id;
  element(row, 'span', role, 'mnemobard-ref-role');
  const name = element(row, 'span', view.title ?? (view.status === 'missing' ? 'Missing record' : 'Unavailable record'), 'mnemobard-ref-name'); name.title = view.title ?? view.id;
  if (extra) element(row, 'span', extra, 'mnemobard-ref-extra');
  if (view.status !== 'ready') element(row, 'span', view.status === 'wrong-kind' ? 'wrong kind' : view.status, 'mnemobard-ref-badge');
  if (open && (view.status === 'ready' || view.status === 'archived')) button(row, open.label, open.run).setAttribute('aria-label', `${open.label}: ${view.title ?? view.id}`);
  if (view.message) element(row, 'p', view.message, 'mnemobard-ref-message');
  const advanced = element(row, 'details', undefined, 'mnemobard-ref-advanced'); element(advanced, 'summary', 'ID');
  element(advanced, 'code', view.id); if (view.path) element(advanced, 'code', view.path); for (const p of view.paths ?? []) element(advanced, 'code', p);
  return row;
}
