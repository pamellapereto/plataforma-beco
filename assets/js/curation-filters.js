export const normalizeSearch = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
export function matchesApplication(application, filters = {}) {
  const e = application.exhibitor || {};
  const categories = e.categories || [];
  const searchable = normalizeSearch([e.display_name, e.contact_name, e.phone, e.city, e.state, application.id, application.requested_space_type, ...categories.map(c => c.name)].join(' '));
  if (normalizeSearch(filters.search).split(/\s+/).some(term => !searchable.includes(term))) return false;
  if (filters.status && application.status !== filters.status) return false;
  if (filters.category === '__none__' ? categories.length > 0 : filters.category && !categories.some(c => c.id === filters.category)) return false;
  if (filters.city && e.city !== filters.city) return false;
  if (filters.structure && application.requested_space_type !== filters.structure) return false;
  const previous = application.participationHistory?.previousConfirmedEditions;
  if (filters.history === 'new' && previous !== 0) return false;
  if (filters.history === 'returning' && !(previous > 0)) return false;
  const media = application.mediaSummary || [];
  if (filters.media === 'none' && media.length) return false;
  if (filters.media === 'pending' && !media.some(s => s === 'PENDING')) return false;
  if (filters.media === 'changes' && !media.some(s => ['CHANGES_REQUESTED','REJECTED'].includes(s))) return false;
  if (filters.media === 'approved' && (!media.length || !media.every(s => s === 'APPROVED'))) return false;
  return true;
}
export function sortApplications(applications, order = 'newest') {
  return [...applications].sort((a,b) => {
    if (order === 'name') return (a.exhibitor?.display_name || '').localeCompare(b.exhibitor?.display_name || '', 'pt-BR') || a.id.localeCompare(b.id);
    const delta = (Date.parse(a.created_at) || 0) - (Date.parse(b.created_at) || 0);
    return (order === 'oldest' ? delta : -delta) || a.id.localeCompare(b.id);
  });
}

export function categoryBalance(applications) {
  const groups=new Map();
  for(const application of applications){
    if(['DRAFT','CANCELLED','DECLINED'].includes(application.status))continue;
    const categories=application.exhibitor?.categories?.length?application.exhibitor.categories:[{id:'__none__',name:'Sem categoria'}];
    for(const category of new Map(categories.map(c=>[c.id,c])).values()){
      if(!groups.has(category.id))groups.set(category.id,{...category,candidates:0,selected:0});
      const item=groups.get(category.id);item.candidates+=1;if(['APPROVED','CONFIRMED'].includes(application.status))item.selected+=1;
    }
  }
  return [...groups.values()].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
}
