'use strict';
const net = require('node:net');
const OATH_BASE='https://oathnet.org/api/service/v2';
const BRIX_URL='https://api.brixhub.ru/api/v1/search';
const BRIX_FIELDS=new Set(['nom_famille','prenom','nom_affichage','nom_utilisateur','email','telephone','mobile','adresse_ip','discord_id','ville','code_postal','departement','region','pays','societe','profession','fonction']);
const sensitiveKey=/password|passwd|secret|token|cookie|session|auth|api.?key|credit.?card|iban|address|adresse|birth|naissance|ssn|social.?security/i;
function mask(value,key=''){
  if(value==null)return value;
  if(sensitiveKey.test(key))return '[redacted]';
  if(Array.isArray(value))return value.slice(0,20).map(item=>mask(item,key));
  if(typeof value==='object')return Object.fromEntries(Object.entries(value).slice(0,35).map(([k,v])=>[k,mask(v,k)]));
  if(typeof value==='number')return /^\d{17,20}$/.test(String(value))?mask(String(value),key):value;
  const s=String(value).slice(0,1000);
  if(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)){const [user,host]=s.split('@');return user.slice(0,2)+'***@'+host;}
  if(/^\+?[\d\s().-]{7,}$/.test(s)&&s.replace(/\D/g,'').length>=7)return s.slice(0,2)+'••••'+s.slice(-2);
  if(/^\d{17,20}$/.test(s))return s.slice(0,3)+'••••'+s.slice(-3);
  return s.replace(/([^\s@]+)@([^\s@]+\.[^\s@]+)/g,(_,u,h)=>u.slice(0,2)+'***@'+h).replace(/\b\d{17,20}\b/g,n=>n.slice(0,3)+'••••'+n.slice(-3)).replace(/\+?\d[\d ().-]{7,}\d/g,n=>n.slice(0,2)+'••••'+n.slice(-2));
}
async function json(url,options={}){
  const response=await fetch(url,{...options,signal:AbortSignal.timeout(20000)});
  const body=await response.text();
  let data;try{data=JSON.parse(body)}catch{throw new Error(`Provider returned non-JSON (HTTP ${response.status}).`)}
  if(!response.ok)throw new Error(`HTTP ${response.status}: ${String(data.message||data.error||response.statusText).slice(0,180)}`);
  return data;
}
function cleanQuery(query){const q=String(query||'').trim();if(!q||q.length>256||/[\u0000-\u001f]/.test(q))throw new Error('Enter one search term (up to 256 characters).');return q;}
function rows(items,source){return items.slice(0,100).filter(v=>v&&typeof v==='object').map((v,i)=>({id:`${source}-${i}`,source,fields:mask(v)}));}
async function searchOath({query,settings},key){
  if(!key)throw new Error('Add an OathNet API key in Settings.');
  const family=settings?.oathFamily==='stealer'?'stealer':'breach';
  const params=new URLSearchParams({q:cleanQuery(query),page_size:String(Math.min(100,Math.max(1,Number(settings?.pageSize)||20)))});
  if(settings?.cursor)params.set('cursor',String(settings.cursor).slice(0,512));
  const data=await json(`${OATH_BASE}/${family}/search?${params}`,{headers:{'x-api-key':key}});
  if(data.success===false)throw new Error(String(data.message||'OathNet rejected the search.'));
  const payload=data.data||data;
  if(!Array.isArray(payload.items))throw new Error('Unexpected OathNet response: data.items missing.');
  return {items:rows(payload.items,'OathNet'),meta:{total:payload.meta?.total??null,nextCursor:payload.next_cursor||null},notice:'OathNet V2 search · displayed data is redacted'};
}
async function searchBrix({query,settings}){
  const field=BRIX_FIELDS.has(settings?.brixField)?settings.brixField:'nom_utilisateur';
  const q=cleanQuery(query);
  const filters={};
  if(settings?.brixFilters&&typeof settings.brixFilters==='object')for(const [k,v] of Object.entries(settings.brixFilters))if(BRIX_FIELDS.has(k)&&String(v).trim())filters[k]=String(v).trim().slice(0,150);
  const body={...filters,[field]:q,page:Math.max(1,Number(settings?.page)||1),per_page:Math.min(100,Math.max(1,Number(settings?.pageSize)||20)),flexible:Boolean(settings?.flexible)};
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
module.exports={mask,searchOath,searchBrix,searchGithub,searchRdap,BRIX_FIELDS};
