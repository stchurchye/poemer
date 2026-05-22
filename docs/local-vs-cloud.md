# 本地优先版 vs 云端 API 版 — 功能对照表

诗人手机端当前**默认走本地优先**（`apps/mobile` → `localApi`，不依赖 `dev:api`）。  
**云端 API 版**指配置 `EXPO_PUBLIC_API_URL` 并运行 `apps/api`（Hono + `store.json`）时的历史路径，代码仍保留，便于自建服务器或日后同步。

图例：

| 符号 | 含义 |
|------|------|
| ✅ | 行为基本一致，可日常使用 |
| ⚠️ | 可用，但能力简化或与云端不等价 |
| ❌ | 本地版未实现或故意关闭 |
| 📋 | 仅云端路径需要；本地版可忽略 |

---

## 1. 部署与运行

| 项目 | 本地优先版（默认） | 云端 API 版（legacy） |
|------|-------------------|----------------------|
| 启动 App 前是否要起 API | **不需要** | 需要 `npm run dev:api` 或 Docker |
| 手机环境变量 | 三个厂商密钥（SecureStore），**可不设** `EXPO_PUBLIC_API_URL` | 必须设 `EXPO_PUBLIC_API_URL`（如 `http://公网IP:3921`） |
| 数据与 AI 是否经诗人服务器 | **否**（数据本机；AI 直连 DeepSeek / ZenMux / 百炼） | **是**（数据与密钥在 API 机） |
| 典型部署文档 | [local-first-data.md](./local-first-data.md) | [deploy-aliyun.md](./deploy-aliyun.md)、[deploy-tencent-cloud.md](./deploy-tencent-cloud.md) |
| `apps/api` 状态 | 可选、未接自动同步 | 主路径 |

---

## 2. 数据存储与迁移

| 项目 | 本地优先版 | 云端 API 版 |
|------|-----------|-------------|
| 文稿 / 版本 / 问问题 / 小助手记录 | 本机 `shiren-store.json` | 服务器 `apps/api/data/store.json` |
| 自动备份 | `shiren-store.bak.json` | 需自行 crontab 拷贝 `store.json` |
| 换手机 | 设置 → **导出** `.shiren.json` → 新手机 **导入** | 连同一台 API 即见数据；或拷贝服务器 `store.json` |
| 导出包是否含 API 密钥 | **不含** | N/A（密钥在服务器 `.env`） |
| 导入策略 | 整库替换（导入前自动备份） | 无手机侧导入 |
| 多设备实时同步 | ❌ 第一版不做 | 隐式「单服务器多端」 |
| 交换格式 | `PersistedStore` / `.shiren.json` | 同结构 `store.json`（便于日后对齐） |

---

## 3. 连通性与设置 UI

| 项目 | 本地优先版 | 云端 API 版 |
|------|-----------|-------------|
| 设置页「服务器连接」 | ❌ 已移除 → **本地数据** 卡片 | 需填 API 地址并测 `/health` |
| 全局「连不上服务」条 | ❌ 已不挂载 `GlobalApiOfflineBanner` | 有（`ApiConnectivityContext`） |
| `ApiConnectivityContext` | ⚠️ 仍存在，会 ping `API_BASE_URL/health`（与默认路径无关，易误导） | ✅ 有意义 |
| `api.ts` 中 HTTP `request()` | ❌ 已无调用（死代码） | 原实现 |

---

## 4. 文稿与版本（CRUD）

| `api` 能力 | 本地优先版 | 云端 API 版 |
|------------|-----------|-------------|
| 列表 / 新建 / 读 / 改 / 加章 | ✅ `createLocalStore` | ✅ `db.ts` |
| 历史版本列表 / 单条 / 接受 / 拒绝 | ✅ | ✅ |
| 回滚 | ✅ `source: 'rollback'` | ✅ |
| 写作小助手消息列表 | ✅ 含欢迎语逻辑 | ✅ |
| 问问题会话 / 消息 | ✅ | ✅ |
| 隐藏文稿（`hiddenAt`） | ✅ UI 过滤 | ✅ |

---

## 5. 问问题（Chat Tab）

| 能力 | 本地优先版 | 云端 API 版 |
|------|-----------|-------------|
| 意图分析（发送前整理） | ⚠️ 使用 `@shiren/shared` 的 `chatIntentPrompt` + `@shiren/engine` | ✅ `deepseekChatIntent` + 同套 shared prompt |
| 引导卡片（`guide` / `ready: false`） | ⚠️ engine 可解析 guide；与云端同类 | ✅ |
| 正式回复 | ⚠️ 简化 system prompt + 最近 12 条历史 | ✅ `contextPipeline`：人设、方言、块选择、预算 |
| **带图片提问** | ❌ `sendChatMessage` 有图即报错（未接 ZenMux 多模态） | ✅ ZenMux 识图模型 |
| 上下文环 / 用量百分比 | ❌ UI 隐藏；接口返回空 `contextUsage` | ✅ 真实 token 估算与环 |
| 上下文预览 / 勾选块 | ❌ 空 preview；UI 隐藏 | ✅ |
| 发送「压缩上下文」 | ⚠️ 仅插入固定话术，**无 LLM 压缩** | ✅ `compactChatSession` + 写回 session |
| 密钥存放 | 手机 SecureStore → 直连 DeepSeek | 服务器 `.env` |

---

## 6. 写作小助手

| 能力 | 本地优先版 | 云端 API 版 |
|------|-----------|-------------|
| 意图分析 prompt | ✅ `@shiren/shared` `writingIntentPrompt` + engine | ✅ 同 prompt + `contextPipeline` 组消息 |
| `mode: guide`（功能引导） | ✅ | ✅ `assistantGuideRegistry` |
| `ready: false`（先澄清再确认） | ✅ | ✅ 多轮澄清 |
| **直接聊天**（`directChat: true`） | ✅ `generateWritingChatReplyLocal` | ✅ 独立 chat + 完整上下文 |
| 发送 / 确认改稿主路径 | ✅ `sendWritingAssistantMessage` + `confirmWritingAssistant` | ✅ |
| 生成修订快照 | ⚠️ `generateRevisionSnapshotLocal` 简化 prompt | ✅ `ACTION_PROMPTS` + 执行上下文 + evaluation/rationale |
| Diff 页重试 `aiSuggest` | ⚠️ 同简化生成 | ✅ 完整执行管线 |
| 写作上下文环 / 预览 / compact | ❌ UI 隐藏；空 usage / 假 compact | ✅ |
| 方言（回复口吻） | ⚠️ 意图侧部分使用；回复生成未完全对齐 | ✅ header + pipeline |

---

## 7. 语音、识图、朗读

| 能力 | 本地优先版 | 云端 API 版 |
|------|-----------|-------------|
| 按住说话 → 文字 | ✅ 百炼 ASR **手机直连** | ✅ API 转发百炼 |
| 朗读（TTS） | ✅ 百炼 **手机直连** | ✅ API 转发 |
| 写作/设置页识图 OCR | ⚠️ 有 ZenMux 密钥 → `ocrImage` 直连；否则 **本机 ML Kit** | ✅ 经 API → ZenMux（服务器密钥） |
| 问问题发图 | ❌ 见 §5 | ✅ ZenMux |
| 密钥校验 | ✅ 各厂商直连探测 | ✅ `/api/settings/*` |

---

## 8. AI 与工程实现对照

| 层级 | 本地优先版 | 云端 API 版 |
|------|-----------|-------------|
| 业务门面 | `apps/mobile/src/lib/api.ts` → `localApi.ts` | 同 `api.ts` 形状，原 HTTP |
| 存储 | `@shiren/shared` `createLocalStore` | `apps/api/src/store/db.ts`（同源逻辑） |
| 编排 | `@shiren/engine`（简化） | `apps/api/src/lib/contextPipeline.ts`（完整） |
| 厂商 HTTP | `@shiren/shared` dashscope/zenmux + mobile `localVendors` | `apps/api` 内封装 |
| 单测 | `createLocalStore` 等 11 项（shared） | 无自动化 CI |

---

## 9. 安全与运维

| 项目 | 本地优先版 | 云端 API 版 |
|------|-----------|-------------|
| 诗人 API 鉴权 | N/A | ❌ 无登录；靠 IP 白名单 + 不暴露公网 |
| 密钥暴露面 | 仅在用户手机 | 在服务器 `.env` |
| 导出包 | 明文 JSON，需妥善保管 | — |
| Android 明文 HTTP | `usesCleartextTraffic` 主要为 legacy 连 HTTP API | 连自建 HTTP 时需要 |
| 日志 / `requestId` | 本地 `local-{timestamp}` | 服务器 requestId |

---

## 10. 汇总：给家人 / 产品怎么选

| 场景 | 建议 |
|------|------|
| 日常写作、问问题、换机备份 | **本地优先版** + 定期导出 `.shiren.json` |
| 多台手机**不导出**就要同一份稿 | 暂用 **云端 API 版** 或等以后同步方案 |
| 问问题经常**发照片** | 当前用 **云端**；本地版待接 ZenMux 多模态 |
| 写作要强「先问清楚再改」、功能引导 | **云端** 更完整；本地版会跳过部分澄清 |
| 不想维护服务器 | **本地优先版** |

---

## 11. 已知待对齐项（代码位置速查）

| 差距 | 本地实现 | 云端参考 |
|------|----------|----------|
| 改稿执行 prompt 简化 | `generateRevisionSnapshotLocal` | `ACTION_PROMPTS` + 执行上下文 |
| 问问题带图 | `localApi.ts` `sendChatMessage` 直接拒绝 | `chat.ts` ZenMux 多模态 |
| 上下文 UI | `localFirst.ts` `LOCAL_FIRST_HIDE_CONTEXT_UI` | `contextPipeline.ts` |
| 假 compact | `localApi.ts` `compactChatSession` | `contextCompact.ts` |

---

## 相关文档

- [local-first-data.md](./local-first-data.md) — 本地模式使用说明  
- [superpowers/plans/2026-05-22-local-first-data.md](./superpowers/plans/2026-05-22-local-first-data.md) — 实施计划与 API 矩阵  
- [deploy-aliyun.md](./deploy-aliyun.md) — 云端 API 部署（legacy）

*最后更新：与当前工作区 local-first 实现一致；云端行为以 `apps/api` 为准。*
