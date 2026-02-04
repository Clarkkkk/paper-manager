-- 添加 API 提供商配置字段到 profiles 表
-- 请在 Supabase SQL Editor 中执行此脚本

-- 添加 API 提供商字段
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS api_provider TEXT DEFAULT 'google';

-- 添加 API Base URL 字段（用于自定义 API 端点）
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS api_base_url TEXT;

-- 添加注释
COMMENT ON COLUMN public.profiles.api_provider IS 'API 提供商: google, openai, openrouter, custom';
COMMENT ON COLUMN public.profiles.api_base_url IS '自定义 API Base URL';
