//! What a file is for (`docs/07` §7.5). One classification, shared by the
//! sentinels, the review's risk order and verification's source-only
//! re-run, so a rule added for one is a rule for all.
//!
//! The re-run is what makes the verdict hold: a criterion may pass only
//! because of the agent's *source* changes. Everything else the agent added
//! or changed — tests, test data, runner and tool configuration, scripts,
//! package-manager settings — is put back as it was on the base and the
//! criteria run again. The name lists below decide what counts as source;
//! a file they miss is treated as configuration (reverted), never the other
//! way round, so a new name can only cost a false alarm, not a false pass.

/// The role of one path in a repository.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Role {
    /// Program code and the data it ships with.
    Source,
    /// Test code.
    Test,
    /// Test inputs and expected outputs kept as data.
    TestData,
    /// What decides which tests run and what they run against.
    TestHarness,
    /// Manifests, lockfiles and package-manager configuration.
    Dependency,
    /// Task runners, build scripts, CI.
    Build,
    /// Tool and runtime configuration: dotfiles, `*.config.*`, top-level
    /// settings files, interpreter start-up hooks.
    Config,
    /// Prose.
    Docs,
}

impl Role {
    /// Whether the source-only re-run keeps the agent's version of a file
    /// with this role at `path`. Lockfiles and the manifests of compiled
    /// ecosystems stay: they are not read while tests run (except the parts
    /// the sentinels watch), and putting them back would only make the build
    /// fetch again.
    pub fn kept_in_source_only_run(self, path: &str) -> bool {
        match self {
            Role::Source | Role::Docs => true,
            Role::Dependency => KEPT_DEPENDENCY_FILES.contains(&name_of(path)) || is_requirements(path),
            _ => false,
        }
    }
}

fn name_of(path: &str) -> &str {
    path.rsplit('/').next().unwrap_or(path)
}

pub fn is_test_path(path: &str) -> bool {
    let p = path.to_ascii_lowercase();
    let name = name_of(&p);
    p.starts_with("test/")
        || p.starts_with("tests/")
        || p.contains("/test/")
        || p.contains("/tests/")
        || p.contains("__tests__")
        || p.starts_with("spec/")
        || p.contains("/spec/")
        || is_test_data(path)
        || p.contains("__snapshots__/")
        || name.contains(".test.")
        || name.contains(".spec.")
        || name.contains("_spec.")
        || name.starts_with("test_")
        || name.ends_with("_test.go")
        || name.ends_with("_test.py")
        || name.ends_with("_test.rs")
}

/// Test inputs and expected outputs kept as data.
pub fn is_test_data(path: &str) -> bool {
    let p = path.to_ascii_lowercase();
    p.starts_with("testdata/")
        || p.contains("/testdata/")
        || p.contains("fixtures/")
        || p.contains("/golden/")
        || p.ends_with(".golden")
        || p.ends_with(".snap")
}

/// Names (prefixes) of test-harness files: runner configuration, global
/// setup, mocks. Only used to explain and order; the re-run does not
/// depend on this list being complete.
const TEST_HARNESS: &[&str] = &[
    "jest.config",
    "jest.setup",
    "vitest.config",
    "vitest.setup",
    "vitest.workspace",
    "playwright.config",
    "karma.conf",
    ".mocharc",
    "pytest.ini",
    "conftest.py",
    "phpunit.xml",
    "setupTests",
    "test-setup",
    "setup-tests",
    ".nycrc",
    ".c8rc",
    "ava.config",
    "cypress.config",
];

/// Whether `path` is part of the test harness.
pub fn is_test_harness(path: &str) -> bool {
    let name = name_of(path);
    let lower = name.to_ascii_lowercase();
    TEST_HARNESS.iter().any(|h| name.starts_with(h))
        // Named after a runner (`setup-jest.js`, `mocha-env.cjs`): its setup.
        || ["jest", "vitest", "mocha", "karma", "jasmine", "pytest", "cypress", "playwright"]
            .iter()
            .any(|r| lower.contains(r))
        || path.contains("__mocks__/")
        || path.starts_with("spec/support/")
        || path.contains("/spec/support/")
}

/// Manifests, lockfiles and package-manager configuration: what decides
/// which third-party code an install downloads and runs.
const DEPENDENCY_FILES: &[&str] = &[
    "package.json",
    "package-lock.json",
    "npm-shrinkwrap.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "yarn.lock",
    ".yarnrc",
    ".yarnrc.yml",
    ".npmrc",
    ".pnpmfile.cjs",
    "bun.lock",
    "bun.lockb",
    "bunfig.toml",
    "Cargo.toml",
    "Cargo.lock",
    "pyproject.toml",
    "setup.py",
    "setup.cfg",
    "Pipfile",
    "Pipfile.lock",
    "poetry.lock",
    "uv.lock",
    "go.mod",
    "go.sum",
    "go.work",
    "Gemfile",
    "Gemfile.lock",
    "composer.json",
    "composer.lock",
];

/// Dependency files the source-only re-run keeps (see [`Role::kept_in_source_only_run`]).
const KEPT_DEPENDENCY_FILES: &[&str] = &[
    "package-lock.json",
    "npm-shrinkwrap.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "bun.lock",
    "bun.lockb",
    "Cargo.toml",
    "Cargo.lock",
    "Pipfile.lock",
    "poetry.lock",
    "uv.lock",
    "go.mod",
    "go.sum",
    "Gemfile.lock",
    "composer.lock",
];

fn is_requirements(path: &str) -> bool {
    let name = name_of(path);
    name.starts_with("requirements") && name.ends_with(".txt")
}

pub fn is_dependency_file(path: &str) -> bool {
    DEPENDENCY_FILES.contains(&name_of(path))
        || is_requirements(path)
        || path.starts_with(".cargo/config")
        || path.contains("/.cargo/config")
}

/// Third-party code kept in the repository: someone else's source, so
/// changing it is not the fix (and it can hold a test runner).
fn is_vendored(path: &str) -> bool {
    let p = format!("/{path}");
    ["/vendor/", "/third_party/", "/third-party/", "/node_modules/", "/.yarn/", "/site-packages/"]
        .iter()
        .any(|v| p.contains(v))
}

/// Task runners, build scripts and CI: they decide what commands do.
fn is_build(path: &str) -> bool {
    let name = name_of(path);
    matches!(
        name,
        "Makefile"
            | "makefile"
            | "GNUmakefile"
            | "justfile"
            | "Justfile"
            | ".justfile"
            | "Taskfile.yml"
            | "Taskfile.yaml"
            | "noxfile.py"
            | "tox.ini"
            | "build.rs"
            | "Rakefile"
            | "Dockerfile"
            | "docker-compose.yml"
            | "compose.yaml"
    ) || name.ends_with(".mk")
        || name.ends_with(".sh")
        || name.ends_with(".bash")
        || path.starts_with("scripts/")
        || path.starts_with(".github/")
        || path.starts_with(".husky/")
        || name == ".gitlab-ci.yml"
}

/// Tool and runtime configuration.
fn is_config(path: &str) -> bool {
    let name = name_of(path);
    let lower = name.to_ascii_lowercase();
    let top_level = !path.contains('/');
    // Hidden files and anything inside a hidden directory.
    path.split('/').any(|part| part.starts_with('.') && part.len() > 1)
        // `vite.config.ts`, `babel.config.js`, `tsconfig.json`, `.eslintrc.cjs`
        || lower.contains(".config.")
        || lower.starts_with("tsconfig")
        || lower.starts_with("jsconfig")
        // Python runs these at interpreter start-up.
        || lower.ends_with(".pth")
        || lower == "sitecustomize.py"
        || lower == "usercustomize.py"
        // Settings files at the top of the repository.
        || (top_level
            && [".json", ".jsonc", ".json5", ".toml", ".yaml", ".yml", ".ini", ".cfg", ".conf", ".env", ".properties", ".xml"]
                .iter()
                .any(|ext| lower.ends_with(ext)))
}

fn is_docs(path: &str) -> bool {
    let lower = name_of(path).to_ascii_lowercase();
    [".md", ".mdx", ".rst", ".adoc", ".txt"].iter().any(|e| lower.ends_with(e))
        || matches!(lower.as_str(), "license" | "licence" | "authors" | "changelog" | "notice")
        || path.starts_with("docs/")
}

/// The role of `path` (relative to the repository root).
pub fn role(path: &str) -> Role {
    if is_test_harness(path) {
        Role::TestHarness
    } else if is_test_data(path) {
        Role::TestData
    } else if is_test_path(path) {
        Role::Test
    } else if is_dependency_file(path) || is_vendored(path) {
        Role::Dependency
    } else if is_build(path) {
        Role::Build
    } else if is_config(path) {
        Role::Config
    } else if is_docs(path) && !is_requirements(path) {
        Role::Docs
    } else if is_source(path) {
        Role::Source
    } else {
        // Not recognised: treated as configuration, so the source-only
        // re-run puts it back. An unknown name costs a false alarm at worst,
        // never a false pass.
        Role::Config
    }
}

/// Program code and the data and assets it ships with, by extension.
const SOURCE_EXTENSIONS: &[&str] = &[
    // code
    "rs",
    "js",
    "mjs",
    "cjs",
    "jsx",
    "ts",
    "mts",
    "cts",
    "tsx",
    "py",
    "pyi",
    "go",
    "rb",
    "java",
    "kt",
    "kts",
    "scala",
    "swift",
    "m",
    "mm",
    "c",
    "h",
    "cc",
    "cpp",
    "cxx",
    "hpp",
    "hh",
    "cs",
    "fs",
    "php",
    "ex",
    "exs",
    "erl",
    "hrl",
    "hs",
    "ml",
    "mli",
    "clj",
    "cljs",
    "dart",
    "lua",
    "r",
    "jl",
    "zig",
    "nim",
    "v",
    "sol",
    "sql",
    "graphql",
    "gql",
    "proto",
    "vue",
    "svelte",
    "astro",
    "html",
    "htm",
    "css",
    "scss",
    "sass",
    "less",
    "styl",
    "elm",
    // data and templates shipped with the code (inside the tree; top-level
    // settings files are configuration)
    "json",
    "jsonc",
    "json5",
    "yaml",
    "yml",
    "toml",
    "xml",
    "csv",
    "tsv",
    "ini",
    "properties",
    "hbs",
    "ejs",
    "njk",
    "liquid",
    "jinja",
    "j2",
    "tmpl",
    "tpl",
    "po",
    "pot",
    "ftl",
    "strings",
    "plist",
    // assets
    "svg",
    "png",
    "jpg",
    "jpeg",
    "gif",
    "webp",
    "avif",
    "ico",
    "bmp",
    "woff",
    "woff2",
    "ttf",
    "otf",
    "eot",
    "mp3",
    "wav",
    "ogg",
    "mp4",
    "webm",
    "pdf",
    "wasm",
];

fn is_source(path: &str) -> bool {
    let name = name_of(path);
    match name.rsplit_once('.') {
        Some((stem, ext)) if !stem.is_empty() => SOURCE_EXTENSIONS.contains(&ext.to_ascii_lowercase().as_str()),
        _ => false,
    }
}

/// Modules that *are* test machinery: the assertion libraries and the
/// runners. Program code has rare reasons to import one, so an import is
/// worth showing in review — but only a real import counts, not a line
/// that happens to contain the word. Whether the entry points those
/// libraries export are still the library's own objects while the tests
/// run is checked by Tower at run time, not here (`docs/07` §7.6).
const TEST_MACHINERY_MODULES: &[&str] = &[
    // JavaScript and TypeScript
    "assert",
    "node:assert",
    "chai",
    "vitest",
    "jest",
    "@jest/globals",
    "@jest/expect",
    "expect",
    "node:test",
    "mocha",
    "ava",
    "tape",
    "uvu",
    "power-assert",
    // Python
    "pytest",
    "_pytest",
    "unittest",
    "nose",
    "nose2",
];

/// The modules a line imports: `import … from "x"`, `require("x")`,
/// `import("x")`, Python's `import x` / `from x import …` / `__import__("x")`.
/// Only the module names, so a string or a comment that mentions a library
/// is not an import of it.
pub fn imported_modules(line: &str) -> Vec<&str> {
    let t = line.trim();
    let mut out: Vec<&str> = Vec::new();
    for marker in ["from ", "require(", "import(", "import ", "__import__("] {
        for m in quoted_after(t, marker) {
            if !m.is_empty() && !out.contains(&m) {
                out.push(m);
            }
        }
    }
    // Python's unquoted forms.
    if let Some(rest) = t.strip_prefix("import ").or_else(|| t.strip_prefix("from ")) {
        let head = if t.starts_with("from ") { rest.split(" import").next().unwrap_or(rest) } else { rest };
        for part in head.split(',') {
            let words: Vec<&str> = part.trim().trim_end_matches(';').split_whitespace().collect();
            let name = words.first().copied().unwrap_or("");
            // `import x`, `import x as y` — not JavaScript's `import x from "y"`.
            let pythonic = (words.len() == 1 || (words.len() == 3 && words[1] == "as"))
                && !name.is_empty()
                && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '.')
                && !name.starts_with('.');
            if pythonic && !out.contains(&name) {
                out.push(name);
            }
        }
    }
    out
}

/// The quoted strings that follow each occurrence of `marker`.
fn quoted_after<'a>(line: &'a str, marker: &str) -> Vec<&'a str> {
    let mut out = Vec::new();
    let mut rest = line;
    while let Some(i) = rest.find(marker) {
        let after = &rest[i + marker.len()..];
        let trimmed = after.trim_start();
        if let Some(quote) = trimmed.chars().next().filter(|c| matches!(c, '\'' | '"' | '`')) {
            let body = &trimmed[quote.len_utf8()..];
            if let Some(end) = body.find(quote) {
                out.push(&body[..end]);
            }
        }
        rest = after;
    }
    out
}

/// Whether an imported module is (or is inside) one of the machinery ones.
fn is_machinery_module(found: &str, machinery: &str) -> bool {
    found == machinery
        || found.strip_prefix(machinery).is_some_and(|rest| rest.starts_with('.') || rest.starts_with('/'))
}

/// Environment variables only a test runner sets. Program code that looks
/// one up is asking "am I under the tests?", which is how a special case
/// for the test run is written. A variable applications set themselves
/// (`NODE_ENV`, `CI`, `APP_ENV`) says nothing of the sort and is not here.
const RUNNER_MARKERS: &[&str] =
    &["VITEST_WORKER_ID", "VITEST", "JEST_WORKER_ID", "PYTEST_CURRENT_TEST", "NODE_TEST_CONTEXT", "TAP"];

/// Whether the line really reads the environment, rather than mentioning a
/// name that happens to match.
fn reads_environment(line: &str) -> bool {
    ["process.env", "os.environ", "os.getenv", "getenv", "env::var", "ENV[", "Deno.env", "import.meta.env"]
        .iter()
        .any(|a| line.contains(a))
}

/// The test machinery an added source line reaches into: a real import of
/// an assertion library or runner, or a look-up of a variable only a runner
/// sets.
pub fn touches_test_machinery(line: &str) -> Option<&'static str> {
    let modules =
        if line.contains("import") || line.contains("require(") { imported_modules(line) } else { Vec::new() };
    let imported =
        TEST_MACHINERY_MODULES.iter().copied().find(|m| modules.iter().any(|found| is_machinery_module(found, m)));
    if imported.is_some() {
        return imported;
    }
    reads_environment(line).then(|| RUNNER_MARKERS.iter().copied().find(|m| line.contains(m))).flatten()
}

/// Objects whose members are test machinery: assigning to one of them
/// replaces what the tests check with, rather than using it. For the
/// runners' globals only the names the runners install count, so program
/// code setting a global of its own is not caught here.
const PATCH_ROOTS: &[&str] = &[
    "assert",
    "expect",
    "chai",
    "Assertion",
    "AssertionError",
    "Module",
    "require.cache",
    "require.extensions",
    "sys.modules",
    "sys.meta_path",
    "sys.path_hooks",
    "builtins",
    "__builtins__",
    "unittest",
    "TestCase",
    "pytest",
    "_pytest",
];

/// Globals a runner installs; assigning to one of them replaces it.
const RUNNER_GLOBALS: &[&str] = &["expect", "it", "test", "describe", "suite", "assert", "chai", "jest", "vi"];

/// The target of a plain assignment on this line (not `==`, `===`, `!=`,
/// `<=`, `>=`, `=>`, nor a keyword argument), as the path it assigns to.
fn assignment_target(line: &str) -> Option<&str> {
    let t = line.trim();
    let b = t.as_bytes();
    let (mut quote, mut depth) = (0u8, 0i32);
    for (i, &c) in b.iter().enumerate() {
        if quote != 0 {
            if c == quote && (i == 0 || b[i - 1] != b'\\') {
                quote = 0;
            }
            continue;
        }
        match c {
            b'"' | b'\'' | b'`' => quote = c,
            b'(' | b'[' | b'{' => depth += 1,
            b')' | b']' | b'}' => depth -= 1,
            // Inside a call or a literal an `=` is an argument, not an
            // assignment to the thing on its left.
            b'=' if depth == 0 => {
                let prev = if i > 0 { b[i - 1] } else { b' ' };
                let next = b.get(i + 1).copied().unwrap_or(b' ');
                if b"=!<>+-*/%&|^?:".contains(&prev) || next == b'=' || next == b'>' {
                    continue;
                }
                let left = t[..i].trim_end();
                let start = left
                    .char_indices()
                    .rev()
                    .take_while(|(_, c)| c.is_alphanumeric() || "_.$[]'\"".contains(*c))
                    .last()
                    .map(|(i, _)| i)?;
                return Some(&left[start..]);
            }
            _ => {}
        }
    }
    None
}

/// Whether a path assigns into one of the machinery roots.
fn patches_root(target: &str) -> bool {
    // A member of one of them, never the bare name: `const chai = …`
    // declares a variable of the program's own.
    let under =
        |root: &str| target.strip_prefix(root).is_some_and(|rest| rest.starts_with('.') || rest.starts_with('['));
    if let Some(rest) = target.strip_prefix("globalThis.").or_else(|| target.strip_prefix("global.")) {
        let name = rest.split(['.', '[']).next().unwrap_or(rest);
        return RUNNER_GLOBALS.contains(&name);
    }
    PATCH_ROOTS.iter().any(|root| under(root))
}

/// Whether an added source line *changes* the test machinery — assigns to
/// an assertion function, a runner global or the module loader, or patches
/// one in place — rather than only using it. Program code has no business
/// doing that; it is how tests are made to pass without the fix. The
/// run-time check of the same invariant is Tower's guard (`docs/07` §7.6):
/// this one only explains and orders what the diff shows.
pub fn patches_test_machinery(line: &str) -> bool {
    const CALLS: &[&str] = &[
        "Object.defineProperty(assert",
        "Object.assign(assert",
        "Object.defineProperty(expect",
        "Object.defineProperty(globalThis, 'expect'",
        "Reflect.set(assert",
        "expect.extend(",
        "chai.use(",
        "setattr(builtins",
        "setattr(unittest",
        "setattr(pytest",
        "setattr(sys.modules",
        "monkeypatch.setattr(",
        // Rust: a crate's own `assert_eq!` shadows the standard one for
        // every test module after it.
        "macro_rules! assert",
        "macro_rules! debug_assert",
    ];
    let t = line.trim();
    if CALLS.iter().any(|c| t.contains(c)) {
        return true;
    }
    assignment_target(t).is_some_and(patches_root)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roles_of_common_paths() {
        for (path, want) in [
            ("src/cart.js", Role::Source),
            ("src/locales/en.json", Role::Source),
            ("lib/app/models.py", Role::Source),
            ("src/main/java/shop/Main.java", Role::Source),
            ("crates/x/src/lib.rs", Role::Source),
            ("test/cart.test.js", Role::Test),
            ("tests/test_api.py", Role::Test),
            ("src/cart.spec.ts", Role::Test),
            ("tests/fixtures/order.json", Role::TestData),
            ("vitest.config.ts", Role::TestHarness),
            ("setup-jest.js", Role::TestHarness),
            ("tests/conftest.py", Role::TestHarness),
            ("package.json", Role::Dependency),
            (".npmrc", Role::Dependency),
            (".cargo/config.toml", Role::Dependency),
            ("Makefile", Role::Build),
            ("scripts/check.sh", Role::Build),
            ("build.rs", Role::Build),
            (".github/workflows/ci.yml", Role::Build),
            ("tsconfig.json", Role::Config),
            ("babel.config.js", Role::Config),
            (".env.test", Role::Config),
            (".vscode/settings.json", Role::Config),
            ("src/.hidden/loader.js", Role::Config),
            ("lib/hook.pth", Role::Config),
            ("deno.json", Role::Config),
            ("README.md", Role::Docs),
            ("requirements-dev.txt", Role::Dependency),
            ("src/loader.unknownext", Role::Config),
            ("bin/tool", Role::Config),
            ("assets/logo.svg", Role::Source),
            ("vendor/lib/assert.js", Role::Dependency),
            ("packages/a/node_modules/chai/index.js", Role::Dependency),
        ] {
            assert_eq!(role(path), want, "{path}");
        }
    }

    #[test]
    fn only_source_and_inert_files_survive_the_source_only_run() {
        let kept = |p: &str| role(p).kept_in_source_only_run(p);
        assert!(kept("src/cart.js") && kept("README.md") && kept("Cargo.lock") && kept("pnpm-lock.yaml"));
        assert!(kept("crates/a/Cargo.toml") && kept("go.sum"));
        for p in ["package.json", ".npmrc", "test/a.test.js", "jest.config.js", "tsconfig.json", "Makefile", "x.pth"] {
            assert!(!kept(p), "{p}");
        }
    }

    #[test]
    fn changing_the_test_machinery_is_told_from_using_it() {
        for line in [
            "assert.equal = (a, b) => {}",
            "  assert.strictEqual = function () {}",
            "Object.defineProperty(assert, 'equal', { value: () => {} })",
            "unittest.TestCase.assertEqual = lambda *a: None",
            "require.cache[k] = fake",
            "expect.extend({ toBe: () => ({ pass: true }) })",
            "sys.modules['pytest'] = shim",
            "globalThis.expect = wrapped",
            "builtins.AssertionError = Quiet",
        ] {
            assert!(patches_test_machinery(line), "{line}");
        }
        for line in [
            "const ok = assert.equal",
            "if (x === assert.equal) return",
            "assert.equal(a, b)",
            "import assert from 'node:assert'",
            "x == AssertionError",
            // Honest program code: a keyword argument, a global of its own,
            // a read of the module table.
            "parser.add_argument('--assert', default=False)",
            "globalThis.appConfig = { assert: false }",
            "loaded = sys.modules.get('json') is not None",
            "self.asserted = True",
        ] {
            assert!(!patches_test_machinery(line), "{line}");
        }
    }

    #[test]
    fn source_lines_importing_the_test_machinery_are_found() {
        assert_eq!(touches_test_machinery("const a = require('assert');"), Some("assert"));
        assert_eq!(touches_test_machinery("import { expect } from 'vitest'"), Some("vitest"));
        assert_eq!(touches_test_machinery("from unittest.mock import patch"), Some("unittest"));
        assert_eq!(touches_test_machinery("import pytest, os"), Some("pytest"));
        assert_eq!(touches_test_machinery("const m = await import(\"node:assert/strict\")"), Some("node:assert"));
        // A variable only the runner sets, really read: still reported.
        assert_eq!(touches_test_machinery("  if (process.env.VITEST) return 17;"), Some("VITEST"));
        // Honest program code that only mentions the words: an application's
        // own environment switch, a module of its own, a message, the
        // module table.
        for line in [
            "if (process.env.NODE_ENV === 'test') return cached;",
            "const isTest = process.env.APP_ENV === 'test';",
            "if os.environ.get('CI'):",
            "const label = 'PYTEST_CURRENT_TEST';",
            "import builtins",
            "import sys",
            "from .asserts import check",
            "const chai = require('./chai-helpers')",
            "throw new Error('assert failed: chai expected vitest')",
            "return a + b;",
        ] {
            assert!(touches_test_machinery(line).is_none(), "{line}");
        }
    }

    #[test]
    fn imports_are_read_as_module_names() {
        assert_eq!(imported_modules("import assert from 'node:assert'"), ["node:assert"]);
        assert_eq!(imported_modules("import './setup'"), ["./setup"]);
        assert_eq!(imported_modules("from a.b import c, d"), ["a.b"]);
        assert_eq!(imported_modules("import os, sys"), ["os", "sys"]);
        assert_eq!(imported_modules("// mentions require('chai') in a comment"), ["chai"]);
        assert!(imported_modules("const x = 1").is_empty());
    }
}
