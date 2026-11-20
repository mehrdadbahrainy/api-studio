import { isTauri } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { fetch as nativeFetch } from '@tauri-apps/plugin-http';
import { describeUpdate, RELEASES_URL, UpdateStatus } from './release-catalog';
const RELEASES_API = 'https://api.github.com/repos/mehrdadbahrainy/api-studio/releases?per_page=30';
export const RELEASES_PAGE = RELEASES_URL;
/** Manual and startup checks only. No silent downloads, installers or executable code. */
export async function checkForUpdates(browserVersion='0.2.2'):Promise<UpdateStatus> {
  const installed = isTauri() ? await getVersion() : browserVersion;
  const response=await (isTauri()?nativeFetch:fetch)(RELEASES_API,{
    headers:{Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(10_000)
  });
  if(!response.ok)throw new Error('GitHub Releases could not be checked.');
  return describeUpdate(installed,await response.json());
}
