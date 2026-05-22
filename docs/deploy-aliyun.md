# 阿里云部署诗人 API（legacy · 可选）

> **默认产品路径为本地优先**（数据在手机、导出包备份），见 [local-first-data.md](./local-first-data.md)。  
> 本文适用于仍需「多台手机连同一台 API、文稿在服务器」的 legacy 部署。

手机 App 若走云端，需配置 `EXPO_PUBLIC_API_URL` 并连接阿里云 ECS 上的 API；**所有文稿存在服务器** `apps/api/data/store.json`。换手机、重装 APK 不丢稿；换 ECS 时拷贝 `store.json` 即可迁移。

与 [deploy-tencent-cloud.md](./deploy-tencent-cloud.md) 步骤相同，仅云厂商控制台名称不同。

## 一、ECS 准备

- 系统：Ubuntu 22.04 / Debian 12
- 已安装：Docker、Docker Compose v2、git
- **安全组**：入站放行 **TCP 3921**（建议只放行家人常用公网 IP）

```bash
sudo apt update && sudo apt install -y docker.io docker-compose-v2 git
sudo usermod -aG docker $USER
# 重新登录 SSH
```

## 二、部署 API

```bash
git clone <你的仓库> shiren && cd shiren
cp .env.example .env
mkdir -p apps/api/data backups
docker compose up -d --build
curl http://127.0.0.1:3921/health   # 应返回 "ok": true
```

数据文件：`/path/to/shiren/apps/api/data/store.json`

日常备份（crontab）：

```bash
0 3 * * * cp /path/to/shiren/apps/api/data/store.json \
  /path/to/shiren/backups/store-$(date +\%Y\%m\%d).json
```

## 三、阶段 A：公网 IP + HTTP（先上线）

### 1. 验证手机能访问

手机浏览器打开：`http://<ECS公网IP>:3921/health`

### 2. 配置 APK 里的 API 地址

构建时必须写入 `EXPO_PUBLIC_API_URL`（否则 Android 会连 `10.0.2.2`，真机无效）。

**方式 A — 改 [apps/mobile/eas.json](../apps/mobile/eas.json)**（`preview.env`）：

```json
"EXPO_PUBLIC_API_URL": "http://REPLACE_WITH_ECS_IP:3921"
```

**方式 B — EAS 控制台**：Project → Environment variables → `preview` → 添加同名变量。

### 3. 打 Android 内测包

```bash
cd apps/mobile
npx eas-cli build --platform android --profile preview --non-interactive
```

安装链接在 EAS 构建页；家人安装后在 **设置 → 服务器连接** 应显示「连接正常」和上述地址。

### 4. Android 明文 HTTP

阶段 A 使用 `http://` 时，已在 `app.json` 配置 `usesCleartextTraffic: true`。正式对外长期运行建议进入阶段 B（HTTPS）。

## 四、阶段 B：域名 + HTTPS（推荐后续）

1. 备案域名 DNS 指向 ECS 公网 IP  
2. Nginx 反代 `127.0.0.1:3921`，配置 TLS 证书  
3. 安全组可只开 443，关闭公网 3921  
4. 重打 APK：`EXPO_PUBLIC_API_URL=https://api.你的域名.com`  
5. **换 ECS 时只改 DNS**，无需重装 APK  

## 五、换服务器（数据迁出）

| 步骤 | 操作 |
|------|------|
| 1 | 旧 ECS：`scp user@旧IP:/path/shiren/apps/api/data/store.json ./` |
| 2 | 新 ECS：同「二」部署，将 `store.json` 放入 `apps/api/data/` |
| 3 | `docker compose up -d`，验证 `/health` |
| 4 阶段 A | 更新 `EXPO_PUBLIC_API_URL` 为新 IP，重打 APK |
| 4 阶段 B | 仅改 DNS 指向新 IP |

## 六、运维

```bash
cd shiren
docker compose logs -f api
docker compose restart api
docker compose up -d --build   # 更新代码，volume 不丢稿
```

## 七、安全

API **无登录**。公网暴露时至少：安全组限 IP，或 HTTPS + Nginx 限 IP。密钥放在手机「设置」，勿提交 Git。
