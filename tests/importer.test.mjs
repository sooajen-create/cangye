import test from 'node:test';
import assert from 'node:assert/strict';
import {platform,parseTXT,validateWork,MAX_TEXT} from '../importer.js';
test('platform matching rejects lookalike hosts and unsupported shortlinks',()=>{
  assert.equal(platform('https://archiveofourown.org/works/1'),'AO3');
  assert.equal(platform('https://author.lofter.com/post/a'),'LOFTER');
  assert.equal(platform('https://m.weibo.cn/status/123'),'微博');
  assert.equal(platform('https://www.asianfanfics.com/story/view/123'),'Asianfanfics');
  for(const u of ['https://archiveofourown.org.evil.com/works/1','https://lofter.com.evil.com','https://evil-lofter.com','https://t.cn/example','invalid'])assert.equal(platform(u),'');
});
test('TXT chapters preserve complete text including the ending',()=>{
  const w=parseTXT('\uFEFF前言\r\n\r\n第一章 开始\r\n你好。\r\n\r\nChapter 2 Ending\r\n最后一段。','心头好.txt');
  assert.equal(w.title,'心头好');assert.equal(w.chapters.length,3);assert.equal(w.chapters[2].text,'最后一段。');assert.equal(w.verified,false);
});
test('empty text and oversized text fail instead of creating empty backups',()=>{
  assert.throws(()=>parseTXT(' \n '),/没有正文/);assert.throws(()=>parseTXT('a'.repeat(MAX_TEXT+1)),/12 MB/);
});
test('restored records retain text and metadata but discard server revisions and remote attachment paths',()=>{
  const w=validateWork({id:'safe-id',title:'<script>bad</script>',author:'作者',chapters:[{title:'末章',text:'独立正文'}],tags:['CP'],_rev:100,original:{path:'another-user/file'}});
  assert.equal(w.chapters[0].text,'独立正文');assert.equal(w._rev,undefined);assert.equal(w.original,undefined);assert.equal(w.verified,false);
  assert.throws(()=>validateWork({title:'空',chapters:[]}),/无效作品/);
  assert.throws(()=>validateWork({title:'非法',chapters:[{text:{}}]}),/格式错误/);
});
