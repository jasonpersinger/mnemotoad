import type { LibraryEntity, LibraryKind } from '../../domain/entities';
export interface LibraryItem { entity: LibraryEntity; path: string; instrumentName?: string; ambiguous?: boolean }
export interface LibraryQuery {
  kind: LibraryKind; search?: string; instrumentId?: string; tag?: string; category?: string;
  archived?: 'active' | 'archived' | 'all'; sort?: 'title-asc' | 'title-desc' | 'manufacturer';
}
const compareText = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const normalized = (value: string): string => value.normalize('NFC').toLowerCase();
export function queryLibrary(items: readonly LibraryItem[], query: LibraryQuery): LibraryItem[] {
  const terms = normalized(query.search ?? '').trim().split(/\s+/).filter(Boolean);
  return items.filter(({ entity: e, instrumentName }) => {
    if (e.kind !== query.kind) return false;
    const archive = query.archived ?? 'active';
    if ((archive === 'active' && e.archived) || (archive === 'archived' && !e.archived)) return false;
    if (query.instrumentId && (e.kind !== 'patch' || e.instrumentId?.toLowerCase() !== query.instrumentId.toLowerCase())) return false;
    if (query.tag && !e.tags?.some(tag => normalized(tag) === normalized(query.tag ?? ''))) return false;
    if (query.category && (e.kind !== 'patch' || normalized(e.category ?? '') !== normalized(query.category))) return false;
    const haystack = normalized([e.title, e.description, e.notes, ...(e.tags ?? []), JSON.stringify(e.extra),
      e.kind === 'patch' ? [e.instrument, instrumentName, e.category, e.character, e.parameterNotes, e.preset, e.manufacturer, JSON.stringify(e.parameters), ...(e.effects ?? [])].join(' ') :
        e.kind === 'instrument' ? [e.manufacturer, e.instrumentType, e.platform].join(' ') : e.steps.map(step => `${step.name} ${step.parameterNotes ?? ''}`).join(' ')].join(' '));
    return terms.every(term => haystack.includes(term));
  }).sort((a, b) => {
    const title = compareText(normalized(a.entity.title), normalized(b.entity.title));
    const manufacturer = (item: LibraryItem): string => item.entity.kind !== 'effects-chain' ? item.entity.manufacturer ?? '' : '';
    return (query.sort === 'manufacturer' ? compareText(normalized(manufacturer(a)), normalized(manufacturer(b))) || title : query.sort === 'title-desc' ? -title : title) || compareText(a.entity.id, b.entity.id) || compareText(a.path, b.path);
  });
}
