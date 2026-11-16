/**
 * Native WebView2 acceptance test for a *real installed* API Studio Windows binary.
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
      await page.getByRole('textbox', {name:'Workspace passphrase'}).waitFor({state:'visible', timeout:5_000});
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

  await page.evaluate(([storageKey, data]) => localStorage.setItem(storageKey, JSON.stringify(data)), [key,legacy]);
  console.log('Seeded legacy workspace in the installed app WebView');
  await page.getByRole('textbox',{name:'Workspace passphrase'}).fill(passphrase);
  await page.getByRole('button',{name:/Unlock \/ create encrypted vault/}).click();
  await expect(page.locator('.vault-backdrop')).toBeHidden({timeout:30_000});
  await expect(page.getByText('Legacy smoke collection')).toBeVisible();
  const afterMigration = await page.evaluate(k => localStorage.getItem(k), key);
  if (afterMigration !== null) throw new Error('Unencrypted legacy workspace was not removed after successful migration');
  const historic = await page.evaluate(k => {
    const all = {...localStorage};
    return Object.values(all).join('\n').includes(k);
  }, legacyToken);
  if (historic) throw new Error('Legacy token leaked in WebView local storage after migration');

  await page.getByRole('button',{name:'History',exact:true}).click();
  const historyText = await page.locator('.history-item').first().innerText();
  if (historyText.includes(legacyToken)) throw new Error('History still contains original secret');
  await page.getByRole('button',{name:'Collections',exact:true}).click();
  await page.getByRole('textbox',{name:'Request name'}).fill('Native saved request');
  await page.getByRole('textbox',{name:'Request URL'}).fill('https://example.com/native-test');
  await page.getByRole('button',{name:/Save request/}).click();
  await expect(page.locator('.toast')).toContainText('Request saved');
  await delay(2000); // Stronghold serializes saves asynchronously.

  console.log('First run: encrypted migration, privacy and saving passed. Restarting process.');
  await stop();
  page = await start(19322);
  await page.getByRole('textbox',{name:'Workspace passphrase'}).fill('incorrect-passphrase-for-test');
  await page.getByRole('button',{name:/Unlock \/ create encrypted vault/}).click();
  await expect(page.getByRole('alert')).toContainText('Could not unlock the vault', {timeout:20_000});
  await page.getByRole('textbox',{name:'Workspace passphrase'}).fill(passphrase);
  await page.getByRole('button',{name:/Unlock \/ create encrypted vault/}).click();
  await expect(page.locator('.vault-backdrop')).toBeHidden({timeout:30_000});
  await expect(page.getByText('Legacy smoke collection')).toBeVisible();
  const saved = page.locator('.request-nav').filter({hasText:'Native saved request'});
  await expect(saved).toBeVisible();
  await saved.click();
  await expect(page.getByRole('textbox',{name:'Request URL'})).toHaveValue('https://example.com/native-test');
  await page.getByRole('button',{name:'History',exact:true}).click();
  await expect(page.locator('.history-item')).toHaveCount(1);
  const afterRestart = await page.evaluate(k => localStorage.getItem(k), key);
  if (afterRestart !== null) throw new Error('Unencrypted workspace reappeared after restart');
  console.log('PASS: installed Windows app, vault migration, wrong passphrase, restart, saved data, private history');
}

try {
  await main();
} finally {
  await stop();
  rmSync(userDataDir, {recursive:true,force:true});
}
