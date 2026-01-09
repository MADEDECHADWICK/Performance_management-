-- Add employee_id column to kpis table for role-specific assignment
ALTER TABLE public.kpis 
ADD COLUMN employee_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Add comment for clarity
COMMENT ON COLUMN public.kpis.employee_id IS 'Specific employee for role-specific KPIs';

-- Create index for better query performance
CREATE INDEX idx_kpis_employee_id ON public.kpis(employee_id) WHERE employee_id IS NOT NULL;