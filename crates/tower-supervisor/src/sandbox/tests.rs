use super::ports::{parse_lsof, parse_netstat, parse_scutil_proxy};
use super::toolchains::toolchains_under;
use super::*;

fn spec(root: &Path, home: &Path, network: bool) -> Spec {
    Spec {
        workspace: root.join("ws"),
        tmp: root.join("tmp"),
        cache: root.join("cache"),
        home: home.to_path_buf(),
        read: vec![],
        append: vec![],
        network,
        loopback: Loopback::Only(vec![]),
        proxy_ports: COMMON_PROXY_PORTS.to_vec(),
    }
}

fn sandboxed(sb: &Path, dir: &Path, cmd: &str) -> bool {
    std::process::Command::new("/usr/bin/sandbox-exec")
        .arg("-f")
        .arg(sb)
        .args(["/bin/sh", "-c", cmd])
        .current_dir(dir)
        .output()
        .unwrap()
        .status
        .success()
}

#[test]
fn toolchains_on_path_become_readable_but_never_home() {
    let tmp = tempfile::tempdir().unwrap();
    let users = crate::paths::real(tmp.path());
    let home = users.join("me");
    let nvm = home.join(".nvm/versions/node/v1/bin");
    let local = home.join(".local/bin");
    let ci = users.join("runner/hostedtoolcache/node/22/x64/bin");
    for d in [&nvm, &local, &ci] {
        std::fs::create_dir_all(d).unwrap();
    }
    let path = format!("/usr/bin:{}:{}:{}:{}", nvm.display(), local.display(), ci.display(), home.display());
    assert_eq!(
        toolchains_under(&path, &home, &[&users]),
        [home.join(".nvm/versions/node/v1"), local.clone(), users.join("runner/hostedtoolcache/node/22/x64")]
    );
}

/// What decides the default toolchain in your terminal is readable in the
/// sandbox: the toolchain homes your shell names, version files in your
/// home, and rustup's fallback settings under a package manager's `etc`.
#[test]
fn default_toolchains_resolve_as_in_your_terminal() {
    let tmp = tempfile::tempdir().unwrap();
    let root = crate::paths::real(tmp.path());
    let home = root.join("home");
    let rustup = root.join("opt/rustup-home");
    let cargo = root.join("opt/cargo-home");
    for d in [&home, &rustup, &cargo.join("bin")] {
        std::fs::create_dir_all(d).unwrap();
    }
    std::fs::write(home.join(".tool-versions"), "nodejs 22.1.0\n").unwrap();
    std::fs::write(cargo.join("credentials.toml"), "token").unwrap();
    let env = vec![
        ("PATH".to_string(), "/usr/bin".to_string()),
        ("RUSTUP_HOME".to_string(), rustup.display().to_string()),
        ("CARGO_HOME".to_string(), cargo.display().to_string()),
    ];
    let reads = toolchain_reads(&env, &home);
    assert!(reads.contains(&rustup), "{reads:?}");
    assert!(reads.contains(&cargo.join("bin")) && !reads.contains(&cargo), "only cargo's bin: {reads:?}");
    assert!(reads.contains(&home.join(".tool-versions")));
    assert!(!reads.contains(&home), "never the whole home");
    let p = profile(&spec(Path::new("/w"), Path::new("/Users/a"), false));
    assert!(p.contains("(subpath \"/opt/homebrew/etc/rustup\")"), "Homebrew rustup's default toolchain");
    // mise's global config is readable only when it sets no variables.
    std::fs::create_dir_all(home.join(".config/mise")).unwrap();
    std::fs::write(home.join(".config/mise/config.toml"), "[tools]\nnode = \"22\"\n").unwrap();
    assert!(toolchain_reads(&env, &home).contains(&home.join(".config/mise/config.toml")));
    assert!(toolchain_env(&home, &root).iter().any(|(k, _)| k == "MISE_GLOBAL_CONFIG_FILE"));
    std::fs::write(home.join(".config/mise/config.toml"), "[tools]\nnode = \"22\"\n[env]\nTOKEN = \"x\"\n").unwrap();
    assert!(!toolchain_reads(&env, &home).contains(&home.join(".config/mise/config.toml")));
}

#[test]
fn developer_tools_go_just_before_usr_bin() {
    let dev = Path::new("/Library/Developer/CommandLineTools/usr/bin");
    assert_eq!(
        path_with_developer_tools("/opt/homebrew/bin:/usr/bin:/bin", dev),
        "/opt/homebrew/bin:/Library/Developer/CommandLineTools/usr/bin:/usr/bin:/bin"
    );
    assert_eq!(path_with_developer_tools("/bin", dev), "/bin:/Library/Developer/CommandLineTools/usr/bin");
}

#[test]
fn proxy_ports_come_from_the_environment() {
    let env = vec![
        ("https_proxy".to_string(), "http://127.0.0.1:6152".to_string()),
        ("ALL_PROXY".to_string(), "socks5://user:pw@127.0.0.1:4321/".to_string()),
        ("NO_PROXY".to_string(), "localhost:9999".to_string()),
    ];
    let ports = proxy_ports(&env);
    assert!(ports.contains(&6152) && ports.contains(&4321));
    assert!(!ports.contains(&9999));
}

#[test]
fn profile_is_closed_by_default_and_names_its_rules() {
    let p = profile(&spec(Path::new("/w"), Path::new("/Users/a"), false));
    assert!(p.contains("(deny default)"));
    assert!(p.contains("(subpath \"/Users/a/.ssh\")"));
    assert!(p.contains("(literal \"/w/ws/.git/config\")"));
    assert!(!p.contains("com.apple.SecurityServer"), "no keychain service");
    assert!(!p.contains("(remote ip \"localhost:*\")"), "loopback is closed by default");
    let with_network = profile(&spec(Path::new("/w"), Path::new("/Users/a"), true));
    assert!(!with_network.contains("com.apple.SecurityServer"), "not even with the network");
    assert!(with_network.contains("(allow network-outbound)"));
}

/// Loopback without the network: one rule per port the contract declares
/// or the sandbox's own processes listen on; the proxies stay closed even
/// when declared. In the open mode, everything but what was listening.
#[test]
fn loopback_rules_name_their_ports() {
    let mut sp = spec(Path::new("/w"), Path::new("/Users/a"), false);
    sp.loopback = Loopback::Only(vec![5432, 7890]);
    let p = profile(&sp);
    assert!(
        p.contains("(allow network-outbound\n  (remote ip \"localhost:5432\")\n  (remote ip \"localhost:7890\")\n)")
    );
    let deny_at = p.rfind("(deny network-outbound").unwrap();
    assert!(p[deny_at..].contains("(remote ip \"localhost:7890\")"), "a proxy is denied after any allow");
    sp.loopback = Loopback::AllBut(vec![3000]);
    let p = profile(&sp);
    assert!(p.contains("(allow network-outbound (remote ip \"localhost:*\"))"));
    assert!(p.contains("(deny network-outbound\n  (remote ip \"localhost:3000\")\n)"));
}

/// Enforcement against the real sandbox-exec: with loopback closed by
/// default, a service listening before the profile was written and one
/// started after it are both unreachable; a declared port is reachable.
#[cfg(target_os = "macos")]
#[test]
fn loopback_is_closed_by_default_without_the_network() {
    if !available() {
        return;
    }
    let tmp = tempfile::tempdir_in("/tmp").unwrap();
    let root = crate::paths::real(tmp.path());
    for d in ["ws", "tmp", "cache", "home"] {
        std::fs::create_dir_all(root.join(d)).unwrap();
    }
    let before = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let declared = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let declared_port = declared.local_addr().unwrap().port();
    let mut sp = spec(&root, &root.join("home"), false);
    sp.loopback = Loopback::Only(vec![declared_port]);
    let sb = root.join("p.sb");
    std::fs::write(&sb, profile(&sp)).unwrap();
    // Started by someone else after the profile was written.
    let later = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let nc = |port: u16| sandboxed(&sb, &root.join("ws"), &format!("/usr/bin/nc -z -w 2 127.0.0.1 {port}"));
    assert!(!nc(before.local_addr().unwrap().port()), "what was already there is closed");
    assert!(!nc(later.local_addr().unwrap().port()), "what started later is closed too");
    assert!(nc(declared_port), "a declared port is open");
    // The open mode: whatever was listening stays closed, the rest is open.
    sp.loopback = Loopback::AllBut(vec![before.local_addr().unwrap().port()]);
    std::fs::write(&sb, profile(&sp)).unwrap();
    assert!(!nc(before.local_addr().unwrap().port()));
    assert!(nc(later.local_addr().unwrap().port()), "documented: a later service is reachable in the open mode");
}

#[test]
fn system_wide_listeners_are_read_from_netstat() {
    let text = "tcp4 0 0  127.0.0.1.4817  *.*  LISTEN 0 0\ntcp6 0 0  *.5000  *.*  LISTEN\ntcp4 0 0  192.168.1.4.22  *.*  LISTEN\ntcp4 0 0  127.0.0.1.51000  127.0.0.1.4817  ESTABLISHED\n";
    let ports: Vec<u16> = parse_netstat(text).into_iter().map(|l| l.port).collect();
    assert_eq!(ports, [4817, 5000]);
    // Current macOS names the owner; names may hold spaces.
    let v = "tcp4  0  0  127.0.0.1.7879  *.*  LISTEN  0  0  131072  131072  python3.13:49124  00100 00000006 0000000002f62dc2 00000000 00000800  1  0 000000\n\
             tcp4  0  0  127.0.0.1.9222  *.*  LISTEN  0  0  131072  131072  Google Chrome H:777  00100 00000006 0000000002f62dc2 00000000 00000800  1  0 000000\n";
    assert_eq!(parse_netstat(v), [Listener { port: 7879, pid: Some(49124) }, Listener { port: 9222, pid: Some(777) }]);
}

#[test]
fn services_already_listening_are_found() {
    let text = "p706\nf12\nn*:7000\nf14\nn127.0.0.1:5432\nf15\nn[::1]:6379\nf16\nn192.168.1.4:8080\n";
    let ports: Vec<u16> = parse_lsof(text).into_iter().map(|l| l.port).collect();
    assert_eq!(ports, [7000, 5432, 6379]);
    assert!(parse_lsof(text).iter().all(|l| l.pid == Some(706)));
}

#[test]
fn system_proxies_on_loopback_are_found() {
    let text = "<dictionary> {\n  HTTPEnable : 1\n  HTTPPort : 6152\n  HTTPProxy : 127.0.0.1\n  SOCKSPort : 6153\n  SOCKSProxy : 127.0.0.1\n  HTTPSPort : 8080\n  HTTPSProxy : proxy.corp\n}";
    assert_eq!(parse_scutil_proxy(text), [6152, 6153]);
}

/// The screenshot browser's confinement, closed by default: only the
/// app's port on this machine (no DNS, no outside address, no loopback
/// proxy, no other local service), writes only where it must, and none of
/// your home. (`curl` stands in for the browser, its folder for the app.)
#[cfg(target_os = "macos")]
#[test]
fn the_browser_profile_keeps_pages_on_this_machine() {
    if !available() {
        return;
    }
    let tmp = tempfile::tempdir_in("/tmp").unwrap();
    let root = crate::paths::real(tmp.path());
    let own = root.join("own");
    std::fs::create_dir_all(&own).unwrap();
    let sb = root.join("b.sb");
    let ports = proxy_ports(&std::env::vars().collect::<Vec<_>>());
    let home = root.join("home");
    std::fs::create_dir_all(home.join("notes")).unwrap();
    std::fs::write(home.join("notes/private.txt"), "x").unwrap();
    let serve = || {
        let server = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = server.local_addr().unwrap().port();
        std::thread::spawn(move || {
            for s in server.incoming().flatten() {
                use std::io::Write;
                let mut s = s;
                let _ = s.write_all(b"HTTP/1.0 200 OK\r\nContent-Length: 2\r\n\r\nok");
            }
        });
        port
    };
    let (app, other) = (serve(), serve());
    let text = browser_profile(&BrowserSpec {
        browser: Path::new("/usr/bin/curl"),
        home: &home,
        readable: &[],
        writable: &[&own],
        user_temp: None,
        ports: &[app],
        network: false,
        proxy_ports: &ports,
    });
    assert!(text.contains("(deny default)") && !text.contains("(allow default)"));
    std::fs::write(&sb, text).unwrap();
    let run = |args: &[&str]| {
        std::process::Command::new("/usr/bin/sandbox-exec")
            .arg("-f")
            .arg(&sb)
            .args(args)
            .output()
            .unwrap()
            .status
            .success()
    };
    let curl = |extra: &[&str], url: &str| {
        let mut a = vec!["/usr/bin/curl", "-sS", "-m", "5", "-o", "/dev/null"];
        a.extend_from_slice(extra);
        a.push(url);
        run(&a)
    };
    assert!(curl(&["--noproxy", "*"], &format!("http://127.0.0.1:{app}/")), "the app answers");
    assert!(!curl(&["--noproxy", "*"], &format!("http://127.0.0.1:{other}/")), "another local service does not");
    assert!(!curl(&[], "https://example.com"), "the outside does not");
    assert!(!curl(&["--noproxy", "*"], "http://1.1.1.1"), "not even by address");
    assert!(!curl(&["-x", "http://127.0.0.1:7890"], "http://x"), "nor via a proxy");
    let out = |p: &Path| p.display().to_string();
    assert!(run(&[
        "/usr/bin/curl",
        "-sS",
        "-m",
        "5",
        "--noproxy",
        "*",
        "-o",
        &out(&own.join("x")),
        &format!("http://127.0.0.1:{app}/")
    ]));
    assert!(
        !run(&[
            "/usr/bin/curl",
            "-sS",
            "-m",
            "5",
            "--noproxy",
            "*",
            "-o",
            &out(&root.join("x")),
            &format!("http://127.0.0.1:{app}/")
        ]),
        "nothing else is writable"
    );
    assert!(
        !run(&["/usr/bin/curl", "-sS", &format!("file://{}", out(&home.join("notes/private.txt")))]),
        "your home is not readable"
    );
    assert!(!run(&["/bin/sh", "-c", "true"]), "nothing outside the browser's own bundle starts");
}

#[cfg(target_os = "macos")]
#[test]
fn profile_is_enforced_by_sandbox_exec() {
    if !available() {
        return;
    }
    let tmp = tempfile::tempdir_in("/tmp").unwrap();
    let root = crate::paths::real(tmp.path());
    let home = root.join("home");
    for d in ["ws/.git", "tmp", "cache", "home/.ssh", "home/.cargo/registry", "home/projects/other"] {
        std::fs::create_dir_all(root.join(d)).unwrap();
    }
    std::fs::write(home.join(".ssh/id"), "k").unwrap();
    std::fs::write(home.join("projects/other/.env"), "SECRET=1").unwrap();
    let sb = root.join("p.sb");
    std::fs::write(&sb, profile(&spec(&root, &home, false))).unwrap();
    let ws = root.join("ws");
    let run = |cmd: &str| sandboxed(&sb, &ws, cmd);
    assert!(run("echo a > inside.txt && cat inside.txt"), "workspace is read-write");
    assert!(run(&format!("echo a > {}/x", root.join("cache").display())), "goal cache is writable");
    assert!(!run(&format!("echo a > {}/outside.txt", root.display())), "writes outside are denied");
    assert!(!run(&format!("cat {}/.ssh/id", home.display())), "credentials are unreadable");
    assert!(!run(&format!("cat {}/projects/other/.env", home.display())), "other projects are unreadable");
    assert!(!run(&format!("touch {}/.cargo/registry/poison", home.display())), "shared caches are not writable");
    assert!(!run("echo x >> .git/config"), "git config is read-only");
    std::fs::create_dir_all(root.join("node_modules/pkg")).unwrap();
    std::fs::write(root.join("node_modules/pkg/index.js"), "x").unwrap();
    assert!(run(&format!("cat {}/node_modules/pkg/index.js", root.display())), "node_modules above is readable");
    assert!(!run(&format!("echo a > {}/node_modules/pkg/x", root.display())), "but not writable");
    let git = std::process::Command::new("/usr/bin/sandbox-exec")
        .arg("-f")
        .arg(&sb)
        .args(["/bin/sh", "-c", "GIT_CONFIG_GLOBAL=/dev/null git --version"])
        .env("PATH", format!("{}:/usr/bin:/bin", developer_bin().map(|d| d.display().to_string()).unwrap_or_default()))
        .current_dir(&ws)
        .output()
        .unwrap();
    assert!(git.status.success(), "git runs: {}", String::from_utf8_lossy(&git.stderr));
    assert!(run("/usr/bin/python3 -c 'print(1)' >/dev/null 2>&1 || true"), "interpreters start");
    assert!(!run("/usr/bin/curl -sS -m 5 https://example.com >/dev/null 2>&1"), "no network by default");
    // Even through a local proxy (Clash, Surge, …) listening on loopback.
    assert!(
        !run("/usr/bin/curl -sS -m 5 -x http://127.0.0.1:7890 https://example.com >/dev/null 2>&1"),
        "no proxy escape"
    );
    assert!(
        !run("/usr/bin/curl -s -m 3 --unix-socket /var/run/docker.sock http://x/version >/dev/null 2>&1"),
        "no docker socket"
    );
    // Reads are an allow-list: a file next to the goal's directories (in
    // the shared /tmp) and the user's shared temporary folder are closed.
    std::fs::write(root.join("neighbour.txt"), "n").unwrap();
    assert!(!run(&format!("cat {}/neighbour.txt", root.display())), "shared /tmp is unreadable");
    let user_tmp = crate::paths::real(&std::env::temp_dir());
    if user_tmp.starts_with("/private/var/folders") {
        assert!(!run(&format!("touch {}/tower-sandbox-probe", user_tmp.display())), "shared temp is not writable");
        assert!(!run(&format!("ls {}", user_tmp.display())), "shared temp is unreadable");
    }
    if Path::new("/opt/homebrew/etc").is_dir() {
        assert!(!run("ls /opt/homebrew/etc >/dev/null"), "package manager configuration is unreadable");
    }
    if Path::new("/opt/homebrew/var").is_dir() {
        assert!(!run("ls /opt/homebrew/var >/dev/null"), "services' data under the prefix is unreadable");
    }
    if Path::new("/Library/Preferences/com.apple.dock.plist").exists() {
        assert!(!run("cat /Library/Preferences/com.apple.dock.plist >/dev/null"), "other apps' preferences are closed");
    }
    assert!(run("/bin/ls / >/dev/null && /usr/bin/env true"), "the system still works");
}

/// With the network allowed, TLS works without the keychain service.
/// Needs internet access; skipped (passes) when the host has none.
#[cfg(target_os = "macos")]
#[test]
fn tls_works_with_network_and_without_keychain() {
    if !available() {
        return;
    }
    let reachable = std::process::Command::new("/usr/bin/curl")
        .args(["-sS", "-m", "5", "-o", "/dev/null", "https://example.com"])
        .status()
        .is_ok_and(|s| s.success());
    if !reachable {
        return;
    }
    let tmp = tempfile::tempdir_in("/tmp").unwrap();
    let root = crate::paths::real(tmp.path());
    for d in ["ws/.git", "tmp", "cache", "home"] {
        std::fs::create_dir_all(root.join(d)).unwrap();
    }
    let sb = root.join("p.sb");
    let p = profile(&spec(&root, &root.join("home"), true));
    assert!(!p.contains("com.apple.SecurityServer"));
    std::fs::write(&sb, p).unwrap();
    let ok = std::process::Command::new("/usr/bin/sandbox-exec")
        .arg("-f")
        .arg(&sb)
        .args(["/usr/bin/curl", "-sS", "-m", "10", "-o", "/dev/null", "https://example.com"])
        .status()
        .unwrap()
        .success();
    assert!(ok, "TLS through trustd only");
}
