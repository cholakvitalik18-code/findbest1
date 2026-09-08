(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FBOffers = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  function price(item) {
    if (item.priceValue == null || item.priceValue === '') return Infinity;
    const value=Number(item.priceValue);return Number.isFinite(value)&&value>=0?value:Infinity;
  }
  function condition(item) {
    const value=String(item.condition||'').toLowerCase();
    if(/new|neu|нов|новий/.test(value)&&!/renew|refurb/.test(value))return 'new';
    if(/used|gebraucht|refurb|renew|second|б\/у|восстанов/.test(value))return 'used';
    return 'unknown';
  }
  function filter(items, options={}) {
    const min=options.min===''||options.min==null?0:Number(options.min);
    const max=options.max===''||options.max==null?Infinity:Number(options.max);
    if(Number.isNaN(min)||Number.isNaN(max)||min<0||max<min)return [];
    return items.filter(x=>(!options.source||options.source==='all'||x.source===options.source)&&price(x)>=min&&price(x)<=max&&((min===0&&max===Infinity)||Number.isFinite(price(x)))&&(Number(x.rating)||0)>=Number(options.rating||0)&&(!options.condition||options.condition==='all'||condition(x)===options.condition));
  }
  function sort(items, mode='best', score=()=>0) {
    return [...items].sort((a,b)=>{
      if(mode==='priceAsc'||mode==='priceDesc') {
        const pa=price(a),pb=price(b);if(!Number.isFinite(pa))return Number.isFinite(pb)?1:0;if(!Number.isFinite(pb))return -1;
        return mode==='priceAsc'?pa-pb:pb-pa;
      }
      if(mode==='rating')return (Number(b.rating)||0)-(Number(a.rating)||0);
      if(mode==='relevance')return (Number(b.relevanceScore)||0)-(Number(a.relevanceScore)||0);
      return score(b)-score(a);
    });
  }
  return {price,condition,filter,sort};
});
