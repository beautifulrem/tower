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
}
