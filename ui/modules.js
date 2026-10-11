/* ================= modules.js：户部 / 刑部 / 起居注 / 吏部 / 谏院 / 翰林院 / 人格 / 画像 ================= */

/* ---------- 人格 · 朝廷：选择角色人格与视觉主题 ---------- */
registerView('persona', function renderPersona(){
  const s = document.createElement('section');
  const cur = readPersonaId();
  s.innerHTML = `<header><h2>人格 · 朝廷</h2><p>选择 AI 与你相处的身份。人格会同时改变称谓、模块名称、提示文案、AI 语气与整体配色 —— 但不会改变事实、计算结果与安全规则。</p></header>
    <div class="p-grid">
      ${PERSONA_ORDER.map(id=>{
        const p = PERSONAS[id];
        return `<div class="p-card ${id===cur?'active':''}" data-p="${id}" style="--pc:${p.visualTheme['--red']}">
          <div class="p-icon">${p.icon}</div>
          <div class="p-name">${escapeHtml(p.name)}</div>
          <div class="p-tag">${escapeHtml(p.tagline)}</div>
          <div class="p-intro">${escapeHtml(p.intro)}</div>
          <div class="p-kw">${p.keywords.map(k=>`<span>${escapeHtml(k)}</span>`).join('')}</div>
          <div class="p-sample">“${escapeHtml(p.sample)}”</div>
          <div class="p-state"><span>称谓：称你「${escapeHtml(p.userTitle)}」· 自称「${escapeHtml(p.aiTitle)}」</span>
            <span class="badge">${id===cur?'已启用 ✓':'点击启用'}</span></div>
        </div>`;
      }).join('')}
    </div>
    <div class="card">
      <h3>人格如何影响 AI</h3>
      <p class="p-note">当前人格 <b>${escapeHtml(P().name)}</b> 已注入 AI 系统 Prompt：</p>
      <pre style="white-space:pre-wrap;font-family:inherit;font-size:13px;line-height:1.9;color:var(--ink);background:var(--panel-2);border:1px solid var(--line);border-radius:8px;padding:14px 16px;margin-top:10px;">${escapeHtml(P().promptStyle)}</pre>
      <p class="p-note" style="margin-top:14px;">
        人格只改变<b>表达方式、称谓、视觉与交互风格</b>；不改变<b>事实、计算结果、安全规则、权限规则</b>。选择结果保存在本机，重启软件后保持。
      </p>
    </div>`;
  main.appendChild(s);
  s.querySelectorAll('.p-card').forEach(card=>{
    card.addEventListener('click', ()=>{
      const id = card.dataset.p;
      if(id === readPersonaId()) return;
      switchPersona(id);                 // 立即生效：配色 + 称谓 + 模块名 + Prompt + 画像文案
      card.classList.add('just');
    });
  });
});

/* ---------- 我的画像 · 行为观测（谏院） ---------- */
registerView('profile', function renderProfile(){
  const s = document.createElement('section');
  let range = LS.get('grdws_prof_range', 30);
  s.innerHTML = `<header><div class="prof-head">
      <div><h2>${escapeHtml(vocab().insightTitle)}</h2><p>近 ${range} 日 · 仅统计本机真实记录的行为数据，不做任何心理或人格推断。</p></div>
      <div class="prof-range"><button data-r="7">近 7 天</button><button data-r="30">近 30 天</button></div>
    </div></header>
    <div id="prof-body"></div>`;
  main.appendChild(s);
  const body = s.querySelector('#prof-body');
  s.querySelectorAll('.prof-range button').forEach(b=>{
    b.classList.toggle('on', +b.dataset.r===range);
    b.addEventListener('click', ()=>{ LS.set('grdws_prof_range', +b.dataset.r); render('profile'); });
  });
  drawProfile(body, range);
});

/* 画像主体：指标卡 → 依据 → 热力图 → 24h 分布 → 结论 → 谏院建议 → 任务闭环 */
function drawProfile(box, range){
  const prof = analyzeBehavior(range);
  const v = vocab();
  const adv = buildAdvice(prof);

  if(!prof.hasData){
    box.innerHTML = `<div class="card"><div class="empty">尚未记录到足够的行为数据。<br>
      正常使用本软件（<b>${escapeHtml(navName('court'))}议事</b>、<b>${escapeHtml(navName('hubu'))}整理</b>、<b>${escapeHtml(vocab().decision)}</b>）后，此处会自动生成画像。<br>
      <span style="font-size:12.5px;">所有数据只保存在本机，不会上传。</span></div></div>`;
    return;
  }

  /* ---- 指标卡（点击展开计算依据） ---- */
  const TREND_TXT = { up:'↑ 上升', down:'↓ 下降', stable:'→ 稳定' };
  const cards = prof.metrics.map((m,i)=>{
    const tr = prof.trends[m.key];
    const d = prof.deltas[m.key];
    let val;
    if(m.value===null || m.value===undefined) val = '<span style="font-size:15px;color:var(--muted);">暂无数据</span>';
    else val = `<span data-count="${m.value}">0</span>${m.unit?`<small>${m.unit}</small>`:''}`;
    let trendHtml = '';
    if(m.key!=='procrastination' && m.key!=='night' && m.key!=='organization' && m.key!=='aiUsage' || (m.key==='procrastination'&&d!==null) || (m.key==='night'&&d!==null)){
      if(tr && tr!=='stable' && d!==null && d!==undefined)
        trendHtml = `<div class="m-trend ${tr}">${TREND_TXT[tr]} ${Math.abs(d)}${m.unit||''}</div>`;
      else if(m.value!==null && m.value!==undefined)
        trendHtml = `<div class="m-trend">${TREND_TXT[tr]||TREND_TXT.stable}</div>`;
    }
    return `<button class="m-card" data-m="${m.key}" style="animation-delay:${i*60}ms">
      <div class="m-label">${escapeHtml(m.label)}</div>
      <div class="m-val">${val}</div>
      ${m.value===null||m.value===undefined ? '<div class="m-empty">该窗口内无相关记录</div>' : ''}
      ${trendHtml}
      ${m.basis ? '<div class="m-more">点击查看计算依据 ›</div>' : ''}
    </button>`;
  }).join('');

  box.innerHTML = `
    <div class="m-grid">${cards}</div>
    <div id="m-basis"></div>

    <div class="sec-t">行为热力图 <span class="sub">颜色越深，当日有效活动越多 · 点击查看当天明细</span></div>
    <div class="card">
      <div class="heat-wrap">
        <div class="heat-y"><span>一</span><span></span><span>三</span><span></span><span>五</span><span></span><span>日</span></div>
        <div>
          <div class="heat-x"><span></span>${prof.heatmap.weeks.map((_,i)=>`<span>${i===0?'起':''}</span>`).join('')}</div>
          <div class="heat" id="heat"></div>
        </div>
      </div>
      <div class="heat-legend">少 <i></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i> 多</div>
      <div id="day-detail"></div>
    </div>

    <div class="sec-t">24 小时行为分布 <span class="sub">金色为夜间时段（22:00–06:00）</span></div>
    <div class="card">
      <div class="hours" id="hours"></div>
      <div class="hours-x" id="hours-x"></div>
    </div>

    <div class="sec-t">${escapeHtml(v.insightTitle)}</div>
    <div class="card">
      ${prof.insights.length
        ? `<ul class="ins-list">${prof.insights.map((x,i)=>`<li class="${x.tone}" style="animation-delay:${i*80}ms"><span class="dot">${x.tone==='warn'?'⚠':x.tone==='good'?'✓':'·'}</span><span>${escapeHtml(x.text)}</span></li>`).join('')}</ul>`
        : '<p class="placeholder">数据尚不足以形成结论，继续使用即可。</p>'}
      <p class="muted-note">全部结论均由本机记录的真实数据按固定规则算出，可逐条复核。</p>
    </div>

    <div class="sec-t">${escapeHtml(v.adviceTitle)} <span class="sub">分析逻辑不变，表达随人格切换</span></div>
    ${adv.length ? `<div class="advice">
        <div class="a-seal">${escapeHtml(P().name)}</div>
        <div class="a-title">${escapeHtml(v.adviceTitle)}</div>
        <div style="margin-top:10px;font-size:14px;color:var(--muted);">${escapeHtml(P().advice.salutation)}</div>
        ${adv.map((a,i)=>`<div class="a-item" style="animation:rise .5s ${i*90}ms backwards;">
          <div class="a-fact ${a.warn?'warn':''}">${escapeHtml(a.fact)}</div>
          <div class="a-act"><b>${escapeHtml(P().advice.selfLabel)}</b>${escapeHtml(a.advice)}</div>
        </div>`).join('')}
        <div class="a-foot">${escapeHtml(P().advice.footer)} · ${escapeHtml(P().advice.evidenceLabel)}：近 ${range} 日本机记录</div>
      </div>`
      : '<div class="card"><p class="placeholder">当前各项指标均在合理区间，暂无专项建议。</p></div>'}

    <div class="sec-t">${escapeHtml(v.task)}闭环 <span class="sub">${escapeHtml(v.decision)}的「下一步行动」会自动进入此清单，勾销后计入执行力与拖延指数</span></div>
    <div class="card"><div id="tk-list"></div>
      <div class="tk-add">
        <input type="text" id="tk-title" placeholder="新增一项${escapeHtml(v.task)}（回车确认）">
        <input type="date" id="tk-due" title="可选：截止日期">
        <button id="tk-add">加入清单</button>
      </div>
    </div>`;

  /* ---- 热力图 ---- */
  const heat = box.querySelector('#heat');
  const cols = prof.heatmap.weeks.map(row=>{
    const tds = row.map(c=>{
      if(!c) return '<div class="hc future" title="未来"></div>';
      const lv = heatLevel(c.score, prof.heatmap.max);
      const d = c.detail;
      const tip = d ? `${c.date}｜活跃 ${d.minutes} 分钟 · 议事 ${d.debates} 次 · AI ${d.aiCalls} 次 · 归档 ${d.filesMoved} 个 · ${v.task} ${d.tasksDone}/${d.tasksCreated}` : `${c.date}｜无记录`;
      return `<div class="hc l${lv}" data-k="${c.key}" data-tip="${escapeHtml(tip)}" title="${escapeHtml(tip)}"></div>`;
    }).join('');
    return `<div class="hcol">${tds}</div>`;
  }).join('');
  heat.innerHTML = cols;
  heat.querySelectorAll('.hc[data-k]').forEach(c=>{
    c.addEventListener('click', ()=>{
      const dd = box.querySelector('#day-detail');
      const rec = (function(){ const b=bhLoad(); return b.days[c.dataset.k]; })();
      if(!rec){ dd.innerHTML = `<div class="day-detail"><div class="d-t">${c.dataset.k}</div>当天没有任何行为记录。</div>`; return; }
      const line = (l,v2)=> v2 ? `<div>${l}：<b>${v2}</b></div>` : '';
      dd.innerHTML = `<div class="day-detail"><div class="d-t">${c.dataset.k} 行为明细</div>
        ${line('有效活跃时长', (rec.minutes||0).toFixed(1)+' 分钟')}
        ${line(vocab().council, (rec.debates||0)+' 次')}
        ${line('AI 请求', (rec.aiCalls||0)+' 次')}
        ${line('文件扫描 / 归档', (rec.filesScanned||0)+' / '+(rec.filesMoved||0)+' 个')}
        ${line(`${vocab().task}创建 / 完成`, (rec.tasksCreated||0)+' / '+(rec.tasksDone||0)+' 个')}
        ${line(`${vocab().decision} / 已执行`, (rec.decisions||0)+' / '+(rec.executed||0)+' 次')}
        ${(!rec.minutes && !rec.debates && !rec.aiCalls && !rec.filesMoved && !rec.tasksDone) ? '<div>当天无有效活动。</div>' : ''}
      </div>`;
    });
  });

  /* ---- 24 小时分布 ---- */
  const hmax = Math.max(1, ...prof.hours);
  box.querySelector('#hours').innerHTML = prof.hours.map((h,i)=>{
    const night = i>=22 || i<6;
    return `<div class="hb ${night?'night':''}" data-h="${String(i).padStart(2,'0')}:00 · ${Math.round(h)} 分钟" style="height:${Math.max(2, h/hmax*100)}%"></div>`;
  }).join('');
  box.querySelector('#hours-x').innerHTML = prof.hours.map((_,i)=>`<span>${i%2===0?String(i).padStart(2,'0'):''}</span>`).join('');

  /* ---- 指标卡：数字滚动 + 依据展开 ---- */
  box.querySelectorAll('.m-card').forEach(c=>{
    const m = prof.metrics.find(x=>x.key===c.dataset.m);
    // 数字从 0 增长到目标值
    const numEl = c.querySelector('[data-count]');
    if(numEl){
      const target = +numEl.dataset.count, t0 = performance.now();
      (function step(now){
        const k = Math.min(1, (now-t0)/900);
        numEl.textContent = Math.round(target * (1-Math.pow(1-k,3)));
        if(k<1) requestAnimationFrame(step);
      })(t0);
    }
    // 折线图逐步绘制（仅有关键指标的窗口序列有意义）
    if(m.series && m.series.length>1 && m.key!=='night'){
      const svg = sparkline(m.series);
      if(svg){
        c.insertAdjacentHTML('beforeend', svg);   // 注意：appendChild 只接受 Node，SVG 片段须用 insertAdjacentHTML
        const pth = c.querySelector('path.line');
        if(pth){
          const len = pth.getTotalLength ? pth.getTotalLength() : 200;
          pth.style.strokeDasharray = len; pth.style.strokeDashoffset = len;
          pth.style.transition='stroke-dashoffset 1s ease .2s';
          requestAnimationFrame(()=>{ pth.style.strokeDashoffset = 0; });
        }
      }
    }
    c.addEventListener('click', ()=>{
      const bb = box.querySelector('#m-basis');
      const open = c.classList.contains('open');
      box.querySelectorAll('.m-card').forEach(x=>x.classList.remove('open'));
      if(open || !m.basis){ bb.innerHTML=''; return; }
      c.classList.add('open');
      bb.innerHTML = `<div class="m-basis"><div class="t">${escapeHtml(m.label)} · 计算依据</div>
        ${m.basis.map(l=>'· '+escapeHtml(l)).join('<br>')}</div>`;
    });
  });

  drawTasks(box);
}

/* 折线图（纯 SVG，无外部依赖） */
function sparkline(series){
  const W=150, H=52, pad=4;
  const max = Math.max(1, ...series), min = Math.min(0, ...series);
  const rng = (max-min)||1;
  const pts = series.map((v,i)=>{
    const x = pad + i*(W-pad*2)/Math.max(1,(series.length-1));
    const y = H-pad - (v-min)/rng*(H-pad*2);
    return [x,y];
  });
  const d = pts.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ');
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <path class="line" d="${d}"/>${pts.map(p=>`<circle class="pt" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="1.8"/>`).join('')}
  </svg>`;
}

/* 任务清单：勾销 / 新增 / 删除，结果回写行为画像 */
function drawTasks(box){
  const v = vocab();
  const holder = box.querySelector('#tk-list');
  function paint(){
    const b = bhLoad();
    if(!b.tasks.length){
      holder.innerHTML = `<p class="placeholder">暂无${escapeHtml(v.task)}。${escapeHtml(navName('court'))}${escapeHtml(v.decision)}后，下一步行动会自动进入此清单。</p>`;
      return;
    }
    const p = n=>String(n).padStart(2,'0');
    holder.innerHTML = b.tasks.slice(0,100).map(t=>{
      const due = t.dueAt ? new Date(t.dueAt) : null;
      const dueTxt = due ? `${due.getFullYear()}-${p(due.getMonth()+1)}-${p(due.getDate())}` : '无截止';
      const over = !t.doneAt && due && due.getTime() < Date.now();
      return `<div class="tk-row ${t.doneAt?'done':''}">
        <input type="checkbox" data-id="${t.id}" ${t.doneAt?'checked':''}>
        <span class="tk-t">${escapeHtml(t.title)}${t.from==='zhupi'?` <span class="cat">来自${escapeHtml(vocab().decision)}</span>`:''}</span>
        <span class="tk-d ${over?'over':''}">${t.doneAt?'已完成':'截止 '+dueTxt}</span>
        <button class="tk-x" data-del="${t.id}" title="删除">✕</button>
      </div>`;
    }).join('');
    holder.querySelectorAll('input[type=checkbox]').forEach(cb=>cb.addEventListener('change', ()=>{
      BH.toggleTask(cb.dataset.id); paint();
    }));
    holder.querySelectorAll('[data-del]').forEach(x=>x.addEventListener('click', ()=>{
      BH.removeTask(x.dataset.del); paint();
    }));
  }
  paint();
  const ti = box.querySelector('#tk-title'), due = box.querySelector('#tk-due');
  function add(){
    const t = ti.value.trim();
    if(!t){ ti.focus(); return; }
    let dueAt = null;
    if(due.value){ const d = new Date(due.value+'T23:59:00'); dueAt = d.getTime(); }
    BH.addTask(t, dueAt, 'manual');
    ti.value=''; due.value=''; paint();
  }
  box.querySelector('#tk-add').addEventListener('click', add);
  ti.addEventListener('keydown', e=>{ if(e.key==='Enter') add(); });
}


/* ---------- 户部：文件整理（真实文件操作，经 Rust 命令） ---------- */
registerView('hu', async function renderHu(){
  const invoke = tauriInvoke();
  const s = document.createElement('section');
  s.innerHTML = `<header><h2>${escapeHtml(navName('hubu'))} · 文件整理</h2><p>扫描文件夹并按「课件与文献 / 素材 / 安装包与压缩包 / 表格 / 其他」归档。<b style="color:var(--red-deep)">只移动、不删除</b>，每一步皆可在${escapeHtml(navName('xingbu'))}回滚。</p></header>
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
      BH.count('filesScanned');                    // 行为画像：真实扫描次数
      if(!files.length){ result.innerHTML = '<p class="placeholder">该目录下没有待整理的顶层文件。</p>'; btnOrg.disabled = true; return; }
      const cats = {};
      files.forEach(f=>cats[f.category]=(cats[f.category]||0)+1);
      result.innerHTML = `
        <p style="font-size:14px;margin-bottom:12px;">共 <b style="color:var(--red-deep)">${files.length}</b> 个文件：${Object.entries(cats).map(([c,n])=>`<span class="cat">${escapeHtml(c)} × ${n}</span>`).join(' ')}</p>
        <table class="gt"><tr><th>文件名</th><th>分类</th><th style="width:90px;">大小</th></tr>
        ${files.map(f=>`<tr><td>${escapeHtml(f.name)}</td><td><span class="cat">${escapeHtml(f.category)}</span></td><td>${fmtSize(f.size)}</td></tr>`).join('')}</table>`;
      btnOrg.disabled = false;
    }catch(e){
      result.innerHTML = `<p class="placeholder" style="color:var(--err);">扫描失败：${escapeHtml(String(e))}</p>`;
      btnOrg.disabled = true;
    }
  });

  btnOrg.addEventListener('click', async ()=>{
    btnOrg.disabled = true;
    result.innerHTML = '<p class="placeholder">户部正在归档…</p>';
    try{
      const records = await invoke('hubu_organize', {folder: folderInput.value.trim()});
      BH.count('filesMoved', records.length);      // 行为画像：真实归档文件数
      result.innerHTML = `<div class="route"><span>${escapeHtml(navName('hubu'))}：已归档 <b class="arrow">${records.length}</b> 个文件，台账已移交${escapeHtml(navName('xingbu'))}，可逐条回滚。</span></div>
        <table class="gt"><tr><th>文件</th><th>去向</th></tr>
        ${records.map(r=>`<tr><td>${escapeHtml(r.from.split(/[\\/]/).pop())}</td><td><span class="cat">${escapeHtml(r.to.split(/[\\/]/).slice(-2).join('/'))}</span></td></tr>`).join('')}</table>`;
    }catch(e){
      result.innerHTML = `<p class="placeholder" style="color:var(--err);">整理失败：${escapeHtml(String(e))}</p>`;
    }
  });
});

/* ---------- 刑部·大理寺：审计台账 + 一键回滚 ---------- */
registerView('xing', async function renderXing(){
  const invoke = tauriInvoke();
  const s = document.createElement('section');
  s.innerHTML = `<header><h2>${escapeHtml(navName('xingbu'))} · 审计回滚</h2><p>${escapeHtml(navName('hubu'))}每一次文件移动均在此留痕（最多 200 条），可逐条一键回滚，全程可溯。</p></header>
    <div class="card"><div id="ledger"><p class="placeholder">读取台账中…</p></div></div>`;
  main.appendChild(s);
  const box = s.querySelector('#ledger');

  if(!invoke){ box.innerHTML = '<p class="placeholder">当前以浏览器方式打开，台账不可用。请通过桌面应用使用。</p>'; return; }

  async function refresh(){
    try{
      const ledger = await invoke('xingbu_ledger');
      if(!ledger.length){ box.innerHTML = `<p class="placeholder">暂无记录。${escapeHtml(navName('hubu'))}执行整理后，此处可见每一次移动。</p>`; return; }
      const active = ledger.filter(r=>!r.undone).length;
      box.innerHTML = `<p style="font-size:14px;margin-bottom:12px;">共 ${ledger.length} 条记录，其中 <b style="color:var(--red-deep)">${active}</b> 条可回滚。</p>
        <table class="gt"><tr><th style="width:150px;">时间</th><th>文件动向</th><th style="width:90px;">操作</th></tr>
        ${ledger.map(r=>`<tr>
          <td>${fmtStamp(r.time)}</td>
          <td>${escapeHtml(r.from.split(/[\\/]/).pop())}<span class="ledger-arrow">→</span><span class="cat">${escapeHtml(r.to.split(/[\\/]/).slice(-2).join('/'))}</span>${r.undone?'<span class="undo-ok">（已回滚）</span>':''}</td>
          <td>${r.undone?'—':`<button class="btn small secondary" data-id="${escapeHtml(r.id||'')}">回滚</button>`}</td>
        </tr>`).join('')}</table>`;
      box.querySelectorAll('[data-id]').forEach(b=>b.addEventListener('click', async ()=>{
        b.disabled = true; b.textContent = '回滚中…';
        try{
          await invoke('xingbu_undo', {id:b.dataset.id});
          refresh();
        }catch(e){
          b.disabled = false; b.textContent = '回滚';
          alert('回滚失败：'+e);
        }
      }));
    }catch(e){
      box.innerHTML = `<p class="placeholder" style="color:var(--err);">台账读取失败：${escapeHtml(String(e))}</p>`;
    }
  }
  refresh();
});

/* ---------- 起居注：决策记录 + 悬浮窗 ---------- */
registerView('log', function renderLog(){
  const s = document.createElement('section');
  const log = LS.get(K.log, []);
  const v = vocab();
  s.innerHTML = `<header><h2>${escapeHtml(navName('qijuzhu'))} · 决策记录</h2><p>记录${escapeHtml(P().userTitle)}的每一次${escapeHtml(v.decision)}，形成产品的记忆层。</p></header>
    <div class="card">
      <div class="toolbar"><button class="btn small" id="overlay">打开悬浮窗</button>
      <button class="btn small" id="pet" style="background:var(--btn-pet);">呼唤桌宠 · 云绾</button>
      <button class="btn small secondary" id="clear-log">清空起居注</button></div>
      <p class="muted-note" style="margin-top:0;">悬浮窗与桌宠可拖动标题栏（桌宠亦可直接拖动本体）自由移动，位置自动记忆；点 ✕ 关闭后，随时点上方按钮重新唤回。</p>
      ${log.length ? log.map(e=>`
      <div class="log-item">
        <div class="t">${escapeHtml(e.time)}</div>
        <div>${escapeHtml(e.question)}</div>
        <div class="d">${escapeHtml(v.decision)}：${escapeHtml(e.decision)}</div>
        <div class="a"><b>结论：</b>${escapeHtml(e.answer)} · 信心 ${Math.round(e.confidence*100)}%</div>
        ${e.next&&e.next.length?`<div class="muted-note">下一步：${e.next.map(escapeHtml).join('、')}</div>`:''}
      </div>`).join('') : `<p class="placeholder">尚无记录。请先到「呈奏」中完成一次辩论与裁决。</p>`}
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
  s.innerHTML = `<header><h2>${escapeHtml(navName('libu'))} · 成员绩效</h2><p>${escapeHtml(vocab().decision)}后可对成员考评「优 / 劣」，累计形成绩效，供调权重之参考。</p></header>
    <div class="card">
      ${rows.length ? rows.map(([role, v])=>{
        const total = v.up+v.down;
        const pct = total? Math.round(v.up/total*100) : 0;
        return `<div class="rate-row"><span class="role">${escapeHtml(roleName(role))}</span>
          <span class="bar"><i style="width:${pct}%"></i></span>
          <span style="font-size:13px;color:var(--muted);">优 ${v.up} / 劣 ${v.down} · 称职率 ${pct}%</span></div>`;
      }).join('') : `<p class="placeholder">暂无考评。请在「呈奏」完成一次辩论并${escapeHtml(vocab().decision)}后，为本局成员评分。</p>`}
      ${rows.length?'<button class="btn secondary small" id="reset-li" style="margin-top:14px;">清空绩效</button>':''}
    </div>`;
  main.appendChild(s);
  const b = s.querySelector('#reset-li');
  if(b) b.addEventListener('click', ()=>{ localStorage.removeItem(K.ratings); render('li'); });
});

/* ---------- 谏院：实时规谏 + 行为画像联动建议 ---------- */
registerView('jian', function renderJian(){
  const s = document.createElement('section');
  const u = LS.get(K.usage, {days:{}, advisories:[]});
  const today = new Date().toLocaleDateString('sv');
  const d = u.days[today] || {minutes:0, debates:0};
  const adv = u.advisories || [];
  const P0 = P(), v = vocab();
  /* 联动：由行为画像引擎生成的分析性建议（与画像页同源同规则） */
  let live = [];
  try{ const prof = analyzeBehavior(30); if(prof.hasData) live = buildAdvice(prof); }catch(e){}

  s.innerHTML = `<header><h2>${escapeHtml(navName('jianyuan'))} · 习惯规谏</h2><p>基于本地使用记录与行为画像规谏熬夜、久坐、过度依赖 AI 等行为。所有数据仅存本机。</p></header>
    ${live.length ? `<div class="advice">
        <div class="a-seal">${escapeHtml(P0.name)}</div>
        <div class="a-title">${escapeHtml(P0.advice.open)}</div>
        <div style="margin-top:10px;font-size:14px;color:var(--muted);">${escapeHtml(P0.advice.salutation)}</div>
        ${live.map((a,i)=>`<div class="a-item" style="animation:rise .5s ${i*90}ms backwards;">
          <div class="a-fact ${a.warn?'warn':''}">${escapeHtml(a.fact)}</div>
          <div class="a-act"><b>${escapeHtml(P0.advice.selfLabel)}</b>${escapeHtml(a.advice)}</div>
        </div>`).join('')}
        <div class="a-foot">${escapeHtml(P0.advice.footer)} · 依据「我的画像」近 30 日本机记录</div>
      </div>` : ''}
    <div class="card">
      <div class="stat-grid">
        <div class="stat"><b>${Math.round(d.minutes)}</b><span>今日使用（分钟）</span></div>
        <div class="stat"><b>${d.debates}</b><span>今日${escapeHtml(v.council)}（次）</span></div>
        <div class="stat"><b>${adv.length}</b><span>累计规谏（条）</span></div>
      </div>
      <h3>规谏记录</h3>
      ${adv.length ? adv.map(a=>`<div class="adv ${a.type===((P0.usageVoice&&P0.usageVoice.types&&P0.usageVoice.types.night)||'熬夜')?'warn':''}"><div class="t">${escapeHtml(a.time)} · ${escapeHtml(a.type)}</div>${escapeHtml(a.text)}</div>`).join('')
        : `<p class="placeholder">起居有度，暂无规谏。</p>`}
      <p class="muted-note">规谏规则：深夜（0-6 点）使用即谏；单日使用满 45 分钟谏休息；单日议事满 5 次谏勿过度依赖。</p>
      <button class="btn secondary small" id="to-prof" style="margin-top:12px;">查看完整行为画像 ›</button>
    </div>`;
  main.appendChild(s);
  s.querySelector('#to-prof').addEventListener('click', ()=>{
    document.querySelectorAll('.mod').forEach(x=>x.classList.remove('active'));
    const m = document.querySelector('.mod[data-view="profile"]');
    if(m) m.classList.add('active');
    render('profile');
  });
});

/* ---------- 翰林院：知识库（归档 + 全文检索） ---------- */
registerView('han', function renderHan(){
  const s = document.createElement('section');
  s.innerHTML = `<header><h2>${escapeHtml(navName('hanlin'))} · 知识库</h2><p>每一次辩论的完整记录（议题、各方立场、质询、合议、${escapeHtml(vocab().decision)}）皆入档案，可全文检索。</p></header>
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
          <div class="meta">${escapeHtml(e.time)} · ${escapeHtml(vocab().decision)}：${highlight(e.decision, kw)}</div>
          <div class="ans">${highlight(e.record.answer, kw)}</div>
        </div>`).join('')
      : `<p class="placeholder">无匹配档案${kw?'，换个关键词试试':'。完成一次辩论并'+escapeHtml(vocab().decision)+'后自动归档。'}。</p>`;
  }
  s.querySelector('#search').addEventListener('click', search);
  input.addEventListener('keydown', e=>{ if(e.key==='Enter') search(); });
  search();
});
