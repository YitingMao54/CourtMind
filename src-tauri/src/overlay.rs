// 起居注 · 桌面悬浮窗：无边框、置顶、不占任务栏的小窗
// 内容由前端 qijuzhu.html 自行渲染（读 localStorage，与其他窗口共享）。

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

#[tauri::command]
pub fn open_qijuzhu(app: AppHandle) -> Result<(), String> {
    // 已开则聚焦
    if let Some(w) = app.get_webview_window("qijuzhu") {
        let _ = w.show();
        let _ = w.set_focus();
        return Ok(());
    }
    WebviewWindowBuilder::new(&app, "qijuzhu", WebviewUrl::App("qijuzhu.html".into()))
        .title("起居注")
        .inner_size(340.0, 240.0)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .build()
        .map_err(|e| format!("悬浮窗创建失败：{e}"))?;
    Ok(())
}
