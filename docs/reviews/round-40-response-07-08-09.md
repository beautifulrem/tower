# 第 40 轮评审回应：07 / 08 / 09

依据 ADR-166。

| 条目 / 决策 | 处理 | 位置 |
|---|---|---|
| R40-D7-01 / ADR-166（缺失机密文件的失败归类） | §7.4.1 在“缺失程序（exit 127）”之后新增同类规则：<br>• 标准失败且输出中出现未播种的机密本地文件的路径或文件名 → 不产生 `criterion_check`，记 `verify_env_error{stage:"secret_file_unseeded", files}`，不返工、不计返工次数。<br>• 匹配只用路径与文件名，来自 `ProjectLocalFile.secretBy` 非空的条目，不读取文件内容。<br>`outcomeOf` 的 `env_error` 注释列出这两个先例；组合表的 `env_error` 行写明此时的 Needs-You 选项 | `07` §7.4.1、§7.10.3 |
| ADR-166（试运行） | 同一段写明：试运行出现同样情形时不显示“✓ 红灯，可证明完成”，而显示“需要本地机密文件，M1 中无法机器验证”，不算有效红灯；合同批准时给出提示。试运行界面本身在 `04` | `07` §7.4.1 |
| R40-D11-01 / ADR-166（检验检出） | 人工检验检出默认不带机密本地文件。只有人打开“带上本地机密文件（由我自己运行 Agent 的代码）”开关时才写入，记 `HumanDecision{inspect_with_secrets}`，并给出风险文案。M1 不变式改述为“**Tower 不会自动**把机密交给 Agent 可影响的进程” | `07` §7.4.2、§7.4.3 |
| R40-D11-02/03 / ADR-166 | 注册表令牌不由 Tower 保存：安装器阶段 1 每次从用户的 `~/.npmrc` 与项目 `.npmrc` 只读取认证行。钥匙串在 M1 中只存两类。`VerifyProfile.env.vars` 编辑时做机密检查，命中即拒绝保存 | `07` §7.4.3、§7.13 |
| R39/R40-D15-01（`07`） | 原 L985 的“覆盖并完成验证”改为统一文案“覆盖后评审”，在 M2 小节中。逐一核对 `07` 中剩余的 `§7.4.1` 引用：都指向 M1 内容（总流程、进程身份、重放包、生态判定、settle），没有应改指 §7.4.11 的 | `07` §7.4.11.3 |
| ADR-166（`08`） | `verify_env` 行的 `stage` 加入 `secret_file_unseeded`，键为 `ve:{goalId}:secret_file_unseeded`，同一 Goal 内并入同一条目。标注行：“改为 human 标准”或“去掉对该文件的依赖” → `actionable`；不再出现该文件引用且验证通过 → `obsolete` | `08` §8.4、§8.8 |

`09` 无涉及。

lint `--checks rstuvwxyzck`：退出码 1，失败项都在 `16`：
- (s)：`16` `HumanDecision.kind` 缺少 `inspect_with_secrets`、`unmark_secret_file`；
- (v)：`16` §16.5 远程矩阵缺少 `project.local_files.mark_secret`、`project.local_files.unmark_secret`、`inspect.open` 的“仅本机”行。

工时：0.05 人周。

## 需要主干修改的地方

1. **`16`**：
   - `HumanDecision.kind` 加入 `inspect_with_secrets`、`unmark_secret_file`；
   - §16.5 远程矩阵为上述三个命令加“仅本机”行；
   - §16.1.3 `verify_env_error.stage` 加入 `secret_file_unseeded`。
