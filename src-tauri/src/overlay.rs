// 起居注· 桌面悬浮窗 与 桌宠「云绾」
//
// ⚠️ 关键设计决策（2026-10-09，第三次重写，取代前两版方案）：
//
//前两版都把「关闭」实现成 close() 真销毁 + 下次重新 create()，并试图用
// closing_flag / spawn_recreate 之类的时间差去绕开"复用正在销毁的僵尸窗口"。
// 实测证明这套思路是错的：**病根不是时序，而是「第二次 create() 本身就建不出
// 可用的 WebView」**——窗口能创建出来（有边框、有尺寸），但页面不加载、
// 于是 JS 从不执行、startDragging 也就永远绑不上，表现为"空白框 + 拖不动"。
// 无论销毁得多干净、重建得多延迟，只要走了"销毁→重建"这条路就会复现。
//
// 本版改为**窗口永不销毁**：
//   · 关闭 = hide()，WebView2 控制器、页面、JS 状态全部原地保留；
//   · 再开 = show() + 尺寸微调触发重绘 + set_focus()。
// 于是「第二次 create()」这条坏路在正常操作里根本不会被走到。
//
// hide 后 WebView2 在 Windows 上会停止绘制，因此 show 时额外做一次
// 「宽-1 再宽回来」的 nudge 强制重绘（老代码注释里"隐藏即永久停绘"的判断
// 未经验证，实测不成立）。
//
// 自愈兜底：**已刻意移除**。曾用 eval_with_callback 探针检测页面是否活着，
// 失效就销毁重建；实测该探针在启动阶段拿不到回调（依赖 WebView2 的
// ExecuteScript 完成事件），导致把**健康窗口**误判为废窗并销毁，
// 重建又撞 "a webview with label `pet` already exists" ——
// 反而亲手制造了本想修掉的"空白框"。教训：破坏性自愈必须有十足把握，
// 宁可只观测不动手。现在探针仅用于写日志，不做任何销毁。
//
// 另：所有关键动作都写 app_data/overlay.log，排查不再依赖猜测。
// 注意路径是 **Roaming**：%APPDATA%\com.itp.guiren\overlay.log
// （Windows 下 Tauri 的 app_data_dir() 映射到 FOLDERID_RoamingAppData）。

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use tauri::{AppHandle, Manager, PhysicalSize, WebviewUrl, WebviewWindowBuilder};

/// 位置记忆文件（app_data 目录下）。
const POS_FILE: &str = "overlay_pos.json";
/// 运行时诊断日志。
const LOG_FILE: &str = "overlay.log";

/// 两块浮窗的规格：label → (页面, 标题, 宽, 高)。
///
/// 桌宠高度 340：标题栏(~27) + 精灵图(216) + 下边距(8) + 提示条(~19) + 边框余量。
/// 原280 会把提示条裁掉（用户实机反馈"大小显示不全"），且精灵放大后更会溢出。
const SPECS: [(&str, &str, &str, f64, f64); 2] = [
    ("qijuzhu", "qijuzhu.html", "起居注", 340.0, 240.0),
    ("pet", "pet.html", "云绾", 220.0, 340.0),
];

fn spec(label: &str) -> Option<(&'static str, &'static str, f64, f64)> {
    SPECS
        .iter()
        .find(|s| s.0 == label)
        .map(|s| (s.1, s.2, s.3, s.4))
}

/// 把一行带时间戳的诊断写入 app_data/overlay.log（失败静默，不影响功能）。
///
/// 多个线程（主线程 + 各探针线程 + 前端 IPC 线程）会并发写同一个文件，
/// 必须用互斥锁串行化，否则会出现丢行——曾经就因丢行误判成"窗口没建出来"。
fn log_line(app: &AppHandle, msg: &str) {
    use std::io::Write;
    static WRITE_LOCK: Mutex<()> = Mutex::new(());
    let Ok(_guard) = WRITE_LOCK.lock() else {
        return; // 上一个持锁者 panic 了，放弃本次写入而不是死锁
    };
    let Ok(dir) = app.path().app_data_dir() else {
        return;
    };
    if std::fs::create_dir_all(&dir).is_err() {
        return;
    }
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join(LOG_FILE))
    {
        let t = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs_f64())
            .unwrap_or(0.0);
        let _ = writeln!(f, "[{t:.3}] {msg}");
    }
}

fn pos_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(POS_FILE))
}

fn load_pos(app: &AppHandle, label: &str) -> Option<(f64, f64)> {
    let path = pos_path(app).ok()?;
    let text = std::fs::read_to_string(path).ok()?;
    let map: HashMap<String, [f64; 2]> = serde_json::from_str(&text).ok()?;
    map.get(label).map(|p| (p[0], p[1]))
}

fn save_pos(app: &AppHandle, label: &str, x: f64, y: f64) -> Result<(), String> {
    let path = pos_path(app)?;
    let mut map: HashMap<String, [f64; 2]> = std::fs::read_to_string(&path)
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default();
    map.insert(label.to_string(), [x, y]);
    std::fs::write(&path, serde_json::to_string(&map).unwrap_or_default())
        .map_err(|e| e.to_string())
}

/// 新建一个浮窗。仅在「首次启动」或「看门狗确认窗口已废」时调用。
fn build_window(app: &AppHandle, label: &str) -> Result<(), String> {
    let (url, title, w, h) = spec(label).ok_or_else(|| format!("未知浮窗：{label}"))?;
    let mut builder = WebviewWindowBuilder::new(app, label, WebviewUrl::App(url.into()))
        .title(title)
        .inner_size(w, h)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false);
    // 位置记忆：仅在"创建期"一次性应用，运行期不做任何窗口位置操作。
    if let Some((x, y)) = load_pos(app, label) {
        builder = builder.position(x, y);
    }
    // build() 可能永不返回（见init_overlays 注释），故前后各记一条，
    // 缺"后"一条即为卡死的确凿证据。
    log_line(app, &format!("[build] {label} 开始创建"));
    let built = builder.build();
    match built {
        Ok(_) => {
            log_line(app, &format!("[build] {label} 创建成功"));
            Ok(())
        }
        Err(e) => {
            let m = format!("[build] {label} 创建失败：{e}");
            log_line(app, &m);
            eprintln!("{m}");
            Err(format!("{title} 创建失败：{e}"))
        }
    }
}

/// show 之后强制 WebView2 重绘：宽度 -1 再还原。
///隐藏状态下 WebView2 会停止绘制，show 回来必须给一次重绘刺激。
fn force_repaint(app: &AppHandle, label: &str) {
    let Some((_, _, w, h)) = spec(label) else {
        return;
    };
    let Some(win) = app.get_webview_window(label) else {
        return;
    };
    let (wu, hu) = (w as u32, h as u32);
    let _ = win.set_size(PhysicalSize::new(wu.saturating_sub(1), hu));
    let _ = win.set_size(PhysicalSize::new(wu, hu));
}

/// 页面存活标记：由前端 `overlay_report_alive` 命令主动上报。
/// key = label，value = 最近一次上报的单调时刻（秒）。
///
/// 为什么不用 `eval_with_callback` 从Rust 侧反向探测：
/// 该API 底层是 WebView2 的 `ExecuteScript` + 异步完成事件，回调必须由
/// **主线程事件循环**派发；而探测函数跑在普通工作线程里等 `recv_timeout`，
/// 事件循环根本不会处理它 → 永远超时 → 把健康窗口误判为死（已发生过一次，
/// 见文件顶部注释）。前端主动上报则由 IPC 直接送达，稳定可靠。
fn alive_map() -> &'static Mutex<HashMap<String, f64>> {
    static CELL: std::sync::OnceLock<Mutex<HashMap<String, f64>>> = std::sync::OnceLock::new();
    CELL.get_or_init(|| Mutex::new(HashMap::new()))
}

fn now_secs() -> f64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs_f64())
        .unwrap_or(0.0)
}

/// 前端上报"我的页面已就绪且存活"（含 10s 一次的心跳）。
///
/// 这是**唯一可信的存活判据**：它由页面自己的 JS 发出，
/// 页面真空白（没加载）时这个命令根本不会执行。
/// 记录下来后可用于诊断；因为窗口永不销毁，正常情况下无需据此恢复。
#[tauri::command]
pub fn overlay_report_alive(app: AppHandle, label: String) {
    if spec(label.as_str()).is_none() {
        return;
    }
    let first = {
        let mut m = match alive_map().lock() {
            Ok(g) => g,
            Err(_) => return,
        };
        let first = !m.contains_key(&label);
        m.insert(label.clone(), now_secs());
        first
    };
    // 只在首次上报时写日志；心跳不写，否则日志被每10s 一条淹没
    if first {
        log_line(&app, &format!("[alive] {label} 页面已就绪"));
    }
}

/// 诊断用：该浮窗最近一次前端上报距今多少秒。从未上报过返回 None。
fn alive_age(label: &str) -> Option<f64> {
    let t = now_secs();
    let m = alive_map().lock().ok()?;
    m.get(label).map(|v| t - v)
}

/// 是否有探针在跑，避免重复发起。
fn doctor_flag(label: &str) -> &'static AtomicBool {
    static QJZ: AtomicBool = AtomicBool::new(false);
    static PET: AtomicBool = AtomicBool::new(false);
    match label {
        "qijuzhu" => &QJZ,
        _ => &PET,
    }
}

/// **纯观测**的存活状况记录。
///
/// 前一版在此处"探针无响应 → 销毁重建"，误杀健康窗口并制造了空白框。
/// 现在只读取前端上报的存活时间并写日志，**绝不动手**：
/// v3 的保障来自"窗口永不销毁"，窗口一直活着就不存在需要恢复的废窗。
fn spawn_doctor(app: &AppHandle, label: &str, _attempt: u8) {
    if doctor_flag(label).swap(true, Ordering::SeqCst) {
        return;
    }
    let h = app.clone();
    let lab = label.to_string();
    std::thread::spawn(move || {
        // 等 WebView 初始化 + 页面加载 + 前端 invoke 上报都完成。
        // 实测**首个**窗口 build 可能耗时 ~10s（WebView2 冷启动），
        // 之后页面加载 + 上报还要几秒，故给到 15s，避免误报"未收到"。
        std::thread::sleep(Duration::from_millis(15000));
        // 再复查两次，覆盖"页面第一次没赶上"的情况
        for round in 1..=2 {
            let m = format!(
                "[probe] {lab} 第{round}次 {}",
                match alive_age(&lab) {
                    Some(age) => format!("页面存活（最近上报 {age:.1}s 前）"),
                    None => "尚未收到前端存活上报".to_string(),
                }
            );
            log_line(&h, &m);
            if alive_age(&lab).is_some() {
                break;
            }
            std::thread::sleep(Duration::from_millis(5000));
        }
        doctor_flag(&lab).store(false, Ordering::SeqCst);
    });
}

/// 确保浮窗在桌面上可见。
///
/// 正常路径：窗口自启动起就常驻，关闭只是 hide()，所以这里绝大多数时候
/// 只做 show + 重绘 + 聚焦——**永远不碰 create()**。
/// 只有 get_webview_window 返回 None（窗口确实不存在）才首次创建。
fn ensure_overlay(app: &AppHandle, label: &str) -> Result<(), String> {
    if let Some(w) = app.get_webview_window(label) {
        let was_hidden = !w.is_visible().unwrap_or(false);
        if was_hidden {
            let _ = w.show();
        }
        let _ = w.unminimize();
        if was_hidden {
            force_repaint(app, label);
        }
        let _ = w.set_focus();
        log_line(
            app,
            &format!("[open] {label} 复用常驻窗口（was_hidden={was_hidden}）"),
        );
        spawn_doctor(app, label, 0);
        return Ok(());
    }
    log_line(app, &format!("[open] {label} 窗口不存在 → 首次创建"));
    build_window(app, label)?;
    spawn_doctor(app, label, 0);
    Ok(())
}

/// 启动时创建两个桌面挂件（常驻、置顶、记忆原位）。
///
/// ⚠️ 两个关键实测结论（2026-10-09，均有 overlay.log 证据）：
///
/// 1. **不要在 `setup()` 里同步建浮窗**。setup 阶段事件循环还没跑起来，
///    此时 `WebviewWindowBuilder::build()` 会阻塞主线程（实测 pet 窗口
///    的一次 build 卡了约 8.9秒）。主线程被占住期间，WebView 的 IPC 回调
///    全部排队无法处理 → 页面看起来"加载不出来"= 空白框，JS 不执行 = 拖不动。
/// 2. 因此两个窗口都**延迟到事件循环启动后**再建，且**串行**（第一个建完
///    再建第二个），避免连续 build 互相拖累。
pub fn init_overlays(app: &AppHandle) {
    log_line(app, "[init] setup 阶段，不建窗；交给事件循环");
    verify_assets(app);

    let h = app.clone();
    std::thread::spawn(move || {
        // 等事件循环跑起来（tauri 在 setup 返回后才进入 run）
        std::thread::sleep(Duration::from_millis(800));
        for label in ["qijuzhu", "pet"] {
            let owner = h.clone();
            let lab = label.to_string();
            let _ = h.run_on_main_thread(move || {
                log_line(&owner, &format!("[init] 事件循环内创建 {lab}"));
                if let Err(e) = ensure_overlay(&owner, &lab) {
                    eprintln!("[overlay] 初始化 {lab} 失败：{e}");
                }
            });
            // 等这个窗口的 build 彻底结束再建下一个，避免连续 build 抢主线程。
            // 实测首个窗口 build 可能达~10s（WebView2 冷启动），故给足间隔。
            std::thread::sleep(Duration::from_millis(4000));
        }
    });
}

/// 读取运行时资源表，检查关键标记是否存在，用于确认前端资源版本。
fn verify_assets(app: &AppHandle) {
    let mut out = String::from("[assets] 自检：");
    for (file, marker) in [
        ("qijuzhu.html", "__grdwsOverlayReady"),
        ("pet.html", "__grdwsOverlayReady"),
        ("qijuzhu.html", "overlay_report_alive"),
        ("pet.html", "overlay_report_alive"),
    ] {
        let found = app
            .asset_resolver()
            .get(file.to_string())
            .map(|a| String::from_utf8_lossy(a.bytes()).contains(marker))
            .unwrap_or(false);
        out.push_str(&format!(" {file}:{marker}={found}"));
    }
    log_line(app, &out);
}

/// 聚焦悬浮窗；若此前被隐藏则重新显示。
#[tauri::command]
pub fn open_qijuzhu(app: AppHandle) -> Result<(), String> {
    let h = app.clone();
    app.run_on_main_thread(move || {
        if let Err(e) = ensure_overlay(&h, "qijuzhu") {
            eprintln!("[overlay] 打开起居注失败：{e}");
        }
    })
    .map_err(|e| e.to_string())
}

/// 唤回桌宠；若此前被隐藏则重新显示。
#[tauri::command]
pub fn open_pet(app: AppHandle) -> Result<(), String> {
    let h = app.clone();
    app.run_on_main_thread(move || {
        if let Err(e) = ensure_overlay(&h, "pet") {
            eprintln!("[overlay] 打开桌宠失败：{e}");
        }
    })
    .map_err(|e| e.to_string())
}

/// "关闭"浮窗 =隐藏（hide），**不销毁窗口**。
///
/// 这样 WebView2 控制器与页面全程存活：再次打开只是 show 一下，
/// 既不会出现"空白框 + 拖不动"，也无需任何重建时序上的妥协。
#[tauri::command]
pub fn dismiss_overlay(app: AppHandle, label: String) -> Result<(), String> {
    if spec(label.as_str()).is_none() {
        return Err(format!("未知浮窗：{label}"));
    }
    let h = app.clone();
    let lab = label.clone();
    app.run_on_main_thread(move || {
        if let Some(w) = h.get_webview_window(&lab) {
            match w.hide() {
                Ok(_) => log_line(&h, &format!("[close] {lab} 已隐藏（窗口保留）")),
                Err(e) => {
                    let m = format!("[close] {lab} hide 失败：{e}");
                    log_line(&h, &m);
                    eprintln!("{m}");
                }
            }
        } else {
            log_line(&h, &format!("[close] {lab} 窗口本就不存在，忽略"));
        }
    })
    .map_err(|e| e.to_string())
}

/// 拖动停稳后，前端上报浮窗逻辑坐标 →落盘记忆，下次启动原位重现。
#[tauri::command]
pub fn remember_pos(app: AppHandle, label: String, x: f64, y: f64) -> Result<(), String> {
    save_pos(&app, &label, x, y)
}