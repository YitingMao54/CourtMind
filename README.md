# 贵人多忘事 · 桌面软件（Tauri）

一个基于 **Tauri 2** 的轻量级 Windows 桌面应用，对齐《产品文献调研》的技术选型（Tauri：安装包小、内存占用低、安全）。产品核心闭环：

**通政司（意图识别）→ 上朝（多臣辩论）→ 朱批（用户裁决）→ 起居注（自动记录）**

八大衙门模块已全部实现（详见下方状态表，均通过桌面端端到端实测）。

## 一、项目结构

```
├── ui/                   # 前端（纯静态，无构建步骤）
│   ├── index.html        # 应用外壳：CSS + 侧边栏路由
│   ├── core.js           # 工具、localStorage 封装、路由、谏院使用记录
│   ├── flow.js           # 通政司/上朝/朱批 + DeepSeek 实时辩论（可选）
│   ├── modules.js        # 户部/刑部/起居注/吏部/谏院/翰林院 六个视图
│   └── qijuzhu.html      # 起居注桌面悬浮窗（时钟 + 近期裁决）
├── src-tauri/            # Tauri 壳（Rust）
│   ├── src/main.rs       # 入口，仅调用 lib::run()
│   ├── src/lib.rs        # 注册 invoke 命令
│   ├── src/fs_ops.rs     # 户部扫描/分类/移动 + 刑部台账/回滚（真实文件操作）
│   ├── src/overlay.rs    # 起居注悬浮窗（无边框置顶小窗）
│   ├── tauri.conf.json   # 窗口 1200×800、打包目标、withGlobalTauri
│   ├── capabilities/     # 权限声明（core:default + 窗口关闭）
│   └── icons/            # 应用图标（由 app-icon.png 生成）
├── app-icon.png          # 图标源文件（重新生成：npx tauri icon app-icon.png）
├── .github/workflows/    # CI：推送 GitHub 后自动构建 Windows 安装包
└── release/              # macOS 本机构建产物（.app / .dmg）
```

前端三层结构 + Rust 命令层：

- **视图层**（ui/index.html + 各 js）：`render()` 按侧边栏 `data-view` 路由到 8 个视图函数
- **逻辑层**（flow.js）：`routeIntent` 正则意图识别 → `runCouncil` 三回合议事（立场→质询→合议）→ `showZhupi` 朱批；`animToken` 防动画竞态
- **数据层**：localStorage（起居注/翰林院归档/吏部评分/谏院记录/设置）+ 固化辩论 JSON
- **系统能力层**（Rust）：户部/刑部文件操作与悬浮窗，前端经 `window.__TAURI__.core.invoke` 调用

## 二、开发环境

要求：Node.js ≥ 18 + Rust（`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`）

```bash
npm install     # 安装 Tauri CLI
npm run dev     # 开发模式，热启动桌面窗口
```

## 三、打包 Windows 安装包（交付 .exe）

Tauri 的 Windows 安装包需在 Windows 环境（或 CI）构建，三选一：

1. **GitHub Actions（推荐，无需 Windows 机器）**：把仓库推到 GitHub，`.github/workflows/build-windows.yml` 会自动在 windows-latest 上构建，到 Actions → Artifacts 下载 `贵人多忘事_1.0.0_x64-setup.exe` 和 `.msi`。
2. **Windows 本机构建**：装好 Node + Rust 后执行 `npm run build`，产物在 `src-tauri/target/release/bundle/`（NSIS 安装包 + MSI）。
3. **macOS 本机构建**（仅供本地验证，产出 .app/.dmg）：`npm run build`。

## 四、模块实现状态（与调研文档 MoSCoW 表一致，均经桌面端实测）

| 模块 | 状态 | 实现方式 |
|---|---|---|
| 上朝（多AI辩论） | ✅ 已实现 | 固化数据 MVP + 可选 DeepSeek 实时辩论（见下） |
| 通政司（意图识别 + 路由提示） | ✅ 已实现 | 关键词 + 规则引擎，前端显性路由 |
| 户部（文件整理） | ✅ 已实现 | Rust 真实文件操作：扫描预览 → 按扩展名归入 5 类子目录，**只移动不删除** |
| 刑部·大理寺（审计回滚） | ✅ 已实现 | 每次移动写入台账（上限 200 条），逐条一键回滚 |
| 起居注（记录 + 悬浮窗） | ✅ 已实现 | localStorage 决策记录 + 无边框置顶桌面悬浮窗（时钟 + 近期裁决） |
| 吏部（臣子绩效） | ✅ 已实现 | 朱批后逐臣考评「优/劣」，累计称职率统计 |
| 谏院（习惯规谏） | ✅ 已实现 | 本地规则引擎：深夜使用 / 单日 45 分钟 / 单日议事 5 次触发规谏 |
| 翰林院（知识库基础版） | ✅ 已实现 | 辩论全量归档 + 关键词检索（高亮） |
| 翰林院（FTS5 全文检索版） | 🚫 未实现 | 由基础版关键词检索覆盖 |

## 五、DeepSeek 实时辩论（可选，默认关闭）

在「呈奏」页底部的 ⚡ 设置行填入 DeepSeek API key（仅存本机 localStorage）并保存后：

- 预设场景仍用固化数据（演示稳定）；
- **新问题**会实时调用 DeepSeek：三臣第一轮独立进奏（互不见对方观点，避免趋同）→ 通政司主持质询并合议出决策记录；
- 调用失败或超时（45s）自动回退固化数据，并在界面提示。

key 去 platform.deepseek.com 注册获取，一次辩论几分钱。**key 千万不要写进公开代码/发到群里。**

## 六、后续待办（按优先级）

1. [ ] 推送 GitHub 跑 CI，拿到 Windows 安装包公开链接
2. [ ] 录一段 ≤3 分钟的演示视频（走过完整"换导师"流程 + 户部整理回滚）
3. [ ] （可选）录一段 DeepSeek"实时辩论"作为技术证据

## 七、从 Electron 迁移到 Tauri 的说明

本项目最初用 Electron 打包。按调研文档"推荐 Tauri"的结论已完成迁移：前端逻辑原样保留并模块化（单文件拆为 core/flow/modules），Electron 主进程替换为 `src-tauri/`，旧 Electron 产物已清理。收益：安装包从 ~80MB 降到 ~5MB 级、空闲内存从 150-300MB 降到 30-40MB 级（数据来源见调研文档 §3.2）。
