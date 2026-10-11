/* ================= events.js：邸报 · 拓浙活动聚合（tuotuzju.com/events） =================
 * 数据来源：Rust 侧每日 08:00 自动抓取（events.rs，绕过 WebView CORS），
 * 缓存在 app_data/events_cache.json；前端读到 localStorage(grdws_events) 后：
 *   ① 本页（邸报视图）展示汇总与列表；
 *   ② flow.js 的实时辩论把 eventsContextFor() 注入 AI Prompt（内置 AI 可读取活动数据）。
 * 存储结构：{v:1, fetchedAt, fetchedDate, count, events:[…裁剪字段], summary}
 */

/* 分类：API 原始值 → 展示名（未知值归 other，防止出现英文乱入） */
const EVENT_CATEGORIES = {
  notice: '通知', lecture: '讲座', competition: '竞赛', volunteer: '志愿',
  recruit: '招新', culture_sports: '文体', exchange: '交流', other: '其他'
};
function catLabel(c){ return EVENT_CATEGORIES[c] || EVENT_CATEGORIES.other; }

/* '2027-06-27T00:00' → Date（无法解析返回 null）。现代引擎按本地时区解析无后缀 ISO 串。 */
function parseEvtTime(s){ if(!s) return null; const t = Date.parse(s); return isNaN(t) ? null : t; }
function fmtShort(s){ return String(s||'').replace('T',' ').slice(0,16); }
function fmtDay(s){ return String(s||'').slice(0,10); }

/* ---------- 数据规整：只保留展示与 AI 注入所需字段（description 截 200 字，省存储） ---------- */
function normalizeEvent(ev){
  ev = ev || {};
  return {
    id: ev.id,
    title: String(ev.title || '').trim(),
    date: ev.date || '', end_date: ev.end_date || '', time: ev.time || '',
    location: String(ev.location || ''),
    category: Object.prototype.hasOwnProperty.call(EVENT_CATEGORIES, ev.category) ? ev.category : 'other',
    description: String(ev.description || '').trim().slice(0, 200),
    registration_deadline: ev.registration_deadline || '',
    organizer: String(ev.organizer || ''),
    tags: Array.isArray(ev.tags) ? ev.tags.slice(0, 6) : [],
    link: ev.link || ''
  };
}
function normalizeStore(raw){
  const list = (raw && Array.isArray(raw.events)) ? raw.events : [];
  const events = list.map(normalizeEvent).filter(e=>e.title);
  return {
    v: 1,
    fetchedAt: (raw && raw.fetchedAt) || null,
    fetchedDate: (raw && raw.fetchedDate) || null,
    count: events.length,
    events,
    summary: buildSummary(events)
  };
}

/* ---------- 汇总（纯函数，供视图与 AI 注入共用；有单元测试） ----------
 * byCategory：各分类条数；
 * upcoming：  未来 60 天内开始的活动 id（按开始时间升序，前 12）；
 * deadlines： 14 天内报名截止的活动 id（按截止时间升序，前 8）。 */
function buildSummary(events){
  const now = Date.now();
  const byCategory = {};
  const upcoming = [], deadlines = [];
  (events || []).forEach(e=>{
    byCategory[e.category] = (byCategory[e.category] || 0) + 1;
    const t = parseEvtTime(e.date);
    if(t !== null && t >= now - 86400000 && t <= now + 60*86400000) upcoming.push(e);
    const d = parseEvtTime(e.registration_deadline);
    if(d !== null && d >= now && d <= now + 14*86400000) deadlines.push(e);
  });
  const byTime = (k)=>(a,b)=>(parseEvtTime(a[k])||0) - (parseEvtTime(b[k])||0);
  upcoming.sort(byTime('date'));
  deadlines.sort(byTime('registration_deadline'));
  return {
    byCategory,
    upcoming: upcoming.slice(0, 12).map(e=>e.id),
    deadlines: deadlines.slice(0, 8).map(e=>e.id)
  };
}

/* ---------- AI 注入文本：把活动数据拼成背景资料块（flow.js 调用） ----------
 * 相关性：议题与活动标题/简介/地点做 3-gram 匹配，命中取前 8 条；
 * 无命中则回退「近期将开始 + 报名将截止」清单。空数据返回 ''（不注入）。 */
function eventsContextFor(question){
  const store = LS.get(K.events, null);
  if(!store || !Array.isArray(store.events) || !store.events.length) return '';
  const q = String(question || '');
  let list = null;
  if(q.length >= 3){
    const grams = new Set();
    for(let i=0; i+3<=q.length; i++) grams.add(q.slice(i, i+3));
    list = store.events.map(e=>{
      const hay = e.title + ' ' + e.description + ' ' + e.location + ' ' + e.organizer;
      let s = 0;
      grams.forEach(g=>{ if(hay.indexOf(g) >= 0) s += g.length; });
      return { e, s };
    }).filter(x=>x.s > 0).sort((a,b)=>b.s - a.s).slice(0, 8).map(x=>x.e);
  }
  if(!list || !list.length){
    const sum = store.summary || buildSummary(store.events);
    const byId = {};
    store.events.forEach(e=>{ byId[e.id] = e; });
    list = [];
    (sum.upcoming || []).slice(0, 6).forEach(id=>{ if(byId[id]) list.push(byId[id]); });
    (sum.deadlines || []).slice(0, 4).forEach(id=>{
      const e = byId[id];
      if(e && list.indexOf(e) < 0) list.push(e);
    });
  }
  if(!list.length) return '';
  const sum = store.summary || buildSummary(store.events);
  const catTxt = Object.keys(sum.byCategory).map(k=>catLabel(k)+' '+sum.byCategory[k]).join('、');
  const lines = list.map(e=>{
    const parts = [catLabel(e.category)];
    if(e.date) parts.push('时间 '+fmtShort(e.date));
    if(e.location) parts.push('地点 '+e.location);
    if(e.registration_deadline) parts.push('报名截止 '+fmtShort(e.registration_deadline));
    return '- ' + e.title + '（' + parts.join('；') + '）';
  });
  return '【校园活动背景资料】（来源：每日自动抓取的校园活动数据，抓取时间 ' + (store.fetchedAt || '未知') +
    '；当前共收录 ' + store.count + ' 条活动：' + catTxt + '）\n' +
    '以下条目供参考：若与议题相关，可在论证中引用其中的时间、地点与报名要求等信息（可注明来自活动数据）；与议题无关则忽略，不要牵强套用。\n' +
    lines.join('\n');
}

/* ---------- 取数：先读后端缓存（本地文件，快），过期/缺失/手动时再联网抓 ---------- */
function isFresh(store){
  if(!store || !store.count) return false;
  // 当天已抓 → 新鲜；跨天且距抓取超 26h → 过期（8 点后后端会自动更新）
  const t = Date.parse(String(store.fetchedAt || '').replace(' ', 'T'));
  return !isNaN(t) && (Date.now() - t) < 26 * 3600 * 1000;
}
async function syncEvents(force){
  const invoke = tauriInvoke();
  if(!invoke) return LS.get(K.events, null);   // 浏览器直接打开：只有本地缓存可用
  let raw = null;
  try{ raw = await invoke('events_get'); }catch(e){ /* 缓存读失败不致命 */ }
  let store = raw ? normalizeStore(raw) : null;
  if(force || !isFresh(store)){
    try{
      raw = await invoke('events_fetch');
      store = normalizeStore(raw);
    }catch(err){
      if(!store) throw err;                    // 既抓不到又没缓存 → 向视图抛错
    }
  }
  LS.set(K.events, store);
  return store;
}

/* ---------- 后端定时抓取完成后广播 → 刷新本地缓存；若正停在邸报页则重绘 ---------- */
(function watchEvents(){
  tauriListen('grdws-events-updated', async ()=>{
    const invoke = tauriInvoke();
    if(!invoke) return;
    try{
      const raw = await invoke('events_get');
      LS.set(K.events, normalizeStore(raw));
      const active = document.querySelector('.mod.active');
      if(active && active.dataset.view === 'events') render('events');
    }catch(e){ console.error('[events] 刷新缓存失败', e); }
  });
})();

/* ---------- 邸报视图 ---------- */
registerView('events', async function renderEvents(){
  const s = document.createElement('section');
  s.innerHTML = `<header><h2>${escapeHtml(navName('events'))}</h2>
    <p>每日 08:00 自动更新校园活动 · 抓取结果同时供${escapeHtml(navName('court'))}实时议事参考。</p></header>
    <div id="evt-body"><div class="loading-note">正在取数…</div></div>`;
  main.appendChild(s);
  const body = s.querySelector('#evt-body');

  let store;
  try{ store = await syncEvents(false); }
  catch(e){
    body.innerHTML = `<div class="card"><div class="empty">抓取失败：${escapeHtml(String(e))}<br>请检查网络后点击「立即更新」重试。</div>
      <button class="btn" id="evt-retry">立即更新</button></div>`;
    body.querySelector('#evt-retry').addEventListener('click', ()=>render('events'));
    return;
  }
  if(!store || !store.count){
    body.innerHTML = `<div class="card"><div class="empty">尚无活动数据。首次使用请点击「立即更新」抓取一次，之后每日 08:00 自动更新。</div>
      <button class="btn" id="evt-first">立即更新</button></div>`;
    body.querySelector('#evt-first').addEventListener('click', ()=>render('events'));
    return;
  }
  drawEvents(body, store);
});

/* 主体：状态行 → 汇总卡 → 筛选/搜索 → 活动列表 */
function drawEvents(body, store){
  const sum = store.summary || buildSummary(store.events);
  const now = Date.now();
  const dlCount = (store.events || []).filter(e=>{
    const d = parseEvtTime(e.registration_deadline);
    return d !== null && d >= now && d <= now + 14*86400000;
  }).length;
  const cats = Object.keys(sum.byCategory).sort((a,b)=>sum.byCategory[b]-sum.byCategory[a]);

  body.innerHTML = `
    <div class="toolbar">
      <span class="evt-status">上次更新：<b>${escapeHtml(store.fetchedAt || '未知')}</b> · 共 ${store.count} 条</span>
      <button class="btn small secondary" id="evt-refresh">立即更新</button>
      <span class="muted-note" id="evt-refresh-note" style="margin-top:0;"></span>
    </div>
    <div class="stat-grid">
      <div class="stat"><b>${store.count}</b><span>收录活动</span></div>
      <div class="stat"><b>${cats.length}</b><span>活动分类</span></div>
      <div class="stat"><b>${(sum.upcoming||[]).length}</b><span>未来 60 天将开始</span></div>
      <div class="stat"><b>${dlCount}</b><span>14 天内报名截止</span></div>
    </div>
    <div class="card">
      <h3>分类一览</h3>
      <div class="chips" id="evt-cats">
        <button class="chip on" data-c="all">全部 ${store.count}</button>
        ${cats.map(c=>`<button class="chip" data-c="${c}">${escapeHtml(catLabel(c))} ${sum.byCategory[c]}</button>`).join('')}
      </div>
      <div class="search-row" style="margin-top:12px;"><input id="evt-q" type="text" placeholder="搜索标题 / 地点 / 主办方…"></div>
    </div>
    <div class="card"><h3>活动列表 <span class="muted-note" style="display:inline;">未结束的在前面，各组按时间由近及远</span></h3>
      <div id="evt-list"></div>
      <div class="muted-note" id="evt-more"></div>
    </div>`;

  let filter = 'all', keyword = '';
  const list = body.querySelector('#evt-list');

  function visible(){
    return store.events.filter(e=>{
      if(filter !== 'all' && e.category !== filter) return false;
      if(keyword){
        const hay = (e.title + e.location + e.organizer + e.description).toLowerCase();
        if(hay.indexOf(keyword) < 0) return false;
      }
      return true;
    });
  }
  /* 未结束在前（按开始时间升序），已结束在后（最近结束的排最上） */
  function drawList(){
    const now = Date.now();
    const arr = visible();
    const open = arr.filter(e=>!evtEnded(e, now))
      .sort((a,b)=>(parseEvtTime(a.date)||Infinity) - (parseEvtTime(b.date)||Infinity));
    const endTs = e => parseEvtTime(e.end_date) || parseEvtTime(e.date) || 0;
    const done = arr.filter(e=>evtEnded(e, now)).sort((a,b)=>endTs(b) - endTs(a));
    const PAGE = 30, PAST_PAGE = 10;
    let html = open.length
      ? `<div class="evt-group">进行中 · 即将开始（${open.length}）</div>` + open.slice(0, PAGE).map(e=>evtItemHtml(e)).join('')
      : '<div class="empty">没有进行中或即将开始的活动。</div>';
    if(done.length)
      html += `<div class="evt-group past-group">已结束（${done.length}）</div>` + done.slice(0, PAST_PAGE).map(e=>evtItemHtml(e, true)).join('');
    list.innerHTML = html;
    const notes = [];
    if(open.length > PAGE) notes.push(`进行中仅显示最早 ${PAGE} 条 / 共 ${open.length} 条`);
    if(done.length > PAST_PAGE) notes.push(`已结束仅显示最近 ${PAST_PAGE} 条 / 共 ${done.length} 条`);
    body.querySelector('#evt-more').textContent = notes.length ? notes.join('；') + '，可用筛选或搜索缩小范围。' : '';
  }
  body.querySelectorAll('#evt-cats .chip').forEach(c=>c.addEventListener('click', ()=>{
    body.querySelectorAll('#evt-cats .chip').forEach(x=>x.classList.remove('on'));
    c.classList.add('on');
    filter = c.dataset.c;
    drawList();
  }));
  body.querySelector('#evt-q').addEventListener('input', e=>{
    keyword = e.target.value.trim().toLowerCase();
    drawList();
  });
  body.querySelector('#evt-refresh').addEventListener('click', async ()=>{
    const btn = body.querySelector('#evt-refresh'), note = body.querySelector('#evt-refresh-note');
    btn.disabled = true; note.textContent = '正在抓取…';
    try{
      const fresh = await syncEvents(true);
      if(fresh) render('events'); else { note.textContent = '抓取失败，请稍后再试'; btn.disabled = false; }
    }catch(e){ note.textContent = '抓取失败：' + e; btn.disabled = false; }
  });
  drawList();
}

/* 已结束判定：优先用 end_date（跨天活动更准），缺失则退回 date；无日期视为未结束 */
function evtEnded(e, now){
  now = (now === undefined) ? Date.now() : now;
  const t = parseEvtTime(e.end_date) || parseEvtTime(e.date);
  return t !== null && t < now;
}

/* 单条活动卡片（past = 已结束组内条目，降透明度） */
function evtItemHtml(e, past){
  const now = Date.now();
  const d = parseEvtTime(e.registration_deadline);
  const dlSoon = d !== null && d >= now && d <= now + 7*86400000;
  return `<div class="evt-item${past ? ' past' : ''}">
    <div class="evt-title"><span class="cat">${escapeHtml(catLabel(e.category))}</span>${escapeHtml(e.title)}</div>
    <div class="evt-meta">${e.date ? '📅 ' + escapeHtml(fmtShort(e.date)) : ''}${e.location ? ' · 📍 ' + escapeHtml(e.location) : ''}${e.organizer ? ' · 🏛 ' + escapeHtml(e.organizer) : ''}</div>
    ${e.description ? `<div class="evt-desc">${escapeHtml(e.description)}</div>` : ''}
    ${e.registration_deadline ? `<div class="evt-dl${dlSoon ? ' soon' : ''}">报名截止：${escapeHtml(fmtShort(e.registration_deadline))}${dlSoon ? ' ⚠ 将至' : ''}</div>` : ''}
  </div>`;
}
