# PDF 上传与解析：本次优化记录

本文记录本仓库在调试 **大 PDF 上传/解析失败** 过程中做的关键修复与现状说明，方便后续维护与复现。

## 问题 1：`/api/upload` 超过 10MB 后 `req.formData()` 解析失败

### 现象

上传较大的 PDF 时出现类似日志：

- `Request body exceeded 10MB for /api/upload...`
- `TypeError: Failed to parse body as FormData.`

### 原因

项目启用了 `src/middleware.ts`（Supabase session 刷新/路由保护）。在 Next.js 16 中，当 middleware/proxy 参与请求链路时，Next 会对请求体做缓冲，默认上限 **10MB**。超过后请求体会被截断，`req.formData()` 解析必然失败。

### 解决

在 `next.config.ts` 中提高上限到 50MB：

- `experimental.middlewareClientMaxBodySize: '50mb'`
- `experimental.proxyClientMaxBodySize: '50mb'`（Next 16 提示更推荐）

注意：修改 `next.config.ts` 后需要 **重启 dev server** 才生效。

### 推荐做法（生产环境）

如果部署在 Vercel 免费版，**更推荐前端直传 Supabase Storage**，避免上传请求经过 Vercel：

1. 前端使用 `supabase.storage.from('papers').upload(...)` 直传 PDF
2. 上传成功后调用 `/api/extract-metadata` 回填论文信息（请求体很小）
3. 再调用 `/api/papers` 创建论文记录

## 问题 2：Supabase Storage bucket / RLS 未配置导致上传失败

### 2.1 Bucket 不存在

现象：`Bucket not found`

解决：在 Supabase Storage 中创建私有 bucket：`papers`。

### 2.2 RLS policy 缺失

现象：`new row violates row-level security policy`（403）

原因：bucket 设为 private 后，如果 `storage.objects` 没有对应 policy，`INSERT`（上传）默认会被拒绝。

解决：为 `storage.objects` 创建至少 `INSERT/SELECT/DELETE` 三条 policy，并限制用户只能访问自己 `auth.uid()` 文件夹下的对象（与本项目的 object key 结构一致：`<uid>/...`）。

示例（与 `supabase/schema.sql` 一致）：

```sql
create policy "Users can upload own papers"
on storage.objects for insert
with check (
  bucket_id = 'papers'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "Users can view own papers"
on storage.objects for select
using (
  bucket_id = 'papers'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "Users can delete own papers"
on storage.objects for delete
using (
  bucket_id = 'papers'
  and auth.uid()::text = (storage.foldername(name))[1]
);
```

## 问题 3：文件名包含中文/特殊字符导致“文件名非法”

### 现象

在 Supabase 控制台直接上传时提示 `File name is invalid`（尤其是包含中文、特殊符号、超长文件名时）。

### 解决（本项目侧）

本项目服务端上传到 Storage 时会生成安全 object key：

- object key：`<user.id>/<timestamp>-<sanitizedFileName>`
- 通过 `src/lib/storage/sanitize-object-name.ts` 将文件名规范为仅包含 ASCII 字母数字与 `._-`，并控制长度

这样用户无需手动改名也能通过 API 上传。

> 备注：Supabase 控制台的“文件名非法”是控制台自身对 key 的校验行为，本项目无法直接修改控制台逻辑。

## 优化 1：降低解析内存占用（Range 优先，失败降级）

### 背景

当前实现中，`/api/parse-pdf` 需要从 Storage 获取 PDF 并提取全文文本用于笔记/对话。原逻辑是：

1. `createSignedUrl`
2. `fetch(...).arrayBuffer()` 整包下载
3. `unpdf` 解析

这会在大 PDF 时造成较高峰值内存。

### 新逻辑

在以下接口中引入“Range 分片 + 重试 3 次 + 降级整包”的策略：

- `src/app/api/parse-pdf/route.ts`
- `src/app/api/extract-metadata/route.ts`

实现要点：

- 使用 signed URL 作为数据源
- 先对 signed URL 做 1-byte Range 探测（HTTP 206 则认为支持 Range）
- 支持 Range 时，优先用 `pdfjs-dist` 的 URL 加载方式按需请求字节块（随机读取）
- Range 路径失败：最多重试 3 次；仍失败则降级为整包下载 + `unpdf` 的旧逻辑

辅助模块：

- `src/lib/pdf/pdfjs-url-text.ts`：Range 探测、逐页抽取（达到阈值即停止）、资源释放、重试封装

### 调试信息

`/api/parse-pdf` 返回中增加 `_debug` 字段（不影响 UI），可以看到：

- `mode`: `range_pdfjs` 或 `full_unpdf`
- `attempts`
- `rangeSupported`

## 优化 2：提升 `/api/upload` 稳定性（先上传、后解析、并重试）

### 背景

原 `/api/upload` 使用 `Promise.all` 并行：

- 上传到 Supabase Storage
- 同时提取论文层面元数据（标题/作者/期刊/关键词）

在网络不稳定或服务端压力较高时，上传链路容易出现 socket 中断（`UND_ERR_SOCKET other side closed`）。

### 新逻辑

`src/app/api/upload/route.ts` 改为：

1. 先上传（对 `fetch failed` / `UND_ERR_SOCKET` 做最多 3 次重试）
2. 上传成功后再进行元数据解析

这样可以减少上传阶段的 CPU/内存干扰，并把“解析失败”与“上传失败”更清晰地区分。

## 手动验证建议

1. 确认 `.env/.env.local` 配置了正确的 Supabase URL/Key，并已登录系统。\n+2. 上传一个 >10MB 的 PDF 到系统，确认不再出现 10MB 截断的 warning。\n+3. 打开论文详情页，观察 `/api/parse-pdf` 的 `_debug.mode` 是否为 `range_pdfjs`（若 signed URL 不支持 Range 则会自动降级）。\n+
