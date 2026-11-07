/**
 * 4G: first duplicate object key in JSON text that `JSON.parse` has ALREADY accepted (precondition), or undefined.
 * Keys are compared after JSON string decoding ("a" and "a" are duplicates), per object, at every nesting level.
 * Linear and allocation-light: replaces a second full YAML (JSON-schema, uniqueKeys) parse that existed only to detect
 * duplicates, because native JSON.parse silently keeps the last one (a later save would then drop the other value).
 */
export function duplicateJsonKey(text: string): string | undefined {
  /** One frame per open container: an object tracks its keys and whether the next string is a key; arrays are null. */
  const stack: ({ keys: Set<string>; expectKey: boolean } | null)[] = [];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 0x22) { // string token: skip to its closing quote (escapes may hide a quote)
      let end = i + 1, escaped = false;
      for (; end < text.length; end++) { const c = text.charCodeAt(end); if (c === 0x5c) { end++; escaped = true; } else if (c === 0x22) break; }
      const frame = stack.at(-1);
      if (frame?.expectKey) {
        const key = escaped ? JSON.parse(text.slice(i, end + 1)) as string : text.slice(i + 1, end);
        if (frame.keys.has(key)) return key;
        frame.keys.add(key); frame.expectKey = false;
      }
      i = end;
    } else if (code === 0x7b) stack.push({ keys: new Set(), expectKey: true }); // {
    else if (code === 0x5b) stack.push(null); // [
    else if (code === 0x7d || code === 0x5d) stack.pop(); // } ]
    else if (code === 0x2c) { const frame = stack.at(-1); if (frame) frame.expectKey = true; } // , inside an object: next string is a key
  }
  return undefined;
}
