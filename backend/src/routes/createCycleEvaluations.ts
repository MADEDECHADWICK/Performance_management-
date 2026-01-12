import { Router } from 'express';
import prisma from '../prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// POST /create-cycle-evaluations
router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    console.log('Creating cycle evaluations with body:', req.body);
    const { cycleId } = req.body;
    
    if (!cycleId) {
      console.log('No cycleId provided');
      return res.status(400).json({ error: 'Cycle ID is required' });
    }

    console.log('Looking for cycle with ID:', cycleId, 'type:', typeof cycleId);

    // Get the cycle
    const cycle = await prisma.evaluationCycle.findUnique({
      where: { id: parseInt(cycleId) },
    });

    console.log('Found cycle:', cycle);

    if (!cycle) {
      console.log('Cycle not found');
      return res.status(404).json({ error: 'Evaluation cycle not found' });
    }

    console.log('Fetching active employees...');

    // Get all active employees
    const employees = await prisma.profile.findMany({
      where: { 
        status: 'active',
      },
      select: {
        id: true,
        manager_id: true,
        first_name: true,
        last_name: true,
        userId: true,
      },
    });

    console.log(`Found ${employees.length} employees:`, employees.map(e => ({ id: e.id, name: `${e.first_name} ${e.last_name}`, userId: e.userId })));

    if (employees.length === 0) {
      return res.json({ 
        success: true, 
        message: 'No active employees found',
        created: 0,
        skipped: 0
      });
    }

    // Check which employees already have evaluations for this cycle
    const existingEvaluations = await prisma.employeeEvaluation.findMany({
      where: { cycle_id: parseInt(cycleId) },
      select: { employee_id: true },
    });

    const existingEmployeeIds = new Set(existingEvaluations.map(e => e.employee_id));

    // Create evaluations for employees who don't have them yet
    const evaluationsToCreate = employees
      .filter(emp => !existingEmployeeIds.has(emp.id))
      .map(emp => ({
        cycle_id: parseInt(cycleId),
        employee_id: emp.id,
        manager_id: emp.manager_id,
        status: 'draft',
      }));

    if (evaluationsToCreate.length === 0) {
      return res.json({ 
        success: true, 
        message: 'All employees already have evaluations for this cycle',
        created: 0,
        skipped: employees.length
      });
    }

    console.log(`Creating ${evaluationsToCreate.length} new evaluations`);

    // Insert the evaluations
    const createdEvaluations = await prisma.employeeEvaluation.createMany({
      data: evaluationsToCreate,
    });

    return res.json({
      success: true,
      message: `Successfully created ${evaluationsToCreate.length} evaluations`,
      created: evaluationsToCreate.length,
      skipped: existingEvaluations.length,
    });

  } catch (error: any) {
    console.error('Error creating cycle evaluations:', error);
    console.error('Error stack:', error.stack);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      meta: error.meta,
    });
    return res.status(500).json({ 
      error: 'Failed to create evaluations',
      message: error.message,
      details: error.code || 'Unknown error code'
    });
  }
});

export default router;