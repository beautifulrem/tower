# 第 7 轮评审回应：07 / 08 / 09

依据 ADR-096 – ADR-100 与 ADR-092 的修订。

| 条目 / 决策 | 处理 | 位置 |
|---|---|---|
| R7-D7-01 / ADR-098 | 运行器集合从 lockfile **解析图**确定（别名展开后的真实包名与版本，含 `npm:` 别名）；运行器身份 =（真实包名、注册表来源、版本），以 base 的 lockfile 为参照：补丁/覆盖（含 `pnpm-workspace.yaml` 的 `overrides`/`catalog`/`packageExtensions`/`patchedDependencies`）、别名、非注册表来源（含指向非已配置注册表的 `resolution.tarball`）→ `runner_patched` sev 2；版本变化 → 同 detector sev 1 提示；上述 workspace 键纳入 lifecycleIndirection；用例 P37、P38 | `07` §7.4.3、§7.5.1 |
| R7-D7-02 / ADR-092 修订 | 安装阶段对共享缓存（pnpm store、npm cache、`$VS/xdg`、`$SH` 含 node-gyp、其他 depcache）一律只读，只写本次暂存目录；关闭 pnpm 副作用缓存；只读 store 不可行的版本改用暂存目录内的 store CoW 私有副本；P34 验收增加“安装前后 store 与 `$SH` 树哈希不变”与“只读 store 下离线安装/rebuild 成功” | `07` §7.4.3 |
| R7-D10-01 (b) | 预取在添加项目与 lockfile 变化时后台预热；仍在关键路径时 Live Line 显示 `preparing · 预取 · …` / `verifying · 预取 · …`；耗时由 SP5 测量登记，不计入 5 s 物化预算；`08` 的 `preparing` 子状态（创建卫星 / 物化依赖 / 预取） | `07` §7.4.3；`08` §8.6.5 |
| ADR-096 | 嵌套仓库扫描同时识别裸仓库布局目录（`HEAD` + `objects/` + `refs/`）；沙箱外 git 注入 `safe.bareRepository=explicit`（清单在 `10` §10.1.2）；扫描预算与频率归 `10`/`13`（R7-D10-01a） | `07` §7.3.2 |
| ADR-100 | seal 说明的提交信息改由 Tower 自行只读解析卫星 gitdir 中的对象（大小与数量上限、`O_NOFOLLOW`、超时、不读 config/include/alternates），不再运行 git；Tower 对卫星 gitdir 只有四种操作 | `07` §7.3.2 |

## 需要主干修改的地方

1. **`14`**：登记 P37、P38；P34 验收条件按上表扩充。
2. **`16` §16.8.1**：按 I-fetch / I-prefetch / I-install 三列重写写入行（I-install 对 store、`$VS/xdg`、`$SH` 只读；`side-effects-cache=false`）；`runner_patched` 的 sev 1 提示变体。
3. **`02` §2.5 / `11` §11.3.3**：默认 protected 加入 `pnpm-workspace.yaml` 的 `overrides`/`catalog`/`catalogs`/`packageExtensions`/`patchedDependencies` 键（ADR-098）。
