'use strict';

const EMAIL=/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i;
function extractEmails(query,items=[]){
 const found=new Map();
 function add(value){
  if(Array.isArray(value)){value.forEach(add);return}
  if(typeof value!=='string')return;
  for(const part of value.split(/[,;\s]+/)){const email=part.trim();if(email.length<=254&&EMAIL.test(email))found.set(email.toLowerCase(),email)}
 }
 add(query);
 function visit(value,depth=0){
  if(!value||typeof value!=='object'||depth>8)return;
  if(Array.isArray(value)){value.forEach(v=>visit(v,depth+1));return}
  for(const [key,entry] of Object.entries(value)){
   if(/password|cookie|token|secret|session|auth|output|response/i.test(key))continue;
   if(/^(?:e_?mails?|email_addresses|email_address|mail|mails|adresse_email|adresses_email)$/i.test(key.replace(/[\s.-]/g,'_')))add(entry);
   else if(entry&&typeof entry==='object')visit(entry,depth+1);
  }
 }
 for(const item of items)if(!/stealer|ghunt/i.test(item.source||''))visit(item.fields);
 return [...found.values()];
}
const {supportsRoblox,profileTargets}=require('./oath-profiles.cjs');
async function searchWorkflow(payload,search){
 const selected=[...new Set(payload.providers||[])];
 const tasks=selected.filter(p=>p!=='ghunt');
 const outcomes=await Promise.allSettled(tasks.map(provider=>search({...payload,provider})));
 const items=[],warnings=[];let successes=0;const metas=[];
 outcomes.forEach((outcome,i)=>{
  if(outcome.status==='rejected')warnings.push(tasks[i]+': '+outcome.reason.message);
  else{successes++;items.push(...outcome.value.items);if(tasks[i]!=='oathRoblox')metas.push(outcome.value.meta||{});if(outcome.value.notice)warnings.push(outcome.value.notice)}
 });
 let profilesChecked=0;
 if(selected.includes('oathnet')&&payload.settings?.oathProfiles!==false){
  const targets=profileTargets(payload.query,items,payload.settings);profilesChecked=Math.min(targets.length,12);
  if(targets.length>12)warnings.push('OathNet checked the first 12 unique account identifiers. Search an identifier directly to check another.');
  let next=0;
  const profiles=await Promise.all(Array.from({length:Math.min(3,profilesChecked)},async()=>{
   const results=[];
   while(next<profilesChecked){const index=next++,target=targets[index];try{results.push({index,result:await search({...payload,provider:'oathProfile',profileKind:target.kind,parameter:target.parameter,query:target.query})})}catch(error){results.push({index,error})}}
   return results;
  }));
  const ids=new Set(items.map(item=>item.id));
  for(const outcome of profiles.flat().sort((a,b)=>a.index-b.index)){
   if(outcome.error)warnings.push(`OathNet ${targets[outcome.index].kind}: ${outcome.error.message}`);
   else{successes++;for(const item of outcome.result.items)if(!ids.has(item.id)){ids.add(item.id);items.push(item)}if(outcome.result.notice)warnings.push(outcome.result.notice)}
  }
 }
 let emailCount=0;
 if(selected.includes('ghunt')){
  const emails=extractEmails(payload.query,items);emailCount=Math.min(emails.length,10);
  if(!emails.length)warnings.push('GHunt skipped: no email addresses in the query or email fields of the results.');
  if(emails.length>10)warnings.push('GHunt checked the first 10 unique emails. Search another email directly to check it.');
  let next=0;
  const ghunt=await Promise.all(Array.from({length:Math.min(2,emailCount)},async()=>{
   const results=[];
   while(next<emailCount){const index=next++;try{results.push({index,result:await search({...payload,provider:'ghunt',query:emails[index]})})}catch(error){results.push({index,error})}}
   return results;
  }));
  for(const outcome of ghunt.flat().sort((a,b)=>a.index-b.index)){
   if(outcome.error)warnings.push(`GHunt email ${outcome.index+1}: ${outcome.error.message}`);
   else{successes++;items.push(...outcome.result.items);if(outcome.result.notice)warnings.push(outcome.result.notice)}
  }
 }
 if(!successes&&warnings.length&&emailCount)throw Error([...new Set(warnings)].join(' · '));
 if(!successes&&tasks.length)throw Error([...new Set(warnings)].join(' · '));
 return {query:payload.query,items,meta:{...(metas.length===1?metas[0]:{}),profilesChecked,emailsChecked:emailCount},notice:[...new Set(warnings)].join(' · ')};
}
module.exports={extractEmails,supportsRoblox,searchWorkflow};
