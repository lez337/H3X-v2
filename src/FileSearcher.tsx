import {useEffect,useMemo,useState} from 'react';
import {Search,ScanSearch,ShieldCheck,Download,Square,FolderOpen,Copy,ChevronLeft,ChevronRight,Check,FileSearch} from 'lucide-react';
import './file-search.css';

const fields=[['email','Email'],['phone','Phone'],['username','Username'],['name','Full name'],['firstName','First name'],['lastName','Last name'],['discord','Discord ID'],['url','URL'],['ipv4','IPv4'],['ipv6','IPv6'],['domain','Domain'],['dateOfBirth','Birth date'],['age','Age'],['address','Address'],['city','City'],['country','Country'],['postalCode','Postal code'],['organization','Organization'],['mac','MAC address']];
const defaults=['email','phone','username','name','firstName','lastName','dateOfBirth','age','address','city','country','postalCode'];
const labels=Object.fromEntries(fields);
const message=(error:unknown)=>error instanceof Error?error.message:String(error);
const size=(bytes:number)=>bytes<1024*1024?`${(bytes/1024).toFixed(1)} KB`:`${(bytes/1024/1024).toFixed(1)} MB`;
export type FileSource={file:string;line:number;column:number;path:string};
export type FileHit=FileSource&{kind:string;value:string;confidence:number;reason:string;occurrences:number;sources:FileSource[]};
export type ScanResult={file:string;hits:FileHit[];count:number;truncated:boolean;warnings:{file:string;message:string}[];filesScanned:number;filesSkipped:number;bytesScanned:number;encodings:string[];durationMs:number;canceled?:boolean};
export type ScanProgress={phase:string;file:string;filesScanned:number;matches:number};

export default function FileSearcher({onError,onSave}:{onError:(message:string)=>void;onSave:(item:any)=>void}){
 const [kinds,setKinds]=useState(defaults),[minimum,setMinimum]=useState(70),[query,setQuery]=useState(''),[limit,setLimit]=useState(1000);
 const [busy,setBusy]=useState(false),[canceling,setCanceling]=useState(false),[progress,setProgress]=useState<ScanProgress|null>(null),[result,setResult]=useState<ScanResult|null>(null);
 const [status,setStatus]=useState(''),[filter,setFilter]=useState(''),[kindFilter,setKindFilter]=useState('all'),[sort,setSort]=useState('source'),[page,setPage]=useState(0),[selected,setSelected]=useState<Set<number>>(new Set()),[copied,setCopied]=useState<number|null>(null);
 useEffect(()=>window.h3x.onFileProgress(setProgress),[]);
 useEffect(()=>{if(copied===null)return;const timer=setTimeout(()=>setCopied(null),1500);return()=>clearTimeout(timer)},[copied]);
 const rows=useMemo(()=>{
  const term=filter.trim().toLocaleLowerCase();const items=(result?.hits||[]).map((hit,index)=>({hit,index})).filter(({hit})=>(kindFilter==='all'||hit.kind===kindFilter)&&(!term||[hit.value,hit.file,hit.path].some(value=>value.toLocaleLowerCase().includes(term))));
  if(sort==='confidence')items.sort((a,b)=>b.hit.confidence-a.hit.confidence||a.index-b.index);
  if(sort==='value')items.sort((a,b)=>a.hit.value.localeCompare(b.hit.value));
  return items;
 },[result,filter,kindFilter,sort]);
 const pages=Math.max(1,Math.ceil(rows.length/50)),currentPage=Math.min(page,pages-1),visible=rows.slice(currentPage*50,(currentPage+1)*50);
 useEffect(()=>setPage(0),[filter,kindFilter,sort,result]);
 async function scan(){
  if(busy||!kinds.length)return;setBusy(true);setCanceling(false);setProgress(null);setStatus('Choose one or more files.');
  try{const data=await window.h3x.scanFile({query,kinds,minConfidence:minimum,limit});if(!data){setStatus('File selection canceled.');return}if(data.canceled){setStatus('Scan canceled. Previous results are still available.');return}setResult(data);setSelected(new Set());setFilter('');setKindFilter('all');setStatus('Scan complete.');}
  catch(error){setStatus('Scan failed. Previous results are still available.');onError(message(error))}
  finally{setBusy(false);setCanceling(false);setProgress(null)}
 }
 async function cancel(){setCanceling(true);try{await window.h3x.cancelFileScan()}catch(error){onError(message(error));setCanceling(false)}}
 function toggle(index:number){setSelected(value=>{const next=new Set(value);next.has(index)?next.delete(index):next.add(index);return next})}
 async function exportResults(){
  if(!result)return;const hits=selected.size?result.hits.filter((_,index)=>selected.has(index)):rows.map(row=>row.hit);
  try{const saved=await window.h3x.exportSearch({items:hits.map(hit=>({source:`Local file · ${labels[hit.kind]||hit.kind}`,fields:{[hit.kind]:hit.value,file:hit.file,line:hit.line,column:hit.column,field_path:hit.path,confidence:hit.confidence+'% (heuristic)',reason:hit.reason,occurrences:hit.occurrences,source_locations:hit.sources.map(source=>`${source.file}:${source.line}:${source.column}`).join('; ')}}))});if(saved)setStatus(`Exported ${hits.length} matches.`)}catch(error){onError(message(error))}
 }
 return <div className="content file-search-page">
  <div className="eyebrow">LOCAL FILE INSPECTION</div><div className="file-page-heading"><div><h1>Find the signal.</h1><p className="muted">Inspect text and structured files with a source for every match.</p></div><span className="file-local-badge"><ShieldCheck size={14}/> Processed on this computer</span></div>
  <section className="file-scan-panel liquid-glass">
   <div className="file-scan-title"><span className="file-scan-icon"><ScanSearch size={24}/></span><div><h2>File searcher</h2><p>TXT, LOG, CSV, TSV, JSON, JSONL, NDJSON and ZIP · Select up to 50 files</p></div></div>
   <div className="file-scan-input"><Search size={18}/><input aria-label="Term to find in file matches" maxLength={200} placeholder="Optional text to find within extracted values" value={query} disabled={busy} onChange={event=>setQuery(event.target.value)} onKeyDown={event=>event.key==='Enter'&&scan()}/><button className="primary" disabled={busy||!kinds.length} onClick={scan}><FileSearch size={16}/>{busy?'Scanning…':'Choose files & scan'}</button></div>
<details className="file-detection-options"><summary>Detection settings <span>{kinds.length} fields · {minimum}% minimum score · {limit.toLocaleString()} match limit</span></summary>
     <div className="file-preset-row"><span>Detect</span><button disabled={busy} onClick={()=>setKinds(defaults)}>Person details</button><button disabled={busy} onClick={()=>setKinds(fields.map(([kind])=>kind))}>All fields</button><button disabled={busy} onClick={()=>setKinds([])}>Clear</button></div>
     <fieldset disabled={busy} className="file-field-grid"><legend className="sr-only">Fields to extract</legend>{fields.map(([kind,label])=><label key={kind}><input type="checkbox" checked={kinds.includes(kind)} onChange={event=>setKinds(value=>event.target.checked?[...value,kind]:value.filter(item=>item!==kind))}/>{label}</label>)}</fieldset>
     <div className="file-detection-bottom"><label>Minimum score <b>{minimum}%</b><input aria-label="Minimum detection score" disabled={busy} type="range" min={0} max={100} step={5} value={minimum} onChange={event=>setMinimum(Number(event.target.value))}/></label><label>Match limit<select disabled={busy} value={limit} onChange={event=>setLimit(Number(event.target.value))}>{[300,1000,3000].map(value=><option key={value} value={value}>{value.toLocaleString()}</option>)}</select></label></div>
     <p className="file-settings-note">Scores describe pattern strength, not the probability that a detail belongs to someone. Changes apply to the next scan.</p>
    </details>
    <div className="file-scan-foot"><span>100 MB per file · 200 MB per batch</span></div>
   </section>
  <div className="file-scan-status" role="status" aria-live="polite">{busy?<><span className="file-pulse"/><span>{progress?<><b>{progress.file}</b><small>{progress.filesScanned||0} files scanned · {progress.matches||0} distinct matches</small></>:status}</span><button disabled={canceling} onClick={cancel}><Square size={12}/>{canceling?'Stopping…':'Cancel scan'}</button></>:status}</div>
  {result?<>
   <div className="file-stat-row"><div><strong>{result.count.toLocaleString()}</strong><span>distinct matches</span></div><div><strong>{result.filesScanned}</strong><span>files scanned</span></div><div><strong>{size(result.bytesScanned)}</strong><span>{result.encodings.join(' / ')||'no text decoded'}</span></div><div><strong>{(result.durationMs/1000).toFixed(1)}s</strong><span>scan time</span></div></div>
   {!!result.warnings.length&&<details className="file-scan-warnings" open={result.truncated||result.filesScanned===0}><summary>{result.truncated?'Match limit reached · ':''}{result.warnings.length} scan notices{result.filesSkipped?` · ${result.filesSkipped} files skipped`:''}</summary><ul>{result.warnings.map((warning,index)=><li key={index}><b>{warning.file}</b> — {warning.message}</li>)}</ul></details>}
   <div className="file-result-heading"><div><h2>{result.file}</h2><p>{rows.length} of {result.count} matches{selected.size?` · ${selected.size} selected`:''}</p></div><button disabled={!selected.size&&!rows.length} onClick={exportResults}><Download size={15}/>Export {selected.size?`${selected.size} selected`:'filtered results'}</button></div>
   <div className="file-result-filters"><label><Search size={15}/><input aria-label="Filter scanned results" placeholder="Filter values, files or field paths" value={filter} onChange={event=>setFilter(event.target.value)}/></label><select aria-label="Filter by detected field" value={kindFilter} onChange={event=>setKindFilter(event.target.value)}><option value="all">All detected fields</option>{fields.filter(([kind])=>result.hits.some(hit=>hit.kind===kind)).map(([kind,label])=><option key={kind} value={kind}>{label}</option>)}</select><select aria-label="Sort file matches" value={sort} onChange={event=>setSort(event.target.value)}><option value="source">Source order</option><option value="confidence">Highest score</option><option value="value">Value A–Z</option></select></div>
   {!!rows.length&&<div className="file-selection-toolbar"><label><input type="checkbox" aria-label="Select this page of matches" checked={visible.length>0&&visible.every(row=>selected.has(row.index))} onChange={event=>{const checked=event.target.checked;setSelected(value=>{const next=new Set(value);visible.forEach(row=>checked?next.add(row.index):next.delete(row.index));return next})}}/> Select page</label>{selected.size>0&&<button onClick={()=>setSelected(new Set())}>Clear selection</button>}<span>Repeated values are grouped within each file.</span></div>}
   <div className="file-match-list">{visible.map(({hit,index})=><article key={index} className={'file-match '+(selected.has(index)?'is-selected':'')}><input aria-label={`Select ${hit.value}`} type="checkbox" checked={selected.has(index)} onChange={()=>toggle(index)}/><div className="file-match-body"><div className="file-match-value"><span className="tag">{labels[hit.kind]||hit.kind}</span><b>{hit.value}</b><span className="confidence-score" title={hit.reason}>{hit.confidence}%</span>{hit.occurrences>1&&<small>×{hit.occurrences}</small>}</div><div className="file-match-source">{hit.file}<span>Line {hit.line} · Column {hit.column}</span></div><details><summary>Why this matched{hit.occurrences>1?' & source locations':''}</summary><p>{hit.reason}</p>{hit.path&&<code>{hit.path}</code>}{hit.occurrences>1&&<ul>{hit.sources.map((source,n)=><li key={n}>Line {source.line}, column {source.column}{source.path?` · ${source.path}`:''}</li>)}{hit.occurrences>hit.sources.length&&<li>Showing the first {hit.sources.length} of {hit.occurrences} occurrences.</li>}</ul>}</details></div><div className="file-match-actions"><button title="Copy value" aria-label={`Copy ${hit.value}`} onClick={async()=>{try{await window.h3x.clipboard(hit.value);setCopied(index)}catch(error){onError(message(error))}}}>{copied===index?<Check size={15}/>:<Copy size={15}/>}</button><button title="Save this match to a person" aria-label={`Save ${hit.value} to a person`} onClick={()=>onSave({source:'Local file',query:hit.file,fields:{[hit.kind]:hit.value,file:hit.file,line:hit.line,column:hit.column,confidence:hit.confidence,reason:hit.reason,occurrences:hit.occurrences,field_path:hit.path}})}><FolderOpen size={15}/></button></div></article>)}</div>
   {!rows.length&&<div className="file-empty"><FileSearch size={30}/><h3>{result.count?'No matches for this filter':'No matches found'}</h3><p>{result.count?'Try another value or detected field.':'Check the scan notices, choose more fields, or lower the minimum score and scan again.'}</p></div>}
   {pages>1&&<div className="file-pagination"><button aria-label="Previous matches" disabled={currentPage===0} onClick={()=>setPage(currentPage-1)}><ChevronLeft size={16}/>Previous</button><span>Page {currentPage+1} of {pages}</span><button aria-label="Next matches" disabled={currentPage>=pages-1} onClick={()=>setPage(currentPage+1)}>Next<ChevronRight size={16}/></button></div>}
  </>:!busy&&<div className="file-empty"><FileSearch size={32}/><h3>Every match, traceable.</h3><p>Choose files to extract labeled details, inspect their sources, and export the matches you need.</p><small>ZIP entries: up to 20 MB each, 100 MB expanded total. Nested archives are skipped.</small></div>}
 </div>;
}
