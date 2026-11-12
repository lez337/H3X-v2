'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { repository, newer, selectRelease, checksum, setupUpdates } = require('./updates.cjs');
const name = 'H3X-Searcher-Setup-0.2.0-x64.exe';
const url = file => `https://github.com/owner/repo/releases/download/v0.2.0/${file}`;
const release = () => ({ tag_name: 'v0.2.0', assets: [name, 'SHA256SUMS.txt'].map(name => ({ name, browser_download_url: url(name), size: 4 })) });
test('compares stable versions numerically and rejects prerelease tags', () => {
 assert.equal(newer('v0.10.0', '0.9.9'), true);
 assert.equal(newer('v0.1.0', '0.1.0'), false);
 assert.equal(newer('v0.1.0', '0.2.0'), false);
 assert.throws(() => newer('0.3.0-beta', '0.2.0'));
});
test('selects only complete newer releases from the configured repository', () => {
 assert.equal(selectRelease(release(), '0.1.0', 'owner/repo').version, '0.2.0');
 assert.equal(selectRelease({...release(), prerelease:true}, '0.1.0', 'owner/repo'), null);
 assert.equal(selectRelease(release(), '0.2.0', 'owner/repo'), null);
 assert.throws(() => selectRelease({...release(), assets:[]}, '0.1.0', 'owner/repo'));
 assert.throws(() => selectRelease(release(), '0.1.0', 'other/repo'));
 const malicious=release();malicious.assets[0].browser_download_url='https://evil.example/setup.exe';
 assert.throws(() => selectRelease(malicious, '0.1.0', 'owner/repo'));
});
test('validates repository names and exact checksum entries', () => {
 assert.equal(repository(' owner/repo '), 'owner/repo');
 assert.throws(() => repository('https://github.com/owner/repo'));
 const hash='a'.repeat(64);
 assert.equal(checksum(`${hash}  ${name}\n`,name),hash);
 assert.throws(() => checksum(`${hash}  wrong.exe`,name));
});

test('defaults to the project repository and migrates empty sources without enabling disabled checks', async () => {
 const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'h3x-update-default-'));
 try {
  for(const saved of [null,{repository:'',enabled:false},{repository:'other/repo',enabled:true}]){
   if(saved)await fs.writeFile(path.join(root,'updates.json'),JSON.stringify(saved));
   const handlers=new Map(),events=new Map();let initialized;
   const loaded=new Promise(resolve=>{initialized=resolve});
   const app={isPackaged:false,getVersion:()=> '0.2.3',getPath:()=>root,once:(name,fn)=>{events.set(name,fn);initialized()}};
   setupUpdates({app,ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},net:{fetch:()=>{throw Error('No network during startup')}}});
   await loaded;
   const status=handlers.get('updates:status')();
   assert.equal(status.repository,saved?.repository||'lez337/H3X-v2');
   assert.equal(status.enabled,saved?.enabled!==false);
   events.get('will-quit')();
  }
 } finally {await fs.rm(root,{recursive:true,force:true})}
});
test('downloads and verifies updates; mismatches never become installable', {skip:process.platform!=='win32'||process.arch!=='x64'}, async () => {
 const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'h3x-update-test-'));
 const payload=Buffer.from('test'),hash=crypto.createHash('sha256').update(payload).digest('hex');
 const handlers=new Map(),events=new Map();let valid=false,downloads=0;
 const app={isPackaged:true,getVersion:()=> '0.1.0',getPath:()=>root,once:(name,fn)=>events.set(name,fn)};
 setupUpdates({app,ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},net:{fetch:async address=>{
  let body;
  if(address.includes('api.github.com'))body=JSON.stringify(release());
  else if(address.endsWith('SHA256SUMS.txt'))body=`${valid?hash:'0'.repeat(64)}  ${name}\n`;
  else {body=payload;downloads++}
  return new Response(body);
 }}});
 try {
  await new Promise(resolve=>setTimeout(resolve,30));
  await handlers.get('updates:configure')(null,{repository:'owner/repo',enabled:false});
  const failed=await handlers.get('updates:check')();assert.equal(failed.phase,'error');
  await assert.rejects(()=>handlers.get('updates:install')(),/No verified update/);
  valid=true;
  const ready=await handlers.get('updates:check')();assert.equal(ready.phase,'ready');assert.equal(ready.progress,100);
  await handlers.get('updates:check')();assert.equal(downloads,2);
  await assert.rejects(()=>handlers.get('updates:configure')(null,{repository:'other/repo',enabled:true}));
  const [downloadFolder]=await fs.readdir(path.join(root,'h3x-updates'));
  await fs.writeFile(path.join(root,'h3x-updates',downloadFolder,name),'modified');
  await assert.rejects(()=>handlers.get('updates:install')(),/Update file changed/);
 } finally {events.get('will-quit')?.();await fs.rm(root,{recursive:true,force:true})}
});
