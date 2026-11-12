'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {EventEmitter}=require('node:events');
const JSZip=require('jszip');
const {scanFiles,decodeText,limits}=require('./file-scan.cjs');
const {registerFileScanner}=require('./file-scan-ipc.cjs');
async function fixture(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'h3x-scan-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return async(name,bytes)=>{const file=path.join(dir,name);await fs.writeFile(file,bytes);return file}}

test('decoder supports UTF-8, both UTF-16 byte orders, BOM-less Windows text and a reported legacy fallback',()=>{
 const text='name: Élodie Martin';const le=Buffer.from(text,'utf16le'),be=Buffer.from(le);be.swap16();
 for(const bytes of [Buffer.from(text),Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from(text)]),Buffer.concat([Buffer.from([0xff,0xfe]),le]),Buffer.concat([Buffer.from([0xfe,0xff]),be]),le,be])assert.equal(decodeText(bytes).text,text);
 assert.equal(decodeText(Buffer.from([0xe9])).encoding,'Windows-1252');assert.throws(()=>decodeText(Buffer.from([0,1,2,3,4,5])),/Binary/);
});

test('batch scans preserve per-file sources, report unreadable input and correctly distinguish the exact match cap',async t=>{
 const write=await fixture(t),a=await write('a.txt','one@example.org\none@example.org'),b=await write('b.json','{"email":"two@example.org"}');const progress=[];
 const result=await scanFiles([a,b,a+'missing'],{kinds:['email'],limit:2},value=>progress.push(value));
 assert.equal(result.count,2);assert.equal(result.truncated,false);assert.equal(result.hits[0].occurrences,2);assert.equal(result.filesScanned,2);assert.equal(result.filesSkipped,1);assert.ok(progress.some(p=>p.phase==='scanning'));assert.equal(result.hits[1].file,'b.json');
 const limited=await scanFiles([a,b],{limit:1});assert.equal(limited.count,1);assert.equal(limited.truncated,true);
});

test('ZIP scans check integrity, skip unsafe or unsupported paths, and enforce entry sizes before decompression',async t=>{
 const write=await fixture(t),zip=new JSZip();zip.file('people.csv','name,email\nJane Doe,jane@example.org');zip.file('../unsafe.txt','unsafe@example.org');zip.file('photo.png','image');zip.file('nested.zip','archive');zip.file('large.txt','x'.repeat(limits.entryBytes+1));
 const file=await write('batch.zip',await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}));const result=await scanFiles([file]);
 assert.deepEqual(result.hits.map(hit=>hit.value),['Jane Doe','jane@example.org']);assert.equal(result.filesSkipped,4);assert.ok(result.warnings.some(w=>w.message.includes('20 MB')));assert.ok(result.warnings.some(w=>w.message.includes('Unsafe')));
 const broken=new JSZip();broken.file('entry.txt','bad@example.org');const data=await broken.generateAsync({type:'nodebuffer',compression:'STORE'});data[data.indexOf(Buffer.from('bad@example.org'))]=120;
 const corrupt=await scanFiles([await write('corrupt.zip',data)]);assert.equal(corrupt.count,0);assert.ok(corrupt.warnings.some(w=>w.message.includes('checksum')));
});

test('forged ZIP sizes are bounded while inflating, independently of archive metadata',async t=>{
 const write=await fixture(t),zip=new JSZip();zip.file('forged.txt','x'.repeat(limits.entryBytes+1));
 const bytes=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
 const central=bytes.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));bytes.writeUInt32LE(1,central+24);bytes.writeUInt32LE(1,22);
 const result=await scanFiles([await write('forged.zip',bytes)]);assert.equal(result.count,0);assert.equal(result.filesSkipped,1);assert.ok(result.warnings.some(w=>/decompression limit|size mismatch/.test(w.message)));
});

test('binary files and malformed archives produce visible notices without aborting other files',async t=>{
 const write=await fixture(t);const result=await scanFiles([await write('binary.txt',Buffer.from([0,1,2,3,4,5])),await write('bad.zip','broken zip'),await write('good.txt','good@example.org')]);
 assert.equal(result.filesScanned,1);assert.equal(result.filesSkipped,2);assert.equal(result.hits[0].value,'good@example.org');
});

function ipcFixture(files){
 const handlers=new Map(),sender=new EventEmitter();sender.id=1;sender.isDestroyed=()=>false;sender.send=()=>{};
 registerFileScanner({ipcMain:{handle:(name,handler)=>handlers.set(name,handler)},dialog:{showOpenDialog:async()=>({filePaths:files,canceled:false})},getWindow:()=>null,log:async()=>{}});
 return {run:payload=>handlers.get('file:scan')({sender},payload),cancel:()=>handlers.get('file:cancel')({sender}),sender};
}
test('IPC runs the real worker, forwards progress and cleans up listeners after completion',async t=>{
 const write=await fixture(t),ipc=ipcFixture([await write('worker.txt','worker@example.org')]);let progress=false;ipc.sender.send=(channel)=>{if(channel==='file:progress')progress=true};
 const result=await ipc.run({kinds:['email']});assert.equal(result.count,1);assert.equal(progress,true);assert.equal(ipc.sender.listenerCount('destroyed'),0);assert.equal(ipc.cancel(),false);
});

test('canceling terminates the worker, rejects simultaneous scans and allows a new scan',async t=>{
 const write=await fixture(t),ipc=ipcFixture([await write('worker.txt','worker@example.org')]);
 ipc.sender.send=()=>ipc.cancel();const pending=ipc.run({kinds:['email']});await assert.rejects(ipc.run({kinds:['email']}),/already running/);
 assert.equal((await pending).canceled,true);assert.equal(ipc.sender.listenerCount('destroyed'),0);
 ipc.sender.send=()=>{};assert.equal((await ipc.run({kinds:['email']})).count,1);
 await assert.rejects(ipc.run({kinds:[]}),/at least one/);
});
