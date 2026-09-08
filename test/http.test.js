'use strict';
// Isolated contract fixtures. No live API calls and no production database writes.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'findbest-http-test-'));
const password = crypto.randomBytes(32).toString('hex');
process.env.REVIEWS_DATA_DIR=dir;
process.env.REVIEWS_ADMIN_PASSWORD=password;
process.env.REVIEWS_SECRET=crypto.randomBytes(32).toString('hex');
process.env.SERPER_API_KEY='test-fixture-only';
process.env.SERPAPI_KEY='';
process.env.EBAY_CLIENT_ID='';process.env.EBAY_CLIENT_SECRET='';process.env.TELEGRAM_BOT_TOKEN='';process.env.RENDER='false';process.env.NODE_ENV='test';process.env.PUBLIC_SITE_URL='';process.env.TRUST_PROXY_HOPS='0';
let providerCalls=0, providerFail=false;
const realFetch=global.fetch;
global.fetch=async (url,options)=>{
  assert.equal(String(url),'https://google.serper.dev/shopping');providerCalls++;
  if(providerFail)throw new Error('TEST upstream unavailable');
  const q=JSON.parse(options.body).q;
  const product=require('../lib/search-query').parseSearchQuery(q).product;
  return new Response(JSON.stringify({shopping:[{title:`TEST ONLY ${product}`,source:'Contract fixture',price:'€499',extractedPrice:499,link:'https://www.ebay.de/itm/123456789',imageUrl:'https://example.com/test.png'}]}),{status:200,headers:{'Content-Type':'application/json'}});
};
const {server}=require('../server');
let origin,port;
function request(route,method='GET',data,extra={}) {
  return new Promise((resolve,reject)=>{
    const body=data===undefined?undefined:typeof data==='string'?data:JSON.stringify(data);
    const req=http.request({hostname:'127.0.0.1',port,path:route,method,headers:{Host:`127.0.0.1:${port}`,Origin:origin,'X-FindBest-Request':'1','Content-Type':'application/json',...(body?{'Content-Length':Buffer.byteLength(body)}:{}),...extra}},res=>{
      const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>{const text=Buffer.concat(chunks).toString();let json;try{json=JSON.parse(text);}catch{}resolve({status:res.statusCode,headers:res.headers,json,text});});
    });req.on('error',reject);req.end(body);
  });
}
test('HTTP integration: search preserved and reviews protected',async t=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));port=server.address().port;origin=`http://127.0.0.1:${port}`;
  t.after(async()=>{global.fetch=realFetch;await new Promise(resolve=>server.close(resolve));fs.rmSync(dir,{recursive:true,force:true});});
  await t.test('public pages and assets load, private server files never load',async()=>{
    for(const route of ['/','/results.html','/favorites.html','/reviews.html','/assets/js/home.js','/assets/js/reviews.js','/assets/css/mobile.css'])assert.equal((await request(route)).status,200,route);
    for(const route of ['/.env','/server.js','/package.json','/lib/reviews-api.js','/data/reviews.sqlite','/data/reviews.secret','/%2eenv','/test/http.test.js'])assert.equal((await request(route)).status,404,route);
    const page=await request('/');assert.equal(page.headers['x-frame-options'],'DENY');assert.equal(page.headers['x-content-type-options'],'nosniff');assert.match(page.headers['content-security-policy'],/frame-ancestors 'none'/);
    assert.equal((await request('/','POST',{})).status,405);
  });
  await t.test('seven existing search queries retain provider results, prices and seller links',async()=>{
    for(const q of ['iPhone 15','PS5 Slim','AirPods Pro','MacBook Air','iPhone 15 до 500 евро','PS5 Berlin','Gaming Laptop RTX 4060 unter 1000 Euro']){
      const result=await request('/api/search?q='+encodeURIComponent(q));assert.equal(result.status,200);assert.equal(result.json.items.length,1);assert.equal(result.json.items[0].priceValue,499);assert.ok(result.json.items[0].source);assert.match(result.json.items[0].url,/^https:\/\/www.ebay.de\//);
    }
    const before=providerCalls;await request('/api/search?q=iPhone%2015');assert.equal(providerCalls,before);
  });
  await t.test('provider failure has a safe partial response and is not cached indefinitely',async()=>{
    providerFail=true;const r=await request('/api/search?q=Test%20timeout');assert.equal(r.status,200);assert.deepEqual(r.json.items,[]);assert.ok(r.json.warnings.length);assert.ok(!r.text.includes('TEST upstream'));
    providerFail=false;const retry=await request('/api/search?q=Test%20timeout');assert.equal(retry.json.items.length,1);
  });
  await t.test('review endpoints enforce method, origin, content type, length and auth',async()=>{
    assert.equal((await request('/api/reviews','DELETE')).status,405);
    assert.equal((await request('/api/reviews','POST',{}, {Origin:'https://attacker.invalid'})).status,403);
    assert.equal((await request('/api/reviews','POST','{}',{'Content-Type':'text/plain'})).status,415);
    assert.equal((await request('/api/reviews','POST','x'.repeat(12001))).status,413);
    assert.equal((await request('/api/reviews','POST',{})).status,400);
    assert.equal((await request('/api/admin/reviews')).status,401);
    assert.equal((await request('/api/admin/session','POST',{password:'incorrect'})).status,401);
  });
  await t.test('review create → moderation → publish → useful → hide → delete → logout',async()=>{
    const fixture={name:'TEST FIXTURE',rating:4,body:'TEST ONLY — end-to-end moderation contract.',consent:true};
    assert.equal((await request('/api/reviews')).json.summary.total,0);
    assert.equal((await request('/api/reviews','POST',fixture)).status,201);
    assert.equal((await request('/api/reviews')).json.summary.total,0);
    const login=await request('/api/admin/session','POST',{password});assert.equal(login.status,200);const setCookie=login.headers['set-cookie'][0];assert.match(setCookie,/HttpOnly/);assert.match(setCookie,/SameSite=Strict/);const headers={Cookie:setCookie.split(';')[0]};
    const id=(await request('/api/admin/reviews','GET',undefined,headers)).json.items[0].id;
    assert.equal((await request(`/api/admin/reviews/${id}`,'PATCH',{action:'published'},headers)).status,200);
    const listed=(await request('/api/reviews')).json;assert.equal(listed.summary.total,1);assert.equal(listed.summary.average,4);assert.ok(!JSON.stringify(listed).includes('fingerprint'));
    assert.equal((await request(`/api/reviews/${id}/helpful`,'POST',{})).json.helpful,1);assert.equal((await request(`/api/reviews/${id}/helpful`,'POST',{})).json.helpful,1);
    assert.equal((await request(`/api/admin/reviews/${id}`,'PATCH',{action:'hidden'},headers)).status,200);assert.equal((await request('/api/reviews')).json.summary.total,0);
    assert.equal((await request(`/api/admin/reviews/${id}`,'DELETE',undefined,headers)).status,200);
    await request('/api/admin/session','DELETE',undefined,headers);assert.equal((await request('/api/admin/reviews','GET',undefined,headers)).status,401);
  });
  await t.test('submission limit returns 429 and retry-after',async()=>{
    for(let i=0;i<2;i++)assert.equal((await request('/api/reviews','POST',{name:'TEST FIXTURE',rating:3,body:'TEST ONLY — distinct review for rate limit '+i,consent:true})).status,201);
    const r=await request('/api/reviews','POST',{name:'TEST FIXTURE',rating:3,body:'TEST ONLY — this fourth submission is blocked.',consent:true});assert.equal(r.status,429);assert.ok(Number(r.headers['retry-after'])>0);
  });
});
