// 贵人多忘事 · 桌面软件主进程
// 前端为纯静态页面（ui/），业务命令集中在 fs_ops.rs（户部/刑部）与 overlay.rs（起居注悬浮窗）。

mod fs_ops;
mod overlay;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            fs_ops::hubu_default_folder,
            fs_ops::hubu_scan,
            fs_ops::hubu_organize,
            fs_ops::xingbu_ledger,
            fs_ops::xingbu_undo,
            overlay::open_qijuzhu
        ])
        .run(tauri::generate_context!())
        .expect("贵人多忘事启动失败");
}
