-- Manager Dashboard SQL Functions and Views
-- This migration adds database support for the Manager Dashboard feature

-- Function to get all subordinates for a manager
CREATE OR REPLACE FUNCTION get_manager_team(manager_user_id INTEGER)
RETURNS TABLE (
  employee_id INTEGER,
  first_name TEXT,
  last_name TEXT,
  job_position TEXT,
  department_id INTEGER,
  department_name TEXT,
  status TEXT,
  role_name TEXT,
  hire_date DATE
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT 
    p.id::INTEGER,
    p.first_name,
    p.last_name,
    p."position",
    p."departmentId"::INTEGER,
    d.name,
    p.status,
    r.name,
    p.hire_date::DATE
  FROM profiles p
  LEFT JOIN departments d ON p."departmentId" = d.id
  LEFT JOIN roles r ON p.role_id = r.id
  WHERE p.manager_id = manager_user_id
    AND p.status = 'active';
$$;

-- View for manager team financials aggregation
CREATE OR REPLACE VIEW manager_team_financials AS
SELECT 
  p.manager_id,
  COUNT(DISTINCT te.employee_id) AS active_team_members,
  COALESCE(SUM(te.hours), 0) AS total_team_hours,
  COALESCE(SUM(CASE WHEN te.billable THEN te.hours ELSE 0 END), 0) AS billable_hours,
  COALESCE(SUM(te.billable_amount), 0) AS total_revenue,
  COALESCE(SUM(te.cost), 0) AS total_cost
FROM time_entries te
JOIN profiles p ON te.employee_id = p.id
WHERE p.manager_id IS NOT NULL
  AND te.status = 'approved'
  AND te.date_worked >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY p.manager_id;

-- View for manager job portfolio
CREATE OR REPLACE VIEW manager_job_portfolio AS
SELECT 
  j.manager_id,
  j.id AS job_id,
  j.job_name AS title,
  j.job_code AS job_number,
  j.status,
  j.billing_type,
  j.budgeted_hours AS budget_hours,
  j.fixed_fee_amount,
  c.client_name,
  d.name AS department_name,
  COALESCE(SUM(te.hours), 0) AS actual_hours,
  COALESCE(SUM(te.billable_amount), 0) AS revenue,
  COALESCE(SUM(te.cost), 0) AS cost,
  CASE WHEN j.budgeted_hours IS NOT NULL AND j.budgeted_hours > 0 
    THEN ROUND((COALESCE(SUM(te.hours), 0) / j.budgeted_hours) * 100, 1)
    ELSE 0 
  END AS budget_utilization,
  j.start_date,
  j.due_date,
  j.completion_percentage
FROM jobs j
LEFT JOIN time_entries te ON j.id = te.job_id AND te.status = 'approved'
LEFT JOIN clients c ON j.client_id = c.id
LEFT JOIN departments d ON j.department_id = d.id
WHERE j.manager_id IS NOT NULL
GROUP BY 
  j.id, j.manager_id, j.job_name, j.job_code, j.status, j.billing_type, 
  j.budgeted_hours, j.fixed_fee_amount, c.client_name, d.name,
  j.start_date, j.due_date, j.completion_percentage;

-- Function to get manager team jobs for a manager
CREATE OR REPLACE FUNCTION get_manager_team_jobs(manager_user_id INTEGER)
RETURNS TABLE (
  job_id INTEGER,
  job_name TEXT,
  job_code TEXT,
  client_name TEXT,
  employee_id INTEGER,
  employee_name TEXT,
  assigned_role TEXT,
  hourly_rate DECIMAL,
  hours_this_month DECIMAL
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT 
    j.id::INTEGER,
    j.job_name,
    j.job_code,
    c.client_name,
    p.id::INTEGER,
    (p.first_name || ' ' || p.last_name),
    r.name,
    jsa.assigned_hourly_rate,
    COALESCE(SUM(
      CASE 
        WHEN te.date_worked >= date_trunc('month', CURRENT_DATE) 
        THEN te.hours 
        ELSE 0 
      END
    ), 0)
  FROM job_staff_assignments jsa
  JOIN jobs j ON jsa.job_id = j.id
  JOIN profiles p ON jsa.employee_id = p.id
  JOIN roles r ON jsa.assigned_role_id = r.id
  LEFT JOIN clients c ON j.client_id = c.id
  LEFT JOIN time_entries te ON j.id = te.job_id AND p.id = te.employee_id AND te.status = 'approved'
  WHERE p.manager_id = manager_user_id
  GROUP BY 
    j.id, j.job_name, j.job_code, c.client_name, p.id, 
    p.first_name, p.last_name, r.name, jsa.assigned_hourly_rate
  ORDER BY j.job_name, p.last_name;
$$;

-- Function to get team performance metrics
CREATE OR REPLACE FUNCTION get_team_performance_summary(manager_user_id INTEGER)
RETURNS TABLE (
  employee_id INTEGER,
  employee_name TEXT,
  job_position TEXT,
  avg_financial_score DECIMAL,
  avg_non_financial_score DECIMAL,
  avg_overall_rating DECIMAL,
  total_hours_this_month DECIMAL,
  billable_hours_this_month DECIMAL,
  utilization_rate DECIMAL,
  last_review_date DATE
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT 
    p.id::INTEGER,
    (p.first_name || ' ' || p.last_name),
    p."position",
    COALESCE(AVG(pr.financial_score), 0),
    COALESCE(AVG(pr.non_financial_score), 0),
    COALESCE(AVG(pr.overall_rating), 0),
    COALESCE(SUM(
      CASE 
        WHEN te.date_worked >= date_trunc('month', CURRENT_DATE) 
        THEN te.hours 
        ELSE 0 
      END
    ), 0),
    COALESCE(SUM(
      CASE 
        WHEN te.date_worked >= date_trunc('month', CURRENT_DATE) AND te.billable 
        THEN te.hours 
        ELSE 0 
      END
    ), 0),
    CASE 
      WHEN COALESCE(SUM(
        CASE 
          WHEN te.date_worked >= date_trunc('month', CURRENT_DATE) 
          THEN te.hours 
          ELSE 0 
        END
      ), 0) > 0 
      THEN ROUND(
        (COALESCE(SUM(
          CASE 
            WHEN te.date_worked >= date_trunc('month', CURRENT_DATE) AND te.billable 
            THEN te.hours 
            ELSE 0 
          END
        ), 0) / COALESCE(SUM(
          CASE 
            WHEN te.date_worked >= date_trunc('month', CURRENT_DATE) 
            THEN te.hours 
            ELSE 0 
          END
        ), 1)) * 100, 1
      )
      ELSE 0 
    END,
    MAX(pr.review_period_end)::DATE
  FROM profiles p
  LEFT JOIN performance_reviews pr ON p.id = pr.employee_id
  LEFT JOIN time_entries te ON p.id = te.employee_id AND te.status = 'approved'
  WHERE p.manager_id = manager_user_id
    AND p.status = 'active'
  GROUP BY p.id, p.first_name, p.last_name, p."position"
  ORDER BY p.last_name;
$$;

-- Grant appropriate permissions (removed for regular PostgreSQL)