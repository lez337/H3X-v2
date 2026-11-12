import {useState} from 'react';
import {ChevronRight,Folder,FileText,ShieldCheck,Download} from 'lucide-react';
import JSZip from 'jszip';

type Node={id:string;name:string;type:string;children?:Node[]};
function TreeNode({node:n,expanded,onExpand}:{node:Node;expanded:Set<string>;onExpand:(id:string)=>void}){
 const directory=n.type==='directory',open=expanded.has(n.id);
 return <li role="treeitem" aria-expanded={directory?open:undefined} aria-label={n.name}>
  {directory?<button className="stealer-tree-row" onClick={()=>onExpand(n.id)}><ChevronRight size={12} className={open?'tree-chevron open':'tree-chevron'}/><Folder size={14}/><span>{n.name}</span><small>{n.children?.length||0}</small></button>:<div className="stealer-tree-row tree-file"><FileText size={14}/><span>{n.name}</span></div>}
  {directory&&open&&(n.children?.length?<ul role="group" className="tree-children">{n.children.map(child=><TreeNode key={child.id} node={child} expanded={expanded} onExpand={onExpand}/>)}</ul>:<p className="tree-empty muted">Empty folder</p>)}
 </li>
}
function countNodes(n:Node):number{return 1+(n.children||[]).reduce((sum,child)=>sum+countNodes(child),0)}
export default function StealerTree({logId}:{logId?:string}){
 const [tree,setTree]=useState<Node|null>(null),[expanded,setExpanded]=useState<Set<string>>(new Set(['1'])),[error,setError]=useState(''),[busy,setBusy]=useState(false),[downloading,setDownloading]=useState(false),[downloadError,setDownloadError]=useState('');
 async function load(){
  if(!logId||busy)return;
  setError('');setBusy(true);
  try{const data=await window.h3x.stealerTree({logId});setTree(data.tree)}
catch{setError('Unable to load the file tree. Check your API key and log access, then retry.')}
   finally{setBusy(false)}
  }
  async function downloadArchive(){
   if(!tree||downloading)return;
   setDownloading(true);setDownloadError('');
   try{
    const zip=new JSZip();
    function add(n:Node,parent:string){
const path=parent+(n.type==='directory'?'folder-':'file-')+n.id;
      n.type==='directory'?zip.folder(path):zip.file(path+'.txt','\n');
      if(n.type==='directory')n.children?.forEach(child=>add(child,path+'/'))
    }
    add(tree,'');
    zip.file('README.txt','Redacted file structure only. Folder and file names are placeholders. Original paths, identifiers, metadata and file contents are not included.\n');
    const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE'});
    const url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download='file-tree.zip';document.body.appendChild(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
   }catch{setDownloadError('Unable to create the archive. Please retry.')}
   finally{setDownloading(false)}
  }
  function toggle(id:string){setExpanded(current=>{const next=new Set(current);next.has(id)?next.delete(id):next.add(id);return next})}
  function expandAll(){const ids=new Set<string>();function visit(n:Node){if(n.type==='directory')ids.add(n.id);n.children?.forEach(visit)}if(tree)visit(tree);setExpanded(ids)}
  return <details className="stealer-browser" onToggle={e=>{if(e.currentTarget.open&&!tree&&!busy&&!error)void load()}}>
   <summary><Folder size={15}/> File tree <ShieldCheck size={14}/><small>Redacted</small></summary>
   <p className="muted">Folder hierarchy with redacted names. File contents are not included.</p>
   {!logId&&<p className="muted">No file tree is available: this result has no log reference.</p>}
   {busy&&<p className="muted" role="status">Loading file structure...</p>}
   {error&&<div role="alert" className="muted">{error}<button disabled={busy} onClick={()=>void load()}>Retry</button></div>}
   {tree&&<><div className="stealer-tree-toolbar"><button onClick={expandAll}>Expand all</button><button onClick={()=>setExpanded(new Set())}>Collapse all</button><small className="muted">{countNodes(tree)} entries</small></div><div className="stealer-tree-scroll"><ul role="tree" aria-label="Redacted file tree"><TreeNode node={tree} expanded={expanded} onExpand={toggle}/></ul></div><button className="stealer-download" disabled={downloading} onClick={()=>void downloadArchive()}><Download size={14}/>{downloading?'Creating archive...':'Download tree archive'}</button></>}
   {downloadError&&<p className="muted" role="alert">{downloadError}</p>}
  </details>;
}
