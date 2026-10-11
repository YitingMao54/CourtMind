// 贵人多忘事 · 桌面软件主进程
// 前端为纯静态页面（ui/），业务命令集中在 fs_ops.rs（户部/刑部）与 overlay.rs（起居注悬浮窗）。

use tauri::{Manager, WindowEvent};

mod events;
mod fs_ops;
mod overlay;

/* 让 WebView2 沿用系统代理。
 * 背景：用户环境里有 http_proxy（Clash 等），但 Chromium 内核**不读** http_proxy 环境变量，
 * 前端 fetch 一律直连 → 需要代理的 API（OpenAI / Claude / Gemini）必然失败，
 * 表现为「实时议事失败，已回退固化数据」。这里把代理显式传给 WebView2。
 * 必须在创建任何 WebView 之前设置（run() 最开头）。
 * 优先读 HTTPS_PROXY / HTTP_PROXY；未配置则不干预，走系统默认。 */
fn apply_webview_proxy() {
    #[cfg(target_os = "windows")]
    {
        let existing = std::env::var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS").unwrap_or_default();
        let proxy = ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"]
            .iter()
            .filter_map(|k| std::env::var(k).ok())
            .map(|v| v.trim().to_string())
            .find(|v| v.starts_with("http://") || v.starts_with("https://") || v.starts_with("socks5://"));
        if let Some(p) = proxy {
            // 本地资源（tauri://、localhost）与文件协议必须绕过代理，否则前端加载不到
            let args = format!(
                "{}--proxy-server={} --proxy-bypass-list=<-loopback>;localhost;127.0.0.1",
                if existing.is_empty() { String::new() } else { format!("{existing} ") },
                p
            );
            std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", &args);
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    apply_webview_proxy();
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            fs_ops::hubu_default_folder,
            fs_ops::hubu_scan,
            fs_ops::hubu_organize,
            fs_ops::xingbu_ledger,
            fs_ops::xingbu_undo,
            overlay::open_qijuzhu,
            overlay::open_pet,
            overlay::dismiss_overlay,
            overlay::remember_pos,
            overlay::overlay_report_alive,
            events::events_fetch,
            events::events_get
        ])
        // 浮窗改为 hide() 常驻不销毁（见 overlay.rs 顶部说明：destroy→recreate
        // 这条路会产出"空白框 + 拖不动"的废窗口）。副作用是主窗口关闭后
        // 仍有隐藏窗口存活，Tauri 默认的"最后一个窗口关闭即退出"不再触发，
        // 所以这里显式接管：主窗口一关就整进程退出。
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if matches!(event, WindowEvent::CloseRequested { .. } | WindowEvent::Destroyed) {
                    window.app_handle().exit(0);
                }
            }
        })
        .setup(|app| {
            overlay::init_overlays(app.handle());
            // 邸报：每日 8 点抓取活动数据（独立线程，只 spawn 不阻塞主线程）
            events::init_events_timer(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("贵人多忘事启动失败");
}
