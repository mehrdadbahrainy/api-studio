/**
 * Native WebView2 acceptance test for the exact installed Windows CI build.
 * Runs on a disposable GitHub-hosted Windows runner. CDP is enabled exclusively via
 * a child-process environment variable. Never enable this in distributed releases.
 * Reference: https://playwright.dev/docs/webview2
 */
import { chromium, expect } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';

const executable = process.env.API_STUDIO_EXE;
if (!executable) throw new Error('API_STUDIO_EXE must point to the MSI-installed desktop executable');
if (process.env.GITHUB_ACTIONS !== 'true' || process.env.API_STUDIO_DISPOSABLE_RUNNER !== '1') {
  throw new Error('Native acceptance changes workspace data and must only run on an explicitly disposable GitHub Actions runner. Never run against a personal Windows profile.');
}
const userDataDir = mkdtempSync(join(tmpdir(), 'api-studio-webview-'));
const passphrase = 'ci-fake-test-passphrase-2026';
const legacyToken = 'FAKE_CI_MIGRATION_TOKEN_DO_NOT_USE';
const legacyBody = 'FAKE_CI_PRIVATE_BODY';
const key = 'api-studio.workspace.v1';
const delay = ms => new Promise(r => setTimeout(r, ms));
let spawned = null, browser = null;
const mock = spawn(process.execPath, [resolve('tests/e2e/mock-api.mjs')], {stdio:'ignore',windowsHide:true});

async function realHttpAcceptance(page) {
  const fixture='http://127.0.0.1:4311';
  await expect.poll(async()=>{try{return (await fetch(fixture+'/health')).status;}catch{return 0;}}).toBe(200);
  for(const method of ['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS']){
    await page.getByRole('combobox',{name:'HTTP method'}).selectOption(method);
    await page.getByRole('textbox',{name:'Request URL'}).fill(fixture+'/echo?native='+method);
    await page.getByRole('button',{name:'Send',exact:true}).click();
    await expect(page.getByRole('button',{name:'Send',exact:true})).toBeVisible();
    await expect(page.locator('.response-metrics')).toContainText(method==='OPTIONS'?'204':'200');
    if(!['HEAD','OPTIONS'].includes(method))await expect(page.locator('.response-code')).toContainText('"method": "'+method+'"');
  }
  await page.getByRole('combobox',{name:'HTTP method'}).selectOption('GET');
  await page.getByRole('textbox',{name:'Request URL'}).fill(fixture+'/slow-body?ms=700');
  await page.getByRole('button',{name:'Send',exact:true}).click();
  await expect(page.locator('.response-code')).toHaveText('first-last');
  const metrics=await page.locator('.response-metrics').innerText();
  if(Number(metrics.match(/Time\s*(\d+)\s*ms/)[1])<650)throw new Error('Native elapsed time excluded response body download');
  await page.getByRole('textbox',{name:'Request URL'}).fill(fixture+'/payload?kind=html');
  await page.getByRole('button',{name:'Send',exact:true}).click();
  await expect(page.locator('.response-code')).toContainText('<script>window.qaInjected=true</script>');
  if(await page.evaluate(()=>window.qaInjected===true))throw new Error('Native markup response executed a script');
  await page.getByRole('textbox',{name:'Request URL'}).fill(fixture+'/payload?kind=oversized');
  await page.getByRole('button',{name:'Send',exact:true}).click();
  await expect(page.locator('.response-code')).toContainText('5 MB preview limit');
  await page.getByRole('textbox',{name:'Request URL'}).fill(fixture+'/delay?ms=5000');
  await page.getByRole('button',{name:'Send',exact:true}).click();
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Request cancelled');
  await page.getByRole('button',{name:/Save request/}).click();
  await expect(page.locator('.toast')).toContainText('Request saved');
  console.log('PASS: real native HTTP seven methods, full response timing, inert HTML, oversized body and cancellation');
}

async function nativeImportAcceptance(page) {
  for(const version of ['2.0','2.1']){
    const data={info:{name:'Native QA '+version,schema:`https://schema.getpostman.com/json/collection/v${version}.0/collection.json`},item:[{name:'Nested',item:[{name:'Native imported '+version,request:{method:'GET',url:'http://127.0.0.1:4311/echo'}}]}]};
    await page.getByRole('button',{name:'Workspace actions'}).click();
    page.once('dialog',d=>d.accept());
    await page.locator('.import-choice input[type=file]').setInputFiles({name:'qa-postman.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
    await expect(page.locator('.toast')).toContainText('Postman collection imported');
    await expect(page.locator('.request-nav').filter({hasText:'Native imported '+version})).toBeVisible();
    await expect(page.getByTitle('Getting started').locator('span')).toBeVisible();
  }
  await page.getByRole('button',{name:'Workspace actions'}).click();
  page.once('dialog',d=>d.accept());
  await page.locator('.import-choice input[type=file]').setInputFiles({name:'qa-environment.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({name:'Native QA environment',_postman_variable_scope:'environment',values:[{key:'baseUrl',value:'http://127.0.0.1:4311',enabled:true}]}))});
  await expect(page.locator('.toast')).toContainText('Postman environment added');
  await page.getByRole('button',{name:'Workspace actions'}).click();
  await page.locator('.import-choice input[type=file]').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{invalid')});
  await expect(page.getByRole('alert')).toContainText('Invalid JSON');
  await expect(page.locator('.request-nav').filter({hasText:'Native imported 2.1'})).toBeVisible();
  console.log('PASS: installed WebView2 file-input imports Postman v2.0/v2.1/environment and rejects malformed JSON (OS file-picker interaction remains separate coverage)');
}

async function nativeFieldIntegrityAcceptance(page) {
  const original=await page.evaluate(()=>window.__TAURI_INTERNALS__.invoke('read_protected_workspace'));
  await page.getByRole('combobox',{name:'HTTP method'}).selectOption('POST');
  await page.locator('.editor-tabs').getByRole('button',{name:'Body',exact:true}).click();
  await page.getByRole('radio',{name:'JSON',exact:true}).check();
  await page.getByRole('textbox',{name:'Request body'}).fill(JSON.stringify({payload:'x'.repeat(2000000)}));
  await page.getByRole('button',{name:/Save request/}).click();
  await expect(page.locator('.alert.warning')).toContainText('Request body exceeds');
  const retained=await page.evaluate(()=>window.__TAURI_INTERNALS__.invoke('read_protected_workspace'));
  if(retained!==original)throw new Error('Oversize edit replaced the valid native workspace');
  await page.getByRole('textbox',{name:'Request body'}).fill('{}');
  await page.getByRole('button',{name:/Save request/}).click();
  await expect(page.locator('.toast')).toContainText('Request saved');
  console.log('PASS: oversize request body rejected before native DPAPI write; previous workspace retained and valid edit can retry');
}

async function stop() {
  try { await browser?.close(); } catch {}
  browser = null;
  if (spawned?.pid) {
    try { execFileSync('taskkill.exe', ['/PID', String(spawned.pid), '/T', '/F'], {stdio:'ignore', timeout:15_000}); } catch {}
  }
  spawned = null;
  await delay(800);
}

async function start(port) {
  spawned = spawn(executable, [], {
    cwd: dirname(resolve(executable)),
    env: {
      ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
      WEBVIEW2_USER_DATA_FOLDER: userDataDir
    },
    stdio: 'ignore',
    windowsHide: false
  });
  let spawnError = null;
  spawned.on('error', e => { spawnError = e; });
  const until = Date.now() + 90_000;
  let lastFailure = 'WebView2 CDP port was not accessible';
  while (Date.now() < until) {
    if (spawnError) throw spawnError;
    if (spawned.exitCode !== null) throw new Error(`Installed application exited before WebView2 was ready (exit ${spawned.exitCode})`);
    try {
      const candidate = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, {timeout: 3_000});
      const contexts = candidate.contexts();
      const pages = contexts.flatMap(c => c.pages());
      const page = pages.find(p => p.url().includes('tauri.localhost')) ?? pages.find(p => !p.url().startsWith('devtools:')) ?? pages[0];
      if (!page) { await candidate.close(); throw new Error('CDP connected but no application page is available'); }
      await page.locator('.app-shell').waitFor({state:'visible', timeout:5_000});
      browser = candidate;
      return page;
    } catch (e) {
      lastFailure = e instanceof Error ? e.message.slice(0,300) : String(e);
      await delay(1200);
    }
  }
  throw new Error(`Installed desktop window could not be controlled through WebView2: ${lastFailure}`);
}

async function main() {
  console.log('Starting installed Windows application (first run)');
  let page = await start(19321);
  const legacy = {
    version:1,
    collections:[{id:'legacy-coll',name:'Legacy smoke collection',requests:[{
      id:'legacy-request',collectionId:'legacy-coll',name:'Migrated request',method:'GET',
      url:'https://example.com/legacy?token='+legacyToken,params:[],headers:[],
      bodyMode:'none',body:'',formData:[],authMode:'bearer',bearerToken:legacyToken,
      basicUsername:'',basicPassword:''
    }]}],
    environments:[{id:'legacy-env',name:'Legacy environment',variables:[
      {id:'token-field',enabled:true,key:'token',value:legacyToken}
    ]}],
    selectedEnvironmentId:'legacy-env',
    history:[{id:'historic',at:'2026-11-01T00:00:00Z',request:{
      id:'historic-request',name:'Old private request',method:'POST',
      url:'https://example.com/orders?secret='+legacyToken,
      params:[],headers:[],bodyMode:'text',body:legacyBody,formData:[],
      authMode:'bearer',bearerToken:legacyToken,basicUsername:'',basicPassword:''
    },status:200,durationMs:12}]
  };

  await expect(page.locator('.vault-backdrop')).toBeHidden({timeout:30_000});
  console.log('PASS: fresh installed Windows desktop opens without an app passphrase');
  // About is available offline. Links are restricted to the official repository
  // and open via the OS browser, never via embedded untrusted HTML.
  await page.getByRole('button',{name:'Help and About'}).click();
  const help=page.getByRole('dialog',{name:'API Studio'});
  await expect(help).toBeVisible();
  await expect(help.getByRole('link',{name:'Source code on GitHub'})).toHaveAttribute('href','https://github.com/mehrdadbahrainy/api-studio');
  await expect(help.getByRole('link',{name:'Persian quickstart guide'})).toHaveAttribute('href',/QUICKSTART\.fa\.md$/);
  await help.getByRole('button',{name:'Close Help and About'}).click();
  await expect(help).toBeHidden();
  console.log('PASS: installed WebView2 Help/About and source documentation links are accessible');
  const rejectedExternal=await page.evaluate(async()=>{
    try{await window.__TAURI_INTERNALS__.invoke('open_project_link',{url:'https://untrusted.example/'});return false;}
    catch{return true;}
  });
  if(!rejectedExternal)throw new Error('Native project opener accepted an untrusted URL');
  console.log('PASS: unsafe external URLs cannot be opened through native project link command');
  // Real installed MSI/WebView2 smoke for the new workspace navigation controls.
  const firstCollection=page.getByRole('button',{name:'Collapse Getting started'});
  await expect(firstCollection).toHaveAttribute('aria-expanded','true');
  await firstCollection.click();
  await expect(page.getByRole('button',{name:'Expand Getting started'})).toBeVisible();
  await page.getByRole('button',{name:'Expand Getting started'}).click();
  await expect(page.locator('.collection-requests .request-nav')).toHaveCount(1);
  const resize=page.getByRole('separator',{name:'Resize sidebar'});
  await resize.focus();
  await page.keyboard.press('ArrowRight');
  await expect(resize).toHaveAttribute('aria-valuenow','302');
  await page.getByRole('button',{name:'Collapse sidebar'}).click();
  await expect(page.locator('.sidebar')).toHaveClass(/is-collapsed/);
  await page.getByRole('button',{name:'Expand sidebar'}).click();
  await expect(page.locator('.sidebar')).not.toHaveClass(/is-collapsed/);
  console.log('PASS: installed WebView2 collection disclosure and sidebar layout controls');
  await page.getByRole('textbox',{name:'Request URL'}).fill('http://127.0.0.1:4311/echo?modal=background');
  await page.getByRole('button',{name:'Help and About'}).click();
  await expect(page.getByRole('button',{name:'Close Help and About'})).toBeFocused();
  await page.keyboard.press('Control+Enter');
  await delay(300);
  await expect(page.locator('.response-code')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog',{name:'API Studio'})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Help and About'})).toBeFocused();
  console.log('PASS: installed dialog owns keyboard focus and blocks hidden HTTP request shortcut');
  await realHttpAcceptance(page);
  await nativeFieldIntegrityAcceptance(page);
  await nativeImportAcceptance(page);

  await page.evaluate(async ([storageKey, data]) => {
    localStorage.setItem(storageKey, JSON.stringify(data));
    // Simulate upgrading from a pre-DPAPI legacy workspace: the old release
    // stored localStorage but had no Windows protected native workspace.
    await window.__TAURI_INTERNALS__.invoke('remove_protected_workspace');
  }, [key,legacy]);
  // The installed WebView2 flushes localStorage asynchronously. Killing the
  // process immediately after injection can lose the legacy fixture before
  // migration starts. Reload within the *installed* WebView2 first, so the
  // actual Angular/Tauri migration executes against the fixture. Subsequent
  // process restarts validate DPAPI persistence separately.
  console.log('Seeded legacy workspace; reloading installed WebView2 to perform native DPAPI migration');
  await page.reload();
  await expect(page.locator('.vault-backdrop')).toBeHidden({timeout:30_000});
  await expect(page.getByTitle('Legacy smoke collection').locator('span')).toBeVisible({timeout:30_000});
  const afterMigration = await page.evaluate(k => localStorage.getItem(k), key);
  if (afterMigration !== null) throw new Error('Unencrypted legacy workspace was not removed after successful DPAPI migration');
  const leaked = await page.evaluate(k => Object.values({...localStorage}).join('\n').includes(k), legacyToken);
  if (leaked) throw new Error('Legacy token leaked in WebView local storage after migration');

  await page.getByRole('tab',{name:'History',exact:true}).click();
  const historyText = await page.locator('.history-item').first().innerText();
  if (historyText.includes(legacyToken)) throw new Error('History still contains original secret');
  await page.getByRole('tab',{name:'Collections',exact:true}).click();
  await page.getByRole('textbox',{name:'Request name'}).fill('Native saved request');
  await page.getByRole('textbox',{name:'Request URL'}).fill('https://example.com/native-test');
  await page.getByRole('button',{name:/Save request/}).click();
  await expect(page.locator('.toast')).toContainText('Request saved');

  // Real installed WebView2 acceptance for v0.2.0 workspace UI: native
  // dialogs, nested folder persistence, moving a Collection, and saved tabs.
  page.once('dialog',dialog=>dialog.accept('Native / Smoke'));
  await page.getByRole('button',{name:'New folder'}).click();
  await expect(page.getByRole('button',{name:'Collapse folder Native'})).toBeVisible();
  await expect(page.locator('.toast')).toContainText('Folder created');
  page.once('dialog',dialog=>dialog.accept('Native / Smoke'));
  await page.getByRole('button',{name:'Move collection Legacy smoke collection to folder'}).click();
  await expect(page.getByRole('button',{name:'Collapse folder Smoke'})).toBeVisible();
  await expect(page.locator('.toast')).toContainText('Collection moved');
  await page.getByRole('button',{name:'Open new request tab'}).click();
  const newRequestName=page.getByRole('textbox',{name:'Request name'});
  await expect(newRequestName).toHaveValue('Untitled request');
  // Installed WebView2 can coalesce a synthetic fill with Angular model updates
  // when the tab was just created. Perform a real select-all/replace sequence.
  await newRequestName.click();
  await newRequestName.press('Control+A');
  await newRequestName.press('Backspace');
  await expect(newRequestName).toHaveValue('');
  await newRequestName.pressSequentially('Native second tab');
  await expect(newRequestName).toHaveValue('Native second tab');
  await newRequestName.press('Tab');
  await page.getByRole('textbox',{name:'Request URL'}).fill('https://example.com/another-tab');
  await page.getByRole('button',{name:/Save request/}).click();
  await expect(page.locator('.toast')).toContainText('Request saved');
  await expect(page.getByRole('tab',{name:'Open Native second tab'})).toBeVisible();
  // Reload inside the installed app to verify nonsecret tab IDs are restored
  // from Windows-protected workspace, independent of WebView2 localStorage flush.
  await page.reload();
  await expect(page.locator('.vault-backdrop')).toBeHidden({timeout:30_000});
  await expect(page.getByRole('tab',{name:'Open Native second tab'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Collapse folder Native'})).toBeVisible();
  const tabPrefBeforeRestart=await page.evaluate(async()=>{
    const raw=await window.__TAURI_INTERNALS__.invoke('read_protected_workspace');
    const prefs=raw?JSON.parse(raw).openTabState:null;
    return prefs?.requestIds.length??0;
  });
  if(tabPrefBeforeRestart<2)throw new Error('Saved tab IDs were not committed to Windows-protected workspace');
  // Protected workspace writes are verified before the save confirmation;
  // a short pause simulates an ordinary restart rather than a crash.
  await delay(2500);
  console.log('PASS: installed MSI native folder creation, Collection move, and saved tab restoration after WebView2 reload');

  console.log('Native protected migration and saving passed. Restarting without a password.');
  await stop();
  page = await start(19321);
  await expect(page.locator('.vault-backdrop')).toBeHidden({timeout:30_000});
  await expect(page.getByRole('button',{name:'Collapse folder Native'})).toBeVisible();
  const tabPrefAfterRestart=await page.evaluate(async()=>{
    const raw=await window.__TAURI_INTERNALS__.invoke('read_protected_workspace');
    const prefs=raw?JSON.parse(raw).openTabState:null;
    return prefs?.requestIds.length??0;
  });
  console.log('Saved tab IDs after native process restart:',tabPrefAfterRestart);
  if(tabPrefAfterRestart<2)throw new Error('Saved tab IDs were lost across installed app restart');
  await expect(page.getByRole('tab',{name:'Open Native second tab'})).toBeVisible();
  await expect(page.getByTitle('Legacy smoke collection').locator('span')).toBeVisible();
  const saved=page.locator('.request-nav').filter({hasText:'Native saved request'});
  await expect(saved).toBeVisible();
  await saved.click();
  await expect(page.getByRole('textbox',{name:'Request URL'})).toHaveValue('https://example.com/native-test');

  // Opt-in passphrase should create encrypted storage and remove the
  // passwordless DPAPI copy only after the encrypted write is verified.
  await page.getByRole('button',{name:'Workspace actions'}).click();
  await page.getByRole('button',{name:'Security settings'}).click();
  await page.getByLabel('New workspace passphrase').fill(passphrase);
  await page.getByRole('button',{name:'Enable passphrase on next start'}).click();
  await expect(page.getByRole('heading',{name:'Security settings'})).toBeHidden({timeout:30_000});
  console.log('Optional password enabled. Restarting for wrong passphrase acceptance.');
  await stop();
  page = await start(19321);
  await page.locator('#vault-passphrase').waitFor({state:'visible',timeout:30_000});
  await page.locator('#vault-passphrase').fill('incorrect-passphrase-for-test');
  await page.getByRole('button',{name:'Unlock existing encrypted vault'}).click();
  await expect(page.getByRole('alert')).toContainText(/Incorrect passphrase|damaged encrypted workspace/i,{timeout:30_000});
  await page.locator('#vault-passphrase').fill(passphrase);
  await page.getByRole('button',{name:'Unlock existing encrypted vault'}).click();
  await expect(page.locator('.vault-backdrop')).toBeHidden({timeout:30_000});
  await expect(page.getByTitle('Legacy smoke collection').locator('span')).toBeVisible();

  console.log('Passphrase unlock succeeded. It must remain enabled after restart.');
  await stop();
  page = await start(19321);
  await page.locator('#vault-passphrase').waitFor({state:'visible',timeout:30_000});
  await page.locator('#vault-passphrase').fill(passphrase);
  await page.getByRole('button',{name:'Unlock existing encrypted vault'}).click();
  await expect(page.locator('.vault-backdrop')).toBeHidden({timeout:30_000});
  await page.getByTitle('Legacy smoke collection').locator('span').waitFor({state:'visible'});
  // The user can explicitly disable password mode and fall back to DPAPI.
  await page.getByRole('button',{name:'Workspace actions'}).click();
  await page.getByRole('button',{name:'Security settings'}).click();
  await page.getByRole('button',{name:'Use Windows protection without app password'}).click();
  await expect(page.getByRole('heading',{name:'Security settings'})).toBeHidden({timeout:30_000});
  console.log('Password disabled by user; restarting for passwordless DPAPI acceptance.');
  await stop();
  page = await start(19321);
  await expect(page.locator('.vault-backdrop')).toBeHidden({timeout:30_000});
  const afterRestart = await page.evaluate(k => localStorage.getItem(k), key);
  if (afterRestart !== null) throw new Error('Unencrypted workspace reappeared after restart');
  await page.getByRole('tab',{name:'History',exact:true}).click();
  await expect(page.locator('.history-item')).toHaveCount(1);
  console.log('PASS: installed Windows MSI, default passwordless DPAPI, legacy migration, optional persistent password, wrong password, explicit disable, restart and private history');

}

try {
  await main();
} finally {
  await stop();
  mock.kill();
  rmSync(userDataDir, {recursive:true,force:true});
}
