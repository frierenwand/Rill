import type { Ctx } from '../context';
import { normalizeConfig,type CustomCatalog } from '../config/schema';
import { ADDON_ID } from './manifest';
import { stateGet,statePut } from '../storage/state';

type Json=Record<string,unknown>;
type Target='nuvio'|'fusion';
export interface LayoutSource {
  id:string;type:string;name:string;genre?:string;manifest?:string;addonId?:string;
  native?:{target:Target;value:Json};recipe?:CustomCatalog;
}
export interface LayoutTile {id:string;title:string;shape:'poster'|'wide'|'square';hidden:boolean;image?:string;sources:LayoutSource[];options:Json}
export interface LayoutEntry {id:string;title:string;mode:'collection'|'row';hidden:boolean;tiles:LayoutTile[];options:Json}
export interface Layout {version:1;entries:LayoutEntry[]}
const object=(value:unknown):Json=>value&&typeof value==='object'&&!Array.isArray(value)?value as Json:{};
const array=(value:unknown):unknown[]=>Array.isArray(value)?value:[];
const string=(value:unknown)=>typeof value==='string'?value.trim():'';
const identifier=(value:unknown)=>string(value)||crypto.randomUUID();
const aspect=(value:unknown):LayoutTile['shape']=>['landscape','wide'].includes(string(value).toLowerCase())?'wide':string(value).toLowerCase()==='square'?'square':'poster';
const media=(value:unknown)=>({movies:'movie',tv:'series',show:'series',shows:'series'}[string(value).toLowerCase()]??string(value).toLowerCase());
function validateSize(value:unknown):void {if(JSON.stringify(value).length>1_000_000)throw new Error('The collection layout exceeds 1 MB');}
function recipe(value:unknown):CustomCatalog|undefined {
  const raw=object(value);if(!raw.id)return;
  const params=Object.fromEntries(Object.entries(object(raw.params)).filter(([key])=>!/^(api[_-]?key|accessToken|refreshToken|token|password|secret|cookie|authorization|headers|url)$/i.test(key)));
  return normalizeConfig({customCatalogs:[{...raw,params}]}).customCatalogs?.[0];
}
function source(value:unknown):LayoutSource {
  const raw=object(value),native=object(raw.native);
  return{id:string(raw.id),type:media(raw.type),name:string(raw.name),genre:string(raw.genre)||undefined,manifest:string(raw.manifest)||undefined,addonId:string(raw.addonId)||undefined,
    native:['nuvio','fusion'].includes(string(native.target))?{target:native.target as Target,value:object(native.value)}:undefined,recipe:recipe(raw.recipe)};
}
export function normalizeLayout(value:unknown):Layout {
  validateSize(value);const raw=object(value),seen=new Set<string>();
  const id=(value:unknown)=>{let next=identifier(value);if(seen.has(next))next=crypto.randomUUID();seen.add(next);return next;};
  const entries=array(raw.entries).map(entry=>{
    const e=object(entry);
    return{id:id(e.id),title:string(e.title)||'Untitled',mode:e.mode==='row'?'row' as const:'collection' as const,hidden:e.hidden===true,options:object(e.options),tiles:array(e.tiles).map(tile=>{
      const t=object(tile);return{id:id(t.id),title:string(t.title)||'Untitled',shape:aspect(t.shape),hidden:t.hidden===true,image:string(t.image)||undefined,options:object(t.options),sources:array(t.sources).map(source)};
    })};
  });
  if(entries.length>100||entries.some(e=>e.tiles.length>100||e.tiles.some(t=>t.sources.length>20)))throw new Error('Use at most 100 collections, 100 tiles per collection and 20 sources per tile');
  return{version:1,entries};
}
function importedSource(value:unknown,target:Target):LayoutSource {
  const raw=object(value),data=target==='fusion'?object(raw.payload):raw;
  const native=target==='fusion'?raw.kind!=='addonCatalog':raw.provider&&raw.provider!=='addon';
  if(native)return{id:'',type:'',name:string(raw.title||raw.kind||raw.provider)||'Native source',native:{target,value:structuredClone(raw)}};
  const fullId=string(data.catalogId||data.catalog_id),separator=fullId.indexOf('::');
  const id=separator>=0?fullId.slice(separator+2):fullId,type=media(data.type||data.apiType||(separator>=0?fullId.slice(0,separator):''));
  const embedded=object(data.rill),custom=recipe(embedded.catalog);
  const base=string(data.addonBaseUrl),addon=string(data.addonId);
  const manifest=target==='nuvio'?(base?base.replace(/\/$/,'')+'/manifest.json':undefined):/^https?:\/\//.test(addon)?addon:undefined;
  return{id,type,name:string(data.catalogName||data.title||data.name)||id,genre:string(data.genre)||undefined,manifest,addonId:target==='nuvio'?addon:undefined,recipe:custom};
}
/** Native client sources stay byte-for-byte data; importing never sends a provider request. */
export function importLayout(input:unknown):{layout:Layout;notes:string[];catalogs:CustomCatalog[]} {
  validateSize(input);const raw=object(input),notes:string[]=[];
  if(raw.version===1&&Array.isArray(raw.entries))return{layout:normalizeLayout(raw),notes,catalogs:[]};
  const widgets=array(raw.widgets);
  const entries:LayoutEntry[]=[];
  if(raw.exportType==='fusionWidgets'||Array.isArray(raw.widgets)) {
    for(const value of widgets){
      const w=object(value),data=object(w.dataSource),payload=object(data.payload),row=string(w.type).startsWith('row.classic');
      if(!row&&w.type!=='collection.row'){notes.push(`Skipped unsupported Fusion widget: ${string(w.title)||string(w.type)}`);continue;}
      const items=row?[{id:w.id,title:w.title,imageAspect:object(w.presentation).aspectRatio,dataSources:[data],hideTitle:w.hideTitle}]:array(payload.items);
      entries.push({id:identifier(w.id),title:string(w.title),mode:row?'row':'collection',hidden:w.hideTitle===true,options:row?{limit:w.limit,cacheTTL:w.cacheTTL,presentation:w.presentation,numbered:w.type==='row.classic.numbered'}:{},tiles:items.map(value=>{
        const t=object(value);return{id:identifier(t.id),title:string(t.title||t.name),shape:aspect(t.imageAspect||t.layout),hidden:t.hideTitle===true,image:string(t.imageURL||t.backgroundImageURL)||undefined,options:{},sources:array(t.dataSources).map(s=>importedSource(s,'fusion'))};
      })});
    }
  }else {
    const collections=Array.isArray(input)?input:array(raw.collections);
    if(!Array.isArray(input)&&!Array.isArray(raw.collections))throw new Error('Choose a Rill, Nuvio or Fusion collection file');
    for(const value of collections){
      const c=object(value);if(!Array.isArray(c.folders))throw new Error('This is not a Nuvio collection file');
      entries.push({id:identifier(c.id),title:string(c.title),mode:'collection',hidden:c.hideTitle===true,options:{backdropImageUrl:c.backdropImageUrl,pinToTop:c.pinToTop,focusGlowEnabled:c.focusGlowEnabled,viewMode:c.viewMode,showAllTab:c.showAllTab},tiles:array(c.folders).map(value=>{
        const t=object(value);return{id:identifier(t.id),title:string(t.title),shape:aspect(t.tileShape),hidden:t.hideTitle===true,image:string(t.coverImageUrl)||undefined,options:{focusGifUrl:t.focusGifUrl,focusGifEnabled:t.focusGifEnabled,coverEmoji:t.coverEmoji,heroBackdropUrl:t.heroBackdropUrl,heroVideoUrl:t.heroVideoUrl,titleLogoUrl:t.titleLogoUrl},sources:(array(t.sources).length?array(t.sources):array(t.catalogSources)).map(s=>importedSource(s,'nuvio'))};
      })});
    }
  }
  const layout=normalizeLayout({entries}),catalogs=new Map<string,CustomCatalog>();
  for(const e of layout.entries)for(const t of e.tiles)for(const s of t.sources){
    if(s.recipe){catalogs.set(s.recipe.id,s.recipe);s.id=`${s.recipe.provider}.custom.${s.recipe.id}`;s.manifest=undefined;s.addonId=undefined;}
    else if(!s.native&&!s.manifest)notes.push(`${t.title}: select a local catalog to replace ${s.id}; its original installation URL is absent.`);
  }
  return{layout,notes:[...new Set(notes)],catalogs:[...catalogs.values()]};
}
function attachedRecipe(ctx:Ctx,s:LayoutSource):Json {
  const custom=ctx.cfg.customCatalogs?.find(c=>s.id===`${c.provider}.custom.${c.id}`||c.provider==='merged'&&s.id===`merged.${c.id}`)??s.recipe;
  return custom?{rill:{version:1,catalog:recipe(custom)}}:{};
}
export function exportLayout(ctx:Ctx,raw:unknown,target:Target,share=true):{output:unknown;notes:string[]} {
  const layout=normalizeLayout(raw),notes:string[]=[],required=new Set<string>();
  const own=`${ctx.origin}/${ctx.cfgToken}/manifest.json`;
  function link(s:LayoutSource,title:string):Json|null {
    if(s.native){if(s.native.target===target)return structuredClone(s.native.value);notes.push(`${title}: a ${s.native.target} native source has no ${target} equivalent.`);return null;}
    if(!s.id||!s.type){notes.push(`${title}: a source is missing its catalog ID or media type.`);return null;}
    const manifest=share?'YOUR_RILL_URL':s.manifest??own;
    if(target==='fusion'){if(manifest.startsWith('http'))required.add(manifest);return{kind:'addonCatalog',payload:{addonId:manifest,catalogId:`${s.type}::${s.id}`,type:s.type,...(s.genre?{genre:s.genre}:{}),...attachedRecipe(ctx,s)}};}
    return{provider:'addon',addonId:s.addonId??ADDON_ID,addonBaseUrl:share?null:manifest.replace(/\/manifest\.json$/,''),addonName:ctx.cfg.name,type:s.type,catalogId:s.id,catalogName:s.name||s.id,title:s.name||s.id,genre:s.genre||null,...attachedRecipe(ctx,s)};
  }
  const output:Json[]=[];
  for(const e of layout.entries){
    if(target==='nuvio') {
      if(e.mode==='row'){notes.push(`${e.title}: classic rows are supported by Fusion only.`);continue;}
      output.push({id:e.id,title:e.title,backdropImageUrl:e.options.backdropImageUrl??null,pinToTop:e.options.pinToTop===true,focusGlowEnabled:e.options.focusGlowEnabled!==false,viewMode:e.options.viewMode??'TABBED_GRID',showAllTab:e.options.showAllTab!==false,folders:e.tiles.map(t=>{
        const sources=t.sources.map(s=>link(s,t.title)).filter((s):s is Json=>!!s);
        return{id:t.id,title:t.title,tileShape:({poster:'POSTER',wide:'LANDSCAPE',square:'SQUARE'})[t.shape],hideTitle:t.hidden,coverImageUrl:t.image||null,...t.options,sources,catalogSources:sources.filter(s=>s.provider==='addon').map(({provider,...s})=>s)};
      })});
    }else if(e.mode==='row') {
      const tile=e.tiles[0],s=tile?.sources[0];
      if(!s){notes.push(`${e.title}: select a source for this row.`);continue;}
      if(!s.native&&!['movie','series'].includes(s.type))throw new Error(`${e.title}: Fusion classic rows require movie or series; use a collection tile for anime.`);
      const dataSource=link(s,e.title);if(!dataSource)continue;
      output.push({id:e.id.startsWith('catalog.')?e.id:`catalog.${e.id}`,title:e.title,hideTitle:e.hidden,type:e.options.numbered?'row.classic.numbered':'row.classic',cacheTTL:Number(e.options.cacheTTL)||1800,limit:Number(e.options.limit)||20,presentation:{aspectRatio:tile.shape,cardStyle:'medium',badges:{providers:false,ratings:true},...object(e.options.presentation)},dataSource});
    }else {
      output.push({id:e.id.startsWith('collection.')?e.id:`collection.${e.id}`,title:e.title,hideTitle:e.hidden,type:'collection.row',dataSource:{kind:'collection',payload:{items:e.tiles.map(t=>({id:t.id,title:t.title,hideTitle:t.hidden,imageAspect:t.shape,...(t.image?{imageURL:t.image}:{}),dataSources:t.sources.map(s=>link(s,t.title)).filter(Boolean)}))}}});
      if(Object.values(e.options).some(Boolean)||e.tiles.some(t=>Object.values(t.options).some(Boolean)))notes.push(`${e.title}: Nuvio-specific artwork and layout settings stay in the saved draft; Fusion cannot display them.`);
    }
  }
  return{output:target==='nuvio'?output:{exportType:'fusionWidgets',exportVersion:1,requiredAddons:[...required],widgets:output},notes:[...new Set(notes)]};
}
export async function saveLayout(ctx:Ctx,input:unknown):Promise<Layout>{if(!ctx.env.DB)throw new Error('Connect durable storage to save collections');const layout=normalizeLayout(input);await statePut(ctx,`layout:v1:${ctx.scope}`,layout,365*86400);return layout;}
export async function loadLayout(ctx:Ctx):Promise<Layout>{return await stateGet<Layout>(ctx,`layout:v1:${ctx.scope}`)??{version:1,entries:[]};}
