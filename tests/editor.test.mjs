import test from 'node:test';
import assert from 'node:assert/strict';
import {buildEditedWork,draftAsText} from '../chapter-editor.js';
const make=()=>({id:'book',title:'作品',author:'作者',cp:'CP',tags:['标签'],verified:true,_rev:4,original:{path:'private/original'},reading:{chapter:1},chapters:[{title:'第一章',text:'原正文一。'},{title:'第二章',text:'原正文二。'}]});
test('Editing chapters preserves identity, original attachment, revision and metadata without mutating source',()=>{
  const original=make(),before=structuredClone(original),chapters=original.chapters.map(c=>({...c}));chapters[0].title=' 新标题 ';chapters[1].text='修改后的正文。\n\n最后一段。\n';
  const updated=buildEditedWork(original,chapters);assert.deepEqual(original,before);assert.equal(updated.chapters[0].title,'新标题');assert.equal(updated.chapters[1].text,chapters[1].text);assert.equal(updated._rev,4);assert.deepEqual(updated.original,original.original);assert.equal(updated.verified,false);assert.deepEqual(updated.tags,['标签']);
});
test('Unchanged content does not trigger a database save',()=>{const w=make();assert.equal(buildEditedWork(w,structuredClone(w.chapters)),null)});
test('Blank chapter content, invalid structure and oversized documents are rejected',()=>{
  const w=make();assert.throws(()=>buildEditedWork(w,[{title:'',text:'正文'},w.chapters[1]]),/标题不能为空/);assert.throws(()=>buildEditedWork(w,[{title:'第一章',text:' \n'},w.chapters[1]]),/正文不能为空/);assert.throws(()=>buildEditedWork(w,[]),/章节结构/);assert.throws(()=>buildEditedWork(w,[{title:'第一章',text:'a'.repeat(12*1024*1024+1)},w.chapters[1]]),/12 MB/);
});
test('Plain text draft export includes every edited chapter and preserves literal HTML as text',()=>{const w=make();w.chapters[1].text='<script>literal</script>\n结尾';const out=draftAsText(w.title,w.chapters);assert.ok(out.includes('第一章\n\n原正文一。'));assert.ok(out.endsWith('<script>literal</script>\n结尾'))});
