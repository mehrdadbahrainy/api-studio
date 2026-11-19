import { isNewerRelease } from './version-utils';
/** GitHub release metadata is untrusted. Only this repository's strict stable version tags are linked. */
export const SOURCE_REPOSITORY = 'https://github.com/mehrdadbahrainy/api-studio';
export const DOCUMENTATION_URL = SOURCE_REPOSITORY + '/blob/main/README.md';
export const PERSIAN_GUIDE_URL = SOURCE_REPOSITORY + '/blob/main/QUICKSTART.fa.md';
export const CHANGELOG_URL = SOURCE_REPOSITORY + '/blob/main/CHANGELOG.md';
export const ISSUES_URL = SOURCE_REPOSITORY + '/issues';
export const RELEASES_URL = SOURCE_REPOSITORY + '/releases';
export const LICENSE_URL = SOURCE_REPOSITORY + '/blob/main/LICENSE';
export interface PublicRelease { tag_name?:string; draft?:boolean; prerelease?:boolean; html_url?:string; }
export interface UpdateStatus {
  installedVersion:string;
  latestVersion:string|null;
  updateAvailable:boolean;
  releaseUrl:string|null;
}
const STRICT_VERSION = /^v?(\d{1,5})\.(\d{1,5})\.(\d{1,5})$/;
function versionParts(tag:string):number[]|null {
  const parts=STRICT_VERSION.exec(tag.trim());
  return parts?parts.slice(1).map(Number):null;
}
export function selectLatestStableRelease(input:unknown):{tag:string;url:string}|null {
  if(!Array.isArray(input))throw new Error('GitHub releases response was not a list.');
  let winner:{tag:string;url:string;parts:number[]}|null=null;
  for(const raw of input.slice(0,100)){
    if(!raw || typeof raw!=='object')continue;
    const release=raw as PublicRelease;
    if(release.draft!==false || release.prerelease===true || typeof release.tag_name!=='string')continue;
    const parts=versionParts(release.tag_name);
    if(!parts)continue;
    if(!winner || parts.some((part,i)=>part!==winner!.parts[i] && parts.slice(0,i).every((p,j)=>p===winner!.parts[j]) && part>winner!.parts[i])){
      winner={tag:release.tag_name,url:SOURCE_REPOSITORY+'/releases/tag/'+encodeURIComponent(release.tag_name),parts};
    }
  }
  return winner?{tag:winner.tag,url:winner.url}:null;
}
export function describeUpdate(installedVersion:string,releases:unknown):UpdateStatus {
  const latest=selectLatestStableRelease(releases);
  return {
    installedVersion,latestVersion:latest?.tag??null,
    updateAvailable:!!latest && isNewerRelease(latest.tag,installedVersion),
    releaseUrl:latest?.url??null
  };
}
