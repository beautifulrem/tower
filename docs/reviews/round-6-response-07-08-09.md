# 第 6 轮评审回应：07 / 08 / 09

依据 ADR-089 – ADR-095。

| 条目 / 决策 | 处理 | 位置 |
|---|---|---|
| R6-D7-01 / ADR-092 | 运行器完整性基准改为**注册表 tarball**（按 lockfile `integrity` 校验后解包的逐文件哈希，记在 Tower 数据库）；补丁 / overrides / resolutions / packageExtensions 涉及运行器，或运行器解析为 link:/file:/git → `runner_patched`（severity 2，结论最高为“有保留”）；`.pnpmfile.cjs`、补丁文件与上述键纳入 lifecycleIndirection（protected）；用例 P32、P33 | `07` §7.4.3、§7.5.1、§7.10.1 |
| R6-D7-02 / ADR-092 | 安装阶段只写本次运行的新暂存目录，`$VS` 其余只读、`$TI` 读写拒绝；Supervisor 校验后原子 rename 发布；depcache 来源记录在 Tower 数据库，无来源记录的条目视为不存在并删除（`verifier_store_tampered`）；用例 P34 | `07` §7.4.3 |
| R6-D7-03 / ADR-093 | 拉取与安装之间加入**预取**步骤（无令牌、只允许已登记下载域名、只运行 Tower 内置预取器）；`VerifyProfile.prefetch` 由人批准；离线安装缺下载 → `verify_env_error{stage:"install", missing:"download"}`；git 托管依赖在 M1 按“生态未支持”处理（拉取时会执行其 prepare）；pin 的 Node 声明与 `VerifyProfile.node` 不同 → 用 pin 的版本验证、结论为“有保留”、生成 ratify 条目；用例 P35、P36 | `07` §7.4.1、§7.4.3、§7.13 |
| R6-D10-01 (a) | 运行器复核改为“ctime/inode 快照 + 变化文件内容哈希”，以注册表基准比对；目标 ≤ 1 s（100–300 MB），ctime 不可信的文件系统回退全量哈希 | `07` §7.4.3 |
| R6-D6-01 / R6-D16-01 / ADR-095 | 永久重放包只限决定性验证；其余保留到归档后 30 天；保留 ref 只为永久包而写；输出每条标准 ≤ 2 MB；磁盘压力先清非永久包；瘦 bundle 不在本地重复存储（对象由镜像保留 ref 保全，导出时才生成）；重放按 lockfile 重新拉取，依赖不可获得即“不可重放”，运行器必须与 integrity 一致、其余依赖差异计数报告；“淘汰后重放成功率”由 G18 测量并登记为风险 | `07` §7.4.1 |
| R6-D12-01 | `09` 拆分规则与 ADR-087 对齐：记忆复制到双方并标“继承，待复审”；新项目信任 untrusted；VerifyProfile 复制后各自演化；Goal 归属以 `02` §2.3 为准 | `09` §9.12.3 |
| R6-D14-01 (d) | 删除 `07` 映射表中的“建议新增”残留（P21–P31 已在 `14` 登记）；新用例 P32–P36 请 `14` 登记 | `07` §7.4.3 |
| ADR-089 | 卫星 gitdir 整体归 Agent 可写；Tower 不读其中任何内容作为判定依据；两条不变式与原始文件操作防劫持写入 §7.3.2；`git_control_tampered` 退役（删除严重度表行与分类清单） | `07` §7.3.2、§7.10.1 |
| ADR-090 | 垫片对继承的 `GIT_DIR`/`GIT_WORK_TREE` 同样逐次判定 | `07` §7.3.2 |

## 需要主干修改的地方

1. **`14` §14.2**：登记 P32–P36。
2. **`16`**：detector 增加 `runner_patched`（sentinel，sev 2）；`verify_env_error.missing` 增加 `download`；预取下载域名清单与 `VerifyProfile.prefetch` 字段；`tower verify --export`。
3. **`02` §2.5 / `11` §11.3.3**：默认 protected 加入 `.pnpmfile.cjs`、补丁文件、`overrides`/`resolutions`/`pnpm.overrides`/`pnpm.packageExtensions` 键。
4. **`02` §2.3**：写明拆分后 Goal 的归属规则（ADR-087），`09` 已改为引用。
