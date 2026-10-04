/* ================= core.js：工具、存储、路由、谏院使用记录 ================= */

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
  hubu:'grdws_hubu'         // 户部：上次整理目录
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
    if(h>=0 && h<6 && !u.flags.lateNight){
      advise('熬夜', `已至${h}点。陛下深夜仍在理政，深夜决策易失察，请歇驾安寝。`);
      u.flags.lateNight = true;
    }
    if(h>=6 && h<24) u.flags.lateNight = false;
    if(d.minutes>=45 && !u.flags.longUse){
      advise('久用', '今日已使用约 45 分钟。请陛下远眺片刻，活动筋骨，护住龙目。');
      u.flags.longUse = true;
    }
    if(d.minutes<10) u.flags.longUse = false;
    if(d.debates>=5 && !u.flags.overDep){
      advise('依赖', `今日已议事 ${d.debates} 次。AI 可参谋，圣裁须独断，切勿事事倚仗臣下。`);
      u.flags.overDep = true;
    }
  }
  // 每 30 秒累积一次活跃时长（窗口可见才算活跃）
  setInterval(()=>{
    if(document.visibilityState==='visible'){
      const now = Date.now(); day().minutes += (now-u.lastTick)/60000; checkRules(); save();
    }
    u.lastTick = Date.now();
  }, 30000);
  // 供上朝模块计数
  window.__countDebate = ()=>{ day().debates++; checkRules(); save(); };
})();
