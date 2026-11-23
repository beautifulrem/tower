use std::fs;
use std::path::Path;
use std::process::Command;

use tower_git::Git;

fn sh(dir: &Path, args: &[&str]) -> String {
    let out = Command::new("git")
        .args(args)
        .current_dir(dir)
        .env("GIT_AUTHOR_NAME", "Ada")
        .env("GIT_AUTHOR_EMAIL", "ada@example.com")
        .env("GIT_COMMITTER_NAME", "Ada")
        .env("GIT_COMMITTER_EMAIL", "ada@example.com")
        .output()
        .unwrap();
    assert!(out.status.success(), "git {args:?}: {}", String::from_utf8_lossy(&out.stderr));
    String::from_utf8_lossy(&out.stdout).trim().to_string()
}

fn user_repo(dir: &Path) {
    sh(dir, &["init", "--quiet", "--initial-branch=main"]);
    sh(dir, &["config", "user.name", "Ada"]);
    sh(dir, &["config", "user.email", "ada@example.com"]);
    fs::write(dir.join("a.txt"), "one\ntwo\n").unwrap();
    fs::write(dir.join(".gitignore"), "secret.env\n").unwrap();
    sh(dir, &["add", "."]);
    sh(dir, &["commit", "--quiet", "-m", "init"]);
}

#[test]
fn a_goal_runs_in_isolation_and_lands_as_a_branch() {
    let tmp = tempfile::tempdir().unwrap();
    let repo = tmp.path().join("repo");
    fs::create_dir(&repo).unwrap();
    user_repo(&repo);
    let git = Git::default();

    let ws = tmp.path().join("ws/G-0001");
    let base = git.prepare_workspace(&repo, "main", &ws, "G-0001").unwrap();
    assert_eq!(base, sh(&repo, &["rev-parse", "HEAD"]));
    assert!(sh(&ws, &["remote"]).is_empty(), "satellite has no remote");

    // The agent edits, adds a file and writes an ignored secret.
    fs::write(ws.join("a.txt"), "one\nTWO\nthree\n").unwrap();
    fs::write(ws.join("b.txt"), "new\n").unwrap();
    fs::write(ws.join("secret.env"), "KEY=1\n").unwrap();

    let s1 = git.snapshot(&ws, &base).unwrap();
    assert_eq!((s1.stat.files, s1.stat.additions, s1.stat.deletions), (2, 3, 1));
    assert!(!s1.changed.contains(&"secret.env".to_string()), "ignored files are not snapshotted");
    // The agent's own index is untouched.
    assert!(sh(&ws, &["diff", "--cached", "--name-only"]).is_empty());

    // Same content, same pin.
    assert_eq!(git.snapshot(&ws, &base).unwrap().pin, s1.pin);

    let files = git.diff(&ws, &base, &s1.pin).unwrap();
    assert_eq!(files.iter().map(|f| f.path.as_str()).collect::<Vec<_>>(), ["a.txt", "b.txt"]);

    // Verifier gets a clean checkout of exactly the pin.
    let vdir = tmp.path().join("verify");
    git.add_verify_checkout(&ws, &s1.pin, &vdir).unwrap();
    assert_eq!(fs::read_to_string(vdir.join("b.txt")).unwrap(), "new\n");
    assert!(!vdir.join("secret.env").exists());
    git.remove_verify_checkout(&ws, &vdir).unwrap();
    assert!(!vdir.exists());

    // The user's checkout was never touched.
    assert_eq!(fs::read_to_string(repo.join("a.txt")).unwrap(), "one\ntwo\n");

    // Accepting writes a branch authored by the user.
    let (branch, commit) = git.seal(&repo, &ws, &base, &s1.pin, "tower/G-0001", "G-0001: change a").unwrap();
    assert_eq!(branch, "tower/G-0001");
    assert_eq!(sh(&repo, &["log", "-1", "--format=%an %s", &branch]), "Ada G-0001: change a");
    assert!(!git.is_integrated(&repo, "main", &commit));

    // A second accept does not overwrite the first branch.
    let (again, _) = git.seal(&repo, &ws, &base, &s1.pin, "tower/G-0001", "G-0001: again").unwrap();
    assert_eq!(again, "tower/G-0001-v2");

    // The user squash-merges it.
    sh(&repo, &["merge", "--quiet", "--squash", &branch]);
    sh(&repo, &["commit", "--quiet", "-m", "squash"]);
    assert!(git.is_integrated(&repo, "main", &commit));
}

#[test]
fn detects_test_and_setup_commands() {
    let tmp = tempfile::tempdir().unwrap();
    let d = tmp.path();
    assert_eq!(Git::detect_test_command(d), None);
    fs::write(d.join("package.json"), r#"{"scripts":{"test":"vitest run"}}"#).unwrap();
    fs::write(d.join("pnpm-lock.yaml"), "").unwrap();
    assert_eq!(Git::detect_test_command(d).as_deref(), Some("pnpm test"));
    assert_eq!(Git::detect_setup_command(d).as_deref(), Some("pnpm install --frozen-lockfile --prefer-offline"));

    // Nothing to install, nothing to set up.
    let e = tmp.path().join("plain");
    fs::create_dir_all(&e).unwrap();
    fs::write(e.join("package.json"), r#"{"scripts":{"test":"node --test"}}"#).unwrap();
    assert_eq!(Git::detect_setup_command(&e), None);
    fs::write(e.join("package.json"), r#"{"devDependencies":{"vitest":"^3"}}"#).unwrap();
    assert_eq!(Git::detect_setup_command(&e).as_deref(), Some("npm install"));
}

#[test]
fn local_files_and_push() {
    let tmp = tempfile::tempdir().unwrap();
    let repo = tmp.path().join("repo");
    fs::create_dir(&repo).unwrap();
    user_repo(&repo);
    // secret.env is ignored by the repo's .gitignore; README is tracked.
    fs::write(repo.join("secret.env"), "KEY=1\n").unwrap();
    let git = Git::default();
    let ws = tmp.path().join("ws");
    let base = git.prepare_workspace(&repo, "main", &ws, "G-0001").unwrap();
    let copied = git.copy_local_files(&repo, &ws, &["*.env".into(), "a.txt".into()]).unwrap();
    assert_eq!(copied, ["secret.env"], "tracked a.txt is not a local file");
    assert_eq!(fs::read_to_string(ws.join("secret.env")).unwrap(), "KEY=1\n");
    // Local files are ignored in the workspace too, so they never reach a snapshot.
    let snap = git.snapshot(&ws, &base).unwrap();
    assert!(snap.changed.is_empty());

    fs::write(ws.join("a.txt"), "changed\n").unwrap();
    let after = git.snapshot(&ws, &base).unwrap();
    assert_eq!(git.changed_between(&ws, &snap.pin, &after.pin).unwrap(), ["a.txt"]);

    // Pushing goes to origin.
    let remote = tmp.path().join("remote.git");
    sh(tmp.path(), &["init", "--quiet", "--bare", remote.to_str().unwrap()]);
    sh(&repo, &["remote", "add", "origin", remote.to_str().unwrap()]);
    let (branch, commit) = git.seal(&repo, &ws, &base, &after.pin, "tower/g-0001", "msg").unwrap();
    git.push_branch(&repo, &branch).unwrap();
    assert_eq!(sh(&remote, &["rev-parse", &branch]), commit);
    assert!(git.origin_url(&repo).unwrap().ends_with("remote.git"));
}

#[test]
fn touched_files_and_predicted_conflicts() {
    let tmp = tempfile::tempdir().unwrap();
    let repo = tmp.path();
    user_repo(repo);
    let git = Git::default();
    let base = sh(repo, &["rev-parse", "HEAD"]);

    fs::write(repo.join("a.txt"), "one\nTWO\n").unwrap();
    fs::write(repo.join("new.txt"), "x").unwrap();
    assert_eq!(git.touched(repo, &base).unwrap(), ["a.txt", "new.txt"]);

    // A branch and main both change the same line.
    sh(repo, &["checkout", "--quiet", "-b", "feature"]);
    sh(repo, &["add", "a.txt"]);
    sh(repo, &["commit", "--quiet", "-m", "feature"]);
    sh(repo, &["checkout", "--quiet", "main"]);
    fs::write(repo.join("a.txt"), "one\ndos\n").unwrap();
    sh(repo, &["commit", "--quiet", "-am", "main"]);
    assert_eq!(git.merge_conflicts(repo, "main", "feature"), Some(vec!["a.txt".to_string()]));
    assert_eq!(git.merge_conflicts(repo, "main", "main"), Some(vec![]));
}

#[test]
fn a_fix_after_acceptance_updates_the_same_branch() {
    let tmp = tempfile::tempdir().unwrap();
    let repo = tmp.path().join("repo");
    fs::create_dir_all(&repo).unwrap();
    user_repo(&repo);
    let git = Git::default();
    let ws = tmp.path().join("ws/G-0001");
    let base = git.prepare_workspace(&repo, "main", &ws, "G-0001").unwrap();

    fs::write(ws.join("a.txt"), "one\ntwo\nthree\n").unwrap();
    let s1 = git.snapshot(&ws, &base).unwrap();
    let (branch, first) = git.seal(&repo, &ws, &base, &s1.pin, "tower/g-0001", "first").unwrap();

    // CI failed; the agent fixed it in the same workspace.
    fs::write(ws.join("a.txt"), "one\ntwo\nthree\nfour\n").unwrap();
    let s2 = git.snapshot(&ws, &base).unwrap();
    let second = git.seal_update(&repo, &ws, &first, &s2.pin, &branch, "fix CI").unwrap();

    assert_eq!(sh(&repo, &["rev-parse", &branch]), second, "the same branch moved");
    assert_eq!(sh(&repo, &["rev-parse", &format!("{second}^")]), first, "a fast-forward on top of the first seal");
    assert_eq!(sh(&repo, &["show", &format!("{branch}:a.txt")]), "one\ntwo\nthree\nfour");
}

#[test]
fn writes_into_a_foreign_tree_never_follow_links() {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path().join("checkout");
    let outside = tmp.path().join("outside");
    fs::create_dir_all(&root).unwrap();
    fs::create_dir_all(&outside).unwrap();
    fs::write(outside.join("secret"), "keep").unwrap();
    // A planted link at the file itself is replaced, not followed.
    std::os::unix::fs::symlink(outside.join("secret"), root.join(".env")).unwrap();
    tower_git::write_inside(&root, ".env", b"TOKEN=1").unwrap();
    assert_eq!(fs::read_to_string(outside.join("secret")).unwrap(), "keep");
    assert_eq!(fs::read_to_string(root.join(".env")).unwrap(), "TOKEN=1");
    // A planted link among the directories is refused.
    std::os::unix::fs::symlink(&outside, root.join("conf")).unwrap();
    assert!(tower_git::write_inside(&root, "conf/x", b"x").is_err());
    assert!(!outside.join("x").exists());
    assert!(tower_git::write_inside(&root, "../escape", b"x").is_err());
    tower_git::write_inside(&root, "a/b/c.txt", b"ok").unwrap();
    assert_eq!(fs::read_to_string(root.join("a/b/c.txt")).unwrap(), "ok");
}

#[test]
fn snapshot_timeline_and_sequential_merge_queue_check() {
    let tmp = tempfile::tempdir().unwrap();
    let repo = tmp.path().join("repo");
    fs::create_dir(&repo).unwrap();
    user_repo(&repo);
    let git = Git::default();

    // 1. Snapshot timeline + arbitrary rev-to-rev diff in a goal workspace.
    let ws = tmp.path().join("ws/G-0001");
    let base = git.prepare_workspace(&repo, "main", &ws, "G-0001").unwrap();
    let s0 = git.snapshot(&ws, &base).unwrap();
    git.keep(&ws, "refs/tower/runs/1", &s0.pin).unwrap();

    fs::write(ws.join("a.txt"), "one\ntwo\nrun1\n").unwrap();
    let s1 = git.snapshot(&ws, &base).unwrap();
    git.keep(&ws, "refs/tower/runs/2", &s1.pin).unwrap();

    fs::write(ws.join("b.txt"), "run2\n").unwrap();
    let s2 = git.snapshot(&ws, &base).unwrap();

    let snaps = git.list_run_snapshots(&ws).unwrap();
    assert_eq!(snaps.len(), 3, "run 1, run 2, latest pin: {snaps:?}");
    assert_eq!(snaps[0].run_no, Some(1));
    assert_eq!(snaps[1].run_no, Some(2));
    assert_eq!(snaps[2].kind, "pin");

    let turn2_diff = git.diff_revs(&ws, &s1.pin, &s2.pin).unwrap();
    assert_eq!(turn2_diff.iter().map(|f| f.path.as_str()).collect::<Vec<_>>(), ["b.txt"]);

    // 2. Sequential merge queue check: branch-a edits a.txt, branch-b edits same line of a.txt,
    // branch-c edits c.txt (disjoint). Branch-a is clean, branch-b conflicts with branch-a, branch-c is clean.
    sh(&repo, &["checkout", "--quiet", "-b", "branch-a"]);
    fs::write(repo.join("a.txt"), "alpha\ntwo\n").unwrap();
    sh(&repo, &["commit", "--quiet", "-am", "branch a"]);

    sh(&repo, &["checkout", "--quiet", "main"]);
    sh(&repo, &["checkout", "--quiet", "-b", "branch-b"]);
    fs::write(repo.join("a.txt"), "beta\ntwo\n").unwrap();
    sh(&repo, &["commit", "--quiet", "-am", "branch b"]);

    sh(&repo, &["checkout", "--quiet", "main"]);
    sh(&repo, &["checkout", "--quiet", "-b", "branch-c"]);
    fs::write(repo.join("c.txt"), "gamma\n").unwrap();
    sh(&repo, &["add", "c.txt"]);
    sh(&repo, &["commit", "--quiet", "-m", "branch c"]);
    sh(&repo, &["checkout", "--quiet", "main"]);

    let checked =
        git.merge_queue_check(&repo, "main", &["branch-a".into(), "branch-b".into(), "branch-c".into()]).unwrap();
    assert_eq!(checked.len(), 3);
    assert!(checked[0].conflict_files.is_empty(), "branch-a clean on main");
    assert_eq!(checked[1].conflict_files, vec!["a.txt"], "branch-b conflicts with branch-a");
    assert!(checked[2].conflict_files.is_empty(), "branch-c disjoint from branch-a");
    // Working tree of user's repo was never modified.
    assert_eq!(fs::read_to_string(repo.join("a.txt")).unwrap(), "one\ntwo\n");
    assert!(!repo.join("c.txt").exists());
}

/// The agent can write most of its workspace's `.git`. Should it point git
/// at a configuration of its own (a copy of `.git` named by `commondir`)
/// that asks for an fsmonitor, hooks, a filter or a textconv, nothing Tower
/// runs there may start them: Tower's git runs outside the sandbox.
#[test]
fn a_redirected_workspace_config_runs_nothing_for_tower() {
    use std::os::unix::fs::PermissionsExt;
    let tmp = tempfile::tempdir().unwrap();
    let repo = tmp.path().join("repo");
    fs::create_dir(&repo).unwrap();
    user_repo(&repo);
    let git = Git::default();
    let ws = tmp.path().join("ws");
    let base = git.prepare_workspace(&repo, "main", &ws, "G-0001").unwrap();
    let base_pin = git.snapshot(&ws, &base).unwrap().pin;

    // What the agent does from inside: copy `.git`, give the copy commands
    // that each leave their own marker, and redirect to it.
    let marker = |what: &str| tmp.path().join(format!("ran-{what}"));
    let evil = ws.join(".evil");
    assert!(Command::new("cp").arg("-R").arg(ws.join(".git")).arg(&evil).status().unwrap().success());
    let hooks = ws.join("evil-hooks");
    fs::create_dir(&hooks).unwrap();
    for hook in ["reference-transaction", "post-checkout", "post-index-change"] {
        fs::write(hooks.join(hook), format!("#!/bin/sh\ntouch '{}'\n", marker("hook").display())).unwrap();
        fs::set_permissions(hooks.join(hook), fs::Permissions::from_mode(0o755)).unwrap();
    }
    let touch = |what: &str| format!("touch '{}'; cat", marker(what).display());
    let config = evil.join("config");
    for (k, v) in [
        ("core.fsmonitor", format!("touch '{}'; false", marker("fsmonitor").display())),
        ("core.hooksPath", hooks.display().to_string()),
        ("filter.x.clean", touch("clean")),
        ("filter.x.smudge", touch("smudge")),
        ("diff.x.textconv", touch("textconv")),
    ] {
        let mut c = Command::new("git");
        c.arg("config").arg("-f").arg(&config).args([k, v.as_str()]);
        assert!(c.status().unwrap().success());
    }
    fs::write(ws.join(".gitattributes"), "*.txt filter=x diff=x\n").unwrap();
    fs::write(ws.join(".git/commondir"), "../.evil\n").unwrap();
    fs::write(ws.join("a.txt"), "changed\n").unwrap();

    let ran = || {
        ["fsmonitor", "hook", "clean", "smudge", "textconv"]
            .into_iter()
            .filter(|w| marker(w).exists())
            .collect::<Vec<_>>()
    };
    let _ = git.touched(&ws, &base);
    assert_eq!(ran(), [""; 0], "the background refresh ran the agent's commands");
    let pin = git.snapshot(&ws, &base).map(|s| s.pin);
    assert_eq!(ran(), [""; 0], "a snapshot ran the agent's commands");
    let _ = git.diff(&ws, &base, pin.as_deref().unwrap_or(&base_pin));
    let _ = git.revert_hunk(&ws, &base, pin.as_deref().unwrap_or(&base_pin), "a.txt", 0);
    assert_eq!(ran(), [""; 0], "a diff ran the agent's commands");
    let _ = git.restore(&ws, &base_pin);
    assert_eq!(ran(), [""; 0], "restoring ran the agent's commands");

    // And should the workspace's own config ever ask for an fsmonitor or
    // hooks (the sandbox keeps it read-only), Tower's git still runs neither.
    fs::remove_file(ws.join(".git/commondir")).unwrap();
    fs::remove_file(ws.join(".gitattributes")).unwrap();
    for (k, v) in [
        ("core.fsmonitor", format!("touch '{}'; false", marker("fsmonitor").display())),
        ("core.hooksPath", hooks.display().to_string()),
    ] {
        let mut c = Command::new("git");
        c.arg("config").arg("-f").arg(ws.join(".git/config")).args([k, v.as_str()]);
        assert!(c.status().unwrap().success());
    }
    git.touched(&ws, &base).unwrap();
    let pin = git.snapshot(&ws, &base).unwrap().pin;
    git.keep(&ws, "refs/tower/runs/1", &pin).unwrap();
    git.restore(&ws, &base_pin).unwrap();
    assert_eq!(ran(), [""; 0], "the workspace's own config ran commands for Tower");
}
