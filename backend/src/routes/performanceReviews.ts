import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import prisma from '../prisma';

const router = Router();

// GET /performance_reviews?employee_ids=1,2&status=completed
router.get('/', async (req, res) => {
  try {
    return res.json([]);
  } catch (err: any) {
    console.error('Error fetching performance reviews:', err);
    return res.status(500).json({ error: 'Failed to fetch performance reviews' });
  }
});

// GET /performance_reviews/:id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    return res.json({ id: Number(id), message: 'Performance review not yet available.' });
  } catch (err: any) {
    console.error('Error fetching performance review:', err);
    return res.status(500).json({ error: 'Failed to fetch performance review' });
  }
});

// POST /performance_reviews
router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { employee_id, reviewer_id, overall_rating, financial_score, non_financial_score, strengths, areas_for_improvement, goals_next_period, reviewer_comments, employee_comments, status } = req.body;

    if (!employee_id) {
      return res.status(400).json({ error: 'Employee ID is required' });
    }

    return res.status(201).json({
      id: 0,
      employeeId: Number(employee_id),
      reviewerId: reviewer_id ? Number(reviewer_id) : undefined,
      overallRating: overall_rating ? Number(overall_rating) : undefined,
      financialScore: financial_score ? Number(financial_score) : undefined,
      nonFinancialScore: non_financial_score ? Number(non_financial_score) : undefined,
      strengths,
      areasForImprovement: areas_for_improvement,
      goalsNextPeriod: goals_next_period,
      reviewerComments: reviewer_comments,
      employeeComments: employee_comments,
      status: status || 'draft',
    });
  } catch (err: any) {
    console.error('Error creating performance review:', err);
    return res.status(500).json({ error: 'Failed to create performance review' });
  }
});

// PATCH /performance_reviews/:id
router.patch('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { overall_rating, financial_score, non_financial_score, strengths, areas_for_improvement, goals_next_period, reviewer_comments, employee_comments, status } = req.body;

    return res.json({
      id: Number(id),
      overallRating: overall_rating ? Number(overall_rating) : undefined,
      financialScore: financial_score ? Number(financial_score) : undefined,
      nonFinancialScore: non_financial_score ? Number(non_financial_score) : undefined,
      strengths,
      areasForImprovement: areas_for_improvement,
      goalsNextPeriod: goals_next_period,
      reviewerComments: reviewer_comments,
      employeeComments: employee_comments,
      status,
    });
  } catch (err: any) {
    console.error('Error updating performance review:', err);
    return res.status(500).json({ error: 'Failed to update performance review' });
  }
});

export default router;
