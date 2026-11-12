import { Router } from 'express';
import { WriteOffService } from '../services/writeOff.service';
import { errorResponse, successResponse } from '../utils/response';

const router = Router();

const readRangeQuery = (req: any) => ({
  period: req.query.period,
  date: req.query.date,
  dateFrom: req.query.dateFrom,
  dateTo: req.query.dateTo,
});

/**
 * GET /write-offs/time
 * Non-billable time write-offs by individual, department, partner and firm.
 */
router.get('/time', async (req, res) => {
  try {
    const result = await WriteOffService.getTimeWriteOffs(readRangeQuery(req));
    res.json(successResponse(result, 'Time write-offs retrieved'));
  } catch (error: any) {
    res.status(error.statusCode || 500).json(
      errorResponse(error.message, error.statusCode || 500, error.details)
    );
  }
});

/**
 * GET /write-offs/jobs
 * Job write-offs where delivered value exceeds the agreed fee.
 */
router.get('/jobs', async (req, res) => {
  try {
    const result = await WriteOffService.getJobWriteOffs(readRangeQuery(req));
    res.json(successResponse(result, 'Job write-offs retrieved'));
  } catch (error: any) {
    res.status(error.statusCode || 500).json(
      errorResponse(error.message, error.statusCode || 500, error.details)
    );
  }
});

/**
 * GET /write-offs/summary
 * Combined time and job write-off payload.
 */
router.get('/summary', async (req, res) => {
  try {
    const query = readRangeQuery(req);
    const [time, jobs] = await Promise.all([
      WriteOffService.getTimeWriteOffs(query),
      WriteOffService.getJobWriteOffs(query),
    ]);
    res.json(successResponse({ time, jobs }, 'Write-offs retrieved'));
  } catch (error: any) {
    res.status(error.statusCode || 500).json(
      errorResponse(error.message, error.statusCode || 500, error.details)
    );
  }
});

export default router;
