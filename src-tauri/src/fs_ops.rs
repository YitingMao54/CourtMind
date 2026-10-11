// 户部（文件整理）+ 刑部·大理寺（审计台账与回滚）
// 安全原则（对齐调研文档 §3.2）：文件只移动、绝不删除；每次移动写入台账，可一键回滚。

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::AppHandle;

static ID_SEQ: AtomicU64 = AtomicU64::new(0);

/// 生成台账记录的全局唯一 id（纳秒时间戳 + 进程内自增序号）。
/// 修复：原先仅用 unix 秒作键，同一秒内移动的多个文件会碰撞，导致回滚张冠李戴。
fn new_id() -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let seq = ID_SEQ.fetch_add(1, Ordering::Relaxed);
    format!("{nanos}-{seq}")
}

/// 移动文件：优先 rename（同盘瞬时完成），跨盘符退回 copy + remove（仍等价"移动"，绝不遗留源文件）。
fn move_file(src: &Path, dst: &Path) -> Result<(), String> {
    if fs::rename(src, dst).is_ok() {
        return Ok(());
    }
    fs::copy(src, dst).map_err(|e| format!("复制失败：{e}"))?;
    fs::remove_file(src).map_err(|e| format!("清理源文件失败：{e}"))?;
    Ok(())
}

/* ================= 分类规则 ================= */

/// 按扩展名归入「课件与文献 / 素材 / 安装包与压缩包 / 表格 / 其他」
fn category_for(name: &str) -> &'static str {
    if !name.contains('.') {
        return "其他";
    }
    let ext = name.rsplit('.').next().unwrap_or("").to_lowercase();
    match ext.as_str() {
        "pdf" | "caj" | "nh" | "doc" | "docx" | "ppt" | "pptx" | "txt" | "epub" | "mobi" => "课件与文献",
        "jpg" | "jpeg" | "png" | "gif" | "webp" | "svg" | "bmp" | "psd" | "ai" | "mp4" | "mov"
        | "avi" | "mkv" | "mp3" | "wav" | "flac" | "aac" => "素材",
        "exe" | "msi" | "dmg" | "pkg" | "apk" | "zip" | "rar" | "7z" | "tar" | "gz" | "iso" => "安装包与压缩包",
        "xlsx" | "xls" | "csv" | "numbers" => "表格",
        _ => "其他",
    }
}

/// 目标路径冲突时自动加 " (n)" 后缀，绝不覆盖已有文件
fn unique_path(dir: &Path, name: &str) -> PathBuf {
    let mut dst = dir.join(name);
    if !dst.exists() {
        return dst;
    }
    let stem = Path::new(name).file_stem().and_then(|s| s.to_str()).unwrap_or("file");
    let ext = Path::new(name).extension().and_then(|s| s.to_str());
    for n in 2..1000 {
        let candidate = match ext {
            Some(e) => dir.join(format!("{stem} ({n}).{e}")),
            None => dir.join(format!("{stem} ({n})")),
        };
        if !candidate.exists() {
            dst = candidate;
            break;
        }
    }
    dst
}

/* ================= 数据结构 ================= */

#[derive(Serialize, Deserialize, Clone)]
pub struct FileEntry {
    pub name: String,
    pub category: String,
    pub size: u64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct MoveRecord {
    /// 全局唯一 id；`#[serde(default)]` 兼容旧台账（无此字段时反序列化为空串，读取时回填）
    #[serde(default)]
    pub id: String,
    pub time: i64, // unix 秒，仅用于展示
    pub from: String,
    pub to: String,
    pub undone: bool,
}

const LEDGER_CAP: usize = 200; // 台账最多保留 200 条（对齐文档）

fn ledger_path(app: &AppHandle) -> Result<PathBuf, String> {
    use tauri::Manager;
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| format!("无法创建数据目录：{e}"))?;
    Ok(dir.join("xingbu_ledger.json"))
}

fn read_ledger(app: &AppHandle) -> Result<Vec<MoveRecord>, String> {
    let p = ledger_path(app)?;
    if !p.exists() {
        return Ok(vec![]);
    }
    let s = fs::read_to_string(&p).map_err(|e| e.to_string())?;
    serde_json::from_str(&s).map_err(|e| format!("台账解析失败：{e}"))
}

fn write_ledger(app: &AppHandle, ledger: &[MoveRecord]) -> Result<(), String> {
    let p = ledger_path(app)?;
    let s = serde_json::to_string_pretty(ledger).map_err(|e| e.to_string())?;
    fs::write(&p, s).map_err(|e| format!("台账写入失败：{e}"))
}

/// 读取台账并为旧记录（id 为空）回填唯一 id 后落盘。
/// UI 每次渲染列表都走这里，保证后续按 id 回滚时旧数据也已具备唯一键。
fn read_ledger_backfilled(app: &AppHandle) -> Result<Vec<MoveRecord>, String> {
    let mut ledger = read_ledger(app)?;
    let mut changed = false;
    for r in ledger.iter_mut() {
        if r.id.is_empty() {
            r.id = new_id();
            changed = true;
        }
    }
    if changed {
        write_ledger(app, &ledger)?;
    }
    Ok(ledger)
}

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/* ================= 户部命令 ================= */

/// 默认整理目录：用户「下载」文件夹
#[tauri::command]
pub fn hubu_default_folder() -> Result<String, String> {
    let home = dirs_home()?;
    Ok(home.join("Downloads").to_string_lossy().into_owned())
}

fn dirs_home() -> Result<PathBuf, String> {
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
        .ok_or_else(|| "无法定位用户主目录".to_string())
}

/// 扫描目录顶层文件并给出分类预览（不做任何移动）
#[tauri::command]
pub fn hubu_scan(folder: String) -> Result<Vec<FileEntry>, String> {
    let dir = Path::new(&folder);
    if !dir.is_dir() {
        return Err(format!("目录不存在：{folder}"));
    }
    let mut out = vec![];
    for entry in fs::read_dir(dir).map_err(|e| format!("读取目录失败：{e}"))? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().into_owned();
        // 跳过隐藏文件与 macOS 资源文件
        if name.starts_with('.') {
            continue;
        }
        let meta = entry.metadata().map_err(|e| e.to_string())?;
        if !meta.is_file() {
            continue;
        }
        out.push(FileEntry {
            category: category_for(&name).to_string(),
            size: meta.len(),
            name,
        });
    }
    out.sort_by(|a, b| a.category.cmp(&b.category).then(a.name.cmp(&b.name)));
    Ok(out)
}

/// 执行整理：把顶层文件移动进分类子目录。
/// 修复：每移动成功一个文件即写入台账并落盘，即便中途失败，已移动的文件仍可在刑部回滚。
#[tauri::command]
pub fn hubu_organize(app: AppHandle, folder: String) -> Result<Vec<MoveRecord>, String> {
    let dir = Path::new(&folder).to_owned();
    if !dir.is_dir() {
        return Err(format!("目录不存在：{folder}"));
    }
    let files = hubu_scan(folder.clone())?;
    let mut ledger = read_ledger(&app).unwrap_or_default();
    let mut records = vec![];
    for f in files {
        let cat_dir = dir.join(&f.category);
        if let Err(e) = fs::create_dir_all(&cat_dir) {
            return Err(format!(
                "创建分类目录失败：{e}（此前已归档 {} 个文件，可在刑部回滚）",
                records.len()
            ));
        }
        let src = dir.join(&f.name);
        let dst = unique_path(&cat_dir, &f.name);
        if let Err(e) = move_file(&src, &dst) {
            return Err(format!(
                "移动 {} 失败：{e}（此前已归档 {} 个文件，可在刑部回滚）",
                f.name,
                records.len()
            ));
        }
        let rec = MoveRecord {
            id: new_id(),
            time: now_secs(),
            from: src.to_string_lossy().into_owned(),
            to: dst.to_string_lossy().into_owned(),
            undone: false,
        };
        // 先落盘再计入返回值：保证磁盘状态与台账始终一致
        ledger.splice(0..0, [rec.clone()]);
        ledger.truncate(LEDGER_CAP);
        write_ledger(&app, &ledger)?;
        records.push(rec);
    }
    Ok(records)
}

/* ================= 刑部命令 ================= */

/// 查看审计台账（顺带为旧记录回填唯一 id）
#[tauri::command]
pub fn xingbu_ledger(app: AppHandle) -> Result<Vec<MoveRecord>, String> {
    read_ledger_backfilled(&app)
}

/// 回滚一条移动记录：按唯一 id 定位，把文件移回原位。
/// 修复：不再用 time（unix 秒）匹配，杜绝同秒多条记录滚错文件。
#[tauri::command]
pub fn xingbu_undo(app: AppHandle, id: String) -> Result<MoveRecord, String> {
    let mut ledger = read_ledger(&app)?;
    let idx = ledger
        .iter()
        .position(|r| r.id == id && !r.undone)
        .ok_or_else(|| "记录不存在或已回滚".to_string())?;
    let rec = ledger[idx].clone();
    let src = Path::new(&rec.to);
    if !src.exists() {
        return Err(format!("文件已不在原处，无法回滚：{}", rec.to));
    }
    let orig = Path::new(&rec.from);
    if let Some(parent) = orig.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("恢复原目录失败：{e}"))?;
    }
    let file_name = orig
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "file".into());
    let parent = orig.parent().unwrap_or(Path::new("."));
    let dst = unique_path(parent, &file_name);
    move_file(src, &dst).map_err(|e| format!("回滚失败：{e}"))?;
    ledger[idx].undone = true;
    write_ledger(&app, &ledger)?;
    let mut rec = ledger[idx].clone();
    rec.from = dst.to_string_lossy().into_owned();
    Ok(rec)
}
