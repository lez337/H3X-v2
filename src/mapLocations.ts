export type ResultLocation={id:string;address:string;resultIds:string[]};
const keyName=(key:string)=>key.toLowerCase().replace(/[\s_.-]/g,'');
const text = (value: unknown): string => typeof value === 'string' && value.trim() && !/^(?:null|unknown|\[redacted[^\]]*\])$/i.test(value.trim()) ? value.trim() : '';
const addressKey=(key:string)=>/^(address|addresses|addressstreet|streetaddress|homeaddress|residentialaddress|shippingaddress|billingaddress|adresse|adresses|adressedomicile|indirizzo|street)$/.test(keyName(key));

// Keep every originating card, even when several records share an address.
export function resultLocations(items:{id:string;fields?:Record<string,unknown>}[]):ResultLocation[]{
 const locations=new Map<string,ResultLocation>();
 for(const item of items){
  const fields=item.fields||{};
  const context=Object.entries(fields).filter(([key])=>/^(city|town|ville|locality|postalcode|postcode|zipcode|zip|cap|country|pays|countrycode)$/.test(keyName(key))).map(([,value])=>text(value)).filter(Boolean);
  function add(value:unknown){
   if(Array.isArray(value)){value.forEach(add);return}
   if(value&&typeof value==='object'){
    const parts=Object.entries(value).filter(([key])=>/^(housenumber|number|street|line1|line2|city|town|postalcode|postcode|zip|country)$/.test(keyName(key))).map(([,v])=>text(v)).filter(Boolean);
    if(parts.length)add(parts.join(', '));return;
   }
const street = text(value);
  if (!street || street.includes('@') || /^https?:/i.test(street) || /^\d{1,3}(\.\d{1,3}){3}$/.test(street)) return;
  const address = [street, ...context.filter(part => !street.toLowerCase().includes(part.toLowerCase()))].join(', ');
   const id=address.toLocaleLowerCase().replace(/\s+/g,' ');
   const location=locations.get(id)||{id,address,resultIds:[]};
   if(!location.resultIds.includes(item.id))location.resultIds.push(item.id);
   locations.set(id,location);
  }
  Object.entries(fields).filter(([key])=>addressKey(key)).forEach(([,value])=>add(value));
 }
 return [...locations.values()];
}
