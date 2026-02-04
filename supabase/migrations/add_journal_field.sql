-- 添加 journal（期刊）字段到 papers 表
-- 请在 Supabase SQL Editor 中执行此脚本

ALTER TABLE public.papers 
ADD COLUMN IF NOT EXISTS journal TEXT;

-- 同时确保其他新字段也存在
ALTER TABLE public.papers 
ADD COLUMN IF NOT EXISTS keywords TEXT;

ALTER TABLE public.papers 
ADD COLUMN IF NOT EXISTS published_date TEXT;

-- 添加索引以优化筛选性能
CREATE INDEX IF NOT EXISTS papers_journal_idx ON public.papers(journal);
CREATE INDEX IF NOT EXISTS papers_published_date_idx ON public.papers(published_date);
CREATE INDEX IF NOT EXISTS papers_tags_idx ON public.papers USING GIN(tags);

-- 添加注释
COMMENT ON COLUMN public.papers.journal IS '发表期刊/会议名称';
COMMENT ON COLUMN public.papers.keywords IS '中文关键词';
COMMENT ON COLUMN public.papers.published_date IS '发表年月（YYYY-MM 或 YYYY）';
