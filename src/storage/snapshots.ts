import type { Ctx } from '../context';
import type { WatchSnapshot } from '../trackers/types';
import { stateGet } from './state';

interface SnapshotHead { generation:string; parts:number }
/** Small rows and an atomic head swap keep the previous import intact on failure. */
export async function saveSnapshot(ctx:Ctx,key:string,snapshot:WatchSnapshot):Promise<void> {
  const db=ctx.env.DB;if(!db)return;
  const text=JSON.stringify(snapshot),generation=crypto.randomUUID(),expires=Date.now()+365*86400_000;
  const chunks:string[]=[];
  // At most 512 KiB in UTF-8, including non-Latin histories, below D1's row limit.
  for(let at=0;at<text.length;at+=131072)chunks.push(text.slice(at,at+131072));
  const put=(k:string,value:unknown)=>db.prepare('INSERT INTO state(key,value,expires) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,expires=excluded.expires').bind(k,JSON.stringify(value),expires);
  const old=await stateGet<SnapshotHead>(ctx,`${key}:head`);
  const statements=chunks.map((chunk,i)=>put(`${key}:part:${generation}:${i}`,chunk));
  statements.push(put(`${key}:head`,{generation,parts:chunks.length}));
  if(old?.generation)statements.push(db.prepare('DELETE FROM state WHERE key GLOB ?').bind(`${key}:part:${old.generation}:*`));
  // D1 batch is transactional: readers see either complete generation.
  await db.batch(statements);
}
export async function loadSnapshot(ctx:Ctx,key:string):Promise<WatchSnapshot|null> {
  const db=ctx.env.DB;if(!db)return null;
  // Read the head and its chunks in one SQLite snapshot, so a concurrent replacement
  // cannot remove a generation between separate head and chunk reads.
  const rows=await db.prepare(`SELECT s.key,s.value FROM state s WHERE s.expires>? AND
    (s.key=? OR s.key GLOB (? || json_extract((SELECT value FROM state WHERE key=? AND expires>?), '$.generation') || ':*'))`)
    .bind(Date.now(),`${key}:head`,`${key}:part:`,`${key}:head`,Date.now()).all<{key:string;value:string}>();
  const header=rows.results.find(r=>r.key===`${key}:head`);
  if(!header)return stateGet<WatchSnapshot>(ctx,key); // migrate legacy snapshots lazily
  const head=JSON.parse(header.value) as SnapshotHead,parts=new Map(rows.results.map(r=>[r.key,r.value]));
  const chunks=[];
  for(let i=0;i<head.parts;i++) {
    const value=parts.get(`${key}:part:${head.generation}:${i}`);
    if(value===undefined)throw new Error('Incomplete stored history import');
    chunks.push(JSON.parse(value) as string);
  }
  return JSON.parse(chunks.join('')) as WatchSnapshot;
}
