/** Saved source-text revision awareness; never replaces conditional full-source save checks. */
export async function contentRevision(source: string): Promise<string> {
    if (!globalThis.crypto?.subtle)
        throw Error('This runtime cannot compute saved-source SHA256 revisions. Reopen in supported desktop Obsidian.');
    const bytes = new TextEncoder().encode(source), digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
