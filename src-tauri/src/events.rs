/* ================= events.rs：邸报 · 拓浙活动聚合（tuotuzju.com/events） =================
 * 数据链路：Rust 抓取（绕过 WebView CORS）→ app_data/events_cache.json
 *          → 前端 localStorage(grdws_events) → 邸报视图展示 + 呈奏/上朝 AI Prompt 注入。
 *
 * 为什么在 Rust 抓：该 API 对带 Origin 的跨域请求返回 500（无 CORS 头），
 * WebView 内 fetch 不可行（已实测）；Rust 侧 HTTP 无此限制。
 *
 * 更新时机：每天本地时间 08:00 自动抓取（应用开着时由下方定时线程执行；
 * 若当天 8 点时应用未运行，则启动后补抓一次），手动可在邸报页点「立即更新」。
 */

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::time::{Duration, Instant};

use chrono::Timelike;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager};

const API: &str = "https://tuotuzju.com/api/events";
const UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36";
const CACHE_FILE: &str = "events_cache.json";
/// 每天几点抓取（本地时间）
const FETCH_HOUR: u32 = 8;
/// 失败后退避：30 分钟后再试（避免死循环打爆对方接口）
const RETRY_BACKOFF: Duration = Duration::from_secs(30 * 60);
/// 定时线程轮询间隔
const POLL_INTERVAL: Duration = Duration::from_secs(30);
/// 线程启动后先等应用完全起来（overlay 也在事件循环内延迟创建，避免抢启动资源）
const STARTUP_DELAY: Duration = Duration::from_secs(20);

fn cache_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|d| d.join(CACHE_FILE))
        .map_err(|e| format!("定位应用数据目录失败：{e}"))
}

fn http_client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .user_agent(UA)
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| format!("构建 HTTP 客户端失败：{e}"))
}

/* 分页拉全：第 1 页响应里的 pagination.totalPages 给出总页数（limit=100），
 * 之后循环拉完所有页，按 id 去重合并。页间 300ms 间隔，做个礼貌的爬虫。 */
fn fetch_all_events() -> Result<Vec<Value>, String> {
    let client = http_client()?;
    let mut all: Vec<Value> = Vec::new();
    let mut seen: HashMap<String, ()> = HashMap::new();
    let mut total_pages = 1usize;
    let mut page = 1usize;
    loop {
        let resp = client
            .get(API)
            .query(&[("limit", "100"), ("page", page.to_string().as_str())])
            .send()
            .map_err(|e| format!("请求第 {page} 页失败：{e}"))?;
        if !resp.status().is_success() {
            return Err(format!("第 {page} 页返回 HTTP {}", resp.status()));
        }
        let body: Value = resp
            .json()
            .map_err(|e| format!("第 {page} 页解析 JSON 失败：{e}"))?;
        if page == 1 {
            total_pages = body["pagination"]["totalPages"].as_u64().unwrap_or(1) as usize;
        }
        if let Some(arr) = body["data"].as_array() {
            for ev in arr {
                let id = ev["id"].to_string();
                if !seen.contains_key(&id) {
                    seen.insert(id, ());
                    all.push(ev.clone());
                }
            }
        }
        if page >= total_pages || page >= 50 {
            break; // 50 页保险上限（5000 条）
        }
        page += 1;
        std::thread::sleep(Duration::from_millis(300));
    }
    Ok(all)
}

/* 写缓存 + 广播前端。缓存里带 fetchedDate（本地日期），供定时线程判断"今天是否已抓"。 */
fn save_cache(app: &AppHandle, events: &[Value]) -> Result<Value, String> {
    let now = chrono::Local::now();
    let payload = json!({
        "v": 1,
        "fetchedAt": now.format("%Y-%m-%d %H:%M").to_string(),
        "fetchedDate": now.format("%Y-%m-%d").to_string(),
        "source": "tuotuzju.com/events",
        "count": events.len(),
        "events": events,
    });
    let path = cache_path(app)?;
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| format!("创建数据目录失败：{e}"))?;
    }
    let raw = serde_json::to_string(&payload).map_err(|e| format!("序列化失败：{e}"))?;
    fs::write(&path, raw).map_err(|e| format!("写缓存失败：{e}"))?;
    // 通知前端刷新（失败不影响抓取结果返回）
    let _ = app.emit(
        "grdws-events-updated",
        json!({ "count": events.len(), "fetchedAt": payload["fetchedAt"] }),
    );
    Ok(payload)
}

fn read_cache(app: &AppHandle) -> Option<Value> {
    let path = cache_path(app).ok()?;
    let raw = fs::read_to_string(path).ok()?;
    serde_json::from_str(&raw).ok()
}

/* ---------- Tauri 命令 ---------- */

/// 立即抓取全量活动并写缓存（邸报页「立即更新」按钮 / 前端缓存过期时调用）
#[tauri::command]
pub fn events_fetch(app: AppHandle) -> Result<Value, String> {
    let events = fetch_all_events()?;
    save_cache(&app, &events)
}

/// 读本地缓存（不联网）。无缓存时返回空结构，前端据此引导首次抓取。
#[tauri::command]
pub fn events_get(app: AppHandle) -> Result<Value, String> {
    if let Some(v) = read_cache(&app) {
        return Ok(v);
    }
    Ok(json!({ "v": 1, "fetchedAt": null, "fetchedDate": null, "count": 0, "events": [] }))
}

/* ---------- 每日定时抓取 ----------
 * 独立线程（不阻塞主线程——setup 阶段只 spawn，见 overlay.rs 的血泪教训）。
 * 规则：本地时间过了 08:00 且今天没抓过 → 抓；失败退避 30 分钟。
 * 应用上午 8 点后才启动 → 首轮轮询即补抓；8 点前启动 → 到点自动抓。 */
pub fn init_events_timer(app: AppHandle) {
    std::thread::spawn(move || {
        std::thread::sleep(STARTUP_DELAY);
        let mut retry_after: Option<Instant> = None;
        loop {
            std::thread::sleep(POLL_INTERVAL);
            if let Some(t) = retry_after {
                if Instant::now() < t {
                    continue;
                }
                retry_after = None;
            }
            let now = chrono::Local::now();
            // 今天已抓过（缓存 fetchedDate == 今天）→ 跳过
            if let Some(cache) = read_cache(&app) {
                if cache["fetchedDate"].as_str() == Some(&now.format("%Y-%m-%d").to_string()) {
                    continue;
                }
            }
            // 还没到每天 8 点 → 等到点
            if now.hour() < FETCH_HOUR {
                continue;
            }
            match fetch_all_events() {
                Ok(events) => {
                    let _ = save_cache(&app, &events);
                }
                Err(_) => {
                    retry_after = Some(Instant::now() + RETRY_BACKOFF);
                }
            }
        }
    });
}
