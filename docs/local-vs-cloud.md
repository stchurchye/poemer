# 本地优先版 vs 云端 API 版 — 功能对照表

诗人手机端当前**默认走本地优先**（`apps/mobile` → `localApi`，不依赖 `dev:api`）。  
**云端 API 版**指配置 `EXPO_PUBLIC_API_URL` 并运行 `apps/api` 时的 legacy 路径。

图例：**✅** 同等 · **⚠️** 小差异 · **❌** 未做 · **📋** 仅云端

---

## 1. 部署与运行

| 项目 | 本地优先版（默认） | 云端 API 版（legacy） |
|------|-------------------|----------------------|
| 启动 App 前是否要起 API | **不需要** | 需要 |
| 数据与 AI | 本机 + 直连厂商 | 经诗人 API |
| 典型文档 | [local-first-data.md](./local-first-data.md) | [deploy-aliyun.md](./deploy-aliyun.md) |

---

## 2. 数据

| 项目 | 本地优先 | 云端 |
|------|----------|------|
| 存储位置 | `shiren-store.json` | `store.json` |
| 导出/导入 | ✅ `.shiren.json` | 拷贝服务器文件 |
| 多设备同步 | ❌ | 隐式单 API |

---

## 3. 问问题

| 能力 | 本地优先 | 云端 |
|------|----------|------|
| 意图分析 + guide | ✅ | ✅ |
| 正式回复（上下文组装） | ✅ `prepareChatContext` | ✅ |
| 带图提问 | ✅ ZenMux 直连 | ✅ |
| 上下文环 / 预览 / 真压缩 | ✅ | ✅ |
| 话题自动命名 | ✅ | ✅ |

---

## 4. 写作小助手

| 能力 | 本地优先 | 云端 |
|------|----------|------|
| 意图 guide / ready:false / directChat | ✅ | ✅ |
| 侧栏聊天（含完整上下文） | ✅ `prepareWritingChatContext` | ✅ |
| 确认改稿 | ✅ `runWritingExecute` + 依据 evaluation/rationale | ✅ |
| Diff 页 `aiSuggest` / 再改一版 | ✅ 含 `runWritingExecuteRetry` | ✅ |
| 上下文环 / 预览 | ✅ | ✅ |
| 首次打开欢迎语 | ✅ `ensureWritingAssistantWelcome` | ✅ |

---

## 5. 语音与识图

| 能力 | 本地优先 | 云端 |
|------|----------|------|
| ASR / TTS | ✅ 百炼直连 | ✅ API 转发 |
| 写作识图 OCR | ✅ ZenMux 或本机 Vision | ✅ |
| 密钥校验 | ✅ 设置页 | ✅ |

---

## 6. 仍有意差异（非隐藏）

| 项 | 说明 |
|----|------|
| 多设备实时同步 | 本地需导出包；云端连同一 API |
| Legacy 诗人 API | 代码保留，默认 mobile 不用 |
| `GlobalApiOfflineBanner` | 未挂载（本地无「连服务器」概念） |

---

## 7. 工程

| 层级 | 本地优先 |
|------|----------|
| 门面 | `api.ts` → `localApi.ts` |
| 存储 | `@shiren/shared` `createLocalStore` |
| AI | `@shiren/engine`（contextPipeline + writingExecute + chat/writing intent） |
| 厂商 | `@shiren/shared` dashscope/zenmux + mobile SecureStore |

*与 `apps/api` 共用 `@shiren/engine` 上下文与改稿执行逻辑，减少双份维护。*
