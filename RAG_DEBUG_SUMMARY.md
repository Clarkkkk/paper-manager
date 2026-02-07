# RAG 调试记录与解决方案总结（Paper Manager）

> 本文总结本次在 `paper-manager` 中调试与优化 RAG（检索增强生成）链路时遇到的主要问题、定位证据与最终解决方案。面向后续回溯与继续迭代。

## 背景与目标

- **目标**：实现更“真实”的 RAG（向量/全文检索 + 多轮 query 改写 + chunk 级评估 + 充分命中即停止），并让 UI 能实时展示检索与评估进度、同时保证配置与数据链路稳定可靠。
- **技术栈**：Next.js App Router（API routes）、Supabase（Postgres + pgvector + Storage + Auth）、OpenRouter/多模型、流式输出（ReadableStream 控制行 + 正文 token）。

---

## 问题 1：RAG 预检（precheck）误判导致“直接回答不检索”

### 现象
- 某些明显与论文相关的问题被 `precheck` 判成 `isPaperRelated=false`，从而 **跳过 RAG**，直接让模型按常识回答。
- 甚至出现矛盾组合：`isPaperRelated=false` 且 `canAnswerDirectly=false`。

### 根因
- `/api/chat` 的跳过条件是：
  - `!isPaperRelated` **或** `canAnswerDirectly` ⇒ 不跑 RAG
- 预检模型输出可能不稳定，且服务端未对“矛盾组合”做一致性纠正。

### 解决/改进
- 保留 precheck，但增强可观测性：
  - **改为两步**：先输出“思考摘要”（仅日志），再输出严格 JSON（控制分支）。
  - 便于排查“为什么会跳过 RAG”。
- 文件：
  - `src/lib/rag/precheck.ts`

---

## 问题 2：评估 JSON 被截断 / 包含代码块导致解析失败

### 现象
- eval/query 结果 JSON 解析失败：输出带 ```json 代码块、或输出过长被截断，导致 `chunkScores` 为空，RAG 继续多轮尝试却得不到有效停止信号。

### 根因
- LLM 输出不严格；max tokens 较小；解析函数对 Markdown code fence 不鲁棒。

### 解决/改进
- 增强 JSON 解析鲁棒性：
  - strip code fences、提取最大 `{...}` span、失败时兜底/修复提示。
- Prompt 侧加强约束（禁止输出非 JSON、多余解释，压缩字段长度）。
- 文件（关键）：
  - `src/lib/rag/json.ts`
  - `src/lib/rag/eval.ts`
  - `src/lib/rag/query.ts`

---

## 问题 3：chunk 级评分映射错误（chunk_index 对不上）导致“看似评估了但全是 missing”

### 现象
- 模型返回的 `chunkScores` 用了 1..N 的序号，而数据库 chunk 的 `chunk_index` 是全局序（如 37、44），导致 scoreMap 映射失败，UI/停止条件拿不到正确评分。

### 根因
- Prompt 未强制要求返回“数据库真实 chunk_index”，模型倾向按展示顺序编号。

### 解决/改进
- Prompt 明确要求使用数据库 `chunk_index`。
- 评估流程改为：
  - **先**输出每个 chunk 的 `score/isSufficient/reason`
  - 只有在 `hasSufficient=false` 时才生成 `refinedQuery`
- 文件：
  - `src/lib/rag/eval.ts`
  - `src/lib/rag/pipeline.ts`
  - `src/lib/rag/types.ts`

---

## 问题 4：停止条件不严谨（isSufficient=true 但 score=0）导致行为异常

### 现象
- 模型可能输出 `isSufficient=true` 但 `score=0`；如果仅看 `isSufficient`，会出现提前停止/或行为与预期不一致。

### 解决/改进
- 引入阈值：仅当 `isSufficient===true && score>=0.5` 才认为“足以回答并停止”。
- 在 eval 与 pipeline 的“足够集合/停止条件”里都应用该阈值。

---

## 问题 5：检索进度 UI 一直 loading，看不到多轮检索/评估过程

### 现象
- RAG 可能经历多轮 query→检索→评估→重试，但 UI 只看到一个 loading，缺乏可解释性与可调试性。

### 解决/改进
- 引入轻量进度事件流：
  - 服务端在正文 token 之前写入 `__RAG_EVENT__:{...}\n`
  - 前端解析控制行，展示“正在思考/检索/召回数量/评估/重试/开始回答”等状态
- 文件：
  - `src/lib/rag/progress.ts`
  - `src/lib/rag/progress-store.ts`
  - `src/app/api/chat/route.ts`
  - `src/components/paper/chat-panel.tsx`

---

## 问题 6：Embedding API 偶发返回 200 但 data 为空/不完整，导致 ingest/RAG 失败

### 现象
- embeddings 返回缺失：`returnedCount=0`，错误提示如 `No successful provider responses.`，导致 RAG pipeline 或 ingest 失败。

### 解决/改进
- 把“不完整 embeddings”视为**可重试错误**：
  - 指数退避重试（最多 4 次）
  - 最后兜底：对缺失项逐个请求补齐
- 文件：
  - `src/lib/ai/embeddings.ts`

---

## 问题 7：ingestion 状态可能卡在 running，UI 刷新后一直显示构建中

### 现象
- 后端任务超时/异常退出后未写回状态，`paper_ingestions.status` 永远是 `running`。

### 解决/改进
- GET ingestion 时做“stale running”降级：
  - `updated_at` 超过阈值（如 10 分钟）仍 running ⇒ 自动标记 failed（并写 error）
- 文件：
  - `src/app/api/papers/ingest/route.ts`

---

## 问题 8：精细搜索（fine search）召回极少，漏掉关键 chunk（例如 chunk_index=12）

### 典型现象
- 明明单篇论文有 56 个 chunk（embedding 全齐），但向量检索 `kVec=30` 却经常只返回 `0~4` 条，导致关键 chunk 从未进入候选集。
- 通过 SQL 验证：在“先过滤 paper/user 子集，再做精确排序”时，chunk 12 的 vec_score 能排第一（说明向量本身没问题）。

### 根因（pgvector/ivfflat 执行计划）
- 当查询走 **ivfflat 近似索引（ANN）** 且同时带 `paper_id/user_id` 过滤时，执行计划可能是：
  1) ANN 在全表向量空间取少量候选  
  2) 再应用 `paper_id/user_id` 过滤  
  3) 过滤后候选不足 ⇒ 最终返回条数远小于 k（甚至 0）
- 这会造成“取不满 K”的不稳定召回，直接影响 RAG 命中率。

### 解决方案（方案 A：强制子集精确排序）
- 将 `match_paper_chunks_hybrid` 改为：
  - **先物化** `filtered AS MATERIALIZED`（paper_id + auth.uid 子集）
  - 再在该子集上 `ORDER BY embedding <=> query_embedding LIMIT kVec`
- 这样对“单篇论文检索”会稳定返回满 K（只受 chunk 总数影响）。

### 落地
- 新增 migration：
  - `supabase/migrations/fix_match_paper_chunks_hybrid_subset_scan.sql`

---

## 额外收益：全量上下文模式（不使用 RAG）与模型选择体验

> 虽非纯 RAG bug，但为应对“小模型长流程/工具调用差”引入了替代路径，并优化模型选择可用性。

- **全量上下文模式（per chat 切换）**：不跑 RAG，直接按预算注入 `paper_chunks` 全文（chunked）进入 prompt。
- **设置页模型搜索**：后端返回全量模型列表；前端先 filter 再 slice(0,100) 渲染，避免“只能搜前 100”。

---

## 建议的后续工作（可选）

- **FTS 与向量并行**：按你规划，把全文检索与向量检索并行聚合（而不是混入同一次 RPC 的 score 融合），对图注/符号文本更稳。
- **对 precheck 输出做一致性约束**：例如服务端纠正矛盾组合（`isPaperRelated=false` 时强制 `canAnswerDirectly=true`，或直接降级为跑 RAG）。
- **控制 prompt 长度预算**：对 full-context 模式按模型上下文窗口动态设定预算，避免超长导致请求失败。

