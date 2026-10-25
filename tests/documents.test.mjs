import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMarkdown,openDocumentZip} from '../document-imports.js';
import {parseFile} from '../importer.js';
test('Markdown metadata, chapters and final paragraph survive; code headings stay in code',()=>{
  const d=parseMarkdown('---\ntitle: "测试作品"\nauthor: 作者乙\n---\n# 标题\n## 第一章\n正文一。\n```txt\n# not a chapter\n```\n## 第二章\n最后一段。','book.md');
  assert.equal(d.title,'测试作品');assert.equal(d.author,'作者乙');assert.equal(d.chapters.length,2);assert.ok(d.chapters[0].text.includes('# not a chapter'));assert.equal(d.chapters[1].text,'最后一段。');
});
test('Markdown parser rejects empty and heading-only documents',()=>{
  assert.throws(()=>parseMarkdown(' \n','x.md'),/没有可提取/);assert.throws(()=>parseMarkdown('# 只有标题','x.md'),/没有正文/);
});
test('UTF-16 text import decodes BOM rather than silently mangling Unicode',async()=>{
  const b=Buffer.from('\ufeff第一章 开始\n最后一段。','utf16le');const w=await parseFile(new File([b],'unicode.txt'));
  assert.equal(w.chapters[0].text,'最后一段。');
});
test('Old DOC and DRM ebook extensions are rejected explicitly',async()=>{
  await assert.rejects(()=>parseFile(new File(['x'],'old.doc')),/旧 DOC/);
  await assert.rejects(()=>parseFile(new File(['x'],'book.azw')),/MOBI/);
});
test('Compressed document file count and decompressed-size limits fail closed',async()=>{
  const old=globalThis.JSZip;
  try{globalThis.JSZip={loadAsync:async()=>({files:{huge:{_data:{uncompressedSize:61*1024*1024}}}})};await assert.rejects(()=>openDocumentZip(new ArrayBuffer(0),'DOCX'),/60 MB/)}finally{globalThis.JSZip=old}
});
