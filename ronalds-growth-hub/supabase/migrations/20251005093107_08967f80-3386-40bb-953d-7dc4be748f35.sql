-- Create table for project financials
CREATE TABLE public.project_financials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  job_number TEXT,
  fees NUMERIC NOT NULL,
  completion_percentage NUMERIC DEFAULT 0,
  amount_collected NUMERIC DEFAULT 0,
  collection_period TEXT,
  surplus_deficit NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create table for employee project allocations
CREATE TABLE public.employee_project_allocations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_financial_id UUID REFERENCES public.project_financials(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  role_on_project TEXT NOT NULL,
  billable_hours NUMERIC NOT NULL,
  hourly_rate NUMERIC NOT NULL,
  total_cost NUMERIC NOT NULL,
  allocation_amount NUMERIC NOT NULL,
  surplus_deficit_share NUMERIC,
  total_money_to_receive NUMERIC,
  actual_money_received NUMERIC,
  weight_on_collection NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.project_financials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_project_allocations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for project_financials
CREATE POLICY "HR and admins can manage project financials"
ON public.project_financials FOR ALL
USING (has_role(auth.uid(), 'hr_manager'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Employees can view project financials for their projects"
ON public.project_financials FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM employee_project_allocations
    WHERE employee_project_allocations.project_financial_id = project_financials.id
    AND employee_project_allocations.employee_id = auth.uid()
  )
);

-- RLS Policies for employee_project_allocations
CREATE POLICY "HR and admins can manage allocations"
ON public.employee_project_allocations FOR ALL
USING (has_role(auth.uid(), 'hr_manager'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Employees can view their own allocations"
ON public.employee_project_allocations FOR SELECT
USING (auth.uid() = employee_id);

CREATE POLICY "Managers can view team allocations"
ON public.employee_project_allocations FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = employee_project_allocations.employee_id
    AND profiles.manager_id = auth.uid()
  )
);

-- Create function to calculate financial KPI scores
CREATE OR REPLACE FUNCTION public.calculate_employee_financial_score(
  _employee_id UUID,
  _period_start DATE,
  _period_end DATE
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total_allocation NUMERIC := 0;
  total_collection NUMERIC := 0;
  financial_score NUMERIC := 0;
BEGIN
  -- Sum up allocations and collections for the period
  SELECT 
    COALESCE(SUM(allocation_amount), 0),
    COALESCE(SUM(weight_on_collection), 0)
  INTO total_allocation, total_collection
  FROM employee_project_allocations epa
  JOIN project_financials pf ON epa.project_financial_id = pf.id
  WHERE epa.employee_id = _employee_id
  AND pf.created_at BETWEEN _period_start AND _period_end;
  
  -- Calculate score (50% allocation + 50% collection normalized to 0-100 scale)
  -- This is a simplified calculation - adjust based on your scoring criteria
  IF (total_allocation + total_collection) > 0 THEN
    financial_score := LEAST(100, ((total_allocation + total_collection) / 1000000.0) * 100);
  END IF;
  
  RETURN ROUND(financial_score, 2);
END;
$$;

-- Add trigger for updated_at
CREATE TRIGGER update_project_financials_updated_at
BEFORE UPDATE ON public.project_financials
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_employee_project_allocations_updated_at
BEFORE UPDATE ON public.employee_project_allocations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();