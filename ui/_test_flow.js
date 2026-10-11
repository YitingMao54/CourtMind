/* 实时议事调用链测试：mock WebView 环境 + 假 fetch。
 * 重点回归 2026-10-10 的致命 bug：fetchDebate 里 `const P = activeProvider()` 遮蔽了
 * personality.js 的全局人格函数 P()，导致 `P().roles.main` 抛 "P is not a function"，
 * 实时议事 100% 崩溃并静默回退固化数据（表现为"无论问什么都是固定模板"）。 */
const store = {};
global.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }
};
global.window = global;
global.window.__TAURI__ = null;
global.CustomEvent = function(){};
const _attrs = {};
global.document = {
  documentElement: { style:{ setProperty(){} }, setAttribute(k,v){ _attrs[k]=v; }, removeAttribute(k){ delete _attrs[k]; } },
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => ({ innerHTML:'', querySelector: ()=>null, appendChild(){}, addEventListener(){} }),
  getElementById: () => null,
  addEventListener(){},
  dispatchEvent(){ return true; }
};
global.registerView = () => {};

/* core.js 的最小替代（flow.js 依赖 LS/K） */
global.LS = {
  get(k, d){ try{ const v = JSON.parse(localStorage.getItem(k)); return v ?? d; }catch(e){ return d; } },
  set(k, v){ localStorage.setItem(k, JSON.stringify(v)); }
};
global.K = { settings:'grdws_settings', log:'grdws_log', archive:'grdws_archive',
             ratings:'grdws_ratings', events:'grdws_events', persona:'grdws_persona' };

/* 假 fetch：记录请求并返回合规的 OpenAI 兼容响应 */
let calls = [];
let failWith = null;          // 非 null 时模拟 HTTP 错误
function installFetch(){
  calls = [];
  global.fetch = async (url, opt) => {
    calls.push({ url, body: JSON.parse(opt.body) });
    if(failWith !== null){
      return { ok:false, status: failWith, statusText:'Bad Request',
               text: async () => '{"error":{"message":"model not found"}}' };
    }
    const seat = JSON.stringify({ position:'先正式沟通一次。', key_reason:'沉没成本已形成',
      strongest_objection:'拖延即误事', would_change_mind:'若证实无资源则更换', confidence:0.7 });
    const mod = JSON.stringify({ attack:{ by:'御史大夫', target:'户部尚书', claim_challenged:'沉没成本', argument:'交叉质询' },
      record:{ answer:'暂不更换，本周沟通', confidence:0.7, options_considered:[], dissent:[], assumptions:[],
               evidence:[], open_questions:[], next_actions:['本周约谈导师'] } });
    const isMod = calls.length === 4;                 // 前 3 次成员、第 4 次主持人
    return { ok:true, status:200, json: async () => ({ choices:[{ message:{ content: isMod ? mod : seat } }] }) };
  };
}
installFetch();

const fs = require('fs');
(function(){
  eval(fs.readFileSync(__dirname + '/personality.js', 'utf8'));
  eval(fs.readFileSync(__dirname + '/flow.js', 'utf8') + '\n;global.__F = { fetchDebate, activeProvider };');
})();
const fetchDebate = (...a) => global.__F.fetchDebate(...a);

let pass = 0, fail = 0;
function T(name, cond){
  if(cond){ pass++; console.log('  ✓ ' + name); }
  else{ fail++; console.error('  ✗ ' + name); }
}
const withKey = () => { store['grdws_settings'] = JSON.stringify({ active:'deepseek', keys:{ deepseek:'sk-test' }, models:{} }); };
const noKey   = () => { delete store['grdws_settings']; };

(async ()=>{
  console.log('=== fetchDebate 调用链（曾致命的 P is not a function）===');
  withKey(); installFetch();
  let data = null, err = null;
  try{ data = await fetchDebate('我该不该换导师？'); }catch(e){ err = e; }
  T('不再抛 P is not a function', err === null && data !== null);
  T('返回三位成员', !!(data && data.seats && data.seats.length === 3));
  T('成员角色名取自人格配置', !!(data && data.seats.every(s => s.role && typeof s.role === 'string' && s.role.length > 1)));
  T('主持人决策记录完整', !!(data && data.record && data.record.answer && Array.isArray(data.record.next_actions)));
  T('共 4 次请求（3 成员并行 + 1 主持人）', calls.length === 4);
  T('使用配置的模型名', !!(calls[0] && calls[0].body.model === 'deepseek-chat'));
  T('Prompt 含人格系统设定', !!(calls[0] && /陛下|古代朝廷/.test(calls[0].body.messages[0].content)));

  console.log('=== 人格切换后角色名随之改变（守住遮蔽回归）===');
  global.applyPersona('corp');   // 现代公司：财务总监 / 风控总监 / 战略分析师
  installFetch();
  const corp = await fetchDebate('这个预算要不要砍');
  T('公司人格用财务总监等角色', !!(corp && corp.seats[0].role === '财务总监'));
  global.applyPersona('ming');
  installFetch();
  const ming = await fetchDebate('这个预算要不要砍');
  T('切回大明朝恢复户部尚书', !!(ming && ming.seats[0].role === '户部尚书'));

  console.log('=== 未配置 Key / 调用失败 ===');
  noKey();
  T('未配置 Key 时返回 null（交由界面走演示数据）', await fetchDebate('随便') === null);
  withKey(); installFetch(); failWith = 404;
  let msg = '';
  try{ await fetchDebate('x'); }catch(e){ msg = String(e.message); }
  failWith = null;
  T('HTTP 错误带状态码与响应体原文', msg.includes('404') && msg.includes('model not found'));
  T('错误信息不再只是 HTTP xxx（旧代码只报状态码）', msg.length > 20);

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})();
