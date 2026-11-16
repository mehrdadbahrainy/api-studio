import type { Workspace } from './models';
import { parseWorkspace } from './workspace-utils';

const ITERATIONS = 600_000;
const FORMAT = 'api-studio-encrypted-workspace';
const AUTH_CONTEXT = new TextEncoder().encode('API Studio encrypted workspace v1');
const encoder = new TextEncoder();
const decoder = new TextDecoder();

interface VaultEnvelope {
  format: string;
  version: number;
  kdf: string;
  iterations: number;
  salt: string;
  cipher: string;
  iv: string;
  ciphertext: string;
}

export interface UnlockedVault {
  key: CryptoKey;
  salt: Uint8Array;
  workspace: Workspace;
}

function requireCrypto(): Crypto {
  if (!globalThis.crypto?.subtle || !globalThis.crypto.getRandomValues)
    throw new Error('Secure WebCrypto is unavailable. The workspace cannot be unlocked.');
  return globalThis.crypto;
}
function toBase64(bytes: Uint8Array): string {
  let result = '';
  for (let i = 0; i < bytes.length; i += 0x4000)
    result += String.fromCharCode(...bytes.subarray(i, i + 0x4000));
  return btoa(result);
}
function fromBase64(value: string): Uint8Array {
  if (value.length > 20_000_000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value))
    throw new Error('Invalid encrypted workspace encoding.');
  const decoded = atob(value);
  return Uint8Array.from(decoded, c => c.charCodeAt(0));
}
function checkEnvelope(raw: unknown): VaultEnvelope {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid encrypted workspace file.');
  const e = raw as Record<string, unknown>;
  if (e.format !== FORMAT || e.version !== 1 || e.kdf !== 'PBKDF2-SHA256' ||
      e.iterations !== ITERATIONS || e.cipher !== 'AES-256-GCM' ||
      typeof e.salt !== 'string' || typeof e.iv !== 'string' || typeof e.ciphertext !== 'string')
    throw new Error('Unsupported or damaged encrypted workspace. Your data has not been overwritten.');
  return e as unknown as VaultEnvelope;
}
export function createSalt(): Uint8Array { return requireCrypto().getRandomValues(new Uint8Array(16)); }
export async function deriveVaultKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  if (passphrase.length < 12) throw new Error('Use a passphrase of at least 12 characters.');
  if (salt.length !== 16) throw new Error('Encrypted workspace salt is invalid.');
  const crypto = requireCrypto();
  const base = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: new Uint8Array(salt), iterations: ITERATIONS, hash: 'SHA-256' }, base,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
}
export async function encryptWorkspace(workspace: Workspace, key: CryptoKey, salt: Uint8Array): Promise<string> {
  const crypto = requireCrypto();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: AUTH_CONTEXT }, key, encoder.encode(JSON.stringify(workspace))
  );
  const envelope: VaultEnvelope = {
    format: FORMAT, version: 1, kdf: 'PBKDF2-SHA256', iterations: ITERATIONS,
    salt: toBase64(salt), cipher: 'AES-256-GCM', iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext))
  };
  return JSON.stringify(envelope);
}
export async function decryptWorkspace(passphrase: string, serialized: string): Promise<UnlockedVault> {
  let envelope: VaultEnvelope;
  try { envelope = checkEnvelope(JSON.parse(serialized)); }
  catch (e) { throw e instanceof Error ? e : new Error('Encrypted workspace is invalid.'); }
  const salt = fromBase64(envelope.salt);
  const iv = fromBase64(envelope.iv);
  if (iv.length !== 12) throw new Error('Encrypted workspace nonce is invalid.');
  const key = await deriveVaultKey(passphrase, salt);
  let plaintext: ArrayBuffer;
  try {
    plaintext = await requireCrypto().subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(iv), additionalData: AUTH_CONTEXT }, key, new Uint8Array(fromBase64(envelope.ciphertext))
    );
  } catch {
    throw new Error('Incorrect passphrase or corrupted encrypted workspace. No existing data was changed.');
  }
  let workspace: Workspace;
  try { workspace = parseWorkspace(JSON.parse(decoder.decode(plaintext))); }
  catch { throw new Error('Decrypted workspace data is not valid. Existing data was preserved.'); }
  return { key, salt, workspace };
}
