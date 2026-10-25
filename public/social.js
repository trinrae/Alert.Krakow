(() => {
  'use strict';
  const status = document.getElementById('social-status');
  const list = document.getElementById('social-items');
  if (!status || !list) return;
  let data = null;
  let selected = 'All';
  const time = iso => {if(!iso)return 'Time unknown';const d=new Date(iso);return Number.isNaN(d.getTime())?'Time unknown':new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Warsaw'}).format(d)+' PL';};
  function render(){
    list.replaceChildren();
    if(!data)return;
    const posts=(data.items||[]).filter(p=>selected==='All'||p.category===selected);
    if(!posts.length){const p=document.createElement('p');p.textContent='No matching public posts retrieved in this category. This is not an all-clear; coverage is limited.';p.style.color='#aec4dc';list.append(p);return;}
    for(const post of posts.slice(0,20)){
      const card=document.createElement('article');card.style.cssText='padding:12px;background:#192b40;border:1px solid #2d455e;border-radius:8px;overflow-wrap:anywhere';
      const meta=document.createElement('div');meta.style.cssText='font-size:.78rem;color:#aec4dc;margin-bottom:7px';meta.textContent=`${post.category} · ${post.platform} · ${time(post.published)} · UNVERIFIED`;
      const body=document.createElement('p');body.style.cssText='white-space:pre-wrap;margin:0 0 9px';body.textContent=post.text;
      const a=document.createElement('a');a.href=post.url;a.target='_blank';a.rel='noopener noreferrer';a.textContent='View original public post ↗';
      card.append(meta,body,a);list.append(card);
    }
  }
  document.querySelectorAll('[data-social-filter]').forEach(b=>b.addEventListener('click',()=>{
    selected=b.dataset.socialFilter;
    document.querySelectorAll('[data-social-filter]').forEach(x=>{const active=x===b;x.setAttribute('aria-pressed',String(active));x.style.background=active?'#315578':'#192b40';});
    render();
  }));
  async function refresh(){
    try{
      const response=await fetch('/api/social',{cache:'no-store'});
      if(!response.ok)throw Error('Source unavailable');
      data=await response.json();
      const states=(data.sources||[]).map(s=>`${s.name}: ${s.status}`).join(' · ');
      status.textContent=`${data.status==='stale'?'STALE / cached':data.status.toUpperCase()} · ${data.items?.length||0} matching public posts · Checked ${time(data.checked)} · ${states}. Not an all-clear.`;
      render();
    }catch{
      status.textContent='Social sources unavailable. No incident status can be inferred.';
      list.replaceChildren();
    }
  }
  refresh();setInterval(refresh,180000);
})();
