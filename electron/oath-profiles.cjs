'use strict';

// Contracts: https://docs.oathnet.org/guides/osint-lookups
const services={roblox:{label:'Roblox',route:'roblox-userinfo'},discord:{label:'Discord',route:'discord-userinfo'},steam:{label:'Steam',route:'steam'},xbox:{label:'Xbox',route:'xbox'}};
const supportsRoblox=query=>/^(?:[a-zA-Z0-9_]{3,20}|[0-9]{1,16})$/.test(String(query||'').trim().replace(/^@/,''));
function profileTargets(query,items=[],settings={}){
 const targets=new Map();
 const enabled=kind=>!Array.isArray(settings.oathProfileServices)||settings.oathProfileServices.includes(kind);
 function add(kind,value,parameter){
  if(Array.isArray(value)){value.forEach(v=>add(kind,v,parameter));return}
  if(!enabled(kind)||typeof value!=='string'&&typeof value!=='number')return;
  if(typeof value==='number'&&!Number.isSafeInteger(value))return;
  const q=String(value).trim().replace(/^@/,'');
  if(kind==='roblox'&&!supportsRoblox(q)||kind==='discord'&&!/^\d{14,19}$/.test(q)||kind==='steam'&&!/^(?:7656\d{13}|[a-z0-9_-]{2,64})$/i.test(q)||kind==='xbox'&&!/^[a-z0-9][a-z0-9 #_]{0,24}$/i.test(q))return;
  const param=parameter||({roblox:/^\d+$/.test(q)?'user_id':'username',discord:'discord_id',steam:'steam_id',xbox:'xbl_id'})[kind];
  if(kind==='roblox'&&param==='user_id'&&!/^\d+$/.test(q))return;
  targets.set(`${kind}:${param}:${q.toLowerCase()}`,{kind,query:q,parameter:param});
 }
 const q=String(query||'').trim().replace(/^@/,'');
 let url;try{url=new URL(q)}catch{}
 if(url){
  const host=url.hostname.toLowerCase().replace(/^www\./,'');const parts=url.pathname.split('/').filter(Boolean);
  if(host==='roblox.com'&&parts[0]==='users'&&/^\d+$/.test(parts[1]||''))add('roblox',parts[1],'user_id');
  if(host==='steamcommunity.com'&&['id','profiles'].includes(parts[0]))add('steam',parts[1]);
  if(['discord.com','discordapp.com'].includes(host)&&parts[0]==='users')add('discord',parts[1]);
 }else if(/^7656\d{13}$/.test(q))add('steam',q);
 else if(/^\d{14,19}$/.test(q))add('discord',q);
 else if(/^\d{1,12}$/.test(q))add('roblox',q,'user_id');
 else if(/^[a-z0-9_-]{2,64}$/i.test(q)&&/[a-z_]/i.test(q)){
  add('roblox',q,'username');add('steam',q);add('xbox',q);
 }
 const fieldKinds={discord:'discord',discord_id:'discord',discordid:'discord',steam_id:'steam',steamid:'steam',steam64:'steam',steam_id64:'steam',xbl:'xbox',xbl_id:'xbox',xuid:'xbox',gamertag:'xbox',xbox_id:'xbox',roblox_id:'roblox',roblox_user_id:'roblox',roblox_username:'roblox'};
 function visit(value,depth=0){
  if(!value||typeof value!=='object'||depth>5)return;
  if(Array.isArray(value)){value.forEach(v=>visit(v,depth+1));return}
  for(const [key,entry] of Object.entries(value)){
   const field=key.toLowerCase().replace(/[ .-]/g,'_'),kind=fieldKinds[field];
   if(/password|passwd|cookie|token|secret|session|credential|authorization/i.test(field))continue;
   if(kind)add(kind,entry,field==='roblox_username'?'username':kind==='roblox'?'user_id':undefined);
   else if(entry&&typeof entry==='object')visit(entry,depth+1);
  }
 }
 for(const item of items)if(!item.profileType&&!/stealer/i.test(item.source||''))visit(item.fields);
 return [...targets.values()];
}
async function lookup(route,params,key,request){
 const response=await request(`https://oathnet.org/api/service/${route}?${params}`,{headers:{'x-api-key':key},signal:AbortSignal.timeout(20000)});
 if(response.status===404)return null;
 if(!response.ok)throw Error(`OathNet ${route} lookup failed (HTTP ${response.status}).`);
 let body;try{body=await response.json()}catch{throw Error(`OathNet ${route} returned an invalid response.`)}
 if(body.success===false)throw Error(`OathNet ${route} lookup was rejected. Check your API access.`);
 return body.data??null;
}
function clean(fields){return Object.fromEntries(Object.entries(fields).filter(([,v])=>v!==undefined&&v!==null&&v!==''))}
function normalizeProfile(kind,p,index=0){
 let f;
 if(kind==='roblox'){
  const id=String(p.user_id||p['User ID']||'');
  if(!id&&!p.username&&!p['Current Username'])return null;
  f={username:p['Current Username']||p.username,display_name:p['Display Name'],user_id:id,join_date:p['Join Date'],avatar_url:p['Avatar URL'],username_history:p['Old Usernames'],discord:p.Discord};
  if(/^\d+$/.test(id))f.profile_url=`https://www.roblox.com/users/${id}/profile`;
 }else if(kind==='discord'){
  if(!p.id||!p.username)return null;
  f={username:p.username,display_name:p.global_name,user_id:String(p.id),avatar_url:p.avatar_url,banner_url:p.banner_url,join_date:p.creation_date,badges:p.badges,profile_url:`https://discord.com/users/${encodeURIComponent(p.id)}`};
 }else if(kind==='steam'){
  const raw=p.meta?.raw_data||{},id=String(raw.steamid||p.meta?.id||p.id||'');
  if(!id&&!p.username&&!raw.personaname)return null;
  const created=new Date(Number(raw.timecreated)*1000);
  f={username:p.username||raw.personaname,display_name:raw.personaname,user_id:id,avatar_url:raw.avatarfull||p.avatar||p.meta?.avatar,join_date:raw.timecreated&&Number.isFinite(created.getTime())?created.toISOString():undefined,visibility:raw.communityvisibilitystate===3?'Public':raw.communityvisibilitystate!=null?'Private / restricted':undefined,real_name:raw.realname,country:raw.loccountrycode,profile_url:raw.profileurl||(/^\d+$/.test(id)?`https://steamcommunity.com/profiles/${id}`:undefined)};
 }else if(kind==='xbox'){
  const meta=p.meta||{},details=meta.meta||{};
  if(!p.username&&!meta.username&&!meta.id)return null;
  f={username:p.username||meta.username,user_id:String(meta.id||p.id||''),avatar_url:p.avatar||meta.avatar,gamerscore:details.gamerscore??meta.scraper_data?.gamerscore,account_tier:details.accounttier,reputation:details.xboxonerep,bio:details.bio,location:details.location,games_played:meta.scraper_data?.games_played,profile_url:(p.username||meta.username)?`https://www.xbox.com/play/user/${encodeURIComponent(p.username||meta.username)}`:undefined};
 }else return null;
 return {id:`oath-${kind}-${f.user_id||f.username||index}`,source:`OathNet · ${services[kind].label}`,profileType:kind,fields:clean(f)};
}
async function searchProfile({query,settings={},profileKind='roblox',parameter},key,request=fetch){
 const service=services[profileKind];if(!service)throw Error('Unknown OathNet profile service.');
 const field=parameter||({roblox:/^\d+$/.test(String(query))?'user_id':'username',discord:'discord_id',steam:'steam_id',xbox:'xbl_id'})[profileKind];
 const fields={roblox:field==='username'?'roblox_username':'roblox_id',discord:'discord_id',steam:'steam_id',xbox:'xbl_id'};
 const [target]=profileTargets('',[{fields:{[fields[profileKind]]:query}}],{oathProfileServices:[profileKind]});
 if(!target)return {items:[],meta:{},notice:''};
 if(!key)throw Error('Add an OathNet API key in Settings to load account cards.');
 const params=new URLSearchParams({[target.parameter]:target.query});
 if(settings.oathOptions?.search_id)params.set('search_id',String(settings.oathOptions.search_id));
 const data=await lookup(service.route,params,key,request);
 if(data===null)return {items:[],meta:{},notice:`OathNet ${service.label}: no profile returned, or the lookup is unavailable.`};
 const profiles=Array.isArray(data)?data:[data];
 const items=profiles.filter(p=>p&&typeof p==='object').map((p,i)=>normalizeProfile(profileKind,p,i)).filter(Boolean);
 let notice='';
 if(profileKind==='discord'&&items.length){
  try{
   const history=await lookup('discord-username-history',params,key,request);
   if(!history||history.success===false)throw Error('History unavailable');
   if(Array.isArray(history?.history))items.forEach(item=>{item.fields.username_history=history.history});
  }catch{notice='OathNet Discord: account loaded; username history is unavailable.'}
 }
 return {items,meta:{},notice};
}
const searchRoblox=(opts,key,request)=>searchProfile({...opts,profileKind:'roblox'},key,request);
module.exports={searchProfile,searchRoblox,profileTargets,normalizeProfile,supportsRoblox};
