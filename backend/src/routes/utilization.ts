import { Router } from 'express';
import {
  TimeUtilizationService,
  UTILIZATION_PERIODS,
  type UtilizationPeriod,
} from '../services/timeUtilization.service';
import { errorResponse, successResponse } from '../utils/response';

const router = Router();

const parseDate = (value: unknown): Date | undefined => {
  if (!value) return undefined;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

/**
 * GET /utilization
 * Billable utilization cascade: individual -> department -> partner -> firm.
 */
router.get('/', async (req, res) => {
  try {
    const rawPeriod = String(req.query.period || 'monthly').toLowerCase();
    const period = UTILIZATION_PERIODS.includes(rawPeriod as UtilizationPeriod)
      ? (rawPeriod as UtilizationPeriod)
      : 'monthly';

    const anchorDate = parseDate(req.query.date) || new Date();
    const dateFrom = parseDate(req.query.dateFrom);
    const dateTo = parseDate(req.query.dateTo);

    const result = await TimeUtilizationService.getCascade({
      period,
      anchorDate,
      dateFrom,
      dateTo,
    });

    res.json(successResponse(result, 'Utilization cascade retrieved'));
  } catch (error: any) {
    res.status(error.statusCode || 500).json(
      errorResponse(error.message, error.statusCode || 500, error.details)
    );
  }
});

export default router;
