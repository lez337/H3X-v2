import {useEffect,useRef,useState} from 'react';
import {Map as InteractiveMap,Marker,Popup,NavigationControl,LngLatBounds} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {MapPin,ExternalLink,FolderOpen,Maximize} from 'lucide-react';
import type {ResultLocation} from './mapLocations';

type Pin={id:string;name:string;lat:number;lng:number;note:string;caseId?:string};
type Located=ResultLocation&{lat:number;lng:number;label:string};
type Props={pins:Pin[];cases?:{id:string;title:string}[];focusPin?:string;locationQuery?:string;locations?:ResultLocation[];compact?:boolean;onOpenResult?:(id:string)=>void;resultLabel?:(id:string)=>string;onOpenCase?:(id:string)=>void;onAdd:(p:Pin)=>void;onRemove:(id:string)=>void;openExternal:(url:string)=>void};
const noLocations:ResultLocation[]=[];
export default function MapPanel(props:Props){
 const {pins,cases=[],focusPin,locationQuery,locations=noLocations,compact=false,onOpenCase,onAdd,onRemove,openExternal}=props;
 const container=useRef<HTMLDivElement>(null),map=useRef<InteractiveMap|null>(null),callbacks=useRef(props),popup=useRef<Popup|null>(null);
 callbacks.current=props;
 const [ready,setReady]=useState(false),[location,setLocation]=useState(''),[selected,setSelected]=useState<Pin|null>(null),[caseId,setCaseId]=useState('');
 const [located,setLocated]=useState<Located[]>([]),[progress,setProgress]=useState(0),[failed,setFailed]=useState<string[]>([]),[retry,setRetry]=useState(0),[error,setError]=useState(''),[lookupError,setLookupError]=useState(''),[locating,setLocating]=useState(false);
 const locatedRef=useRef(located);locatedRef.current=located;
 const temporaryMarker=useRef<Marker|null>(null),lookupVersion=useRef(0);
 useEffect(()=>{
  if(!container.current)return;
  let instance:InteractiveMap;
  try{
   instance=new InteractiveMap({container:container.current,center:[10,25],zoom:1.5,attributionControl:{compact:false},style:{version:8,sources:{basemap:{type:'raster',tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],maxzoom:19,tileSize:256,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}},layers:[{id:'basemap',type:'raster',source:'basemap'}]}});
   map.current=instance;instance.addControl(new NavigationControl({showCompass:false}),'top-right');
   // DOM markers remain usable even when the basemap tiles are offline.
   setReady(true);
   instance.on('error',()=>setError('Map tiles could not load. Check your connection.'));
   instance.on('sourcedata',()=>setError(''));
  }catch{setError('The interactive map could not start. Check that graphics acceleration is available.');return}
  const observer=new ResizeObserver(()=>instance.resize());observer.observe(container.current);
  return()=>{lookupVersion.current++;observer.disconnect();temporaryMarker.current?.remove();popup.current?.remove();instance.remove();map.current=null;setReady(false)};
 },[]);
 useEffect(()=>{
  let active=true;setLocated([]);setProgress(0);setFailed([]);popup.current?.remove();
  (async()=>{
   for(const entry of locations){
    if(!active)return;
    try{const point=await window.h3x.geocode(entry.address,retry>0&&failed.includes(entry.address));if(!active)return;if(point)setLocated(previous=>[...previous,{...entry,...point}]);else setFailed(previous=>[...previous,entry.address])}
    catch{if(!active)return;setFailed(previous=>[...previous,entry.address])}
    if(active)setProgress(previous=>previous+1);
   }
  })();
  return()=>{active=false};
 },[locations,retry]);
 function fitLocations(){
  const points=[...locatedRef.current,...pins].filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&Math.abs(p.lat)<=90&&Math.abs(p.lng)<=180);
  if(!points.length||!map.current)return;
  const bounds=new LngLatBounds();points.forEach(p=>bounds.extend([p.lng,p.lat]));map.current.fitBounds(bounds,{padding:65,maxZoom:15,duration:500});
 }
 useEffect(()=>{
  const instance=map.current;if(!ready||!instance)return;
  temporaryMarker.current?.remove();temporaryMarker.current=null;
  const groups=new Map<string,{lat:number;lng:number;results:Located[];saved:Pin[]}>();
  for(const p of [...located,...pins]){
   if(!Number.isFinite(p.lat)||!Number.isFinite(p.lng)||Math.abs(p.lat)>90||Math.abs(p.lng)>180)continue;
   const key=`${p.lng.toFixed(5)},${p.lat.toFixed(5)}`,group=groups.get(key)||{lat:p.lat,lng:p.lng,results:[],saved:[]};
   if('resultIds' in p)group.results.push(p);else group.saved.push(p);groups.set(key,group);
  }
  const markers:Marker[]=[];
  groups.forEach(group=>{
   const ids=[...new Set(group.results.flatMap(p=>p.resultIds))];
   const button=document.createElement('button');button.className='location-marker';
   button.setAttribute('aria-label',`${group.results[0]?.address||group.saved[0]?.name}: ${ids.length?`${ids.length} source cards`:'saved location'}`);
   button.title=button.getAttribute('aria-label')!;
   const dot=document.createElement('span');dot.className='location-marker-dot';button.append(dot);
   if(ids.length>1){const count=document.createElement('span');count.className='location-marker-count';count.textContent=String(ids.length);button.append(count)}
   button.onclick=event=>{
    event.stopPropagation();
    popup.current?.remove();
    const content=document.createElement('div');content.className='location-popup';
    const title=document.createElement('b');title.textContent=group.results[0]?.address||group.saved[0]?.name;content.append(title);
    if(group.results.length){const note=document.createElement('small');note.textContent='Approximate address match';content.append(note)}
    ids.forEach((id,index)=>{const open=document.createElement('button');open.textContent=`Open ${callbacks.current.resultLabel?.(id)||`source card ${index+1}`}`;open.onclick=()=>callbacks.current.onOpenResult?.(id);content.append(open)});
    group.saved.forEach(pin=>{const open=document.createElement('button');open.textContent=pin.name;open.onclick=()=>setSelected(pin);content.append(open)});
    popup.current=new Popup({offset:24,maxWidth:'300px'}).setLngLat([group.lng,group.lat]).setDOMContent(content).addTo(instance);
    if(ids.length===1)callbacks.current.onOpenResult?.(ids[0]);
    if(!ids.length&&group.saved.length===1)setSelected(group.saved[0]);
   };
   markers.push(new Marker({element:button,anchor:'bottom'}).setLngLat([group.lng,group.lat]).addTo(instance));
  });
  fitLocations();
  return()=>{markers.forEach(marker=>marker.remove());popup.current?.remove()};
 },[ready,located,pins]);
 function selectPin(pin:Pin){setSelected(pin);map.current?.flyTo({center:[pin.lng,pin.lat],zoom:14})}
 useEffect(()=>{const pin=pins.find(p=>p.id===focusPin);if(pin&&ready)selectPin(pin)},[focusPin,pins,ready]);
 async function locate(query:string){
  const version=++lookupVersion.current;setLocating(true);setLookupError('');
  try{
   const known=locatedRef.current.find(p=>p.address.toLowerCase().startsWith(query.toLowerCase()));
   const point=known||await window.h3x.geocode(query);
   if(version!==lookupVersion.current)return;
   if(!point){setLookupError('No map match found for this address.');return}
   map.current?.flyTo({center:[point.lng,point.lat],zoom:14});setSelected(null);
   temporaryMarker.current?.remove();temporaryMarker.current=null;
   if(!known&&map.current)temporaryMarker.current=new Marker({color:'#d7d7d7'}).setLngLat([point.lng,point.lat]).addTo(map.current);
  }catch{if(version===lookupVersion.current)setLookupError('Address lookup failed. Check your connection and try again.')}
  finally{if(version===lookupVersion.current)setLocating(false)}
 }
 useEffect(()=>{if(locationQuery&&ready){setLocation(locationQuery);void locate(locationQuery)}},[locationQuery,ready]);
 function saveCoordinates(){const match=location.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);if(!match)return;const lat=Number(match[1]),lng=Number(match[2]);if(Math.abs(lat)>90||Math.abs(lng)>180)return;const pin={id:crypto.randomUUID(),name:location.trim(),lat,lng,note:'',caseId:caseId||undefined};onAdd(pin);selectPin(pin)}
 const coordinates=/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/.test(location.trim());
 return <div className={`map-layout ${compact?'map-results':''}`}>
  {!compact&&<aside className="map-side"><div className="panel-title"><MapPin size={19}/><h3>Investigation locations</h3></div><p className="muted">Click a pin to view its linked investigation.</p><input aria-label="Address or coordinates" placeholder="Address, place or lat, lng" value={location} onChange={e=>setLocation(e.target.value)} onKeyDown={e=>e.key==='Enter'&&location.trim()&&locate(location.trim())}/><button className="map-action" disabled={!location.trim()||locating} onClick={()=>locate(location.trim())}><MapPin size={14}/>{locating?'Locating…':'Pinpoint location'}</button><select aria-label="Investigation for new pins" value={caseId} onChange={e=>setCaseId(e.target.value)}><option value="">Unlinked location</option>{cases.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select>{coordinates&&<button className="map-action" onClick={saveCoordinates}>Save coordinates</button>}<p className="muted">{pins.length} saved locations</p>{selected&&<div className="selection"><b>{selected.name}</b>{selected.caseId&&<button onClick={()=>onOpenCase?.(selected.caseId!)}><FolderOpen size={14}/> Open investigation</button>}<button onClick={()=>{onRemove(selected.id);setSelected(null)}}>Remove location</button></div>}</aside>}
  <div className="map-wrap"><div ref={container} className="map-canvas" aria-label="Interactive address map"/>{(error||lookupError)&&<div className="map-error" role="alert">{error||lookupError}</div>}<button className="map-fit" onClick={fitLocations} title="Show all locations" aria-label="Show all locations"><Maximize size={16}/></button>{!compact&&<button className="map-hint" onClick={()=>{const c=map.current?.getCenter();if(c)openExternal(`https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}`)}}>Open Google Maps <ExternalLink size={12}/></button>}</div>
  {compact&&<div className="map-status" role="status"><span>{located.length} of {locations.length} addresses mapped{progress<locations.length?' · Locating addresses…':''}{!locations.length?' · No addresses in these results.':''}</span>{failed.length>0&&<details><summary>{failed.length} addresses could not be located</summary>{failed.map(address=><p key={address}>{address}</p>)}<button onClick={()=>setRetry(value=>value+1)}>Retry lookup</button></details>}<small>Address matches are approximate. Address text is sent to Photon to locate pins.</small></div>}
 </div>;
}
