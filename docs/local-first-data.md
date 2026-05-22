# 本地优先数据说明

诗人手机端采用**本地优先**模式：

- 文章、历史版本、问问题记录、写作小助手记录存在本机 `shiren-store.json`。
- AI 改稿、问问题、云端识图、云端听写/朗读通过密钥**直连模型厂商**（DeepSeek、ZenMux、阿里云百炼），不经过自建诗人 API。
- 查看和编辑文章**不需要**启动 `npm run dev:api`。

## 数据文件

| 文件 | 说明 |
|------|------|
| `shiren-store.json` | 主库（应用文档目录） |
| `shiren-store.bak.json` | 自动备份 |
| `诗人数据-*.shiren.json` | 导出包（不含任何 API 密钥） |

换设备后需重新在「设置」填写密钥。

## 导出 / 导入

设置 → **本地数据** → 导出或导入。导入前会自动备份当前数据。

## 与云端版差异

完整对照见 **[本地优先 vs 云端 API 对照表](./local-vs-cloud.md)**（部署、数据、AI、语音识图、UI、安全）。

简要结论：

- **数据**：本机文件 + 导出包；云端为服务器 `store.json`。
- **AI**：本地直连厂商，写作/问问题 prompt 与上下文编排较云端**简化**；问问题**暂不支持发图**。
- **UI**：问问题 / 写作小助手可查看上下文占用、编排与压缩（需 DeepSeek 密钥；带图需 ZenMux）。

## 上下文编排 roadmap

本地版已接入 `@shiren/engine` 的 `contextPipeline`（上下文环、真压缩、编排预览）。与云端差异见 [local-vs-cloud.md](./local-vs-cloud.md)。

| 阶段 | 目标 | 状态 |
|------|------|------|
| A | 本地数据 + 导出；写作/问问题主路径 | ✅ |
| B | 意图 prompt 对齐；`guide` / `ready: false` / `directChat` | ✅ |
| C | 问问题带图（ZenMux 多模态直连） | ✅ |
| D | `contextPipeline` 在 engine；环 + 真 compact + 编排 UI | ✅ |
| E | 改稿执行 `runWritingExecute` + evaluation/rationale + 再改一版 | ✅ |
| F | 可选：手机 ↔ 服务器 `PersistedStore` 同步 | 未规划 |

## 以后接后端

同步应以 `PersistedStore` / `.shiren.json` 为交换格式；第一版不做自动云同步。
