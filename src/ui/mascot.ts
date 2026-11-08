import mascot from '../../assets/mascot/mascot.json';

/**
 * The MNEMOTOAD mascot: B2 — The Curmudgeon (approved by the owner for 0.2.0; see docs/BRAND.md). Drawn from the
 * canonical pixel grid (assets/mascot/mascot.json, identical to assets/mascot/mnemotoad-mascot.png), one SVG path per
 * colour on whole logical pixels with crisp edges: an integer `scale` gives exact nearest-neighbour enlargement.
 */
export const MASCOT_ID = 'b2-curmudgeon';
const SVG = 'http://www.w3.org/2000/svg';

export function mascotMark(parent: HTMLElement, scale: number, label?: string): SVGSVGElement {
  if (mascot.id !== MASCOT_ID) throw Error('Canonical mascot is not the approved B2 — The Curmudgeon');
  const palette = mascot.palette as Record<string, string>, paths = new Map<string, string>();
  mascot.rows.forEach((row, y) => [...row].forEach((key, x) => { if (key !== mascot.transparent) paths.set(key, `${paths.get(key) ?? ''}M${x} ${y}h1v1h-1z`); }));
  const svg = document.createElementNS(SVG, 'svg'), size = String(mascot.size * scale);
  svg.setAttribute('viewBox', `0 0 ${mascot.size} ${mascot.size}`); svg.setAttribute('width', size); svg.setAttribute('height', size);
  svg.setAttribute('shape-rendering', 'crispEdges'); svg.classList.add('mnemotoad-mark');
  if (label) { svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', label); } else svg.setAttribute('aria-hidden', 'true');
  for (const [key, d] of paths) { const path = document.createElementNS(SVG, 'path'); path.setAttribute('d', d); path.setAttribute('fill', palette[key] ?? ''); svg.appendChild(path); }
  parent.appendChild(svg);
  return svg;
}
