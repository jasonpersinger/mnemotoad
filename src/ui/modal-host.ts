/**
 * Milestone 4D host-stability guard for Obsidian modals.
 *
 * Observed host condition (4C, reproduced on the signed 4B build): after some cold restarts Obsidian's
 * public `activeDocument`/`activeWindow` can still reference a closed popout. A Modal then mounts into
 * that detached document: invisible and inert, so its operation silently never completes.
 *
 * This guard only reads the public globals and asks the owner's own window to take focus — the same
 * signal Obsidian uses to track the active window. It never writes host/private state or patches the DOM.
 * If the condition persists, the modal is not opened and the caller reports an actionable message.
 */
// 4F native evidence (output/mnemobard/milestone-4f/stale-window-evidence.json): clicking inside the pane, activating the leaf or
// switching tabs did NOT repair the stale state; only a real window focus event did. Advise an application switch.
export const MODAL_HOST_MESSAGE = 'Obsidian is still tracking a closed window as active, so the dialog would open invisibly. Switch to another application and back to Obsidian (clicking inside the pane may not be enough), then try again. Nothing was changed.';

interface HostGlobals { activeDocument?: Document; activeWindow?: Window }

/** A document can show a dialog only while its window is open and attached. */
export function liveDocument(doc: Document | undefined): boolean {
  const view = doc?.defaultView;
  return !!doc && !!view && !view.closed && !!doc.body?.isConnected;
}

/** True when the host's active document (where Obsidian mounts modals) can display one. */
export function modalHostReady(owner: HTMLElement, globals: HostGlobals = globalThis as unknown as HostGlobals): boolean {
  const active = globals.activeDocument ?? owner.ownerDocument;
  return liveDocument(active) && !(globals.activeWindow?.closed ?? false);
}

/**
 * Opens `modal` only when the host can show it. On a stale active document, focuses the owner's window once
 * (host-supported repair) and re-checks; otherwise reports and returns false so no operation is left pending.
 */
export function openModal(owner: HTMLElement, modal: { open(): void }, report: (message: string) => void, globals: HostGlobals = globalThis as unknown as HostGlobals): boolean {
  if (!modalHostReady(owner, globals)) {
    try { owner.ownerDocument.defaultView?.focus(); } catch { /* focus is best-effort */ }
    if (!modalHostReady(owner, globals)) { report(MODAL_HOST_MESSAGE); return false; }
  }
  modal.open();
  return true;
}
