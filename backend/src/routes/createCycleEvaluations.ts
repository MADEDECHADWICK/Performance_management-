import { Router } from 'express';
import prisma from '../prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { loadProfile } from '../middleware/loadProfile';
import { requireModuleAccess } from '../middleware/requireModuleAccess';

const router = Router();

// POST /create-cycle-evaluations
router.post(
  '/',
  authMiddleware,
  loadProfile,
  requireModuleAccess('evaluations', 'admin'),
  async (req: AuthRequest, res) => {
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

    if (cycle.status !== 'active') {
      return res.status(409).json({ error: 'Evaluation cycle must be active to create assignments' });
    }

    const definitions = await prisma.evaluationDefinition.findMany({
      where: { cycleId: cycle.id, status: 'published' },
      select: {
        id: true,
        enableSelfEvaluation: true,
        enablePeerEvaluation: true,
        enableUpwardEvaluation: true,
        enableDownwardEvaluation: true,
        enableClientEvaluation: true,
        scoringConfig: true,
      },
    });

    if (definitions.length === 0) {
      return res.json({
        success: true,
        message: "No published evaluation definitions linked to this cycle.",
        created: 0,
        skipped: 0,
      });
    }

    console.log('Fetching active employees...');

    // Get all active employees
    const employees = await prisma.profile.findMany({
      where: {
        status: 'active',
      },
      select: {
        id: true,
        managerId: true,
        departmentId: true,
        firstName: true,
        lastName: true,
        userId: true,
      },
    });

    console.log(`Found ${employees.length} employees:`, employees.map(e => ({ id: e.id, name: `${e.firstName} ${e.lastName}`, userId: e.userId })));

    if (employees.length === 0) {
      return res.json({ 
        success: true, 
        message: 'No active employees found',
        created: 0,
        skipped: 0
      });
    }

    const definitionIds = definitions.map((def) => def.id);

    // Check which assignments already exist for these definitions
    const existingAssignments = await prisma.evaluationAssignment.findMany({
      where: {
        evaluationDefinitionId: { in: definitionIds },
        evaluateeProfileId: { in: employees.map((e) => e.id) },
      },
      select: {
        evaluationDefinitionId: true,
        evaluatorProfileId: true,
        evaluateeProfileId: true,
        evaluatorType: true,
      },
    });

    const existingKeys = new Set(
      existingAssignments.map(
        (a) =>
          `${a.evaluationDefinitionId}:${a.evaluateeProfileId}:${a.evaluatorProfileId}:${a.evaluatorType}`
      )
    );

    const employeeById = new Map(employees.map((emp) => [emp.id, emp]));

    const evaluationsToCreate = definitions.flatMap((definition) => {
      const config = (definition.scoringConfig as Record<string, any>) || {};
      const peerAssignmentMode = config.peerAssignmentMode ?? 'manager';
      const peersPerPerson = Number(config.peersPerPerson ?? 2);
      const evaluatorMapping = Array.isArray(config.evaluatorMapping)
        ? config.evaluatorMapping
        : [];

      const assignments: Array<{
        evaluationDefinitionId: number;
        evaluatorProfileId: number;
        evaluateeProfileId: number;
        evaluatorType: 'manager' | 'peer' | 'self' | 'direct_report' | 'client' | 'custom';
        status: 'pending';
      }> = [];

      employees.forEach((emp) => {
        if (definition.enableDownwardEvaluation && emp.managerId) {
          const key = `${definition.id}:${emp.id}:${emp.managerId}:manager`;
          if (!existingKeys.has(key)) {
            assignments.push({
              evaluationDefinitionId: definition.id,
              evaluatorProfileId: Number(emp.managerId),
              evaluateeProfileId: emp.id,
              evaluatorType: 'manager',
              status: 'pending',
            });
          }
        }

        if (definition.enableSelfEvaluation) {
          const key = `${definition.id}:${emp.id}:${emp.id}:self`;
          if (!existingKeys.has(key)) {
            assignments.push({
              evaluationDefinitionId: definition.id,
              evaluatorProfileId: emp.id,
              evaluateeProfileId: emp.id,
              evaluatorType: 'self',
              status: 'pending',
            });
          }
        }

        if (definition.enablePeerEvaluation) {
          let peerCandidates = employees.filter((peer) => peer.id !== emp.id);
          if (peerAssignmentMode === 'manager') {
            peerCandidates = peerCandidates.filter((peer) => peer.managerId && peer.managerId === emp.managerId);
          } else if (peerAssignmentMode === 'department') {
            peerCandidates = peerCandidates.filter((peer) => peer.departmentId && peer.departmentId === emp.departmentId);
          }

          const selectedPeers = peerCandidates.slice(0, Math.max(0, peersPerPerson));
          selectedPeers.forEach((peer) => {
            const key = `${definition.id}:${emp.id}:${peer.id}:peer`;
            if (!existingKeys.has(key)) {
              assignments.push({
                evaluationDefinitionId: definition.id,
                evaluatorProfileId: peer.id,
                evaluateeProfileId: emp.id,
                evaluatorType: 'peer',
                status: 'pending',
              });
            }
          });
        }

        if (definition.enableUpwardEvaluation) {
          const directReports = employees.filter((report) => report.managerId === emp.id);
          directReports.forEach((report) => {
            const key = `${definition.id}:${emp.id}:${report.id}:direct_report`;
            if (!existingKeys.has(key)) {
              assignments.push({
                evaluationDefinitionId: definition.id,
                evaluatorProfileId: report.id,
                evaluateeProfileId: emp.id,
                evaluatorType: 'direct_report',
                status: 'pending',
              });
            }
          });
        }
      });

      evaluatorMapping.forEach((mapping: any) => {
        const evaluateeProfileId = Number(mapping.evaluateeProfileId);
        const evaluatorProfileIds = Array.isArray(mapping.evaluatorProfileIds)
          ? mapping.evaluatorProfileIds.map((id: any) => Number(id))
          : [];
        const evaluatorType = (mapping.evaluatorType || 'custom') as
          | 'manager'
          | 'peer'
          | 'self'
          | 'direct_report'
          | 'client'
          | 'custom';

        evaluatorProfileIds.forEach((evaluatorProfileId: number) => {
          if (!employeeById.has(evaluateeProfileId) || !employeeById.has(evaluatorProfileId)) {
            return;
          }
          const key = `${definition.id}:${evaluateeProfileId}:${evaluatorProfileId}:${evaluatorType}`;
          if (!existingKeys.has(key)) {
            assignments.push({
              evaluationDefinitionId: definition.id,
              evaluatorProfileId,
              evaluateeProfileId,
              evaluatorType,
              status: 'pending',
            });
          }
        });
      });

      return assignments;
    });

    if (evaluationsToCreate.length === 0) {
      return res.json({ 
        success: true, 
        message: 'All evaluation assignments already exist for this cycle',
        created: 0,
        skipped: employees.length
      });
    }

    console.log(`Creating ${evaluationsToCreate.length} new evaluations`);

    // Insert the evaluations
    const createdEvaluations = await prisma.evaluationAssignment.createMany({
      data: evaluationsToCreate,
    });

    return res.json({
      success: true,
      message: `Successfully created ${evaluationsToCreate.length} evaluations`,
      created: evaluationsToCreate.length,
      skipped: existingAssignments.length,
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
