// This file defines the API routes for managing evaluation cycles. It includes endpoints for listing, retrieving, creating, updating, and deleting evaluation cycles. The routes are protected with authentication and role-based access control middleware to ensure that only authorized users can perform certain actions. The implementation also includes utility functions for parsing input values, resolving user roles, and determining access permissions based on those roles. By organizing these routes in a dedicated file, we can maintain a clear structure for our API and facilitate the management of evaluation cycles within the application.

import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { resolveRequestAccessRoles } from "../auth/accessRoles";
import { loadProfile } from '../middleware/loadProfile';
import { requireModuleAccess } from '../middleware/requireModuleAccess';
import { EvaluationCycleStatus } from '@prisma/client';
import prisma from '../prisma';

const router = Router();

const parseCycleStatus = (value: unknown): EvaluationCycleStatus | null => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (!normalized) return null;
  if (normalized === "draft") return EvaluationCycleStatus.draft;
  if (normalized === "active") return EvaluationCycleStatus.active;
  if (normalized === "closed") return EvaluationCycleStatus.closed;
  return null;
};

const resolveRoles = (req: AuthRequest) => {
  return resolveRequestAccessRoles(req).map((role) => role.toLowerCase());
};

const isPrivileged = (roles: string[]) =>
  roles.includes('super_admin') ||
  roles.includes('hr');

// GET /evaluation_cycles?status=active
router.get('/', authMiddleware, loadProfile, async (req: AuthRequest, res) => {
  try {
    const { status } = req.query;
    const roles = resolveRoles(req);
    const privileged = isPrivileged(roles);
    const resolvedStatus = privileged
      ? (status as EvaluationCycleStatus | undefined)
      : EvaluationCycleStatus.active;

    const cycles = await prisma.evaluationCycle.findMany({
      where: resolvedStatus ? { status: resolvedStatus } : undefined,
      include: privileged
        ? {
            definitions: true,
            performanceScores: true,
          }
        : {
            definitions: {
              where: { status: 'published', hideFromDashboard: false },
            },
          },
    });
    return res.json(cycles);
  } catch (err: any) {
    console.error('Error fetching evaluation cycles:', err);
    return res.status(500).json({ error: 'Failed to fetch evaluation cycles' });
  }
});

// GET /evaluation_cycles/:id
router.get('/:id', authMiddleware, loadProfile, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const roles = resolveRoles(req);
    const privileged = isPrivileged(roles);

    const cycle = await prisma.evaluationCycle.findUnique({
      where: { id: parseInt(id) },
      include: privileged
        ? {
            definitions: true,
            performanceScores: true,
          }
        : {
            definitions: {
              where: { status: 'published', hideFromDashboard: false },
            },
          },
    });
    if (!cycle) {
      return res.status(404).json({ error: 'Evaluation cycle not found' });
    }
    if (!privileged && cycle.status !== EvaluationCycleStatus.active) {
      return res.status(403).json({ error: 'Access denied' });
    }
    return res.json(cycle);
  } catch (err: any) {
    console.error('Error fetching evaluation cycle:', err);
    return res.status(500).json({ error: 'Failed to fetch evaluation cycle' });
  }
});

// POST /evaluation_cycles
router.post(
  '/',
  authMiddleware,
  loadProfile,
  requireModuleAccess('evaluations', 'write'),
  async (req: AuthRequest, res) => {
  try {
    const {
      cycle_name,
      cycleName,
      description,
      start_date,
      startDate,
      end_date,
      endDate,
      status
    } = req.body;
    const profileId = req.profile?.id ?? (req.user?.profileId ? Number(req.user.profileId) : undefined);

    const resolvedName = cycleName || cycle_name;
    const resolvedStart = startDate || start_date;
    const resolvedEnd = endDate || end_date;

    if (!resolvedName || !resolvedStart || !resolvedEnd) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const startDateObj = new Date(resolvedStart);
    const endDateObj = new Date(resolvedEnd);
    if (Number.isNaN(startDateObj.getTime()) || Number.isNaN(endDateObj.getTime())) {
      return res.status(400).json({ error: 'Invalid start or end date' });
    }
    if (endDateObj <= startDateObj) {
      return res.status(400).json({ error: 'End date must be after start date' });
    }

    const parsedStatus = parseCycleStatus(status);
    if (status !== undefined && status !== null && !parsedStatus) {
      return res.status(400).json({ error: 'Invalid status value' });
    }

    const cycle = await prisma.evaluationCycle.create({
      data: {
        cycleName: resolvedName,
        description,
        startDate: startDateObj,
        endDate: endDateObj,
        status: parsedStatus || EvaluationCycleStatus.draft,
        createdByProfileId: profileId || undefined,
      },
    });
    return res.status(201).json(cycle);
  } catch (err: any) {
    console.error('Error creating evaluation cycle:', err);
    return res.status(500).json({ error: err?.message || 'Failed to create evaluation cycle' });
  }
});

// PATCH /evaluation_cycles/:id
router.patch(
  '/:id',
  authMiddleware,
  loadProfile,
  requireModuleAccess('evaluations', 'write'),
  async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const {
      cycle_name,
      cycleName,
      description,
      start_date,
      startDate,
      end_date,
      endDate,
      status
    } = req.body;

    const parsedStatus = parseCycleStatus(status);
    if (status !== undefined && status !== null && !parsedStatus) {
      return res.status(400).json({ error: 'Invalid status value' });
    }
    const resolvedStart = startDate || start_date;
    const resolvedEnd = endDate || end_date;
    if (resolvedStart && resolvedEnd) {
      const startDateObj = new Date(resolvedStart);
      const endDateObj = new Date(resolvedEnd);
      if (Number.isNaN(startDateObj.getTime()) || Number.isNaN(endDateObj.getTime())) {
        return res.status(400).json({ error: 'Invalid start or end date' });
      }
      if (endDateObj <= startDateObj) {
        return res.status(400).json({ error: 'End date must be after start date' });
      }
    }

    const cycle = await prisma.evaluationCycle.update({
      where: { id: parseInt(id) },
      data: {
        ...(cycleName || cycle_name ? { cycleName: cycleName || cycle_name } : {}),
        ...(description && { description }),
        ...(startDate || start_date ? { startDate: new Date(startDate || start_date) } : {}),
        ...(endDate || end_date ? { endDate: new Date(endDate || end_date) } : {}),
        ...(parsedStatus && { status: parsedStatus }),
      },
    });
    return res.json(cycle);
  } catch (err: any) {
    console.error('Error updating evaluation cycle:', err);
    return res.status(500).json({ error: err?.message || 'Failed to update evaluation cycle' });
  }
});

// DELETE /evaluation_cycles/:id
router.delete(
  '/:id',
  authMiddleware,
  loadProfile,
  requireModuleAccess('evaluations', 'write'),
  async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    await prisma.evaluationCycle.delete({
      where: { id: parseInt(id) },
    });
    return res.json({ ok: true });
  } catch (err: any) {
    console.error('Error deleting evaluation cycle:', err);
    return res.status(500).json({ error: 'Failed to delete evaluation cycle' });
  }
});

export default router;
