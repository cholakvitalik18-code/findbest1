'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createReviewsStore } = require('../lib/reviews-store');
const { validateReview, validateReviewList } = require('../lib/reviews-validation');
const { validateSearch, allowedHttpUrl, createRateLimiter, clientIp } = require('../lib/security');
const fixture = { name:'TEST FIXTURE', rating:5, body:'TEST ONLY — review validation and moderation fixture.', consent:true };

test('review validation rejects invalid rating, consent, text, controls and oversized input', () => {
  assert.ok(validateReview(fixture));
  for (const changes of [{rating:0},{rating:6},{rating:2.5},{rating:'5'},{consent:false},{body:''},{body:'x'.repeat(2001)},{name:'x'},{name:'<script>'},{body:'a\u0000'.repeat(20)}]) assert.equal(validateReview({...fixture,...changes}),null);
  assert.equal(validateReview(null),null);
  assert.equal(validateReview({...fixture,body:'<script>TEST ONLY, rendered as plain text</script>'}).body,'<script>TEST ONLY, rendered as plain text</script>');
});
test('review list rejects SQL-like sort, invalid pages and nonpublic status', () => {
  assert.equal(validateReviewList(new URLSearchParams('sort=popular')).sort,'popular');
  for(const q of ['sort=rating;DROP TABLE reviews','page=-1','page=0','page=10001'])assert.equal(validateReviewList(new URLSearchParams(q)),null);
  assert.equal(validateReviewList(new URLSearchParams('status=pending')).status,'published');
});
test('only published reviews count; hide, republish, votes, popular sorting and delete are consistent', t => {
  const store=createReviewsStore(':memory:');t.after(()=>store.close());
  assert.deepEqual({...store.summary()},{total:0,average:null,distribution:{1:0,2:0,3:0,4:0,5:0}});
  const a=store.create({...fixture,fingerprint:'fixture-a'}),b=store.create({...fixture,rating:1,fingerprint:'fixture-b'});
  assert.equal(store.summary().total,0);assert.equal(store.list().items.length,0);assert.equal(store.vote(a.id,'test'),null);
  store.moderate(a.id,'published');store.moderate(b.id,'published');assert.equal(store.summary().average,3);
  store.vote(b.id,'voter-test');store.vote(b.id,'voter-test');assert.equal(store.list({sort:'popular'}).items[0].id,b.id);assert.equal(store.list({sort:'popular'}).items[0].helpful,1);
  store.moderate(b.id,'hidden');assert.equal(store.summary().average,5);assert.equal(store.summary().distribution[1],0);
  store.moderate(b.id,'published');assert.equal(store.summary().average,3);
  assert.ok(store.moderate(a.id,'delete'));assert.equal(store.summary().average,1);assert.equal(store.moderate(a.id,'delete'),false);
  store.moderate(b.id,'delete');assert.equal(store.summary().average,null);
});
test('duplicate submission and persisted rate limits survive reopening SQLite', t => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'findbest-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file=path.join(dir,'reviews.sqlite');let store=createReviewsStore(file);
  store.create({...fixture,fingerprint:'same'});assert.equal(store.create({...fixture,fingerprint:'same'}).duplicate,true);
  assert.ok(store.takeLimit('test',1,5000,1000).allowed);store.close();store=createReviewsStore(file);
  assert.equal(store.takeLimit('test',1,5000,2000).allowed,false);assert.ok(store.takeLimit('test',1,5000,7000).allowed);assert.equal(store.list({status:'pending'}).total,1);store.close();
});
test('SQL-looking review text is stored literally and does not alter schema', t => {
  const store=createReviewsStore(':memory:');t.after(()=>store.close());
  store.create({...fixture,body:"TEST ONLY '); DROP TABLE reviews; --",fingerprint:'sql'});
  assert.equal(store.list({status:'pending'}).items[0].body,"TEST ONLY '); DROP TABLE reviews; --");assert.equal(store.summary().total,0);
});
test('search rejects very long queries, controls and invalid location instead of truncating', () => {
  assert.ok(validateSearch('iPhone 15 до 500 евро','Berlin').ok);
  for(const q of ['', 'x', 'a'.repeat(121), 'PS5\nBerlin', {}, null])assert.equal(validateSearch(q,'').ok,false);
  assert.equal(validateSearch('PS5','x'.repeat(61)).ok,false);
});
test('seller links reject credentials, dangerous protocols and internal hosts', () => {
  for(const url of ['javascript:alert(1)','file:///etc/passwd','https://user:pass@example.com','http://localhost/a','http://127.1/a','http://2130706433/a','http://[::1]/','http://169.254.169.254/','http://192.168.1.1/'])assert.equal(allowedHttpUrl(url),'');
  assert.equal(allowedHttpUrl('https://www.ebay.de/itm/123'),'https://www.ebay.de/itm/123');
});
test('memory limiter has a hard bound, and untrusted XFF cannot spoof identity', () => {
  const limit=createRateLimiter({max:2,windowMs:5000,maxEntries:2});assert.ok(limit('a').allowed);assert.ok(limit('a').allowed);assert.equal(limit('a').allowed,false);assert.ok(limit('b').allowed);assert.equal(limit('c').allowed,false);
  const original=process.env.TRUST_PROXY_HOPS;process.env.TRUST_PROXY_HOPS='0';assert.equal(clientIp({headers:{'x-forwarded-for':'1.2.3.4'},socket:{remoteAddress:'5.6.7.8'}}),'5.6.7.8');
  if(original===undefined)delete process.env.TRUST_PROXY_HOPS;else process.env.TRUST_PROXY_HOPS=original;
});
