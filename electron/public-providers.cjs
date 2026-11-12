'use strict';
const {execFile}=require('node:child_process');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const WMN_DATA='https://raw.githubusercontent.com/WebBreacher/WhatsMyName/main/wmn-data.json';
let cache;
const username=value=>{const q=String(value||'').trim().replace(/^@/,'');if(!/^(?=.*[a-zA-Z])[a-zA-Z0-9_.-]{1,64}$/.test(q))throw Error('Enter a public username.');return q};
function publicUrl(value){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||!u.hostname.includes('.')||/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(u.hostname)||u.hostname.endsWith('.local')||require('node:net').isIP(u.hostname))throw Error('Invalid public profile URL.');return u.href}
async function searchWhatsMyName({query,settings},request=fetch){
 const account=username(query);
 if(!cache||Date.now()-cache.time>86400000){const response=await request(WMN_DATA,{signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Could not download the WhatsMyName dataset.');const data=await response.json();if(!Array.isArray(data.sites))throw Error('Invalid WhatsMyName dataset.');cache={time:Date.now(),sites:data.sites}}
 const limit=Math.min(100,Math.max(5,Number(settings?.wmnLimit)||30));
 const sites=cache.sites.filter(s=>s.valid!==false&&!s.post_body&&(!settings?.wmnCategory||s.cat===settings.wmnCategory)&&typeof s.uri_check==='string'&&s.uri_check.includes('{account}')).slice(0,limit);
 let next=0,checked=0,unknown=0;const items=[];
 await Promise.all(Array.from({length:Math.min(5,sites.length)},async()=>{while(next<sites.length){const index=next++,site=sites[index];try{
  let name=account;for(const c of site.strip_bad_char||'')name=name.split(c).join('');if(!name){unknown++;continue}
  const url=publicUrl(site.uri_check.replaceAll('{account}',encodeURIComponent(name)));
  const response=await request(url,{method:'GET',redirect:'error',signal:AbortSignal.timeout(8000),headers:{'User-Agent':'H3X-Public-Username-Check'}});
  const reader=response.body?.getReader();let body='';if(reader){const decoder=new TextDecoder();let size=0;try{while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.length;if(size>512*1024)throw Error('Response too large.');body+=decoder.decode(chunk.value,{stream:true})}}finally{await reader.cancel().catch(()=>{})}}else body=await response.text();checked++;
  const absent=response.status===Number(site.m_code)&&!!site.m_string&&body.includes(site.m_string);
  if(!absent&&response.status===Number(site.e_code)&&!!site.e_string&&body.includes(site.e_string))items.push({id:'wmn-'+index,source:'WhatsMyName',fields:{username:account,site:site.name,url:publicUrl((site.uri_pretty||site.uri_check).replaceAll('{account}',encodeURIComponent(name))),category:site.cat,status:'Public profile match'}});
  else if(!absent)unknown++;
 }catch{unknown++}}}));
 return {items:items.sort((a,b)=>a.id.localeCompare(b.id)),meta:{checked,unknown,limited:sites.length},notice:`${checked} sites checked; ${unknown} checks inconclusive.`};
}
function ghuntInvocation(settings,query){
 const q=String(query||'').trim();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q)||q.length>254)throw Error('GHunt requires an email address.');
 const executable=String(settings?.ghuntPath||'ghunt').trim();if(!executable||/[\r\n\x00]/.test(executable)||/\.(cmd|bat|ps1)$/i.test(executable))throw Error('Use ghunt or the path to its executable.');
 return {executable,args:['email',q]};
}
function parseGhunt(data,email,output=''){
 const container=data?.PROFILE_CONTAINER||data?.profile_container||data||{};
 const profile=container.profile||{};
 const pick=value=>value?.PROFILE||value?.profile||value;
 const name=pick(profile.names),photo=pick(profile.profilePhotos),source=pick(profile.sourceIds);
 const gaia=String(profile.personId||output.match(/Gaia ID\s*:\s*(\d+)/i)?.[1]||'');
 const fields={email,review_status:'Unavailable'};
 const displayName=name?.fullname||name?.displayName||output.match(/^Name\s*:\s*(.+)$/im)?.[1];
 if(displayName)fields.name=displayName;
 const image=photo?.url||output.match(/Custom profile picture[^\n]*\n\s*=>\s*(https:\/\/\S+)/i)?.[1];
 if(image&&/^https:\/\//i.test(image))fields.avatar_url=image;
 if(gaia){fields.gaia_id=gaia;fields.maps_url=`https://www.google.com/maps/contrib/${encodeURIComponent(gaia)}/reviews`}
 if(source?.lastUpdated)fields.last_profile_edit=source.lastUpdated;
 const services=pick(profile.inAppReachability)?.apps;if(Array.isArray(services)&&services.length)fields.google_services=services;
 const types=pick(profile.profileInfos)?.userTypes;if(Array.isArray(types)&&types.length)fields.account_types=types;
 const maps=container.maps||{},stats=maps.stats||{};
 let count;
 for(const key of ['reviews','review_count','reviews_count','reviewCount','reviewsCount']){
  const value=stats[key];const n=typeof value==='object'?value?.count:value;
  if((typeof n==='number'||typeof n==='string'&&/^\d+$/.test(n))&&Number.isSafeInteger(Number(n))&&Number(n)>=0){count=Number(n);break}
 }
 const textCount=output.match(/(?:^|\n)\s*(?:[┏┡┃│+\[\]\-\s]*)(?:Number of )?Reviews\s*[:|│┃]\s*([\d,]+)/i);
 if(count===undefined&&textCount)count=Number(textCount[1].replaceAll(',',''));
 if(Array.isArray(maps.reviews)&&maps.reviews.length){fields.reviews=maps.reviews;count=Math.max(count||0,maps.reviews.length)}
 if(count!==undefined){fields.review_count=count;fields.review_status=count>0?'Reviews found':'No reviews'}
 if(/reviews are private|maps (?:data|profile).*private|maps.*(?:blocked|unavailable)/i.test(output))fields.review_status='Unavailable';
 if(/target wasn't found|does not match a public Google Account/i.test(output))fields.account_status='No public Google account found';
 else if(gaia||Object.keys(profile).length)fields.account_status='Public Google account found';
 else fields.account_status='Inconclusive';
 if(container.play_games)fields.play_games=container.play_games;
 if(container.calendar)fields.public_calendar=container.calendar;
 if(Object.keys(stats).length)fields.maps_statistics=stats;
 if(output.trim())fields.output=output;
 return {id:'ghunt-'+email.toLowerCase(),source:'GHunt',profileType:'google',fields};
}
async function searchGhunt({query,settings},run=execFile){
 const {executable,args}=ghuntInvocation(settings,query);
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'h3x-ghunt-'));
 try{
  const file=path.join(dir,'profile.json');
  const result=await new Promise(resolve=>run(executable,[...args,'--json',file],{timeout:90000,maxBuffer:512*1024,windowsHide:true,shell:false,env:{...process.env,NO_COLOR:'1',TERM:'dumb',COLUMNS:'220',PYTHONIOENCODING:'utf-8'}},(error,stdout)=>resolve({error,output:String(stdout||'').replace(/\u001b\[[0-?]*[ -/]*[@-~]/g,'').slice(0,40000)})));
  let data;try{if((await fs.stat(file)).size<=2*1024*1024)data=JSON.parse(await fs.readFile(file,'utf8'))}catch{}
  const item=parseGhunt(data,String(query).trim(),result.output);
  if(result.error&&!data&&item.fields.account_status==='Inconclusive')throw Error(result.error.code==='ENOENT'?'GHunt is not installed or is not on PATH. Install it and run ghunt login in your terminal.':'GHunt failed. Check ghunt login and update GHunt in your terminal.');
  return {items:[item],meta:{},notice:result.error?'GHunt returned partial results; some details are unavailable.':!data&&item.fields.account_status!=='No public Google account found'?'GHunt JSON was unavailable; showing the details found in its output.':''};
 }finally{await fs.rm(path.join(dir,'profile.json'),{force:true});await fs.rmdir(dir)}
}
function telegramQuery(query,category){
 if(category==='domain'){const q=String(query||'').trim();if(!/^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/.test(q))throw Error('This Telegram provider accepts domains.');return q}
 if(category==='username')return username(query);
 throw Error('Choose a domain or public username bot category in Settings.');
}
async function searchTelegram({query,settings,bots},telegram,wait=ms=>new Promise(r=>setTimeout(r,ms))){
 const bot=bots.find(b=>b.id===settings?.telegramBotId);if(!bot)throw Error('Select a Telegram bot in Settings.');
 const q=telegramQuery(query,bot.category);const message=String(bot.template||'{query}').replaceAll('{query}',q);
 const job=await telegram.send({username:bot.username,message});const seconds=Math.min(60,Math.max(5,Number(settings?.telegramWait)||20));
 let messages=[],snapshot='',quiet=0;for(let elapsed=0;elapsed<seconds;elapsed+=2){await wait(2000);const result=await telegram.replies(job);messages=result.messages;const current=JSON.stringify(messages);quiet=current===snapshot?quiet+2:0;snapshot=current;if(messages.length&&quiet>=4)break}
 return {items:messages.map(m=>({id:`telegram-${job.id}-${m.id}`,source:'Telegram · '+bot.name,profileType:'telegram',botName:bot.name,fields:{bot:'@'+bot.username,response:m.text||'',...(m.date?{received_at:new Date(m.date*1000).toISOString()}:{}),...(m.media?{attachment:'Open in Telegram'}:{})}})),meta:{telegramJob:job.id},notice:messages.length?'':'No bot reply yet. The message was sent; check Telegram before resending.'};
}
module.exports={searchWhatsMyName,searchGhunt,searchTelegram,telegramQuery,ghuntInvocation,parseGhunt};
