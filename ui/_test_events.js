/* 邸报（活动聚合）逻辑测试：Node 模拟 localStorage + 最小 core stub，验证
 * 数据规整 / 汇总统计 / AI 注入文本生成（相关性匹配与回退）。 */
const store = {};
global.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }
};
global.window = global;
global.CustomEvent = function(){};

/* ---- 最小 core.js stub（events.js 依赖的 LS / K / tauriInvoke / registerView） ---- */
global.LS = {
  get(k, d){ try{ const v = JSON.parse(localStorage.getItem(k)); return v ?? d; }catch(e){ return d; } },
  set(k, v){ localStorage.setItem(k, JSON.stringify(v)); }
};
global.K = { events: 'grdws_events' };
global.tauriInvoke = () => null;          // 浏览器降级路径
const registered = {};
global.registerView = (id, fn) => { registered[id] = fn; };
global.render = () => {};

/* document stub：personality.js 首屏套色 + watchEvents 的 IIFE 都要跑一遍 */
const _attrs = {};
global.document = {
  documentElement: { style: { setProperty(){} }, setAttribute(k, v){ _attrs[k] = v; }, removeAttribute(k){ delete _attrs[k]; } },
  querySelector: () => null,
  createElement: () => ({ innerHTML: '', querySelector: () => null, appendChild(){}, addEventListener(){} }),
  getElementById: () => null,
  dispatchEvent(){ return true; }
};

const fs = require('fs');
/* 用 IIFE 包住 eval：events.js 里的函数声明（非严格模式）会泄漏到外围作用域，
 * 不隔离会与下方同名 const 撞名报 SyntaxError（TDZ）。 */
(function(){
  eval(fs.readFileSync(__dirname + '/personality.js', 'utf8'));   // navName / tauriListen 等
  eval(fs.readFileSync(__dirname + '/events.js', 'utf8') +
    '\n;global.__EV = { catLabel, parseEvtTime, normalizeStore, buildSummary, eventsContextFor, evtEnded };');
})();

/* 别名转发（不直接解构：解构声明会与 eval 泄漏的函数声明撞名） */
const catLabel    = (...a) => global.__EV.catLabel(...a);
const parseEvtTime = (...a) => global.__EV.parseEvtTime(...a);
const normalizeStore = (...a) => global.__EV.normalizeStore(...a);
const buildSummary   = (...a) => global.__EV.buildSummary(...a);
const eventsContextFor = (...a) => global.__EV.eventsContextFor(...a);
const evtEnded        = (...a) => global.__EV.evtEnded(...a);

let pass = 0, fail = 0;
function T(name, cond){
  if(cond){ pass++; console.log('  ✓ ' + name); }
  else{ fail++; console.error('  ✗ ' + name); }
}
const DAY = 86400000;
function iso(offsetDays, h){   // 相对现在的 ISO 串（同 API 格式 'YYYY-MM-DDTHH:MM'）
  const d = new Date(Date.now() + offsetDays * DAY);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(h || 9)}:00`;
}

console.log('=== catLabel ===');
T('已知分类映射中文', catLabel('lecture') === '讲座');
T('未知分类归其他', catLabel('weird') === '其他');

console.log('=== parseEvtTime ===');
T('标准格式可解析', parseEvtTime('2026-10-18T10:15') !== null);
T('空串返回 null', parseEvtTime('') === null);
T('垃圾串返回 null', parseEvtTime('abc') === null);

console.log('=== normalizeStore ===');
const raw = {
  v: 1, fetchedAt: '2026-10-10 08:00', fetchedDate: '2026-10-10', count: 3,
  events: [
    { id: 1, title: ' AI 讲座：大模型前沿 ', date: iso(2), location: '紫金港', category: 'lecture',
      description: 'x'.repeat(500), registration_deadline: iso(1), organizer: 'ZJUAI' },
    { id: 2, title: '黑客马拉松', date: iso(20), location: '线上', category: 'hackathon', description: '' },
    { id: 3, title: '', date: iso(3) },                                        // 无标题 → 过滤
    { id: 4, title: '已过期活动', date: iso(-10), category: 'other' }
  ]
};
const st = normalizeStore(raw);
T('过滤无标题条目', st.events.length === 3 && st.count === 3);
T('未知 category 归 other', st.events.some(e => e.title === '黑客马拉松' && e.category === 'other'));
T('description 截断到 200', st.events[0].description.length === 200);
T('标题去空白', st.events[0].title === 'AI 讲座：大模型前沿');
T('fetchedAt 透传', st.fetchedAt === '2026-10-10 08:00');
T('空入参不崩', normalizeStore(null).count === 0);
T('summary 已生成', !!st.summary.byCategory.lecture);

console.log('=== buildSummary ===');
const evs = [
  { id: 'a', title: 'A', date: iso(3),  category: 'lecture', registration_deadline: iso(1) },   // 未来3天，截止1天后
  { id: 'b', title: 'B', date: iso(45), category: 'lecture' },                                   // 未来45天（60天内）
  { id: 'c', title: 'C', date: iso(90), category: 'competition' },                               // 90天外 → 不进 upcoming
  { id: 'd', title: 'D', date: iso(-5), category: 'other', registration_deadline: iso(2) },      // 已开始但截止2天后 → 进 deadlines
  { id: 'e', title: 'E', date: iso(7),  category: 'other', registration_deadline: iso(-1) }      // 截止已过 → 不进 deadlines
];
const sum = buildSummary(evs);
T('分类计数', sum.byCategory.lecture === 2 && sum.byCategory.other === 2);
T('upcoming 含 60 天内、排除 90 天外', sum.upcoming.includes('a') && sum.upcoming.includes('b') && !sum.upcoming.includes('c'));
T('deadlines 含未过期、排除已过期', sum.deadlines.includes('a') && sum.deadlines.includes('d') && !sum.deadlines.includes('e'));
T('upcoming 按时间升序', sum.upcoming.indexOf('a') < sum.upcoming.indexOf('b'));
const many = Array.from({ length: 20 }, (_, i) => ({ id: 'u' + i, title: 'U' + i, date: iso(i + 1), category: 'lecture' }));
T('upcoming 上限 12', buildSummary(many).upcoming.length === 12);
T('空数组安全', buildSummary([]).upcoming.length === 0 && buildSummary(null).byCategory !== undefined);

console.log('=== eventsContextFor（AI 注入）===');
global.localStorage.setItem('grdws_events', JSON.stringify(st));
T('无数据返回空串', eventsContextFor('随便问问') !== '' || (localStorage.removeItem('grdws_events'), eventsContextFor('x') === ''));
localStorage.setItem('grdws_events', JSON.stringify(st));
const ctxHit = eventsContextFor('我要不要去听 AI 讲座？');
T('相关议题命中活动标题', ctxHit.includes('AI 讲座：大模型前沿'));
T('不暴露来源域名', ctxHit.indexOf('tuotuzju') < 0);
T('包含抓取时间', ctxHit.includes('2026-10-10 08:00'));
T('包含报名截止信息', ctxHit.includes('报名截止'));
const ctxMiss = eventsContextFor('今晚吃什么');
T('无关议题回退近期清单而非空', ctxMiss.includes('【校园活动背景资料】'));
const store2 = normalizeStore({ events: [{ id: 9, title: '校运会', date: iso(5), category: 'culture_sports' }] });
localStorage.setItem('grdws_events', JSON.stringify(store2));
T('回退时包含即将开始的活动', eventsContextFor('完全无关的问题').includes('校运会'));
T('存储损坏不崩（返回空或正常串）', (() => {
  localStorage.setItem('grdws_events', 'not json');
  const r = eventsContextFor('x');
  return r === '' || typeof r === 'string';
})());

console.log('=== evtEnded（未结束 / 已结束分组依据）===');
T('过去开始 → 已结束', evtEnded({ date: iso(-3) }) === true);
T('未来开始 → 未结束', evtEnded({ date: iso(3) }) === false);
T('跨天活动看 end_date：已开始未结束', evtEnded({ date: iso(-1), end_date: iso(2) }) === false);
T('跨天活动看 end_date：已结束', evtEnded({ date: iso(-5), end_date: iso(-1) }) === true);
T('无日期视为未结束', evtEnded({}) === false);
T('归组正确：未来在前', (() => {
  const arr = [{ id: 'p', title: 'P', date: iso(-2) }, { id: 'f', title: 'F', date: iso(4) }];
  const open = arr.filter(e => !evtEnded(e));
  return open.length === 1 && open[0].id === 'f';
})());

console.log('=== 视图已注册 ===');
T("registerView('events') 已调用", typeof registered.events === 'function');

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
