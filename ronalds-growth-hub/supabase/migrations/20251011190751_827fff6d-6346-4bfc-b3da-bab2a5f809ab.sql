-- Create storage bucket for evaluation evidence
INSERT INTO storage.buckets (id, name, public)
VALUES ('evaluation-evidence', 'evaluation-evidence', false)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for evaluation evidence storage
CREATE POLICY "Users can upload their own evaluation evidence"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'evaluation-evidence' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can view their own evaluation evidence"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'evaluation-evidence' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "HR and admins can view all evaluation evidence"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'evaluation-evidence'
  AND (has_role(auth.uid(), 'hr_manager'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
);

-- Add columns to evaluation_assignments for responses and evidence
ALTER TABLE public.evaluation_assignments 
ADD COLUMN IF NOT EXISTS responses JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS evidence_urls JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS evaluator_comments TEXT;

-- Update RLS policy to allow evaluators to update their assignments
DROP POLICY IF EXISTS "Evaluators can update assignments" ON public.evaluation_assignments;
CREATE POLICY "Evaluators can update their assignments"
ON public.evaluation_assignments FOR UPDATE
USING (auth.uid() = evaluator_id AND status != 'completed');