import { describe, expect, it } from 'vitest';
import { createEntity, type EffectsChain } from '../src/domain/entities';
import { validateEntity } from '../src/domain/validation';
import { createEntityDocument, parseEntityDocument, updateEntityDocument } from '../src/storage/document';

describe('production library record contracts', () => {
  it.each(['instrument', 'patch', 'effects-chain'] as const)('creates and round-trips a %s with a stable independent ID', kind => {
    const e = createEntity(kind, 'First record');
    expect(parseEntityDocument(createEntityDocument(e))?.entity).toEqual(e);
    const next = { ...e, title: 'Renamed display title' };
    const source = createEntityDocument(e);
    expect(parseEntityDocument(updateEntityDocument(source, source, next))?.entity.id).toBe(e.id);
  });
  it('keeps manufacturer/type/platform descriptions free-form and optional', () => {
    const instrument = { ...createEntity('instrument', 'Prepared piano'), instrumentType: 'Experimental acoustic hybrid', platform: 'Workshop A', manufacturer: 'My workshop', externalReferences: ['https://example.test/manual'], notes: 'Felt strips on strings' };
    expect(validateEntity(instrument)).toEqual(instrument);
    expect(validateEntity(createEntity('instrument', 'Name alone'))).toBeTruthy();
  });
  it('retains old patch text/effects and unowned description/custom YAML and Markdown', () => {
    const e = { ...createEntity('patch', 'Old patch'), instrument: 'Text instrument', effects: ['Chorus', 'Delay'], extra: { description: 'User-owned description', custom: { bank: 12 } } };
    const source = createEntityDocument(e).replace('description: User-owned description', 'description: User-owned description # preserve me') + 'Private **Markdown** writing.\n';
    const next = { ...e, description: 'Managed description', category: 'Texture' };
    const result = updateEntityDocument(source, source, next), parsed = parseEntityDocument(result)?.entity;
    expect(result).toContain('description: User-owned description # preserve me'); expect(result).toContain('Private **Markdown** writing.\n');
    expect(parsed).toMatchObject({ effects: ['Chorus', 'Delay'], description: 'Managed description', extra: e.extra });
  });
  it('preserves unknown fields on surviving effect stages, order and deliberate optional removals', () => {
    const chain: EffectsChain = { ...createEntity('effects-chain', 'Air'), steps: [{ id: 'a', name: 'EQ', custom: { keep: true }, parameterNotes: 'old' }, { id: 'b', name: 'Delay' }] };
    const source = createEntityDocument(chain);
    const next = { ...chain, steps: [{ id: 'b', name: 'Tape delay' }, { id: 'a', name: 'Equalizer' }] };
    const parsed = parseEntityDocument(updateEntityDocument(source, source, next))?.entity;
    expect(parsed?.kind === 'effects-chain' && parsed.steps).toEqual([{ id: 'b', name: 'Tape delay' }, { id: 'a', name: 'Equalizer', custom: { keep: true } }]);
  });
  it.each([
    { externalReferences: ['javascript:alert(1)'] }, { externalReferences: ['https://name:password@example.test'] }, { archived: 'yes' }, { description: 42 },
  ])('rejects malformed metadata %j', fields => expect(() => validateEntity({ ...createEntity('instrument', 'A'), ...fields })).toThrow());
  it('validates chain rows, reference UUIDs and parallel companion links', () => {
    expect(() => validateEntity({ ...createEntity('effects-chain', 'A'), steps: [{ id: 's', name: '' }] })).toThrow('processor name');
    expect(() => validateEntity({ ...createEntity('effects-chain', 'A'), steps: [{ id: 's', name: 'A' }, { id: 's', name: 'B' }] })).toThrow('duplicate');
    expect(() => validateEntity({ ...createEntity('patch', 'A'), instrumentId: 'path.md' })).toThrow('UUID');
    const id = crypto.randomUUID();
    expect(() => validateEntity({ ...createEntity('patch', 'A'), effectsChainIds: [id, id.toUpperCase()] })).toThrow('duplicate');
    expect(() => validateEntity({ ...createEntity('patch', 'A'), effectsChainIds: [id], effectsChainLinks: [] })).toThrow('correspond');
  });
  it('refuses future versions without producing a replacement', () => {
    const source = createEntityDocument(createEntity('instrument', 'Future')).replace('mnemobard_schema: 1', 'mnemobard_schema: 2');
    expect(() => parseEntityDocument(source)).toThrow('Unsupported');
    expect(() => updateEntityDocument(source, source, createEntity('instrument', 'Other'))).toThrow('Unsupported');
  });
});
