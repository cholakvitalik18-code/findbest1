(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const language = () => window.FBUI?.language() || document.documentElement.lang || 'ru';
  const t = key => (ReviewCopy[language()] || ReviewCopy.ru)[key] || key;
  const admin = document.body.dataset.page === 'admin';
  let page = 1, sort = 'newest', status = 'pending', loadController, latestPublic, latestAdmin;
  function make(tag, className, text) { const el = document.createElement(tag); if (className) el.className = className; if (text !== undefined) el.textContent = text; return el; }
  function translate() {
    document.querySelectorAll('[data-r]').forEach(el => el.textContent = t(el.dataset.r));
    document.querySelectorAll('[data-review-message]').forEach(el => { if(el.textContent) el.textContent=t(el.dataset.reviewMessage); });
    document.title = t(admin ? 'adminTitle' : 'title') + ' — FindBest';
    document.querySelector('meta[name=description]')?.setAttribute('content', t('sub'));
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', t('title'));
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', t('sub'));
    if(latestPublic) renderPublic(latestPublic);
    if(latestAdmin && !$('adminArea').hidden) renderAdmin(latestAdmin);
  }
  window.addEventListener('fb-language-change', translate); translate();
  const messageKey = code => ({ rate_limited:'rate', duplicate_review:'duplicate', invalid_review:'invalid', invalid_parameters:'invalid', authentication_required:'sessionExpired', invalid_credentials:'authError' }[code] || 'unavailable');
  async function api(url, options = {}) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000);
    const cancel = () => controller.abort();
    if(options.signal?.aborted) cancel();
    options.signal?.addEventListener('abort',cancel,{once:true});
    try {
      const response = await fetch(url, { ...options, signal: controller.signal, credentials: 'same-origin', headers: { 'Content-Type':'application/json', 'X-FindBest-Request':'1', ...options.headers } });
      const data = await response.json();
      if (!response.ok) { const error = new Error(messageKey(data.code)); error.status = response.status; throw error; }
      return data;
    } finally { clearTimeout(timer); options.signal?.removeEventListener('abort',cancel); }
  }
  function inform(id, key, focus = false) { const el = $(id); el.dataset.reviewMessage=key; el.textContent = t(key); if (focus) el.focus(); }
  function empty(root, heading, text, retry) {
    const box = make('div','review-empty'),title=make('h3','',t(heading));title.dataset.r=heading;box.append(make('div','review-empty-icon','☆'),title);
    if (text) {const copy=make('p','',t(text));copy.dataset.r=text;box.append(copy);}
    if (retry) { const button = make('button','btn',t('retry')); button.dataset.r='retry';button.type = 'button'; button.onclick = retry; box.append(button); }
    root.replaceChildren(box);
  }
  function summary(stats) {
    const root = $('reviewSummary'); root.replaceChildren(); root.setAttribute('aria-busy','false');
    const rating = make('div','rating-total'); rating.append(make('strong','',stats.average == null ? '—' : new Intl.NumberFormat(language(),{maximumFractionDigits:1}).format(stats.average)),make('span','',stats.average == null ? t('none') : t('outOf'))); root.append(rating);
    root.append(make('p','review-count',`${stats.total} · ${t('count')}`));
    const bars = make('div','rating-bars'); bars.setAttribute('aria-label',t('distribution'));
    for(let star=5;star>=1;star--) {const n=stats.distribution[star]||0,row=make('div','rating-bar'),track=make('div','rating-track'),fill=make('div','rating-fill');fill.style.width=`${stats.total?Math.min(100,n/stats.total*100):0}%`;track.append(fill);track.setAttribute('aria-hidden','true');row.append(make('span','',`${star} ★`),track,make('span','',n));bars.append(row);} root.append(bars);
  }
  function reviewCard(review, moderation = false) {
    const card = make('article','review-card'), head=make('div','review-card-head'), author=make('div','review-author');
    const avatar=make('span','review-avatar',[...review.name][0].toLocaleUpperCase(language())); avatar.setAttribute('aria-hidden','true');
    author.append(make('h3','',review.name)); const date=make('time','',new Intl.DateTimeFormat(language(),{day:'numeric',month:'long',year:'numeric'}).format(new Date(review.createdAt))); date.dateTime=review.createdAt; author.append(date);
    const stars=make('span','review-stars','★'.repeat(review.rating)+'☆'.repeat(5-review.rating));stars.setAttribute('role','img');stars.setAttribute('aria-label',`${review.rating} ${t('outOf')}`);
    head.append(avatar,author,stars);card.append(head,make('p','review-card-body',review.body));
    const actions=make('div','review-actions');
    if(moderation){for(const [action,key] of [['published','publish'],['hidden','hide'],['delete','delete']]){if(action===review.status)continue;const b=make('button',action==='delete'?'review-danger':'review-secondary',t(key));b.type='button';b.onclick=()=>action==='delete'?confirmDelete(review.id,b):moderate(review.id,action,b);actions.append(b);}}
    else {const b=make('button','review-helpful',`${t('helpful')} · ${review.helpful}`);b.type='button';b.onclick=async()=>{b.disabled=true;try{const data=await api(`/api/reviews/${review.id}/helpful`,{method:'POST',body:'{}'});b.textContent=`${t('voted')} · ${data.helpful}`;}catch(error){b.disabled=false;const note=card.querySelector('[role=status]')||make('p');note.setAttribute('role','status');note.textContent=t(error.message in ReviewCopy.en?error.message:'unavailable');card.append(note);}};actions.append(b);}
    card.append(actions);return card;
  }
  function pagination(data, load) {
    const root=$('reviewPagination');root.replaceChildren();if(data.pages<2)return;
    const prev=make('button','',t('prev')),next=make('button','',t('next'));
    prev.type=next.type='button';prev.disabled=page<=1;next.disabled=page>=data.pages;
    prev.onclick=()=>{page--;load(true);};next.onclick=()=>{page++;load(true);};
    root.append(prev,make('span','',`${t('page')} ${page} / ${data.pages}`),next);
  }
  function renderPublic(data){
    summary(data.summary);
    const root=$('reviewList');
    if(data.items.length)root.replaceChildren(...data.items.map(x=>reviewCard(x)));else empty(root,'empty','emptySub');
    pagination(data,loadReviews);
  }
  function renderAdmin(data){
    const root=$('adminList');
    if(data.items.length)root.replaceChildren(...data.items.map(x=>reviewCard(x,true)));else empty(root,'adminEmpty');
    pagination(data,loadAdmin);
  }
  async function loadReviews(moveFocus=false) {
    if(loadController)loadController.abort();loadController=new AbortController();const controller=loadController;
    const root=$('reviewList');root.setAttribute('aria-busy','true');
    try {const data=await api(`/api/reviews?sort=${sort}&page=${page}`,{signal:controller.signal});if(controller!==loadController)return;latestPublic=data;renderPublic(data);$('reviewForm').querySelector('button[type=submit]').disabled=!data.accepting;if(!data.accepting)inform('reviewMessage','disabled');else $('reviewMessage').textContent='';}
    catch(error){if(controller!==loadController)return;latestPublic=null;empty(root,'unavailable','',()=>loadReviews());const note=make('p','',t('unavailable'));note.dataset.r='unavailable';$('reviewSummary').replaceChildren(note);$('reviewSummary').setAttribute('aria-busy','false');}
    finally{if(controller===loadController){root.setAttribute('aria-busy','false');if(moveFocus){root.tabIndex=-1;root.focus();}}}
  }
  if(!admin) {
    $('reviewSort').onchange=event=>{sort=event.target.value;page=1;loadReviews();};
    $('reviewBody').oninput=()=>{$('review-counter').textContent=$('reviewBody').value.length+'/2000';};
    $('reviewForm').addEventListener('change',()=>{const selected=Number(new FormData($('reviewForm')).get('rating'));document.querySelectorAll('.star-option').forEach((label,i)=>label.classList.toggle('is-filled',i<selected));});
    $('reviewForm').onsubmit=async event=>{
      event.preventDefault();const form=event.currentTarget,button=form.querySelector('[type=submit]'),data=new FormData(form);
      button.disabled=true;button.textContent=t('sending');$('reviewMessage').textContent='';
      try {await api('/api/reviews',{method:'POST',body:JSON.stringify({name:data.get('name'),body:data.get('body'),rating:Number(data.get('rating')),consent:data.get('consent')==='on',website:data.get('website')})});form.reset();document.querySelectorAll('.star-option').forEach(el=>el.classList.remove('is-filled'));$('review-counter').textContent='0/2000';inform('reviewMessage','pending',true);}
      catch(error){inform('reviewMessage',error.message in ReviewCopy.en?error.message:'unavailable',true);}
      finally{button.disabled=false;button.textContent=t('submit');}
    };
    loadReviews();return;
  }
  function setAuthenticated(value){$('adminLogin').hidden=value;$('adminArea').hidden=!value;}
  async function loadAdmin(moveFocus=false){
    if(loadController)loadController.abort();loadController=new AbortController();const controller=loadController;
    const root=$('adminList');root.setAttribute('aria-busy','true');
    try{const data=await api(`/api/admin/reviews?status=${status}&page=${page}`,{signal:controller.signal});if(controller!==loadController)return;if(!data.items.length&&page>1){page--;return loadAdmin();}latestAdmin=data;renderAdmin(data);}
    catch(error){if(controller!==loadController)return;latestAdmin=null;if(error.status===401){setAuthenticated(false);inform('adminMessage','sessionExpired');}else empty(root,'unavailable','',()=>loadAdmin());}
    finally{if(controller===loadController){root.setAttribute('aria-busy','false');if(moveFocus){root.tabIndex=-1;root.focus();}}}
  }
  async function moderate(id,action,button){
    button.disabled=true;
    try{await api(`/api/admin/reviews/${id}`,{method:action==='delete'?'DELETE':'PATCH',body:action==='delete'?undefined:JSON.stringify({action})});inform('adminMessage','moderated',true);await loadAdmin();}
    catch(error){inform('adminMessage',error.message in ReviewCopy.en?error.message:'unavailable',true);if(error.status===401)setAuthenticated(false);}
    finally{button.disabled=false;}
  }
  let deleteTarget;
  function confirmDelete(id,button){deleteTarget={id,button};$('deleteDialog').showModal();$('deleteCancel').focus();}
  $('deleteCancel').onclick=()=>$('deleteDialog').close();
  $('deleteConfirm').onclick=()=>{const target=deleteTarget;$('deleteDialog').close();if(target)moderate(target.id,'delete',target.button);};
  $('adminLogin').onsubmit=async event=>{event.preventDefault();const button=event.currentTarget.querySelector('button');button.disabled=true;try{await api('/api/admin/session',{method:'POST',body:JSON.stringify({password:$('adminPassword').value})});setAuthenticated(true);$('adminMessage').textContent='';loadAdmin();}catch(error){inform('adminMessage',error.status===429?'rate':error.status===503?'unavailable':'authError',true);}finally{$('adminPassword').value='';button.disabled=false;}};
  $('adminLogout').onclick=async()=>{try{await api('/api/admin/session',{method:'DELETE'});setAuthenticated(false);$('adminList').replaceChildren();}catch{inform('adminMessage','unavailable');}};
  $('adminStatus').onchange=event=>{status=event.target.value;page=1;loadAdmin();};
  api('/api/admin/session').then(data=>{setAuthenticated(data.authenticated);if(data.authenticated)loadAdmin();}).catch(()=>inform('adminMessage','unavailable'));
})();
