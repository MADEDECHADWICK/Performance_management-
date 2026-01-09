-- Create peer evaluations table
CREATE TABLE IF NOT EXISTS public.peer_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES public.evaluation_cycles(id) ON DELETE CASCADE,
  evaluator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  evaluatee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_anonymous BOOLEAN DEFAULT true,
  
  -- Competency ratings (1-5 scale)
  technical_expertise NUMERIC,
  communication NUMERIC,
  teamwork NUMERIC,
  problem_solving NUMERIC,
  work_quality NUMERIC,
  reliability NUMERIC,
  professional_development NUMERIC,
  
  -- Open-ended feedback
  strengths TEXT,
  improvements TEXT,
  specific_example TEXT,
  additional_comments TEXT,
  would_work_again TEXT CHECK (would_work_again IN ('definitely', 'probably', 'maybe', 'probably_not')),
  
  -- Status tracking
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  submitted_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  UNIQUE(cycle_id, evaluator_id, evaluatee_id)
);

-- Enable RLS
ALTER TABLE public.peer_evaluations ENABLE ROW LEVEL SECURITY;

-- Policies for peer evaluations
CREATE POLICY "Evaluators can view their assigned peer evaluations"
ON public.peer_evaluations FOR SELECT
USING (auth.uid() = evaluator_id);

CREATE POLICY "Evaluators can insert their peer evaluations"
ON public.peer_evaluations FOR INSERT
WITH CHECK (auth.uid() = evaluator_id);

CREATE POLICY "Evaluators can update their pending evaluations"
ON public.peer_evaluations FOR UPDATE
USING (auth.uid() = evaluator_id AND status != 'completed');

CREATE POLICY "Evaluatees can view completed peer evaluations about them"
ON public.peer_evaluations FOR SELECT
USING (auth.uid() = evaluatee_id AND status = 'completed');

CREATE POLICY "HR and admins can view all peer evaluations"
ON public.peer_evaluations FOR SELECT
USING (has_role(auth.uid(), 'hr_manager'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "HR and admins can manage peer evaluations"
ON public.peer_evaluations FOR ALL
USING (has_role(auth.uid(), 'hr_manager'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

-- Create trigger for updated_at
CREATE TRIGGER update_peer_evaluations_updated_at
BEFORE UPDATE ON public.peer_evaluations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add peer assignment mode to evaluation cycles
ALTER TABLE public.evaluation_cycles 
ADD COLUMN IF NOT EXISTS peer_assignment_mode TEXT DEFAULT 'manual' CHECK (peer_assignment_mode IN ('auto', 'manual'));

ALTER TABLE public.evaluation_cycles
ADD COLUMN IF NOT EXISTS peers_per_person INTEGER DEFAULT 3 CHECK (peers_per_person BETWEEN 1 AND 10);

ALTER TABLE public.evaluation_cycles
ADD COLUMN IF NOT EXISTS peer_anonymity TEXT DEFAULT 'optional' CHECK (peer_anonymity IN ('always', 'optional', 'never'));