// Two independently ordered collections, one chronological page. Extra rows stay
// buffered in this admin view; subsequent pages never re-read a growing prefix.
const sources=['economyEvents','adminActions'];
const stamp=row=>{
  const t=row.createdAt;
  if(typeof t?.toMillis==='function')return t.toMillis();
  if(Number.isFinite(t?.seconds))return t.seconds*1000+(t.nanoseconds||0)/1e6;
  return Date.parse(t||'')||0;
};
const compare=(a,b)=>stamp(b)-stamp(a)||String(a.auditKind).localeCompare(String(b.auditKind))||String(b.id).localeCompare(String(a.id));
export async function readEconomyAuditPage({cursor=null,pageSize=20,fetchBatch}){
  const size=Math.max(1,Math.min(100,Math.floor(Number(pageSize)||20)));
  // Copy cursor state: failed reads must leave the caller's last good page intact.
  const next=Object.fromEntries(sources.map(name=>[name,{after:cursor?.[name]?.after||null,done:!!cursor?.[name]?.done,buffer:[...(cursor?.[name]?.buffer||[])]}]));
  async function fill(name){
    const source=next[name];if(source.done||source.buffer.length)return;
    const batch=await fetchBatch(name,source.after,size);
    source.buffer=[...batch.rows];source.after=batch.after||source.after;
    source.done=batch.rows.length<size;
  }
  const rows=[];
  while(rows.length<size){
    await Promise.all(sources.map(fill));
    const available=sources.filter(name=>next[name].buffer.length);
    if(!available.length)break;
    available.sort((a,b)=>compare(next[a].buffer[0],next[b].buffer[0]));
    rows.push(next[available[0]].buffer.shift());
  }
  return {rows,cursor:next,hasMore:sources.some(name=>next[name].buffer.length||!next[name].done)};
}
