// ══════════════════════════════════════
// CONFIG — change this to your backend URL after deploying
// ══════════════════════════════════════
const API = 'https://solo-system-backend-production.up.railway.app/api';
// During local testing use: const API = 'http://localhost:5000/api';

// ══════════════════════════════════════
// AUTH STATE
// ══════════════════════════════════════
let token = localStorage.getItem('sl_token') || '';
let S = null; // loaded from server
let activeDomainFilter = 'all';
let saveTimer = null;

function getHeaders(){
  return {'Content-Type':'application/json','Authorization':'Bearer '+token};
}

// ══════════════════════════════════════
// AUTH
// ══════════════════════════════════════
function switchAuthTab(tab, el){
  document.querySelectorAll('.auth-tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('loginForm').style.display = tab==='login'?'block':'none';
  document.getElementById('registerForm').style.display = tab==='register'?'block':'none';
  document.getElementById('authError').textContent = '';
}

async function login(){
  const username = document.getElementById('loginUser').value.trim();
  const password = document.getElementById('loginPass').value;
  if(!username||!password) return setAuthError('Fill in all fields.');
  try{
    const res = await fetch(`${API}/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});
    const data = await res.json();
    if(!res.ok) return setAuthError(data.error||'Login failed.');
    token = data.token;
    localStorage.setItem('sl_token', token);
    await loadData();
  } catch(e){ setAuthError('Cannot reach server. Check your connection.'); }
}

async function register(){
  const hunterName = document.getElementById('regHunter').value.trim();
  const username = document.getElementById('regUser').value.trim();
  const password = document.getElementById('regPass').value;
  if(!username||!password) return setAuthError('Fill in all fields.');
  try{
    const res = await fetch(`${API}/auth/register`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password,hunterName})});
    const data = await res.json();
    if(!res.ok) return setAuthError(data.error||'Registration failed.');
    token = data.token;
    localStorage.setItem('sl_token', token);
    await loadData();
  } catch(e){ setAuthError('Cannot reach server. Check your connection.'); }
}

function logout(){
  token = '';
  S = null;
  localStorage.removeItem('sl_token');
  document.getElementById('mainApp').style.display = 'none';
  document.getElementById('authScreen').classList.remove('hidden');
}

function setAuthError(msg){ document.getElementById('authError').textContent = msg; }

// ══════════════════════════════════════
// DATA SYNC
// ══════════════════════════════════════
async function loadData(){
  try{
    setSyncStatus('saving','Loading...');
    const res = await fetch(`${API}/data`,{headers:getHeaders()});
    if(res.status===401){logout();return;}
    S = await res.json();
    if(!S.history||!S.history.length) S.history = generateDefaultHistory();
    if(!S.streaks) S.streaks = {personal:0,fitness:0,academic:0};
    showApp();
    setSyncStatus('ok','Synced');
  } catch(e){
    setSyncStatus('error','Offline');
    showAlert('warning','Sync Failed','Could not reach server. Changes may not save.');
  }
}

function scheduleSave(){
  clearTimeout(saveTimer);
  setSyncStatus('saving','Saving...');
  saveTimer = setTimeout(pushData, 1500);
}

async function pushData(){
  if(!S||!token) return;
  try{
    const res = await fetch(`${API}/data`,{method:'POST',headers:getHeaders(),body:JSON.stringify(S)});
    if(res.ok){ setSyncStatus('ok','Synced'); }
    else setSyncStatus('error','Save failed');
  } catch(e){ setSyncStatus('error','Offline'); }
}

function setSyncStatus(state, text){
  const dot = document.getElementById('syncDot');
  const txt = document.getElementById('syncText');
  dot.className = 'sync-dot '+state;
  txt.textContent = text;
}

function generateDefaultHistory(){
  const days=['MON','TUE','WED','THU','FRI','SAT','SUN'];
  return days.map(d=>({day:d,personal:0,fitness:0,academic:0}));
}

// ══════════════════════════════════════
// SHOW APP
// ══════════════════════════════════════
function showApp(){
  document.getElementById('authScreen').classList.add('hidden');
  document.getElementById('mainApp').style.display = 'block';
  document.getElementById('hunterName').textContent = S.hunterName||'HUNTER';
  document.getElementById('nameSettingVal').textContent = S.hunterName||'HUNTER';
  document.getElementById('cutoffDisplay').textContent = S.cutoff||'22:00';
  document.getElementById('cutoffSettingVal').textContent = S.cutoff||'22:00';
  document.getElementById('levelNum').textContent = S.level||1;
  const pct = Math.round(((S.xp||0)/(S.xpMax||1000))*100);
  document.getElementById('xpVal').textContent = `${S.xp||0} / ${S.xpMax||1000} XP`;
  document.getElementById('xpBar').style.width = pct+'%';
  checkPenalty();
  renderQuests();
  renderStats();
  setTimeout(()=>showAlert('normal','System Online',`Welcome back, ${S.hunterName||'Hunter'}.`), 600);
}

// ══════════════════════════════════════
// TIME
// ══════════════════════════════════════
function cutoffMins(){const[h,m]=(S.cutoff||'22:00').split(':').map(Number);return h*60+m;}
function nowMins(){const n=new Date();return n.getHours()*60+n.getMinutes();}
function minsLeft(){return cutoffMins()-nowMins();}
function getMultiplier(){
  const m=minsLeft();
  if(m>=60)return{mult:1.25,color:'var(--gold)'};
  if(m>=0)return{mult:1.0,color:'var(--green)'};
  return{mult:0.5,color:'var(--orange)'};
}

let reminderFired = false;
function updateClock(){
  if(!S) return;
  const n=new Date(),pad=x=>String(x).padStart(2,'0');
  document.getElementById('clockNow').textContent=`${pad(n.getHours())}:${pad(n.getMinutes())}:${pad(n.getSeconds())}`;
  const m=minsLeft(),s=document.getElementById('timeStatus');
  if(m>60){s.className='time-status ok';s.textContent='ON TIME';}
  else if(m>0){s.className='time-status warning';s.textContent='CUTOFF SOON';}
  else{s.className='time-status late';s.textContent='PAST CUTOFF';}
  if(m<=15&&m>14&&!reminderFired){reminderFired=true;showAlert('warning','⏰ 15 MIN LEFT','Complete quests now or XP will be halved!');}
  if(m>15)reminderFired=false;
}

// ══════════════════════════════════════
// RENDER QUESTS
// ══════════════════════════════════════
function renderQuests(){
  if(!S) return;
  const el=document.getElementById('questList');el.innerHTML='';
  const mins=minsLeft();
  const filtered=(S.quests||[]).filter(q=>activeDomainFilter==='all'||q.domain===activeDomainFilter);
  if(!filtered.length){el.innerHTML=`<div style="text-align:center;padding:30px;font-family:'Share Tech Mono',monospace;font-size:12px;color:var(--text-dim);">No quests here yet.<br>Add one below.</div>`;return;}
  filtered.forEach(q=>{
    const div=document.createElement('div');
    div.className='quest-card domain-'+q.domain+(q.done?' completed':'')+(q.isPenalty?' penalty-quest':'');
    if(!q.done)div.onclick=()=>completeQuest(q.id);
    const earlyXp=Math.round(q.baseXp*1.25),ontXp=q.baseXp,lateXp=Math.round(q.baseXp*0.5);
    const nowXp=Math.round(q.baseXp*getMultiplier().mult);
    let timer='';
    if(!q.done){
      if(mins>60)timer=`<div class="quest-timer ok">⏱ ${Math.floor(mins/60)}h ${mins%60}m to cutoff</div>`;
      else if(mins>0)timer=`<div class="quest-timer soon">⚠ ${mins}m left!</div>`;
      else timer=`<div class="quest-timer overdue">☠ PAST CUTOFF — 50% XP</div>`;
    }
    let badge='';
    if(q.done){if(q.mult>1)badge=`<div class="done-badge early">⚡ EARLY</div>`;else if(q.mult===1)badge=`<div class="done-badge full">✓ DONE</div>`;else badge=`<div class="done-badge late">⚠ LATE</div>`;}
    div.innerHTML=`
      <div class="domain-pill ${q.isPenalty?'penalty':q.domain}">${q.isPenalty?'☠ PENALTY':q.domain.toUpperCase()}</div>
      <div class="quest-name">${q.name}</div>
      <div class="quest-meta">
        <span class="quest-xp">${q.done?`+${Math.round(q.baseXp*(q.mult||1))} XP`:`+${nowXp} XP now`}</span>
        <span class="quest-stat">↑ ${q.stat}</span>
        <span class="quest-diff ${q.diff}">${q.diff.toUpperCase()}</span>
      </div>
      ${!q.done?`<div class="xp-preview"><span class="xp-tag early-tag">⚡${earlyXp}</span><span class="xp-tag ontime-tag">✓${ontXp}</span><span class="xp-tag late-tag">⚠${lateXp}</span></div>`:''}
      ${timer}${badge}`;
    el.appendChild(div);
  });
}

function filterDomain(domain,btn){
  activeDomainFilter=domain;
  document.querySelectorAll('.df-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');renderQuests();
}

// ══════════════════════════════════════
// COMPLETE QUEST
// ══════════════════════════════════════
function completeQuest(id){
  const q=(S.quests||[]).find(x=>x.id===id);
  if(!q||q.done)return;
  const{mult,color}=getMultiplier();
  const earned=Math.round(q.baseXp*mult);
  q.done=true;q.mult=mult;
  S.stats[q.stat].val=Math.min(100,S.stats[q.stat].val+2);
  if(!S.streaks)S.streaks={personal:0,fitness:0,academic:0};
  S.streaks[q.domain]=(S.streaks[q.domain]||0)+1;
  addXP(earned,color);
  const t=mult>1?'success':mult===1?'normal':'warning';
  const msgs={success:['⚡ Early Bird!',`+${earned} XP (+25%) — ${q.stat} up!`],normal:['Quest Complete!',`+${earned} XP — ${q.stat} up!`],warning:['Quest Done (Late)',`+${earned} XP — 50% late penalty.`]};
  showAlert(t,...msgs[t]);
  renderQuests();renderStats();scheduleSave();
}

// ══════════════════════════════════════
// XP + LEVEL
// ══════════════════════════════════════
function addXP(amount,color='var(--gold)'){
  showPopup('+'+amount+' XP',color);
  S.xp=(S.xp||0)+amount;
  while(S.xp>=(S.xpMax||1000)){
    S.xp-=S.xpMax;S.level=(S.level||1)+1;
    S.xpMax=Math.floor(S.xpMax*1.3);S.sp=(S.sp||0)+5;
    showAlert('success','LEVEL UP!',`Level ${S.level}! +5 Stat Points.`);
    const el=document.getElementById('levelNum');el.classList.remove('pulse');void el.offsetWidth;el.classList.add('pulse');
  }
  document.getElementById('levelNum').textContent=S.level||1;
  document.getElementById('xpVal').textContent=`${S.xp||0} / ${S.xpMax||1000} XP`;
  document.getElementById('xpBar').style.width=Math.round(((S.xp||0)/(S.xpMax||1000))*100)+'%';
}
function showPopup(t,color){const el=document.getElementById('xpPopup');el.textContent=t;el.style.color=color;el.classList.remove('show');void el.offsetWidth;el.classList.add('show');}

// ══════════════════════════════════════
// STATS
// ══════════════════════════════════════
function renderStats(){
  if(!S)return;
  const g=document.getElementById('statsGrid');g.innerHTML='';
  Object.entries(S.stats||{}).forEach(([k,s])=>{
    const d=document.createElement('div');d.className=`stat-card ${s.cls}`;
    d.innerHTML=`<div class="stat-name">${s.name}</div><div class="stat-val">${s.val}</div><div class="stat-bar-wrap"><div class="stat-bar" style="width:${s.val}%"></div></div>`;
    d.onclick=()=>{if((S.sp||0)<=0){showAlert('warning','No Points','Complete quests to earn stat points.');return;}S.sp--;S.stats[k].val=Math.min(100,S.stats[k].val+3);renderStats();showAlert('normal','Stat Up',`${s.name} upgraded!`);scheduleSave();};
    g.appendChild(d);
  });
  document.getElementById('statPoints').textContent=S.sp||0;
}

// ══════════════════════════════════════
// ALERT
// ══════════════════════════════════════
let alertTimer;
function showAlert(type,msg,sub){
  const el=document.getElementById('alert');el.className='system-alert '+type;
  const hd={success:'◈ ACHIEVEMENT',warning:'⚠ WARNING',penalty:'☠ PENALTY',normal:'◈ SYSTEM'};
  document.getElementById('alertHeader').textContent=hd[type]||'◈ SYSTEM';
  document.getElementById('alertMsg').textContent=msg;
  document.getElementById('alertSub').textContent=sub||'';
  el.classList.add('show');clearTimeout(alertTimer);alertTimer=setTimeout(()=>el.classList.remove('show'),4000);
}

// ══════════════════════════════════════
// PENALTY ZONE
// ══════════════════════════════════════
function checkPenalty(){
  if(!S)return;
  const today=new Date().toDateString();
  if(S.lastQuestDate&&S.lastQuestDate!==today){
    const missed=(S.quests||[]).filter(q=>!q.done&&!q.isPenalty);
    if(missed.length){
      document.getElementById('penaltyBanner').classList.add('show');
      document.getElementById('penaltyDesc').textContent=`Missed ${missed.length} quest(s). Stat debuffs applied. Streaks reset for missed domains.`;
      Object.keys(S.stats||{}).forEach(k=>S.stats[k].val=Math.max(1,S.stats[k].val-3));
      const missedDomains=[...new Set(missed.map(q=>q.domain))];
      missedDomains.forEach(d=>S.streaks[d]=0);
      missed.forEach(q=>S.quests.push({id:S.nextId++,name:`[PENALTY] ${q.name}`,domain:q.domain,stat:q.stat,diff:'hard',baseXp:Math.round(q.baseXp*0.5),done:false,isPenalty:true,mult:null}));
      showAlert('penalty','☠ PENALTY ZONE',`${missed.length} quests missed.`);
      scheduleSave();
    }
  }
  S.lastQuestDate=today;
}

// ══════════════════════════════════════
// PERFORMANCE REPORT
// ══════════════════════════════════════
function getDomainScore(domain){
  const qs=(S.quests||[]).filter(q=>q.domain===domain&&!q.isPenalty);
  if(!qs.length)return{completion:0,discipline:0,focus:0,consistency:0,total:0};
  const done=qs.filter(q=>q.done);
  const completion=Math.round((done.length/qs.length)*100);
  const earlyDone=done.filter(q=>q.mult>1).length;
  const discipline=done.length?Math.min(100,Math.round((earlyDone/done.length)*100+(completion*0.4))):0;
  const onTime=done.filter(q=>q.mult>=1).length;
  const focus=done.length?Math.round((onTime/done.length)*100):0;
  const streak=((S.streaks||{})[domain])||0;
  const consistency=Math.min(100,streak*15);
  const total=Math.round((completion+discipline+focus+consistency)/4);
  return{completion,discipline,focus,consistency,total};
}
function scoreToRank(score){
  if(score>=90)return{rank:'S',color:'var(--gold)'};
  if(score>=75)return{rank:'A',color:'var(--green)'};
  if(score>=55)return{rank:'B',color:'var(--blue)'};
  if(score>=35)return{rank:'C',color:'var(--purple)'};
  if(score>=15)return{rank:'D',color:'var(--orange)'};
  return{rank:'E',color:'var(--red)'};
}
function drawRadar(){
  const canvas=document.getElementById('radarCanvas');
  const ctx=canvas.getContext('2d');
  const W=canvas.width,H=canvas.height,cx=W/2,cy=H/2,r=Math.min(W,H)*0.36;
  ctx.clearRect(0,0,W,H);
  const labels=['DISCIPLINE','FOCUS','CONSISTENCY','COMPLETION','OVERALL'];
  const domains=['personal','fitness','academic'];
  const domColors=['rgba(0,212,255,0.7)','rgba(0,255,136,0.7)','rgba(198,120,255,0.7)'];
  const N=labels.length;
  for(let lv=1;lv<=4;lv++){ctx.beginPath();for(let i=0;i<=N;i++){const a=(i/N)*Math.PI*2-Math.PI/2,x=cx+Math.cos(a)*r*(lv/4),y=cy+Math.sin(a)*r*(lv/4);i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);}ctx.strokeStyle='rgba(0,212,255,0.1)';ctx.lineWidth=1;ctx.stroke();}
  for(let i=0;i<N;i++){const a=(i/N)*Math.PI*2-Math.PI/2;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r);ctx.strokeStyle='rgba(0,212,255,0.15)';ctx.lineWidth=1;ctx.stroke();ctx.fillStyle='rgba(200,232,255,0.55)';ctx.font='bold 8px Orbitron,monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(labels[i],cx+Math.cos(a)*(r+22),cy+Math.sin(a)*(r+20));}
  domains.forEach((domain,di)=>{
    const sc=getDomainScore(domain);
    const vals=[sc.discipline,sc.focus,sc.consistency,sc.completion,sc.total].map(v=>v/100);
    ctx.beginPath();vals.forEach((v,i)=>{const a=(i/N)*Math.PI*2-Math.PI/2,x=cx+Math.cos(a)*r*v,y=cy+Math.sin(a)*r*v;i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);});
    ctx.closePath();ctx.fillStyle=domColors[di].replace('0.7','0.1');ctx.fill();ctx.strokeStyle=domColors[di];ctx.lineWidth=2;ctx.stroke();
    vals.forEach((v,i)=>{const a=(i/N)*Math.PI*2-Math.PI/2;ctx.beginPath();ctx.arc(cx+Math.cos(a)*r*v,cy+Math.sin(a)*r*v,3,0,Math.PI*2);ctx.fillStyle=domColors[di];ctx.fill();});
  });
}
function renderDomainRanks(){
  const el=document.getElementById('domainRanks');el.innerHTML='';
  [{key:'personal',label:'PERSONAL LIFE'},{key:'fitness',label:'FITNESS & HEALTH'},{key:'academic',label:'ACADEMICS'}].forEach(({key,label})=>{
    const sc=getDomainScore(key);const{rank}=scoreToRank(sc.total);
    const card=document.createElement('div');card.className=`domain-rank-card ${key}`;
    card.innerHTML=`<div class="dr-top"><div><div class="dr-domain">${label}</div></div><div class="dr-rank">${rank}-RANK</div></div>
    <div class="dr-metrics"><div class="dr-metric"><div class="dr-metric-label">DISCIPLINE</div><div class="dr-metric-val">${sc.discipline}%</div></div><div class="dr-metric"><div class="dr-metric-label">FOCUS</div><div class="dr-metric-val">${sc.focus}%</div></div><div class="dr-metric"><div class="dr-metric-label">CONSISTENCY</div><div class="dr-metric-val">${sc.consistency}%</div></div></div>
    <div class="dr-bar-row">
      <div class="dr-bar-label"><span>Discipline</span><span>${sc.discipline}%</span></div><div class="dr-bar-wrap"><div class="dr-bar" style="width:${sc.discipline}%"></div></div>
      <div class="dr-bar-label"><span>Focus</span><span>${sc.focus}%</span></div><div class="dr-bar-wrap"><div class="dr-bar" style="width:${sc.focus}%"></div></div>
      <div class="dr-bar-label"><span>Consistency</span><span>${sc.consistency}%</span></div><div class="dr-bar-wrap"><div class="dr-bar" style="width:${sc.consistency}%"></div></div>
    </div>`;
    el.appendChild(card);
  });
}
function renderWeekHistory(){
  const el=document.getElementById('weekHistory');el.innerHTML='';
  (S.history||[]).forEach(h=>{
    const avg=Math.round((h.personal+h.fitness+h.academic)/3);
    const row=document.createElement('div');row.className='week-row';
    row.innerHTML=`<div class="week-day">${h.day}</div><div class="week-bars"><div class="week-bar-wrap personal"><div class="week-bar-fill" style="height:${h.personal}%"></div></div><div class="week-bar-wrap fitness"><div class="week-bar-fill" style="height:${h.fitness}%"></div></div><div class="week-bar-wrap academic"><div class="week-bar-fill" style="height:${h.academic}%"></div></div></div><div class="week-pct">${avg}%</div>`;
    el.appendChild(row);
  });
}
function generateAnalysis(){
  const ps=getDomainScore('personal'),fs=getDomainScore('fitness'),as=getDomainScore('academic');
  const overall=Math.round((ps.total+fs.total+as.total)/3);
  const{rank}=scoreToRank(overall);
  const sorted=[{key:'personal',sc:ps},{key:'fitness',sc:fs},{key:'academic',sc:as}].sort((a,b)=>b.sc.total-a.sc.total);
  const best=sorted[0],worst=sorted[2];
  document.getElementById('overallRankVal').textContent=rank;
  document.getElementById('overallRankName').textContent=rank+'-RANK HUNTER';
  document.getElementById('overallRankSub').textContent=overall>=70?'Strong hunter. Push to S-Rank.':overall>=40?'Developing hunter. Consistency is the key.':'E-Rank detected. Time to rise, Hunter.';
  document.getElementById('streakPersonal').textContent=(S.streaks||{}).personal||0;
  document.getElementById('streakFitness').textContent=(S.streaks||{}).fitness||0;
  document.getElementById('streakAcademic').textContent=(S.streaks||{}).academic||0;
  document.getElementById('perfAiText').textContent=`Strongest domain: ${best.key} (${best.sc.total}%). Weakest: ${worst.key} (${worst.sc.total}%). ${overall>=70?'You are performing well. Close the gap between domains to achieve S-Rank.':'Critical weaknesses detected. The System demands more focus and discipline from you.'}`;
  const suggestions=[];
  if(worst.sc.consistency<40)suggestions.push(`Build a ${worst.key} streak — complete at least 1 quest daily for 7 days.`);
  if(ps.sc.discipline<50)suggestions.push('Complete personal quests 1hr+ before cutoff to boost discipline score.');
  if(fs.sc.total<50)suggestions.push('Add 2+ fitness quests daily — physical stats are falling behind.');
  if(as.sc.focus<60)suggestions.push('Academic quests must be done before cutoff — late study loses 50% XP.');
  if(overall>=75)suggestions.push('Target S-Rank: maintain 90%+ completion across ALL 3 domains.');
  if(!suggestions.length)suggestions.push('All domains strong. Maintain streaks and push for S-Rank.');
  const sl=document.getElementById('suggestionList');sl.innerHTML='';
  suggestions.forEach(s=>{const d=document.createElement('div');d.className='suggestion-item';d.innerHTML=`<span class="suggestion-arrow">→</span><span>${s}</span>`;sl.appendChild(d);});
}
function openPerfReport(){document.getElementById('perfOverlay').classList.add('show');renderDomainRanks();renderWeekHistory();generateAnalysis();setTimeout(drawRadar,100);}
function closePerfReport(){document.getElementById('perfOverlay').classList.remove('show');}

// ══════════════════════════════════════
// MODALS
// ══════════════════════════════════════
function switchTab(name,el){document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));el.classList.add('active');document.getElementById('tab-'+name).classList.add('active');}
function openAddQuest(){document.getElementById('questModal').classList.add('show');}
function openCutoffModal(){document.getElementById('cutoffInput').value=S.cutoff||'22:00';document.getElementById('cutoffModal').classList.add('show');}
function closeModal(id){document.getElementById(id).classList.remove('show');}
function addQuest(){
  const name=document.getElementById('questNameInput').value.trim();if(!name)return;
  const diff=document.getElementById('questDiffInput').value;
  const xpMap={easy:50,medium:100,hard:200};
  if(!S.quests)S.quests=[];
  S.quests.push({id:S.nextId++,name,domain:document.getElementById('questDomainInput').value,stat:document.getElementById('questStatInput').value,diff,baseXp:xpMap[diff],done:false,isPenalty:false,mult:null});
  document.getElementById('questNameInput').value='';closeModal('questModal');renderQuests();showAlert('normal','Quest Registered',name);scheduleSave();
}
function saveCutoff(){
  const val=document.getElementById('cutoffInput').value;if(!val)return;
  S.cutoff=val;document.getElementById('cutoffDisplay').textContent=val;document.getElementById('cutoffSettingVal').textContent=val;
  closeModal('cutoffModal');showAlert('normal','Cutoff Updated',`Set to ${val}.`);scheduleSave();
}
function changeName(){
  const n=prompt('Hunter name:',S.hunterName);if(!n)return;
  S.hunterName=n.toUpperCase();document.getElementById('hunterName').textContent=S.hunterName;document.getElementById('nameSettingVal').textContent=S.hunterName;scheduleSave();
}
const reviewResponses=['The System notes your reflection. Endurance remains weak. Assign more physical quests.','Consistency score is your bottleneck. Daily action beats occasional bursts every time.','Promising academic output. But fitness lags. An unbalanced hunter cannot reach S-Rank.','Consistent daily review unlocks hidden system bonuses. Do not break this ritual.'];
function submitReview(){if(!document.getElementById('reviewText').value.trim())return;addXP(75,'var(--purple)');document.getElementById('aiText').textContent=reviewResponses[Math.floor(Math.random()*reviewResponses.length)];document.getElementById('aiResponse').classList.add('show');showAlert('normal','Review Submitted','+75 XP earned.');scheduleSave();}
function submitWeekly(){if(!document.getElementById('weeklyText').value.trim())return;addXP(300,'var(--purple)');S.sp=(S.sp||0)+2;renderStats();showAlert('success','Weekly Complete','+300 XP + 2 Stat Points!');scheduleSave();}

// ══════════════════════════════════════
// INIT
// ══════════════════════════════════════
setInterval(updateClock,1000);
setInterval(renderQuests,30000);
updateClock();

// Auto-login if token exists
if(token){loadData();}