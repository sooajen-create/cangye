const CFG_KEY='cangye.connection.v1',SESSION_KEY='cangye.session.v1';
export const connection=()=>{try{return JSON.parse(localStorage.getItem(CFG_KEY)||'null')}catch{return null}};
export function configure(url,key){const u=new URL(url);if(u.protocol!=='https:'||!u.hostname.endsWith('.supabase.co'))throw new Error('请输入 https://项目编号.supabase.co 格式的项目地址。');if(!key.trim()||key.startsWith('sb_secret_'))throw new Error('请使用 publishable key 或 legacy anon key，不能使用 secret/service_role。');
  if(key.split('.').length===3){try{const p=JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));if(p.role!=='anon')throw new Error('仅允许 anon key。')}catch{throw new Error('不是有效的 anon key；不要输入 service_role。')}}
  localStorage.setItem(CFG_KEY,JSON.stringify({url:u.origin,key:key.trim()}));}
export const savedSession=()=>{try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch{return null}};
let session=savedSession();let localMode=false;let refreshPromise;
export const isLocal=()=>localMode;
export const user=()=>localMode?{id:'local',email:'此设备 · 本地模式'}:session?.user;
export function useLocal(){localMode=true}
function keep(s){session=s;localStorage.setItem(SESSION_KEY,JSON.stringify(s))}
async function request(path,options={},auth=true){const cfg=connection();if(!cfg)throw new Error('请先配置 Supabase 连接。');
  if(auth && !session)throw new Error('请先登录。');
  if(auth&&session.expires_at*1000<Date.now()+30000){if(!refreshPromise)refreshPromise=refresh().finally(()=>refreshPromise=null);await refreshPromise}
  const headers={apikey:cfg.key,...options.headers};if(auth)headers.Authorization='Bearer '+session.access_token;
  const res=await fetch(cfg.url+path,{...options,headers});if(!res.ok){let err;try{err=await res.json()}catch{}throw new Error(err?.message||err?.msg||err?.error_description||err?.error||`请求失败（${res.status}）`)}return res;
}
async function refresh(){const s=session;const res=await request('/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refresh_token:s.refresh_token})},false);const d=await res.json();keep({...d,expires_at:Math.floor(Date.now()/1000)+d.expires_in})}
export async function login(email,password){const res=await request('/auth/v1/token?grant_type=password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})},false);const d=await res.json();localMode=false;keep({...d,expires_at:Math.floor(Date.now()/1000)+d.expires_in});return d.user}
export async function logout(){if(!localMode&&session){try{await request('/auth/v1/logout',{method:'POST'})}catch{}}session=null;localMode=false;localStorage.removeItem(SESSION_KEY)}
async function localDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open('cangye-local-v1',1);r.onupgradeneeded=()=>{r.result.createObjectStore('works',{keyPath:'id'});r.result.createObjectStore('files')};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function idb(store,mode,fn){const db=await localDB();return new Promise((resolve,reject)=>{const t=db.transaction(store,mode);const req=fn(t.objectStore(store));let result;req.onsuccess=()=>result=req.result;t.oncomplete=()=>{db.close();resolve(result)};t.onerror=()=>{db.close();reject(t.error)}})}
export async function listWorks(){if(localMode)return idb('works','readonly',s=>s.getAll());
  const owner=await request('/rest/v1/rpc/cangye_is_owner',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  if(!(await owner.json()))throw new Error('此账号不是 SQL 中指定的书库主人。');
  const all=[];for(let offset=0;;offset+=100){const r=await request('/rest/v1/works?select=*&order=id.asc&limit=100&offset='+offset);const rows=await r.json();all.push(...rows);if(rows.length<100)break;if(all.length>=10000)throw new Error('书库超过当前版本 10000 篇上限，请在控制台分批备份。');}
  return all.map(row=>({...row.data,id:row.id,_rev:row.revision,reading:row.reading,original:row.original,updatedAt:row.updated_at}))}
function clean(w){const {_rev,reading,original,updatedAt,...data}=w;return data}
export async function saveWork(w){if(localMode){const v={...w,_rev:(w._rev||0)+1,updatedAt:new Date().toISOString()};await idb('works','readwrite',s=>s.put(v));Object.assign(w,v);return w}
  const exists=Number.isInteger(w._rev);const query=exists?`?id=eq.${encodeURIComponent(w.id)}&revision=eq.${w._rev}`:'';
  const body=exists?{data:clean(w),revision:w._rev+1,updated_at:new Date().toISOString()}:{id:w.id,owner_id:user().id,data:clean(w),revision:1,reading:w.reading||{},original:w.original||null};
  const r=await request('/rest/v1/works'+query,{method:exists?'PATCH':'POST',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify(body)});const rows=await r.json();if(!rows.length)throw new Error('作品已在另一台设备修改，请刷新书库后重试，避免覆盖。');w._rev=rows[0].revision;return w;
}
export async function saveReading(w,reading){if(localMode){w.reading=reading;await idb('works','readwrite',s=>s.put(w));return}await request('/rest/v1/works?id=eq.'+encodeURIComponent(w.id),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({reading})});w.reading=reading}
export async function uploadOriginal(w,file){const path=user().id+'/'+w.id+'/original';if(localMode){await idb('files','readwrite',s=>s.put(file,path));w.original={path,name:file.name,type:file.type};return}
  await request('/storage/v1/object/library/'+path,{method:'POST',headers:{'Content-Type':file.type||'application/octet-stream','x-upsert':'true'},body:file});w.original={path,name:file.name,type:file.type};}
export async function attachOriginal(w){if(localMode){await idb('works','readwrite',s=>s.put(w));return}await request('/rest/v1/works?id=eq.'+encodeURIComponent(w.id),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({original:w.original})})}
export async function getOriginal(w){if(!w.original)throw new Error('此作品没有原始附件。');if(localMode){const b=await idb('files','readonly',s=>s.get(w.original.path));if(!b)throw new Error('本地原件不存在。');return b}return (await request('/storage/v1/object/authenticated/library/'+w.original.path)).blob()}
export async function removeWork(w){if(localMode){await idb('works','readwrite',s=>s.delete(w.id));if(w.original)await idb('files','readwrite',s=>s.delete(w.original.path));return}
  if(w.original)await request('/storage/v1/object/library',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefixes:[w.original.path]})});
  await request('/rest/v1/works?id=eq.'+encodeURIComponent(w.id),{method:'DELETE'});
}
let lastImport=0;
export async function importLink(url){if(localMode)throw new Error('链接自动提取需要连接 Supabase 并部署 import-link 函数。本地模式支持文件导入与粘贴正文。');
  const wait=Math.max(0,5200-(Date.now()-lastImport));if(wait)await new Promise(r=>setTimeout(r,wait));lastImport=Date.now();
  return (await request('/functions/v1/import-link',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url})})).json()}
