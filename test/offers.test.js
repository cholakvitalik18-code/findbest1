'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const offers=require('../assets/js/offers');
const rows=[{id:'test-a',priceValue:599,rating:4.9,condition:'New',source:'A',relevanceScore:.5},{id:'test-b',priceValue:499,rating:3,condition:'Used',source:'B',relevanceScore:.9},{id:'test-c',priceValue:null,source:'A'}];
test('price, condition, seller and rating filters combine without mutating offers',()=>{
  assert.deepEqual(offers.filter(rows,{max:500}).map(x=>x.id),['test-b']);
  assert.deepEqual(offers.filter(rows,{condition:'new',rating:4,source:'A'}).map(x=>x.id),['test-a']);
  assert.deepEqual(offers.filter(rows,{min:700,max:500}),[]);assert.equal(rows.length,3);
});
test('all sort modes use real supplied values and missing prices stay last',()=>{
  assert.deepEqual(offers.sort(rows,'priceAsc').map(x=>x.id),['test-b','test-a','test-c']);
  assert.deepEqual(offers.sort(rows,'priceDesc').map(x=>x.id),['test-a','test-b','test-c']);
  assert.equal(offers.sort(rows,'rating')[0].id,'test-a');assert.equal(offers.sort(rows,'relevance')[0].id,'test-b');assert.equal(offers.sort(rows,'best',x=>x.id==='test-b'?1:0)[0].id,'test-b');
  assert.equal(offers.price({priceValue:null}),Infinity);assert.equal(offers.price({priceValue:''}),Infinity);assert.equal(offers.price({priceValue:0}),0);
});
