(() => {
  'use strict';
  const catalog = window.FILM_CATALOG || { items: [], updatedAt: '2026-11-17' };
  const items = catalog.items;
  const byId = new Map(items.map(item => [item.id, item]));
  const KEY = 'jinwan-watchlist-v1';
  const validStatuses = new Set(['none', 'wish', 'seen', 'hidden']);
  const state = { view: 'discover', mood: 'all', category: 'all', genre: 'all', era: 'all', sort: 'recommended', search: '', limit: 16 };
  let preferences = {};
  let storageAvailable = true;
  let toastTimer;
  let activeFilm = null;
  let lastFocused = null;
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const safeUrl = value => { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : ''; } catch { return ''; } };
  const bookmarkIcon = filled => `<svg viewBox="0 0 18 22" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3 2h12v18l-6-4-6 4z" stroke-linejoin="round"/></svg>`;
  const getStatus = item => preferences[item.id]?.status || (item.seen ? 'seen' : 'none');
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || '{}');
    if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
      for (const [id, value] of Object.entries(stored)) if (byId.has(id) && value && validStatuses.has(value.status)) preferences[id] = value;
    }
  } catch { storageAvailable = false; }

  function notify(message, undo) {
    const toast = $('#toast');
    clearTimeout(toastTimer);
    toast.textContent = message;
    if (undo) {
      const button = document.createElement('button');
      button.textContent = '撤销';
      button.addEventListener('click', () => { undo(); toast.hidden = true; });
      toast.append(button);
    }
    toast.hidden = false;
    toastTimer = setTimeout(() => { toast.hidden = true; }, undo ? 7000 : 3600);
  }
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(preferences)); }
    catch { storageAvailable = false; notify('浏览器未允许保存，当前记录仅在本次打开期间保留。'); }
  }
  function setStatus(id, status) {
    const item = byId.get(id);
    if (!item) return;
    const previous = getStatus(item);
    preferences[id] = { status, updatedAt: new Date().toISOString() };
    persist();
    render();
    if (activeFilm === id && $('#detail-dialog').open) renderDetail(item);
    const labels = { wish: '已放进「我的想看」', seen: '已记为看过', hidden: '已收进「暂不想看」', none: '已放回待选片单' };
    notify(labels[status], () => { preferences[id] = { status: previous, updatedAt: new Date().toISOString() }; persist(); render(); if (activeFilm === id && $('#detail-dialog').open) renderDetail(item); });
  }
  function fallback(item) {
    return `<div class="poster-fallback" aria-hidden="true"><span class="fallback-mark">${item.type === '纪录片' ? '文' : '映'}</span><strong>${escape(item.title)}</strong><small>${escape(item.originalTitle || 'A GOOD STORY AWAITS')}</small></div>`;
  }
  function poster(item, lazy = true) {
    return `${fallback(item)}${item.poster ? `<img src="${escape(item.poster)}" alt="${escape(item.title)}海报" ${lazy ? 'loading="lazy"' : 'fetchpriority="high"'} decoding="async">` : ''}`;
  }
  function wireImageFallbacks(container) {
    container.querySelectorAll('img').forEach(img => img.addEventListener('error', () => { img.hidden = true; }, { once: true }));
  }
  function filteredItems() {
    const query = state.search.trim().toLocaleLowerCase();
    return items.filter(item => {
      const status = getStatus(item);
      if (state.view === 'discover' ? ['seen', 'hidden'].includes(status) : status !== state.view) return false;
      if (state.category !== 'all') {
        if (['电影', '纪录片'].includes(state.category)) { if (item.type !== state.category) return false; }
        else if (item.type !== '剧集' || !item.regions.includes(state.category)) return false;
      }
      if (state.mood !== 'all' && !item.moods.includes(state.mood)) return false;
      if (state.genre !== 'all' && !item.genres.includes(state.genre)) return false;
      if (state.era === 'classic' && item.year >= 1990) return false;
      if (['1990', '2000'].includes(state.era) && item.year < Number(state.era)) return false;
      if (query && ![item.title, item.originalTitle, ...item.cast, ...item.genres, ...item.regions, item.year].join(' ').toLocaleLowerCase().includes(query)) return false;
      return true;
    }).sort((a, b) => {
      if (state.sort === 'newest') return b.year - a.year || b.rank - a.rank;
      if (state.sort === 'oldest') return a.year - b.year || b.rank - a.rank;
      if (state.sort === 'title') return a.title.localeCompare(b.title, 'zh-CN');
      return b.rank - a.rank || b.year - a.year;
    });
  }
  function card(item) {
    const status = getStatus(item);
    const saved = status === 'wish';
    const badgeClass = item.tier === '经典补课' ? 'classic' : item.tier === '换个口味' ? 'explore' : '';
    const showBadge = ['优先推荐', '经典补课', '换个口味'].includes(item.tier);
    return `<article class="film-card" data-film-id="${escape(item.id)}">
      <button class="poster-button" data-open="${escape(item.id)}" aria-label="查看${escape(item.title)}详情">${poster(item)}${showBadge ? `<span class="poster-badge ${badgeClass}">${escape(item.tier === '优先推荐' ? '为你先选' : item.tier)}</span>` : ''}${status === 'seen' ? '<span class="seen-label">✓ 已看过</span>' : ''}</button>
      <button class="save-button ${saved ? 'saved' : ''}" data-save="${escape(item.id)}" aria-label="${saved ? '取消想看' : '加入想看'}：${escape(item.title)}" aria-pressed="${saved}">${bookmarkIcon(saved)}</button>
      <div class="card-body"><div class="card-metadata"><span>${escape(item.regions.join(' / '))}</span><i class="separator" aria-hidden="true"></i><span>${item.year || '—'}</span><i class="separator" aria-hidden="true"></i><span>${escape(item.type)}</span></div>
      <h3 class="card-title"><button data-open="${escape(item.id)}">${escape(item.title)}</button></h3><p class="card-original" lang="en">${escape(item.originalTitle || ' ')}</p>
      <p class="card-reason">${escape(item.why)}</p><div class="card-bottom"><div class="card-tags">${item.genres.slice(0, 2).map(tag => `<span class="card-tag">${escape(tag)}</span>`).join('')}</div><button class="card-arrow" data-open="${escape(item.id)}" aria-label="了解${escape(item.title)}">↗</button></div></div></article>`;
  }
  function hasFilters() { return state.mood !== 'all' || state.category !== 'all' || state.genre !== 'all' || state.era !== 'all' || !!state.search.trim(); }
  function render() {
    const result = filteredItems();
    const visible = result.slice(0, state.limit);
    const grid = $('#film-grid');
    grid.innerHTML = visible.map(card).join('');
    wireImageFallbacks(grid);
    const viewInfo = {
      discover: ['先从喜欢的开始', '熟悉的口味里，也藏一点新鲜感。'],
      wish: ['留给下一个晚上', '想看的，都好好放在这里。'],
      seen: ['这些故事，已经见过', '留住看过的，也给新故事腾个位置。'],
      hidden: ['暂时不合口味', '随时可以点开，把它放回片单。']
    }[state.view];
    $('#library-title').textContent = viewInfo[0];
    $('#library-intro').textContent = viewInfo[1];
    $('#results-count').innerHTML = `共 <strong>${result.length}</strong> 部${hasFilters() ? '符合条件的作品' : state.view === 'discover' ? '，从更合口味的开始' : '作品'}`;
    $('#results-note').textContent = state.view === 'discover' ? '已看过的作品收在「已看过」里' : '你的记录，只保存在当前浏览器';
    $('#wish-count').textContent = items.filter(item => getStatus(item) === 'wish').length;
    $('#reset-filters').hidden = !hasFilters();
    $('#clear-search').hidden = !state.search;
    $('#load-more').hidden = result.length <= visible.length;
    $('#load-progress').textContent = result.length ? `已展示 ${visible.length} / ${result.length} 部` : '';
    $('#empty-state').hidden = result.length > 0;
    if (!result.length) {
      $('#empty-title').textContent = hasFilters() ? '暂时没有找到这一类' : state.view === 'wish' ? '把第一部想看的，放进来吧' : state.view === 'seen' ? '看完的故事，会留在这里' : state.view === 'hidden' ? '这里暂时是空的' : '这一轮都看完啦';
      $('#empty-message').textContent = hasFilters() ? '可以试着减少几个筛选条件，或换一个片名。' : state.view === 'wish' ? '在海报右上角点一下书签，下次就不用重新找。' : '回到发现片单，继续找一个好故事。';
      $('#empty-action').textContent = hasFilters() ? '清除筛选' : '去发现片单';
    }
    $$('[data-view]').forEach(button => { const selected = button.dataset.view === state.view; button.classList.toggle('active', selected); button.setAttribute('aria-pressed', selected); });
    $$('[data-mood]').forEach(button => { const selected = button.dataset.mood === state.mood; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', selected); });
    $$('[data-category]').forEach(button => { const selected = button.dataset.category === state.category; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', selected); });
  }
  function resetFilters() {
    Object.assign(state, { mood: 'all', category: 'all', genre: 'all', era: 'all', search: '', limit: 16 });
    $('#search').value = '';
    $('#genre-filter').value = 'all';
    $('#era-filter').value = 'all';
    render();
  }
  function changeView(view) {
    state.view = view;
    resetFilters();
    $('#library').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function showDialog(dialog) {
    lastFocused = document.activeElement;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
  }
  function closeDialog(dialog) { dialog.close(); }
  function externalLink(label, url, primary = false) {
    const valid = safeUrl(url);
    return valid ? `<a class="external-link${primary ? ' primary' : ''}" href="${escape(valid)}" target="_blank" rel="noopener noreferrer">${escape(label)} <span aria-hidden="true">↗</span></a>` : '';
  }
  function renderDetail(item) {
    const focusedAction = document.activeElement?.dataset?.status;
    const status = getStatus(item);
    const query = encodeURIComponent(`${item.title} ${item.originalTitle || ''}`.trim());
    const douban = safeUrl(item.doubanUrl) || `https://www.douban.com/search?cat=1002&q=${query}`;
    const watching = (item.watch || []).filter(source => safeUrl(source.url));
    const detail = $('#detail-content');
    detail.innerHTML = `<div class="detail-layout"><aside class="detail-aside"><div class="detail-poster">${poster(item, false)}</div><p class="length-label">${escape(item.lengthLabel || '时长请查看作品资料')}</p><div class="status-actions"><button data-status="wish" data-id="${escape(item.id)}" aria-pressed="${status === 'wish'}">${status === 'wish' ? '✓ 已加入想看' : '＋ 加入我的想看'}</button><button data-status="seen" data-id="${escape(item.id)}" aria-pressed="${status === 'seen'}">${status === 'seen' ? '✓ 已经看过' : '标记为已看过'}</button><button class="hide-item" data-status="hidden" data-id="${escape(item.id)}" aria-pressed="${status === 'hidden'}">${status === 'hidden' ? '放回待选片单' : '暂时不想看这部'}</button></div></aside>
    <div class="detail-main"><p class="eyebrow">${escape(item.seen ? '你看过的故事' : item.tier)}</p><h2 id="detail-title">${escape(item.title)}</h2><p class="detail-original">${escape(item.originalTitle)}</p><div class="detail-facts"><span>${item.year || '年份待核实'}</span><span>${escape(item.regions.join(' / '))}</span><span>${escape(item.type)}</span>${item.genres.map(tag => `<span>${escape(tag)}</span>`).join('')}${item.blackAndWhite ? '<span>黑白影片</span>' : ''}</div>${item.cast.length ? `<p class="cast-line">${item.type === '纪录片' ? '出镜 / 配音' : '主演'} · ${escape(item.cast.join(' / '))}</p>` : '<div style="height:20px"></div>'}
    <section class="reason-box"><h3>${item.seen ? '留作口味参考' : '为什么选它'}</h3><p>${escape(item.why)}</p></section>
    <section class="detail-section"><h3>故事从这里开始</h3><p>${escape(item.synopsis)}</p></section>
    <section class="detail-section caution-section"><h3>观看前，了解一点</h3><p>${escape(item.caution)}</p><p class="safety-line">${escape(item.safety?.note || '尚未逐集核查蛇、鳄鱼等镜头。')}</p></section>
    <section class="detail-section"><h3>去哪里了解 / 观看</h3>${watching.length ? watching.map(w => `<div class="watch-provider"><a href="${escape(safeUrl(w.url))}" target="_blank" rel="noopener noreferrer">${escape(w.platform)} · ${escape(w.kind || '官方片页')} ↗</a><small>${escape(w.note || '登录、付费及可播情况以平台为准。')} · 核实于 ${escape(w.checkedAt || catalog.updatedAt)}</small></div>`).join('') : '<p class="watch-empty">暂未核实国内正片入口。可以先搜片名，搜索结果不代表平台已有正版正片。</p>'}<div class="external-links">${externalLink(item.doubanUrl ? '豆瓣作品资料' : '去豆瓣搜这部', douban, true)}${externalLink('在 B 站搜索', `https://search.bilibili.com/all?keyword=${encodeURIComponent(item.title)}`)}${externalLink('在优酷搜索', `https://so.youku.com/search_video/q_${encodeURIComponent(item.title)}`)}</div></section>
    <details class="source-details"><summary>资料出处与核实说明</summary>${(item.sources || []).map(source => safeUrl(source.url) ? `<a href="${escape(safeUrl(source.url))}" target="_blank" rel="noopener noreferrer">${escape(source.label)} ↗</a>` : `<p>${escape(source.label)}</p>`).join('')}<p>推荐理由是基于口味的判断，不代表一定喜欢。资料页面不等同于当前所在地可播放。海报版权归原权利方。</p>${item.posterSource ? `<a href="${escape(safeUrl(item.posterSource))}" target="_blank" rel="noopener noreferrer">海报来源 ↗</a>` : ''}</details></div></div>`;
    wireImageFallbacks(detail);
    if (focusedAction) detail.querySelector(`[data-status="${focusedAction}"]`)?.focus({ preventScroll: true });
  }
  function openFilm(id, updateHash = true) {
    const item = byId.get(id);
    if (!item) return;
    activeFilm = id;
    renderDetail(item);
    if (!$('#detail-dialog').open) showDialog($('#detail-dialog'));
    if (updateHash) history.replaceState(null, '', `#film=${encodeURIComponent(id)}`);
  }
  function renderHero() {
    const picks = (catalog.heroIds || []).map(id => byId.get(id)).filter(Boolean);
    if (picks.length < 3) for (const item of [...items].filter(i => !i.seen && i.poster).sort((a, b) => b.rank - a.rank)) { if (!picks.includes(item)) picks.push(item); if (picks.length === 3) break; }
    $('#hero-posters').innerHTML = picks.slice(0, 3).map(item => `<button class="hero-poster" data-open="${escape(item.id)}" aria-label="了解${escape(item.title)}">${poster(item, false)}<span class="hero-poster-label">${escape(item.title)}</span></button>`).join('') + '<div class="hero-sticker"><span aria-hidden="true">✦</span> 好看的，替你留着。</div>';
    wireImageFallbacks($('#hero-posters'));
    $('#catalog-count').textContent = items.filter(item => !item.seen).length;
  }
  document.addEventListener('click', event => {
    const target = event.target.closest('button, a');
    if (!target) return;
    if (target.dataset.open) openFilm(target.dataset.open);
    if (target.dataset.save) { const item = byId.get(target.dataset.save); if (item) setStatus(item.id, getStatus(item) === 'wish' ? 'none' : 'wish'); }
    if (target.dataset.status) { const item = byId.get(target.dataset.id); if (item) setStatus(item.id, getStatus(item) === target.dataset.status ? 'none' : target.dataset.status); }
    if (target.dataset.view) changeView(target.dataset.view);
    if (target.dataset.goWish !== undefined) changeView('wish');
    if (target.dataset.mood) { state.mood = target.dataset.mood; state.limit = 16; render(); }
    if (target.dataset.category) { state.category = target.dataset.category; state.limit = 16; render(); }
    if (target.dataset.close) closeDialog(document.getElementById(target.dataset.close));
  });
  $('.brand').addEventListener('click', event => { event.preventDefault(); state.view = 'discover'; resetFilters(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  $('#search').addEventListener('input', event => { state.search = event.target.value; state.limit = 16; render(); });
  $('#clear-search').addEventListener('click', () => { state.search = ''; $('#search').value = ''; state.limit = 16; render(); $('#search').focus(); });
  for (const [id, property] of [['genre-filter', 'genre'], ['era-filter', 'era'], ['sort', 'sort']]) $( `#${id}`).addEventListener('change', event => { state[property] = event.target.value; state.limit = 16; render(); });
  $('#reset-filters').addEventListener('click', resetFilters);
  $('#empty-action').addEventListener('click', () => hasFilters() ? resetFilters() : changeView('discover'));
  $('#load-more').addEventListener('click', () => { const count = document.querySelectorAll('.film-card').length; state.limit += 16; render(); const next = document.querySelectorAll('.film-card')[count]?.querySelector('button'); next?.focus({ preventScroll: true }); });
  $('#surprise-button').addEventListener('click', () => {
    const candidates = items.filter(item => !['seen', 'hidden'].includes(getStatus(item)) && item.tier === '优先推荐' && item.rank >= 80);
    if (!candidates.length) { notify('优先推荐已经看完了，去片库里换个口味吧。'); return; }
    openFilm(candidates[Math.floor(Math.random() * candidates.length)].id);
  });
  $('#settings-button').addEventListener('click', () => showDialog($('#settings-dialog')));
  $('#hidden-button').addEventListener('click', () => { closeDialog($('#settings-dialog')); changeView('hidden'); });
  $('#back-top').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  $$('dialog').forEach(dialog => {
    dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) closeDialog(dialog); } });
    dialog.addEventListener('close', () => { document.body.style.overflow = ''; const previousFilm = activeFilm; if (dialog.id === 'detail-dialog') { activeFilm = null; if (location.hash.startsWith('#film=')) history.replaceState(null, '', location.pathname + location.search + '#library'); } if (lastFocused?.isConnected) lastFocused.focus({ preventScroll: true }); else (document.querySelector(`[data-open="${previousFilm}"]`) || document.querySelector('.nav-button.active'))?.focus({ preventScroll: true }); });
  });
  $('#export-button').addEventListener('click', () => {
    const content = { app: 'jinwan-watchlist', version: 1, exportedAt: new Date().toISOString(), records: preferences };
    const url = URL.createObjectURL(new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `今晚的片单-${new Date().toISOString().slice(0, 10)}.json`; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
    notify('记录已导出，换设备时可以在这里导入。');
  });
  $('#import-file').addEventListener('change', async event => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > 1024 * 1024) throw new Error('文件过大');
      const imported = JSON.parse(await file.text());
      if (imported.app !== 'jinwan-watchlist' || imported.version !== 1 || !imported.records || typeof imported.records !== 'object' || Array.isArray(imported.records)) throw new Error('格式不正确');
      let count = 0;
      for (const [id, value] of Object.entries(imported.records)) if (byId.has(id) && value && validStatuses.has(value.status)) { preferences[id] = { status: value.status, updatedAt: new Date().toISOString() }; count++; }
      persist(); render(); notify(`已合并 ${count} 部作品的记录。`);
    } catch { notify('这份文件无法导入，请选择本站导出的 JSON 记录。'); }
    event.target.value = '';
  });
  window.addEventListener('storage', event => {
    if (event.key !== KEY) return;
    try { const raw = JSON.parse(event.newValue || '{}'); if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return; const cleaned = {}; for (const [id, value] of Object.entries(raw)) if (byId.has(id) && value && validStatuses.has(value.status)) cleaned[id] = value; preferences = cleaned; render(); if (activeFilm) renderDetail(byId.get(activeFilm)); } catch { /* Keep current records when another tab writes invalid JSON. */ }
  });
  window.addEventListener('hashchange', () => { if (location.hash.startsWith('#film=')) openFilm(decodeURIComponent(location.hash.slice(6)), false); });
  $('#updated-date').textContent = catalog.updatedAt.replaceAll('-', '.');
  renderHero(); render();
  if (location.hash.startsWith('#film=')) { try { openFilm(decodeURIComponent(location.hash.slice(6)), false); } catch { /* Invalid shared fragment. */ } }
  if (!storageAvailable) { const warning = document.createElement('p'); warning.className = 'storage-warning'; warning.textContent = '浏览器未允许读取记录。仍可浏览片单，新记录可能只保留在本次打开期间。'; document.body.prepend(warning); }
})();
