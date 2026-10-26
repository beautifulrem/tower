//! Prints the Seatbelt profile for a workspace (debugging aid).
//! `cargo run -p tower-supervisor --example dump_profile -- <ws> <tmp> <cache> <home> [network]`
fn main() {
    let a: Vec<String> = std::env::args().skip(1).collect();
    let spec = tower_supervisor::sandbox::Spec {
        workspace: a[0].clone().into(),
        tmp: a[1].clone().into(),
        cache: a[2].clone().into(),
        home: a[3].clone().into(),
        read: vec![],
        network: a.get(4).is_some_and(|n| n == "network"),
        proxy_ports: tower_supervisor::sandbox::COMMON_PROXY_PORTS.to_vec(),
    };
    print!("{}", tower_supervisor::sandbox::profile(&spec));
}
