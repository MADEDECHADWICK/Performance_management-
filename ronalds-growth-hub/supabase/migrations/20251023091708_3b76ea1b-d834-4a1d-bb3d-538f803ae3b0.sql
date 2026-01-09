-- Create jobs table for tracking assigned work
CREATE TABLE public.jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  department_id UUID REFERENCES public.departments(id),
  client_id UUID REFERENCES public.clients(id),
  assigned_by UUID REFERENCES public.profiles(id),
  assigned_to UUID NOT NULL REFERENCES public.profiles(id),
  start_date DATE NOT NULL,
  due_date DATE,
  billable_hours NUMERIC,
  hourly_rate NUMERIC,
  financial_weight NUMERIC DEFAULT 0,
  fees NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'approved')),
  completed_at TIMESTAMP WITH TIME ZONE,
  approved_by UUID REFERENCES public.profiles(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create todos table (one-to-one with jobs per employee)
CREATE TABLE public.todos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.profiles(id),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  notes TEXT,
  progress_percentage NUMERIC DEFAULT 0 CHECK (progress_percentage >= 0 AND progress_percentage <= 100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(job_id, employee_id)
);

-- Create financial_records table to track completed job contributions
CREATE TABLE public.financial_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.profiles(id),
  job_id UUID REFERENCES public.jobs(id),
  amount NUMERIC NOT NULL,
  record_type TEXT NOT NULL CHECK (record_type IN ('billable', 'fees', 'surplus', 'deficit')),
  date_completed DATE NOT NULL,
  cycle_id UUID REFERENCES public.evaluation_cycles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  notes TEXT
);

-- Add indexes for performance
CREATE INDEX idx_jobs_assigned_to ON public.jobs(assigned_to);
CREATE INDEX idx_jobs_status ON public.jobs(status);
CREATE INDEX idx_jobs_due_date ON public.jobs(due_date);
CREATE INDEX idx_todos_employee_id ON public.todos(employee_id);
CREATE INDEX idx_todos_status ON public.todos(status);
CREATE INDEX idx_financial_records_employee_id ON public.financial_records(employee_id);

-- Add triggers for updated_at
CREATE TRIGGER update_jobs_updated_at
  BEFORE UPDATE ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_todos_updated_at
  BEFORE UPDATE ON public.todos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.todos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_records ENABLE ROW LEVEL SECURITY;

-- RLS Policies for jobs
CREATE POLICY "Employees can view their assigned jobs"
  ON public.jobs FOR SELECT
  USING (auth.uid() = assigned_to);

CREATE POLICY "HR and admins can manage all jobs"
  ON public.jobs FOR ALL
  USING (has_role(auth.uid(), 'hr_manager') OR has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Managers can view team jobs"
  ON public.jobs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = jobs.assigned_to
      AND profiles.manager_id = auth.uid()
    )
  );

CREATE POLICY "Managers can create jobs for their team"
  ON public.jobs FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), 'manager') OR 
    has_role(auth.uid(), 'hr_manager') OR 
    has_role(auth.uid(), 'super_admin')
  );

-- RLS Policies for todos
CREATE POLICY "Employees can view their own todos"
  ON public.todos FOR SELECT
  USING (auth.uid() = employee_id);

CREATE POLICY "Employees can update their own todos"
  ON public.todos FOR UPDATE
  USING (auth.uid() = employee_id);

CREATE POLICY "HR and admins can manage all todos"
  ON public.todos FOR ALL
  USING (has_role(auth.uid(), 'hr_manager') OR has_role(auth.uid(), 'super_admin'));

CREATE POLICY "System can create todos"
  ON public.todos FOR INSERT
  WITH CHECK (true);

-- RLS Policies for financial_records
CREATE POLICY "Employees can view their own financial records"
  ON public.financial_records FOR SELECT
  USING (auth.uid() = employee_id);

CREATE POLICY "HR and admins can manage financial records"
  ON public.financial_records FOR ALL
  USING (has_role(auth.uid(), 'hr_manager') OR has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Managers can view team financial records"
  ON public.financial_records FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = financial_records.employee_id
      AND profiles.manager_id = auth.uid()
    )
  );

-- Function to automatically create todo when job is assigned
CREATE OR REPLACE FUNCTION public.create_todo_for_job()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.todos (job_id, employee_id, status)
  VALUES (NEW.id, NEW.assigned_to, 'pending');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_create_todo_for_job
  AFTER INSERT ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.create_todo_for_job();

-- Function to update financial records when job is completed
CREATE OR REPLACE FUNCTION public.update_financial_on_job_complete()
RETURNS TRIGGER AS $$
DECLARE
  calculated_amount NUMERIC;
BEGIN
  -- Only process if status changed to 'completed'
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    -- Calculate billable amount
    IF NEW.billable_hours IS NOT NULL AND NEW.hourly_rate IS NOT NULL THEN
      calculated_amount := NEW.billable_hours * NEW.hourly_rate;
      
      INSERT INTO public.financial_records (
        employee_id, 
        job_id, 
        amount, 
        record_type, 
        date_completed
      )
      VALUES (
        NEW.assigned_to,
        NEW.id,
        calculated_amount,
        'billable',
        CURRENT_DATE
      );
    END IF;
    
    -- Add fees if specified
    IF NEW.fees IS NOT NULL AND NEW.fees > 0 THEN
      INSERT INTO public.financial_records (
        employee_id, 
        job_id, 
        amount, 
        record_type, 
        date_completed
      )
      VALUES (
        NEW.assigned_to,
        NEW.id,
        NEW.fees,
        'fees',
        CURRENT_DATE
      );
    END IF;
    
    -- Update completed timestamp
    NEW.completed_at := now();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_update_financial_on_job_complete
  BEFORE UPDATE ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_financial_on_job_complete();