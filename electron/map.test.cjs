const test=require('node:test');
const assert=require('node:assert/strict');
const {resultLocations}=require('../src/mapLocations.ts');
const {createGeocoder}=require('./geocoding.cjs');

test('result addresses include locality and preserve all originating cards',()=>{
 const locations=resultLocations([
  {id:'a',fields:{address_street:'10 Example Street',city:'Paris',country:'FR'}},
  {id:'b',fields:{adresse:'10 Example Street',ville:'Paris',pays:'FR'}},
  {id:'c',fields:{address:'10 Example Street',city:'Lyon',country:'FR'}}
 ]);
 assert.equal(locations.length,2);
 assert.equal(locations[0].address,'10 Example Street, Paris, FR');
 assert.deepEqual(locations[0].resultIds,['a','b']);
 assert.deepEqual(locations[1].resultIds,['c']);
});

test('address extraction ignores email, IP and redacted fields, supports multiple addresses',()=>{
 const locations=resultLocations([{id:'a',fields:{email_address:'person@example.org',ip_address:'192.0.2.1',mac_address:'00:11:22:33:44:55',address:'[redacted]',home_address:'person@example.org',shipping_address:'192.0.2.1',addresses:['1 Example Road','2 Example Road'],billing_address:{street:'3 Example Road',city:'Paris'}}}]);
 assert.deepEqual(locations.map(p=>p.address),['1 Example Road','2 Example Road','3 Example Road, Paris']);
 assert.ok(locations.every(p=>p.resultIds[0]==='a'));
 assert.deepEqual(resultLocations([]),[]);
});

test('coordinate lookups require no network and reject invalid ranges',async()=>{
 const geocode=createGeocoder({fetchImpl:()=>{throw Error('Unexpected network request')}});
 assert.deepEqual(await geocode('0, 0'),{lat:0,lng:0,label:'0, 0'});
 await assert.rejects(geocode('91, 181'),/out of range/);
 await assert.rejects(geocode(''),/Enter an address/);
});

test('geocoder queues requests, coalesces duplicates and caches results',async()=>{
 let time=0;const urls=[],waits=[];
 const geocode=createGeocoder({interval:1100,now:()=>time,wait:async ms=>{waits.push(ms);time+=ms},fetchImpl:async url=>{urls.push(new URL(url));return {ok:true,json:async()=>({features:[{geometry:{coordinates:[2.3,48.8]},properties:{city:'Paris'}}]})}}});
 const [first,same,second]=await Promise.all([geocode('Example road'),geocode('example road'),geocode('Other road')]);
 assert.deepEqual(first,{lng:2.3,lat:48.8,label:'Paris'});assert.deepEqual(first,same);assert.deepEqual(first,second);
 assert.equal(urls.length,2);assert.equal(urls[0].searchParams.get('q'),'Example road');assert.equal(urls[0].searchParams.get('limit'),'1');
 assert.deepEqual(waits,[1100]);await geocode('Example road');assert.equal(urls.length,2);
});

test('geocoding failures can be retried and never poison the queue',async()=>{
 let calls=0;
 const geocode=createGeocoder({interval:0,fetchImpl:async()=>{calls++;if(calls===1)return {ok:false,status:429};return {ok:true,json:async()=>({features:[]})}}});
 await assert.rejects(geocode('Example road'),/rate limited/);
 assert.equal(await geocode('Example road'),null);
 assert.equal(await geocode('Example road'),null);
 assert.equal(calls,2);
 assert.equal(await geocode('Example road',true),null);
 assert.equal(await geocode('Different road'),null);
 assert.equal(calls,4);
});
