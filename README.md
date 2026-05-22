# 诗人 — 家人辅助写作 App

双端（Expo）+ 可选 Node API。**默认本地优先**：文稿、版本、聊天记录在手机；AI 与听写/朗读/识图直连模型厂商。写作与问问题分开；增删对比与版本回滚；全中文界面。

**文档**

| 读者 | 文档 |
|------|------|
| 家人 / 产品 | [docs/项目介绍.md](docs/项目介绍.md) |
| 开发者 / Agent | [docs/AGENTS.md](docs/AGENTS.md) |
| 本地数据与密钥 | [docs/local-first-data.md](docs/local-first-data.md) |
| 本地 vs 云端对照 | [docs/local-vs-cloud.md](docs/local-vs-cloud.md) |

## 结构

```
apps/mobile       # Expo React Native（默认不连诗人 API）
apps/api          # Hono API（可选 legacy，端口 3921）
packages/shared   # 类型、prompt、本地 store、厂商客户端
packages/engine   # 手机端 AI 编排（@shiren/engine）
```

## 快速开始（本地优先，推荐）

```bash
npm install          # 会 build @shiren/shared 与 @shiren/engine
npm run dev:mobile
```

1. 打开 App → **设置** 填写 DeepSeek / ZenMux / 百炼密钥（按需）。
2. 写作、问问题**无需**启动 `dev:api`。
3. **设置 → 本地数据**：导出 `诗人数据-*.shiren.json` 备份；换手机后导入。

验证：`npm run typecheck` · `npm run test -w @shiren/shared`

### Android 内测 APK

```bash
cd apps/mobile
npx expo prebuild --platform android   # 改 app.json 权限后需重跑
npm run build:android                  # EAS preview APK
```

本地优先构建**不需要**配置 `EXPO_PUBLIC_API_URL`。权限手测见 [docs/AGENTS.md](docs/AGENTS.md) 第 8 节。

## 可选：自建 API（legacy）

若需「多台手机连同一台服务器、数据在云上」，见 [docs/deploy-tencent-cloud.md](docs/deploy-tencent-cloud.md) / [docs/deploy-aliyun.md](docs/deploy-aliyun.md)。当前默认 mobile 构建**不**走 HTTP API。

```bash
cp .env.example .env    # DEEPSEEK_API_KEY 等
npm run docker:up       # 端口 3921
curl http://localhost:3921/health
```

数据：`apps/api/data/store.json`（Docker volume 持久化）。

## 已实现（摘要）

- [x] 写作 / 问问题 / 设置 三 Tab
- [x] 本地 `shiren-store.json` + 导出/导入
- [x] 续写/润色 → 绿增灰删对比 → 同意/拒绝
- [x] 历史版本与回滚
- [x] 问问题 + 朗读；写作小助手意图确认（本地 engine + shared prompt）
- [x] 密钥在「我的」；ASR/TTS/OCR 直连厂商
- [ ] 问问题带图（本地版待接 ZenMux 多模态）
- [ ] 上下文环 / 真压缩（UI 已隐藏，见 [local-first-data.md](docs/local-first-data.md) roadmap）

## DeepSeek 密钥

1. [platform.deepseek.com](https://platform.deepseek.com/api_keys) 申请  
2. App → **我的** → 填入 → **测试一下**
