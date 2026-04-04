/**
 * Error codes used by PromptBridge cryptographic helpers.
 */
export enum CryptoErrorCode {
  CRYPTO_UNAVAILABLE = 'CRYPTO_UNAVAILABLE',
  INVALID_BASE64 = 'INVALID_BASE64',
  KEY_DERIVATION_FAILED = 'KEY_DERIVATION_FAILED',
  ENCRYPTION_FAILED = 'ENCRYPTION_FAILED',
  DECRYPTION_FAILED = 'DECRYPTION_FAILED',
  RANDOM_VALUE_FAILED = 'RANDOM_VALUE_FAILED',
}

/**
 * Typed error thrown by PromptBridge cryptographic helpers.
 */
export class CryptoError extends Error {
  code: CryptoErrorCode;
  cause?: unknown;

  /**
   * Creates a new typed cryptographic error.
   */
  constructor(code: CryptoErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'CryptoError';
    this.code = code;
    this.cause = cause;
  }
}

const AES_KEY_LENGTH = 256;
const AES_GCM_IV_LENGTH = 12;
const PBKDF2_ITERATIONS = 100000;
const SALT_LENGTH = 16;

/**
 * Returns the Web Crypto API instance or throws a typed error when unavailable.
 */
function getCryptoApi(): Crypto {
  if (!globalThis.crypto?.subtle) {
    throw new CryptoError(
      CryptoErrorCode.CRYPTO_UNAVAILABLE,
      'The Web Crypto API is not available in this environment.',
    );
  }

  return globalThis.crypto;
}

/**
 * Wraps unknown failures in a typed cryptographic error.
 */
function toCryptoError(
  error: unknown,
  fallbackCode: CryptoErrorCode,
  fallbackMessage: string,
): CryptoError {
  if (error instanceof CryptoError) {
    return error;
  }

  if (error instanceof Error) {
    return new CryptoError(fallbackCode, error.message, error);
  }

  return new CryptoError(fallbackCode, fallbackMessage, error);
}

/**
 * Converts a Uint8Array into a detached ArrayBuffer compatible with Web Crypto typings.
 */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

/**
 * Converts raw bytes into a base64 string.
 */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary);
}

/**
 * Converts a base64 string into raw bytes.
 */
function base64ToBytes(value: string): Uint8Array {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return bytes;
  } catch (error) {
    throw toCryptoError(
      error,
      CryptoErrorCode.INVALID_BASE64,
      'The provided base64 payload could not be decoded.',
    );
  }
}

/**
 * Derives an AES-256-GCM key from a passphrase and salt using PBKDF2.
 */
export async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  try {
    const cryptoApi = getCryptoApi();
    const encodedPassphrase = new TextEncoder().encode(passphrase);
    const keyMaterial = await cryptoApi.subtle.importKey(
      'raw',
      toArrayBuffer(encodedPassphrase),
      'PBKDF2',
      false,
      ['deriveKey'],
    );

    return await cryptoApi.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: toArrayBuffer(salt),
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256',
      },
      keyMaterial,
      {
        name: 'AES-GCM',
        length: AES_KEY_LENGTH,
      },
      false,
      ['encrypt', 'decrypt'],
    );
  } catch (error) {
    throw toCryptoError(
      error,
      CryptoErrorCode.KEY_DERIVATION_FAILED,
      'Failed to derive an AES-256-GCM key.',
    );
  }
}

/**
 * Encrypts plaintext with AES-256-GCM and returns base64 ciphertext and IV values.
 */
export async function encrypt(
  plaintext: string,
  key: CryptoKey,
): Promise<{ ciphertext: string; iv: string }> {
  try {
    const cryptoApi = getCryptoApi();
    const iv = cryptoApi.getRandomValues(new Uint8Array(AES_GCM_IV_LENGTH));
    const encodedPlaintext = new TextEncoder().encode(plaintext);
    const encryptedBuffer = await cryptoApi.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: toArrayBuffer(iv),
      },
      key,
      toArrayBuffer(encodedPlaintext),
    );

    return {
      ciphertext: bytesToBase64(new Uint8Array(encryptedBuffer)),
      iv: bytesToBase64(iv),
    };
  } catch (error) {
    throw toCryptoError(
      error,
      CryptoErrorCode.ENCRYPTION_FAILED,
      'Failed to encrypt the provided plaintext.',
    );
  }
}

/**
 * Decrypts a base64 AES-256-GCM payload back into plaintext.
 */
export async function decrypt(
  ciphertext: string,
  iv: string,
  key: CryptoKey,
): Promise<string> {
  try {
    const cryptoApi = getCryptoApi();
    const decodedCiphertext = base64ToBytes(ciphertext);
    const decodedIv = base64ToBytes(iv);
    const decryptedBuffer = await cryptoApi.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: toArrayBuffer(decodedIv),
      },
      key,
      toArrayBuffer(decodedCiphertext),
    );

    return new TextDecoder().decode(decryptedBuffer);
  } catch (error) {
    throw toCryptoError(
      error,
      CryptoErrorCode.DECRYPTION_FAILED,
      'Failed to decrypt the provided ciphertext.',
    );
  }
}

/**
 * Generates a fresh random salt for PBKDF2 key derivation.
 */
export function generateSalt(): Uint8Array {
  try {
    return getCryptoApi().getRandomValues(new Uint8Array(SALT_LENGTH));
  } catch (error) {
    throw toCryptoError(
      error,
      CryptoErrorCode.RANDOM_VALUE_FAILED,
      'Failed to generate a cryptographic salt.',
    );
  }
}
