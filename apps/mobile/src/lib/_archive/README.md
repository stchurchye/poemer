# 归档：云 API 时代遗留代码

本地优先（`LOCAL_FIRST_MODE`）后，移动端不再请求诗人后端 `API_BASE_URL`。
以下文件仅作历史参考，**不要**从新代码 import。

| 文件 | 说明 |
|------|------|
| `apiRequest.ts` | 原 `fetchJsonWithRetry`，带重试与 `notifyApiReachable` |
| `cloudApiHealth.ts` | 原 `checkApiHealth` 与连通性 listener |

活跃的错误文案与网络 hint 见 `apiConnectivity.ts`、`apiError.ts`。
