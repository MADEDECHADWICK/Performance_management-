-- Create ad_hoc_evaluations table to store evaluation configurations
CREATE TABLE public.ad_hoc_evaluations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  cycle_id UUID REFERENCES evaluation_cycles(id),
  created_by UUID REFERENCES profiles(id),
  
  -- Evaluation types enabled
  enable_self_evaluation BOOLEAN DEFAULT false,
  enable_peer_evaluation BOOLEAN DEFAULT false,
  enable_upward_evaluation BOOLEAN DEFAULT false,
  enable_downward_evaluation BOOLEAN DEFAULT false,
  
  -- Due date configuration
  due_date TIMESTAMP WITH TIME ZONE,
  send_reminders BOOLEAN DEFAULT true,
  cancel_if_not_processed BOOLEAN DEFAULT false,
  
  -- Processing options
  process_anonymously BOOLEAN DEFAULT false,
  hide_from_dashboard BOOLEAN DEFAULT false,
  require_all_kpis BOOLEAN DEFAULT false,
  exclude_from_score BOOLEAN DEFAULT false,
  
  -- Signature options
  require_evaluator_signature BOOLEAN DEFAULT false,
  require_evaluatee_signature BOOLEAN DEFAULT false,
  send_signature_to_evaluatee BOOLEAN DEFAULT false,
  send_signature_to_managers BOOLEAN DEFAULT false,
  send_signature_to_downward_evaluators BOOLEAN DEFAULT false,
  
  -- Status
  status TEXT DEFAULT 'draft',
  published_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create evaluation_assignments table to track who evaluates whom
CREATE TABLE public.evaluation_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ad_hoc_evaluation_id UUID REFERENCES ad_hoc_evaluations(id) ON DELETE CASCADE,
  evaluator_id UUID REFERENCES profiles(id),
  evaluatee_id UUID REFERENCES profiles(id),
  evaluation_type TEXT NOT NULL, -- 'self', 'peer', 'upward', 'downward'
  status TEXT DEFAULT 'pending',
  submitted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create evaluation_result_areas table for KPI assignments in ad-hoc evaluations
CREATE TABLE public.evaluation_result_areas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ad_hoc_evaluation_id UUID REFERENCES ad_hoc_evaluations(id) ON DELETE CASCADE,
  kpi_id UUID REFERENCES kpis(id),
  evaluator_type TEXT, -- 'self', 'peer', 'upward', 'downward'
  weight NUMERIC DEFAULT 0,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ad_hoc_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_result_areas ENABLE ROW LEVEL SECURITY;

-- RLS Policies for ad_hoc_evaluations
CREATE POLICY "HR and admins can manage ad-hoc evaluations"
  ON ad_hoc_evaluations FOR ALL
  USING (has_role(auth.uid(), 'hr_manager'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Users can view published ad-hoc evaluations"
  ON ad_hoc_evaluations FOR SELECT
  USING (status = 'published');

-- RLS Policies for evaluation_assignments
CREATE POLICY "HR and admins can manage assignments"
  ON evaluation_assignments FOR ALL
  USING (has_role(auth.uid(), 'hr_manager'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Evaluators can view their assignments"
  ON evaluation_assignments FOR SELECT
  USING (auth.uid() = evaluator_id);

CREATE POLICY "Evaluatees can view assignments about them"
  ON evaluation_assignments FOR SELECT
  USING (auth.uid() = evaluatee_id);

-- RLS Policies for evaluation_result_areas
CREATE POLICY "HR and admins can manage result areas"
  ON evaluation_result_areas FOR ALL
  USING (has_role(auth.uid(), 'hr_manager'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Users can view result areas for published evaluations"
  ON evaluation_result_areas FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM ad_hoc_evaluations
      WHERE ad_hoc_evaluations.id = evaluation_result_areas.ad_hoc_evaluation_id
      AND ad_hoc_evaluations.status = 'published'
    )
  );

-- Create updated_at trigger for ad_hoc_evaluations
CREATE TRIGGER update_ad_hoc_evaluations_updated_at
  BEFORE UPDATE ON ad_hoc_evaluations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();