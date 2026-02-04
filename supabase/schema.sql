-- ============================================
-- MySciSpace Database Schema
-- ============================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ============================================
-- 1. Profiles Table (extends auth.users)
-- ============================================
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  openai_api_key TEXT, -- 用户自定义的 API Key (支持多种提供商)
  preferred_model TEXT DEFAULT 'gemini-2.0-flash-lite',
  api_provider TEXT DEFAULT 'google', -- API 提供商: google, openai, openrouter, custom
  api_base_url TEXT, -- 自定义 API Base URL
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for profiles: 用户只能读写自己的 profile
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ============================================
-- 2. Papers Table
-- ============================================
CREATE TABLE public.papers (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  authors TEXT,
  abstract TEXT,
  file_url TEXT NOT NULL, -- Supabase Storage path
  file_name TEXT,
  file_size BIGINT,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for better query performance
CREATE INDEX papers_user_id_idx ON public.papers(user_id);
CREATE INDEX papers_created_at_idx ON public.papers(created_at DESC);

-- RLS for papers: 用户只能操作自己的论文
ALTER TABLE public.papers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own papers"
  ON public.papers FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own papers"
  ON public.papers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own papers"
  ON public.papers FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own papers"
  ON public.papers FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- 3. Notes Table (AI-generated notes)
-- ============================================
CREATE TABLE public.notes (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  paper_id UUID REFERENCES public.papers(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL, -- Markdown 格式的 AI 笔记
  note_type TEXT DEFAULT 'summary', -- 'summary', 'custom'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index
CREATE INDEX notes_paper_id_idx ON public.notes(paper_id);
CREATE INDEX notes_user_id_idx ON public.notes(user_id);

-- RLS for notes
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notes"
  ON public.notes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own notes"
  ON public.notes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own notes"
  ON public.notes FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own notes"
  ON public.notes FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- 4. Chat Messages Table (for RAG conversations)
-- ============================================
CREATE TABLE public.chat_messages (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  paper_id UUID REFERENCES public.papers(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index
CREATE INDEX chat_messages_paper_id_idx ON public.chat_messages(paper_id);
CREATE INDEX chat_messages_user_id_idx ON public.chat_messages(user_id);

-- RLS for chat_messages
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own chat messages"
  ON public.chat_messages FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own chat messages"
  ON public.chat_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own chat messages"
  ON public.chat_messages FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- 5. Functions & Triggers
-- ============================================

-- Function: 自动创建 profile（新用户注册时触发）
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: 新用户注册后自动创建 profile
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function: 自动更新 updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to all tables
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_papers_updated_at
  BEFORE UPDATE ON public.papers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_notes_updated_at
  BEFORE UPDATE ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- 6. Storage Bucket Setup
-- ============================================
-- Run this in Supabase Dashboard SQL Editor or via CLI

-- Create private bucket for papers
INSERT INTO storage.buckets (id, name, public)
VALUES ('papers', 'papers', false)
ON CONFLICT (id) DO NOTHING;

-- RLS for storage: 用户只能访问自己的文件
CREATE POLICY "Users can upload own papers"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'papers' AND 
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can view own papers"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'papers' AND 
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete own papers"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'papers' AND 
    auth.uid()::text = (storage.foldername(name))[1]
  );
