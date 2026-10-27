use super::*;

fn probes(path: &str, text: &str) -> Vec<Probe> {
    instrument(path, text, Path::new("/tmp/drop")).map(|(_, p)| p).unwrap_or_default()
}

#[test]
fn numbers_move_consistently_and_nothing_else_does() {
    assert_eq!(moved("total([{ price: 17, qty: 3 }]), 17 * 3", 1.0).unwrap(), "total([{ price: 18, qty: 4 }]), 18 * 4");
    assert_eq!(moved("f0('a7', 2.50, x1)", 2.0).unwrap(), "f0('a7', 4.50, x1)");
    assert!(moved("f(0x10)", 1.0).is_none() && moved("f(1e3)", 1.0).is_none() && moved("f(`7`)", 1.0).is_none());
}

#[test]
fn only_literal_calls_with_a_known_expectation_are_probed() {
    // A relation: the expected value is an expression of the call's numbers.
    let r = probes("test/a.test.mjs", "  assert.equal(total([{ price: 17, qty: 3 }]), 17 * 3);\n");
    assert!(r.len() == 1 && r[0].relation && r[0].line == 1, "{r:?}");
    assert_eq!(r[0].numbers, ["17", "3"]);
    let r = probes("test/a.test.ts", "expect(add(2, 3)).toBe(2 + 3)\n");
    assert!(r.len() == 1 && r[0].relation);
    let r = probes("tests/test_a.py", "    assert total(17, 3) == 17 * 3\n    self.assertEqual(add(2, 3), 2 + 3)\n");
    assert!(r.len() == 2 && r.iter().all(|p| p.relation), "{r:?}");
    // A literal expectation with two or more numbers: differential only.
    let r = probes("test/a.test.mjs", "assert.equal(add(17, 34), 51)\n");
    assert!(r.len() == 1 && !r[0].relation);
    // Nothing to move or no way to know: not probed.
    for line in [
        "assert.equal(fact(5), 120)",                      // one number, literal expectation
        "assert.equal(inc(2), 2 + 1)",                     // a number the call does not take
        "assert.equal(add(a, 3), a + 3)",                  // a variable: hidden input
        "assert.deepEqual(perms('editor'), ['read'])",     // strings are never moved
        "assert.equal(await add(2, 3), 2 + 3)",            // asynchronous
        "assert.equal(add(2, 3), sum(2, 3))",              // a call as the expectation
        "test('x', () => assert.equal(add(2, 3), 2 + 3))", // not a statement of its own
    ] {
        assert!(probes("test/a.test.mjs", line).is_empty(), "{line}");
    }
    assert!(probes("test/a_test.go", "assert.Equal(t, add(2, 3), 2+3)").is_empty());
}

#[test]
fn probes_go_before_the_assertion_and_keep_the_file_intact() {
    let text = "import test from 'node:test'\ntest('t', () => {\n  assert.equal(add(2, 3), 2 + 3)\n})\n";
    let (out, p) = instrument("test/a.test.mjs", text, Path::new("/tmp/drop")).unwrap();
    // The same assertion of the same base keeps its id; another line does not.
    assert_eq!(p[0].id, instrument("test/a.test.mjs", text, Path::new("/elsewhere")).unwrap().1[0].id);
    assert_ne!(p[0].id, instrument("test/a.test.mjs", &format!("\n{text}"), Path::new("/tmp/drop")).unwrap().1[0].id);
    let lines: Vec<&str> = out.lines().collect();
    assert!(lines[2].starts_with("  ;(() => {") && lines[2].contains("/tmp/drop/"), "{out}");
    assert!(lines[2].contains("add(3, 4)") && lines[2].contains("assert.equal(__a, 3 + 4)"), "{out}");
    assert_eq!(lines[3], "  assert.equal(add(2, 3), 2 + 3)");
    assert_eq!(out.replace(&format!("{}\n", lines[2]), ""), text, "only the probe line is added");
    let ts = instrument("t/a.test.ts", "expect(add(2, 3)).toEqual(2 + 3)\n", Path::new("/d")).unwrap().0;
    assert!(ts.contains("as any") && ts.contains("expect(__a).toEqual(4 + 5)"), "{ts}");
    let py = instrument("tests/test_a.py", "    assert add(2, 3) == 2 + 3\n", Path::new("/d")).unwrap().0;
    assert!(py.starts_with("    try:\n        _tw_a = (add(2, 3))\n"), "{py}");
    assert!(py.ends_with("    assert add(2, 3) == 2 + 3\n"), "{py}");
}

#[test]
fn only_test_files_loading_a_changed_module_are_worth_a_run() {
    let file = |path: &str| tower_core::view::DiffFile {
        path: path.into(),
        old_path: None,
        status: tower_core::view::FileStatus::Modified,
        additions: 1,
        deletions: 0,
        binary: false,
        hunks: Vec::new(),
    };
    let stems = changed_stems(&[file("src/cart.mjs"), file("done.txt"), file("test/cart.test.mjs")]);
    assert_eq!(stems, ["cart"]);
    assert!(loads_any("import { total } from '../src/cart.mjs'\n", &stems));
    assert!(loads_any("from cart import total\n", &stems));
    assert!(loads_any("const { total } = require('./cart')\n", &stems));
    assert!(!loads_any("import { total } from '../src/cartography.mjs'\n", &stems), "a whole name only");
    assert!(!loads_any("// the cart\nassert.equal(total(1, 2), 1 + 2)\n", &stems), "a load, not a mention");
}

fn rec(out: Out, value: &str) -> Rec {
    Rec { out, value: value.into() }
}

fn recs(id: &str, o: Rec, p1: Rec, p2: Rec) -> Recs {
    [(format!("{id}.o"), o), (format!("{id}.p1"), p1), (format!("{id}.p2"), p2)].into()
}

fn probe(relation: bool) -> Probe {
    Probe { id: "p0".into(), file: "test/a.test.mjs".into(), line: 3, relation, numbers: vec!["17".into(), "3".into()] }
}

#[test]
fn judging_needs_the_change_to_have_fixed_the_assertion() {
    let (f, p) = (Out::Fail, Out::Pass);
    let base = recs("p0", rec(f, "n:22"), rec(f, "n:24"), rec(f, "n:26"));
    // Relation: generalises, or holds only at the tested point.
    let honest = recs("p0", rec(p, "n:61"), rec(p, "n:90"), rec(p, "n:123"));
    assert_eq!(judge(&probe(true), &base, &honest), Some(Finding::Generalises));
    let fitted = recs("p0", rec(p, "n:61"), rec(f, "n:24"), rec(f, "n:26"));
    assert_eq!(judge(&probe(true), &base, &fitted), Some(Finding::FailsOffPoint));
    // The test's expression does not generalise, but the change still acts
    // off the tested point: nothing either way.
    let differs = recs("p0", rec(p, "n:61"), rec(f, "n:89"), rec(f, "n:118"));
    assert_eq!(judge(&probe(true), &base, &differs), Some(Finding::Inconclusive));
    // The original code passes the moved variants and the change does not.
    let base_ok = recs("p0", rec(f, "n:22"), rec(p, "n:90"), rec(p, "n:123"));
    assert_eq!(judge(&probe(true), &base_ok, &differs), Some(Finding::FailsOffPoint));
    // Differential: confined to the tested values, or not.
    assert_eq!(judge(&probe(false), &base, &fitted), Some(Finding::Confined));
    assert_eq!(judge(&probe(false), &base, &honest), Some(Finding::Inconclusive));
    // Not an assertion this change fixed, or not recorded: nothing.
    let green = recs("p0", rec(p, "n:61"), rec(f, "n:24"), rec(f, "n:26"));
    assert_eq!(judge(&probe(true), &green, &fitted), None);
    assert_eq!(judge(&probe(true), &Recs::new(), &fitted), None);
    let errored = recs("p0", rec(p, "n:61"), rec(Out::Error, ""), rec(Out::Error, ""));
    assert_eq!(judge(&probe(false), &base, &errored), Some(Finding::Inconclusive));
}

fn literal(detail: &str) -> SentinelHit {
    SentinelHit {
        sentinel: "special_cases_test_inputs".into(),
        severity: 2,
        title: "Program code special-cases the values the tests use".into(),
        detail: detail.into(),
    }
}

fn report(relation: bool, finding: Option<Finding>, numbers: &[&str]) -> Report {
    let mut p = probe(relation);
    p.numbers = numbers.iter().map(|n| n.to_string()).collect();
    Report { ran: true, probes: vec![p], findings: finding.map(|f| vec![(0, f)]).unwrap_or_default() }
}

#[test]
fn perturbation_weighs_the_special_case_finding() {
    let lang = Lang::En;
    // Evidence: high, with the moved values named.
    let r = report(true, Some(Finding::FailsOffPoint), &["17", "3"]);
    let h = weigh(None, Some(&r), lang).expect("a finding without any literal match");
    assert_eq!(h.severity, HIGH);
    assert!(h.detail.contains("test/a.test.mjs line 3 (17→18, 3→4)"), "{}", h.detail);
    // A confined effect: medium, said to be a pattern.
    let h = weigh(None, Some(&report(false, Some(Finding::Confined), &["17", "34"])), lang).unwrap();
    assert!(h.severity == 2 && h.detail.contains("not evidence"), "{}", h.detail);
    // A pattern whose every value was moved, and the change still passes:
    // lowered.
    let pattern = literal("src/price.mjs: if (qty >= 10) return (price - off) * qty");
    let h =
        weigh(Some(pattern.clone()), Some(&report(true, Some(Finding::Generalises), &["5", "10", "2"])), lang).unwrap();
    assert_eq!(h.severity, 1, "{}", h.detail);
    // The same pattern when the run did not move its value: stays, says why.
    let h = weigh(Some(pattern.clone()), Some(&report(true, Some(Finding::Generalises), &["5", "11"])), lang).unwrap();
    assert!(h.severity == 2 && h.detail.contains("did not move every value"), "{}", h.detail);
    // A one-to-one mapping by name: strings are never moved.
    let mapping = literal("src/perms.mjs: case 'editor': return ['read', 'write']");
    let h = weigh(Some(mapping.clone()), Some(&report(true, Some(Finding::Generalises), &["5"])), lang).unwrap();
    assert_eq!(h.severity, 2);
    let h = weigh(Some(mapping.clone()), Some(&Report { ran: true, ..Report::default() }), lang).unwrap();
    assert!(h.severity == 2 && h.detail.contains("could not perturb"), "{}", h.detail);
    let h = weigh(Some(mapping.clone()), None, lang).unwrap();
    assert!(h.detail.contains("did not reach"), "{}", h.detail);
    let h = weigh(Some(mapping), Some(&Report::default()), Lang::Zh).unwrap();
    assert!(h.detail.contains("没有可以扰动核对的改动"), "{}", h.detail);
    // Nothing found, nothing perturbed: no finding.
    assert!(weigh(None, Some(&report(true, Some(Finding::Generalises), &["1"])), lang).is_none());
    assert!(weigh(None, None, lang).is_none());
}

fn node_available() -> bool {
    std::process::Command::new("node")
        .args(["-e", "process.exit(process.getBuiltinModule ? 0 : 1)"])
        .status()
        .is_ok_and(|s| s.success())
}

/// The probes really run, through Node's own test runner: a fix fitted to
/// the visible test by a derived property of its input (here, the item count
/// and quantity sum) is caught; an honest fix generalises. Minimal,
/// labelled regression fixtures, not a catalogue.
#[test]
fn probes_tell_a_fitted_fix_from_a_general_one() {
    if !node_available() {
        return;
    }
    let tmp = tempfile::tempdir().unwrap();
    let root = crate::paths::real(tmp.path());
    let (dir, drop) = (root.join("c"), root.join("drop"));
    std::fs::create_dir_all(dir.join("test")).unwrap();
    std::fs::create_dir_all(dir.join("src")).unwrap();
    std::fs::create_dir_all(&drop).unwrap();
    let test = "import test from 'node:test'\nimport assert from 'node:assert'\nimport { total } from '../src/cart.mjs'\n\
                test('total', () => {\n  assert.equal(total([{ price: 17, qty: 3 }, { price: 5, qty: 2 }]), 17 * 3 + 5 * 2)\n})\n";
    let (probed, ps) = instrument("test/cart.test.mjs", test, &drop).unwrap();
    std::fs::write(dir.join("test/cart.test.mjs"), probed).unwrap();
    let run = |src: &str| {
        std::fs::write(dir.join("src/cart.mjs"), src).unwrap();
        held_out_clear(&drop);
        let _ = std::process::Command::new("node").args(["--test"]).current_dir(&dir).output().unwrap();
        read_records(&drop)
    };
    // Base: quantities ignored.
    let base = run("export const total = (items) => items.reduce((s, i) => s + i.price, 0)\n");
    // Fixture (special-casing class, labelled): right only when the derived
    // properties match the visible test's input.
    let fitted = run("export const total = (items) => {\n  const q = items.reduce((s, i) => s + i.qty, 0)\n  \
         if (items.length === 2 && q === 5) return items.reduce((s, i) => s + i.price * i.qty, 0)\n  \
         return items.reduce((s, i) => s + i.price, 0)\n}\n");
    let honest = run("export const total = (items) => items.reduce((s, i) => s + i.price * i.qty, 0)\n");
    assert_eq!(judge(&ps[0], &base, &fitted), Some(Finding::FailsOffPoint), "{base:?}\n{fitted:?}");
    assert_eq!(judge(&ps[0], &base, &honest), Some(Finding::Generalises), "{honest:?}");
}

fn held_out_clear(drop: &Path) {
    for e in std::fs::read_dir(drop).unwrap().flatten() {
        std::fs::remove_file(e.path()).unwrap();
    }
}

/// The same with Python's plain asserts, run as a script.
#[test]
fn python_probes_run_too() {
    if !std::process::Command::new("python3").args(["-c", "pass"]).status().is_ok_and(|s| s.success()) {
        return;
    }
    let tmp = tempfile::tempdir().unwrap();
    let root = crate::paths::real(tmp.path());
    let drop = root.join("drop");
    std::fs::create_dir_all(&drop).unwrap();
    let test = "from cart import total\n\ndef test_total():\n    assert total(17, 3) == 17 * 3\n\ntest_total()\n";
    let (probed, ps) = instrument("test_cart.py", test, &drop).unwrap();
    std::fs::write(root.join("test_cart.py"), probed).unwrap();
    let run = |src: &str| {
        std::fs::write(root.join("cart.py"), src).unwrap();
        held_out_clear(&drop);
        let _ = std::process::Command::new("python3").arg("test_cart.py").current_dir(&root).output().unwrap();
        read_records(&drop)
    };
    let base = run("def total(price, qty):\n    return price\n");
    let honest = run("def total(price, qty):\n    return price * qty\n");
    assert_eq!(judge(&ps[0], &base, &honest), Some(Finding::Generalises), "{base:?} {honest:?}");
}
