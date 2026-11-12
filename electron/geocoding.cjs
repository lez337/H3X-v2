'use strict';
// A shared queue and bounded cache prevent repeat lookups when filters change.
function createGeocoder({fetchImpl=fetch,interval=1100,now=Date.now,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 const cache=new Map(),pending=new Map();let queue=Promise.resolve(),lastRequest=-Infinity;
 return function geocode(value,refresh=false){
  if(typeof value!=='string'||!value.trim()||value.length>600)return Promise.reject(Error('Enter an address of up to 600 characters.'));
  const query=value.trim(),key=query.toLowerCase().replace(/\s+/g,' ');
  const coordinates=query.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if(coordinates){const lat=Number(coordinates[1]),lng=Number(coordinates[2]);return Math.abs(lat)<=90&&Math.abs(lng)<=180?Promise.resolve({lat,lng,label:query}):Promise.reject(Error('Coordinates are out of range.'))}
  if(cache.has(key)&&!refresh)return Promise.resolve(cache.get(key));
  if(pending.has(key))return pending.get(key);
  const task=queue.then(async()=>{
   const delay=interval-(now()-lastRequest);if(delay>0)await wait(delay);lastRequest=now();
   const url=new URL('https://photon.komoot.io/api/');url.searchParams.set('q',query);url.searchParams.set('limit','1');
   const response=await fetchImpl(url.href,{headers:{Accept:'application/json','User-Agent':'H3X-Searcher/0.1 (address map)'},signal:AbortSignal.timeout(12000)});
   if(!response.ok)throw Error(response.status===429?'Address lookup is rate limited. Try again later.':'Address lookup is unavailable. Try again later.');
   const data=await response.json(),feature=data.features?.[0],coords=feature?.geometry?.coordinates;
   let result=null;
   if(Array.isArray(coords)&&coords.length>=2&&Number.isFinite(coords[0])&&Number.isFinite(coords[1])&&Math.abs(coords[0])<=180&&Math.abs(coords[1])<=90){
    const p=feature.properties||{};
    result={lng:coords[0],lat:coords[1],label:[p.name,[p.housenumber,p.street].filter(Boolean).join(' '),p.postcode,p.city,p.country].filter(Boolean).join(', ')||query};
   }
   if(cache.size>=1000)cache.delete(cache.keys().next().value);cache.set(key,result);return result;
  });
  pending.set(key,task);queue=task.catch(()=>{});task.finally(()=>pending.delete(key)).catch(()=>{});return task;
 };
}
module.exports={createGeocoder};
