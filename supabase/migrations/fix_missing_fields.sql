-- ============================================
-- 添加缺失字段到 papers 表
-- 执行时间: 2026-02-03
-- ============================================

-- 添加 journal（期刊/会议）字段
ALTER TABLE public.papers 
ADD COLUMN IF NOT EXISTS journal TEXT;

-- 添加 keywords（中文关键词）字段
ALTER TABLE public.papers 
ADD COLUMN IF NOT EXISTS keywords TEXT;

-- 添加 published_date（发表日期）字段
ALTER TABLE public.papers 
ADD COLUMN IF NOT EXISTS published_date TEXT;

-- ============================================
-- 添加索引以优化查询性能
-- ============================================

-- 期刊索引
CREATE INDEX IF NOT EXISTS papers_journal_idx ON public.papers(journal);

-- 发表日期索引
CREATE INDEX IF NOT EXISTS papers_published_date_idx ON public.papers(published_date);

-- 标签 GIN 索引（用于数组查询）
CREATE INDEX IF NOT EXISTS papers_tags_idx ON public.papers USING GIN(tags);

-- ============================================
-- 添加注释说明字段用途
-- ============================================

COMMENT ON COLUMN public.papers.journal IS '发表期刊或会议名称（如 CVPR 2024, Nature 等）';
COMMENT ON COLUMN public.papers.keywords IS '中文关键词，用于搜索和分类';
COMMENT ON COLUMN public.papers.published_date IS '论文发表日期（YYYY-MM 或 YYYY 格式）';

-- ============================================
-- 验证字段是否添加成功
-- ============================================

-- 运行此查询确认字段已添加
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'papers' 
AND column_name IN ('journal', 'keywords', 'published_date')
ORDER BY column_name;
