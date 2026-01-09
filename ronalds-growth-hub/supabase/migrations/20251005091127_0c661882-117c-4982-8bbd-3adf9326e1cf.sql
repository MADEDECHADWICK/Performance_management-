-- Create evaluation cycles table
CREATE TABLE public.evaluation_cycles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  cycle_type TEXT NOT NULL CHECK (cycle_type IN ('quarterly', 'annual', 'project')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('draft', 'active', 'closed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create client evaluations table (separate from internal feedback)
CREATE TABLE public.client_evaluations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL,
  cycle_id UUID REFERENCES public.evaluation_cycles(id) ON DELETE SET NULL,
  
  -- Rating categories (1-5 scale)
  quality_of_work NUMERIC CHECK (quality_of_work >= 1 AND quality_of_work <= 5),
  communication NUMERIC CHECK (communication >= 1 AND communication <= 5),
  timeliness NUMERIC CHECK (timeliness >= 1 AND timeliness <= 5),
  professionalism NUMERIC CHECK (professionalism >= 1 AND professionalism <= 5),
  expertise NUMERIC CHECK (expertise >= 1 AND expertise <= 5),
  
  overall_rating NUMERIC CHECK (overall_rating >= 1 AND overall_rating <= 5),
  comments TEXT,
  would_recommend BOOLEAN,
  
  access_token TEXT UNIQUE NOT NULL, -- For secure client access
  submitted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create audit logs table
CREATE TABLE public.audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  changes JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on new tables
ALTER TABLE public.evaluation_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for evaluation_cycles
CREATE POLICY "All authenticated users can view cycles"
  ON public.evaluation_cycles FOR SELECT
  USING (true);

CREATE POLICY "HR and admins can manage cycles"
  ON public.evaluation_cycles FOR ALL
  USING (has_role(auth.uid(), 'hr_manager') OR has_role(auth.uid(), 'super_admin'));

-- RLS Policies for client_evaluations
CREATE POLICY "HR and admins can view all client evaluations"
  ON public.client_evaluations FOR SELECT
  USING (has_role(auth.uid(), 'hr_manager') OR has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Managers can view their team's client evaluations"
  ON public.client_evaluations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = client_evaluations.employee_id
      AND profiles.manager_id = auth.uid()
    )
  );

CREATE POLICY "Employees can view their own client evaluations"
  ON public.client_evaluations FOR SELECT
  USING (auth.uid() = employee_id);

-- Allow unauthenticated access via token (for clients submitting evaluations)
CREATE POLICY "Anyone can submit with valid token"
  ON public.client_evaluations FOR INSERT
  WITH CHECK (access_token IS NOT NULL);

CREATE POLICY "Anyone can update with valid token"
  ON public.client_evaluations FOR UPDATE
  USING (submitted_at IS NULL);

-- RLS Policies for audit_logs
CREATE POLICY "Admins can view all audit logs"
  ON public.audit_logs FOR SELECT
  USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "HR can view audit logs"
  ON public.audit_logs FOR SELECT
  USING (has_role(auth.uid(), 'hr_manager'));

-- Triggers for updated_at
CREATE TRIGGER update_evaluation_cycles_updated_at
  BEFORE UPDATE ON public.evaluation_cycles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_client_evaluations_updated_at
  BEFORE UPDATE ON public.client_evaluations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add cycle_id to existing performance_reviews table
ALTER TABLE public.performance_reviews 
ADD COLUMN cycle_id UUID REFERENCES public.evaluation_cycles(id) ON DELETE SET NULL;

-- Add RLS to existing tables that need it
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- RLS Policies for clients
CREATE POLICY "HR and admins can view all clients"
  ON public.clients FOR SELECT
  USING (has_role(auth.uid(), 'hr_manager') OR has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Account managers can view their clients"
  ON public.clients FOR SELECT
  USING (auth.uid() = account_manager_id);

CREATE POLICY "HR and admins can manage clients"
  ON public.clients FOR ALL
  USING (has_role(auth.uid(), 'hr_manager') OR has_role(auth.uid(), 'super_admin'));

-- RLS Policies for projects
CREATE POLICY "HR and admins can view all projects"
  ON public.projects FOR SELECT
  USING (has_role(auth.uid(), 'hr_manager') OR has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Project managers can view their projects"
  ON public.projects FOR SELECT
  USING (auth.uid() = manager_id);

CREATE POLICY "Employees can view projects they work on"
  ON public.projects FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM work_logs
      WHERE work_logs.project_id = projects.id
      AND work_logs.employee_id = auth.uid()
    )
  );

-- Insert default evaluation cycle
INSERT INTO public.evaluation_cycles (name, cycle_type, start_date, end_date, status)
VALUES 
  ('Q1 2025', 'quarterly', '2025-01-01', '2025-03-31', 'active'),
  ('Annual 2024', 'annual', '2024-01-01', '2024-12-31', 'closed');