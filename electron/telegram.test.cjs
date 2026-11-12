'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {TelegramConnection}=require('./telegram.cjs');
function fixture(){
 let stored=null,client;const sent=[];
 class SignIn{constructor(data){Object.assign(this,data)}}class GetPassword{}class CheckPassword{constructor(data){Object.assign(this,data)}}class LogOut{}class AuthorizationSignUpRequired{}
 class StringSession{constructor(value){this.value=value}save(){return 'private-session'}}
 class TelegramClient{
  constructor(session){client=this;this.session=session;this.authorized=!!session.value;this.needsPassword=false;this.entity={id:42n,bot:true};this.messages=[]}
  setLogLevel(){}async connect(){}async disconnect(){this.disconnected=true}async checkAuthorization(){return this.authorized}
  async sendCode(_,phone){this.phone=phone;return {phoneCodeHash:'private-code-hash'}}
  async signInUserWithQrCode(_,callbacks){this.qrCallbacks=callbacks;await callbacks.qrCode({token:Buffer.from('first-token'),expires:Math.floor(Date.now()/1000)+30});await new Promise(resolve=>{this.scan=async()=>{if(this.needsPassword)await callbacks.password();this.authorized=true;resolve()}})}
  async invoke(request){if(request instanceof SignIn&&this.needsPassword)throw Object.assign(Error('Password required'),{errorMessage:'SESSION_PASSWORD_NEEDED'});if(request instanceof GetPassword)return {};if(request instanceof LogOut){this.authorized=false;return}this.authorized=true;return {}}
  async getEntity(){return this.entity}async sendMessage(entity,options){sent.push(options.message);return {id:10}}async getMessages(_,options){this.options=options;return this.messages}
 }
 const connection=new TelegramConnection({read:async()=>stored,write:async value=>{stored=value},encodeQr:async value=>'data:image/png;base64,'+Buffer.from(value).toString('base64'),sdk:{TelegramClient,StringSession,Api:{auth:{SignIn,CheckPassword,LogOut,AuthorizationSignUpRequired},account:{GetPassword}},computeCheck:async()=>({proof:true})}});
 return {connection,get client(){return client},get stored(){return stored},sent};
}
const login={apiId:12345,apiHash:'a'.repeat(32),phone:'+33123456789'};
test('Telegram login persists only a session and API credentials; status exposes no secrets',async()=>{
 const f=fixture();await assert.rejects(()=>f.connection.begin({...login,apiId:0}),/API ID/);
 await f.connection.begin(login);assert.equal(f.client.phone,login.phone);assert.equal(f.sent.length,0);
 const state=await f.connection.verify({code:'12345'});assert.equal(state.connected,true);assert.deepEqual(Object.keys(f.stored).sort(),['apiHash','apiId','session']);
 assert.doesNotMatch(JSON.stringify(await f.connection.status()),/private-session|aaaa|33123456789/);
});
test('Telegram login supports two-step verification and retries after an invalid code',async()=>{
 const f=fixture();await f.connection.begin(login);await assert.rejects(()=>f.connection.verify({code:'invalid'}),/login code/);
 f.client.needsPassword=true;assert.deepEqual(await f.connection.verify({code:'12345'}),{phase:'password'});
 assert.equal((await f.connection.verify({password:'not-persisted'})).connected,true);assert.ok(!JSON.stringify(f.stored).includes('not-persisted'));
});
test('Telegram restricts recipients to bots and replies to messages after the explicit send',async()=>{
 const f=fixture();await f.connection.begin(login);await f.connection.verify({code:'12345'});
 f.client.entity.bot=false;await assert.rejects(()=>f.connection.send({username:'example_bot',message:'/start'}),/not a Telegram bot/);assert.equal(f.sent.length,0);
 f.client.entity.bot=true;const job=await f.connection.send({username:'@example_bot',message:'/start'});assert.deepEqual(f.sent,['/start']);
 f.client.messages=[{id:13,senderId:42n,message:'second',out:false},{id:12,senderId:42n,message:'first',out:false},{id:11,senderId:42n,message:'outgoing',out:true}];
 const replies=await f.connection.replies(job);assert.deepEqual(replies.messages.map(m=>m.text),['first','second']);assert.equal(f.client.options.minId,10);
 await assert.rejects(()=>f.connection.replies({id:'unknown'}),/expired/);
 await f.connection.logout();assert.equal(f.stored,null);assert.equal(f.connection.jobs.size,0);
});
test('Telegram restores saved sessions without requesting a code',async()=>{
 const f=fixture();await f.connection.begin(login);await f.connection.verify({code:'12345'});await f.client.disconnect();f.connection.client=null;
 assert.equal((await f.connection.status()).saved,true);assert.equal((await f.connection.restore()).connected,true);assert.equal(f.sent.length,0);
});
test('QR login publishes a local QR image, refreshes tokens and saves the confirmed session',async()=>{
 const f=fixture();await f.connection.beginQr(login);await new Promise(setImmediate);
 const first=await f.connection.status();assert.equal(first.phase,'qr');assert.match(first.image,/^data:image\/png;base64,/);assert.equal(f.client.phone,undefined);
 const uri=Buffer.from(first.image.split(',')[1],'base64').toString();assert.equal(uri,'tg://login?token='+Buffer.from('first-token').toString('base64url'));
 await f.client.qrCallbacks.qrCode({token:Buffer.from('second-token'),expires:Math.floor(Date.now()/1000)+30});assert.notEqual((await f.connection.status()).image,first.image);
 const task=f.connection.qr.task;await f.client.scan();await task;
 assert.equal((await f.connection.status()).connected,true);assert.equal(f.stored.session,'private-session');assert.ok(!JSON.stringify(f.stored).includes('token'));
});
test('QR login supports the two-step password prompt without storing the password',async()=>{
 const f=fixture();await f.connection.beginQr(login);await new Promise(setImmediate);f.client.needsPassword=true;
 const task=f.connection.qr.task,scanned=f.client.scan();await new Promise(setImmediate);assert.equal((await f.connection.status()).phase,'password');
 await f.connection.verify({password:'two-step-secret'});await scanned;await task;
 assert.equal((await f.connection.status()).connected,true);assert.ok(!JSON.stringify(f.stored).includes('two-step-secret'));
});
test('Cancelling QR login prevents late callbacks from persisting a session',async()=>{
 const f=fixture();await f.connection.beginQr(login);await new Promise(setImmediate);const client=f.client,task=f.connection.qr.task;
 await f.connection.logout();await assert.rejects(()=>client.qrCallbacks.qrCode({token:Buffer.from('stale'),expires:123}),/cancelled/);
 await client.scan();await task;assert.equal(f.stored,null);assert.equal(client.authorized,false);assert.equal(f.connection.qr,null);
});
