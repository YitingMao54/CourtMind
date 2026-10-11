/* ================= personality.js：人格 / 朝廷皮肤（用户与 AI 的「关系层」） =================
 * 独立加载于 <head>，先于首屏渲染套用，避免闪白；不依赖 core.js。
 * 人格只改变：表达方式、称谓、视觉与交互风格。
 * 人格不改变：事实、计算结果、安全规则、权限规则。
 */

const PERSONA_KEY = 'grdws_persona';

/* ---------- 三套人格配置（模块化：文案集中于此，页面只引用不硬编码） ---------- */
const PERSONAS = {
  /* ---------- ① 大明朝 ---------- */
  ming: {
    id: 'ming',
    name: '大明朝',
    icon: '🏯',
    tagline: '君臣秩序 · 威严',
    keywords: ['君臣有序', '朱批复决', '适度古风'],
    intro: '臣工之身侍君。凡事以奏折呈请、以朱批复决，遇险必以谏言直陈。',
    sample: '陛下，臣察觉您近三日屡屡漏夜未寝，还望保重龙体。',
    userTitle: '陛下',
    aiTitle: '臣',
    roles: { main: '户部尚书', critic: '御史大夫', executor: '翰林学士', historian: '起居郎' },
    /* 固化数据中的旧称谓 → 本人格称谓（未知称谓原样返回） */
    roleMap: {},
    vocabulary: {
      decision: '朱批', suggestion: '奏折', warning: '谏言', task: '政务', completed: '已结',
      council: '朝议', riskPanel: '御史台', knowledge: '翰林院', monitor: '起居注',
      organize: '户部', adviceTitle: '谏院有本', insightTitle: '本月画像'
    },
    promptStyle:
      '你是一名古代朝廷中的臣工。你需要使用适度古风的表达方式称呼用户为「陛下」，自称「臣」。\n' +
      '表达必须清晰、准确、易懂。不要为了角色扮演而牺牲事实准确性。',
    advice: {
      open: '谏院有本', salutation: '陛下：', selfLabel: '臣建议：',
      footer: '—— 臣 谨奏', evidenceLabel: '数据依据', riskWord: 'risk'
    },
    /* 使用规谏（谏院「熬夜/久用/依赖」三条固定规则）——文案随人格切换 */
    usageVoice: {
      types: { night:'熬夜', longUse:'久用', overDep:'依赖' },
      night : h => `已至${h}点。陛下深夜仍在理政，深夜决策易失察，请歇驾安寝。`,
      longUse: () => '今日已使用约 45 分钟。请陛下远眺片刻，活动筋骨，护住龙目。',
      overDep: d => `今日已议事 ${d} 次。AI 可参谋，圣裁须独断，切勿事事倚仗臣下。`
    },
    /* 桌宠「云绾」称谓与浮窗标题 —— 浮窗为独立窗口，需自带文案，不能依赖主窗口 */
    petVoice: {
      name: '云绾', self: '臣女',
      states: { idle:'侍立', happy:'欢喜', shy:'羞怯', surprised:'惊觉', wave:'见礼', read:'翻阅', sleep:'安睡' },
      phrases: {
        greet:  ['{self}云绾，愿为{user}分忧～', '{user}万福金安，云绾这厢有礼。'],
        happy:  ['承蒙{user}惦记，云绾欢喜！', '{user}今日也元气满满呢～'],
        shy:    ['{u}、{user}莫要盯着人家看呀…', '再这样，云绾要脸红了啦。'],
        surprised: ['呀！{user}唤我？', '哎？可是有要事吩咐？'],
        wave:   ['{user}慢走，云绾在此候着～', '得令！云绾随侍在侧。'],
        read:   ['云绾这就去翻翻典籍，稍候～', '书中自有黄金屋，{user}且宽心。'],
        wake:   ['唔…夜深了，{user}也早些安歇罢…', '三更天了，{user}莫要再劳神…'],
        idle:   ['嗯～伸个懒腰。', '活动活动筋骨～', '咦，什么声音？'],
        ruling: ['{user}圣裁英明！{self}已记入{v.log}啦。', '又了结一桩心事，{user}真英明～'],
        bond:   ['与{user}相处愈久，云绾愈是欢喜。', '{user}的每一次轻抚，云绾都记在心里。']
      }
    },
    nav: {
      tongzheng: '通政司', court: '上朝', hubu: '户部', xingbu: '刑部 · 大理寺', qijuzhu: '起居注', events: '邸报',
      libu: '吏部', jianyuan: '谏院', hanlin: '翰林院', persona: '人格 · 朝廷', profile: '我的画像'
    },
    brandSub: '三省六部 · 为朕分忧',
    baseTheme: 'court',   // 沿用宫墙朱砂；仍允许切换纸墨（夜览水墨 / 青瓷淡雅）
    allowLegacyTheme: true,
    font: '"Noto Serif SC","Songti SC","SimSun","STSong",serif',
    radius: '10px',
    visualTheme: {
      '--paper':'#f5efe0','--panel':'#fffdf5','--panel-2':'#fffef9','--line':'#e2d7bf',
      '--ink':'#2b2620','--muted':'#8a7f6a',
      '--red':'#7a1f1f','--red-deep':'#5c1414','--gold':'#b8860b','--gold-soft':'#e8d9b0',
      '--input-bg':'#ffffff','--hover':'#fbf6ea','--accent-soft':'#fbf5e4',
      '--btn-bg':'#7a1f1f','--btn-bg-hover':'#5c1414','--btn-ink':'#f6e7c1','--btn-warn':'#8a6d1f','--btn-pet':'#c9756b',
      '--err':'#8a3b1f','--ok':'#2e6e3a',
      '--sidebar-bg':'#5c1414','--sidebar-ink':'#f3e7d0','--sidebar-muted':'#d9c9a6','--sidebar-item':'#e9dcc0'
    }
  },

  /* ---------- ② 现代公司 ---------- */
  corp: {
    id: 'corp',
    name: '现代公司',
    icon: '🏢',
    tagline: '专业决策 · 商务',
    keywords: ['董事会', '风险委员会', 'Decision Memo'],
    intro: '以企业战略顾问之职协助 CEO 决策。议题进入董事会讨论，风险由风险委员会出具意见，建议以 Decision Memo 呈递。',
    sample: 'CEO，过去 7 天你的深夜工作比例上升至 28%，建议重新安排任务优先级。',
    userTitle: 'CEO',
    aiTitle: '顾问',
    roles: { main: '财务总监', critic: '风控总监', executor: '战略分析师', historian: '会议秘书' },
    roleMap: { '户部尚书':'财务总监', '御史大夫':'风控总监', '翰林学士':'战略分析师', '起居郎':'会议秘书' },
    vocabulary: {
      decision: 'CEO 决策', suggestion: 'Decision Memo', warning: '风险提示', task: '任务', completed: '已完成',
      council: '董事会', riskPanel: '风险委员会', knowledge: '知识库', monitor: '行为 Monitor',
      organize: '运营部', adviceTitle: '风险备忘录', insightTitle: '本期画像'
    },
    promptStyle:
      '你是一名专业的企业战略顾问。使用现代商务语言，重点强调事实、风险、成本和执行方案。\n' +
      '称呼用户为「CEO」。不要为了专业感而牺牲事实准确性。',
    advice: {
      open: '风险备忘录', salutation: 'CEO：', selfLabel: '建议：',
      footer: '—— 战略分析官', evidenceLabel: '数据依据', riskWord: 'risk'
    },
    usageVoice: {
      types: { night:'深夜使用', longUse:'连续使用', overDep:'AI 依赖' },
      night : h => `当前时间 ${h}:00，已进入深夜时段。深夜决策判断力下降，建议将重要决策移至次日晨间处理。`,
      longUse: () => '今日累计使用约 45 分钟。建议起身活动、远眺放松，注意用眼与颈椎健康。',
      overDep: d => `今日已发起 ${d} 次 AI 决策请求。AI 可辅助分析，关键判断建议由本人确认。`
    },
    petVoice: {
      name: '云绾', self: '我',
      states: { idle:'待命', happy:'振作', shy:'注意', surprised:'响应', wave:'致意', read:'检索', sleep:'低功耗' },
      phrases: {
        greet:  ['{self}已就位，随时待命。', '{user}，今日也一切顺利。'],
        happy:  ['{user}状态不错，继续保持。', '数据很健康，节奏很好。'],
        shy:    ['{u}……这个指标波动有点大哦。', '数据有点异常，要看看吗？'],
        surprised: ['{user}？有新情况？', '检测到新事件，需要关注。'],
        wave:   ['{user}慢走，我在这儿。', '收到，随时待命。'],
        read:   ['我去调一下资料，稍候。', '正在检索 Knowledge Core…'],
        wake:   ['{user}，夜深了，早点休息。', '这个点了，效率会下降的。'],
        idle:   ['系统自检完成，一切正常。', '待命中，有需要随时叫我。'],
        ruling: ['{user}决策已记录到{v.log}。', '又完成一项，节奏稳定。'],
        bond:   ['和{user}配合越来越顺了。', '这些数据我都记着，随时可查。']
      }
    },
    nav: {
      tongzheng: '总裁办', court: '董事会', hubu: '运营部 · 文件资产', xingbu: '风控审计', qijuzhu: '决策日志', events: '情报简报',
      libu: '人事绩效', jianyuan: '风险委员会', hanlin: '知识库', persona: '人格 · 公司', profile: '我的画像'
    },
    brandSub: 'Strategy Desk · 辅助决策',
    baseTheme: null,       // 自带配色，不使用纸墨切换
    allowLegacyTheme: false,
    font: '"Noto Sans SC","HarmonyOS Sans SC","Microsoft YaHei","PingFang SC",system-ui,sans-serif',
    radius: '6px',
    visualTheme: {
      '--paper':'#f3f4f6','--panel':'#ffffff','--panel-2':'#fafbfc','--line':'#e3e6ea',
      '--ink':'#1e2430','--muted':'#6b7280',
      '--red':'#24406e','--red-deep':'#1a2f52','--gold':'#6b7688','--gold-soft':'#eceef2',
      '--input-bg':'#ffffff','--hover':'#f5f6f8','--accent-soft':'#eef1f6',
      '--btn-bg':'#24406e','--btn-bg-hover':'#1a2f52','--btn-ink':'#ffffff','--btn-warn':'#8a6a1f','--btn-pet':'#4b6b8a',
      '--err':'#b3261e','--ok':'#1f7a4d',
      '--sidebar-bg':'#1e2430','--sidebar-ink':'#e8ecf3','--sidebar-muted':'#98a2b3','--sidebar-item':'#c7cfdb'
    }
  },

  /* ---------- ③ 未来联邦 ---------- */
  fed: {
    id: 'fed',
    name: '未来联邦',
    icon: '🚀',
    tagline: '战略决策 · 科技',
    keywords: ['战略议会', 'Knowledge Core', 'Behavior Monitor'],
    intro: '你是未来战略指挥中心的 AI 分析官。多方观点在战略议会汇总，风险由风险分析官评估，档案存于 Knowledge Core，行为数据由 Behavior Monitor 观测。',
    sample: '指挥官，检测到近期夜间活跃度持续上升，建议重新配置今日任务资源。',
    userTitle: '指挥官',
    aiTitle: '分析官',
    roles: { main: '资源官', critic: '风控官', executor: '战术官', historian: '数据官' },
    roleMap: { '户部尚书':'资源官', '御史大夫':'风控官', '翰林学士':'战术官', '起居郎':'数据官' },
    vocabulary: {
      decision: '最终指令', suggestion: '战术建议', warning: '风险警报', task: '任务项', completed: '已完成',
      council: '战略议会', riskPanel: '风险分析官', knowledge: 'Knowledge Core', monitor: 'Behavior Monitor',
      organize: '资源调度部', adviceTitle: 'Monitor 报告', insightTitle: '行为观测摘要'
    },
    promptStyle:
      '你是一名未来战略指挥中心的 AI 分析官。使用简洁、理性、数据驱动的表达方式，突出状态、风险、资源和行动建议。\n' +
      '称呼用户为「指挥官」。不要为了科幻感而牺牲事实准确性。',
    advice: {
      open: 'Behavior Monitor 报告', salutation: '指挥官：', selfLabel: '行动建议：',
      footer: '—— 风险分析官', evidenceLabel: '数据依据', riskWord: 'risk'
    },
    usageVoice: {
      types: { night:'低负荷时段', longUse:'连续使用', overDep:'AI 依赖' },
      night : h => `告警：当前本地时间 ${h}:00，处于低认知负荷时段。不建议在此窗口执行高复杂度决策。`,
      longUse: () => '系统检测到连续使用约 45 分钟。建议启动休息周期，恢复注意力资源。',
      overDep: d => `告警：今日 AI 决策调用已达 ${d} 次，依赖度偏高。建议保留自主判断环节后再采纳模型输出。`
    },
    petVoice: {
      name: '云绾', self: '本机',
      states: { idle:'待机', happy:'高效', shy:'告警', surprised:'响应', wave:'致意', read:'检索', sleep:'休眠' },
      phrases: {
        greet:  ['{self}已接入，待命中。', '{user}，系统就绪。'],
        happy:  ['运算状态良好，继续。', '资源占用健康，节奏稳定。'],
        shy:    ['{u}……该指标出现异常波动。', '数据偏离正常区间，建议核查。'],
        surprised: ['{user}？检测到新事件。', '有新的状态变更，请确认。'],
        wave:   ['{user}慢走，本机持续值守。', '指令已接收，随时执行。'],
        read:   ['正在调取 Knowledge Core…', '检索中，稍候。'],
        wake:   ['{user}，当前为低负荷时段，建议休息。', '深夜时段，建议降低任务复杂度。'],
        idle:   ['系统自检完成，状态正常。', '待命中，随时响应指令。'],
        ruling: ['{user}指令已写入{v.log}。', '决策已归档，状态正常。'],
        bond:   ['与{user}的协同已相当稳定。', '历史数据已归档，随时可调用。']
      }
    },
    nav: {
      tongzheng: '通讯枢纽', court: '战略议会', hubu: '资源调度', xingbu: '监察审计', qijuzhu: '行为日志', events: '情报中枢',
      libu: '绩效评估', jianyuan: '风险分析官', hanlin: 'Knowledge Core', persona: '人格 · 联邦', profile: '行为画像'
    },
    brandSub: 'Unified Command · 观测与调度',
    baseTheme: null,
    allowLegacyTheme: false,
    font: '"Noto Sans SC","HarmonyOS Sans SC","Microsoft YaHei",system-ui,sans-serif',
    radius: '12px',
    visualTheme: {
      '--paper':'#080d16','--panel':'#101827','--panel-2':'#141d2e','--line':'#23324a',
      '--ink':'#e6f0ff','--muted':'#7f8ea8',
      '--red':'#35d6f5','--red-deep':'#8ceaff','--gold':'#ffb454','--gold-soft':'#182335',
      '--input-bg':'#0c1420','--hover':'#182335','--accent-soft':'#132033',
      '--btn-bg':'#0e7f8c','--btn-bg-hover':'#12a0b0','--btn-ink':'#04161a','--btn-warn':'#b8801f','--btn-pet':'#3d6bd6',
      '--err':'#ff7a7a','--ok':'#4ee0a8',
      '--sidebar-bg':'#050912','--sidebar-ink':'#cfe4ff','--sidebar-muted':'#6c7f9c','--sidebar-item':'#a9c2e0'
    }
  }
};

const PERSONA_ORDER = ['ming', 'corp', 'fed'];

/* ---------- 当前人格读写 ----------
 * 容错说明：本键历史上存在两种存储格式 —— 裸串（applyPersona 写的 "fed"）
 * 与 JSON 串（若被主窗口 LS.set 这类 JSON 包装器写入，则为 "\"fed\""）。
 * 一旦按裸串比对，JSON 格式会匹配不上而静默回落到大明朝，表现为
 *「主窗口换了皮肤、浮窗没换」。故此处两种格式都要认。
 */
function readPersonaId(){
  try{
    const raw = localStorage.getItem(PERSONA_KEY);
    if(!raw) return 'ming';
    /* hasOwnProperty 校验：直接写 PERSONAS[raw] 会命中 Object.prototype 上的
       'constructor' / 'toString' 等原型链键，把垃圾值当成合法人格。 */
    if(Object.prototype.hasOwnProperty.call(PERSONAS, raw)) return raw;
    // 兼容 JSON 包装格式
    let v = null;
    try{ v = JSON.parse(raw); }catch(e){ v = null; }
    if(typeof v === 'string' && Object.prototype.hasOwnProperty.call(PERSONAS, v)) return v;
    return 'ming';
  }
  catch(e){ return 'ming'; }
}
function currentPersona(){ return PERSONAS[readPersonaId()] || PERSONAS.ming; }/* 供其他模块使用：称谓 / 词表 / 角色名（唯一入口，页面不硬编码） */
function P(){ return currentPersona(); }
function vocab(){ return currentPersona().vocabulary; }
/* 把固化数据里的旧角色名映射为当前人格的角色名 */
function roleName(n){
  const p = currentPersona();
  return (p.roleMap && p.roleMap[n]) || n;
}
/* 模块显示名 */
function navName(key){ return currentPersona().nav[key] || key; }

/* ---------- 套用人格：CSS 变量 + data-persona + 纸墨 ---------- */
function applyPersona(id, opts){
  /* 非法 id 绝不能静默套用大明朝。
   * 那样不仅会套错配色，还会把 localStorage 里的 grdws_persona 覆盖成 'ming'，
   * 导致用户刚选的人格被持久化地抹掉（曾出现存储里 ming→corp→ming 的回退序列）。
   * 正确做法：直接拒绝套用，让调用方继续沿用当前人格。
   * 注意必须先校验类型 —— 对象作键会被隐式 toString 成 '[object Object]'，
   * 而 'constructor'/'toString' 这类原型链键更会直接命中 Object.prototype 上的属性。*/
  if(typeof id !== 'string' || !Object.prototype.hasOwnProperty.call(PERSONAS, id)){
    console.error('[personality] 忽略非法人格 id：', id);
    return null;
  }
  const p = PERSONAS[id];
  const root = document.documentElement;
  try{
    root.setAttribute('data-persona', p.id);
    root.style.setProperty('--font', p.font);
    root.style.setProperty('--radius', p.radius);
    Object.keys(p.visualTheme).forEach(k=>root.style.setProperty(k, p.visualTheme[k]));
    if(!p.allowLegacyTheme) root.removeAttribute('data-theme');
    if(!(opts && opts.silent)) { try{ localStorage.setItem(PERSONA_KEY, p.id); }catch(e){} }
  }catch(e){
    // 套色失败要看得见：吞掉异常会让「切了皮肤但浮窗没变」这类问题无从排查
    console.error('[personality] 套用配色失败', e);
  }
  // 事件派发独立保护：即使派发失败，上面的配色也已生效
  try{ document.dispatchEvent(new CustomEvent('persona-changed', { detail:{ id:p.id } })); }catch(e){}
  // 跨窗口广播（Tauri 全局事件）：与 localStorage 互为冗余通道。
  // 若某些环境下多窗口 localStorage 恰好不共享，浮窗仍能靠这条事件即时跟随。
  if(!(opts && opts.noBroadcast)) broadcastPersona(p.id);
  return p;
}

/* ---------- 跨窗口人格广播（冗余通道，失败静默） ---------- */
const PERSONA_EVENT = 'grdws-persona-changed';
function tauriListen(event, cb){
  try{
    const T = (typeof window !== 'undefined') ? window.__TAURI__ : null;
    const ev = T && T.event ? T.event : null;
    if(!ev || typeof ev.listen !== 'function') return null;
    const r = ev.listen(event, e => {
      try{ cb(e && e.payload ? e.payload : null); }catch(err){}
    });
    return r && typeof r.then === 'function' ? r.catch(()=>null) : r;
  }catch(e){ return null; }
}
function tauriEmit(event, payload){
  try{
    const T = (typeof window !== 'undefined') ? window.__TAURI__ : null;
    const ev = T && T.event ? T.event : null;
    if(!ev || typeof ev.emit !== 'function') return false;
    const r = ev.emit(event, payload);
    if(r && typeof r.catch === 'function') r.catch(()=>{});
    return true;
  }catch(e){ return false; }
}
function broadcastPersona(id){
  try{
    if(tauriEmit(PERSONA_EVENT, { id: String(id) })) return;
  }catch(e){}
}

/* ---------- 注入 AI 系统 Prompt ---------- */
function personaPrompt(){
  return currentPersona().promptStyle;
}

/* ---------- 浮窗 / 桌宠专用：独立窗口的套色与实时跟随 ----------
 * 起居注悬浮窗与桌宠是独立 WebView 窗口，不加载 core.js，
 * 但共享同一个 localStorage，因此可直接读人格并套用 CSS 变量。
 * 主窗口切换人格后，浮窗需跟着变 → 轮询比对 persona id（跨窗口 storage 事件不可靠）。
 */
function petPhrase(key){
  const pv = (P().petVoice) || (PERSONAS.ming.petVoice);
  const arr = (pv.phrases && pv.phrases[key]) || (PERSONAS.ming.petVoice.phrases[key]) || [''];
  const raw = arr[Math.floor(Math.random() * arr.length)];
  const u = P().userTitle;
  return String(raw)
    .replace(/\{user\}/g, u)
    .replace(/\{u\}/g, u[0] || u)
    .replace(/\{self\}/g, pv.self || '')
    .replace(/\{v\.log\}/g, vocab().monitor || '起居注');
}
/* 监听人格变化（主窗口切换后自动重新套色），返回停止函数。
 * 双通道：
 *   ① localStorage 轮询（600ms）—— 兜底，覆盖任何写入路径；
 *   ② Tauri 全局事件广播 —— 即时，且不依赖多窗口 localStorage 共享。
 * 两条通道都会走同一个 apply，避免重复套色（apply 幂等）。 */
function watchPersona(onChange){
  let cur = readPersonaId();
  const fire = (now, src) => {
    if(now === cur) return;
    cur = now;
    applyPersona(now, { silent:true, noBroadcast:true });
    try{ onChange && onChange(now, src); }catch(e){}
  };
  const timer = setInterval(()=>{ fire(readPersonaId(), 'poll'); }, 600);
  tauriListen(PERSONA_EVENT, payload => {
    const id = payload && payload.id;
    if(!id || !PERSONAS[id]) return;
    fire(id, 'event');
  });
  /* 浮窗/桌宠可能比主窗口晚加载：延迟再读一次，兜住"开窗时人格已切过"的情况 */
  [400, 1500].forEach(t => setTimeout(()=>{ fire(readPersonaId(), 'late'); }, t));
  return () => clearInterval(timer);
}

/* ---------- 首屏立即套用（避免闪白） ---------- */
(function bootPersona(){
  try{ applyPersona(readPersonaId(), { silent:true }); }
  catch(e){ console.error('[personality] 首屏套用失败', e); }
})();

if(typeof window !== 'undefined'){
  window.PERSONAS = PERSONAS;
  window.PERSONA_ORDER = PERSONA_ORDER;
  window.PERSONA_KEY = PERSONA_KEY;
  window.PERSONA_EVENT = PERSONA_EVENT;
  window.readPersonaId = readPersonaId;
  window.currentPersona = currentPersona;
  window.P = P;
  window.vocab = vocab;
  window.roleName = roleName;
  window.navName = navName;
  window.applyPersona = applyPersona;
  window.personaPrompt = personaPrompt;
  window.petPhrase = petPhrase;
  window.watchPersona = watchPersona;
  window.tauriListen = tauriListen;
  window.tauriEmit = tauriEmit;
  window.broadcastPersona = broadcastPersona;
}
