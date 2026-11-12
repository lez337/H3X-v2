'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
function redact(value){return String(value??'').replace(/\bBearer\s+\S+/gi,'Bearer [redacted]').replace(/((?:api[_ -]?key|token|password|secret|cookie|session|authorization)\s*[=:]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,'$1[redacted]').replace(/https?:\/\/[^\s]+/gi,raw=>{try{const url=new URL(raw);return url.origin+url.pathname}catch{return '[URL]'}}).replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[email]').replace(/(?:[A-Z]:\\|\/Users\/|\/home\/)[^\r\n]+/gi,'[local path]').slice(0,1200)}
function createActivity(directory,{maxEntries=2000,maxBytes=2*1024*1024}={}){
 const file=path.join(directory,'activity.log'),previous=path.join(directory,'activity.previous.log');
 let entries=[],queue=Promise.resolve(),loaded=false;
 async function init(){if(loaded)return;await fs.mkdir(directory,{recursive:true});for(const name of [previous,file]){try{const content=await fs.readFile(name,'utf8');for(const line of content.split('\n')){try{const e=JSON.parse(line);if(!e.time||!e.event)continue;entries.push({...e,id:e.id||crypto.randomUUID(),event:redact(e.event),detail:redact(e.detail),level:e.level||(/fail|error/i.test(e.event)?'error':'info'),scope:e.scope||'workspace'})}catch{}}}catch(e){if(e.code!=='ENOENT')throw e}}entries=entries.slice(-maxEntries);loaded=true}
 function add(event,detail='',meta={}){const task=queue.then(async()=>{await init();const entry={id:crypto.randomUUID(),time:new Date().toISOString(),event:redact(event),detail:redact(detail),level:['info','warning','error'].includes(meta.level)?meta.level:'info',scope:meta.scope||'workspace',...(Number.isFinite(meta.durationMs)?{durationMs:meta.durationMs}:{})};entries.push(entry);entries=entries.slice(-maxEntries);try{if((await fs.stat(file)).size>=maxBytes){await fs.rm(previous,{force:true});await fs.rename(file,previous)}}catch(e){if(e.code!=='ENOENT')throw e}await fs.appendFile(file,JSON.stringify(entry)+'\n');return entry});queue=task.catch(()=>{});return task}
 return {add,async list(){await queue;await init();return entries.map(e=>({...e}))}};
}
module.exports={createActivity,redact};
