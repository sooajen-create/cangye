// EPUB styling lives in a script-free, network-free iframe, never in the app DOM.
export const MAX_RICH=12*1024*1024;
const tags=new Set('div span p br hr section article h1 h2 h3 h4 h5 h6 strong b em i u s small sub sup ruby rt rp blockquote pre code ul ol li dl dt dd table thead tbody tfoot tr td th caption colgroup col img a svg path circle rect line polyline polygon ellipse g title'.split(' '));
const remove='script,style,link,meta,base,iframe,object,embed,form,input,button,textarea,select,video,audio,source,foreignObject,animate,set,animateTransform';
const attributes=new Set('class id title lang dir style alt width height colspan rowspan scope viewbox d fill stroke stroke-width stroke-linecap stroke-linejoin points x y x1 x2 y1 y2 cx cy r rx ry transform role aria-label aria-hidden preserveaspectratio'.split(' '));
const safeData=/^data:(?:image\/(?:png|jpeg|gif|webp|avif)|font\/(?:ttf|otf|woff2?)|application\/(?:font-woff|vnd\.ms-opentype|octet-stream));base64,[a-z0-9+/=\s]+$/i;
export function archivePath(base,relative){
  if(!relative||/^(?:[a-z][\w+.-]*:|\/\/|\/|#)/i.test(relative))return null;
  let decoded;try{decoded=decodeURIComponent(relative.split(/[?#]/)[0])}catch{return null}
  if(decoded.includes('\\'))return null;
  const parts=base.split('/').slice(0,-1);
  for(const part of decoded.split('/')){if(part==='..'){if(!parts.length)return null;parts.pop()}else if(part&&part!=='.')parts.push(part)}
  return parts.join('/');
}
export function safeCSS(css){
  // CSP is the final network boundary; strip imports and every non-embedded URL too.
  return String(css||'').replace(/<\/?style\b[^>]*>/gi,'').replace(/@import\b[^;{}]*(?:;|$)/gi,'')
    .replace(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi,(_,a,b,c)=>{const url=(a??b??c).trim();return safeData.test(url)?`url("${url}")`:'url("")'});
}
export function sanitizeHTML(html){
  const doc=new DOMParser().parseFromString(String(html||''),'text/html');
  doc.querySelectorAll(remove).forEach(e=>e.remove());
  for(const e of [...doc.body.querySelectorAll('*')].reverse()){
    if(!tags.has(e.localName.toLowerCase())){e.replaceWith(...e.childNodes);continue}
    for(const a of [...e.attributes]){
      const name=a.name.toLowerCase();
      if(name==='src'&&e.localName==='img'&&safeData.test(a.value)&&/^data:image\//i.test(a.value))continue;
      if(!attributes.has(name))e.removeAttribute(a.name);
      else if(name==='style')e.setAttribute('style',safeCSS(a.value));
    }
  }
  return doc.body.innerHTML;
}
export function richDocument(chapter,appearance={}){
  const css=safeCSS(chapter.css||'');
  const attrs=String(chapter.bodyClass||'').replace(/[^\w\s-]/g,'');
  const bodyStyle=safeCSS(chapter.bodyStyle||'').replace(/[<>"']/g,'');
  const dark=appearance.theme==='night'?'body{background:#202722!important;color:#d0d7ca!important}':'';
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; font-src data:; style-src \'unsafe-inline\'; script-src \'none\'; connect-src \'none\'; frame-src \'none\'; object-src \'none\'; base-uri \'none\'; form-action \'none\'">'+
    '<style>html{overflow-wrap:anywhere}body{margin:0;padding:16px;line-height:1.9}img,svg{max-width:100%}table{max-width:100%}'+css+'\n'+dark+'\nbody{font-size:'+Math.max(14,Math.min(32,appearance.size||19))+'px!important}html,body{writing-mode:horizontal-tb!important;overflow-wrap:anywhere}.cover-art{padding:120px 16px!important;height:auto!important}.volume-page{padding-top:120px!important}.cover img{max-height:700px!important}</style></head><body class="'+attrs+'" style="'+bodyStyle+'">'+sanitizeHTML(chapter.html)+'</body></html>';
}
export function mountRichChapter(frame,chapter,appearance={}){
  frame.setAttribute('sandbox','allow-same-origin'); // no allow-scripts, forms, popups or navigation
  frame.setAttribute('referrerpolicy','no-referrer');
  let observer;
  frame.onload=()=>{try{observer?.disconnect();const doc=frame.contentDocument;if(!doc)return;
    const resize=()=>{frame.style.height=Math.max(180,doc.documentElement.scrollHeight,doc.body.scrollHeight)+'px'};
    resize();observer=new ResizeObserver(resize);observer.observe(doc.body);doc.fonts?.ready.then(resize);
    for(const img of doc.images)img.addEventListener('load',resize);
  }catch{}};
  frame.srcdoc=richDocument(chapter,appearance);
}
export function richFields(chapter){
  if(typeof chapter.html!=='string')return {};
  return {html:sanitizeHTML(chapter.html),...(chapter.css?{css:safeCSS(chapter.css)}:{}),...(typeof chapter.styleKey==='string'?{styleKey:chapter.styleKey}:{}),bodyClass:String(chapter.bodyClass||''),bodyStyle:safeCSS(chapter.bodyStyle||'')};
}
export function epubResources(zip){
  const cache=new Map();let total=0;
  async function asset(base,ref){
    if(safeData.test(ref||''))return ref;
    const path=archivePath(base,ref);if(!path)return '';
    if(cache.has(path))return cache.get(path);
    const task=(async()=>{const file=zip.file(path);if(!file)return '';
      const ext=path.split('.').pop().toLowerCase(),types={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',avif:'image/avif',ttf:'font/ttf',otf:'font/otf',woff:'font/woff',woff2:'font/woff2'};
      if(!types[ext])return '';
      total+=file._data?.uncompressedSize||0;if(total>MAX_RICH)throw new Error('精排图片与字体超过 12 MB，请在书织中压缩资源后导出。');
      return `data:${types[ext]};base64,${await file.async('base64')}`;
    })();cache.set(path,task);return task;
  }
  async function css(source,path,seen=new Set()){
    if(seen.has(path)||seen.size>30)return '';seen=new Set(seen).add(path);
    const imports=[...source.matchAll(/@import\s+(?:url\(\s*)?["']([^"']+)["']\s*\)?[^;]*;/gi)];
    for(const m of imports){const target=archivePath(path,m[1]),file=target&&zip.file(target);source=source.replace(m[0],file?await css(await file.async('string'),target,seen):'')}
    const urls=[...source.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi)];
    for(const m of urls){const data=await asset(path,(m[1]??m[2]??m[3]).trim());source=source.replace(m[0],`url("${data}")`)}
    return safeCSS(source);
  }
  return async(doc,path)=>{
    let styles='';
    for(const e of doc.querySelectorAll('style,link[rel~="stylesheet"]')){
      if(e.localName==='style')styles+=await css(e.textContent,path);
      else {const target=archivePath(path,e.getAttribute('href')),file=target&&zip.file(target);if(file)styles+=await css(await file.async('string'),target)}
    }
    for(const e of doc.querySelectorAll('img')){const data=await asset(path,e.getAttribute('src'));if(data)e.setAttribute('src',data);else{e.removeAttribute('src');e.setAttribute('alt',e.getAttribute('alt')||'未保存的外部或不支持的图片')}}
    for(const e of doc.querySelectorAll('[style]'))e.setAttribute('style',await css(e.getAttribute('style'),path));
    const result={html:sanitizeHTML(doc.body.innerHTML),css:styles,bodyClass:doc.body.className||'',bodyStyle:safeCSS(doc.body.getAttribute('style'))};
    return result;
  };
}
