//! The native menu bar. Every command the interface offers is also here, so
//! it is discoverable the macOS way; selections are forwarded to the
//! renderer as `tower://menu` events carrying the item id.

use tauri::menu::{AboutMetadataBuilder, Menu, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Runtime};
use tower_core::Lang;

pub const MENU_EVENT: &str = "tower://menu";

/// Builds the menu bar in `lang`. Called at launch and again when the
/// language setting changes.
pub fn build<R: Runtime>(app: &AppHandle<R>, lang: Lang) -> tauri::Result<Menu<R>> {
    let l = |zh: &'static str, en: &'static str| lang.pick(zh, en);
    let item = |id: &str, text: &str, accel: Option<&str>| {
        let b = MenuItemBuilder::with_id(id, text);
        match accel {
            Some(a) => b.accelerator(a).build(app),
            None => b.build(app),
        }
    };

    let about = AboutMetadataBuilder::new()
        .name(Some("Tower"))
        .version(Some(env!("CARGO_PKG_VERSION")))
        .comments(Some(l(
            "以 Goal 为中心的编程 Agent 监督台。引擎：Pi。",
            "A goal-centric supervision desk for coding agents. Engine: Pi.",
        )))
        .website(Some("https://github.com/beautifulrem/tower"))
        .build();

    let app_menu = SubmenuBuilder::new(app, "Tower")
        .item(&PredefinedMenuItem::about(app, Some(l("关于 Tower", "About Tower")), Some(about))?)
        .separator()
        .item(&item("nav:settings", l("设置…", "Settings…"), Some("CmdOrCtrl+,"))?)
        .separator()
        .item(&PredefinedMenuItem::services(app, Some(l("服务", "Services")))?)
        .separator()
        .item(&PredefinedMenuItem::hide(app, Some(l("隐藏 Tower", "Hide Tower")))?)
        .item(&PredefinedMenuItem::hide_others(app, Some(l("隐藏其他", "Hide others")))?)
        .item(&PredefinedMenuItem::show_all(app, Some(l("全部显示", "Show all")))?)
        .separator()
        .item(&PredefinedMenuItem::quit(
            app,
            Some(l("退出 Tower（运行中的目标会暂停）", "Quit Tower (running goals pause)")),
        )?)
        .build()?;

    let file = SubmenuBuilder::new(app, l("文件", "File"))
        .item(&item("nav:new", l("新目标…", "New goal…"), Some("CmdOrCtrl+N"))?)
        .item(&item("project:add", l("添加仓库…", "Add repository…"), Some("CmdOrCtrl+Shift+O"))?)
        .separator()
        .item(&PredefinedMenuItem::close_window(app, Some(l("关闭窗口", "Close window")))?)
        .build()?;

    let edit = SubmenuBuilder::new(app, l("编辑", "Edit"))
        .item(&PredefinedMenuItem::undo(app, Some(l("撤销", "Undo")))?)
        .item(&PredefinedMenuItem::redo(app, Some(l("重做", "Redo")))?)
        .separator()
        .item(&PredefinedMenuItem::cut(app, Some(l("剪切", "Cut")))?)
        .item(&PredefinedMenuItem::copy(app, Some(l("拷贝", "Copy")))?)
        .item(&PredefinedMenuItem::paste(app, Some(l("粘贴", "Paste")))?)
        .item(&PredefinedMenuItem::select_all(app, Some(l("全选", "Select all")))?)
        .build()?;

    let view = SubmenuBuilder::new(app, l("显示", "View"))
        .item(&item("nav:overview", l("概览", "Overview"), Some("CmdOrCtrl+1"))?)
        .item(&item("nav:inbox", l("需要你", "Needs you"), Some("CmdOrCtrl+2"))?)
        .separator()
        .item(&item("app:palette", l("搜索目标与命令…", "Search goals and commands…"), Some("CmdOrCtrl+K"))?)
        .separator()
        .item(&item("nav:back", l("返回", "Back"), Some("CmdOrCtrl+["))?)
        .separator()
        .item(&PredefinedMenuItem::fullscreen(app, Some(l("进入全屏幕", "Enter full screen")))?)
        .build()?;

    // Single-letter shortcuts (R, W, P, ⇧E) stay in the interface so they
    // never swallow typing; the menu lists the commands without them.
    let goal = SubmenuBuilder::new(app, l("目标", "Goal"))
        .item(&item("goal:review", l("评审（R）", "Review (R)"), None)?)
        .item(&item("goal:watch", l("观察 / 回到状态（W）", "Watch / back to status (W)"), None)?)
        .item(&item("goal:pause", l("暂停或继续（P）", "Pause or resume (P)"), None)?)
        .item(&item("goal:amend", l("修订合同（⇧E）", "Amend contract (⇧E)"), None)?)
        .separator()
        .item(&item("goal:check-integration", l("检查是否已合入", "Check whether merged"), None)?)
        .build()?;

    let window = SubmenuBuilder::new(app, l("窗口", "Window"))
        .item(&PredefinedMenuItem::minimize(app, Some(l("最小化", "Minimize")))?)
        .item(&PredefinedMenuItem::maximize(app, Some(l("缩放", "Zoom")))?)
        .build()?;

    let help = SubmenuBuilder::new(app, l("帮助", "Help"))
        .item(&item("help:docs", l("设计文档", "Design docs"), None)?)
        .item(&item("help:issues", l("报告问题…", "Report an issue…"), None)?)
        .item(&item("help:diagnostics", l("导出诊断信息…", "Export Diagnostics…"), None)?)
        .build()?;

    MenuBuilder::new(app).items(&[&app_menu, &file, &edit, &view, &goal, &window, &help]).build()
}

/// Forwards custom items to the renderer; predefined items act natively.
pub fn forward<R: Runtime>(app: &AppHandle<R>, id: &str) {
    let _ = app.emit(MENU_EVENT, id.to_string());
}
