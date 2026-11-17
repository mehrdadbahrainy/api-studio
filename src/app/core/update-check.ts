import { isTauri } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { fetch as nativeFetch } from '@tauri-apps/plugin-http';
import { isNewerRelease } from './version-utils';
const RELEASES_API = 'https://api.github.com/repos/mehrdadbahrainy/api-studio/releases?per_page=10';
export const RELEASES_PAGE = 'https://github.com/mehrdadbahrainy/api-studio/releases';
export async function checkForUpdates(): Promise<string> {
  const installed = isTauri() ? await getVersion() : '0.1.4';
  const response = await (isTauri() ? nativeFetch : fetch)(RELEASES_API, {
    headers: {Accept:'application/vnd.github+json'},
    signal:AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error('Could not check releases right now. Please try again later.');
  const releases = await response.json() as Array<{tag_name?:string;draft?:boolean;html_url?:string}>;
  const latest = releases.find(release => !release.draft && typeof release.tag_name === 'string' && /^v?\d+\.\d+\.\d+/.test(release.tag_name));
  if (!latest?.tag_name) return 'No published releases are available yet.';
  return isNewerRelease(latest.tag_name, installed)
    ? `Update available: ${latest.tag_name}. Download it from GitHub Releases.`
    : `You are up to date (v${installed}). Latest published release: ${latest.tag_name}.`;
}
