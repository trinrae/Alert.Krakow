const el=id=>document.getElementById(id);const number=(v,d=0)=>Number.isFinite(v)?v.toFixed(d):'—';
function clock(){el('clock').textContent=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Warsaw',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date())+' PL';}clock();setInterval(clock,30000);
async function json(url){const r=await fetch(url);if(!r.ok)throw Error('Feed offline');return r.json()}
async function refresh(){const results=await Promise.allSettled([json('/api/weather'),json('/api/air')]);if(results[0].status==='fulfilled'){const d=results[0].value.current||{};el('temp').textContent=number(d.temperature_2m,1)+'°C';el('wind').textContent=number(d.wind_speed_10m);el('rain').textContent=number(d.precipitation,1);}if(results[1].status==='fulfilled'){const d=results[1].value.current||{};el('pm25').textContent=number(d.pm2_5,1);el('aqi').textContent=number(d.european_aqi);}el('updated').textContent='CHECKED '+new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Warsaw',hour:'2-digit',minute:'2-digit'}).format(new Date());}refresh();setInterval(refresh,300000);
let sources={},tab='alerts';function show(){const list=sources[tab]||[];el('feed').replaceChildren(...list.map(item=>{const a=document.createElement('a');a.className='source';a.href=item.url;a.target='_blank';a.rel='noopener noreferrer';a.append(document.createTextNode(item.name));const arrow=document.createElement('span');arrow.textContent='↗';a.append(arrow);return a;}));}json('/api/sources').then(d=>{sources=d;show()}).catch(()=>el('feed').textContent='Source links temporarily unavailable');document.querySelectorAll('[data-tab]').forEach(btn=>btn.addEventListener('click',()=>{tab=btn.dataset.tab;document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b===btn));show()}));
if(window.L){const map=L.map('map',{zoomControl:true}).setView([50.0647,19.945],12);L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(map);[['Old Town',50.0617,19.9373],['Kraków Główny',50.0688,19.9478],['Kazimierz',50.0517,19.9448],['Wawel Castle',50.0540,19.9354],['Nowa Huta',50.072,20.038]].forEach(([name,lat,lng])=>L.circleMarker([lat,lng],{radius:6,color:'#ef6672',fillColor:'#ef6672',fillOpacity:.8}).addTo(map).bindPopup(name+' · reference landmark'));const group=L.layerGroup();map.eachLayer(layer=>{if(layer instanceof L.CircleMarker){map.removeLayer(layer);group.addLayer(layer)}});group.addTo(map);const toggle=el('landmarks-toggle');if(toggle)toggle.addEventListener('click',()=>{const on=map.hasLayer(group);if(on)map.removeLayer(group);else group.addTo(map);toggle.textContent='Landmarks: '+(on?'OFF':'ON');toggle.setAttribute('aria-pressed',String(!on))});setTimeout(()=>map.invalidateSize(),200);window.addEventListener('resize',()=>map.invalidateSize());}

async function updateRiver(){const root=el('river-feed');if(!root)return;try{const d=await json('/api/river');root.replaceChildren();if(!d.stations?.length){root.textContent='No matching local stations in the current IMGW response. Check IMGW directly.';return;}for(const station of d.stations){const row=document.createElement('div');row.className='river-row';const title=document.createElement('strong');title.textContent=station.name+' · '+(station.river||'River unspecified');const meta=document.createElement('span');meta.textContent=(station.levelCm??'—')+' cm · observed '+(station.observed||'time unavailable');row.append(title,meta);root.append(row)}const note=document.createElement('p');note.className='verification';note.textContent='Observed water levels only; not an assessment of flood danger. Source: '+d.source+'.';root.append(note)}catch(e){root.textContent='IMGW readings temporarily unavailable. Use the official warning link to verify conditions.'}}updateRiver();setInterval(updateRiver,600000);

async function updateOperations(){const root=el('operations-status');if(!root)return;try{const d=await json('/api/operations');root.replaceChildren();for(const feed of d.feeds){const item=document.createElement('div');item.className='ops-feed';const name=document.createElement('strong');name.textContent=feed.name;const state=document.createElement('span');state.className=feed.available&&!feed.stale?'feed-ok':'feed-warn';state.textContent=!feed.available?'Unavailable':feed.stale?'Cached / stale':'Available';item.append(name,state);root.append(item)}const t=document.createElement('p');t.className='ops-time';t.textContent='Last server check: '+new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Warsaw',dateStyle:'medium',timeStyle:'short'}).format(new Date(d.checked))+' (Poland)';root.append(t)}catch(e){root.textContent='Feed status unavailable; do not infer normal conditions.'}}updateOperations();setInterval(updateOperations,300000);

function warningCard(w){
  const box=document.createElement('article');box.className='warning-item';
  const head=document.createElement('strong');head.textContent=(w.kind||'notice').toUpperCase()+' · '+(w.category||'notice')+' · '+(w.phenomenon||'IMGW warning')+' · Level '+(w.degree||'unspecified');
  const area=document.createElement('div');area.textContent='Area: '+(w.area||'not specified');
  const time=document.createElement('div');time.textContent='Valid: '+(w.from||'unspecified')+' — '+(w.until||'open-ended / not provided');
  const details=document.createElement('p');details.textContent=w.details||'Refer to official bulletin for details.';
  const link=document.createElement('a');link.href=w.sourceUrl||'https://meteo.imgw.pl/';link.target='_blank';link.rel='noopener noreferrer';link.textContent='Verify official bulletin ↗';
  box.append(head,area,time,details,link);return box;
}
function isDroughtAdvisory(w){
  const text=[w.category,w.phenomenon,w.details].filter(Boolean).join(' ').toLowerCase();
  return /drought|susza|niedob[oó]r wody/.test(text);
}
async function updateWarnings(){
  const root=el('warning-feed');if(!root)return;
  // Keep an expanded advisory section open during automatic refreshes.
  const wasExpanded=root.querySelector('details[data-advisories]')?.open||false;
  try{
    const d=await json('/api/warnings');root.replaceChildren();
    const status=document.createElement('p');status.className='warning-status';
    const sources=Array.isArray(d.sources)?d.sources:[];
    const bad=sources.filter(s=>!s.available||s.stale);
    status.textContent=bad.length?('Partial / unavailable IMGW warning coverage: '+bad.map(s=>s.kind+(s.stale?' (cached)':'')).join(', ')+'. Verify directly.'):('IMGW warning endpoints responded · checked '+new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Warsaw',dateStyle:'medium',timeStyle:'short'}).format(new Date(d.checked))+' (Poland).');
    root.append(status);
    const warnings=Array.isArray(d.warnings)?d.warnings:[];
    const urgent=warnings.filter(w=>!isDroughtAdvisory(w));
    const advisories=warnings.filter(isDroughtAdvisory);
    const summary=document.createElement('p');summary.className='verification';
    summary.textContent=urgent.length+' non-drought area-matched warning(s) extracted · '+advisories.length+' regional drought advisory notice(s). Geographic matching is best-effort; this is NOT an all-clear or a verified urgency classification.';
    root.append(summary);
    if(urgent.length){
      const heading=document.createElement('h3');heading.textContent='Weather and other non-drought warnings · verify urgency with IMGW';heading.style.cssText='font-size:14px;color:#f3d7da;margin:16px 0 8px';root.append(heading);
      for(const w of urgent)root.append(warningCard(w));
    }else{
      const msg=document.createElement('p');msg.className='verification';msg.textContent='No non-drought area-matched warnings extracted. Coverage is not guaranteed; verify official bulletins before movement.';root.append(msg);
    }
    if(advisories.length){
      const group=document.createElement('details');group.dataset.advisories='true';group.open=wasExpanded;
      group.style.cssText='border:1px solid #34465b;background:#142235;border-radius:7px;padding:12px 14px;margin:14px 0';
      const toggle=document.createElement('summary');toggle.textContent='Regional drought advisories ('+advisories.length+') — '+(wasExpanded?'hide details':'show details');
      toggle.style.cssText='cursor:pointer;font-weight:700;color:#e7c58b;font-size:13px';
      toggle.addEventListener('click',()=>{toggle.textContent='Regional drought advisories ('+advisories.length+') — '+(group.open?'show details':'hide details');});
      group.append(toggle);
      const note=document.createElement('p');note.className='verification';note.textContent='Long-term hydrological notices; not automatically classified as immediate movement threats. Check individual locations and validity with IMGW.';group.append(note);
      for(const w of advisories)group.append(warningCard(w));
      root.append(group);
    }
  }catch(e){root.textContent='IMGW warning monitor unavailable. No all-clear can be inferred; verify at meteo.imgw.pl.';}
}
updateWarnings();setInterval(updateWarnings,300000);


async function updateBrief(){const root=el('ep-brief');if(!root)return;try{const d=await json('/api/brief');root.replaceChildren();const summary=document.createElement('p');summary.className='verification';const total=d.matchedWarnings.length;const gaps=d.warningCoverage.filter(x=>x.status!=='parsed');summary.textContent=total?`${total} area-matched IMGW warning(s) extracted; verify the official bulletin before movement.`:'No area-matched warnings extracted. This is NOT an all-clear.';root.append(summary);for(const w of d.matchedWarnings){const item=document.createElement('div');item.className='brief-item';const title=document.createElement('strong');title.textContent=`${w.kind}: ${w.category||'notice'} · ${w.phenomenon} · level ${w.degree}`;const detail=document.createElement('span');detail.textContent=`${w.area} · valid until ${w.until||'open-ended / not provided'}`;item.append(title,detail);root.append(item)}if(d.advisoryCount){const advisory=document.createElement('p');advisory.className='verification';advisory.textContent=d.advisoryCount+' regional drought/hydrological advisories reported separately; not classified as immediate movement threats. Verify their geographic relevance with IMGW.';root.append(advisory)}const coverage=document.createElement('p');coverage.className='verification';coverage.textContent='Warning parsing: '+d.warningCoverage.map(x=>x.kind+' '+x.status).join(' · ')+(gaps.length?' · Incomplete warning coverage.':' · Geographic matching remains best-effort.');root.append(coverage);const transport=document.createElement('p');transport.className='verification';transport.textContent='Road incidents and protest reports: NOT AUTOMATICALLY MONITORED. Transit: '+(d.transport?.feeds||[]).map(f=>f.mode+' '+f.status+' ('+f.count+' published alert(s); freshness '+(f.freshness||'unknown')+')').join(' · ')+'. Verify ZTP and road conditions before travel.';root.append(transport);for(const a of (d.transport?.alerts||[]).slice(0,8)){const row=document.createElement('div');row.className='brief-item';const title=document.createElement('strong');title.textContent=a.mode+' · '+a.title;const detail=document.createElement('span');detail.textContent=(a.routes.length?'Routes '+a.routes.join(', ')+' · ':'')+a.description;row.append(title,detail);root.append(row)}const stamp=document.createElement('p');stamp.className='ops-time';stamp.textContent='Checked '+new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Warsaw',dateStyle:'medium',timeStyle:'short'}).format(new Date(d.checked))+' (Poland)';root.append(stamp)}catch(e){root.textContent='Operational brief unavailable. Check IMGW and ZTP directly before movement.'}}updateBrief();setInterval(updateBrief,300000);
