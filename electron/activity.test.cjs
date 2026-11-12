'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createActivity,redact}=require('./activity.cjs');
test('activity serializes concurrent writes and restores structured history',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'h3x-activity-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const store=createActivity(dir);
 await Promise.all(Array.from({length:12},(_,i)=>store.add('Operation '+i,'token=private-value',{scope:'file',level:'error',durationMs:i})));
 const entries=await createActivity(dir).list();assert.equal(entries.length,12);assert.equal(entries[11].durationMs,11);assert.equal(entries[0].level,'error');assert.equal(entries[0].scope,'file');assert.equal(new Set(entries.map(e=>e.id)).size,12);assert.ok(!JSON.stringify(entries).includes('private-value'));
});
test('activity rotates files and tolerates partial lines and legacy entries',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'h3x-activity-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 await fs.writeFile(path.join(dir,'activity.log'),JSON.stringify({time:new Date().toISOString(),event:'Search failed',detail:'password=hidden'})+'\n{partial\n');
 const store=createActivity(dir,{maxBytes:1,maxEntries:2});await store.add('Second');await store.add('Third');
 const entries=await store.list();assert.deepEqual(entries.map(e=>e.event),['Second','Third']);assert.deepEqual((await createActivity(dir).list()).map(e=>e.event),['Second','Third']);
});
test('activity redacts credentials, emails, URL query strings and local paths',()=>{
 const result=redact('Bearer abc123 api_key=secret user@example.org https://example.org/api?token=secret C:\\Users\\Person\\private.txt');
 for(const value of ['abc123','secret','user@example.org','Person'])assert.ok(!result.includes(value));
});
