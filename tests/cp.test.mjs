import test from 'node:test';
import assert from 'node:assert/strict';
import {cpValues,normalizeCP} from '../cp.js';
test('Multiple CPs support both commas, whitespace and duplicate removal',()=>{
  assert.deepEqual(cpValues(' A/B，C/D, A/B,, '),['A/B','C/D']);
  assert.equal(normalizeCP(' A/B， C/D '),'A/B, C/D');
  assert.deepEqual(cpValues('A/B'),['A/B']);
  assert.deepEqual(cpValues(' ，, '),['未分类']);
});
test('One stored work belongs to both CP classifications without duplicating it',()=>{
  const works=[{id:'one',cp:'A/B，C/D'},{id:'two',cp:'A/B'}];
  const groups=[...new Set(works.flatMap(w=>cpValues(w.cp)))];
  assert.deepEqual(groups,['A/B','C/D']);
  assert.deepEqual(works.filter(w=>cpValues(w.cp).includes('C/D')).map(w=>w.id),['one']);
  assert.equal(works.length,2);
});
