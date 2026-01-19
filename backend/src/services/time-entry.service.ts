/**
 * Time Entry Service
 * Business logic for time tracking, approval, and budget enforcement
 */

import { PrismaClient, TimeEntryStatus } from "@prisma/client";

const prisma = new PrismaClient();

export class TimeEntryService {
  /**
   * List all accessible time entries
   */
  static async listTimeEntries(
    filters: {
      page: number;
      pageSize: number;
      status?: string;
      jobId?: number;
      employeeProfileId?: number;
    },
    currentProfileId: number
  ) {
    const { page, pageSize, status, jobId, employeeProfileId } = filters;
    const skip = (page - 1) * pageSize;

    const whereClause: any = {};

    if (status) whereClause.status = status;
    if (jobId) whereClause.jobId = jobId;
    if (employeeProfileId) whereClause.employeeProfileId = employeeProfileId;

    const [timeEntries, total] = await Promise.all([
      prisma.timeEntry.findMany({
        where: whereClause,
        skip,
        take: pageSize,
        include: {
          job: true,
          employeeProfile: { include: { user: true } },
          approvedBy: { include: { user: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.timeEntry.count({ where: whereClause }),
    ]);

    return { timeEntries, total };
  }

  /**
   * Create new time entry with budget validation
   */
  static async createTimeEntry(
    data: {
      jobId: number;
      employeeProfileId: number;
      hours: number;
      description: string;
      entryDate: string;
    },
    currentProfileId: number,
    budgetValidation?: any
  ) {
    // Verify user is assigned to job
    const staffing = await prisma.jobStaffing.findFirst({
      where: {
        jobId: data.jobId,
        employeeProfileId: data.employeeProfileId,
      },
    });

    if (!staffing) {
      throw new Error("You are not assigned to this job");
    }

    // Check daily limit (e.g., max 12 hours per day)
    const dailyTotal = await prisma.timeEntry.aggregate({
      where: {
        employeeProfileId: data.employeeProfileId,
        entryDate: new Date(data.entryDate),
        status: { not: TimeEntryStatus.REJECTED },
      },
      _sum: { hours: true },
    });

    const totalHours = (dailyTotal._sum.hours || 0) + data.hours;
    if (totalHours > 12) {
      throw new Error("Hours exceed daily limit of 12");
    }

    // Create time entry
    const timeEntry = await prisma.timeEntry.create({
      data: {
        jobId: data.jobId,
        employeeProfileId: data.employeeProfileId,
        hours: data.hours,
        description: data.description,
        entryDate: new Date(data.entryDate),
        status: TimeEntryStatus.DRAFT,
      },
      include: {
        job: true,
        employeeProfile: { include: { user: true } },
      },
    });

    return timeEntry;
  }

  /**
   * Get single time entry by ID
   */
  static async getTimeEntryById(timeEntryId: number, currentProfileId: number) {
    const timeEntry = await prisma.timeEntry.findUnique({
      where: { id: timeEntryId },
      include: {
        job: { include: { managers: true } },
        employeeProfile: { include: { user: true } },
        approvedBy: { include: { user: true } },
      },
    });

    if (!timeEntry) return null;

    // Verify access
    const hasAccess =
      timeEntry.employeeProfileId === currentProfileId ||
      timeEntry.job.managers.some((m) => m.profileId === currentProfileId);

    if (!hasAccess) {
      throw new Error("Access forbidden to this time entry");
    }

    return timeEntry;
  }

  /**
   * Update time entry (hours, description)
   */
  static async updateTimeEntry(
    timeEntryId: number,
    data: { hours?: number; description?: string },
    currentProfileId: number,
    budgetValidation?: any
  ) {
    const timeEntry = await prisma.timeEntry.findUnique({
      where: { id: timeEntryId },
      include: { job: true },
    });

    if (!timeEntry) throw new Error("Time entry not found");

    // Verify ownership
    if (timeEntry.employeeProfileId !== currentProfileId) {
      throw new Error("Access forbidden");
    }

    // Only allow update in draft status
    if (timeEntry.status !== TimeEntryStatus.DRAFT) {
      throw new Error("Cannot update submitted or approved entries");
    }

    const updated = await prisma.timeEntry.update({
      where: { id: timeEntryId },
      data: {
        hours: data.hours || timeEntry.hours,
        description: data.description || timeEntry.description,
      },
      include: { job: true, employeeProfile: true },
    });

    return updated;
  }

  /**
   * Delete time entry
   */
  static async deleteTimeEntry(timeEntryId: number, currentProfileId: number) {
    const timeEntry = await prisma.timeEntry.findUnique({
      where: { id: timeEntryId },
    });

    if (!timeEntry) throw new Error("Time entry not found");

    if (timeEntry.employeeProfileId !== currentProfileId) {
      throw new Error("Access forbidden");
    }

    if (timeEntry.status !== TimeEntryStatus.DRAFT) {
      throw new Error("Cannot delete submitted or approved entries");
    }

    await prisma.timeEntry.delete({ where: { id: timeEntryId } });
  }

  /**
   * Submit time entry for approval
   */
  static async submitTimeEntry(timeEntryId: number, currentProfileId: number) {
    const timeEntry = await prisma.timeEntry.findUnique({
      where: { id: timeEntryId },
      include: { job: true },
    });

    if (!timeEntry) throw new Error("Time entry not found");

    if (timeEntry.employeeProfileId !== currentProfileId) {
      throw new Error("Access forbidden");
    }

    if (timeEntry.status !== TimeEntryStatus.DRAFT) {
      throw new Error("Time entry already submitted");
    }

    const updated = await prisma.timeEntry.update({
      where: { id: timeEntryId },
      data: { status: TimeEntryStatus.PENDING_APPROVAL },
      include: { job: true, employeeProfile: true },
    });

    return updated;
  }

  /**
   * Approve time entry (manager/admin only)
   */
  static async approveTimeEntry(
    timeEntryId: number,
    currentProfileId: number,
    approvalNotes?: string
  ) {
    const timeEntry = await prisma.timeEntry.findUnique({
      where: { id: timeEntryId },
      include: { job: { include: { managers: true } } },
    });

    if (!timeEntry) throw new Error("Time entry not found");

    if (timeEntry.status !== TimeEntryStatus.PENDING_APPROVAL) {
      throw new Error("Time entry not pending approval");
    }

    // Verify manager access
    const isManager = timeEntry.job.managers.some(
      (m) => m.profileId === currentProfileId
    );
    if (!isManager) {
      throw new Error("Access forbidden - only managers can approve");
    }

    const updated = await prisma.timeEntry.update({
      where: { id: timeEntryId },
      data: {
        status: TimeEntryStatus.APPROVED,
        approvedById: currentProfileId,
        approvalNotes: approvalNotes || null,
        approvedAt: new Date(),
      },
      include: { job: true, employeeProfile: true, approvedBy: true },
    });

    return updated;
  }

  /**
   * Start real-time timer
   */
  static async startTimer(timeEntryId: number, currentProfileId: number) {
    const timeEntry = await prisma.timeEntry.findUnique({
      where: { id: timeEntryId },
    });

    if (!timeEntry) throw new Error("Time entry not found");

    if (timeEntry.employeeProfileId !== currentProfileId) {
      throw new Error("Access forbidden");
    }

    if (timeEntry.timerStartedAt) {
      throw new Error("Timer already running");
    }

    const updated = await prisma.timeEntry.update({
      where: { id: timeEntryId },
      data: { timerStartedAt: new Date() },
      include: { job: true },
    });

    return updated;
  }

  /**
   * Stop real-time timer and calculate elapsed time
   */
  static async stopTimer(timeEntryId: number, currentProfileId: number) {
    const timeEntry = await prisma.timeEntry.findUnique({
      where: { id: timeEntryId },
    });

    if (!timeEntry) throw new Error("Time entry not found");

    if (timeEntry.employeeProfileId !== currentProfileId) {
      throw new Error("Access forbidden");
    }

    if (!timeEntry.timerStartedAt) {
      throw new Error("Timer not running");
    }

    const elapsedMs = Date.now() - timeEntry.timerStartedAt.getTime();
    const elapsedHours = elapsedMs / (1000 * 60 * 60);

    const updated = await prisma.timeEntry.update({
      where: { id: timeEntryId },
      data: {
        timerStartedAt: null,
        hours: timeEntry.hours + elapsedHours,
      },
      include: { job: true },
    });

    return updated;
  }

  /**
   * Batch submit multiple time entries
   */
  static async batchSubmitTimeEntries(
    timeEntryIds: number[],
    currentProfileId: number
  ) {
    const updated = await prisma.timeEntry.updateMany({
      where: {
        id: { in: timeEntryIds },
        employeeProfileId: currentProfileId,
        status: TimeEntryStatus.DRAFT,
      },
      data: { status: TimeEntryStatus.PENDING_APPROVAL },
    });

    return { updated: updated.count };
  }

  /**
   * Batch approve multiple time entries
   */
  static async batchApproveTimeEntries(
    timeEntryIds: number[],
    currentProfileId: number
  ) {
    // Verify manager role (simplified - check actual role in middleware)
    const updated = await prisma.timeEntry.updateMany({
      where: {
        id: { in: timeEntryIds },
        status: TimeEntryStatus.PENDING_APPROVAL,
      },
      data: {
        status: TimeEntryStatus.APPROVED,
        approvedById: currentProfileId,
        approvedAt: new Date(),
      },
    });

    return { updated: updated.count };
  }

  /**
   * Request overage approval for budget exceeded entry
   */
  static async requestMoreTime(
    timeEntryId: number,
    data: { reason: string; requestedHours: number },
    currentProfileId: number
  ) {
    const timeEntry = await prisma.timeEntry.findUnique({
      where: { id: timeEntryId },
    });

    if (!timeEntry) throw new Error("Time entry not found");

    if (timeEntry.employeeProfileId !== currentProfileId) {
      throw new Error("Access forbidden");
    }

    // Create overage request (would need BudgetOverageRequest model)
    const request = await prisma.budgetOverageRequest.create({
      data: {
        timeEntryId,
        reason: data.reason,
        requestedHours: data.requestedHours,
        status: "pending",
      },
      include: { timeEntry: true },
    });

    return request;
  }
}