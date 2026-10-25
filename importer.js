export const MAX_FILE = 20 * 1024 * 1024;
export const MAX_TEXT = 12 * 1024 * 1024;
export function platform(url='') {
  try { const h = new URL(url).hostname.toLowerCase();
    if (h === 'archiveofourown.org' || h === 'www.archiveofourown.org') return 'AO3';
    if (h === 'lofter.com' || h.endsWith('.lofter.com')) return 'LOFTER';
    if (['weibo.com','www.weibo.com','m.weibo.cn','weibo.cn'].includes(h)) return '微博';
    if (h === 'asianfanfics.com' || h === 'www.asianfanfics.com') return 'Asianfanfics';
  } catch {} return '';
}
export function newWork(data={}) {
  return {id:crypto.randomUUID(),title:'未命名作品',author:'未知作者',cp:'未分类',folder:'',tags:[],collection:'',source:'本地文件',url:'',chapters:[],verified:false,createdAt:new Date().toISOString(),...data};
}
export function readableText(node) {
  if (!node) return '';
  const copy = node.cloneNode(true);
  copy.querySelectorAll('script,style,noscript,iframe,nav,form,button,svg,header,footer').forEach(x=>x.remove());
  copy.querySelectorAll('br').forEach(x=>x.replaceWith('\n'));
  copy.querySelectorAll('p,div,section,article,h1,h2,h3,h4,li,blockquote').forEach(x=>x.append('\n\n'));
  return (copy.textContent||'').replace(/\r/g,'').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
}
const meta=(doc,...names)=>{for(const name of names){const e=doc.querySelector(`meta[property="${name}"],meta[name="${name}"]`);if(e?.getAttribute('content'))return e.getAttribute('content')}return ''};
export function extractHTML(html,url='') {
  const doc = new DOMParser().parseFromString(html,'text/html');
  const source = platform(url);
  const title=(doc.querySelector('h2.title')?.textContent || meta(doc,'og:title') || doc.querySelector('h1')?.textContent || doc.title || '导入的文章').trim();
  const author=(doc.querySelector('a[rel="author"]')?.textContent || meta(doc,'author','article:author') || doc.querySelector('.author,.blogname,.username')?.textContent || '未知作者').trim();
  let chapters=[];
  if(source==='AO3'||doc.querySelector('#chapters .userstuff')) {
    const blocks=doc.querySelectorAll('#chapters .chapter');
    if(blocks.length) chapters=Array.from(blocks).map((e,i)=>({title:e.querySelector('h3.title')?.textContent?.trim()||`第 ${i+1} 章`,text:readableText(e.querySelector('.userstuff:not(.notes)')||e)}));
    else {const e=doc.querySelector('#chapters .userstuff,.userstuff');if(e)chapters=[{title:'正文',text:readableText(e)}]}
  }
  if(!chapters.length){
    const selectors = source==='LOFTER'?['.post-content','.postbody','.m-detail .content','.txtcont','.text','article']:
      source==='微博'?['.WB_editor_iframe_new','.WB_text','.weibo-text','.main-content','article']:
      source==='Asianfanfics'?['#storytext','#story-text','.story-content','.chapter-content','article']:['article','main','.content'];
    let root; for(const s of selectors){const e=doc.querySelector(s);if(e&&readableText(e).length>40){root=e;break}}
    // A generic fallback is suitable for manual HTML; remote unsupported layouts fail visibly.
    if(!root&&!url)root=doc.body;
    if(root)chapters=[{title:'正文',text:readableText(root)}];
  }
  chapters=chapters.filter(c=>c.text.length>0);
  if(chapters.reduce((n,c)=>n+c.text.length,0)>MAX_TEXT)throw new Error('正文超过 12 MB，请拆分导入。');
  if(!chapters.length || (url && chapters.reduce((n,c)=>n+c.text.length,0)<80))throw new Error('未提取到足够正文，可能是登录页、折叠内容或页面结构不支持。请在原站打开全文后保存 HTML/TXT，或手动粘贴。');
  const imageCount=doc.querySelectorAll('article img,.userstuff img,.post-content img,.WB_text img,#storytext img').length;
  return newWork({title,author,url,source:source||'HTML',chapters,importNote:imageCount?`原页面包含约 ${imageCount} 张图片；本次仅提取文字，请另存图片或原始文件。`:'网页提取结果需核对末段及章节数。',chapterLinks:chapterLinks(doc,url)});
}
function chapterLinks(doc,url){
  if(platform(url)!=='Asianfanfics')return [];
  const links=new Map();let story='';try{story=new URL(url).pathname.match(/\/story\/view\/(\d+)/)?.[1]||''}catch{}
  if(!story)return [];
  for(const a of doc.querySelectorAll('a[href]')){try{const u=new URL(a.getAttribute('href'),url);if(u.hostname.replace(/^www\./,'')!=='asianfanfics.com')continue;
    const m=u.pathname.match(/^\/story\/view\/(\d+)\/(\d+)(?:\/|$)/);if(m&&m[1]===story){u.hash='';links.set(u.href,{url:u.href,title:a.textContent.trim()||`章节 ${m[2]}`,order:Number(m[2])})}}catch{}}
  return [...links.values()].sort((a,b)=>a.order-b.order);
}
export function parseTXT(text,name='导入的文本') {
  if(text.length>MAX_TEXT)throw new Error('正文超过 12 MB，请拆分导入。');
  text=text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
  const lines=text.split('\n');const chapters=[];let current={title:'正文',text:''};
  const heading=/^\s*(第[零一二三四五六七八九十百千万\d]+[章节回卷部].{0,60}|chapter\s+\d+.{0,60})\s*$/i;
  for(const line of lines){if(heading.test(line)){if(current.text.trim())chapters.push({...current,text:current.text.trim()});current={title:line.trim(),text:''}}else current.text+=line+'\n'}
  if(current.text.trim())chapters.push({...current,text:current.text.trim()});if(!chapters.length)throw new Error('文件没有正文。');
  return newWork({title:name.replace(/\.[^.]+$/,''),source:'TXT',chapters});
}
function resolveZip(base,relative){const parts=base.split('/').slice(0,-1);for(const p of decodeURIComponent(relative).split('#')[0].split('/')){if(p==='..')parts.pop();else if(p&&p!=='.')parts.push(p)}return parts.join('/')}
export async function parseEPUB(buffer,name){
  const zip=await globalThis.JSZip.loadAsync(buffer);const all=Object.values(zip.files);if(all.length>5000)throw new Error('EPUB 文件数量过多。');
  let size=0;for(const f of all){size+=f._data?.uncompressedSize||0}if(size>60*1024*1024)throw new Error('EPUB 解压后超过 60 MB。');
  const container=zip.file('META-INF/container.xml');if(!container)throw new Error('无效 EPUB：缺少 container.xml');
  const cdoc=new DOMParser().parseFromString(await container.async('string'),'application/xml');const opfPath=cdoc.querySelector('rootfile')?.getAttribute('full-path');
  const opf=zip.file(opfPath||'');if(!opf)throw new Error('无效 EPUB：缺少书籍目录。');
  const doc=new DOMParser().parseFromString(await opf.async('string'),'application/xml');const byId=new Map(Array.from(doc.querySelectorAll('manifest item')).map(x=>[x.getAttribute('id'),x.getAttribute('href')]));
  const chapters=[];let textLength=0,imageCount=0;
  for(const ref of doc.querySelectorAll('spine itemref')){if(ref.getAttribute('linear')==='no')continue;const href=byId.get(ref.getAttribute('idref'));if(!href)continue;const file=zip.file(resolveZip(opfPath,href));if(!file)throw new Error('EPUB 缺少章节文件：'+href);
    const html=new DOMParser().parseFromString(await file.async('string'),'text/html');imageCount+=html.querySelectorAll('img,image').length;const text=readableText(html.body);textLength+=text.length;if(textLength>MAX_TEXT)throw new Error('EPUB 正文超过 12 MB。');
    if(text)chapters.push({title:html.querySelector('h1,h2,h3')?.textContent?.trim()||html.title||`第 ${chapters.length+1} 节`,text});
  }
  if(!chapters.length)throw new Error('EPUB 中没有可读取的正文；不支持 DRM 加密文件。');
  const value=tag=>doc.getElementsByTagNameNS('*',tag)[0]?.textContent||'';
  return newWork({title:value('title')||name,author:value('creator')||'未知作者',source:'EPUB',chapters,importNote:imageCount?'阅读器提取文字；图片保留在原始 EPUB，需使用电子书阅读器查看。':'已按 EPUB 阅读顺序提取，请核对章节。'});
}
export async function parseFile(file){if(file.size>MAX_FILE)throw new Error('单文件上限 20 MB。');const ext=file.name.split('.').pop().toLowerCase();
  if(ext==='epub')return parseEPUB(await file.arrayBuffer(),file.name);
  if(['pdf','docx','odt'].includes(ext)){
    const formats=await import('./document-imports.js');const buffer=await file.arrayBuffer();const data=ext==='pdf'?await formats.parsePDF(buffer,file.name):ext==='docx'?await formats.parseDOCX(buffer,file.name):await formats.parseODT(buffer,file.name);
    if(data.text){const w=parseTXT(data.text,file.name);const {text,...meta}=data;return {...w,...meta}}return newWork(data);
  }
  if(!['txt','text','html','htm','xhtml','md','markdown','fb2'].includes(ext))throw new Error('支持 TXT、HTML/XHTML、EPUB、PDF（文字版）、DOCX、Markdown、ODT、FB2；旧 DOC、MOBI/AZW 和扫描图片请先转换。整库 ZIP 请使用“恢复备份”。');
  const buffer=await file.arrayBuffer();const bytes=new Uint8Array(buffer);let text;
  if(bytes[0]===0xff&&bytes[1]===0xfe)text=new TextDecoder('utf-16le').decode(buffer);
  else if(bytes[0]===0xfe&&bytes[1]===0xff)text=new TextDecoder('utf-16be').decode(buffer);
  else {const declared=ext==='fb2'?new TextDecoder('latin1').decode(bytes.slice(0,256)).match(/<\?xml[^>]*encoding=["']([^"']+)["']/i)?.[1]:null;
    if(declared){try{text=new TextDecoder(declared).decode(buffer)}catch{throw new Error('FB2 使用不支持的文字编码：'+declared)}}
    else try{text=new TextDecoder('utf-8',{fatal:true}).decode(buffer)}catch{text=new TextDecoder('gb18030').decode(buffer)}}
  if(['md','markdown','fb2'].includes(ext)){const formats=await import('./document-imports.js');return newWork(ext==='fb2'?formats.parseFB2(text,file.name):formats.parseMarkdown(text,file.name))}
  const work=['txt','text'].includes(ext)?parseTXT(text,file.name):extractHTML(text);if(work.title==='导入的文章')work.title=file.name;return work;
}
export function validateWork(w){
  if(!w||typeof w.title!=='string'||!Array.isArray(w.chapters)||!w.chapters.length)throw new Error('无效作品数据。');
  if(w.chapters.length>3000)throw new Error('章节数量超过上限。');
  let total=0;const chapters=w.chapters.map((c,i)=>{if(typeof c.text!=='string')throw new Error('章节正文格式错误。');total+=c.text.length;return {title:String(c.title||`第 ${i+1} 章`).slice(0,300),text:c.text}});
  if(total>MAX_TEXT)throw new Error('作品正文过大。');
  return newWork({id:typeof w.id==='string'&&/^[\w-]{1,80}$/.test(w.id)?w.id:crypto.randomUUID(),title:w.title.slice(0,500),author:String(w.author||'未知作者').slice(0,300),cp:String(w.cp||'未分类').slice(0,200),folder:String(w.folder||'').slice(0,300),collection:String(w.collection||'').slice(0,200),tags:Array.isArray(w.tags)?w.tags.slice(0,100).map(x=>String(x).slice(0,100)):[],source:String(w.source||'备份'),url:String(w.url||''),verified:!!w.verified,createdAt:w.createdAt||new Date().toISOString(),chapters,importNote:String(w.importNote||'')});
}
