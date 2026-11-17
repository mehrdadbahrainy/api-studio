import { invoke } from '@tauri-apps/api/core';
import type { Workspace } from './models';
import { loadWorkspace, removeLegacyWorkspace, hasLegacyWorkspace } from './storage';
import { createSalt, deriveVaultKey, decryptWorkspace, encryptWorkspace } from './vault-crypto';

export class SecureWorkspace {
  private pending: Promise<void> = Promise.resolve();
  private constructor(private readonly key: CryptoKey, private readonly salt: Uint8Array) {}
  static async unlock(passphrase: string): Promise<{vault: SecureWorkspace; workspace: Workspace; migrated: boolean}> {
    if (passphrase.length < 12) throw new Error('Use a passphrase of at least 12 characters.');
    const existing = await invoke<string | null>('read_encrypted_workspace');
    if (existing !== null) {
      const unlocked = await decryptWorkspace(passphrase, existing);
      return {vault: new SecureWorkspace(unlocked.key, unlocked.salt), workspace: unlocked.workspace, migrated: false};
    }
    // Never silently overwrite legacy Stronghold vaults from the broken v0.1.1 preview.
    if (await invoke<boolean>('legacy_stronghold_exists')) {
      throw new Error('An earlier v0.1.1 Stronghold vault exists. It has been preserved. Export a workspace backup from v0.1.1 on a working system before starting a new vault.');
    }
    const migrated = hasLegacyWorkspace();
    const legacy = loadWorkspace();
    if (migrated && legacy.warning)
      throw new Error('Older workspace could not be read. It has not been deleted; use a private backup to recover it.');
    const salt = createSalt();
    const key = await deriveVaultKey(passphrase, salt);
    const vault = new SecureWorkspace(key, salt);
    await vault.save(legacy.workspace);
    // Do not discard legacy data until a fresh read of the persisted ciphertext
    // succeeds and decrypts back to the exact workspace we intended to save.
    const verifiedFile = await invoke<string | null>('read_encrypted_workspace');
    if (!verifiedFile) throw new Error('Encrypted vault verification failed; old data was preserved.');
    const verified = await decryptWorkspace(passphrase, verifiedFile);
    if (JSON.stringify(verified.workspace) !== JSON.stringify(legacy.workspace)) {
      throw new Error('Encrypted vault verification failed; old data was preserved.');
    }
    if (migrated) removeLegacyWorkspace();
    return {vault, workspace: verified.workspace, migrated};
  }
  static async createWithPassphrase(passphrase: string, workspace: Workspace): Promise<SecureWorkspace> {
    if (passphrase.length < 12) throw new Error('Use a passphrase of at least 12 characters.');
    const salt=createSalt();
    const key=await deriveVaultKey(passphrase,salt);
    const vault=new SecureWorkspace(key,salt);
    await vault.save(workspace);
    const saved=await invoke<string | null>('read_encrypted_workspace');
    if (!saved) throw new Error('Encrypted vault verification failed.');
    const checked=await decryptWorkspace(passphrase,saved);
    if (JSON.stringify(checked.workspace)!==JSON.stringify(workspace))
      throw new Error('Encrypted vault verification failed.');
    return vault;
  }
  save(workspace: Workspace): Promise<void> {
    // Freeze the snapshot immediately. Each write uses a fresh AES-GCM nonce.
    const snapshot = JSON.parse(JSON.stringify(workspace)) as Workspace;
    const operation = this.pending.catch(() => undefined).then(async () => {
      const payload = await encryptWorkspace(snapshot, this.key, this.salt);
      await invoke('write_encrypted_workspace', {payload});
      // Confirm the native file was actually committed before showing success.
      const persisted = await invoke<string | null>('read_encrypted_workspace');
      if (persisted !== payload) throw new Error('Encrypted vault save verification failed.');
    });
    this.pending = operation;
    return operation;
  }
  flush(): Promise<void> { return this.pending; }
}

/** Never echo raw Tauri/Rust errors, because they may contain local paths. */
export function describeVaultError(error: unknown): string {
  const text = (error instanceof Error ? error.message : String(error)).toLowerCase();
  if (text.includes('stronghold vault exists'))
    return 'A v0.1.1 Stronghold vault exists and was preserved. Restore from a private JSON export before creating a new vault. Never delete the old AppData files.';
  if (text.includes('write failed') || text.includes('save failed') || text.includes('sync failed') || text.includes('protected workspace save verification failed'))
    return 'Windows-protected workspace could not be saved. The previous workspace was preserved. Check storage permissions and retry.';
  if (text.includes('protected workspace') || text.includes('windows user data protection'))
    return 'Windows could not open the protected workspace. Existing files were preserved. Sign in to the original Windows user account or restore a private backup.';
  if (text.includes('incorrect passphrase') || text.includes('corrupted encrypted'))
    return 'Incorrect passphrase or damaged encrypted workspace. No saved data was deleted.';
  if (text.includes('at least 12')) return 'Enter a passphrase with at least 12 characters.';
  if (text.includes('older workspace could not be read'))
    return 'Previous workspace could not be read. Its original data was preserved.';
  if (text.includes('verification failed') || text.includes('save failed'))
    return 'Encrypted workspace could not be verified or saved. Original data was preserved; check available storage and permissions.';
  if (text.includes('webcrypto') || text.includes('secure context'))
    return 'Secure Web Crypto is unavailable. Update the Windows WebView2 runtime.';
  return 'Could not unlock the workspace. Existing data was preserved. Check storage permissions and try again.';
}
