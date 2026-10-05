/* ================= modules.js：户部 / 刑部 / 起居注 / 吏部 / 谏院 / 翰林院 ================= */

/* ---------- 户部：文件整理（真实文件操作，经 Rust 命令） ---------- */
registerView('hu', async function renderHu(){
  const invoke = tauriInvoke();
  const s = document.createElement('section');
  s.innerHTML = `<header><h2>户部 · 文件整理</h2><p>扫描文件夹并按「课件与文献 / 素材 / 安装包与压缩包 / 表格 / 其他」归档。<b style="color:var(--red-deep)">只移动、不删除</b>，每一步皆可在刑部回滚。</p></header>
    <div class="card">
      <h3>整理目标</h3>
      <div class="toolbar">
        <input type="text" id="folder" placeholder="文件夹绝对路径，例：C:\\Users\\你\\Downloads">
        <button class="btn small" id="scan">扫描预览</button>
        <button class="btn small" id="organize" disabled>执行整理</button>
      </div>
      <div id="result"><p class="placeholder">先扫描预览，确认分类无误后再执行整理。</p></div>
    </div>`;
  main.appendChild(s);
  const folderInput = s.querySelector('#folder');
  const result = s.querySelector('#result');
  const btnOrg = s.querySelector('#organize');
  folderInput.value = LS.get(K.hubu, '') || '';

  if(!invoke){
    result.innerHTML = '<p class="placeholder">当前以浏览器方式打开，文件操作不可用。请通过桌面应用（npm run dev / 安装包）使用户部。</p>';
    s.querySelector('#scan').disabled = true;
    return;
  }
  if(!folderInput.value){
    try{ folderInput.value = await invoke('hubu_default_folder'); }catch(e){}
  }

  s.querySelector('#scan').addEventListener('click', async ()=>{
    const folder = folderInput.value.trim();
    if(!folder){ folderInput.focus(); return; }
    LS.set(K.hubu, folder);
    result.innerHTML = '<p class="placeholder">扫描中…</p>';
    try{
      const files = await invoke('hubu_scan', {folder});
      if(!files.length){ result.innerHTML = '<p class="placeholder">该目录下没有待整理的顶层文件。</p>'; btnOrg.disabled = true; return; }
      const cats = {};
      files.forEach(f=>cats[f.category]=(cats[f.category]||0)+1);
      result.innerHTML = `
        <p style="font-size:14px;margin-bottom:12px;">共 <b style="color:var(--red-deep)">${files.length}</b> 个文件：${Object.entries(cats).map(([c,n])=>`<span class="cat">${escapeHtml(c)} × ${n}</span>`).join(' ')}</p>
        <table class="gt"><tr><th>文件名</th><th>分类</th><th style="width:90px;">大小</th></tr>
        ${files.map(f=>`<tr><td>${escapeHtml(f.name)}</td><td><span class="cat">${escapeHtml(f.category)}</span></td><td>${fmtSize(f.size)}</td></tr>`).join('')}</table>`;
      btnOrg.disabled = false;
    }catch(e){
      result.innerHTML = `<p class="placeholder" style="color:#8a3b1f;">扫描失败：${escapeHtml(String(e))}</p>`;
      btnOrg.disabled = true;
    }
  });

  btnOrg.addEventListener('click', async ()=>{
    btnOrg.disabled = true;
    result.innerHTML = '<p class="placeholder">户部正在归档…</p>';
    try{
      const records = await invoke('hubu_organize', {folder: folderInput.value.trim()});
      result.innerHTML = `<div class="route"><span>户部：已归档 <b class="arrow">${records.length}</b> 个文件，台账已移交刑部·大理寺，可逐条回滚。</span></div>
        <table class="gt"><tr><th>文件</th><th>去向</th></tr>
        ${records.map(r=>`<tr><td>${escapeHtml(r.from.split(/[\\/]/).pop())}</td><td><span class="cat">${escapeHtml(r.to.split(/[\\/]/).slice(-2).join('/'))}</span></td></tr>`).join('')}</table>`;
    }catch(e){
      result.innerHTML = `<p class="placeholder" style="color:#8a3b1f;">整理失败：${escapeHtml(String(e))}</p>`;
    }
  });
});

/* ---------- 刑部·大理寺：审计台账 + 一键回滚 ---------- */
registerView('xing', async function renderXing(){
  const invoke = tauriInvoke();
  const s = document.createElement('section');
  s.innerHTML = `<header><h2>刑部 · 大理寺 · 审计回滚</h2><p>户部每一次文件移动均在此留痕（最多 200 条），可逐条一键回滚，全程可溯。</p></header>
    <div class="card"><div id="ledger"><p class="placeholder">读取台账中…</p></div></div>`;
  main.appendChild(s);
  const box = s.querySelector('#ledger');

  if(!invoke){ box.innerHTML = '<p class="placeholder">当前以浏览器方式打开，台账不可用。请通过桌面应用使用。</p>'; return; }

  async function refresh(){
    try{
      const ledger = await invoke('xingbu_ledger');
      if(!ledger.length){ box.innerHTML = '<p class="placeholder">暂无记录。户部执行整理后，此处可见每一次移动。</p>'; return; }
      const active = ledger.filter(r=>!r.undone).length;
      box.innerHTML = `<p style="font-size:14px;margin-bottom:12px;">共 ${ledger.length} 条记录，其中 <b style="color:var(--red-deep)">${active}</b> 条可回滚。</p>
        <table class="gt"><tr><th style="width:150px;">时间</th><th>文件动向</th><th style="width:90px;">操作</th></tr>
        ${ledger.map(r=>`<tr>
          <td>${fmtStamp(r.time)}</td>
          <td>${escapeHtml(r.from.split(/[\\/]/).pop())}<span class="ledger-arrow">→</span><span class="cat">${escapeHtml(r.to.split(/[\\/]/).slice(-2).join('/'))}</span>${r.undone?'<span class="undo-ok">（已回滚）</span>':''}</td>
          <td>${r.undone?'—':`<button class="btn small secondary" data-t="${r.time}">回滚</button>`}</td>
        </tr>`).join('')}</table>`;
      box.querySelectorAll('[data-t]').forEach(b=>b.addEventListener('click', async ()=>{
        b.disabled = true; b.textContent = '回滚中…';
        try{
          await invoke('xingbu_undo', {time:+b.dataset.t});
          refresh();
        }catch(e){
          b.disabled = false; b.textContent = '回滚';
          alert('回滚失败：'+e);
        }
      }));
    }catch(e){
      box.innerHTML = `<p class="placeholder" style="color:#8a3b1f;">台账读取失败：${escapeHtml(String(e))}</p>`;
    }
  }
  refresh();
});

/* ---------- 起居注：决策记录 + 悬浮窗 ---------- */
registerView('log', function renderLog(){
  const s = document.createElement('section');
  const log = LS.get(K.log, []);
  s.innerHTML = `<header><h2>起居注 · 决策记录</h2><p>记录朕的每一次裁决，形成产品的记忆层。</p></header>
    <div class="card">
      <div class="toolbar"><button class="btn small" id="overlay">打开桌面悬浮窗</button>
      <button class="btn small" id="pet" style="background:#c9756b;">召唤桌宠 · 云绾</button>
      <button class="btn small secondary" id="clear-log">清空起居注</button></div>
      ${log.length ? log.map(e=>`
      <div class="log-item">
        <div class="t">${escapeHtml(e.time)}</div>
        <div>${escapeHtml(e.question)}</div>
        <div class="d">朱批：${escapeHtml(e.decision)}</div>
        <div class="a"><b>结论：</b>${escapeHtml(e.answer)} · 信心 ${Math.round(e.confidence*100)}%</div>
        ${e.next&&e.next.length?`<div class="muted-note">下一步：${e.next.map(escapeHtml).join('、')}</div>`:''}
      </div>`).join('') : '<p class="placeholder">尚无记录。请先到「呈奏」中完成一次辩论与裁决。</p>'}
    </div>`;
  main.appendChild(s);
  s.querySelector('#clear-log').addEventListener('click', ()=>{ localStorage.removeItem(K.log); render('log'); });
  s.querySelector('#overlay').addEventListener('click', async ()=>{
    const invoke = tauriInvoke();
    if(!invoke){ alert('悬浮窗仅桌面应用可用。'); return; }
    try{ await invoke('open_qijuzhu'); }catch(e){ alert('悬浮窗打开失败：'+e); }
  });
  s.querySelector('#pet').addEventListener('click', async ()=>{
    const invoke = tauriInvoke();
    if(!invoke){ alert('桌宠仅桌面应用可用。'); return; }
    try{ await invoke('open_pet'); }catch(e){ alert('桌宠打开失败：'+e); }
  });
});

/* ---------- 吏部：臣子绩效 ---------- */
registerView('li', function renderLi(){
  const s = document.createElement('section');
  const r = LS.get(K.ratings, {});
  const rows = Object.entries(r);
  s.innerHTML = `<header><h2>吏部 · 臣子绩效</h2><p>朱批后可对臣子考评「优 / 劣」，累计形成绩效，供调权重之参考。</p></header>
    <div class="card">
      ${rows.length ? rows.map(([role, v])=>{
        const total = v.up+v.down;
        const pct = total? Math.round(v.up/total*100) : 0;
        return `<div class="rate-row"><span class="role">${escapeHtml(role)}</span>
          <span class="bar"><i style="width:${pct}%"></i></span>
          <span style="font-size:13px;color:var(--muted);">优 ${v.up} / 劣 ${v.down} · 称职率 ${pct}%</span></div>`;
      }).join('') : '<p class="placeholder">暂无考评。请在「呈奏」完成一次辩论并朱批后，为本局臣子评分。</p>'}
      ${rows.length?'<button class="btn secondary small" id="reset-li" style="margin-top:14px;">清空绩效</button>':''}
    </div>`;
  main.appendChild(s);
  const b = s.querySelector('#reset-li');
  if(b) b.addEventListener('click', ()=>{ localStorage.removeItem(K.ratings); render('li'); });
});

/* ---------- 谏院：习惯规谏 ---------- */
registerView('jian', function renderJian(){
  const s = document.createElement('section');
  const u = LS.get(K.usage, {days:{}, advisories:[]});
  const today = new Date().toLocaleDateString('sv');
  const d = u.days[today] || {minutes:0, debates:0};
  const adv = u.advisories || [];
  s.innerHTML = `<header><h2>谏院 · 习惯规谏</h2><p>基于本地使用记录规谏熬夜、久坐、过度依赖 AI 等行为。所有数据仅存本机。</p></header>
    <div class="card">
      <div class="stat-grid">
        <div class="stat"><b>${Math.round(d.minutes)}</b><span>今日使用（分钟）</span></div>
        <div class="stat"><b>${d.debates}</b><span>今日议事（次）</span></div>
        <div class="stat"><b>${adv.length}</b><span>累计规谏（条）</span></div>
      </div>
      <h3>规谏记录</h3>
      ${adv.length ? adv.map(a=>`<div class="adv ${a.type==='熬夜'?'warn':''}"><div class="t">${escapeHtml(a.time)} · ${escapeHtml(a.type)}</div>${escapeHtml(a.text)}</div>`).join('')
        : '<p class="placeholder">陛下起居有度，暂无规谏。</p>'}
      <p class="muted-note">规谏规则：深夜（0-6 点）使用即谏；单日使用满 45 分钟谏休息；单日议事满 5 次谏勿过度依赖。</p>
    </div>`;
  main.appendChild(s);
});

/* ---------- 翰林院：知识库（归档 + 全文检索） ---------- */
registerView('han', function renderHan(){
  const s = document.createElement('section');
  s.innerHTML = `<header><h2>翰林院 · 知识库</h2><p>每一次辩论的完整记录（议题、各方立场、质询、合议、朱批）皆入档案，可全文检索。</p></header>
    <div class="card">
      <div class="search-row">
        <input type="text" id="q" placeholder="检索关键词，如：导师 / 成本 / 退守（留空列出全部）">
        <button class="btn small" id="search">检索</button>
      </div>
      <div id="arch-list"></div>
    </div>`;
  main.appendChild(s);
  const list = s.querySelector('#arch-list');
  const input = s.querySelector('#q');

  function highlight(text, kw){
    const safe = escapeHtml(text);
    if(!kw) return safe;
    return safe.replace(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), 'g'), m=>`<mark>${m}</mark>`);
  }
  function search(){
    const kw = input.value.trim();
    const arch = LS.get(K.archive, []);
    const hits = arch.filter(e=>{
      if(!kw) return true;
      const hay = [e.question, e.decision, e.record.answer,
        ...e.seats.flatMap(x=>[x.role, x.position, x.key_reason]),
        e.attack.argument, ...(e.record.next_actions||[])
      ].join('\n');
      return hay.includes(kw);
    });
    list.innerHTML = hits.length
      ? `<p class="muted-note" style="margin-bottom:12px;">检索到 ${hits.length} 条档案${kw?`（关键词「${escapeHtml(kw)}」）`:''}。</p>` +
        hits.map(e=>`<div class="arch-item">
          <div class="q">${highlight(e.question, kw)}</div>
          <div class="meta">${escapeHtml(e.time)} · 朱批：${highlight(e.decision, kw)}</div>
          <div class="ans">${highlight(e.record.answer, kw)}</div>
        </div>`).join('')
      : `<p class="placeholder">无匹配档案${kw?'，换个关键词试试':'。完成一次辩论并朱批后自动归档。'}。</p>`;
  }
  s.querySelector('#search').addEventListener('click', search);
  input.addEventListener('keydown', e=>{ if(e.key==='Enter') search(); });
  search();
});
