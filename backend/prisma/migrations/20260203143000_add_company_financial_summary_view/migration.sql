CREATE OR REPLACE VIEW company_financial_summary AS
SELECT
  COALESCE(SUM(cp.payment_amount), 0) AS company_total_revenue,
  COALESCE(SUM(te.cost_amount), 0) AS company_total_cost,
  COALESCE(SUM(te.profit_loss), 0) AS company_total_profit,
  CASE
    WHEN COALESCE(SUM(rp.projected_amount), 0) > 0
      THEN (COALESCE(SUM(cp.payment_amount), 0) / SUM(rp.projected_amount)) * 100
    ELSE 0
  END AS company_collection_rate
FROM client_payments cp
LEFT JOIN time_entries te ON te.job_id = cp.job_id
LEFT JOIN revenue_projections rp
  ON rp.status IN ('projected', 'revised', 'actualized');
