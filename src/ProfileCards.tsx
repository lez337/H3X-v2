import {useState} from 'react';
import {Search,UserRound,History,ExternalLink,CalendarDays,MessageSquare,Gamepad2,FolderPlus} from 'lucide-react';

type Item={id:string;source:string;profileType?:string;fields:Record<string,any>};
type Props={items:Item[];showOath:boolean;showGoogle:boolean;onOpen:(url:string)=>void;onSave:(item:Item)=>void};
const platforms:Record<string,{name:string;title:string;subtitle:string}>={
 roblox:{name:'Roblox',title:'Roblox Profiles',subtitle:'OathNet · Roblox accounts'},
 discord:{name:'Discord',title:'Discord Profiles',subtitle:'OathNet · Discord accounts'},
 steam:{name:'Steam',title:'Steam Profiles',subtitle:'OathNet · Steam accounts'},
 xbox:{name:'Xbox',title:'Xbox Profiles',subtitle:'OathNet · Xbox accounts'},
 google:{name:'Google',title:'Google Accounts',subtitle:'GHunt · email lookups'}
};
function safeUrl(value:unknown){try{const url=new URL(String(value));return url.protocol==='https:'&&!url.username&&!url.password?url.href:undefined}catch{return undefined}}
function Avatar({url,name}:{url:unknown;name:string}){
 const [failed,setFailed]=useState(false);const image=safeUrl(url);
 return <div className="profile-avatar">{image&&!failed?<img src={image} referrerPolicy="no-referrer" alt={`${name} profile photo`} onError={()=>setFailed(true)}/>:<UserRound size={26}/>}</div>;
}
const display=(value:any):string=>value==null?'Unavailable':typeof value==='object'?JSON.stringify(value):String(value);
function date(value:any){if(!value)return 'Unavailable';const parsed=new Date(value);return Number.isNaN(parsed.getTime())?String(value):parsed.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}
function Details({values}:{values:[string,any][]}){return <dl className="profile-details">{values.filter(([,v])=>v!=null&&v!=='').map(([label,value])=><div key={label}><dt>{label}</dt><dd>{display(value)}</dd></div>)}</dl>}
function HistoryList({history}:{history:any}){
 const entries=Array.isArray(history)?history:history&&history!=='None'?String(history).split(/[,\n]/).map(s=>s.trim()).filter(Boolean):[];
 const names=entries.flatMap((entry:any)=>typeof entry==='object'&&entry?Array.isArray(entry.name)?entry.name.map((name:string,i:number)=>({name,time:Array.isArray(entry.time)?entry.time[i]:entry.time})):entry.name?[{name:entry.name,time:entry.time}]:[]:[{name:String(entry),time:null}]);
 return <section className="profile-section"><h4><History size={13}/>Username history<span>{names.length} previous {names.length===1?'name':'names'}</span></h4>{history==null?<p className="profile-empty">Unavailable</p>:names.length?<ul className="profile-history">{names.map((entry:any,i:number)=><li key={i}>{entry.name}{entry.time&&<small> · {date(entry.time)}</small>}</li>)}</ul>:<p className="profile-history">None</p>}</section>;
}
function GoogleReviews({fields:f,onOpen}:{fields:Item['fields'];onOpen:Props['onOpen']}){
 return <section className="profile-section"><h4><MessageSquare size={13}/>Google Maps reviews</h4><div className={'review-status '+(f.review_status==='Reviews found'?'has-reviews':'')}>{f.review_status||'Unavailable'}{f.review_count!=null&&f.review_status!=='Unavailable'&&<b>{f.review_count}</b>}</div>{f.review_status==='Unavailable'&&<p className="profile-empty">GHunt could not confirm public reviews.</p>}{Array.isArray(f.reviews)&&f.reviews.length>0&&<details><summary>Returned reviews ({f.reviews.length})</summary><div className="profile-review-list">{f.reviews.map((review:any,i:number)=><div key={i}><pre>{typeof review==='string'?review:JSON.stringify(review,null,2)}</pre></div>)}</div></details>}{safeUrl(f.maps_url)&&<button className="profile-link" onClick={()=>onOpen(f.maps_url)}><ExternalLink size={14}/>View Google Maps reviews</button>}</section>;
}
function Group({kind,items,onOpen,onSave}:{kind:string;items:Item[];onOpen:Props['onOpen'];onSave:Props['onSave']}){
 const [filter,setFilter]=useState('');const google=kind==='google';const Icon=google||kind==='discord'?UserRound:Gamepad2;const platform=platforms[kind];
 const visible=items.filter(item=>JSON.stringify(item.fields).toLowerCase().includes(filter.toLowerCase()));
 return <details className={`profile-group liquid-glass profile-${kind}`} open>
  <summary className="profile-group-heading"><span className="profile-group-icon"><Icon size={21}/></span><span><b>{platform.title}</b><small>{platform.subtitle}</small></span><span className="profile-count">{items.length} {items.length===1?'profile':'profiles'}</span></summary>
  <div className="profile-group-body"><label className="profile-filter"><Search size={14}/><input aria-label={`Filter ${platform.name} profiles`} placeholder={google?'Filter by email, name, Gaia ID.':'Filter by username, display name, ID.'} value={filter} onChange={event=>setFilter(event.target.value)}/></label>
   {!items.length&&<p className="profile-empty">No Google account results. GHunt checks email addresses only.</p>}
   {!!items.length&&!visible.length&&<p className="profile-empty">No profiles match this filter.</p>}
   {visible.map(item=>{const f=item.fields;const name=String(f.display_name||f.name||f.username||f.email||'Account');
    const values:[string,any][]=google?[['Name',f.name],['Email',f.email],['Gaia ID',f.gaia_id],['Last profile edit',f.last_profile_edit?date(f.last_profile_edit):null]]:[['Display name',f.display_name],['Username',f.username],['User ID',f.user_id],['Join date',f.join_date?date(f.join_date):null],['Visibility',f.visibility],['Gamerscore',f.gamerscore],['Account tier',f.account_tier],['Reputation',f.reputation],['Games played',f.games_played],['Country',f.country],['Real name',f.real_name],['Location',f.location],['Discord',f.discord],['Badges',Array.isArray(f.badges)?f.badges.map(display).join(', ')||'None':f.badges]];
    return <article className="side-profile liquid-glass" key={item.id}>
     {safeUrl(f.banner_url)&&<img className="profile-banner" src={f.banner_url} referrerPolicy="no-referrer" alt="Account banner"/>}
     <div className="profile-identity"><Avatar key={String(f.avatar_url)} url={f.avatar_url} name={name}/><div><h3>{name}</h3><p>{google?f.email:f.username}</p><div className="profile-meta">{google?<span>{f.account_status||'Public account details'}</span>:<><code>{f.user_id||'ID unavailable'}</code>{f.join_date&&<span><CalendarDays size={12}/>{date(f.join_date)}</span>}</>}</div></div></div>
     <section className="profile-section"><h4><UserRound size={13}/>Account details</h4><Details values={values}/>{f.bio&&<p className="profile-services">{display(f.bio)}</p>}{google&&f.google_services&&<p className="profile-services">{display(Array.isArray(f.google_services)?f.google_services.join(', '):f.google_services)}</p>}</section>
     {['roblox','discord'].includes(kind)&&<HistoryList history={f.username_history}/>}
     {google&&<GoogleReviews fields={f} onOpen={onOpen}/>}
     {google&&(f.maps_statistics||f.play_games||f.public_calendar||f.account_types)&&<details className="profile-section profile-extra"><summary>More account information</summary><Details values={Object.entries(f).filter(([key])=>['maps_statistics','play_games','public_calendar','account_types'].includes(key)).map(([key,value])=>[key.replaceAll('_',' '),value])}/></details>}
     {!google&&safeUrl(f.profile_url)&&<button className="profile-link" onClick={()=>onOpen(f.profile_url)}><ExternalLink size={14}/>View {platform.name} Profile</button>}
     <button className="profile-save" onClick={()=>onSave(item)}><FolderPlus size={14}/>Save to person</button>
    </article>;
   })}
  </div>
 </details>;
}
export default function ProfileCards({items,showOath,showGoogle,onOpen,onSave}:Props){
 const oathKinds=['discord','steam','xbox','roblox'].filter(kind=>items.some(item=>item.profileType===kind));
 const google=items.filter(item=>item.profileType==='google');
 return <>{oathKinds.map(kind=><Group key={kind} kind={kind} items={items.filter(item=>item.profileType===kind)} onOpen={onOpen} onSave={onSave}/>)}{(showGoogle||google.length>0)&&<Group kind="google" items={google} onOpen={onOpen} onSave={onSave}/>}</>;
}
