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
    // Only remove v0.1.0 plaintext data AFTER encrypted file write successfully finishes.
    if (migrated) removeLegacyWorkspace();
    return {vault, workspace: legacy.workspace, migrated};
  }
  save(workspace: Workspace): Promise<void> {
    // Freeze the snapshot immediately. Each write uses a fresh AES-GCM nonce.
    const snapshot = JSON.parse(JSON.stringify(workspace)) as Workspace;
    const operation = this.pending.catch(() => undefined).then(async () => {
      const payload = await encryptWorkspace(snapshot, this.key, this.salt);
      await invoke('write_encrypted_workspace', {payload});
    });
    this.pending = operation;
    return operation;
  }
  flush(): Promise<void> { return this.pending; }
}
