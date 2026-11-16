import { appLocalDataDir } from '@tauri-apps/api/path';
import { Stronghold, Client } from '@tauri-apps/plugin-stronghold';
import { Workspace } from './models';
import { parseWorkspace } from './workspace-utils';
import { loadWorkspace, removeLegacyWorkspace, hasLegacyWorkspace } from './storage';
const CLIENT = 'api-studio-workspace';
const WORKSPACE_KEY = 'workspace-v1';
const SNAPSHOT_FILE = 'workspace.stronghold';
export class SecureWorkspace {
  private pending: Promise<void> = Promise.resolve();
  private constructor(private readonly stronghold: Stronghold, private readonly client: Client) {}
  static async unlock(passphrase: string): Promise<{vault: SecureWorkspace; workspace: Workspace; migrated: boolean}> {
    if (passphrase.length < 12) throw new Error('Use a passphrase of at least 12 characters.');
    const folder = await appLocalDataDir();
    const path = `${folder.replace(/[\\/]$/, '')}/${SNAPSHOT_FILE}`;
    const stronghold = await Stronghold.load(path, passphrase);
    let client: Client;
    try { client = await stronghold.loadClient(CLIENT); }
    catch { client = await stronghold.createClient(CLIENT); }
    const vault = new SecureWorkspace(stronghold, client);
    const previous = await client.getStore().get(WORKSPACE_KEY);
    if (previous !== null) {
      const workspace = parseWorkspace(JSON.parse(new TextDecoder().decode(previous)));
      removeLegacyWorkspace();
      return {vault, workspace, migrated: false};
    }
    const migrated = hasLegacyWorkspace();
    const legacy = loadWorkspace();
    if (migrated && legacy.warning) throw new Error('Legacy workspace could not be read. Export a backup from v0.1.0 before upgrading.');
    await vault.save(legacy.workspace);
    if (migrated) removeLegacyWorkspace();
    return {vault, workspace: legacy.workspace, migrated};
  }
  save(workspace: Workspace): Promise<void> {
    const bytes = Array.from(new TextEncoder().encode(JSON.stringify(workspace)));
    const operation = this.pending.catch(() => undefined).then(async () => {
      await this.client.getStore().insert(WORKSPACE_KEY, bytes);
      await this.stronghold.save();
    });
    this.pending = operation;
    return operation;
  }
  flush(): Promise<void> { return this.pending; }
}
