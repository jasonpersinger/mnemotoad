import { describe, expect, it } from 'vitest';
import { parseDocument } from 'yaml';
import { duplicateJsonKey } from '../src/storage/json-keys';
import { parseEntityDocument } from '../src/storage/document';

/** The 4F detector this replaces (kept here only as the equivalence oracle). */
const yamlDuplicate = (text: string): boolean => parseDocument(text, { schema: 'json', uniqueKeys: true }).errors.length > 0;

describe('4G duplicate JSON key scan', () => {
  it('finds duplicates at any depth and ignores keys repeated in different objects', () => {
    expect(duplicateJsonKey('{"a":1,"b":2}')).toBeUndefined();
    expect(duplicateJsonKey('{"a":1,"a":2}')).toBe('a');
    expect(duplicateJsonKey('{"x":{"a":1,"b":{"c":1,"c":2}}}')).toBe('c');
    expect(duplicateJsonKey('{"notes":[{"id":"1","pitch":60},{"id":"2","pitch":61}]}')).toBeUndefined();
    expect(duplicateJsonKey('{"notes":[{"id":"1","pitch":60,"pitch":61}]}')).toBe('pitch');
    expect(duplicateJsonKey('[{"a":1},{"a":2}]')).toBeUndefined();
  });
  it('compares decoded keys and never mistakes string values or escaped quotes for keys', () => {
    expect(duplicateJsonKey('{"a":1,"\\u0061":2}')).toBe('a');
    expect(duplicateJsonKey('{"a":"a","b":"a"}')).toBeUndefined();
    expect(duplicateJsonKey('{"q\\"":1,"r":"\\",\\"q\\\\\\"\\":"}')).toBeUndefined();
    expect(duplicateJsonKey('{"k":"{\\"k\\":1,\\"k\\":2}"}')).toBeUndefined();
    expect(duplicateJsonKey('{"a":[1,{"a":2}],"b":{"a":3}}')).toBeUndefined();
  });
  it('agrees with the former YAML JSON-schema detector on generated motif payloads', () => {
    let seed = 7; const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let round = 0; round < 200; round++) {
      const notes = Array.from({ length: 1 + Math.floor(random() * 6) }, (_, i) => ({ id: `n${i}`, pitch: 60 + i, startTick: i * 240, durationTicks: 120, velocity: 90 }));
      let text = JSON.stringify({ schemaVersion: 1, ppq: 960, meter: { numerator: 4, denominator: 4 }, lengthTicks: 3840, notes, extra: { 'k"ey': 'v,{a}' } }, null, 2);
      if (random() < 0.5) { // inject one duplicate at a random object
        const targets = ['"ppq": 960', '"numerator": 4', '"pitch": 6', '"velocity": 90'], target = targets[Math.floor(random() * targets.length)] ?? '';
        const key = target.split(':')[0] ?? ''; text = text.replace(target, `${key}: 1, ${target}`);
      }
      expect(() => JSON.parse(text)).not.toThrow();
      expect(duplicateJsonKey(text) !== undefined, text).toBe(yamlDuplicate(text));
    }
  });
  it('still rejects a motif note whose owned block repeats a key, and keeps duplicate-free notes readable', () => {
    const source = (data: string) => `---\nmnemobard_id: 3b1f3d0e-6f53-4b5c-9a39-3a2d7a1b9e10\nmnemobard_kind: motif\nmnemobard_schema: 1\ntitle: Dup\n---\n\n\`\`\`mnemobard-motif\n${data}\n\`\`\`\n`;
    const good = '{"schemaVersion":1,"ppq":960,"tempoMicrosecondsPerQuarter":500000,"meter":{"numerator":4,"denominator":4},"lengthTicks":3840,"notes":[{"id":"a","pitch":60,"startTick":0,"durationTicks":960,"velocity":90}]}';
    expect(parseEntityDocument(source(good))?.entity.kind).toBe('motif');
    expect(() => parseEntityDocument(source(good.replace('"velocity":90', '"velocity":90,"velocity":10')))).toThrow(/Invalid owned JSON/);
  });
});
