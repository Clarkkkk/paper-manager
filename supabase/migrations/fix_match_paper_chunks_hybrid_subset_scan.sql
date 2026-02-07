-- Fix: make hybrid retrieval stable within a single paper/user.
--
-- Problem:
-- In some cases, pgvector ivfflat ANN plan can return far fewer than k results when
-- combined with WHERE filters (paper_id/user_id). This can cause missed chunks even
-- when they exist and embeddings are present.
--
-- Solution (Plan A):
-- First materialize the filtered subset for (paper_id, auth.uid()), then rank within
-- that subset. This avoids "ANN candidates then filter" behavior and makes kVec stable
-- for per-paper retrieval.
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
  -- Materialize subset first to avoid ANN candidate filtering issues.
  filtered AS MATERIALIZED (
    SELECT
      pc.id,
      pc.chunk_index,
      pc.page_start,
      pc.page_end,
      pc.content,
      pc.content_tsv,
      pc.embedding
    FROM public.paper_chunks pc
    WHERE pc.paper_id = p_paper_id
      AND pc.user_id = auth.uid()
  ),
  vec AS (
    SELECT
      pc.id,
      pc.chunk_index,
      pc.page_start,
      pc.page_end,
      pc.content,
      (1 - (pc.embedding <=> p_query_embedding))::double precision AS vec_score
    FROM filtered pc
    WHERE pc.embedding IS NOT NULL
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
    FROM filtered pc
    WHERE (SELECT query_text FROM q) <> ''
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

