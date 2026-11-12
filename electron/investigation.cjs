'use strict';
const defaults=['id','*_id','timestamp','timestamps','created_at','updated_at','saved_at','createdAt','updatedAt','savedAt','password','token','cookie','session'];
const normalize=k=>String(k).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/([a-z])([A-Z])/g,'$1_$2').toLowerCase().replace(/[\s.-]+/g,'_').replace(/^_+|_+$/g,'');
function clean(fields,excluded=defaults){
 const patterns=excluded.map(k=>new RegExp('^'+normalize(k).split('*').map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.*')+'$','i'));
 const visit=v=>Array.isArray(v)?v.map(visit):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).filter(([k])=>!patterns.some(p=>p.test(normalize(k)))).map(([k,v])=>[k,visit(v)])):v;
 return visit(fields||{});
}
function uniqueValues(values,kind){
 const seen=new Set();return values.flatMap(v=>String(v??'').split(/[,;\n]+/)).map(v=>v.trim()).filter(Boolean).filter(v=>{const id=kind==='phone'?v.replace(/\D/g,''):v.toLowerCase();if(!id||seen.has(id))return false;seen.add(id);return true}).join(', ');
}
function birthDate(value){
 const text=String(value??'').trim();let match=text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:T.*)?$/),y,m,d;
 if(match)[,y,m,d]=match;else{match=text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);if(!match)return '';[,d,m,y]=match}
 const date=new Date(Date.UTC(+y,+m-1,+d));if(+y<1850||date.getUTCFullYear()!==+y||date.getUTCMonth()!==+m-1||date.getUTCDate()!==+d||date>Date.now())return '';
 return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}
function mergeDetails(current,patch){const result={...patch};for(const field of ['phone','email','username','altPhone'])if(patch[field])result[field]=uniqueValues([current?.[field],patch[field]],/phone/i.test(field)?'phone':field);return result}
function prepare(fields,excluded,current){
 const filtered=clean(fields,excluded),patch={},multi={phone:[],email:[],username:[],altPhone:[]},parts={};
 const aliases={name:'name',full_name:'name',fullname:'name',nom_affichage:'name',first_name:'firstName',firstname:'firstName',given_name:'firstName',prenom:'firstName',last_name:'lastName',lastname:'lastName',surname:'lastName',nom:'lastName',nom_famille:'lastName',age:'age',years_old:'age',eta:'age',username:'username',user_name:'username',usernames:'username',login:'username',nom_utilisateur:'username',phone:'phone',phones:'phone',phone_number:'phone',phone_numbers:'phone',phone_national:'phone',telephone:'phone',mobile:'phone',tel:'phone',cell_phone:'phone',email:'email',emails:'email',email_address:'email',email_addresses:'email',address:'address',address_street:'address',street_address:'address',home_address:'address',adresse:'address',date_of_birth:'dateOfBirth',date_birth:'dateOfBirth',dob:'dateOfBirth',birth_date:'dateOfBirth',birthdate:'dateOfBirth',date_naissance:'dateOfBirth',codice_fis:'taxCode',codice_fiscale:'taxCode',tax_code:'taxCode',alt_phone:'altPhone',alternate_phone:'altPhone',cap:'postalCode',postal_code:'postalCode',code_postal:'postalCode',shipping:'shipping',shipping_address:'shipping'};
 function scalar(field,v){if(v==null||!String(v).trim())return;const text=String(v).trim();if(field in multi){if(/phone/i.test(field)){for(const number of text.split(/[,;\n]+/).map(v=>v.trim()))if(/^\+?[\d ()-]{3,}$/.test(number))multi[field].push(number)}else multi[field].push(text)}else if(field==='dateOfBirth'){const date=birthDate(text);if(date)patch[field]=date}else if(field==='age'){const m=text.match(/^(\d{1,3})(?:\s*(?:years?(?: old)?|ans?|anni))?$/i);if(m&&+m[1]<=125)patch.age=String(+m[1])}else patch[field]=text}
 function collect(field,v){if(Array.isArray(v))v.forEach(x=>collect(field,x));else if(v&&typeof v==='object'){for(const [k,value] of Object.entries(v))if(/^(value|number|address|username|email|phone)$/i.test(k))collect(field,value)}else scalar(field,v)}
 function visit(obj){for(const [key,v] of Object.entries(obj||{})){const k=normalize(key).replace(/_?\d+$/,'');const field=aliases[k];if(field)collect(field,v);else if(v&&typeof v==='object')visit(v);if(['jour_naissance','birth_day','day_of_birth'].includes(k))parts.day=Number(v);if(['mois_naissance','birth_month','month_of_birth'].includes(k))parts.month=Number(v);if(['annee_naissance','birth_year','year_of_birth'].includes(k))parts.year=Number(v)}}
 visit(filtered);for(const [field,values] of Object.entries(multi)){const combined=uniqueValues(values,/phone/i.test(field)?'phone':field);if(combined)patch[field]=combined}
 if(!patch.dateOfBirth&&parts.year&&parts.month&&parts.day)patch.dateOfBirth=birthDate(`${parts.year}-${parts.month}-${parts.day}`);
 if(patch.dateOfBirth&&!patch.age){const today=new Date(),birth=new Date(patch.dateOfBirth+'T00:00:00Z');let age=today.getUTCFullYear()-birth.getUTCFullYear();if(today.getUTCMonth()<birth.getUTCMonth()||(today.getUTCMonth()===birth.getUTCMonth()&&today.getUTCDate()<birth.getUTCDate()))age--;if(age>=0&&age<=125)patch.age=String(age)}
 if(patch.name){const [surname,...given]=patch.name.split(/\s+/);patch.lastName??=surname;patch.firstName??=given.join(' ')}
 if(patch.lastName||patch.firstName)patch.name=[patch.lastName,patch.firstName].filter(Boolean).join(' ');
 return {fields:filtered,patch:mergeDetails(current,patch)};
}
function decorateText(text,settings={}){const top=String(settings.txtHeaderArt||'').slice(0,12000),bottom=String(settings.txtFooterArt||'').slice(0,12000);return [top,text.replace(/\s+$/,''),bottom].filter(Boolean).join('\r\n\r\n')+'\r\n'}
function hydrateRecord(record){return {...record,people:(record.people||[]).map(person=>{const stored={...person};delete stored.evidence;delete stored.customCategories;if(/^Person \d+$/.test(stored.name||''))delete stored.name;const details=prepare({evidence:(person.evidence||[]).map(e=>e.fields||{}),stored}).patch;return {...person,...details}})}}

const value=v=>typeof v==='object'?JSON.stringify(v):String(v??'');
const personLabels={name:'Full Name',dateOfBirth:'Date of Birth',taxCode:'Codice Fis.',phone:'Phone',altPhone:'Alt. Phone',address:'Address',postalCode:'CAP',shipping:'Shipping',lastName:'Last name',firstName:'First name',age:'Age',username:'Username',email:'Email',notes:'Person notes'};
const lineValue=v=>String(v??'').replace(/\r?\n/g,'\n    ');
function textReport(record,excluded,settings={}){
 const lines=[];const rule='-'.repeat(80);
 for(const original of record.people||[]){
  const p=clean(original,excluded);const detail=prepare({records:(p.evidence||[]).map(e=>e.fields||{})},excluded).patch;
  const name=String(p.name||detail.name||'Unnamed person').replace(/[\r\n]/g,' ');
  lines.push(rule,' '.repeat(Math.max(0,Math.floor((80-name.length)/2)))+name,rule,'');
  for(const [key,label] of Object.entries(personLabels)){
   const val=p[key]||detail[key]||'';
   if(String(val).trim())lines.push(label.padEnd(13)+' : '+lineValue(val));
  }
  for(const category of p.customCategories||[]){
   if(String(category.label||'').trim()&&String(category.value??'').trim())lines.push(String(category.label).trim().padEnd(13)+' : '+lineValue(category.value));
  }
  lines.push('');
 }
 if(!(record.people||[]).length){const title=String(record.title||'Investigation').replace(/[\r\n]/g,' ');lines.push(rule,title,rule,'')}
 if(String(record.summary||'').trim())lines.push('Summary       : '+lineValue(record.summary));
 if(String(record.notes||'').trim())lines.push('Notes         : '+lineValue(record.notes));
 return decorateText(lines.join('\r\n'),settings);
}
function parseFormatted(text,excluded){
 const record={title:'Imported investigation',summary:'',notes:'',people:[]};let person,evidence,lastKey,lastCategory;const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/);
 const labels=Object.fromEntries(Object.entries(personLabels).map(([key,label])=>[label,key]));let metadata=false;
 for(let i=0;i<lines.length;i++){
  const line=lines[i];
  if(line==='-'.repeat(80)&&lines[i+2]==='-'.repeat(80)){if(record.title==='Imported investigation')record.title=lines[i+1].trim();person={evidence:[]};record.people.push(person);i+=2;lastKey=null;lastCategory=null;metadata=false;continue}
  if(line==='[INVESTIGATION]'){metadata=true;person=null;evidence=null;continue}
  if(line==='[EVIDENCE]'&&person){evidence={fields:{}};person.evidence.push(evidence);lastKey=null;continue}
  if(line==='[/EVIDENCE]'){evidence=null;continue}
  const readable=line.match(/^(Summary|Notes)\s{2,}: (.*)$/);if(readable&&!evidence){metadata=true;lastKey=readable[1].toLowerCase();record[lastKey]=readable[2];continue}
  if(evidence){const m=line.match(/^Field ("(?:\\.|[^"\\])*"): (.*)$/);if(m)evidence.fields[JSON.parse(m[1])]=JSON.parse(m[2]);else{const m=line.match(/^(Source|Query): (.*)$/);if(m)evidence[m[1].toLowerCase()]=JSON.parse(m[2])}continue}
  if(metadata){if(line.startsWith('    ')&&lastKey){record[lastKey]+='\n'+line.slice(4);continue}const m=line.match(/^(Title|Summary|Notes): (.*)$/);if(m)record[m[1].toLowerCase()]=JSON.parse(m[2]);continue}
  if(person){if(line.startsWith('    ')&&lastKey){person[lastKey]+='\n'+line.slice(4);continue}if(line.startsWith('    ')&&lastCategory){lastCategory.value+='\n'+line.slice(4);continue}const m=line.match(/^([^:]+?)\s*: (.*)$/);if(m){lastKey=labels[m[1].trim()];lastCategory=null;if(lastKey){if(m[2])person[lastKey]=m[2]}else{lastCategory={id:require('node:crypto').randomUUID(),label:m[1].trim(),value:m[2]};(person.customCategories??=[]).push(lastCategory)}}}
 }
 record.people=record.people.filter(p=>Object.keys(p).some(k=>k!=='evidence'));
 for(const p of record.people)for(const e of p.evidence)e.fields=clean(e.fields,excluded);
 return {record};
}
function parseText(text,excluded){
 if(text.includes('-'.repeat(80))||text.startsWith('[INVESTIGATION]'))return parseFormatted(text,excluded);
 if(!text.replace(/^\uFEFF/,'').startsWith('H3X INVESTIGATION\n')&&!text.replace(/^\uFEFF/,'').startsWith('H3X INVESTIGATION\r\n')){
 const fields={};for(const line of text.split(/\r?\n/)){const match=line.match(/^\s*([^:=]+)\s*[:=]\s*(.+)$/);if(match)fields[match[1].trim()]=match[2].trim()}return {fields:clean(fields,excluded)};
 }
 const record={title:'Imported investigation',summary:'',notes:'',people:[]};let person,evidence;
 const labels={'Title':'title','Summary':'summary','Notes':'notes','Full name':'name','Last name':'lastName','First name':'firstName','Age':'age','Username':'username','Phone':'phone','Email':'email','Address':'address','Person notes':'notes'};
 for(const line of text.split(/\r?\n/)){if(line==='[PERSON]'){person={evidence:[]};record.people.push(person)}else if(line==='[/PERSON]')person=null;else if(line==='[EVIDENCE]'&&person){evidence={fields:{}};person.evidence.push(evidence)}else if(line==='[/EVIDENCE]')evidence=null;else if(line.startsWith('Field ')&&evidence){const m=line.match(/^Field ("(?:\\.|[^"\\])*"): (.*)$/);if(m)evidence.fields[JSON.parse(m[1])]=JSON.parse(m[2])}else{const m=line.match(/^([^:]+): (.*)$/);if(!m)continue;const v=JSON.parse(m[2]);if(evidence){if(m[1]==='Source')evidence.source=v;if(m[1]==='Query')evidence.query=v}else if(labels[m[1]])(person||record)[labels[m[1]]]=v}}
 for(const p of record.people)for(const e of p.evidence)e.fields=clean(e.fields,excluded);
 return {record};
}
module.exports={defaults,clean,prepare,mergeDetails,textReport,parseText,decorateText,hydrateRecord};
