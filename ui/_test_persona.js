/* ================= _test_persona.js：人格系统回归测试 =================
 * 验证：① 三套人格配置完整性  ② 视觉主题变量全覆盖  ③ 持久化
 *      ④ Prompt 注入  ⑤ 规谏文案/分类标签人格化  ⑥ 称谓与词表映射一致性
 * 运行：node _test_persona.js
 */
/* ---------- 最小 DOM / localStorage 桩 ---------- */
const store = {};
global.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }
};
global.window = global;
const _attrs = {}, _vars = {};
global.document = {
  documentElement: {
    style: { setProperty: (k, v) => { _vars[k] = v; }, getPropertyValue: k => _vars[k] },
    setAttribute: (k, v) => { _attrs[k] = v; },
    removeAttribute: k => { delete _attrs[k]; }
  },
  dispatchEvent(){ return true; },
  get _attrs(){ return _attrs; },
  get _vars(){ return _vars; }
};
global.CustomEvent = function(){ };
const fs = require('fs');
eval(fs.readFileSync(__dirname + '/personality.js', 'utf8'));
/* eval 内的 const 不会泄漏到模块作用域，统一走global 别名 */
const PA = global.PERSONAS;

let pass = 0, fail = 0;
function ok(cond, msg){ if(cond){ pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg); } }

/* ---------- 契约：所有人格必须提供的字段 ---------- */
const REQUIRED_VISUAL = [
  '--paper','--panel','--panel-2','--line','--ink','--muted','--red','--red-deep','--gold','--gold-soft',
  '--input-bg','--hover','--accent-soft','--btn-bg','--btn-bg-hover','--btn-ink','--btn-warn','--btn-pet',
  '--err','--ok','--sidebar-bg','--sidebar-ink','--sidebar-muted','--sidebar-item'
];
const REQUIRED_VOCAB = [
  'decision','suggestion','warning','task','completed',
  'council','riskPanel','knowledge','monitor','organize','adviceTitle','insightTitle'
];
const REQUIRED_NAV = [
  'tongzheng','court','hubu','xingbu','qijuzhu','libu','jianyuan','hanlin','persona','profile'
];
const REQUIRED_ADVICE = ['open','salutation','selfLabel','footer','evidenceLabel'];
const REQUIRED_VOICE  = ['night','longUse','overDep'];
const REQUIRED_VOICE_TYPES = ['night','longUse','overDep'];

console.log('=== ① 三套人格配置完整性 ===');
ok(PERSONA_ORDER.length === 3, `提供 ${PERSONA_ORDER.length} 套人格（要求 ≥3）`);
ok(PERSONA_ORDER.join() === 'ming,corp,fed', '人格 id：ming / corp / fed');

PERSONA_ORDER.forEach(id=>{
  const p = PA[id];
  const tag = `[${p.name}]`;
  ok(!!p.name && !!p.icon && !!p.tagline && !!p.intro, `${tag} 名称/图标/标语/介绍齐全`);
  ok(Array.isArray(p.keywords) && p.keywords.length>0, `${tag} 关键词 ${p.keywords.length} 个`);
  ok(typeof p.sample === 'string' && p.sample.includes(p.userTitle), `${tag} 示例文案含称谓「${p.userTitle}」`);
  ok(!!p.userTitle && !!p.aiTitle, `${tag} 称谓：称你「${p.userTitle}」· 自称「${p.aiTitle}」`);
  ['main','critic','executor','historian'].forEach(r=>{ if(!p.roles[r]) { fail++; console.log(`  ✗ ${tag} 缺角色 ${r}`); } });
  ok(['main','critic','executor','historian'].every(r=>p.roles[r]), `${tag} 四类角色名齐全`);
  REQUIRED_VOCAB.forEach(k=>{ if(!p.vocabulary[k]) { fail++; console.log(`  ✗ ${tag} 缺词表 ${k}`); } });
  ok(REQUIRED_VOCAB.every(k=>p.vocabulary[k]), `${tag} 词表 ${REQUIRED_VOCAB.length} 项齐全`);
  REQUIRED_NAV.forEach(k=>{ if(!p.nav[k]) { fail++; console.log(`  ✗ ${tag} 缺导航名 ${k}`); } });
  ok(REQUIRED_NAV.every(k=>p.nav[k]), `${tag} 导航名 ${REQUIRED_NAV.length} 项齐全`);
  REQUIRED_VISUAL.forEach(k=>{ if(!p.visualTheme[k]) { fail++; console.log(`  ✗ ${tag} 缺配色 ${k}`); } });
  ok(REQUIRED_VISUAL.every(k=>p.visualTheme[k]), `${tag} 配色 ${REQUIRED_VISUAL.length} 项齐全`);
  REQUIRED_ADVICE.forEach(k=>{ if(!p.advice[k]) { fail++; console.log(`  ✗ ${tag} 缺建议字段 ${k}`); } });
  ok(REQUIRED_ADVICE.every(k=>p.advice[k]), `${tag} 建议话术字段齐全`);
  REQUIRED_VOICE.forEach(k=>{ if(typeof p.usageVoice[k] !== 'function'){ fail++; console.log(`  ✗ ${tag} 缺规谏 ${k}`); } });
  ok(REQUIRED_VOICE.every(k=>typeof p.usageVoice[k]==='function'), `${tag} 规谏文案为函数（可插值）`);
  ok(REQUIRED_VOICE_TYPES.every(k=>p.usageVoice.types[k]), `${tag} 规谏分类标签齐全`);
  ok(typeof p.promptStyle === 'string' && p.promptStyle.length > 30, `${tag} Prompt 注入文案有效`);
  ok(p.promptStyle.includes(p.userTitle), `${tag} Prompt 内含称谓「${p.userTitle}」（真的会注入 AI）`);
});

console.log('\n=== ② 三套主题明显区分（风格不同，非仅换色）===');
const sig = id => [PA[id].visualTheme['--paper'], PA[id].visualTheme['--sidebar-bg'], PA[id].font, PA[id].radius].join('|');
ok(new Set(PERSONA_ORDER.map(sig)).size === 3, '三套主题的底色/侧栏/字体/圆角各不相同');
ok(PA.ming.allowLegacyTheme === true, '大明朝保留纸墨切换（宫墙/夜览/青瓷）');
ok(PA.corp.allowLegacyTheme === false && PA.fed.allowLegacyTheme === false, '公司/联邦自带完整配色，隐藏纸墨条');
// 亮/暗基调符合定位
const lum = id => { const c = PA[id].visualTheme['--paper'];
  const r=parseInt(c.slice(1,3),16),g=parseInt(c.slice(3,5),16),b=parseInt(c.slice(5,7),16);
  return 0.299*r+0.587*g+0.114*b; };
ok(lum('ming') > 200, `大明朝为米白亮基调（实测亮度 ${Math.round(lum('ming'))}）`);
ok(lum('corp') > 180, `现代公司为高级灰亮基调（实测亮度 ${Math.round(lum('corp'))}）`);
ok(lum('fed') < 60, `未来联邦为深色基调（实测亮度 ${Math.round(lum('fed'))}）`);

console.log('\n=== ③ 视觉主题真正套用到 CSS 变量 + data-persona ===');
applyPersona('fed');
ok(document._attrs['data-persona'] === 'fed', 'data-persona=fed 已写入 <html>');
ok(document._vars['--paper'] === PA.fed.visualTheme['--paper'], '--paper 已套用联邦深色');
ok(document._vars['--sidebar-bg'] === PA.fed.visualTheme['--sidebar-bg'], '--sidebar-bg 已套用');
ok(document._vars['--font'] === PA.fed.font, '--font 已套用联邦字体');
ok(document._vars['--radius'] === PA.fed.radius, '--radius 已套用联邦圆角');
ok(!('data-theme' in document._attrs), '切换到联邦后自动移除纸墨 data-theme（不串色）');

console.log('\n=== ④ 持久化：切换即存、重启读回 ===');
ok(store[PERSONA_KEY] === 'fed', '切换人格已写入 localStorage（重启可恢复）');
applyPersona('ming', { silent:true });
ok(store[PERSONA_KEY] === 'fed', 'silent 模式不覆盖用户已存选择');
ok(readPersonaId() === 'fed', 'readPersonaId 读回上次选择 = fed');
applyPersona('corp');
ok(readPersonaId() === 'corp', '再次切换后读回 = corp');
store[PERSONA_KEY] = 'nonexistent';
ok(readPersonaId() === 'ming', '非法人格 id 安全回落「大明朝」');

console.log('\n=== ⑤ 人格注入 AI 系统 Prompt ===');
PERSONA_ORDER.forEach(id=>{
  applyPersona(id);
  const pr = personaPrompt();
  ok(pr === PA[id].promptStyle && pr.includes(PA[id].userTitle),
     `${PA[id].name}：注入 Prompt 且含称谓「${PA[id].userTitle}」`);
});
ok(personaPrompt().includes('不要为了角色扮演而牺牲事实准确性') ||
   personaPrompt().includes('不要为了专业感而牺牲事实准确性') ||
   personaPrompt().includes('不要为了科幻感而牺牲事实准确性'),
   '三套 Prompt 均声明「不牺牲事实准确性」（人格不改事实）');

console.log('\n=== ⑥ 称谓 / 词表 / 角色名映射一致性 ===');
applyPersona('corp');
ok(P().userTitle === 'CEO' && vocab().decision === 'CEO 决策', '公司：CEO / CEO 决策');
ok(vocab().riskPanel === '风险委员会' && vocab().council === '董事会', '公司：董事会 / 风险委员会');
ok(roleName('户部尚书') === '财务总监', '公司：固化角色名 户部尚书 → 财务总监');
applyPersona('fed');
ok(P().userTitle === '指挥官' && vocab().knowledge === 'Knowledge Core', '联邦：指挥官 / Knowledge Core');
ok(vocab().monitor === 'Behavior Monitor' && vocab().riskPanel === '风险分析官', '联邦：Behavior Monitor / 风险分析官');
ok(roleName('御史大夫') === '风控官', '联邦：御史大夫 → 风控官');
applyPersona('ming');
ok(roleName('御史大夫') === '御史大夫', '大明朝：无映射时原样返回（不破坏固化数据）');
ok(navName('qijuzhu') === '起居注' && navName('hanlin') === '翰林院', '大明朝导航名正确');
applyPersona('corp');
ok(navName('qijuzhu') === '决策日志' && navName('hanlin') === '知识库', '公司导航名同步切换（起居注→决策日志）');
applyPersona('fed');
ok(navName('hanlin') === 'Knowledge Core' && navName('jianyuan') === '风险分析官', '联邦导航名同步切换');
applyPersona('ming');

console.log('\n=== ⑦ 规谏文案与分类标签随人格切换 ===');
const voices = {};
PERSONA_ORDER.forEach(id=>{
  applyPersona(id);
  const uv = P().usageVoice;
  voices[id] = `${uv.night(2)}|${uv.longUse()}|${uv.overDep(5)}|${uv.types.night}`;
  ok(!/陛下|臣|龙体|圣裁/.test(voices[id]) || id === 'ming',
     `${P().name}：${id==='ming' ? '保留古风称谓（正确）' : '无大明专属词泄漏'}`);
});
ok(new Set(Object.values(voices)).size === 3, '三套人格的规谏文案与标签互不相同');
applyPersona('corp');
ok(P().usageVoice.types.night === '深夜使用', '公司：分类标签=深夜使用（非「熬夜」）');
applyPersona('fed');
ok(P().usageVoice.types.night === '低负荷时段', '联邦：分类标签=低负荷时段');

console.log('\n=== ⑧ 桌宠台词人格化（petVoice / petPhrase）===');
PERSONA_ORDER.forEach(id=>{
  applyPersona(id);
  const keys = ['greet','happy','shy','surprised','wave','read','wake','ruling','bond','idle'];
  const missing = keys.filter(k=>!PA[id].petVoice.phrases[k]);
  ok(missing.length===0, `${P().name}：petVoice 台词 ${keys.length} 类齐全`);
  const st = ['idle','happy','shy','surprised','wave','read','sleep'];
  ok(st.every(k=>PA[id].petVoice.states[k]), `${P().name}：状态标签 ${st.length} 个齐全`);
});
['corp','fed'].forEach(id=>{
  applyPersona(id);
  const leaks = ['greet','happy','shy','surprised','wave','read','wake','ruling','bond','idle']
    .map(k=>petPhrase(k)).filter(t=>/陛下|臣女|圣裁|龙体|起居注/.test(t));
  ok(leaks.length===0, `${P().name}：桌宠台词无大明专属词${leaks.length?' << '+leaks.join(' | '):''}`);
});
applyPersona('ming');
ok(/陛下|臣女/.test(petPhrase('greet')), '大明朝：桌宠台词保留古风称谓（正确）');
ok(petPhrase('greet').length>0, 'petPhrase 总能返回非空文案');

console.log('\n=== ⑨ 人格键存储格式容错（浮窗不跟随的真实根因）===');
/*历史上grdws_persona 存在两种格式：裸串（applyPersona 写）与
   JSON 串（若被主窗口 LS.set 这类 JSON 包装器写入）。两种都要能读，
   否则浮窗读不到会静默回落大明朝，表现为「主窗口换了皮肤、浮窗没换」。*/
[['corp','corp'],['"corp"','corp'],['fed','fed'],['"fed"','fed'],
 ['ming','ming'],['"ming"','ming'],['bogus','ming'],['"bogus"','ming'],[null,'ming']]
 .forEach(([raw, expect])=>{
   if(raw === null) delete store[PERSONA_KEY];
   else store[PERSONA_KEY] = raw;
   const got = readPersonaId();
   ok(got === expect, `存储值 ${raw===null?'(无记录)':JSON.stringify(raw)} → ${expect}${got===expect?'':'  实得 '+got}`);
});
/* 跨窗口：主窗口写入后，浮窗应能读到并发现变化 */
store[PERSONA_KEY] = 'fed';
ok(readPersonaId()==='fed', '浮窗读到主窗口选择的「未来联邦」');
let _cur = readPersonaId();
store[PERSONA_KEY] = '"corp"';           // 模拟另一路径用 JSON 包装写入
ok(readPersonaId() !== _cur && readPersonaId()==='corp',
   '轮询能发现 JSON 格式的人格变化（修复前会误判为「未变化」而永不更新）');
PERSONA_ORDER.forEach(id=>{
  store[PERSONA_KEY] = id;
  applyPersona(id, { silent:true });
  ok(readPersonaId()===id && document._attrs['data-persona']===id,
     `${PA[id].name}：存储→读取→套色 链路完整`);
});

console.log('\n=== ⑪ 非法人格 id 不得污染存储（"切了皮肤又被弹回"的真正根因）===');
/* 实机排查发现：localStorage 里grdws_persona 出现过 ming→corp→ming 的回退序列。
   根因是 applyPersona 里 `PERSONAS[id] || PERSONAS.ming` —— 遇到无法识别的 id 时，
   会静默套用大明朝**并把存储写回 'ming'**，把用户刚选的人格持久化地抹掉。
   正解：非法 id 直接拒绝套用，让调用方继续沿用当前人格。 */
/* ① 非法字符串 id */
store[PERSONA_KEY] = 'corp';
const _r1 = applyPersona('bogus_id');
ok(_r1 === null, 'applyPersona 对非法 id 返回 null（而非回落到大明朝对象）');
ok(store[PERSONA_KEY] === 'corp', '非法 id 不污染存储（corp 未被覆盖成 ming）');
ok(document._attrs['data-persona'] !== 'ming', '非法 id 不套用大明朝配色');

/* ② undefined / null / 空串 —— 常见于事件 payload 取值失败 */
[['undefined', undefined], ['null', null], ['空串', ''], ['数字', 0]].forEach(([label, bad])=>{
  store[PERSONA_KEY] = 'fed';
  applyPersona(bad, { silent:false });
  ok(store[PERSONA_KEY] === 'fed', `${label} 类型的非法 id 不污染存储（fed 保持）`);
});

/* ③ 模拟实机回退序列：切到 corp 后被非法调用打断，corp 必须存活 */
store[PERSONA_KEY] = 'ming';
applyPersona('corp');                       // 用户点卡片
applyPersona('undefined_like');             // 某窗口误传
ok(store[PERSONA_KEY] === 'corp' && readPersonaId()==='corp',
   '实机回退场景：切到 corp 后经历非法调用，corp 未被弹回大明朝');

/* ④ 对象/数组等引用类型传入也不能污染 */
store[PERSONA_KEY] = 'fed';
applyPersona({ toString(){ return 'corp'; } });
ok(store[PERSONA_KEY] === 'fed', '对象型id 不污染存储（不会被 toString 欺骗）');
applyPersona(['corp']);
ok(store[PERSONA_KEY] === 'fed', '数组型 id 不污染存储');

/* ④b 原型链键：PERSONAS['constructor'] / ['toString'] 会命中 Object.prototype，
      把垃圾存储值当成合法人格读出来。必须用 hasOwnProperty 拦住。 */
['constructor','toString','valueOf','hasOwnProperty'].forEach(k=>{
  store[PERSONA_KEY] = k;
  const got = readPersonaId();
  const isReal = Object.prototype.hasOwnProperty.call(PA, got);
  ok(isReal, `原型链键 "${k}" 不会读成合法人格（得到 ${got}）`);
});
store[PERSONA_KEY] = '"constructor"';
ok(Object.prototype.hasOwnProperty.call(PA, readPersonaId()),
   'JSON 包装的原型链键同样被拦住');

/* ⑤ 合法 id 仍然正常写入（确认修复没有把正常路径也堵死） */
applyPersona('ming', { silent:false });
ok(store[PERSONA_KEY] === 'ming' && document._attrs['data-persona'] === 'ming', '合法 id 仍能正常套用并持久化');
applyPersona('corp', { silent:false });
ok(store[PERSONA_KEY] === 'corp' && document._attrs['data-persona'] === 'corp', '切到 corp 正常生效');
applyPersona('fed',  { silent:false });
ok(store[PERSONA_KEY] === 'fed'  && document._attrs['data-persona'] === 'fed',  '切到 fed 正常生效');

/* ---------- 桌宠精灵分人格目录：静态校验（不依赖 DOM） ---------- */
const fs2 = require('fs');
const path2 = require('path');
const PET_STATES = ['idle','happy','shy','surprised','wave','read','sleep'];
console.log('\n=== ⑫ 桌宠精灵按人格分目录（形象也是人格的一部分）===');
['ming','corp','fed'].forEach(pid=>{
  const dir = path2.join(__dirname, 'pet_sprites', pid);
  const missing = PET_STATES.filter(st => !fs2.existsSync(path2.join(dir, st + '.png')));
  ok(fs2.existsSync(dir), `${PA[pid].name}（${pid}）精灵目录存在`);
  ok(missing.length === 0,
     `${PA[pid].name} 七个状态切片齐全${missing.length?'（缺 '+missing.join(',')+'）':''}`);
});
/* pet.html 必须按人格取路径，而不是写死根目录 */
const petHtml = fs2.readFileSync(path2.join(__dirname, 'pet.html'), 'utf8');
ok(/pet_sprites\/'\s*\+\s*id\s*\+\s*'\/'/.test(petHtml) || /SPRITE_ROOT\s*\+\s*id/.test(petHtml),
   'pet.html 按人格 id 拼接精灵目录（形象随人格切换）');
ok(/syncPetPersona[\s\S]{0,900}CUR_DIR\s*=\s*dir/.test(petHtml),
   '切人格时会切换精灵目录并重载当前切片');
ok(!/<img[^>]*src=["']pet_sprites\/idle\.png["']/.test(petHtml),
   'HTML 里不再写死 idle.png 初始路径（否则首帧会闪大明朝形象）');

console.log(`\n===== 结果：${pass} 项通过，${fail} 项失败 =====`);
process.exit(fail ? 1 : 0);