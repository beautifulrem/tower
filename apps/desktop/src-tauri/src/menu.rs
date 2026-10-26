//! The native menu bar. Every command the interface offers is also here, so
//! it is discoverable the macOS way; selections are forwarded to the
//! renderer as `tower://menu` events carrying the item id.

use tauri::menu::{AboutMetadataBuilder, Menu, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Runtime};

pub const MENU_EVENT: &str = "tower://menu";

pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
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
        .comments(Some("以 Goal 为中心的编程 Agent 监督台。引擎：Pi。"))
        .website(Some("https://github.com/beautifulrem/tower"))
        .build();

    let app_menu = SubmenuBuilder::new(app, "Tower")
        .item(&PredefinedMenuItem::about(app, Some("关于 Tower"), Some(about))?)
        .separator()
        .item(&item("nav:settings", "设置…", Some("CmdOrCtrl+,"))?)
        .separator()
        .item(&PredefinedMenuItem::services(app, Some("服务"))?)
        .separator()
        .item(&PredefinedMenuItem::hide(app, Some("隐藏 Tower"))?)
        .item(&PredefinedMenuItem::hide_others(app, Some("隐藏其他"))?)
        .item(&PredefinedMenuItem::show_all(app, Some("全部显示"))?)
        .separator()
        .item(&PredefinedMenuItem::quit(app, Some("退出 Tower（运行中的目标会暂停）"))?)
        .build()?;

    let file = SubmenuBuilder::new(app, "文件")
        .item(&item("nav:new", "新目标…", Some("CmdOrCtrl+N"))?)
        .item(&item("project:add", "添加仓库…", Some("CmdOrCtrl+Shift+O"))?)
        .separator()
        .item(&PredefinedMenuItem::close_window(app, Some("关闭窗口"))?)
        .build()?;

    let edit = SubmenuBuilder::new(app, "编辑")
        .item(&PredefinedMenuItem::undo(app, Some("撤销"))?)
        .item(&PredefinedMenuItem::redo(app, Some("重做"))?)
        .separator()
        .item(&PredefinedMenuItem::cut(app, Some("剪切"))?)
        .item(&PredefinedMenuItem::copy(app, Some("拷贝"))?)
        .item(&PredefinedMenuItem::paste(app, Some("粘贴"))?)
        .item(&PredefinedMenuItem::select_all(app, Some("全选"))?)
        .build()?;

    let view = SubmenuBuilder::new(app, "显示")
        .item(&item("nav:overview", "概览", Some("CmdOrCtrl+1"))?)
        .item(&item("nav:inbox", "需要你", Some("CmdOrCtrl+2"))?)
        .separator()
        .item(&item("app:palette", "搜索目标与命令…", Some("CmdOrCtrl+K"))?)
        .separator()
        .item(&item("nav:back", "返回", Some("CmdOrCtrl+["))?)
        .separator()
        .item(&PredefinedMenuItem::fullscreen(app, Some("进入全屏幕"))?)
        .build()?;

    // Single-letter shortcuts (R, W, P, ⇧E) stay in the interface so they
    // never swallow typing; the menu lists the commands without them.
    let goal = SubmenuBuilder::new(app, "目标")
        .item(&item("goal:review", "评审（R）", None)?)
        .item(&item("goal:watch", "观察 / 回到状态（W）", None)?)
        .item(&item("goal:pause", "暂停或继续（P）", None)?)
        .item(&item("goal:amend", "修订合同（⇧E）", None)?)
        .separator()
        .item(&item("goal:check-integration", "检查是否已合入", None)?)
        .build()?;

    let window = SubmenuBuilder::new(app, "窗口")
        .item(&PredefinedMenuItem::minimize(app, Some("最小化"))?)
        .item(&PredefinedMenuItem::maximize(app, Some("缩放"))?)
        .build()?;

    let help = SubmenuBuilder::new(app, "帮助")
        .item(&item("help:docs", "设计文档", None)?)
        .item(&item("help:issues", "报告问题…", None)?)
        .build()?;

    MenuBuilder::new(app).items(&[&app_menu, &file, &edit, &view, &goal, &window, &help]).build()
}

/// Forwards custom items to the renderer; predefined items act natively.
pub fn forward<R: Runtime>(app: &AppHandle<R>, id: &str) {
    let _ = app.emit(MENU_EVENT, id.to_string());
}
