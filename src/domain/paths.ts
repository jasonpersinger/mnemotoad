import { FoundationError } from './errors';

/** Validate before host normalizePath: normalization alone is not containment. */
export function vaultPath(value: string): string {
  if (!value || value.trim() !== value || value.startsWith('/') || value.includes('\\') ||
      [...value].some(c => c.charCodeAt(0) < 32 || '<>:"|?*#[]'.includes(c)) || value.split('/').some(p =>
        !p || p === '.' || p === '..' || /[. ]$/.test(p) ||
        /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) {
    throw new FoundationError('invalid', 'Use a portable vault-relative path without traversal, reserved names, or URI schemes.');
  }
  return value;
}

export function assetLink(value: string): string {
  const match = /^\[\[([^\]\r\n|#]+)\]\]$/.exec(value);
  if (!match?.[1]) throw new FoundationError('invalid', 'Use a quoted vault wikilink such as [[Assets/preview.wav]].');
  vaultPath(match[1]);
  return value;
}

export function assetTarget(link: string): string { assetLink(link); return link.slice(2, -2); }
