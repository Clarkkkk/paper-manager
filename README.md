# MySciSpace（paper-manager）

一个 **AI 驱动的论文管理与阅读助手**：上传 PDF 后自动提取论文信息，支持论文阅读、RAG 问答、结构化笔记生成，并提供灵活的多 AI 提供商配置。

## 功能

- **账号系统**：Supabase Auth（邮箱密码 + Google OAuth）
- **论文上传**：PDF（≤50MB），前端直传 Supabase Storage 私有 bucket
- **论文信息提取**：自动识别 `title / authors / journal / keywords`（启发式 + AI）
- **论文阅读**：详情页内嵌 PDF Viewer + 右侧 AI 面板（笔记 / 对话）
- **AI 生成笔记**：流式生成结构化 Markdown 笔记并落库
- **RAG 问答**：论文自动分块 → Embedding 向量化 → 语义检索 → 多轮评估 → 基于原文片段的精准回答
- **多 AI 提供商**：支持系统默认免费模型（OpenRouter）或用户自带 Key（Google / OpenAI / OpenRouter / 自定义兼容 API）

## 技术栈

- **前端/后端**：Next.js 16（App Router）+ React 19 + TypeScript
- **样式/UI**：Tailwind CSS + Radix UI + sonner + lucide-react
- **数据与鉴权**：Supabase（Postgres + Auth + Storage + RLS + pgvector）
- **PDF**：`unpdf` / `pdfjs-dist` / `react-pdf`
- **AI**：Vercel AI SDK（`ai` + `@ai-sdk/openai` + `@ai-sdk/google` + `@openrouter/ai-sdk-provider`）

## 目录结构（核心）

```
src/
├── app/
│   ├── dashboard/
│   │   ├── page.tsx                    # 论文列表（Dashboard 首页）
│   │   ├── settings/page.tsx           # 全局设置（AI 提供商/模型/Key 的唯一入口）
│   │   └── paper/[id]/page.tsx         # 论文详情（PDF Viewer + AI 面板）
│   └── api/
│       ├── upload/route.ts             # 论文上传（提取元数据 → 写 papers 表）
│       ├── papers/
│       │   ├── route.ts                # 论文 CRUD
│       │   ├── signed-url/route.ts     # PDF 签名 URL
│       │   └── ingest/route.ts         # RAG 索引构建（分块 + Embedding）
│       ├── parse-pdf/route.ts          # PDF 正文提取
│       ├── generate-notes/route.ts     # AI 笔记生成（流式）
│       ├── chat/route.ts              # RAG 问答（流式，含检索进度推送）
│       ├── models/route.ts            # 获取可用模型列表（按提供商动态查询）
│       └── profile/route.ts           # 用户配置 CRUD
├── components/paper/
│   ├── reader.tsx                      # 论文阅读器（PDF + 侧边栏）
│   ├── chat-panel.tsx                  # 对话面板
│   └── notes-panel.tsx                 # 笔记面板
└── lib/
    ├── ai/
    │   ├── config.ts                   # AI 统一配置中心（类型/常量/模型列表）
    │   ├── openai.ts                   # 多 provider AI 客户端工厂（getAIClient）
    │   └── embeddings.ts              # RAG Embedding 接口
    ├── rag/
    │   ├── chunking.ts                 # PDF 文本分块
    │   ├── retrieval.ts                # 向量语义检索
    │   ├── eval.ts                     # 检索结果相关性评估
    │   ├── query.ts                    # 检索 query 生成/改写
    │   ├── pipeline.ts                 # RAG 主流程（多轮检索+评估循环）
    │   ├── prompt.ts                   # Prompt 拼装（Paper Context + 检索结果）
    │   ├── language.ts                 # 论文语言检测
    │   ├── types.ts                    # RAG 类型定义
    │   ├── progress.ts                 # 检索进度事件编码
    │   ├── progress-store.ts           # 前端进度状态管理（Zustand）
    │   └── debug-store.ts             # 前端 RAG 调试数据管理（Zustand）
    ├── pdf/
    │   ├── metadata.ts                 # 论文元数据提取（启发式 + AI）
    │   ├── pdfjs-url-text.ts           # PDF URL 文本提取
    │   ├── pdfjs-worker.ts             # PDF.js Worker 配置
    │   └── dommatrix-polyfill.ts       # Node.js 端 DOMMatrix polyfill
    └── supabase/
        ├── server.ts                   # 服务端 Supabase client + getUserProfile()
        ├── client.ts                   # 浏览器端 Supabase client
        └── middleware.ts               # 会话刷新 middleware
```

## AI 模型配置架构

所有 AI 模型相关的配置统一由 `src/lib/ai/config.ts` 管理，采用单一来源原则：

```
Settings 页面（唯一 UI 入口）
    │
    │  PATCH /api/profile
    ▼
数据库 profiles 表
    │  api_provider / openai_api_key / preferred_model / api_base_url
    │
    │  getUserProfile()
    ▼
getAIClient()（服务端）
    │  根据 profile 自动选择 provider + key + model
    │  创建对应 SDK client（Google / OpenRouter / OpenAI）
    ▼
Chat API / Notes API / Ingest API
```

### API Key 优先级

**用户自定义 Key 优先于环境变量**。具体逻辑：

| 场景 | API Key 来源 | Provider | 可用模型 |
|------|-------------|----------|---------|
| 用户在 Settings 配置了 Key | 数据库 `profiles.openai_api_key` | 用户选择的 provider | 该 provider 的所有模型 |
| 用户未配置 Key | 环境变量 `OPENROUTER_API_KEY` | 强制 OpenRouter | 仅 `:free` 后缀的免费模型 |
| 内部任务（元数据提取等） | 环境变量 `OPENROUTER_API_KEY` | OpenRouter | 指定的固定模型 |

### 使用方式

1. **零配置开箱即用**：只需在 `.env` 设置 `OPENROUTER_API_KEY`，所有用户即可使用 30+ 免费模型进行对话和笔记生成，无需任何额外配置
2. **用户自带 Key（BYOK）**：用户进入 `/dashboard/settings`，选择 AI 提供商（Google / OpenAI / OpenRouter / 自定义），填入自己的 API Key，选择模型后保存。之后所有 AI 功能（对话、笔记、RAG）都会使用该配置
3. **Embeddings 独立配置**：RAG 向量化使用 `RAG_EMBEDDING_*` 系列环境变量，与聊天模型配置互不干扰

### 安全与持久化说明（重要）

- **API Key 存储位置**：用户自带 Key 存在数据库 `profiles.openai_api_key`（服务端使用），前端不会写入 localStorage。
- **API Key 展示策略**：`GET /api/profile` 会返回 **masked key**（例如 `sk-or-****...`）以避免泄漏；Settings 页面会提示“已保存 Key（为安全不显示）”。
- **避免覆盖真实 Key**：Settings 保存时只有在用户输入了新 Key 才会更新 `openai_api_key`；留空表示继续使用已保存的 Key。
- **模型列表拉取**：Settings 的 `/api/models` 会在服务端读取 `profiles.openai_api_key`（仅用于服务端请求模型列表，不返回给前端），确保刷新后仍能拉到完整模型列表（含付费模型），避免选中项回退到免费模型。

## RAG 问答运行流程（高层）

用户提问后，后端会按以下顺序执行（均为流式输出，前端可实时看到进度）：

1. **预检（precheck）**：判断该问题是否与论文相关，是否无需检索即可回答。\n
   - 若不相关或可直接回答，会跳过检索流程，直接生成回答（且明确不编造论文引用）。
2. **多轮检索与评估**（最多 3 次）：\n
   - 生成检索 query → Hybrid 检索（向量 + 全文）→ chunk 级评分与“是否足够回答”判定。\n
   - 若未命中足够 chunk，则基于本次评估生成 refinedQuery 并进入下一轮。
3. **生成回答**：将论文元信息 + 检索过程与引用片段注入 system prompt，生成最终回答。

> 调试：Chat 流的开头会注入 `__RAG_DEBUG__`（JSON），前端会解析并展示检索过程与引用原文。

## 环境变量

### 必需

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### AI 相关

- `OPENROUTER_API_KEY`：系统默认 AI Key（无用户自带 Key 时，Chat/笔记/元数据提取都使用此 Key 通过 OpenRouter 免费模型）
- `GOOGLE_API_KEY`：（可选）拉取 Gemini 模型列表
- `SYSTEM_OPENAI_API_KEY`：（可选）拉取 OpenAI 模型列表

### RAG Embedding 相关

- `RAG_EMBEDDING_BASE_URL`：Embedding API 地址（默认 `https://openrouter.ai/api/v1`）
- `RAG_EMBEDDING_API_KEY`：Embedding API Key（默认回退到 `OPENROUTER_API_KEY`）
- `RAG_EMBEDDING_MODEL`：Embedding 模型（默认 `openai/text-embedding-3-small`）
- `RAG_EMBEDDING_BATCH_SIZE`：批量大小（默认 32）

### RAG 调优

- `RAG_CHUNK_SIZE_CHARS`：分块大小（默认 2000 字符）
- `RAG_CHUNK_OVERLAP_CHARS`：分块重叠（默认 200 字符）
- `RAG_PROMPT_MAX_CHUNKS_PER_ATTEMPT`：每轮检索最大 chunk 数（默认 10）
- `RAG_PROMPT_MAX_CHUNK_CHARS`：每个 chunk 截断长度（默认 900）
- `RAG_UI_MAX_USED_CHUNKS`：前端展示的引用 chunk 数（默认 6）

示例见 `env.example`。

## Supabase 配置（必须做）

### 1) 初始化数据库与触发器

在 Supabase Dashboard → SQL Editor 执行：

- `supabase/schema.sql`

它会创建：

- `profiles` / `papers` / `notes` / `chat_messages` 等表及 RLS
- 新用户自动创建 profile 的 trigger

### 2) RAG 相关表

执行以下迁移脚本以启用 RAG 功能：

- `supabase/migrations/add_paper_chunks_rag.sql` — 创建 `paper_chunks`（含 pgvector）和 `paper_ingestions` 表
- `supabase/migrations/add_paper_ingestions_language.sql` — 为 ingestion 添加语言检测字段

### 3) 配置 Storage（私有 bucket + RLS）

`schema.sql` 同时包含 Storage 初始化逻辑（bucket `papers` 为 private）以及 `storage.objects` 的 RLS policy：

- 只允许用户访问 `auth.uid()/...` 路径下对象

本项目上传路径形如：`<user.id>/<timestamp>-<safe_filename>.pdf`。

## 本地开发

安装依赖并启动：

```bash
pnpm install
pnpm dev
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
