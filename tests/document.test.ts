import { it, expect } from 'vitest';
import { createEntity } from '../src/domain/entities';
import { createEntityDocument, parseEntityDocument, updateEntityDocument } from '../src/storage/document';

it('round-trips every entity kind and stable identity', () => {
  for (const kind of ['patch', 'motif', 'composition'] as const) {
    const e = createEntity(kind, 'A retained idea');
    expect(parseEntityDocument(createEntityDocument(e))?.entity).toEqual(e);
  }
});
it('surgically updates a property, preserving unrelated YAML comments/spacing and exact Markdown', () => {
  const e = createEntity('patch', 'First');
  const original = createEntityDocument(e).replace('title: First', 'title: First\n# A private annotation\ncustom:   [one, two] # do not format') + '\nWriting **stays** here.\n```json\n{"unrelated":true}\n```\n';
  const parsed = parseEntityDocument(original); if (!parsed) throw Error();
  parsed.entity.title = 'Second';
  const result = updateEntityDocument(original, original, parsed.entity);
  expect(result).toBe(original.replace('title: First', 'title: Second'));
  expect(parseEntityDocument(result)?.entity.id).toBe(e.id);
});
it('preserves CRLF, surrounding prose, unknown metadata and unknown nested JSON', () => {
  const e = createEntity('motif', 'Idea'); if (e.kind !== 'motif') throw Error();
  e.data.extra = { feel: 'quiet' }; e.data.meter.future = 'retain';
  const source = createEntityDocument(e).replaceAll('\n', '\r\n') + '\r\nEnd writing.\r\n';
  const next = structuredClone(e); next.title = 'Edited'; delete next.data.extra; delete next.data.meter.future;
  const result = updateEntityDocument(source, source, next);
  const parsed = parseEntityDocument(result);
  expect(parsed?.entity.kind === 'motif' && parsed.entity.data.extra).toEqual({ feel: 'quiet' });
  expect(result).toContain('\r\nEnd writing.\r\n'); expect(result.replaceAll('\r\n', '')).not.toContain('\n');
  expect(result).toContain('"future": "retain"');
});
it('does not see example music blocks nested inside ordinary code fences', () => {
  const e = createEntity('motif', 'Idea');
  const source = createEntityDocument(e) + '\n````markdown\n```mnemobard-motif\n{}\n```\n````\n';
  expect(parseEntityDocument(source)?.entity).toEqual(e);
  expect(updateEntityDocument(source, source, e)).toBe(source);
});
it('rejects duplicate/unclosed/wrong-kind owned blocks without rewriting', () => {
  const source = createEntityDocument(createEntity('motif', 'A'));
  expect(() => parseEntityDocument(source + '\n```mnemobard-motif\n{}\n```')).toThrow(/exactly one/);
  expect(() => parseEntityDocument(source.replace(/```\n\n#/, '\n#'))).toThrow();
  expect(() => parseEntityDocument(source.replace('```mnemobard-motif', '```mnemobard-composition'))).toThrow();
});
it('refuses future schemas, malformed YAML/JSON, duplicate keys and stale sources', () => {
  const e = createEntity('motif', 'A'), source = createEntityDocument(e);
  expect(() => parseEntityDocument(source.replace('mnemobard_schema: 1', 'mnemobard_schema: 2'))).toThrow(/schema/i);
  expect(() => parseEntityDocument(source.replace('"schemaVersion": 1', '"schemaVersion": 2'))).toThrow(/schema/i);
  expect(() => parseEntityDocument(source.replace('title: A', 'title: ['))).toThrow(/YAML/);
  expect(() => parseEntityDocument(source.replace('title: A', 'title: A\ntitle: B'))).toThrow(/YAML/);
  expect(() => parseEntityDocument(source.replace('"notes": []', '"notes": [oops]'))).toThrow(/JSON/);
  expect(() => updateEntityDocument(source + '\nExternal text', source, e)).toThrow(/changed/);
  expect(() => updateEntityDocument(source, source, { ...e, id: crypto.randomUUID() })).toThrow(/identity/);
});
it('ignores ordinary notes and rejects YAML aliases in owned data', () => {
  expect(parseEntityDocument('# Ordinary note')).toBeNull();
  const source = createEntityDocument(createEntity('patch', 'A'));
  expect(() => parseEntityDocument(source.replace('title: A', 'title: &x A\ncustom: *x'))).toThrow();
});
it('does not treat patch-specific properties as owned motif metadata', () => {
  const source = createEntityDocument(createEntity('motif', 'A')).replace('title: A', 'title: A\ninstrument: My prose metadata');
  const parsed = parseEntityDocument(source); if (!parsed) throw Error(); parsed.entity.title = 'B';
  expect(updateEntityDocument(source, source, parsed.entity)).toBe(source.replace('title: A','title: B'));
});
it('rejects duplicate JSON keys rather than silently choosing an interpretation', () => {
  const source = createEntityDocument(createEntity('motif','A')).replace('"ppq": 960', '"ppq": 480, "ppq": 960');
  expect(() => parseEntityDocument(source)).toThrow(/JSON/);
});
