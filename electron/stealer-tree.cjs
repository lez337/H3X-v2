'use strict';
function redactTree(root){
  if(typeof root==='string'){try{root=JSON.parse(root)}catch{return null}}
  if(Array.isArray(root))root={type:'directory',children:root};
  let count=0;
  function visit(node,depth){
    if(!node||typeof node!=='object'||depth>24||count>=2000)return null;
    const id=String(++count);
    const directory=node.type==='directory'||node.type==='folder'||(node.type!=='file'&&Array.isArray(node.children));
    const result={id,name:`[redacted ${directory?'folder':'file'} ${id}]`,type:directory?'directory':'file'};
    if(directory){result.children=[];for(const child of Array.isArray(node.children)?node.children:[]){if(count>=2000)break;const entry=visit(child,depth+1);if(entry)result.children.push(entry)}}
    return result;
  }
  return visit(root,0);
}
function redactStealer(value,key=''){
  if(Array.isArray(value))return value.map(v=>redactStealer(v,key));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,redactStealer(v,k)]));
  return /^(?:username|user_name|domain|country|browser|os|indexed_at)$/i.test(key)?value:'[redacted]';
}
async function loadRedactedTree(logId,key){
  if(typeof logId!=='string'||!logId.trim()||logId.length>512)throw Error('No stealer log is available for this record.');
  if(!key)throw Error('Add your OathNet API key in Settings.');
  const response=await fetch('https://oathnet.org/api/service/v2/victims/'+encodeURIComponent(logId),{headers:{'x-api-key':key},signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error('File tree request failed (HTTP '+response.status+').');
  const data=await response.json();
  const tree=redactTree(data.victim_tree??data.data?.victim_tree);
  if(!tree)throw Error('The provider did not return a file tree.');
  return {tree};
}
module.exports={redactTree,redactStealer,loadRedactedTree};
