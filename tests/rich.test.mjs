import test from 'node:test';
import assert from 'node:assert/strict';
import {archivePath,safeCSS} from '../rich-epub.js';
import {buildEditedWork} from '../chapter-editor.js';
test('Archive references stay inside EPUB and reject network and absolute paths',()=>{
 assert.equal(archivePath('OEBPS/Text/c.xhtml','../Styles/book.css'),'OEBPS/Styles/book.css');
 for(const x of ['https://example.com/a','//evil/a','/x','../../../../x','data:text/html,a','..%5csecret'])assert.equal(archivePath('OEBPS/Text/c.xhtml',x),null);
});
test('External CSS URLs and imports cannot survive storage or rendering',()=>{
 const css=safeCSS('@import "https://example.com/x";p{background:url(https://example.com/i)}@font-face{src:url("data:font/woff;base64,d09GRg==")}');
 assert.ok(!css.includes('example.com'));assert.ok(css.includes('data:font/woff'));assert.ok(!safeCSS('</style><script>x</script>').includes('</style>'));
});
test('Rich chapters survive unchanged reorder; editing only removes that chapter formatting',()=>{
 const a={title:'A',text:'甲',html:'<p>甲</p>',styleKey:'s0'},b={title:'B',text:'乙',html:'<p>乙</p>',styleKey:'s0'};
 const w={id:'x',chapters:[a,b],richStyles:{s0:'p{color:red}'}};
 const reordered=buildEditedWork(w,[b,a]);assert.equal(reordered.chapters[1].html,a.html);
 const edited=buildEditedWork(w,[{...a,text:'修改后'},b]);assert.equal(edited.chapters[0].html,undefined);assert.equal(edited.chapters[1].html,b.html);assert.deepEqual(edited.richStyles,w.richStyles);
});
