//! Dumps every view the interface reads from a Tower data directory as
//! JSON, for the interface's end-to-end tests (`apps/desktop/e2e`).
//!
//! ```sh
//! TOWER_HOME=/tmp/tower-demo/home cargo run -p tower-supervisor --example dump_views -- <out-dir>
//! ```

use std::path::PathBuf;
use std::sync::Arc;

use tower_supervisor::{Config, NullSink, Paths, Supervisor};

fn write(dir: &std::path::Path, name: &str, value: &impl serde::Serialize) {
    std::fs::write(dir.join(format!("{name}.json")), serde_json::to_vec_pretty(value).unwrap()).unwrap();
}

#[tokio::main]
async fn main() {
    let out = PathBuf::from(std::env::args().nth(1).expect("usage: dump_views <out-dir>"));
    std::fs::create_dir_all(&out).unwrap();
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    let sup = Supervisor::start(
        Config {
            paths: Paths::new(Paths::default_root()),
            extension_source: root.join("extensions/tower-goal"),
            env: None,
            demo_engine: None,
        },
        Arc::new(NullSink),
    )
    .await
    .expect("start");
    // Nothing should move while we read: pause the scheduler's effects by
    // only reading; runs left from seeding were stopped by its shutdown.
    write(&out, "environment", &sup.environment());
    write(&out, "settings", &sup.settings());
    write(&out, "projects", &sup.projects().unwrap());
    let goals = sup.goals().unwrap();
    write(&out, "goals", &goals);
    write(&out, "inbox", &sup.inbox().unwrap());
    let mut files = serde_json::Map::new();
    for g in &goals {
        write(&out, &format!("goal-{}", g.id), &sup.goal(&g.id).unwrap());
        write(&out, &format!("trace-{}", g.id), &sup.trace(&g.id, None, 300).unwrap());
        if let Ok(review) = sup.review(&g.id, None).await {
            for f in &review.files {
                for old in [false, true] {
                    if let Ok(Some(text)) = sup.file_text(&g.id, &f.path, old, None).await {
                        files.insert(format!("{}:{}:{}", g.id, f.path, if old { "old" } else { "new" }), text.into());
                    }
                }
            }
            write(&out, &format!("review-{}", g.id), &review);
        }
    }
    write(&out, "files", &files);
    sup.shutdown().await;
    println!("{} goals → {}", goals.len(), out.display());
}
