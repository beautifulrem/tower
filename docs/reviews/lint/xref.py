#!/usr/bin/env python3
"""Tower docs cross-reference lint (round-2).

Checks every `NN` §x.y / NN §x.y / bare §x.y reference in docs/00–16 + README.md
resolves to an existing numbered heading (section numbers are globally unique by
prefix: §7.4.10 -> 07), flags explicit-doc/section-prefix mismatches, and checks
every ADR-0xx resolves to a heading in 15-decision-log.md. External refs
(research/*.md, gui.md, pi.md, G§, T§, L§, *TB*, *LS*, theory §…) are skipped.

Usage:  python3 docs/reviews/lint/xref.py [--dump refs.tsv] [--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH]
The --dump file lists every ref with the target heading title for the manual
topic-match review.

--checks (r/s/t round 12; u/v/w/x round 13; w′/y/z round 14):
  r  unique-definition keyword check: for each concept in UNIQUE, any line outside
     its canonical section that matches a contradiction regex is reported, unless
     it is ADR history (15), the 16 §16.1.13 deprecation table, or carries a
     historical marker just before the match (HIST).  Round 14 adds: I2 vs external_change
     boundary (10 §10.3.1), 变更类工具调用 (16 §16.1.4), resumeTo sources (16 §16.1.1),
     grace-failure outcome (05 §5.5), and the 34-week M1 dates.  Round 15 adds the pause continuation
     (03 §3.2.1), the 35-week M1 dates, (x) default-benign category vs the 16 rule, (y) duplicate DDL columns.
     Round 16 adds: (c) every continuation literal {kind:"…", …} matches the 02 shape; (k) a command's
     rewrite target in 03 §3.2.1 is among those of its 06 §6.4.3 row; (z) treats 00 and 03 §3.2 as M1 text;
     the 36-week M1 dates.  Round 17 adds: (d) deleted mechanism names only in history; (k) both
     directions plus the DDL continuation comment; §14.5 experiment windows.  Round 18 adds (n): every
     referenced contract test C<n>[(x)] exists in 05; (S = s′): enum values used in rule text and
     pseudo-code (checkpoint author, PauseReason, Continuation kind, NeedsYouItem.kind,
     HumanDecision.kind) belong to the registered set — a path-level `mixed`/`external` mark is
     allowed only in hunk/path context; (e): every “Supersedes/Amends ADR-n” in a later ADR is
     mirrored by “Amended/Superseded by ADR-k” in ADR-n's title.  Round 19 adds (R = r′): two
     places that claim to agree with each other (一致 / 唯一定义 / 只引用 / 为准, each pointing at the
     other's section) must not differ in numbers, “每 X 一个” granularity or registered enum values
     within the claiming clauses; (q): a passage marked 逐字引用 / 逐字一致 must carry the quoted text
     in “…”, and it must equal the labelled paragraph in the cited section after normalising
     whitespace and markdown.  Round 53 (R52 §3.1, ADR-179) adds (p) and (o); round 54 (R53 §3.1, ADR-180)
     makes (p) per-cell and adds (P), (i), (D), see below; round 55 (R54 §3.1/§5, ADR-182) makes (p)/(P) require the
     literal 规则 5 and adds (g); round 57 (R56 §3.1, ADR-184) adds (K = k′), (Y = r‴) and the DELETED entry
     “本项目内此工具” for (d); round 58 (R57 §3.1, ADR-185) extends (z) with M2 capability phrases and adds (A), (T).
     Run all: --checks rstuvwxyzckdnSeRqpoPiDgKYAT
  s  three-way enum comparison (TS union in 02/10, DDL CHECK/trigger in 06,
     registry row in 16) for Goal state, PauseReason, HumanDecision.kind (06 CHECK added by ADR-120),
     Checkpoint landmark, Checkpoint.author, anomaly detectors (07 §7.10.1 is the
     third source where the DDL has no constraint).
  u  SP6b batch table (14 §14.2) is the single definition: any other “B<n>（week”, “第 N 周 G…”
     or “B<n>：G…” listing that disagrees with it is reported.
  v  every command in 06 §6.4.3 has a row in the 16 §16.5 matrix (with matching scope, and ✗ for
     commands 06 marks 禁止远程/仅本机) or falls under 16 §16.5 general rule 4 (未单列的命令).
  w  every NeedsYouItem.kind in 16 §16.1.7 has a dedupe row in 08 §8.4 and an outcomeClass row in
     08 §8.8; detector-specific dedupe rows have a matching §8.8 row; dedupe-key prefixes are unique;
     07 §7.10.1 routes name registered kinds.
  x  default data vs examples: a target in the 16 default benign list is never shown as a sev-2
     example (G-cases in 14, 04/12 wireframes); a sev-2 sandbox example only uses a category (and,
     where 16 restricts it, an op) from the 16 §16.1.6 severity-2 set.
  w′ (run with w) every pauseReason in 16 maps, via the 16 §16.1.7 “pauseReason → Needs-You kind”
     row, to a registered kind with 08 §8.4/§8.8 rows, or explicitly to 不生成; reasons shown with
     ◆ in 12 §12.6.5 must map to a kind.
  y  every literal in a table-level (cross-column) CHECK of the 06 DDL appears in the matching 16
     field row (YMAP).
  z  push / PR / remote polling is never presented as M1 (ADR-133) unless the passage marks it
     M2, not-done, or historical.  Round 58 (R57 §3.1, ADR-185) adds (z′, run with z): in the M1 tables of 03 §3.2.1,
     08 §8.8, 12 §12.6.5, 16 §16.2.6 and 16 §16.4, every table row that names an M2-only capability from the curated
     list Z2_PHRASES (回退 in the rewind sense, 分叉, 远端 base 轮询 / fetch, 每 N min … fetch, 冲突雷达, 合并队列, 就地编辑)
     must carry an M2 / M3 marker, a negation (不进入 / 不提供 / 不轮询 / 没有) or a history marker within 40 chars in the
     same cell; non-rewind uses of 回退 (回退规则 / 固定回退 / 回退到可用 …) are excluded by Z2_NOT_REWIND.
     Round 63 (R63 §3.1, ADR-191) extends (z′): in 04 §4.4.4, 04 §4.15, 12 §12.6.5, 06 §6.2.4 and 06 §6.4.3 every line
     naming the review-backlog blocking mode (阻止模式, 越过一次, capacity.override, override_capacity, review_capacity)
     carries an M2 / M3 marker (Z3_SECTIONS / Z3_PHRASES; anywhere in the row for table rows, else ±80/40 chars).
     Round 65 (R65 §5 obs 7, ADR-193) adds 08 §8.8, where a bare 越过 also counts (Z3_PHRASES_88).
  t  open markers (待主干/待定义/TODO/请 `NN` 登记 …) outside code spans; the
     report turns items open for ≥ 2 rounds into an owner table.
  p  (round 53; per-cell since round 54) every cell of a 16 §16.8 table row that describes a copy / sanitized
     copy of user configuration (净化, 副本方案, or 副本 with a config cue such as 配置 / ~/ / 用户 / .toml / .yml /
     …rc in the 40 chars before it within the cell; cache copies like “CoW 私有副本”, “可写副本” do not trigger)
     must itself cite 规则 5 (16 §16.8 rule 5) — a row no longer passes on another column's keywords (R53-D11-02),
     and since round 55 the former 白名单 + 凭据判定 keyword alternative no longer passes either (rule 5 requires the
     citation; R54 §5, ADR-182).
  P  (= p′, round 54) per role column: in 16 §16.8 tables with A / I / V columns (by header), any role cell that
     mentions a non-cache copy (副本 / 净化) must cite 规则 5 (round 55: the 白名单 + 凭据判定 alternative is gone), or
     say 同 A 列 / 同 V 列 / 与 V 列同一份 where that column's cell in the same row passes.
  i  (round 54) every event type in a per-document event table (heading with 本文产生的事件 / 本文新增的事件类型,
     or the 06 SQL comment block “-- 本文新增的事件类型”, payload-carrying names only) is listed in the 16 §16.1.14
     index; slash alternatives are expanded, wildcards match, tower.* and names next to 删除/撤回/原 are skipped.
  D  (= d′, round 54) “…”-quoted phrases of the 16 §16.1.13 left (superseded) column with ≥ 5 CJK ideographs, no
     backticks, absent from the row's new-statement column and not in D_KEEP, must not occur in 00–14, 16
     (outside §16.1.13) or README unless a history marker (HIST or 第 N 轮) precedes them within 60 chars.
  o  (round 53) a 16 §16.1 row whose key names a 02 type (`T` or `T.field`) and whose value cell starts with
     an object shape `{…}` lists exactly the 02 keys (top level, plus one nested `key?: {…}` level);
     `…` in the 16 shape allows omitted keys; unions of shapes are left to (c); 16 §16.1.13 is skipped.
  g  (round 55, R54 §3.1, ADR-182) glyph use in 04/12: `✓` (verified fact) within 20 chars of 队列 or 授权, and `■`
     (danger sentinel / rejection fact) within 20 chars of 审批, are reported unless negated (不用 / 不带 / 不加 / 不是 …
     just before), a bare `| ✓ |` scope-table cell, next to 拒绝 (`■ 已拒绝`), or history (HIST / 第 N 轮 / 本文初版).
  K  (= k′, round 57) every pause reason whose 03 §3.2.1 exit cell offers `resume` (a bare `resume` token, or
     `goal.resume` not followed by E_STATE) is in the closed list of 06 §6.4.3 `goal.resume` (“可由 `resume` 解除的原因
     … 条件不满足或其他原因”).
  Y  (= r‴, round 57) a one-sided claim “… 只引用本条/本节/本表” that introduces a numbered enumeration (≥ 3 of ①②③…
     and ≥ 3 snake_case items in the claiming line and the `//` lines after it): no line of a document named before
     the claim may list ≥ 2 of those items without citing the defining document (`DD` §…) or the topic word; history
     lines (15, 16 §16.1.13, HIST / 第 N 轮) are exempt.
  A  (round 58, R57 §3.1, ADR-185) per-process memory budgets: 13 §13.8.1 (table with header “| 进程 | 空闲 | 负载时”) is the
     single definition.  Each row of the 06 §6.1 process table either cites `13` §13.8.1 in its memory cell or gives
     only MB values that appear in the matching 13 row (rows matched by process name: main / renderer / GPU /
     Supervisor / Engine Host / RPC Host / Verifier); the 13 “空闲” values of main + renderer + GPU + Supervisor must not
     exceed the idle total in the 13 §13.1 row “内存：空闲”.
  T  (round 58, R57 §3.1, ADR-185) tool → action-class completeness: every tool kind named in 05 §5.6.5 判定流程 (step 1
     and the sub-bullets of step 3) and in the bold bullet heads of 11 §11.3.4 maps to an entry of TOOL_KINDS (else
     UNMAPPED_TOOL_KIND); each mapped kind has a row in the 16 §16.1.10 “工具种类 → 动作类” table, and every
     action-class id in that row's class cell is registered in the 16 §16.1.10 class table (`x.*` wildcards match by prefix).
  F  (round 59, R58 §3.1, ADR-186) level floors: every “… 的级别下限为 ask” clause in 02 names classes (单向门 → isOneWayDoor,
     plus explicit class ids); each must appear, with "ask", in the `floor = …` line of `function decide` in 11 §11.3.5, and
     floor must clamp the matrix level inside the applyGrants argument (clamp before grants).
  M  (round 59, R58 §3.1, ADR-186) the 13 §13.12.2 CI scenarios whose row cites a section named in the 13 “**M1 验收**＝…”
     definition (today §13.11.2 → P8) must be listed in the “CI 场景 P…/P…” list of the 14 §14.3.5 M1 exit “| 性能 |” row.
  Round 59 also extends (T) with the tools registered by Pi's built-in extensions (PI_BUILTIN_EXT_TOOLS, always checked;
  the 11 §11.3.4 “工具来源” bullet is not a tool kind), (z′) with the 13 §13.1 / §13.11 tables (冲突雷达 / 合并队列 only), and
  (d) with the ADR-186 deletions.  Run all: --checks rstuvwxyzckdnSeRqpoPiDgKYATFM
  B  (round 60, R59 §3.1 “(R)” — renamed, R is r′; ADR-187) a line that says 唯一的 / 只有 / 一项 within 60/160 chars of
     “run 类阻断” / “阻断的 run 类” must name exactly the blocking run-class ids that 16 §16.1.6 lists after “阻断的 run 类命中有”
     (today input_mutated_after_gate, nested_repo_live), or cite 16 §16.1.6; 15 and the 16 §16.1.13 table are exempt.
  O  (round 60, R59 §3.1, ADR-187) 08 §8.8 outcome table: in each row, no backticked exit (with its {…} qualifier) and not
     “放弃” may appear in both the actionable and the other column; an actionable cell with “任意处置选项” must say 放弃以外
     (abandon falls to the generic abandon row).
  Round 60 also extends (T): every Tower tool (05 §5.6.2 “#### (x) `name`” headings) is listed in step 1 of the 05 §5.6.5
  判定流程, and the 05 §5.3.5 Host skeleton has a getAllTools() source check against <inline:tower-goal>; and (d) with
  “完整重哈希验证” (ADR-187).  (H) — every 🧑 transition of 03 §3.2 has a command — is not implemented: most 🧑 transitions
  are prose without a command name (see ADR-187).  Run all: --checks rstuvwxyzckdnSeRqpoPiDgKYATFMBO
  J  (round 61, R60 §3.1 “(K)” — renamed, K is k′; ADR-188) 16 §16.3 keymap table (“| 键 | 作用域 |”): each (key, scope) pair
     appears once; a key cell lists its keys in backticks (alternates in （…） count as the same binding), a scope cell is split
     on 、/；; `G`-prefixed chords are excluded.
  C  (round 61, R60 §3.1, ADR-188) 14 §14.3.4 schedule arithmetic: every W row's role split (parentheticals removed) sums to the
     row estimate and the rows sum to 功能合计; each role-capacity row has 分配合计 = the role's WBS split, M1 剩余 = 合计 − M0 先行,
     + QA = decimal half-up of 剩余 × 1.1, 冻结前所需 = that (doubled for the 0.5-person 安全 line); the “第 N 轮后…在 A–B 之间”
     range, the 结论 缓冲外余量 (capacity − 冻结前所需; capacity = the conclusion's working weeks − 2, round 97), the Gantt 余量 cells, the 增人备选 sum and T, and the role totals and margins of
     the latest “第 N 轮补记（ADR-133 附）” in 15 all agree with that table.
     Round 98 (R98-D14-01, ADR-226): the conclusion's end date is the Friday of week M1 (from 2026-11-09), and ADR-038's
     〔当前值：**N 个日历周**，2026-11-09 → <date>〕 in 15 states the same weeks and date (ADR038_CURRENT / M1_END_DATE).
     Round 99 (R99-D14-01, ADR-227): 14 §14.1's M2 row ends 14 weeks after that end date (M2_END), and the M3 row's
     “12–14 周（至 YYYY-MM” and the conclusion's “M3 在 YYYY-MM” fall in the months of M2 end + 12–14 weeks (M3_END).
  Round 61 also extends (T): the <inline:tower-goal> self-check in the 05 §5.3.5 skeleton must come after a bindExtensions( call,
  and step 1 of the 05 §5.6.5 判定流程 must re-check per call, via getAllTools(), that a Tower tool name resolves to
  <inline:tower-goal> (ADR-188).  Run all: --checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJC
  H  (round 62, R61 §3.1, ADR-189) key hints in 04 wireframes (code blocks: “[K 动作]” buttons and “K 动作 · K 动作” bars) name
     keys registered in the 16 §16.3 keymap; a hint marked M2/M3 needs a row of that milestone for the key, and a key registered
     only for M2/M3 must carry the marker.  The view → scope comparison the review suggested is not implemented (04 wireframes
     carry no machine-readable view name).
  Round 62 also extends (T): PI_BUILTIN_TOOLS (Pi v1.2.0 allToolNames) must be partitioned by TOWER_BUILTINS / NON_TOWER_BUILTINS in
  the 05 §5.3.5 skeleton, the session must be created with excludeTools: NON_TOWER_BUILTINS, every non-whitelisted name is named in
  the 11 §11.3.4 tool-source bullet and the 16 §16.1.10 row for non-whitelisted built-ins, every whitelisted name other than bash is
  named there as builtin:<name>, and the 05 §5.6.2 setActiveTools literals are whitelisted built-ins or Tower tools, each phase
  naming its built-ins explicitly; and (s) with a narrow form of the suggested source-state check: the Run-time source of
  prepare_failed is named in each of its six defining places (S_SOURCES).  Run all: --checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH
  Round 63 (R62 §3.1, ADR-190) extends (T) once more: Pi gives tools of built-in extensions the source builtin:<extension name>,
  so the path builtin:<name> of every `builtin: true` entry of the 05 §5.3.5 extensionFactories must be named in the 11 §11.3.4
  tool-source bullet, the 05 §5.6.5 step-3 bullet and the 16 §16.1.10 row for non-whitelisted built-ins (the “builtin: source”
  allow-list).  The suggested (z′) extension (00 §0.5.1 rows citing the SDK skeleton must say SDK/M1 or give the RPC rule) is
  not implemented: which 00 rows depend on the SDK skeleton is not machine-readable; R62-D5-02 is fixed in the text.
  (p)/(o)/(P)/(i)/(D)/(K)/(A)/(T)/(F)/(M)/(B)/(O)/(J)/(C)/(H) print UNPARSABLE=<n> for rows they cannot parse; those rows are listed but do not fail the run.
Exit status is non-zero if any xref problem or any finding of the selected checks; (t) is informational.
"""
import re, itertools, os, sys, glob
HERE = os.path.dirname(os.path.abspath(__file__))
D = os.path.normpath(os.path.join(HERE, '..', '..'))
files = sorted(glob.glob(D + '/[01][0-9]-*.md')) + [os.path.join(D, '..', 'README.md')]
heads, adrs = {}, set()
for f in files[:-1]:
    fence = False
    for i, l in enumerate(open(f, encoding='utf8'), 1):
        if l.startswith('```'): fence = not fence; continue
        if fence: continue
        m = re.match(r'^#+\s+(\d+(?:\.\d+)*)\s*(.*)', l)
        if m: heads[m.group(1)] = (os.path.basename(f)[:2], m.group(2).strip(), i)
        m = re.match(r'^## (ADR-\d{3})', l)
        if m: adrs.add(m.group(1))
EXT = re.compile(r'(\.md|research|theory|G|T|L|\*TB\*|\*LS\*|gui|CHANGELOG)\W{0,3}$')
SEC = re.compile(r'§\s?(\d+(?:\.\d+)*)(?:\s?[–-]\s?(\d+(?:\.\d+)*))?')
rows, bad = [], []
for f in files:
    dn = os.path.basename(f)[:2] if not f.endswith('README.md') else 'RM'
    for ln, l in enumerate(open(f, encoding='utf8'), 1):
        ext, last = False, 0
        for m in SEC.finditer(l):
            pre = l[max(0, m.start() - 14):m.start()]
            between = l[last:m.start()]; last = m.end()
            if EXT.search(pre): ext = True; continue
            if ext and re.fullmatch(r'[\s、，,与和及/]*', between): continue
            ext = False
            dm = re.search(r'`?(\d\d)`?\s?$', pre)
            for s in [m.group(1)] + ([m.group(2)] if m.group(2) else []):
                st = 'ok'
                if s not in heads: st = 'MISSING'
                elif dm and dm.group(1) != '%02d' % int(s.split('.')[0]): st = 'DOC_MISMATCH'
                title = heads.get(s, ('', '', 0))[1]
                rows.append((dn, ln, s, st, title, l.strip()))
                if st != 'ok': bad.append(rows[-1])
        for m in re.finditer(r'ADR-(\d{2,3})', l):
            a = 'ADR-%03d' % int(m.group(1))
            if a not in adrs: bad.append((dn, ln, a, 'NO_ADR', '', l.strip()))
print(f'headings={len(heads)} adrs={len(adrs)} section_refs={len(rows)} problems={len(bad)}')
for b in bad: print('\t'.join(map(str, b[:5])), b[5][:120])
if '--dump' in sys.argv:
    with open(sys.argv[sys.argv.index('--dump') + 1], 'w', encoding='utf8') as o:
        for r in rows: o.write('\t'.join(map(str, r[:5])) + '\t' + r[5][:200] + '\n')

# ---------------------------------------------------------------------------
# Round-12 extensions (r), (s), (t).  Run all: python3 xref.py --checks rst
# ---------------------------------------------------------------------------
def doc(n):
    return open(glob.glob(f'{D}/{n}-*.md')[0], encoding='utf8').read()

def section_lines(n, sec):
    """(start, end) line numbers (1-based, inclusive) of numbered heading `sec` in doc n."""
    L = doc(n).split('\n'); st = None; lvl = 0
    for i, l in enumerate(L, 1):
        m = re.match(r'^(#+)\s+(\d+(?:\.\d+)*)\s', l)
        if not m: continue
        if st is None and m.group(2) == sec: st, lvl = i, len(m.group(1)); continue
        if st is not None and len(m.group(1)) <= lvl: return st, i - 1
    return (st, len(L)) if st else (None, None)

# Lines that legitimately quote superseded wording: ADR history (15) and the
# deprecation table (16 §16.1.13).  Plus a local "historical" marker window.
DEP16 = section_lines('16', '16.1.13')
HIST = re.compile(r'~~|取代|此前|废弃|已退役|Superseded|未采用|更正|多算|第 [5-9] 轮|第 1[01] 轮|方案 B|历次|旧值')

def exempt(dn, ln, line, pos):
    if dn == '15': return True
    if dn == '16' and DEP16[0] and DEP16[0] <= ln <= DEP16[1]: return True
    return bool(HIST.search(line[max(0, pos - 60):pos]))

UNIQUE = [
  # name, canonical (doc, §), mention regex, contradiction regexes
  # round 19 (ADR-145): stale wording of rules changed this round
  ('“知悉”不结束存活期间（ADR-145）', ('10', '10.3.1'), r'知悉',
   [r'知悉[^。|不只]{0,30}结束[^。|]{0,6}(存活|未解决)(进程)?期间', r'知悉[^。|不只]{0,20}(停止|不再)[^。|]{0,6}扫描']),
  ('cgroup 粒度（ADR-145：每 Goal 父、每 Run 子）', ('10', '10.3.1'), r'cgroup',
   [r'cgroup[^。|]{0,40}每个? ?Goal 一个(?! ?父)', r'每个? ?Run 一个 ?cgroup(?! ?为子| ?子)']),
  ('Run 令牌的注入点与归因依据（ADR-144/145）', ('10', '10.3.1'), r'TOWER_RUN_TOKEN|TOWER_ORIGIN|spawnHook',
   [r'由[^。|]{0,20}spawnHook[^。|]{0,10}注入[^。|]{0,20}(令牌|TOWER_RUN_TOKEN)', r'spawnHook`?/`?operations`? ?注入',
    r'TOWER_ORIGIN[^。|]{0,20}(决定|作为|用于)[^。|]{0,6}归因(?!依据)', r'按 ?`?TOWER_ORIGIN`? ?归因']),
  ('开场撤回按 id（ADR-144 补记）', ('06', '6.4.3'), r'withdraw|撤回',
   [r'withdraw\{goalId, ?index\}', r'按 ?(序号|index|下标)撤回']),
  ('归因基线 / “撤销外部改动”的目标', ('10', '10.3.1'), r'撤销外部改动|external_change\.revert|归因基线',
   [r'最近的非外部检查点', r'最后一个回合检查点', r'最近的回合检查点', r'恢复到最近的检查点树',
    r'撤销到 pin', r'恢复为 pin 中的(内容|版本)', r'外部 ?· ?待处置',
    r'goal\.review\.(adopt|revert)_external', r'adopt_external_hunks|revert_external_hunks']),
  ('检验检出的端口段', ('10', '10.8.3'), r'检验[^。|]{0,30}端口段|端口段[^。|]{0,30}检验',
   [r'(?<!不)复用 ?(Goal|目标)的(端口)?段', r'检验[^。|]{0,40}在(该|本) ?(Goal|目标)的端口段']),
  # ADR-121: agent_settled -> 2 s grace -> terminate & wait -> agent_bg_done -> claimed -> pin
  ('settle 顺序（宽限在终止之前，ADR-121）', ('10', '10.3.1'), r'agent_bg_done|SIGKILL|宽限',
   [r'settle[^。|]{0,60}5 s 后 SIGKILL', r'settle[^。|]{0,60}SIGTERM，5 s',
    r'(终止|清空|agent_bg_done)[^。|]{0,60}(→|然后|再)[^。|]{0,12}(2 s )?宽限', r'先终止后台进程']),
  ('依赖目录中的仓库形态目录', ('10', '10.1.2'), r'依赖目录[^。|]{0,40}(仓库形态|名字扫描)',
   [r'依赖目录[^。|]{0,40}(不处理|登记于 T31)']),
  ('seal 说明四段', ('10', '10.6'), r'seal (提交)?说明',
   [r'seal (提交)?说明[^。|]{0,30}(三|3) ?段', r'seal (提交)?说明[^。|]{0,30}三部分']),
  # ADR-120: strip Default_Ignorable_Code_Point -> NFKC -> casefold; HFS+ is covered, not a limitation.
  ('名字比较规则（HFS+，ADR-120）', ('10', '10.1.2'), r'NFKC|HFS',
   [r'NFKC[^。|`]{0,8}(\+|与|、)[^。|]{0,6}大小写折叠',            # restated without the strip step
    r'NFKC[^。|]{0,12}(→|、|\+)[^。|]{0,6}去除',                     # strip after NFKC (wrong order)
    r'HFS\+[^。|]{0,30}(不覆盖|不在此规则内|已知限制)(?![^。|]{0,6}不是)',
    r'stripDefaultIgnorable\(\w+\.normalize']),
  ('sv: 去重键（ADR-125）', ('08', '8.4'), r'sv:',
   [r'sv:(?!\{goalId\}:\{category\}:\{op\}:\{target\})']),
  ('an: 去重键（ADR-126）', ('08', '8.4'), r'an:|bg_process_survived',
   [r'(?<![a-z])a:\{goal(Id)?\}:bg', r'(?<![a-z])an:\{(?!goalId\}:(bg_process_survived|post_settle_activity|structured_content_dropped|tower_goal_handler_error))']),   # round 73 (ADR-201): structured_content_dropped registered in 08 §8.4; round 111 (ADR-239): tower_goal_handler_error registered there
  ('M1 周数与日期', ('14', '14.3.4'), r'M1',
   [r'(?<![\d.–-])(?<!则 )(?<!\*\*)(?<!第 )32 周', r'32 个日历周', r'2027-06-18(?![^。|]{0,6}）)',
    r'33 个日历周', r'2027-06-25', r'第 29 周末(功能)?冻结',          # round 14 (ADR-133): 34 weeks
    r'34 个日历周', r'2027-07-02(?![^。|]{0,20}(顺延|→))', r'第 30 周末(功能)?冻结',   # round 15 (ADR-133 addendum): 35 weeks
    r'35 个日历周', r'2027-07-09(?![^。|]{0,20}(顺延|→))', r'第 31 周末(功能)?冻结',   # round 16 (ADR-133 addendum): 36 weeks, to 2027-07-16
    r'M1 第 3[0-5]–3[2-7] 周（自用', r'M1 第 3[0-5] 周（用 ?(第 \d+ 周末的 )?M1 冻结构建',   # round 97: windows move to 36–38 / 36
    r'36 个日历周', r'2027-07-16(?![^。|]{0,20}(顺延|→))', r'第 32 周末(功能)?冻结',   # round 18 (ADR-133 addendum): 37 weeks
    r'37 个日历周', r'2027-07-23(?![^。|]{0,20}(顺延|→))', r'第 33 周末(功能)?冻结',
    r'38 个日历周', r'2027-07-30(?![^。|]{0,20}(顺延|→))', r'第 34 周末(功能)?冻结']),   # round 97 (ADR-225): 39 weeks, to 2027-08-06   # round 24 (ADR-133 addendum): 38 weeks, to 2027-07-30   # round 17: §14.5 experiment windows follow the freeze week
  # round 98 (R98-D15-01, ADR-226): the S0 reason after an unconfirmed hard-link probe is the second reason of 04 §4.8.5
  # (`本机的沙箱未通过启动自检（硬链接）`); the generic `本机没有可用的 OS 写入沙箱` is only for machines without an OS sandbox
  ('S0 原因：启动自检未确认拒绝（ADR-224/226）', ('04', '4.8.5'), r'S0',
   [r'(探测|自检)[^。|]{0,300}原因 ?`本机没有可用的 OS 写入沙箱`']),
  # R15-D15-01 #9: the pause continuation has one definition (03 §3.2.1, ADR-134)
  ('暂停的继续目标（ADR-134）', ('03', '3.2.1'), r'继续目标|continuation|resumeTo|pendingVerify|detectedIn',
   [r'\b(resumeTo|pendingVerify|detectedIn|applyPendingHandBack)\b(?![^。|]{0,30}(废弃|取代|不再|已删除))',
    r'按 ?`?detectedIn`? ?继续']),
  # R14-D15-01: four concepts with a single definition
  ('I2 与 external_change 的分界（ADR-128）', ('10', '10.3.1'), r'I2|external_change|来源不明',
   [r'任何(未提交的?)?(改动|变化)[^。|]{0,10}→ ?`?verifying', r'来源不明[^。|；;]{0,30}(→|进入) ?`?verifying',
    r'指纹变化[^。|]{0,20}(一律|即)[^。|]{0,6}(→|进入) ?`?verifying']),
  ('变更类工具调用（ADR-130）', ('16', '16.1.4'), r'变更类工具|可变更工具',
   [r'可变更工具（edit ?/ ?write', r'变更类工具调用[^。|]{0,4}[（(]`?edit`?[/、 ]',
    r'readOnlyHint[^。|]{0,20}(即可|即视为只读|就算只读)']),
  ('resumeTo 的来源（ADR-128）', ('16', '16.1.1'), r'resumeTo|resume_to',
   [r'external_change[^。|]{0,40}(记|写)[^。|]{0,6}`?resumeTo', r'resumeTo[^。|]{0,6}=[^。|]{0,6}检测时的状态']),
  ('宽限失败的去向（ADR-129）', ('05', '5.5'), r'宽限',
   [r'宽限[^。|]{0,12}失败[^。|]{0,40}(post_settle_activity|→ ?`?running|开[^。|]{0,6}回合)',
    r'(?<!不开任何)(?<!不开)(?<!另开)(?<!额外的)(?<!删除)(?<!删去)提醒回合(?![^。|]{0,24}(作废|删除|删去|不复存在|已废弃))']),
  # ADR-124: the executable/redirecting git config-key list lives only in 16
  ('可执行或重定向的配置键清单', ('16', '16.2.6'), r'覆盖对话框',
   [r'覆盖对话框(?![^。]*`16`)[^。]{0,160}(core\.fsmonitor|core\.hooksPath|filter\.|include\.path)']),
  # ADR-125: sandbox-violation fields
  ('category / op / target（ADR-125）', ('16', '16.1.6'), r'sandbox_violation|沙箱拒绝',
   [r'目标根', r'targetRoot', r'类别, ?目标根', r'同类目标去重']),
  # ADR-121: I4 validity is by tool events, not fingerprints
  ('I4 有效提交以工具事件判定（ADR-121）', ('03', '3.3'), r'有效提交|有效 submit|I4',
   [r'有效(提交|submit)[^。|]{0,30}指纹一致', r'Run\.submit\.fingerprint ?==',
    r'submit[^。|]{0,30}之后没有任何改变工作区指纹', r'有效提交[^。|]{0,30}当时的工作区指纹']),
  # (x) default data: the default benign list (ADR-125) is defined once, in 16 §16.1.6
  ('默认良性清单（ADR-125）', ('16', '16.1.6'), r'默认良性清单|良性清单默认值',
   [r'(默认良性清单|良性清单默认值)[^。|]{0,20}(含|包括|为|有)[^。|]{0,40}(gitconfig|Caches|~/\.tower|id_[a-z0-9]+)']),
]

def check_r():
    out = []
    for name, (cd, cs), mention, bads in UNIQUE:
        a, b = section_lines(cd, cs)
        for f in files:
            dn = os.path.basename(f)[:2] if not f.endswith('README.md') else 'RM'
            for ln, l in enumerate(open(f, encoding='utf8'), 1):
                if dn == cd and a and a <= ln <= b: continue          # canonical text itself
                for rx in bads:
                    for m in re.finditer(rx, l):
                        if exempt(dn, ln, l, m.start()): continue
                        out.append(('CONTRADICT', name, f'{cd} §{cs}', dn, ln, l[max(0, m.start() - 40):m.end() + 40].strip()))
    return out

def toks_quoted(s): return re.findall(r'"([a-z0-9_]+)"', re.sub(r'//[^\n]*', '', s))   # TS union, comments stripped
def toks_sql(s):    return re.findall(r"'([a-z0-9_]+)'", s)
def toks_tick(s):   return [t for t in re.findall(r'`([a-z0-9_]+)`', s) if not t.isdigit()]
def reg_row(key):
    """Value cell of the 16 row for `key`, with parenthetical notes （…） removed."""
    for l in doc('16').split('\n'):
        if l.startswith(f'| `{key}`'):
            c = l.split('|')[2]
            while True:
                c2 = re.sub(r'（[^（）]*）', '', c)
                if c2 == c: return c
                c = c2
    return ''
def between(text, start, end):
    i = text.find(start); return text[i:text.find(end, i + len(start))] if i >= 0 else ''

def check_s_rows():
    t02, t06, t10, t07 = doc('02'), doc('06'), doc('10'), doc('07')
    goals = between(t06, 'CREATE TABLE goals', '\n);')
    ckpt = between(t06, 'CREATE TABLE checkpoints', 'BEGIN SELECT RAISE')
    m07 = re.search(r'`anomaly\{detector\}`——包括(.*?)。', t07)
    a07 = [t for t in toks_tick(m07.group(1))] + (['loop', 'stall'] if m07 and '循环与停滞' in m07.group(1) else []) if m07 else None
    a16 = [t for l in doc('16').split('\n') if l.startswith('| anomaly：') for t in toks_tick(l.split('|')[1])
           if t not in ('depcache_tampered', 'verifier_config_tampered')]
    a02 = re.search(r'"anomaly"\s*//\s*检测器：([^（\n]*)', t02)
    return [
      ('Goal state', '02 LifecycleState', toks_quoted(between(t02, 'type LifecycleState', ';')),
       '06 goals.state CHECK', toks_sql(between(goals, 'state TEXT NOT NULL CHECK', ')),')),
       '16 LifecycleState', toks_tick(reg_row('LifecycleState'))),
      ('PauseReason', '02 Goal.pauseReason', toks_quoted(between(t02, 'pauseReason?:', ';')),
       '06 goals.pause_reason CHECK', toks_sql(between(goals, 'pause_reason TEXT CHECK', ')),')),
       '16 Goal.pauseReason', toks_tick(reg_row('Goal.pauseReason'))),
      ('HumanDecision.kind', '02 HumanDecision.kind', toks_quoted(between(t02, 'interface HumanDecision', 'target?:')),
       '06 decisions.kind CHECK', toks_sql(between(between(t06, 'CREATE TABLE decisions', '\n);'), 'kind TEXT NOT NULL CHECK', ')),')),
       '16 HumanDecision.kind', toks_tick(reg_row('HumanDecision.kind'))),
      ('Checkpoint landmark', '10 Checkpoint.landmarks', toks_quoted(between(t10, 'landmarks: (', ')[]')),
       '06 checkpoints_landmark_guard', toks_sql(between(ckpt, 'value NOT IN', 'BEGIN')),
       '16 Checkpoint.landmarks', toks_tick(reg_row('Checkpoint.landmarks').split('；')[0])),
      ('Checkpoint.author', '10 Checkpoint.author', toks_quoted(re.search(r'interface Checkpoint \{.*?author:([^;]*);', t10, re.S).group(1)),
       '06 checkpoints.author CHECK', toks_sql(between(ckpt, 'author TEXT', '),')),
       '16 Checkpoint.author', toks_tick(reg_row('Checkpoint.author').split('（')[0])),
      ('anomaly detectors', '02 Fact "anomaly" comment', re.findall(r'[a-z_]+', a02.group(1)) if a02 else [],
       '07 §7.10.1 classification rule', a07,
       '16 §16.1.6 anomaly rows', a16),
      ('verifyOrigin', '02 Goal.verifyOrigin', toks_quoted(between(t02, 'verifyOrigin?:', ';')),
       '06 goals.verify_origin CHECK', toks_sql(between(goals, 'verify_origin TEXT CHECK', ')),')),
       '16 Goal.verifyOrigin', toks_tick(reg_row('Goal.verifyOrigin'))),
      ('NeedsYouItem.kind', '02 NeedsYouItem.kind', toks_quoted(between(between(t02, 'interface NeedsYouItem', '\n}'), '\n  kind:', ';')),
       '06 needs_you.kind CHECK', toks_sql(between(between(t06, 'CREATE TABLE needs_you', '\n);'), 'CHECK (kind IN', '))')),
       '16 NeedsYouItem.kind', toks_tick(reg_row('NeedsYouItem.kind'))),
    ]

def report_s_rows():
    out = []
    for name, na, A, nb, B, nc, C in check_s_rows():
        sets = [(na, set(A)), (nb, set(B) if B is not None else None), (nc, set(C))]
        present = [s for _, s in sets if s is not None]
        union = set().union(*present)
        diffs = []
        for n, s in sets:
            if s is None: diffs.append(f'{n}: (no constraint)'); continue
            miss = sorted(union - s)
            if miss: diffs.append(f'{n} missing {miss}')
        out.append((name, 'OK' if all(d.endswith('(no constraint)') for d in diffs) else 'DIFF', '; '.join(diffs)))
    return out

OPEN = re.compile(r'待(主干|定义|同步|裁决|确认|登记)|TBD|TODO|（请 `\d\d` 登记）|命令由 `\d\d` ?/ ?`\d\d` 定义|待 `\d\d`')
# (s) round 62 (R61 §3.1, ADR-189; narrow form of the suggested extension): the Run-time source of prepare_failed (a Tower tool
# shadowed mid-Run, 05 §5.6.5) is named in every place that defines the reason.  The general “same source-state set in 02 / 03 /
# 16” comparison is not implemented: 02 and 16 name source states only for a few reasons, in prose.
S_SOURCES = [   # (doc, line selector regex, text after which the definition starts or None, required regex)
  ('02', r'\|\s*"prepare_failed"', None, r'运行中|running'),
  ('03', r'^\| `prepare_failed` \|', None, r'running'),
  ('16', r'^\| `Goal\.pauseReason`', '`prepare_failed`（', r'`running`'),
  ('16', r'^\| `stalled` 子类型', '`prepare_failed`（', r'`running`'),
  ('08', r'^\| preparing \|', '`prepare_failed` 的定义', r'`running`'),
  ('06', r'^\| F4b \|', None, r'Run 中途'),
]
def check_s_sources():
    out = []
    for dn, sel, after, need in S_SOURCES:
        l = next((x for x in doc(dn).split('\n') if re.search(sel, x)), None)
        if l is None: out.append(('UNPARSABLE', dn, sel)); continue
        seg = l[l.index(after):] if after and after in l else ('' if after else l)
        if after and seg and not after.endswith('（'): seg = seg[:seg.find('。') + 1 or len(seg)]   # up to the end of that sentence
        elif after and seg:   # the parenthetical that starts at `after`
            depth, j = 0, len(after) - 1
            for j in range(len(after) - 1, len(seg)):
                depth += {'（': 1, '）': -1}.get(seg[j], 0)
                if depth == 0: break
            seg = seg[:j + 1]
        if not re.search(need, seg): out.append(('PREPARE_FAILED_SOURCE_MISSING', dn, sel, need))
    return out

def check_t():
    out = []
    for f in files:
        dn = os.path.basename(f)[:2] if not f.endswith('README.md') else 'RM'
        if dn == '15': continue
        for ln, l in enumerate(open(f, encoding='utf8'), 1):
            for m in OPEN.finditer(l):
                if l[:m.start()].count('`') % 2: continue         # inside a code span (e.g. a regex)
                tags = sorted(set(re.findall(r'R1[0-2]-D\d+-\d+\w?', l)))
                out.append(('OPEN', dn, ln, ','.join(tags), l[max(0, m.start() - 50):m.end() + 50].strip()))
    return out


# ---------------------------------------------------------------------------
# Round-13 extensions (u) (v) (w) (x)
# ---------------------------------------------------------------------------
def expand_g(txt):
    """'G1–G9、G26b、G27b/c' -> set of case ids."""
    out = set()
    for a, b in re.findall(r'G(\d+)[–-]G?(\d+)(?![a-z\d])', txt):
        out |= {f'G{i}' for i in range(int(a), int(b) + 1)}
    for m in re.finditer(r'G(\d+)([a-z](?:/[a-z])*)?(?![\d–-])', txt):
        if m.group(2):
            for suf in m.group(2).split('/'): out.add(f'G{m.group(1)}{suf}')
        else: out.add(f'G{m.group(1)}')
    return out

def sp6b_table():
    L = doc('14').split('\n'); start = next(i for i, l in enumerate(L) if 'SP6b 批次表（唯一定义' in l)
    batches, rows = {}, set()
    for i in range(start, start + 20):
        l = L[i]
        m = re.match(r'^\| (B\d) \| ([^|]*) \|[^|]*\| ([^|]*) \|', l)
        if m:
            wk = re.findall(r'第 (\d+) 周', m.group(2))
            batches[m.group(1)] = (int(wk[-1]) if wk else 0, expand_g(m.group(3)))
            rows.add(i + 1)
    return batches, rows

def check_u():
    batches, rows = sp6b_table(); out = []
    g2b = {g: b for b, (_, gs) in batches.items() for g in gs}
    for f in files:
        dn = os.path.basename(f)[:2] if not f.endswith('README.md') else 'RM'
        if dn == '15': continue
        for ln, l in enumerate(open(f, encoding='utf8'), 1):
            if dn == '14' and ln in rows: continue
            for m in re.finditer(r'(?:SP6b )?(B[0-4])(?:（|\s*于第 |[^。|；（]{0,8}第 )(\d+)', l):
                b, w = m.group(1), int(m.group(2))
                if b in batches and batches[b][0] and w != batches[b][0]:
                    out.append(('BATCH_WEEK', dn, ln, f'{b}: {w} ≠ table {batches[b][0]}', l[max(0, m.start() - 30):m.end() + 30].strip()))
            for m in re.finditer(r'第 (\d+) 周[^。|；G]{0,6}((?:G\d+[a-z]?(?:[–/、，, ]+)?){1,})', l):
                w = int(m.group(1))
                for g in sorted(expand_g(m.group(2))):
                    b = g2b.get(g)
                    if b and batches[b][0] != w:
                        out.append(('CASE_WEEK', dn, ln, f'{g}: week {w} ≠ {b} (week {batches[b][0]})', l[max(0, m.start() - 20):m.end() + 20].strip()))
            for m in re.finditer(r'(B[0-4])[（(：:]\s*((?:G\d+[a-z]?(?:[–/、，, ]+)?){1,})', l):
                for g in sorted(expand_g(m.group(2))):
                    if g in g2b and g2b[g] != m.group(1):
                        out.append(('CASE_BATCH', dn, ln, f'{g}: listed in {m.group(1)}, table says {g2b[g]}', l[max(0, m.start() - 20):m.end() + 20].strip()))
    return out

SCOPES = ('read', 'decide', 'full')
def cmds_06():
    t = doc('06'); sec = t[t.index('### 6.4.3'):t.index('### 6.4.4')]; out = []
    for l in sec.split('\n'):
        if not l.startswith('| `'): continue
        c = l.split('|'); scope = c[-2].strip()
        sc = next((x for x in SCOPES if scope.startswith(x)), None)
        local = bool(re.search(r'禁止远程|仅本机', scope))
        if re.search(r'字段级|时仅本机', scope): local = False   # round 41: field-level / conditional local rules are written as ✓* rows in 16 §16.5
        for cmd in re.findall(r'`([a-z_]+(?:\.[a-z_]+)+)`', c[1]): out.append((cmd, sc, local))
    return out

def matrix_16():
    t = doc('16'); sec = t[t.index('## 16.5'):t.index('## 16.6')]; rows = []
    for l in sec.split('\n'):
        if not l.startswith('| ') or l.startswith('|---') or l.startswith('| 能力'): continue
        c = [x.strip() for x in l.strip().strip('|').split('|')]
        if len(c) < 5: continue
        toks, ns = [], None
        for tk in re.findall(r'`([a-z_*]+(?:\.[a-z_*]+)*)`', c[0]):
            if '.' in tk: ns = tk.split('.')[0]; toks.append(tk)
            elif ns: toks.append(f'{ns}.{tk}')
            else: toks.append('*.' + tk)
        sc = next((x for x in SCOPES if x in c[1]), None)
        rows.append((toks, sc, c[3], l))
    has_default = bool(re.search(r'未单列的命令', sec))
    return rows, has_default

def check_v():
    import fnmatch
    rows, has_default = matrix_16(); out = []
    for cmd, sc, local in cmds_06():
        hit = [r for r in rows if any(fnmatch.fnmatch(cmd, tk) for tk in r[0])]
        exact = [r for r in hit if cmd in r[0]] or hit
        if not exact:
            if local: out.append(('LOCAL_NOT_IN_MATRIX', cmd, '06 marks it 禁止远程/仅本机 but 16 §16.5 has no ✗ row'))
            elif not has_default: out.append(('NO_ROW', cmd, 'no 16 §16.5 row and no default remote rule'))
            continue
        r = exact[0]
        if local and '✗' not in r[2]: out.append(('LOCAL_MISMATCH', cmd, f'06 local-only, 16 web = {r[2]}'))
        if sc and r[1] and sc != r[1]: out.append(('SCOPE_MISMATCH', cmd, f'06 {sc} vs 16 {r[1]}'))
    return out + check_v647()

V647_ALIAS = {'project.approve_docker': 'docker 批准'}   # prose names in the 06 §6.4.7 list
def check_v647():
    """(v) round 101 (R101-D15-02 / R101 §3.1, ADR-229): every whole-command local-only command of 06 §6.4.3 (scope
    “禁止远程” / “仅本机”, not field-level or conditional) is named in the 06 §6.4.7 “禁止远程的命令” row — exact name,
    a sibling written as `a.b`/`c` (c replaces the last component), a slash group `x/y` (first segment), or a
    V647_ALIAS prose name.  The row missing is UNPARSABLE."""
    t = doc('06'); row = next((l for l in t.split('\n') if l.startswith('| 禁止远程的命令 |')), None)
    if row is None: return [('UNPARSABLE', '06 §6.4.7', '“禁止远程的命令” row not found')]
    names, prefixes, prev = set(), set(), None
    for grp in re.findall(r'`([^`]+)`', row):
        if re.fullmatch(r'[a-z_]+(?:/[a-z_]+)+', grp): prefixes |= set(grp.split('/')); continue
        for tk in re.findall(r'[a-z_]+(?:\.[a-z_]+)*', grp):
            if '.' in tk: prev = tk; names.add(tk)
            elif prev: names.add(prev.rsplit('.', 1)[0] + '.' + tk)
    out = []
    for cmd, sc, local in cmds_06():
        if not local: continue
        if cmd in names or cmd.split('.')[0] in prefixes or V647_ALIAS.get(cmd, '\0') in row: continue
        out.append(('LOCAL_NOT_IN_6_4_7', cmd, '06 §6.4.3 local-only, not named in 06 §6.4.7 禁止远程的命令'))
    return out

def parse_ny_cell(cell):
    """First cell of an 08 §8.4/§8.8 row -> (kind, detector-or-subtype | None), or None if unparsable.
    Accepted forms: `kind` · `kind{sub}` · `kind`（`det`…） · `kind`（`detector = det`…） ·
    `kind`（子类型 `sub`） · `kind`（owner: …） — anything else is reported, never raised."""
    m = re.match(r'`([a-z_][a-z0-9_]*)(?:\{([a-z_][a-z0-9_]*)\})?`', cell)
    if not m: return None
    kind, sub = m.group(1), m.group(2)
    if sub: return kind, sub
    rest = cell[m.end():]
    d = re.search(r'detector\s*=\s*`?([a-z_][a-z0-9_]*)', rest) or re.match(r'\s*（\s*(?:子类型\s*)?`([a-z_][a-z0-9_]*)`', rest)
    return kind, (d.group(1) if d else None)

def ny_table_rows(txt):
    """Rows of an 08 table whose first cell starts with a backticked kind; unparsable rows are returned separately."""
    rows, bad = [], []
    for l in txt.split('\n'):
        if not l.startswith('| `'): continue
        c = [x.strip() for x in l.strip().strip('|').split('|')]
        if len(c) < 2: bad.append(l[:80]); continue
        p = parse_ny_cell(c[0])
        if p is None: bad.append(c[0][:80]); continue
        rows.append((p[0], p[1], c[1]))
    return rows, bad

def check_w():
    out = []
    kinds = toks_tick(reg_row('NeedsYouItem.kind'))
    t08 = doc('08')
    d84 = t08[t08.index('## 8.4'):t08.index('**跨 Goal 根因')]
    a, b = section_lines('08', '8.8'); d88 = '\n'.join(t08.split('\n')[a - 1:b])
    r84, bad84 = ny_table_rows(d84); r88, bad88 = ny_table_rows(d88)
    out += [('UNPARSABLE_ROW', '08 §8.4', x) for x in bad84] + [('UNPARSABLE_ROW', '08 §8.8', x) for x in bad88]
    for k in kinds:
        if not any(x[0] == k for x in r84): out.append(('NO_DEDUPE', k, '08 §8.4'))
        if not any(x[0] == k for x in r88): out.append(('NO_OUTCOME', k, '08 §8.8'))
    for k, det, _ in r84 + r88:
        if k not in kinds: out.append(('UNKNOWN_KIND', k, '08 uses a kind not in 16 §16.1.7'))
    for k, det, _ in r84:
        if det and not any(x[0] == k and x[1] == det for x in r88):
            out.append(('NO_OUTCOME', f'{k}/{det}', 'detector-specific dedupe row without §8.8 mapping'))
    # round 84 (R84 §3.1, ADR-212): every `stalled` subtype named in the 08 §8.4 / §8.8 rows (“`stalled`（子类型 `x`”)
    # must be registered in the 16 §16.1.7 “`stalled` 子类型” row (R84-D15-01 (a) found human_checkout_lost missing there)
    srow = next((l for l in doc('16').split('\n') if l.startswith('| `stalled` 子类型 |')), None)
    if not srow: out.append(('UNPARSABLE', '16 §16.1.7', '`stalled` 子类型 row not found'))
    else:
        subs = set(re.findall(r'`([a-z_]+)`', srow.split('|')[2]))
        for st in sorted(set(re.findall(r'`stalled`（子类型 `([a-z_]+)`', d84 + '\n' + d88))):
            if st not in subs: out.append(('STALLED_SUBTYPE_UNREGISTERED', st, '08 §8.4/§8.8 vs 16 §16.1.7'))
    prefixes = {}
    for k, det, key in r84:
        m = re.search(r'`([a-z]+):', key)
        if m: prefixes.setdefault(m.group(1), []).append(f'{k}/{det}' if det else k)
    for p_, ks in prefixes.items():
        if len({x.split('/')[0] for x in ks}) > 1: out.append(('DUP_PREFIX', p_, ', '.join(ks)))   # one prefix per kind; detectors of the same kind share it (ADR-128 an:{goalId}:<detector>)
    # 07 §7.10.1 routes `NY `kind`` must name a registered kind
    t07 = doc('07'); sec = t07[t07.index('### 7.10.1'):t07.index('### 7.10.2')]
    for m in re.finditer(r'NY[^|]{0,20}?`(?:kind:")?([a-z_]+)"?`', sec):
        if m.group(1) not in kinds: out.append(('UNKNOWN_KIND', m.group(1), '07 §7.10.1 route'))
    for m in re.finditer(r'kind:"([a-z_]+)"', sec):
        if m.group(1) not in kinds: out.append(('UNKNOWN_KIND', m.group(1), '07 §7.10.1 route'))
    return out

def check_x():
    """Default data vs test/wireframe expectations: a default-benign target must not be a sev-2 example."""
    t16 = doc('16'); m = re.search(r'良性清单默认值\*\*：(.*?)一项', t16)
    targets = re.findall(r'\(\w+, \w+, ([^)]+)\)', m.group(1)) if m else []
    out = []
    SEV2 = re.compile(r'severity 2|sev 2|◆|Needs-You')
    BENIGN = re.compile(r'默认良性|良性清单中|不会出现|severity 1|sev 1|只作提示')
    for dn in ('14', '04', '12'):
        L = doc(dn).split('\n'); fence = False
        for ln, l in enumerate(L, 1):
            if l.startswith('```') or l.strip().startswith('```'): fence = not fence
            is_case = dn == '14' and l.startswith('| G')
            if not (is_case or fence or dn in ('04', '12')): continue
            for tgt in targets:
                for mm in re.finditer(re.escape(tgt), l):
                    win = l[max(0, mm.start() - 120):mm.end() + 120]
                    if SEV2.search(win) and not BENIGN.search(win):
                        out.append(('DEFAULT_BENIGN_AS_SEV2', dn, ln, tgt, win.strip()))
    # sev-2 sandbox examples must use a category from the 16 §16.1.6 severity-2 set
    row = reg_row('sandbox_violation` 的字段') or next((l for l in t16.split('\n') if l.startswith('| `sandbox_violation` 的字段')), '')
    allcat = set(re.findall(r'`([a-z_]+)`（', row.split('`op`')[0])) if row else set()
    m2 = re.search(r'severity 2 的受保护集合 = ([^；|]*)', row)
    sev2, sev2ops = set(), {}
    if m2:
        for c, note in re.findall(r'`([a-z_]+)`(（[^）]*）)?', m2.group(1)):
            sev2.add(c)
            if note and '仅写' in note: sev2ops[c] = {'write'}
            elif note and '读' in note and '写' in note: sev2ops[c] = {'read', 'write'}
    for dn in ('04', '12', '14'):
        L = doc(dn).split('\n'); blocks, cur, fence = [], [], False
        for ln, l in enumerate(L, 1):
            if l.strip().startswith('```'):
                if fence: blocks.append(cur); cur = []
                fence = not fence; continue
            if fence: cur.append((ln, l))
            else: blocks.append([(ln, l)])
        for blk in blocks:
            txt = '\n'.join(l for _, l in blk)
            if '沙箱拒绝' not in txt or not re.search(r'◆|severity 2|sev 2', txt): continue
            for c in sorted(allcat):
                for mm in re.finditer(r'(?:(?:类别|category)[ :：`]*|◆ 沙箱拒绝 · )' + c + r'[` ·]*(?:操作|op)?[ :：`]*(read|write|exec|net)?', txt):
                    op = mm.group(1)
                    if c not in sev2:
                        out.append(('SEV2_EXAMPLE_NON_SEV2_CATEGORY', dn, blk[0][0], c, txt[max(0, mm.start() - 60):mm.end() + 60].replace('\n', ' ').strip()))
                    elif op and c in sev2ops and op not in sev2ops[c]:
                        out.append(('SEV2_EXAMPLE_NON_SEV2_OP', dn, blk[0][0], f'{c}/{op}', txt[max(0, mm.start() - 60):mm.end() + 60].replace('\n', ' ').strip()))
    # round 15 (R15-D11-01, ADR-136): each default-benign entry's category must equal the category the 16 rule assigns
    def category_of(p):
        if re.match(r'~/\.(ssh|aws|gnupg|netrc|config/gcloud|config/gh)(/|$)', p): return 'credential'
        if re.match(r'~/\.tower(/|$)', p): return 'tower_data'
        if re.match(r'~/\.[^/]+', p) or re.match(r'~/Library/(LaunchAgents|Preferences)/', p): return 'user_config'
        return 'system'
    for c, op, tgt in (re.findall(r'\((\w+), (\w+), ([^)]+)\)', m.group(1)) if m else []):
        if category_of(tgt) != c: out.append(('BENIGN_CATEGORY_MISMATCH', '16', 0, tgt, f'entry says {c}, 16 rule gives {category_of(tgt)}'))
    return out, targets


# ---------------------------------------------------------------------------
# Round-14 extensions (w′) (y) (z)
# ---------------------------------------------------------------------------
def check_w2():
    """(w′) every pauseReason maps to a registered Needs-You kind (or explicitly to none);
    every reason shown with ◆ in 12 §12.6.5 maps to a kind; mapped kinds have 08 §8.4/§8.8 rows.
    Round 77 (R77 §3.1, ADR-205): conversely, every reason that 16 maps to a kind is shown with ◆ in some 12 §12.6.5
    row, or is named as an exception in the section's intro paragraph."""
    out = []
    reasons = toks_tick(reg_row('Goal.pauseReason'))
    kinds = set(toks_tick(reg_row('NeedsYouItem.kind')))
    row = next((l for l in doc('16').split('\n') if l.startswith('| `pauseReason` → Needs-You kind')), '')
    if not row: return [('NO_MAPPING_ROW', '16 §16.1.7', 'pauseReason → Needs-You kind')]
    cell = row.split('|')[2]
    mapping = {}
    for part in cell.split('；'):
        part = re.sub(r'（[^（）]*(?:（[^（）]*）[^（）]*)*）', '', part)
        if '→' in part:
            lhs, rhs = part.split('→', 1)
            k = toks_tick(rhs)
            for r in toks_tick(lhs): mapping[r] = k[0] if k else None
        elif part.strip().startswith('不生成'):
            for r in toks_tick(part): mapping[r] = None
    a, b = section_lines('12', '12.6.5'); t12 = doc('12').split('\n')[a - 1:b]
    diamond = {m.group(1) for l in t12 for m in [re.match(r'\| pause `([a-z_0-9]+)`', l)] if m and '◆' in l}
    exc12 = {x for l in t12 if '例外' in l and not l.startswith('|') for x in re.findall(r'`([a-z_0-9]+)`', l)}
    t08 = doc('08')
    d84 = t08[t08.index('## 8.4'):t08.index('**跨 Goal 根因')]
    a8, b8 = section_lines('08', '8.8'); d88 = '\n'.join(t08.split('\n')[a8 - 1:b8])
    for r in reasons:
        if r not in mapping: out.append(('NO_KIND', r, 'pauseReason has no entry in 16 “pauseReason → Needs-You kind”')); continue
        k = mapping[r]
        if k is None:
            if r in diamond: out.append(('DIAMOND_WITHOUT_KIND', r, '12 §12.6.5 shows ◆ but 16 maps it to “不生成”'))
            continue
        if r not in diamond and r not in exc12:   # round 77 (R77 §3.1, ADR-205): the reverse direction
            out.append(('KIND_WITHOUT_DIAMOND', r, f'16 maps it to {k} but 12 §12.6.5 shows no ◆ and the intro does not list it as an exception'))
        if k not in kinds: out.append(('UNKNOWN_KIND', r, k))
        if not any(x[0] == k for x in ny_table_rows(d84)[0]): out.append(('NO_DEDUPE', r, k))
        if not any(x[0] == k for x in ny_table_rows(d88)[0]): out.append(('NO_OUTCOME', r, k))
    for r in mapping:
        if r not in reasons: out.append(('NOT_A_PAUSEREASON', r, 'listed in mapping but not in Goal.pauseReason'))
    return out

YMAP = {  # DDL column (first identifier of a table-level CHECK) -> 16 field row key
    'resume_to': 'Goal.resumeTo', 'human_checkout': 'Goal.humanCheckout',
    'pending_hand_back': 'Goal.pendingHandBack', 'external_change': 'Goal.externalChange',
    'owner_kind': 'NeedsYouItem.owner.kind', 'category': 'sandbox_violation` 的字段',
}
def check_y():
    """(y) every literal used by a cross-column CHECK in 06 appears in the matching 16 field row;
    round 15 (R15-D15-01 #1): no CREATE TABLE defines the same column twice."""
    out = []; t06 = doc('06'); t16 = doc('16').split('\n')
    tbl, cols = None, {}
    for ln, l in enumerate(t06.split('\n'), 1):
        mt = re.match(r'^CREATE TABLE (\w+)', l)
        if mt: tbl, cols = mt.group(1), {}; continue
        if tbl and re.match(r'^\);', l): tbl = None; continue
        mc = re.match(r'^\s+([a-z_][a-z0-9_]*)\s+(TEXT|INTEGER|REAL|BLOB)\b', l) if tbl else None
        if mc:
            if mc.group(1) in cols: out.append(('DUPLICATE_COLUMN', ln, tbl, f'{mc.group(1)} also at L{cols[mc.group(1)]}'))
            else: cols[mc.group(1)] = ln
    for ln, l in enumerate(t06.split('\n'), 1):
        m = re.match(r'^\s+CHECK \(\(?(?:NOT \()?\(?(\w+)', l)
        if not m: continue
        body = l
        nxt = t06.split('\n')[ln] if ln < len(t06.split('\n')) else ''
        if nxt.strip().startswith('OR ') or nxt.strip().startswith('AND '): body += nxt
        col = m.group(1)
        if col not in YMAP: continue
        key = YMAP[col]
        row = next((r for r in t16 if r.startswith('| `' + key)), None)
        if row is None: out.append(('NO_16_ROW', ln, col, key)); continue
        lits = set(re.findall(r"'([a-z_]+)'", body)) | set(re.findall(r'"([a-z_]+)"', body))
        lits -= {'global'} if col == 'owner_kind' else set()
        for v in sorted(lits):
            if v not in row: out.append(('VALUE_NOT_IN_16', ln, col, f'{v} ∉ 16 {key}'))
    return out

ZPUSH = re.compile(r'推送并开 PR|push_pr|PR 轮询|远端轮询|轮询远端|awaiting_remote|remote_merged|gh pr create')
ZNEG = re.compile(r'M2|不推送|不开 PR|不轮询|只有“仅保留分支”|仅保留分支（|移到|~~|削减 ④′|ADR-13[23]|历史|第 \d+ 轮|没有触发点|由你')
def check_z():
    """(z) push / PR / remote polling must not be presented as M1."""
    out = []
    for f in files:
        dn = os.path.basename(f)[:2] if not f.endswith('README.md') else 'RM'
        if dn == '15': continue
        head = ''
        a32, b32 = section_lines('03', '3.2') if dn == '03' else (None, None)
        for ln, l in enumerate(open(f, encoding='utf8'), 1):
            if re.match(r'^#+ ', l): head = l; continue
            whole_m1 = dn == '00' or (a32 and a32 <= ln <= b32)   # round 16: 00 and 03 §3.2 describe M1 behaviour throughout
            if dn == '16' and DEP16[0] and DEP16[0] <= ln <= DEP16[1]: continue
            for m in ZPUSH.finditer(l):
                near = l[max(0, m.start() - 40):m.end() + 40]
                if ZNEG.search(near): continue
                m1 = re.search(r'M1[^。|]{0,40}$', l[max(0, m.start() - 60):m.start()]) or re.search(r'^[^。|]{0,30}(从 M1|M1 起|M1 中|M1 的)', l[m.end():m.end() + 40]) \
                     or '[M1]' in head or re.search(r'\|\s*M1\s*\|', l) or whole_m1
                if m1: out.append(('PUSH_AS_M1', dn, ln, near.strip()))
    return out

# (z′) round 58 (R57 §3.1, ADR-185): M2-only capabilities named in M1 tables without a milestone marker
Z2_TABLES = [('03', '3.2.1'), ('08', '8.8'), ('12', '12.6.5'), ('16', '16.2.6'), ('16', '16.4'),
             ('13', '13.1'), ('13', '13.11')]   # round 59 (R58 §3.1, ADR-186): 13 tables, phrases limited by Z2_ONLY
Z2_PHRASES = re.compile(r'回退|分叉|远端 ?base ?(轮询|fetch)|每 ?\d+ ?min[^。|]{0,20}fetch|冲突雷达|合并队列|就地编辑')
Z2_ONLY = {'13': re.compile(r'冲突雷达|合并队列')}   # in 13, 回退 means degradation / perf regression, not rewind
Z2_NOT_REWIND = re.compile(r'回退(规则|阈值|模式|到可用|到 pin)|固定(的)?回退|粒度回退')
Z2_OK = re.compile(r'\bM[23]\b|不(重新)?(进入|提供|轮询)|没有|~~|第 \d+ 轮|ADR-13[23]|取代|已删除')
def check_z2():
    out, n = [], 0
    for d, sec in Z2_TABLES:
        a, b = section_lines(d, sec)
        if not a: out.append(('UNPARSABLE', f'{d} §{sec}', 'section not found')); continue
        L = doc(d).split('\n')
        for ln in range(a, b + 1):
            l = L[ln - 1]
            if not l.startswith('|'): continue
            for m in Z2_PHRASES.finditer(l):
                if d in Z2_ONLY and not Z2_ONLY[d].fullmatch(m.group(0)): continue
                if Z2_NOT_REWIND.match(l, m.start()) or Z2_NOT_REWIND.search(l[max(0, m.start() - 4):m.end() + 6]): continue
                n += 1
                cs = l.rfind('|', 0, m.start()); ce = l.find('|', m.end()); ce = len(l) if ce < 0 else ce
                near = l[max(cs + 1, m.start() - 40):min(ce, m.end() + 40)]
                if Z2_OK.search(near): continue
                out.append(('M2_CAPABILITY_UNMARKED', d, ln, m.group(0), near.strip()))
    # round 63 (R63 §3.1, ADR-191): the review-backlog blocking mode is M2 (E8).  In the M1 surfaces below every
    # line naming it must carry an M2 / M3 marker — anywhere in the row for table rows, else within 80 chars before /
    # 40 after.  Prose and code lines count too (the 04 §4.15 settings tree and the 06 §6.2.4 admission block are not tables).
    for d, sec in Z3_SECTIONS:
        a, b = section_lines(d, sec)
        if not a: out.append(('UNPARSABLE', f'{d} §{sec}', 'section not found')); continue
        L = doc(d).split('\n')
        for ln in range(a, b + 1):
            l = L[ln - 1]
            if re.match(r'^#+ ', l): continue
            for m in (Z3_PHRASES_88 if (d, sec) == ('08', '8.8') else Z3_PHRASES).finditer(l):
                n += 1
                near = l if l.startswith('|') else l[max(0, m.start() - 80):m.end() + 40]
                if Z3_OK.search(near): continue
                out.append(('M2_CAPABILITY_UNMARKED', d, ln, m.group(0), l[max(0, m.start() - 40):m.end() + 40].strip()))
    # round 83 (R83 §3.1, ADR-211): rewind / fork are M2 (ADR-059).  In the command table, the remote matrix and the
    # diagnostic view, every line naming the rewind / fork commands or the “回退到检查点 / 从检查点分叉” actions must carry
    # an M2 / M3 marker somewhere on the line (row-level: the 40-char window of the table check misfires on 分叉 = base divergence).
    for d, sec in Z4_SECTIONS:
        a, b = section_lines(d, sec)
        if not a: out.append(('UNPARSABLE', f'{d} §{sec}', 'section not found')); continue
        L = doc(d).split('\n')
        for ln in range(a, b + 1):
            l = L[ln - 1]
            if re.match(r'^#+ ', l): continue
            for m in Z4_PHRASES.finditer(l):
                n += 1
                if Z3_OK.search(l): continue
                out.append(('M2_CAPABILITY_UNMARKED', d, ln, m.group(0), l[max(0, m.start() - 40):m.end() + 40].strip()))
    # round 84 (R84 §3.1 second suggestion, §5 obs 7, ADR-212): in the drain / restart / quit / takeover prose a line that
    # names 回退 (rewind, M2) side by side with 接管 (takeover, M1) must carry an M2 / M3 marker on the line
    for d, sec in Z5_SECTIONS:
        a, b = section_lines(d, sec)
        if not a: out.append(('UNPARSABLE', f'{d} §{sec}', 'section not found')); continue
        L = doc(d).split('\n')
        for ln in range(a, b + 1):
            l = L[ln - 1]
            if re.match(r'^#+ ', l) or '回退' not in l or '接管' not in l: continue
            n += 1
            if Z3_OK.search(l): continue
            k = l.index('回退')
            out.append(('M2_CAPABILITY_UNMARKED', d, ln, '回退 + 接管', l[max(0, k - 40):k + 40].strip()))
    return out, n
Z4_SECTIONS = [('06', '6.4.3'), ('16', '16.5'), ('08', '8.13')]
Z4_PHRASES = re.compile(r'run\.rewind|run\.fork_goal|goal\.rewind|goal\.fork\b|回退到检查点|从检查点分叉')
Z5_SECTIONS = [('04', '4.6.7'), ('04', '4.16'), ('04', '4.18.3'), ('12', '12.6.4'), ('06', '6.1.4'), ('06', '6.1.6')]
Z3_SECTIONS = [('04', '4.4.4'), ('04', '4.15'), ('12', '12.6.5'), ('06', '6.2.4'), ('06', '6.4.3'),
               ('08', '8.8')]   # round 65 (R65 §5 obs 7, ADR-193): the 08 §8.8 exit table's backlog “越过” is the M2 override
Z3_PHRASES = re.compile(r'阻止模式|越过一次|capacity\.override|override_capacity|review_capacity')
Z3_PHRASES_88 = re.compile(r'阻止模式|越过|capacity\.override|override_capacity|review_capacity')   # 08 §8.8: bare “越过” too
Z3_OK = re.compile(r'\bM[23]\b')

# ---------------------------------------------------------------------------
# Round-16 extensions (c) continuation literal shape, (k) 03 rewrite targets vs 06 command rows
# ---------------------------------------------------------------------------
def continuation_shapes():
    """kind -> (all fields, required fields) from the 02 `type Continuation` union."""
    t = doc('02'); i = t.index('type Continuation'); blk = t[i:t.index(';\n\n', i) if ';\n\n' in t[i:i+4000] else i + 3000]
    shapes = {}
    for m in re.finditer(r'\{\s*kind:\s*"(\w+)"([^}]*)\}', blk):
        fields = re.findall(r';\s*(\w+)(\??):', m.group(2))
        shapes[m.group(1)] = ({f for f, _ in fields}, {f for f, q in fields if not q})
    return shapes

def check_c():
    """(c) every `{kind:"<k>", …}` continuation literal outside 15 / 16 §16.1.13 uses exactly the 02 shape."""
    shapes = continuation_shapes(); out = []
    for f in files:
        dn = os.path.basename(f)[:2] if not f.endswith('README.md') else 'RM'
        if dn in ('15', '02'): continue
        for ln, l in enumerate(open(f, encoding='utf8'), 1):
            if dn == '16' and DEP16[0] and DEP16[0] <= ln <= DEP16[1]: continue
            for m in re.finditer(r'\{\s*kind:\s*\\?"(\w+)\\?"([^{}]*)\}', l):
                k = m.group(1)
                if k not in shapes: continue          # other unions also use kind:"…"; only continuation kinds are checked
                if exempt(dn, ln, l, m.start()): continue
                if not re.search(r'继续目标|continuation|Continuation|改写|onAllReasonsCleared|paused', l[max(0, m.start() - 200):m.end() + 40]): continue
                if re.search(r'\bM2\b', l[max(0, m.start() - 160):m.end() + 60]): continue   # round 38 (ADR-164): fields deferred to M2 may appear in text marked M2
                parts = [p.strip() for p in re.split(r',(?![^\[]*\])', m.group(2)) if p.strip()]
                names = {re.match(r'(\w+)', p).group(1) for p in parts if re.match(r'\w+', p)}
                allf, req = shapes[k]
                extra, missing = names - allf, req - names
                if extra or missing:
                    out.append(('CONTINUATION_SHAPE', dn, ln, k, f'extra={sorted(extra)} missing={sorted(missing)}', l[max(0, m.start() - 30):m.end() + 10].strip()))
    return out

DELETED = [   # (name, regex, superseding ADR) — round 17: deleted mechanisms may appear only in 15, 16 §16.1.13 or history text
  ('run.openings', r'run\.openings|\bopenings:\s*\[|`openings`', 'ADR-140'),
  ('settle.adoptedHuman', r'adoptedHuman', 'ADR-140'),
  ('verify_new.origin', r'verify_new\{\s*(origin|human_change|agent_bg)', 'ADR-140'),
  ('rework_cycles_over', r'rework_cycles_over', 'ADR-143'),
  ('bash_process_groups / run_process_groups', r'\b(bash|run)_process_groups\b', 'ADR-142'),
  ('agent_processes / agent_proc.*', r'\bagent_processes\b|\bagent_proc\.(?!kill_requested)', 'ADR-142'),
  ('pid/pgid identity', r'proc_listpgrppids|\(bootSession, pid, startTime\)|身份键 `\(', 'ADR-142'),
  ('resumeTo / pendingVerify / detectedIn / applyPendingHandBack', r'\b(resumeTo|pendingVerify|detectedIn|applyPendingHandBack)\b', 'ADR-134'),
  ('secret window (events, abort, setting, stage)', r'secret_window\.(opened|closed|suspended|resumed)|secretWindow\.enabled|goal\.tool\.abort|abort_tool_call|stage:\s*"secret_window"', 'ADR-160'),
  ('exclusive window (term)', r'独占窗口', 'ADR-160'),
  ('cloud creds in data-dir file', r'Tower 数据目录下的 0600 凭据文件', 'ADR-159'),
  ('secret_file_unseeded classification', r'secret_file_unseeded|拒绝并报告', 'ADR-168'),
  ('local_file_unreadable Fact', r'local_file_unreadable', 'ADR-173'),   # round 47: withdrawn Fact; history mentions need a marker (撤回 / 第 N 轮)
  ('fingerprint.extraGlobs', r'extraGlobs', 'ADR-174'),   # round 48: deleted config key; history mentions need a marker (删除 / 第 N 轮)
  # round 56 (ADR-183): mechanisms deferred out of M1 — mentions must sit next to an M2 / M3 marker (DEL_OK)
  ('rebuild from an earlier checkpoint (M2)', r'从更早的检查点重建|人选的检查点|rebuild_satellite\{goalId, checkpointN\}', 'ADR-183'),
  ('project-level runtime grant (M3)', r'本项目内同类|本项目同类 30 天', 'ADR-183'),
  ('links_reachable in M1 (M2)', r'外部链接检查[^。|]{0,20}只在[^。|]{0,6}claimed', 'ADR-183'),
  # round 57 (R56 §3.1, ADR-184): the project-scoped tool grant is the same deferred mechanism under another name
  ('project-scoped tool grant (M3)', r'本项目内此工具', 'ADR-184'),
  # round 59 (R58 §3.1, ADR-186): deleted evidence-promotion / cleanup-exemption and the notify lift for one-way doors
  ('override promotion / cleanup exemption', r'升为决定性|可能被升级|随之升为永久', 'ADR-186'),
  ('one-way door silent→notify lift', r'单向门永不静默', 'ADR-186'),
  # round 60 (R59 §4 R59-D7-01, ADR-187): the full rehash at accept / seal is a fingerprint gate, not a verification run
  ('replay bundle for the accept/seal full rehash', r'完整重哈希验证', 'ADR-187'),
  # round 63 (R63-D13-01 / R63-D5-01, ADR-191): the latest-shadow-seal row and the M2 RPC detection details are deleted
  ('latest-shadow-seal W row (ADR-190)', r'未提交的写入|影子中本 Goal 最近的 seal|该分支记为 W', 'ADR-191'),
  ('M2 RPC session-change detection details', r'session_tree|会话改变同样|selfcheck[^|。]{0,30}带上', 'ADR-191'),
  # round 65 (R65-D13-02 / R65-D13-03, ADR-193): seal signing (S′, signature-stripping identity, re-signing) and the
  # revert draft branch are deferred to M2 — mentions must sit next to an M2 marker (DEL_OK)
  ('seal signing in the user repo (M2)', r'S′|gpgsig|去掉签名头|commit-tree -S|重新签名', 'ADR-193'),
  ('revert draft branch in M1 (M2)', r'revert-<goalId>|revert 草案|revert 提交草案|撤销草案', 'ADR-193'),
  # round 74 (R74-D11-01, ADR-202): Pi's project trust is always false in M1 — Tower never sets it true, and project
  # extensions / packages / MCP servers are deferred to M2 — mentions must sit next to an M2 marker (DEL_OK)
  ('Tower sets Pi project trust true (M2)', r'才传 `--approve`|以 `--approve` 启动|resolveProjectTrust → true|resolveProjectTrust: async|`--approve` 或 `--no-approve`|--approve \| --no-approve', 'ADR-202'),
  ('trusted-project extensions loaded in M1 (M2)', r'受信任项目的 `\.pi|受信任项目的扩展', 'ADR-202'),
  # round 75 (R75-D11-01 / R75 §3.1, ADR-203): the context-file name set is defined once (16 §16.1.12 “上下文文件名”);
  # incomplete hand-written lists of Pi's candidates may appear only as history
  ('incomplete context-file name list', r'`AGENTS\.md`/`AGENTS\.override\.md`/`CLAUDE\.md`|`AGENTS\.override\.md` → `AGENTS\.md` → `CLAUDE\.md`|`\*\*/AGENTS\.md`、`\*\*/AGENTS\.override\.md`', 'ADR-203'),
  # round 76 (R76-D11-01 / R76 §3.1, ADR-204): every protected-name matcher uses the 16 §16.1.12 comparison rule; a
  # case-sensitive git pathspec on the protected `.pi` / `.agents` names, or a bare `AGENTS*.md/CLAUDE.md` wildcard used to
  # identify context files (instead of contextFiles()), may appear only as history
  ('case-sensitive protected-name match', r'-- \.pi \.agents|AGENTS\*\.md/CLAUDE\.md|AGENTS\*\.md`/`CLAUDE\.md', 'ADR-204'),
  # round 82 (R82-D11-01/02, ADR-210): the human-checkout prepare command and its button are deferred to M2 — mentions
  # must sit next to an M2 / history marker (DEL_OK); R82-D5-01 (R82 §3.1): the isolated agentDir no longer links the
  # user's credential files (ADR-208), matched file-independently because (D) cannot hold a backticked phrase
  ('human-checkout prepare command (M2)', r'human_checkout\.run_prepare|在验证器沙箱中运行准备步骤', 'ADR-210'),
  ('isolated agentDir links auth.json', r'只链接\s*`?auth\.json', 'ADR-210'),
  # round 84 (R84-D6-01 / R84-D5-02, ADR-212): the separate isolated agentDir is deferred to M2 — every M1 Run uses the
  # user agentDir; mentions of its path or of the skeleton's per-Run switch must sit next to an M2 / history marker (DEL_OK)
  ('isolated agentDir in M1 (M2)', r'~/\.tower/pi-agent|isolatedAgentDir|resources\.isolated|非隔离模式', 'ADR-212'),
  # round 85 (R85-D11-02, ADR-213): high-risk Goals load no extensions in M1; adding confirmed extensions back one by one
  # (a contract revision) is deferred to M2 — mentions must sit next to an M2 / history marker (DEL_OK)
  ('per-item extension add-back for high-risk Goals (M2)', r'逐项加回', 'ADR-213'),
  # round 86 (R86-D11-02 / R86-D5-01, ADR-214): the Supervisor's own 10 s limit on the global-root query is deleted (it
  # runs without its own limit, like Pi, bounded by the preparation limit), and the login-shell PATH is no longer
  # “confirmed by a human” (it is shown in settings with a re-read action) — both may appear only as history
  ('Supervisor global-root query 10 s limit', r'查询限时 10 s|Supervisor 自己的清单查询限时', 'ADR-214'),
  ('human-confirmed login-shell PATH directories', r'经人确认的目录', 'ADR-214'),
  # round 86 follow-up (ADR-214): stdio MCP servers resolve relative/unset `cwd` against the empty ~/.tower/mcp-cwd/,
  # not the home directory (an intermediate draft of this round) — that wording may appear only as history
  ('stdio MCP cwd resolved against home', r'以主目录为基准|相对主目录|resolve\(主目录', 'ADR-214'),
  # round 87 (ADR-215): ~/.tower/mcp-cwd/ is Tower-owned and recreated empty at each Host start — the earlier
  # “Tower never writes or clears it” may appear only as history
  ('mcp-cwd never written or cleared', r'之后从不写入[，、]?不清空|Tower 之后从不写入', 'ADR-215'),
  # round 88 (R88-D11-01, ADR-216): the stdio MCP empty working directory is per Host process
  # (~/.tower/mcp-cwd/<hostId>/), never one machine-wide directory recreated at every Host start — the bare
  # machine-wide path and its “deleted and recreated at each Host start” wording may appear only as history
  ('machine-wide mcp-cwd directory', r'~/\.tower/mcp-cwd/`|每次 Host 启动前(?:删除并重建|清空)|每次 Host 启动之前删除并重建', 'ADR-216'),
  # round 92 (R92-D11-02, ADR-220): Pi's grep / find / ls are no longer Tower built-ins (grep spawns rg outside any
  # `operations`); they may appear only as non-whitelisted names, never as an allowed builtin: source or an activated tool
  ('grep/find/ls as Tower built-ins', r'`builtin:(?:grep|find|ls)`|setActiveTools\(\[[^\]]*"(?:grep|find|ls)"|--tools [a-z_,]*\b(?:grep|find|ls)\b', 'ADR-220'),
  # round 92 (R92-D6-01, ADR-220): a failed write-back never leaves `syncing`, so the hand-back step-6 branch that resumed
  # from T1 on a retried hand_back is gone — it may appear only as history
  ('hand_back step-6 syncing continuation', r'以 T1 为目标对未写完的文件幂等续写|再次 `goal\.hand_back`（检出仍在时）按', 'ADR-220'),
  # round 96 (R96-D12-01, ADR-224): the observer no longer takes Pi's full-output path from the last streaming update
  # (Host pre-merge and back-pressure may drop it); it copies only from the final details of tool_execution_end and the
  # Host's own temp directory guarantees deletion — the streaming-update source may appear only as history
  ('observer path from last streaming update', r'最后一次(?:流式更新|\s*`?tool_execution_update)', 'ADR-224'),
  # round 100 (R100-D13-01, ADR-228): Tower never deletes the human-edit checkout, the inspection directory or a
  # `.kept-*` directory on its own — the move-aside parameter / button, the compare-before-delete of the source directory
  # and the write-set triggers that renamed the copy may appear only as history (DEL_OK)
  ('take_over moveAside / move-aside restart', r'moveAside|移到一边并重新开始', 'ADR-228'),
  ('compare-before-delete of the source directory', r'删除来源目录之前的比较|删除前的比较|删除前比较', 'ADR-228'),
  ('write-set trigger that renames the copy', r'副本将改名保留', 'ADR-228'),
  # round 101 (R101-D15-01, ADR-229): restatements that still had Tower delete the human copy or the inspection directory
  # after hand-back, close, accept or abandon (04 §4.6.7, §4.7 lifecycle column).  These phrases contain 删除 themselves,
  # which DEL_OK would accept as its own history marker, so they are checked in strict mode (DELETED_STRICT): the
  # history marker must be a real one (HIST_D, 撤回, 已删除, Supersedes) outside the match, and a 不 right before 删除
  # (不删除 / 不会被删除 / 从不自动删除) is current text, not a hit
  ('Tower deletes the human copy / inspection directory', r'同步写回并删除|相同时才删除|交还[^。；|]{0,20}(?:后|时)删除[^。；|]{0,12}(?:副本|检出)|关闭检验[^。；|]{0,30}删除(?:检验)?目录|(?:关闭检验|验收)[^。；|]{0,12}(?:后|时)删除(?=[（；，。 |])|(?:验收|放弃|关闭)[^。；|]{0,8}(?:后|时)?清理检验目录', 'ADR-229'),
  # round 107 (R107-D5-01, R107-D13-01/02, ADR-235): the probe never starts a Host of its own (it runs only in an
  # existing idle Host of the packing group), Project reachability replaces the volume-name heuristic, and the
  # automatic Spotlight search for a moved checkout is gone — these may appear only as history (DEL_OK)
  ('short-lived probe Host', r'短时 ?(?:探测 ?)?Host|为探测起(?:的|一个)', 'ADR-235'),
  ('volume-name mount heuristic', r'/Volumes/<卷名>|当前不是已挂载的卷|注明 `卷未挂载`|· 卷未挂载', 'ADR-235'),
  ('automatic checkout discovery', r'mdfind -name \.git|按 `Project\.identity` 在最近打开', 'ADR-235'),
  # round 109 (R109-D12-01, ADR-237): privacy purge completes in one pass and never defers — the deferred continuation for
  # unreachable roots (re-checked every 30 s, finished when reachable, the `all` database deleted only after it) may
  # appear only as history; checked in strict mode (a real history marker outside the match)
  ('deferred purge continuation', r'推迟的根|根之下的删除推迟|可访问时(?:Tower )?续做|数据库在全部完成之后才删除|数据库最后删除', 'ADR-237'),
  # round 111 (R111-D13-01, ADR-239): handback-t1 is written before the write-back starts and is never deleted by time —
  # the abandon-time write and the retention “until the shadow is deleted” (180 days after abandon) may appear only as
  # history; checked in strict mode (a real history marker outside the match)
  ('time-based deletion / abandon-time write of handback-t1', r'handback-t1`?[^。；|]{0,40}(?:保留到影子删除|随影子删除)|放弃时[^。；|]{0,20}先(?:在影子中)?写 ?`?refs/tower/<goalId>/handback-t1', 'ADR-239'),
]
# round 108 (R108 §5 observation 14, ADR-236): the three ADR-235 items are checked in strict mode — in non-strict mode
# a loose history word such as 不再 within the window (common in current text, e.g. “不再发起新的”) exempted a
# re-inserted “为探测起一个短时 Host” in 13 §13.5; strict mode requires a real history marker (HIST, 第 N 轮, 撤回,
# 已删除, Supersedes, 旧的) outside the match
DELETED_STRICT = {'Tower deletes the human copy / inspection directory', 'compare-before-delete of the source directory',
                  'short-lived probe Host', 'volume-name mount heuristic', 'automatic checkout discovery',
                  'deferred purge continuation', 'time-based deletion / abandon-time write of handback-t1'}
DEL_OK = re.compile(r'\bM[23]\b|废弃|取代|撤回|Supersedes|已删除|删除|不再|旧的|旧值|~~|第 \d+ 轮|多算|更正|改为|起不带')
DEL_OK_STRICT = re.compile(HIST.pattern + r'|第 \d+ 轮|撤回|已删除|Supersedes|旧的')
def check_d():
    """(d) names of deleted mechanisms appear only in 15, the 16 deprecation table, or next to a history marker."""
    out = []
    for f in files:
        dn = os.path.basename(f)[:2] if not f.endswith('README.md') else 'RM'
        if dn == '15': continue
        for ln, l in enumerate(open(f, encoding='utf8'), 1):
            if dn == '16' and DEP16[0] and DEP16[0] <= ln <= DEP16[1]:
                # round 35 (R35-D15-01 #5): the deprecation table's "new statement" column states current text — check it without the history exemption
                cells = l.split('|')
                if len(cells) >= 4:
                    for name, rx, adr in DELETED:
                        for m in re.finditer(rx, cells[2]):
                            out.append(('DELETED_IN_NEW_COLUMN', name, adr, dn, ln, cells[2][max(0, m.start() - 50):m.end() + 30].strip()))
                continue
            for name, rx, adr in DELETED:
                for m in re.finditer(rx, l):
                    if name in DELETED_STRICT:
                        if dn == '14' and l.startswith('按子项估算'): continue   # 14 §14.3.4 per-round increment paragraph: history only
                        if re.search(r'不[^，。；|]{0,3}删除', m.group(0)): continue
                        if DEL_OK_STRICT.search(l[max(0, m.start() - 120):m.start()] + ' ' + l[m.end():m.end() + 60]): continue
                    elif DEL_OK.search(l[max(0, m.start() - 120):m.end() + 60]): continue
                    out.append(('DELETED_NAME', name, adr, dn, ln, l[max(0, m.start() - 50):m.end() + 30].strip()))
    return out

def check_n():
    """(n) round 18: every referenced contract test C<n>[(x)] exists as a row in 05 §5.11, with that sub-case letter when given."""
    t05 = doc('05'); rows = {m.group(1): m.group(0) for m in re.finditer(r'^\| (C\d+[a-z]?) \|[^\n]*', t05, re.M)}
    out = []
    for f in files:
        dn = os.path.basename(f)[:2] if not f.endswith('README.md') else 'RM'
        if dn == '15': continue
        for ln, l in enumerate(open(f, encoding='utf8'), 1):
            for m in re.finditer(r'(?:契约测试|`05`[^。|]{0,12}?|见 )\s*(C\d+[a-z]?)((?:\([a-z]\))*)', l):
                cid, subs = m.group(1), re.findall(r'\(([a-z])\)', m.group(2))
                if cid not in rows:
                    if not (cid + 'a') in rows: out.append(('NO_TEST', dn, ln, cid))   # “C28” may name the C28a/C28b group
                    continue
                for sc in subs:
                    if f'({sc})' not in rows[cid]: out.append(('NO_SUBCASE', dn, ln, f'{cid}({sc})'))
    return out

def check_k():
    """(k) a command's continuation rewrite target in 03 §3.2.1 is among the targets in its 06 §6.4.3 row."""
    kinds = set(continuation_shapes())
    a, b = section_lines('03', '3.2.1'); t03 = '\n'.join(doc('03').split('\n')[a - 1:b])
    pairs03 = set()
    for m in re.finditer(r'`([a-z_]+)`([^；。|，]{0,40}?)改写为 ?`\{?(?:kind:\\?"?)?([a-z_]+)', t03):
        if m.group(3) in kinds: pairs03.add((m.group(1), m.group(3)))
    a6, b6 = section_lines('06', '6.4.3'); rows06 = [l for l in doc('06').split('\n')[a6 - 1:b6] if l.startswith('| `')]
    map06 = {}
    for r in rows06:
        tg = set()
        for pm in re.finditer(r'改写', r):   # “改写为 `k`” and “显式改写：… → `k`”
            win = r[pm.end():pm.end() + 160]
            tg |= {k for k in re.findall(r'(?:^为?|改写为|→|或)\s*`\{?(?:kind:\\?"?)?([a-z_]+)', win) if k in kinds}   # only targets, not “为 `run` → 不变” sources
        for d in re.findall(r'human\.decision\{(\w+)', r): map06.setdefault(d, set()).update(tg)
    out = []
    for cmd, k in sorted(pairs03):
        if cmd in map06 and k not in map06[cmd]:
            out.append(('REWRITE_TARGET_MISMATCH', cmd, f'03 §3.2.1 → {k}', f'06 §6.4.3 → {sorted(map06[cmd]) or "none"}'))
    # round 17 (R17-D15-01 #1): reverse direction — every rewrite in a 06 row must appear in 03 §3.2.1 for that decision
    for cmd, ks in sorted(map06.items()):
        for k in sorted(ks):
            if (cmd, k) in pairs03: continue
            if re.search(r'`' + re.escape(cmd) + r'`[^。|]{0,200}?' + re.escape(k), t03): continue
            out.append(('REWRITE_MISSING_IN_03', cmd, f'06 §6.4.3 → {k}', '03 §3.2.1 does not state it'))
    # round 17 (R17-D15-01 #8): the DDL comment on goals.continuation lists every 02 kind
    ddl = next((l for l in doc('06').split('\n') if re.match(r'\s+continuation TEXT', l)), '')
    for k in sorted(kinds):
        if ddl and f"'{k}'" not in ddl and f'"{k}"' not in ddl and f'{k}' not in ddl.split('--')[-1]:
            out.append(('DDL_COMMENT_MISSING_KIND', k, '06 goals.continuation comment', ''))
    return out


# ---------------------------------------------------------------------------
# Round-18 extensions (s′) (e)
# ---------------------------------------------------------------------------
SP_CK = re.compile(r'检查点|checkpoint|Checkpoint|captureCheckpoint')
SP_RU = re.compile(r'hunk|ReviewUnit|评审单元|路径|mixedPaths|externalPaths|标为|标注')
def check_s2():
    """(s′) enum values referenced in rule text / pseudo-code belong to the registered value set."""
    rows = {r[0]: r for r in check_s_rows()}
    ck_author = set(rows['Checkpoint.author'][2]); pr = set(rows['PauseReason'][2])
    nyk = set(rows['NeedsYouItem.kind'][2]); hdk = set(rows['HumanDecision.kind'][2])
    cont = set(continuation_shapes().keys())
    m = re.search(r'author: ("[a-z_]+"(?: \| "[a-z_]+")*) \}\[\];', doc('02'))     # ReviewUnit hunk author (02 §2.8)
    ru_author = set(re.findall(r'"([a-z_]+)"', m.group(1))) if m else {'agent', 'human', 'external', 'mixed'}
    other_author = {'worker', 'reviewer'}                                           # Claim.author (02 §2.7)
    PATS = [
      ('Checkpoint.author', r'author\s*(?:===|==|!==|:|=)\s*["\']([a-z_]+)["\']'),
      ('PauseReason', r'paused\(\s*`?([a-z_0-9]+)|pauseReason\s*(?:===|==|!==|:|=)\s*["\']([a-z_0-9]+)|pause_reason\s*(?:=|IN \()\s*\'([a-z_0-9]+)'),
      ('Continuation.kind', r'continuation(?:\.kind)?\s*(?:===|==|!==|:|=)\s*\{?\s*(?:kind:\s*)?"([a-z_]+)"|继续目标(?:为|改写为|改为)\s*`([a-z_]+)`'),
      ('HumanDecision.kind', r'human\.decision\{([a-z_0-9]+)|HumanDecision\{kind:\s*"([a-z_0-9]+)"|HumanDecision\{([a-z_0-9]+)\}'),
      ('NeedsYouItem.kind', r'(?:Needs-You|NeedsYou|needs_you)[^。|]{0,40}?(?<!HumanDecision\{)kind\s*(?:===|==|:|=)\s*["\']([a-z_]+)["\']|Needs-You（kind `([a-z_]+)`'),
    ]
    PLACEHOLDER = {'reason', 'reasons', 'x', 'r'}
    out = []
    for f in files:
        dn = os.path.basename(f)[:2] if not f.endswith('README.md') else 'RM'
        if dn == '15': continue
        for ln, l in enumerate(open(f, encoding='utf8'), 1):
            if dn == '16' and DEP16[0] and DEP16[0] <= ln <= DEP16[1]: continue
            for name, rx in PATS:
                for mm in re.finditer(rx, l):
                    v = next(x for x in mm.groups() if x)
                    w = l[max(0, mm.start() - 60):mm.end() + 60]
                    if name == 'Checkpoint.author':
                        if v in ck_author or v in other_author: continue
                        if SP_RU.search(w) and v in ru_author and not re.search(r'检查点的 ?`?author|Checkpoint\.author|cp\.author', w): continue
                        if not SP_CK.search(w) and v in ru_author: continue      # not a checkpoint context
                        ok = False
                    elif name == 'PauseReason': ok = v in pr or v in PLACEHOLDER
                    elif name == 'Continuation.kind': ok = v in cont
                    elif name == 'HumanDecision.kind': ok = v in hdk
                    else:
                        if 'HumanDecision{' in l[max(0, mm.start() - 20):mm.end()]: continue
                        ok = v in nyk
                    if not ok: out.append(('ENUM_VALUE', name, dn, ln, v, w.strip()))
    return out

def check_e():
    """(e) an ADR superseded or amended by a later ADR carries a back-marker in its title."""
    t = doc('15')
    heads = [(m.start(), int(m.group(1)), m.group(0)) for m in re.finditer(r'^## ADR-(\d+)[^\n]*', t, re.M)]
    title = {n: h for _, n, h in heads}
    pairs = set()
    for i, (pos, k, h) in enumerate(heads):
        end = heads[i + 1][0] if i + 1 < len(heads) else len(t)
        for m in re.finditer(r'(Supersedes|Amends)\s+([^；）;)\n。]*)', t[pos:end]):
            for a in re.finditer(r'ADR-(\d+)((?:/\d+)*)', m.group(2)):
                for n in [int(a.group(1))] + [int(x) for x in a.group(2).split('/') if x]:
                    if n < k: pairs.add((n, k, m.group(1)))
    out = []
    for n, k, kind in sorted(pairs):
        h = title.get(n, '')
        mm = re.search(r'Amended|Superseded|取代|被 ADR', h)
        tail = h[mm.start():] if mm else ''
        hit = re.search(rf'ADR-0*{k}(?!\d)', tail) or any(int(a) <= k <= int(b) for a, b in re.findall(r'ADR-(\d+)[–-](?:ADR-)?(\d+)', tail))
        if not hit: out.append(('NO_BACK_MARKER', f'ADR-{n:03d}', f'{kind} by ADR-{k:03d}', h[:90]))
    return out, len(pairs)


# ---------------------------------------------------------------------------
# Round-19 extensions (r′) (q)
# ---------------------------------------------------------------------------
def sec_of(dn, ln):
    """numbered section that contains line ln of doc dn."""
    cur = None
    for i, l in enumerate(doc(dn).split('\n'), 1):
        if i > ln: break
        m = re.match(r'^#+\s+(\d+(?:\.\d+)*)\s', l)
        if m: cur = m.group(1)
    return cur

def in_sec(dn, ln, sec):
    s = sec_of(dn, ln)
    return bool(s) and (s == sec or s.startswith(sec + '.'))

CLAIM = re.compile(r'`(\d\d)` §(\d+(?:\.\d+)*)')
CLAIM_KW = re.compile(r'一致|唯一定义|只引用|为准')
def clause(l, pos):
    a = max(l.rfind(c, 0, pos) for c in '。；|')
    bs = [l.find(c, pos) for c in '。；|']; b = min([x for x in bs if x >= 0] or [len(l)])
    return l[a + 1:b]

def facts(txt, enums):
    nums = set(re.findall(r'(\d+(?:\.\d+)?)\s*(?:s|ms|min|MB|GB|KB|%|次|个|条|周|天|行)(?![a-z])', txt))
    gran = set(re.findall(r'每(?:个)?\s?([A-Za-z]+|[一-鿿]{1,4}?)\s?一个', txt))
    ev = {t for t in re.findall(r'`([a-z_0-9]+)`', txt) if t in enums}
    return {'数字': nums, '粒度': gran, '枚举值': ev}

def check_r2():
    """(r′) two places that claim to agree with each other (一致 / 唯一定义 / 只引用) must not differ
    in numbers, “每 X 一个” granularity, or registered enum values within the claiming clauses."""
    enums = set()
    for r in check_s_rows():
        for col in (r[2], r[4], r[6]):
            if col: enums |= set(col)
    claims = []   # (dn, ln, target_dn, target_sec, clause)
    for f in files[:-1]:
        dn = os.path.basename(f)[:2]
        if dn == '15': continue
        for ln, l in enumerate(open(f, encoding='utf8'), 1):
            if dn == '16' and DEP16[0] and DEP16[0] <= ln <= DEP16[1]: continue     # deprecation table quotes old wording
            for m in CLAIM.finditer(l):
                if m.group(1) == dn: continue
                c = clause(l, m.start())
                if CLAIM_KW.search(c): claims.append((dn, ln, m.group(1), m.group(2), c))
    out, seen = [], set()
    for a in claims:
        for b in claims:
            if a[2] != b[0] or b[2] != a[0]: continue
            if not in_sec(b[0], b[1], a[3]) or not in_sec(a[0], a[1], b[3]): continue
            key = tuple(sorted([(a[0], a[1]), (b[0], b[1])]))
            if key in seen: continue
            seen.add(key)
            topic = lambda c: {w for w in re.findall(r'[A-Za-z_][A-Za-z_0-9.]{2,}', re.sub(r'`\d\d` §[\d.]+', '', c)) if not w.startswith('ADR')}
            if not (topic(a[4]) & topic(b[4])): continue                 # different subjects that merely cite each other
            fa, fb = facts(a[4], enums), facts(b[4], enums)
            for cat in fa:
                if fa[cat] and fb[cat] and fa[cat] != fb[cat]:
                    out.append(('MUTUAL_CLAIM_DIFFERS', f'{a[0]}:{a[1]} ↔ {b[0]}:{b[1]}', cat,
                                f'{sorted(fa[cat])} vs {sorted(fb[cat])}'))
    return out, len(seen)

QUOTE_MARK = re.compile(r'逐字引用|逐字一致|word for word')
def balanced_quote(l, start):
    i = l.find('“', start)
    if i < 0: return None
    depth = 0
    for j in range(i, len(l)):
        if l[j] == '“': depth += 1
        elif l[j] == '”':
            depth -= 1
            if depth == 0: return l[i + 1:j]
    return None

def norm(t):
    t = re.sub(r'\*\*|`|“|”|"|\s', '', t)
    return t.replace('（', '(').replace('）', ')').replace('：', ':')

def check_q():
    """(q) text marked 逐字引用 / 逐字一致 must match the quoted paragraph after normalising markdown."""
    out = []
    for f in files[:-1]:
        dn = os.path.basename(f)[:2]
        if dn == '15': continue
        L = open(f, encoding='utf8').read().split('\n')
        for ln, l in enumerate(L, 1):
            for m in QUOTE_MARK.finditer(l):
                ref = CLAIM.search(l[max(0, m.start() - 80):m.end()])
                if not ref: out.append(('NO_TARGET', dn, ln, l[max(0, m.start() - 60):m.end()].strip())); continue
                tdn, tsec = ref.group(1), ref.group(2)
                lab = re.findall(r'\*\*([^*]+)\*\*', l[:m.start()])
                label = lab[-1] if lab else None
                quoted = balanced_quote(l, m.end())
                a, b = section_lines(tdn, tsec)
                T = doc(tdn).split('\n')[a - 1:b] if a else []
                if quoted is not None and label:
                    src = next((x for x in T if f'**{label}**' in x), None)
                    if src is None: out.append(('TARGET_LABEL_MISSING', dn, ln, f'{label} not in {tdn} §{tsec}')); continue
                    body = src.split(f'**{label}**', 1)[1]
                    body = body[body.find('：') + 1:] if '：' in body[:80] else body
                    body = body.lstrip('- ').strip()
                    if norm(body) != norm(quoted):
                        nq, nb = norm(quoted), norm(body); k = next((i for i in range(min(len(nq), len(nb))) if nq[i] != nb[i]), min(len(nq), len(nb)))
                        out.append(('QUOTE_DIFFERS', dn, ln, f'vs {tdn} §{tsec} “{label}”', f'…{nq[max(0, k - 20):k + 30]} ≠ …{nb[max(0, k - 20):k + 30]}'))
                else:
                    out.append(('UNVERIFIABLE_VERBATIM_CLAIM', dn, ln, f'claims verbatim with {tdn} §{tsec} but has no quoted text', l[max(0, m.start() - 60):m.end()].strip()))
    return out

# ---------------------------------------------------------------------------
# Round-53 extensions (p) sanitized-copy rows, (o) 16 §16.1 object shapes vs 02  (R52 §3.1, ADR-179)
# ---------------------------------------------------------------------------
P_TRIGGER = re.compile(r'净化|副本方案')
P_CONFIG = re.compile(r'配置|~/|用户|rc\b|\.toml|\.ya?ml|\.conf|env\b')
P_RULE5 = re.compile(r'规则 5')

def _cell_is_copy(cell):
    """a cell describes a (sanitized) copy of user configuration: 净化 / 副本方案 anywhere, or 副本 with a
    user-config cue (配置, ~/, 用户, …rc, .toml, .yml, .conf, env) in the 40 chars before it within the same cell;
    cache copies (“CoW 私有副本”, “可写副本”) do not trigger."""
    if P_TRIGGER.search(cell): return True
    return any(P_CONFIG.search(cell[max(0, m.start() - 40):m.start()]) and not re.search(r'可写|私有|CoW', cell[max(0, m.start() - 6):m.start()])
               for m in re.finditer(r'副本', cell))

def _cell_ok(cell):
    # round 55 (R54 §5, ADR-182): rule 5 itself requires every copy column to cite “规则 5”; the former
    # 白名单 + 凭据判定 keyword alternative let rows pass without the citation (gitconfig, Rust, uv, pip).
    return bool(P_RULE5.search(cell))

def _tables_168():
    """yield (line_no, header_cells, cells) for every data row of every table in 16 §16.8 (tolerant: rows whose
    cell count differs from the header are yielded with header=None)."""
    L = doc('16').split('\n')
    a = next((i for i, l in enumerate(L) if l.startswith('## 16.8')), None)
    if a is None: return
    b = next((i for i in range(a + 1, len(L)) if re.match(r'^## ', L[i])), len(L))
    header = None
    for i in range(a, b):
        l = L[i]
        if not l.startswith('| '): header = None if not l.startswith('|') else header; continue
        if l.startswith('|---'): continue
        cells = [c.strip() for c in re.split(r'(?<!\\)\|', l.strip())[1:-1]]
        if i + 1 < len(L) and L[i + 1].startswith('|---'): header = cells; continue
        yield i + 1, (header if header and len(header) == len(cells) else None), cells

def check_p():
    """(p) round 53, made per-cell in round 54 (ADR-180, R53-D11-02): every cell of a 16 §16.8 table row that
    describes a copy / sanitized copy of user configuration must itself name both 白名单 and 凭据判定, or cite
    规则 5 (16 §16.8 rule 5) — a row can no longer pass on another column's keywords.  The first cell (the
    row name) is checked together with the row's remaining cells only when no other cell triggers."""
    out, ncells = [], 0
    rows = list(_tables_168())
    if not rows: return [('UNPARSABLE', '16 §16.8', 'section or tables not found')], 0
    for ln, header, cells in rows:
        if len(cells) < 2: out.append(('UNPARSABLE', f'16:{ln}', ' | '.join(cells)[:60])); continue
        for k, c in enumerate(cells[1:], 1):
            if not _cell_is_copy(c): continue
            ncells += 1
            if not _cell_ok(c):
                col = header[k] if header else f'col{k + 1}'
                out.append(('COPY_CELL_MISSING', f'16:{ln}', cells[0][:40], col[:20],
                            '/'.join(x for x in ('白名单', '凭据判定') if x not in c) + ' (or 规则 5)'))
    return out, ncells

ROLE_COL = re.compile(r'^(A|I|V)（|^环境变量（A）$|^用户配置继承|^V/I')
def check_P():
    """(P = p′) round 54 (R53 §3.1, ADR-180): in the 16 §16.8 tables, each role column (A / I / V, recognised by
    its header) is checked on its own: a role cell that mentions any copy (副本 / 净化; cache copies preceded by
    可写 / 私有 / CoW excepted — no config cue is required, unlike (p)) must
    cite 规则 5, or name both 白名单 and 凭据判定, or say 同 A 列 / 同 V 列 / 与 V 列同一份 where that column's cell in
    the same row itself passes.  Tables whose header has no role column are skipped; rows that cannot be aligned
    with their header are UNPARSABLE."""
    out, ncells, unp = [], 0, 0
    for ln, header, cells in _tables_168():
        if header is None:
            if len(cells) >= 2: out.append(('UNPARSABLE', f'16:{ln}', 'cells do not align with header')); unp += 1
            continue
        roles = {k: h for k, h in enumerate(header) if ROLE_COL.search(h)}
        if not roles: continue
        byrole = {h[0]: cells[k] for k, h in roles.items() if h[:1] in 'AIV'}
        for k, h in roles.items():
            c = cells[k]
            if not (re.search(r'净化', c) or any(not re.search(r'可写|私有|CoW', c[max(0, m.start() - 6):m.start()])
                                                for m in re.finditer(r'副本', c))): continue   # any non-cache copy in a role cell
            ncells += 1
            if _cell_ok(c): continue
            ref = re.search(r'同 ([AV]) 列|与 ([AV]) 列同一份', c)
            if ref:
                r = ref.group(1) or ref.group(2)
                if r in byrole and _cell_ok(byrole[r]): continue
            out.append(('ROLE_COPY_MISSING', f'16:{ln}', cells[0][:40], h[:12], 'cite 规则 5 or 白名单 + 凭据判定'))
    return out, ncells

# ---------------------------------------------------------------------------
# Round-55 extension (g) glyph use  (R54 §3.1, ADR-182)
# ---------------------------------------------------------------------------
G_NEG = re.compile(r'(不用|不带|不加|不画|不是|不显示|不使用|而非|事实字形|没有)[^。；|]{0,12}$')
G_RULES = (('✓', re.compile(r'队列|授权')), ('■', re.compile(r'审批|机密|来源不可信|可疑指令|文件名')))   # round 56 (R55 §3.1, ADR-183): ■ is not a classification
G_OK = re.compile(r'拒绝')   # `■ 已拒绝` is the registered rejection fact event (12 §12.6.3); 本文初版 = 12 history table
def check_g():
    """(g) round 55 (R54 §3.1, ADR-182): glyph use in 04 and 12.  `✓` is only the verified-fact glyph and `■` only
    the danger sentinel / rejection fact (12 §12.6.2).  An occurrence of `✓` with 队列 (the review queue uses ◦/•) or
    授权 (a human grant uses the 你 · 时间 stamp) within 20 chars, or of `■` with 审批 (an approval waits for you and is
    amber ◆) within 20 chars, is reported unless it is negated (不用 / 不带 / 不加 / 不是 … within 14 chars before it),
    is a bare `| ✓ |` table cell (scope tables), sits next to 拒绝 (`■ 已拒绝`) or 本文初版, or the line carries a
    history marker (HIST / 第 N 轮)."""
    out, n = [], 0
    for dn in ('04', '12'):
        for ln, l in enumerate(doc(dn).split('\n'), 1):
            for g, kw in G_RULES:
                if g not in l or not kw.search(l): continue
                n += 1
                if HIST_D.search(l) or '本文初版' in l: continue
                bad = []
                for m in re.finditer(re.escape(g), l):
                    a, b = max(0, m.start() - 20), m.end() + 20
                    if not kw.search(l[a:b]) or G_OK.search(l[a:b]): continue          # keyword must be near the glyph
                    if re.fullmatch(r'\|\s*' + re.escape(g) + r'\s*\|', l[max(0, m.start() - 2):m.end() + 2]): continue   # bare ✓ table cell = “in scope”
                    if G_NEG.search(re.sub(r'[`*]', '', l[max(0, m.start() - 14):m.start()])): continue
                    bad.append(m.start())
                if bad: out.append(('GLYPH_MISUSE', f'{dn}:{ln}', g, l[max(0, bad[0] - 30):bad[0] + 30].strip()))
    return out, n

# ---------------------------------------------------------------------------
# Round-54 extensions (i) event-index coverage, (D) superseded phrases  (R53 §3.1, ADR-180)
# ---------------------------------------------------------------------------
EVT = re.compile(r'\b([a-z][a-z_]*(?:\.[a-z_]+)*\.(?:[a-z_]+|\*)(?:/[a-z_]+)*)')
def _event_names(text):
    """event type names in a text fragment: dotted lowercase names, payloads {…} removed, slash alternatives
    expanded (satellite.created/prepared → satellite.created, satellite.prepared)."""
    text = re.sub(r'\{[^{}]*\}', '', text)
    names = set()
    for m in EVT.finditer(text):
        tok = m.group(1)
        if re.search(r'\.(md|ts|json|yaml|yml|cjs|js|toml|db|jsonl|sh)$', tok): continue
        head, _, tail = tok.rpartition('.')
        alts = tail.split('/')
        for a in alts: names.add(f'{head}.{a}')
    return names

def _index_names():
    L = doc('16').split('\n')
    a, b = section_lines('16', '16.1.14')
    if not a: return None
    names = set()
    for l in L[a - 1:b]:
        if not l.startswith('| ') or l.startswith('|---') or l.startswith('| `tower`') or l.startswith('| 前缀'): continue
        cells = [c.strip() for c in l.strip().strip('|').split(' | ')]
        if len(cells) < 2: continue
        for t in re.findall(r'`([^`]+)`', cells[1]): names |= _event_names(t)
    return names

def _covered(n, idx):
    if n in idx: return True
    pre = n[:-2] if n.endswith('.*') else None
    for x in idx:
        if x.endswith('.*') and n.startswith(x[:-1]): return True
        if x.endswith('_*') and n.startswith(x[:-1]): return True
        if pre and x.startswith(pre + '.'): return True
    return False

def check_i():
    """(i) round 54 (R53 §3.1, ADR-180): every event type named in a document's own event table — a table under a
    heading containing 本文产生的事件 / 本文新增的事件类型, or the 06 SQL comment block that starts with
    “-- 本文新增的事件类型” — appears in the 16 §16.1.14 index (wildcards `x.*` / `x_*` on either side match).
    Names next to a deletion marker (删除 / 撤回 / 已随) and Fact kinds (no dot) are skipped; rows/blocks that
    yield no names are counted as UNPARSABLE."""
    idx = _index_names()
    if not idx: return [('UNPARSABLE', '16 §16.1.14', 'index not found')], 0, 0
    out, seen, unp = [], 0, 0
    for f in files[:-1]:
        dn = os.path.basename(f)[:2]
        if dn in ('15', '16'): continue
        L = open(f, encoding='utf8').read().split('\n')
        i = 0
        while i < len(L):
            l = L[i]
            srcs = []
            if re.match(r'^#+ .*(本文产生的事件|本文新增的事件类型)', l):
                j = i + 1
                while j < len(L) and not L[j].startswith('|'): j += 1
                while j < len(L) and L[j].startswith('|'):
                    if not L[j].startswith('|---') and not (j + 1 < len(L) and L[j + 1].startswith('|---')):
                        srcs.append((j + 1, L[j].strip().strip('|').split(' | ')[0]))
                    j += 1
                i = j; 
            elif l.lstrip().startswith('-- 本文新增的事件类型'):
                j = i
                while j < len(L) and (j == i or L[j].lstrip().startswith('--   ')):
                    srcs.append((j + 1, L[j])); j += 1
                i = j
            else:
                i += 1; continue
            for ln, text in srcs:
                text = re.sub(r'[^；;。]*(已随|已删除|删除|撤回)[^；;。]*', '', text)
                text = re.sub(r'（原 [^）]*）|原 `[^`]*`', '', text)          # history aliases such as “原 `worktree.*`”
                if text.lstrip().startswith('--'):                        # SQL comment: only names that carry a payload {…}
                    text = ' '.join(m.group(1) for m in re.finditer(r'\b([a-z][a-z_]*(?:\.[a-z_]+)+)\{', text))
                names = {n for n in _event_names(text) if not n.startswith('tower.')}   # tower.* is not an event type (16 §16.1.14)
                if not names:
                    if re.search(r'`[a-z_]+\.[a-z_]', text): unp += 1; out.append(('UNPARSABLE', f'{dn}:{ln}', text[:60]))
                    continue
                for n in sorted(names):
                    seen += 1
                    if not _covered(n, idx): out.append(('NOT_IN_INDEX', f'{dn}:{ln}', n))
    return out, seen, unp

def check_i2():
    """(i′) round 85 (R85 §3.1 second suggestion, ADR-213): an event in the 16 §16.1.14 index whose payload is written as
    “载荷即 … 全部列” (the whole projected row) can carry unbounded arrays, so the same index row must state how the
    13 §13.9.1 payload cap (16 KB) is handled — it must mention “16 KB” and cite `13` §13.9.1.  Rows that say 载荷即 but
    name no event are UNPARSABLE."""
    a, b = section_lines('16', '16.1.14')
    if not a: return [('UNPARSABLE', '16 §16.1.14', 'section not found')], 0
    L = doc('16').split('\n')[a - 1:b]; out, n, full = [], 0, set()
    for k, l in enumerate(L):
        if not l.startswith('|') or '载荷即' not in l: continue
        names = re.findall(r'`([a-z_]+\.[a-z_.]+)\{[^`]*载荷即|([a-z_]+\.[a-z_]+)\{[^}]*\}（唯一定义[^）]*载荷即', l)
        ev = [x or y for x, y in names]
        if not ev:
            m = re.search(r'`([a-z_]+\.[a-z_]+)\{[^`]*`（[^（）]*?载荷即', l)
            ev = [m.group(1)] if m else []
        if not ev: out.append(('UNPARSABLE', f'16:{a + k}', l[:60])); continue
        n += len(ev); full |= set(ev)
        if '16 KB' not in l or '`13` §13.9.1' not in l:
            for e in ev: out.append(('PAYLOAD_CAP_UNHANDLED', f'16:{a + k}', e))
    # round 86 (R86-D6-02 / R86 §3.1, ADR-214): the content-hash rule for path lists is one rule for every event
    # (single definition: the 06 §6.3 “载荷中的路径集合” note, whose “适用的事件” list is the whole set).  Every
    # event signature `x.y{…}` written anywhere in 00–14/16 whose field list has a path-array field (`paths`, `*Paths`,
    # `changed`, `skipped`) must be in that list; every listed event must be in the 16 §16.1.14 index, and the index
    # row naming it must mention “16 KB” and cite `06` §6.3.
    idx = '\n'.join(L); idx_names = set(re.findall(r'`([a-z_]+(?:\.[a-z_]+)+)', idx))
    rule = next((x for x in doc('06').split('\n') if '**载荷中的路径集合**（唯一定义' in x), None)
    if not rule or '适用的事件' not in rule: return out + [('UNPARSABLE', '06 §6.3', '“载荷中的路径集合” rule or its event list not found')], n
    listed = set(re.findall(r'`([a-z_]+(?:\.[a-z_]+)+)`', rule.split('适用的事件', 1)[1]))
    is_path = lambda f: f == 'paths' or f.endswith('Paths') or f in ('changed', 'skipped')
    seen = set()
    for fn in sorted(glob.glob(f'{D}/[01][0-46]-*.md')):
        dn = os.path.basename(fn)[:2]
        for m in re.finditer(r'([a-z_]+(?:\.[a-z_]+)+)\s?\{([^{}\n]*)\}', open(fn, encoding='utf8').read()):
            name = m.group(1)
            if name not in idx_names: continue
            fields = [re.match(r'\s*([A-Za-z_]*)', f).group(1) for f in m.group(2).split(',')]
            if not any(is_path(f) for f in fields): continue
            seen.add(name)
            if name not in listed: out.append(('PATH_PAYLOAD_UNLISTED', f'{dn}', name))
    for e in sorted(listed):
        if e not in idx_names: out.append(('PATH_PAYLOAD_NOT_IN_INDEX', '06 §6.3', e)); continue
        rows = [x for x in L if x.startswith('|') and f'`{e}' in x]
        if not any('16 KB' in x and '`06` §6.3' in x for x in rows): out.append(('PAYLOAD_CAP_UNHANDLED', '16 §16.1.14', e))
    return out, len(full | seen | listed)

D_KEEP = {'宽限确认失败', '撤销外部改动', '就地修一下'}   # quoted only as the name of a still-current event/command/feature, not as a claim
HIST_D = re.compile(HIST.pattern + r'|第 \d+ 轮')
def _cjk(s): return sum(1 for c in s if '一' <= c <= '鿿')
def check_D():
    """(D = d′) round 54 (R53 §3.1, ADR-180): superseded wording in 16 §16.1.13.  Key phrases are the “…”-quoted
    phrases of the left (superseded) column that (a) do not occur in the row's new-statement column, (b) contain
    no backticks and at least 5 CJK ideographs (shorter quotes are terms, covered by (d)), and (c) are not in
    D_KEEP.  Each phrase is searched (markdown stripped) in 00–14, 16 and README outside §16.1.13; a hit is
    exempt when a history marker (HIST, or “第 N 轮”) precedes it within 60 chars.  Rows whose cells cannot be split are
    UNPARSABLE."""
    L = doc('16').split('\n')
    a, b = DEP16
    if not a: return [('UNPARSABLE', '16 §16.1.13', 'section not found')], 0
    phrases, out = [], []
    for i in range(a - 1, b):
        l = L[i]
        if not l.startswith('| ') or l.startswith('|---') or (i + 1 < len(L) and L[i + 1].startswith('|---')): continue
        cells = l.strip().strip('|').split(' | ')
        if len(cells) < 2: out.append(('UNPARSABLE', f'16:{i + 1}', l[:60])); continue
        newcol = re.sub(r'[`*]', '', cells[1])
        for m in re.finditer(r'“([^”]{2,80})”', cells[0]):
            p = m.group(1)
            if '`' in p or _cjk(p) < 5 or p in D_KEEP: continue
            plain = re.sub(r'[*]', '', p)
            if plain in newcol: continue
            phrases.append((i + 1, plain))
    for f in files:
        dn = os.path.basename(f)[:2] if not f.endswith('README.md') else 'RM'
        if dn == '15': continue
        for ln, l in enumerate(open(f, encoding='utf8'), 1):
            if dn == '16' and a <= ln <= b: continue
            ll = re.sub(r'[`*]', '', l)
            for src, p in phrases:
                k = ll.find(p)
                if k >= 0 and not HIST_D.search(ll[max(0, k - 60):k]):
                    out.append(('SUPERSEDED_PHRASE', f'{dn}:{ln}', p, f'16:{src}'))
    return out, len(phrases)

def _strip_ts_comments(s):
    return '\n'.join(re.sub(r'//.*$', '', x) for x in s.split('\n'))

def _match_brace(s, i):
    """index of the bracket closing s[i] ('{' or '(' or '['), or -1."""
    pairs = {'{': '}', '(': ')', '[': ']'}; stack = []
    for j in range(i, len(s)):
        ch = s[j]
        if ch in pairs: stack.append(pairs[ch])
        elif ch in ')}]':
            if not stack or stack.pop() != ch: return -1
            if not stack: return j
    return -1

def _top_level_segments(body, seps=';,\n'):
    segs, cur, depth, prev = [], [], 0, ''
    for ch in body:
        if ch in '{([<': depth += 1
        elif ch in '})]' or (ch == '>' and prev != '='): depth -= 1
        prev = ch
        if depth == 0 and ch in seps:
            segs.append(''.join(cur)); cur = []
        else: cur.append(ch)
    segs.append(''.join(cur))
    return [x.strip() for x in segs if x.strip()]

TS02 = None
def ts_type(name):
    """02 type expression text for `name` (interface body as '{…}', or a type alias right-hand side)."""
    global TS02
    if TS02 is None: TS02 = _strip_ts_comments(doc('02'))
    m = re.search(r'\binterface\s+' + re.escape(name) + r'\b[^{\n]*\{', TS02)
    if m:
        j = _match_brace(TS02, m.end() - 1)
        return TS02[m.end() - 1:j + 1] if j > 0 else None
    m = re.search(r'\btype\s+' + re.escape(name) + r'\s*=', TS02)
    if m:
        k, depth = m.end(), 0
        while k < len(TS02):
            ch = TS02[k]
            if ch in '{([': depth += 1
            elif ch in '})]': depth -= 1
            elif ch == ';' and depth == 0: break
            k += 1
        return TS02[m.end():k].strip()
    return None

def ts_object_keys(expr, seen=()):
    """{key: type-expr} of an object type expression; 'UNION' for unions of shapes; None if not resolvable."""
    if expr is None: return None
    e = expr.strip()
    e = re.sub(r'\s*\|\s*null\s*$', '', e)
    while e.endswith('[]'): e = e[:-2].strip()
    if e.startswith('(') and _match_brace(e, 0) == len(e) - 1: e = e[1:-1].strip()
    if e.startswith('{'):
        j = _match_brace(e, 0)
        if j < 0: return None
        if e[j + 1:].strip().startswith('|'): return 'UNION'
        keys = {}
        for seg in _top_level_segments(e[1:j]):
            mm = re.match(r'(\w+)\??\s*:\s*(.*)$', seg, re.S)
            if mm: keys[mm.group(1)] = mm.group(2)
        return keys
    if re.search(r'^\s*\|?\s*\{', e) or '| {' in e: return 'UNION'
    mm = re.fullmatch(r'([A-Z]\w*)', e)
    if mm and mm.group(1) not in seen: return ts_object_keys(ts_type(mm.group(1)), seen + (mm.group(1),))
    return None

def ts_field(type_name, field):
    body = ts_type(type_name)
    if not body or not body.startswith('{'): return None
    j = _match_brace(body, 0)
    for seg in _top_level_segments(body[1:j]):
        mm = re.match(re.escape(field) + r'\??\s*:\s*(.*)$', seg, re.S)
        if mm: return mm.group(1)
    return None

def shape_keys_16(cell):
    """{key: nested-shape-or-''} of the first object shape in a 16 value cell, plus whether it lists an ellipsis.
    Nested `key?: {…}` shapes are returned as their brace text so that (o) can compare them one level down."""
    s = cell.replace('\\|', '|').replace('`', '')
    i = s.find('{')
    if i < 0: return None, False
    j = _match_brace(s, i)
    if j < 0: return None, False
    return _shape_dict(s[i + 1:j])

def _shape_dict(inner):
    keys, ell = {}, False
    for seg in _top_level_segments(inner, seps=','):
        if seg in ('…', '...'): ell = True; continue
        mm = re.match(r'(\w+)\??\s*(?::\s*(.*))?$', seg, re.S)
        if not mm: return None, False
        rest = (mm.group(2) or '').strip()
        while rest.endswith('[]'): rest = rest[:-2].strip()
        keys[mm.group(1)] = rest if rest.startswith('{') and _match_brace(rest, 0) == len(rest) - 1 else ''
    return keys, ell

def compare_shapes(k16, ell, k02, path, out, ln):
    only16, only02 = sorted(set(k16) - set(k02)), ([] if ell else sorted(set(k02) - set(k16)))
    if only16 or only02:
        out.append(('SHAPE_DIFF', f'16:{ln}', path, f'only in 16 {only16}; only in 02 {only02}'))
    for k, sub in k16.items():                              # one level down where 16 spells out a nested shape
        if not sub or k not in k02: continue
        n02 = ts_object_keys(k02[k])
        if not isinstance(n02, dict): continue
        n16, nell = _shape_dict(sub[1:-1])
        if n16 is None: out.append(('UNPARSABLE', f'16:{ln}', f'{path}.{k}')); continue
        compare_shapes(n16, nell, n02, f'{path}.{k}', out, ln)

def check_o():
    """(o) a 16 §16.1 row whose key names a 02 type (`T` or `T.field`) and whose value cell starts with an
    object shape `{…}` must list exactly the keys of the 02 definition.  Rows in 16 §16.1.13 (deprecated
    wording) are skipped; unions of shapes (checked by (c)) are skipped and counted; unparsable rows are
    reported as UNPARSABLE and do not fail the run."""
    L = doc('16').split('\n')
    a, _ = section_lines('16', '16.1'); b = next(i for i, l in enumerate(L) if l.startswith('## 16.2'))
    out, checked, skipped = [], 0, 0
    for i in range(a, b):
        ln = i + 1; l = L[i]
        if DEP16[0] and DEP16[0] <= ln <= DEP16[1]: continue
        if not l.startswith('| `') or l.startswith('|---'): continue
        cells = l.strip().strip('|').split(' | ')
        if len(cells) < 2: continue
        km = re.match(r'`([A-Z]\w*)(?:\.(\w+))?(?:\[\])?`', cells[0].strip())
        if not km: continue
        tname, field = km.group(1), km.group(2)
        if ts_type(tname) is None: continue                       # not a 02 type (e.g. VerifyProfile lives in 07)
        if not re.match(r'\s*`?\{', cells[1]): continue
        expr = ts_field(tname, field) if field else ts_type(tname)
        k02 = ts_object_keys(expr)
        if k02 == 'UNION': skipped += 1; continue
        k16, ell = shape_keys_16(cells[1])
        if k02 is None or k16 is None:
            out.append(('UNPARSABLE', f'16:{ln}', f'{tname}.{field}' if field else tname)); continue
        checked += 1
        compare_shapes(k16, ell, k02, f'{tname}.{field}' if field else tname, out, ln)
    return out, checked, skipped


# ---------------------------------------------------------------------------
# Round-57 extensions (K = k′) resume exits vs goal.resume, (Y = r‴) one-sided “只引用” claims  (R56 §3.1, ADR-184)
# ---------------------------------------------------------------------------
def check_K():
    """(K = k′) a pause reason whose exit cell in 03 §3.2.1 offers `resume` must be in the closed list of reasons that
    06 §6.4.3 `goal.resume` can clear.  03 rows: table rows of §3.2.1 whose first cell holds backticked reason names;
    an exit offers resume when a cell after the first contains a bare `resume` token, or `goal.resume` not followed
    within 20 chars by E_STATE.  06 list: backticked names between “可由 `resume` 解除的原因” and “条件不满足或其他原因”.
    Either side not found → UNPARSABLE."""
    a, b = section_lines('03', '3.2.1')
    if not a: return [('UNPARSABLE', '03 §3.2.1', 'section not found')], 0
    L = doc('03').split('\n')[a - 1:b]
    reasons = []
    for l in L:
        if not l.startswith('| `'): continue
        cells = l.split(' | ')
        names = re.findall(r'`([a-z0-9_]+)`', cells[0])
        rest = ' | '.join(cells[1:])
        bare = re.search(r'(?<![.\w])`resume`', rest)
        via_cmd = any(not re.search(r'E_STATE', rest[m.end():m.end() + 20]) for m in re.finditer(r'`goal\.resume`', rest))
        if names and (bare or via_cmd): reasons += names
    row = next((l for l in doc('06').split('\n') if l.startswith('| `goal.resume` |')), '')
    m = re.search(r'可由 `resume` 解除的原因(.*?)条件不满足或其他原因', row)
    if not m: return [('UNPARSABLE', '06 §6.4.3 goal.resume', 'closed list not found')], len(reasons)
    allowed = set(re.findall(r'`([a-z0-9_]+)`', m.group(1)))
    out = [('RESUME_EXIT_NOT_IN_GOAL_RESUME', r, '03 §3.2.1 exit offers resume', '06 goal.resume list lacks it')
           for r in sorted(set(reasons)) if r not in allowed]
    return out, len(set(reasons))

ONLY_REF = re.compile(r'只引用(本条|本节|本表)')
def check_Y():
    """(Y = r‴) a one-sided claim “X 只引用本条/本节/本表” names the documents (`NN`) that must not re-enumerate the
    defined set.  The claim is checked only when it introduces a numbered enumeration: the claiming line plus the `//`
    comment lines that directly follow it carry ≥ 3 circled numbers (①②③…) and ≥ 3 snake_case identifiers (containing
    “_”), which are the defined items; prose claims without such an enumeration are skipped (nothing to compare).  In each named document, a line that contains ≥ 2 of those items and does not cite
    the defining document (`DD` §…) or the topic word in front of the claim is reported.  Lines in 15, in 16 §16.1.13
    and lines carrying a history marker (HIST / 第 N 轮) are exempt."""
    out, n = [], 0
    for f in files[:-1]:
        dn = os.path.basename(f)[:2]
        if dn == '15': continue
        L = open(f, encoding='utf8').read().split('\n')
        for i, l in enumerate(L):
            m = ONLY_REF.search(l)
            if not m: continue
            head = l[max(0, m.start() - 160):m.start()]
            targets = {t for t in re.findall(r'\b(0\d|1[0-6])\b', head) if t != dn}
            block = [l] + [x for x in itertools.takewhile(lambda x: x.lstrip().startswith('//'), L[i + 1:i + 12])]
            items = {w for w in re.findall(r'\b([a-z][a-z0-9]*_[a-z0-9_]+)\b', '\n'.join(block))}
            topic = (re.findall(r'([A-Za-z][A-Za-z0-9]{3,})', l[:m.start()]) or [''])[0]
            if len(re.findall(r'[①-⑳]', '\n'.join(block))) < 3 or len(items) < 3 or not targets: continue   # only numbered enumerations (①②③…)
            n += 1
            for t in sorted(targets):
                for ln, x in enumerate(doc(t).split('\n'), 1):
                    if t == '16' and DEP16[0] and DEP16[0] <= ln <= DEP16[1]: continue
                    hits = [w for w in items if re.search(r'\b' + re.escape(w) + r'\b', x)]
                    if len(hits) < 2: continue
                    if re.search(r'`' + dn + r'` §', x) or (topic and topic in x) or HIST_D.search(x): continue   # cites the definition, or a history line
                    out.append(('ONE_SIDED_CLAIM_REENUMERATED', f'{dn}:{i + 1} → {t}:{ln}', topic, ', '.join(sorted(hits))))
    return out, n

# ---------------------------------------------------------------------------
# Round-58 extensions (A) per-process memory budgets 06 vs 13, (T) tool kinds → action classes  (R57 §3.1, ADR-185)
# ---------------------------------------------------------------------------
def _proc_key(name):
    n = name.lower()
    for k, rx in (('main', r'\bmain\b'), ('renderer', r'renderer'), ('gpu', r'\bgpu\b'), ('supervisor', r'supervisor'),
                  ('engine', r'engine host'), ('rpc', r'rpc host'), ('verifier', r'verifier')):
        if re.search(rx, n): return k
    return None

def _table_after(lines, header_rx):
    """rows (list of cell lists) of the first markdown table whose header matches header_rx."""
    for i, l in enumerate(lines):
        if l.startswith('|') and re.search(header_rx, l):
            rows = []
            for x in lines[i + 2:]:
                if not x.startswith('|'): break
                rows.append([c.strip() for c in x.strip().strip('|').split('|')])
            return rows
    return None

def check_A():
    out = []
    a13, b13 = section_lines('13', '13.8.1'); a06, b06 = section_lines('06', '6.1')
    if not a13 or not a06: return [('UNPARSABLE', '13 §13.8.1 / 06 §6.1', 'section not found')], 0
    t13 = _table_after(doc('13').split('\n')[a13 - 1:b13], r'\| *进程 *\| *空闲 *\| *负载时')
    t06 = _table_after(doc('06').split('\n')[a06 - 1:b06], r'\| *进程 *\|.*内存预算')
    if not t13: return [('UNPARSABLE', '13 §13.8.1', 'no “| 进程 | 空闲 | 负载时” table')], 0
    if not t06: return [('UNPARSABLE', '06 §6.1', 'no process table with a 内存预算 column')], 0
    r13 = {_proc_key(r[0]): r for r in t13 if _proc_key(r[0])}
    for r in t06:
        k = _proc_key(r[0]); cell = r[-1]
        if not k or re.search(r'`13` §13\.8\.1', cell): continue
        nums = set(re.findall(r'(\d+)\s*MB', cell))
        if not nums: continue
        if k not in r13: out.append(('BUDGET_NOT_IN_13', r[0], cell)); continue
        have = set(re.findall(r'(\d+)\s*MB', ' '.join(r13[k][1:3])))
        if nums - have: out.append(('BUDGET_MISMATCH_06_13', r[0], f'06 {sorted(nums)} vs 13 {sorted(have)}'))
    idle = {}
    for k in ('main', 'renderer', 'gpu', 'supervisor'):
        m = re.search(r'≤\s*(\d+)\s*MB', r13[k][1]) if k in r13 else None
        if not m: out.append(('UNPARSABLE', f'13 §13.8.1 {k}', 'idle cell without “≤ N MB”')); continue
        idle[k] = int(m.group(1))
    tl = next((l for l in doc('13').split('\n') if l.startswith('|') and '内存：空闲' in l), '')
    mt = re.search(r'≤\s*(\d+)\s*MB', tl.split('|')[2] if tl.count('|') > 2 else '')
    if not mt: out.append(('UNPARSABLE', '13 §13.1', 'idle total row not found'))
    elif len(idle) == 4 and sum(idle.values()) > int(mt.group(1)):
        out.append(('IDLE_SUM_EXCEEDS_TOTAL', f'{sum(idle.values())} MB', f'13 §13.1 idle total {mt.group(1)} MB', str(idle)))
    return out, len(t06)

TOOL_KINDS = [   # (kind, regex naming it in 05 / 11, regex for its row in the 16 §16.1.10 tool table)
  ('file tools', r'`(read|edit|write)`\s*/|文件类工具', r'文件类工具'),
  ('bash', r'\bbash\b', r'`bash`'),
  ('Tower tools', r'Tower (自己的)?工具', r'Tower 工具'),
  ('user extension tools', r'用户扩展(注册的)?工具', r'用户扩展注册的工具'),
  ('MCP tools', r'mcp__|MCP 工具', r'MCP 工具'),
  ('codemode', r'codemode', r'codemode'),
  ('tool_search', r'tool_search', r'`tool_search`'),                       # round 59 (R58 §3.1, ADR-186)
  ('MCP resource tools', r'MCP 资源工具|read_mcp_resource', r'MCP 资源工具'),
  ('non-whitelisted Pi built-ins', r'白名单之外的 Pi 内置工具', r'白名单之外的 Pi 内置工具'),   # round 62 (R61 §3.1, ADR-189)
]
PI_BUILTIN_EXT_TOOLS = {'v1.2.0': ['codemode', 'tool_search', 'MCP resource tools']}   # tools registered by Pi's built-in extensions (05 §5.3.1)
PI_BUILTIN_TOOLS = {'v1.2.0': ['read', 'bash', 'powershell', 'edit', 'write', 'grep', 'find', 'ls']}   # allToolNames, core/tools/index.ts:96-105 (ADR-189)
def check_T():
    out, named = [], set()
    a05, b05 = section_lines('05', '5.6.5'); a11, b11 = section_lines('11', '11.3.4'); a16, b16 = section_lines('16', '16.1.10')
    if not (a05 and a11 and a16): return [('UNPARSABLE', '05 §5.6.5 / 11 §11.3.4 / 16 §16.1.10', 'section not found')], 0
    L05 = doc('05').split('\n')[a05 - 1:b05]
    i = next((j for j, l in enumerate(L05) if l.startswith('判定流程')), None)
    src = []
    if i is None: out.append(('UNPARSABLE', '05 §5.6.5', '判定流程 not found'))
    else:
        steps = L05[i + 1:]
        s1 = next((l for l in steps if l.startswith('1. ')), None)
        k3 = next((j for j, l in enumerate(steps) if l.startswith('3. ')), None)
        k4 = next((j for j, l in enumerate(steps) if l.startswith('4. ')), None)
        if not s1 or k3 is None or k4 is None: out.append(('UNPARSABLE', '05 §5.6.5', 'steps 1/3/4 not found'))
        else:
            src.append(('05 step 1', s1.split('：')[0] if '：' in s1[:40] else s1[:60]))
            src += [('05 step 3', re.sub(r'：.*', '', x.strip()[2:])) for x in steps[k3 + 1:k4] if re.match(r'\s+- ', x)]
    for l in doc('11').split('\n')[a11 - 1:b11]:
        m = re.match(r'^- \*\*(.+?)\*\*', l)
        if m and ('工具' in m.group(1) or 'codemode' in m.group(1)) and '检查' not in m.group(1) and '来源' not in m.group(1): src.append(('11 §11.3.4', m.group(1)))
    for where, text in src:
        hit = [k for k, rx, _ in TOOL_KINDS if re.search(rx, text)]
        if not hit: out.append(('UNMAPPED_TOOL_KIND', where, text[:60]))
        named.update(hit)
    # round 60 (R59 §3.1, ADR-187): every Tower tool (05 §5.6.2 headings) is in the gate's step-1 list, and the 05 §5.3.5
    # Host skeleton checks the effective source of Tower tools against <inline:tower-goal> (getAllTools), like <sdk:bash>
    a562, b562 = section_lines('05', '5.6.2'); a535, b535 = section_lines('05', '5.3.5')
    L05all = doc('05').split('\n')
    tnames = [m.group(1) for l in L05all[a562 - 1:b562] for m in [re.match(r'^#### \(\w\) `([a-z_]+)`', l)] if m] if a562 else []
    if not tnames: out.append(('UNPARSABLE', '05 §5.6.2', 'no “#### (x) `tool`” headings'))
    s1l = s1 if i is not None and s1 else ''
    for n in tnames:
        if f'`{n}`' not in s1l: out.append(('TOWER_TOOL_NOT_IN_GATE_STEP1', n, '05 §5.6.5 判定流程第 1 步'))
    sk = [j for j, l in enumerate(L05all[a535 - 1:b535]) if '<inline:tower-goal>' in l and 'getAllTools' in l]
    if not sk:
        out.append(('NO_TOWER_TOOL_SOURCE_SELFCHECK', '05 §5.3.5', 'Host skeleton lacks a getAllTools() source check against <inline:tower-goal>'))
    else:
        # round 61 (R60 §3.1, ADR-188): the self-check must run after bindExtensions (session_start registrations), and the
        # gate's step 1 must re-check the source of a Tower tool name on every call (registrations later in the Run)
        bx = [j for j, l in enumerate(L05all[a535 - 1:b535]) if re.search(r'\bbindExtensions\(', l) and not l.lstrip().startswith('//')]
        if not bx or bx[0] > sk[0]:
            out.append(('TOWER_TOOL_SELFCHECK_BEFORE_BIND', '05 §5.3.5', 'the <inline:tower-goal> source check must come after a bindExtensions( call in the Host skeleton'))
        if not ('<inline:tower-goal>' in s1l and 'getAllTools' in s1l):
            out.append(('NO_PER_CALL_TOWER_TOOL_RECHECK', '05 §5.6.5', 'step 1 must re-check, per call, that a Tower tool name resolves to <inline:tower-goal> via getAllTools()'))
    # round 62 (R61 §3.1, ADR-189): Pi's own built-in tools. The 05 §5.3.5 skeleton splits Pi v1.2.0 allToolNames into
    # TOWER_BUILTINS (whitelist) and NON_TOWER_BUILTINS (passed as excludeTools); every non-whitelisted name is named in the
    # 11 §11.3.4 tool-source bullet and in the 16 row for non-whitelisted built-ins; every whitelisted name other than bash is
    # named as builtin:<name> in 11 §11.3.4; setActiveTools literals in the 05 §5.6.2 activation table are whitelisted built-ins
    # or Tower tools, and the running row names its built-ins explicitly (it may not keep the user's defaultTools).
    sk535 = L05all[a535 - 1:b535] if a535 else []
    def _const(name):
        m = next((re.search(r'const ' + name + r' = \[([^\]]*)\]', l) for l in sk535 if re.search(r'const ' + name + r' = \[', l)), None)
        return re.findall(r'"([a-z_]+)"', m.group(1)) if m else None
    wl, nwl = _const('TOWER_BUILTINS'), _const('NON_TOWER_BUILTINS')
    if wl is None or nwl is None: out.append(('UNPARSABLE', '05 §5.3.5', 'TOWER_BUILTINS / NON_TOWER_BUILTINS not found'))
    else:
        pi = set(PI_BUILTIN_TOOLS['v1.2.0'])
        if set(wl) & set(nwl) or set(wl) | set(nwl) != pi:
            out.append(('BUILTIN_SPLIT', '05 §5.3.5', f'TOWER_BUILTINS ∪ NON_TOWER_BUILTINS must partition Pi v1.2.0 allToolNames {sorted(pi)}'))
        if not any(re.search(r'excludeTools:\s*NON_TOWER_BUILTINS', l) and not l.lstrip().startswith('//') for l in sk535):
            out.append(('NO_EXCLUDE_TOOLS', '05 §5.3.5', 'the session must be created with excludeTools: NON_TOWER_BUILTINS'))
        src11 = next((l for l in doc('11').split('\n')[a11 - 1:b11] if l.startswith('- **工具来源')), '')
        tbl16 = _table_after(doc('16').split('\n')[a16 - 1:b16], r'\| *工具种类 *\| *动作类')
        row16 = next((r[0] for r in tbl16 if '白名单之外的 Pi 内置工具' in r[0]), '') if tbl16 else ''
        for n in nwl:
            if f'`{n}`' not in src11: out.append(('NON_WHITELISTED_BUILTIN_UNNAMED', n, '11 §11.3.4 工具来源'))
            if f'`{n}`' not in row16: out.append(('NON_WHITELISTED_BUILTIN_UNNAMED', n, '16 §16.1.10 白名单之外的 Pi 内置工具 row'))
        for n in wl:
            if n != 'bash' and f'`builtin:{n}`' not in src11: out.append(('WHITELISTED_BUILTIN_UNNAMED', n, '11 §11.3.4 工具来源 (builtin:<name>)'))
            # round 92 (R92-D11-01, ADR-220): every whitelisted built-in is injected by Tower via customTools, so its effective
            # source <sdk:<name>> must be named in the tool-source bullet as well
            if f'`<sdk:{n}>`' not in src11: out.append(('WHITELISTED_BUILTIN_SDK_SOURCE_UNNAMED', n, '11 §11.3.4 工具来源 (<sdk:<name>>)'))
        tower = set(tnames)
        for l in L05all[a562 - 1:b562] if a562 else []:
            m = re.match(r'\| `(running|shaping|review)` \|', l)
            if not m: continue
            cell = l.split('|')[2]
            lits = re.findall(r'"([a-z_]+)"', cell)
            for x in lits:
                if x not in set(wl) and x not in tower: out.append(('ACTIVE_TOOL_NOT_WHITELISTED', m.group(1), x))
            if not any(x in set(wl) for x in lits): out.append(('PHASE_BUILTINS_IMPLICIT', m.group(1), 'setActiveTools must name its built-in tools explicitly'))
        # round 63 (R62 §3.1, ADR-190): Pi gives tools of built-in extensions the source builtin:<extension name>, so the
        # “builtin: source” allow-list must name the path of every `builtin: true` entry of the 05 §5.3.5 extensionFactories
        # in the 11 §11.3.4 tool-source bullet, the 05 §5.6.5 step-3 bullet for non-whitelisted built-ins and the 16 row
        exts = [m.group(1) for l in sk535 for m in [re.search(r'\{ name: "([a-z.-]+)",.*\bbuiltin: true', l)] if m]
        if not exts: out.append(('UNPARSABLE', '05 §5.3.5', 'no `builtin: true` extensionFactories entries'))
        st3 = next((x for x in (L05[i + 1:] if i is not None else []) if re.match(r'\s+- 白名单之外的 Pi 内置工具', x)), '')
        for n in exts:
            for where, text in (('11 §11.3.4 工具来源', src11), ('05 §5.6.5 step 3', st3), ('16 §16.1.10 白名单之外的 Pi 内置工具 row', row16)):
                if f'`builtin:{n}`' not in text:
                    out.append(('BUILTIN_EXTENSION_SOURCE_UNNAMED', n, where))
    for v, ks in PI_BUILTIN_EXT_TOOLS.items(): named.update(ks)   # always checked, named or not
    L16 = doc('16').split('\n')[a16 - 1:b16]
    classes = set()
    for l in L16:
        c = l.split('|')
        if len(c) > 5 and re.match(r'\s*\d+\s*$', c[1] or '') or (len(c) > 5 and re.match(r'\s*\d+\s*$', c[4] or '')):
            for j in (2, 5):
                if j < len(c): classes.update(re.findall(r'^\s*`([a-z_]+\.[a-z_.]+)`', c[j]))
    tbl = _table_after(L16, r'\| *工具种类 *\| *动作类')
    if not tbl: return out + [('UNPARSABLE', '16 §16.1.10', 'no “| 工具种类 | 动作类” table')], len(named)
    for k, _, rowrx in TOOL_KINDS:
        if k not in named: continue
        row = next((r for r in tbl if re.search(rowrx, r[0])), None)
        if not row: out.append(('NO_REGISTRY_ROW', k, '16 §16.1.10 tool table')); continue
        ids = re.findall(r'`([a-z_]+\.[a-z_.*]+)`', row[1]) if len(row) > 1 else []
        if not ids: out.append(('NO_CLASS_IN_ROW', k, row[1][:60] if len(row) > 1 else ''))
        for x in ids:
            ok = x in classes or (x.endswith('.*') and any(c.startswith(x[:-1]) for c in classes))
            if not ok: out.append(('UNREGISTERED_CLASS', k, x))
    return out, len(named)


# (F) round 59 (R58 §3.1, ADR-186): every class with a level floor in 02 has the single enforcement point in decide()
def check_F():
    out = []
    floors = []
    for l in doc('02').split('\n'):
        for m in re.finditer(r'([^；\n]*?)的级别下限为 ask', l):
            clause = m.group(1)
            toks = (['isOneWayDoor'] if '单向门' in clause else []) + ['"%s"' % c for c in re.findall(r'\b([a-z_]+\.[a-z_]+)\b', clause)]
            floors.append((clause.strip(), toks))
    if not floors: return [('UNPARSABLE', '02 §2.5', 'no “级别下限为 ask” clause')], 0
    a, b = section_lines('11', '11.3.5')
    if not a: return [('UNPARSABLE', '11 §11.3.5', 'section not found')], len(floors)
    L = doc('11').split('\n')[a - 1:b]
    i = next((j for j, l in enumerate(L) if l.startswith('function decide')), None)
    if i is None: return [('UNPARSABLE', '11 §11.3.5', 'function decide not found')], len(floors)
    body = []
    for l in L[i + 1:]:
        if l.startswith('}'): break
        body.append(re.sub(r'//.*$', '', l))
    fl = [l for l in body if re.search(r'\bfloor\s*=', l)]
    for clause, toks in floors:
        if not fl: out.append(('FLOOR_NOT_ENFORCED', clause, 'no floor line in decide()')); continue
        miss = [x for x in toks if not any(x in l and '"ask"' in l for l in fl)]
        if miss: out.append(('FLOOR_NOT_ENFORCED', clause, 'missing in floor: ' + ', '.join(miss)))
    if fl and not any(re.search(r'applyGrants\(\s*maxLevel\(\[[^;]*?\bfloor\(', l) for l in body):
        out.append(('FLOOR_AFTER_GRANTS', '11 §11.3.5', 'floor must clamp the matrix level inside the applyGrants argument'))
    return out, len(floors)

# (M) round 59 (R58 §3.1, ADR-186): CI scenarios that test what 13 calls “M1 验收” are in the 14 §14.3.5 M1 exit row
def check_M():
    L13 = doc('13').split('\n')
    hdr = next((l for l in L13 if '**M1 验收**' in l), None)
    m = re.search(r'\*\*M1 验收\*\*＝([^；]*)', hdr or '')
    if not m: return [('UNPARSABLE', '13 §13.0–13.1', '“M1 验收” definition not found')], 0
    secs = re.findall(r'§(13\.\d+(?:\.\d+)*)', m.group(1))
    a, b = section_lines('13', '13.12.2')
    if not a: return [('UNPARSABLE', '13 §13.12.2', 'section not found')], 0
    need = set()
    for r in doc('13').split('\n')[a - 1:b]:
        pm = re.match(r'\|\s*(P\d+)\b', r)
        if pm and any(('§' + s) in r for s in secs): need.add(pm.group(1))
    a14, b14 = section_lines('14', '14.3.5')
    row = next((l for l in doc('14').split('\n')[a14 - 1:b14] if l.startswith('| 性能 |')), '') if a14 else ''
    cm = re.search(r'CI 场景 ((?:P\d+/?)+)', row)
    if not cm: return [('UNPARSABLE', '14 §14.3.5', 'M1 exit “| 性能 |” row with CI 场景 list not found')], len(need)
    have = set(cm.group(1).strip('/').split('/'))
    out = [('M1_SCENARIO_NOT_IN_EXIT', p, '13 “M1 验收” cites ' + '/'.join('§' + s for s in secs)) for p in sorted(need - have)]
    # round 64 (R64 §3.1 / §5 obs 5, ADR-192): 13 §13.12.2 P-numbers that also name an SP6c case (14 §14.2 table
    # rows “| P<n> |” or “| P<a>–P<b> |”) must be covered by the 14 exit-row note “`13` §13.12.2 的 P1–P<k> 与 SP6c”.
    p13 = {int(x) for x in re.findall(r'^\|\s*P(\d+)\b', '\n'.join(doc('13').split('\n')[a - 1:b]), re.M)}
    sp = set()
    for x, y in re.findall(r'^\| P(\d+)(?:[a-z])?(?:–P(\d+))? \|', doc('14'), re.M):
        sp.update(range(int(x), int(y or x) + 1))
    clash = p13 & sp
    nm = re.search(r'§13\.12\.2 的 P1–P(\d+) 与 SP6c', re.sub(r'`', '', row))
    if clash and (not nm or int(nm.group(1)) < max(clash)):
        out.append(('P_NUMBER_CLASH_UNNOTED', f'P{max(clash)}', f'14 §14.3.5 性能行 note covers P1–P{nm.group(1) if nm else "—"}'))
    return out, len(need)

# (B) round 60 (R59 §3.1 “(R)”, renamed because R is r′; ADR-187): enumerating claims about blocking run-class hits
def check_B():
    m = re.search(r'阻断的 run 类命中有[^：]*：(.*?)`sandbox_violation` 为提示性', doc('16'))
    if not m: return [('UNPARSABLE', '16 §16.1.6', '“阻断的 run 类命中有…” not found')], 0
    S = set(re.findall(r'`([a-z_]+)`（sentinel', m.group(1)))
    if not S: return [('UNPARSABLE', '16 §16.1.6', 'no `id`（sentinel… items')], 0
    out, n = [], 0
    for f in files:
        dn = os.path.basename(f)[:2] if not f.endswith('README.md') else 'RM'
        if dn == '15': continue
        for ln, l in enumerate(open(f, encoding='utf8'), 1):
            if dn == '16' and DEP16[0] and DEP16[0] <= ln <= DEP16[1]: continue
            for mm in re.finditer(r'run 类(?:\*\*)?阻断|阻断的 run 类', l):
                win = l[max(0, mm.start() - 60):mm.start() + 160]
                if not re.search(r'唯一的|只有|一项', win): continue
                n += 1
                ids = {x for x in S if x in win}
                if ids != S and '§16.1.6' not in win:
                    out.append(('RUN_CLASS_ENUM_DIFFERS', f'{dn}:{ln}', '/'.join(sorted(ids)) or '—', 'expected ' + '/'.join(sorted(S)) + ' or a 16 §16.1.6 citation'))
    return out, n

# (O) round 60 (R59 §3.1, ADR-187): 08 §8.8 — one class per exit
O_OUTCOMES = {'actionable', 'informative', 'false_positive', 'obsolete', 'confirmatory', 'reflexive', 'timeout'}
def check_O():
    a, b = section_lines('08', '8.8')
    if not a: return [('UNPARSABLE', '08 §8.8', 'section not found')], 0
    L = doc('08').split('\n')[a - 1:b]
    i = next((j for j, l in enumerate(L) if re.match(r'\| *kind *\| *actionable *\| *其他类别', l)), None)
    if i is None: return [('UNPARSABLE', '08 §8.8', 'no “| kind | actionable | 其他类别” table')], 0
    out, n = [], 0
    tok = lambda x: {p + q for p, q in re.findall(r'`([a-z_.]+)(\{[^`]*\})?`', x)} - O_OUTCOMES
    for l in L[i + 2:]:
        if not l.startswith('|'): break
        c = l.split('|')
        if len(c) < 5: out.append(('UNPARSABLE', '08 §8.8', l[:60])); continue
        n += 1
        both = tok(c[2]) & tok(c[3])
        if '放弃' in re.sub(r'放弃以外|放弃按', '', c[2]) and '放弃' in c[3]: both.add('放弃')
        for x in sorted(both): out.append(('EXIT_IN_TWO_COLUMNS', c[1].strip()[:40], x))
        if '任意处置选项' in c[2] and '放弃以外' not in c[2]:
            out.append(('ANY_OPTION_OVERLAPS_GENERIC_ABANDON', c[1].strip()[:40], 'actionable “任意处置选项” must exclude 放弃 (generic abandon row)'))
    return out, n

# (J) round 61 (R60 §3.1 “(K)” — renamed, K is k′; ADR-188): 16 §16.3 keymap — each (key, scope) pair is registered once
def check_J():
    a, b = section_lines('16', '16.3')
    if not a: return [('UNPARSABLE', '16 §16.3', 'section not found')], 0
    seen, out, n = {}, [], 0
    L = doc('16').split('\n')[a - 1:b]
    i = next((j for j, l in enumerate(L) if re.match(r'\| *键 *\| *作用域 *\|', l)), None)
    if i is None: return [('UNPARSABLE', '16 §16.3', 'no “| 键 | 作用域 |” table')], 0
    for ln, l in enumerate(L[i + 2:], a + i + 2):
        if not l.startswith('|'): break
        if not l.startswith('| `'): out.append(('UNPARSABLE', f'16:{ln}', l[:60])); continue
        c = l.split(' | ')
        if len(c) < 3: out.append(('UNPARSABLE', f'16:{ln}', l[:60])); continue
        kc = c[0].lstrip('| ')
        if re.match(r'^`G` `', kc): continue                      # G-prefixed chords are excluded
        keys = re.findall(r'`([^`]+)`', re.sub(r'（[^）]*）', '', kc))   # alternates in （…） are the same binding
        scopes = [x.strip() for x in re.split(r'[、；;]', re.sub(r'（[^）]*）|“[^”]*”', '', c[1])) if x.strip()]
        for k in keys:
            for sc in scopes:
                n += 1
                if (k, sc) in seen: out.append(('DUPLICATE_KEY_SCOPE', f'16:{ln}', f'{k} @ {sc}', f'also 16:{seen[(k, sc)]}'))
                else: seen[(k, sc)] = ln
    return out, n

# (H) round 62 (R61 §3.1, ADR-189): key hints in 04 wireframes (code blocks) — “[K 动作]” buttons and “K 动作 · K 动作” bars —
# name keys registered in the 16 §16.3 keymap, and the milestone agrees: a hint marked M2/M3 needs a row of that milestone
# for the key; a key registered only for M2/M3 must carry the marker.  View scope is not compared (no view → scope map).
H_KEY = r'(?:[⌘⇧⌥]*(?:[A-Z]|↩|Esc|Space|Tab|\.)|[A-Z]/[A-Z]|\]/\[)'
def _keymap():
    a, b = section_lines('16', '16.3')
    if not a: return None
    L = doc('16').split('\n')[a - 1:b]
    i = next((j for j, l in enumerate(L) if re.match(r'\| *键 *\| *作用域 *\|', l)), None)
    if i is None: return None
    km = {}
    for l in L[i + 2:]:
        if not l.startswith('|'): break
        c = l.split(' | ')
        if len(c) < 4: continue
        for k in re.findall(r'`([^`]+)`', c[0]): km.setdefault(k, set()).add(c[3].strip())
    return km
def check_H():
    km = _keymap()
    if km is None: return [('UNPARSABLE', '16 §16.3', 'keymap table not found')], 0
    out, n = [], 0
    t = doc('04')
    for bm in re.finditer(r'```[^\n]*\n(.*?)```', t, re.S):
        base = t[:bm.start()].count('\n') + 2
        for off, l in enumerate(bm.group(1).split('\n')):
            hints = [(m.group(1), m.group(2)) for m in re.finditer(r'\[(' + H_KEY + r') ([^\]\s][^\]]*)\]', l)]
            for cell in re.split(r'[│|]', l):
                if cell.count(' · ') >= 1:
                    for seg in cell.split(' · '):
                        m = re.match(r'^\s*(' + H_KEY + r') ([一-鿿][^·]*)$', seg.rstrip())
                        if m: hints.append((m.group(1), m.group(2)))
            for k, act in hints:
                keys = k.split('/') if re.fullmatch(r'[A-Z]/[A-Z]|\]/\[', k) else [k]
                marked = re.search(r'M[23]', act)
                for kk in keys:
                    n += 1
                    if kk not in km: out.append(('UNREGISTERED_HINT_KEY', f'04:{base + off}', f'{kk} {act[:20]}')); continue
                    ms = km[kk]
                    if marked and not any(marked.group(0) in x for x in ms): out.append(('HINT_MILESTONE', f'04:{base + off}', f'{kk} {act[:20]}', f'16 §16.3: {sorted(ms)}'))
                    if not marked and ms and all(re.search(r'M[23]', x) for x in ms): out.append(('HINT_MILESTONE', f'04:{base + off}', f'{kk} {act[:20]}', f'only {sorted(ms)} in 16 §16.3, hint lacks the marker'))
    return out, n

# (C) round 61 (R60 §3.1, ADR-188): 14 §14.3.4 role-capacity table vs the W1–W19 split, the freeze range, margins, the
# add-a-person sum, the Gantt margin cells, and the latest ADR-133 addendum in 15
from decimal import Decimal as _Dec, ROUND_HALF_UP as _HU
def _q2(x): return _Dec(x).quantize(_Dec('0.01'), rounding=_HU)
C_ROLES = ['Agent', '系统', '桌面', '设计', '安全']
def check_C():
    a, b = section_lines('14', '14.3.4')
    if not a: return [('UNPARSABLE', '14 §14.3.4', 'section not found')], 0
    L = doc('14').split('\n')[a - 1:b]; out = []
    split = {r: _Dec(0) for r in C_ROLES}; total = _Dec(0); nrow = 0; byw = {}
    for l in L:
        m = re.match(r'\| (W\d+) \|', l)
        if not m: continue
        c = l.split('|'); nrow += 1
        h = _Dec(c[3].strip()); total += h
        own = re.sub(r'（[^）]*）', '', c[5])
        parts = re.findall(r'(Agent|系统|桌面|设计|安全) (\d+(?:\.\d+)?)', own)
        if not parts: out.append(('UNPARSABLE', m.group(1), c[5][:40])); continue
        ssum = sum(_Dec(v) for _, v in parts)
        if ssum != h: out.append(('WBS_SPLIT_SUM', m.group(1), f'{ssum} ≠ {h}'))
        for r, v in parts:
            split[r] += _Dec(v); byw.setdefault(r, {})[m.group(1)] = _Dec(v)
    # round 68 (R68-D14-01, ADR-196): 14 §14.8 team table — every “W<n>（<num>” (W7-fs = 安全's W7 share) equals the
    # role's share in the 主责 column, every W with a share is listed, and the row's “合计 <num>” equals the role total
    a8, b8 = section_lines('14', '14.8')
    if not a8: out.append(('UNPARSABLE', '14 §14.8', 'section not found'))
    else:
        R8 = {'系统工程': '系统', 'Agent': 'Agent', '桌面': '桌面', '设计工程师': '设计', '安全': '安全'}; seen8 = set()
        for l in doc('14').split('\n')[a8 - 1:b8]:
            c = l.split('|')
            if len(c) < 4 or '---' in l: continue
            r = next((v for k, v in R8.items() if c[1].strip().startswith(k)), None)
            if not r: continue
            seen8.add(r)
            got = {w: _Dec(v) for w, v in re.findall(r'(W\d+)(?:-fs)?（(\d+(?:\.\d+)?)', c[3])}
            want = byw.get(r, {})
            for w in sorted(set(got) | set(want)):
                if got.get(w) != want.get(w): out.append(('TEAM_TABLE', f'14 §14.8 {r} {w}', f'{got.get(w, "—")} ≠ §14.3.4 {want.get(w, "—")}'))
            mt8 = re.search(r'合计 (\d+\.\d+)', c[3])
            if not mt8 or _Dec(mt8.group(1)) != sum(want.values(), _Dec(0)): out.append(('TEAM_TABLE', f'14 §14.8 {r} 合计', f'{mt8.group(1) if mt8 else "—"}'))
        if seen8 != set(C_ROLES): out.append(('UNPARSABLE', '14 §14.8', f'roles {sorted(seen8)}'))
    ft = next((l for l in L if '**功能合计**' in l), '')
    mt = re.search(r'\*\*(\d+\.\d+)\*\*', ft)
    if not mt or _Dec(mt.group(1)) != total: out.append(('WBS_TOTAL', '功能合计', f'{mt.group(1) if mt else "—"} ≠ {total}'))
    i = next((j for j, l in enumerate(L) if re.match(r'\| *角色 *\| *分配合计 *\| *M0 先行', l)), None)
    if i is None: return out + [('UNPARSABLE', '14 §14.3.4', 'no “| 角色 | 分配合计 | M0 先行” table')], nrow
    freeze = {}
    for l in L[i + 2:]:
        if not l.startswith('|'): break
        c = [x.strip() for x in l.split('|')]
        r = next((x for x in C_ROLES if c[1].startswith(x)), None)
        if not r: out.append(('UNPARSABLE', 'capacity table', l[:40])); continue
        num = lambda x: _Dec(re.search(r'\d+\.\d+', x).group(0))
        tot, m0, rem, qa, fz = (num(x) for x in c[2:7])
        if tot != split[r]: out.append(('CAPACITY_TOTAL', r, f'table {tot} ≠ WBS split {split[r]}'))
        if rem != tot - m0: out.append(('CAPACITY_REMAINING', r, f'{rem} ≠ {tot} − {m0}'))
        if qa != _q2(rem * _Dec('1.1')): out.append(('CAPACITY_QA', r, f'{qa} ≠ round({rem} × 1.1) = {_q2(rem * _Dec("1.1"))}'))
        want = qa * 2 if '0.5 人' in c[1] else qa
        if fz != want: out.append(('CAPACITY_FREEZE', r, f'{fz} ≠ {want}'))
        freeze[r] = (qa, fz)
    if set(freeze) != set(C_ROLES): return out + [('UNPARSABLE', 'capacity table', 'roles missing')], nrow
    fz = [freeze[r][1] for r in C_ROLES]
    txt = '\n'.join(L)
    m = re.search(r'第 \d+ 轮后五条线的冻结前所需工作周在 (\d+\.\d+)–(\d+\.\d+) 之间', txt)
    if not m or (_Dec(m.group(1)), _Dec(m.group(2))) != (min(fz), max(fz)):
        out.append(('FREEZE_RANGE', '14 §14.3.4', f'{m.group(0) if m else "range sentence not found"} vs {min(fz)}–{max(fz)}'))
    concl = next((l for l in L if l.startswith('**结论：M1 =')), '')
    # round 97 (ADR-225): capacity is derived from the conclusion instead of a hardcoded 29.00 (38 weeks) —
    # “≤ K.0 工作周，在第 1–6、9–13、15–N 周的 K 个工作周之内 → **第 N 周末功能冻结**”, M1 = N + 4 (3 weeks of
    # self-use + exit week), K = 6 + 5 + (N − 14) (holiday weeks 7, 8, 14), capacity = K − 2 (ADR-038 buffer)
    mw = re.search(r'≤ (\d+)\.0 工作周，在第 1–6、9–13、15–(\d+) 周的 (\d+) 个工作周之内 → \*\*第 (\d+) 周末功能冻结\*\*', concl)
    m1 = re.match(r'\*\*结论：M1 = (\d+) 周', concl)
    if not mw or not m1: return out + [('UNPARSABLE', '14 §14.3.4 结论', 'working weeks / freeze week / M1 weeks not found')], nrow
    kcap, last, kwk, fw = (int(x) for x in mw.groups())
    if not (kcap == kwk == 6 + 5 + (last - 14) and last == fw and int(m1.group(1)) == fw + 4):
        out.append(('CAPACITY_WEEKS', '14 §14.3.4 结论', f'≤ {kcap}.0, 15–{last}, {kwk} 个工作周, 第 {fw} 周末, M1 = {m1.group(1)}'))
    cap = (_Dec(kwk) - 2).quantize(_Dec('0.01'))
    margin = {r: cap - freeze[r][1] for r in C_ROLES}
    mm = re.search(r'缓冲外余量：(.*?)工作周', concl)
    if not mm: out.append(('UNPARSABLE', '14 §14.3.4 结论', '缓冲外余量 not found'))
    else:
        got = dict(re.findall(r'(Agent|系统|桌面|设计|安全) (\d+\.\d+)', mm.group(1)))
        for r in C_ROLES:
            if r not in got or _Dec(got[r]) != margin[r]: out.append(('MARGIN', f'结论 {r}', f'{got.get(r, "—")} ≠ {cap} − {freeze[r][1]} = {margin[r]}'))
    for l in L:
        g = re.match(r'\| (系统|Agent|桌面|设计|安全) \|', l)
        if g and '|---' not in l:
            mg = re.findall(r'余量 (\d+\.\d+)', l)
            if mg and _Dec(mg[-1]) != margin[g.group(1)]: out.append(('MARGIN', f'甘特 {g.group(1)}', f'{mg[-1]} ≠ {margin[g.group(1)]}'))
    ma = re.search(r'全部工作（含 QA）= (\d+\.\d+) \+ (\d+\.\d+) \+ (\d+\.\d+) \+ (\d+\.\d+) \+ 安全线 (\d+\.\d+) = (\d+\.\d+) 人周.*?T ≥ (\d+\.\d+) / 5\.5 = (\d+\.\d+)', txt)
    if not ma: out.append(('UNPARSABLE', '14 §14.3.4 增人备选', 'sum not found'))
    else:
        v = [_Dec(x) for x in ma.groups()]
        exp = [freeze[r][0] for r in C_ROLES]
        if v[:5] != exp: out.append(('ADD_PERSON_TERMS', '增人备选', f'{[str(x) for x in v[:5]]} ≠ {[str(x) for x in exp]}'))
        if v[5] != sum(v[:5]) or v[6] != v[5] + 2 or v[7] != _q2(v[6] / _Dec('5.5')):
            out.append(('ADD_PERSON_ARITH', '增人备选', ma.group(0)[:80]))
    # round 98 (R98-D14-01, ADR-226): ADR-038's 〔当前值〕 in 15 states the M1 weeks and end date of the 14 conclusion;
    # the end date is the Friday of week M1 counted from 2026-11-09 (Monday)
    import datetime as _dt
    mcv = re.search(r'〔当前值：\*\*(\d+) 个日历周\*\*，2026-11-09 → (\d{4}-\d\d-\d\d)', doc('15'))
    me = re.search(r'日历周，2026-11-09 至 (\d{4}-\d\d-\d\d)', concl)
    if not mcv or not me: out.append(('UNPARSABLE', '15 ADR-038 〔当前值〕 / 14 §14.3.4 结论', 'M1 weeks or end date not found'))
    else:
        m1w = int(m1.group(1)); want = (_dt.date(2026, 11, 9) + _dt.timedelta(weeks=m1w - 1, days=4)).isoformat()
        if me.group(1) != want: out.append(('M1_END_DATE', '14 §14.3.4 结论', f'{me.group(1)} ≠ week {m1w} Friday {want}'))
        if int(mcv.group(1)) != m1w or mcv.group(2) != want:
            out.append(('ADR038_CURRENT', '15 ADR-038 〔当前值〕', f'{mcv.group(1)} 周 / {mcv.group(2)} ≠ {m1w} 周 / {want}'))
    # round 99 (R99-D14-01, ADR-227): 14 §14.1 M2 ends 14 weeks after the M1 end date; the M3 row's “至 YYYY-MM” and
    # the conclusion's “M3 在 YYYY-MM” fall in the months of M2 end + 12–14 weeks
    a1, b1 = section_lines('14', '14.1')
    L1 = doc('14').split('\n')[a1 - 1:b1] if a1 else []
    r2 = next((l for l in L1 if l.startswith('| **M2** |')), ''); r3 = next((l for l in L1 if l.startswith('| **M3** |')), '')
    m2d = re.search(r'14 周（至 (\d{4})-(\d\d)-(\d\d)', r2); m3m = re.search(r'12–14 周（至 (\d{4}-\d\d)', r3)
    mc3 = re.search(r'M3 在 (\d{4}-\d\d)', concl)
    if not (m2d and m3m and mc3 and me): out.append(('UNPARSABLE', '14 §14.1 M2/M3 / 结论', 'M2 end, M3 month or conclusion M3 not found'))
    else:
        m1end = _dt.date.fromisoformat(me.group(1)); m2end = _dt.date(*(int(x) for x in m2d.groups()))
        if m2end != m1end + _dt.timedelta(weeks=14): out.append(('M2_END', '14 §14.1 M2', f'{m2end} ≠ M1 end {m1end} + 14 weeks'))
        ok = {(m2end + _dt.timedelta(weeks=w)).strftime('%Y-%m') for w in (12, 13, 14)}
        for tag, v in (('14 §14.1 M3', m3m.group(1)), ('14 §14.3.4 结论 M3', mc3.group(1))):
            if v not in ok: out.append(('M3_END', tag, f'{v} ∉ {sorted(ok)} (M2 end {m2end} + 12–14 weeks)'))
    # latest ADR-133 addendum in 15: role totals and margins equal the 14 table
    adds = re.findall(r'- \*\*第 (\d+) 轮补记（ADR-133 附）\*\*(.*?)(?=\n- \*\*第 \d+ 轮补记|\n---)', doc('15'), re.S)
    if not adds: out.append(('UNPARSABLE', '15 ADR-133', 'no “第 N 轮补记（ADR-133 附）”'))
    else:
        rnd, body = max(adds, key=lambda x: int(x[0]))
        rt = re.search(r'角色合计[^：]*：(.*?)（合计 (\d+\.\d+)）', body)
        if not rt: out.append(('UNPARSABLE', f'15 第 {rnd} 轮补记', '角色合计 not found'))
        else:
            got = dict(re.findall(r'(Agent|系统|桌面|设计|安全) (\d+\.\d+)', rt.group(1)))
            for r in C_ROLES:
                if _Dec(got.get(r, '-1')) != split[r]: out.append(('ADR133_ROLE_TOTAL', f'15 第 {rnd} 轮 {r}', f'{got.get(r, "—")} ≠ {split[r]}'))
            if _Dec(rt.group(2)) != total: out.append(('ADR133_TOTAL', f'15 第 {rnd} 轮', f'{rt.group(2)} ≠ {total}'))
        mg = re.search(r'余量：(.*?)工作周', body)
        if not mg: out.append(('UNPARSABLE', f'15 第 {rnd} 轮补记', '余量 not found'))
        else:
            got = dict(re.findall(r'(Agent|系统|桌面|设计|安全) \**(\d+\.\d+)', mg.group(1)))
            for r in C_ROLES:
                if _Dec(got.get(r, '-1')) != margin[r]: out.append(('ADR133_MARGIN', f'15 第 {rnd} 轮 {r}', f'{got.get(r, "—")} ≠ {margin[r]}'))
    return out, nrow

checks = sys.argv[sys.argv.index('--checks') + 1] if '--checks' in sys.argv else ''
nfail = len(bad)
if 'r' in checks:
    r = check_r(); nfail += len(r)
    print(f'(r) unique-definition contradictions={len(r)}')
    for x in r: print('\t'.join(map(str, x)))
if 's' in checks:
    s = report_s_rows(); nfail += sum(1 for x in s if x[1] != 'OK')
    print(f'(s) three-way enums: {sum(1 for x in s if x[1] == "OK")}/{len(s)} consistent')
    for x in s: print('\t'.join(x))
    ps = check_s_sources(); nfail += len(ps)
    print(f'(s) PauseReason source states registered in every defining place: {len(S_SOURCES)} places, missing={len(ps)}')
    for x in ps: print('\t'.join(map(str, x)))
if 'u' in checks:
    u = check_u(); nfail += len(u)
    print(f'(u) SP6b batch-table disagreements={len(u)}')
    for x in u: print('\t'.join(map(str, x)))
if 'v' in checks:
    v = check_v(); nfail += len(v)
    print(f'(v) remote-matrix coverage problems={len(v)} (commands in 06 §6.4.3: {len(cmds_06())}; local-only checked against 06 §6.4.7: {sum(1 for x in cmds_06() if x[2])})')
    for x in v: print('\t'.join(map(str, x)))
if 'w' in checks:
    w = check_w(); nfail += len(w)
    print(f'(w) Needs-You kind/dedupe/outcome problems={len(w)}')
    for x in w: print('\t'.join(map(str, x)))
if 'x' in checks:
    xx, tg = check_x(); nfail += len(xx)
    print(f'(x) default data vs examples: default-benign targets {tg}; problems={len(xx)}')
    for x in xx: print('\t'.join(map(str, x)))
if 'w' in checks:
    w2 = check_w2(); nfail += len(w2)
    print(f"(w′) pauseReason → Needs-You problems={len(w2)}")
    for x in w2: print('\t'.join(map(str, x)))
if 'y' in checks:
    y = check_y(); nfail += len(y)
    print(f'(y) cross-column CHECK vs 16 problems={len(y)}')
    for x in y: print('\t'.join(map(str, x)))
if 'z' in checks:
    z = check_z(); nfail += len(z)
    print(f'(z) push/PR/remote polling presented as M1={len(z)}')
    for x in z: print('\t'.join(map(str, x)))
    z2, nz2 = check_z2(); z2bad = [x for x in z2 if x[0] != 'UNPARSABLE']; nfail += len(z2bad)
    print(f'(z′) M2 capability phrases in M1 tables: {nz2} occurrences, unmarked={len(z2bad)}, UNPARSABLE={len(z2) - len(z2bad)}')
    for x in z2: print('\t'.join(map(str, x)))
if 'c' in checks:
    c = check_c(); nfail += len(c)
    print(f'(c) continuation literal shape vs 02={len(c)}')
    for x in c: print('\t'.join(map(str, x)))
if 'd' in checks:
    d = check_d(); nfail += len(d)
    print(f'(d) deleted mechanism names outside history={len(d)}')
    for x in d: print('\t'.join(map(str, x)))
if 'n' in checks:
    nn = check_n(); nfail += len(nn)
    print(f'(n) contract-test references={len(nn)}')
    for x in nn: print('\t'.join(map(str, x)))
if 'k' in checks:
    k = check_k(); nfail += len(k)
    print(f'(k) 03 §3.2.1 rewrite targets vs 06 §6.4.3={len(k)}')
    for x in k: print('\t'.join(map(str, x)))
if "s'" in checks or 'S' in checks:
    s2 = check_s2(); nfail += len(s2)
    print(f"(s′) enum values used in rule text / pseudo-code outside the registered set={len(s2)}")
    for x in s2: print('\t'.join(map(str, x)))
if 'e' in checks:
    e, npairs = check_e(); nfail += len(e)
    print(f'(e) ADR back-markers: {npairs} supersede/amend pairs, missing={len(e)}')
    for x in e: print('\t'.join(map(str, x)))
if 'R' in checks:
    r2, npairs = check_r2(); nfail += len(r2)
    print(f'(r′) mutual “一致/唯一定义” claims: {npairs} pairs, differing values={len(r2)}')
    for x in r2: print('\t'.join(map(str, x)))
if 'q' in checks:
    q = check_q(); nfail += len(q)
    print(f'(q) verbatim-quote mismatches={len(q)}')
    for x in q: print('\t'.join(map(str, x)))
if 'p' in checks:
    p_, nrows = check_p(); pbad = [x for x in p_ if x[0] != 'UNPARSABLE']; nfail += len(pbad)
    print(f'(p) 16 §16.8 copy cells without 规则 5: {nrows} copy cells, missing={len(pbad)}, UNPARSABLE={len(p_) - len(pbad)}')
    for x in p_: print('\t'.join(map(str, x)))
if 'P' in checks:
    P_, ncell = check_P(); Pbad = [x for x in P_ if x[0] != 'UNPARSABLE']; nfail += len(Pbad)
    print(f'(P) 16 §16.8 role-column copies (per column): {ncell} role cells with copies, missing={len(Pbad)}, UNPARSABLE={len(P_) - len(Pbad)}')
    for x in P_: print('\t'.join(map(str, x)))
if 'i' in checks:
    i_, nseen, nunp = check_i(); ibad = [x for x in i_ if x[0] != 'UNPARSABLE']; nfail += len(ibad)
    print(f'(i) event names in per-document event tables vs 16 §16.1.14: {nseen} names, not in index={len(ibad)}, UNPARSABLE={nunp}')
    for x in i_: print('\t'.join(map(str, x)))
    i2, ni2 = check_i2(); i2bad = [x for x in i2 if x[0] != 'UNPARSABLE']; nfail += len(i2bad)
    print(f'(i′) full-row and path-list payload events vs the 13 §13.9.1 cap (06 §6.3 rule): {ni2} events, unhandled={len(i2bad)}, UNPARSABLE={len(i2) - len(i2bad)}')
    for x in i2: print('\t'.join(map(str, x)))
if 'D' in checks:
    D_, nph = check_D(); Dbad = [x for x in D_ if x[0] != 'UNPARSABLE']; nfail += len(Dbad)
    print(f'(D) superseded phrases of 16 §16.1.13 outside history: {nph} phrases, hits={len(Dbad)}, UNPARSABLE={len(D_) - len(Dbad)}')
    for x in D_: print('\t'.join(map(str, x)))
if 'g' in checks:
    g_, nocc = check_g(); nfail += len(g_)
    print(f'(g) fact/danger glyphs paired with queue/grant/approval in 04/12: {nocc} glyph lines checked, misuse={len(g_)}')
    for x in g_: print('\t'.join(map(str, x)))
if 'o' in checks:
    o_, nchk, nskip = check_o(); obad = [x for x in o_ if x[0] != 'UNPARSABLE']; nfail += len(obad)
    print(f'(o) 16 §16.1 object shapes vs 02: {nchk} rows compared, {nskip} unions skipped, differing={len(obad)}, UNPARSABLE={len(o_) - len(obad)}')
    for x in o_: print('\t'.join(map(str, x)))
if 'K' in checks:
    K_, nres = check_K(); Kbad = [x for x in K_ if x[0] != 'UNPARSABLE']; nfail += len(Kbad)
    print(f'(k′) 03 §3.2.1 resume exits vs 06 goal.resume: {nres} reasons with a resume exit, missing={len(Kbad)}, UNPARSABLE={len(K_) - len(Kbad)}')
    for x in K_: print('\t'.join(map(str, x)))
if 'Y' in checks:
    Y_, ncl = check_Y(); nfail += len(Y_)
    print(f'(r‴) one-sided “只引用本条/本节” claims: {ncl} enumerating claims, re-enumerations={len(Y_)}')
    for x in Y_: print('\t'.join(map(str, x)))
if 'A' in checks:
    A_, nrow = check_A(); Abad = [x for x in A_ if x[0] != 'UNPARSABLE']; nfail += len(Abad)
    print(f'(A) per-process memory budgets 06 §6.1 vs 13 §13.8.1: {nrow} process rows, problems={len(Abad)}, UNPARSABLE={len(A_) - len(Abad)}')
    for x in A_: print('\t'.join(map(str, x)))
if 'T' in checks:
    T_, nkind = check_T(); Tbad = [x for x in T_ if x[0] != 'UNPARSABLE']; nfail += len(Tbad)
    print(f'(T) tool kinds (05 §5.6.5, 11 §11.3.4) → 16 §16.1.10 action classes: {nkind} kinds, problems={len(Tbad)}, UNPARSABLE={len(T_) - len(Tbad)}')
    for x in T_: print('\t'.join(map(str, x)))
if 'F' in checks:
    F_, nfl = check_F(); Fbad = [x for x in F_ if x[0] != 'UNPARSABLE']; nfail += len(Fbad)
    print(f'(F) level floors (02 §2.5) enforced in 11 §11.3.5 decide(): {nfl} floor clauses, problems={len(Fbad)}, UNPARSABLE={len(F_) - len(Fbad)}')
    for x in F_: print('\t'.join(map(str, x)))
if 'M' in checks:
    M_, nm = check_M(); Mbad = [x for x in M_ if x[0] != 'UNPARSABLE']; nfail += len(Mbad)
    print(f'(M) 13 “M1 验收” CI scenarios in 14 §14.3.5 M1 exit: {nm} scenarios, missing={len(Mbad)}, UNPARSABLE={len(M_) - len(Mbad)}')
    for x in M_: print('\t'.join(map(str, x)))
if 'B' in checks:
    B_, nb = check_B(); Bbad = [x for x in B_ if x[0] != 'UNPARSABLE']; nfail += len(Bbad)
    print(f'(B) enumerating “run 类阻断” claims vs 16 §16.1.6: {nb} claims, differing={len(Bbad)}, UNPARSABLE={len(B_) - len(Bbad)}')
    for x in B_: print('\t'.join(map(str, x)))
if 'O' in checks:
    O_, no = check_O(); Obad = [x for x in O_ if x[0] != 'UNPARSABLE']; nfail += len(Obad)
    print(f'(O) 08 §8.8 one class per exit: {no} rows, problems={len(Obad)}, UNPARSABLE={len(O_) - len(Obad)}')
    for x in O_: print('\t'.join(map(str, x)))
if 'J' in checks:
    J_, nj = check_J(); Jbad = [x for x in J_ if x[0] != 'UNPARSABLE']; nfail += len(Jbad)
    print(f'(J) 16 §16.3 keymap (key, scope) pairs: {nj} pairs, duplicates={len(Jbad)}, UNPARSABLE={len(J_) - len(Jbad)}')
    for x in J_: print('\t'.join(map(str, x)))
if 'H' in checks:
    H_, nh = check_H(); Hbad = [x for x in H_ if x[0] != 'UNPARSABLE']; nfail += len(Hbad)
    print(f'(H) 04 wireframe key hints vs 16 §16.3: {nh} hint keys, problems={len(Hbad)}, UNPARSABLE={len(H_) - len(Hbad)}')
    for x in H_: print('\t'.join(map(str, x)))
if 'C' in checks:
    C_, nc = check_C(); Cbad = [x for x in C_ if x[0] != 'UNPARSABLE']; nfail += len(Cbad)
    print(f'(C) 14 §14.3.4 capacity table vs WBS / margins / 15 ADR-133 addendum: {nc} WBS rows, problems={len(Cbad)}, UNPARSABLE={len(C_) - len(Cbad)}')
    for x in C_: print('\t'.join(map(str, x)))
if 't' in checks:
    t = check_t()
    print(f'(t) open markers={len(t)}')
    for x in t: print('\t'.join(map(str, x)))
sys.exit(1 if nfail else 0)
