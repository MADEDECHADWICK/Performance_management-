-- Create job_staff_assignments junction table for multi-staff assignment
CREATE TABLE public.job_staff_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  CONSTRAINT unique_job_employee UNIQUE (job_id, employee_id)
);

-- Create index for better query performance
CREATE INDEX idx_job_staff_assignments_job_id ON public.job_staff_assignments(job_id);
CREATE INDEX idx_job_staff_assignments_employee_id ON public.job_staff_assignments(employee_id);

-- Enable RLS
ALTER TABLE public.job_staff_assignments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for job_staff_assignments
CREATE POLICY "HR and admins can manage staff assignments"
  ON public.job_staff_assignments
  FOR ALL
  USING (has_role(auth.uid(), 'hr_manager'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Employees can view their job assignments"
  ON public.job_staff_assignments
  FOR SELECT
  USING (auth.uid() = employee_id);

CREATE POLICY "Managers can view team job assignments"
  ON public.job_staff_assignments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = job_staff_assignments.employee_id
      AND profiles.manager_id = auth.uid()
    )
  );

-- Create function to create todos for all assigned staff
CREATE OR REPLACE FUNCTION public.create_todos_for_assigned_staff()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Create todo for the newly assigned staff member
  INSERT INTO public.todos (job_id, employee_id, status)
  VALUES (NEW.job_id, NEW.employee_id, 'pending')
  ON CONFLICT DO NOTHING;
  
  RETURN NEW;
END;
$$;

-- Create trigger to auto-create todos when staff is assigned
CREATE TRIGGER trigger_create_todo_for_staff
  AFTER INSERT ON public.job_staff_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.create_todos_for_assigned_staff();