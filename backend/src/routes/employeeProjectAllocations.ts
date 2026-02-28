import { Router } from 'express';
import prisma from '../prisma';

const router = Router();

// GET /employee_project_allocations?employeeIds=1,2&fields=allocationAmount
router.get('/', async (req, res) => {
  try {
    const { employeeIds } = req.query;
    
    let ids: number[] = [];
    if (employeeIds) {
      ids = (employeeIds as string).split(',').map(id => parseInt(id.trim()));
    }

    const allocations = await prisma.jobStaffAssignment.findMany({
      where: ids.length > 0 ? { employeeProfileId: { in: ids } } : undefined,
      include: {
        employee: true,
        job: true,
      },
    });
    return res.json(allocations);
  } catch (err: any) {
    console.error('Error fetching employee project allocations:', err);
    return res.status(500).json({ error: 'Failed to fetch allocations' });
  }
});

export default router;
