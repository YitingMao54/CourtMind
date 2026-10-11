/* ================= behavior.js：行为画像引擎（AI 对用户的「观察层」） =================
 * 设计原则：
 *  1) 只分析软件真实记录到的数据 —— 无数据即显示「暂无数据」，绝不编造。
 *  2) 规则简单、透明、可复现 —— 每个指标都能回答「这个数字怎么来的」。
 *  3) 不做心理疾病判断 / 人格诊断 / 敏感属性推断。
 *  4) 行为数据只保存在本机 localStorage，不上传。
 * 存储沿用项目既有方案（localStorage，键前缀 grdws_），不引入新数据库。
 */

const K_BEHAVIOR = 'grdws_behavior';

/* ---------- 存储 ---------- */
function bhLoad(){
  let b;
  try{ b = JSON.parse(localStorage.getItem(K_BEHAVIOR)); }catch(e){ b = null; }
  if(!b || typeof b !== 'object') b = {};
  b.v = b.v || 1;
  b.days = b.days || {};          // { 'YYYY-MM-DD': DayRecord }
  b.tasks = b.tasks || [];        // [{id,title,createdAt,dueAt,doneAt,from}]
  b.insights = b.insights || [];  // 最近生成的结论（可回看）
  return b;
}
function bhSave(b){ try{ LS.set(K_BEHAVIOR, b); }catch(e){} }
function bhDay(b, key){
  if(!b.days[key]) b.days[key] = {
    minutes:0, hours:Array(24).fill(0), debates:0, aiCalls:0,
    filesScanned:0, filesMoved:0, tasksCreated:0, tasksDone:0, decisions:0, executed:0
  };
  const d = b.days[key];
  d.hours = d.hours || Array(24).fill(0);
  return d;
}
const _dkey = d => { const p=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`; };
function bhTodayKey(){ return _dkey(new Date()); }
function bhLastNDays(n){
  const out=[], now=new Date();
  for(let i=n-1;i>=0;i--){ const d=new Date(now.getFullYear(),now.getMonth(),now.getDate()-i); out.push(_dkey(d)); }
  return out;
}

/* ---------- 采集 API（由各模块在真实发生动作时调用） ---------- */
const BH = {
  /* 累积活跃时长（分钟），并落入当前小时桶 —— 由 core.js 心跳调用 */
  tick(minutes){
    if(!(minutes>0)) return;
    const b = bhLoad(), d = bhDay(b, bhTodayKey());
    d.minutes += minutes;
    d.hours[new Date().getHours()] += minutes;
    bhSave(b);
  },
  /* 通用事件计数 */
  count(field, n){
    n = (n===undefined ? 1 : n);
    if(!n) return;
    const b = bhLoad(), d = bhDay(b, bhTodayKey());
    d[field] = (d[field]||0) + n;
    bhSave(b);
  },
  /* 朱批时登记决策；executed=true 表示已实际执行 */
  decision(executed){
    const b = bhLoad(), d = bhDay(b, bhTodayKey());
    d.decisions++; if(executed) d.executed++;
    bhSave(b);
  },
  /* 新增任务（可来自朱批的下一步行动，也可用户手建） */
  addTask(title, dueAt, from){
    title = String(title||'').trim();
    if(!title) return null;
    const b = bhLoad();
    const t = { id:'t'+Date.now()+'-'+Math.floor(Math.random()*1e4), title, createdAt:Date.now(), dueAt:dueAt||null, doneAt:null, from:from||'manual' };
    b.tasks.unshift(t);
    if(b.tasks.length>500) b.tasks.length = 500;
    bhDay(b, bhTodayKey()).tasksCreated++;
    bhSave(b);
    return t;
  },
  /* 勾销 / 取消勾销任务 */
  toggleTask(id){
    const b = bhLoad();
    const t = b.tasks.find(x=>x.id===id);
    if(!t) return null;
    const d = bhDay(b, bhTodayKey());
    if(t.doneAt){ t.doneAt = null; d.tasksDone = Math.max(0, (d.tasksDone||0)-1); }
    else { t.doneAt = Date.now(); d.tasksDone = (d.tasksDone||0)+1; }
    bhSave(b);
    return t;
  },
  removeTask(id){
    const b = bhLoad();
    b.tasks = b.tasks.filter(x=>x.id!==id);
    bhSave(b);
  },
  /* 起居注决策被删除/清空时，同步任务来源计数（仅提示，不做人格推断） */
  hasData(){
    const b = bhLoad();
    return Object.keys(b.days).length>0 || b.tasks.length>0;
  }
};

/* ================= 分析引擎 ================= */

const _clamp = (v,a,b)=> Math.max(a, Math.min(b, v));
const _round1 = v => Math.round(v*10)/10;

/* 统计窗口内所有天的聚合量 */
function _agg(b, keys){
  const s = { minutes:0, hours:Array(24).fill(0), debates:0, aiCalls:0, filesScanned:0, filesMoved:0,
              decisions:0, executed:0, activeDays:0, perDay:[] };
  keys.forEach(k=>{
    const d = b.days[k]; if(!d) return;
    const m = d.minutes||0;
    s.minutes += m;
    (d.hours||[]).forEach((v,i)=> s.hours[i] += (v||0));
    s.debates += d.debates||0;
    s.aiCalls += d.aiCalls||0;
    s.filesScanned += d.filesScanned||0;
    s.filesMoved += d.filesMoved||0;
    s.decisions += d.decisions||0;
    s.executed += d.executed||0;
    if(m>0 || (d.debates||0)>0 || (d.filesScanned||0)>0 || (d.tasksDone||0)>0) s.activeDays++;
    s.perDay.push({ key:k, minutes:m, debates:d.debates||0, aiCalls:d.aiCalls||0,
                    filesScanned:d.filesScanned||0, filesMoved:d.filesMoved||0,
                    decisions:d.decisions||0, executed:d.executed||0,
                    tasksCreated:d.tasksCreated||0, tasksDone:d.tasksDone||0 });
  });
  return s;
}

/* 专注指数：60% 有效活跃天数覆盖 + 40% 单日时长稳定性（变异系数倒数），透明可复算 */
function _focusScore(agg, days){
  if(!days) return null;
  const coverage = agg.activeDays / days;                       // 有效活跃天数占比
  const acts = agg.perDay.filter(x=>x.minutes>0).map(x=>x.minutes);
  // 窗口内完全没有活动 → 无数据（返回 null，绝不用 0 冒充结论）
  if(agg.activeDays===0 && agg.debates===0 && agg.filesScanned===0) return null;
  let stability = 0;
  if(acts.length>=2){
    const mean = acts.reduce((a,c)=>a+c,0)/acts.length;
    const varr = acts.reduce((a,c)=>a+(c-mean)*(c-mean),0)/acts.length;
    const sd = Math.sqrt(varr);
    stability = mean>0 ? _clamp(1 - sd/mean, 0, 1) : 0;         // 越规整越接近 1
  } else if(acts.length===1){ stability = 0.5; }                // 仅一天数据：给中性，不夸大
  const score = 100 * (0.6*coverage + 0.4*stability);
  return { value: Math.round(score),
    basis: [
      `统计窗口：${days} 天`,
      `有效活跃天数：${agg.activeDays} 天（覆盖率 ${(coverage*100).toFixed(0)}%）`,
      acts.length>=2 ? `单日时长标准差 ${Math.sqrt(acts.reduce((a,c)=>a+(c-acts.reduce((x,y)=>x+y,0)/acts.length)**2,0)/acts.length).toFixed(1)} 分钟 / 均值 ${(acts.reduce((a,c)=>a+c,0)/acts.length).toFixed(1)} 分钟 → 稳定性 ${(stability*100).toFixed(0)}%`
                     : `单日时长样本不足 2 天，稳定性按中性 50% 计`,
      `专注指数 = 100 × (0.6×${(coverage*100).toFixed(0)}% + 0.4×${(stability*100).toFixed(0)}%) = ${Math.round(score)}`
    ] };
}

/* 执行力 = 完成任务数 / 创建任务数 × 100%（与拖延指数同源，均取自任务清单，避免两套口径） */
function _executionRate(tasks, keys){
  const from = new Date(); from.setHours(0,0,0,0); from.setDate(from.getDate()-(keys.length-1));
  const t0 = from.getTime();
  const inWin = tasks.filter(t=> t.createdAt>=t0 );
  if(!inWin.length) return null;
  const created = inWin.length;
  const done = inWin.filter(t=> t.doneAt && t.doneAt>=t0).length;
  const v = done/created*100;
  return { value: Math.round(v),
    basis: [`统计窗口内创建${'任务'}：${created} 个`, `其中已完成：${done} 个`,
            `执行率 = ${done} / ${created} = ${(Math.round(v*10)/10)}%`] };
}

/* 拖延指数：
 * 有截止日的任务 → 看完成时点落在「创建→截止」区间的哪一段（越靠后越拖延）
 * 无截止日的任务 → 看创建 7 天后仍未完成的比例（搁置率）
 * 两者皆无数据则返回 null，绝不臆造 */
function _procrastination(tasks, keys){
  const from = new Date(); from.setHours(0,0,0,0); from.setDate(from.getDate()-(keys.length-1));
  const t0 = from.getTime();
  const inWin = tasks.filter(t=> t.createdAt>=t0 );
  if(!inWin.length) return null;
  const withDue = inWin.filter(t=> t.dueAt && t.doneAt);
  const overdueUndone = inWin.filter(t=> !t.doneAt && t.dueAt && t.dueAt < Date.now());
  const staleUndone = inWin.filter(t=> !t.doneAt && !t.dueAt && (Date.now()-t.createdAt) > 7*864e5);
  const basis = [`统计窗口内创建任务：${inWin.length} 个`];
  let value = null;
  if(withDue.length){
    // 完成位置：0=刚创建就完成，1=卡点完成
    const pos = withDue.map(t=> _clamp((t.doneAt - t.createdAt)/Math.max(1,(t.dueAt - t.createdAt)), 0, 1));
    const avg = pos.reduce((a,c)=>a+c,0)/pos.length;
    value = Math.round(avg*100);
    basis.push(`有截止日且已完成：${withDue.length} 个，平均完成于「创建→截止」区间的 ${(avg*100).toFixed(0)}% 处（越接近截止越拖延）`);
    basis.push(`拖延指数 = ${(avg*100).toFixed(0)}`);
  } else {
    const undone = inWin.filter(t=>!t.doneAt).length;
    value = Math.round(undone/inWin.length*100);
    basis.push(`无「有截止日且已完成」的样本，退化为搁置率口径`);
    basis.push(`未完成任务：${undone} / ${inWin.length} = ${(Math.round(value*10)/10)}%`);
  }
  if(overdueUndone.length) basis.push(`⚠ 已过截止日仍未完成：${overdueUndone.length} 个`);
  if(staleUndone.length)   basis.push(`· 创建超 7 天仍未完成：${staleUndone.length} 个`);
  return { value, basis };
}

/* AI 使用指数：日均 AI 请求次数 / 满分基准 5 次每日 */
function _aiUsage(agg, days){
  if(!agg.aiCalls) return null;
  const avg = agg.aiCalls/days;
  const v = _clamp(avg/5*100, 0, 100);
  return { value: Math.round(v),
    basis: [`统计窗口：${days} 天`, `AI 请求总次数：${agg.aiCalls} 次`,
            `日均 ${_round1(avg)} 次 / 满分基准 5 次每日 → ${Math.round(v)}`] };
}

/* 夜间活跃率：22:00–06:00 活跃分钟 / 总活跃分钟 */
function _nightRate(agg){
  if(!agg.minutes) return null;
  let night = 0;
  for(let h=22;h<24;h++) night += agg.hours[h];
  for(let h=0;h<6;h++)   night += agg.hours[h];
  const v = night/agg.minutes*100;
  return { value: Math.round(v),
    basis: [`总活跃时长：${Math.round(agg.minutes)} 分钟`,
            `夜间（22:00–06:00）活跃：${Math.round(night)} 分钟`,
            `夜间活跃率 = ${Math.round(night)} / ${Math.round(agg.minutes)} = ${(Math.round(v*10)/10)}%`] };
}

/* 政务执行率：已执行决策 / 已做出决策 */
function _orgScore(agg){
  if(!agg.decisions) return null;
  const v = agg.executed/agg.decisions*100;
  return { value: Math.round(v),
    basis: [`统计窗口内做出决策：${agg.decisions} 次`, `其中标记「已执行」：${agg.executed} 次`,
            `政务执行率 = ${agg.executed} / ${agg.decisions} = ${(Math.round(v*10)/10)}%`] };
}

/* 趋势：后半段 vs 前半段（同一窗口内切半，简单可复现） */
function _trend(series){
  if(series.length<2) return 'stable';
  const h = Math.floor(series.length/2);
  const a = series.slice(0,h), b2 = series.slice(h);
  const d = b2[b2.length-1] - a[a.length-1];
  return d > 0.05 ? 'up' : (d < -0.05 ? 'down' : 'stable');
}

/* 序列：按周聚合（用于折线图）；窗口 7 天 → 按日，30 天 → 按周 */
function _series(agg, keys, field){
  const win = keys.length;
  const get = x => field==='minutes' ? x.minutes
                : field==='debates' ? x.debates
                : field==='aiCalls' ? x.aiCalls
                : field==='filesScanned' ? x.filesScanned
                : field==='filesMoved' ? x.filesMoved
                : x[field];
  if(win<=7) return keys.map(k=>{ const r = agg.perDay.find(x=>x.key===k); return r? get(r):0; });
  const out=[], step=Math.ceil(win/4);                       // 30 天 → 约 4 个点
  for(let i=0;i<win;i+=step){
    const seg = agg.perDay.slice(i, i+step);
    out.push(seg.reduce((s,x)=>s+get(x),0));
  }
  return out;
}

/* ================= 主入口：analyzeBehavior ================= */
function analyzeBehavior(rangeDays){
  rangeDays = (rangeDays===30 ? 30 : 7);
  const b = bhLoad();
  const keys = bhLastNDays(rangeDays);
  const agg = _agg(b, keys);
  const half = Math.floor(rangeDays/2);
  const aggA = _agg(b, keys.slice(0, half));
  const aggB = _agg(b, keys.slice(half));

  const focus = _focusScore(agg, rangeDays);
  const created = b.tasks.filter(t=>{ const from=new Date(); from.setHours(0,0,0,0); from.setDate(from.getDate()-(rangeDays-1)); return t.createdAt>=from.getTime(); }).length;
  const done = b.tasks.filter(t=>{ const from=new Date(); from.setHours(0,0,0,0); from.setDate(from.getDate()-(rangeDays-1)); return t.doneAt && t.doneAt>=from.getTime(); }).length;
  const execution = _executionRate(b.tasks, keys);
  const procrastination = _procrastination(b.tasks, keys);
  const aiUsage = _aiUsage(agg, rangeDays);
  const night = _nightRate(agg);
  const organization = _orgScore(agg);

  const metrics = [
    { key:'focus',      label:'专注指数',   value: focus && focus.value,      unit:'',      basis: focus && focus.basis,
      series: _series(agg, keys, 'minutes'),    goodDir:'up'   },
    { key:'execution',  label:'执行力',     value: execution && execution.value, unit:'%',   basis: execution && execution.basis,
      series: _series(agg, keys, 'tasksDone'),  goodDir:'up'   },
    { key:'procrastination', label:'拖延指数', value: procrastination && procrastination.value, unit:'', basis: procrastination && procrastination.basis,
      series: [], goodDir:'down' },
    { key:'aiUsage',    label:'AI 使用指数', value: aiUsage && aiUsage.value, unit:'',      basis: aiUsage && aiUsage.basis,
      series: _series(agg, keys, 'aiCalls'),    goodDir:'up'   },
    { key:'night',      label:'夜间活跃率', value: night && night.value, unit:'%',      basis: night && night.basis,
      series: agg.hours.slice(0), goodDir:'down' },
    { key:'organization', label:'政务执行率', value: organization && organization.value, unit:'%', basis: organization && organization.basis,
      series: _series(agg, keys, 'executed'),   goodDir:'up'   }
  ];

  /* 趋势：可算的指标逐个对比前后半段 */
  const trends = {};
  const calcTrend = (a1,b1)=> (a1===null||b1===null||a1===undefined||b1===undefined) ? 'stable'
    : (b1-a1 > 0.05 ? 'up' : (b1-a1 < -0.05 ? 'down' : 'stable'));
  const halfFocusA=_focusScore(aggA,half), halfFocusB=_focusScore(aggB,rangeDays-half);
  trends.focus = calcTrend(halfFocusA&&halfFocusA.value, halfFocusB&&halfFocusB.value);
  const cA=aggA.perDay.reduce((s,x)=>s+x.tasksCreated,0), dA=aggA.perDay.reduce((s,x)=>s+x.tasksDone,0);
  const cB=aggB.perDay.reduce((s,x)=>s+x.tasksCreated,0), dB=aggB.perDay.reduce((s,x)=>s+x.tasksDone,0);
  trends.execution = (cA&&cB) ? calcTrend(dA/cA*100, dB/cB*100) : 'stable';
  // 前后半段执行率同样取自任务清单（与当前值同源）
  const exA=_executionRate(b.tasks, keys.slice(0,half)), exB=_executionRate(b.tasks, keys.slice(half));
  if(exA && exB) trends.execution = calcTrend(exA.value, exB.value);
  const nA=aggA.minutes? (Array.from({length:24},(_,i)=>i>=22||i<6?aggA.hours[i]:0).reduce((x,y)=>x+y,0)/aggA.minutes*100):null;
  const nB=aggB.minutes? (Array.from({length:24},(_,i)=>i>=22||i<6?aggB.hours[i]:0).reduce((x,y)=>x+y,0)/aggB.minutes*100):null;
  trends.night = calcTrend(nA,nB);
  const pA = _procrastination(b.tasks, keys.slice(0,half)), pB = _procrastination(b.tasks, keys.slice(half));
  trends.procrastination = calcTrend(pA&&pA.value, pB&&pB.value);

  /* 变化幅度（百分点 / 点），用于 ↑12% ↓8% 这类展示 */
  const deltas = {
    focus: (halfFocusA&&halfFocusB) ? halfFocusB.value - halfFocusA.value : null,
    execution: (exA&&exB) ? Math.round(exB.value - exA.value) : null,
    night: (nA!==null&&nB!==null) ? Math.round(nB-nA) : null,
    procrastination: (pA&&pB) ? pB.value - pA.value : null
  };

  const insights = buildInsights({ rangeDays, agg, keys, metrics, deltas, b });

  const profile = {
    rangeDays, metrics, trends, deltas, insights,
    heatmap: buildHeatmap(b, rangeDays),
    hours: agg.hours,
    totals: {
      minutes: Math.round(agg.minutes), activeDays: agg.activeDays, debates: agg.debates,
      aiCalls: agg.aiCalls, filesScanned: agg.filesScanned, filesMoved: agg.filesMoved,
      decisions: agg.decisions, executed: agg.executed, tasksCreated: created, tasksDone: done
    },
    hasData: agg.minutes>0 || agg.debates>0 || agg.aiCalls>0 || agg.decisions>0 || b.tasks.length>0
  };
  return profile;
}

/* ================= 行为热力图（GitHub Contribution 式） ================= */
function buildHeatmap(b, rangeDays){
  const weeks = Math.ceil(rangeDays/7);
  const out = { weeks:[], max:0, labels:['一','二','三','四','五','六','日'] };
  const now = new Date();
  // 对齐到本周一
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay()+6)%7));
  for(let w=weeks-1; w>=0; w--){
    const row = [];
    for(let d=0; d<7; d++){
      const day = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - w*7 + d);
      if(day > now){ row.push(null); continue; }               // 未来：不画
      const k = _dkey(day);
      const rec = b.days[k];
      // 活跃度 = 活跃分钟 + 各项事件计数（全部为真实记录）
      const score = rec ? (rec.minutes||0) + (rec.debates||0)*10 + (rec.aiCalls||0)*5
                          + (rec.filesScanned||0)*2 + (rec.filesMoved||0)*3
                          + (rec.tasksCreated||0)*8 + (rec.tasksDone||0)*10 + (rec.decisions||0)*8 : 0;
      if(score > out.max) out.max = score;
      row.push({ key:k, score, date:`${day.getMonth()+1}/${day.getDate()}`, detail: rec ? {
        minutes: Math.round(rec.minutes||0), debates: rec.debates||0, aiCalls: rec.aiCalls||0,
        filesScanned: rec.filesScanned||0, filesMoved: rec.filesMoved||0,
        tasksCreated: rec.tasksCreated||0, tasksDone: rec.tasksDone||0,
        decisions: rec.decisions||0, executed: rec.executed||0 } : null });
    }
    out.weeks.push(row);
  }
  return out;
}
function heatLevel(score, max){
  if(!score) return 0;
  const r = score/max;
  return r>0.75 ? 4 : r>0.5 ? 3 : r>0.25 ? 2 : 1;
}

/* ================= 行为趋势结论（1～3 条，全部基于真实数据） ================= */
function buildInsights(ctx){
  const { rangeDays, agg, deltas, metrics } = ctx;
  const v = vocab();
  const pool = [];
  const mv = k => { const m = metrics.find(x=>x.key===k); return m && m.value; };
  // 任务统计的窗口起点（与执行率口径一致）
  const t0 = (function(){ const f=new Date(); f.setHours(0,0,0,0); f.setDate(f.getDate()-(rangeDays-1)); return f.getTime(); })();
  ctx.t0 = t0;

  // 专注
  const f = mv('focus'), df = deltas.focus;
  if(f!==null&&f!==undefined){
    if(df!==null && Math.abs(df)>=5)
      pool.push({ tone: df>0?'good':'warn', text:`${v.insightTitle}：专注指数 ${df>0?'较前半段提升':'较前半段下降'} ${Math.abs(df)} 点（后半段 ${f}）` });
    else pool.push({ tone:'good', text:`${v.insightTitle}：专注指数 ${f}（${agg.activeDays}/${rangeDays} 天有有效活动）` });
  }
  // 执行
  const ex = mv('execution'), de = deltas.execution;
  const tCreated = ctx.b.tasks.filter(t=> t.createdAt >= ctx.t0 ).length;
  const tDone = ctx.b.tasks.filter(t=> t.doneAt && t.doneAt >= ctx.t0 ).length;
  if(ex!==null&&ex!==undefined){
    if(de!==null && Math.abs(de)>=5)
      pool.push({ tone: de>0?'good':'warn', text:`执行力 ${ex}%（${de>0?'↑':'↓'} ${Math.abs(de)} 个百分点，较前半段）` });
    else pool.push({ tone:'info', text:`执行力 ${ex}%：窗口内创建 ${tCreated} 个${v.task}，完成 ${tDone} 个` });
  }
  // 夜间
  const n = mv('night'), dn = deltas.night;
  if(n!==null && n>=25){
    pool.push({ tone: n>=40?'warn':'info',
      text:`⚠ 夜间活跃率 ${n}%${dn!==null&&dn!==0 ? `（较前半段 ${dn>0?'上升':'下降'} ${Math.abs(dn)} 个百分点）`:''}` });
  } else if(n!==null){
    pool.push({ tone:'good', text:`夜间活跃率 ${n}%，处于较低区间` });
  }
  // 临期完成
  const b = bhLoad(), t7 = Date.now() - 7*864e5;
  const lateDone = b.tasks.filter(t=> t.doneAt && t.dueAt && t.doneAt>=t7 && ((t.dueAt - t.doneAt)/36e5) <= 12 ).length;
  if(lateDone>0) pool.push({ tone:'warn', text:`⚠ 最近 7 天有 ${lateDone} 项${v.task}在 Deadline 前 12 小时内完成` });
  // 决策执行
  if(agg.decisions>0){
    const rate = Math.round(agg.executed/agg.decisions*100);
    pool.push({ tone: rate>=70?'good':'info', text:`政令执行：窗口内 ${agg.decisions} 次${v.decision}，其中 ${agg.executed} 次已执行（${rate}%）` });
  }
  // 文件整理
  if(agg.filesMoved>0) pool.push({ tone:'good', text:`文件整理：窗口内归档 ${agg.filesMoved} 个文件（扫描 ${agg.filesScanned} 次）` });
  // 逾期未完成
  const overdue = b.tasks.filter(t=> !t.doneAt && t.dueAt && t.dueAt < Date.now()).length;
  if(overdue>0) pool.push({ tone:'warn', text:`⚠ 有 ${overdue} 项${v.task}已过截止日仍未完成` });

  if(!pool.length) return [];
  // 排序：warn 优先，其次 info / good；最多 3 条
  const rank = { warn:0, info:1, good:2 };
  pool.sort((a,b2)=> rank[a.tone]-rank[b2.tone]);
  return pool.slice(0,3);
}

/* ================= 谏院建议（分析逻辑不变，输出随人格切换） ================= */
/* 每条建议 = 事实句（数据）+ 行动句（建议）。
 * 事实句与行动句按人格改写表达方式，但数字与判断完全一致 —— 分析逻辑不变，仅语气变。 */
const ADVICE_VOICE = {
  ming: {
    nightFact: n => `近 30 日，夜间（子时至卯时）仍有 ${n}% 的时辰用于理政。`,
    nightAct : '臣以为深夜决断易失察，还望陛下以晨间处置要紧政务，夜间只留清览。',
    lateFact : l => `近 7 日，有 ${l} 项政务压在 Deadline 前十二时辰方才办结。`,
    lateAct  : '请陛下将要紧政务提前一日列入今日朝议，并预留一段完整时辰。',
    execFact : (r,c,d) => `近 30 日，政务 ${c} 件，办结 ${d} 件，行之者 ${r}%。`,
    execAct  : '请先收敛待办——只留三件今日必办，余者改为延后，或明确定性为罢议。',
    overFact : o => `今有 ${o} 项政务已过期限而仍未办结。`,
    overAct  : '请陛下逐件明断：今日办结、改期，抑或明降罢议——悬而未决，最耗心力。',
    aiFact   : a => `近 30 日 AI 议政 ${a} 次，用度颇繁。`,
    aiAct    : 'AI 可参详而不可代决。恳请陛下先自书一断，再看 AI 结论，庶几不为其所先入。',
    okFact   : (r,m,d) => `近 ${r} 日，有效活动 ${m} 分钟、凡 ${d} 日，各项指标皆在合理区间。`,
    okAct    : '臣请陛下如是而行。日后数据渐积月满，臣再来据实以奏。',
    seen     : seen => `臣据近 ${seen} 日起居注与政务记录核算而得`
  },
  corp: {
    nightFact: n => `过去 30 天，夜间（22:00–06:00）活动占比 ${n}%。`,
    nightAct : '建议将需要深度判断的任务尽量排入上午，夜间仅保留轻量复盘。',
    lateFact : l => `过去 7 天有 ${l} 项任务在截止时间前 12 小时内才完成。`,
    lateAct  : '建议将高优先级任务至少提前 24 小时进入计划，并预留一段完整时段。',
    execFact : (r,c,d) => `过去 30 天创建任务 ${c} 项，完成 ${d} 项，执行率 ${r}%。`,
    execAct  : '建议先收敛待办规模：仅保留 3 项当日必办，其余明确改期或关闭。',
    overFact : o => `当前有 ${o} 项任务已过截止日期仍未完成。`,
    overAct  : '建议逐项确认：今日完成、调整期限，或明确关闭——逾期未决项会持续占用注意力。',
    aiFact   : a => `过去 30 天 AI 请求 ${a} 次，使用强度偏高。`,
    aiAct    : '建议在提交决策前先写下自己的初判，再对照 AI 结论，避免结论先入为主。',
    okFact   : (r,m,d) => `过去 ${r} 天共记录有效活动 ${m} 分钟、覆盖 ${d} 天，各项指标均在合理区间。`,
    okAct    : '建议保持当前节奏；数据积累满 30 天后，趋势判断会更可靠。',
    seen     : seen => `基于近 ${seen} 天本机行为记录测算`
  },
  fed: {
    nightFact: n => `检测到近 30 日 22:00–06:00 时段活跃占比 ${n}%，高于建议区间。`,
    nightAct : '建议重新配置任务资源：深度判断类指令前置至日间窗口，夜间仅保留低负载同步。',
    lateFact : l => `告警：近 7 日有 ${l} 项任务在截止前 12 小时内才标记完成。`,
    lateAct  : '建议为高优先级任务预留至少 24 小时前置缓冲，并分配连续时间块。',
    execFact : (r,c,d) => `统计周期内创建任务 ${c} 项，完成 ${d} 项，执行率 ${r}%。`,
    execAct  : '建议压缩在办队列至 3 项，其余标记为延后或关闭，避免状态扩散。',
    overFact : o => `检测到 ${o} 项任务已超出截止时间仍未关闭。`,
    overAct  : '建议逐项重新判定状态：立即完成、重设时限，或正式关闭——悬置项将持续占用调度资源。',
    aiFact   : a => `统计周期内 AI 请求 ${a} 次，调用强度较高。`,
    aiAct    : '建议在提交前先形成自主判断，再调取 AI 结论，避免锚定效应。',
    okFact   : (r,m,d) => `观测周期 ${r} 天，累计有效活动 ${m} 分钟，覆盖 ${d} 天，各项指标处于正常区间。`,
    okAct    : '建议维持当前配置；样本累积至 30 天后，趋势模型置信度将提升。',
    seen     : seen => `数据源：Behavior Monitor 近 ${seen} 日观测记录`
  }
};

function buildAdvice(profile){
  const items = [];
  const voice = ADVICE_VOICE[readPersonaId()] || ADVICE_VOICE.ming;
  const mv = k => { const m = profile.metrics.find(x=>x.key===k); return m && m.value; };
  const R = profile.rangeDays;
  const b0 = bhLoad();

  const n = mv('night');
  if(n!==null && n>=25)
    items.push({ warn:true, fact:voice.nightFact(n), advice:voice.nightAct });

  const t7 = Date.now() - 7*864e5;
  const late = b0.tasks.filter(t=> t.doneAt && t.dueAt && t.doneAt>=t7 && ((t.dueAt-t.doneAt)/36e5)<=12).length;
  if(late>0)
    items.push({ warn:true, fact:voice.lateFact(late), advice:voice.lateAct });

  const ex = mv('execution');
  const w0 = (function(){ const f=new Date(); f.setHours(0,0,0,0); f.setDate(f.getDate()-(R-1)); return f.getTime(); })();
  const cN = b0.tasks.filter(t=> t.createdAt>=w0).length;
  const dN = b0.tasks.filter(t=> t.doneAt && t.doneAt>=w0).length;
  if(ex!==null && ex<60 && cN>=3)
    items.push({ warn:true, fact:voice.execFact(ex, cN, dN), advice:voice.execAct });

  const od = b0.tasks.filter(t=> !t.doneAt && t.dueAt && t.dueAt < Date.now()).length;
  if(od>0)
    items.push({ warn:true, fact:voice.overFact(od), advice:voice.overAct });

  const ai = mv('aiUsage');
  if(ai!==null && ai>=80 && R>=7 && profile.totals.aiCalls>0)
    items.push({ warn:false, fact:voice.aiFact(profile.totals.aiCalls), advice:voice.aiAct });

  if(!items.length && profile.hasData)
    items.push({ warn:false,
      fact:voice.okFact(R, profile.totals.minutes, profile.totals.activeDays),
      advice:voice.okAct });

  return items.slice(0,3);
}

if(typeof window !== 'undefined'){
  window.BH = BH;
  window.K_BEHAVIOR = K_BEHAVIOR;
  window.bhLoad = bhLoad;
  window.bhSave = bhSave;
  window.bhTodayKey = bhTodayKey;
  window.bhLastNDays = bhLastNDays;
  window.analyzeBehavior = analyzeBehavior;
  window.buildAdvice = buildAdvice;
  window.heatLevel = heatLevel;
}
