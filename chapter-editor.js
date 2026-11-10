const MAX_TEXT=12*1024*1024;
export function buildEditedWork(work,chapters){
  if(!Array.isArray(chapters)||!chapters.length||chapters.length>2000)throw new Error('章节结构无效，需保留 1 至 2000 章。');
  let size=0;
  const copy=chapters.map((c,i)=>{
    if(typeof c.title!=='string'||typeof c.text!=='string')throw new Error('章节格式无效。');
    const title=c.title.trim();if(!title)throw new Error(`第 ${i+1} 章的标题不能为空。`);
    if(title.length>300)throw new Error(`第 ${i+1} 章的标题超过 300 字符。`);
    const old=work.chapters.find(o=>o.title===title&&o.text===c.text&&o.html===c.html);
    if(!c.text.trim()&&!(old?.html&&old.html.includes('<img')))throw new Error(`第 ${i+1} 章的正文不能为空。`);
    size+=c.text.length;return old?{...old,title,text:c.text}:{title,text:c.text};
  });
  if(size>MAX_TEXT)throw new Error('整篇正文超过 12 MB，请缩减后保存。');
  if(copy.length===work.chapters.length&&copy.every((c,i)=>c.title===work.chapters[i].title&&c.text===work.chapters[i].text))return null;
  return {...work,chapters:copy,verified:false};
}
export function draftAsText(title,chapters){return title+'\n\n'+chapters.map(c=>c.title+'\n\n'+c.text).join('\n\n');}
export function splitChapter(chapter,position){
  if(!Number.isInteger(position)||position<=0||position>=chapter.text.length)throw new Error('请把光标放在正文中间需要分章的位置。');
  const before=chapter.text.slice(0,position),after=chapter.text.slice(position);
  if(!before.trim()||!after.trim())throw new Error('拆分后的两章都需要有正文。');
  return [{title:chapter.title,text:before},{title:chapter.title+'（续）',text:after}];
}

export function openChapterEditor({work,initialChapter=0,modal,save,onSaved}){
  const original=work.chapters.map(c=>({...c}));
  const drafts=original.map(c=>({...c}));
  const deleted=[];
  let index=Math.max(0,Math.min(initialChapter,drafts.length-1)),saving=false;
  modal.innerHTML=`<div class="row between"><h2 id="body-editor-heading">编辑正文</h2><button type="button" class="quiet" id="body-editor-close" aria-label="关闭正文编辑器">✕</button></div>
    <p class="subtle muted">修改你的私人阅读副本，原始上传文件会保留。切换章节会保留草稿，点击保存后同步；保存失败不会清空编辑内容。精排章节修改标题、文字或拆分后，该章改为纯文字；未修改的章节保留精排。</p>
    <form id="body-editor-form" class="stack">
      <label>选择章节<select id="body-editor-chapter" aria-label="选择章节"></select></label>
      <div class="row wrap"><button type="button" id="chapter-add">＋ 新增章节</button><button type="button" id="chapter-up">↑ 上移</button><button type="button" id="chapter-down">↓ 下移</button></div>
      <div class="row wrap"><button type="button" class="danger" id="chapter-delete">删除当前章</button><button type="button" id="chapter-undo-delete" disabled>撤销删除</button><small id="chapter-delete-status" role="status">至少保留一章。删除在保存正文后同步生效，保存前可撤销。</small></div>
      <label>章节标题<input id="body-editor-title" maxlength="300" required aria-label="章节标题"></label>
      <label>正文<textarea id="body-editor-text" rows="15" spellcheck="false" aria-label="正文"></textarea></label>
      <div><button type="button" id="chapter-split">从光标处拆分章节</button><p class="subtle muted">先点正文中的分章位置，再点拆分；后半段会移入新章节。新增章节插在当前章后，填写正文后再保存。</p></div>
      <div class="row between wrap"><small id="body-editor-count"></small><small id="body-editor-dirty" role="status"></small></div>
      <p class="notice">保存后会重新标记为“待核对”。图片、排版与原始附件不会被本次文字修改替换。</p>
      <p class="error" id="body-editor-error" role="alert"></p>
      <div class="dialog-actions wrap"><button type="button" id="body-editor-export">导出编辑稿 TXT</button><button type="button" id="body-editor-cancel">取消</button><button class="primary" id="body-editor-save">保存正文</button></div>
    </form>`;
  modal.classList.add('body-editor');
  modal.setAttribute('aria-labelledby','body-editor-heading');
  const find=s=>modal.querySelector(s),chooser=find('#body-editor-chapter'),title=find('#body-editor-title'),text=find('#body-editor-text'),error=find('#body-editor-error');
  const dirty=()=>drafts.length!==original.length||drafts.some((c,i)=>c.title!==original[i].title||c.text!==original[i].text);
  const status=()=>{find('#body-editor-count').textContent=`本章 ${text.value.length.toLocaleString('zh-CN')} 字符 · 共 ${drafts.length} 章`;find('#body-editor-dirty').textContent=dirty()?'有未保存的修改':'尚未修改';find('#chapter-delete').disabled=saving||drafts.length<=1;find('#chapter-undo-delete').disabled=saving||!deleted.length;find('#chapter-delete-status').textContent=deleted.length?`已从草稿移除 ${deleted.length} 章；保存后同步删除，保存前可逐次撤销。`:'至少保留一章。删除在保存正文后同步生效，保存前可撤销。';};
  function options(){chooser.replaceChildren(...drafts.map((c,i)=>{const option=document.createElement('option');option.value=String(i);option.textContent=`${i+1}. ${c.title||'未命名章节'}`;return option}));chooser.value=String(index)}
  function capture(){drafts[index]={...drafts[index],title:title.value,text:text.value};status()}
  function load(){title.value=drafts[index].title;text.value=drafts[index].text;find('#chapter-up').disabled=index===0;find('#chapter-down').disabled=index===drafts.length-1;status()}
  function structure(action){capture();error.textContent='';try{action();options();load()}catch(e){error.textContent=e.message}}
  find('#chapter-add').onclick=()=>structure(()=>{if(drafts.length>=2000)throw new Error('最多支持 2000 章。');drafts.splice(index+1,0,{title:`第 ${drafts.length+1} 章`,text:''});index++});
  find('#chapter-split').onclick=()=>{const position=text.selectionStart;structure(()=>{if(drafts.length>=2000)throw new Error('最多支持 2000 章。');drafts.splice(index,1,...splitChapter(drafts[index],position));index++})};
  function move(offset){structure(()=>{const target=index+offset;if(target<0||target>=drafts.length)return;[drafts[index],drafts[target]]=[drafts[target],drafts[index]];index=target})}
  find('#chapter-up').onclick=()=>move(-1);find('#chapter-down').onclick=()=>move(1);
  find('#chapter-delete').onclick=()=>structure(()=>{if(drafts.length<=1)throw new Error('作品至少需要保留一章。');deleted.push({index,chapter:drafts.splice(index,1)[0]});index=Math.min(index,drafts.length-1)});
  find('#chapter-undo-delete').onclick=()=>structure(()=>{if(drafts.length>=2000)throw new Error('最多支持 2000 章，请先减少章节再撤销。');const removed=deleted.pop();if(!removed)return;index=Math.min(removed.index,drafts.length);drafts.splice(index,0,removed.chapter)});
  function requestClose(){if(saving)return;if(dirty()&&!confirm('还有未保存的正文修改，是否放弃这些编辑并关闭？'))return;cleanup();modal.close()}
  function outside(e){if(e.target!==modal)return;const r=modal.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom){e.stopImmediatePropagation();requestClose()}}
  function cancel(e){e.preventDefault();requestClose()}
  function unload(e){if(dirty()){e.preventDefault();e.returnValue=''}}
  function closed(){if(!modal.open)cleanup()}
  function cleanup(){modal.removeEventListener('click',outside,true);modal.removeEventListener('cancel',cancel);modal.removeEventListener('close',closed);window.removeEventListener('beforeunload',unload);modal.classList.remove('body-editor');modal.removeAttribute('aria-labelledby')}
  modal.addEventListener('click',outside,true);modal.addEventListener('cancel',cancel);modal.addEventListener('close',closed);window.addEventListener('beforeunload',unload);
  title.oninput=()=>{capture();chooser.options[index].textContent=`${index+1}. ${title.value||'未命名章节'}`};text.oninput=capture;
  chooser.onchange=()=>{capture();index=Number(chooser.value);load();error.textContent=''};
  find('#body-editor-close').onclick=requestClose;find('#body-editor-cancel').onclick=requestClose;
  find('#body-editor-export').onclick=()=>{capture();const blob=new Blob([draftAsText(work.title,drafts)],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=(work.title.replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,100)||'作品')+'-编辑稿.txt';link.click();setTimeout(()=>URL.revokeObjectURL(url),30000)};
  find('#body-editor-form').onsubmit=async e=>{
    e.preventDefault();if(saving)return;capture();error.textContent='';let updated;
    try{updated=buildEditedWork(work,drafts);if(!updated){find('#body-editor-dirty').textContent='没有需要保存的修改';return}}
    catch(e){error.textContent=e.message;return}
    saving=true;modal.querySelectorAll('button,input,textarea,select').forEach(el=>el.disabled=true);find('#body-editor-save').textContent='正在保存…';
    try{await save(updated);original.splice(0,original.length,...updated.chapters.map(c=>({...c})));cleanup();modal.close();onSaved(updated,index)}
    catch(e){error.textContent=(e.message||'保存失败')+' 编辑稿已保留，可重试或先导出 TXT。'}
    finally{saving=false;modal.querySelectorAll('button,input,textarea,select').forEach(el=>el.disabled=false);find('#chapter-up').disabled=index===0;find('#chapter-down').disabled=index===drafts.length-1;find('#body-editor-save').textContent='保存正文';status()}
  };
  options();load();if(!modal.open)modal.showModal();
}
