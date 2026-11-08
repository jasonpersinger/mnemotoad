import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

/** MNEMOTOAD brand tokens: exact canonical values, scoped (never global), and every pairing used meets WCAG contrast. */
const css = readFileSync('styles.css', 'utf8');
const tokens = css.slice(0, css.indexOf('.mnemobard-module { padding'));
const layer = css.slice(css.indexOf('/* ── MNEMOTOAD brand layer'));
const luminance = (hex: string): number => { const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4); return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0); };
const contrast = (a: string, b: string): number => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05); };
const BRAND = { black: '#070707', umber: '#28231c', green: '#317b22', violet: '#801a86', yellow: '#f4e409' };
// Obsidian's default theme surfaces and text (measured natively in the release-candidate run; see the report).
const HOST = { darkBg: '#1e1e1e', darkPanel: '#262626', darkText: '#dadada', lightBg: '#ffffff', lightPanel: '#f6f6f6' };

it('defines the five canonical colours exactly, once, in one scoped token block', () => {
  for (const [name, hex] of Object.entries(BRAND)) { expect(tokens).toContain(`--mnemotoad-${name}: ${hex};`); expect(css.split(`--mnemotoad-${name}: #`).length).toBe(2); }
  expect(tokens).toMatch(/^:is\(\.mnemobard-module, \.modal\.mnemobard-wide-modal, \.mnemobard-settings\) \{/m);
  expect(css).not.toMatch(/(^|\})\s*(:root|body|html)\s*[,{]/m); // never touches global scopes
  expect(css).not.toMatch(/--(interactive-accent|text-accent|background-primary|text-normal)\s*:/); // never redefines host theme variables
});
it('applies brand colour in the layer through variables only', () => {
  expect(layer.length).toBeGreaterThan(500);
  expect(layer.match(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/gi)).toBeNull();
});
it('uses only pairings with sufficient contrast in each theme (text ≥ 4.5:1, focus/selection indicators ≥ 3:1)', () => {
  expect(contrast('#ffffff', BRAND.violet)).toBeGreaterThanOrEqual(4.5);            // primary action label on violet (both themes)
  expect(contrast(BRAND.violet, HOST.lightBg)).toBeGreaterThanOrEqual(3);           // light focus ring + selection bar
  expect(contrast(BRAND.violet, HOST.lightPanel)).toBeGreaterThanOrEqual(3);
  expect(contrast(BRAND.green, HOST.lightBg)).toBeGreaterThanOrEqual(3);            // light "ready" border
  expect(contrast(BRAND.yellow, HOST.darkBg)).toBeGreaterThanOrEqual(3);            // dark focus ring
  expect(contrast(BRAND.yellow, HOST.darkPanel)).toBeGreaterThanOrEqual(3);
  expect(contrast(BRAND.green, HOST.darkBg)).toBeGreaterThanOrEqual(3);             // dark selection bar / "ready" border
  expect(contrast(HOST.darkText, BRAND.black)).toBeGreaterThanOrEqual(4.5);         // host text on the near-black About plate (dark)
  expect(contrast(BRAND.green, BRAND.black)).toBeGreaterThanOrEqual(3);              // mascot silhouette on that plate
  expect(contrast(BRAND.green, BRAND.umber)).toBeLessThan(3);                        // why the plate is not umber
  // Recorded reasons for what the layer deliberately does NOT do:
  expect(contrast(BRAND.violet, HOST.darkBg)).toBeLessThan(3);                       // violet is never a dark-theme indicator or text colour
  expect(contrast(BRAND.yellow, HOST.lightBg)).toBeLessThan(3);                      // yellow is never a light-theme indicator
  expect(layer).toMatch(/\.theme-dark|--mnemotoad-focus/);
  expect(tokens).toMatch(/\.theme-dark :is\([^)]*\) \{ --mnemotoad-focus: var\(--mnemotoad-yellow\); --mnemotoad-select: var\(--mnemotoad-green\);/);
});
it('keeps transport Play buttons outlined (4J: Save is the only filled primary), after the violet primary rule', () => {
  const fill = layer.indexOf('button.mod-cta:not(:disabled) { background: var(--mnemotoad-violet)'), keep = layer.indexOf(':is(.mnemobard-motif-transport, .mnemobard-canvas-transport) button.mod-cta:not(:disabled) { background: transparent;');
  expect(fill).toBeGreaterThan(0); expect(keep).toBeGreaterThan(fill);
});
it('renders the mascot without an SVG viewport clip (pixel-exact edges; verified natively at 1×/2×/4×/8×)', () => {
  expect(layer).toMatch(/\.mnemotoad-mark \{ overflow: visible; \}/);
});

