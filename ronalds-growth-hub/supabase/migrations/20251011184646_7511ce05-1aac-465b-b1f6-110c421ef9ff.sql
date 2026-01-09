-- Evaluation Templates for non-financial assessments
CREATE TABLE public.evaluation_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  template_type TEXT NOT NULL, -- 'self', 'peer', 'upward', 'manager'
  bsc_category TEXT, -- 'learning_growth', 'customer_satisfaction', 'internal_processes'
  competencies JSONB NOT NULL DEFAULT '[]', -- Array of competency definitions
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Link employee goals to specific KPIs
CREATE TABLE public.goal_kpi_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID REFERENCES public.employee_goals(id) ON DELETE CASCADE NOT NULL,
  kpi_id UUID REFERENCES public.kpis(id) ON DELETE CASCADE NOT NULL,
  alignment_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(goal_id, kpi_id)
);

-- Continuous feedback and kudos system
CREATE TABLE public.continuous_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  giver_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  feedback_type TEXT NOT NULL, -- 'kudos', 'constructive', 'recognition'
  category TEXT, -- BSC category or competency area
  message TEXT NOT NULL,
  is_anonymous BOOLEAN DEFAULT false,
  is_public BOOLEAN DEFAULT false,
  related_kpi_id UUID REFERENCES public.kpis(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Learning and development recommendations
CREATE TABLE public.development_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  kpi_id UUID REFERENCES public.kpis(id),
  competency_area TEXT NOT NULL,
  recommendation_type TEXT NOT NULL, -- 'course', 'mentorship', 'project', 'resource'
  title TEXT NOT NULL,
  description TEXT,
  resource_url TEXT,
  priority TEXT DEFAULT 'medium', -- 'high', 'medium', 'low'
  status TEXT DEFAULT 'suggested', -- 'suggested', 'in_progress', 'completed', 'dismissed'
  suggested_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Action items from evaluations
CREATE TABLE public.evaluation_action_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  evaluation_id UUID, -- Can reference different evaluation types
  evaluation_type TEXT, -- 'self', 'peer', 'upward', 'manager'
  action_item TEXT NOT NULL,
  category TEXT, -- BSC category
  due_date DATE,
  status TEXT DEFAULT 'pending', -- 'pending', 'in_progress', 'completed'
  assigned_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.evaluation_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_kpi_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.continuous_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.development_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_action_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for evaluation_templates
CREATE POLICY "All authenticated users can view active templates"
  ON public.evaluation_templates FOR SELECT
  USING (is_active = true);

CREATE POLICY "HR and admins can manage templates"
  ON public.evaluation_templates FOR ALL
  USING (has_role(auth.uid(), 'hr_manager') OR has_role(auth.uid(), 'super_admin'));

-- RLS Policies for goal_kpi_links
CREATE POLICY "Employees can view their goal-KPI links"
  ON public.goal_kpi_links FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM employee_goals 
    WHERE employee_goals.id = goal_kpi_links.goal_id 
    AND employee_goals.employee_id = auth.uid()
  ));

CREATE POLICY "Employees can manage their goal-KPI links"
  ON public.goal_kpi_links FOR ALL
  USING (EXISTS (
    SELECT 1 FROM employee_goals 
    WHERE employee_goals.id = goal_kpi_links.goal_id 
    AND employee_goals.employee_id = auth.uid()
  ));

CREATE POLICY "HR and admins can manage all goal-KPI links"
  ON public.goal_kpi_links FOR ALL
  USING (has_role(auth.uid(), 'hr_manager') OR has_role(auth.uid(), 'super_admin'));

-- RLS Policies for continuous_feedback
CREATE POLICY "Users can view feedback they received"
  ON public.continuous_feedback FOR SELECT
  USING (auth.uid() = recipient_id);

CREATE POLICY "Users can view feedback they gave"
  ON public.continuous_feedback FOR SELECT
  USING (auth.uid() = giver_id);

CREATE POLICY "Users can view public feedback"
  ON public.continuous_feedback FOR SELECT
  USING (is_public = true);

CREATE POLICY "Users can give feedback"
  ON public.continuous_feedback FOR INSERT
  WITH CHECK (auth.uid() = giver_id OR giver_id IS NULL);

CREATE POLICY "HR and admins can view all feedback"
  ON public.continuous_feedback FOR SELECT
  USING (has_role(auth.uid(), 'hr_manager') OR has_role(auth.uid(), 'super_admin'));

-- RLS Policies for development_recommendations
CREATE POLICY "Employees can view their recommendations"
  ON public.development_recommendations FOR SELECT
  USING (auth.uid() = employee_id);

CREATE POLICY "Employees can update their recommendation status"
  ON public.development_recommendations FOR UPDATE
  USING (auth.uid() = employee_id);

CREATE POLICY "HR and managers can create recommendations"
  ON public.development_recommendations FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'manager') OR has_role(auth.uid(), 'hr_manager') OR has_role(auth.uid(), 'super_admin'));

CREATE POLICY "HR and admins can manage all recommendations"
  ON public.development_recommendations FOR ALL
  USING (has_role(auth.uid(), 'hr_manager') OR has_role(auth.uid(), 'super_admin'));

-- RLS Policies for evaluation_action_items
CREATE POLICY "Employees can view their action items"
  ON public.evaluation_action_items FOR SELECT
  USING (auth.uid() = employee_id);

CREATE POLICY "Employees can update their action item status"
  ON public.evaluation_action_items FOR UPDATE
  USING (auth.uid() = employee_id);

CREATE POLICY "Managers can create action items for their team"
  ON public.evaluation_action_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = employee_id 
      AND profiles.manager_id = auth.uid()
    ) OR has_role(auth.uid(), 'hr_manager') OR has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY "HR and admins can manage all action items"
  ON public.evaluation_action_items FOR ALL
  USING (has_role(auth.uid(), 'hr_manager') OR has_role(auth.uid(), 'super_admin'));

-- Triggers for updated_at
CREATE TRIGGER update_evaluation_templates_updated_at
  BEFORE UPDATE ON public.evaluation_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_development_recommendations_updated_at
  BEFORE UPDATE ON public.development_recommendations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_evaluation_action_items_updated_at
  BEFORE UPDATE ON public.evaluation_action_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();