import type { VaultEntry } from '../../types';
import { decrypt, deriveKey, encrypt, generateSalt } from '../../utils/crypto';
import { DEFAULT_APP_SETTINGS, getFromLocal, loadAppSettings, saveToLocal } from '../../utils/storage';

export enum VaultErrorCode {
  INITIALIZATION_FAILED = 'INITIALIZATION_FAILED',
  INVALID_INPUT = 'INVALID_INPUT',
  INVALID_SALT = 'INVALID_SALT',
  SESSION_LOCKED = 'SESSION_LOCKED',
  STORAGE_FAILED = 'STORAGE_FAILED',
  ENCRYPTION_FAILED = 'ENCRYPTION_FAILED',
  DECRYPTION_FAILED = 'DECRYPTION_FAILED',
}

export class VaultError extends Error {
  code: VaultErrorCode;
  cause?: unknown;

  /**
   * Creates a typed vault error that callers can inspect without relying on string matching.
   */
  constructor(code: VaultErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'VaultError';
    this.code = code;
    this.cause = cause;
  }
}

type VaultEntryMap = Record<string, VaultEntry>;

const VAULT_SALT_STORAGE_KEY = 'promptbridge.vault.salt';
const VAULT_ENTRIES_STORAGE_KEY = 'promptbridge.vault.entries';

let activeVaultKey: CryptoKey | null = null;
let lastUnlockedAt: number | null = null;
let vaultTimeoutMs = DEFAULT_APP_SETTINGS.vaultTimeoutMinutes * 60_000;

function toVaultError(error: unknown, code: VaultErrorCode, fallbackMessage: string): VaultError {
  if (error instanceof VaultError) {
    return error;
  }

  if (error instanceof Error) {
    return new VaultError(code, error.message, error);
  }

  return new VaultError(code, fallbackMessage, error);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return bytes;
  } catch (error) {
    throw toVaultError(
      error,
      VaultErrorCode.INVALID_SALT,
      'The stored vault salt could not be decoded from base64.',
    );
  }
}

async function loadVaultEntriesMap(): Promise<VaultEntryMap> {
  try {
    return (await getFromLocal<VaultEntryMap>(VAULT_ENTRIES_STORAGE_KEY)) ?? {};
  } catch (error) {
    throw toVaultError(
      error,
      VaultErrorCode.STORAGE_FAILED,
      'Failed to load encrypted PromptBridge vault entries.',
    );
  }
}

async function saveVaultEntriesMap(entries: VaultEntryMap): Promise<void> {
  try {
    await saveToLocal(VAULT_ENTRIES_STORAGE_KEY, entries);
  } catch (error) {
    throw toVaultError(
      error,
      VaultErrorCode.STORAGE_FAILED,
      'Failed to save encrypted PromptBridge vault entries.',
    );
  }
}

function validateSecretKey(key: string): void {
  if (!key.trim()) {
    throw new VaultError(
      VaultErrorCode.INVALID_INPUT,
      'Vault secret keys must be non-empty strings.',
    );
  }
}

function updateSessionTimestamp(): void {
  lastUnlockedAt = Date.now();
}

function ensureActiveSession(): CryptoKey {
  if (!isSessionValid() || activeVaultKey === null) {
    throw new VaultError(
      VaultErrorCode.SESSION_LOCKED,
      'The sensitive data vault is locked or has timed out.',
    );
  }

  return activeVaultKey;
}

/**
 * Initializes or unlocks the vault by deriving an AES key from the provided passphrase and stored salt.
 */
export async function initVault(passphrase: string): Promise<void> {
  if (!passphrase.trim()) {
    throw new VaultError(
      VaultErrorCode.INVALID_INPUT,
      'A non-empty passphrase is required to initialize the vault.',
    );
  }

  try {
    const appSettings = await loadAppSettings().catch(() => DEFAULT_APP_SETTINGS);
    vaultTimeoutMs = appSettings.vaultTimeoutMinutes * 60_000;

    const storedSalt = await getFromLocal<string>(VAULT_SALT_STORAGE_KEY);
    const salt = storedSalt === null ? generateSalt() : base64ToBytes(storedSalt);

    if (storedSalt === null) {
      await saveToLocal(VAULT_SALT_STORAGE_KEY, bytesToBase64(salt));
    }

    activeVaultKey = await deriveKey(passphrase, salt);
    updateSessionTimestamp();

    const existingEntries = await getFromLocal<VaultEntryMap>(VAULT_ENTRIES_STORAGE_KEY);
    if (existingEntries === null) {
      await saveToLocal(VAULT_ENTRIES_STORAGE_KEY, {});
    }
  } catch (error) {
    lockVault();
    throw toVaultError(
      error,
      VaultErrorCode.INITIALIZATION_FAILED,
      'Failed to initialize the sensitive data vault.',
    );
  }
}

/**
 * Encrypts a secret value and stores the encrypted payload in chrome.storage.local under the vault namespace.
 */
export async function storeSecret(key: string, value: string): Promise<void> {
  validateSecretKey(key);

  try {
    const encrypted = await encrypt(value, ensureActiveSession());
    const entries = await loadVaultEntriesMap();

    entries[key] = {
      key,
      encryptedValue: encrypted.ciphertext,
      iv: encrypted.iv,
      timestamp: new Date().toISOString(),
    };

    await saveVaultEntriesMap(entries);
    updateSessionTimestamp();
  } catch (error) {
    throw toVaultError(
      error,
      VaultErrorCode.ENCRYPTION_FAILED,
      `Failed to encrypt and store the vault secret "${key}".`,
    );
  }
}

/**
 * Decrypts and returns a stored secret value, or null when the requested vault entry does not exist.
 */
export async function retrieveSecret(key: string): Promise<string | null> {
  validateSecretKey(key);

  try {
    const entries = await loadVaultEntriesMap();
    const entry = entries[key];

    if (!entry) {
      return null;
    }

    const plaintext = await decrypt(
      entry.encryptedValue,
      entry.iv,
      ensureActiveSession(),
    );

    updateSessionTimestamp();
    return plaintext;
  } catch (error) {
    throw toVaultError(
      error,
      VaultErrorCode.DECRYPTION_FAILED,
      `Failed to retrieve and decrypt the vault secret "${key}".`,
    );
  }
}

/**
 * Returns true when the vault has been unlocked within the configured timeout window.
 */
export function isSessionValid(): boolean {
  if (activeVaultKey === null || lastUnlockedAt === null) {
    return false;
  }

  if (Date.now() - lastUnlockedAt > vaultTimeoutMs) {
    lockVault();
    return false;
  }

  return true;
}

/**
 * Immediately clears the in-memory vault key and session timestamp.
 */
export function lockVault(): void {
  activeVaultKey = null;
  lastUnlockedAt = null;
}

/**
 * Deletes a stored encrypted secret entry from chrome.storage.local.
 */
export async function deleteSecret(key: string): Promise<void> {
  validateSecretKey(key);

  try {
    const entries = await loadVaultEntriesMap();

    if (!(key in entries)) {
      return;
    }

    delete entries[key];
    await saveVaultEntriesMap(entries);
  } catch (error) {
    throw toVaultError(
      error,
      VaultErrorCode.STORAGE_FAILED,
      `Failed to delete the vault secret "${key}".`,
    );
  }
}
