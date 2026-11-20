import { invoke } from '@tauri-apps/api/core';
import { loadWorkspace, hasLegacyWorkspace, removeLegacyWorkspace } from './storage';
import type { Workspace } from './models';
import { parseWorkspace } from './workspace-utils';

/**
 * Windows-only storage with transparent CURRENT_USER DPAPI protection.
 * No user-entered app passphrase is required. An account/password reset or a
 * different Windows profile may prevent recovery: private JSON backups matter.
 */
export class SystemWorkspace {
  private pending: Promise<void> = Promise.resolve();

  static async supported(): Promise<boolean> {
    return invoke<boolean>('is_system_vault_supported');
  }

  static async openOrCreate(): Promise<{vault: SystemWorkspace; workspace: Workspace; migrated: boolean} | null> {
    if (!await this.supported()) return null;
    if (await invoke<boolean>('password_mode_enabled')) {
      const encrypted=await invoke<string | null>('read_encrypted_workspace');
      if(!encrypted)throw new Error('Password mode is active but its encrypted workspace is missing. Existing files were preserved.');
      return null; // Respect the user's optional passphrase choice on every restart.
    }
    const exists = await invoke<boolean>('protected_workspace_exists');
    if (exists) {
      const content = await invoke<string | null>('read_protected_workspace');
      if (!content) throw new Error('A protected workspace exists but could not be opened. Existing data was preserved.');
      let workspace: Workspace;
      try { workspace = parseWorkspace(JSON.parse(content)); }
      catch { throw new Error('Protected workspace is not valid. Existing data was preserved.'); }
      return {vault: new SystemWorkspace(), workspace, migrated: false};
    }
    // An existing v0.1.2 passphrase vault may contain customer data. Never
    // auto-create a new empty protected workspace over an inaccessible vault.
    if (await invoke<string | null>('read_encrypted_workspace') !== null) return null;
    if (await invoke<boolean>('legacy_stronghold_exists')) {
      throw new Error('An earlier v0.1.1 Stronghold vault exists. It has been preserved. Restore from a private JSON backup before starting a new workspace.');
    }
    const migrated = hasLegacyWorkspace();
    const legacy = loadWorkspace();
    if (migrated && legacy.warning)
      throw new Error('Older workspace could not be read. Existing data was preserved.');
    const vault = await this.create(legacy.workspace);
    if (migrated) removeLegacyWorkspace();
    return {vault, workspace:legacy.workspace, migrated};
  }

  static async create(workspace: Workspace): Promise<SystemWorkspace> {
    const vault = new SystemWorkspace();
    await vault.save(workspace);
    return vault;
  }

  save(workspace: Workspace): Promise<void> {
    parseWorkspace(workspace);
    const snapshot = JSON.stringify(workspace);
    const operation = this.pending.catch(() => undefined).then(async () => {
      await invoke('write_protected_workspace', {payload:snapshot});
      const verified = await invoke<string | null>('read_protected_workspace');
      if (verified !== snapshot) throw new Error('Protected workspace save verification failed.');
    });
    this.pending = operation;
    return operation;
  }

  flush(): Promise<void> { return this.pending; }
}
