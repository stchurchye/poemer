# 问问题 / 写作小助手 / 语音 · 链路排查报告

**日期：** 2026-05-31  
**范围：** 欠费/密钥/网络/响应格式（未改 App 文案）

---

## 1. 密钥验证（设置页同等逻辑）

| 项目 | 结果 | 说明 |
|------|------|------|
| DeepSeek（App SecureStore） | **未在本机 CLI 测到** | 密钥仅存于真机/模拟器 SecureStore，仓库与 shell 均无 `DEEPSEEK_API_KEY` |
| ZenMux（App SecureStore） | **未在本机 CLI 测到** | 同上 |
| DeepSeek API 网络 | ✓ 可达 | `HEAD https://api.deepseek.com` → HTTP 401（服务在线） |
| ZenMux API 网络 | ✓ 可达 | `HEAD https://zenmux.ai/api/v1` → HTTP 200 |

**请在 App 内执行（与计划 1.1 一致）：**

1. **我的 → API 密钥 → DeepSeek「测试一下」**（或保存时自动测）
2. **我的 → API 密钥 → ZenMux「测试一下」**

失败时记录弹窗**完整原文**（ZenMux 常会直接显示 `error.message`，比主流程「AI 模型暂时没响应」更具体）。

**CLI 复测（与 App 相同逻辑）：**

```bash
DEEPSEEK_API_KEY=sk-... ZENMUX_API_KEY=... npm run diagnose:llm
```

---

## 2. curl 对照（无效密钥 · 欠费文案形态）

| API | HTTP | error.message 示例 |
|-----|------|-------------------|
| DeepSeek `deepseek-v4-pro` | 401 | `Authentication Fails, Your api key: ****test is invalid` |
| ZenMux `gemini-3.1-flash-lite` | 403 | `You have no permission to access this resource` |

**欠费/配额典型关键词：** `402`、`insufficient balance`、`quota`、`余额`、`billing`、`credit`  
**密钥错误：** `401`、`invalid`、`Authentication Fails`

---

## 3. 业务链路（Node 脚本等价于 App localApi）

脚本 [`scripts/diagnose-llm-paths.mjs`](../../scripts/diagnose-llm-paths.mjs) 覆盖：

| 链路 | 脚本章节 | 依赖 |
|------|----------|------|
| 问问题 · 文字意图 | §3 analyzeChatIntentLocal | DeepSeek |
| 问问题 · 正文回答 | §3 completeChatMessages (GPT-5.4 + webSearch) | ZenMux |
| 问问题 · 语音 LLM 段 | §4 analyzeChatIntentLocal source=voice | DeepSeek（听写本身需真机/百炼） |
| 写作 · 闲聊意图 | §5 analyzeWritingIntentLocal | DeepSeek |
| 写作 · 改稿意图 | §5 analyzeWritingIntentLocal | DeepSeek |
| 写作 · 侧栏回答 | §5 completeChatMessages (flash-lite) | ZenMux |

**本次 CLI 执行结果：** 因无密钥，§1–§5 均为「未设置密钥」，无法判定欠费与否。

---

## 4. 真机 UI 测试清单（需您在 iPad/真机完成）

前提：设置页 DeepSeek + ZenMux 测试均通过。

| 链路 | 听写/输入 | 意图理解 | 最终回复/改稿 | 记录 |
|------|-----------|----------|---------------|------|
| 问问题·文字 | — | 待测 | 待测 | |
| 问问题·语音 | 待测 | 待测 | 待测 | 模拟器听写常不可用 |
| 写作·文字闲聊 | — | 待测 | 待测 | |
| 写作·改稿 | — | 待测 | 待测 | |
| 写作·语音 | 待测 | 待测 | 待测 | |

**阶段判断：**

- 「正在理解您的话…」即报错 → **DeepSeek 意图**（[`localModelClient.ts`](../../apps/mobile/src/lib/localModelClient.ts)）
- 已出现确认条，点「确定发送」后报错 → **ZenMux 回答**（问问题）或 **DeepSeek 改稿**（写作）

---

## 5. 结论与优先排查顺序

### 5.1 当前可确认

1. **网络正常**，DeepSeek / ZenMux 端点均可访问。
2. **错误文案「AI 模型暂时没响应」** 仅来自 DeepSeek 客户端：HTTP 非 2xx，或 `choices[0].message.content` 不是非空字符串（[`localModelClient.ts:45-50`](../../apps/mobile/src/lib/localModelClient.ts)）。
3. 问问题/写作的**意图阶段**、写作**改稿**都走 DeepSeek；问问题**正文**与写作**侧栏闲聊**走 ZenMux。

### 5.2 欠费 vs 非欠费（待您补密钥后确认）

| 若设置页测试… | 优先怀疑 |
|---------------|----------|
| DeepSeek 失败，ZenMux 通过 | DeepSeek 欠费/密钥/账号权限 |
| DeepSeek 通过，ZenMux 失败 | ZenMux 欠费/配额 |
| 两者均失败 | 分别查两个控制台余额 |
| 两者均通过，主流程仍失败 | 见 5.3 |

### 5.3 非欠费强假设：DeepSeek V4 默认 Thinking 模式

代码使用 `deepseek-v4-pro`，且 **未** 传 `extra_body.thinking` 或 `reasoning_effort`。  
V4 Pro 默认开启 thinking，短请求（如 verify 的 `max_tokens: 8`）可能只返回 `reasoning_content` 而 **`content` 为空**，触发与欠费相同的 `MODEL_BAD_RESPONSE`。

诊断脚本在检测到「HTTP 200 + content 空 + 有 reasoning_content」时会自动再测 `thinking: disabled`。

**若您设置页 DeepSeek 测试也报「AI 模型暂时没响应」，但平台余额充足，极可能是此问题而非欠费。**

后续修复方向（单独 PR，本次未改文案）：

- 意图/verify/改稿请求加 `extra_body: { thinking: { type: 'disabled' } }`，或
- 解析时 fallback `reasoning_content`，或
- 意图改用 `deepseek-v4-flash`

---

## 6. 交付物索引

- 诊断脚本：`npm run diagnose:llm`
- 本报告：`docs/diagnostics/llm-path-report-2026-05-31.md`
- App 内测试：我的 → API 密钥 → 两个「测试一下」
