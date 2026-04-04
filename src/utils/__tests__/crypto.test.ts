import { webcrypto } from 'node:crypto';
import { TextDecoder, TextEncoder } from 'node:util';
import type { CryptoError } from '../crypto';
import {
  CryptoErrorCode,
  decrypt,
  deriveKey,
  encrypt,
  generateSalt,
} from '../crypto';

describe('crypto utilities', () => {
  beforeAll(() => {
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: webcrypto,
    });
    Object.defineProperty(globalThis, 'TextEncoder', {
      configurable: true,
      value: TextEncoder,
    });
    Object.defineProperty(globalThis, 'TextDecoder', {
      configurable: true,
      value: TextDecoder,
    });
  });

  it('generates a 16-byte salt', () => {
    const salt = generateSalt();

    expect(salt).toBeInstanceOf(Uint8Array);
    expect(salt).toHaveLength(16);
  });

  it('derives a key and performs an encrypt/decrypt round trip', async () => {
    const salt = generateSalt();
    const key = await deriveKey('promptbridge-passphrase', salt);
    const plaintext = 'Encrypt this prompt before it reaches the vault.';
    const encrypted = await encrypt(plaintext, key);
    const decrypted = await decrypt(encrypted.ciphertext, encrypted.iv, key);

    expect(encrypted.ciphertext).not.toBe(plaintext);
    expect(encrypted.iv).toBeTruthy();
    expect(decrypted).toBe(plaintext);
  });

  it('throws a typed error when decrypting with the wrong key', async () => {
    const salt = generateSalt();
    const correctKey = await deriveKey('correct-passphrase', salt);
    const wrongKey = await deriveKey('wrong-passphrase', salt);
    const encrypted = await encrypt('A private PromptBridge note.', correctKey);

    await expect(decrypt(encrypted.ciphertext, encrypted.iv, wrongKey)).rejects.toMatchObject({
      name: 'CryptoError',
      code: CryptoErrorCode.DECRYPTION_FAILED,
    } satisfies Partial<CryptoError>);
  });

  it('throws a typed error for invalid base64 ciphertext', async () => {
    const key = await deriveKey('promptbridge-passphrase', generateSalt());

    await expect(decrypt('%%%invalid-base64%%%', '%%%invalid-base64%%%', key)).rejects.toMatchObject(
      {
        name: 'CryptoError',
        code: CryptoErrorCode.INVALID_BASE64,
      } satisfies Partial<CryptoError>,
    );
  });
});
