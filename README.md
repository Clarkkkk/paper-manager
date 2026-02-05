# MySciSpace（paper-manager）

一个 **AI 驱动的论文管理与阅读助手**：上传 PDF 后自动提取论文信息，支持论文阅读、结构化笔记生成与基于论文内容的问答。

## 功能

- **账号系统**：Supabase Auth（邮箱密码 + Google OAuth）
- **论文上传**：PDF（≤50MB），保存到 Supabase Storage 私有 bucket
- **论文信息提取（论文层面）**：自动识别 `title / authors / journal / keywords`
- **论文阅读**：论文详情页内嵌 PDF + 右侧 AI 面板（笔记/对话）
- **AI 生成笔记**：流式生成结构化 Markdown 笔记并落库
- **AI 问答**：基于论文标题/摘要/（可选）正文内容上下文进行对话（流式）
- **模型与 BYOK**：支持系统默认免费模型或用户自带 Key（Google/OpenAI/OpenRouter/自定义兼容）

## 技术栈

- **前端/后端**：Next.js 16（App Router）+ React 19 + TypeScript
- **样式/UI**：Tailwind CSS + Radix UI + sonner + lucide-react
- **数据与鉴权**：Supabase（Postgres + Auth + Storage + RLS）
- **PDF**：`unpdf` / `pdfjs-dist` / `react-pdf`
- **AI**：Vercel AI SDK（`ai` + `@ai-sdk/*`）

## 目录结构（核心）

- `src/app/`：页面与 API（Route Handlers）
  - `src/app/api/upload/route.ts`：上传 PDF 到 Storage，并提取论文信息
  - `src/app/api/papers/route.ts`：论文 CRUD
  - `src/app/api/parse-pdf/route.ts`：从 Storage 取 PDF 并提取正文文本（供笔记/对话）
  - `src/app/api/generate-notes/route.ts`：生成并保存笔记（流式）
  - `src/app/api/chat/route.ts`：论文问答（流式）
  - `src/app/api/profile/route.ts`：用户配置（provider/model/key/baseUrl）
- `src/lib/`：集成与核心逻辑
  - `src/lib/supabase/*`：SSR/Browser client 与 middleware 会话刷新
  - `src/lib/pdf/metadata.ts`：论文信息提取（启发式 + AI）
  - `src/lib/ai/openai.ts`：多 provider AI 客户端封装
- `supabase/schema.sql`：数据库与 Storage（bucket + RLS policy）初始化脚本

## 环境变量

### 必需

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 可选（影响默认 AI 能力/模型列表）

- `OPENROUTER_API_KEY`：系统默认 AI Key（无用户自带 Key 时使用）
- `GOOGLE_API_KEY`：可用于拉取 Gemini 模型列表/作为默认 provider 判断
- `SYSTEM_OPENAI_API_KEY`：可用于拉取 OpenAI 模型列表/作为默认 provider 判断

示例见 `env.example`。

## Supabase 配置（必须做）

### 1) 初始化数据库与触发器

在 Supabase Dashboard → SQL Editor 执行：

- `supabase/schema.sql`

它会创建：

- `profiles` / `papers` / `notes` / `chat_messages` 等表及 RLS
- 新用户自动创建 profile 的 trigger

### 2) 配置 Storage（私有 bucket + RLS）

`schema.sql` 同时包含 Storage 初始化逻辑（bucket `papers` 为 private）以及 `storage.objects` 的 RLS policy：

- 只允许用户访问 `auth.uid()/...` 路径下对象

本项目上传路径形如：`<user.id>/<timestamp>-<safe_filename>.pdf`。

## 本地开发

安装依赖并启动：

```bash
npm install
npm run dev
```

打开 `http://localhost:3000`。

## 部署

详见 `DEPLOY.md`（Vercel / Docker / PM2）。

## 大 PDF 上传/解析注意事项（强烈建议阅读）

如果遇到以下问题：

- `/api/upload` 超过 10MB 报 `Request body exceeded 10MB` / `Failed to parse body as FormData`
- Storage 报 `Bucket not found` 或 `new row violates row-level security policy`
- 文件名包含中文/特殊字符导致 `File name is invalid`
- 解析大 PDF 内存占用过高

请阅读根目录文档：

- `PDF_UPLOAD_AND_PARSE_NOTES.md`

## 生产建议（Vercel 免费版）

Vercel 免费版存在 **请求体大小限制（常见为 10MB）**。为了支持更大的 PDF：

- **推荐前端直传 Supabase Storage**（本项目已采用），上传完成后再调用 `/api/extract-metadata` 提取论文信息并回填到 `papers` 表。
