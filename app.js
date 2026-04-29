
const SB_URL='https://fbuvnbehzqheqhfqzocy.supabase.co';
const SB_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZidXZuYmVoenFoZXFoZnF6b2N5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5MTYzMTEsImV4cCI6MjA5MTQ5MjMxMX0.G_9i6zlxPOpdaYQFB8uva4CnTmH7CUQmA87P0_V4mEw';

// ── Supabase API helper ──
async function sbFetch(path, method='GET', body=null){
  const prefer=(method==='POST'||method==='PATCH')?'return=representation':'';
  const opts={method,headers:{'apikey':SB_KEY,'Authorization':'Bearer '+SB_KEY,'Content-Type':'application/json',...(prefer&&{'Prefer':prefer})}};
  if(body) opts.body=JSON.stringify(body);
  const r=await fetch(SB_URL+'/rest/v1/'+path,opts);
  if(!r.ok){const e=await r.text();throw new Error(e);}
  const t=r.status===204?null:await r.json();
  return t;
}

// ── State ──

function showToast(msg,type){
  const t=document.getElementById('toast');
  if(!t)return;
  t.textContent=msg;
  t.className='toast show';
  if(type==='error')t.style.background='#DC2626';
  else if(type==='success')t.style.background='#166534';
  else t.style.background='#1F3864';
  clearTimeout(t._timer);
  t._timer=setTimeout(()=>{t.className='toast';t.style.background='';},3200);
}

let currentUser=null, pendingPhotos=[], editingUserId=null, allTickets=[];

// ── AUTH ──
async function doLogin(){
  const uname=document.getElementById('login-user').value.trim();
  const pass=document.getElementById('login-pass').value;
  if(!uname||!pass){document.getElementById('login-error').textContent='Enter username and password.';return;}
  try{
    const users=await sbFetch('qas2_users?username=eq.'+encodeURIComponent(uname)+'&password=eq.'+encodeURIComponent(pass)+'&select=*');
    if(!users||!users.length){document.getElementById('login-error').textContent='Incorrect username or password.';document.getElementById('login-pass').value='';setTimeout(()=>document.getElementById('login-error').textContent='',2500);return;}
    currentUser=users[0];
    sessionStorage.setItem('qas2_session',JSON.stringify(currentUser));
    showApp();
  }catch(e){document.getElementById('login-error').textContent='Connection error. Check internet.';}
}

function doLogout(){
  if(!confirm('Logout?'))return;
  currentUser=null;sessionStorage.removeItem('qas2_session');
  document.getElementById('main-app').style.display='none';
  document.getElementById('login-screen').style.display='flex';
  document.getElementById('login-user').value='';document.getElementById('login-pass').value='';
}

function showApp(){
  document.getElementById('login-screen').style.display='none';
  document.getElementById('main-app').style.display='block';
  document.getElementById('topbar-username').textContent=currentUser.name;
  const isAdmin=currentUser.role==='admin';
  const isSupervisor=currentUser.role==='supervisor';
  const rb=document.getElementById('role-badge');
  if(isAdmin){rb.style.display='inline-block';rb.style.background='#C00000';rb.textContent='ADMIN';}
  else if(isSupervisor){rb.style.display='inline-block';rb.style.background='#375623';rb.textContent='SUPERVISOR';}
  else rb.style.display='none';
  document.querySelectorAll('.admin-only').forEach(el=>el.style.display=isAdmin?'':'none');
  initForm();
  if(isAdmin)switchTab('dashboard');
  else if(currentUser.role==='supervisor')switchTab('register');
  else switchTab('new');
}

const saved=sessionStorage.getItem('qas2_session');
if(saved){currentUser=JSON.parse(saved);showApp();}

// ── TICKET NUMBERING ──
async function getNextNo(){
  const d=new Date();
  const ym=d.getFullYear()+String(d.getMonth()+1).padStart(2,'0');
  try{
    const rows=await sbFetch('qas2_counters?month_key=eq.PL_GLOBAL&select=counter');
    let next=1;
    if(rows&&rows.length){
      next=rows[0].counter+1;
      await sbFetch('qas2_counters?month_key=eq.PL_GLOBAL','PATCH',{counter:next});
    }else{
      // First time — count existing tickets to set correct start
      const existing=await sbFetch('qas2_tickets?select=no&order=created_at.asc');
      next=(existing?existing.length:0)+1;
      await sbFetch('qas2_counters','POST',{month_key:'PL_GLOBAL',counter:next});
    }
    return 'QAS2-PL-'+ym+'-'+String(next).padStart(3,'0');
  }catch(e){
    const t=await sbFetch('qas2_tickets?select=no');
    return 'QAS2-PL-'+ym+'-'+String((t?t.length:0)+1).padStart(3,'0');
  }
}

async function compressImage(file){
  return new Promise(resolve=>{
    const reader=new FileReader();
    reader.onload=e=>{
      const img=new Image();
      img.onload=()=>{
        const MAX=1024;
        let w=img.width,h=img.height;
        if(w>MAX){h=Math.round(h*MAX/w);w=MAX;}
        if(h>MAX){w=Math.round(w*MAX/h);h=MAX;}
        const canvas=document.createElement('canvas');
        canvas.width=w;canvas.height=h;
        canvas.getContext('2d').drawImage(img,0,0,w,h);
        resolve(canvas.toDataURL('image/jpeg',0.7));
      };
      img.src=e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

async function handlePhotos(e){
  Array.from(e.target.files).forEach(async f=>{
    const compressed=await compressImage(f);
    pendingPhotos.push(compressed);
    renderPhotoPreview();
  });
}
function renderPhotoPreview(){
  document.getElementById('photo-preview').innerHTML=pendingPhotos.map((s,i)=>
    `<div class="photo-thumb"><img src="${s}" onclick="openLightbox('${s}')"><button class="del" onclick="removePhoto(${i})">&#x2715;</button></div>`
  ).join('');
}
function removePhoto(i){pendingPhotos.splice(i,1);renderPhotoPreview();}

// ── FORM ──
async function initForm(){
  const no=await getNextNo();
  document.getElementById('f-no').value=no;
  document.getElementById('f-date').value=new Date().toISOString().split('T')[0];
  document.getElementById('f-deadline').value='';
  ['f-system','f-pid','f-kks','f-desc','f-action'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('f-raised').value=currentUser?currentUser.name:'';
  document.getElementById('f-priority').value='A';
  document.getElementById('f-category').value='Design Deficiency';
  pendingPhotos=[];renderPhotoPreview();
  document.getElementById('photo-input').value='';
}
function clearForm(){initForm();}

async function registerTicket(){
  const sys=document.getElementById('f-system').value.trim();
  const desc=document.getElementById('f-desc').value.trim();
  if(!sys){alert('Please enter the System name.');return;}
  if(!desc){alert('Please enter the Description.');return;}
  const btn=document.getElementById('submit-btn');
  btn.disabled=true;btn.textContent='Saving...';
  try{
    const ticket={
      no:document.getElementById('f-no').value,
      date:document.getElementById('f-date').value||null,
      deadline:document.getElementById('f-deadline').value||null,
      priority:document.getElementById('f-priority').value,
      system_name:sys,
      category:document.getElementById('f-category').value,
      pid:document.getElementById('f-pid').value.trim(),
      kks:document.getElementById('f-kks').value.trim(),
      description:desc,
      action:document.getElementById('f-action').value.trim(),
      raised_by:document.getElementById('f-raised').value.trim(),
      raised_by_username:currentUser.username,
      status:'OPEN'
    };
    const [saved]=await sbFetch('qas2_tickets','POST',ticket);
    // Save photos separately
    if(pendingPhotos.length){
      for(const photo of pendingPhotos){
        await sbFetch('qas2_photos','POST',{ticket_id:saved.id,photo_data:photo});
      }
    }
    // WhatsApp for Priority A
    if(ticket.priority==='A') offerWhatsApp(ticket);
    showToast('Ticket '+ticket.no+' registered');
    await initForm();
    switchTab('register');
    await loadTickets();
    refreshDashboard();
  }catch(e){showToast('Error: '+e.message);}
  btn.disabled=false;btn.textContent='&#10003;  Submit & Register';
}

// ── LOAD TICKETS ──
async function loadTickets(){
  document.getElementById('register-body').innerHTML='<div class="loading"><div class="loading-spinner"></div><br>Loading...</div>';
  const fs=document.getElementById('filter-status').value;
  const fp=document.getElementById('filter-priority').value;
  let query='qas2_tickets?select=*&order=created_at.desc';
  if(fp) query+='&priority=eq.'+fp;
  if(fs==='OPEN') query+='&status=eq.OPEN';
  else if(fs==='CLOSED') query+='&status=eq.CLOSED';
  try{
    let tickets=await sbFetch(query);
    if(fs==='OVERDUE') tickets=tickets.filter(t=>isOverdue(t));
    const search=(document.getElementById('ticket-search')?.value||'').trim().toLowerCase();
    if(search) tickets=tickets.filter(t=>
      (t.no||'').toLowerCase().includes(search)||
      (t.system_name||'').toLowerCase().includes(search)||
      (t.kks||'').toLowerCase().includes(search)||
      (t.description||'').toLowerCase().includes(search)||
      (t.raised_by||'').toLowerCase().includes(search)||
      (t.pid||'').toLowerCase().includes(search)
    );
    allTickets=tickets;
    updateMetrics(tickets);
    renderRegister(tickets);
  }catch(e){document.getElementById('register-body').innerHTML='<div class="empty">Error loading tickets: '+e.message+'</div>';}
}

function isOverdue(t){return t.status==='OPEN'&&t.deadline&&new Date(t.deadline)<new Date();}

function updateMetrics(tickets){
  const open=tickets.filter(x=>x.status==='OPEN').length;
  const closed=tickets.filter(x=>x.status==='CLOSED').length;
  const overdue=tickets.filter(x=>isOverdue(x)).length;
  document.getElementById('m-total').textContent=tickets.length;
  document.getElementById('m-open').textContent=open;
  document.getElementById('m-closed').textContent=closed;
  document.getElementById('m-overdue').textContent=overdue;
  document.getElementById('cnt').textContent=tickets.length;
}

function renderRegister(tickets){
  const isAdmin=currentUser&&currentUser.role==='admin';
  const canModify=isAdmin||(currentUser&&currentUser.role==='supervisor');
  const body=document.getElementById('register-body');
  if(!tickets.length){body.innerHTML='<div class="empty">No tickets found.</div>';return;}
  const pl={A:'A – Critical',B:'B – Operational',C:'C – Minor'};
  const sorted=[...tickets].sort((a,b)=>{
    const av=isOverdue(a)?0:a.status==='OPEN'?1:2;
    const bv=isOverdue(b)?0:b.status==='OPEN'?1:2;
    return av-bv;
  });
  // Select-all header for OPEN tickets
  const openCount=sorted.filter(t=>t.status==='OPEN').length;
  const selectBar=openCount?`<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:#EEF2F8;border-radius:6px;margin-bottom:8px;font-size:11px;font-weight:600;color:#1F3864">
    <input type="checkbox" id="chk-tickets-all" onchange="toggleAllTickets(this.checked)" checked style="width:15px;height:15px;cursor:pointer">
    <label for="chk-tickets-all" style="cursor:pointer">Select for Master Report (${openCount} open tickets)</label>
  </div>`:'';
  body.innerHTML=selectBar+`<table><thead><tr><th style="width:32px"></th><th>Ticket No.</th><th>System / Description</th><th>Priority</th><th>Date Raised</th><th>Deadline</th><th>Status</th><th>Photos</th><th>Actions</th></tr></thead><tbody>`+
    sorted.map(t=>{
      const od=isOverdue(t);
      const sb=od?'<span class="badge overdue">OVERDUE</span>':`<span class="badge ${t.status==='OPEN'?'open':'closed'}">${t.status}</span>`;
      const cb=canModify?(t.status==='OPEN'?`<button class="btn sm success" onclick="closeTicket('${t.id}')">Close</button>`:`<button class="btn sm" onclick="reopenTicket('${t.id}')">Reopen</button>`):'';
      const eb=canModify?`<button class="btn sm" onclick="editTicket('${t.id}')" style="color:#1F3864;border-color:#d0dde8">Edit</button>`:'';
      const db=isAdmin?`<button class="btn sm" onclick="deleteTicket('${t.id}','${t.no}')">&#x2715;</button>`:'';
      const ph=t._photoCount?'&#128247; '+t._photoCount:'–';
      const chk=t.status==='OPEN'?`<input type="checkbox" class="ticket-chk" data-id="${t.id}" checked style="width:14px;height:14px;cursor:pointer">`:'';
      return `<tr${od?' class="overdue-row"':''}><td style="text-align:center">${chk}</td><td style="font-weight:700;color:#1F3864;font-size:11px;white-space:nowrap">${t.no||'–'}</td>
        <td><div style="font-weight:600;font-size:13px">${t.system_name||''}</div><div style="font-size:11px;color:#888;margin-top:2px">${t.description||''}</div></td>
        <td><span class="badge pri-${(t.priority||'').toLowerCase()}">${pl[t.priority]||t.priority}</span></td>
        <td style="font-size:12px;color:#666;white-space:nowrap">${t.date||'–'}</td>
        <td style="font-size:12px;color:${od?'#FF6600':'#666'};font-weight:${od?'700':'400'};white-space:nowrap">${t.deadline||'–'}</td>
        <td>${sb}</td><td style="font-size:12px;color:#888">${ph}</td>
        <td><div style="display:flex;gap:4px;flex-wrap:wrap"><button class="btn sm" onclick="showDetail('${t.id}')">View</button>
          <button class="btn sm" onclick="printTicket('${t.id}')">PDF</button>
          <button class="btn sm whatsapp" onclick="sendWhatsApp(${JSON.stringify(t).replace(/"/g,'&quot;')})">WA</button>
          ${eb}${cb}${db}</div></td></tr>`;
    }).join('')+'</tbody></table>';
}

function toggleAllTickets(checked){
  document.querySelectorAll('.ticket-chk').forEach(cb=>cb.checked=checked);
}

async function closeTicket(id){
  await sbFetch('qas2_tickets?id=eq.'+id,'PATCH',{status:'CLOSED',date_closed:new Date().toISOString().split('T')[0]});
  showToast('Ticket closed');await loadTickets();refreshDashboard();
}
async function reopenTicket(id){
  await sbFetch('qas2_tickets?id=eq.'+id,'PATCH',{status:'OPEN',date_closed:null});
  showToast('Ticket reopened');await loadTickets();refreshDashboard();
}
async function deleteTicket(id,no){
  if(!confirm('Delete ticket '+no+'?'))return;
  await sbFetch('qas2_tickets?id=eq.'+id,'DELETE');
  showToast('Deleted');await loadTickets();refreshDashboard();
}

async function showDetail(id){
  const t=await sbFetch('qas2_tickets?id=eq.'+id+'&select=*');
  if(!t||!t.length)return;
  const ticket=t[0];
  const photos=await sbFetch('qas2_photos?ticket_id=eq.'+id+'&select=photo_data');
  const isAdmin=currentUser.role==='admin';
  const canModify=isAdmin||(currentUser.role==='supervisor');
  const pl={A:'A – Safety Critical',B:'B – Operational',C:'C – Minor'};
  const od=isOverdue(ticket);
  const imgs=photos&&photos.length?`<div style="margin-bottom:12px"><div class="detail-label" style="margin-bottom:5px">Photos (${photos.length})</div><div class="modal-photos">${photos.map(p=>`<img src="${p.photo_data}" onclick="openLightbox('${p.photo_data}')">` ).join('')}</div></div>`:'';
  document.getElementById('modal-title').textContent=ticket.no+(od?' 🔴 OVERDUE':'');
  document.getElementById('modal-body').innerHTML=`
    <div class="detail-grid">
      <div class="detail-label">System</div><div>${ticket.system_name||'–'}</div>
      <div class="detail-label">Category</div><div>${ticket.category||'–'}</div>
      <div class="detail-label">Priority</div><div><span class="badge pri-${(ticket.priority||'').toLowerCase()}">${pl[ticket.priority]||ticket.priority}</span></div>
      <div class="detail-label">Status</div><div><span class="badge ${od?'overdue':ticket.status==='OPEN'?'open':'closed'}">${od?'OVERDUE':ticket.status}</span></div>
      <div class="detail-label">P&amp;ID Ref</div><div>${ticket.pid||'–'}</div>
      <div class="detail-label">KKS Tags</div><div>${ticket.kks||'–'}</div>
      <div class="detail-label">Raised By</div><div>${ticket.raised_by||'–'}</div>
      <div class="detail-label">Date Raised</div><div>${ticket.date||'–'}</div>
      <div class="detail-label">Target Close</div><div>${ticket.deadline||'–'}</div>
      <div class="detail-label">Date Closed</div><div>${ticket.date_closed||'–'}</div>
    </div>
    <div style="margin-bottom:12px"><div class="detail-label" style="margin-bottom:5px">Description</div>
      <div style="font-size:13px;line-height:1.6;background:#F9F9F9;padding:11px;border-radius:6px;border:1px solid #eee">${ticket.description||'–'}</div></div>
    <div style="margin-bottom:14px"><div class="detail-label" style="margin-bottom:5px">Required Corrective Action</div>
      <div style="font-size:13px;line-height:1.6;background:#F9F9F9;padding:11px;border-radius:6px;border:1px solid #eee">${ticket.action||'–'}</div></div>
    ${imgs}
    <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">
      <button class="btn whatsapp" onclick="sendWhatsApp(${JSON.stringify(ticket).replace(/'/g,'\\&apos;')})">WA</button>
      ${canModify&&ticket.status==='OPEN'?`<button class="btn success" onclick="closeTicket('${ticket.id}');closeModal()">Mark as Closed</button>`:''}
      ${canModify&&ticket.status==='CLOSED'?`<button class="btn" onclick="reopenTicket('${ticket.id}');closeModal()">Reopen</button>`:''}
      <button class="btn no-print" onclick="printTicket('${ticket.id}')">&#128438; Print / PDF</button>
      <button class="btn" onclick="closeModal()">Close</button>
    </div>`;
  document.getElementById('modal-bg').classList.add('show');
}

function closeModal(){document.getElementById('modal-bg').classList.remove('show');}

async function editTicket(id){
  const t=await sbFetch('qas2_tickets?id=eq.'+id+'&select=*');
  if(!t||!t.length)return;
  const ticket=t[0];
  document.getElementById('edit-no').textContent=ticket.no;
  document.getElementById('edit-id').value=ticket.id;
  document.getElementById('e-date').value=ticket.date||'';
  document.getElementById('e-deadline').value=ticket.deadline||'';
  document.getElementById('e-priority').value=ticket.priority||'A';
  document.getElementById('e-system').value=ticket.system_name||'';
  document.getElementById('e-category').value=ticket.category||'Design Deficiency';
  document.getElementById('e-pid').value=ticket.pid||'';
  document.getElementById('e-kks').value=ticket.kks||'';
  document.getElementById('e-desc').value=ticket.description||'';
  document.getElementById('e-action').value=ticket.action||'';
  document.getElementById('e-raised').value=ticket.raised_by||'';
  document.getElementById('e-status').value=ticket.status||'OPEN';
  document.getElementById('edit-modal-bg').classList.add('show');
}

async function saveEditTicket(){
  const id=document.getElementById('edit-id').value;
  const status=document.getElementById('e-status').value;
  const update={
    date:document.getElementById('e-date').value||null,
    deadline:document.getElementById('e-deadline').value||null,
    priority:document.getElementById('e-priority').value,
    system_name:document.getElementById('e-system').value.trim(),
    category:document.getElementById('e-category').value,
    pid:document.getElementById('e-pid').value.trim(),
    kks:document.getElementById('e-kks').value.trim(),
    description:document.getElementById('e-desc').value.trim(),
    action:document.getElementById('e-action').value.trim(),
    raised_by:document.getElementById('e-raised').value.trim(),
    status,
    date_closed:status==='CLOSED'?new Date().toISOString().split('T')[0]:null
  };
  await sbFetch('qas2_tickets?id=eq.'+id,'PATCH',update);
  closeEditModal();showToast('Ticket updated');await loadTickets();refreshDashboard();
}
// ── DASHBOARD ──
let _charts={};
function destroyCharts(){Object.values(_charts).forEach(c=>{try{c.destroy();}catch(e){}}); _charts={};}

async function renderDashboard(){
  if(!document.getElementById('view-dashboard')?.classList.contains('active'))return;
  try{
    const t=await sbFetch('qas2_tickets?select=*');
    const open=t.filter(x=>x.status==='OPEN').length;
    const closed=t.filter(x=>x.status==='CLOSED').length;
    const overdue=t.filter(x=>isOverdue(x)).length;
    const prioA=t.filter(x=>x.priority==='A'&&x.status==='OPEN');
    document.getElementById('ds-total').textContent=t.length;
    document.getElementById('ds-open').textContent=open;
    document.getElementById('ds-closed').textContent=closed;
    document.getElementById('ds-overdue').textContent=overdue;
    const ab=document.getElementById('dash-alerts');
    if(prioA.length){
      ab.style.display='block';
      document.getElementById('dash-alert-list').innerHTML=prioA.map(x=>`<div class="alert-row"><span style="font-weight:700;color:#1F3864;min-width:140px">${x.no}</span><span style="flex:1;margin:0 12px">${x.system_name||''}</span><span style="color:#FF6600;font-size:11px">${x.deadline?'Due: '+x.deadline:''}</span><button class="btn sm" style="margin-left:8px" onclick="showDetail('${x.id}')">View</button></div>`).join('');
    }else{ab.style.display='none';}
    destroyCharts();
    const base={responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{font:{size:11},padding:8,boxWidth:12}}}};
    _charts.status=new Chart(document.getElementById('chart-status'),{type:'doughnut',data:{labels:['Open','Closed','Overdue'],datasets:[{data:[Math.max(0,open-overdue),closed,overdue],backgroundColor:['#378ADD','#70AD47','#FF6600'],borderWidth:2,borderColor:'#fff',hoverOffset:6}]},options:{responsive:true,maintainAspectRatio:false,cutout:'65%',plugins:{legend:{position:'bottom',labels:{font:{size:11},padding:8,boxWidth:12}}}}});
    const pA=t.filter(x=>x.priority==='A').length,pB=t.filter(x=>x.priority==='B').length,pC=t.filter(x=>x.priority==='C').length;
    _charts.priority=new Chart(document.getElementById('chart-priority'),{type:'bar',data:{labels:['A','B','C'],datasets:[{label:'Tickets',data:[pA,pB,pC],backgroundColor:['#C00000','#FFC000','#70AD47'],borderRadius:6,borderSkipped:false}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,ticks:{stepSize:1,precision:0}}}}});
    const cats={};t.forEach(x=>{cats[x.category]=(cats[x.category]||0)+1;});
    _charts.cat=new Chart(document.getElementById('chart-category'),{type:'doughnut',data:{labels:Object.keys(cats),datasets:[{data:Object.values(cats),backgroundColor:['#1F3864','#C00000','#375623','#FF6600','#7030A0','#00B0F0'],borderWidth:2,borderColor:'#fff',hoverOffset:6}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:"bottom",labels:{font:{size:11},padding:8,boxWidth:12}}},cutout:'60%'}});
    const sys={};t.forEach(x=>{const s=x.system_name||'Unknown';sys[s]=(sys[s]||0)+1;});
    const sk=Object.keys(sys).sort((a,b)=>sys[b]-sys[a]).slice(0,8);
    _charts.sys=new Chart(document.getElementById('chart-system'),{type:'bar',data:{labels:sk,datasets:[{label:'Open',data:sk.map(k=>t.filter(x=>x.system_name===k&&x.status==='OPEN').length),backgroundColor:'#C00000',borderRadius:4,borderSkipped:false},{label:'Closed',data:sk.map(k=>t.filter(x=>x.system_name===k&&x.status==='CLOSED').length),backgroundColor:'#70AD47',borderRadius:4,borderSkipped:false}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:"bottom",labels:{font:{size:11},padding:8,boxWidth:12}}},indexAxis:'y',plugins:{legend:{display:true,position:'top',labels:{font:{size:11},boxWidth:12}}},scales:{x:{beginAtZero:true,stacked:true,ticks:{stepSize:1,precision:0}},y:{stacked:true}}}});
    const months={};t.forEach(x=>{const m=(x.date||'').substring(0,7)||'N/A';months[m]=(months[m]||0)+1;});
    const mk=Object.keys(months).sort().slice(-6);
    const mn=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    _charts.monthly=new Chart(document.getElementById('chart-monthly'),{type:'line',data:{labels:mk.map(m=>{const p=m.split('-');return (mn[parseInt(p[1])-1]||p[1])+' '+p[0].slice(2);}),datasets:[{label:'Tickets',data:mk.map(k=>months[k]),borderColor:'#1F3864',backgroundColor:'rgba(31,56,100,.08)',fill:true,tension:.4,pointRadius:5,pointBackgroundColor:'#1F3864',pointHoverRadius:7}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:"bottom",labels:{font:{size:11},padding:8,boxWidth:12}}},plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,ticks:{stepSize:1,precision:0}}}}});
  }catch(e){console.error('Dashboard error:',e);}
}

function refreshDashboard(){
  if(currentUser&&currentUser.role==='admin'&&document.getElementById('view-dashboard')?.classList.contains('active'))renderDashboard();
}

// ── USERS ──
async function loadUsers(){
  document.getElementById('users-list').innerHTML='<div class="loading"><div class="loading-spinner"></div><br>Loading...</div>';
  const users=await sbFetch('qas2_users?select=*&order=created_at.asc');
  const roleColors={admin:'#C00000',supervisor:'#375623',user:'#888'};
  const roleLabels={admin:'ADMIN',supervisor:'SUPERVISOR',user:'USER'};
  document.getElementById('users-list').innerHTML=users.map(u=>`
    <div class="user-card">
      <div><div class="uname">${u.name} <span class="role-badge" style="background:${roleColors[u.role]||'#888'};display:inline-block">${roleLabels[u.role]||u.role}</span></div><div class="urole">@${u.username}</div></div>
      <div style="display:flex;gap:6px">
        <button class="btn sm" onclick="editUser('${u.id}','${u.name}','${u.username}','${u.role}')">Edit</button>
        ${u.username!=='admin'?`<button class="btn sm danger" onclick="deleteUser('${u.id}','${u.name}')">Delete</button>`:'<span style="font-size:11px;color:#aaa">Protected</span>'}
      </div>
    </div>`).join('');
}

function showAddUser(){editingUserId=null;document.getElementById('user-modal-title').textContent='Add New User';['u-name','u-user','u-pass'].forEach(id=>document.getElementById(id).value='');document.getElementById('u-role').value='user';document.getElementById('user-modal-bg').classList.add('show');}
function editUser(id,name,username,role){editingUserId=id;document.getElementById('user-modal-title').textContent='Edit User';document.getElementById('u-name').value=name;document.getElementById('u-user').value=username;document.getElementById('u-pass').value='';document.getElementById('u-role').value=role;document.getElementById('user-modal-bg').classList.add('show');}
async function saveUser(){
  const name=document.getElementById('u-name').value.trim(),username=document.getElementById('u-user').value.trim(),pass=document.getElementById('u-pass').value,role=document.getElementById('u-role').value;
  if(!name||!username){alert('Name and username required.');return;}
  if(!editingUserId&&!pass){alert('Password required.');return;}
  try{
    if(editingUserId){const update={name,username,role};if(pass)update.password=pass;await sbFetch('qas2_users?id=eq.'+editingUserId,'PATCH',update);showToast('User updated');}
    else{await sbFetch('qas2_users','POST',{name,username,password:pass,role});showToast('User added: '+name);}
    closeUserModal();loadUsers();
  }catch(e){alert('Error: '+e.message);}
}
async function deleteUser(id,name){if(!confirm('Delete user '+name+'?'))return;await sbFetch('qas2_users?id=eq.'+id,'DELETE');showToast('User deleted');loadUsers();}
function closeUserModal(){document.getElementById('user-modal-bg').classList.remove('show');}

// ── APPROVALS ──
async function loadPLApprovalCount(){
  try{
    const pending=await sbFetch('qas2_approvals?status=eq.Pending&select=id');
    const count=pending?pending.length:0;
    const bell=document.getElementById('pl-approval-bell');
    const cnt=document.getElementById('pl-approval-count');
    const tabCnt=document.getElementById('pl-tab-cnt');
    if(bell)bell.style.display=count>0?'flex':'none';
    if(cnt){cnt.textContent=count;cnt.style.display=count>0?'inline-block':'none';}
    if(tabCnt){tabCnt.textContent=count;tabCnt.style.display=count>0?'inline-block':'none';}
  }catch(e){}
}

async function loadPLApprovals(){
  const filter=document.getElementById('pl-approval-filter')?.value||'Pending';
  const body=document.getElementById('pl-approvals-body');
  if(!body)return;
  body.innerHTML='<div class="loading"><div class="loading-spinner"></div><br>Loading...</div>';
  let q='qas2_approvals?select=*&order=created_at.desc';
  if(filter)q+='&status=eq.'+filter;
  const approvals=await sbFetch(q);
  loadPLApprovalCount();
  if(!approvals||!approvals.length){body.innerHTML='<div class="empty">No '+filter.toLowerCase()+' approvals</div>';return;}
  const typeLabels={ticket_close:'Close Ticket',ticket_edit:'Edit Ticket',equipment_add:'Add Equipment',equipment_edit:'Edit Equipment',checklist_update:'Checklist Update'};
  body.innerHTML=approvals.map(a=>{
    const old_v=a.old_value||{},new_v=a.new_value||{};
    const changed=Object.keys(new_v).filter(k=>old_v[k]!==undefined&&String(old_v[k])!==String(new_v[k]));
    const diffHtml=changed.length?'<div class="approval-diff">'+changed.map(k=>`<div class="diff-row"><span class="diff-label">${k}:</span><span class="diff-old">${old_v[k]||'–'}</span><span style="margin:0 6px;color:#888">→</span><span class="diff-new">${new_v[k]||'–'}</span></div>`).join('')+'</div>':'';
    return `<div class="approval-card ${a.status.toLowerCase()}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
        <div><div style="font-size:13px;font-weight:700">${typeLabels[a.request_type]||a.request_type}</div>
        <div style="font-size:12px;color:#555;margin-top:3px">${a.ref_label||a.description||''}</div>
        <div class="approval-meta">Requested by <strong>${a.requested_by}</strong> | ${new Date(a.created_at).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}</div></div>
        <span class="badge ${a.status==='Pending'?'open':a.status==='Approved'?'closed':'open'}">${a.status}</span>
      </div>
      ${diffHtml}
      ${a.status==='Rejected'&&a.rejection_reason?`<div style="background:#FFF5F5;padding:8px;border-radius:6px;font-size:12px;color:#C00000;margin-top:8px"><strong>Rejection reason:</strong> ${a.rejection_reason}</div>`:''}
      ${a.status==='Pending'?`<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn success sm" onclick="approvePLRequest('${a.id}')">✓ Approve</button>
        <input type="text" placeholder="Rejection reason..." id="pl-reject-${a.id}" style="flex:1;min-width:180px;padding:6px 10px;border:1px solid #ccc;border-radius:6px;font-family:Arial;font-size:12px">
        <button class="btn danger sm" onclick="rejectPLRequest('${a.id}')">✗ Reject</button>
      </div>`:''}
    </div>`;
  }).join('');
}

async function approvePLRequest(id){
  const a=await sbFetch('qas2_approvals?id=eq.'+id+'&select=*');
  if(!a||!a.length)return;
  const req=a[0];
  try{
    if(req.request_type==='ticket_close'||req.request_type==='ticket_edit'){await sbFetch('qas2_tickets?id=eq.'+req.ref_id,'PATCH',req.new_value);}
    await sbFetch('qas2_approvals?id=eq.'+id,'PATCH',{status:'Approved',reviewed_by:currentUser.name,reviewed_at:new Date().toISOString()});
    showToast('Approved ✓');loadPLApprovals();loadPLApprovalCount();loadTickets();
  }catch(e){alert('Error: '+e.message);}
}

async function rejectPLRequest(id){
  const reason=document.getElementById('pl-reject-'+id)?.value.trim();
  if(!reason){alert('Please enter a rejection reason.');return;}
  await sbFetch('qas2_approvals?id=eq.'+id,'PATCH',{status:'Rejected',reviewed_by:currentUser.name,reviewed_at:new Date().toISOString(),rejection_reason:reason});
  showToast('Rejected');loadPLApprovals();loadPLApprovalCount();
}

// ── HANDOVER REPORT ──
async function generateHandoverReport(){
  const btn=document.getElementById('handover-report-btn');
  if(btn){btn.disabled=true;btn.textContent='Generating...';}
  try{
    const tickets=await sbFetch('qas2_tickets?select=*&order=no.asc');
    const open=tickets.filter(x=>x.status==='OPEN');
    const closed=tickets.filter(x=>x.status==='CLOSED');
    const overdue=tickets.filter(x=>isOverdue(x));
    const priA=tickets.filter(x=>x.priority==='A');
    const priB=tickets.filter(x=>x.priority==='B');
    const priC=tickets.filter(x=>x.priority==='C');
    const dateStr=new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'long',year:'numeric'});
    const docNo='QAS2-HPLR-'+new Date().toISOString().split('T')[0].replace(/-/g,'');
    const permitted=open.length===0;
    const LOGO='data:image/jpeg;base64,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';
    const NAVY='#1F3864',RED='#B91C1C',GREEN='#166534',GOLD='#C9A84C',AMBER='#92400E';

    const css=`
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:'Segoe UI',Arial,sans-serif;color:#1a1a1a;background:#fff;font-size:11px}
      @page{size:A4;margin:12mm 14mm}
      @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
      .hdr{background:${NAVY};color:#fff;padding:16px 20px;display:flex;align-items:center;justify-content:space-between}
      .hdr-badge{font-size:8px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:${GOLD};margin-bottom:3px}
      .hdr-title{font-size:17px;font-weight:800;letter-spacing:.03em}
      .hdr-sub{font-size:9px;color:rgba(255,255,255,.6);margin-top:2px}
      .hdr-right{text-align:right}
      .hdr-docno{font-family:monospace;font-size:13px;font-weight:700;color:${GOLD}}
      .hdr-date{font-size:9px;color:rgba(255,255,255,.65);margin-top:4px}
      .gold-bar{height:4px;background:linear-gradient(90deg,${GOLD},#e8c97a,${GOLD});margin-bottom:14px}
      .status-banner{padding:12px 16px;border-radius:6px;font-size:13px;font-weight:800;text-align:center;margin-bottom:14px;border:2px solid;letter-spacing:.03em}
      .status-ok{background:#DCFCE7;color:${GREEN};border-color:#86EFAC}
      .status-no{background:#FEE2E2;color:${RED};border-color:#FCA5A5}
      .stats{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin-bottom:14px}
      .stat{border-radius:6px;padding:8px 4px;text-align:center;border:1px solid rgba(0,0,0,.07)}
      .stat-num{font-size:20px;font-weight:800;line-height:1}
      .stat-lbl{font-size:8px;text-transform:uppercase;letter-spacing:.06em;color:#666;margin-top:3px}
      .sec-head{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:#fff;padding:5px 10px;border-radius:4px 4px 0 0;margin-bottom:0}
      .sec-body{border:1px solid #e0e6f0;border-top:none;border-radius:0 0 4px 4px;margin-bottom:12px;overflow:hidden}
      .ptbl{width:100%;border-collapse:collapse;font-size:10px}
      .ptbl thead tr{background:${NAVY};color:#fff}
      .ptbl th{padding:6px 8px;text-align:left;font-weight:700;font-size:9px;letter-spacing:.05em;white-space:nowrap}
      .ptbl td{padding:5px 8px;border-bottom:1px solid #f0f0f0;vertical-align:top}
      .ptbl tr:nth-child(even) td{background:#FAFBFF}
      .pri{display:inline-block;padding:1px 7px;border-radius:3px;font-weight:800;font-size:9px}
      .pri-A{background:#FEE2E2;color:#B91C1C}
      .pri-B{background:#FEF3C7;color:#92400E}
      .pri-C{background:#F0FDF4;color:#15803D}
      .empty-note{padding:10px 12px;font-size:10px;font-weight:600;color:${GREEN};background:#F0FDF4}
      .sig-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px;margin-top:16px;padding-top:14px;border-top:2px solid ${NAVY}}
      .sig-title{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#666;margin-bottom:22px}
      .sig-line{border-bottom:1px solid #444;margin-bottom:4px;height:26px}
      .sig-name{font-size:9px;color:#555}
      .doc-footer{margin-top:12px;display:flex;justify-content:space-between;font-size:8px;color:#aaa;border-top:1px solid #eee;padding-top:8px}
      /* logo */
      .hdr-logo-wrap{width:80px;height:60px;background:#fff;border-radius:8px;border:1.5px solid #e0e6f0;display:flex;align-items:center;justify-content:center;padding:4px;flex-shrink:0}
      .hdr-logo-wrap img{width:72px;height:52px;object-fit:contain}
      .hdr-brand{display:flex;align-items:center;gap:14px}
      .hdr-eyebrow{font-size:8px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#3BB273;margin-bottom:3px}
      .gold-bar{height:4px;background:linear-gradient(90deg,#C9A84C,#e8c97a,#C9A84C);margin-bottom:14px}
    `;

    const plLabel={A:'A – Safety Critical',B:'B – Operational',C:'C – Minor'};

    const trow=(t,idx)=>`<tr>
      <td style="font-family:monospace;font-weight:700;color:${NAVY};white-space:nowrap">${t.no}</td>
      <td>${t.system_name||'–'}</td>
      <td><span class="pri pri-${t.priority||'C'}">${t.priority||'–'}</span></td>
      <td style="color:#555">${(t.description||'').substring(0,60)}${(t.description||'').length>60?'…':''}</td>
      <td style="white-space:nowrap">${t.date||'–'}</td>
      <td style="white-space:nowrap">${t.deadline||'–'}</td>
      <td>${t.raised_by||'–'}</td>
    </tr>`;

    const closedRow=(t)=>`<tr>
      <td style="font-family:monospace;font-weight:700;color:${NAVY};white-space:nowrap">${t.no}</td>
      <td>${t.system_name||'–'}</td>
      <td><span class="pri pri-${t.priority||'C'}">${t.priority||'–'}</span></td>
      <td style="color:#555">${(t.description||'').substring(0,60)}${(t.description||'').length>60?'…':''}</td>
      <td style="white-space:nowrap">${t.date||'–'}</td>
      <td style="white-space:nowrap">${t.date_closed||'–'}</td>
      <td>${t.raised_by||'–'}</td>
    </tr>`;

    let html='';

    // Header
    // Header
  html+=`<div class="hdr">
    <div class="hdr-brand">
      <div class="hdr-logo-wrap"><img src="${LOGO}"></div>
      <div>

        <div class="hdr-title">Commissioning Handover Punch List Report</div>
        <div class="hdr-sub">Al-Qassim 2 CCGT Power Plant &nbsp;·&nbsp; Wahat Al Wusta Maintenance Co.</div>
      </div>
    </div>
    <div class="hdr-right">
      <div class="hdr-docno">${docNo}</div>
      <div class="hdr-date">${dateStr}</div>
      <div class="hdr-date">Prepared by: ${currentUser.name}</div>
    </div>
  </div>
  <div class="gold-bar"></div>`;
    // Stats
    html+=`<div class="stats">
      ${[['Total',tickets.length,'#EEF2F8',NAVY],['Open',open.length,'#FEE2E2',RED],['Closed',closed.length,'#DCFCE7',GREEN],['Overdue',overdue.length,overdue.length?'#FEE2E2':'#F9FAFB',overdue.length?RED:'#888'],['Priority A',priA.length,'#FEE2E2',RED],['Closed %',tickets.length?Math.round(closed.length/tickets.length*100)+'%':'-','#F0FDF4',GREEN]].map(([l,v,bg,c])=>`
      <div class="stat" style="background:${bg}">
        <div class="stat-num" style="color:${c}">${v}</div>
        <div class="stat-lbl">${l}</div>
      </div>`).join('')}
    </div>`;

    // Open tickets
    html+=`<div class="sec-head" style="background:${open.length?RED:GREEN}">Open Punch Tickets (${open.length})</div>
    <div class="sec-body">`;
    if(open.length){
      html+=`<table class="ptbl"><thead><tr>
        <th>Ticket No.</th><th>System</th><th>Priority</th><th>Description</th><th>Date Raised</th><th>Target Close</th><th>Raised By</th>
      </tr></thead><tbody>${open.map((t,i)=>trow(t,i)).join('')}</tbody></table>`;
    }else{
      html+=`<div class="empty-note">&#10003; No open punch tickets — system ready for handover</div>`;
    }
    html+='</div>';

    // Closed tickets
    html+=`<div class="sec-head" style="background:${GREEN}">Closed Punch Tickets (${closed.length})</div>
    <div class="sec-body">`;
    if(closed.length){
      html+=`<table class="ptbl"><thead><tr>
        <th>Ticket No.</th><th>System</th><th>Priority</th><th>Description</th><th>Date Raised</th><th>Date Closed</th><th>Raised By</th>
      </tr></thead><tbody>${closed.map(t=>closedRow(t)).join('')}</tbody></table>`;
    }else{
      html+=`<div class="empty-note" style="color:#666;background:#f9f9f9">No closed tickets yet</div>`;
    }
    html+='</div>';

    // Signatures
    html+=`<div class="sig-grid">
      <div>
        <div class="sig-title">Prepared by / SCE</div>
        <div class="sig-line"></div>
        <div class="sig-name">${currentUser.name} &nbsp;|&nbsp; SCE</div>
      </div>
      <div>
        <div class="sig-title">EPC Contractor</div>
        <div class="sig-line"></div>
        <div class="sig-name">Name: _________________ &nbsp; Date: _________</div>
      </div>
      <div>
        <div class="sig-title">Owner Representative</div>
        <div class="sig-line"></div>
        <div class="sig-name">Name: _________________ &nbsp; Date: _________</div>
      </div>
    </div>`;

    // Footer






  // ── High-quality PDF via print dialog (vector, no canvas) ──
    const printHtml2=[
      '<!DOCTYPE html>',
      '<html>',
      '<head>',
      '<meta charset="UTF-8">',
      '<title>'+docNo+'<\/title>',
      '<style>',
      css,
      '@page{size:A4;margin:12mm 14mm}',
      '@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}',
      '<\/style>',
      '<\/head>',
      '<body><div style="padding:0">',
      html,
      '<\/div><\/body>',
      '<\/html>'
    ].join('');
    const win2=window.open('','_blank','width=900,height=700');
    if(!win2){showToast('Allow popups to generate PDF');return;}
    win2.document.open();
    win2.document.write(printHtml2);
    win2.document.close();
    win2.focus();
    setTimeout(function(){
      try{win2.print();}catch(e){}
    },800);
  }catch(err){showToast('Error: '+err.message);console.error(err);}
  finally{if(btn){btn.disabled=false;btn.textContent='\u{1F4C4} Handover Report';}}
}

// ── PRINT TICKET ──
async function printTicket(id){
  const t=await sbFetch('qas2_tickets?id=eq.'+id+'&select=*');
  if(!t||!t.length)return;
  const ticket=t[0];
  const photos=await sbFetch('qas2_photos?ticket_id=eq.'+id+'&select=photo_data');
  const pl={A:'A – Safety Critical',B:'B – Operational',C:'C – Minor'};
  const od=isOverdue(ticket);

  // Ticket number
  document.getElementById('print-ticket-no').textContent=ticket.no;

  // Status badge
  const sb=document.getElementById('print-status-badge');
  if(od){sb.innerHTML='<span class="pt-status-badge pt-status-overdue">OVERDUE</span>';}
  else if(ticket.status==='OPEN'){sb.innerHTML='<span class="pt-status-badge pt-status-open">OPEN</span>';}
  else{sb.innerHTML='<span class="pt-status-badge pt-status-closed">CLOSED</span>';}

  // Date
  document.getElementById('print-date-label').textContent='Printed: '+new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
  document.getElementById('print-footer-date').textContent='Generated: '+new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'long',year:'numeric'});

  // Priority bar
  const prBar=document.getElementById('print-priority-bar');
  const prLabels={A:'PRIORITY A — SAFETY CRITICAL',B:'PRIORITY B — OPERATIONAL',C:'PRIORITY C — MINOR'};
  prBar.className='pt-priority-bar pt-priority-'+(ticket.priority||'C');
  prBar.innerHTML='<span class="pt-priority-label">'+(prLabels[ticket.priority]||ticket.priority)+'</span>';

  // Info grid
  document.getElementById('print-info').innerHTML=[
    ['System',ticket.system_name||'–'],
    ['Category',ticket.category||'–'],
    ['P&ID Reference',ticket.pid||'–'],
    ['KKS Tags',ticket.kks||'–'],
    ['Date Raised',ticket.date||'–'],
    ['Target Close',ticket.deadline||'–'],
    ['Raised By',ticket.raised_by||'–'],
    ['Date Closed',ticket.date_closed||'–'],
  ].map(([k,v])=>`<div class="pt-info-cell"><div class="pt-info-key">${k}</div><div class="pt-info-val">${v}</div></div>`).join('');

  // Description & action
  document.getElementById('print-desc').textContent=ticket.description||'–';
  document.getElementById('print-action').textContent=ticket.action||'–';

  // Signature raised by
  document.getElementById('print-sig-raised').textContent=(ticket.raised_by||'–');

  // Photos
  const photoSection=document.getElementById('print-photos-section');
  const photoGrid=document.getElementById('print-photos');
  if(photos&&photos.length){
    photoSection.style.display='block';
    photoGrid.innerHTML=photos.map(p=>`<img src="${p.photo_data}">`).join('');
  }else{photoSection.style.display='none';}

  // Show
  document.getElementById('main-app').style.display='none';
  document.getElementById('print-area').style.display='block';
  const pab=document.getElementById('print-area').querySelector('.pt-no-print');
  if(pab)pab.style.display='block';
  window.scrollTo(0,0);
}
// ── EXPORT CSV ──
async function exportCSV(){
  const tickets=await sbFetch('qas2_tickets?select=*&order=no.asc');
  if(!tickets.length){alert('No tickets.');return;}
  const h=['Ticket No.','System','Category','Priority','P&ID','KKS','Description','Action','Raised By','Date Raised','Deadline','Status','Date Closed'];
  const r=tickets.map(t=>[t.no,t.system_name,t.category,t.priority,t.pid,t.kks,t.description,t.action,t.raised_by,t.date,t.deadline,t.status,t.date_closed].map(v=>'"'+(v||'').toString().replace(/"/g,'""')+'"').join(','));
  const a=document.createElement('a');
  a.href='data:text/csv;charset=utf-8,\uFEFF'+encodeURIComponent([h.join(','),...r].join('\n'));
  a.download='QAS2-PunchList-'+new Date().toISOString().split('T')[0]+'.csv';a.click();
}

// ── SWITCH TAB ──
function switchTab(tab){
  const views=['dashboard','new','register','users','approvals','dailyreport','docs'];
  views.forEach(v=>{
    const el=document.getElementById('view-'+v);
    if(el)el.classList.toggle('active',v===tab);
    const btn=document.getElementById('tab-'+v)||document.getElementById('tab-pl-'+v)||document.getElementById('tab-'+v);
    if(btn)btn.classList.toggle('active',v===tab);
  });
  if(tab==='register')loadTickets();
  if(tab==='users')loadUsers();
  if(tab==='dashboard')setTimeout(renderDashboard,80);
  if(tab==='approvals')loadPLApprovals();
  if(tab==='dailyreport')initDailyReport();
  
}

// ── HELPERS ──
function openLightbox(src){document.getElementById('lb-img').src=src;document.getElementById('lightbox').classList.add('show');}
function closeLightbox(){document.getElementById('lightbox').classList.remove('show');}

// ══ DAILY REPORT ══
let drPendingPhotos=[];

async function initDailyReport(){
  const d=new Date();
  document.getElementById('dr-date').value=d.toISOString().split('T')[0];
  document.getElementById('dr-date-display').textContent=
    d.toLocaleDateString('en-GB',{day:'2-digit',month:'long',year:'numeric'});
  if(currentUser){
    document.getElementById('dr-name').value=currentUser.name;
    document.getElementById('dr-role').value=
      currentUser.role==='admin'?'SCE – Senior Commissioning Engineer':
      currentUser.role==='supervisor'?'Commissioning Engineer':'Field Operator';
  }
  // Get next report number
  try{
    const counters=await sbFetch('qas2_counters?month_key=eq.DAR_GLOBAL&select=counter');
    const next=(counters&&counters.length?counters[0].counter:0)+1;
    document.getElementById('dr-rep-no').value='QAS2-DAR-'+String(next).padStart(4,'0');
  }catch(e){
    document.getElementById('dr-rep-no').value='QAS2-DAR-0001';
  }
  drPendingPhotos=[];
  renderDRPhotoPreview();
  document.getElementById('dr-all-reports').style.display='block';
  loadTodayReports();
  // All users can submit reports
  if(document.getElementById('dr-submit-btns'))document.getElementById('dr-submit-btns').style.display='flex';
  if(currentUser&&currentUser.role==='admin'){
    document.getElementById('dr-compile-btn').style.display='inline-block';
  }
}

async function handleDRPhotos(e){
  for(const f of Array.from(e.target.files)){
    const compressed=await compressImage(f);
    drPendingPhotos.push(compressed);
  }
  renderDRPhotoPreview();
  document.getElementById('dr-photo-input').value='';
}

function renderDRPhotoPreview(){
  document.getElementById('dr-photo-preview').innerHTML=drPendingPhotos.map((s,i)=>
    `<div class="photo-thumb"><img src="${s}" onclick="openLightbox('${s}')"><button class="del" onclick="removeDRPhoto(${i})">&#x2715;</button></div>`
  ).join('');
}

function removeDRPhoto(i){drPendingPhotos.splice(i,1);renderDRPhotoPreview();}

async function submitDailyReport(){
  const activities=document.getElementById('dr-activities').value.trim();
  const system=document.getElementById('dr-system').value.trim();
  if(!system&&!activities&&
     !document.getElementById('dr-achievements').value.trim()&&
     !document.getElementById('dr-issues').value.trim()){
    showToast('Please fill in at least one field');return;
  }

  const btn=document.querySelector('#view-dailyreport .btn.primary:last-of-type');
  if(btn){btn.disabled=true;btn.textContent='Submitting...';}

  try{
    // Generate sequential report number
    let repNo='QAS2-DAR-0001';
    try{
      const rc=await sbFetch('qas2_counters?month_key=eq.DAR_GLOBAL&select=counter');
      const next=(rc&&rc.length?rc[0].counter:0)+1;
      repNo='QAS2-DAR-'+String(next).padStart(4,'0');
      if(rc&&rc.length){
        await sbFetch('qas2_counters?month_key=eq.DAR_GLOBAL','PATCH',{counter:next});
      }else{
        await sbFetch('qas2_counters','POST',{month_key:'DAR_GLOBAL',counter:next});
      }
    }catch(e){repNo='QAS2-DAR-'+Date.now().toString().slice(-4);}
    const drData={
      report_no:repNo,
      report_date:document.getElementById('dr-date').value,
      prepared_by:currentUser.name,
      submitted_by_username:currentUser.username,
      role:document.getElementById('dr-role').value||'Field Operator',
      system_worked:system||'General',
      systems:system||'General',
      content:activities||'General activities',
      achievements:document.getElementById('dr-achievements').value.trim()||'None reported',
      issues:document.getElementById('dr-issues').value.trim()||'No issues',
      next_plan:document.getElementById('dr-plans').value.trim()||'Continue commissioning activities',
    };
    if(drPendingPhotos.length)drData.photos=drPendingPhotos;

    await sbFetch('qas2_daily_reports','POST',drData);
    showToast('Report '+repNo+' submitted ✓');
    clearDRForm();
    loadTodayReports();
  }catch(e){showToast('Error: '+e.message);}
  if(btn){btn.disabled=false;btn.textContent='✓ Submit Report';}
}

function clearDRForm(){
  ['dr-system','dr-activities','dr-achievements','dr-issues','dr-plans']
    .forEach(id=>document.getElementById(id).value='');
  drPendingPhotos=[];
  renderDRPhotoPreview();
}

async function loadTodayReports(){
  const today=new Date().toISOString().split('T')[0];
  const reports=await sbFetch('qas2_daily_reports?report_date=eq.'+today+'&select=*&order=created_at.asc')||[];
  document.getElementById('dr-submitted-count').textContent=reports.length;
  const list=document.getElementById('dr-reports-list');
  if(!reports.length){list.innerHTML='<div class="empty">No reports submitted yet today</div>';return;}
  const isAdmin=currentUser&&currentUser.role==='admin';
  list.innerHTML=`<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:#EEF2F8;border-radius:6px;margin-bottom:10px;font-size:11px;font-weight:600;color:#1F3864">
    <input type="checkbox" id="chk-all" onchange="toggleAllReports(this.checked)" checked style="width:15px;height:15px;cursor:pointer">
    <label for="chk-all" style="cursor:pointer">Select All (${reports.length} reports)</label>
  </div>`+reports.map(r=>`
    <div class="dr-report-card" id="rcard-${r.id}">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <div style="display:flex;align-items:center;gap:10px">
          <input type="checkbox" class="report-chk" data-id="${r.id}" checked style="width:15px;height:15px;cursor:pointer;flex-shrink:0">
          <div>
            <div class="dr-report-user">${r.report_no||'–'} &nbsp;—&nbsp; ${r.prepared_by||r.submitted_by_username||'–'}</div>
            <div class="dr-report-meta">${r.role||'–'}</div>
          </div>
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          <button class="btn sm" onclick="printSingleReport('${r.id}')" style="font-size:10px;padding:3px 8px">🖨 PDF</button>
          ${isAdmin?`<button class="btn sm" onclick="editReport('${r.id}')" style="font-size:10px;padding:3px 8px;background:#FFF3CD">✏️</button>`:''}
          ${isAdmin?`<button class="btn sm danger" onclick="deleteReport('${r.id}','${r.report_no||r.id}')" style="font-size:10px;padding:3px 8px">🗑</button>`:''}
          <span style="background:#E2EFDA;color:#375623;font-size:10px;font-weight:700;padding:3px 10px;border-radius:10px">✓ Submitted</span>
        </div>
      </div>
      <div class="dr-report-body" id="rbody-${r.id}">
        <div style="margin-bottom:5px"><span class="dr-report-label">Activities: </span>${r.content||'–'}</div>
        ${r.achievements&&r.achievements!=='None reported'?`<div style="margin-bottom:5px;color:#375623"><span class="dr-report-label">Achievements: </span>${r.achievements}</div>`:''}
        ${r.issues&&r.issues!=='No issues'?`<div style="margin-bottom:5px;color:#C00000"><span class="dr-report-label">Issues: </span>${r.issues}</div>`:''}
        <div><span class="dr-report-label">Tomorrow: </span>${r.next_plan||'–'}</div>
        ${r.photos&&r.photos.length?`<div style="margin-top:8px"><span class="dr-report-label">Photos (${r.photos.length})</span>
          <div class="modal-photos">${r.photos.map(p=>`<img src="${p}" onclick="openLightbox('${p}')" style="width:80px;height:60px;object-fit:cover;border-radius:4px;cursor:pointer;margin:3px">`).join('')}</div></div>`:''}
      </div>
    </div>`).join('');
}

function toggleAllReports(checked){
  document.querySelectorAll('.report-chk').forEach(cb=>cb.checked=checked);
}

function editReport(id){
  const card=document.getElementById('rcard-'+id);
  const body=document.getElementById('rbody-'+id);
  // Get current values
  const labels=body.querySelectorAll('.dr-report-label');
  let content='',achievements='',issues='',nextPlan='';
  labels.forEach(l=>{
    const text=l.parentElement.textContent.replace(l.textContent,'').trim();
    if(l.textContent==='Activities: ')content=text;
    if(l.textContent==='Achievements: ')achievements=text;
    if(l.textContent==='Issues: ')issues=text;
    if(l.textContent==='Tomorrow: ')nextPlan=text;
  });
  body.innerHTML=`
    <div style="display:flex;flex-direction:column;gap:8px">
      <div class="field"><label for="edit-content-${id}">Activities</label><textarea id="edit-content-${id}" style="min-height:60px">${content}</textarea></div>
      <div class="field"><label for="edit-ach-${id}">Achievements</label><textarea id="edit-ach-${id}" style="min-height:50px">${achievements}</textarea></div>
      <div class="field"><label for="edit-issues-${id}">Issues</label><textarea id="edit-issues-${id}" style="min-height:50px">${issues}</textarea></div>
      <div class="field"><label for="edit-plan-${id}">Plan for Tomorrow</label><textarea id="edit-plan-${id}" style="min-height:50px">${nextPlan}</textarea></div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn" onclick="loadTodayReports()" style="font-size:11px">Cancel</button>
        <button class="btn primary" onclick="saveEditReport('${id}')" style="font-size:11px">✓ Save Changes</button>
      </div>
    </div>`;
}

async function saveEditReport(id){
  const content=document.getElementById('edit-content-'+id).value.trim();
  const achievements=document.getElementById('edit-ach-'+id).value.trim();
  const issues=document.getElementById('edit-issues-'+id).value.trim();
  const nextPlan=document.getElementById('edit-plan-'+id).value.trim();
  try{
    await sbFetch('qas2_daily_reports?id=eq.'+id,'PATCH',{
      content:content||'–',
      achievements:achievements||'None reported',
      issues:issues||'No issues',
      next_plan:nextPlan||'Continue commissioning activities'
      // created_at NOT included — timestamp preserved
    });
    showToast('Report updated ✓');
    loadTodayReports();
  }catch(e){showToast('Error: '+e.message);}
}


async function deleteReport(id, no){
  if(!confirm('Delete report '+no+'? This cannot be undone.'))return;
  try{
    await sbFetch('qas2_daily_reports?id=eq.'+id,'DELETE');
    showToast('Report '+no+' deleted');
    loadTodayReports();
  }catch(e){showToast('Error: '+e.message);}
}

async function compileMasterReport(){
  const today=new Date().toISOString().split('T')[0];
  // today already declared above
  const allReports=await sbFetch('qas2_daily_reports?report_date=eq.'+today+'&select=*&order=created_at.asc')||[];
  if(!allReports.length){alert('No reports submitted today.');return;}
  // Get selected report IDs from checkboxes
  const checkedBoxes=[...document.querySelectorAll('.report-chk:checked')];
  const selectedIds=checkedBoxes.map(cb=>cb.dataset.id);
  const reports=selectedIds.length?allReports.filter(r=>selectedIds.includes(String(r.id))):allReports;
  if(!reports.length){alert('Please select at least one report.');return;}
  const allPunches=await sbFetch('qas2_tickets?status=eq.OPEN&select=no,id,system_name,priority,description&order=priority.asc')||[];
  const checkedTickets=[...document.querySelectorAll('.ticket-chk:checked')];
  const selectedTicketIds=checkedTickets.map(cb=>cb.dataset.id);
  const punches=selectedTicketIds.length?allPunches.filter(p=>selectedTicketIds.includes(String(p.id))):allPunches;
  const priA=punches.filter(p=>p.priority==='A').length;
  const priB=punches.filter(p=>p.priority==='B').length;
  const priC=punches.filter(p=>p.priority==='C').length;
  const dateFormatted=new Date(today).toLocaleDateString('en-GB',{day:'2-digit',month:'long',year:'numeric'});
  const docNo='QAS2-MDAR-'+today.replace(/-/g,'');
  const allSystems=[...new Set(reports.flatMap(r=>(r.system_worked||'').split(/,|;/).map(s=>s.trim())))].filter(Boolean);
  const allAchievements=reports.filter(r=>r.achievements&&r.achievements!=='None reported').map(r=>({name:r.prepared_by,text:r.achievements}));
  const allIssues=reports.filter(r=>r.issues&&r.issues!=='No issues').map(r=>({name:r.prepared_by,text:r.issues}));
  const genTime=new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});

  // ── Color palette ──
  const NAVY='#1F3864', GOLD='#C9A84C', RED='#C00000', GREEN='#375623',
        AMBER='#7D5A00', LIGHT='#F8FAFC';

  // ── CSS ──
  const LOGO='data:image/jpeg;base64,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';
  const css=`
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',Arial,sans-serif;color:#1a1a1a;background:#F4F6F9;font-size:11px;line-height:1.5}
    @page{size:A4;margin:8mm 10mm}
    @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;background:#F4F6F9}}

    /* ── HEADER ── */
    .hdr{background:#fff;padding:16px 20px;display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #1F3864}
    .hdr-brand{display:flex;align-items:center;gap:16px}
    .hdr-logo{width:110px;height:70px;border-radius:12px;overflow:hidden;border:2px solid #e0e6f0;background:#fff;padding:6px 10px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 10px rgba(0,0,0,0.10)}
    .hdr-logo img{width:94px;height:58px;object-fit:contain}
    .hdr-eyebrow{font-size:8px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#3BB273;margin-bottom:4px}
    .hdr-title{font-size:20px;font-weight:900;color:#1F3864;letter-spacing:.02em;line-height:1.1}
    .hdr-sub{font-size:9px;color:#888;margin-top:3px}
    .hdr-right{text-align:right}
    .hdr-docno{font-family:'Courier New',monospace;font-size:12px;font-weight:700;color:#1F3864;background:#EEF2F8;padding:4px 10px;border-radius:5px;display:inline-block}
    .hdr-date{font-size:9px;color:#888;margin-top:6px}

    /* ── ACCENT BAR ── */
    .accent-line{height:4px;background:linear-gradient(90deg,#3BB273,#6B4FBB 50%,#1F3864);margin-bottom:14px}

    /* ── STAT CARDS ── */
    .stats{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin-bottom:14px}
    .stat{background:#fff;border-radius:8px;padding:10px 5px;text-align:center;border:0.5px solid #e0e6f0}
    .stat-num{font-size:22px;font-weight:900;line-height:1;margin-bottom:3px}
    .stat-lbl{font-size:7.5px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#999}

    /* ── SECTION ── */
    .sec{background:#fff;border-radius:8px;border:0.5px solid #e0e6f0;margin-bottom:12px;overflow:hidden}
    .sec-head{padding:10px 14px;display:flex;align-items:center;gap:9px;background:#1F3864;border-radius:6px 6px 0 0}
    .sec-dot{width:7px;height:7px;border-radius:50%;background:#3BB273;flex-shrink:0}
    .sec-head-txt{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:#fff}
    .sec-lbl{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.12em;color:#fff}
    .sec-body{padding:10px 12px;background:#fff}

    /* ── SYSTEM TAGS ── */
    .sys-tag{display:inline-block;background:#EEF5FF;color:#1F3864;font-size:9.5px;font-weight:700;padding:4px 12px;border-radius:20px;border:1px solid #C8D8F0;margin:2px}

    /* ── REPORT CARDS ── */
    .rcard{border-left:4px solid #3B82F6;border-radius:0 8px 8px 0;margin-bottom:8px;overflow:hidden;background:#fff;border:0.5px solid #e0e6f0;border-left:4px solid #3B82F6}
    .rcard-head{background:linear-gradient(135deg,#F0F5FF,#EBF5F0);padding:9px 12px;display:flex;justify-content:space-between;align-items:center;border-bottom:0.5px solid #DDE8F5}
    .rcard-no{font-family:'Courier New',monospace;font-size:8.5px;font-weight:700;background:#1F3864;color:#F0C040;padding:3px 8px;border-radius:4px}
    .rcard-name{font-weight:900;font-size:13px;color:#1F3864;margin-left:8px}
    .rcard-role{font-size:9.5px;color:#666;margin-left:6px;font-style:italic}

    .rcard-body{padding:9px 12px;background:#fff}
    .rcard-row{display:grid;grid-template-columns:90px 1fr;gap:3px 8px;margin-bottom:5px;font-size:10px;align-items:start}
    .rcard-key{font-weight:700;color:#555}
    .rcard-val{color:#333;line-height:1.5}
    .rcard-val.green{color:#166534;font-weight:600}
    .rcard-val.red{color:#991B1B;font-weight:600}
    .photo-grid{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
    .photo-grid img{width:115px;height:86px;object-fit:cover;border-radius:5px;border:0.5px solid #e0e0e0}

    /* ── SUMMARY ── */
    .sum-item{display:flex;gap:8px;padding:5px 0;font-size:10px;border-bottom:0.5px solid #f0f0f0}
    .sum-item:last-child{border-bottom:none}
    .sum-name{font-weight:700;min-width:100px}
    .sum-text{flex:1;line-height:1.5}

    /* ── PUNCH TABLE ── */
    .ptbl{width:100%;border-collapse:collapse;font-size:9.5px}
    .ptbl thead tr{background:#1F3864}
    .ptbl th{padding:7px 8px;text-align:left;font-weight:700;font-size:8.5px;letter-spacing:.07em;color:#fff}
    .ptbl td{padding:5px 8px;border-bottom:0.5px solid #F0F0F0;vertical-align:top;color:#333}
    .ptbl tr:nth-child(even) td{background:#FAFBFF}
    .pri{display:inline-block;padding:2px 9px;border-radius:4px;font-weight:800;font-size:8.5px}
    .pri-A{background:#FEE2E2;color:#991B1B}
    .pri-B{background:#FEF3C7;color:#92400E}
    .pri-C{background:#DCFCE7;color:#166534}

    /* ── FOOTER ── */
    .doc-footer{margin-top:14px;padding:8px 12px;display:flex;justify-content:space-between;align-items:center;font-size:8px;color:#aaa;background:#fff;border-radius:6px;border:0.5px solid #e8ecf2}
    .no-tickets{padding:10px 14px;font-size:10px;font-weight:700;color:#166534;background:#F0FDF4;border-left:4px solid #3BB273}
  `;
  let html='';

  // Header
  // Header
  html+=`<div class="hdr">
    <div class="hdr-brand">
      <div class="hdr-logo"><img src="${LOGO}"></div>
      <div>

        <div class="hdr-title">Daily Activity Report</div>
        <div class="hdr-sub">Al-Qassim 2 CCGT Power Plant &nbsp;·&nbsp; Wahat Al Wusta Maintenance Co.</div>
      </div>
    </div>
    <div class="hdr-right">
      <div class="hdr-docno">${docNo}</div>
      <div class="hdr-date">${dateFormatted} &nbsp;|&nbsp; SCE: Mohammed Alharish</div>
    </div>
  </div>
  <div class="accent-line"></div>`;
  // Stats
  html+=`<div class="stats">
    <div class="stat"><div class="stat-num" style="color:#1F3864">${reports.length}</div><div class="stat-lbl">Reports</div></div>
    <div class="stat"><div class="stat-num" style="color:#3BB273">${allSystems.length}</div><div class="stat-lbl">Systems</div></div>
    <div class="stat"><div class="stat-num" style="color:#EF4444">${punches.length}</div><div class="stat-lbl">Open</div></div>
    <div class="stat"><div class="stat-num" style="color:#DC2626">${priA}</div><div class="stat-lbl">Pri-A</div></div>
    <div class="stat"><div class="stat-num" style="color:#D97706">${priB}</div><div class="stat-lbl">Pri-B</div></div>
    <div class="stat"><div class="stat-num" style="color:#3BB273">${priC}</div><div class="stat-lbl">Pri-C</div></div>
    <div class="stat"><div class="stat-num" style="color:#6B4FBB">${allIssues.length}</div><div class="stat-lbl">Issues</div></div>
  </div>`;

  // Systems
  if(allSystems.length){
    html+=`<div class="sec"><div class="sec-head"><span class="sec-dot" style="background:#3BB273"></span><span class="sec-lbl">Systems Worked On Today</span></div>
    <div class="sec-body">${allSystems.map(s=>`<span class="sys-tag">${s}</span>`).join('')}</div></div>`;
  }

  // Individual reports
  html+=`<div class="sec-head" style="background:linear-gradient(135deg,#1F3864,#2A4A7F)"><span class="sec-head-dot"></span><span class="sec-head-txt">Individual Activity Reports (${reports.length})</span></div>
  <div class="sec-body" style="padding:8px">`;
  reports.forEach(r=>{
    const hasPhotos=r.photos&&r.photos.length>0;
    html+=`<div class="rcard">
      <div class="rcard-head">
        <div>
          <span class="rcard-no">${r.report_no||'–'}</span>
          <span class="rcard-name">${r.prepared_by||r.submitted_by_username||'–'}</span>
          <span class="rcard-role">${r.role||''}</span>
        </div>

      </div>
      <div class="rcard-body">
        <div class="rcard-row"><span class="rcard-key">Systems:</span><span class="rcard-val">${r.system_worked||'–'}</span></div>
        <div class="rcard-row"><span class="rcard-key">Activities:</span><span class="rcard-val">${r.content||r.activities||'–'}</span></div>
        ${r.achievements&&r.achievements!=='None reported'?`<div class="rcard-row"><span class="rcard-key">Achievements:</span><span class="rcard-val green">${r.achievements}</span></div>`:''}
        ${r.issues&&r.issues!=='No issues'?`<div class="rcard-row"><span class="rcard-key">Issues:</span><span class="rcard-val red">${r.issues}</span></div>`:''}
        ${r.next_plan?`<div class="rcard-row"><span class="rcard-key">Tomorrow:</span><span class="rcard-val">${r.next_plan}</span></div>`:''}
        ${hasPhotos?`<div class="photo-grid">${r.photos.map(p=>`<img src="${p}">`).join('')}</div>`:''}
      </div>
    </div>`;
  });
  html+='</div>';

  // Achievements summary
  if(allAchievements.length){
    html+=`<div class="sec-head" style="background:#166534"><span class="sec-head-dot"></span><span class="sec-head-txt">Achievements & Milestones (${allAchievements.length})</span></div>
    <div class="sec-body" style="background:#F0FDF4;padding:10px 12px">
      ${allAchievements.map(a=>`<div class="sum-item"><span class="sum-icon" style="color:#3BB273">✓</span><span class="sum-name" style="color:#166534">${a.name}</span><span class="sum-text" style="color:#166534">${a.text}</span></div>`).join('')}
    </div>`;
  }

  // Issues summary
  if(allIssues.length){
    html+=`<div class="sec-head" style="background:#991B1B"><span class="sec-head-dot"></span><span class="sec-head-txt">Issues & Challenges (${allIssues.length})</span></div>
    <div class="sec-body" style="background:#FFF5F5;padding:10px 12px">
      ${allIssues.map(i=>`<div class="sum-item"><span class="sum-icon" style="color:#DC2626">!</span><span class="sum-name" style="color:#991B1B">${i.name}</span><span class="sum-text" style="color:#7F1D1D">${i.text}</span></div>`).join('')}
    </div>`;
  }

  // Open punch tickets
  html+=`<div class="sec-head" style="background:${punches.length?'#991B1B':'#166534'}"><span class="sec-head-dot"></span><span class="sec-head-txt">Open Punch Tickets (${punches.length})</span></div>
  <div class="sec-body">`;
  if(punches.length){
    html+=`<table class="ptbl"><thead><tr>
      <th>Ticket No.</th><th>System</th><th>Priority</th><th>Description</th>
    </tr></thead><tbody>`;
    punches.forEach((p,i)=>{
      html+=`<tr>
        <td style="font-family:'Courier New',monospace;font-weight:700;color:#1F3864;white-space:nowrap">${p.no}</td>
        <td>${p.system_name||'–'}</td>
        <td><span class="pri pri-${p.priority||'C'}">${p.priority||'–'}</span></td>
        <td style="color:#555">${(p.description||'').substring(0,80)}${(p.description||'').length>80?'…':''}</td>
      </tr>`;
    });
    html+='</tbody></table>';
  }else{
    html+='<div class="no-tickets">✓ All punch tickets closed — system ready for handover</div>';
  }
  html+='</div>';

  // Footer







  // ── High-quality PDF via print dialog (vector, no canvas) ──
  const btn=document.getElementById('dr-compile-btn');
  if(btn){btn.disabled=true;btn.textContent='Generating PDF...';}
  try{
    const printHtml=[
      '<!DOCTYPE html>',
      '<html>',
      '<head>',
      '<meta charset="UTF-8">',
      '<title>'+docNo+'<\/title>',
      '<style>',
      css,
      '@page{size:A4;margin:12mm 14mm}',
      '@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}',
      '<\/style>',
      '<\/head>',
      '<body><div class="page">',
      html,
      '<\/div><\/body>',
      '<\/html>'
    ].join('');
    const win=window.open('','_blank','width=900,height=700');
    if(!win){showToast('Allow popups to generate PDF');if(btn){btn.disabled=false;btn.textContent='📄 Compile Master Report';}return;}
    win.document.open();
    win.document.write(printHtml);
    win.document.close();
    win.focus();
    setTimeout(function(){
      try{win.print();}catch(e){}
      if(btn){btn.disabled=false;btn.textContent='📄 Compile Master Report';}
    },800);
  }catch(err){
    showToast('Error: '+err.message);
    if(btn){btn.disabled=false;btn.textContent='📄 Compile Master Report';}
  }
}
function savePDF(){
  const pa=document.getElementById('print-area');
  if(!pa)return;
  const html=pa.innerHTML;
  const win=window.open('','_blank');
  if(!win){showToast('Allow popups to print');return;}
  win.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>QAS2 Ticket</title><style>'+
    document.querySelector('style').textContent+
    '@page{size:A4;margin:0}body{background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}'+
    '.pt-no-print{display:none!important}'+
    '<\/style><\/head><body>'+html+'<\/body><\/html>');
  win.document.close();
  win.focus();
  setTimeout(()=>{try{win.print();}catch(e){}},600);
}

function closeEditModal(){document.getElementById('edit-modal-bg').classList.remove('show');}

async function sendWhatsApp(t){
  const text='*QAS2 Punch Ticket: '+t.no+'*%0A'+'System: '+t.system_name+'%0A'+'Priority: '+t.priority+'%0A'+'Status: '+t.status+'%0A'+'Description: '+(t.description||'').substring(0,100);
  window.open('https://wa.me/?text='+text,'_blank');
}

async function printSingleReport(id){
  const reports=await sbFetch('qas2_daily_reports?id=eq.'+id+'&select=*');
  if(!reports||!reports.length)return;
  const r=reports[0];
  const win=window.open('','_blank');
  const css='body{font-family:Arial,sans-serif;padding:20px;color:#333}h2{color:#1F3864}table{width:100%;border-collapse:collapse}td{padding:8px;border-bottom:1px solid #eee}th{padding:8px;background:#EEF2F8;text-align:left}.footer{margin-top:30px;font-size:10px;color:#aaa;border-top:1px solid #eee;padding-top:8px}@media print{.no-print{display:none}}';
  let html='<'+'html><'+'head><title>'+r.report_no+'<\/title><'+'style>'+css+'<\/style><\/head><'+'body>';
  html+='<h2>'+r.report_no+'<\/h2>';
  html+='<p><strong>Date:<\/strong> '+r.report_date+' | <strong>By:<\/strong> '+(r.prepared_by||r.submitted_by_username||'')+'<\/p>';
  html+='<table>';
  html+='<tr><th>Systems<\/th><td>'+(r.system_worked||'-')+'<\/td><\/tr>';
  html+='<tr><th>Activities<\/th><td>'+(r.content||r.activities||'-')+'<\/td><\/tr>';
  if(r.achievements&&r.achievements!=='None reported') html+='<tr><th>Achievements<\/th><td>'+r.achievements+'<\/td><\/tr>';
  if(r.issues&&r.issues!=='No issues') html+='<tr><th>Issues<\/th><td>'+r.issues+'<\/td><\/tr>';
  if(r.next_plan) html+='<tr><th>Tomorrow<\/th><td>'+r.next_plan+'<\/td><\/tr>';
  html+='<\/table>';
  html+='<div class="footer">QAS2 CORE | Wahat Al Wusta Maintenance Co.<\/div>';
  html+='<\/body><\/html>';
  win.document.write(html);
  win.document.close();
  setTimeout(()=>win.print(),500);
}


// ── DOCUMENTS ──





function showUploadDoc(){
  document.getElementById('doc-upload-form').style.display='block';
  document.getElementById('doc-title').value='';
  document.getElementById('doc-no').value='';
  document.getElementById('doc-system').value='';
  document.getElementById('doc-category').value='';
  document.getElementById('doc-rev').value='';
  document.getElementById('doc-file').value='';
  document.getElementById('doc-file-info').style.display='none';

}

function handleDocFile(input){
  const file=input.files[0];
  if(!file)return;
  const maxMB=10;
  if(file.size>maxMB*1024*1024){showToast('File too large. Max '+maxMB+'MB');input.value='';return;}


  const info=document.getElementById('doc-file-info');
  info.style.display='block';
  info.textContent='Selected: '+file.name+' ('+Math.round(file.size/1024)+'KB)';
  const reader=new FileReader();

  reader.readAsDataURL(file);
}

async function submitDoc(){
  const title=document.getElementById('doc-title').value.trim();
  if(!title){showToast('Please enter document title');return;}

  const btn=document.querySelector('#doc-upload-form .btn.primary');
  if(btn){btn.disabled=true;btn.textContent='Uploading...';}
  try{
    const doc={
      title,
      doc_no:document.getElementById('doc-no').value.trim()||null,
      system_name:document.getElementById('doc-system').value||null,
      category:document.getElementById('doc-category').value||null,
      revision:document.getElementById('doc-rev').value.trim()||'Rev.0',



      uploaded_by:currentUser.name,
      upload_date:new Date().toISOString().split('T')[0]
    };

    showToast('Document uploaded successfully ✓','success');
    document.getElementById('doc-upload-form').style.display='none';


  }catch(e){showToast('Error: '+e.message,'error');}
  if(btn){btn.disabled=false;btn.textContent='Upload Document';}
}


function renderDocStats(docs){
  const stats=document.getElementById('doc-stats');
  const cats=[...new Set(docs.map(d=>d.category).filter(Boolean))];
  const total=docs.length;
  stats.innerHTML=`
    <div style="background:#fff;border:1px solid var(--border);border-radius:8px;padding:10px 16px;display:flex;align-items:center;gap:10px">
      <span style="font-size:22px;font-weight:800;color:var(--navy)">${total}</span>
      <span style="font-size:11px;color:var(--gray);text-transform:uppercase;letter-spacing:.06em">Total Documents</span>
    </div>
    ${cats.slice(0,5).map(c=>`
    <div style="background:#fff;border:1px solid var(--border);border-radius:8px;padding:10px 16px;display:flex;align-items:center;gap:10px">
      <span style="font-size:18px;font-weight:800;color:var(--purple)">${docs.filter(d=>d.category===c).length}</span>
      <span style="font-size:11px;color:var(--gray)">${c}</span>
    </div>`).join('')}`;
}

function filterDocs(){
  const q=(document.getElementById('doc-search').value||'').toLowerCase();
  const sys=document.getElementById('doc-filter-system').value;
  const cat=document.getElementById('doc-filter-cat').value;
  const filtered=(allDocs||[]).filter(d=>
    (!q||(d.title||'').toLowerCase().includes(q)||(d.doc_no||'').toLowerCase().includes(q)||(d.system_name||'').toLowerCase().includes(q))&&
    (!sys||d.system_name===sys)&&
    (!cat||d.category===cat)
  );
  renderDocs(filtered);
}
function renderDocs(docs){
  const list=document.getElementById('doc-list');
  if(!docs.length){list.innerHTML='<div class="empty">No documents found</div>';return;}
  const icons={'application/pdf':'📄','application/vnd.ms-excel':'📊','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'📊','application/msword':'📝','application/vnd.openxmlformats-officedocument.wordprocessingml.document':'📝','image/jpeg':'🖼️','image/png':'🖼️'};
  const isAdmin=currentUser&&currentUser.role==='admin';
  list.innerHTML=`<div style="background:#fff;border:1px solid var(--border);border-radius:var(--radius-md);overflow:hidden">
    <table style="width:100%;border-collapse:collapse;font-size:12.5px">
      <thead><tr>
        <th style="padding:10px 12px;background:var(--navy);color:#fff;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;text-align:left">Document</th>
        <th style="padding:10px 12px;background:var(--navy);color:#fff;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em">System</th>
        <th style="padding:10px 12px;background:var(--navy);color:#fff;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em">Category</th>
        <th style="padding:10px 12px;background:var(--navy);color:#fff;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em">Rev.</th>
        <th style="padding:10px 12px;background:var(--navy);color:#fff;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em">Uploaded By</th>
        <th style="padding:10px 12px;background:var(--navy);color:#fff;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em">Date</th>
        <th style="padding:10px 12px;background:var(--navy);color:#fff;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em">Actions</th>
      </tr></thead>
      <tbody>${docs.map((d,i)=>{
        const icon=icons[d.file_type]||'📎';
        const catColor={'SOP':'#1F3864','EOP':'#991B1B','Checklist':'#166534','Training Material':'#6B4FBB','P&ID':'#92400E','Datasheet':'#0369A1','Vendor Manual':'#374151','Commissioning Report':'#065F46'}[d.category]||'#374151';
        return `<tr style="background:${i%2===0?'#fff':'#FAFBFF'}">
          <td style="padding:10px 12px;vertical-align:middle">
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-size:20px">${icon}</span>
              <div>
                <div style="font-weight:700;color:var(--navy);font-size:13px">${d.title}</div>
                ${d.doc_no?`<div style="font-size:10px;color:var(--gray);font-family:monospace;margin-top:1px">${d.doc_no}</div>`:''}
              </div>
            </div>
          </td>
          <td style="padding:10px 12px;font-size:11px;color:#555">${d.system_name||'–'}</td>
          <td style="padding:10px 12px">
            ${d.category?`<span style="background:${catColor}22;color:${catColor};font-size:10px;font-weight:700;padding:2px 9px;border-radius:20px;border:1px solid ${catColor}44">${d.category}</span>`:'–'}
          </td>
          <td style="padding:10px 12px;font-size:11px;color:var(--gray);font-family:monospace">${d.revision||'Rev.0'}</td>
          <td style="padding:10px 12px;font-size:11px;color:#555">${d.uploaded_by||'–'}</td>
          <td style="padding:10px 12px;font-size:11px;color:var(--gray);white-space:nowrap">${d.upload_date||'–'}</td>
          <td style="padding:10px 12px">
            <div style="display:flex;gap:5px">
              <button class="btn sm primary" onclick="downloadDoc('${d.id}','${(d.file_name||'document').replace(/'/g,'')}')">⬇ Download</button>

            </div>
          </td>
        </tr>`;
      }).join('')}</tbody>
    </table>
  </div>`;
}

async function downloadDoc(id,fileName){
  showToast('Preparing download...');
  try{

    if(!rows||!rows.length){showToast('Document not found','error');return;}
    const d=rows[0];
    const a=document.createElement('a');
    a.href=d.file_data;
    a.download=d.file_name||fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('Download started ✓','success');
  }catch(e){showToast('Error: '+e.message,'error');}
}



function closePrintArea(){
  const pa=document.getElementById('print-area');
  pa.style.display='none';
  const pab=pa.querySelector('.pt-no-print');
  if(pab)pab.style.display='none';
  if(currentUser){
    document.getElementById('login-screen').style.display='none';
    document.getElementById('main-app').style.display='block';
  }
}

function closeHandoverReport(){
  document.getElementById('handover-report').style.display='none';
  const hrBtns=document.getElementById('handover-btns');
  if(hrBtns)hrBtns.style.display='none';
  if(currentUser){
    document.getElementById('login-screen').style.display='none';
    document.getElementById('main-app').style.display='block';
  }
}

