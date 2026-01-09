-- Group Managing Partner Dashboard Views
-- This migration creates analytics views for the GMP executive dashboard

-- View 1: Partner Performance Summary
-- Aggregates key metrics for all partners in the firm
CREATE OR REPLACE VIEW partner_performance_summary AS
SELECT 
  p.id as partner_id,
  p.first_name,
  p.last_name,
  p."departmentId" as department_id,
  d.name as department_name,
  p.position,
  COUNT(DISTINCT j.id) as active_jobs,
  COALESCE(SUM(j.amount_collected), 0) as portfolio_revenue,
  COALESCE(SUM(j.fees), 0) as portfolio_fees,
  COUNT(DISTINCT sub.id) as direct_reports,
  COUNT(DISTINCT c.id) as client_count,
  AVG(CASE WHEN eval.overall_rating IS NOT NULL 
      THEN eval.overall_rating ELSE NULL END) as avg_team_score
FROM profiles p
LEFT JOIN departments d ON p."departmentId" = d.id
LEFT JOIN jobs j ON j.partner_id = p.id OR j.manager_id = p.id
LEFT JOIN profiles sub ON sub.manager_id = p.id
LEFT JOIN employee_evaluations eval ON eval.employee_id = sub.id
LEFT JOIN clients c ON c.id = j.client_id
WHERE p.position IN ('partner', 'Partner', 'group_managing_partner', 'Group Managing Partner')
   OR p.is_partner = true
GROUP BY p.id, p.first_name, p.last_name, p."departmentId", d.name, p.position;

-- View 2: Manager Performance Summary  
-- Aggregates team performance and utilization for all managers
CREATE OR REPLACE VIEW manager_performance_summary AS
SELECT 
  p.id as manager_id,
  p.first_name,
  p.last_name,
  p."departmentId" as department_id,
  d.name as department_name,
  p.position,
  p.manager_id as reports_to,
  partner.first_name as partner_first_name,
  partner.last_name as partner_last_name,
  COUNT(DISTINCT sub.id) as team_size,
  COALESCE(SUM(wl.hours_worked), 0) as team_total_hours,
  COUNT(DISTINCT eval.id) as evaluation_count,
  AVG(eval.overall_rating) as avg_performance,
  COUNT(DISTINCT j.id) as jobs_managed
FROM profiles p
LEFT JOIN departments d ON p."departmentId" = d.id
LEFT JOIN profiles sub ON sub.manager_id = p.id
LEFT JOIN work_logs wl ON wl.employee_id = sub.id
LEFT JOIN employee_evaluations eval ON eval.employee_id = sub.id
LEFT JOIN jobs j ON j.manager_id = p.id
LEFT JOIN profiles partner ON partner.id = p.manager_id
WHERE p.position IN ('manager', 'Manager') 
   OR p.position LIKE '%manager%' 
   OR p.position LIKE '%Manager%'
GROUP BY p.id, p.first_name, p.last_name, p."departmentId", d.name, p.position, p.manager_id, partner.first_name, partner.last_name;

-- View 3: Firm-wide Executive Metrics
-- High-level KPIs for the executive summary
CREATE OR REPLACE VIEW firm_wide_metrics AS
SELECT 
  (SELECT COUNT(*) FROM profiles WHERE status = 'active') as total_employees,
  (SELECT COUNT(*) FROM profiles WHERE (position IN ('partner', 'Partner') OR is_partner = true) AND status = 'active') as total_partners,
  (SELECT COUNT(*) FROM profiles WHERE position IN ('manager', 'Manager') AND status = 'active') as total_managers,
  (SELECT COALESCE(SUM(amount_collected), 0) FROM jobs WHERE status = 'active') as total_revenue,
  (SELECT COALESCE(SUM(fees), 0) FROM jobs WHERE status = 'active') as total_fees,
  (SELECT COUNT(*) FROM jobs WHERE status = 'active') as active_jobs,
  (SELECT COUNT(*) FROM clients WHERE status = 'active') as active_clients,
  (SELECT COUNT(*) FROM departments WHERE id > 0) as total_departments,
  (SELECT COUNT(*) FROM employee_evaluations WHERE "createdAt" >= date_trunc('month', CURRENT_DATE)) as evaluations_this_month;

-- View 4: Department Performance Overview
-- Breakdown of performance and financials by department  
CREATE OR REPLACE VIEW department_performance_summary AS
SELECT 
  d.id as department_id,
  d.name as department_name,
  d.department_code,
  COUNT(DISTINCT p.id) as employee_count,
  COUNT(DISTINCT CASE WHEN p.position IN ('partner', 'Partner') OR p.is_partner = true THEN p.id END) as partner_count,
  COUNT(DISTINCT CASE WHEN p.position IN ('manager', 'Manager') THEN p.id END) as manager_count,
  COALESCE(SUM(j.amount_collected), 0) as department_revenue,
  COALESCE(SUM(j.fees), 0) as department_fees,
  COUNT(DISTINCT j.id) as jobs_count,
  AVG(eval.overall_rating) as avg_department_performance
FROM departments d
LEFT JOIN profiles p ON p."departmentId" = d.id AND p.status = 'active'
LEFT JOIN jobs j ON j.partner_id = p.id OR j.manager_id = p.id
LEFT JOIN employee_evaluations eval ON eval.employee_id = p.id
GROUP BY d.id, d.name, d.department_code;

-- Function: Get GMP Dashboard Analytics
-- Consolidated function for dashboard data retrieval
CREATE OR REPLACE FUNCTION get_gmp_dashboard_analytics(gmp_user_id INTEGER)
RETURNS TABLE(
  metric_type TEXT,
  metric_value JSONB
) AS $$
BEGIN
  -- Firm metrics
  RETURN QUERY
  SELECT 
    'firm_metrics'::TEXT,
    jsonb_build_object(
      'total_employees', (SELECT total_employees FROM firm_wide_metrics),
      'total_partners', (SELECT total_partners FROM firm_wide_metrics),
      'total_managers', (SELECT total_managers FROM firm_wide_metrics),
      'total_revenue', (SELECT total_revenue FROM firm_wide_metrics),
      'total_fees', (SELECT total_fees FROM firm_wide_metrics),
      'active_jobs', (SELECT active_jobs FROM firm_wide_metrics),
      'active_clients', (SELECT active_clients FROM firm_wide_metrics),
      'total_departments', (SELECT total_departments FROM firm_wide_metrics),
      'evaluations_this_month', (SELECT evaluations_this_month FROM firm_wide_metrics)
    );

  -- Partner rankings
  RETURN QUERY
  SELECT 
    'partner_rankings'::TEXT,
    jsonb_agg(
      jsonb_build_object(
        'partner_id', partner_id,
        'name', first_name || ' ' || last_name,
        'department', department_name,
        'position', position,
        'portfolio_revenue', portfolio_revenue,
        'portfolio_fees', portfolio_fees,
        'active_jobs', active_jobs,
        'direct_reports', direct_reports,
        'client_count', client_count,
        'avg_team_score', avg_team_score
      )
      ORDER BY portfolio_revenue DESC
    )
  FROM partner_performance_summary;

  -- Manager rankings  
  RETURN QUERY
  SELECT 
    'manager_rankings'::TEXT,
    jsonb_agg(
      jsonb_build_object(
        'manager_id', manager_id,
        'name', first_name || ' ' || last_name,
        'department', department_name,
        'position', position,
        'reports_to', partner_first_name || ' ' || partner_last_name,
        'team_size', team_size,
        'team_total_hours', team_total_hours,
        'evaluation_count', evaluation_count,
        'avg_performance', avg_performance,
        'jobs_managed', jobs_managed
      )
      ORDER BY team_total_hours DESC
    )
  FROM manager_performance_summary;

  -- Department breakdown
  RETURN QUERY
  SELECT 
    'department_breakdown'::TEXT,
    jsonb_agg(
      jsonb_build_object(
        'department_id', department_id,
        'department_name', department_name,
        'department_code', department_code,
        'employee_count', employee_count,
        'partner_count', partner_count,
        'manager_count', manager_count,
        'department_revenue', department_revenue,
        'department_fees', department_fees,
        'jobs_count', jobs_count,
        'avg_department_performance', avg_department_performance
      )
      ORDER BY department_revenue DESC
    )
  FROM department_performance_summary;

END;
$$ LANGUAGE plpgsql;

-- Grant appropriate permissions
GRANT SELECT ON partner_performance_summary TO PUBLIC;
GRANT SELECT ON manager_performance_summary TO PUBLIC;
GRANT SELECT ON firm_wide_metrics TO PUBLIC;
GRANT SELECT ON department_performance_summary TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_gmp_dashboard_analytics(INTEGER) TO PUBLIC;