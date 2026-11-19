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
const userDataDir = mkdtempSync(join(tmpdir(), 'api-studio-webview-'));
const passphrase = 'ci-fake-test-passphrase-2026';
const legacyToken = 'FAKE_CI_MIGRATION_TOKEN_DO_NOT_USE';
const legacyBody = 'FAKE_CI_PRIVATE_BODY';
const key = 'api-studio.workspace.v1';
const delay = ms => new Promise(r => setTimeout(r, ms));
let spawned = null, browser = null;

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

  console.log('Native protected migration and saving passed. Restarting without a password.');
  await stop();
  page = await start(19321);
  await expect(page.locator('.vault-backdrop')).toBeHidden({timeout:30_000});
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
  rmSync(userDataDir, {recursive:true,force:true});
}
