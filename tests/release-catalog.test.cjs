const {test}=require('node:test');
const assert=require('node:assert/strict');
const {describeUpdate,selectLatestStableRelease,SOURCE_REPOSITORY}=require('../.test-dist/release-catalog.js');

const release=(tag,other={})=>({tag_name:tag,draft:false,prerelease:false,html_url:'https://attacker.example/evil',...other});
test('stable update selection compares numeric semver, not GitHub response order',()=>{
  const latest=selectLatestStableRelease([release('v0.1.9'),release('v0.2.0'),release('v0.1.14')]);
  assert.deepEqual(latest,{tag:'v0.2.0',url:SOURCE_REPOSITORY+'/releases/tag/v0.2.0'});
});
test('draft, prerelease, malformed and external links are ignored',()=>{
  const latest=selectLatestStableRelease([
    release('v9.9.9',{draft:true}),release('v8.0.0',{prerelease:true}),
    release('v2.0.0-rc.1'),release('v7.0.0%2Fmalicious'),
    release('v0.2.0')
  ]);
  assert.equal(latest.tag,'v0.2.0');
  assert.equal(latest.url,SOURCE_REPOSITORY+'/releases/tag/v0.2.0');
  assert.equal(selectLatestStableRelease([release('v4.0.0',{draft:true})]),null);
});
test('update available, up to date and offline-like empty release outcomes',()=>{
  assert.deepEqual(describeUpdate('0.1.4',[release('v0.2.0')]),{
    installedVersion:'0.1.4',latestVersion:'v0.2.0',updateAvailable:true,
    releaseUrl:SOURCE_REPOSITORY+'/releases/tag/v0.2.0'
  });
  assert.equal(describeUpdate('0.2.0',[release('v0.1.4')]).updateAvailable,false);
  assert.equal(describeUpdate('0.2.0',[release('v0.2.0')]).updateAvailable,false);
  assert.equal(describeUpdate('0.1.4',[]).releaseUrl,null);
  assert.throws(()=>selectLatestStableRelease({bad:true}),/not a list/);
});
