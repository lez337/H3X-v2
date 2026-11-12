import {useEffect,useState} from 'react';

type Status={phase:string;message:string;version:string;progress:number;repository:string;enabled:boolean;supported:boolean};
export default function Updates({settings,saveWorkspace}:{settings:boolean;saveWorkspace:()=>Promise<unknown>}) {
 const [status,setStatus]=useState<Status>(),[repo,setRepo]=useState(''),[enabled,setEnabled]=useState(true),[error,setError]=useState(''),[working,setWorking]=useState(false),[dismissed,setDismissed]=useState(false);
 useEffect(()=>{
  let active=true,initialized=false;
  const refresh=()=>window.h3x.updateStatus().then(s=>{if(!active)return;setStatus(s);if(!initialized){setRepo(s.repository);setEnabled(s.enabled);initialized=true}}).catch(()=>{});
  refresh();const timer=setInterval(refresh,2000);return()=>{active=false;clearInterval(timer)};
 },[]);
 const busy=working||['checking','downloading'].includes(status?.phase||'');
 async function run(action:()=>Promise<any>){setWorking(true);setError('');try{const next=await action();if(next&&typeof next==='object')setStatus(next)}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setWorking(false)}}
 async function install(){await saveWorkspace();await window.h3x.installUpdate()}
 if(!settings)return status?.phase==='ready'&&!dismissed?<div className="notice" role="status"><span>{status.message}</span><button disabled={working} onClick={()=>run(install)}>Install &amp; close H3X</button><button onClick={()=>setDismissed(true)}>Later</button>{error&&<span role="alert">{error}</span>}</div>:null;
 return <section className="panel update-panel"><div className="eyebrow">APPLICATION UPDATES</div><h2>Keep H3X up to date</h2><p className="muted">Version {status?.version||'…'} · Checks on startup and every six hours. Downloads are verified before installation.</p><label>GITHUB RELEASE REPOSITORY<input placeholder="lez337/H3X-v2" value={repo} disabled={busy||status?.phase==='ready'} onChange={e=>setRepo(e.target.value)}/></label><label className="check"><input type="checkbox" checked={enabled} disabled={busy||status?.phase==='ready'} onChange={e=>setEnabled(e.target.checked)}/> Automatically check and download updates</label><div className="button-row"><button disabled={busy||status?.phase==='ready'||!status} onClick={()=>run(()=>window.h3x.configureUpdates({repository:repo,enabled}))}>Save update settings</button><button disabled={busy||!status?.repository||status.phase==='ready'} onClick={()=>run(()=>window.h3x.checkUpdates())}>Check for updates</button>{status?.phase==='ready'&&<button className="primary" disabled={working} onClick={()=>run(install)}>Install &amp; close H3X</button>}</div><p className="muted" role="status">{status?.message}{status?.phase==='downloading'?` ${status.progress}%`:''}</p>{status?.phase==='downloading'&&<progress max={100} value={status.progress} aria-label="Update download"/>}{error&&<p role="alert">{error}</p>}<small className="muted">Use a public repository. Installation closes H3X and leaves it closed. {status&&!status.supported?'Update installation is available in the installed Windows x64 app.':''}</small></section>;
}
