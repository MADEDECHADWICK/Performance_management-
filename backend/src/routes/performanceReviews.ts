import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { loadProfile } from '../middleware/loadProfile';
import { requireModuleAccess } from '../middleware/requireModuleAccess';
import prisma from '../prisma';

const router = Router();

// GET /performance_reviews?employeeIds=1,2&status=completed
router.get('/', authMiddleware, loadProfile, async (req: AuthRequest, res) => {
  try {
    return res.json([]);
  } catch (err: any) {
    console.error('Error fetching performance reviews:', err);
    return res.status(500).json({ error: 'Failed to fetch performance reviews' });
  }
});

// GET /performance_reviews/:id
router.get('/:id', authMiddleware, loadProfile, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    return res.json({ id: Number(id), message: 'Performance review not yet available.' });
  } catch (err: any) {
    console.error('Error fetching performance review:', err);
    return res.status(500).json({ error: 'Failed to fetch performance review' });
  }
});

// POST /performance_reviews
router.post(
  '/',
  authMiddleware,
  loadProfile,
  requireModuleAccess('evaluations', 'approve'),
  async (req: AuthRequest, res) => {
  try {
    const {
      employeeId,
      reviewerId,
      overallRating,
      financialScore,
      nonFinancialScore,
      strengths,
      areasForImprovement,
      goalsNextPeriod,
      reviewerComments,
      employeeComments,
      status,
    } = req.body;

    if (!employeeId) {
      return res.status(400).json({ error: 'Employee ID is required' });
    }

    return res.status(201).json({
      id: 0,
      employeeId: Number(employeeId),
      reviewerId: reviewerId ? Number(reviewerId) : undefined,
      overallRating: overallRating ? Number(overallRating) : undefined,
      financialScore: financialScore ? Number(financialScore) : undefined,
      nonFinancialScore: nonFinancialScore ? Number(nonFinancialScore) : undefined,
      strengths,
      areasForImprovement,
      goalsNextPeriod,
      reviewerComments,
      employeeComments,
      status: status || 'draft',
    });
  } catch (err: any) {
    console.error('Error creating performance review:', err);
    return res.status(500).json({ error: 'Failed to create performance review' });
  }
});

// PATCH /performance_reviews/:id
router.patch(
  '/:id',
  authMiddleware,
  loadProfile,
  requireModuleAccess('evaluations', 'approve'),
  async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const {
      overallRating,
      financialScore,
      nonFinancialScore,
      strengths,
      areasForImprovement,
      goalsNextPeriod,
      reviewerComments,
      employeeComments,
      status,
    } = req.body;

    return res.json({
      id: Number(id),
      overallRating: overallRating ? Number(overallRating) : undefined,
      financialScore: financialScore ? Number(financialScore) : undefined,
      nonFinancialScore: nonFinancialScore ? Number(nonFinancialScore) : undefined,
      strengths,
      areasForImprovement,
      goalsNextPeriod,
      reviewerComments,
      employeeComments,
      status,
    });
  } catch (err: any) {
    console.error('Error updating performance review:', err);
    return res.status(500).json({ error: 'Failed to update performance review' });
  }
});

export default router;
