/** jsdom omits SubtleCrypto; match the real desktop host API without altering production. */
import { webcrypto } from 'node:crypto';
if (!globalThis.crypto.subtle)
    Object.defineProperty(globalThis.crypto, 'subtle', { value: webcrypto.subtle, configurable: true });
