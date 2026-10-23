// Confirmation is a reservation record, not proof of attendance.
export async function participationHistory(gateway, organizationId, edition, exhibitorIds, now = new Date()) {
  const result = new Map(exhibitorIds.map(id => [id, { previousConfirmedEditions: 0, lastConfirmedEdition: null }]));
  const start = Date.parse(edition.starts_at);
  const cutoff = new Date(Number.isFinite(start) ? Math.min(start, now.getTime()) : now.getTime()).toISOString();
  for (let i=0;i<exhibitorIds.length;i+=50) {
    const ids=exhibitorIds.slice(i,i+50);
    for (let offset=0;;offset+=500) {
      const path='rest/v1/applications?select=exhibitor_id,fair_edition_id,edition:fair_editions!inner(id,title,ends_at,fair:fairs!inner(organization_id))'
        +`&status=eq.CONFIRMED&exhibitor_id=in.(${ids.join(',')})&fair_edition_id=neq.${edition.id}`
        +`&edition.ends_at=lt.${encodeURIComponent(cutoff)}&edition.fair.organization_id=eq.${organizationId}&order=id.asc&limit=500&offset=${offset}`;
      const rows=await gateway.request(path);
      for(const row of rows){
        const summary=result.get(row.exhibitor_id);
        // Keep organization and time checks here as defense in depth.
        const previous=row.edition;
        if(!summary||!previous||previous.fair?.organization_id!==organizationId||Date.parse(previous.ends_at)>=Date.parse(cutoff)||!Number.isFinite(Date.parse(previous.ends_at))||previous.id===edition.id)continue;
        summary.previousConfirmedEditions+=1;
        if(!summary.lastConfirmedEdition||Date.parse(previous.ends_at)>Date.parse(summary.lastConfirmedEdition.endsAt))summary.lastConfirmedEdition={id:previous.id,title:previous.title,endsAt:previous.ends_at};
      }
      if(rows.length<500)break;
    }
  }
  return result;
}
