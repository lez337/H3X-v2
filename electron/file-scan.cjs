'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const JSZip=require('jszip');
const {scanDetailed}=require('./scanner.cjs');
const MB=1024*1024;
const limits=Object.freeze({fileBytes:100*MB,batchBytes:200*MB,entryBytes:20*MB,expandedBytes:100*MB,archiveEntries:2000,files:1000});
const supported=/\.(?:txt|log|csv|tsv|json|jsonl|ndjson)$/i;
function decodeText(bytes){
 let encoding='UTF-8',text;
 if(bytes[0]===0xff&&bytes[1]===0xfe){text=new TextDecoder('utf-16le',{fatal:true}).decode(bytes.subarray(2));encoding='UTF-16 LE'}
 else if(bytes[0]===0xfe&&bytes[1]===0xff){text=new TextDecoder('utf-16be',{fatal:true}).decode(bytes.subarray(2));encoding='UTF-16 BE'}
 else{
  // Windows tools frequently write UTF-16 without a BOM. Require a clear NUL pattern.
  const sample=bytes.subarray(0,4096);let even=0,odd=0;for(let i=0;i<sample.length;i++)if(sample[i]===0)(i%2?odd++:even++);
  if(sample.length>=8&&(odd>sample.length*.3||even>sample.length*.3)){encoding=odd>even?'UTF-16 LE':'UTF-16 BE';text=new TextDecoder(odd>even?'utf-16le':'utf-16be',{fatal:true}).decode(bytes)}
  else{try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes)}catch{encoding='Windows-1252';text=new TextDecoder('windows-1252').decode(bytes)}}
 }
 if(text.includes('\0')||((text.match(/[\x01-\x08\x0b\x0e-\x1f]/g)||[]).length>Math.max(3,text.length*.01)))throw Error('Binary content is not supported');
 return {text:text.replace(/^\uFEFF/,''),encoding};
}
// Bound decompression while bytes arrive; never inflate an entire entry before checking its size.
function readEntry(entry,maxBytes,onBytes){
 return new Promise((resolve,reject)=>{
  const chunks=[];let size=0;const stream=entry.nodeStream('nodebuffer');
  stream.on('data',chunk=>{size+=chunk.length;onBytes(chunk.length);if(size>maxBytes){stream.pause();stream.destroy();reject(Error('ZIP entry exceeds the decompression limit'));return}chunks.push(chunk)});
  stream.on('error',reject);stream.on('end',()=>resolve(Buffer.concat(chunks,size)));
 });
}
const crcTable=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0});
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes)crc=crcTable[(crc^byte)&255]^(crc>>>8);return (crc^0xffffffff)>>>0}
async function scanFiles(files,options={},progress=()=>{}){
 const start=Date.now(),maxMatches=Math.max(1,Math.min(3000,Math.trunc(Number(options.limit)||1000)));
 const result={file:files.length===1?path.basename(files[0]):`${files.length} selected files`,hits:[],count:0,truncated:false,warnings:[],filesScanned:0,filesSkipped:0,bytesScanned:0,encodings:[],durationMs:0};
 let readBytes=0,expanded=0,visited=0;
 function warn(file,message){result.filesSkipped++;if(result.warnings.length<50)result.warnings.push({file,message})}
 function scan(bytes,name){
  if(++visited>limits.files){warn(name,'Batch file-count limit reached');return}
  const {text,encoding}=decodeText(bytes),detail=scanDetailed(text,name,{...options,limit:maxMatches-result.hits.length+1});
  result.filesScanned++;result.bytesScanned+=bytes.length;if(!result.encodings.includes(encoding))result.encodings.push(encoding);
  for(const message of detail.warnings)if(result.warnings.length<50)result.warnings.push({file:name,message});
  result.hits.push(...detail.hits);if(result.hits.length>maxMatches||detail.truncated){result.hits.length=Math.min(result.hits.length,maxMatches);result.truncated=true}
  progress({phase:'scanning',file:name,filesScanned:result.filesScanned,filesSkipped:result.filesSkipped,matches:result.hits.length,bytesScanned:result.bytesScanned});
 }
 for(let fileIndex=0;fileIndex<files.length;fileIndex++){
  if(result.truncated)break;
  const file=files[fileIndex],name=path.basename(file);
  progress({phase:'reading',file:name,fileIndex,totalFiles:files.length,filesScanned:result.filesScanned,matches:result.hits.length});
  try{
   const stat=await fs.stat(file);if(!stat.isFile()){warn(name,'Not a regular file');continue}
   if(stat.size>limits.fileBytes){warn(name,'File exceeds 100 MB');continue}
   if(readBytes+stat.size>limits.batchBytes){warn(name,'Batch exceeds 200 MB of input');continue}readBytes+=stat.size;
   const bytes=await fs.readFile(file);
   if(bytes.length>limits.fileBytes||readBytes-stat.size+bytes.length>limits.batchBytes){warn(name,'File size changed and exceeds scan limits');continue}
   if(/\.zip$/i.test(name)){
    const zip=await JSZip.loadAsync(bytes);const entries=Object.values(zip.files);
    if(entries.length>limits.archiveEntries){warn(name,'ZIP contains more than 2,000 entries');continue}
    for(const entry of entries){
     if(result.truncated)break;if(entry.dir)continue;
     const original=entry.unsafeOriginalName||entry.name,entryName=name+' / '+entry.name;
     if(original.split(/[\\/]/).includes('..')||/^(?:[\\/]|[a-z]:)/i.test(original)){warn(entryName,'Unsafe archive path skipped');continue}
     if(!supported.test(entry.name)){warn(entryName,/\.zip$/i.test(entry.name)?'Nested archives are not scanned':'Unsupported file type');continue}
     const size=entry._data?.uncompressedSize;
     if(size>limits.entryBytes||expanded+size>limits.expandedBytes){warn(entryName,'ZIP exceeds the 20 MB entry or 100 MB expanded limit');continue}
     try{const content=await readEntry(entry,Math.min(limits.entryBytes,limits.expandedBytes-expanded),bytes=>{expanded+=bytes});
      if(typeof entry._data?.crc32==='number'&&crc32(content)!==(entry._data.crc32>>>0)){warn(entryName,'ZIP checksum failed');continue}scan(content,entryName);
     }catch(e){warn(entryName,e.message)}
    }
   }else if(supported.test(name))scan(bytes,name);else warn(name,'Unsupported file type');
  }catch(e){warn(name,e.code==='EACCES'||e.code==='EPERM'?'File access denied':e.code==='ENOENT'?'File no longer exists':e.message||'Could not read file')}
 }
 result.count=result.hits.length;result.durationMs=Date.now()-start;
 if(result.truncated)result.warnings.push({file:'Batch',message:`Stopped after ${maxMatches.toLocaleString()} distinct matches. Narrow the field selection or search term to inspect more.`});
 return result;
}
module.exports={scanFiles,decodeText,limits};
