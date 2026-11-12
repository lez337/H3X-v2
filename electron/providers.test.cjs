const test=require('node:test');
const assert=require('node:assert/strict');
const p=require('./providers.cjs');
test('redacts credentials while preserving contact fields',()=>{
  const value=p.mask({email:'person@example.org',password:'hunter2',phone:'+1 555 123 4567',discord_id:'123456789012345678'});
  assert.equal(value.password,'[redacted]');assert.equal(value.email,'person@example.org');assert.equal(value.phone,'+1 555 123 4567');assert.equal(value.discord_id,'123456789012345678');
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
test('BrixHub full name queries send surname first and given name second',async()=>{
  const old=global.fetch;let body;
  global.fetch=async(url,opts)=>{body=JSON.parse(opts.body);return {ok:true,text:async()=>JSON.stringify({data:{results:[]}})}};
  try{await p.searchBrix({query:'Dupont Jean Paul',settings:{brixField:'auto'}});assert.equal(body.nom_famille,'Dupont');assert.equal(body.prenom,'Jean Paul');assert.equal(body.nom_affichage,undefined)}finally{global.fetch=old}
});

test('BrixHub ignores stale explicit field settings and detects the query',async()=>{
 const old=global.fetch;let body;
 global.fetch=async(url,opts)=>{body=JSON.parse(opts.body);return {ok:true,text:async()=>JSON.stringify({data:{results:[]}})}};
 try{await p.searchBrix({query:'person@example.org',settings:{brixField:'telephone'}});assert.equal(body.email,'person@example.org');assert.equal(body.telephone,undefined)}finally{global.fetch=old}
});
test('OathNet forwards search controls, repeated filters and structured trees',async()=>{
 const old=global.fetch;let url;
 global.fetch=async(u)=>{url=new URL(u);return {ok:true,text:async()=>JSON.stringify({data:{items:[]}})}};
 const filter={and:[{field:'email',operator:'eq',value:'person@example.org'}]};
 try{await p.searchOath({query:'example',settings:{oathFamily:'stealer',oathOptions:{logic:'and',wildcard:true,sort:'indexed_at:desc'},oathFilters:{email:['a@example.org','b@example.org'],filter}}},'key');assert.equal(url.searchParams.get('wildcard'),'true');assert.equal(url.searchParams.get('logic'),'and');assert.deepEqual(url.searchParams.getAll('email[]'),['a@example.org','b@example.org']);assert.deepEqual(JSON.parse(url.searchParams.get('filter')),filter)}finally{global.fetch=old}
});

test('OathNet validates structured operators, arrays, patterns and nesting',()=>{
 assert.doesNotThrow(()=>p.validateFilter({and:[{field:'country',operator:'in',value:['FR','IT']},{field:'email',operator:'exists',value:false}]}));
 for(const filter of [{field:'country',operator:'in',value:'FR'},{field:'ip',operator:'contains',value:'192'},{field:'email',operator:'wildcard',value:'*a*'},{field:'email',operator:'exists',value:'true'},{and:Array.from({length:51},()=>({field:'email',operator:'eq',value:'a@b.com'}))},{and:[{or:[{and:[{field:'email',operator:'eq',value:'a@b.com'}]}]}]}])assert.throws(()=>p.validateFilter(filter));
});

test('BrixHub forwards the added screenshot filter fields',async()=>{
 const old=global.fetch;let body;
 global.fetch=async(url,opts)=>{body=JSON.parse(opts.body);return {ok:true,text:async()=>JSON.stringify({data:{results:[]}})}};
 try{const filters={adresse:'10 rue de la Paix',nom_naissance:'Martin',date_naissance:'1990-06-15',steam_id:'steam:123',fivem_license:'license:abc',nir:'123',iban:'FR76',bic:'TEST',vin:'AB-123-CD'};await p.searchBrix({query:'test_user',settings:{brixFilters:filters}});for(const [key,value] of Object.entries(filters))assert.equal(body[key],value)}finally{global.fetch=old}
});
