import { describe, it, expect } from 'vitest';
import { createEntity } from '../src/domain/entities';
import { validateEntity } from '../src/domain/validation';
import { vaultPath, assetLink } from '../src/domain/paths';

describe('foundational contracts', () => {
  it.each(['patch', 'motif', 'composition'] as const)('validates and clones %s', kind => {
    const entity = createEntity(kind, 'An idea');
    expect(validateEntity(entity)).toEqual(entity); expect(validateEntity(entity)).not.toBe(entity);
    expect(createEntity(kind, 'Other').id).not.toBe(entity.id);
  });
  it('preserves unrecognized metadata and structured data', () => {
    const m = createEntity('motif', 'A'); if (m.kind !== 'motif') throw Error();
    m.extra.custom = { feeling: 'open' }; m.data.futureHint = { flags: [true] };
    expect(validateEntity(m)).toEqual(m);
  });
  it.each([{ id: 'filename.md' }, { schemaVersion: 2 }, { kind: 'song' }, { title: '' }, { instrument: 42 }])('rejects invalid patch %j', change => {
    expect(() => validateEntity({ ...createEntity('patch', 'A'), ...change })).toThrow();
  });
  it('validates exact imported ticks and rejects duplicates/overlap/overflow', () => {
    const m = createEntity('motif', 'A'); if (m.kind !== 'motif') throw Error();
    m.data.ppq = 1000; m.data.notes = [{ id: 'n', pitch: 60, startTick: 17, durationTicks: 239, velocity: 73 }];
    expect(validateEntity(m)).toEqual(m);
    m.data.notes.push({ ...m.data.notes[0], id: 'n2', pitch: 60, startTick: 20, durationTicks: 20, velocity: 80 });
    expect(() => validateEntity(m)).toThrow(/overlapping/);
    m.data.notes.pop(); m.data.notes.push({ id: 'n', pitch: 64, startTick: 0, durationTicks: 1, velocity: 10 });
    expect(() => validateEntity(m)).toThrow(/duplicate/);
    m.data.notes.pop(); m.data.lengthTicks = 20;
    expect(() => validateEntity(m)).toThrow(/beyond/);
  });
  it('checks nested composition fields, channels, references and local IDs', () => {
    const c = createEntity('composition', 'C'); if (c.kind !== 'composition') throw Error();
    c.data.lanes.push({ id: 'l', name: 'One', midiChannel: 9, clips: [] });
    expect(() => validateEntity(c)).toThrow(/percussion/);
    const lane = c.data.lanes[0]; if (!lane) throw Error(); lane.percussion = true;
    expect(validateEntity(c)).toEqual(c);
    lane.clips.push({ id: 'c', motifId: 'missing-file.md', startTick: 0, repeatCount: 1 });
    expect(() => validateEntity(c)).toThrow(/UUID/);
  });
  it.each(['../outside.wav', '/tmp/a.wav', 'C:/a.wav', 'Assets/../a.wav', 'Assets/CON.wav', 'https://x/a', 'a\\b', 'a//b', 'a.md.'])('rejects unsafe portable path %s', path => expect(() => vaultPath(path)).toThrow());
  it('supports portable native asset links without app URIs', () => {
    expect(assetLink('[[Assets/preview.wav]]')).toBe('[[Assets/preview.wav]]');
    expect(() => assetLink('[[../private.wav]]')).toThrow();
  });
  it('rejects cyclic and non-portable extension data before persistence', () => {
    const e=createEntity('motif','A'); if(e.kind!=='motif')throw Error();
    e.data.custom=Infinity; expect(()=>validateEntity(e)).toThrow(/portable/);
    e.data.custom={}; (e.data.custom as Record<string,unknown>).self=e.data.custom;
    expect(()=>validateEntity(e)).toThrow(/cyclic/);
  });
});
