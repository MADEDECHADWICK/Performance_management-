-- Enhance kpis table to support hierarchical structure and detailed attributes
ALTER TABLE public.kpis
ADD COLUMN parent_kpi_id UUID REFERENCES public.kpis(id) ON DELETE CASCADE,
ADD COLUMN type TEXT DEFAULT 'general' CHECK (type IN ('general', 'department', 'role')),
ADD COLUMN department_id UUID REFERENCES public.departments(id) ON DELETE CASCADE,
ADD COLUMN job_title TEXT,
ADD COLUMN measurement_unit TEXT DEFAULT '%',
ADD COLUMN target_value NUMERIC,
ADD COLUMN frequency TEXT DEFAULT 'annually' CHECK (frequency IN ('monthly', 'quarterly', 'annually')),
ADD COLUMN status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
ADD COLUMN created_by UUID REFERENCES auth.users(id);

-- Update category to ensure it's either financial or non_financial
ALTER TABLE public.kpis
DROP CONSTRAINT IF EXISTS kpis_category_check,
ADD CONSTRAINT kpis_category_check CHECK (category IN ('financial', 'non_financial'));

-- Enhance employee_kpi_assignments table
ALTER TABLE public.employee_kpi_assignments
ADD COLUMN current_value NUMERIC,
ADD COLUMN achieved BOOLEAN DEFAULT false,
ADD COLUMN evaluation_period TEXT,
ADD COLUMN remarks TEXT;

-- Create index for parent-child KPI relationships
CREATE INDEX IF NOT EXISTS idx_kpis_parent_kpi_id ON public.kpis(parent_kpi_id);
CREATE INDEX IF NOT EXISTS idx_kpis_department_id ON public.kpis(department_id);
CREATE INDEX IF NOT EXISTS idx_kpis_type ON public.kpis(type);
CREATE INDEX IF NOT EXISTS idx_kpis_status ON public.kpis(status);

-- Update RLS policies for kpis to consider new fields
DROP POLICY IF EXISTS "HR and admins can manage KPIs" ON public.kpis;
CREATE POLICY "HR and admins can manage KPIs"
ON public.kpis
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'hr_manager'::app_role) OR 
  has_role(auth.uid(), 'super_admin'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'hr_manager'::app_role) OR 
  has_role(auth.uid(), 'super_admin'::app_role)
);

-- Allow managers to view KPIs for their departments
CREATE POLICY "Managers can view department KPIs"
ON public.kpis
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'manager'::app_role) AND
  department_id IN (
    SELECT department_id FROM public.profiles WHERE id = auth.uid()
  )
);