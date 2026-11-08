import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

/** Milestone 4J: the unified interface layer is theme-safe (host variables only), focus-visible and motion-respectful. */
const css = readFileSync('styles.css', 'utf8'), layer = css.slice(css.indexOf('/* ── Milestone 4J: unified interface layer'));
it('uses only host theme variables for colour in the 4J layer (works in dark and light themes)', () => {
  expect(layer.length).toBeGreaterThan(1000);
  expect(layer.match(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/gi)).toBeNull();
  for (const property of ['color', 'background', 'border-color']) for (const m of layer.matchAll(new RegExp(`(?:^|[;{\\s])${property}:\\s*([^;}]+)`, 'g'))) expect(m[1]).toMatch(/var\(--|transparent|none|inherit/);
});
it('gives every interactive element a visible focus ring and honours reduced motion', () => {
  expect(layer).toMatch(/:is\(button, summary, input, select, textarea, \[tabindex\]\):focus-visible[^{]*\{ outline: 2px solid var\(--mb-accent\)/);
  expect(layer).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
  expect(layer).not.toMatch(/text-transform:\s*uppercase/);
});
