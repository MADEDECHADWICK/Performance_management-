-- Add department_code and department_head_id to departments table
ALTER TABLE public.departments
ADD COLUMN IF NOT EXISTS department_code TEXT,
ADD COLUMN IF NOT EXISTS department_head_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_departments_head ON public.departments(department_head_id);
CREATE INDEX IF NOT EXISTS idx_profiles_department ON public.profiles(department_id);