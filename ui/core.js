/* ================= core.js：工具、存储、路由、人格与谏院使用记录 ================= */

const LS = {
  get(k, d){ try{ const v = JSON.parse(localStorage.getItem(k)); return v ?? d; }catch(e){ return d; } },
  set(k, v){ localStorage.setItem(k, JSON.stringify(v)); }
};
/* 存储键统一管理 */
const K = {
  log:'grdws_log',          // 起居注：裁决记录
  archive:'grdws_archive',  // 翰林院：完整辩论归档
  ratings:'grdws_ratings',  // 吏部：臣子评分 {role:{up,down}}
  usage:'grdws_usage',      // 谏院：使用记录与规谏
  settings:'grdws_settings',// 设置（DeepSeek key 等）
  hubu:'grdws_hubu',        // 户部：上次整理目录
  theme:'grdws_theme',      // 纸墨：court / night / celadon（仅大明朝人格可用）
  persona:'grdws_persona',  // 人格：ming / corp / fed
  events:'grdws_events'     // 邸报：拓浙活动聚合每日抓取（Rust 侧 events.rs）
};

function escapeHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function fmtTime(){ const d=new Date(), p=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; }
function fmtSize(n){ if(n<1024) return n+' B'; if(n<1048576) return (n/1024).toFixed(1)+' KB'; if(n<1073741824) return (n/1048576).toFixed(1)+' MB'; return (n/1073741824).toFixed(2)+' GB'; }
function fmtStamp(t){ const d=new Date(t*1000), p=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; }

/* ---------- Tauri 桥（浏览器直接打开时为 null，相关功能降级提示） ---------- */
function tauriInvoke(){
  return (window.__TAURI__ && window.__TAURI__.core) ? window.__TAURI__.core.invoke : null;
}

/* ---------- 渲染路由 ---------- */
const VIEWS = {};
function registerView(id, fn){ VIEWS[id] = fn; }
const main = document.getElementById('main-content');
let animToken = 0; // 防竞态：每次切视图/新提问自增，旧动画回调自动失效
document.querySelectorAll('.mod').forEach(m=>{
  m.addEventListener('click', ()=>{
    document.querySelectorAll('.mod').forEach(x=>x.classList.remove('active'));
    m.classList.add('active');
    render(m.dataset.view);
  });
});
function render(view){ animToken++; main.innerHTML=''; (VIEWS[view]||VIEWS.flow)(); }

/* ---------- 人格：把称谓 / 模块名 / 品牌语同步到整个界面 ---------- */
function syncPersonaUI(){
  const p = P();
  // 侧边栏模块显示名
  document.querySelectorAll('.mod[data-nav]').forEach(m=>{
    const label = p.nav[m.dataset.nav];
    if(label) m.textContent = label;
  });
  const sub = document.getElementById('brand-sub');
  if(sub) sub.textContent = p.brandSub;
  // 纸墨切换仅「大明朝」人格可用（公司/联邦自带完整配色）
  const bar = document.getElementById('theme-bar');
  if(bar) bar.style.display = p.allowLegacyTheme ? '' : 'none';
  document.querySelectorAll('.theme-dot').forEach(d=>{
    d.classList.toggle('active', d.dataset.theme === (LS.get(K.theme,'court')));
  });
}
/* 切换人格：套用配色 → 同步界面 → 重绘当前页（文案随之切换） */
function switchPersona(id){
  /* 非法 id 直接拒绝，避免把用户已选的人格覆盖成大明朝 */
  if(!PERSONAS || !PERSONAS[id]){ console.error('[core] 忽略非法人格 id：', id); return false; }
  applyPersona(id);
  LS.set(K.theme, LS.get(K.theme,'court'));
  syncPersonaUI();
  const active = document.querySelector('.mod.active');
  render(active ? active.dataset.view : 'flow');
  return true;
}
document.addEventListener('persona-changed', ()=>{ /* 事件已由 applyPersona 派发 */ });

/* ---------- 谏院：使用记录 + 规则引擎（熬夜 / 久用 / 过度依赖） ---------- */
(function usageTracking(){
  const today = ()=> new Date().toLocaleDateString('sv'); // YYYY-MM-DD
  let u = LS.get(K.usage, {days:{}, advisories:[], flags:{}});
  u.days = u.days||{}; u.advisories = u.advisories||[]; u.flags = u.flags||{};
  u.lastTick = Date.now();

  function save(){ LS.set(K.usage, u); }
  function day(){ const d=today(); if(!u.days[d]) u.days[d]={minutes:0,debates:0}; return u.days[d]; }
  function advise(type, text){
    u.advisories.unshift({time:fmtTime(), type, text});
    u.advisories = u.advisories.slice(0,100);
  }
  function checkRules(){
    const d = day(); const h = new Date().getHours();
    /* 规谏文案与分类标签随人格切换（表达变，规则不变） */
    const p0 = P();
    const uv = p0.usageVoice || { types:{}, night:()=>'', longUse:()=>'', overDep:()=>'' };
    const ty = uv.types || {};
    if(h>=0 && h<6 && !u.flags.lateNight){
      advise(ty.night || '熬夜', uv.night(h));
      u.flags.lateNight = true;
    }
    if(h>=6 && h<24) u.flags.lateNight = false;
    if(d.minutes>=45 && !u.flags.longUse){
      advise(ty.longUse || '久用', uv.longUse());
      u.flags.longUse = true;
    }
    if(d.minutes<10) u.flags.longUse = false;
    if(d.debates>=5 && !u.flags.overDep){
      advise(ty.overDep || '依赖', uv.overDep(d.debates));
      u.flags.overDep = true;
    }
  }
  // 每 30 秒累积一次活跃时长（窗口可见才算活跃）
  setInterval(()=>{
    if(document.visibilityState==='visible'){
      const now = Date.now(); const mins = (now-u.lastTick)/60000;
      day().minutes += mins; checkRules(); save();
      window.BH && BH.tick(mins);          // 行为画像：真实活跃时长（按小时分桶）
    }
    u.lastTick = Date.now();
  }, 30000);
  // 供上朝模块计数
  window.__countDebate = ()=>{
    day().debates++; checkRules(); save();
    window.BH && BH.count('debates');      // 行为画像：议事次数
  };
  // 供 AI 实时调用计数（仅在真正发起 API 请求时 +1）
  window.__countAiCall = ()=>{ window.BH && BH.count('aiCalls'); };
})();

/* ---------- 纸墨切换（宫墙朱砂 / 夜览水墨 / 青瓷淡雅），选择持久化到 localStorage ---------- */
(function initTheme(){
  const dots = document.querySelectorAll('.theme-dot');
  function apply(t){
    if(t && t!=='court') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme'); // court = :root 默认
    LS.set(K.theme, t);
    dots.forEach(d=>d.classList.toggle('active', d.dataset.theme===t));
  }
  dots.forEach(d=>d.addEventListener('click', ()=>apply(d.dataset.theme)));
  apply(LS.get(K.theme, 'court'));
})();
