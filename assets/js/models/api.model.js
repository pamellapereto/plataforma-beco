const SESSION_KEY = 'becoSession';
const API_BASE = '/api/v1';

export class ApiError extends Error { constructor(message,status,code){super(message);this.status=status;this.code=code;} }
export class ApiModel {
  session(){try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch{return null}}
  saveSession(payload){const value={...payload.session,account:payload.account,exhibitor:payload.exhibitor||null};localStorage.setItem(SESSION_KEY,JSON.stringify(value));return value}
  clearSession(){localStorage.removeItem(SESSION_KEY)}
  async request(path,options={},retry=true){
    const session=this.session(),headers={Accept:'application/json',...(options.headers||{})};
    if(options.body!==undefined)headers['Content-Type']='application/json';
    if(options.auth!==false&&session?.accessToken)headers.Authorization=`Bearer ${session.accessToken}`;
    let response;
    try{response=await fetch(`${API_BASE}${path}`,{method:options.method||'GET',headers,body:options.body===undefined?undefined:JSON.stringify(options.body)})}catch{throw new ApiError('Não foi possível conectar ao serviço. Tente novamente.',0,'NETWORK_ERROR')}
    if(response.status===401&&retry&&session?.refreshToken&&path!=='/auth/refresh'){
      try{const refreshed=await this.request('/auth/refresh',{method:'POST',body:{refreshToken:session.refreshToken},auth:false},false);this.saveSession(refreshed);return this.request(path,options,false)}catch{this.clearSession()}
    }
    const payload=response.status===204?null:await response.json().catch(()=>null);
    if(!response.ok)throw new ApiError(payload?.error?.message||'Não foi possível carregar os dados.',response.status,payload?.error?.code);
    return payload?.data??payload;
  }
  fairs(city){return this.request(`/fairs${city?`?city=${encodeURIComponent(city)}`:''}`,{auth:false})}
  fair(slug){return this.request(`/fair-editions/${encodeURIComponent(slug)}`,{auth:false})}
  exhibitors(city){return this.request(`/exhibitors${city?`?city=${encodeURIComponent(city)}`:''}`,{auth:false})}
  exhibitor(id){return this.request(`/exhibitors/${encodeURIComponent(id)}`,{auth:false})}
  exhibitorCategories(){return this.request('/exhibitor-categories',{auth:false})}
  login(email,password){return this.request('/auth/login',{method:'POST',body:{email,password},auth:false})}
  myExhibitor(){return this.request('/me/exhibitor')}
  myApplications(){return this.request('/me/applications')}
  curationDashboard(){return this.request('/curation/dashboard')}
  adminFairs(){return this.request('/admin/fairs')}
  curationApplications(id){return this.request(`/curation/fair-editions/${encodeURIComponent(id)}/applications`)}
  updateVisibility(visible){return this.request('/me/exhibitor/visibility',{method:'PATCH',body:{visible}})}
  async logout(){try{await this.request('/auth/logout',{method:'POST'})}finally{this.clearSession()}}
}
export const api=new ApiModel();
