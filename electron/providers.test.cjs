const test=require('node:test');
const assert=require('node:assert/strict');
const p=require('./providers.cjs');
test('redacts credentials and identifiers recursively',()=>{
 const value=p.mask({email:'person@example.org',password:'hunter2',phone:'+1 555 123 4567',discord_id:'123456789012345678'});
 assert.equal(value.password,'[redacted]');assert.equal(value.email,'pe***@example.org');assert.ok(!JSON.stringify(value).includes('123456789012345678'));assert.ok(!JSON.stringify(value).includes('555 123 4567'));
});
test('BrixHub only sends documented fields and parses result envelope',async()=>{
 const old=global.fetch;let request;
 global.fetch=async(url,opts)=>{request={url,opts};return {ok:true,text:async()=>JSON.stringify({data:{results:[{email:'person@example.org',password:'secret'}]},meta:{total:1,page:1,pages:1}})}};
 try{const out=await p.searchBrix({query:'person@example.org',settings:{brixField:'email',pageSize:20,brixFilters:{ville:'Paris',unknown:'ignored'}}});const body=JSON.parse(request.opts.body);assert.equal(request.url,'https://api.brixhub.ru/api/v1/search');assert.equal(body.email,'person@example.org');assert.equal(body.ville,'Paris');assert.equal(body.unknown,undefined);assert.equal(out.items[0].fields.password,'[redacted]')}finally{global.fetch=old}
});
test('OathNet sends key in header and never exposes it in result',async()=>{
 const old=global.fetch;let request;
 global.fetch=async(url,opts)=>{request={url,opts};return {ok:true,text:async()=>JSON.stringify({success:true,data:{items:[{email:'person@example.org',token:'private'}],meta:{total:1}}})}};
 try{const out=await p.searchOath({query:'person@example.org',settings:{oathFamily:'breach'}},'test-key');assert.match(request.url,/\/service\/v2\/breach\/search/);assert.equal(request.opts.headers['x-api-key'],'test-key');assert.equal(out.items[0].fields.token,'[redacted]')}finally{global.fetch=old}
});
