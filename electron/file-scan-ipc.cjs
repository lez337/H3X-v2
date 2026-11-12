'use strict';
const path=require('node:path');
const {Worker}=require('node:worker_threads');
const {kindsList}=require('./scanner.cjs');
function registerFileScanner({ipcMain,dialog,getWindow,log}){
 const jobs=new Map();
 ipcMain.handle('file:cancel',event=>{const job=jobs.get(event.sender.id);if(!job)return false;job.canceled=true;job.worker?.terminate();return true});
 ipcMain.handle('file:scan',async(event,payload={})=>{
  const id=event.sender.id;if(jobs.has(id))throw Error('A file scan is already running.');
  const kinds=Array.isArray(payload.kinds)?payload.kinds.filter(kind=>kindsList.includes(kind)):kindsList;
  if(!kinds.length)throw Error('Select at least one field to scan.');
  const options={kinds,query:String(payload.query||'').slice(0,200),minConfidence:Math.max(0,Math.min(100,Number(payload.minConfidence)||0)),limit:Math.max(1,Math.min(3000,Math.trunc(Number(payload.limit)||1000)))};
  const job={worker:null,canceled:false};jobs.set(id,job);
  const onDestroyed=()=>{job.canceled=true;job.worker?.terminate()};event.sender.once('destroyed',onDestroyed);
  try{
   const selection=await dialog.showOpenDialog(getWindow(),{title:'Choose files to inspect locally',properties:['openFile','multiSelections'],filters:[{name:'Text, structured data or ZIP',extensions:['txt','log','csv','tsv','json','jsonl','ndjson','zip']}]});
   if(selection.canceled||!selection.filePaths.length||job.canceled)return null;
   if(selection.filePaths.length>50)throw Error('Choose up to 50 files per scan.');
   await log('File scan started',`${selection.filePaths.length} selected files`,{scope:'file'});
   const result=await new Promise((resolve,reject)=>{
    const worker=new Worker(path.join(__dirname,'file-scan-worker.cjs'),{workerData:{files:selection.filePaths,options},resourceLimits:{maxOldGenerationSizeMb:256},execArgv:[]});job.worker=worker;
    let settled=false;const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timeout);worker.terminate();error?reject(error):resolve(value)};
    const timeout=setTimeout(()=>finish(Error('Scan exceeded 90 seconds. Choose fewer files or a smaller file.')),90000);
    worker.on('message',message=>{if(message.type==='progress'){if(!event.sender.isDestroyed())event.sender.send('file:progress',message.progress)}else if(message.type==='result')finish(null,message.result);else if(message.type==='error')finish(Error(message.message))});
    worker.on('error',error=>finish(job.canceled?null:Error(error.code==='ERR_WORKER_OUT_OF_MEMORY'?'Scan reached its memory limit. Choose a smaller file.':error.message),job.canceled?{canceled:true}:undefined));
    worker.on('exit',()=>{if(!settled)finish(job.canceled?null:Error('Scan stopped before completing.'),job.canceled?{canceled:true}:undefined)});
   });
   if(result.canceled){await log('File scan canceled','',{scope:'file'});return result}
   await log('File scan finished',`${result.filesScanned} files; ${result.count} distinct matches; ${result.filesSkipped} skipped`,{scope:'file',durationMs:result.durationMs,level:result.warnings.length?'warning':'info'});
   return result;
  }finally{event.sender.removeListener('destroyed',onDestroyed);jobs.delete(id)}
 });
}
module.exports={registerFileScanner};
