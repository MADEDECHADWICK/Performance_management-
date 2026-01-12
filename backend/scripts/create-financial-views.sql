-- Financial Calculation Views for Comprehensive Job Tracking
-- These views provide position-based costing and role-based financial visibility

-- 1. Work Log Costing View
-- Calculates billable amount and cost for each time entry based on employee's position
CREATE OR REPLACE VIEW work_log_costing AS
SELECT 
  te.id,
  te.job_id,
  te.employee_id,
  te.hours,
  te.billable,
  te.date_worked,
  te.description,
  p.position_level,
  p.first_name || ' ' || p.last_name AS employee_name,
  pr.billing_rate,
  pr.cost_rate,
  -- Calculate amounts based on position rates
  CASE 
    WHEN te.billable THEN te.hours * COALESCE(pr.billing_rate, 0) 
    ELSE 0 
  END AS billable_amount,
  te.hours * COALESCE(pr.cost_rate, 0) AS cost_amount,
  te.status,
  te."createdAt"
FROM time_entries te
JOIN profiles p ON te.employee_id = p.id
LEFT JOIN position_rates pr ON p.position_level = pr.position_level AND pr.is_active = true;

-- 2. Job Profitability View (Enhanced)
-- Comprehensive view showing job financials derived from position-based costing
CREATE OR REPLACE VIEW job_profitability_v2 AS
SELECT 
  j.id AS job_id,
  j.job_name,
  j.job_code,
  j.status,
  j.billing_type,
  j.budget_hours,
  j.fixed_fee_amount,
  j.priority,
  j.start_date,
  j.due_date,
  j.partner_id AS job_owner_id,
  j.manager_id,
  j.department_id,
  j.client_id,
  c.client_name,
  d.name AS department_name,
  
  -- Partner info (job owner)
  owner.first_name || ' ' || owner.last_name AS partner_name,
  
  -- Manager info
  mgr.first_name || ' ' || mgr.last_name AS manager_name,
  
  -- Time metrics
  COALESCE(SUM(wlc.hours), 0) AS total_hours,
  COALESCE(SUM(CASE WHEN wlc.billable THEN wlc.hours ELSE 0 END), 0) AS billable_hours,
  
  -- Staff count
  (SELECT COUNT(DISTINCT employee_id) FROM job_staff_assignments WHERE job_id = j.id) AS staff_count,
  
  -- Revenue calculation (based on billing type)
  CASE 
    WHEN j.billing_type = 'fixed_fee' THEN j.fixed_fee_amount
    ELSE COALESCE(SUM(wlc.billable_amount), 0)
  END AS revenue,
  
  -- Cost (always position-based)
  COALESCE(SUM(wlc.cost_amount), 0) AS total_cost,
  
  -- Profit
  CASE 
    WHEN j.billing_type = 'fixed_fee' THEN j.fixed_fee_amount - COALESCE(SUM(wlc.cost_amount), 0)
    ELSE COALESCE(SUM(wlc.billable_amount), 0) - COALESCE(SUM(wlc.cost_amount), 0)
  END AS profit,
  
  -- Profit margin
  CASE 
    WHEN j.billing_type = 'fixed_fee' AND j.fixed_fee_amount > 0 
      THEN ((j.fixed_fee_amount - COALESCE(SUM(wlc.cost_amount), 0)) / j.fixed_fee_amount) * 100
    WHEN COALESCE(SUM(wlc.billable_amount), 0) > 0 
      THEN ((COALESCE(SUM(wlc.billable_amount), 0) - COALESCE(SUM(wlc.cost_amount), 0)) / COALESCE(SUM(wlc.billable_amount), 0)) * 100
    ELSE 0
  END AS profit_margin,
  
  -- Budget utilization
  CASE WHEN j.budget_hours > 0 
    THEN (COALESCE(SUM(wlc.hours), 0) / j.budget_hours) * 100 
    ELSE NULL 
  END AS budget_utilization,
  
  -- Collection info
  j.amount_collected,
  CASE 
    WHEN j.billing_type = 'fixed_fee' AND j.fixed_fee_amount > 0 
      THEN (j.amount_collected / j.fixed_fee_amount) * 100
    WHEN COALESCE(SUM(wlc.billable_amount), 0) > 0 
      THEN (j.amount_collected / COALESCE(SUM(wlc.billable_amount), 0)) * 100
    ELSE 0
  END AS collection_rate,
  
  j."createdAt",
  j."updatedAt"

FROM jobs j
LEFT JOIN work_log_costing wlc ON j.id = wlc.job_id
LEFT JOIN clients c ON j.client_id = c.id
LEFT JOIN departments d ON j.department_id = d.id
LEFT JOIN profiles owner ON j.partner_id = owner.id
LEFT JOIN profiles mgr ON j.manager_id = mgr.id
GROUP BY j.id, c.client_name, d.name, owner.first_name, owner.last_name, mgr.first_name, mgr.last_name;

-- 3. Employee Revenue Contribution View
-- For employees (senior, semi-senior, associate, intern) - their revenue is the total from jobs they've worked on
CREATE OR REPLACE VIEW employee_financial_contribution AS
SELECT 
  p.id AS employee_id,
  p.first_name,
  p.last_name,
  p.position_level,
  p."departmentId" AS department_id,
  p.manager_id,
  pr.billing_rate,
  pr.cost_rate,
  COALESCE(SUM(wlc.hours), 0) AS total_hours,
  COALESCE(SUM(CASE WHEN wlc.billable THEN wlc.hours ELSE 0 END), 0) AS billable_hours,
  COALESCE(SUM(wlc.billable_amount), 0) AS total_revenue_generated,
  COALESCE(SUM(wlc.cost_amount), 0) AS total_cost,
  COUNT(DISTINCT wlc.job_id) AS jobs_worked_on,
  -- Calculate utilization rate
  CASE 
    WHEN COALESCE(SUM(wlc.hours), 0) > 0 
    THEN (COALESCE(SUM(CASE WHEN wlc.billable THEN wlc.hours ELSE 0 END), 0) / COALESCE(SUM(wlc.hours), 0)) * 100
    ELSE 0
  END AS utilization_rate
FROM profiles p
LEFT JOIN position_rates pr ON p.position_level = pr.position_level AND pr.is_active = true
LEFT JOIN work_log_costing wlc ON p.id = wlc.employee_id
WHERE p.position_level IN ('senior', 'semi_senior', 'associate', 'intern')
GROUP BY p.id, p.first_name, p.last_name, p.position_level, p."departmentId", p.manager_id, pr.billing_rate, pr.cost_rate;

-- 4. Manager Department Financial View
-- For managers - their financial contribution is the total from their department
CREATE OR REPLACE VIEW manager_financial_contribution AS
SELECT 
  p.id AS manager_id,
  p.first_name || ' ' || p.last_name AS manager_name,
  p."departmentId" AS department_id,
  d.name AS department_name,
  COUNT(DISTINCT sub.id) AS team_size,
  COALESCE(SUM(efc.total_hours), 0) AS department_total_hours,
  COALESCE(SUM(efc.billable_hours), 0) AS department_billable_hours,
  COALESCE(SUM(efc.total_revenue_generated), 0) AS department_revenue,
  COALESCE(SUM(efc.total_cost), 0) AS department_cost,
  COALESCE(SUM(efc.jobs_worked_on), 0) AS department_jobs,
  -- Department utilization rate
  CASE 
    WHEN COALESCE(SUM(efc.total_hours), 0) > 0 
    THEN (COALESCE(SUM(efc.billable_hours), 0) / COALESCE(SUM(efc.total_hours), 0)) * 100
    ELSE 0
  END AS department_utilization_rate
FROM profiles p
JOIN departments d ON p."departmentId" = d.id
LEFT JOIN profiles sub ON sub."departmentId" = p."departmentId" AND sub.id != p.id
LEFT JOIN employee_financial_contribution efc ON efc.employee_id = sub.id
WHERE p.position_level = 'manager'
GROUP BY p.id, p.first_name, p.last_name, p."departmentId", d.name;

-- 5. Partner Revenue Contribution View
-- For partners - their revenue is based on jobs they own (acquired for the firm)
CREATE OR REPLACE VIEW partner_financial_contribution AS
SELECT 
  p.id AS partner_id,
  p.first_name || ' ' || p.last_name AS partner_name,
  p.position_level,
  COUNT(DISTINCT j.id) AS jobs_acquired,
  COALESCE(SUM(jp.revenue), 0) AS total_portfolio_revenue,
  COALESCE(SUM(jp.total_cost), 0) AS total_portfolio_cost,
  COALESCE(SUM(jp.profit), 0) AS total_portfolio_profit,
  CASE 
    WHEN COUNT(DISTINCT j.id) > 0 
    THEN AVG(jp.profit_margin) 
    ELSE 0 
  END AS avg_profit_margin,
  COALESCE(SUM(j.amount_collected), 0) AS total_collected,
  -- Portfolio collection rate
  CASE 
    WHEN COALESCE(SUM(jp.revenue), 0) > 0 
    THEN (COALESCE(SUM(j.amount_collected), 0) / COALESCE(SUM(jp.revenue), 0)) * 100
    ELSE 0
  END AS portfolio_collection_rate
FROM profiles p
LEFT JOIN jobs j ON j.partner_id = p.id
LEFT JOIN job_profitability_v2 jp ON jp.job_id = j.id
WHERE p.position_level IN ('partner', 'group_managing_partner')
GROUP BY p.id, p.first_name, p.last_name, p.position_level;

-- 6. Company-Wide Revenue View
-- Total company revenue is the sum of all partners' revenue (for Admin and GMP only)
CREATE OR REPLACE VIEW company_financial_summary AS
SELECT 
  COALESCE(SUM(total_portfolio_revenue), 0) AS company_total_revenue,
  COALESCE(SUM(total_portfolio_cost), 0) AS company_total_cost,
  COALESCE(SUM(total_portfolio_profit), 0) AS company_total_profit,
  COALESCE(SUM(total_collected), 0) AS company_total_collected,
  CASE 
    WHEN COUNT(*) > 0 AND COALESCE(SUM(total_portfolio_revenue), 0) > 0
    THEN (COALESCE(SUM(total_portfolio_profit), 0) / COALESCE(SUM(total_portfolio_revenue), 0)) * 100
    ELSE 0
  END AS company_avg_margin,
  COUNT(*) AS active_partners,
  COALESCE(SUM(jobs_acquired), 0) AS total_jobs,
  -- Company collection rate
  CASE 
    WHEN COALESCE(SUM(total_portfolio_revenue), 0) > 0 
    THEN (COALESCE(SUM(total_collected), 0) / COALESCE(SUM(total_portfolio_revenue), 0)) * 100
    ELSE 0
  END AS company_collection_rate
FROM partner_financial_contribution;