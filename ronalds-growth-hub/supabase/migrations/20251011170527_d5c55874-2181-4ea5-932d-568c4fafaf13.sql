-- Add BSC categories to KPIs table
ALTER TABLE kpis ADD COLUMN IF NOT EXISTS bsc_category TEXT;
COMMENT ON COLUMN kpis.bsc_category IS 'Balanced Scorecard category: learning_growth, customer_satisfaction, internal_processes, or null for financial';

-- Add visibility control to evaluations
ALTER TABLE employee_evaluations ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'public' CHECK (visibility IN ('public', 'admin_only'));
ALTER TABLE peer_evaluations ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'public' CHECK (visibility IN ('public', 'admin_only'));

-- Create upward evaluations table (employees evaluating managers)
CREATE TABLE IF NOT EXISTS upward_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  manager_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  cycle_id UUID NOT NULL REFERENCES evaluation_cycles(id) ON DELETE CASCADE,
  
  -- Leadership competencies
  leadership_vision NUMERIC CHECK (leadership_vision >= 1 AND leadership_vision <= 5),
  communication NUMERIC CHECK (communication >= 1 AND communication <= 5),
  decision_making NUMERIC CHECK (decision_making >= 1 AND decision_making <= 5),
  team_development NUMERIC CHECK (team_development >= 1 AND team_development <= 5),
  delegation NUMERIC CHECK (delegation >= 1 AND delegation <= 5),
  conflict_resolution NUMERIC CHECK (conflict_resolution >= 1 AND conflict_resolution <= 5),
  recognition NUMERIC CHECK (recognition >= 1 AND recognition <= 5),
  
  -- Open feedback
  strengths TEXT,
  improvements TEXT,
  additional_comments TEXT,
  
  is_anonymous BOOLEAN DEFAULT true,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  visibility TEXT DEFAULT 'admin_only' CHECK (visibility IN ('public', 'admin_only')),
  
  submitted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  UNIQUE(evaluator_id, manager_id, cycle_id)
);

-- Create employee goals table
CREATE TABLE IF NOT EXISTS employee_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  cycle_id UUID NOT NULL REFERENCES evaluation_cycles(id) ON DELETE CASCADE,
  kpi_id UUID REFERENCES kpis(id) ON DELETE SET NULL,
  
  goal_title TEXT NOT NULL,
  goal_description TEXT,
  target_value NUMERIC,
  achieved_value NUMERIC,
  
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed')),
  manager_comments TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create employee KPI assignments table
CREATE TABLE IF NOT EXISTS employee_kpi_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  kpi_id UUID NOT NULL REFERENCES kpis(id) ON DELETE CASCADE,
  cycle_id UUID NOT NULL REFERENCES evaluation_cycles(id) ON DELETE CASCADE,
  
  custom_weight NUMERIC DEFAULT 0 CHECK (custom_weight >= 0 AND custom_weight <= 100),
  target_value NUMERIC,
  achieved_value NUMERIC,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  UNIQUE(employee_id, kpi_id, cycle_id)
);

-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('evaluation_assigned', 'evaluation_due', 'evaluation_completed', 'goal_approved', 'goal_rejected', 'score_finalized')),
  
  is_read BOOLEAN DEFAULT false,
  related_entity_type TEXT,
  related_entity_id UUID,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create system configuration table
CREATE TABLE IF NOT EXISTS system_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key TEXT UNIQUE NOT NULL,
  config_value JSONB NOT NULL,
  description TEXT,
  
  updated_by UUID REFERENCES profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add BSC score fields to employee_evaluations
ALTER TABLE employee_evaluations ADD COLUMN IF NOT EXISTS bsc_learning_growth_score NUMERIC;
ALTER TABLE employee_evaluations ADD COLUMN IF NOT EXISTS bsc_customer_satisfaction_score NUMERIC;
ALTER TABLE employee_evaluations ADD COLUMN IF NOT EXISTS bsc_internal_processes_score NUMERIC;

-- Create triggers for updated_at
CREATE TRIGGER update_upward_evaluations_updated_at
  BEFORE UPDATE ON upward_evaluations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_employee_goals_updated_at
  BEFORE UPDATE ON employee_goals
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_employee_kpi_assignments_updated_at
  BEFORE UPDATE ON employee_kpi_assignments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_system_config_updated_at
  BEFORE UPDATE ON system_config
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies for upward_evaluations
ALTER TABLE upward_evaluations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Evaluators can insert their upward evaluations"
  ON upward_evaluations FOR INSERT
  WITH CHECK (auth.uid() = evaluator_id);

CREATE POLICY "Evaluators can update their pending upward evaluations"
  ON upward_evaluations FOR UPDATE
  USING (auth.uid() = evaluator_id AND status <> 'completed');

CREATE POLICY "Evaluators can view their assigned upward evaluations"
  ON upward_evaluations FOR SELECT
  USING (auth.uid() = evaluator_id);

CREATE POLICY "Managers can view completed non-sensitive upward evaluations about them"
  ON upward_evaluations FOR SELECT
  USING (auth.uid() = manager_id AND status = 'completed' AND visibility = 'public');

CREATE POLICY "HR and admins can manage upward evaluations"
  ON upward_evaluations FOR ALL
  USING (has_role(auth.uid(), 'hr_manager'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

-- RLS Policies for employee_goals
ALTER TABLE employee_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees can view their own goals"
  ON employee_goals FOR SELECT
  USING (auth.uid() = employee_id);

CREATE POLICY "Employees can insert their own goals"
  ON employee_goals FOR INSERT
  WITH CHECK (auth.uid() = employee_id);

CREATE POLICY "Employees can update their pending goals"
  ON employee_goals FOR UPDATE
  USING (auth.uid() = employee_id AND status = 'pending');

CREATE POLICY "Managers can view team goals"
  ON employee_goals FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = employee_goals.employee_id
    AND profiles.manager_id = auth.uid()
  ));

CREATE POLICY "Managers can update team goals"
  ON employee_goals FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = employee_goals.employee_id
    AND profiles.manager_id = auth.uid()
  ));

CREATE POLICY "HR and admins can manage goals"
  ON employee_goals FOR ALL
  USING (has_role(auth.uid(), 'hr_manager'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

-- RLS Policies for employee_kpi_assignments
ALTER TABLE employee_kpi_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees can view their KPI assignments"
  ON employee_kpi_assignments FOR SELECT
  USING (auth.uid() = employee_id);

CREATE POLICY "Managers can view team KPI assignments"
  ON employee_kpi_assignments FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = employee_kpi_assignments.employee_id
    AND profiles.manager_id = auth.uid()
  ));

CREATE POLICY "HR and admins can manage KPI assignments"
  ON employee_kpi_assignments FOR ALL
  USING (has_role(auth.uid(), 'hr_manager'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

-- RLS Policies for notifications
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert notifications"
  ON notifications FOR INSERT
  WITH CHECK (true);

-- RLS Policies for system_config
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated users can view system config"
  ON system_config FOR SELECT
  USING (true);

CREATE POLICY "HR and admins can manage system config"
  ON system_config FOR ALL
  USING (has_role(auth.uid(), 'hr_manager'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

-- Add profile enhancements
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS position TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS hire_date DATE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS education TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS certifications TEXT[];
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profile_photo_url TEXT;

-- Insert default BSC weight configuration
INSERT INTO system_config (config_key, config_value, description)
VALUES 
  ('financial_weight', '{"value": 70}'::jsonb, 'Weight percentage for financial performance'),
  ('non_financial_weight', '{"value": 30}'::jsonb, 'Weight percentage for non-financial performance'),
  ('bsc_learning_growth_weight', '{"value": 33.33}'::jsonb, 'Weight percentage for Learning & Growth within non-financial'),
  ('bsc_customer_satisfaction_weight', '{"value": 33.33}'::jsonb, 'Weight percentage for Customer Satisfaction within non-financial'),
  ('bsc_internal_processes_weight', '{"value": 33.34}'::jsonb, 'Weight percentage for Internal Processes within non-financial')
ON CONFLICT (config_key) DO NOTHING;