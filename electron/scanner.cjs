'use strict';
const {isIP}=require('node:net');
const kindsList=['email','phone','username','name','firstName','lastName','discord','url','ipv4','ipv6','domain','dateOfBirth','age','address','city','country','postalCode','organization','mac'];
const keyName=value=>String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/([a-z])([A-Z])/g,'$1_$2').toLowerCase().replace(/[\s.-]+/g,'_');
const aliases={
 email:['email','email_address','mail','e_mail'],phone:['phone','phone_number','telephone','mobile','tel','cell_phone','numero_telephone','telefono'],
 username:['username','user_name','nom_utilisateur','login','screen_name','handle'],name:['name','full_name','fullname','display_name','nom_complet'],
 firstName:['first_name','firstname','given_name','prenom'],lastName:['last_name','lastname','surname','family_name','nom','nom_famille'],
 discord:['discord','discord_id'],dateOfBirth:['date_of_birth','date_birth','birth_date','birthdate','dob','date_naissance'],age:['age','eta','years_old'],
 address:['address','address_street','street_address','home_address','adresse','indirizzo'],city:['city','ville','town'],country:['country','country_code','pays'],
 postalCode:['postal_code','postcode','zip','zip_code','code_postal','cap'],organization:['organization','organisation','company','societe']
};
const labels=new Map(Object.entries(aliases).flatMap(([kind,names])=>names.map(name=>[keyName(name),kind])));
const fieldKind=key=>labels.get(keyName(key).replace(/_?\d+$/,''));
const textLabelPattern=[...new Set([...labels.keys()].flatMap(key=>[key,key.replace(/_/g,'')]))].sort((a,b)=>b.length-a.length).map(key=>key.split('_').join('[ _.-]?')).join('|');
const textFieldRegex=new RegExp('(?:^|[\\s,;{])"?('+textLabelPattern+'|[a-z_]*(?:password|token|cookie|secret|session|authorization)[a-z_]*)\\d*"?\\s*[:=]\\s*','giu');
const sensitive=key=>/(?:^|_)(?:cookies?|sessions?|tokens?|passwords?|passwd|authorization|auth|bearer|jwt|csrf|xsrf|secrets?|credentials?|local_?storage|api_?key|private_?key|access_?key|refresh_?key)(?:_|$)/i.test(keyName(key));
const ignoredKey=key=>/(?:^|_)(?:id|uuid|guid|timestamp|created|updated|expires?|expiry|expiration|hash|checksum|nonce)(?:_|$)/.test(keyName(key));
const placeholder=value=>/^(?:null|none|undefined|unknown|n\/?a|not (?:available|provided|set)|redacted|\[redacted\]|\*+|-+)$/i.test(value);
function randomToken(value){return /^(?:[a-f\d]{16,}|[a-z\d]{8}(?:-[a-z\d]{4}){3}-[a-z\d]{12}|eyJ[\w-]+\.)$/i.test(value)||(value.length>=24&&new Set(value.toLowerCase()).size>=13)||(value.length>=14&&/[a-z]/.test(value)&&/[A-Z]/.test(value)&&(value.match(/\d/g)||[]).length>=3)}
function naturalName(value,single=false){
 if(value.length>100||!new RegExp(single?"^[\\p{L}][\\p{L}\\p{M}'’ -]{0,59}$":"^[\\p{L}][\\p{L}\\p{M}'’-]*(?:[ \\t]+[\\p{L}][\\p{L}\\p{M}'’-]*){1,7}$",'u').test(value))return false;
 return !value.split(/\s+/).some(word=>word.length>30||randomToken(word)||(/[a-z]/.test(word)&&(word.match(/[A-Z]/g)||[]).length>2));
}
function lineIndex(text){
 const starts=[0];for(let i=0;i<text.length;i++)if(text[i]==='\n')starts.push(i+1);
 return offset=>{let lo=0,hi=starts.length;while(lo+1<hi){const mid=(lo+hi)>>>1;if(starts[mid]<=offset)lo=mid;else hi=mid}return {line:lo+1,column:offset-starts[lo]+1}};
}
function* lines(text){let start=0;for(let i=0;i<=text.length;i++)if(i===text.length||text[i]==='\n'){yield {text:text.slice(start,i).replace(/\r$/,''),offset:start};start=i+1}}
// Tokenize in source order, retaining real positions and parent context without evaluating input.
function* jsonSegments(text,base=0){
 let pos=0;const ws=()=>{while(pos<text.length&&/\s/.test(text[pos]))pos++};
 function string(){const start=pos++;while(pos<text.length){const c=text[pos++];if(c==='\\'){pos++;continue}if(c==='"'){const raw=text.slice(start,pos);return {value:JSON.parse(raw),offset:base+start+1,raw:raw.slice(1,-1)}}}throw Error('Unterminated JSON string')}
 function* value(path,blocked=false,depth=0){
  if(depth>64)throw Error('JSON nesting exceeds 64 levels');ws();const c=text[pos];
  if(c==='{'){
   // Recognize a browser cookie record even when the enclosing file has a neutral name.
   const look=text.slice(pos,pos+4096);blocked||=/^\{[^{}]*"(?:domain|host)"\s*:/.test(look)&&/^\{[^{}]*"(?:httpOnly|http_only|expirationDate|sameSite)"\s*:/.test(look);
   pos++;ws();if(text[pos]==='}'){pos++;return}
   while(pos<text.length){if(text[pos]!=='"')throw Error('Expected a JSON key');const key=string().value;ws();if(text[pos++]!==':')throw Error('Expected a JSON colon');yield* value([...path,key],blocked||sensitive(key)||ignoredKey(key)&&!fieldKind(key),depth+1);ws();const next=text[pos++];if(next==='}')return;if(next!==',')throw Error('Expected a JSON comma');ws()}throw Error('Unterminated JSON object');
  }
  if(c==='['){pos++;ws();if(text[pos]===']'){pos++;return}let index=0;while(pos<text.length){yield* value([...path,index++],blocked,depth+1);ws();const next=text[pos++];if(next===']')return;if(next!==',')throw Error('Expected a JSON comma')}throw Error('Unterminated JSON array')}
  let token;if(c==='"')token=string();else{const start=pos;while(pos<text.length&&!/[\s,}\]]/.test(text[pos]))pos++;if(pos===start)throw Error('Invalid JSON value');const raw=text.slice(start,pos),parsed=JSON.parse(raw);token={value:parsed==null?'':String(parsed),offset:base+start,raw}}
  const key=[...path].reverse().find(part=>typeof part==='string')||'';
  if(!blocked&&(!ignoredKey(key)||fieldKind(key))&&token.value!=='')yield {...token,key,path:'$'+path.map(part=>typeof part==='number'?`[${part}]`:`[${JSON.stringify(part)}]`).join('')};
 }
 yield* value([]);ws();if(pos!==text.length)throw Error('Trailing content after JSON');
}
function* csvRows(text,delimiter){
 let row=[],value='',offset=0,quoted=false,afterQuote=false,map=[];
 for(let i=0;i<=text.length;i++){
  const c=text[i];
  if(quoted){if(c===undefined)throw Error('Unterminated quoted CSV cell');if(c==='"'){if(text[i+1]==='"'){map.push(i);value+='"';i++}else{quoted=false;afterQuote=true}}else{map.push(i);value+=c}continue}
  if(c==='"'&&!value&&!afterQuote){quoted=true;offset=i+1;continue}
  if(c===delimiter||c==='\n'||c===undefined){row.push({value:value.replace(/\r$/,''),offset,map});value='';map=[];afterQuote=false;offset=i+1;if(c!==delimiter){if(row.some(cell=>cell.value.trim()))yield row;row=[]}continue}
  if(afterQuote&&c!=='\r'&&c!==' '&&c!=='\t')throw Error('Unexpected text after CSV quote');map.push(i);value+=c;
 }
}
function csvDelimiter(text){
 const end=text.indexOf('\n');if((end<0?text.length:end)>65536)throw Error('Delimited header exceeds 64 KB');
 const sample=text.slice(0,end<0?text.length:end);
 return [',',';','\t','|'].map(delimiter=>({delimiter,cells:[...csvRows(sample,delimiter)][0]||[]})).sort((a,b)=>b.cells.length-a.cells.length)[0];
}
function* textSegments(text){
 let blockedBlock=false;
 for(const line of lines(text)){
  const source=line.text.trim();if(!source){blockedBlock=false;continue}
  if(/^(?:\[|<)(?:cookies?|sessions?|tokens?|credentials?|local.?storage)/i.test(source)){blockedBlock=true;continue}
  if(/^\[[^\]]+\]$/.test(source))blockedBlock=false;
  const prefix=source.split(/[:=]/,1)[0];
  if(blockedBlock||sensitive(prefix)||ignoredKey(prefix)&&!fieldKind(prefix)||/^(?:#HttpOnly_|[^\t]+\t(?:TRUE|FALSE)\t[^\t]*\t(?:TRUE|FALSE)\t\d+\t)/i.test(source))continue;
  if(/[{}]/.test(source)&&/"(?:cookies?|sessions?|tokens?|passwords?|authorization)"\s*:/i.test(source))continue;
  const fields=[...line.text.matchAll(textFieldRegex)];
  if(!fields.length){yield {value:line.text,offset:line.offset,key:'',path:''};continue}
  for(let i=0;i<fields.length;i++){
   const m=fields[i],key=m[1].trim();if(sensitive(key)||ignoredKey(key)&&!fieldKind(key))continue;
   const start=m.index+m[0].length,end=i+1<fields.length?fields[i+1].index:line.text.length;
   let value=line.text.slice(start,end).trimEnd(),offset=line.offset+start;
   if(value.startsWith('"')||value.startsWith("'")){const quote=value[0];value=value.slice(1);offset++;const endQuote=value.lastIndexOf(quote);if(endQuote>=0)value=value.slice(0,endQuote)}
   value=value.replace(/[,;}]+\s*$/,'').trimEnd();yield {value,offset,key,path:key};
  }
 }
}
function* segments(text,filename,warnings){
 const ext=filename.split('.').pop().toLowerCase(),trimmed=text.trimStart();
 if(['jsonl','ndjson'].includes(ext)){
  let bad=0;for(const line of lines(text)){if(!line.text.trim())continue;try{JSON.parse(line.text);yield* jsonSegments(line.text,line.offset)}catch{bad++}}if(bad)warnings.push(`${bad} malformed JSON lines were skipped.`);return;
 }
 if(ext==='json'||trimmed.startsWith('{')||trimmed.startsWith('[')&&!/^\[[A-Za-z _-]+\]/.test(trimmed)){
  try{yield* jsonSegments(text)}catch(e){warnings.push(`JSON could not be fully parsed (${e.message}); results may be incomplete.`)}return;
 }
 if(['csv','tsv'].includes(ext)){
  try{const {delimiter,cells}=csvDelimiter(text);if(cells.length<2){warnings.push('No delimited header found; scanned as labeled text.');yield* textSegments(text);return}
   let header;for(const row of csvRows(text,ext==='tsv'?'\t':delimiter)){
    if(!header){header=row.map(cell=>cell.value.trim());const keys=header.map(keyName);if(keys.includes('name')&&keys.includes('value')&&keys.some(key=>['domain','host','host_key'].includes(key))){warnings.push('Browser cookie table excluded.');return}continue}
    if(row.length!==header.length){if(warnings.length<10)warnings.push('A row with a different cell count than the header was skipped.');continue}
    for(let i=0;i<row.length;i++){const key=header[i]||'';if(!sensitive(key)&&(!ignoredKey(key)||fieldKind(key)))yield {...row[i],key,path:key}}
   }
  }catch(e){warnings.push(`Delimited text could not be fully parsed (${e.message}).`)}return;
 }
 yield* textSegments(text);
}
function birthDate(value){
 let m=value.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/),y,month,d;
 if(m)[,y,month,d]=m;else{m=value.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);if(!m)return '';[,d,month,y]=m}
 const date=new Date(Date.UTC(+y,+month-1,+d));if(+y<1850||date>Date.now()||date.getUTCFullYear()!==+y||date.getUTCMonth()!==+month-1||date.getUTCDate()!==+d)return '';
 return `${y}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}
function labeledValue(kind,value){
 if(placeholder(value)||kind!=='discord'&&randomToken(value)||value.length>180)return null;
 if(['name','firstName','lastName'].includes(kind))return naturalName(value,kind!=='name')?{value,confidence:kind==='name'?87:82,reason:'Explicit name field and plausible word structure; identity unverified'}:null;
 if(kind==='username')return /^[\p{L}\p{N}_.-]{2,40}$/u.test(value)&&/\p{L}/u.test(value)&&!randomToken(value)?{value,confidence:86,reason:'Explicit username field; token-like values excluded'}:null;
 if(kind==='dateOfBirth'){const date=birthDate(value);return date?{value:date,confidence:96,reason:'Explicit birth-date field and valid calendar date; day-first for non-ISO dates'}:null}
 if(kind==='age')return /^\d{1,3}(?:\s*(?:years?(?: old)?|ans?|anni))?$/i.test(value)&&parseInt(value)<=125?{value:String(parseInt(value)),confidence:85,reason:'Explicit age field and plausible range'}:null;
 if(kind==='discord')return /^\d{17,20}$/.test(value)?{value,confidence:85,reason:'Discord field and plausible ID length; account unverified'}:null;
 if(kind==='postalCode')return /^(?=.*\d)[A-Z\d][A-Z\d -]{1,11}$/i.test(value)?{value,confidence:85,reason:'Explicit postal-code field and plausible syntax; location unverified'}:null;
 if(['city','country'].includes(kind)&&!naturalName(value,true))return null;
 if(kind==='address'&&!/\p{L}/u.test(value))return null;
 if(['address','city','country','organization'].includes(kind))return {value,confidence:85,reason:'Explicit field label; value has not been independently verified'};
 return null;
}
const genericRules={
 email:/(?<![\w.+%-])[A-Z\d._%+-]+@[A-Z\d](?:[A-Z\d.-]*[A-Z\d])?\.[A-Z]{2,63}(?![\w.-])/gi,
 phone:/(?<![\w.])\+?\d(?:[\d ().-]{4,35}\d)(?![\w.])/g,
 url:/https?:\/\/[^\s<>"'\\]+/gi,ipv4:/(?<![\w.])(?:\d{1,3}\.){3}\d{1,3}(?![\w.])/g,
 ipv6:/(?<![\w:])(?:[a-f\d]{0,4}:){2,7}[a-f\d]{0,4}(?:%[\w]+)?(?![\w:])/gi,
 domain:/(?<![\w@/.-])(?:[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?\.)+[a-z]{2,63}(?![\w.-])/gi,
 mac:/(?<![\w:.-])(?:[a-f\d]{2}[:-]){5}[a-f\d]{2}(?![\w:.-])/gi
};
function genericValue(kind,raw,labeled){
 if(raw.length>2048)return null;
 if(kind==='email'){const [local,host]=raw.split('@');if(local.length>64||raw.length>254||local.includes('..')||local.startsWith('.')||local.endsWith('.')||host.split('.').some(s=>!s||s.startsWith('-')||s.endsWith('-')||s.length>63))return null;return {value:raw,confidence:97,reason:'Email syntax; deliverability and ownership unverified'}}
 if(kind==='phone'){const digits=raw.replace(/\D/g,'');if(digits.length<7||digits.length>15||/^([\d])\1+$/.test(digits)||isIP(raw)||/^\d{4}[-.]\d{1,2}[-.]\d{1,2}$/.test(raw)||/^\d{1,2}[-.]\d{1,2}[-.]\d{4}$/.test(raw)||!labeled&&!raw.startsWith('+'))return null;return {value:raw,confidence:labeled?95:78,reason:labeled?'Explicit phone field and plausible length; number unverified':'International prefix and plausible length; number unverified'}}
 if(kind==='ipv4'||kind==='ipv6'){if(isIP(raw)!==(kind==='ipv4'?4:6))return null;return {value:raw,confidence:98,reason:'Valid IP address syntax; attribution unverified'}}
 if(kind==='url'){let value=raw.replace(/[.,;!?)\]}]+$/,'');try{const url=new URL(value);if(!url.hostname||url.username||url.password)return null;let redacted=false;for(const key of [...url.searchParams.keys()])if(sensitive(key)){url.searchParams.delete(key);redacted=true}if(url.hash&&/(?:token|secret|password|eyJ)/i.test(url.hash)){url.hash='';redacted=true}if(url.pathname.split('/').some(randomToken))return null;if(redacted)value=url.href;return {value,confidence:97,reason:redacted?'HTTP URL syntax; credential query parameters removed':'HTTP URL syntax; destination unverified'}}catch{return null}}
 if(kind==='domain'){if(raw.length>253||/\.(?:txt|log|csv|tsv|json|jsonl|ndjson|zip|exe|dll|jpg|png|pdf|docx|xlsx|cjs|js|css)$/i.test(raw))return null;return {value:raw,confidence:75,reason:'Domain syntax; registration and ownership unverified'}}
 return {value:raw.toLowerCase(),confidence:98,reason:'MAC address syntax; device unverified'};
}
function sourceOffset(segment,index){
 if(segment.map)return segment.map[index]??segment.offset;
 if(segment.raw?.includes('\\')){let decoded=0;for(let raw=0;raw<segment.raw.length;raw++,decoded++){if(decoded===index)return segment.offset+raw;if(segment.raw[raw]==='\\')raw+=segment.raw[raw+1]==='u'?5:1}}
 return segment.offset+index;
}
function scanDetailed(text,filename,options={}){
 const limit=Math.max(0,Math.min(10000,Math.trunc(Number(options.limit??300))||0));
 const enabled=new Set(Array.isArray(options.kinds)?options.kinds.filter(k=>kindsList.includes(k)):kindsList);
 const needle=String(options.query||'').normalize('NFKC').toLocaleLowerCase().trim().slice(0,200),minimum=Math.max(0,Math.min(100,Number(options.minConfidence)||0));
 const hits=[],seen=new Map(),warnings=[],locate=lineIndex(text);let truncated=false;
 if(!limit||!enabled.size)return {hits,warnings,truncated};
 if(filename.split(/[\\/]/).some(part=>sensitive(part.replace(/\.[^.]+$/,''))))return {hits,warnings:['Credential or browser-storage file excluded.'],truncated};
 function add(kind,result,segment,index){
  if(!result||result.confidence<minimum||needle&&!result.value.normalize('NFKC').toLocaleLowerCase().includes(needle))return;
  const location={file:filename,...locate(sourceOffset(segment,index)),path:segment.path||''};
  const canonical=kind==='phone'?result.value.replace(/\D/g,''):result.value.normalize('NFKC').toLocaleLowerCase(),key=kind+':'+canonical;
  if(seen.has(key)){const hit=seen.get(key);hit.occurrences++;if(hit.sources.length<5)hit.sources.push(location);if(result.confidence>hit.confidence){hit.confidence=result.confidence;hit.reason=result.reason}return}
  if(hits.length>=limit){truncated=true;return}
  const hit={kind,...result,...location,occurrences:1,sources:[location]};hits.push(hit);seen.set(key,hit);
 }
 for(const segment of segments(text,filename,warnings)){
  const value=String(segment.value),explicit=fieldKind(segment.key),trimmed=value.trim(),leading=value.length-value.trimStart().length;
  if(!trimmed||placeholder(trimmed))continue;
  const urlRanges=[...value.matchAll(genericRules.url)].map(match=>[match.index,match.index+match[0].length]);
  if(explicit&&enabled.has(explicit))add(explicit,labeledValue(explicit,trimmed),segment,leading);
  for(const [kind,rx] of Object.entries(genericRules)){
   if(!enabled.has(kind))continue;
   if(explicit&&['phone','age','dateOfBirth','discord','postalCode','username'].includes(explicit)&&kind!==explicit)continue;
   for(const match of value.matchAll(rx)){
    if(kind!=='url'&&urlRanges.some(([start,end])=>match.index>=start&&match.index<end))continue;
    if(kind==='phone'&&(explicit&&explicit!=='phone'||/https?:\/\/\S*$|[\w.+%-]+@$/.test(value.slice(0,match.index))))continue;
    add(kind,genericValue(kind,match[0],explicit===kind),segment,match.index);
   }
  }
 }
 return {hits,warnings:[...new Set(warnings)].slice(0,10),truncated};
}
function scanText(text,filename,needle='',limit=300,kinds,minConfidence=0){return scanDetailed(text,filename,{query:needle,limit,kinds,minConfidence}).hits}
module.exports={scanText,scanDetailed,kindsList};
