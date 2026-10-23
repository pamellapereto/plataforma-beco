export function coordinates(value) {
  if(value?.latitude===null||value?.longitude===null||value?.latitude===undefined||value?.longitude===undefined||value?.latitude===''||value?.longitude==='')return null;
  const lat=Number(value.latitude),lng=Number(value.longitude);
  return Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180?[lat,lng]:null;
}
export const locationAddress=location=>[location?.address_line,location?.neighborhood,location?.city,location?.state,'Brasil'].filter(Boolean).join(', ');
export function directionsUrl(location,origin='',mode='driving') {
  const point=coordinates(location);
  const destination=point?point.join(','):locationAddress(location);
  const url=new URL('https://www.google.com/maps/dir/');
  url.searchParams.set('api','1');url.searchParams.set('destination',destination);
  if(origin.trim())url.searchParams.set('origin',origin.trim());
  url.searchParams.set('travelmode',['driving','walking','bicycling','transit'].includes(mode)?mode:'driving');
  return url.toString();
}
