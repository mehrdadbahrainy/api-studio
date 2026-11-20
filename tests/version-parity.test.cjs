const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');

const root=join(__dirname,'..');
const read=path=>readFileSync(join(root,path),'utf8');

test('published application version matches Angular, Tauri, Cargo and update checker',()=>{
  const npm=JSON.parse(read('package.json')).version;
  const tauri=JSON.parse(read('src-tauri/tauri.conf.json')).version;
  const cargo=/^version\s*=\s*"([^"]+)"/m.exec(read('src-tauri/Cargo.toml'))?.[1];
  const app=/readonly version='([^']+)'/.exec(read('src/app/app.component.ts'))?.[1];
  const update=/browserVersion='([^']+)'/.exec(read('src/app/core/update-check.ts'))?.[1];
  assert.match(npm,/^\d+\.\d+\.\d+$/);
  assert.equal(tauri,npm);
  assert.equal(cargo,npm);
  assert.equal(app,npm);
  assert.equal(update,npm);
});
