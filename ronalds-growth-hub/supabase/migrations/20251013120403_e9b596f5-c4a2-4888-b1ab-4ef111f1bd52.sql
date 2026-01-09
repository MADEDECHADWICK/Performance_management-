-- Create evaluation_teams table for department/sub-team structures
CREATE TABLE IF NOT EXISTS public.evaluation_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID REFERENCES public.departments(id) ON DELETE CASCADE NOT NULL,
  team_name TEXT NOT NULL,
  description TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create evaluation_team_members table for linking employees to teams
CREATE TABLE IF NOT EXISTS public.evaluation_team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES public.evaluation_teams(id) ON DELETE CASCADE NOT NULL,
  employee_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(team_id, employee_id)
);

-- Add team_id to ad_hoc_evaluations to support team-based evaluations
ALTER TABLE public.ad_hoc_evaluations 
ADD COLUMN IF NOT EXISTS evaluation_target TEXT DEFAULT 'individual',
ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.evaluation_teams(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL;

-- Enable RLS on new tables
ALTER TABLE public.evaluation_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_team_members ENABLE ROW LEVEL SECURITY;

-- RLS policies for evaluation_teams
CREATE POLICY "All authenticated users can view teams"
ON public.evaluation_teams
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "HR and admins can manage teams"
ON public.evaluation_teams
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'hr_manager'::app_role) OR 
  has_role(auth.uid(), 'super_admin'::app_role)
);

-- RLS policies for evaluation_team_members
CREATE POLICY "All authenticated users can view team members"
ON public.evaluation_team_members
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "HR and admins can manage team members"
ON public.evaluation_team_members
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'hr_manager'::app_role) OR 
  has_role(auth.uid(), 'super_admin'::app_role)
);

-- Create trigger for updated_at on evaluation_teams
CREATE TRIGGER update_evaluation_teams_updated_at
BEFORE UPDATE ON public.evaluation_teams
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_evaluation_teams_department ON public.evaluation_teams(department_id);
CREATE INDEX IF NOT EXISTS idx_evaluation_team_members_team ON public.evaluation_team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_evaluation_team_members_employee ON public.evaluation_team_members(employee_id);
CREATE INDEX IF NOT EXISTS idx_ad_hoc_evaluations_team ON public.ad_hoc_evaluations(team_id);
CREATE INDEX IF NOT EXISTS idx_ad_hoc_evaluations_department ON public.ad_hoc_evaluations(department_id);