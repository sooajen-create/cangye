// Parse locally: no document contents are sent to a conversion service.
const MAX_TEXT=12*1024*1024;
const MAX_EXPANDED=60*1024*1024;
export async function openDocumentZip(buffer,label){
  const zip=await globalThis.JSZip.loadAsync(buffer);
  const files=Object.values(zip.files);
  if(files.length>5000)throw new Error(label+' 包含过多文件。');
  const bytes=files.reduce((n,f)=>n+(f._data?.uncompressedSize||0),0);
  if(bytes>MAX_EXPANDED)throw new Error(label+' 解压后超过 60 MB。');
  return zip;
}
export function xmlDoc(text,label){
  if(/<!DOCTYPE|<!ENTITY/i.test(text))throw new Error(label+' 包含不支持的 XML 实体声明。');
  const d=new DOMParser().parseFromString(text,'application/xml');
  if(d.querySelector('parsererror'))throw new Error(label+' XML 格式错误。');
  return d;
}
const elements=(node,name)=>Array.from(node.getElementsByTagNameNS('*',name));
const firstText=(node,name)=>elements(node,name)[0]?.textContent?.trim()||'';
const filename=name=>name.replace(/\.[^.]+$/,'');
function ensureText(text,label){if(!text.trim())throw new Error(label+' 没有可提取的文字。');if(text.length>MAX_TEXT)throw new Error(label+' 正文超过 12 MB。')}
export function parseMarkdown(text,name){
  ensureText(text,'Markdown');let title=filename(name),author='未知作者';
  text=text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
  const front=text.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if(front){for(const line of front[1].split('\n')){const m=line.match(/^(title|author):\s*(.*?)\s*$/);if(m){const value=m[2].replace(/^(['"])(.*)\1$/,'$2');if(m[1]==='title')title=value||title;else author=value||author}}text=text.slice(front[0].length)}
  const chapters=[];let current={title:'正文',text:''},fence='',headingSeen=false;
  for(const line of text.split('\n')){
    const f=line.match(/^\s*(`{3,}|~{3,})/);if(f){if(!fence)fence=f[1][0];else if(fence===f[1][0])fence='';current.text+=line+'\n';continue}
    const h=!fence&&line.match(/^\s{0,3}(#{1,3})\s+(.+?)\s*#*\s*$/);
    if(h){if(!headingSeen&&h[1]==='#'&&!current.text.trim()){if(!front)title=h[2];headingSeen=true;continue}headingSeen=true;if(current.text.trim())chapters.push({...current,text:current.text.trim()});current={title:h[2],text:''}}
    else current.text+=line+'\n';
  }
  if(current.text.trim())chapters.push({...current,text:current.text.trim()});
  if(!chapters.length)throw new Error('Markdown 只有标题，没有正文。');
  return {title,author,source:'Markdown',chapters,importNote:'按标题识别章节；阅读器保留部分 Markdown 标记，不执行内嵌 HTML。原始文件另存。'};
}
export async function parseDOCX(buffer,name){
  const zip=await openDocumentZip(buffer,'DOCX'),entry=zip.file('word/document.xml');
  if(!entry)throw new Error('无效 DOCX：缺少 word/document.xml；旧版 DOC 或加密文件请先另存为 DOCX/TXT。');
  const d=xmlDoc(await entry.async('string'),'DOCX');
  elements(d,'del').forEach(n=>n.remove());
  const body=elements(d,'body')[0];if(!body)throw new Error('DOCX 没有正文。');
  const lines=elements(body,'p').map(p=>{
    let text='';const visit=n=>{for(const c of n.childNodes){if(c.nodeType!==1)continue;if(c.localName==='t')text+=c.textContent;else if(c.localName==='tab')text+='\t';else if(['br','cr'].includes(c.localName))text+='\n';else if(c.localName!=='p')visit(c)}};visit(p);return text;
  });
  const text=lines.join('\n\n');ensureText(text,'DOCX');
  let title=filename(name),author='未知作者';const core=zip.file('docProps/core.xml');if(core){const m=xmlDoc(await core.async('string'),'DOCX 元数据');title=firstText(m,'title')||title;author=firstText(m,'creator')||author}
  return {title,author,text,source:'DOCX',importNote:'已提取文档正文和表格中的文字；图片、页眉页脚、脚注与部分文本框不保证提取，请核对原始 DOCX。'};
}
export async function parseODT(buffer,name){
  const zip=await openDocumentZip(buffer,'ODT'),entry=zip.file('content.xml');
  if(!entry)throw new Error('无效 ODT：缺少 content.xml。');
  const manifest=zip.file('META-INF/manifest.xml');if(manifest&&/encryption-data/.test(await manifest.async('string')))throw new Error('不支持加密 ODT，请先解密另存。');
  const d=xmlDoc(await entry.async('string'),'ODT');elements(d,'annotation').forEach(n=>n.remove());
  const body=elements(d,'body')[0];if(!body)throw new Error('ODT 没有正文。');
  const paragraphs=Array.from(body.getElementsByTagName('*')).filter(n=>['p','h'].includes(n.localName));
  const text=paragraphs.map(p=>{const copy=p.cloneNode(true);elements(copy,'line-break').forEach(n=>n.replaceWith('\n'));elements(copy,'tab').forEach(n=>n.replaceWith('\t'));elements(copy,'s').forEach(n=>n.replaceWith(' '.repeat(Math.min(100,Number(n.getAttribute('text:c')||1)))));return copy.textContent||''}).join('\n\n');ensureText(text,'ODT');
  let title=filename(name),author='未知作者';const meta=zip.file('meta.xml');if(meta){const m=xmlDoc(await meta.async('string'),'ODT 元数据');title=firstText(m,'title')||title;author=firstText(m,'creator')||firstText(m,'initial-creator')||author}
  return {title,author,text,source:'ODT',importNote:'已提取正文文字；图片、页眉页脚及复杂布局请在原始 ODT 中查看。'};
}
export function parseFB2(text,name){
  const d=xmlDoc(text,'FB2'),info=elements(d,'title-info')[0];
  const title=(info&&firstText(info,'book-title'))||filename(name);
  const a=info&&elements(info,'author')[0];const author=a?['first-name','middle-name','last-name'].map(n=>firstText(a,n)).filter(Boolean).join(' ')||firstText(a,'nickname')||'未知作者':'未知作者';
  const chapters=[];
  function visit(section,label){
    const ownTitle=Array.from(section.children).find(n=>n.localName==='title')?.textContent?.trim()||label;let parts=[];
    const flush=()=>{if(parts.join('').trim()){chapters.push({title:ownTitle||`第 ${chapters.length+1} 节`,text:parts.join('\n\n').trim()});parts=[]}};
    for(const c of section.children){if(c.localName==='title')continue;if(c.localName==='section'){flush();visit(c,ownTitle)}else if(c.localName==='empty-line')parts.push('');else if(c.localName!=='image')parts.push(c.textContent?.trim()||'')}
    flush();
  }
  for(const body of elements(d,'body'))visit(body,body.getAttribute('name')||'正文');
  ensureText(chapters.map(c=>c.text).join('\n'),'FB2');
  return {title,author,source:'FB2',chapters,importNote:'已按 FB2 分节提取文字；图片保留在原始文件，请核对嵌套章节与注释。'};
}
export async function parsePDF(buffer,name){
  const pdfjs=await import('./vendor/pdfjs/pdf.min.mjs');
  const {default:assets}=await import('./vendor/pdfjs/binary-assets.js');
  pdfjs.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdfjs/pdf.worker.min.mjs',import.meta.url).href;
  class LocalBinaryDataFactory {
    async fetch({kind,filename}){const folder=kind==='cMapUrl'?'cmaps':kind==='standardFontDataUrl'?'standard_fonts':'';const value=assets[folder+'/'+filename];if(!value)throw new Error('缺少 PDF 字体资源：'+filename);return Uint8Array.from(atob(value),c=>c.charCodeAt(0))}
  }
  let task,doc;
  try{
    task=pdfjs.getDocument({data:new Uint8Array(buffer),isEvalSupported:false,useWasm:false,enableXfa:false,useWorkerFetch:false,BinaryDataFactory:LocalBinaryDataFactory,cMapUrl:'local/',cMapPacked:true,standardFontDataUrl:'local/',stopAtErrors:true});
    doc=await task.promise;
    if(doc.numPages>300)throw new Error('PDF 超过 300 页，请拆分后导入，避免手机内存不足。');
    const chapters=[];let total=0,empty=0;
    for(let i=1;i<=doc.numPages;i++){
      const page=await doc.getPage(i),content=await page.getTextContent();let text='',lastY;
      for(const item of content.items){if(typeof item.str!=='string')continue;const y=item.transform?.[5];if(lastY!==undefined&&y!==undefined&&Math.abs(y-lastY)>3&&!text.endsWith('\n'))text+='\n';text+=item.str;if(item.hasEOL)text+='\n';else if(item.str&&!item.str.endsWith(' '))text+=' ';lastY=y}
      text=text.replace(/[ \t]+\n/g,'\n').trim();total+=text.length;if(total>MAX_TEXT)throw new Error('PDF 正文超过 12 MB。');if(!text)empty++;
      chapters.push({title:`第 ${i} 页`,text:text||'［此页没有提取到可复制文字，可能为空白页或扫描图片，请核对原 PDF。］'});page.cleanup();
    }
    if(!total)throw new Error('PDF 没有可复制的文字，可能是扫描版。本版本不含 OCR，请先转换为 TXT/DOCX。');
    let title=filename(name),author='未知作者';try{const m=await doc.getMetadata();title=typeof m.info?.Title==='string'&&m.info.Title.trim()?m.info.Title.trim():title;author=typeof m.info?.Author==='string'&&m.info.Author.trim()?m.info.Author.trim():author}catch{}
    return {title,author,source:'PDF',chapters,importNote:`按 ${doc.numPages} 页提取文字，未做 OCR；多栏、断行、特殊字体和图片可能导致遗漏或顺序变化。${empty?`有 ${empty} 页未提取到文字。`:''}请核对原件。`};
  }catch(e){if(e?.name==='PasswordException')throw new Error('PDF 已加密，请先解除密码后另存并导入。');throw e}
  finally{if(doc)await doc.destroy();else if(task)await task.destroy()}
}
