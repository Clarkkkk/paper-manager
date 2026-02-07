-- RAG storage: chunk text + embeddings in Supabase Postgres (pgvector) + FTS hybrid retrieval.

-- 1) Chunks table: stores full paper text split into chunks (all chunks together == full text).
CREATE TABLE IF NOT EXISTS public.paper_chunks (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  paper_id UUID REFERENCES public.papers(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  chunk_index INT NOT NULL,
  page_start INT,
  page_end INT,
  content TEXT NOT NULL,
  content_tsv tsvector GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(content, ''))
  ) STORED,
  embedding vector(1536),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT paper_chunks_unique_per_paper UNIQUE (paper_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS paper_chunks_paper_user_idx
  ON public.paper_chunks (paper_id, user_id);

CREATE INDEX IF NOT EXISTS paper_chunks_content_tsv_gin
  ON public.paper_chunks USING GIN (content_tsv);

-- Note: ivfflat index requires ANALYZE for best results; safe to create even for MVP.
CREATE INDEX IF NOT EXISTS paper_chunks_embedding_ivfflat
  ON public.paper_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

ALTER TABLE public.paper_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own paper_chunks"
  ON public.paper_chunks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own paper_chunks"
  ON public.paper_chunks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own paper_chunks"
  ON public.paper_chunks FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own paper_chunks"
  ON public.paper_chunks FOR DELETE
  USING (auth.uid() = user_id);

-- 2) Ingestion state table: tracks async embedding/index build status.
CREATE TABLE IF NOT EXISTS public.paper_ingestions (
  paper_id UUID REFERENCES public.papers(id) ON DELETE CASCADE PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'succeeded', 'failed')),
  embedding_model TEXT,
  chunk_count INT,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS paper_ingestions_user_idx
  ON public.paper_ingestions (user_id, updated_at DESC);

ALTER TABLE public.paper_ingestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own paper_ingestions"
  ON public.paper_ingestions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own paper_ingestions"
  ON public.paper_ingestions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own paper_ingestions"
  ON public.paper_ingestions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own paper_ingestions"
  ON public.paper_ingestions FOR DELETE
  USING (auth.uid() = user_id);

-- 3) Hybrid retrieval RPC: combine vector similarity + full-text search.
-- Returns up to (k_vec + k_fts) chunks (deduped) for a single paper.
CREATE OR REPLACE FUNCTION public.match_paper_chunks_hybrid(
  p_paper_id UUID,
  p_query TEXT,
  p_query_embedding vector(1536),
  p_k_vec INT DEFAULT 7,
  p_k_fts INT DEFAULT 3,
  p_alpha DOUBLE PRECISION DEFAULT 0.7
)
RETURNS TABLE (
  id UUID,
  chunk_index INT,
  page_start INT,
  page_end INT,
  content TEXT,
  vec_score DOUBLE PRECISION,
  fts_score DOUBLE PRECISION,
  score DOUBLE PRECISION,
  source TEXT
)
LANGUAGE sql
STABLE
AS $$
  WITH
  q AS (
    SELECT trim(coalesce(p_query, '')) AS query_text
  ),
  vec AS (
    SELECT
      pc.id,
      pc.chunk_index,
      pc.page_start,
      pc.page_end,
      pc.content,
      (1 - (pc.embedding <=> p_query_embedding))::double precision AS vec_score
    FROM public.paper_chunks pc
    WHERE pc.paper_id = p_paper_id
      AND pc.user_id = auth.uid()
      AND pc.embedding IS NOT NULL
    ORDER BY pc.embedding <=> p_query_embedding
    LIMIT GREATEST(p_k_vec, 0)
  ),
  fts AS (
    SELECT
      pc.id,
      pc.chunk_index,
      pc.page_start,
      pc.page_end,
      pc.content,
      ts_rank_cd(pc.content_tsv, websearch_to_tsquery('simple', (SELECT query_text FROM q)))::double precision AS fts_score
    FROM public.paper_chunks pc
    WHERE pc.paper_id = p_paper_id
      AND pc.user_id = auth.uid()
      AND (SELECT query_text FROM q) <> ''
      AND pc.content_tsv @@ websearch_to_tsquery('simple', (SELECT query_text FROM q))
    ORDER BY ts_rank_cd(pc.content_tsv, websearch_to_tsquery('simple', (SELECT query_text FROM q))) DESC
    LIMIT GREATEST(p_k_fts, 0)
  ),
  unioned AS (
    SELECT id, chunk_index, page_start, page_end, content, vec_score, NULL::double precision AS fts_score, 'vector'::text AS source
    FROM vec
    UNION ALL
    SELECT id, chunk_index, page_start, page_end, content, NULL::double precision AS vec_score, fts_score, 'fts'::text AS source
    FROM fts
  ),
  agg AS (
    SELECT
      id,
      MIN(chunk_index) AS chunk_index,
      MIN(page_start) AS page_start,
      MAX(page_end) AS page_end,
      MAX(content) AS content,
      MAX(vec_score) AS vec_score,
      MAX(fts_score) AS fts_score
    FROM unioned
    GROUP BY id
  )
  SELECT
    id,
    chunk_index,
    page_start,
    page_end,
    content,
    COALESCE(vec_score, 0) AS vec_score,
    COALESCE(fts_score, 0) AS fts_score,
    (p_alpha * COALESCE(vec_score, 0) + (1 - p_alpha) * COALESCE(fts_score, 0)) AS score,
    CASE
      WHEN vec_score IS NOT NULL AND fts_score IS NOT NULL THEN 'hybrid'
      WHEN vec_score IS NOT NULL THEN 'vector'
      ELSE 'fts'
    END AS source
  FROM agg
  ORDER BY score DESC
  LIMIT (GREATEST(p_k_vec, 0) + GREATEST(p_k_fts, 0));
$$;

