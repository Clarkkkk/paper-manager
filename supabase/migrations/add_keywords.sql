-- 添加 keywords 和 published_date 字段到 papers 表

-- 中文关键词，用于搜索
ALTER TABLE public.papers 
ADD COLUMN IF NOT EXISTS keywords TEXT;

-- 论文发表日期
ALTER TABLE public.papers 
ADD COLUMN IF NOT EXISTS published_date TEXT;

-- 添加注释
COMMENT ON COLUMN public.papers.keywords IS '中文关键词，用于搜索';
COMMENT ON COLUMN public.papers.published_date IS '论文发表日期';
