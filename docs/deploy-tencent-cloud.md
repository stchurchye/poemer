# 腾讯云部署诗人 API（方案 A）

手机 App 连接云服务器上的 API，**所有文稿存在服务器** `apps/api/data/store.json`。更新 APK、换手机不会丢文章。

## 一、服务器准备

- 系统：Ubuntu 22.04 / Debian 12 等 Linux
- 已安装：Docker、Docker Compose（插件 `docker compose`）
- 腾讯云控制台 → **安全组**：入站放行 **TCP 3921**（仅家人用时，可改为只放行你家公网 IP）

```bash
# 示例：安装 Docker（Ubuntu）
sudo apt update && sudo apt install -y docker.io docker-compose-v2 git
sudo usermod -aG docker $USER
# 重新登录 SSH 后生效
```

## 二、上传项目并启动

```bash
# 在服务器上
git clone <你的仓库地址> shiren
cd shiren

cp .env.example .env
# 可选：编辑 .env 写入 DEEPSEEK_API_KEY（也可只在手机「设置」里填）

mkdir -p apps/api/data backups

npm run docker:up
# 或：docker compose up -d --build

curl http://127.0.0.1:3921/health
# 应返回 ok: true
```

数据文件位置（请定期备份）：

```text
/home/你的用户/shiren/apps/api/data/store.json
```

### 从本机 Docker 迁到腾讯云（若家里已有文稿）

在本机 Mac 上：

```bash
docker cp shiren-api:/app/apps/api/data/store.json ./store.json
scp ./store.json 用户名@云服务器IP:/path/to/shiren/apps/api/data/store.json
```

在腾讯云上重启 API：

```bash
cd shiren && docker compose restart api
```

## 三、手机连接云端

### 开发调试（Expo）

```bash
EXPO_PUBLIC_API_URL=http://云服务器公网IP:3921 npm run dev:mobile
```

### 正式 APK

打包时写入云端地址（构建环境变量）：

```bash
EXPO_PUBLIC_API_URL=http://云服务器公网IP:3921
```

家人手机安装 APK 后：

1. **设置** → 填入 DeepSeek（意图）、ZenMux（问答/改稿/带图/识图）、百炼（朗读听写，可选）
2. 确保手机能访问 `http://公网IP:3921/health`（浏览器或 curl 测一下）

> 有域名时建议再配 Nginx + HTTPS（见下文可选）。

## 四、日常备份（推荐 crontab）

```bash
# 每天 3 点备份 store.json
0 3 * * * cp /path/to/shiren/apps/api/data/store.json /path/to/shiren/backups/store-$(date +\%Y\%m\%d).json
```

也可用腾讯云**云硬盘快照**备份整块系统盘。

## 五、常用运维命令

```bash
cd shiren
docker compose logs -f api      # 看日志
docker compose restart api      # 重启（数据在 volume，不丢）
docker compose up -d --build  # 更新代码后重建（有 volume 不丢稿）

# 勿随意：docker compose down -v  # -v 会删卷，当前 compose 未用命名卷，一般 down 即可
```

## 六、安全建议（公网暴露时）

当前 API **无登录**，谁都能访问已开放的端口。建议至少一条：

1. 安全组 **只放行家人常用公网 IP**；或  
2. 用 **VPN / 腾讯云内网** 访问，不对外开 3921；或  
3. 前面加 **Nginx + HTTPS**，并限制 IP。

密钥优先放在 **手机 App 设置** 里，不要提交到 Git。

## 七、可选：域名 + HTTPS

有备案域名时，可用 Nginx 反代到 `127.0.0.1:3921`，Let's Encrypt 申请证书，手机使用：

```text
EXPO_PUBLIC_API_URL=https://api.你的域名.com
```

（需自行配置 Nginx；Android 正式包建议用 HTTPS。）
