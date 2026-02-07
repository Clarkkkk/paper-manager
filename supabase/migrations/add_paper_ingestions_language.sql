-- Add language metadata to paper_ingestions for better query generation.

ALTER TABLE public.paper_ingestions
ADD COLUMN IF NOT EXISTS language TEXT;

