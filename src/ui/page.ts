import { element } from './dom';
import { mascotMark } from './mascot';

/**
 * 4J shared page structure. Every module view starts with the same compact header (module identity on the left, the
 * module's own actions on the right, one row on wide panes) and keeps secondary document actions in one labelled
 * disclosure. Existing per-module class names are kept alongside the shared ones (scripts and styles target both).
 */
export function moduleHeader(root: HTMLElement, options: { className: string; eyebrow: string; title: string; tagline?: string; taglineClass?: string }): { header: HTMLElement; identity: HTMLElement; actions: HTMLElement } {
  const header = element(root, 'header', undefined, `mnemobard-module-header ${options.className}`);
  mascotMark(header, 2); // decorative product mark (the eyebrow names the product)
  const identity = element(header, 'div', undefined, 'mnemobard-module-identity');
  element(identity, 'p', options.eyebrow, 'mnemobard-eyebrow');
  element(identity, 'h2', options.title);
  if (options.tagline) element(identity, 'p', options.tagline, options.taglineClass ?? 'mnemobard-hint');
  const actions = element(header, 'div', undefined, 'mnemobard-actions mnemobard-module-actions');
  return { header, identity, actions };
}
/**
 * Secondary and destructive document actions, one click away and never competing with the primary action. Buttons keep
 * their labels and handlers; only their placement changes.
 */
export function recordActions(parent: HTMLElement, label = 'Record actions', className?: string): HTMLDetailsElement {
  const details = element(parent, 'details', undefined, `mnemobard-record-actions${className ? ` ${className}` : ''}`);
  element(details, 'summary', label);
  return details;
}
