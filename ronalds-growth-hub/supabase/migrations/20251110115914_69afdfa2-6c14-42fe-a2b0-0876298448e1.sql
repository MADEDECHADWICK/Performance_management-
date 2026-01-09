-- Phase 1: Enhance jobs table with financial tracking fields
ALTER TABLE public.jobs
ADD COLUMN IF NOT EXISTS job_number TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS completion_percentage NUMERIC DEFAULT 0 CHECK (completion_percentage >= 0 AND completion_percentage <= 100),
ADD COLUMN IF NOT EXISTS amount_collected NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS collection_period TEXT;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_jobs_job_number ON public.jobs(job_number);
CREATE INDEX IF NOT EXISTS idx_jobs_completion ON public.jobs(completion_percentage);
CREATE INDEX IF NOT EXISTS idx_jobs_status_date ON public.jobs(status, start_date);

-- Phase 2: Link work_logs to jobs
ALTER TABLE public.work_logs
ADD COLUMN IF NOT EXISTS job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_work_logs_job_id ON public.work_logs(job_id);

-- Phase 3: Create view for job actual hours from work_logs
CREATE OR REPLACE VIEW public.job_actual_hours AS
SELECT 
  job_id,
  SUM(hours_worked) as total_actual_hours,
  SUM(CASE WHEN billable = true THEN hours_worked ELSE 0 END) as billable_actual_hours,
  COUNT(DISTINCT employee_id) as employee_count
FROM public.work_logs
WHERE job_id IS NOT NULL
GROUP BY job_id;

-- Phase 4: Create view for employee job contribution
CREATE OR REPLACE VIEW public.employee_job_contribution AS
SELECT 
  wl.employee_id,
  wl.job_id,
  j.title as job_title,
  j.client_id,
  j.department_id,
  SUM(wl.hours_worked) as hours_contributed,
  SUM(CASE WHEN wl.billable = true THEN wl.hours_worked ELSE 0 END) as billable_hours_contributed,
  (SUM(wl.hours_worked) / NULLIF(jah.total_actual_hours, 0)) * 100 as contribution_percentage,
  j.amount_collected,
  (j.amount_collected * (SUM(wl.hours_worked) / NULLIF(jah.total_actual_hours, 0))) as revenue_contribution
FROM public.work_logs wl
JOIN public.jobs j ON wl.job_id = j.id
LEFT JOIN public.job_actual_hours jah ON j.id = jah.job_id
WHERE wl.job_id IS NOT NULL
GROUP BY wl.employee_id, wl.job_id, j.title, j.client_id, j.department_id, j.amount_collected, jah.total_actual_hours;

-- Phase 5: Create view for job profitability metrics
CREATE OR REPLACE VIEW public.job_profitability AS
SELECT 
  j.id as job_id,
  j.job_number,
  j.title,
  j.client_id,
  j.department_id,
  j.status,
  j.billable_hours as estimated_hours,
  jah.total_actual_hours,
  jah.billable_actual_hours,
  j.hourly_rate,
  j.fees,
  j.amount_collected,
  j.completion_percentage,
  (j.billable_hours * j.hourly_rate) as estimated_revenue,
  (jah.billable_actual_hours * j.hourly_rate) as actual_billable_revenue,
  (j.amount_collected - j.fees) as net_revenue,
  CASE 
    WHEN j.billable_hours > 0 THEN (jah.billable_actual_hours / j.billable_hours) * 100
    ELSE 0
  END as efficiency_ratio,
  CASE 
    WHEN (j.billable_hours * j.hourly_rate) > 0 THEN (j.amount_collected / (j.billable_hours * j.hourly_rate)) * 100
    ELSE 0
  END as collection_rate
FROM public.jobs j
LEFT JOIN public.job_actual_hours jah ON j.id = jah.job_id;

-- Phase 6: Create function to calculate job financials
CREATE OR REPLACE FUNCTION public.calculate_job_financials(p_job_id UUID)
RETURNS TABLE(
  total_hours NUMERIC,
  billable_hours NUMERIC,
  estimated_revenue NUMERIC,
  actual_revenue NUMERIC,
  efficiency_ratio NUMERIC,
  profitability NUMERIC
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job RECORD;
  v_actual_hours RECORD;
BEGIN
  -- Get job details
  SELECT * INTO v_job FROM jobs WHERE id = p_job_id;
  
  -- Get actual hours from work logs
  SELECT * INTO v_actual_hours FROM job_actual_hours WHERE job_id = p_job_id;
  
  RETURN QUERY
  SELECT 
    COALESCE(v_actual_hours.total_actual_hours, 0) as total_hours,
    COALESCE(v_actual_hours.billable_actual_hours, 0) as billable_hours,
    (v_job.billable_hours * v_job.hourly_rate) as estimated_revenue,
    v_job.amount_collected as actual_revenue,
    CASE 
      WHEN v_job.billable_hours > 0 THEN (COALESCE(v_actual_hours.billable_actual_hours, 0) / v_job.billable_hours) * 100
      ELSE 0
    END as efficiency_ratio,
    (v_job.amount_collected - v_job.fees) as profitability;
END;
$$;

-- Phase 7: Update calculate_employee_financial_score to use jobs data
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
  total_revenue_contribution NUMERIC := 0;
  avg_efficiency NUMERIC := 0;
  total_jobs_completed INTEGER := 0;
  financial_score NUMERIC := 0;
BEGIN
  -- Calculate total revenue contribution from completed jobs
  SELECT 
    COALESCE(SUM(revenue_contribution), 0),
    COALESCE(AVG(CASE 
      WHEN hours_contributed > 0 THEN (billable_hours_contributed / hours_contributed) * 100
      ELSE 0
    END), 0),
    COUNT(DISTINCT job_id)
  INTO total_revenue_contribution, avg_efficiency, total_jobs_completed
  FROM employee_job_contribution ejc
  JOIN jobs j ON ejc.job_id = j.id
  WHERE ejc.employee_id = _employee_id
  AND j.status = 'completed'
  AND j.completed_at BETWEEN _period_start AND _period_end;
  
  -- Calculate financial score (0-100 scale)
  -- 60% based on revenue contribution (normalized)
  -- 40% based on efficiency ratio
  IF total_revenue_contribution > 0 OR total_jobs_completed > 0 THEN
    financial_score := 
      (LEAST(100, (total_revenue_contribution / 100000.0) * 100) * 0.6) +
      (LEAST(100, avg_efficiency) * 0.4);
  END IF;
  
  RETURN ROUND(financial_score, 2);
END;
$$;

-- Phase 8: Create trigger to update employee financial scores when job is completed
CREATE OR REPLACE FUNCTION public.update_employee_financial_scores_on_job_complete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee_id UUID;
  v_cycle_id UUID;
  v_financial_score NUMERIC;
BEGIN
  -- Only process if status changed to 'completed' or collections updated
  IF (NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed'))
     OR (NEW.amount_collected != OLD.amount_collected AND NEW.status = 'completed') THEN
    
    -- Get current active evaluation cycle
    SELECT id INTO v_cycle_id
    FROM evaluation_cycles
    WHERE status = 'active'
    AND CURRENT_DATE BETWEEN start_date AND end_date
    LIMIT 1;
    
    -- Update financial scores for all employees who worked on this job
    FOR v_employee_id IN 
      SELECT DISTINCT employee_id 
      FROM work_logs 
      WHERE job_id = NEW.id
    LOOP
      IF v_cycle_id IS NOT NULL THEN
        -- Calculate new financial score
        v_financial_score := calculate_employee_financial_score(
          v_employee_id,
          (SELECT start_date FROM evaluation_cycles WHERE id = v_cycle_id),
          (SELECT end_date FROM evaluation_cycles WHERE id = v_cycle_id)
        );
        
        -- Update or insert into employee_evaluations
        INSERT INTO employee_evaluations (
          cycle_id,
          employee_id,
          bsc_internal_processes_score
        )
        VALUES (
          v_cycle_id,
          v_employee_id,
          v_financial_score
        )
        ON CONFLICT (cycle_id, employee_id)
        DO UPDATE SET
          bsc_internal_processes_score = v_financial_score,
          updated_at = NOW();
      END IF;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on jobs table
DROP TRIGGER IF EXISTS trigger_update_financial_scores ON public.jobs;
CREATE TRIGGER trigger_update_financial_scores
AFTER UPDATE ON public.jobs
FOR EACH ROW
EXECUTE FUNCTION update_employee_financial_scores_on_job_complete();

-- Grant necessary permissions
GRANT SELECT ON public.job_actual_hours TO authenticated;
GRANT SELECT ON public.employee_job_contribution TO authenticated;
GRANT SELECT ON public.job_profitability TO authenticated;