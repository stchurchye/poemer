# 诗人 — Agent / 开发者手册

> 给后续在 Cursor 里改代码的 Agent 或维护者。产品面向家人单机使用，非 SaaS。  
> 给人看的产品说明见 [项目介绍.md](./项目介绍.md)。

## 1. 项目在干什么

**诗人** 是一款给长辈/家人用的 **中文写作 + 问问题** App：

- **手机端**（Expo React Native，**默认本地优先**）：文稿、版本、聊天存在本机 `shiren-store.json`；`api.ts` 门面全部走 `localApi.ts`。
- **AI**：DeepSeek / ZenMux / 百炼由手机 **SecureStore 密钥直连**，不经过诗人 API。Mobile 路由：**DeepSeek Pro** = 问问题/写作意图、写作改稿、侧栏聊天；**ZenMux Gemini 3.1** = 问问题正文、上下文压缩；**ZenMux Claude Opus** = 问问题带图；**ZenMux Gemini** = 云端 OCR。
- **可选 legacy 服务端**（Hono, 端口 `3921`）：`apps/api` + `store.json`，供自建云部署；与当前默认 mobile 路径**并行**，无自动同步。

**核心原则**：

1. **默认数据在手机**，可导出 `.shiren.json` 换机；legacy 时数据在 `apps/api/data/store.json`（Docker volume）。
2. **写作**与**问问题**两套对话、两套意图流程，不要混用 API。
3. **改稿必须可追溯**：`Revision` + diff 预览 + 接受/拒绝 + 历史回滚。
4. **发送前先意图确认**（问问题、写作小助手），用户点「确定」才真正改稿（写作走 `confirm`）。
5. **产品操作类问题**走 `mode=guide`（`assistantGuideRegistry.ts`），用 App 内弹窗引导。
6. **上下文环 / 真压缩**：完整实现在 `apps/api` 的 `contextPipeline`；本地版 UI 隐藏，见 [local-first-data.md](./local-first-data.md#上下文编排-roadmap)。

## 2. Monorepo 结构

```
apps/mobile/          Expo 54；LocalStoreProvider、localApi、localVendors
apps/api/             Hono API（legacy 可选）
packages/shared/      类型、prompt、createLocalStore、dashscope/zenmux 客户端
packages/engine/      手机端 AI 编排（意图/改稿/问问题，无 SecureStore）
docs/                 local-first、deploy、本文件
docker-compose.yml    仅 legacy API
```

| 包 | 职责 |
|----|------|
| `@shiren/mobile` | UI、本地 JSON 库、SecureStore、`api` → `localApi`（含 contextPipeline、带图问问题、完整改稿执行） |
| `@shiren/engine` | `analyzeWritingIntentLocal`、`analyzeChatIntentLocal` 等 |
| `@shiren/api` | REST、`contextPipeline`、legacy `db.ts` |
| `@shiren/shared` | 类型、prompt、store、厂商 HTTP；改 prompt 常只动这里 |

注意：`apps/mobile/AGENTS.md` 是 **Expo 官方模板**（版本文档链接），不是本项目手册；**本项目 Agent 文档以 `docs/AGENTS.md` 为准**。

## 3. 数据模型（必读）

定义在 `packages/shared/src/types.ts`。

| 实体 | 说明 |
|------|------|
| `Document` | 一篇「文章」，含多 `Chapter`，每章有 `Block`（正文） |
| `Revision` | 改稿版本：`pending` / `accepted` / `rejected`；含 `suggestEvaluation`、`suggestRationale`、`suggestUnderstandingScope` 等 |
| `ChatSession` + `ChatMessage` | 问问题话题与消息 |
| `WritingAssistantMessage` | 按 `documentId` 隔离的写作小助手对话，`kind`: chat / intent_confirm / notice / revision_ready |

文稿级字段：`writingContextSummary`、`documentContextSummary` 用于超长上下文压缩。

## 4. 关键用户流程与代码入口

### 4.1 写作 Tab

| 流程 | 移动端 | API |
|------|--------|-----|
| 正文编辑 | `WritingScreen.tsx` | `PATCH /documents/:id` |
| 文稿库 / 新建 | `DocumentLibraryScreen.tsx` | `GET/POST /documents` |
| 历史版本 | `RevisionHistoryScreen.tsx` | `GET /documents/:id/revisions` |
| 看一看 diff | `DiffPreviewScreen.tsx` + `DiffView.tsx` | `accept` / `reject` |
| 改稿依据展示 | `RevisionBasisBlock.tsx` + `revisionBasis.ts` | 生成 revision 时写入 suggest 字段 |
| 写作小助手 | `WritingAssistantSheet` → `WritingAssistantPanel.tsx` | 见下表 |

**写作小助手 API 顺序**（不要打乱）：

1. `POST .../assistant/intent` — 意图整理（`mode`: `chat` | `revise` | `guide`）
2. 用户确认 intent 气泡 → `POST .../assistant/confirm` — 真正改稿或落库
3. `GET .../assistant/messages` — 拉历史
4. `POST/GET .../assistant/context-usage` — **正文必须用 POST**（勿改回 GET 超长 URL）

意图确认 UI：`ChatIntentConfirmBar.tsx`（问问题与写作共用）。  
产品引导：`apps/mobile/src/lib/assistantGuide.ts` + `packages/shared/src/prompts/assistantGuideRegistry.ts`。

### 4.2 问问题 Tab

| 流程 | 移动端 | API |
|------|--------|-----|
| 发消息 | `ChatScreen.tsx` + `ChatComposeBar` | `POST .../intent` → `POST .../messages` |
| 选图 | `pickChatImage.ts` + `PendingChatImagesStrip` | ZenMux 识图 |
| 话题列表 | `ChatToolsPanel.tsx` | `GET/POST /sessions` |
| 上下文压缩 | `ContextComposerModal` | `POST .../compact` |
| 引导 | `showAssistantGuideAlert` | intent 返回 `guide` |

### 4.3 设置 Tab

`MeScreen.tsx`：密钥、`ApiKeysScreen`、语言（普通话/粤语）、朗读声音、**文章字号 / 对话字号**（`FontPreferencesContext`）。

密钥存手机 `expo-secure-store`，请求头：`X-DeepSeek-Api-Key`、`X-ZenMux-Api-Key`、`X-DashScope-Api-Key`、`X-Reply-Dialect`。

## 5. 上下文与 LLM

| 模块 | 路径 |
|------|------|
| Token 预算 / 小助手记忆 | `packages/shared/src/llm/contextBudget.ts`（默认 300k 窗口，8k 输出预留，摘要上限 100k；UI 展示「压缩后的历史」+「对话内容」，待发送不计入占比） |
| 组装管道 | `apps/api/src/lib/contextPipeline.ts` |
| 自动压缩 | `apps/api/src/lib/contextCompact.ts` |
| 写作上下文过滤 | `packages/shared/src/writingAssistantContext.ts` → `filterWritingMessagesForContext`（取消的确认轮次不进模型） |

问问题与写作小助手 **各自** `prepare*Context` / `preview*ContextUsage`，改一处要检查是否需对称修改。

**Persona / 语言**：`packages/shared/src/prompts/persona.ts`，随 `X-Reply-Dialect`（mandarin | cantonese）。粤语称呼用「姐姐」，不用「阿姐」。

## 6. 移动端字号体系（易踩坑）

| Hook | 用途 |
|------|------|
| `useLayout()` | **壳层固定「大」**：Tab、设置页、工具栏等 |
| `useTypography('article')` | 写作正文、diff 编辑框、小助手底部输入 |
| `useTypography('dialog')` | 问问题、小助手**气泡**、意图确认条 |
| `useTextStyles(channel)` | 气泡样式封装 |

预设：`theme/fontPresets.ts` + `FontPreferencesContext` + SecureStore `shiren_font_article` / `shiren_font_dialog`。

Provider 挂在 `App.tsx` 的 `FontPreferencesProvider`。

## 7. 朗读与等待反馈

- TTS：`apps/mobile/src/lib/tts.ts`
- 小助手等待/回复：`apps/mobile/src/lib/assistantFeedback.ts`
- 短等待：`getAssistantThinkingLine`；**28 秒后**换 `thinkingLongZh` / `thinkingLongYue` 并 **TTS 念出**（`WritingAssistantPanel`、`ChatScreen` 的 `setTimeout(28_000)` + `announceAssistantWaiting`）

## 8. Android 开发与权限验收

原生目录 `apps/mobile/android`、`ios` 由 `expo prebuild` 生成（已 gitignore），权限声明在 `apps/mobile/app.json`（`android.permissions`、`ios.infoPlist`、`plugins`），运行时统一走 Expo 模块：

| 能力 | 代码入口 |
|------|----------|
| 选相册 / 拍照 | `src/lib/pickChatImage.ts` |
| 按住说话 / 本地听写 | `src/lib/speech/localRecognition.ts`（Android 会触发 `prepareAndroidOfflinePack`） |
| 保存章节长图 | `src/lib/chapterShare.ts` |
| 应用内临时文件 | `src/lib/fsLegacy.ts`（私有 cache，不需存储权限） |

**开发 API 地址**：Android 模拟器默认 `http://10.0.2.2:3921`（见 `src/lib/config.ts`）；真机用 `EXPO_PUBLIC_API_URL=http://电脑IP:3921`。

**本地跑 Android**：

```bash
cd apps/mobile
npx expo prebuild --platform android   # 首次或改 app.json 插件后
npm run android                        # 或连接真机后 expo run:android --device
```

**EAS 内测包**：`npm run build:android`（preview APK）。打包前在 [eas.json](../apps/mobile/eas.json) 或 EAS 控制台设置 `EXPO_PUBLIC_API_URL`；详见 [deploy-aliyun.md](./deploy-aliyun.md)。

**改权限后必测（真机或模拟器）**：

1. 问问题 / 写作：选相册识图 → 拒绝后提示 `ocrPermissionDenied`
2. 拍照识图 → 拒绝后提示 `cameraPermissionDenied`
3. 按住说话 → 拒绝麦克风后提示权限文案；Android 首次注意离线中文语音包
4. 写作「保存长图到相册」→ 拒绝后 `sharePermissionDenied`
5. （可选）配置百炼密钥后云端听写：确认 `expo-av` 录音可用

听写错误文案按平台分支：`src/lib/speech/errors.ts`（Android 指向应用权限 / Google 语音识别，非 Siri）。

## 9. 部署与数据

- 开发：`npm run dev:api` + `npm run dev:mobile`
- Docker：`npm run docker:up`，数据 **`./apps/api/data/store.json`**
- 腾讯云：API 常驻云上，手机 `EXPO_PUBLIC_API_URL` 指向公网 — [deploy-tencent-cloud.md](./deploy-tencent-cloud.md)
- **无登录鉴权**；公网需安全组限 IP 或 Nginx + HTTPS

## 10. 历史问题与已做决策（避免回归）

| 问题 | 处理 |
|------|------|
| 问问题/写作意图应对齐 | 先 `*/intent`，再确认发送；写作 `confirm` 才真正改稿 |
| 取消的意图/确认不进 LLM 上下文 | `filterWritingMessagesForContext` |
| 写作小助手上下文 0% 且点不开 | 上下文用量 **POST**；点击无数据则 refresh 再开详情 |
| GET context-usage 带整章正文 URL 过长失败 | 禁止改回 GET |
| Docker 重建丢稿 | `docker-compose` volume `./apps/api/data` |
| 「新建文章」进文稿库二级页 | `DocumentLibrary`，非直接 create |
| 文稿库 UI | 标题大号；无「改名称」；复制在标题后；「修改于… · 共x章」 |
| Tab 文案 | 「问问题」「设置」 |
| 问问题发图按钮 | 「选择图片」 |
| 写作小助手气泡 vs 输入字号 | 气泡 `dialog`，底部输入 `article` |
| 产品引导 | `mode=guide` + `assistantGuideRegistry` |
| `docs/AGENTS.md` 丢失 | 以 `docs/AGENTS.md` 为准，勿与 `apps/mobile/AGENTS.md`（Expo 模板）混淆 |

## 11. 大文件（重构时优先拆）

- `WritingScreen.tsx` (~1500 行)
- `WritingAssistantPanel.tsx` (~1100 行)
- `ChatScreen.tsx` (~900 行)
- `contextPipeline.ts` (~500 行)

## 12. 改动检查清单

- [ ] `npm run build -w @shiren/shared`（改了 shared）
- [ ] `npm run typecheck -w @shiren/mobile`
- [ ] 改了 API 路由 → 重启 `dev:api`，并更新 `apps/mobile/src/lib/api.ts`
- [ ] 改 prompt → 评估 mandarin + cantonese
- [ ] 勿提交 `apps/api/data/store.json`、`.env`、密钥

## 13. 明确未做 / 不要做

- 无自动化测试（改核心逻辑建议手测或补测）
- 无多用户鉴权、无独立「手机同步协议」（API = 唯一数据源）
- 无飞书导出（README 待接）
- 不要未经用户要求 git commit / force push

## 14. 文案单一来源

`apps/mobile/src/locales/zh-CN.ts` — UI 中文尽量只改这里。

---

维护者：改完架构级行为请同步更新本文件与 [项目介绍.md](./项目介绍.md)。
