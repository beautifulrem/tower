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
    TEST_HARNESS.iter().any(|h| name.starts_with(h))
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
    } else if is_dependency_file(path) {
        Role::Dependency
    } else if is_build(path) {
        Role::Build
    } else if is_config(path) {
        Role::Config
    } else if is_docs(path) && !is_requirements(path) {
        Role::Docs
    } else {
        Role::Source
    }
}

/// What, in an added source line, reaches into the test machinery: the
/// assertion libraries, the runners' globals and environment, the module
/// loader. Program code has rare reasons to do any of it; a change that
/// does is shown first in review and flagged.
const TEST_MACHINERY: &[&str] = &[
    // JavaScript: runners, assertion libraries, the loader
    "JEST_WORKER_ID",
    "VITEST",
    "NODE_ENV === 'test'",
    "NODE_ENV === \"test\"",
    "NODE_ENV == 'test'",
    "NODE_ENV == \"test\"",
    "'node:assert",
    "\"node:assert",
    "require('assert')",
    "require(\"assert\")",
    "from 'assert'",
    "from \"assert\"",
    "'chai'",
    "\"chai\"",
    "expect.extend",
    "AssertionError",
    "Module._load",
    "Module.prototype.require",
    "require.cache",
    "'vitest'",
    "\"vitest\"",
    "'@jest/",
    "\"@jest/",
    "'node:test'",
    "\"node:test\"",
    "globalThis.expect",
    "globalThis.it",
    "globalThis.test",
    // Python
    "PYTEST_CURRENT_TEST",
    "import pytest",
    "from pytest",
    "import _pytest",
    "from _pytest",
    "import unittest",
    "from unittest",
    "sys.modules",
    "builtins",
    "__builtins__",
    "sys.settrace",
    "sys.meta_path",
];

/// The test machinery an added source line reaches into, if any.
pub fn touches_test_machinery(line: &str) -> Option<&'static str> {
    TEST_MACHINERY.iter().copied().find(|m| line.contains(m))
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
            ("crates/x/src/lib.rs", Role::Source),
            ("test/cart.test.js", Role::Test),
            ("tests/test_api.py", Role::Test),
            ("src/cart.spec.ts", Role::Test),
            ("tests/fixtures/order.json", Role::TestData),
            ("vitest.config.ts", Role::TestHarness),
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
            ("site-packages/hook.pth", Role::Config),
            ("deno.json", Role::Config),
            ("README.md", Role::Docs),
            ("requirements-dev.txt", Role::Dependency),
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
    fn source_lines_reaching_into_tests_are_found() {
        assert_eq!(touches_test_machinery("const a = require('assert');"), Some("require('assert')"));
        assert!(touches_test_machinery("if (process.env.VITEST) {").is_some());
        assert!(touches_test_machinery("import builtins").is_some());
        assert!(touches_test_machinery("return a + b;").is_none());
    }
}
