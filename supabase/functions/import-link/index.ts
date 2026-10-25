// Supabase Edge Function. No external proxy, no source-site credentials.
const MAX_BYTES=3*1024*1024;
function allowed(u:URL){
  if(u.protocol!=='https:'||u.username||u.password||(u.port&&u.port!=='443'))return false;
  const host=u.hostname.toLowerCase();
  return ['archiveofourown.org','www.archiveofourown.org','lofter.com','www.lofter.com','weibo.com','www.weibo.com','weibo.cn','m.weibo.cn','asianfanfics.com','www.asianfanfics.com'].includes(host)||(/^[a-z0-9-]+\.lofter\.com$/.test(host));
}
Deno.serve(async(req:Request)=>{
  const origin=req.headers.get('Origin')||'';
  const configured=(Deno.env.get('SITE_ORIGINS')||'').split(',').map(x=>x.trim()).filter(Boolean);
  const cors={'Access-Control-Allow-Origin':configured.includes(origin)?origin:'null','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin','Cache-Control':'no-store'};
  const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json;charset=utf-8'}});
  if(!configured.includes(origin))return json({error:'此站点 Origin 未获准，请设置 SITE_ORIGINS。'},403);
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(req.method!=='POST')return json({error:'仅允许 POST。'},405);
  const auth=req.headers.get('Authorization')||'';
  if(!auth.startsWith('Bearer '))return json({error:'请先登录。'},401);
  const project=Deno.env.get('SUPABASE_URL');
  const key=Deno.env.get('SUPABASE_ANON_KEY');
  if(!project||!key)return json({error:'缺少 Supabase 内置运行环境。'},500);
  const headers={apikey:key,Authorization:auth,'Content-Type':'application/json'};
  try{
    const check=await fetch(project+'/auth/v1/user',{headers,signal:AbortSignal.timeout(8000)});
    if(!check.ok)return json({error:'登录已过期，请重新登录。'},401);
    const slot=await fetch(project+'/rest/v1/rpc/cangye_take_import_slot',{method:'POST',headers,body:'{}',signal:AbortSignal.timeout(8000)});
    if(!slot.ok||!(await slot.json()))return json({error:'仅限书库主人使用，或已达限流（每分钟 12 次、每天 500 次）。稍后可重试失败项。'},429);
    const body=await req.text();if(body.length>4096)return json({error:'请求过长。'},413);
    let url:URL;try{url=new URL(JSON.parse(body).url)}catch{return json({error:'链接格式无效。'},400)}
    if(!allowed(url))return json({error:'仅支持四个平台的 HTTPS 原站链接；不支持短链接。'},400);
    url.hash='';
    if(url.hostname.endsWith('archiveofourown.org')){
      const id=url.pathname.match(/^\/works\/(\d+)(?:\/|$)/)?.[1];
      if(!id)return json({error:'请使用 AO3 单篇作品链接，而不是作者、搜索或合集链接。'},400);
      url=new URL(`https://archiveofourown.org/works/${id}?view_full_work=true&view_adult=true`);
    }
    // Every redirect is checked; arbitrary hosts and private IPs are never fetched.
    let response:Response|undefined;
    for(let hop=0;hop<5;hop++){
      if(!allowed(url))return json({error:'原站重定向到不支持的地址，请改用文件导入。'},400);
      response=await fetch(url,{redirect:'manual',headers:{'User-Agent':'CangyePrivateLibrary/1.0 (personal archival; no login bypass)','Accept':'text/html,application/xhtml+xml'},signal:AbortSignal.timeout(18000)});
      if(response.status>=300&&response.status<400){const location=response.headers.get('location');await response.body?.cancel();if(!location)return json({error:'原站跳转无效。'},422);url=new URL(location,url);response=undefined;continue}break;
    }
    if(!response)return json({error:'原站重定向次数过多。'},422);
    if(!response.ok){await response.body?.cancel();return json({error:`原站拒绝请求（${response.status}）。请登录原站后保存 HTML/TXT/EPUB 再上传。`},422)}
    if(!/html|xhtml/i.test(response.headers.get('content-type')||'')){await response.body?.cancel();return json({error:'原链接没有返回 HTML 正文，请下载文件后上传。'},422)}
    if(Number(response.headers.get('content-length')||0)>MAX_BYTES){await response.body?.cancel();return json({error:'网页超过 3 MB，请使用文件导入。'},413)}
    const reader=response.body?.getReader();if(!reader)return json({error:'原站返回空页面。'},422);
    const chunks:Uint8Array[]=[];let size=0;
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_BYTES){await reader.cancel();return json({error:'网页超过 3 MB，请使用文件导入。'},413)}chunks.push(value)}
    const bytes=new Uint8Array(size);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length}
    const type=response.headers.get('content-type')||'';const encoding=type.match(/charset\s*=\s*([\w-]+)/i)?.[1]||'utf-8';let html;try{html=new TextDecoder(encoding).decode(bytes)}catch{html=new TextDecoder().decode(bytes)}
    // HTML is returned as JSON text; client parses inert DOM and renders escaped text only.
    return json({html,url:url.href});
  }catch(error){return json({error:error instanceof Error&&/timeout|abort/i.test(error.message)?'原站请求超时，请稍后重试或上传文件。':'无法提取网页，请使用 HTML、TXT、EPUB 文件导入。'},422)}
});
