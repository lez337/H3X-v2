'use strict';
const crypto=require('node:crypto');

// Telegram lives in the main process. Never expose the session or API hash to the renderer.
class TelegramConnection {
 constructor({read,write,sdk,encodeQr}){this.read=read;this.write=write;this.sdk=sdk;this.encodeQr=encodeQr||((value)=>require('qrcode').toDataURL(value,{errorCorrectionLevel:'M',margin:4,width:280}));this.client=null;this.config=null;this.pending=null;this.qr=null;this.jobs=new Map();this.locked=false;}
 library(){return this.sdk||{...require('telegram'),StringSession:require('telegram/sessions').StringSession,computeCheck:require('telegram/Password').computeCheck};}
 async exclusive(action){if(this.locked)throw Error('Another Telegram operation is running.');this.locked=true;try{return await action()}finally{this.locked=false}}
 async connect(config){const {TelegramClient,StringSession}=this.library();const client=new TelegramClient(new StringSession(config.session||''),config.apiId,config.apiHash,{connectionRetries:2,requestRetries:1,autoReconnect:true,floodSleepThreshold:0,deviceModel:'H3X Searcher',appVersion:'0.1.0'});client.setLogLevel('none');try{await client.connect()}catch(e){await client.disconnect().catch(()=>{});throw e}this.client=client;this.config=config;return client;}
 async authorized(){if(!this.client){const config=await this.read();if(!config?.session)throw Error('Connect your Telegram account first.');await this.connect(config)}else if(this.client.connected===false)await this.client.connect();if(!await this.client.checkAuthorization())throw Error('Telegram session expired. Sign in again.');return this.client;}
 async status(){if(this.qr)return {connected:false,saved:false,phase:this.qr.phase,image:this.qr.image,expires:this.qr.expires,error:this.qr.error};if(!this.client){const saved=await this.read();return {connected:false,saved:!!saved?.session,phase:'credentials'}}return {connected:!!await this.client.checkAuthorization(),saved:!!this.config?.session,phase:this.pending?.phase||'credentials'};}
 cancelQr(){const qr=this.qr;if(!qr)return;this.qr=null;qr.cancelled=true;clearTimeout(qr.timer);qr.rejectPassword?.(Error('QR login cancelled.'));}
 async beginQr(payload){return this.exclusive(async()=>{
  const apiId=Number(payload.apiId),apiHash=String(payload.apiHash||'').trim();
  if(!Number.isSafeInteger(apiId)||apiId<=0||! /^[a-f0-9]{32}$/i.test(apiHash))throw Error('Enter your Telegram API ID and 32-character API hash.');
  if(this.qr)throw Error('Cancel the current QR login before starting another.');
  if(this.client&&await this.client.checkAuthorization())throw Error('Disconnect the current account before signing into another.');
  // Check the QR encoder before starting a Telegram connection.
  await this.encodeQr('tg://login?token=dependency-check');
  await this.client?.disconnect();this.client=null;this.pending=null;
  const client=await this.connect({apiId,apiHash}),config=this.config;
  const qr={phase:'qr',image:null,expires:0,cancelled:false,error:'',resolvePassword:null,rejectPassword:null};this.qr=qr;
  const active=()=>!qr.cancelled&&this.qr===qr;
  qr.timer=setTimeout(()=>{if(active()){qr.cancelled=true;qr.rejectPassword?.(Error('QR login expired.'));qr.phase='qr-error';qr.image=null;qr.error='QR login expired. Reset the connection to try again.';client.disconnect().catch(()=>{})}},5*60*1000);qr.timer.unref?.();
  qr.task=(async()=>{
   try{
    await client.signInUserWithQrCode({apiId,apiHash},{
     qrCode:async({token,expires})=>{if(!active())throw Error('QR login cancelled.');const image=await this.encodeQr('tg://login?token='+Buffer.from(token).toString('base64url'));if(active()){qr.image=image;qr.expires=expires;qr.phase='qr'}},
     password:async()=>{if(!active())throw Error('QR login cancelled.');qr.image=null;qr.phase='password';return new Promise((resolve,reject)=>{qr.resolvePassword=resolve;qr.rejectPassword=reject})},
     onError:async error=>{if(!active())throw Error('QR login cancelled.');if(error.errorMessage==='PASSWORD_HASH_INVALID'){qr.error='Incorrect two-step verification password. Try again.';return false}throw Error('QR login failed. Cancel and try again.');}
    });
    if(!active()){const {Api}=this.library();await client.invoke(new Api.auth.LogOut()).catch(()=>{});await client.disconnect().catch(()=>{});return;}
    await this.exclusive(async()=>{if(!active())return;config.session=client.session.save();try{await this.write(config)}catch(e){const {Api}=this.library();await client.invoke(new Api.auth.LogOut()).catch(()=>{});throw e}if(active()){this.cancelQr();this.pending=null}});
   }catch(error){if(active()){qr.phase='qr-error';qr.image=null;qr.error=error.message||'QR login failed.';clearTimeout(qr.timer);await client.disconnect().catch(()=>{})}}
  })();
  return {connected:false,saved:false,phase:'qr'};
 })}
 async restore(){return this.exclusive(async()=>{await this.authorized();return this.status()})}
 async begin(payload){return this.exclusive(async()=>{
  if(this.qr)throw Error('Cancel QR login before requesting a phone code.');
  const apiId=Number(payload.apiId),apiHash=String(payload.apiHash||'').trim(),phone=String(payload.phone||'').replace(/[ ()-]/g,'');
  if(!Number.isSafeInteger(apiId)||apiId<=0||! /^[a-f0-9]{32}$/i.test(apiHash)||! /^\+[0-9]{7,15}$/.test(phone))throw Error('Enter your Telegram API ID, 32-character API hash and phone number with country code.');
  if(this.client&&await this.client.checkAuthorization())throw Error('Disconnect the current account before signing into another.');
  await this.client?.disconnect();this.client=null;this.pending=null;
  const client=await this.connect({apiId,apiHash});const code=await client.sendCode({apiId,apiHash},phone);
  this.pending={phone,phoneCodeHash:code.phoneCodeHash,phase:'code',expires:Date.now()+10*60*1000};return {phase:'code'};
 })}
 async verify(payload){return this.exclusive(async()=>{
  if(this.qr){if(this.qr.phase!=='password'||!this.qr.resolvePassword)throw Error('Scan the QR code in Telegram first.');if(typeof payload.password!=='string'||!payload.password)throw Error('Enter your Telegram two-step verification password.');const resolve=this.qr.resolvePassword;this.qr.resolvePassword=null;this.qr.rejectPassword=null;this.qr.phase='qr';this.qr.error='';resolve(payload.password);return {connected:false,saved:false,phase:'qr'};}
  if(!this.pending||Date.now()>this.pending.expires)throw Error('Login expired. Request a new code.');
  const {Api,computeCheck}=this.library();
  try{
   if(this.pending.phase==='password'){
    if(typeof payload.password!=='string'||!payload.password)throw Error('Enter your Telegram two-step verification password.');
    const info=await this.client.invoke(new Api.account.GetPassword());
    await this.client.invoke(new Api.auth.CheckPassword({password:await computeCheck(info,payload.password)}));
   }else{
    const phoneCode=String(payload.code||'').replace(/\s/g,'');if(!/^\d{4,8}$/.test(phoneCode))throw Error('Enter the login code Telegram sent you.');
    const auth=await this.client.invoke(new Api.auth.SignIn({phoneNumber:this.pending.phone,phoneCodeHash:this.pending.phoneCodeHash,phoneCode}));
    if(auth instanceof Api.auth.AuthorizationSignUpRequired)throw Error('Use an existing Telegram account. Account creation is not supported.');
   }
  }catch(e){if(e.errorMessage==='SESSION_PASSWORD_NEEDED'){this.pending.phase='password';return {phase:'password'}}throw e}
  this.config.session=this.client.session.save();
  try{await this.write(this.config)}catch(e){await this.client.invoke(new Api.auth.LogOut()).catch(()=>{});await this.client.disconnect();this.client=null;this.config=null;this.pending=null;throw e}
  this.pending=null;return {connected:true,saved:true,phase:'credentials'};
 })}
 async send({username,message}){return this.exclusive(async()=>{
  username=String(username||'').replace(/^@/,'');message=String(message||'');
  if(!/^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(username))throw Error('Enter a valid bot username.');
  if(!message.trim()||message.length>4096)throw Error('Enter a message between 1 and 4096 characters.');
  const client=await this.authorized(),entity=await client.getEntity('@'+username);
  if(!entity.bot)throw Error('This username is not a Telegram bot.');
  const sent=await client.sendMessage(entity,{message,parseMode:undefined});
  const id=crypto.randomUUID();this.jobs.set(id,{entity,minId:sent.id,created:Date.now(),username});
  for(const [key,job] of this.jobs)if(Date.now()-job.created>15*60*1000)this.jobs.delete(key);
  while(this.jobs.size>30)this.jobs.delete(this.jobs.keys().next().value);
  return {id,username};
 })}
 async replies({id}){
  const job=this.jobs.get(String(id));if(!job||Date.now()-job.created>15*60*1000)throw Error('Reply window expired. Send a new message.');
  const client=await this.authorized();const messages=await client.getMessages(job.entity,{minId:job.minId,limit:50});
  return {messages:messages.filter(m=>!m.out&&m.senderId?.toString()===job.entity.id.toString()).reverse().map(m=>({id:m.id,text:String(m.message||'').slice(0,20000),date:m.date,media:!!m.media})),username:job.username};
 }
 async logout(){return this.exclusive(async()=>{
  this.cancelQr();
  // Clear the local session even when Telegram cannot be reached.
  const saved=this.client?null:await this.read();await this.write(null);
  if(!this.client&&saved?.session)try{await this.connect(saved)}catch{}
  const client=this.client;this.client=null;this.config=null;this.pending=null;this.jobs.clear();
  if(client){try{const {Api}=this.library();await client.invoke(new Api.auth.LogOut())}catch{}finally{await client.disconnect().catch(()=>{})}}
  return {connected:false,saved:false,phase:'credentials'};
 })}
}
module.exports={TelegramConnection};
