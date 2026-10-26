# git 隔离方案实验（回应 R3-D11-01、R3-D13-01；支撑 ADR-060）

环境：macOS，git（Apple 自带版本 ≥ 2.40），2026-10-15，`/tmp/towergit`。

## 方案
- **用户仓库** `user/`：用户主检出，Agent 永不写入。
- **卫星克隆** `wtroot/G1`：`git clone --shared --no-checkout user wtroot/G1` + `checkout -b tower/G1 <base>`。自有 `.git`（refs、objects、config 均为 Agent 所有），通过 alternates 只读引用用户对象库。
- **Tower 影子 git 目录** `shadow.git`（裸库，位于 Agent 不可写的 Tower 数据目录）：`objects/info/alternates` 指向用户对象库。Tower 所有对工作区的 git 操作都以 `--git-dir=shadow.git --work-tree=wtroot/G1` 执行，并加 `GIT_CONFIG_NOSYSTEM=1 -c core.fsmonitor=false -c core.hooksPath=/dev/null`。

## 步骤与结果
1. Agent 在卫星中提交，并植入恶意配置：`core.fsmonitor="touch PWNED_fsmonitor"`，`.gitattributes` `*.txt filter=evil` + `filter.evil.clean="sh -c 'touch PWNED_filter; cat'"`，再修改 `a.txt`。
2. 用户仓库：`git log --all` 只有 base；`git fsck` 通过（Agent 的提交不进入用户仓库）。
3. 影子目录 `add -A` + `write-tree`：成功；**无 PWNED 文件**（影子配置中没有 `filter.evil` 驱动，属性引用未定义驱动时 git 视为无过滤；fsmonitor 被 `-c` 关闭，且卫星配置根本不被读取）。`ls-files` 显示 `.gitattributes a.txt b.txt`——**卫星的 `.git` 自动被排除**。
4. `commit-tree` 生成 pin（父 = base），在影子目录 `update-ref refs/tower/G1/pin`，然后在用户仓库 `git fetch <shadow> refs/tower/G1/pin:refs/tower/G1/pin`：成功（注：直接按裸 SHA fetch 会被 upload-pack 拒绝，必须先建 ref）。
5. 用户仓库 `fsck`、`gc`、`log --all` 全部正常；`show pin:a.txt` 内容正确（含 Agent 未提交的改动）。

## 结论
- Agent 的 git 活动被限制在卫星仓库，用户仓库永远不会出现悬空 ref（R3-D13-01 消除）。
- Tower 从不在 Agent 可控的 git 配置/索引/`.git` 指针上运行 git（R3-D11-01 消除）；属性文件只能引用影子配置中定义的驱动（影子配置不定义任何驱动）。
- 余留风险：卫星通过 alternates 依赖用户对象；用户仓库 `gc --prune` 只会删除不可达对象，Tower 在用户仓库保留 `refs/tower/<goalId>/base` 使 base 可达；Agent 新对象在卫星自身。用户手动删除对象库属外部破坏，按 `10` 恢复流程处理。

## 补充实验（ADR-081，第 5 轮）

`/tmp/t81`：`git clone --shared --no-checkout --separate-git-dir=<gitdirs>/G1 user <wt>/G1`，删除 `<wt>/G1/.git` 指针文件。

1. Agent 环境（`GIT_DIR=<gitdirs>/G1 GIT_WORK_TREE=<wt>/G1`）：`checkout -b tower/G1`、`add -A`、`commit` 全部成功，`log` 正常。
2. 沙箱外进程在 `<wt>/G1` 中运行 `git status`（`GIT_CEILING_DIRECTORIES=<wt>`）：`fatal: not a git repository` —— 不会读取任何 Agent 可写的 git 元数据。
3. 用户仓库 `fsck` 正常。（设计中 alternates 指向 Tower 镜像库而非用户对象库，ADR-073。）

## 补充实验（ADR-089，第 6 轮）

`/private/tmp/t89`，macOS `sandbox-exec`，策略：`(allow default)` + 拒绝写用户仓库 `subpath` + 拒绝写 `regex ^<wt>/(.*/)?\.git(/|$)`。

- Agent 环境（`GIT_DIR`/`GIT_WORK_TREE` 指向分离 gitdir，**gitdir 整体可写**）：`commit`、`revert`、`stash`/`stash pop`、`rebase --exec`、`gc` 全部成功。
- `git init sub`（嵌套仓库）被拒绝；在工作目录根创建 `.git` 被拒绝；写用户仓库被拒绝。
- **实现要点**：第一次运行时三条拒绝全部失效——策略中的路径写的是 `/tmp/...`，而 Seatbelt 按真实路径（`/private/tmp/...`）匹配。**生成 Seatbelt 策略时所有路径必须先 `realpath` 规范化**；SP6 的策略生成器单元测试需覆盖符号链接路径（`/tmp`、`/var`、用户自建符号链接目录）。

## 补充实验（ADR-096、ADR-097，第 7 轮）

- **裸仓库布局**：在一个 `git init --bare` 的目录中运行 `git rev-parse --git-dir`：默认被识别为仓库（输出 `.`）；注入 `GIT_CONFIG_*`：`safe.bareRepository=explicit` 后报 `cannot use bare repository … (safe.bareRepository is 'explicit')`。ADR-096 成立。
- **垫片 exec-path**：构造一个目录，内含指向真实 `git --exec-path` 下各程序的符号链接，其中 `git` 换成记录调用的垫片；以 `GIT_EXEC_PATH=<该目录>` 运行 `git rebase --exec 'git rev-parse HEAD'`，嵌套的 `git` 调用经过了垫片（日志 1 条）。ADR-097 主方案成立；SP6b G20 仍在各支持的 git 版本上回归。
