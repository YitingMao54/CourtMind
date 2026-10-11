/* 行为画像引擎逻辑测试：用 Node 模拟 localStorage，验证六项指标与建议生成 */
const store = {};
global.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }
};
global.window = global;
const _attrs = {};
global.document = {
  documentElement: { style:{ setProperty(){} }, setAttribute(k,v){ _attrs[k]=v; }, removeAttribute(k){ delete _attrs[k]; } },
  dispatchEvent(){ return true; },
  get _attrs(){ return _attrs; }
};
global.CustomEvent = function(){ };

const fs = require('fs');
eval(fs.readFileSync(__dirname + '/behavior.js', 'utf8'));
eval(fs.readFileSync(__dirname + '/personality.js', 'utf8'));

/* ---- 造 30 天真实感数据：白天为主、部分夜间、若干任务 ---- */
const p = n => String(n).padStart(2, '0');
function key(d){ return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`; }
const now = new Date();
const days = {};
for (let i = 29; i >= 0; i--) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
  const hours = Array(24).fill(0);
  const weekday = d.getDay() >= 1 && d.getDay() <= 5;
  // 每天 3~5 小时白天活跃 + 偶尔夜间
  const blocks = weekday ? [9, 10, 11, 14, 15, 16] : [10, 15, 16, 20];
  blocks.forEach(h => { if (Math.random() > .25) hours[h] += 12 + Math.random()*20; });
  if (i % 4 === 0) { hours[23] += 25; hours[1] += 18; }   // 制造夜间活跃
  const minutes = hours.reduce((a, b) => a + b, 0);
  days[key(d)] = { minutes, hours, debates: Math.floor(Math.random()*4), aiCalls: Math.floor(Math.random()*5),
    filesScanned: i % 3 === 0 ? 1 : 0, filesMoved: i % 3 === 0 ? 12 : 0,
    tasksCreated: 0, tasksDone: 0, decisions: Math.floor(Math.random()*2), executed: 0 };
  if (i % 2 === 0) days[key(d)].executed = days[key(d)].decisions;
}
store['grdws_behavior'] = JSON.stringify({ v: 1, days, tasks: [], insights: [] });

/* ---- 任务：创建 10 个，完成 6 个，其中 3 个卡点完成 ---- */
const tasks = [];
for (let i = 0; i < 10; i++) {
  const createdAt = Date.now() - (25 - i*2) * 864e5;
  const dueAt = createdAt + 5 * 864e5;
  let doneAt = null;
  if (i < 6) doneAt = i < 3 ? dueAt - 6*36e5 : createdAt + 864e5;  // 前 3 个：截止前 6 小时（临期）
  tasks.push({ id: 't' + i, title: '任务' + i, createdAt, dueAt, doneAt, from: 'zhupi' });
}
store['grdws_behavior'] = JSON.stringify({ v: 1, days, tasks, insights: [] });

console.log('=== 六项指标 ===');
const prof = analyzeBehavior(30);
prof.metrics.forEach(m => {
  console.log(`${m.label.padEnd(12)}: ${m.value === null ? 'null（无数据）' : m.value + (m.unit || '')}`);
  if (m.basis) m.basis.forEach(b => console.log('    · ' + b));
});

console.log('\n=== 趋势 ===');
console.log(prof.trends, '\n幅度:', prof.deltas);

console.log('\n=== 24h 分布（有值小时）===');
prof.hours.forEach((h, i) => { if (h > 0) console.log(`  ${p(i)}:00 → ${Math.round(h)} 分钟`); });

console.log('\n=== 热力图 ===');
console.log('周数:', prof.heatmap.weeks.length, '峰值:', Math.round(prof.heatmap.max));
const firstRow = prof.heatmap.weeks[prof.heatmap.weeks.length - 1].filter(Boolean);
console.log('最早一周样本:', firstRow.slice(0,3).map(c => `${c.date}:L${heatLevel(c.score, prof.heatmap.max)}`).join(' '));

console.log('\n=== 行为结论 ===');
prof.insights.forEach(i => console.log(`  [${i.tone}] ${i.text}`));

console.log('\n=== 谏院建议（大明朝）===');
buildAdvice(prof).forEach(a => console.log(`  事实：${a.fact}\n  建议：${a.advice}`));

console.log('\n=== 人格切换：建议文案随之变化（分析逻辑不变）===');
PERSONA_ORDER.forEach(id => {
  applyPersona(id);   // 非静默：真实持久化，模拟用户点击切换
  const a = buildAdvice(prof)[0];
  console.log(`  [${PERSONAS[id].name}] data-persona=${document._attrs['data-persona']}`);
  console.log(`     称谓=${P().userTitle} 决策=${vocab().decision} 风险面板=${vocab().riskPanel} 标题=${P().advice.open}`);
  console.log(`     事实：${a.fact}`);
  console.log(`     ${P().advice.selfLabel}${a.advice}`);
  console.log(`     Prompt 首行：${personaPrompt().split('\n')[0]}`);
});

console.log('\n=== 7 天窗口 ===');
const p7 = analyzeBehavior(7);
console.log('  指标:', p7.metrics.map(m => `${m.label}=${m.value}`).join('  '));
console.log('  序列点数(focus):', p7.metrics[0].series.length, ' 序列(30天):', prof.metrics[0].series.length);

console.log('\n=== 空数据边界 ===');
store['grdws_behavior'] = JSON.stringify({ v: 1, days: {}, tasks: [], insights: [] });
const empty = analyzeBehavior(30);
console.log('  hasData:', empty.hasData, ' 指标全为 null:', empty.metrics.every(m => m.value === null));
console.log('  建议:', JSON.stringify(buildAdvice(empty)));
