(()=>{'use strict';
const el=document.getElementById('official-notices-content');if(!el)return;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function refresh(){try{
 const r=await fetch('/api/official-notices',{cache:'no-store'});if(!r.ok)throw Error('Request failed');const d=await r.json();
 let out='<p style="color:#e9bf80">Automatic municipal RSS monitoring paused after repeated timeouts. Official sources below are for manual verification only.</p>';
 out+='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px">';
 for(const x of d.sourceLinks||[]){if(!/^https:\/\//.test(x.url))continue;out+='<div style="background:#192a40;border:1px solid #344b62;border-radius:7px;padding:12px"><div style="font-size:11px;color:#a9bed6">'+esc(x.category)+'</div><a href="'+esc(x.url)+'" target="_blank" rel="noopener noreferrer" style="color:#cde5ff;font-weight:600">'+esc(x.name)+' ↗</a></div>';}
 out+='</div><p style="font-size:12px;color:#a9bed6;margin-top:12px">Links may be unavailable. No automated official notices are currently ingested by this panel; do not infer an all-clear.</p>';
 el.innerHTML=out;
}catch(e){el.textContent='Official source list temporarily unavailable. This is not an all-clear.';}}
refresh();setInterval(refresh,1800000);
})();
