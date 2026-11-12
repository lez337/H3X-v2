'use strict';
const net = require('node:net');
const OATH_BASE='https://oathnet.org/api/service/v2';
const BRIX_URL='https://api.brixhub.ru/api/v1/search';
const BRIX_FIELDS=new Set(['nom_famille','prenom','nom_affichage','nom_utilisateur','email','telephone','mobile','adresse_ip','discord_id','ville','code_postal','departement','region','pays','societe','profession','fonction','nom_naissance','jour_naissance','mois_naissance','annee_naissance','date_naissance','ville_naissance','genre','adresse','steam_id','fivem_license','xbl','live_id','fivem_license2','nir','iban','bic','vin']);
const sensitiveKey=/password|passwd|secret|token|cookie|session|auth|api.?key|credit.?card|iban|address|adresse|birth|naissance|ssn|social.?security/i;
function mask(value,key=''){
  if(/password|passwd|secret|token|cookie|session|auth|api.?key/i.test(key))return '[redacted]';
  if(Array.isArray(value))return value.map(v=>mask(v,key));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,mask(v,k)]));
  return value;
}
async function json(url,options={}){
  const response=await fetch(url,{...options,signal:AbortSignal.timeout(20000)});
  const body=await response.text();
  let data;try{data=JSON.parse(body)}catch{throw new Error(`Provider returned non-JSON (HTTP ${response.status}).`)}
  if(!response.ok)throw new Error(`HTTP ${response.status}: ${String(data.message||data.error||response.statusText).slice(0,180)}`);
  return data;
}
function cleanQuery(query){const q=String(query||'').trim();if(!q||q.length>256||/[\u0000-\u001f]/.test(q))throw new Error('Enter one search term (up to 256 characters).');return q;}
function rows(items,source){return items.slice(0,100).filter(v=>v&&typeof v==='object').map((v,i)=>({id:`${source}-${i}`,source,...(/stealer/i.test(source)&&typeof v.log_id==='string'?{logId:v.log_id}:{}),fields:/stealer/i.test(source)?require('./stealer-tree.cjs').redactStealer(v):mask(v)}));}
function detectField(query){
  const q=String(query).trim();
  if(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q))return 'email';
  if(net.isIP(q))return 'adresse_ip';
  if(/^\d{17,20}$/.test(q))return 'discord_id';
  if(/^\+?[\d ()-]{7,}$/.test(q)&&q.replace(/\D/g,'').length<=15)return 'telephone';
  return /\s/.test(q)?'nom_affichage':'nom_utilisateur';
}
function validateFilter(tree){
  let leaves=0;
  function visit(node,depth){
   if(!node||typeof node!=='object'||Array.isArray(node))throw Error('OathNet filter must contain objects.');
   const groups=['and','or'].filter(k=>k in node);
   if(groups.length){if(groups.length!==1||'field' in node||depth>=2||!Array.isArray(node[groups[0]])||!node[groups[0]].length)throw Error('Invalid OathNet filter group (maximum nesting: 2).');node[groups[0]].forEach(n=>visit(n,depth+1));return;}
   if(++leaves>50)throw Error('OathNet allows at most 50 filter rules.');
   if(typeof node.field!=='string'||!node.field.trim()||!['eq','neq','in','not_in','contains','starts_with','ends_with','wildcard','gt','gte','lt','lte','exists'].includes(node.operator))throw Error('Invalid OathNet field or operator.');
   if(node.operator==='exists'){if(node.value!==undefined&&typeof node.value!=='boolean')throw Error('EXISTS requires a boolean.');}
   else if(['in','not_in'].includes(node.operator)){if(!Array.isArray(node.value)||!node.value.length||node.value.some(v=>typeof v!=='string'))throw Error('IN / NOT IN require a non-empty string array.');}
   else if(typeof node.value!=='string'||!node.value.length)throw Error('OathNet filter values must be strings.');
   if(['contains','starts_with','ends_with','wildcard'].includes(node.operator)&&/^(ip|date_birth|indexed_at|pwned_at)$/.test(node.field))throw Error('Pattern operators cannot be used on date or IP fields.');
   if(['contains','ends_with','wildcard'].includes(node.operator)&&node.value.replace(/[*?]/g,'').length<2)throw Error('Pattern filters need at least two non-wildcard characters.');
  }
  visit(tree,0);
}
async function searchOath({query,settings},key){
  if(settings?.oathFamily==='both'){
   const outcomes=await Promise.allSettled(['breach','stealer'].map(oathFamily=>searchOath({query,settings:{...settings,oathFamily,cursor:undefined}},key)));
   const successful=outcomes.filter(x=>x.status==='fulfilled').map(x=>x.value);
   if(!successful.length)throw outcomes[0].reason;
   return {items:successful.flatMap(x=>x.items),meta:{},notice:outcomes.map((x,i)=>x.status==='rejected'?`${['breach','stealer'][i]}: ${x.reason.message}`:'').filter(Boolean).join('; ')||'Breach and stealer datasets searched. Displayed data is redacted.'};
 }

  if(!key)throw new Error('Add an OathNet API key in Settings.');
  if(settings?.oathOptions?.filter_id&&!/^[a-f0-9]{24}$/i.test(settings.oathOptions.filter_id))throw Error('OathNet filter ID must be 24 hexadecimal characters.');
  const family=settings?.oathFamily==='stealer'?'stealer':'breach';
  const params=new URLSearchParams({q:cleanQuery(query),page_size:String(Math.min(100,Math.max(1,Number(settings?.pageSize)||20)))});
  for(const [k,v] of Object.entries(settings?.oathOptions||{}))if(['sort','from','to','date_field','logic','cursor','filter_id','search_id','view','wildcard','has_log_id'].includes(k)&&v!==''&&v!=null)params.set(k,String(v));
  for(const [k,v] of Object.entries(settings?.oathFilters||{})){
    if(['q','cursor','page_size'].includes(k)||v==null||v==='')continue;
    if(k==='filter'){const tree=typeof v==='string'?JSON.parse(v):v;if(Object.keys(tree).length){validateFilter(tree);params.set(k,JSON.stringify(tree));}}
    else if(Array.isArray(v))for(const entry of v)params.append(k.endsWith('[]')?k:k+'[]',String(entry));
    else if(typeof v!=='object')params.set(k,String(v));
  }
  if(settings?.cursor)params.set('cursor',String(settings.cursor).slice(0,512));
  const data=await json(`${OATH_BASE}/${family}/search?${params}`,{headers:{'x-api-key':key}});
  if(data.success===false)throw new Error(String(data.message||'OathNet rejected the search.'));
  const payload=data.data||data;
  if(!Array.isArray(payload.items))throw new Error('Unexpected OathNet response: data.items missing.');
  return {items:rows(payload.items,`OathNet · ${family}`),meta:{total:payload.meta?.total??null,nextCursor:payload.next_cursor||null},notice:'OathNet V2 search · displayed data is redacted'};
}
async function searchBrix({query,settings}){
  const field=detectField(query);
  const q=cleanQuery(query);
  const filters={};
  if(settings?.brixFilters&&typeof settings.brixFilters==='object')for(const [k,v] of Object.entries(settings.brixFilters))if(BRIX_FIELDS.has(k)&&String(v).trim())filters[k]=String(v).trim().slice(0,150);
  const nameParts=q.split(/\s+/);
  const terms=field==='nom_affichage'&&nameParts.length>1?{nom_famille:nameParts[0],prenom:nameParts.slice(1).join(' ')}:{[field]:q};
  const body={...filters,...terms,page:Math.max(1,Number(settings?.page)||1),per_page:Math.min(100,Math.max(1,Number(settings?.pageSize)||20)),flexible:Boolean(settings?.flexible)};
  const data=await json(BRIX_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(data.status===false||data.success===false)throw new Error(String(data.message||'BrixHub rejected the search.'));
  if(!Array.isArray(data.data?.results))throw new Error('Unexpected BrixHub response: data.results missing.');
  return {items:rows(data.data.results,'BrixHub'),meta:{total:data.meta?.total??null,page:data.meta?.page??body.page,pages:data.meta?.pages??null},notice:'BrixHub public API · temporary endpoint · displayed data is redacted'};
}
async function searchGithub({query}){
  const q=cleanQuery(query).replace(/^@/,'');
  if(!/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(q))throw new Error('GitHub lookup requires a username.');
  const data=await json(`https://api.github.com/users/${encodeURIComponent(q)}`,{headers:{'User-Agent':'H3X-Searcher','Accept':'application/vnd.github+json'}});
  return {items:rows([{login:data.login,name:data.name,public_repos:data.public_repos,followers:data.followers,created_at:data.created_at,html_url:data.html_url,bio:data.bio}],'GitHub'),meta:{total:1},notice:'Public GitHub profile; verify identity independently'};
}
async function searchRdap({query}){
  const q=cleanQuery(query);const kind=net.isIP(q)?'ip':'domain';
  if(kind==='domain'&&!/^(?:[a-z\d-]+\.)+[a-z]{2,}$/i.test(q))throw new Error('RDAP lookup requires a domain or IP address.');
  const data=await json(`https://rdap.org/${kind}/${encodeURIComponent(q)}`);
  return {items:rows([{name:data.ldhName||data.handle||q,status:data.status,events:data.events,nameservers:data.nameservers?.map(x=>x.ldhName),links:data.links?.filter(x=>x.rel==='self').map(x=>x.href)}],'RDAP'),meta:{total:1},notice:'Public registration data; availability varies by registry'};
}
module.exports={validateFilter,detectField,mask,searchOath,searchBrix,searchGithub,searchRdap,BRIX_FIELDS};
