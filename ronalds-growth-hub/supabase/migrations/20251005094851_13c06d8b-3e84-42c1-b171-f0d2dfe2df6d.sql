-- Add new columns to evaluation_cycles table
ALTER TABLE evaluation_cycles
ADD COLUMN review_period_start date,
ADD COLUMN review_period_end date,
ADD COLUMN financial_weight numeric DEFAULT 70 CHECK (financial_weight >= 0 AND financial_weight <= 100),
ADD COLUMN non_financial_weight numeric DEFAULT 30 CHECK (non_financial_weight >= 0 AND non_financial_weight <= 100),
ADD COLUMN auto_create_evaluations boolean DEFAULT false;

-- Create employee_evaluations table
CREATE TABLE employee_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid REFERENCES evaluation_cycles(id) ON DELETE CASCADE NOT NULL,
  employee_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  manager_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  
  -- Self-evaluation competencies (1-5 scale)
  self_technical_expertise numeric CHECK (self_technical_expertise >= 1 AND self_technical_expertise <= 5),
  self_communication numeric CHECK (self_communication >= 1 AND self_communication <= 5),
  self_collaboration numeric CHECK (self_collaboration >= 1 AND self_collaboration <= 5),
  self_problem_solving numeric CHECK (self_problem_solving >= 1 AND self_problem_solving <= 5),
  self_time_management numeric CHECK (self_time_management >= 1 AND self_time_management <= 5),
  self_innovation numeric CHECK (self_innovation >= 1 AND self_innovation <= 5),
  
  -- Self-evaluation text fields
  self_achievements text,
  self_challenges text,
  self_goals text,
  self_submitted_at timestamp with time zone,
  
  -- Manager evaluation competencies (1-5 scale)
  manager_technical_expertise numeric CHECK (manager_technical_expertise >= 1 AND manager_technical_expertise <= 5),
  manager_communication numeric CHECK (manager_communication >= 1 AND manager_communication <= 5),
  manager_collaboration numeric CHECK (manager_collaboration >= 1 AND manager_collaboration <= 5),
  manager_problem_solving numeric CHECK (manager_problem_solving >= 1 AND manager_problem_solving <= 5),
  manager_time_management numeric CHECK (manager_time_management >= 1 AND manager_time_management <= 5),
  manager_innovation numeric CHECK (manager_innovation >= 1 AND manager_innovation <= 5),
  
  -- Manager evaluation fields
  manager_comments text,
  manager_strengths text,
  manager_improvements text,
  manager_overall_rating numeric CHECK (manager_overall_rating >= 1 AND manager_overall_rating <= 5),
  manager_recommend_promotion boolean,
  manager_promotion_comments text,
  manager_submitted_at timestamp with time zone,
  
  -- Status tracking
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'self_submitted', 'manager_submitted', 'completed')),
  
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  
  UNIQUE(cycle_id, employee_id)
);

-- Enable RLS
ALTER TABLE employee_evaluations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for employee_evaluations
CREATE POLICY "Employees can view their own evaluations"
ON employee_evaluations FOR SELECT
USING (auth.uid() = employee_id);

CREATE POLICY "Employees can update their own draft evaluations"
ON employee_evaluations FOR UPDATE
USING (auth.uid() = employee_id AND status = 'draft');

CREATE POLICY "Employees can insert their own evaluations"
ON employee_evaluations FOR INSERT
WITH CHECK (auth.uid() = employee_id);

CREATE POLICY "Managers can view their team's evaluations"
ON employee_evaluations FOR SELECT
USING (auth.uid() = manager_id);

CREATE POLICY "Managers can update evaluations for their team"
ON employee_evaluations FOR UPDATE
USING (auth.uid() = manager_id AND status IN ('self_submitted', 'manager_submitted'));

CREATE POLICY "HR and admins can view all evaluations"
ON employee_evaluations FOR SELECT
USING (has_role(auth.uid(), 'hr_manager') OR has_role(auth.uid(), 'super_admin'));

CREATE POLICY "HR and admins can manage all evaluations"
ON employee_evaluations FOR ALL
USING (has_role(auth.uid(), 'hr_manager') OR has_role(auth.uid(), 'super_admin'));

-- Add trigger for updated_at
CREATE TRIGGER update_employee_evaluations_updated_at
BEFORE UPDATE ON employee_evaluations
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();