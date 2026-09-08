(() => {
  'use strict';
  const translations = {
    ru: { home:'Главная', search:'Поиск', favorites:'Избранное', reviews:'Отзывы', support:'Помощь', menu:'Меню', close:'Закрыть', language:'Язык', light:'Включить светлую тему', dark:'Включить тёмную тему', filters:'Фильтры', apply:'Показать результаты', skip:'К содержимому', query:'Какой товар вы ищете?', city:'Город (необязательно)', min:'Цена от, €', max:'Цена до, €', share:'Поделиться', remove:'Удалить из избранного', saved:'В избранном', save:'В избранное', compare:'Сравнить', seller:'Продавец', condition:'Состояние', delivery:'Доставка', rating:'Рейтинг', price:'Цена', deal:'Оценка цены', retry:'Попробовать снова', unavailable:'Поиск временно недоступен. Повторите попытку позже.', partial:'Часть источников временно недоступна. Показаны доступные предложения.', rate:'Слишком много запросов. Подождите немного.', found:'Найдено предложений', storage:'Браузер не разрешает сохранение. Избранное доступно только до закрытия страницы.', trust:'FindBest — сервис сравнения. Мы не продаём товары; покупка происходит на сайте продавца.', example:'Пример сравнения, не актуальные предложения', simple:'Введите товар → сравните варианты → выберите подходящую цену', reviewCta:'Ваш опыт помогает сделать FindBest лучше', reviewSub:'Читайте отзывы о сервисе и делитесь впечатлениями. Только настоящие отзывы, прошедшие модерацию.', reviewOpen:'Перейти к отзывам', cancel:'Отмена' },
    uk: { home:'Головна', search:'Пошук', favorites:'Обране', reviews:'Відгуки', support:'Допомога', menu:'Меню', close:'Закрити', language:'Мова', light:'Увімкнути світлу тему', dark:'Увімкнути темну тему', filters:'Фільтри', apply:'Показати результати', skip:'До вмісту', query:'Який товар ви шукаєте?', city:'Місто (необов’язково)', min:'Ціна від, €', max:'Ціна до, €', share:'Поділитися', remove:'Видалити з обраного', saved:'В обраному', save:'До обраного', compare:'Порівняти', seller:'Продавець', condition:'Стан', delivery:'Доставка', rating:'Рейтинг', price:'Ціна', deal:'Оцінка ціни', retry:'Спробувати знову', unavailable:'Пошук тимчасово недоступний. Спробуйте пізніше.', partial:'Частина джерел тимчасово недоступна. Показано доступні пропозиції.', rate:'Забагато запитів. Зачекайте трохи.', found:'Знайдено пропозицій', storage:'Браузер не дозволяє збереження. Обране доступне лише до закриття сторінки.', trust:'FindBest — сервіс порівняння. Ми не продаємо товари; купівля відбувається на сайті продавця.', example:'Приклад порівняння, не актуальні пропозиції', simple:'Введіть товар → порівняйте варіанти → виберіть ціну', reviewCta:'Ваш досвід допомагає покращувати FindBest', reviewSub:'Читайте відгуки про сервіс і діліться враженнями. Лише справжні відгуки після модерації.', reviewOpen:'Перейти до відгуків', cancel:'Скасувати' },
    de: { home:'Start', search:'Suche', favorites:'Favoriten', reviews:'Bewertungen', support:'Hilfe', menu:'Menü', close:'Schließen', language:'Sprache', light:'Helles Design', dark:'Dunkles Design', filters:'Filter', apply:'Ergebnisse anzeigen', skip:'Zum Inhalt', query:'Welches Produkt suchen Sie?', city:'Stadt (optional)', min:'Preis ab, €', max:'Preis bis, €', share:'Teilen', remove:'Aus Favoriten entfernen', saved:'Gespeichert', save:'Speichern', compare:'Vergleichen', seller:'Händler', condition:'Zustand', delivery:'Versand', rating:'Bewertung', price:'Preis', deal:'Preisbewertung', retry:'Erneut versuchen', unavailable:'Suche vorübergehend nicht verfügbar. Bitte später erneut versuchen.', partial:'Einige Quellen sind vorübergehend nicht verfügbar. Verfügbare Angebote werden angezeigt.', rate:'Zu viele Anfragen. Bitte kurz warten.', found:'Gefundene Angebote', storage:'Speichern ist im Browser gesperrt. Favoriten bleiben nur bis zum Schließen dieser Seite erhalten.', trust:'FindBest ist ein Vergleichsdienst. Wir verkaufen keine Produkte; Sie kaufen direkt beim Händler.', example:'Vergleichsbeispiel, keine aktuellen Angebote', simple:'Produkt eingeben → Angebote vergleichen → Preis auswählen', reviewCta:'Ihre Erfahrung macht FindBest besser', reviewSub:'Lesen und teilen Sie Erfahrungen mit dem Service. Nur echte, moderierte Bewertungen.', reviewOpen:'Zu den Bewertungen', cancel:'Abbrechen' },
    en: { home:'Home', search:'Search', favorites:'Favorites', reviews:'Reviews', support:'Help', menu:'Menu', close:'Close', language:'Language', light:'Use light theme', dark:'Use dark theme', filters:'Filters', apply:'Show results', skip:'Skip to content', query:'What product are you looking for?', city:'City (optional)', min:'Minimum price, €', max:'Maximum price, €', share:'Share', remove:'Remove from favorites', saved:'Saved', save:'Save to favorites', compare:'Compare', seller:'Seller', condition:'Condition', delivery:'Shipping', rating:'Rating', price:'Price', deal:'Price assessment', retry:'Try again', unavailable:'Search temporarily unavailable. Please try again later.', partial:'Some sources are temporarily unavailable. Available offers are shown.', rate:'Too many requests. Please wait a moment.', found:'Offers found', storage:'Your browser has blocked storage. Favorites last only until this page is closed.', trust:'FindBest is a comparison service. We do not sell products; you buy directly from the seller.', example:'Illustrative comparison, not current offers', simple:'Enter a product → compare offers → choose a price', reviewCta:'Your experience helps improve FindBest', reviewSub:'Read and share your experience with the service. Only genuine, moderated reviews.', reviewOpen:'Read reviews', cancel:'Cancel' }
  };
  const language = () => ['ru','uk','de','en'].includes(document.documentElement.lang) ? document.documentElement.lang : 'ru';
  const t = key => translations[language()][key] || key;
  window.FBUI = { t, language };
  const main = document.querySelector('main');
  if (main) { main.id ||= 'main-content'; const skip = document.createElement('a'); skip.className = 'fb-skip'; skip.href = '#' + main.id; skip.dataset.ui = 'skip'; document.body.prepend(skip); }
  function node(tag, className, key) { const el = document.createElement(tag); if (className) el.className = className; if (key) el.dataset.ui = key; return el; }
  function link(href, key) { const a = node('a', '', key); a.href = href; return a; }
  function wireDialog(dialog, opener) {
    const close = () => dialog.close();
    dialog.querySelectorAll('[data-close]').forEach(button => button.onclick = close);
    dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close(); } });
    dialog.addEventListener('close', () => { document.body.classList.remove('fb-dialog-open'); opener?.focus(); });
    return () => { document.body.classList.add('fb-dialog-open'); dialog.showModal(); };
  }
  const header = document.querySelector('header .nav');
  if (header) {
    const menuButton = node('button', 'fb-menu-toggle'); menuButton.type = 'button'; menuButton.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
    menuButton.setAttribute('aria-haspopup','dialog'); header.append(menuButton);
    const dialog = node('dialog', 'fb-menu'); dialog.id = 'fb-menu'; menuButton.setAttribute('aria-controls',dialog.id);
    dialog.innerHTML = '<div class="fb-sheet-head"><h2 data-ui="menu" id="menu-title"></h2><button type="button" data-close data-ui="close"></button></div>';
    dialog.setAttribute('aria-labelledby', 'menu-title');
    const links = node('div', 'fb-menu-links');
    for (const [href,key] of [['index.html','home'],['index.html#searchForm','search'],['favorites.html','favorites'],['reviews.html','reviews'],['index.html#faq','support']]) links.append(link(href,key));
    links.querySelectorAll('a').forEach(a => a.addEventListener('click',() => dialog.close())); dialog.append(links);
    const langs = node('fieldset','fb-menu-langs'); langs.innerHTML='<legend data-ui="language"></legend>';
    for (const [code,label] of [['ru','RU'],['uk','UA'],['de','DE'],['en','EN']]) {
      const b=node('button'); b.type='button'; b.textContent=label; b.dataset.menuLang=code;
      b.onclick=()=>{ FBStorage.setItem('fb_lang',code); if (typeof setLang==='function') { setLang(code); translate(); } else location.reload(); }; langs.append(b);
    }
    dialog.append(langs); document.body.append(dialog);
    menuButton.onclick=wireDialog(dialog,menuButton);
    const nav=header.querySelector('nav'); if(nav) { const a=link('reviews.html','reviews'); a.className='fb-desktop-reviews'; nav.append(a); }
  }
  // Existing filters and listeners are moved, not rebuilt or reset.
  const filters=document.getElementById('filters'), filterButton=document.getElementById('mobileFilter');
  if(filters && filterButton) {
    const parent=filters.parentNode, next=filters.nextSibling, sheet=node('dialog','fb-filter-sheet');
    sheet.innerHTML='<div class="fb-sheet-head"><h2 id="filter-title" data-ui="filters"></h2><button type="button" data-close data-ui="close"></button></div><div class="fb-sheet-content"></div><div class="fb-sheet-foot"><button class="btn" type="button" data-close data-ui="apply"></button></div>';
    sheet.setAttribute('aria-labelledby','filter-title'); document.body.append(sheet);
    const open=wireDialog(sheet,filterButton); filterButton.onclick=open;
    filterButton.setAttribute('aria-haspopup','dialog');
    const media=matchMedia('(max-width:980px)');
    const place=()=>{ if(media.matches) sheet.querySelector('.fb-sheet-content').append(filters); else { sheet.close(); parent.insertBefore(filters,next); } }; place(); media.addEventListener('change',place);
  }
  // Keep existing comparison and alert modal markup/logic; add keyboard/focus behavior.
  document.querySelectorAll('.modal-backdrop').forEach(modal=>{
    modal.setAttribute('role','dialog'); modal.setAttribute('aria-modal','true'); modal.tabIndex=-1;
    const heading=modal.querySelector('h2,h3'); if(heading){ heading.id ||= modal.id+'-title'; modal.setAttribute('aria-labelledby',heading.id); }
    let returnFocus=null;
    const update=()=>{ const shown=modal.classList.contains('show'); if(shown){returnFocus=document.activeElement; document.body.classList.add('fb-dialog-open'); (modal.querySelector('button,input')||modal).focus();}else{document.body.classList.remove('fb-dialog-open'); if(returnFocus?.isConnected)returnFocus.focus();} };
    new MutationObserver(update).observe(modal,{attributes:true,attributeFilter:['class']});
    modal.addEventListener('keydown',event=>{
      if(event.key==='Escape')modal.classList.remove('show');
      if(event.key!=='Tab')return;
      const all=[...modal.querySelectorAll('button,a[href],input,select,textarea,[tabindex="0"]')].filter(e=>!e.disabled&&e.getClientRects().length);
      if(!all.length){event.preventDefault();return;}
      if(event.shiftKey && document.activeElement===all[0]){event.preventDefault();all.at(-1).focus();}
      else if(!event.shiftKey && document.activeElement===all.at(-1)){event.preventDefault();all[0].focus();}
    });
  });
  const dock=document.querySelector('.mobile-dock')||node('div','mobile-dock'); dock.setAttribute('role','navigation');
  dock.replaceChildren();
  for(const [href,key,icon] of [['index.html','home','⌂'],['index.html#searchForm','search','⌕'],['favorites.html','favorites','♡'],['reviews.html','reviews','☆']]) {
    const a=link(href,key); a.dataset.icon=icon;
    if(location.pathname.endsWith(href)||(href==='index.html'&&location.pathname==='/'))a.setAttribute('aria-current','page'); dock.append(a);
  }
  if(!dock.isConnected)document.body.append(dock);
  const trust=node('p','fb-trust','trust'); (document.querySelector('footer .container')||main||document.body).append(trust);
  if(document.getElementById('searchForm')) {
    const visual=document.querySelector('.visual'); if(visual){ const caption=node('p','fb-example','example'); visual.append(caption); }
    const block=node('section','fb-review-invite container'); block.innerHTML='<div><h2 data-ui="reviewCta"></h2><p data-ui="reviewSub"></p></div><a class="btn" href="reviews.html" data-ui="reviewOpen"></a>';
    main?.append(block);
    const hint=node('p','fb-mobile-explainer','simple'); document.getElementById('searchForm').before(hint);
  }
  const storageNotice=node('p','fb-storage-notice','storage'); storageNotice.hidden=true; storageNotice.setAttribute('role','status'); main?.append(storageNotice);
  const showStorage=()=>{storageNotice.hidden=false;}; window.addEventListener('fb-storage-unavailable',showStorage); if(!FBStorage.available)showStorage();
  function enhance(root=document) {
    root.querySelectorAll('a[target="_blank"]').forEach(a=>a.rel='noopener noreferrer');
    root.querySelectorAll('.item img,.recent-card img').forEach(img=>{img.loading='lazy';img.decoding='async';if(!img.dataset.fallback){img.dataset.fallback='true';img.addEventListener('error',()=>{img.hidden=true;},{once:true});if(img.complete&&!img.naturalWidth)img.hidden=true;}});
    root.querySelectorAll('[data-fav]').forEach(b=>{b.setAttribute('aria-label',t(b.classList.contains('saved')?'remove':'save'));b.setAttribute('aria-pressed',String(b.classList.contains('saved')));});
    root.querySelectorAll('[data-remove]').forEach(b=>b.setAttribute('aria-label',t('remove')));
    root.querySelectorAll('[data-share]').forEach(b=>b.setAttribute('aria-label',t('share')));
  }
  function translate() {
    document.querySelectorAll('[data-ui]').forEach(el=>el.textContent=t(el.dataset.ui));
    document.querySelectorAll('[data-menu-lang]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.menuLang===language())));
    document.querySelector('.fb-menu-toggle')?.setAttribute('aria-label',t('menu'));
    const theme=document.getElementById('themeToggle')||document.getElementById('theme');
    theme?.setAttribute('aria-label',t(document.documentElement.dataset.theme==='dark'?'light':'dark'));
    if(theme)theme.title=theme.getAttribute('aria-label');
    document.querySelectorAll('.modal-close').forEach(b=>b.setAttribute('aria-label',t('close')));
    document.getElementById('sort')?.setAttribute('aria-label',({ru:'Сортировка',uk:'Сортування',de:'Sortierung',en:'Sort order'})[language()]);
    for(const [id,key] of [['q','query'],['search','query'],['citySearch','city'],['filterCity','city'],['minPrice','min'],['maxPrice','max']]) {
      const field=document.getElementById(id); if(field){field.setAttribute('aria-label',t(key)); if(['q','search'].includes(id)){field.maxLength=120;field.minLength=2;field.required=true;field.enterKeyHint='search';} }
    }
    enhance(); window.dispatchEvent(new Event('fb-language-change'));
  }
  const narrowSearch=matchMedia('(max-width:650px)');
  function searchPlaceholder(){const q=document.getElementById('q');if(q){q.dataset.fullPlaceholder||=q.placeholder;q.placeholder=narrowSearch.matches?({ru:'iPhone 15 до 500 €',uk:'iPhone 15 до 500 €',de:'iPhone 15 bis 500 €',en:'iPhone 15 under €500'}[language()]):q.dataset.fullPlaceholder;}}
  narrowSearch.addEventListener('change',searchPlaceholder);window.addEventListener('fb-language-change',searchPlaceholder);
  document.querySelectorAll('a[href="#request"]').forEach(a=>a.href='#searchForm');
  new MutationObserver(translate).observe(document.documentElement,{attributes:true,attributeFilter:['lang','data-theme']});
  ['results','content','recentList'].forEach(id=>{const el=document.getElementById(id);if(el)new MutationObserver(()=>enhance(el)).observe(el,{childList:true,subtree:true});});
  document.querySelectorAll('.faq-question').forEach(b=>{const a=b.closest('.faq-item')?.querySelector('.faq-answer');if(a){a.id||='faq-'+Math.random().toString(36).slice(2,9);b.setAttribute('aria-controls',a.id);b.setAttribute('aria-expanded','false');b.addEventListener('click',()=>document.querySelectorAll('.faq-question').forEach(q=>q.setAttribute('aria-expanded',String(q.closest('.faq-item').classList.contains('active')))));}});
  document.addEventListener('focusin',e=>{if(e.target.matches('input:not([type=checkbox]):not([type=radio]),textarea,select'))document.body.classList.add('fb-editing');});
  document.addEventListener('focusout',()=>setTimeout(()=>{if(!document.activeElement.matches('input,textarea,select'))document.body.classList.remove('fb-editing');},0));
  if(document.body.dataset.page) {
    const theme=document.getElementById('themeToggle'); if(theme)theme.onclick=()=>{const next=document.documentElement.dataset.theme==='dark'?'light':'dark'; document.documentElement.dataset.theme=next;FBStorage.setItem('fb_theme',next);};
  }
  translate();
})();
