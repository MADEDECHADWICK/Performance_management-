import { Router } from 'express';
import prisma from '../prisma';

const router = Router();

// GET /employee_evaluations?employee_id=3 or ?employee_ids=1,2,3
router.get('/', async (req, res) => {
  try {
    const { employee_id, employee_ids } = req.query;
    
    let ids: number[] = [];
    if (employee_id) {
      ids = [parseInt(employee_id as string)];
    } else if (employee_ids) {
      ids = (employee_ids as string).split(',').map(id => parseInt(id.trim()));
    }

    const evaluations = await prisma.evaluationAssignment.findMany({
      where: ids.length > 0 ? { evaluateeProfileId: { in: ids } } : undefined,
      include: {
        evaluatee: true,
        evaluator: true,
        definition: {
          include: {
            cycle: true,
          },
        },
      },
    });
    return res.json(evaluations);
  } catch (err: any) {
    console.error('Error in employee_evaluations:', err);
    return res.status(500).json({ error: 'Failed to fetch employee evaluations' });
  }
});

// GET /employee_evaluations/:id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const evaluation = await prisma.evaluationAssignment.findUnique({
      where: { id: parseInt(id) },
      include: {
        evaluatee: true,
        evaluator: true,
        definition: {
          include: {
            cycle: true,
          },
        },
      },
    });
    if (!evaluation) {
      return res.status(404).json({ error: 'Evaluation not found' });
    }
    return res.json(evaluation);
  } catch (err: any) {
    console.error('Error fetching employee evaluation:', err);
    return res.status(500).json({ error: 'Failed to fetch employee evaluation' });
  }
});

export default router;
