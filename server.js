import express from 'express';
import path from 'node:path';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import {fileURLToPath} from 'node:url';
const app=express(), root=path.dirname(fileURLToPath(import.meta.url));
const PORT=process.env.PORT||3000;
app.disable('x-powered-by');app.use(express.static(path.join(root,'public')));
const cache=new Map();
async function load(url,ttl=120000){const cached=cache.get(url);if(cached&&Date.now()-cached.at<ttl)return cached.value;const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),12000);try{const r=await fetch(url,{signal:ctrl.signal,headers:{'User-Agent':'AlertKrakow/1.0 (public weather dashboard)'}});if(!r.ok)throw new Error('Source returned '+r.status);const value=await r.json();cache.set(url,{value,at:Date.now()});return value;}catch(e){if(cached)return {...cached.value,_stale:true};throw e;}finally{clearTimeout(timer)}}
const weather='https://api.open-meteo.com/v1/forecast?latitude=50.0647&longitude=19.9450&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m&hourly=precipitation_probability&forecast_days=1&timezone=Europe%2FWarsaw';
const air='https://air-quality-api.open-meteo.com/v1/air-quality?latitude=50.0647&longitude=19.9450&current=pm10,pm2_5,european_aqi&timezone=Europe%2FWarsaw';
app.get('/api/status',(req,res)=>res.json({ok:true,city:'Kraków',updated:new Date().toISOString()}));
app.get('/api/weather',async(req,res)=>{try{const d=await load(weather);res.json({source:'Open-Meteo',stale:!!d._stale,current:d.current,units:d.current_units});}catch(e){res.status(502).json({error:'Weather feed unavailable'})}});
app.get('/api/air',async(req,res)=>{try{const d=await load(air,300000);res.json({source:'Open-Meteo / CAMS modeled air-quality data',stale:!!d._stale,current:d.current,units:d.current_units});}catch(e){res.status(502).json({error:'Air-quality feed unavailable'})}});
app.get('/api/river',async(req,res)=>{try{const data=await load('https://danepubliczne.imgw.pl/api/data/hydro/',600000);const matches=(Array.isArray(data)?data:[]).filter(x=>/krak[oó]w|bie[zż]an[oó]w|niepo[lł]omice|sieros[lł]awice|smolice|czernich[oó]w/i.test(x.stacja||''));res.json({source:'IMGW-PIB public hydrological observations',retrieved:new Date().toISOString(),stale:!!data._stale,stations:matches.slice(0,12).map(x=>({name:x.stacja,river:x.rzeka,levelCm:x.stan_wody,observed:x.stan_wody_data_pomiaru||x.stan_wody_data||x.data_pomiaru||null,trend:x.tendencja})),note:'Station readings are not flood warnings; verify official IMGW alerts.'});}catch(e){res.status(502).json({error:'IMGW hydrological observations unavailable',source:'IMGW-PIB'})}});
app.get('/api/operations',async(req,res)=>{const checked=new Date().toISOString();const feeds=await Promise.allSettled([load(weather,120000),load(air,300000),load('https://danepubliczne.imgw.pl/api/data/hydro/',600000)]);const names=['Weather forecast','Modeled air quality','IMGW river observations'];res.json({checked,feeds:feeds.map((x,i)=>({name:names[i],available:x.status==='fulfilled',stale:x.status==='fulfilled'&&!!x.value._stale})),note:'Feed availability is not a safety assessment. Official warnings, traffic incidents and transport disruptions are not automatically ingested.'});});

// IMGW warnings: preserve uncertainty when the upstream shape or area cannot be verified.
const warningSources=[{kind:'meteorological',url:'https://danepubliczne.imgw.pl/api/data/warningsmeteo'},{kind:'hydrological',url:'https://danepubliczne.imgw.pl/api/data/warningshydro'}];
function textOf(v){if(v==null)return '';if(typeof v==='string'||typeof v==='number')return String(v);if(Array.isArray(v))return v.map(textOf).join(' ');if(typeof v==='object')return Object.values(v).map(textOf).join(' ');return '';}
function areaMatches(w){
 const codes=textOf(w.teryt||w.teryt_codes||w.kody_teryt).split(/[^0-9]+/).filter(Boolean);
 if(codes.some(t=>t==='1261'||t==='1261000'))return true;
 const area=textOf([w.obszar,w.obszary,w.powiat,w.powiaty,w.wojewodztwo,w.nazwa_obszaru,w.area,w.areas]).toLowerCase();
 // Regional hydrological advisories may span Małopolska without affecting Kraków itself.
 return /krak[oó]w|ma[lł]opolsk/i.test(area);
}
function warningDate(v){
 if(!v)return null;
 const raw=String(v);if(/^(9999|9998|0000)[-./]/.test(raw))return null;
 const time=Date.parse(raw);return Number.isFinite(time)?new Date(time).toISOString():null;
}
function parseWarnings(payload,kind){
 const records=Array.isArray(payload)?payload:Array.isArray(payload?.warnings)?payload.warnings:Array.isArray(payload?.data)?payload.data:null;
 if(!records)return {supported:false,total:null,warnings:[]};
 const now=Date.now();
 const warnings=records.filter(w=>w&&typeof w==='object'&&areaMatches(w)).map(w=>{
  const from=warningDate(w.wazne_od||w.data_od||w.valid_from||w.validFrom);
  const until=warningDate(w.wazne_do||w.data_do||w.valid_to||w.validTo);
  const area=textOf(w.obszar||w.obszary||w.powiat||w.nazwa_obszaru||'Kraków / Małopolska');
  const details=textOf(w.tresc||w.opis||w.description||'Refer to official bulletin for details.');
  const phenomenon=textOf(w.nazwa_zdarzenia||w.zjawisko||w.nazwa||w.event||'IMGW hydrological notice');
  const combined=(phenomenon+' '+details+' '+area).toLowerCase();
  const category=/susza|drought|niskie stany/.test(combined)?'drought-advisory':/wezbran|pow[oó]d[zź]|flood|wysokie stany/.test(combined)?'flood-related':kind==='meteorological'?'weather-warning':'hydrological-notice';
  const rawDegree=w.stopien??w.stopien_ostrzezenia??w.level;
  const degree=rawDegree==null||String(rawDegree).trim()===''?'Unspecified':textOf(rawDegree).slice(0,30);
  return {kind,category,phenomenon:phenomenon.slice(0,180),degree,area:area.slice(0,240),from,until,openEnded:!until,details:details.slice(0,700),source:'IMGW-PIB',sourceUrl:'https://meteo.imgw.pl/',expired:until?Date.parse(until)<now:false};
 }).filter(w=>!w.expired);
 return {supported:true,total:records.length,warnings};
}
app.get('/api/warnings',async(req,res)=>{const results=await Promise.all(warningSources.map(async source=>{try{const raw=await load(source.url,300000);const parsed=parseWarnings(raw,source.kind);return {kind:source.kind,available:parsed.supported,stale:!!raw._stale,items:parsed.warnings,upstreamCount:parsed.total,reason:parsed.supported?null:'Unrecognized upstream format'};}catch(e){return {kind:source.kind,available:false,stale:false,items:[],reason:'Source unavailable'};}}));res.json({checked:new Date().toISOString(),sources:results.map(({items,...rest})=>rest),warnings:results.flatMap(x=>x.items),note:'Only area-matched warnings are displayed. Absence of results is not an all-clear; check IMGW directly.'});});


// Conservative operational rollup: absence of a warning is never a safety clearance.
app.get('/api/brief',async(req,res)=>{
 const checked=new Date().toISOString();
 const feeds=await Promise.allSettled([load(weather,120000),load(air,300000),load('https://danepubliczne.imgw.pl/api/data/hydro/',600000)]);
 const states=feeds.map((r,i)=>({name:['Weather','Modeled air quality','River observations'][i],status:r.status==='rejected'?'unavailable':r.value._stale?'stale':'available'}));
 const warnings=await Promise.all(warningSources.map(async source=>{try{const raw=await load(source.url,300000);const p=parseWarnings(raw,source.kind);return {kind:source.kind,status:!p.supported?'unverified-format':raw._stale?'stale':'parsed',count:p.warnings.length,upstreamCount:p.total,warnings:p.warnings};}catch{return {kind:source.kind,status:'unavailable',count:0,warnings:[]}}}));
 const matched=warnings.flatMap(x=>x.warnings);
 const priority=w=>w.category==='flood-related'||w.category==='weather-warning'?0:w.category==='hydrological-notice'?1:2;
 matched.sort((a,b)=>priority(a)-priority(b));
 const transit=await Promise.all(transitFeeds.map(transitSource));
 res.json({checked,area:'Kraków / Małopolska',warningCoverage:warnings.map(({warnings,...x})=>x),matchedWarnings:matched.filter(w=>w.category!=='drought-advisory').slice(0,8),advisories:matched.filter(w=>w.category==='drought-advisory').slice(0,6),advisoryCount:matched.filter(w=>w.category==='drought-advisory').length,feeds:states,transport:{status:transit.every(x=>x.status==='available')?'available':'partial',source:'ZTP Kraków GTFS-Realtime',url:'https://ztp.krakow.pl/',feeds:transit.map(x=>({mode:x.mode,status:x.status,feedTimestamp:x.feedTimestamp||null,count:x.alerts.length, freshness:x.freshness||'unknown',stale:!!x.stale})),alerts:transit.flatMap(x=>x.alerts.map(a=>({...a,mode:x.mode}))).slice(0,12)},roadIncidents:{status:'not-integrated'},assessment:'Not an all-clear. Confirm official warnings and road/transit conditions before movement.',note:'Automated warnings are best-effort geographic matches, not authoritative coverage.'});
});

// Official ZTP Kraków GTFS-Realtime service alerts (binary Protocol Buffers).
const transitFeeds=[{mode:'Tram',url:'https://gtfs.ztp.krakow.pl/ServiceAlerts_T.pb'},{mode:'Bus',url:'https://gtfs.ztp.krakow.pl/ServiceAlerts_A.pb'}];
const transitCache=new Map();
async function transitSource(feed){
 const old=transitCache.get(feed.mode);
 if(old&&Date.now()-old.at<120000)return {...old.value,stale:old.value.status==='stale'};
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),12000);
 try{
  const response=await fetch(feed.url,{signal:ctrl.signal});if(!response.ok)throw Error('HTTP '+response.status);
  const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.length>5000000)throw Error('Oversized GTFS feed');
  const decoded=GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(bytes);
  const header=decoded.header||{};const timestamp=header.timestamp?Number(header.timestamp):null;
  const text=t=>{const translations=t?.translation||[];return (translations.find(x=>x.language==='en')||translations.find(x=>x.language==='pl')||translations[0])?.text||'';};
  const feedAgeSeconds=timestamp?Math.max(0,Math.round(Date.now()/1000-timestamp)):null;
  const freshness=feedAgeSeconds===null?'unknown':feedAgeSeconds>900?'stale':'fresh';
  const alerts=(decoded.entity||[]).filter(x=>x.alert).slice(0,75).map(x=>({id:x.id||'',title:text(x.alert.headerText).slice(0,220)||'ZTP service alert',description:text(x.alert.descriptionText).slice(0,700),effect:String(x.alert.effect||'UNKNOWN_EFFECT'),routes:[...new Set((x.alert.informedEntity||[]).map(e=>e.routeId).filter(Boolean))].slice(0,12),activePeriods:(x.alert.activePeriod||[]).slice(0,5).map(v=>({start:v.start?Number(v.start):null,end:v.end?Number(v.end):null}))}));
  const value={mode:feed.mode,status:freshness==='stale'?'stale':'available',freshness,feedAgeSeconds,source:'ZTP Kraków GTFS-Realtime',sourceUrl:'https://ztp.krakow.pl/',feedTimestamp:timestamp?new Date(timestamp*1000).toISOString():null,checked:new Date().toISOString(),alerts};
  transitCache.set(feed.mode,{at:Date.now(),value});return {...value,stale:false};
 }catch(e){if(old)return {...old.value,status:'stale',stale:true,error:'Latest source request failed'};return {mode:feed.mode,status:'unavailable',stale:false,alerts:[],error:'Feed could not be decoded or fetched',sourceUrl:'https://ztp.krakow.pl/'};}
 finally{clearTimeout(timer)}
}
app.get('/api/transit',async(req,res)=>{const feeds=await Promise.all(transitFeeds.map(transitSource));res.json({checked:new Date().toISOString(),feeds,note:'Only published GTFS-Realtime service alerts are shown. No alerts does not prove uninterrupted service. Verify ZTP before travel.'});});

// Public news aggregation. This is a headline feed, not an official incident feed.
const NEWS_RSS='https://news.google.com/rss/search?q=Krakow%20Poland%20when%3A2d&hl=en-US&gl=US&ceid=US%3Aen';
let newsCache=null;
function xmlText(value){return String(value||'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&#(x[0-9a-f]+|[0-9]+);/gi,(_,n)=>{const cp=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):parseInt(n,10);return cp>0&&cp<=0x10ffff?String.fromCodePoint(cp):''}).replace(/&(?:amp|lt|gt|quot|apos);/g,m=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"}[m])).replace(/<[^>]*>/g,'').trim();}
function tag(xml,name){const m=xml.match(new RegExp('<'+name+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+name+'>','i'));return m?xmlText(m[1]):'';}
app.get('/api/news',async(req,res)=>{
 const checked=new Date().toISOString();if(newsCache&&Date.now()-newsCache.at<600000)return res.json({...newsCache.value,checked});
 const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),10000);
 try{const r=await fetch(NEWS_RSS,{signal:ctrl.signal,headers:{'User-Agent':'AlertKrakow/6.0 (+public city dashboard)','Accept':'application/rss+xml,application/xml,text/xml'}});if(!r.ok)throw Error('RSS '+r.status);const xml=await r.text();if(!/<rss[\s>]/i.test(xml))throw Error('Unexpected RSS format');const items=[...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0,12).map(m=>{const x=m[1],title=tag(x,'title'),link=tag(x,'link'),published=tag(x,'pubDate'),publisher=tag(x,'source')||'Google News aggregation';return {title:title.slice(0,240),url:/^https:\/\//.test(link)?link:null,publisher:publisher.slice(0,100),published:Number.isFinite(Date.parse(published))?new Date(published).toISOString():null}}).filter(x=>x.title&&x.url);const value={source:'Google News RSS (third-party aggregation)',sourceUrl:'https://news.google.com/search?q=Krakow%20Poland&hl=en-US&gl=US&ceid=US%3Aen',status:'available',stale:false,items,notice:'English-language Google News results are requested; individual headlines may still be in Polish. Headlines are not verified incident reports. Publication times are publisher-supplied.'};newsCache={at:Date.now(),value};res.json({...value,checked});}
 catch(e){if(newsCache)return res.json({...newsCache.value,checked,status:'stale',stale:true,notice:'Latest RSS retrieval failed; displaying cached headlines, not current alerts.'});res.json({checked,status:'unavailable',stale:false,items:[],source:'Google News RSS',sourceUrl:'https://news.google.com/',notice:'News feed unavailable. Check original publishers.'});}
 finally{clearTimeout(timer)}
});

// Public social signals: unverified posts, not incident confirmations.
const socialQueries=['Kraków protest','Kraków demonstracja','Kraków wypadek','Kraków blokada','Kraków bójka'];
const socialTerms=/\b(protest\w*|demonstracj\w*|manifestacj\w*|strajk\w*|blokad\w*|wypad\w*|kolizj\w*|b[oó]jk\w*|pobici\w*|zamieszk\w*|utrudnieni\w*|roadblock\w*|accident\w*|crash\w*|fight\w*|clash\w*|march\w*)\b/i;
const localTerms=/krak[oó]w|krakow|ma[lł]opolsk/i;
const socialTimeout=9000;
let socialCache=null;
function plainSocial(s){return String(s||'').replace(/<[^>]*>/g,' ').replace(/&(?:amp|lt|gt|quot|apos);/g,m=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"}[m])).replace(/\s+/g,' ').trim().slice(0,400)}
function socialCategory(t){if(/protest|demonstracj|manifestacj|strajk|march/i.test(t))return 'Protests';if(/b[oó]jk|pobici|zamieszk|fight|clash/i.test(t))return 'Disturbances';return 'Traffic';}
function safeSocialDate(s){const t=Date.parse(s||'');return Number.isFinite(t)?new Date(t).toISOString():null}
async function socialFetch(url){const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),socialTimeout);try{const r=await fetch(url,{signal:ctrl.signal,headers:{'Accept':'application/json','User-Agent':'AlertKrakow/6.1 public city signals dashboard'}});if(!r.ok)throw Error('HTTP '+r.status);return await r.json()}finally{clearTimeout(timer)}}
async function blueskySignals(){const results=await Promise.allSettled(socialQueries.map(q=>socialFetch('https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?'+new URLSearchParams({q,limit:'20',sort:'latest'}))));const posts=[];for(const result of results){if(result.status!=='fulfilled')continue;for(const p of result.value.posts||[]){const t=plainSocial(p.record?.text);const uri=String(p.uri||'');const id=uri.split('/').pop();const did=String(p.author?.did||'');if(!localTerms.test(t)||!socialTerms.test(t)||!/^did:[a-z0-9:._-]+$/i.test(did)||!/^\w{5,}$/.test(id||''))continue;posts.push({id:uri,platform:'Bluesky',category:socialCategory(t),text:t,published:safeSocialDate(p.record?.createdAt||p.indexedAt),url:'https://bsky.app/profile/'+encodeURIComponent(did)+'/post/'+encodeURIComponent(id)});}}return {status:results.some(r=>r.status==='fulfilled')?'available':'unavailable',items:posts};}
async function mastodonSignals(){const results=await Promise.allSettled(['krakow','kraków'].map(tag=>socialFetch('https://mastodon.social/api/v1/timelines/tag/'+encodeURIComponent(tag)+'?limit=40')));const posts=[];for(const r of results){if(r.status!=='fulfilled')continue;for(const p of Array.isArray(r.value)?r.value:[]){const t=plainSocial(p.content);const url=String(p.url||'');if(!localTerms.test(t)||!socialTerms.test(t)||!/^https:\/\/[^\s/]+\//.test(url))continue;posts.push({id:'mastodon:'+p.id,platform:'Mastodon',category:socialCategory(t),text:t,published:safeSocialDate(p.created_at),url});}}return {status:results.some(r=>r.status==='fulfilled')?'available':'unavailable',items:posts};}
app.get('/api/social',async(req,res)=>{const now=Date.now();if(socialCache&&now-socialCache.at<180000)return res.json({...socialCache.value,checked:new Date().toISOString()});const sources=await Promise.allSettled([blueskySignals(),mastodonSignals()]);const names=['Bluesky public search','Mastodon public hashtag timeline'];const states=sources.map((r,i)=>({name:names[i],status:r.status==='fulfilled'?r.value.status:'unavailable'}));const all=sources.flatMap(r=>r.status==='fulfilled'?r.value.items:[]);const seen=new Set();const cutoff=now-48*3600000;const items=all.filter(p=>{if(!p.published||Date.parse(p.published)<cutoff||Date.parse(p.published)>now+300000||seen.has(p.id))return false;seen.add(p.id);return true}).sort((a,b)=>Date.parse(b.published)-Date.parse(a.published)).slice(0,35);const value={status:states.every(s=>s.status==='available')?'available':states.some(s=>s.status==='available')?'partial':'unavailable',checked:new Date().toISOString(),lookbackHours:48,sources:states,items,note:'Unverified public posts only. Search coverage is incomplete. Absence of posts is not an all-clear. No identity tracking or incident map markers.'};if(value.status!=='unavailable')socialCache={at:now,value};else if(socialCache)return res.json({...socialCache.value,status:'stale',stale:true,checked:new Date().toISOString(),note:'Source requests failed; cached posts are not current.'});res.json(value)});

app.get('/api/sources' ,(req,res)=>res.json({transport:[{name:'ZTP Kraków',url:'https://ztp.krakow.pl/'},{name:'MPK Kraków',url:'https://www.mpk.krakow.pl/'},{name:'Traffic map',url:'https://www.google.com/maps/@50.0647,19.945,12z/data=!5m1!1e1'}],alerts:[{name:'IMGW weather warnings',url:'https://meteo.imgw.pl/'},{name:'RCB government alerts',url:'https://www.gov.pl/web/rcb'},{name:'Kraków city notices',url:'https://www.krakow.pl/'},{name:'GIOŚ air-quality measurements',url:'https://powietrze.gios.gov.pl/pjp/current'}],news:[{name:'Kraków city news',url:'https://www.krakow.pl/'},{name:'Radio Kraków',url:'https://www.radiokrakow.pl/'},{name:'Kraków news search',url:'https://news.google.com/search?q=Krakow%20Poland&hl=en-US&gl=US&ceid=US%3Aen'}]}));
app.get('*',(req,res)=>res.sendFile(path.join(root,'public','index.html')));
app.listen(PORT,'0.0.0.0',()=>console.log('Alert.Kraków ready on '+PORT));
