// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { liveDocument, modalHostReady, openModal, MODAL_HOST_MESSAGE } from '../src/ui/modal-host';
/** 4D: stale activeDocument (closed popout) must never mount an invisible modal. */
const owner = () => { const el = document.createElement('div'); document.body.append(el); return el; };
it('treats the attached main document as live and a detached/closed one as not', () => {
    expect(liveDocument(document)).toBe(true);
    const detached = document.implementation.createHTMLDocument('closed popout'); expect(detached.defaultView).toBeNull(); expect(liveDocument(detached)).toBe(false);
    expect(liveDocument(undefined)).toBe(false);
});
it('opens normally when the active document is valid (or absent in non-Obsidian hosts)', () => {
    const modal = { open: vi.fn() }, report = vi.fn();
    expect(openModal(owner(), modal, report, { activeDocument: document, activeWindow: window })).toBe(true);
    expect(openModal(owner(), modal, report, {})).toBe(true); expect(modal.open).toHaveBeenCalledTimes(2); expect(report).not.toHaveBeenCalled();
});
it('refuses and reports when the active document is detached and focus does not repair it', () => {
    const modal = { open: vi.fn() }, report = vi.fn(), el = owner(), focus = vi.spyOn(window, 'focus').mockImplementation(() => undefined);
    const globals = { activeDocument: document.implementation.createHTMLDocument('stale'), activeWindow: window };
    expect(modalHostReady(el, globals)).toBe(false); expect(openModal(el, modal, report, globals)).toBe(false);
    expect(focus).toHaveBeenCalledTimes(1); expect(modal.open).not.toHaveBeenCalled(); expect(report).toHaveBeenCalledWith(MODAL_HOST_MESSAGE); focus.mockRestore();
});
it('opens after the host-supported focus repair updates the active document', () => {
    const modal = { open: vi.fn() }, report = vi.fn(), el = owner(), globals: { activeDocument?: Document; activeWindow?: Window } = { activeDocument: document.implementation.createHTMLDocument('stale'), activeWindow: window };
    const focus = vi.spyOn(window, 'focus').mockImplementation(() => { globals.activeDocument = document; });
    expect(openModal(el, modal, report, globals)).toBe(true); expect(modal.open).toHaveBeenCalledOnce(); expect(report).not.toHaveBeenCalled(); focus.mockRestore();
});
it('refuses when the active window reports closed', () => {
    const modal = { open: vi.fn() }, report = vi.fn(), focus = vi.spyOn(window, 'focus').mockImplementation(() => undefined);
    expect(openModal(owner(), modal, report, { activeDocument: document, activeWindow: { closed: true } as Window })).toBe(false); expect(modal.open).not.toHaveBeenCalled(); focus.mockRestore();
});
