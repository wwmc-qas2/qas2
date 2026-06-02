// Extracted utilities

async function sbFetch(path, method='GET', body=null){
  const prefer=(method==='POST'||method==='PATCH')?'return=representation':'';
  const opts={method,headers:{'apikey':SB_KEY,'Authorization':'Bearer '+SB_KEY,'Content-Type':'application/json',...(prefer&&{'Prefer':prefer})}};
  if(body) opts.body=JSON.stringify(body);
  const r=await fetch(SB_URL+'/rest/v1/'+path,opts);
  if(!r.ok){const e=await r.text();throw new Error(e);}
  const t=r.status===204?null:await r.json();
  return t;
}

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

function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}

function debounce(fn,wait=250){
  let t;
  return (...args)=>{clearTimeout(t);t=setTimeout(()=>fn(...args),wait);};
}
