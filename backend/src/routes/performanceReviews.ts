import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import prisma from '../prisma';

const router = Router();

// GET /performance_reviews?employee_ids=1,2&status=completed
router.get('/', async (req, res) => {
  try {
    const ids = (req.query.employee_ids as string | undefined)?.split(',').map(s => parseInt(s.trim())).filter(Boolean) || [];
    const status = req.query.status as string | undefined;

    const reviews = await prisma.performanceReview.findMany({
      where: {
        ...(ids.length > 0 && { employee_id: { in: ids } }),
        ...(status && { status }),
      },
      include: {
        employee: true,
      },
    });
    return res.json(reviews || []);
  } catch (err: any) {
    console.error('Error fetching performance reviews:', err);
    return res.status(500).json({ error: 'Failed to fetch performance reviews' });
  }
});

// GET /performance_reviews/:id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const review = await prisma.performanceReview.findUnique({
      where: { id: parseInt(id) },
      include: {
        employee: true,
      },
    });

    if (!review) {
      return res.status(404).json({ error: 'Performance review not found' });
    }

    return res.json(review);
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

    const review = await prisma.performanceReview.create({
      data: {
        employee_id: parseInt(employee_id),
        reviewer_id: reviewer_id ? parseInt(reviewer_id) : undefined,
        overall_rating: overall_rating ? parseFloat(overall_rating) : undefined,
        financial_score: financial_score ? parseFloat(financial_score) : undefined,
        non_financial_score: non_financial_score ? parseFloat(non_financial_score) : undefined,
        strengths,
        areas_for_improvement,
        goals_next_period,
        reviewer_comments,
        employee_comments,
        status: status || 'draft',
      },
    });

    return res.status(201).json(review);
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

    const review = await prisma.performanceReview.update({
      where: { id: parseInt(id) },
      data: {
        ...(overall_rating && { overall_rating: parseFloat(overall_rating) }),
        ...(financial_score && { financial_score: parseFloat(financial_score) }),
        ...(non_financial_score && { non_financial_score: parseFloat(non_financial_score) }),
        ...(strengths && { strengths }),
        ...(areas_for_improvement && { areas_for_improvement }),
        ...(goals_next_period && { goals_next_period }),
        ...(reviewer_comments && { reviewer_comments }),
        ...(employee_comments && { employee_comments }),
        ...(status && { status }),
      },
    });

    return res.json(review);
  } catch (err: any) {
    console.error('Error updating performance review:', err);
    return res.status(500).json({ error: 'Failed to update performance review' });
  }
});

export default router;
