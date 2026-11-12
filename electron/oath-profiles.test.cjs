const {test}=require('node:test');
const assert=require('node:assert/strict');
const {profileTargets,searchProfile}=require('./oath-profiles.cjs');
const {searchWorkflow}=require('./search-workflow.cjs');
const response=data=>({ok:true,json:async()=>({success:true,data})});

test('account identifiers route to platform services and deduplicate explicit fields',()=>{
 const id='300760994454437890';
 const targets=profileTargets(id,[{fields:{discord_id:[id,id],steam_id:'76561199443618616',roblox_id:'65',xuid:'2535419058108561'}}]);
 assert.deepEqual(targets.map(t=>[t.kind,t.parameter,t.query]),[['discord','discord_id',id],['steam','steam_id','76561199443618616'],['roblox','user_id','65'],['xbox','xbl_id','2535419058108561']]);
 assert.deepEqual(profileTargets('76561199443618616').map(t=>t.kind),['steam']);
 assert.deepEqual(profileTargets('https://www.roblox.com/users/65/profile').map(t=>[t.kind,t.query]),[['roblox','65']]);
 assert.deepEqual(profileTargets('https://steamcommunity.com/id/example_user').map(t=>t.kind),['steam']);
});

test('account selection ignores names, credentials, unrelated IDs and unsafe integer values',()=>{
 const items=[{fields:{name:'Example Person',username:'generic',id:'12345',email:'person@example.org',password:{discord_id:'300760994454437890'},cookie:{roblox_id:'65'},discord_id:300760994454437890}},{source:'OathNet stealer',fields:{roblox_id:'123'}}];
 assert.deepEqual(profileTargets('person@example.org',items),[]);
 assert.deepEqual(profileTargets('Example Person',items),[]);
 assert.deepEqual(profileTargets('example_user',[],{oathProfileServices:['xbox']}).map(t=>t.kind),['xbox']);
 assert.deepEqual(profileTargets('example_user',[],{oathProfileServices:[]}),[]);
});

test('Steam cards normalize documented nested identity and creation date',async()=>{
 const result=await searchProfile({query:'76561199443618616',profileKind:'steam',settings:{oathOptions:{search_id:'sess_test'}}},'test-key',async(url,options)=>{
  const u=new URL(url);assert.equal(u.pathname,'/api/service/steam');assert.equal(u.searchParams.get('steam_id'),'76561199443618616');assert.equal(u.searchParams.get('search_id'),'sess_test');assert.equal(options.headers['x-api-key'],'test-key');assert.ok(!url.includes('test-key'));
  return response({username:'example',meta:{id:'76561199443618616',raw_data:{steamid:'76561199443618616',personaname:'Example',avatarfull:'https://example.org/avatar.png',timecreated:1670701199,communityvisibilitystate:3}},_meta:{user:{plan:'Pro'}}});
 });
 const item=result.items[0];assert.equal(item.profileType,'steam');assert.equal(item.fields.display_name,'Example');assert.equal(item.fields.visibility,'Public');assert.equal(item.fields.join_date,new Date(1670701199000).toISOString());assert.equal(item.fields._meta,undefined);
});

test('Xbox cards preserve zero gamerscore and nested account details',async()=>{
 const result=await searchProfile({query:'Example',profileKind:'xbox'},'key',async url=>{
  assert.equal(new URL(url).searchParams.get('xbl_id'),'Example');
  return response({username:'Example',avatar:'https://example.org/avatar.png',meta:{id:'2535419058108561',meta:{gamerscore:0,accounttier:'Silver',xboxonerep:'GoodPlayer'},scraper_data:{games_played:0}}});
 });
 assert.equal(result.items[0].fields.user_id,'2535419058108561');assert.equal(result.items[0].fields.gamerscore,0);assert.equal(result.items[0].fields.games_played,0);
});

test('Discord fetches account and username history with the documented nested history shape',async()=>{
 const paths=[];const result=await searchProfile({query:'300760994454437890',profileKind:'discord'},'key',async url=>{
  const u=new URL(url);paths.push(u.pathname);assert.equal(u.searchParams.get('discord_id'),'300760994454437890');
  return response(u.pathname.endsWith('discord-userinfo')?{id:'300760994454437890',username:'example',global_name:'Example',badges:[]}:{success:true,history:[{name:['previous'],time:['2025-08-01T13:01:13.476Z']}]});
 });
 assert.deepEqual(paths,['/api/service/discord-userinfo','/api/service/discord-username-history']);assert.deepEqual(result.items[0].fields.username_history[0].name,['previous']);
});

test('Discord retains account on history failure and unavailable responses create no placeholder accounts',async()=>{
 const result=await searchProfile({query:'300760994454437890',profileKind:'discord'},'key',async url=>url.includes('discord-userinfo')?response({id:'300760994454437890',username:'example'}):{ok:false,status:503});
 assert.equal(result.items.length,1);assert.match(result.notice,/history is unavailable/);assert.equal(result.items[0].fields.username_history,undefined);
 assert.deepEqual((await searchProfile({query:'example',profileKind:'steam'},'key',async()=>response({_meta:{user:{plan:'Pro'}}}))).items,[]);
 const missing=await searchProfile({query:'example',profileKind:'xbox'},'key',async()=>({ok:false,status:404}));assert.equal(missing.items.length,0);assert.match(missing.notice,/unavailable/);
 await assert.rejects(searchProfile({query:'example',profileKind:'steam'},'key',async()=>({ok:true,json:async()=>{throw Error()}})),/invalid response/);
});

test('account enrichment uses dataset identifiers, caps work and retains records on partial failure',async()=>{
 const calls=[];
 const result=await searchWorkflow({providers:['oathnet'],query:'Example Person',settings:{}},async payload=>{
  calls.push(payload);
  if(payload.provider==='oathnet')return {items:[{id:'base',fields:{discord_id:'300760994454437890',roblox_id:Array.from({length:15},(_,i)=>String(i+1))}}],meta:{total:99}};
  if(payload.profileKind==='discord')throw Error('Service unavailable');
  return {items:[{id:`roblox-${payload.query}`,profileType:'roblox',fields:{user_id:payload.query}}]};
 });
 assert.equal(calls[0].provider,'oathnet');assert.equal(calls.length,13);assert.equal(result.items[0].id,'base');assert.equal(result.items.length,12);assert.equal(result.meta.total,99);assert.equal(result.meta.profilesChecked,12);assert.match(result.notice,/Service unavailable/);assert.match(result.notice,/first 12/);
});

test('account lookups respect disabled settings and survive a dataset failure',async()=>{
 const calls=[];await searchWorkflow({providers:['oathnet'],query:'example',settings:{oathProfiles:false}},async p=>{calls.push(p.provider);return {items:[]}});assert.deepEqual(calls,['oathnet']);
 const result=await searchWorkflow({providers:['oathnet'],query:'example',settings:{oathProfileServices:['steam']}},async p=>{if(p.provider==='oathnet')throw Error('Dataset unavailable');return {items:[{id:'account',profileType:'steam',fields:{username:'example'}}]}});
 assert.equal(result.items[0].id,'account');assert.match(result.notice,/Dataset unavailable/);
});
