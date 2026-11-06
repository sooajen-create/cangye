import test from 'node:test';
import assert from 'node:assert/strict';
import {buildEditedWork,draftAsText,splitChapter} from '../chapter-editor.js';
const make=()=>({id:'book',title:'作品',author:'作者',cp:'CP',tags:['标签'],verified:true,_rev:4,original:{path:'private/original'},reading:{chapter:1},chapters:[{title:'第一章',text:'原正文一。'},{title:'第二章',text:'原正文二。'}]});
test('Editing chapters preserves identity, original attachment, revision and metadata without mutating source',()=>{
  const original=make(),before=structuredClone(original),chapters=original.chapters.map(c=>({...c}));chapters[0].title=' 新标题 ';chapters[1].text='修改后的正文。\n\n最后一段。\n';
  const updated=buildEditedWork(original,chapters);assert.deepEqual(original,before);assert.equal(updated.chapters[0].title,'新标题');assert.equal(updated.chapters[1].text,chapters[1].text);assert.equal(updated._rev,4);assert.deepEqual(updated.original,original.original);assert.equal(updated.verified,false);assert.deepEqual(updated.tags,['标签']);
});
test('Unchanged content does not trigger a database save',()=>{const w=make();assert.equal(buildEditedWork(w,structuredClone(w.chapters)),null)});
test('Splitting preserves every character and rejects empty halves',()=>{
  const c={title:'第一章',text:'前半段。\n\n后半段。'};
  const split=splitChapter(c,6);assert.equal(split.map(x=>x.text).join(''),c.text);
  assert.equal(split[1].title,'第一章（续）');assert.equal(c.text,'前半段。\n\n后半段。');
  for(const at of [0,c.text.length,-1])assert.throws(()=>splitChapter(c,at));
  assert.throws(()=>splitChapter({title:'章',text:'  正文'},1));
});
test('Adding, splitting and reordering chapters preserve metadata and original records',()=>{
  const w=make(),before=structuredClone(w);
  const chapters=[w.chapters[1],...splitChapter(w.chapters[0],2),{title:'番外',text:'新章节正文'}];
  const updated=buildEditedWork(w,chapters);
  assert.equal(updated.chapters.length,4);assert.equal(updated.chapters[0].title,'第二章');
  assert.equal(updated.id,w.id);assert.equal(updated._rev,4);assert.deepEqual(updated.original,w.original);assert.deepEqual(w,before);
});
test('Blank chapter content, invalid structure and oversized documents are rejected',()=>{
  const w=make();assert.throws(()=>buildEditedWork(w,[{title:'',text:'正文'},w.chapters[1]]),/标题不能为空/);assert.throws(()=>buildEditedWork(w,[{title:'第一章',text:' \n'},w.chapters[1]]),/正文不能为空/);assert.throws(()=>buildEditedWork(w,[]),/章节结构/);assert.throws(()=>buildEditedWork(w,[{title:'第一章',text:'a'.repeat(12*1024*1024+1)},w.chapters[1]]),/12 MB/);
});
test('Plain text draft export includes every edited chapter and preserves literal HTML as text',()=>{const w=make();w.chapters[1].text='<script>literal</script>\n结尾';const out=draftAsText(w.title,w.chapters);assert.ok(out.includes('第一章\n\n原正文一。'));assert.ok(out.endsWith('<script>literal</script>\n结尾'))});
