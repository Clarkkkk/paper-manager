# MySciSpace 部署指南

## 快速部署方案对比

| 方案 | 难度 | 成本 | 适合场景 |
|------|------|------|----------|
| Vercel | ⭐ | 免费起 | 个人/小团队 |
| Docker | ⭐⭐ | 服务器费用 | 自主控制 |
| 云服务器 | ⭐⭐⭐ | 月费 | 企业私有化 |

---

## 方案一：Vercel 部署（推荐）

### 通过 GitHub 自动部署

1. **Fork 或推送代码到 GitHub**

2. **访问 Vercel**
   - 前往 [vercel.com](https://vercel.com)
   - 使用 GitHub 登录
   - 点击 "New Project"
   - 导入你的仓库

3. **配置环境变量**
   在 Vercel 项目设置中添加：
   ```
   NEXT_PUBLIC_SUPABASE_URL=你的Supabase项目URL
   NEXT_PUBLIC_SUPABASE_ANON_KEY=你的Supabase匿名Key
   GOOGLE_API_KEY=系统默认Google API Key（可选）
   ```

4. **点击 Deploy**
   - 等待构建完成
   - 获得 `your-project.vercel.app` 域名
   - 可绑定自定义域名

### 通过 CLI 部署

```bash
# 安装 Vercel CLI
npm i -g vercel

# 登录
vercel login

# 部署到生产环境
vercel --prod
```

---

## 方案二：Docker 部署

### 前提条件
- 安装 Docker 和 Docker Compose
- 一台服务器（阿里云、腾讯云、AWS 等）

### 部署步骤

1. **克隆代码**
   ```bash
   git clone https://github.com/your-repo/paper-manager.git
   cd paper-manager
   ```

2. **创建环境变量文件**
   ```bash
   cat > .env << EOF
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   GOOGLE_API_KEY=your-google-api-key
   EOF
   ```

3. **构建并启动**
   ```bash
   docker-compose up -d --build
   ```

4. **访问**
   - 打开 http://your-server-ip:3000

### 配置 Nginx 反向代理（可选）

```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 配置 HTTPS（推荐）

```bash
# 使用 Certbot 自动配置 SSL
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

## 方案三：云服务器直接部署

### 在 Ubuntu 服务器上部署

1. **安装 Node.js**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt install -y nodejs
   ```

2. **安装 PM2（进程管理）**
   ```bash
   sudo npm i -g pm2
   ```

3. **克隆并构建**
   ```bash
   git clone https://github.com/your-repo/paper-manager.git
   cd paper-manager
   npm install
   npm run build
   ```

4. **配置环境变量**
   ```bash
   cp .env.example .env.local
   # 编辑 .env.local 填写配置
   ```

5. **使用 PM2 启动**
   ```bash
   pm2 start npm --name "myscispace" -- start
   pm2 save
   pm2 startup
   ```

---

## Supabase 配置

无论使用哪种部署方式，都需要配置 Supabase：

### 1. 创建 Supabase 项目
- 访问 [supabase.com](https://supabase.com)
- 创建新项目
- 记录 Project URL 和 anon key

### 2. 执行数据库迁移
在 Supabase SQL Editor 中执行 `supabase/schema.sql`

### 3. 配置 Storage
- 创建 `papers` bucket
- 设置为私有
- 添加 RLS 策略（见 schema.sql）

### 4. 配置 Auth
- 启用 Email 认证
- 可选：配置 Google/GitHub OAuth

---

## 环境变量说明

| 变量 | 必需 | 说明 |
|------|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase 项目 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase 匿名 Key |
| `GOOGLE_API_KEY` | ❌ | 系统默认 Google AI Key |
| `SYSTEM_OPENAI_API_KEY` | ❌ | 系统默认 OpenAI Key |
| `OPENROUTER_API_KEY` | ❌ | 系统默认 OpenRouter Key |

---

## 常见问题

### Q: 用户需要自己配置 API Key 吗？
A: 可以选择：
1. **BYOK 模式**：每个用户在设置中配置自己的 API Key
2. **系统提供**：配置系统默认 Key，用户直接使用

### Q: 如何限制用户注册？
A: 在 Supabase Auth 设置中可以：
- 关闭邮箱注册，只允许邀请
- 设置邮箱域名白名单
- 关闭所有注册，手动创建用户

### Q: 如何备份数据？
A: Supabase 提供：
- 每日自动备份（Pro 计划）
- 手动导出 SQL
- 使用 `pg_dump` 工具

---

## 更新部署

### Vercel
推送代码到 GitHub，自动触发部署

### Docker
```bash
git pull
docker-compose up -d --build
```

### PM2
```bash
git pull
npm run build
pm2 restart myscispace
```
