const {test}=require('node:test');
const assert=require('node:assert/strict');
const {searchWhatsMyName,searchTelegram,ghuntInvocation,searchGhunt}=require('./public-providers.cjs');
test('WhatsMyName uses site response markers and reports unknown results without inventing matches',async()=>{
 const request=async url=>url.includes('wmn-data.json')?{ok:true,json:async()=>({sites:[{name:'Match',uri_check:'https://example.org/{account}',e_code:200,e_string:'profile-found',m_code:404,m_string:'not-found'},{name:'Blocked',uri_check:'https://blocked.example/{account}',e_code:200,e_string:'profile-found'},{name:'Broken',valid:false,uri_check:'https://broken.example/{account}'}]})}:{status:200,text:async()=>url.includes('blocked')?'captcha':'profile-found'};
 const result=await searchWhatsMyName({query:'example_user',settings:{}},request);assert.equal(result.items.length,1);assert.equal(result.items[0].fields.site,'Match');assert.equal(result.meta.unknown,1);
 await assert.rejects(()=>searchWhatsMyName({query:'123456789',settings:{}},request),/public username/);
});
test('GHunt runs a console executable with a separated email argument and no shell',async()=>{
 assert.deepEqual(ghuntInvocation({},'person@example.org'),{executable:'ghunt',args:['email','person@example.org']});
 const result=await searchGhunt({query:'person@example.org',settings:{}},(exe,args,options,callback)=>{assert.equal(options.shell,false);assert.equal(exe,'ghunt');assert.deepEqual(args.slice(0,3),['email','person@example.org','--json']);assert.ok(require('node:path').isAbsolute(args[3]));callback(null,'public output')});assert.equal(result.items[0].fields.output,'public output');
 assert.throws(()=>ghuntInvocation({},'not an email'),/email address/);
});
test('Telegram provider sends the selected template and returns only that bot reply',async()=>{
 const sent=[];const telegram={send:async p=>{sent.push(p);return {id:'job'}},replies:async()=>({messages:[{id:1,text:'Domain response'}]})};
 const base={settings:{telegramBotId:'bot'},bots:[{id:'bot',username:'example_bot',name:'Example',category:'domain',template:'/lookup {query}'}]};
 const result=await searchTelegram({...base,query:'example.org'},telegram,async()=>{});assert.deepEqual(sent,[{username:'example_bot',message:'/lookup example.org'}]);assert.equal(result.items[0].fields.response,'Domain response');
 await assert.rejects(()=>searchTelegram({...base,query:'+33123456789'},telegram,async()=>{}),/domains/);assert.equal(sent.length,1);
});
