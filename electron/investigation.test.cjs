const test=require('node:test');
const assert=require('node:assert/strict');
const {prepare,clean,textReport,parseText}=require('./investigation.cjs');
test('TXT omits empty standard and custom categories and preserves custom values on import',()=>{
 const record={summary:'  ',notes:'\n',people:[{name:'Example Person',phone:' ',dateOfBirth:'',customCategories:[{id:'1',label:'Occupation',value:'Researcher\nIndependent'},{id:'2',label:'Empty category',value:'  '}]},{name:'Second Person',customCategories:[{id:'3',label:'Languages',value:'French, English'}]}]};
 const text=textReport(record);
 for(const label of ['Phone','Date of Birth','Codice Fis.','Address','CAP','Shipping','Empty category','Summary','Notes'])assert.ok(!text.includes(label+' '),label);
 assert.match(text,/Occupation\s+: Researcher\r?\n    Independent/);
 const imported=parseText(text).record;
 assert.deepEqual(imported.people[0].customCategories.map(({label,value})=>({label,value})),[{label:'Occupation',value:'Researcher\nIndependent'}]);
 assert.equal(imported.people[1].customCategories[0].value,'French, English');
});
test('loading custom category values does not overwrite standard person details',()=>{
 const {hydrateRecord}=require('./investigation.cjs');
 const record=hydrateRecord({people:[{name:'Example Person',customCategories:[{id:'1',label:'Profile',value:'Other',name:'Unrelated'}]}]});
 assert.equal(record.people[0].name,'Example Person');assert.equal(record.people[0].customCategories[0].value,'Other');
});
test('maps nested names, age and details; surname comes first in unlabeled full names',()=>{
 const {patch,fields}=prepare({profile:{full_name:'Dupont Jean Paul',age:32,telephone:'123',home_address:'Paris',id:44},created_at:'today'});
 assert.equal(patch.lastName,'Dupont');assert.equal(patch.firstName,'Jean Paul');assert.equal(patch.age,'32');assert.equal(patch.phone,'123');assert.equal(patch.address,'Paris');assert.equal(fields.profile.id,undefined);assert.equal(fields.created_at,undefined);
 assert.deepEqual(prepare({first_name:'Jean',last_name:'Dupont'}).patch,{firstName:'Jean',lastName:'Dupont',name:'Dupont Jean'});
});
test('filters are recursive, normalized and support custom wildcards',()=>{
 assert.deepEqual(clean({ID:3,createdAt:'now',profile:[{record_id:8,email:'a',custom_field:'x',age:20}]},['id','*_id','created_at','custom*']),{profile:[{email:'a',age:20}]});
});
test('clean TXT contains person details and notes without internal evidence or metadata blocks',()=>{
 const record={title:'Example',summary:'Line one\nLine two',notes:'A: B',people:[{name:'Dupont Jean',firstName:'Jean',lastName:'Dupont',age:'32',notes:'Person\nnotes',evidence:[{source:'BrixHub',query:'example',fields:{age:32,id:'omit',nested:{timestamp:'omit',city:'Paris'}}}]}]};
 const text=textReport(record);assert.ok(!text.includes('[EVIDENCE]'));assert.ok(!text.includes('[INVESTIGATION]'));assert.ok(!text.includes('Source:'));assert.ok(!text.includes('Query:'));assert.ok(!text.includes('timestamp'));
 const imported=parseText(text).record;assert.equal(imported.people[0].name,'Dupont Jean');assert.equal(imported.people[0].notes,'Person\nnotes');assert.equal(imported.summary,record.summary);assert.equal(imported.notes,record.notes);assert.deepEqual(imported.people[0].evidence,[]);
});
test('plain saved details map labels into person fields',()=>{
 const data=parseText('Full name: Dupont Jean\nAge: 32\nEmail: jean@example.org\nTimestamp: ignored');
 const result=prepare(data.fields);assert.equal(result.patch.age,'32');assert.equal(result.patch.firstName,'Jean');assert.equal(result.fields.Timestamp,undefined);
});

test('formatted exports use centered person headers and aligned identity details',()=>{
 const text=textReport({title:'Case',people:[{name:'Rossi Mario',dateOfBirth:'1990-01-02',taxCode:'EXAMPLE',altPhone:'456',postalCode:'00100',shipping:'Rome',evidence:[]},{name:'Bianchi Anna',evidence:[]}]});
 assert.ok(text.startsWith('-'.repeat(80)+'\r\n'+' '.repeat(34)+'Rossi Mario\r\n'+'-'.repeat(80)));
 assert.ok(text.includes('Full Name     : Rossi Mario'));assert.ok(text.includes('Date of Birth : 1990-01-02'));assert.ok(text.includes('Codice Fis.   : EXAMPLE'));assert.ok(text.includes('Alt. Phone    : 456'));assert.ok(text.includes('CAP           : 00100'));
 const imported=parseText(text).record;assert.equal(imported.people.length,2);assert.equal(imported.people[0].postalCode,'00100');assert.equal(imported.people[1].name,'Bianchi Anna');
});
test('new export labels map imported identity fields',()=>{
 const result=prepare(parseText('Full Name : Rossi Mario\nDate of Birth : 1990-01-02\nCodice Fis. : EXAMPLE\nAlt. Phone : 456\nCAP : 00100\nShipping : Rome').fields).patch;
 assert.equal(result.dateOfBirth,'1990-01-02');assert.equal(result.taxCode,'EXAMPLE');assert.equal(result.altPhone,'456');assert.equal(result.postalCode,'00100');assert.equal(result.shipping,'Rome');
});

test('collects multiple contacts, nested arrays and numbered aliases without losing existing entries',()=>{
 const result=prepare({profile:{phone_number:'0612345678',phone_number2:'0698765432',phone_national2:'0698765432',email:['one@example.org','two@example.org'],username:'first_user',usernames:['second_user','first_user']},address_street:'Example street'},undefined,{phone:'0611111111',email:'one@example.org'}).patch;
 assert.equal(result.phone,'0611111111, 0612345678, 0698765432');assert.equal(result.email,'one@example.org, two@example.org');assert.equal(result.username,'first_user, second_user');assert.equal(result.address,'Example street');
});
test('maps birth-date aliases, validates dates and calculates age only from complete dates',()=>{
 const result=prepare({date_birth:'2000-01-02',age:'26 years'}).patch;assert.equal(result.dateOfBirth,'2000-01-02');assert.equal(result.age,'26');
 assert.equal(prepare({date_naissance:'02/01/2000'}).patch.dateOfBirth,'2000-01-02');
 assert.equal(prepare({jour_naissance:2,mois_naissance:1,annee_naissance:2000}).patch.dateOfBirth,'2000-01-02');
 assert.equal(prepare({dob:'2000-02-31'}).patch.dateOfBirth,undefined);assert.equal(prepare({birth_year:2000}).patch.age,undefined);
 const today=new Date(),age=today.getUTCFullYear()-2000-(today.getUTCMonth()===0&&today.getUTCDate()<2?1:0);assert.equal(prepare({dob:'2000-01-02'}).patch.age,String(age));
});
test('custom ASCII art decorates clean TXT without losing formatted person imports',()=>{
 const text=textReport({people:[{name:'Example Person',phone:'123, 456',email:'a@example.org, b@example.org'}]},undefined,{txtHeaderArt:'HEADER ART',txtFooterArt:'FOOTER ART'});
 assert.ok(text.startsWith('HEADER ART'));assert.ok(text.trimEnd().endsWith('FOOTER ART'));assert.equal(parseText(text).record.people[0].phone,'123, 456');
});
test('older structured TXT files still import evidence and investigation metadata',()=>{
 const rule='-'.repeat(80);const text=[rule,'Example Person',rule,'Full Name     : Example Person','','[EVIDENCE]','Source: "Example"','Query: "test"','Field "city": "Paris"','[/EVIDENCE]','[INVESTIGATION]','Title: "Original"','Summary: "Summary"','Notes: "Notes"'].join('\n');
 const record=parseText(text).record;assert.equal(record.title,'Original');assert.equal(record.summary,'Summary');assert.equal(record.notes,'Notes');assert.equal(record.people[0].evidence[0].fields.city,'Paris');
});

test('comma-separated phone lists remain intact on repeated imports',()=>{
 assert.equal(prepare({phone:'0612345678, 0698765432',email:'one@example.org, two@example.org'}).patch.phone,'0612345678, 0698765432');
});
test('loading existing people fills missing birth information and combines saved evidence contacts',()=>{
 const {hydrateRecord}=require('./investigation.cjs');const record=hydrateRecord({people:[{name:'Person 1',phone:'0611111111',evidence:[{fields:{full_name:'Example Person',dob:'2000-01-02',phone:'0622222222',email:'one@example.org'}},{fields:{email:'two@example.org'}}]}]});
 assert.equal(record.people[0].name,'Example Person');assert.equal(record.people[0].phone,'0622222222, 0611111111');assert.equal(record.people[0].email,'one@example.org, two@example.org');assert.equal(record.people[0].dateOfBirth,'2000-01-02');
});
