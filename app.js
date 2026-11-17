/* ---------- storage ---------- */
const KEY = 'iffi-diary-v1';
const DEFAULT_VENUES = ['INOX Panaji (Old GMC)','INOX Porvorim','Maquinez Palace','Kala Academy','Ashok Samrat','Magic Movies Ponda','Ravindra Bhavan Margao','Other'];
const DEFAULT_SECTIONS = ['International Competition','Best Debut Feature','ICFT UNESCO Gandhi Medal','Indian Panorama – Feature','Indian Panorama – Non-Feature','Indian Panorama','Cinema of the World','Festival Kaleidoscope','Mission Life','Country Focus','Restored Classics','Retrospective','Homage','Gala Premiere','Opening Film','Closing Film','Other'];

let db = load();
function load(){
  try{ const d = JSON.parse(localStorage.getItem(KEY)); if(d && d.movies) return {venues:DEFAULT_VENUES, sections:DEFAULT_SECTIONS, ...d}; }catch(e){}
  return {movies:[], venues:[...DEFAULT_VENUES], sections:[...DEFAULT_SECTIONS]};
}
function save(){ try{ localStorage.setItem(KEY, JSON.stringify(db)); }catch(e){ toast('Could not save – storage blocked'); } }
const uid = () => Math.random().toString(36).slice(2,10);

/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dt = s => new Date(`${s.date}T${s.time || '00:00'}`);
const fmtTime = d => d.toLocaleTimeString([], {hour:'numeric', minute:'2-digit'});
const fmtDay = d => d.toLocaleDateString([], {weekday:'long', day:'numeric', month:'short'});
const fmtShort = d => d.toLocaleDateString([], {weekday:'short', day:'numeric', month:'short'});
const runtime = m => +m.runtime || 120;
const endOf = (m,s) => new Date(dt(s).getTime() + (+s.dur || runtime(m))*60000);   // s.dur = whole programme when films are shown together
const stars = r => r ? '★'.repeat(Math.floor(r)) + (r%1 ? '½' : '') : '';
function toast(t){ const el=$('#toast'); el.textContent=t; el.classList.add('show'); clearTimeout(toast._t); toast._t=setTimeout(()=>el.classList.remove('show'),2200); }
function hue(str){ let h=0; for(const c of str) h=(h*31+c.charCodeAt(0))%360; return h; }
function poster(m, mini){
  if(m.poster) return `<div class="poster"><img src="${esc(m.poster)}"${m.pc?` style="inset:auto;left:${m.pc[2]}%;top:${m.pc[3]}%;width:${m.pc[0]}%;height:${m.pc[1]}%;object-fit:fill"`:''} alt="" loading="lazy" decoding="async" onerror="this.remove()">${mini?'':placeholder(m,true)}</div>`;
  return `<div class="poster">${placeholder(m, false, mini)}</div>`;
}
function placeholder(m, behind, mini){
  const h = hue(m.title||'x');
  return `<div class="ph" style="background:linear-gradient(160deg,hsl(${h} 18% 30%),hsl(${h} 12% 15%));${mini?'font-size:9px;padding:4px':''}">${mini?'':esc(m.title)}${mini?'':`<small>${esc(m.director||'')}</small>`}</div>`;
}
const now = () => new Date();
const localISO = (d=new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

/* ---------- derived ---------- */
function allScreenings(){
  const out=[];
  for(const m of db.movies) for(const s of (m.screenings||[])) if(s.date) out.push({m,s,start:dt(s),end:endOf(m,s)});
  return out.sort((a,b)=>a.start-b.start);
}
function clashes(){
  // screenings you're planning to attend (booked, or the chosen one) that overlap (incl. 15 min buffer)
  const active = allScreenings().filter(x => x.m.status!=='watched' && (x.s.booked || x.s.going));
  const set = new Set();
  for(let i=0;i<active.length;i++) for(let j=i+1;j<active.length;j++){
    const a=active[i], b=active[j];
    if(b.start.getTime() < a.end.getTime() + travelMin(venueOf(a.s.venue),venueOf(b.s.venue))*60000){ set.add(a.s.id); set.add(b.s.id); }
  }
  return set;
}
function nextScreening(m){ const n=now(); return (m.screenings||[]).filter(s=>s.date).map(s=>({s,start:dt(s)})).filter(x=>x.start>n).sort((a,b)=>a.start-b.start)[0]; }
const CONF = 'Screening confirmed';
const confirmInfo = m => m.confirmed?.on ? m.confirmed : ((m.screenings||[]).find(s=>s.source) ? {on:true, source:(m.screenings.find(s=>s.source)).source, label:'Showtime source'} : null);
const allTags = m => [...(confirmInfo(m)?[CONF]:[]), ...(m.tags||[])];
const tagOK = m => !state.tag || allTags(m).includes(state.tag);
const isUrl = v => /^https?:\/\//i.test(v||'');
const srcLink = (v,label='Source') => !v ? '' : isUrl(v) ? `<a href="${esc(v)}" target="_blank" rel="noopener">${esc(label)} ↗</a>` : `<span title="Source">${esc(v)}</span>`;
function matches(m){
  const q = state.q.trim().toLowerCase(); if(!q) return true;
  return [m.title,m.originalTitle,m.genre,m.director,m.country,m.language,m.section,m.notes,m.cast,allTags(m).join(' ')].join(' ').toLowerCase().includes(q);
}

/* ---------- state + routing ---------- */
function officialText(){ return window.__OFFICIAL || document.getElementById('official')?.textContent || ''; }
const state = { view: 'all', q:'', showPast:false, onlyMine:false, venue:'', section:'', tag:'', mineTab:'want' };
try{ Object.assign(state, JSON.parse(localStorage.getItem(KEY+'-ui')||'{}'), {q:'', view:'all'}); }catch(e){}
for(const m of db.movies||[]) for(const x of m.screenings||[]){ if(x.booked) x.going=true; delete x.booked; delete x.seat; }
const hasShows = () => db.movies.some(m=>(m.screenings||[]).some(s=>s.date));
function setView(v, fromRoute){ const ch=state.view!==v; state.view=v; persistUI(); if(!fromRoute){ const u=ROOT+(VIEW_PATH[v]||''); if(location.href!==u) history.pushState({view:v},'',u); } syncTitle(); if(ch) window.scrollTo(0,0); render(); }
/* ---------- URLs ----------
   ./               Discover        film/<slug>/   a film (opens over the current page)
   schedule/        Schedule        venue/<id>/    a venue
   my-list/         My list                                                      */
const ROOT = document.baseURI.replace(/[?#].*$/,'').replace(/[^/]*$/,'');
const VIEW_PATH = {all:'', schedule:'schedule/', mine:'my-list/'};
const VIEW_NAME = {all:'', schedule:'Schedule', mine:'My list'};
const SITE = 'Festival Diaries · Goa';
const filmURL = m => ROOT+'film/'+slug(m.title)+'/';
const venueURL = v => ROOT+'venue/'+v.id+'/';
function routeOf(href){
  href = href||location.href; let p = href.startsWith(ROOT) ? href.slice(ROOT.length) : '';
  p = p.replace(/[?#].*$/,'').replace(/index\.html$/,''); let r;
  if((r=p.match(/^film\/([^/]+)\/?$/))) return {film:decodeURIComponent(r[1])};
  if((r=p.match(/^venue\/([^/]+)\/?$/))) return {venue:decodeURIComponent(r[1])};
  if(/^privacy\/?$/.test(p)) return {privacy:true};
  if(/^list\/?$/.test(p)){ const q=(href.split('?')[1]||'').split('#')[0]; return {list:new URLSearchParams(q).get('f')||''}; }
  if(/^schedule\/?$/.test(p)) return {view:'schedule'};
  if(/^my-list\/?$/.test(p)) return {view:'mine'};
  return {view:'all', unknown:p!==''};
}
function syncTitle(){
  const r=routeOf(), m=r.film&&db.movies.find(x=>slug(x.title)===r.film), v=r.venue&&venueById(r.venue);
  const t = m ? m.title : v ? v.name : r.privacy ? 'Privacy & your data' : r.list!==undefined ? 'Shared watchlist' : VIEW_NAME[r.view||state.view];
  document.title = t ? t+' · '+SITE : SITE;
}
function openRoute(r){
  if(r.film){ const m=db.movies.find(x=>slug(x.title)===r.film); if(m){ openDetail(m.id); return true; } }
  if(r.venue && venueById(r.venue)){ openVenue(r.venue); return true; }
  if(r.privacy){ openPrivacy(); return true; }
  if(r.list!==undefined){ openSharedList(r.list); return true; }
  return false;
}
// Startup: work out the page from the URL (also handles old #film= links and GitHub's 404 redirect)
function initRoute(){
  try{ const red=sessionStorage.getItem('fd-redirect'); if(red){ sessionStorage.removeItem('fd-redirect'); if(red.startsWith(ROOT)) history.replaceState(null,'',red); } }catch(e){}
  const hf=(location.hash.match(/film=([^&]+)/)||[])[1], hv=(location.hash.match(/venue=([^&]+)/)||[])[1];
  if(hf) history.replaceState(null,'',ROOT+'film/'+hf+'/'); else if(hv) history.replaceState(null,'',ROOT+'venue/'+hv+'/');
  const r=routeOf();
  if(r.film||r.venue||r.privacy||r.list!==undefined){ initRoute.pending=r; history.replaceState({view:'all'},'',ROOT); state.view='all'; }
  else { state.view=r.view; history.replaceState({view:r.view},'',ROOT+VIEW_PATH[r.view]+(r.unknown?'':location.search)); }
}
initRoute();
function persistUI(){ try{ localStorage.setItem(KEY+'-ui', JSON.stringify({view:state.view,showPast:state.showPast,onlyMine:state.onlyMine,mineTab:state.mineTab})); }catch(e){} }

$('#home').onclick = e => { if(e.metaKey||e.ctrlKey||e.shiftKey) return; e.preventDefault(); if($('#sheet')?.classList.contains('open')) closeSheet(true); if($('#scrim').classList.contains('open')) closeModal(true); state.q=''; $('#q').value=''; state.genre=state.country=state.section=state.venue=''; state.now=false; setView('all'); window.scrollTo({top:0,behavior:'smooth'}); };
$('#tabs').onclick = e => { const b=e.target.closest('a'); if(!b || e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||e.button) return; e.preventDefault(); setView(b.dataset.v); };
$('#q').oninput = e => { state.q = e.target.value; render(); };
$('#menuBtn').onclick = e => { e.stopPropagation(); const o=$('#menu').classList.toggle('open'); $('#menuBtn').setAttribute('aria-expanded', o); };
document.addEventListener('click', ()=>$('#menu').classList.remove('open'));
$('#menu .dd').onclick = e => { const a=e.target.dataset.a; if(a) menuAction(a); };
$('#scrim').onclick = e => { if(e.target.id==='scrim') closeModal(); };
document.addEventListener('keydown', e => {
  if(e.key==='Escape'){ if($('#sheet').classList.contains('open')) closeSheet(); else closeModal(); $('#menu').classList.remove('open'); }
  if((e.key==='Enter'||e.key===' ') && document.activeElement?.dataset?.pid && !e.target.closest('.bm')){ e.preventDefault(); openDetail(document.activeElement.dataset.pid); }
  if(e.key==='/' && document.activeElement.tagName!=='INPUT' && document.activeElement.tagName!=='TEXTAREA'){ e.preventDefault(); $('#q').focus(); }
});

/* ---------- render ---------- */
function render(){
  const _hl=()=>document.querySelectorAll('#tabs a').forEach(b=>{ const on=b.dataset.v===state.view; b.classList.toggle('on', on); if(on) b.setAttribute('aria-current','page'); else b.removeAttribute('aria-current'); });
  const n=now();
  const shows = hasShows(); document.body.classList.toggle('noshows', !shows);
  if(!shows) state.now=false;
  $('#n-mine').textContent = db.movies.filter(m=>m.status==='want').length;
  _hl();
  const v = {schedule:renderSchedule, mine:renderMine}[state.view] || (()=>renderGrid('all'));
  const y=window.scrollY; $('#main').innerHTML = v(); tick(); if(y) window.scrollTo(0,y);
  initVenueMap();
}

/* ---------- venues ---------- */
const VENUES = [
  {id:'inox-panaji', lat:15.49868, lon:73.82117, g:'pan', travel:'', name:'INOX Panaji', area:'Panaji', kind:'cinema', re:/inox.*(panaji|gmc)|old gmc|gmc heritage/i, map:'INOX Panaji, Old GMC Heritage Precinct, Panaji, Goa', about:'PVR INOX Panjim, the main festival hub in the Old GMC Heritage Precinct, with four screens (Audi 1–4). Free delegate rickshaws: service lane in front of Old GMC.'},
  {id:'maquinez', lat:15.49947, lon:73.82134, g:'pan', travel:'Next to INOX Panaji', name:'Maquinez Palace', area:'Panaji', kind:'cinema', re:/maquinez/i, map:'Maquinez Palace, Entertainment Society of Goa, Panaji, Goa', about:'A heritage screening venue inside the Entertainment Society of Goa (ESG) complex, next to INOX Panaji.'},
  {id:'samrat-ashoka', lat:15.49707, lon:73.82385, g:'pan', travel:'Short walk from INOX Panaji', name:'Samrat Ashok', area:'Panaji', kind:'cinema', re:/samrat|ashoka?\b/i, map:'Samrat Ashok Cinema, Dada Vaidya Road, Panaji, Goa', about:'Twin screens, Samrat and Ashok, on Dada Vaidya Road. Free delegate rickshaws stop in front of Samrat Theatre.'},
  {id:'inox-porvorim', lat:15.52562, lon:73.82732, g:'por', travel:'About 20 min drive from INOX Panaji', name:'INOX Porvorim', area:'Porvorim', kind:'cinema', re:/porvorim|mall de goa/i, map:'INOX Mall De Goa, Porvorim, Goa', about:'PVR INOX Porvorim: four screens (Audi 1–4) inside Mall De Goa. Free delegate rickshaws: side lane of Mall De Goa. Delegate bus Route 1 ends here.'},
  {id:'ravindra-margao', lat:15.28506, lon:73.96253, g:'mar', travel:'About 55 min drive from INOX Panaji', name:'Ravindra Bhavan', area:'Margao', kind:'cinema', re:/ravindra(?!.*open)/i, map:'Ravindra Bhavan, Fatorda, Margao, Goa', about:'The main South Goa screening venue, in Fatorda. Delegate bus Route 3 runs here from Panaji.'},
  {id:'magic-ponda', approx:true, lat:15.40355, lon:74.01017, g:'pon', travel:'About 1 hr drive from INOX Panaji', name:'Magic Moviez', area:'Ponda', kind:'cinema', re:/magic movie|ponda/i, map:'Magic Moviez, Ponda, Goa', about:'One festival film every evening at 6 PM, 21–27 Nov. Delegate bus Route 2 runs here from Panaji.'},
  {id:'miramar', lat:15.4766, lon:73.80668, g:'pan', travel:'10 min drive from INOX Panaji', name:'Miramar Beach', area:'Panaji', kind:'open', re:/miramar/i, map:'Miramar Beach, Panaji, Goa', about:'Free open-air screening every evening at 7 PM, 21–27 Nov.'},
  {id:'vagator', lat:15.59765, lon:73.73349, g:'nor', travel:'About 45 min drive from INOX Panaji', name:'Vagator Beach (Helipad)', area:'North Goa', kind:'open', re:/vagator/i, map:'Vagator Beach Helipad, Goa', about:'Free open-air screening every evening at 7 PM, 21–27 Nov.'},
  {id:'ravindra-open', lat:15.28506, lon:73.96253, g:'mar', travel:'About 55 min drive from INOX Panaji', name:'Ravindra Bhavan Open Lawns', area:'Margao', kind:'open', re:/ravindra.*open|open.*ravindra/i, map:'Ravindra Bhavan, Fatorda, Margao, Goa', about:'Free open-air screening every evening at 7 PM, 21–27 Nov, on the lawns of Ravindra Bhavan.'},
  {id:'kala-academy', lat:15.49421, lon:73.81741, g:'pan', travel:'5 min drive from INOX Panaji', name:'Kala Academy', area:'Campal, Panaji', kind:'event', re:/kala academy/i, map:'Kala Academy, Campal, Panaji, Goa', about:'Masterclasses, panel discussions and in-conversation sessions, 21–27 Nov, at 11:30 AM and 2:30 PM. Free delegate rickshaws stop in front of Kala Academy.'},
  {id:'spm-stadium', approx:true, lat:15.47027, lon:73.82257, g:'evt', travel:'10 min drive from INOX Panaji', name:'Dr. Shyama Prasad Mukherjee Indoor Stadium', area:'Taleigao', kind:'event', re:/mukherjee|indoor stadium|taleigao/i, map:'Dr. Shyama Prasad Mukherjee Indoor Stadium, Taleigao, Goa', about:'Opening ceremony on 20 Nov and closing ceremony on 28 Nov, both from 5 PM.'},
  {id:'taj-cidade', lat:15.45614, lon:73.81422, g:'evt', travel:'15 min drive from INOX Panaji', name:'Taj Cidade de Goa Horizon', area:'Dona Paula', kind:'event', re:/cidade|taj\b/i, map:'Taj Cidade de Goa Horizon, Dona Paula, Goa', about:'Official curtain-raiser events and select press gatherings.'},
];
/* ---------- talks & ceremonies (official IFFI 2026 schedule) ---------- */
const EVENTS = [
  {d:'2026-11-20',t:'17:00',v:'spm-stadium',k:'Ceremony',title:'Opening Ceremony'},
  {d:'2026-11-21',t:'11:30',e:'13:00',v:'kala-academy',k:'In conversation',title:'The Moral Universe of Parallel Cinema: 50 Years of Girish Kasaravalli',who:'Speaker: Girish Kasaravalli · Moderator: Naman Ramachandran'},
  {d:'2026-11-21',t:'14:30',e:'16:00',v:'kala-academy',k:'In conversation',title:'From Witness to Change: The Social Responsibility of Documentary Cinema',who:'Speaker: Julie Bertuccelli · Moderator: Haobam Paban Kumar'},
  {d:'2026-11-22',t:'11:30',e:'13:00',v:'kala-academy',k:'Session',title:'Session 3 – details on the official IFFI website or app'},
  {d:'2026-11-22',t:'14:30',e:'16:30',v:'kala-academy',k:'Round table',title:'The Unteachable Frame: Can Cinema Be Taught or Must It Be Discovered?',who:'Speakers: Dhiraj Singh, Santosh Ajmera, Anupam Kher, Amala Akkineni, Artur Zaborski, Manoj Paramahamsa · Moderator: Vikramjit Roy'},
  {d:'2026-11-23',t:'11:30',e:'13:00',v:'kala-academy',k:'Panel discussion',title:'Goa in Cinema',who:'Speakers: Abhishek Pathak, Marianne Borgo, Rajendra Talak · Moderator: Sachin Chatte'},
  {d:'2026-11-23',t:'14:30',e:'16:00',v:'kala-academy',k:'In conversation',title:'The Epic Genres – Mythologies, Superheroes & New Worlds',who:'Speakers: Ayan Mukerji, Basil Joseph · Moderator: Puja Talwar'},
  {d:'2026-11-24',t:'11:30',e:'13:00',v:'kala-academy',k:'Panel discussion',title:'Her Lens, Her Legacy, Her Liberty: Women Shaping World Cinema',who:'Speakers: Narghiza Dotieva, Alina Șerban, Suzanne Andrews Correa · Moderator: Abhishek Jain'},
  {d:'2026-11-24',t:'14:30',e:'16:00',v:'kala-academy',k:'Masterclass',title:'The Thin Borders Between Reality and Fiction',who:'Speaker: Bogdan Mureșanu'},
  {d:'2026-11-25',t:'11:30',e:'13:00',v:'kala-academy',k:'Retrospective',title:'Lata Mangeshkar Talk: The Voice that Echoes Forever – in memory of Asha Bhosle & S Janaki',who:'Speaker: K. S. Chithra · Moderator: Suhasini Maniratnam'},
  {d:'2026-11-25',t:'14:30',e:'16:00',v:'kala-academy',k:'Masterclass',title:'Words Across Borders: Subtitling Across Cultures',who:'Speaker: Rekhs'},
  {d:'2026-11-26',t:'11:30',e:'13:00',v:'kala-academy',k:'Masterclass',title:'The Casting Magic: Auditions Unplugged',who:'Speaker: Mukesh Chhabra'},
  {d:'2026-11-26',t:'14:30',e:'16:00',v:'kala-academy',k:'Masterclass',title:'Decoding Academy Awards',who:'Speaker: Natalie Wade'},
  {d:'2026-11-27',t:'11:30',e:'13:00',v:'kala-academy',k:'Panel discussion',title:'The Legendary 25s',who:'Speakers: Farhan Akhtar, Ashutosh Gowariker, Madhur Bhandarkar · Moderator: Khushboo Sundar'},
  {d:'2026-11-27',t:'14:30',e:'16:00',v:'kala-academy',k:'Interview session',title:'What If the Villain Is Right? The Unconventional Filmmaker Karthik Subbaraj',who:'Speaker: Karthik Subbaraj · Moderator: Sudhir Srinivasan'},
  {d:'2026-11-28',t:'17:00',v:'spm-stadium',k:'Ceremony',title:'Closing Ceremony'},
];
const evStart = e => new Date(`${e.d}T${e.t}`);
const evEnd = e => e.e ? new Date(`${e.d}T${e.e}`) : new Date(evStart(e).getTime()+150*60000);
const evRow = (e, card) => `<div class="evrow ${card?'card-ev':''}"><span class="vt"><b>${fmtTime(evStart(e))}</b><small>${e.e?'– '+fmtTime(evEnd(e)):'onwards'}</small></span><span class="vm"><small class="evk">${esc(e.k)}${card?' · '+esc(venueById(e.v)?.name||''):''}</small><b>${esc(e.title)}</b>${e.who?`<small>${esc(e.who)}</small>`:''}</span></div>`;
const VKIND = {cinema:'Cinema', open:'Open-air', event:'Events & ceremonies'};
const VGROUPS = [['pan','Panaji','The festival hub – these venues are close together'],['por','Porvorim',''],['mar','Margao','South Goa'],['pon','Ponda','Central Goa'],['nor','North Goa beaches','Open-air evening screenings'],['evt','Ceremonies & events','']];
const kmBetween = (a,b) => { const R=6371, r=Math.PI/180, dLa=(b.lat-a.lat)*r, dLo=(b.lon-a.lon)*r; const h=Math.sin(dLa/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dLo/2)**2; return 2*R*Math.asin(Math.sqrt(h)); };
// minutes needed between two shows: same building/cluster 15, otherwise rough road time + 10
const travelMin = (va,vb) => { if(!va||!vb) return 15; if(va.id===vb.id) return 15; const km=kmBetween(va,vb); return km<1.2 ? 15 : Math.round(km*1.4*2.2+10); };
const venueOf = v => { if(!v) return null; const o=VENUES.find(x=>x.id==='ravindra-open'); if(o.re.test(v)) return o; return VENUES.find(x=>x.re.test(v)) || null; };
const venueById = id => VENUES.find(x=>x.id===id);
const venueShows = vid => allScreenings().filter(x=>venueOf(x.s.venue)?.id===vid);
const VICON = {cinema:'<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4"/>', open:'<circle cx="12" cy="9" r="3.5"/><path d="M12 2.5v1.5M12 14v1.5M5.5 9H4M20 9h-1.5M7.4 4.4l1 1M15.6 4.4l-1 1M3 20c3-2 6-2 9 0s6 2 9 0"/>', event:'<path d="M12 3.6l2.6 5.2 5.8.9-4.2 4.1 1 5.7L12 16.8l-5.2 2.7 1-5.7-4.2-4.1 5.8-.9z"/>'};
const vIcon = (k,sz=20) => `<svg viewBox="0 0 24 24" width="${sz}" height="${sz}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${VICON[k]}</svg>`;
function venuesStrip(){
  const has = hasShows();
  return `<h2 class="sec-h">Venues <span>${VENUES.length}</span></h2><div class="vstrip">${VENUES.map(v=>{ const n=has?new Set(venueShows(v.id).map(x=>x.m.id)).size:0; return `<button class="vcard" onclick="openVenue('${v.id}')"><span class="vic k-${v.kind}">${vIcon(v.kind)}</span><span class="vtx"><b>${esc(v.name)}</b><small>${esc(v.area)} · ${n?n+' film'+(n>1?'s':''):VKIND[v.kind]}</small></span></button>`; }).join('')}</div>`;
}
const dayWord = d => { const t=localISO(), k=localISO(d), tm=localISO(new Date(Date.now()+864e5)); return k===t?'Today':k===tm?'Tomorrow':fmtShort(d); };
function venueNext(vid){ const n=now(); return venueShows(vid).find(x=>x.end>n); }
function renderVenues(){
  const has = hasShows(), n = now();
  let h = `<div class="vmapwrap"><div id="vmap" role="region" aria-label="Map of festival venues"></div><button class="mapfs" onclick="mapFull(true)" aria-label="Full screen map"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg><span>Full screen</span></button><button class="mapx" onclick="mapFull(false)" aria-label="Close full screen map"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg><span>Close</span></button><div class="mapkey" aria-hidden="true"><span><i style="background:#3E4EB0"></i>Cinema</span><span><i style="background:#D08A1E"></i>Open-air</span><span><i style="background:#0E5A60"></i>Events</span></div></div>`;
  for(const [g,label,sub] of VGROUPS){
    const vs = VENUES.filter(v=>v.g===g); if(!vs.length) continue;
    h += `<div class="vgroup"><h2 class="sec-h">${esc(label)} <span>${sub?esc(sub):vs.length+' venue'+(vs.length>1?'s':'')}</span></h2><div class="vlist">`;
    h += vs.map(v=>{
      const nx = has && venueNext(v.id), live = nx && nx.start<=n;
      const line2 = nx ? `<span class="vnext ${live?'live':''}">${live?'Now: ':'Next: '}${live?'':dayWord(nx.start)+' · '+fmtTime(nx.start)+' · '}${esc(nx.m.title)}</span>` : `<small>${esc(v.travel||'')}</small>`;
      return `<button class="vitem" onclick="openVenue('${v.id}')"><span class="vic k-${v.kind}">${vIcon(v.kind)}</span><span class="vtx"><b>${esc(v.name)}</b><small class="vk">${VKIND[v.kind]}${nx&&v.travel?' · '+esc(v.travel):''}</small>${line2}</span><svg class="chev" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6l6 6-6 6"/></svg></button>`;
    }).join('') + `</div></div>`;
  }
  return h;
}
let _lf=null;
function initVenueMap(){
  const el=$('#vmap'); if(!el) return;
  const go=()=>{ if(!el.isConnected || el._done) return; el._done=1;
    const L=window.L, map=L.map(el,{scrollWheelZoom:false, tap:true, attributionControl:true, zoomSnap:0.25, zoomDelta:0.5}); el._map=map;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18, attribution:'© OpenStreetMap'}).addTo(map);
    const col={cinema:'#3E4EB0', open:'#D08A1E', event:'#0E5A60'}, pts=[];
    for(const v of VENUES){ if(v.id==='ravindra-open') continue; pts.push([v.lat,v.lon]);
      L.circleMarker([v.lat,v.lon],{radius:9, color:'#fff', weight:2, fillColor:col[v.kind], fillOpacity:1}).addTo(map)
        .bindTooltip(v.name+(v.id==='ravindra-margao'?' (+ open space)':'')+(v.approx?' – approx. location':''),{direction:'top', offset:[0,-8]})
        .on('click',()=>openVenue(v.id)); }
    el._pts=pts; map.invalidateSize(); map.fitBounds(pts,{paddingTopLeft:[18,56],paddingBottomRight:[18,50]}); };
  if(window.L) return go();
  if(!_lf){ _lf=new Promise((ok,no)=>{ const c=document.createElement('link'); c.rel='stylesheet'; c.href='https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'; document.head.appendChild(c);
    const sc=document.createElement('script'); sc.src='https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'; sc.onload=ok; sc.onerror=no; document.head.appendChild(sc); }); }
  _lf.then(go).catch(()=>{ el.parentNode.style.display='none'; });
}
function mapFull(on){
  const w=$('.vmapwrap'), el=$('#vmap'); if(!w) return;
  if(on===w.classList.contains('fs')) return;
  w.classList.toggle('fs', on); document.body.style.overflow = on ? 'hidden' : '';
  if(on && !history.state?.mapfs) history.pushState({mapfs:1},'');
  if(!on && history.state?.mapfs && mapFull._fromBack!==true) history.back();
  mapFull._fromBack=false;
  if(el?._map){ setTimeout(()=>{ el._map.invalidateSize(); el._map.fitBounds(el._pts,on?{paddingTopLeft:[40,70],paddingBottomRight:[40,70]}:{paddingTopLeft:[18,56],paddingBottomRight:[18,50]}); if(on) el._map.scrollWheelZoom.enable(); else el._map.scrollWheelZoom.disable(); }, 60); }
}
window.addEventListener('popstate', ()=>{ const w=$('.vmapwrap'); if(w?.classList.contains('fs') && !history.state?.mapfs){ mapFull._fromBack=true; mapFull(false); } });
document.addEventListener('keydown', e=>{ if(e.key==='Escape' && $('.vmapwrap.fs') && !$('#scrim').classList.contains('open')) mapFull(false); });
function openVenue(id){
  const v = venueById(id); if(!v) return;
  const n = now(), all = venueShows(id).filter(x=>x.end>n || state.showPast);
  if(openVenue._id!==id){ openVenue._id=id; openVenue._day=''; }
  const days=[...new Set(all.map(x=>localISO(x.start)))], today=localISO(n);
  if(!openVenue._day || !days.includes(openVenue._day)) openVenue._day = days.includes(today) ? today : (days[0]||'');
  const shows = all.filter(x=>localISO(x.start)===openVenue._day);
  const nx = all[0], live = nx && nx.start<=n;
  let body = '';
  if(nx) body += `<button class="vnextbox ${live?'live':''}" onclick="openDetail('${nx.m.id}')"><span><small>${live?'Showing now':'Next here'}</small><b>${live?'':fmtTime(nx.start)+' · '}${esc(nx.m.title)}</b><small>${dayWord(nx.start)}${nx.s.screen?' · '+esc(nx.s.screen):''}</small>${live?'':`<span class="cdline"><span class="cd" data-cd="${nx.start.getTime()}"></span> to showtime</span>`}</span></button>`;
  if(days.length>1) body += `<div class="chips vdays">${days.map(d=>{ const dd=new Date(d+'T12:00'); return `<button class="chip ${d===openVenue._day?'on':''}" onclick="openVenue._day='${d}';openVenue('${id}')">${d===today?'Today':dd.toLocaleDateString('en-IN',{weekday:'short',day:'numeric'})}</button>`; }).join('')}</div>`;
  if(shows.length){
    let day='';
    for(const x of shows){
      const d=x.start.toDateString();
      if(d!==day){ day=d; body += `<div class="vday">${fmtDay(x.start)}${d===n.toDateString()?' · Today':''}</div>`; }
      const live = x.start<=n && x.end>n;
      body += `<button class="vrow" onclick="openDetail('${x.m.id}')"><span class="vt"><b>${fmtTime(x.start)}</b><small>– ${fmtTime(x.end)}</small></span><span class="vm"><b>${esc(x.m.title)}</b><small>${[x.s.screen, x.m.language, runtime(x.m)+' min'].filter(Boolean).map(esc).join(' · ')}</small>${x.s.note?`<small class="snote">${esc(x.s.note)}</small>`:''}</span>${live?'<span class="tag booked">Now</span>':x.s.going||x.s.booked?'<span class="tag plan">Going</span>':''}</button>`;
    }
  }
  const evs = EVENTS.filter(e=>e.v===id && (state.showPast || evEnd(e)>n));
  if(evs.length){ let dd=''; for(const e of evs){ if(e.d!==dd){ dd=e.d; body += `<div class="vday">${fmtDay(evStart(e))}</div>`; } body += evRow(e); } }
  else if(!shows.length) {
    body = `<div class="vnone">${v.kind==='event' ? 'No film screenings are listed here.' : hasShows() ? 'No upcoming screenings listed here.' : 'Schedule not announced yet. Films and showtimes will appear here as soon as IFFI publishes them.'}</div>`;
  }
  openModal(`<div class="vhead"><span class="vic big k-${v.kind}">${vIcon(v.kind,26)}</span><div><h2>${esc(v.name)}</h2><div class="dmeta">${esc(v.area)} · ${VKIND[v.kind]}</div>${v.travel?`<div class="dmeta">${esc(v.travel)}</div>`:''}${v.approx?`<div class="dmeta" style="font-size:13.5px">Map pin is approximate – use Directions</div>`:''}</div></div>
    <p class="vabout">${esc(v.about)}</p>
    <a class="btn vdir" href="${mapUrl(v.map)}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/></svg>Directions</a>
    ${v.kind!=='event'||shows.length?`<div class="vlist-h">Films showing here</div>`:''}${body}`, venueURL(v)); tick();
}
const secGroup = s => !s ? '' : /^Indian Panorama/.test(s) ? 'Indian Panorama' : /^(Opening Film|Mid Fest Film|Closing Film|Special Screenings|Special Presentations|Gala Premieres)$/.test(s) ? 'Galas & specials' : /^(Centenary Celebrations|Homage|Golden Jubilee Celebrations)$/.test(s) ? 'Indian classics & tributes' : s;
// a film can sit in more than one section (e.g. International Competition + Indian Panorama): use its section plus any section-name tags
const secGroups = m => { const all=new Set(db.movies.map(x=>x.section)); return [...new Set([m.section, ...(m.tags||[]).filter(t=>all.has(t))].map(secGroup).filter(Boolean))]; };
const secOK = m => !state.section || secGroups(m).includes(state.section);
const GENRES = [['Drama',/drama/i],['Documentary',/documentary|docu/i],['Comedy',/comed/i],['Thriller',/thriller|mystery|noir/i],['Horror',/horror|gothic/i],['Sci-fi',/sci-fi/i],['Fantasy',/fantasy|supernatural/i],['Animation',/anim/i],['Experimental',/experimental|slow cinema/i],['Crime',/crime/i],['Romance',/roman/i],['Family',/family|children/i],['Action & adventure',/action|adventure|spy|epic/i],['Mythological',/mytholog/i],['Music & dance',/music|dance/i],['War & history',/war |war\/|war$|historical|period/i],['Coming of age',/coming-of-age/i],['Classics',/classic/i]];
const genreTags = m => GENRES.filter(([,r])=>r.test(m.genre||'')).map(([g])=>g);
const countries = m => String(m.country||'').split(',').map(x=>x.trim()).filter(Boolean);
const NOW_WIN = 2*3600e3;
const nowShows = m => { const n=now(); return (m.screenings||[]).filter(s=>{ const st=dt(s), en=endOf(m,s); return en>n && st-n<NOW_WIN; }); };
const fOK = m => secOK(m) && (!state.genre || genreTags(m).includes(state.genre)) && (!state.country || countries(m).includes(state.country)) && (!state.now || nowShows(m).length) && (!state.venue || (m.screenings||[]).some(s=>venueOf(s.venue)?.id===state.venue));
function countOpts(fn){ const c={}; for(const m of db.movies) for(const v of fn(m)) c[v]=(c[v]||0)+1; return c; }
function filterBar(extra='', right=''){
  const sec=countOpts(secGroups), gen=countOpts(genreTags), cty=countOpts(countries);
  if(state.section && !sec[state.section]) state.section='';
  const az = c => Object.keys(c).sort((a,b)=>a.localeCompare(b)).map(k=>[k,k,c[k]]);
  filterBar._o = {
    genre:['Genre',[['','All genres',db.movies.length],...az(gen)]],
    country:['Country',[['','All countries',db.movies.length],...az(cty)]],
    section:['Track',[['','All tracks',db.movies.length],...az(sec)]],
    venue:['Venue',[['','All venues',db.movies.length],...VENUES.filter(v=>v.kind!=='event').map(v=>[v.id,v.name,new Set(venueShows(v.id).map(x=>x.m.id)).size]).filter(o=>o[2])]],
  };
  if(state.venue && !hasShows()) state.venue='';
  const sel = ['genre','country','section','venue'].filter(k=>state[k]);
  const X = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  return `<div class="filters"><div class="frow">
    ${hasShows()?`<button class="fpill now ${state.now?'set':''}" aria-pressed="${!!state.now}" onclick="state.now=!state.now;render()" title="Showing now or starting in the next 2 hours"><span class="dot"></span>Now</button>`:''}
    <button class="fpill" aria-haspopup="dialog" onclick="openFilters(this)"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>Filters${sel.length?` · ${sel.length}`:''}</button>
    ${sel.map(k=>`<button class="fpill set x" aria-label="Remove ${esc(state[k])}" onclick="state.${k}='';render()">${esc(k==='venue'?(venueById(state.venue)?.name||state.venue):state[k])}${X}</button>`).join('')}
  </div></div>`;
}
const FTABS_ALL = [['genre','Genre'],['country','Country'],['section','Track'],['venue','Venue']];
let FTABS = FTABS_ALL.slice(0,3);
function openFilters(btn, tab){
  filterBar._o || filterBar();
  FTABS = hasShows() ? FTABS_ALL : FTABS_ALL.slice(0,3);
  tab = tab || openFilters._t || 'genre'; openFilters._t = tab; openFilters._b = btn || openFilters._b;
  const sh=$('#sheet'), o=filterBar._o[tab][1], cur=state[tab]||'';
  const count = db.movies.filter(fOK).length, nsel = FTABS.filter(([k])=>state[k]).length;
  sh.innerHTML = `<div class="pk-head"><b>Filters</b><button class="pk-x" aria-label="Close" onclick="closeSheet()"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
    <div class="mseg" role="tablist">${FTABS.map(([k,l])=>`<button role="tab" aria-selected="${k===tab}" class="${k===tab?'on':''}" onclick="openFilters(null,'${k}')">${l}${state[k]?' •':''}</button>`).join('')}</div>
    ${o.length>14?`<div class="pk-search"><input type="search" placeholder="Search ${FTABS.find(t=>t[0]===tab)[1].toLowerCase()}" aria-label="Search" oninput="const q=this.value.toLowerCase();this.closest('#sheet').querySelectorAll('.pk-opt').forEach(b=>b.hidden=q&&!b.textContent.toLowerCase().includes(q))"></div>`:''}
    <div class="pk-list" role="listbox">${o.map(([v,l,c])=>`<button role="option" aria-selected="${v===cur}" class="pk-opt ${v===cur?'on':''}" data-v="${esc(v)}"><span>${esc(l)}</span>${c!=null?`<small>${c}</small>`:''}${v===cur?'<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>':''}</button>`).join('')}</div>
    <div class="fl-foot"><button class="linkbtn" ${nsel?'':'disabled style="opacity:.4"'} onclick="FTABS.forEach(([k])=>state[k]='');render();openFilters()">Clear all</button><button class="btn primary" onclick="closeSheet()">Show ${count} film${count===1?'':'s'}</button></div>`;
  sh.querySelectorAll('.pk-opt').forEach(b=>b.onclick=()=>{ state[tab]=b.dataset.v; render(); openFilters(); });
  if(sh.classList.contains('open')) return;
  sh.classList.add('picker','filt');
  const b=openFilters._b;
  if(innerWidth>640 && b){ const r=b.getBoundingClientRect(); Object.assign(sh.style,{left:Math.min(r.left, innerWidth-390)+'px', top:(r.bottom+6)+'px', right:'auto', bottom:'auto', width:'380px', maxHeight:Math.min(560, innerHeight-r.bottom-20)+'px'}); }
  else sh.removeAttribute('style');
  sh.classList.add('open'); $('#sheetScrim').classList.add('open');
  if(!history.state?.sheet) history.pushState({sheet:1},'');
}

function renderSchedule(){
  const shows = hasShows();
  if(!shows) return `<div class="soon"><b>Showtimes coming soon</b><span>IFFI hasn’t published the 2026 schedule yet. Here are the festival venues – tap one for directions.</span></div>` + renderVenues();
  const n = now(), myUp = allScreenings().filter(x => x.s.going && x.end>n && x.m.status!=='watched').length;
  if(!state.smode) state.smode = (cloud.user && myUp) ? 'plan' : 'time';
  const mode = state.smode;
  const tab = (k,l,extra='') => `<button role="tab" aria-selected="${mode===k}" class="${mode===k?'on':''}" onclick="state.smode='${k}';window.scrollTo(0,0);render()">${l}${extra}</button>`;
  const seg = `<div class="mseg sseg" role="tablist">${tab('plan','My plan', myUp?`<small>${myUp}</small>`:'')}${tab('time','All shows')}${tab('venue','By venue')}</div>`;
  if(mode==='venue') return seg + renderVenues();
  if(mode==='plan') return seg + renderPlan();
  return seg + renderScheduleTime();
}
/* a time button: tap to mark / unmark Going */
function timeChip(x, cl, n){
  const live = x.start<=n && x.end>n, past = x.end<=n;
  const v = venueOf(x.s.venue), place = [v?.name || x.s.venue || 'Venue TBA', x.s.screen].filter(Boolean).join(' · ');
  const cls = ['tchip', x.s.going&&'going', cl.has(x.s.id)&&'clash', live&&'live', past&&'past'].filter(Boolean).join(' ');
  const lab = `${fmtTime(x.start)}, ${place}${x.s.going?', going – tap to remove':', tap to mark as going'}`;
  const act = past ? (x.m.status==='watched' ? `openDetail('${x.m.id}')` : `quickWatched('${x.m.id}','${x.s.id}')`) : `pickTime('${x.m.id}','${x.s.id}')`;
  return `<button class="${cls}" aria-pressed="${!!x.s.going}" aria-label="${esc(lab)}" onclick="event.stopPropagation();${act}"><b>${fmtTime(x.start)}</b><span>${esc(place)}</span>${x.s.going?'<i>✓ Going</i>':live?'<i>Now showing</i>':past&&x.m.status!=='watched'?'<i>Mark watched</i>':cl.has(x.s.id)?'<i>Clash</i>':''}</button>`;
}
function pickTime(mid, sid){
  if(!cloud.user) return askSignIn(mid, 'want', sid);
  toggleS(mid, sid, 'going');
  const s = find(mid)?.screenings.find(y=>y.id===sid);
  if(s?.going && !clashes().has(sid)) toast('Added to My plan');
}
/* one card per film per day, with all its times as buttons */
function filmGroup(g, cl, n){
  const m = g.m, going = g.items.some(x=>x.s.going);
  const notes = [...new Set(g.items.map(x=>x.s.note).filter(Boolean))];
  const meta = [runtime(m)+' min', m.language, m.section].filter(Boolean).map(esc).join(' · ');
  const tags = (m.status==='want'?'<span class="tag saved">Saved</span>':'') + (m.status==='watched'?'<span class="tag booked">Watched</span>':'');
  return `<div class="fgroup ${going?'has-going':''}">
    <div class="fg-head" onclick="openDetail('${m.id}')">
      <div class="mini">${poster(m,true)}</div>
      <div class="info"><div class="t">${esc(m.title)}</div><div class="meta">${meta}</div>${tags?`<div class="fg-tags">${tags}</div>`:''}</div>
    </div>
    ${notes.map(t=>`<div class="snote">${esc(t)}</div>`).join('')}
    <div class="tchips">${g.items.map(x=>timeChip(x,cl,n)).join('')}</div>
  </div>`;
}
function dayChipsHtml(days, today){
  if(days.length<2) return '';
  const planDays = new Set(allScreenings().filter(x=>x.s.going).map(x=>localISO(x.start)));
  return `<div class="daybar"><div class="chips"><button class="chip ${!state.day?'on':''}" onclick="state.day='';render()">All days</button>${days.map(d=>{ const dd=new Date(d+'T12:00'); return `<button class="chip ${state.day===d?'on':''}" onclick="state.day='${d}';window.scrollTo(0,0);render()">${d===today?'Today':dd.toLocaleDateString('en-IN',{weekday:'short',day:'numeric'})}${planDays.has(d)?'<i class="pdot" title="You have a show planned"></i>':''}</button>`; }).join('')}</div></div>`;
}
function earlierLink(hidden){
  if(state.showPast) return `<button class="earlier" onclick="state.showPast=false;persistUI();render()">Hide earlier shows ▴</button>`;
  return hidden ? `<button class="earlier" onclick="state.showPast=true;persistUI();render()">Earlier shows (${hidden}) ▾</button>` : '';
}
function renderScheduleTime(){
  const n = now(), cl = clashes(), today = localISO(n);
  let items = allScreenings().filter(x => x.m.status!=='watched' || x.start<n);
  items = items.filter(x => matches(x.m) && tagOK(x.m) && (!state.venue || venueOf(x.s.venue)?.id===state.venue) && fOK(x.m) && (!state.now || (x.end>now() && x.start-now()<NOW_WIN)));
  const allDays = [...new Set(items.map(x=>localISO(x.start)))].sort();
  const daysShown = state.showPast ? allDays : allDays.filter(d => d>=today);
  const days = daysShown.length ? daysShown : allDays;
  if(state.day===undefined) state.day = days.find(d=>d>=today) || '';
  if(state.day && !days.includes(state.day)) state.day = days.find(d=>d>=today) || '';
  if(state.day) items = items.filter(x => localISO(x.start)===state.day);
  const hidden = state.showPast ? 0 : items.filter(x => x.end<=n).length;
  if(!state.showPast) items = items.filter(x => x.end>n);

  let html = filterBar() + dayChipsHtml(days, today) + earlierLink(hidden);
  const noFilter = !state.q && !state.tag && !state.now && !state.genre && !state.country && !state.section && !state.venue;
  const evs = noFilter ? EVENTS.filter(e => (state.showPast || evEnd(e)>n) && (!state.day || e.d===state.day)) : [];
  if(!items.length && !evs.length){
    return html + (db.movies.length
      ? `<div class="empty"><h3>${allScreenings().length?'No shows match':'Schedule not announced yet'}</h3>${allScreenings().length?'Try another day or section.':'Showtimes will appear here as soon as IFFI publishes them.'}</div>`
      : `<div class="empty"><h3>No films yet</h3>The film list is loading. Refresh the page if it doesn't appear.</div>`);
  }
  // group: day → film
  const byDay = new Map();
  for(const x of items){ const d=localISO(x.start); if(!byDay.has(d)) byDay.set(d,new Map()); const g=byDay.get(d); if(!g.has(x.m.id)) g.set(x.m.id,{m:x.m,start:x.start,items:[]}); g.get(x.m.id).items.push(x); }
  for(const e of evs) if(!byDay.has(e.d)) byDay.set(e.d,new Map());
  for(const d of [...byDay.keys()].sort()){
    const groups = [...byDay.get(d).values()], nShows = groups.reduce((t,g)=>t+g.items.length,0);
    const dd = new Date(d+'T12:00');
    html += `<h2 class="day"><span>${fmtDay(dd)}${d===today?' · Today':''}</span><span>${groups.length?`${groups.length} film${groups.length>1?'s':''} · ${nShows} show${nShows>1?'s':''}`:''}</span></h2>`;
    const list = [...groups.map(g=>({g,start:g.start})), ...evs.filter(e=>e.d===d).map(e=>({ev:e,start:evStart(e)}))].sort((a,b)=>a.start-b.start);
    for(const x of list) html += x.ev ? evRow(x.ev, true) : filmGroup(x.g, cl, n);
  }
  return html;
}
function renderPlan(){
  const n = now(), cl = clashes(), today = localISO(n);
  if(!cloud.user) return `<div class="empty ask" style="max-width:440px;margin:24px auto"><h2>Plan your festival</h2><p>Sign in, then tap any showtime in All shows to add it here. Your plan works on all your devices.</p><button class="btn primary" onclick="askSignIn()">Sign in</button><button class="btn" onclick="state.smode='time';render()">Browse all shows</button></div>`;
  const mine = allScreenings().filter(x => x.s.going && x.m.status!=='watched');
  const hidden = state.showPast ? 0 : mine.filter(x=>x.end<=n).length;
  const list = state.showPast ? mine : mine.filter(x=>x.end>n);
  let html = '';
  const next = list.find(x=>x.start>n);
  if(next) html += `<div class="hero" onclick="openDetail('${next.m.id}')" style="cursor:pointer">
      ${poster(next.m)}
      <div style="flex:1;min-width:0">
        <div class="k">Next on your plan</div>
        <h3>${esc(next.m.title)}</h3>
        <div class="meta" style="color:var(--muted)">${dayWord(next.start)} · ${fmtTime(next.start)} · ${esc(next.s.venue||'')}${next.s.screen?' · '+esc(next.s.screen):''}</div>
        <div class="cdline"><span class="cd" data-cd="${next.start.getTime()}"></span> to showtime</div>
      </div>
    </div>`;
  html += earlierLink(hidden);
  if(!list.length){
    html += `<div class="empty"><h3>Your plan is empty</h3>Open <b>All shows</b> and tap a showtime to add it here.<div style="margin-top:14px"><button class="btn primary" onclick="state.smode='time';render()">Browse all shows</button></div></div>`;
  } else {
    let day='';
    for(const x of list){
      const d = localISO(x.start);
      if(d!==day){ day=d; const c=list.filter(y=>localISO(y.start)===d).length; html += `<h2 class="day"><span>${fmtDay(x.start)}${d===today?' · Today':''}</span><span>${c} show${c>1?'s':''}</span></h2>`; }
      const past = x.end<=n, live = x.start<=n && !past;
      html += `<div class="prow ${past?'past':''} ${cl.has(x.s.id)?'clash':''}" onclick="openDetail('${x.m.id}')">
        <div class="time"><b>${fmtTime(x.start)}</b><small>– ${fmtTime(x.end)}</small></div>
        <div class="info"><div class="t">${esc(x.m.title)}</div>
          <div class="meta">📍 ${esc(venueOf(x.s.venue)?.name||x.s.venue||'Venue TBA')}${x.s.screen?' · '+esc(x.s.screen):''} · ${runtime(x.m)} min</div>
          ${x.s.note?`<div class="snote">${esc(x.s.note)}</div>`:''}
          ${cl.has(x.s.id)?'<div class="pwarn">⚠️ Overlaps another show, or too little time to travel</div>':''}
          ${live?'<span class="tag booked">Now showing</span>':''}</div>
        <div class="acts" onclick="event.stopPropagation()">${past
          ? `<button class="btn sm" onclick="quickWatched('${x.m.id}','${x.s.id}')">✓ Watched</button>`
          : `<button class="icbtn" aria-label="Remove ${esc(x.m.title)} from My plan" title="Remove from My plan" onclick="toggleS('${x.m.id}','${x.s.id}','going');toast('Removed from My plan')">${IC.x}</button>`}</div>
      </div>`;
    }
  }
  // saved films that still need a showtime
  const goingIds = new Set(mine.filter(x=>x.end>n).map(x=>x.m.id));
  const pick = db.movies.filter(m => m.status==='want' && !goingIds.has(m.id))
    .map(m => ({m, items: allScreenings().filter(x=>x.m===m && x.end>n)}))
    .filter(g => g.items.length).sort((a,b)=>a.items[0].start-b.items[0].start);
  if(pick.length){
    html += `<h2 class="day sub"><span>Saved films – pick a showtime</span><span>${pick.length}</span></h2>`;
    for(const g of pick) html += filmGroup({m:g.m, items:g.items}, cl, n);
  }
  return html;
}

function cardHtml(m, badge){
  const ns = nextScreening(m);
  const sub = m.status==='watched' ? `<span class="stars">${stars(m.rating)}</span>` : (ns ? `<span>${fmtShort(ns.start)+' '+fmtTime(ns.start)}</span>` : '');
  const b = badge || (m.status==='watched' ? '<span style="color:var(--green)">✓ Watched</span>' : '');
  return `<div class="card" data-pid="${m.id}" tabindex="0" role="button" aria-label="${esc(m.title)}" onclick="openDetail('${m.id}')">
    ${poster(m).replace(/<\/div>$/, (m.status!=='watched' ? `<button class="bm ${m.status==='want'?'on':''}" aria-label="${m.status==='want'?'Remove from my list':'Save to my list'}" onclick="event.stopPropagation();quickSave('${m.id}')"><svg viewBox="0 0 24 24"><path d="M6 3h12v18l-6-4.5L6 21z" stroke-linejoin="round"/></svg></button>` : '') + '</div>')}
    ${b?`<span class="badge-next">${b}</span>`:''}
    <div class="cap">${esc(m.title)}</div>
    <div class="sub">${sub}</div>
  </div>`;
}
const byTitle = (a,b) => a.title.localeCompare(b.title);
const byNext = (a,b) => (nextScreening(a)?.start ?? Infinity) - (nextScreening(b)?.start ?? Infinity) || byTitle(a,b);
function renderGrid(kind){
  const filtering = state.q.trim() || (kind==='all' && ['genre','country','section','now','venue'].some(k=>state[k]));
  let list = db.movies.filter(m => (kind==='all' ? fOK(m) : m.status===kind) && matches(m));
  if(kind==='watched') list.sort((a,b)=>(b.watchedOn||'').localeCompare(a.watchedOn||'') || byTitle(a,b));
  else list.sort(kind==='want' && hasShows() ? byNext : byTitle);
  let html = kind==='all' ? filterBar() : '';
  if(!list.length){
    if(state.now) return html + `<div class="empty"><h3>Nothing screening right now</h3>No shows are on or starting in the next 2 hours.</div>`;
    if(filtering) return html + `<div class="empty"><h3>No films match</h3>Try another search or filter.</div>`;
    const msg = {want:['Nothing saved yet','Tap the bookmark on any film to save it here.'], watched:['No films watched yet','Open a film and tap Watched, then give it stars.'], all:['No films yet','The film list is loading. Refresh the page if it doesn’t appear.']}[kind];
    return html + `<div class="empty"><h3>${msg[0]}</h3>${msg[1]}</div>`;
  }
  if(kind==='all' && !filtering){
    const rec = db.movies.filter(m=>m.recRank).sort((a,b)=>a.recRank-b.recRank);
    if(rec.length) html += `<h2 class="sec-h">Recommended <span>${rec.length}</span></h2><div class="strip">${rec.map(m=>cardHtml(m, `#${m.recRank}`)).join('')}</div><h2 class="sec-h">All films <span>${list.length}</span></h2>`;
  }
  return html + `<div class="grid">${list.map(m=>cardHtml(m)).join('')}</div>`;
}
const IC = {
  share:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>',
  link:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>',
  copy:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  open:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  wa:'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>',
  bookmark:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12v18l-6-4.5L6 21z"/></svg>',
  x:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
};
/* ---------- shared watchlist: a public page at list/?f=slug.slug… ---------- */
const listURL = films => ROOT + 'list/?f=' + films.map(m=>slug(m.title)).join('.');
function myWatchlist(){ return db.movies.filter(m=>m.status==='want').sort(hasShows()?byNext:byTitle); }
async function shareWatchlist(){
  const films = myWatchlist(); if(!films.length) return;
  const url = listURL(films), title = 'My IFFI Goa 2026 watchlist', text = `My IFFI Goa 2026 watchlist – ${films.length} film${films.length>1?'s':''} 🎬`;
  if(navigator.share && matchMedia('(pointer: coarse)').matches){ try{ await navigator.share({title, text, url}); }catch(e){} return; }
  const wa = 'https://wa.me/?text='+encodeURIComponent(text+'\n'+url);
  openModal(`<div class="sharedlg"><h2>Share your list</h2><p>Anyone with this link can see your ${films.length} film${films.length>1?'s':''}. Share again after you change your list.</p>
    <div class="shr-link"><input readonly value="${esc(url)}" onclick="this.select()" aria-label="Link to your list"><button class="icbtn" onclick="copyText('${esc(url)}')" aria-label="Copy link" title="Copy link">${IC.copy}</button></div>
    <div class="shr-opts">
      <button onclick="copyText('${esc(url)}')"><span class="ico">${IC.link}</span>Copy link</button>
      <a href="${esc(wa)}" target="_blank" rel="noopener"><span class="ico wa">${IC.wa}</span>WhatsApp</a>
      <a href="${esc(url)}" target="_blank" rel="noopener"><span class="ico">${IC.open}</span>Open</a>
    </div></div>`);
}
async function copyText(t){ try{ await navigator.clipboard.writeText(t); toast('Link copied'); }catch(e){ toast('Could not copy – select the link and copy it'); } }
function sharedFilms(code){
  const seen=new Set(); return String(code||'').split('.').map(sl=>db.movies.find(m=>slug(m.title)===sl)).filter(m=>m && !seen.has(m.id) && seen.add(m.id));
}
function openSharedList(code){
  const films = sharedFilms(code), n = now();
  if(!films.length){ openModal(`<div class="ask"><h2>This list is empty</h2><p>The link may be incomplete. Ask for it to be shared again.</p><button class="btn primary" onclick="closeModal()">Browse all films</button></div>`, ROOT+'list/?f='+encodeURIComponent(code||'')); return; }
  const rows = films.map(m=>{
    const ups = allScreenings().filter(x=>x.m===m && x.end>n), nx = ups[0];
    const when = nx ? `Next: ${dayWord(nx.start)}, ${fmtTime(nx.start)} · ${esc(venueOf(nx.s.venue)?.name||nx.s.venue||'')}${ups.length>1?` <span class="more">+${ups.length-1} more</span>`:''}` : (m.screenings||[]).some(s=>s.date) ? 'No more showtimes' : 'Showtime to be announced';
    const meta = [m.director, m.runtime||m.screenings?.length ? runtime(m)+' min' : '', m.language].filter(Boolean).map(esc).join(' · ');
    return `<button class="srow" onclick="openDetail('${m.id}')"><div class="mini">${poster(m,true)}</div><div class="info"><div class="t">${esc(m.title)}${m.status==='want'?' <span class="tag saved">Saved</span>':''}</div><div class="meta">${meta}</div><div class="when">${when}</div></div></button>`;
  }).join('');
  const all = films.every(m=>m.status==='want'||m.status==='watched');
  openModal(`<div class="slist"><h2>IFFI Goa 2026 watchlist</h2><p class="upd">${films.length} film${films.length>1?'s':''} · shared from Festival Diaries · Goa</p>
    <div class="srows">${rows}</div>
    <div class="pact">${all ? '<span class="done">✓ All in your list</span>' : `<button class="pillbtn on" onclick="saveSharedList('${esc(code)}')">${IC.bookmark}Save all</button>`}<button class="linkbtn more" onclick="closeModal()">Browse all films →</button></div></div>`, ROOT+'list/?f='+encodeURIComponent(code).replace(/%2E/gi,'.'));
}
function saveSharedList(code){
  const films = sharedFilms(code);
  if(!cloud.user){ cloud.pendingList = code; return askSignIn(); }
  let k=0; for(const m of films) if(m.status!=='want' && m.status!=='watched'){ m.status='want'; k++; }
  save(); render(); openSharedList(code); toast(k ? `Saved ${k} film${k>1?'s':''} to My list` : 'Already in your list');
}
function renderMine(){
  if(!cloud.user) return `<div class="empty ask" style="max-width:420px;margin:30px auto"><h2>Your list lives here</h2><p>Sign in with Google to save films and keep track of what you’ve watched – on any device.</p><button class="btn primary" onclick="cloudToggle()">Continue with Google</button>${CONSENT_NOTE}</div>`;
  const nw = db.movies.filter(m=>m.status==='want').length, nd = db.movies.filter(m=>m.status==='watched').length;
  const t = state.mineTab==='watched' ? 'watched' : 'want';
  return `<div class="mseg" role="tablist"><button role="tab" aria-selected="${t==='want'}" class="${t==='want'?'on':''}" onclick="state.mineTab='want';persistUI();render()">To watch<small>${nw}</small></button><button role="tab" aria-selected="${t==='watched'}" class="${t==='watched'?'on':''}" onclick="state.mineTab='watched';persistUI();render()">Watched<small>${nd}</small></button></div>` + (t==='want' && nw ? `<div class="sharebar"><span>${nw} film${nw>1?'s':''} you want to see</span><button class="pillbtn" onclick="shareWatchlist()">${IC.share}Share</button></div>` : '') + renderGrid(t);
}

const statusLabel = m => m.status==='watched' ? 'Watched' : m.status==='want' ? 'Watchlist' : '';
const LCOLS = [['title','Title'],['genre','Genre'],['director','Director','hm'],['country','Country','hm'],['language','Language','hm'],['year','Year','hm'],['section','Section'],['premiere','Premiere','hm'],['conf','Screening'],['status','Status','st']];
const lval = (m,k) => k==='year' ? (+m.year||0) : k==='conf' ? (confirmInfo(m)?'Confirmed':'') : k==='status' ? statusLabel(m) : (m[k]||'');
function listRows(){
  const k = state.lsort||'title', dir = state.ldir||1;
  return db.movies.filter(m => matches(m) && tagOK(m) && fOK(m))
    .sort((a,b) => { const x=lval(a,k), y=lval(b,k); return (typeof x==='number' ? x-y : String(x).localeCompare(String(y))) * dir || a.title.localeCompare(b.title); });
}
function sortList(k){ state.ldir = state.lsort===k ? -(state.ldir||1) : 1; state.lsort = k; render(); }
function tableHtml(rows, kind){
  const k = state.lsort, dir = state.ldir||1;
  if(k) rows = [...rows].sort((a,b) => { const x=lval(a,k), y=lval(b,k); return (typeof x==='number' ? x-y : String(x).localeCompare(String(y))) * dir || a.title.localeCompare(b.title); });
  let html = `<div class="tblwrap"><table class="tbl"><thead><tr>${LCOLS.map(([c,l,h])=>`<th class="${h||''}" onclick="sortList('${c}')">${l}${k===c?(dir>0?' ↑':' ↓'):''}</th>`).join('')}</tr></thead><tbody>`;
  html += rows.map(m => `<tr data-pid="${m.id}" tabindex="0" onclick="openDetail('${m.id}')">
    <td class="t">${kind==='rec'?`<span style="color:var(--muted)">#${m.recRank}</span> `:''}${esc(m.title)}${m.originalTitle?`<div style="font-weight:400;color:var(--muted);font-size:14px">${esc(m.originalTitle)}</div>`:''}</td>
    <td class="m">${esc(m.genre||'')}${m.genreUnverified?' <span title="Best guess – not verified" style="color:var(--muted)">?</span>':''}</td><td class="hm">${esc(m.director)}</td><td class="hm" title="${esc(m.country)}">${(()=>{ const c=String(m.country||'').split(',').map(x=>x.trim()).filter(Boolean); return esc(c.slice(0,2).join(', '))+(c.length>2?` <span style="color:var(--muted)">+${c.length-2}</span>`:''); })()}</td><td class="hm m">${esc(m.language)}</td><td class="hm m">${esc(m.year)}</td>
    <td>${esc(m.section)}</td><td class="hm m">${esc(m.premiere||'')}</td>
    <td style="color:var(--green)">${confirmInfo(m)?'Confirmed':''}</td><td class="m st">${statusLabel(m)}</td></tr>`).join('');
  return html + `</tbody></table></div>`;
}
function downloadCSV(){
  const q = v => `"${String(v??'').replace(/"/g,'""')}"`;
  const head = ['Title','Original title','Genre','Director','Country','Language','Year','Section','Premiere','Screening confirmed','Status','IFFI link'];
  const lines = [head.map(q).join(',')].concat(listRows().map(m => [m.title,m.originalTitle,m.genre,m.director,m.country,m.language,m.year,m.section,m.premiere,confirmInfo(m)?'Yes':'',statusLabel(m),m.link].map(q).join(',')));
  download('iffi-2026-films.csv', '\ufeff'+lines.join('\r\n'), 'text/csv');
}

function renderStats(){
  const w = db.movies.filter(m=>m.status==='watched');
  const mins = w.reduce((t,m)=>t+runtime(m),0);
  const rated = w.filter(m=>m.rating);
  const avg = rated.length ? (rated.reduce((t,m)=>t+m.rating,0)/rated.length).toFixed(1) : '–';
  const countries = new Set(w.map(m=>m.country).filter(Boolean));
  const n=now();
  const goingN = allScreenings().filter(x=>x.s.going && x.start>n).length;
  const by = (arr,key) => Object.entries(arr.reduce((o,m)=>{ const k=m[key]||'Unknown'; o[k]=(o[k]||0)+1; return o; },{})).sort((a,b)=>b[1]-a[1]);
  const bar = (rows) => { const max = Math.max(1,...rows.map(r=>r[1])); return rows.slice(0,8).map(([k,v])=>`<div style="display:flex;align-items:center;gap:10px;margin:6px 0"><div style="width:180px;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(k)}</div><div style="flex:1;background:var(--bg);border-radius:4px;height:16px"><div style="width:${v/max*100}%;height:100%;background:var(--green);border-radius:4px"></div></div><div style="width:24px;text-align:right;font-size:15px">${v}</div></div>`).join('') || '<div style="color:var(--muted)">Nothing yet</div>'; };
  const top = [...rated].sort((a,b)=>b.rating-a.rating).slice(0,6);
  return `<div class="stats">
    <div class="stat"><b>${w.length}</b><span>films watched</span></div>
    <div class="stat"><b>${Math.floor(mins/60)}h ${mins%60}m</b><span>in the dark</span></div>
    <div class="stat"><b>${avg}</b><span>average rating</span></div>
    <div class="stat"><b>${countries.size}</b><span>countries visited</span></div>
    <div class="stat"><b>${db.movies.filter(m=>m.status==='want').length}</b><span>still on watchlist</span></div>
    <div class="stat"><b>${goingN}</b><span>upcoming shows you’re going to</span></div>
  </div>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px">
    <div class="stat"><div style="font-weight:700;margin-bottom:6px">Watched by section</div>${bar(by(w,'section'))}</div>
    <div class="stat"><div style="font-weight:700;margin-bottom:6px">Watched by country</div>${bar(by(w,'country'))}</div>
  </div>
  ${top.length?`<h2 class="day"><span>Your festival favourites</span></h2><div class="grid">${top.map(m=>`<div class="card" onclick="openDetail('${m.id}')">${poster(m)}<div class="cap">${esc(m.title)}</div><div class="sub"><span class="stars">${stars(m.rating)}</span></div></div>`).join('')}</div>`:''}`;
}

/* countdown ticker */
function tick(){ document.querySelectorAll('[data-cd]').forEach(el=>{
  let ms = +el.dataset.cd - Date.now(); if(ms<0){ el.textContent='Now'; return; }
  const d=Math.floor(ms/864e5), h=Math.floor(ms/36e5)%24, m=Math.floor(ms/6e4)%60, s=Math.floor(ms/1e3)%60;
  el.textContent = d ? `${d}d ${h}h ${m}m` : `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}); }
setInterval(tick, 1000);
const setHdr = () => document.documentElement.style.setProperty('--hdr', (document.querySelector('header')?.offsetHeight||64)+'px');
addEventListener('resize', setHdr); setHdr();

/* ---------- actions ---------- */
const find = id => db.movies.find(m=>m.id===id);
function toggleS(mid,sid,field){
  const m=find(mid), s=m.screenings.find(s=>s.id===sid);
  s[field]=!s[field];
  if(m.status==='none' && (s.going||s.booked)) m.status='want';
  save(); render(); if($('#scrim').classList.contains('open')) openDetail(mid);
  if(s[field] && clashes().has(s.id)) toast('⚠️ Heads up: this overlaps another show on your plan, or leaves too little time to travel');
}
function quickWatched(mid,sid){
  const m=find(mid); const s=m.screenings.find(s=>s.id===sid);
  m.status='watched'; m.watchedOn = s?.date || localISO(); m.watchedAt = sid;
  save(); render(); openDetail(mid); toast('Logged! Give it a rating ★');
}
function setStatus(mid,st){
  if(!cloud.user) return askSignIn(mid,st);
  const m=find(mid);
  if(st==='priority'){ m.priority=!m.priority; }
  else {
    m.status = m.status===st ? 'none' : st;
    if(m.status==='watched' && !m.watchedOn) m.watchedOn = localISO();
  }
  save(); render(); openDetail(mid);
}
function setRating(mid,r){ if(!cloud.user) return askSignIn(mid,'watched'); const m=find(mid); m.rating = m.rating===r ? 0 : r; if(m.status!=='watched'){ m.status='watched'; m.watchedOn=m.watchedOn||localISO();} save(); render(); openDetail(mid); }
function toggleLike(mid){ const m=find(mid); m.liked=!m.liked; save(); render(); openDetail(mid); }
function quickSave(mid){ if(!cloud.user) return askSignIn(mid,'want'); const m=find(mid); if(!m) return; m.status = m.status==='want' ? 'none' : 'want'; save(); render(); toast(m.status==='want'?'Saved to My list':'Removed from My list'); }
function askSignIn(mid,st,sid){
  const m=find(mid), back=$('#scrim').classList.contains('open'); const sc=sid&&m?.screenings.find(y=>y.id===sid); cloud.pending = m ? {t:m.title.toLowerCase(), st, sk:sc?skey(sc):''} : null;
  openModal(`<div class="ask"><h2>${st==='watched'?'Keep track of what you watch':m?'Save films to your list':'Sign in to save your list'}</h2><p>Sign in with Google so your list is saved to your account and works on all your devices.</p><button class="btn primary" onclick="cloudToggle()">Continue with Google</button><button class="btn" onclick="${m&&back?`openDetail('${m.id}')`:'closeModal()'}">Not now</button>${CONSENT_NOTE}</div>`);
}
const slug = t => String(t||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const ytUrl = m => 'https://www.youtube.com/results?search_query=' + encodeURIComponent(`${m.title} ${m.director||''} trailer`.replace(/\s+/g,' '));
const mapUrl = v => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(/goa/i.test(v) ? v : v+', Goa');
function addToCal(mid,sid){
  const m=find(mid), s=m&&(m.screenings||[]).find(x=>x.id===sid); if(!s) return;
  const st=dt(s), en=endOf(m,s), f=d=>d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
  const title=`${m.title} – IFFI`, where=[s.venue,s.screen].filter(Boolean).join(', '), link=filmURL(m);
  if(/Android/i.test(navigator.userAgent)){ window.open('https://calendar.google.com/calendar/render?action=TEMPLATE&text='+encodeURIComponent(title)+'&dates='+f(st)+'/'+f(en)+'&location='+encodeURIComponent(where)+'&details='+encodeURIComponent(link), '_blank', 'noopener'); return; }
  const e = v => String(v).replace(/[\\;,]/g,c=>'\\'+c).replace(/\n/g,'\\n');
  const ics=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Festival Diaries Goa//EN','BEGIN:VEVENT','UID:'+sid+'-'+slug(m.title)+'@festivaldiaries','DTSTAMP:'+f(new Date()),'DTSTART:'+f(st),'DTEND:'+f(en),'SUMMARY:'+e(title),'LOCATION:'+e(where),'DESCRIPTION:'+e(link),'BEGIN:VALARM','TRIGGER:-PT1H','ACTION:DISPLAY','DESCRIPTION:'+e(title),'END:VALARM','END:VEVENT','END:VCALENDAR'].join('\r\n');
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([ics],{type:'text/calendar'})); a.download=slug(m.title)+'.ics'; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function shareFilm(mid){
  const m=find(mid); if(!m) return;
  const url = filmURL(m);
  const text = `${m.title}${m.director?' by '+m.director:''} – at IFFI Goa 2026`;
  if(navigator.share) navigator.share({title:m.title, text, url}).catch(()=>{});
  else window.open('https://wa.me/?text='+encodeURIComponent(text+'\n'+url), '_blank', 'noopener');
}
function openFromHash(){
  const r=initRoute.pending; initRoute.pending=null;
  if(r && !openRoute(r)) toast('That page isn’t here any more – showing all films');
  syncTitle();
}
window.addEventListener('hashchange', ()=>{ if(/(film|venue)=/.test(location.hash)){ initRoute(); openFromHash(); } });
function saveReview(mid,v){ const m=find(mid); m.review=v; save(); }
function delMovie(mid){ if(!confirm('Delete this film and its showtimes?')) return; db.movies=db.movies.filter(m=>m.id!==mid); save(); closeModal(); render(); toast('Deleted'); }

/* ---------- modals ---------- */
function openModal(html, url){ const wasOpen=$('#scrim').classList.contains('open'); $('#modal').innerHTML = `<button class="x" onclick="closeModal()" aria-label="Close">×</button>` + html; $('#scrim').classList.add('open'); document.body.style.overflow='hidden'; if(!wasOpen && !history.state?.modal) history.pushState({modal:1},'',url||location.href); else if(url && location.href!==url) history.replaceState(history.state,'',url); syncTitle(); if(!wasOpen){ openModal._ret=document.activeElement; $('#modal .x').focus({preventScroll:true}); } }
function closeModal(fromBack){ if(!$('#scrim').classList.contains('open')) return; $('#scrim').classList.remove('open'); document.body.style.overflow=''; try{ openModal._ret?.focus({preventScroll:true}); }catch(e){} if(fromBack!==true && history.state?.modal) history.back(); }
window.addEventListener('popstate', ()=>{ if($('#sheet').classList.contains('open')) closeSheet(true); else if($('#scrim').classList.contains('open')) closeModal(true); });
window.addEventListener('popstate', ()=>{   // keep the page in step with the URL (back / forward)
  const r=routeOf();
  if(r.film||r.venue||r.privacy||r.list!==undefined){ if(!$('#scrim').classList.contains('open')) openRoute(r); }
  else if(state.view!==r.view) setView(r.view, true);
  syncTitle();
});

function openDetail(id){
  const m = find(id); if(!m) return;
  const n = now(), cl = clashes();
  const scr = [...(m.screenings||[])].sort((a,b)=>dt(a)-dt(b));
  const r = m.rating||0;
  const starsHtml = [1,2,3,4,5].map(i=>{
    const full = r>=i, half = !full && r>=i-.5;
    return `<span class="${full||half?'on':''}" title="Click: ${i} · Shift-click: ${i-.5}" onclick="setRating('${m.id}', event.shiftKey||event.altKey ? ${i-.5} : ${i})">${half?'⯪':'★'}</span>`;
  }).join('');
  const cs = String(m.country||'').split(',').map(x=>x.trim()).filter(Boolean);
  const meta = [m.genre, cs.length ? cs[0]+(cs.length>1?` +${cs.length-1}`:'') : '', m.language, m.runtime?m.runtime+' min':''].filter(Boolean).map(esc).join(' · ');
  const extra = [m.originalTitle?`<div><b>Original title:</b> ${esc(m.originalTitle)}</div>`:'', cs.length>1?`<div><b>Countries:</b> ${esc(cs.join(', '))}</div>`:'', m.cast?`<div><b>Cast:</b> ${esc(m.cast)}</div>`:'', m.festivals?`<div><b>Festivals:</b> ${esc(String(m.festivals).replace(/\s*\|\s*/g,', '))}</div>`:'', m.notes?`<div>${esc(m.notes)}</div>`:''].join('');
  const going = scr.find(s=>(s.going||s.booked) && endOf(m,s)>n);
  const I = d => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  openModal(`<button class="shr" aria-label="Share this film" title="Share" onclick="shareFilm('${m.id}')">${I('<path d="M12 15V3.5M7.5 8L12 3.5 16.5 8"/><path d="M5 12.5v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>')}</button><div class="dhead">
    <a class="dposter" href="${ytUrl(m)}" target="_blank" rel="noopener" aria-label="Watch the trailer of ${esc(m.title)} on YouTube">${poster(m)}<span class="play"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M7 4.5v15l12.5-7.5z" fill="currentColor"/></svg>Trailer</span></a>
    <div class="dinfo">
      <h2>${esc(m.title)}</h2>
      ${meta?`<div class="dmeta">${meta}</div>`:''}
      ${m.director?`<div class="dmeta">Directed by <b>${esc(m.director)}</b></div>`:''}
      ${m.section?`<div class="dmeta">${esc(m.section)}</div>`:''}
      ${confirmInfo(m)?`<span class="tag booked" style="margin-top:6px">✓ Screening confirmed</span>`:''}
    </div>
  </div>
  ${m.status==='watched'
    ? `<div class="myrate"><span>✓ You’ve seen this</span><div class="rate">${starsHtml}</div><button class="linkbtn" onclick="setStatus('${m.id}','watched')">Undo</button></div>`
    : `${going
      ? `<button class="pbtn going" onclick="document.getElementById('dshows')?.scrollIntoView({behavior:'smooth',block:'start'})">${I('<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>')}<span><b>Going</b> · ${fmtShort(dt(going))} · ${fmtTime(dt(going))}${going.venue?' · '+esc(going.venue):''}</span></button>`
      : `<button class="pbtn ${m.status==='want'?'on':''}" aria-pressed="${m.status==='want'}" onclick="setStatus('${m.id}','want')">${I(m.status==='want'?'<path d="M5 12.5l4.5 4.5L19 7.5"/>':'<path d="M6.5 3.5h11v17l-5.5-4-5.5 4z"/>')}<span>${m.status==='want'?'On my list':'Want to see'}</span></button>`}
      <div class="seenrow"><button class="linkbtn" onclick="setStatus('${m.id}','watched')">Already seen it?</button></div>`}
  ${m.synopsis||extra?`<div class="dsyn"><p class="syn clamp">${esc(m.synopsis||'')}</p><div class="dextra" hidden>${extra}</div><button class="linkbtn rmore" onclick="const d=this.parentNode;const o=d.classList.toggle('open');d.querySelector('.dextra').hidden=!o;this.textContent=o?'Show less':'Read more'">Read more</button></div>`:''}
  ${ratingsBlock(m)}
  ${m.status==='watched' ? `<div class="myrate"><span>Your rating</span><div class="rate">${starsHtml}</div></div>` : ''}
  ${scr.length?'<div id="dshows" style="font-weight:700;margin:14px 0 4px;scroll-margin-top:12px">Showtimes</div>':''}
  <div>${scr.length ? scr.map(s=>{
    const st=dt(s), en=endOf(m,s), past=en<n;
    return `<div class="scr" style="${past?'opacity:.55':''}">
      <div><b>${fmtShort(st)}, ${fmtTime(st)}</b> <span style="color:var(--muted)">– ${fmtTime(en)}</span><br>
        <span style="color:var(--muted);font-size:15px">📍 ${s.venue?(venueOf(s.venue)?`<a class="vlink" href="${venueURL(venueOf(s.venue))}" onclick="event.preventDefault();openVenue('${venueOf(s.venue).id}')">${esc(s.venue)}</a>`:`<a class="vlink" href="${mapUrl(s.venue)}" target="_blank" rel="noopener">${esc(s.venue)}</a>`):'Venue TBA'}${s.screen?' · '+esc(s.screen):''}${s.seat?' · Seat '+esc(s.seat):''}</span>
        ${s.note?`<div class="snote">${esc(s.note)}</div>`:''}
        <span style="font-size:14px;margin-left:6px">${s.source?srcLink(s.source,'Source'):'<span style="color:var(--muted)">· no source</span>'}</span>
        <div>${s.going?'<span class="tag plan">Going</span>':''}${cl.has(s.id)?'<span class="tag clash">Clash</span>':''}${m.watchedAt===s.id?'<span class="tag booked">Watched here</span>':''}</div>
      </div>
      <div class="acts" style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">${past
        ? (m.status!=='watched'?`<button class="btn sm" onclick="quickWatched('${m.id}','${s.id}')">✓ Watched this</button>`:'')
        : `<button class="btn sm" onclick="toggleS('${m.id}','${s.id}','going')">${s.going?'✓ Going':'+ Going'}</button>${s.going?`<button class="btn sm" onclick="addToCal('${m.id}','${s.id}')">📅 Add to calendar</button>`:''}`}</div>
    </div>`;}).join('') : ''}</div>
  `, filmURL(m));
}

let editScr = [];
function openEdit(id){
  const m = id ? find(id) : {status:'want', screenings:[]};
  editScr = JSON.parse(JSON.stringify(m.screenings||[]));
  const opt = (arr,v) => arr.map(x=>`<option ${x===v?'selected':''}>${esc(x)}</option>`).join('');
  openModal(`<h2 style="margin:0 0 14px">${id?'Edit film':'Add a film'}</h2>
  <form id="f" onsubmit="event.preventDefault();submitEdit('${id||''}')">
    <div class="g">
      <label class="full">Title *<input name="title" required value="${esc(m.title||'')}" autofocus></label>
      <label>Original title<input name="originalTitle" value="${esc(m.originalTitle||'')}"></label>
      <label>Director<input name="director" value="${esc(m.director||'')}"></label>
      <label>Country<input name="country" value="${esc(m.country||'')}"></label>
      <label>Language<input name="language" value="${esc(m.language||'')}"></label>
      <label>Genre<input name="genre" value="${esc(m.genre||'')}" placeholder="Drama, Thriller"></label>
      <label>Year<input name="year" type="number" value="${esc(m.year||'')}"></label>
      <label>Runtime (min)<input name="runtime" type="number" value="${esc(m.runtime||'')}" placeholder="120"></label>
      <label>Section<select name="section"><option value="">—</option>${opt(db.sections,m.section)}</select></label>
      <label>Status<select name="status">
        <option value="want" ${m.status==='want'?'selected':''}>Want to watch</option>
        <option value="watched" ${m.status==='watched'?'selected':''}>Watched</option>
        <option value="none" ${m.status==='none'?'selected':''}>Just tracking</option></select></label>
      <label class="full">Poster image URL<input name="poster" value="${esc(m.poster||'')}" placeholder="https://… (optional)"></label>
      <label class="full">Synopsis<textarea name="synopsis" rows="3">${esc(m.synopsis||'')}</textarea></label>
      <label>Notes (buzz, who recommended…)<input name="notes" value="${esc(m.notes||'')}"></label>
      <label>Link (IFFI page, trailer)<input name="link" value="${esc(m.link||'')}"></label>
      <label class="full">IMDb ID (optional – e.g. tt1234567, makes ratings match exactly)<input name="imdbID" value="${esc(m.imdbID||'')}" placeholder="tt…"></label>
      <label class="full">Tags (comma separated)<input name="tags" value="${esc((m.tags||[]).join(', '))}" placeholder="Competition, India Premiere, …"></label>
      <label style="flex-direction:row;align-items:center;gap:8px;color:var(--text)"><input type="checkbox" name="confirmedOn" ${m.confirmed?.on?'checked':''} style="width:auto"> Screening confirmed</label>
      <label>Confirmation source (link or note)<input name="confirmedSource" value="${esc(m.confirmed?.source||'')}" placeholder="https://… or 'IFFI app schedule'"></label>
      <label class="full" style="flex-direction:row;align-items:center;gap:8px;color:var(--text)"><input type="checkbox" name="priority" ${m.priority?'checked':''} style="width:auto"> Must-see (highlight in schedule)</label>
    </div>
    <div style="font-weight:700;margin:16px 0 8px;display:flex;justify-content:space-between;align-items:center">Showtimes <button type="button" class="btn sm" onclick="addScr()">+ Add showtime</button></div>
    <datalist id="venues">${db.venues.map(v=>`<option value="${esc(v)}">`).join('')}</datalist>
    <div id="scrList"></div>
    <div class="foot"><span></span><div style="display:flex;gap:8px"><button type="button" class="btn" onclick="${id?`openDetail('${id}')`:'closeModal()'}">Cancel</button><button class="btn primary">Save film</button></div></div>
  </form>`);
  if(!id && !editScr.length) addScr(); else drawScr();
}
function drawScr(){
  $('#scrList').innerHTML = editScr.length ? editScr.map((s,i)=>`<div class="sedit">
    <input type="date" value="${esc(s.date||'')}" oninput="editScr[${i}].date=this.value">
    <input type="time" value="${esc(s.time||'')}" oninput="editScr[${i}].time=this.value">
    <input list="venues" placeholder="Venue" value="${esc(s.venue||'')}" oninput="editScr[${i}].venue=this.value">
    <input placeholder="Screen / Audi" value="${esc(s.screen||'')}" oninput="editScr[${i}].screen=this.value">
    <input placeholder="Source (link)" value="${esc(s.source||'')}" oninput="editScr[${i}].source=this.value">
    <div style="display:flex;gap:6px;align-items:center">
      <button type="button" class="btn sm danger" onclick="editScr.splice(${i},1);drawScr()">✕</button>
    </div>
  </div>`).join('') : `<div style="color:var(--muted);font-size:15px">No showtimes. You can add them later.</div>`;
}
function addScr(){
  const last = editScr[editScr.length-1];
  editScr.push({id:uid(), date: last?.date || defaultDate(), time:'', venue:last?.venue||'', screen:'', source:'', going:false});
  drawScr();
}
function defaultDate(){ return localISO(); }
function submitEdit(id){
  const fd = new FormData($('#f'));
  const data = Object.fromEntries(fd.entries());
  data.priority = !!fd.get('priority');
  data.tags = String(data.tags||'').split(',').map(t=>t.trim()).filter(t=>t && t!==CONF);
  data.confirmed = {on: !!fd.get('confirmedOn'), source: (data.confirmedSource||'').trim()};
  delete data.confirmedOn; delete data.confirmedSource;
  data.runtime = data.runtime ? +data.runtime : '';
  const scr = editScr.filter(s=>s.date).map(s=>({...s, going: !!(s.going || s.booked), booked:false, seat:''}));
  scr.forEach(s=>{ if(s.venue && !db.venues.includes(s.venue)) db.venues.splice(db.venues.length-1,0,s.venue); });
  let m;
  const idKey = x => [x.title,x.originalTitle,x.year,x.imdbID].join('|');
  const changed = !id || idKey(find(id)) !== idKey(data);
  if(id){ m=find(id); Object.assign(m, data, {screenings:scr}); if(changed) delete m.ratings; }
  else { m={id:uid(), added:Date.now(), rating:0, ...data, screenings:scr}; db.movies.push(m); }
  if(m.status==='watched' && !m.watchedOn) m.watchedOn = localISO();
  save(); render(); openDetail(m.id); toast(id?'Saved':'Added to your diary');
  if(changed && db.omdbKey) fetchRatings(m.id);
}

/* ---------- ratings (OMDb: IMDb + Rotten Tomatoes + Metacritic) ---------- */
function ratingsBlock(m){
  const r = m.ratings, t = encodeURIComponent(m.title), q = encodeURIComponent(m.title+(m.year?' '+m.year:''));
  const chip = (icon,label,val,href) => `<a class="rchip" href="${href}" target="_blank" rel="noopener"><span>${icon}</span><b>${esc(val)}</b><small>${label}</small></a>`;
  let chips = '';
  if(r && !r.notFound){
    if(r.rt) chips += chip('🍅','Rotten Tomatoes',r.rt,`https://www.rottentomatoes.com/search?search=${t}`);
    if(r.imdb) chips += chip('⭐','IMDb'+(r.imdbVotes?` · ${esc(r.imdbVotes)} votes`:''),r.imdb+'/10',`https://www.imdb.com/title/${esc(r.imdbID)}/`);
    if(r.mc) chips += chip('Ⓜ️','Metacritic',r.mc,`https://www.metacritic.com/search/${t}/`);
  }
  return chips ? `<div class="ratings"><div class="rrow">${chips}</div></div>` : '';
}
function setKey(cb){
  const k = prompt('Ratings come from OMDb (IMDb, Rotten Tomatoes, Metacritic).\nGet a free key at omdbapi.com/apikey.aspx (it arrives by email), then paste it here:', db.omdbKey||'');
  if(k===null) return;
  db.omdbKey = k.trim(); save();
  if(db.omdbKey){ toast('Key saved'); if(typeof cb==='function') cb(); }
}
async function fetchRatings(mid, quiet){
  const m = find(mid); if(!m) return;
  if(!db.omdbKey){ if(!quiet) setKey(()=>fetchRatings(mid)); return; }
  const get = async qs => (await fetch(`https://www.omdbapi.com/?apikey=${encodeURIComponent(db.omdbKey)}&type=movie${qs}`)).json();
  const yr = m.year ? `&y=${encodeURIComponent(m.year)}` : '';
  try{
    let d;
    if(m.imdbID) d = await get(`&i=${encodeURIComponent(m.imdbID.trim())}`);
    else {
      d = await get(`&t=${encodeURIComponent(m.title)}${yr}`);
      if(d.Response==='False' && m.originalTitle) d = await get(`&t=${encodeURIComponent(m.originalTitle)}${yr}`);
      if(d.Response==='False' && m.year){ // retry without year, but only accept a close year (avoids matching an old film of the same name)
        const d2 = await get(`&t=${encodeURIComponent(m.title)}`);
        if(d2.Response!=='False' && Math.abs(parseInt(d2.Year)-m.year)<=1) d = d2;
      }
    }
    if(d.Error && /key/i.test(d.Error)){ toast('OMDb says the key is invalid or not activated yet'); return 'stop'; }
    if(d.Error && /limit/i.test(d.Error)){ toast('OMDb daily limit reached – try tomorrow'); return 'stop'; }
    const ok = v => v && v!=='N/A' ? v : '';
    if(d.Response==='False') m.ratings = {notFound:true, fetched:Date.now()};
    else {
      const R = Object.fromEntries((d.Ratings||[]).map(x=>[x.Source,x.Value]));
      m.ratings = {rt:ok(R['Rotten Tomatoes']), mc:ok(R['Metacritic']), imdb:ok(d.imdbRating), imdbVotes:ok(d.imdbVotes), imdbID:d.imdbID, matched:`${d.Title} (${d.Year})`, fetched:Date.now()};
      if(!m.poster && ok(d.Poster)) m.poster = d.Poster;
      if(!m.genre && ok(d.Genre)){ m.genre = d.Genre; (m.sources ||= []).push({label:'OMDb (genre)', url:`https://www.imdb.com/title/${d.imdbID}/`}); }
      if(!m.runtime && parseInt(d.Runtime)) m.runtime = parseInt(d.Runtime);
    }
    save(); render();
    if(!quiet && $('#scrim').classList.contains('open')) openDetail(mid);
  }catch(e){ if(!quiet) toast('Could not reach OMDb – are you online?'); return 'stop'; }
}
async function fetchAll(){
  if(!db.omdbKey) return setKey(fetchAll);
  const list = db.movies.filter(m => !m.ratings || Date.now()-m.ratings.fetched > 864e5);
  if(!list.length) return toast('All ratings are fresh (updated in the last day)');
  toast(`Fetching ratings for ${list.length} film${list.length>1?'s':''}…`);
  for(const m of list){ if(await fetchRatings(m.id, true)==='stop') return toast('Stopped: OMDb error (key, limit or offline)'); }
  toast('Ratings updated');
}

/* ---------- menu ---------- */
function download(name, text, type){
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([text],{type})); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function menuAction(a){
  $('#menu').classList.remove('open');
  if(a==='export') download(`iffi-diary-${localISO()}.json`, JSON.stringify({...db, omdbKey:undefined},null,2), 'application/json');
  if(a==='import') $('#file').click();
  if(a==='official') loadOfficial();
  if(a==='ics') exportICS();
  if(a==='venues') editLists();
  if(a==='wipe'){ if(confirm('Erase all films, showtimes and ratings? Export a backup first if unsure.')){ db={movies:[],venues:[...DEFAULT_VENUES],sections:[...DEFAULT_SECTIONS]}; save(); render(); } }
  if(a==='demo') loadDemo();
  if(a==='ratings') fetchAll();
  if(a==='key') setKey();
  if(a==='cloud') cloudToggle();
  if(a==='privacy') openPrivacy();
  if(a==='delacct') deleteAccount();
}
$('#file').onchange = async e => {
  const f=e.target.files[0]; if(!f) return;
  try{
    const d = JSON.parse(await f.text());
    const incoming = Array.isArray(d) ? d : d.movies;
    if(!Array.isArray(incoming)) throw 0;
    const replace = !window._forceMerge && !Array.isArray(d) && confirm('OK = replace everything with this backup.\nCancel = merge these films into your diary.');
    if(replace){ db = {venues:DEFAULT_VENUES, sections:DEFAULT_SECTIONS, ...d, omdbKey:db.omdbKey}; }
    else {
      let added=0, updated=0;
      for(const m of incoming){
        if(!m.title) continue;
        const ex = db.movies.find(x=>x.title.toLowerCase()===String(m.title).toLowerCase());
        const screenings = (m.screenings||[]).map(s=>({id:uid(),...s}));
        if(ex){
          if(screenings.some(s=>s.off)){   // official schedule: replace earlier official showtimes, keep your own picks
            const prev=Object.fromEntries((ex.screenings||[]).filter(s=>s.off).map(s=>[s.id,s]));
            ex.screenings = [...(ex.screenings||[]).filter(s=>!s.off), ...screenings.map(s=>({...s, going:!!(prev[s.id]?.going||prev[s.id]?.booked), booked:false, seat:''}))];
          } else ex.screenings = [...(ex.screenings||[]), ...screenings.filter(s=>!ex.screenings.some(o=>o.date===s.date&&o.time===s.time&&o.venue===s.venue))];
          for(const k of ['notes','originalTitle','genre','genreUnverified','recRank','director','country','language','year','runtime','section','synopsis','poster','link','cast','festivals','premiere','pc']) if(k in m) ex[k]=m[k];   // official list is the source of truth
          ex.tags = m.tags ? [...m.tags] : (ex.tags||[]);   // official list decides the tags
          ex.sources = [...(ex.sources||[]), ...(m.sources||[]).filter(x=>!(ex.sources||[]).some(o=>o.url===x.url))];
          if(m.confirmed?.on && !ex.confirmed?.on) ex.confirmed = m.confirmed;
          updated++;
        }
        else { db.movies.push({status:'want', rating:0, ...m, id:uid(), added:Date.now(), screenings}); added++; }
      }
      if(!window._quiet) toast(`Imported ${added} new film${added===1?'':'s'}${updated?`, updated ${updated}`:''}`);
    }
    save(); render();
  }catch(err){ alert('That file is not a valid Festival Diaries backup or film list.'); }
  e.target.value=''; window._forceMerge=false; window._quiet=false;
};
async function loadOfficial(){
  try{
    const txt = officialText() || '';
    if(!txt.trim()) throw 0;
    const dt = new DataTransfer(); dt.items.add(new File([txt], 'iffi-2026-films.json', {type:'application/json'}));
    window._forceMerge = true; $('#file').files = dt.files; $('#file').dispatchEvent(new Event('change'));
  }catch(e){ alert('Could not load the built-in film list.'); }
}
function exportICS(){
  const ev = allScreenings().filter(x=>x.s.booked||x.s.going);
  if(!ev.length) return toast('Mark some shows as Going first');
  const f = d => d.toISOString().replace(/[-:]/g,'').replace(/\.\d+/,'');
  const lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Festival Diaries Goa//EN'];
  for(const x of ev) lines.push('BEGIN:VEVENT',`UID:${x.s.id}@iffi-diary`,`DTSTAMP:${f(new Date())}`,`DTSTART:${f(x.start)}`,`DTEND:${f(x.end)}`,
    `SUMMARY:${x.m.title}`,`LOCATION:${[x.s.venue,x.s.screen].filter(Boolean).join(' - ')}`,`DESCRIPTION:${[x.m.director&&'Dir. '+x.m.director,x.m.section].filter(Boolean).join(' | ')}`,'END:VEVENT');
  lines.push('END:VCALENDAR');
  download('iffi-shows.ics', lines.join('\r\n'), 'text/calendar');
}
function editLists(){
  openModal(`<h2 style="margin:0 0 12px">Venues &amp; sections</h2>
  <form onsubmit="event.preventDefault();db.venues=$('#lv').value.split('\\n').map(s=>s.trim()).filter(Boolean);db.sections=$('#ls').value.split('\\n').map(s=>s.trim()).filter(Boolean);save();closeModal();render();toast('Saved')">
    <div class="g">
      <label>Venues (one per line)<textarea id="lv" rows="12">${esc(db.venues.join('\n'))}</textarea></label>
      <label>Sections (one per line)<textarea id="ls" rows="12">${esc(db.sections.join('\n'))}</textarea></label>
    </div>
    <div class="foot"><button type="button" class="btn" onclick="$('#lv').value=DEFAULT_VENUES.join('\\n');$('#ls').value=DEFAULT_SECTIONS.join('\\n')">Reset to defaults</button><button class="btn primary">Save</button></div>
  </form>`);
}
function loadDemo(){
  // Fictional demo films so you can see how the app works. Delete them anytime.
  const base = new Date(); base.setHours(0,0,0,0);
  const day = k => { const d=new Date(base); d.setDate(d.getDate()+k); return localISO(d); };
  const demo = [
    {title:'The Salt Orchard', director:'Demo Director A', country:'Portugal', language:'Portuguese', year:2026, runtime:104, section:'International Competition', priority:true, synopsis:'(Demo) A widowed fisherman inherits a failing orchard on a windswept coast.', screenings:[{date:day(5),time:'10:00',venue:'INOX Panaji (Old GMC)',screen:'Audi 1',going:true,going:true,seat:'F12'},{date:day(7),time:'17:30',venue:'Maquinez Palace',screen:'Screen 2'}]},
    {title:'Monsoon Ledger', director:'Demo Director B', country:'India', language:'Konkani', year:2026, runtime:118, section:'Indian Panorama – Feature', synopsis:'(Demo) An accountant in Margao finds a decades-old ledger.', screenings:[{date:day(5),time:'11:15',venue:'Kala Academy',screen:'Dinanath Mangeshkar Hall',going:true},{date:day(8),time:'20:00',venue:'INOX Porvorim',screen:'Audi 3'}]},
    {title:'Paper Lanterns Over Seoul', director:'Demo Director C', country:'South Korea', language:'Korean', year:2025, runtime:96, section:'Cinema of the World', screenings:[{date:day(6),time:'14:00',venue:'INOX Panaji (Old GMC)',screen:'Audi 4'}]},
    {title:'Northern Quiet', director:'Demo Director D', country:'Finland', language:'Finnish', year:2026, runtime:89, section:'Best Debut Feature', screenings:[{date:day(6),time:'19:45',venue:'Maquinez Palace',screen:'Screen 1'}]},
    {title:'The Last Projectionist', director:'Demo Director E', country:'Iran', language:'Persian', year:2025, runtime:110, section:'Festival Kaleidoscope', status:'watched', rating:4.5, liked:true, watchedOn:day(-1), review:'(Demo) Gorgeous love letter to cinema.', screenings:[{date:day(-1),time:'18:00',venue:'INOX Panaji (Old GMC)',screen:'Audi 2',going:true,going:true}]},
  ];
  for(const d of demo){ db.movies.push({status:'want', rating:0, ...d, id:uid(), added:Date.now(), screenings:d.screenings.map(s=>({id:uid(),going:false,...s}))}); }
  save(); render(); toast('Demo films added — delete them whenever you like');
}

/* ---------- privacy notice (India DPDP Act 2023) ---------- */
const PRIVACY_V = 1;
const PRIVACY_CONTACT = 'tejaswiraghurama@gmail.com';   // grievance e-mail shown in the notice
const CONSENT_NOTE = `<p class="consent">Signing in saves your name, email and film lists so they sync across your devices. Nothing else is collected. <a href="privacy/" onclick="openPrivacy();return false">Privacy notice</a></p>`;
function privacyHtml(){
  const mail = PRIVACY_CONTACT ? `<a href="mailto:${esc(PRIVACY_CONTACT)}">${esc(PRIVACY_CONTACT)}</a>` : 'the contact on this page';
  const act = cloud.user
    ? `<div class="pact"><p>You’re signed in as <b>${esc(cloud.user.email||cloud.user.displayName||'')}</b>.</p><button class="btn danger" onclick="deleteAccount()">Delete my account and data</button></div>`
    : '';
  return `<article class="priv">
<h2>Privacy &amp; your data</h2><p class="upd">Last updated 17 November 2026</p>
<p>Festival Diaries · Goa is a free, unofficial fan guide to IFFI Goa 2026, run privately by a film fan – not a company. This notice explains what we collect and why, in line with India’s Digital Personal Data Protection Act, 2023.</p>
<h3>If you don’t sign in</h3>
<p>We collect nothing. Anything you do stays on your own phone or computer. There are no ads, no analytics and no tracking cookies.</p>
<h3>If you sign in with Google</h3>
<p>We store:</p>
<ul><li>your <b>name, email address and profile photo</b>, which Google shares when you sign in</li>
<li>your <b>film lists</b> – films you want to see or have seen, showtimes you’re going to, ratings, notes and any films you add</li>
<li>the date you agreed to this notice</li></ul>
<p><b>Why:</b> only to save your lists and show them on all your devices. We never sell or share your data, and never use it for advertising.</p>
<h3>Where it’s kept</h3>
<p>On Google Firebase, which may store it on servers outside India. Google handles it for us under its own security and privacy terms.</p>
<h3>How long we keep it</h3>
<p>Until you delete your account. If we ever close the site, we’ll delete all accounts.</p>
<h3>Your rights</h3>
<ul><li><b>See and correct</b> your data any time in My list.</li>
<li><b>Withdraw consent and delete everything:</b> use <b>Delete my account</b> in the account menu (your photo, top right). Your name, email and lists are erased immediately. Signing out alone keeps your lists saved.</li>
<li><b>Questions or complaints:</b> write to ${mail}. We’ll reply within 30 days. If you’re not satisfied, you can complain to the Data Protection Board of India.</li></ul>
<h3>Children</h3>
<p>Signing in is for adults (18+). Anyone under 18 can use the whole guide without signing in.</p>
<h3>Other sites</h3>
<p>Trailer, map, calendar and ratings links open other sites (YouTube, Google Maps, IMDb and others), which have their own privacy policies. If you add an OMDb key for ratings, it stays on your device.</p>
<h3>If something goes wrong</h3>
<p>If your data were ever exposed, we would tell you and the Data Protection Board.</p>
${act}</article>`;
}
function openPrivacy(){ $('#menu').classList.remove('open'); openModal(privacyHtml(), ROOT+'privacy/'); syncTitle(); }
function askConsent(){
  openModal(`<div class="ask"><h2>We’ve added a privacy notice</h2><p>Your name, email and film lists are saved to your account so they sync across devices. Nothing else is collected.</p><button class="btn primary" onclick="agreeConsent()">OK, keep syncing</button><button class="btn" onclick="openPrivacy()">Read the notice</button><button class="btn danger" onclick="deleteAccount()">Delete my account</button></div>`);
}
function agreeConsent(){ cloud.consent={v:PRIVACY_V, at:Date.now()}; pushNow(); closeModal(); toast('Thanks – your list stays synced'); }
async function deleteAccount(){
  $('#menu').classList.remove('open');
  if(!cloud.user || !cloud.fb) return;
  if(!confirm('Delete your account?\n\nThis permanently erases your name, email and all your saved lists. It can’t be undone.')) return;
  const {doc, deleteDoc, deleteUser, reauthenticateWithPopup, GoogleAuthProvider, signOut} = cloud.fb, auth = cloud.fb.auth, u = auth.currentUser;
  clearTimeout(cloud.t); cloud.ready=false; if(cloud.unsub){ cloud.unsub(); cloud.unsub=null; }
  let listsGone=false;
  try{
    await deleteDoc(doc(cloud.fb.store,'users',u.uid)); listsGone=true;
    cloud.deleting=true;
    try{ await deleteUser(u); }
    catch(e){ if(e.code!=='auth/requires-recent-login') throw e;
      toast('Please confirm with Google to finish'); await reauthenticateWithPopup(u, new GoogleAuthProvider()); await deleteUser(u); }
    closeModal(); toast('Your account and data have been deleted');
  }catch(e){
    console.warn(e);
    if(listsGone){ cloud.deleting=true; await signOut(auth).catch(()=>{}); closeModal();
      alert('Your lists were deleted, but your sign-in record wasn’t.\n\nSign in again and choose Delete my account to finish.'); }
    else { cloud.deleting=false; cloud.ready=true; toast('Could not delete – please try again'); }
  }
}

/* ---------- online sync (optional Google sign-in) ---------- */
const FB_CFG = {apiKey:"AIzaSyA6mBtRlKHFojWP46-KuL5AjdRmTR2TD-c",authDomain:"iffi26-8579d.firebaseapp.com",projectId:"iffi26-8579d",storageBucket:"iffi26-8579d.firebasestorage.app",messagingSenderId:"798581706323",appId:"1:798581706323:web:b4725dfb07f67087e440a6"};
const FBV = 'https://www.gstatic.com/firebasejs/10.12.2/';
const MARK_FIELDS = ['status','priority','rating','liked','review','watchedOn'];
const cloud = {fb:null, user:null, ready:false, marks:{}, known:new Set(), unsub:null, t:null, consent:null, agreed:false, deleting:false};
const tkey = m => String(m.title||'').trim().toLowerCase();
const skey = s => [s.date,s.time,s.venue].join('|');
let OFFICIAL_T = new Set(); try{ OFFICIAL_T = new Set(JSON.parse(officialText()).movies.map(tkey)); }catch(e){}
const isOfficial = m => OFFICIAL_T.has(tkey(m));
function localMark(m){
  const f={}; for(const k of MARK_FIELDS){ const v=m[k]; if(v!==undefined && v!==null && v!=='' && v!==false && v!==0 && !(k==='status'&&v==='none')) f[k]=v; }
  const s={}; for(const x of m.screenings||[]) if(x.going||x.booked) s[skey(x)]={going:true};
  const w = m.watchedAt ? (m.screenings||[]).find(x=>x.id===m.watchedAt) : null;
  const e={}; if(Object.keys(f).length) e.f=f; if(Object.keys(s).length) e.s=s; if(w) e.wa=skey(w);
  return Object.keys(e).length ? e : null;
}
function setMark(m,e){
  for(const k of MARK_FIELDS){ const v=e?.f?.[k]; if(v===undefined){ if(k==='status') m.status='none'; else delete m[k]; } else m[k]=v; }
  for(const x of m.screenings||[]){ const r=e?.s?.[skey(x)]; x.going=!!(r?.going||r?.booked); x.booked=false; x.seat=''; }
  m.watchedAt = e?.wa ? (m.screenings||[]).find(x=>skey(x)===e.wa)?.id : undefined;
}
const clean = o => JSON.parse(JSON.stringify(o));
function applyRemote(data){
  const marks = data?.marks||{}, custom = data?.custom||[];
  const same = JSON.stringify(marks)===JSON.stringify(cloud.marks) && JSON.stringify(custom)===JSON.stringify(db.movies.filter(m=>!isOfficial(m)).map(clean));
  cloud.marks = marks;
  if(same && cloud.ready) return;
  for(const m of db.movies) if(isOfficial(m)){ setMark(m, marks[tkey(m)]); cloud.known.add(tkey(m)); }
  db.movies = db.movies.filter(isOfficial).concat(custom);
  _localSave(); render();
}
function pushSoon(){ clearTimeout(cloud.t); cloud.t = setTimeout(pushNow, 1200); }
async function pushNow(){
  clearTimeout(cloud.t); if(!cloud.user || !cloud.ready) return;
  let fixed=false; const marks={...cloud.marks};
  for(const m of db.movies){ if(!isOfficial(m)) continue; const t=tkey(m);
    if(!cloud.known.has(t)){ setMark(m, marks[t]); cloud.known.add(t); fixed=true; continue; }
    const e=localMark(m); if(e) marks[t]=e; else delete marks[t]; }
  if(fixed){ _localSave(); render(); }
  cloud.marks = marks;
  const {doc,setDoc} = cloud.fb;
  try{ await setDoc(doc(cloud.fb.store,'users',cloud.user.uid), clean({marks, custom:db.movies.filter(m=>!isOfficial(m)), consent:cloud.consent||undefined, updated:Date.now()})); }
  catch(e){ console.warn(e); toast('Could not save online – will retry'); pushSoon(); }
}
const _localSave = save;
save = function(){ _localSave(); if(cloud.user && cloud.ready) pushSoon(); };
document.addEventListener('visibilitychange', ()=>{ if(document.hidden && cloud.t) pushNow(); });
async function onUser(u){
  cloud.user=u; cloud.ready=false; if(cloud.unsub){ cloud.unsub(); cloud.unsub=null; }
  if(!u && cloud.deleting){   // account just deleted: forget everything on this device too
    cloud.deleting=false; cloud.consent=null; clearLocalMarks(); try{ localStorage.removeItem(KEY+'-parked'); }catch(e){}
    updateCloudMenu(); return;
  }
  if(!u){   // signed out: park any marks on this phone so they're hidden, and add them to the account at next sign-in
    const park={}; for(const m of db.movies){ if(isOfficial(m)){ const e=localMark(m); if(e) park[tkey(m)]=e; } else park['custom:'+tkey(m)]=clean(m); }
    if(Object.keys(park).length){ try{ const old=JSON.parse(localStorage.getItem(KEY+'-parked')||'{}'); localStorage.setItem(KEY+'-parked', JSON.stringify({...old,...park})); }catch(e){} clearLocalMarks(); }
  }
  updateCloudMenu();
  if(!u) return;
  const {doc,getDoc,onSnapshot} = cloud.fb, ref = doc(cloud.fb.store,'users',u.uid);
  try{
    const snap = await getDoc(ref), remote = snap.exists() ? snap.data() : {marks:{},custom:[]};
    cloud.consent = remote.consent?.v>=PRIVACY_V ? remote.consent : cloud.agreed ? {v:PRIVACY_V, at:Date.now()} : null;
    const marks = {...(remote.marks||{})};
    for(const m of db.movies) if(isOfficial(m)){ const t=tkey(m), e=localMark(m); if(e && !marks[t]) marks[t]=e; }   // keep this phone's activity
    let parked={}; try{ parked=JSON.parse(localStorage.getItem(KEY+'-parked')||'{}'); localStorage.removeItem(KEY+'-parked'); }catch(e){}
    const custom = [...(remote.custom||[])], have = new Set(custom.map(tkey));
    for(const [k,v] of Object.entries(parked)){ if(k.startsWith('custom:')){ if(!have.has(tkey(v))){ custom.push(v); have.add(tkey(v)); } } else if(!marks[k]) marks[k]=v; }
    for(const m of db.movies) if(!isOfficial(m) && !have.has(tkey(m))) custom.push(clean(m));
    cloud.marks = {}; applyRemote({marks, custom}); cloud.ready = true;
    await pushNow();
    cloud.unsub = onSnapshot(ref, s=>{ if(!s.metadata.hasPendingWrites && s.exists()) applyRemote(s.data()); });
    const pd = cloud.pending; cloud.pending = null;
    const pm = pd && db.movies.find(m=>m.title.toLowerCase()===pd.t);
    if(pm){ pm.status = pd.st; if(pd.st==='watched' && !pm.watchedOn) pm.watchedOn = localISO(); const ps = pd.sk && pm.screenings.find(y=>skey(y)===pd.sk); if(ps) ps.going=true; save(); render(); if(ps){ if($('#scrim').classList.contains('open')) closeModal(); toast('Signed in – added to My plan'); } else { openDetail(pm.id); toast(pd.st==='want'?'Signed in – saved to My list':'Signed in – marked as watched'); } }
    else if(cloud.agreed){ if($('#scrim').classList.contains('open') && $('#modal .ask')) closeModal(); toast('Signed in – your list is saved online'); }
    if(cloud.pendingList){ const c=cloud.pendingList; cloud.pendingList=null; saveSharedList(c); }
    if(!cloud.consent) askConsent();   // signed in before the privacy notice existed
  }catch(e){ console.warn(e); toast('Could not reach online storage'); }
}
function clearLocalMarks(){
  for(const m of db.movies) if(isOfficial(m)) setMark(m, null);
  db.movies = db.movies.filter(isOfficial); cloud.marks={}; cloud.known=new Set(); _localSave();
}
function updateCloudMenu(){
  document.body.classList.toggle('guest', !cloud.user);
  render();
  const u=cloud.user, av=$('#menuBtn');
  if(u){ const nm=u.displayName||u.email||'';
    av.innerHTML = u.photoURL ? `<img src="${esc(u.photoURL)}" alt="" referrerpolicy="no-referrer">` : esc((nm[0]||'?').toUpperCase());
    av.title = nm; $('#cloudState').innerHTML = `<b>${esc(u.displayName||'Signed in')}</b><span>${esc(u.email||'')}</span><small>Your lists are saved to this account</small>`; }
}
async function cloudInit(){
  try{
    const [app,auth,fs] = await Promise.all(['firebase-app.js','firebase-auth.js','firebase-firestore.js'].map(f=>import(FBV+f)));
    const a = app.initializeApp(FB_CFG);
    cloud.fb = {...auth, ...fs, auth:auth.getAuth(a), store:(()=>{ try{ return fs.initializeFirestore(a,{localCache:fs.persistentLocalCache({tabManager:fs.persistentMultipleTabManager()})}); }catch(e){ return fs.getFirestore(a); } })()};
    auth.onAuthStateChanged(cloud.fb.auth, onUser);
  }catch(e){ console.warn('Online sync unavailable', e); }
}
async function cloudToggle(){
  if(!cloud.fb){ toast('Online sync not available right now'); return; }
  const {auth, GoogleAuthProvider, signInWithPopup, signOut} = cloud.fb;
  if(cloud.user){ if(confirm('Sign out? Your lists stay saved in your account.')){ await pushNow(); await signOut(auth); clearLocalMarks(); render(); toast('Signed out'); } return; }
  const p = new GoogleAuthProvider();
  cloud.agreed = true;   // every sign-in button sits next to the privacy notice
  try{ await signInWithPopup(auth, p); }
  catch(e){ const c=e.code||'';
    if(/popup-blocked|operation-not-supported|web-storage/.test(c)) alert('Sign-in window was blocked.\n\nOpen this site directly in Safari or Chrome (not inside WhatsApp or another app), allow pop-ups, and try again.');
    else if(!/popup-closed|cancelled-popup/.test(c)) toast('Sign-in failed: '+(c||e.message)); }
}
cloudInit();
/* ---------- quick look: hover (desktop) / press-and-hold (phone) ---------- */
function peekHtml(m){
  const c = String(m.country||'').split(',')[0].trim();
  const meta = [m.genre, c, m.runtime ? m.runtime+' min' : ''].filter(Boolean).map(esc).join(' · ');
  return `<b>${esc(m.title)}</b>${meta?`<div class="pm">${meta}</div>`:''}${m.synopsis?`<p>${esc(m.synopsis)}</p>`:''}`;
}
(function(){
  const pk = $('#peek'); let hT=null, cur=null;
  const hide = (now)=>{ if(now){ pk.style.transition='none'; pk.classList.remove('on'); pk.offsetHeight; pk.style.transition=''; } else pk.classList.remove('on'); };
  const hoverable = matchMedia('(hover: hover) and (pointer: fine)').matches;
  if(hoverable){
    document.addEventListener('mouseover', e=>{
      const el = e.target.closest('[data-pid]'); if(el===cur) return;
      clearTimeout(hT); hide(); cur=el; if(!el) return;
      hT = setTimeout(()=>{
        const m = find(el.dataset.pid); if(!m || (!m.synopsis && !m.genre)) return;
        pk.innerHTML = peekHtml(m);
        const po = el.querySelector('.poster'), r = (po||el).getBoundingClientRect();
        pk.classList.toggle('tip', !po);
        if(po){ Object.assign(pk.style,{left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px',maxHeight:'none'}); }
        else { const w=Math.min(380, innerWidth-24); Object.assign(pk.style,{left:Math.min(e.clientX+12, innerWidth-w-12)+'px',top:Math.min(r.bottom+4, innerHeight-220)+'px',width:w+'px',height:'auto',maxHeight:'240px'}); }
        requestAnimationFrame(()=>pk.classList.add('on'));
      }, 450);
    });
    document.addEventListener('scroll', ()=>{ clearTimeout(hT); hide(true); cur=null; }, {passive:true, capture:true});
    document.addEventListener('mousedown', ()=>{ clearTimeout(hT); hide(true); });
  }
  $('#sheetScrim').onclick = ()=>closeSheet();
})();
function pick(btn, title, options, cur, onPick){
  pick._fn = onPick;
  const sh=$('#sheet');
  sh.innerHTML = `<div class="pk-head"><b>${esc(title)}</b><button class="pk-x" aria-label="Close" onclick="closeSheet()"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
    ${options.length>14?`<div class="pk-search"><input type="search" placeholder="Search ${esc(title.toLowerCase())}" aria-label="Search" oninput="const q=this.value.toLowerCase();this.closest('#sheet').querySelectorAll('.pk-opt').forEach(b=>b.hidden=q&&!b.textContent.toLowerCase().includes(q))"></div>`:''}
    <div class="pk-list" role="listbox">${options.map(([v,l,c])=>`<button role="option" aria-selected="${v===cur}" class="pk-opt ${v===cur?'on':''}" data-v="${esc(v)}"><span>${esc(l)}</span>${c!=null?`<small>${c}</small>`:''}${v===cur?'<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>':''}</button>`).join('')}</div>`;
  sh.querySelectorAll('.pk-opt').forEach(b=>b.onclick=()=>{ const v=b.dataset.v; closeSheet(); pick._fn(v); });
  sh.classList.remove('filt'); sh.classList.add('picker');
  if(innerWidth>640){ const r=btn.getBoundingClientRect(); Object.assign(sh.style,{left:Math.min(r.left, innerWidth-330)+'px', top:(r.bottom+6)+'px', right:'auto', bottom:'auto', width:'320px'}); }
  else sh.removeAttribute('style');
  sh.classList.add('open'); $('#sheetScrim').classList.add('open');
  if(!history.state?.sheet) history.pushState({sheet:1},'');
  setTimeout(()=>sh.querySelector('.pk-opt.on, .pk-opt')?.focus({preventScroll:false}), 50);
}
function closeSheet(fromBack){
  if(!$('#sheet').classList.contains('open')) return;
  $('#sheet').classList.remove('open','filt'); $('#sheetScrim').classList.remove('open');
  if(fromBack==='detail' && history.state?.sheet) history.replaceState({modal:1},'');
  else if(fromBack!==true && history.state?.sheet) history.back();
}
if('serviceWorker' in navigator && (location.protocol==='https:' || location.hostname==='localhost')) navigator.serviceWorker.register('sw.js').catch(()=>{});

render();
{ const t=officialText()||''; const ver='4:'+t.length+':'+((t.match(/"fetched":"([^"]*)"/)||[])[1]||'');
  if(t && db.officialVer!==ver){ db.officialVer=ver; window._quiet=true; loadOfficial(); } }   // pick up film-list updates automatically
openFromHash();
