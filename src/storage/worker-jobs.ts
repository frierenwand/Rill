import type { Ctx } from '../context';
import type { Env } from '../env';

export type WorkerJob = {kind:'maintenance'; scheduledTime:number} | {kind:'library'; id:string; scope:string};
interface LibraryRequest {url:string; headers:Record<string,string>; scope:string}
interface ResultHead {status:number; headers:Record<string,string>; parts:number}
type FetchHandler = (request:Request,env:Env,exec:ExecutionContext) => Promise<Response> | Response;

export function isLibraryRead(method:string,path:string):boolean {
  return method==='GET' && !/\/images\//i.test(path) &&
    /^\/(?:items(?:\/|$)|useritems\/resume$|shows(?:\/|$)|users\/[^/]+\/items(?:\/|$))/i.test(path);
}

export async function queueLibraryRead(ctx:Ctx,request:Request):Promise<Response> {
  const db=ctx.env.DB!,queue=ctx.env.RILL_JOBS!,id=crypto.randomUUID(),prefix=`worker-job:${id}`;
  const expires=Date.now()+120_000;
  const headers:Record<string,string>={};
  for(const name of ['authorization','x-emby-authorization','x-emby-token','x-mediabrowser-token','user-agent','accept','accept-language']) {
    const value=request.headers.get(name);if(value)headers[name]=value;
  }
  // The queue contains only an opaque ID. Request credentials remain in the
  // private database briefly, and authentication runs again in the consumer.
  const value:LibraryRequest={url:request.url,headers,scope:ctx.scope};
  const cleanup=()=>db.prepare('DELETE FROM state WHERE key>=? AND key<?').bind(`${prefix}:`,`${prefix};`).run();
  try {
    await db.prepare('INSERT INTO state(key,value,expires) VALUES(?,?,?)').bind(`${prefix}:request`,JSON.stringify(value),expires).run();
    await queue.send({kind:'library',id,scope:ctx.scope});
    // Waiting for IO does not consume the HTTP request's CPU allowance.
    for(let attempt=0;attempt<30;attempt++) {
      await new Promise(resolve=>setTimeout(resolve,attempt<2?150:500));
      const row=await db.prepare('SELECT value FROM state WHERE key=? AND expires>?')
        .bind(`${prefix}:response:head`,Date.now()).first<{value:string}>();
      if(!row)continue;
      const head=JSON.parse(row.value) as ResultHead;
      const rows=await db.prepare('SELECT key,value FROM state WHERE key>=? AND key<?')
        .bind(`${prefix}:response:body:`,`${prefix}:response:body;`).all<{key:string;value:string}>();
      const parts=new Map(rows.results.map(part=>[part.key,part.value]));
      const chunks:string[]=[];
      for(let i=0;i<head.parts;i++) {
        const part=parts.get(`${prefix}:response:body:${i}`);
        if(part===undefined)throw new Error('Incomplete library response');
        chunks.push(part);
      }
      return new Response([204,205,304].includes(head.status)?null:chunks.join(''),{status:head.status,headers:{...head.headers,'cache-control':'no-store'}});
    }
    return Response.json({Message:'The library request took too long. Please try again.'},{status:503,headers:{'cache-control':'no-store','retry-after':'2'}});
  } catch {
    console.warn('Library queue unavailable');
    return Response.json({Message:'The library is temporarily unavailable. Please try again.'},{status:503,headers:{'cache-control':'no-store','retry-after':'2'}});
  } finally {
    const work=cleanup().catch(()=>{});
    if(ctx.defer)ctx.defer(work);else await work;
  }
}

export async function runLibraryRead(job:Extract<WorkerJob,{kind:'library'}>,env:Env,exec:ExecutionContext,fetch:FetchHandler):Promise<void> {
  if(!env.DB || !/^[a-f0-9-]{36}$/.test(job.id))return;
  const db=env.DB,prefix=`worker-job:${job.id}`;
  const row=await db.prepare('SELECT value FROM state WHERE key=? AND expires>?')
    .bind(`${prefix}:request`,Date.now()).first<{value:string}>();
  if(!row)return;
  const request=JSON.parse(row.value) as LibraryRequest;
  if(request.scope!==job.scope)return;
  const complete=await db.prepare('SELECT 1 FROM state WHERE key=? AND expires>?').bind(`${prefix}:response:head`,Date.now()).first();
  if(complete)return;
  // Calling the same app preserves authorization, profiles and all existing
  // routing. Omitting the producer binding prevents recursive queue dispatch.
  const response=await fetch(new Request(request.url,{headers:request.headers}),{...env,RILL_JOBS:undefined},exec);
  const body=await response.text(),chunks:string[]=[];
  for(let at=0;at<body.length;) {
    let end=Math.min(at+131072,body.length);
    const last=body.charCodeAt(end-1);
    if(end<body.length && last>=0xd800 && last<=0xdbff)end--;
    chunks.push(body.slice(at,end));at=end;
  }
  const head:ResultHead={status:response.status,headers:Object.fromEntries(response.headers),parts:chunks.length};
  const expires=Date.now()+120_000;
  const put=(key:string,value:string)=>db.prepare('INSERT INTO state(key,value,expires) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,expires=excluded.expires').bind(key,value,expires);
  // Publish the response atomically so clients never receive partial JSON.
  await db.batch([...chunks.map((chunk,i)=>put(`${prefix}:response:body:${i}`,chunk)),put(`${prefix}:response:head`,JSON.stringify(head))]);
}
