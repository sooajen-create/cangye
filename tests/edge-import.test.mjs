import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
const code=stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/import-link/index.ts',import.meta.url),'utf8'));
async function run(input,{auth=true,cookie=true,redirect=false}={}){
 let handler;const calls=[];
 const context={URL,Request,Response,TextDecoder,Uint8Array,AbortSignal,Error,Deno:{env:{get:k=>({SITE_ORIGINS:'https://library.example',SUPABASE_URL:'https://project.supabase.co',SUPABASE_ANON_KEY:'public-key'})[k]},serve:fn=>handler=fn},fetch:async(url,options={})=>{
  url=String(url);calls.push({url,headers:options.headers});
  if(url.endsWith('/auth/v1/user'))return new Response('{}',{status:auth?200:401});
  if(url.includes('cangye_take_import_slot'))return new Response('true');
  if(url.endsWith('/htmx/story/verify_age'))return new Response('',{status:302,headers:cookie?{'set-cookie':'age_verified=signed-by-source; Path=/; Secure; HttpOnly'}:{}});
  if(redirect&&url.includes('asianfanfics.com/story/'))return new Response('',{status:302,headers:{location:'https://example.wordpress.com/story/'}});
  return new Response('<p>Source HTML</p>',{headers:{'content-type':'text/html'}});
 }};
 vm.runInNewContext(code,context);const response=await handler(new Request('https://project.supabase.co/functions/v1/import-link',{method:'POST',headers:{Origin:'https://library.example',Authorization:'Bearer user-token'},body:JSON.stringify(input)}));
 return {response,calls,data:await response.json()};
}
const url='https://www.asianfanfics.com/story/view/123/1/title';
test('AFF age confirmation uses official endpoint and only source-issued cookies',async()=>{
 const r=await run({url,confirmAge:true});assert.equal(r.response.status,200);
 const confirmation=r.calls.find(c=>c.url.endsWith('/verify_age'));assert.ok(confirmation);assert.equal(confirmation.headers.Referer,url);assert.equal(confirmation.headers.Authorization,undefined);
 assert.equal(r.calls.at(-1).headers.Cookie,'age_verified=signed-by-source');assert.equal(r.calls.at(-1).headers.Authorization,undefined);
});
test('Turning age confirmation off sends no declaration or cookie',async()=>{const r=await run({url,confirmAge:false});assert.equal(r.response.status,200);assert.ok(!r.calls.some(c=>c.url.includes('verify_age')));assert.equal(r.calls.at(-1).headers.Cookie,undefined)});
test('Age cookies never follow redirects to other supported sites',async()=>{const r=await run({url,confirmAge:true},{redirect:true});assert.equal(r.response.status,200);assert.equal(r.calls.at(-1).headers.Cookie,undefined)});
test('Missing official confirmation state fails visibly',async()=>{const r=await run({url,confirmAge:true},{cookie:false});assert.equal(r.response.status,422);assert.match(r.data.error,/未返回年龄确认状态/)});
test('Authentication and host checks happen before any source age declaration',async()=>{
 const unauth=await run({url,confirmAge:true},{auth:false});assert.equal(unauth.response.status,401);assert.ok(!unauth.calls.some(c=>c.url.includes('verify_age')));
 const other=await run({url:'https://www.asianfanfics.com.evil.example/story',confirmAge:true});assert.equal(other.response.status,400);assert.ok(!other.calls.some(c=>c.url.includes('verify_age')));
});
