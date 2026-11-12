import {useEffect,useRef,useState,type PointerEvent} from 'react';
import {ArrowDownRight,ArrowRight,Bot,ChevronRight,Command,FileSearch,FolderOpen,MapPinned,Network,Plus,Search,ShieldCheck} from 'lucide-react';
import type {Case} from './Investigations';

type Place={id:string;name:string;lat:number;lng:number;note:string};
type Props={cases:Case[];pins:Place[];linkCount:number;botCount:number;ready:boolean;onNavigate:(page:string)=>void;onNewCase:()=>void;onOpenCase:(id:string)=>void;onOpenPin:(id:string)=>void;onSearch:(query:string)=>void};

function updatedLabel(value:string){
 const date=new Date(value);
 return Number.isNaN(date.getTime())?'Saved locally':date.toLocaleDateString(undefined,{month:'short',day:'numeric'});
}

export default function Dashboard({cases,pins,linkCount,botCount,ready,onNavigate,onNewCase,onOpenCase,onOpenPin,onSearch}:Props){
 const [query,setQuery]=useState(''),[tab,setTab]=useState<'cases'|'places'>('cases');
 const frame=useRef<number|undefined>(undefined);
 useEffect(()=>()=>{if(frame.current!==undefined)cancelAnimationFrame(frame.current)},[]);
 const recent=[...cases].sort((a,b)=>(Date.parse(b.updatedAt)||0)-(Date.parse(a.updatedAt)||0)).slice(0,4);
 function reflect(event:PointerEvent<HTMLDivElement>){
  if(event.pointerType==='touch'||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const surface=(event.target as HTMLElement).closest<HTMLElement>('.liquid-glass');
  if(!surface)return;
  const {clientX,clientY}=event;
  if(frame.current!==undefined)cancelAnimationFrame(frame.current);
  frame.current=requestAnimationFrame(()=>{
   const rect=surface.getBoundingClientRect();
   surface.style.setProperty('--reflection-x',`${clientX-rect.left}px`);
   surface.style.setProperty('--reflection-y',`${clientY-rect.top}px`);
  });
 }
 const stats=[{label:'Investigations',value:cases.length,Icon:FolderOpen,page:'cases',note:'Open your case files'},{label:'Saved places',value:pins.length,Icon:MapPinned,page:'map',note:'Explore the map'},{label:'Relationships',value:linkCount,Icon:Network,page:'graph',note:'View your link graph'},{label:'Telegram bots',value:botCount,Icon:Bot,page:'tools',note:'Manage integrations'}];
 return <div className="content dashboard liquid-dashboard" onPointerMove={reflect}>
  <section className="dashboard-hero liquid-glass" aria-labelledby="dashboard-title">
   <div className="dashboard-hero-copy">
    <div className="eyebrow"><span className="quiet-dot"/> YOUR LOCAL WORKSPACE</div>
    <h1 id="dashboard-title">A little clarity.<br/><span>In the dark.</span></h1>
    <p className="lead">Follow a lead. Connect the details.<br/>Keep everything in one quiet space.</p>
    <form className="dashboard-search" onSubmit={event=>{event.preventDefault();onSearch(query.trim())}}>
     <Search size={18} aria-hidden="true"/>
     <input aria-label="Start a search" placeholder="Start with a search…" value={query} onChange={event=>setQuery(event.target.value)}/>
     <button type="submit" aria-label="Open search" title="Open search"><ArrowRight size={18}/></button>
    </form>
    <div className="hero-footnote"><ShieldCheck size={12}/> Local workspace <span/> Searches run on your command</div>
   </div>
   <div className="liquid-sculpture" aria-hidden="true"><div className="sculpture-orbit orbit-one"/><div className="sculpture-orbit orbit-two"/><div className="liquid-orb"><div className="orb-core">H<span>3</span>X</div></div><div className="sculpture-caption"><span/> INTELLIGENCE, IN FOCUS</div></div>
   <div className="hero-corner" aria-hidden="true">01 / OVERVIEW</div>
  </section>

  <div className="dashboard-section-label"><span>WORKSPACE AT A GLANCE</span><span>{ready?'SAVED LOCALLY':'LOADING WORKSPACE'}</span></div>
  <div className="dashboard-stats">{stats.map(({label,value,Icon,page,note},index)=><button className="dashboard-stat liquid-glass" key={page} onClick={()=>onNavigate(page)} aria-label={`${label}: ${ready?value:'loading'}. ${note}`}><div className="stat-heading"><Icon size={17}/><ArrowDownRight size={15}/></div><div className="stat-value">{ready?String(value).padStart(2,'0'):'—'}<span>0{index+1}</span></div><div className="stat-caption"><span>{label}</span><ChevronRight size={13}/></div></button>)}</div>

  <div className="dashboard-lower">
   <section className="dashboard-launchpad" aria-labelledby="launchpad-title"><div className="dashboard-panel-heading"><div><div className="eyebrow">MAKE YOUR NEXT MOVE</div><h2 id="launchpad-title">Pick up a thread.</h2></div><Command size={17}/></div>
    <div className="dashboard-actions">
     <button className="dashboard-action liquid-glass" onClick={()=>onNavigate('search')}><span className="action-icon"><Search size={19}/></span><span><b>Search sources</b><small>One query. Your selected providers.</small></span><ArrowRight size={17}/></button>
     <button className="dashboard-action liquid-glass" onClick={onNewCase}><span className="action-icon"><Plus size={19}/></span><span><b>New investigation</b><small>A fresh space for notes and evidence.</small></span><ArrowRight size={17}/></button>
     <button className="dashboard-action liquid-glass" onClick={()=>onNavigate('files')}><span className="action-icon"><FileSearch size={19}/></span><span><b>Inspect local files</b><small>Find details in selected TXT or ZIP files.</small></span><ArrowRight size={17}/></button>
    </div>
   </section>
   <section className="dashboard-recent liquid-glass" aria-labelledby="recent-title"><div className="dashboard-panel-heading"><div><div className="eyebrow">RIGHT WHERE YOU LEFT IT</div><h2 id="recent-title">Your workspace</h2></div><FolderOpen size={17}/></div>
    <div className="dashboard-tabs" role="tablist" aria-label="Saved workspace"><button id="dashboard-cases-tab" role="tab" aria-selected={tab==='cases'} aria-controls="dashboard-recent-panel" tabIndex={tab==='cases'?0:-1} onClick={()=>setTab('cases')} onKeyDown={e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?'cases':'places';setTab(next);document.getElementById(`dashboard-${next}-tab`)?.focus()}}}>Investigations <span>{cases.length}</span></button><button id="dashboard-places-tab" role="tab" aria-selected={tab==='places'} aria-controls="dashboard-recent-panel" tabIndex={tab==='places'?0:-1} onClick={()=>setTab('places')} onKeyDown={e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='End'?'places':'cases';setTab(next);document.getElementById(`dashboard-${next}-tab`)?.focus()}}}>Places <span>{pins.length}</span></button></div>
    <div id="dashboard-recent-panel" className="dashboard-recent-list" role="tabpanel" tabIndex={0} aria-labelledby={`dashboard-${tab}-tab`}>
     {!ready?<div className="dashboard-empty"><span className="action-icon"><FolderOpen size={20}/></span><b>Opening your workspace…</b></div>:tab==='cases'?recent.length?recent.map(item=><button className="dashboard-recent-row" key={item.id} onClick={()=>onOpenCase(item.id)}><span className="recent-file-icon"><FolderOpen size={16}/></span><span><b>{item.title||'Untitled investigation'}</b><small>{item.people?.length||0} person folders <span>·</span> {updatedLabel(item.updatedAt)}</small></span><ChevronRight size={15}/></button>):<div className="dashboard-empty"><span className="action-icon"><FolderOpen size={20}/></span><b>Your next lead starts here.</b><p>Create an investigation to keep your findings together.</p><button onClick={onNewCase}>Create your first case <ArrowRight size={14}/></button></div>:pins.length?pins.slice(0,4).map(pin=><button className="dashboard-recent-row" key={pin.id} onClick={()=>onOpenPin(pin.id)}><span className="recent-file-icon"><MapPinned size={16}/></span><span><b>{pin.name||'Saved location'}</b><small>{pin.lat.toFixed(3)}, {pin.lng.toFixed(3)}</small></span><ChevronRight size={15}/></button>):<div className="dashboard-empty"><span className="action-icon"><MapPinned size={20}/></span><b>A place for every lead.</b><p>Places you save on the map will appear here.</p><button onClick={()=>onNavigate('map')}>Explore your map <ArrowRight size={14}/></button></div>}
    </div>
    <button className="dashboard-view-all" onClick={()=>onNavigate(tab==='cases'?'cases':'map')}>View {tab==='cases'?'all investigations':'map'}<ArrowRight size={14}/></button>
   </section>
  </div>
  <footer className="dashboard-footer"><span><span className="quiet-dot"/> {ready?'Your space. Your pace.':'Loading your workspace…'}</span><span>H3X <span>/</span> SEARCHER</span></footer>
 </div>;
}
