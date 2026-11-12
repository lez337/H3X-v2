const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {extractEmails,searchWorkflow}=require('./search-workflow.cjs');
const {parseGhunt,searchGhunt}=require('./public-providers.cjs');
const {searchRoblox}=require('./oath-profiles.cjs');

test('automatic email selection deduplicates contacts and ignores non-email fields and credentials',()=>{
 const items=[{source:'Example',fields:{email:['Person@example.org','other@example.org'],profile:{email_address:'third@example.org'},username:'fake@example.org',password:'secret@example.org',cookie:{email:'cookie@example.org'},phone:'+33123456789',url:'https://example.org/path@host.org',notes:'notes@example.org'}},{source:'OathNet · stealer',fields:{email:'stolen@example.org'}}];
 assert.deepEqual(extractEmails('person@example.org +33123456789',items).map(x=>x.toLowerCase()),['person@example.org','other@example.org','third@example.org']);
});
test('GHunt waits for other providers, sends only emails and retains results on partial failure',async()=>{
 const calls=[];const result=await searchWorkflow({providers:['github','ghunt'],query:'someone',settings:{}},async p=>{
  calls.push([p.provider,p.query]);if(p.provider==='github')return {items:[{source:'Public',fields:{email:'person@example.org, other@example.org'}}]};
  if(p.query==='other@example.org')throw Error('Lookup unavailable');
  return {items:[parseGhunt({},p.query)]};
 });
 assert.deepEqual(calls,[['github','someone'],['ghunt','person@example.org'],['ghunt','other@example.org']]);assert.equal(result.items.length,2);assert.match(result.notice,/Lookup unavailable/);
});
test('GHunt skips non-email-only searches without invoking the tool',async()=>{
 const result=await searchWorkflow({providers:['ghunt'],query:'username',settings:{}},async()=>{assert.fail('must not invoke GHunt')});assert.equal(result.items.length,0);assert.match(result.notice,/no email addresses/);
});
test('GHunt caps automatic work and preserves independent provider output',async()=>{
 let checks=0;const result=await searchWorkflow({providers:['rdap','ghunt'],query:'example.org',settings:{}},async p=>p.provider==='rdap'?{items:[{source:'Example',fields:{emails:Array.from({length:13},(_,i)=>`user${i}@example.org`)}}]}:(checks++,{items:[]}));assert.equal(checks,10);assert.equal(result.meta.emailsChecked,10);assert.match(result.notice,/first 10/);
});
test('Oath account services run after datasets only for compatible identifiers',async()=>{
 const calls=[];await searchWorkflow({providers:['oathnet'],query:'example_user',settings:{}},async p=>{calls.push(p.provider);return {items:[]}});assert.deepEqual(calls,['oathnet','oathProfile','oathProfile','oathProfile']);
 calls.length=0;await searchWorkflow({providers:['oathnet'],query:'person@example.org',settings:{}},async p=>{calls.push(p.provider);return {items:[]}});assert.deepEqual(calls,['oathnet']);
});
test('structured GHunt profile distinguishes missing, zero and positive review counts',()=>{
 const base={PROFILE_CONTAINER:{profile:{personId:'123456',names:{PROFILE:{fullname:'Example Person'}},profilePhotos:{PROFILE:{url:'https://example.org/photo.png'}}},maps:{stats:{reviews:3}}}};
 const fields=parseGhunt(base,'person@example.org').fields;assert.equal(fields.review_status,'Reviews found');assert.equal(fields.review_count,3);assert.equal(fields.name,'Example Person');assert.equal(fields.avatar_url,'https://example.org/photo.png');assert.equal(fields.maps_url,'https://www.google.com/maps/contrib/123456/reviews');
 base.PROFILE_CONTAINER.maps.stats.reviews=0;assert.equal(parseGhunt(base,'person@example.org').fields.review_status,'No reviews');
 base.PROFILE_CONTAINER.maps={reviews:null,stats:{}};assert.equal(parseGhunt(base,'person@example.org').fields.review_status,'Unavailable');
 assert.equal(parseGhunt(base,'person@example.org','Maps reviews are private').fields.review_status,'Unavailable');
});
test('GHunt reads JSON exports and removes the temporary output after use',async()=>{
 let outputFile;const result=await searchGhunt({query:'person@example.org'},(exe,args,options,callback)=>{
  outputFile=args[3];fs.writeFile(outputFile,JSON.stringify({PROFILE_CONTAINER:{profile:{personId:'123'},maps:{stats:{reviews:2}}}})).then(()=>callback(null,'Public output'),callback);
 });assert.equal(result.items[0].fields.review_count,2);await assert.rejects(fs.stat(outputFile),{code:'ENOENT'});
});
test('GHunt retains partial console results and never equates unavailable reviews with zero',async()=>{
 const result=await searchGhunt({query:'person@example.org'},(exe,args,options,callback)=>callback(Error('JSON export failed'),'Custom profile picture !\n=> https://example.org/pfp.png\nGaia ID : 123\nMaps reviews are private'));
 assert.equal(result.items[0].fields.avatar_url,'https://example.org/pfp.png');assert.equal(result.items[0].fields.review_status,'Unavailable');assert.match(result.notice,/partial/);
 await assert.rejects(searchGhunt({query:'person@example.org'},(exe,args,options,callback)=>callback(Object.assign(Error(),{code:'ENOENT'}),'')),/not installed/);
});
test('Oath public profile lookup maps documented fields and sends key only in header',async()=>{
 const result=await searchRoblox({query:'example_user'},'test-key',async(url,options)=>{
  assert.equal(new URL(url).searchParams.get('username'),'example_user');assert.equal(options.headers['x-api-key'],'test-key');assert.ok(!url.includes('test-key'));
  return {ok:true,json:async()=>({success:true,data:{'Current Username':'example_user','Display Name':'Example','User ID':'123','Join Date':'2018-08-12','Old Usernames':'None','Avatar URL':'https://example.org/avatar.png',_meta:{used:2}}})};
 });assert.equal(result.items[0].profileType,'roblox');assert.equal(result.items[0].fields.profile_url,'https://www.roblox.com/users/123/profile');assert.equal(result.items[0].fields._meta,undefined);
});
