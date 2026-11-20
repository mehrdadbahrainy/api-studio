const { test } = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
globalThis.crypto = webcrypto;
const { initialWorkspace } = require('../.test-dist/models.js');
const { createSalt, deriveVaultKey, encryptWorkspace, decryptWorkspace } = require('../.test-dist/vault-crypto.js');

test('encrypted workspace protects saved credentials and restores exactly', async () => {
  const workspace = initialWorkspace();
  workspace.environments[0].variables[1].value = 'VERY_PRIVATE_API_TOKEN_123456';
  const passphrase = 'correct horse battery staple for a CI vault';
  const salt = createSalt(), key = await deriveVaultKey(passphrase, salt);
  const ciphertext = await encryptWorkspace(workspace, key, salt);
  assert.equal(ciphertext.includes('VERY_PRIVATE_API_TOKEN_123456'), false);
  assert.equal(ciphertext.includes('Getting started'), false);
  const opened = await decryptWorkspace(passphrase, ciphertext);
  assert.equal(opened.workspace.environments[0].variables[1].value, 'VERY_PRIVATE_API_TOKEN_123456');
  assert.deepEqual(opened.workspace, workspace);
});

test('wrong passphrase rejects without revealing or modifying data', async () => {
  const salt = createSalt(), key = await deriveVaultKey('original passphrase 123', salt);
  const ciphertext = await encryptWorkspace(initialWorkspace(), key, salt);
  await assert.rejects(decryptWorkspace('incorrect passphrase', ciphertext), /Incorrect passphrase/);
  const original = await decryptWorkspace('original passphrase 123', ciphertext);
  assert.equal(original.workspace.collections.length, 1);
});

test('tampering with encrypted payload is detected by AES-GCM authentication', async () => {
  const salt = createSalt(), passphrase = 'strong passphrase 000';
  const key = await deriveVaultKey(passphrase, salt);
  const payload = JSON.parse(await encryptWorkspace(initialWorkspace(), key, salt));
  const original = payload.ciphertext;
  payload.ciphertext = (original[0] === 'A' ? 'B' : 'A') + original.slice(1);
  await assert.rejects(decryptWorkspace(passphrase, JSON.stringify(payload)), /corrupted/);
});

test('each encrypted save has a unique nonce and ciphertext', async () => {
  const salt = createSalt(), key = await deriveVaultKey('very long safe passphrase', salt);
  const workspace = initialWorkspace();
  const a = JSON.parse(await encryptWorkspace(workspace, key, salt));
  const b = JSON.parse(await encryptWorkspace(workspace, key, salt));
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.ciphertext, b.ciphertext);
  assert.deepEqual((await decryptWorkspace('very long safe passphrase', JSON.stringify(b))).workspace, workspace);
});

test('short passphrases and unsupported workspace metadata are rejected', async () => {
  await assert.rejects(deriveVaultKey('too short', createSalt()), /at least 12/);
  await assert.rejects(decryptWorkspace('valid password here', '{}'), /Unsupported or damaged/);
});
test('encryption rejects a workspace that could not be restored losslessly',async()=>{
  const workspace=initialWorkspace();workspace.collections[0].requests[0].body='x'.repeat(2000001);
  const salt=createSalt(),key=await deriveVaultKey('synthetic oversized vault password',salt);
  await assert.rejects(encryptWorkspace(workspace,key,salt),/Request body exceeds/);
  assert.equal(workspace.collections[0].requests[0].body.length,2000001);
});
