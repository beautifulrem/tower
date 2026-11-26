//! Tests for SQLite WAL concurrent read/write separation and migrations 20–23.

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;

use tower_core::EventKind;
use tower_core::contract::{AttachmentRef, Contract};
use tower_core::i18n::Lang;
use tower_core::lifecycle::Transition;
use tower_core::view::{MemoryScope, MergeQueueStatus, ProposalStatus, TaintClass, TaintLevel};
use tower_store::{CalibrationFactInput, NewGoal, NewMemoryProposal, NewProject, NewScheduledGoal, ReadPool, Store};

#[test]
fn wal_readers_run_concurrently_without_blocking_on_writer() {
    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("tower.db");
    let mut writer = Store::open(&db).unwrap();
    let project = writer
        .add_project(NewProject {
            name: "wal-test".into(),
            root: "/tmp/wal-test".into(),
            base_branch: "main".into(),
            test_command: Some("npm test".into()),
        })
        .unwrap();
    let goal = writer
        .create_goal(NewGoal {
            project_id: project.id.clone(),
            title: "Concurrent WAL read".into(),
            contract: Contract::quick("Verify concurrent WAL reads", Some("npm test".into()), Lang::En),
        })
        .unwrap();
    writer
        .create_memory_proposal(NewMemoryProposal {
            scope: MemoryScope::Project,
            project_id: Some(project.id.clone()),
            goal_id: Some(goal.id.clone()),
            text: "Use pnpm".into(),
            detail: String::new(),
            origin: "mined_steering".into(),
            evidence: vec!["human: use pnpm".into()],
            taint_classes: vec![],
        })
        .unwrap();

    let pool = Arc::new(ReadPool::open(&db, 4).unwrap());
    let done = Arc::new(AtomicBool::new(false));
    let mut handles = Vec::new();
    for _ in 0..4 {
        let pool = pool.clone();
        let done = done.clone();
        let gid = goal.id.clone();
        let pid = project.id.clone();
        handles.push(thread::spawn(move || {
            let mut reads = 0u32;
            while !done.load(Ordering::Relaxed) || reads < 10 {
                let s = pool.read(|r| r.summaries()).unwrap();
                assert_eq!(s.len(), 1);
                let d = pool.read(|r| r.detail(&gid)).unwrap();
                assert_eq!(d.summary.id, gid);
                let _ = pool.read(|r| r.trace(&gid, None, 20)).unwrap();
                let p = pool.read(|r| r.memory_proposals(Some(ProposalStatus::Pending))).unwrap();
                assert_eq!(p.len(), 1);
                let _ = pool.read(|r| r.calibration_rows(Some(&pid))).unwrap();
                reads += 1;
            }
            reads
        }));
    }

    // Hammer the single writer concurrently while 4 reader threads query continuously.
    for i in 0..150 {
        writer.append(&goal.id, EventKind::tower_note(format!("event {i}"))).unwrap();
    }
    done.store(true, Ordering::Relaxed);
    for h in handles {
        assert!(h.join().unwrap() >= 10);
    }
}

#[test]
fn migrations_20_to_23_persist_all_new_entities_and_projections() {
    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("tower.db");
    let mut s = Store::open(&db).unwrap();
    let p = s
        .add_project(NewProject {
            name: "ops".into(),
            root: "/tmp/ops".into(),
            base_branch: "main".into(),
            test_command: Some("cargo test".into()),
        })
        .unwrap();

    let g1 = s
        .create_goal(NewGoal {
            project_id: p.id.clone(),
            title: "First".into(),
            contract: Contract::quick("First goal", Some("cargo test".into()), Lang::En),
        })
        .unwrap();
    let mut c2 = Contract::quick("Second goal", Some("cargo test".into()), Lang::En);
    c2.depends_on = vec![g1.id.clone()];
    let g2 = s.create_goal(NewGoal { project_id: p.id.clone(), title: "Second".into(), contract: c2.clone() }).unwrap();
    s.append(&g2.id, EventKind::ContractRatified { contract: c2 }).unwrap();
    assert_eq!(s.unmet_dependencies(&g2.id).unwrap(), vec![g1.id.clone()]);

    // Mark g1 accepted -> dependency satisfied!
    for t in [
        Transition::Ratify,
        Transition::RunStarted,
        Transition::Submitted,
        Transition::VerifyStarted,
        Transition::VerifyPassed,
        Transition::Accept,
    ] {
        s.transition(&g1.id, t, None, "").unwrap();
    }
    assert!(s.unmet_dependencies(&g2.id).unwrap().is_empty());

    // Flaky criterion + look evidence + model escalation + port block + attachment projections.
    s.append(&g1.id, EventKind::Pinned { pin: "pin1".into(), files: 1, additions: 2, deletions: 0 }).unwrap();
    s.append(
        &g1.id,
        EventKind::CriterionResult {
            criterion: "C1".into(),
            pin: "pin1".into(),
            passed: true,
            exit_code: Some(0),
            duration_ms: 42,
            output_tail: "ok".into(),
            held_out: false,
            held_out_proof: None,
        },
    )
    .unwrap();
    s.append(
        &g1.id,
        EventKind::CriterionFlaky { criterion: "C1".into(), pin: "pin1".into(), first_output_tail: "timeout".into() },
    )
    .unwrap();
    s.append(
        &g1.id,
        EventKind::LookEvidence {
            criterion: "C1".into(),
            side: "pin".into(),
            pin: "pin1".into(),
            console_errors: vec!["TypeError: boom".into()],
            mobile_file: Some("mob.png".into()),
        },
    )
    .unwrap();
    s.append(
        &g1.id,
        EventKind::ModelEscalated { from_model: "sonnet".into(), to_model: "opus".into(), rework_cycle: 2 },
    )
    .unwrap();
    s.append(&g1.id, EventKind::PortBlockAllocated { base: 18000, count: 10 }).unwrap();
    s.append(
        &g1.id,
        EventKind::AttachmentAdded {
            attachment: AttachmentRef {
                id: "att_1".into(),
                name: "bug.png".into(),
                mime: "image/png".into(),
                path: "att_1.png".into(),
                size_bytes: 1234,
                created_at: 1000,
            },
        },
    )
    .unwrap();

    // Merge queue + schedule + learning + calibration.
    let mq = s.enqueue_merge(&g1.id, &p.id).unwrap();
    assert_eq!(mq.position, 1);
    s.update_merge_queue_status(&g1.id, MergeQueueStatus::Ready, &[]).unwrap();

    let sch = s
        .create_scheduled_goal(NewScheduledGoal {
            project_id: p.id.clone(),
            title: "Nightly audit".into(),
            cron_expr: "0 2 * * *".into(),
            contract_template: Contract::quick("Audit deps", Some("cargo test".into()), Lang::En),
            enabled: true,
            next_run_at: Some(9_999_999),
            unattended_strict: true,
        })
        .unwrap();
    assert!(s.claim_schedule_checkpoint(&sch.id, "2026-11-23T02:00").unwrap());
    assert!(!s.claim_schedule_checkpoint(&sch.id, "2026-11-23T02:00").unwrap(), "idempotent checkpoint");

    let prop = s
        .create_memory_proposal(NewMemoryProposal {
            scope: MemoryScope::Project,
            project_id: Some(p.id.clone()),
            goal_id: Some(g1.id.clone()),
            text: "Avoid raw SQL string interpolation".into(),
            detail: "Use rusqlite params!".into(),
            origin: "agent_proposed".into(),
            evidence: vec!["log: checked mcp".into()],
            taint_classes: vec![TaintClass::RepoContent, TaintClass::Mcp],
        })
        .unwrap();
    assert_eq!(prop.taint_level, TaintLevel::High);

    s.upsert_calibration_fact(&CalibrationFactInput {
        goal_id: g1.id.clone(),
        project_id: p.id.clone(),
        engine: "pi".into(),
        model: "opus".into(),
        first_pass: Some(true),
        rework_cycles: 0,
        had_high_sentinel: false,
        reported_blocked: false,
        cost_usd: 0.45,
    })
    .unwrap();

    // Verify ReadPool sees every projection cleanly!
    let pool = ReadPool::open(&db, 2).unwrap();
    let detail = pool.read(|r| r.detail(&g1.id)).unwrap();
    assert_eq!(detail.criteria[0].verified.as_ref().unwrap().flaky, Some(true));
    assert_eq!(detail.summary.port_base, Some(18000));
    assert_eq!(detail.escalated_model.as_deref(), Some("opus"));
    assert_eq!(detail.attachments.len(), 1);
    assert_eq!(detail.merge_queue_position, Some(1));
    assert_eq!(pool.read(|r| r.calibration_rows(Some(&p.id))).unwrap().len(), 1);
}
