const test=require('node:test');
const assert=require('node:assert/strict');
const {scanText}=require('./scanner.cjs');
const {scanDetailed}=require('./scanner.cjs');
test('phone extraction rejects arbitrary IDs, dates and IPs',()=>{
 const hits=scanText('1234567890\n2026-11-12\n192.168.1.1\nphone: 0612345678\n+33 6 12 34 56 78','sample.txt','',300,['phone']);
 assert.equal(hits.length,2);
 assert.ok(hits.every(h=>h.kind==='phone'));
});

test('CSV headers, quoted delimiters, multiline cells and UTF accents preserve source locations',()=>{
 const text='full_name,email,address,phone,session_token\r\n"Élodie Martin",elodie@example.org,"10 Rue Test,\r\nParis",+33 6 12 34 56 78,hidden@example.org\r\n';
 const {hits,warnings}=scanDetailed(text,'people.csv');assert.deepEqual(warnings,[]);
 assert.ok(hits.some(hit=>hit.kind==='name'&&hit.value==='Élodie Martin'&&hit.line===2&&hit.column===2));
 assert.ok(hits.some(hit=>hit.kind==='address'&&hit.value.includes('\r\nParis')));
 assert.ok(hits.some(hit=>hit.kind==='phone'&&hit.line===3));
 assert.ok(!hits.some(hit=>hit.value.includes('hidden')));
});

test('semicolon CSV, TSV, malformed rows and empty field selections are handled explicitly',()=>{
 for(const [file,delimiter] of [['data.csv',';'],['data.tsv','\t']]){
  const result=scanDetailed(`username${delimiter}phone\nvalid_user${delimiter}0612345678\nbad${delimiter}more${delimiter}cells`,file);
  assert.deepEqual(result.hits.map(hit=>hit.kind),['username','phone']);assert.equal(result.warnings.length,1);
 }
 assert.deepEqual(scanText('jane@example.org','x.txt','',300,[]),[]);
});

test('JSON arrays retain paths and real positions, including escaped characters and duplicate values',()=>{
 const text='{\n "people": [\n  {"email":"same@example.org"},\n  {"email":"same@example.org","name":"Jane \\u0044oe"}\n ]\n}';
 const {hits}=scanDetailed(text,'data.json');const email=hits.find(hit=>hit.kind==='email'),name=hits.find(hit=>hit.kind==='name');
 assert.equal(email.line,3);assert.equal(email.column,13);assert.equal(email.occurrences,2);assert.equal(email.sources[1].line,4);assert.equal(email.sources[1].path,'$["people"][1]["email"]');
 assert.equal(name.value,'Jane Doe');assert.equal(name.column,39);
 const escaped=scanText('{"note":"\\u0041 jane@example.org"}','x.json','',300,['email'])[0];assert.equal(escaped.column,17);
});

test('NDJSON ignores malformed records and keeps line numbers for subsequent records',()=>{
 const result=scanDetailed('{"email":"one@example.org"}\n{"email":"bad@example.org",}\n{"email":"two@example.org"}','records.jsonl');
 assert.deepEqual(result.hits.map(hit=>[hit.value,hit.line]),[['one@example.org',1],['two@example.org',3]]);assert.equal(result.warnings.length,1);
});

test('cookie exports, credential parents and inline secrets never become person details',()=>{
 const object={profile:{name:'Jane Doe',email:'jane@example.org'},accessToken:{email:'hidden@example.org'},cookieRecords:[{domain:'example.org',httpOnly:true,name:'Fake Person',value:'secret@example.org'}],timestamp:{email:'time@example.org'}};
 const result=scanText(JSON.stringify(object),'data.json');assert.deepEqual(result.map(hit=>hit.value),['Jane Doe','jane@example.org']);
 const inline=scanText('name: Jane Doe, token: hidden@example.org\nemail: jane@example.org','data.txt');assert.deepEqual(inline.map(hit=>hit.value),['Jane Doe','jane@example.org']);
 assert.equal(scanText('email: secret@example.org','Browser/Cookies/data.txt').length,0);
 const table=scanDetailed('domain,name,value\nexample.org,Fake Person,hidden@example.org','export.csv');assert.equal(table.hits.length,0);assert.match(table.warnings[0],/cookie/);
});

test('free text URLs survive parsing while credential URL parameters and passwords are omitted',()=>{
 const result=scanText('https://example.org/path?access_token=hidden&ok=yes\nhttps://user:password@example.org/path','notes.txt','',300,['url']);
 assert.equal(result.length,1);assert.equal(result[0].value,'https://example.org/path?ok=yes');assert.match(result[0].reason,/removed/);
 const credentials=scanText('https://example.org/?token=secret@example.org','notes.txt');assert.equal(credentials.some(hit=>hit.kind==='email'),false);assert.equal(credentials[0].value,'https://example.org/');
});

test('duplicate values retain the strongest evidence score and first source position',()=>{
 const result=scanText('+33 6 12 34 56 78\nphone: +33 6 12 34 56 78','x.txt','',300,['phone']);
 assert.equal(result.length,1);assert.equal(result[0].confidence,95);assert.equal(result[0].line,1);assert.equal(result[0].occurrences,2);
});

test('calendar dates, numeric IDs, placeholders, phone junk and filenames do not create misleading matches',()=>{
 const result=scanText('dob: 2023-02-29\ndob: 2000-02-29\nphone: 1111111111\nphone: 12.11.2026\nage: 126\ncity: unknown\nusername: 01234567890123\ndiscord_id: 123456789012345678\nreadme.json\n192.168.1.999','x.txt');
 assert.deepEqual(result.map(hit=>[hit.kind,hit.value]),[['dateOfBirth','2000-02-29'],['discord','123456789012345678']]);
});

test('case-insensitive queries and confidence filtering work before limiting; an exact limit is not truncation',()=>{
 const text='one@example.org\none@example.org\ntwo@example.org';
 const exact=scanDetailed(text,'x.txt',{limit:2});assert.equal(exact.truncated,false);assert.equal(exact.hits[0].occurrences,2);
 const limited=scanDetailed(text,'x.txt',{limit:1});assert.equal(limited.truncated,true);
 assert.equal(scanText(text,'x.txt','TWO@EXAMPLE',1,['email'],90)[0].value,'two@example.org');
});
test('selected file fields exclude others and extract labeled names',()=>{
 const hits=scanText('username: test_user\nname: Jane Doe\nemail: jane@example.org','sample.txt','',300,['username','name']);
 assert.deepEqual(hits.map(x=>x.kind),['username','name']);
 assert.equal(hits[1].value,'Jane Doe');
});

test('cookie contexts, tokens and random identifiers do not become names or usernames',()=>{
 const json=JSON.stringify({cookies:[{name:'Session Cookie',username:'cookie_user'}],profile:{name:'Jane Doe',username:'valid_user'},session:{name:'Fake Person'},username:'aB3dE4fG5hI6jK7lM8nO9pQ0rS1tU2v'});
 const hits=scanText(json,'example.json','',300,['name','username']);assert.equal(hits.length,2);assert.ok(hits.some(h=>h.value==='Jane Doe'));assert.ok(hits.some(h=>h.value==='valid_user'));
 assert.equal(scanText('name: ABCD1234EFGH\nusername: eyJhbGciOiJIUzI1NiJ9.secret','cookies.txt','',300,['name','username']).length,0);
});
test('expanded scanner adds validated dates, labeled fields and confidence with explanations',()=>{
 const hits=scanText('date_birth: 2000-01-02\nage: 26\ncity: Paris\naddress: Example street\npostal_code: 75000\ncompany: Example Corp\nMAC: 01:23:45:67:89:ab','example.txt','',300,['dateOfBirth','age','city','address','postalCode','organization','mac']);
 assert.equal(hits.length,7);assert.ok(hits.every(h=>h.confidence>=75&&h.confidence<=100&&h.reason));
 assert.ok(scanText('jane@example.org\nexample.org','example.txt','',300,['email','domain'],90).every(h=>h.kind==='email'));
});
