/* ================= flow.js：通政司（呈奏/意图识别）→ 上朝（辩论）→ 朱批 ================= */

/* 提示词模板：接真实大模型 API 时直接使用 */
const PROMPTS = {
  seat(name, lens, question){
    return `你是${name}，是议事会中负责「${lens}」这一视角的臣子。议题：${question}
你的价值在于提出别人没想到的考虑。不要复述问题、不要客套、不要笼统说"看情况"而不说看什么情况。
一段只讲一个主张，每个主张给出最强理由。表达不确定时给出数字化的信心（0到1）。
如果发现你的立场和别人重复，就换一个最少被想到、但可辩护的立场。绝不编造来源、数据或引文。
只返回 JSON 对象 {"position":"","key_reason":"","strongest_objection":"","would_change_mind":"","confidence":0.0}，不要任何前言、代码块或多余的话。`;
  },
  moderator(question, seatsJson){
    return `你是议事会的主持人（通政司）。你本人不参与辩论，只负责：拆解问题、主持质询、判断何时收敛、并写出供用户执行的决策记录。你精确、简洁、对分歧公正。
议题：${question}
三位臣子的立场：${seatsJson}
请返回 JSON 对象：
{"attack":{"by":"御史大夫","target":"某臣子","claim_challenged":"被挑战的主张","argument":"交叉质询，指出该主张最强的漏洞"},
 "record":{"answer":"结论","confidence":0.0,"options_considered":[{"option":"","why_not":""}],"dissent":[{"seat":"","position":"","why_not_carried":""}],"assumptions":[""],"evidence":[{"claim":"","source":""}],"open_questions":[""],"next_actions":[""]}}
不要任何前言、代码块或多余的话。`;
  }
};

/* ================= 主流大模型服务商（均为聊天补全 API；未配置 key 时回退固化数据） ================= */
const PROVIDERS = {
  deepseek: { name:'DeepSeek',        base:'https://api.deepseek.com/chat/completions',                                        model:'deepseek-chat',     style:'openai' },
  kimi:     { name:'Kimi（月之暗面）', base:'https://api.moonshot.cn/v1/chat/completions',                                      model:'moonshot-v1-8k',    style:'openai' },
  qwen:     { name:'通义千问',         base:'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',               model:'qwen-plus',         style:'openai' },
  glm:      { name:'智谱 GLM',        base:'https://open.bigmodel.cn/api/paas/v4/chat/completions',                            model:'glm-4-flash',       style:'openai' },
  openai:   { name:'OpenAI GPT',      base:'https://api.openai.com/v1/chat/completions',                                       model:'gpt-4o-mini',       style:'openai' },
  gemini:   { name:'Google Gemini',   base:'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',         model:'gemini-2.0-flash',  style:'openai' },
  claude:   { name:'Anthropic Claude',base:'https://api.anthropic.com/v1/messages',                                            model:'claude-sonnet-4-5', style:'anthropic' },
};

/* 读取设置（兼容旧版单 deepseekKey 存储，自动迁移到多服务商结构） */
function getSettings(){
  const s = LS.get(K.settings, {});
  if(s.deepseekKey && !s.keys){ s.keys = { deepseek: s.deepseekKey }; }
  s.keys = s.keys || {}; s.models = s.models || {}; s.active = s.active || 'deepseek';
  return s;
}
/* 当前启用的服务商配置；未填 key 返回 null（走固化数据） */
function activeProvider(){
  const s = getSettings();
  const p = PROVIDERS[s.active] || PROVIDERS.deepseek;
  const key = (s.keys[s.active] || '').trim();
  const model = (s.models[s.active] || '').trim() || p.model;
  return key ? Object.assign({}, p, { key, model }) : null;
}

/* ================= 固化辩论数据（演示稳定用；接 API 后自动实时生成） ================= */
const SCENARIOS = {
  '该不该换导师？': {
    routing: '决策类',
    seats: [
      { role:'户部尚书', lens:'成本', confidence:0.65,
        position:'暂不更换，先与导师正式沟通一次。',
        key_reason:'一年投入的实验数据与人脉已形成转换成本，贸然更换等于沉没成本尽弃。',
        strongest_objection:'若导师已无资源可授，拖延一年即是误了前途。',
        would_change_mind:'若证实导师压榨、或方向彻底不符我的规划，则立即启动更换。' },
      { role:'御史大夫', lens:'风险', confidence:0.60,
        position:'先列一份「留/走」利弊清单，若走之失皆可承受，则走。',
        key_reason:'谨防以"再忍忍"自欺；真正的风险不是换，而是拖着不决。',
        strongest_objection:'换导师本身有不确定性，新导师可能同样不合。',
        would_change_mind:'若现有导师能明确给出资源与方向承诺，则暂留。' },
      { role:'翰林学士', lens:'发展', confidence:0.70,
        position:'以"三年后我想站在哪里"为准来定夺。',
        key_reason:'换与不换都应服务长期目标：深造看发文能力，就业看项目与实习。',
        strongest_objection:'长期目标本身也可能变，不能过度依赖一个不确定的远景。',
        would_change_mind:'若两条路径对长期目标差别不大，则以短期舒适度为优先。' },
    ],
    attack: { by:'御史大夫', target:'户部尚书',
      claim_challenged:'"一年投入已是沉没成本，不宜更换"',
      argument:'这是沉没成本谬误——已投入的成本不该决定未来选择，真正该算的是未来边际收益。若留下毫无增长，继续"不换"才是最大的损失。' },
    record: {
      answer:'暂不仓促更换：本周内与导师正式沟通并列出「留/走」利弊清单；两周后若证实无资源可授或方向不符，再启动更换。',
      confidence:0.7,
      options_considered:[
        {option:'立即更换导师', why_not:'未先沟通可能误判，且已有人脉与数据投入'},
        {option:'继续忍耐、不动作', why_not:'若方向不符，将白白耽误一年'} ],
      dissent:[ {seat:'御史大夫', position:'主张"当断则断"，方向不符应尽早走', why_not_carried:'多数意见认为应先沟通取证，而非立即决断'} ],
      assumptions:['现导师尚有资源可授','一次正式沟通能改善关系'],
      evidence:[ {claim:'已投入的实验数据与人脉构成转换成本', source:'个人经历'} ],
      open_questions:['沟通后导师是否愿意调整方向？','若更换，目标导师名额能否确定？'],
      next_actions:['本周内约定一次正式沟通','列出留/走利弊清单','两周后复查决定'],
    }
  },
  '选 A 课题还是 B 课题？': {
    routing: '决策类',
    seats: [
      { role:'户部尚书', lens:'成本', confidence:0.65,
        position:'选 A，数据易得、周期短、出成果快。',
        key_reason:'当前课业压力下，A 的投入产出比最高。',
        strongest_objection:'A 的创新性存疑，恐难发好刊。',
        would_change_mind:'若 A 已被证实无法发表，则改选 B。' },
      { role:'御史大夫', lens:'风险', confidence:0.60,
        position:'慎选 A，B 虽难但壁垒高、更值得一搏。',
        key_reason:'A 已有前人做过，创新性不足是硬伤。',
        strongest_objection:'B 风险大，可能最终做不出。',
        would_change_mind:'若两周预实验证明 B 做不通，则退守 A。' },
      { role:'翰林学士', lens:'发展', confidence:0.70,
        position:'先做两周双课题预实验，用数据定夺。',
        key_reason:'不要拍脑袋，真实数据比空想可靠。',
        strongest_objection:'双线并行会分散精力。',
        would_change_mind:'若时间实在不允许并行，则以"能出结果"为唯一标准。' },
    ],
    attack: { by:'御史大夫', target:'翰林学士',
      claim_challenged:'"两周双课题预实验"',
      argument:'两周双线可能两头都浅尝辄止，产出不达标；应把预实验聚焦在"判断创新性"这一件事上，而非两个课题都铺开。' },
    record: {
      answer:'用两周做聚焦预实验（重点验证 B 的创新性与可行性），若 B 可行则选 B，否则退守 A。',
      confidence:0.65,
      options_considered:[ {option:'直接选 A', why_not:'创新性不足'}, {option:'直接选 B', why_not:'风险过大'} ],
      dissent:[ {seat:'户部尚书', position:'主张直接选 A 求稳', why_not_carried:'多数认为应先用数据验证，而非只求稳妥'} ],
      assumptions:['预实验两周足够给出信号','导师支持双课题探索'],
      evidence:[ {claim:'A 课题已有同类工作', source:'文献检索'} ],
      open_questions:['B 课题的核心难点是否可攻克？','导师对 B 的支持力度如何？'],
      next_actions:['制定两周预实验计划','与导师确认选题方向'],
    }
  },
  '要不要参加这个比赛？': {
    routing: '决策类',
    seats: [
      { role:'户部尚书', lens:'成本', confidence:0.60,
        position:'若一周内可出 MVP 且不影响主线，可参加。',
        key_reason:'投入产出比尚可。',
        strongest_objection:'比赛可能挤占学业与研究时间。',
        would_change_mind:'若预估投入超过一周，则弃。' },
      { role:'御史大夫', lens:'风险', confidence:0.65,
        position:'警惕"参加感"自我感动，与主线无关则弃。',
        key_reason:'分散精力是大学生最常见的隐性损失。',
        strongest_objection:'比赛也能锻炼能力。',
        would_change_mind:'若比赛内容与专业方向强相关，则可参加。' },
      { role:'翰林学士', lens:'发展', confidence:0.70,
        position:'可参加，但设止损线，为成长而战。',
        key_reason:'低成本试错与组队练习的机会难得。',
        strongest_objection:'可能被"拿奖"裹挟，偏离初心。',
        would_change_mind:'若团队氛围或目标变质，则退出。' },
    ],
    attack: { by:'御史大夫', target:'翰林学士',
      claim_challenged:'"低成本试错机会难得"',
      argument:'机会永远都有，但时间是一次性的；若这个比赛与主线无关，所谓"低成本"其实是拿最稀缺的时间去换低价值经历。' },
    record: {
      answer:'可参加，但一周内先做出 MVP 判断可行性，并设止损线；若与主线冲突则及时退出。',
      confidence:0.65,
      options_considered:[ {option:'全力参赛', why_not:'可能挤占主线时间'}, {option:'完全不参加', why_not:'错失试错机会'} ],
      dissent:[ {seat:'御史大夫', position:'主张与主线无关则不参加', why_not_carried:'多数认为应以一周 MVP 试水后再决'} ],
      assumptions:['一周足够评估可行性'],
      evidence:[ {claim:'组队比赛能低成本锻炼协作', source:'个人经历'} ],
      open_questions:['比赛的含金量与评审标准如何？','能否在一周内组齐靠谱队友？'],
      next_actions:['一周内做出 MVP','明确止损线与退出条件'],
    }
  }
};

const FALLBACK = {
  routing: '决策类',
  seats: [
    { role:'户部尚书', lens:'成本', confidence:0.6, position:'先算投入产出，代价高而收益未明则缓行。', key_reason:'资源有限，须先算账。', strongest_objection:'有些价值无法用成本衡量。', would_change_mind:'若收益明确，则支持推进。' },
    { role:'御史大夫', lens:'风险', confidence:0.6, position:'先想最坏情况，若有不可逆损失则三思。', key_reason:'风险常在看不见处。', strongest_objection:'过度避险会错失机会。', would_change_mind:'若风险可控且可逆，则放行。' },
    { role:'翰林学士', lens:'发展', confidence:0.7, position:'以终为始，看此事对齐的是长期还是短期。', key_reason:'方向比速度重要。', strongest_objection:'长期目标本身也可能变。', would_change_mind:'若短期收益能反哺长期，则可做。' },
  ],
  attack: { by:'御史大夫', target:'户部尚书', claim_challenged:'"先算成本再决定"', argument:'纯成本视角会漏掉难以量化的长期价值；决策不能只看账本，还要看这件事会不会改变你的能力或方向。' },
  record: {
    answer:'先列出利弊与最坏情况，明确是否可逆，再作决断。', confidence:0.6,
    options_considered:[ {option:'立即推进', why_not:'代价与风险未明'}, {option:'搁置', why_not:'可能错失机会'} ],
    dissent:[ {seat:'御史大夫', position:'主张先论证最坏情况', why_not_carried:'多数认为应在评估后尽快决断，避免拖延'} ],
    assumptions:['信息足以做出判断'], evidence:[], open_questions:['这件事最坏结果是什么？','是否可逆？'], next_actions:['列出利弊清单','三天内复查决定'],
  }
};

/* ================= 通政司：意图识别（关键词 + 规则） ================= */
function routeIntent(text){
  if(/(文件|下载|C盘|整理|归档|桌面)/.test(text)) return '文件类';
  if(/(提醒|DDL|记得|日程|考试|截止|倒计时)/.test(text)) return '提醒类';
  return '决策类';
}
const ROUTE_MOD = { '决策类':'上朝', '文件类':'户部', '提醒类':'起居注' };

/* ================= 实时辩论（可选；未配置 key 或失败时回退固化数据） ================= */
async function fetchDebate(question){
  const P = activeProvider();
  if(!P) return null;
  const call = async (sys, user) => {
    const ctrl = new AbortController();
    const timer = setTimeout(()=>ctrl.abort(), 45000);
    try{
      let text;
      if(P.style === 'anthropic'){
        const res = await fetch(P.base, {
          method:'POST',
          headers:{ 'Content-Type':'application/json', 'x-api-key':P.key,
            'anthropic-version':'2023-06-01', 'anthropic-dangerous-direct-browser-access':'true' },
          body: JSON.stringify({ model:P.model, temperature:1.2, max_tokens:2000,
            system:sys, messages:[{role:'user',content:user}] }),
          signal: ctrl.signal
        });
        if(!res.ok) throw new Error('HTTP '+res.status);
        const j = await res.json();
        text = (j.content||[]).map(c=>c.text||'').join('');
      } else { // OpenAI 兼容格式：DeepSeek/Kimi/千问/GLM/GPT/Gemini 通用
        const res = await fetch(P.base, {
          method:'POST',
          headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer '+P.key },
          body: JSON.stringify({ model:P.model, temperature:1.2,
            messages:[{role:'system',content:sys},{role:'user',content:user}] }),
          signal: ctrl.signal
        });
        if(!res.ok) throw new Error('HTTP '+res.status);
        const j = await res.json();
        text = j.choices[0].message.content;
      }
      const m = String(text).match(/\{[\s\S]*\}/);
      if(!m) throw new Error('返回非 JSON');
      return JSON.parse(m[0]);
    } finally { clearTimeout(timer); }
  };

  const roles = [
    { role:'户部尚书', lens:'成本' },
    { role:'御史大夫', lens:'风险' },
    { role:'翰林学士', lens:'发展' },
  ];
  // 第一轮：三臣独立进奏（互不见对方观点，避免立场趋同）
  const seats = await Promise.all(roles.map(async r=>{
    const c = await call(PROMPTS.seat(r.role, r.lens, question), question);
    return { role:r.role, lens:r.lens, confidence:Math.min(1,Math.max(0,+c.confidence||0.6)),
      position:String(c.position||''), key_reason:String(c.key_reason||''),
      strongest_objection:String(c.strongest_objection||''), would_change_mind:String(c.would_change_mind||'') };
  }));
  // 第二轮：通政司主持质询并合议
  const mod = await call(PROMPTS.moderator(question, JSON.stringify(seats.map(s=>({role:s.role,position:s.position})))), question);
  const rec = mod.record||{};
  return {
    routing:'决策类', seats,
    attack: { by:(mod.attack&&mod.attack.by)||'御史大夫', target:(mod.attack&&mod.attack.target)||seats[0].role,
      claim_challenged:(mod.attack&&mod.attack.claim_challenged)||seats[0].position.slice(0,20),
      argument:(mod.attack&&mod.attack.argument)||'' },
    record: { answer:String(rec.answer||''), confidence:Math.min(1,Math.max(0,+rec.confidence||0.6)),
      options_considered:rec.options_considered||[], dissent:rec.dissent||[],
      assumptions:rec.assumptions||[], evidence:rec.evidence||[],
      open_questions:rec.open_questions||[], next_actions:rec.next_actions||[] }
  };
}

/* ================= 呈奏视图 ================= */
registerView('flow', function renderFlow(){
  const s = document.createElement('section');
  const st = getSettings();
  s.innerHTML = `
    <header><h2>呈奏</h2><p>写下你的烦心事，通政司识别类别并转呈对应衙门。</p></header>
    <div class="card"><h3>通政司 · 上书房</h3>
      <textarea id="input" placeholder="例：我该不该换导师？"></textarea>
      <div class="chips">${Object.keys(SCENARIOS).map(k=>`<button class="chip" data-q="${k}">${k}</button>`).join('')}</div>
      <button class="btn" id="submit">呈 奏</button>
      <div class="settings">
        <div class="row">
          <span>臣子直谏（选服务商并填 API Key 后，新议题将实时辩论；Key 仅存本机，留空则用固化数据）：</span>
        </div>
        <div class="row" style="margin-top:8px;">
          <select id="ds-provider">${Object.entries(PROVIDERS).map(([id,p])=>`<option value="${id}" ${st.active===id?'selected':''}>${p.name}</option>`).join('')}</select>
          <input type="password" id="ds-key" placeholder="API Key（sk-...）" value="${escapeHtml(st.keys[st.active]||'')}">
          <input type="text" id="ds-model" placeholder="模型名（留空用默认）" value="${escapeHtml(st.models[st.active]||'')}">
          <button class="btn small secondary" id="ds-save">保存</button>
          <span id="ds-status" class="muted-note" style="margin-top:0;"></span>
        </div>
      </div>
    </div>
    <div id="stage"></div>`;
  main.appendChild(s);
  const stage = document.getElementById('stage');
  const input = document.getElementById('input');

  // 切换服务商时，回填该服务商已保存的 key 与模型
  function dsStatus(){
    const p = activeProvider();
    s.querySelector('#ds-status').textContent = p ? `已启用：${p.name} · ${p.model}` : '未启用（用固化数据）';
  }
  s.querySelector('#ds-provider').addEventListener('change', e=>{
    const id = e.target.value, cur = getSettings();
    s.querySelector('#ds-key').value = cur.keys[id]||'';
    s.querySelector('#ds-model').value = cur.models[id]||'';
  });
  s.querySelector('#ds-save').addEventListener('click', ()=>{
    const id = s.querySelector('#ds-provider').value, cur = getSettings();
    cur.active = id;
    cur.keys[id] = s.querySelector('#ds-key').value.trim();
    cur.models[id] = s.querySelector('#ds-model').value.trim();
    LS.set(K.settings, cur);
    dsStatus();
  });
  dsStatus();

  function go(q){
    const text = (q || input.value || '').trim();
    if(!text){ input.focus(); return; }
    const intent = routeIntent(text);
    animToken++; const token = animToken;
    stage.innerHTML = '';
    const route = document.createElement('div');
    route.className = 'route';
    route.innerHTML = `<span>通政司：已识别为【${intent}】，拟转呈 <b class="arrow">${ROUTE_MOD[intent]}</b></span>
      <span class="actions"><button class="btn secondary small" id="confirm">确认</button>
      <button class="btn secondary small" id="adjust">手动调整</button></span>`;
    stage.appendChild(route);
    route.querySelector('#confirm').addEventListener('click', ()=>{
      if(token!==animToken) return;
      route.querySelector('.actions').innerHTML = '<span style="font-size:13px;color:var(--red-deep);">已转呈</span>';
      if(intent!=='决策类'){ showNonDebate(stage, intent); return; }
      const cached = SCENARIOS[q || text];
      if(cached){ runCouncil(stage, cached, text, token, false); return; }
      // 未命中的新问题：已启用大模型则实时议事，否则回退固化数据
      const P = activeProvider();
      if(P){
        const loading = document.createElement('div');
        loading.className = 'loading-note';
        loading.textContent = `通政司：新议题，正召集群臣实时议事（${P.name} · ${P.model}）…`;
        stage.appendChild(loading);
        fetchDebate(text).then(data=>{
          if(token!==animToken) return;
          loading.remove();
          runCouncil(stage, data || FALLBACK, text, token, !data);
        }).catch(()=>{
          if(token!==animToken) return;
          loading.remove();
          runCouncil(stage, FALLBACK, text, token, true);
        });
      } else {
        runCouncil(stage, FALLBACK, text, token, false);
      }
    });
    route.querySelector('#adjust').addEventListener('click', ()=>{
      input.focus();
      route.querySelector('.actions').innerHTML = '<span style="font-size:12px;color:var(--muted);">请重新描述，通政司将再次识别</span>';
    });
  }
  document.getElementById('submit').addEventListener('click', ()=>go());
  s.querySelectorAll('.chip').forEach(c=>c.addEventListener('click', ()=>go(c.dataset.q)));
});

/* ---------- 上朝：结构化议事（立场 → 质询 → 合议决策记录） ---------- */
function runCouncil(stage, data, question, token, apiFailed){
  window.__countDebate && window.__countDebate(); // 谏院计数
  const box = document.createElement('div');
  box.innerHTML = `<div class="card"><h3>上朝 · 多臣辩论</h3>${apiFailed?'<p class="muted-note" style="margin-bottom:10px;">⚠️ 实时议事失败，已回退固化数据。</p>':''}<div id="seats"></div></div>`;
  stage.appendChild(box);
  const holder = box.querySelector('#seats');

  // 第一回合：众臣立场
  const r1 = document.createElement('div');
  r1.innerHTML = `<div class="roundtag">第一回合 · 众臣立场</div>`;
  holder.appendChild(r1);
  let i = 0;
  (function nextSeat(){
    if(token!==animToken) return;
    if(i >= data.seats.length){ roundTwo(); return; }
    const o = data.seats[i++];
    const m = document.createElement('div');
    m.className = 'memorial';
    m.innerHTML = `<div class="head"><span class="role">${escapeHtml(o.role)}</span><span class="lens">${escapeHtml(o.lens)}视角</span><span class="conf">信心 ${o.confidence}</span></div>
      <div class="pos" id="pos-${i}"><span class="cursor">▍</span></div>
      <div class="meta" id="meta-${i}"></div>`;
    holder.appendChild(m);
    typewrite(m.querySelector('.pos'), o.position, ()=>{
      m.querySelector('.meta').innerHTML =
        `<b>最强理由：</b>${escapeHtml(o.key_reason)}<br><b>自认的弱点：</b>${escapeHtml(o.strongest_objection)}<br><b>什么能改变我：</b>${escapeHtml(o.would_change_mind)}`;
      nextSeat();
    }, token);
  })();

  // 第二回合：御史质询
  function roundTwo(){
    const r2 = document.createElement('div');
    r2.innerHTML = `<div class="roundtag">第二回合 · 御史质询</div>`;
    holder.appendChild(r2);
    const a = document.createElement('div');
    a.className = 'memorial attack';
    a.innerHTML = `<div class="head"><span class="role">${escapeHtml(data.attack.by)}</span><span class="lens">交叉质询</span></div>
      <div class="pos" id="atk"><span class="cursor">▍</span></div>
      <div class="meta" id="atk-meta"></div>`;
    holder.appendChild(a);
    typewrite(a.querySelector('.pos'), data.attack.argument, ()=>{
      a.querySelector('#atk-meta').innerHTML = `<b>质询对象：</b>${escapeHtml(data.attack.target)}<br><b>被挑战的主张：</b>${escapeHtml(data.attack.claim_challenged)}`;
      roundThree();
    }, token);
  }

  // 第三回合：合议决策记录
  function roundThree(){
    const r3 = document.createElement('div');
    r3.innerHTML = `<div class="roundtag">第三回合 · 通政司合议（决策记录）</div>`;
    holder.appendChild(r3);
    const rec = document.createElement('div');
    rec.className = 'record';
    const r = data.record;
    rec.innerHTML = `
      <div class="r-title">决策记录</div>
      <div class="r-conf">合议信心：${Math.round(r.confidence*100)}%</div>
      <div class="answer"><b>结论：</b>${escapeHtml(r.answer)}</div>
      ${r.options_considered.length?`<h4>已考虑选项</h4><ul>${r.options_considered.map(o=>`<li><b>${escapeHtml(o.option)}</b>：${escapeHtml(o.why_not)}</li>`).join('')}</ul>`:''}
      ${r.dissent.length?`<h4>保留分歧</h4><ul class="diss">${r.dissent.map(d=>`<li><b>${escapeHtml(d.seat)}</b>：${escapeHtml(d.position)}（${escapeHtml(d.why_not_carried)}）</li>`).join('')}</ul>`:''}
      ${r.assumptions.length?`<h4>关键假设</h4><ul>${r.assumptions.map(a=>`<li>${escapeHtml(a)}</li>`).join('')}</ul>`:''}
      ${r.evidence.length?`<h4>证据</h4><ul>${r.evidence.map(e=>`<li>${escapeHtml(e.claim)}（来源：${escapeHtml(e.source)}）</li>`).join('')}</ul>`:''}
      ${r.open_questions.length?`<h4>未决问题</h4><ul>${r.open_questions.map(q=>`<li>${escapeHtml(q)}</li>`).join('')}</ul>`:''}
      ${r.next_actions.length?`<h4>下一步行动</h4><ul>${r.next_actions.map(a=>`<li>${escapeHtml(a)}</li>`).join('')}</ul>`:''}`;
    holder.appendChild(rec);
    showZhupi(stage, data, question, token);
  }
}

function typewrite(el, text, done, token){
  const span = document.createElement('span');
  el.innerHTML=''; el.appendChild(span);
  const cursor = document.createElement('span'); cursor.className='cursor'; cursor.textContent='▍'; el.appendChild(cursor);
  let i=0;
  (function step(){
    if(token!==animToken){ return; }
    if(i>=text.length){ cursor.remove(); done(); return; }
    span.textContent += text[i++];
    setTimeout(step, 18);
  })();
}

/* ---------- 朱批 + 起居注/翰林院归档 + 吏部评分 ---------- */
function showZhupi(stage, data, question, token){
  const z = document.createElement('div');
  z.className = 'card';
  z.innerHTML = `<h3>朱批 · 陛下裁决</h3>
    <div class="zhupi">
      <button class="btn" data-d="准奏 · 采纳" style="margin-top:0;">准奏</button>
      <button class="btn" data-d="发回重议" style="margin-top:0;background:#8a6d1f;">发回重议</button>
      <button class="btn secondary" data-d="搁置 · 容后再议" style="margin-top:0;">搁置</button>
      <input type="text" id="zhu-note" placeholder="可留一句批语（可空）">
    </div>
    <div id="rate-area"></div>`;
  stage.appendChild(z);
  z.querySelectorAll('.zhupi .btn').forEach(b=>b.addEventListener('click', ()=>{
    if(token!==animToken) return;
    const note = (z.querySelector('#zhu-note').value||'').trim();
    const decision = b.dataset.d+(note?'：'+note:'');
    // 起居注（简表）
    writeLog({ time:fmtTime(), question, decision, answer:data.record.answer, confidence:data.record.confidence, next:data.record.next_actions });
    // 翰林院（完整归档）
    const arch = LS.get(K.archive, []);
    arch.unshift({ time:fmtTime(), question, decision, seats:data.seats, attack:data.attack, record:data.record });
    LS.set(K.archive, arch.slice(0,500));
    const ok = document.createElement('div');
    ok.className = 'route';
    ok.innerHTML = `<span>起居注：本次决策已记录并归档翰林院，可在左侧「起居注 / 翰林院」查看。</span>`;
    z.appendChild(ok);
    z.querySelectorAll('.zhupi .btn').forEach(x=>x.disabled=true);
    renderRateArea(z.querySelector('#rate-area'), data.seats); // 吏部评分
  }));
}

/* 吏部：本局臣子表现评分（优 / 劣） */
function renderRateArea(area, seats){
  area.innerHTML = `<h3 style="margin-top:16px;">吏部 · 本局臣子考评</h3>
    ${seats.map((o,i)=>`<div class="rate-row"><span class="role">${escapeHtml(o.role)}</span>
      <button class="rate-btn up" data-i="${i}">优</button>
      <button class="rate-btn down" data-i="${i}">劣</button>
      <span class="muted-note" data-note="${i}"></span></div>`).join('')}
    <p class="muted-note">评分计入吏部绩效，可在左侧「吏部」查看累计。</p>`;
  area.querySelectorAll('.rate-btn').forEach(b=>b.addEventListener('click', ()=>{
    const i = +b.dataset.i;
    const r = LS.get(K.ratings, {});
    const role = seats[i].role;
    r[role] = r[role] || {up:0, down:0};
    b.classList.contains('up') ? r[role].up++ : r[role].down++;
    LS.set(K.ratings, r);
    area.querySelector(`[data-note="${i}"]`).textContent = '已记录 ✓';
    b.disabled = true; area.querySelectorAll(`[data-i="${i}"]`).forEach(x=>x.disabled=true);
  }));
}

/* 起居注（简表）写入 */
function writeLog(e){ const l = LS.get(K.log, []); l.unshift(e); LS.set(K.log, l); }

/* ---------- 非决策类：占位转呈 ---------- */
function showNonDebate(stage, intent){
  const card = document.createElement('div');
  card.className='card';
  card.innerHTML = `<h3>${ROUTE_MOD[intent]} · 已转呈</h3>
    <p class="placeholder">该类需求在完整产品中的处理方式：<span style="color:var(--red-deep)">${intent==='文件类'?'已可在「户部」执行真实的文件夹扫描、分类归档与回滚（见左侧户部）':'将在起居注悬浮窗中提醒，并记录言行形成记忆层'}</span>。</p>
    <button class="btn secondary" id="back-flow">返回呈奏</button>`;
  stage.appendChild(card);
  card.querySelector('#back-flow').addEventListener('click', ()=>render('flow'));
}
