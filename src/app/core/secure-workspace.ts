import { appLocalDataDir } from '@tauri-apps/api/path';
import { Stronghold, Client } from '@tauri-apps/plugin-stronghold';
import { Workspace } from './models';
import { parseWorkspace } from './workspace-utils';
import { loadWorkspace, removeLegacyWorkspace, hasLegacyWorkspace } from './storage';

const CLIENT = 'api-studio-workspace';
const WORKSPACE_KEY = 'workspace-v1';
const SNAPSHOT_FILE = 'workspace.stronghold';

/** Only user-safe error categories are surfaced: never echo plugin errors containing paths or secrets. */
export function describeVaultError(error: unknown): string {
  const raw = (error instanceof Error ? error.message : String(error)).toLowerCase();
  if (/at least 12 characters/.test(raw)) return 'Enter a passphrase with at least 12 characters.';
  if (/password|decrypt|invalid key|authentication failed|invalid mac/.test(raw))
    return 'The vault passphrase was rejected. Enter the original passphrase used on this computer.';
  if (/permission|access denied|read.only|os error 5/.test(raw))
    return 'Windows denied access to your encrypted workspace. Check permissions for the application data folder.';
  if (/no space|disk full|os error 112/.test(raw))
    return 'The vault could not be saved because the disk is full. Free space and retry.';
  if (/legacy workspace could not be read/.test(raw))
    return 'The previous workspace is unreadable. It has not been deleted; restore a backup before continuing.';
  if (/verification failed|could not be verified/.test(raw))
    return 'The encrypted workspace could not be verified after saving. Previous data was preserved.';
  return 'Could not open the encrypted workspace. The existing data was preserved. Check the Windows app data folder and try again.';
}

function decodeWorkspace(bytes: Uint8Array | null): Workspace {
  if (!bytes) throw new Error('Encrypted workspace verification failed');
  return parseWorkspace(JSON.parse(new TextDecoder().decode(bytes)));
}

async function getClient(stronghold: Stronghold): Promise<Client> {
  try { return await stronghold.loadClient(CLIENT); }
  catch { return await stronghold.createClient(CLIENT); }
}

export class SecureWorkspace {
  private pending: Promise<void> = Promise.resolve();
  private constructor(private readonly stronghold: Stronghold, private readonly client: Client) {}

  static async unlock(passphrase: string): Promise<{vault: SecureWorkspace; workspace: Workspace; migrated: boolean}> {
    if (passphrase.length < 12) throw new Error('Use a passphrase of at least 12 characters.');
    const folder = await appLocalDataDir();
    const path = `${folder.replace(/[\\/]$/, '')}/${SNAPSHOT_FILE}`;
    let stronghold = await Stronghold.load(path, passphrase);
    let client = await getClient(stronghold);
    let vault = new SecureWorkspace(stronghold, client);
    const previous = await client.getStore().get(WORKSPACE_KEY);
    const hadLegacy = hasLegacyWorkspace();
    if (previous === null) {
      const legacy = loadWorkspace();
      if (hadLegacy && legacy.warning) throw new Error('Legacy workspace could not be read.');
      // Save first. Even if this fails, the unencrypted legacy data is left untouched.
      await vault.save(legacy.workspace);
    }

    // Most important safety property: reopen the persisted snapshot from disk before
    // deleting legacy data. Never trust in-memory Stronghold store records alone.
    await stronghold.unload();
    stronghold = await Stronghold.load(path, passphrase);
    client = await stronghold.loadClient(CLIENT);
    const verified = decodeWorkspace(await client.getStore().get(WORKSPACE_KEY));
    if (hadLegacy && previous === null) {
      const legacy = loadWorkspace();
      if (legacy.warning || JSON.stringify(legacy.workspace) !== JSON.stringify(verified)) {
        throw new Error('Encrypted workspace verification failed');
      }
    }
    if (hadLegacy) removeLegacyWorkspace();
    vault = new SecureWorkspace(stronghold, client);
    return {vault, workspace: verified, migrated: hadLegacy && previous === null};
  }

  save(workspace: Workspace): Promise<void> {
    // Take an immutable snapshot: callers are free to edit their workspace while saving.
    const payload = JSON.stringify(workspace);
    const bytes = Array.from(new TextEncoder().encode(payload));
    const operation = this.pending.catch(() => undefined).then(async () => {
      await this.client.getStore().insert(WORKSPACE_KEY, bytes);
      await this.stronghold.save();
      const confirmed = await this.client.getStore().get(WORKSPACE_KEY);
      if (!confirmed || new TextDecoder().decode(confirmed) !== payload) {
        throw new Error('Encrypted workspace verification failed');
      }
    });
    this.pending = operation;
    return operation;
  }

  flush(): Promise<void> { return this.pending; }
}
