const {test}=require('node:test');
const assert=require('node:assert/strict');
const {redactTree,redactStealer}=require('./stealer-tree.cjs');
test('stealer tree keeps folder structure while removing personal names, IDs and file contents',()=>{
  const tree=redactTree({id:'secret-log',name:'Private Person',type:'directory',children:[{id:'private-id',name:'passwords.txt',type:'file',content:'actual-secret'},{name:'private-email@example.org.txt',type:'file',size_bytes:20}]});
  const text=JSON.stringify(tree);assert.equal(tree.children.length,2);for(const secret of ['Private Person','secret-log','private-id','actual-secret','private-email','passwords.txt','size','20','.txt'])assert.ok(!text.includes(secret));
  assert.equal(redactStealer({password:'secret',email:'a@example.org',domain:'example.org'}).password,'[redacted]');
});

test('manifest loader returns only redacted structure and never requests file contents',async()=>{
  const old=global.fetch;const requests=[];
  global.fetch=async(url,options)=>{requests.push(url);assert.equal(options.headers['x-api-key'],'test-key');return {ok:true,json:async()=>({victim_tree:{id:'private',name:'private',type:'directory',children:[{name:'Passwords.txt',type:'file',size_bytes:123,content:'secret'}]}})}};
  try{
   const {tree}=await require('./stealer-tree.cjs').loadRedactedTree('log/reference','test-key');
   assert.deepEqual(requests,['https://oathnet.org/api/service/v2/victims/log%2Freference']);
   assert.deepEqual(tree,{id:'1',name:'[redacted folder 1]',type:'directory',children:[{id:'2',name:'[redacted file 2]',type:'file'}]});
  }finally{global.fetch=old}
});

test('manifest loader handles unavailable logs without exposing provider response bodies',async()=>{
  const {loadRedactedTree}=require('./stealer-tree.cjs');
  await assert.rejects(loadRedactedTree('', 'key'),/No stealer log/);
  await assert.rejects(loadRedactedTree('log', ''),/API key/);
  const old=global.fetch;
  try{
   global.fetch=async()=>({ok:false,status:403});await assert.rejects(loadRedactedTree('log','key'),/HTTP 403/);
   global.fetch=async()=>({ok:true,json:async()=>({})});await assert.rejects(loadRedactedTree('log','key'),/did not return a file tree/);
  }finally{global.fetch=old}
});

test('tree redaction bounds large and deeply nested manifests',()=>{
  const tree=redactTree({type:'directory',children:Array.from({length:3000},()=>({type:'file',name:'private'}))});
  assert.equal(tree.children.length,1999);
  let root={type:'file'};for(let i=0;i<40;i++)root={type:'directory',children:[root]};
  assert.doesNotThrow(()=>redactTree(root));assert.equal(redactTree(null),null);
});

test('explicit file nodes stay files even when the provider includes empty children',()=>{
  const tree=redactTree({type:'directory',children:[{type:'file',children:[]},{type:'folder',children:[]}]});
  assert.equal(tree.children[0].type,'file');assert.equal(tree.children[0].children,undefined);
  assert.equal(tree.children[1].type,'directory');
});

test('tree accepts root arrays and JSON manifests',()=>{
  assert.equal(redactTree([{type:'file'}]).children[0].type,'file');
  assert.equal(redactTree(JSON.stringify({type:'directory',children:[{type:'file'}]})).children.length,1);
  assert.equal(redactTree('invalid json'),null);
});

test('stealer results preserve only username fields alongside existing public metadata',()=>{
  const result=redactStealer({username:'example_user',account:{user_name:'second_user',UserName:'third_user',password:'secret',email:'private@example.org',token:'secret'},username_hint:'private',domain:'example.org'});
  assert.equal(result.username,'example_user');assert.equal(result.account.user_name,'second_user');assert.equal(result.account.UserName,'third_user');
  for(const field of ['password','email','token'])assert.equal(result.account[field],'[redacted]');
  assert.equal(result.username_hint,'[redacted]');
});
