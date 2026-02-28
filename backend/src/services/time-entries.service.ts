/**
 * Legacy time-entries compatibility service.
 *
 * Wraps the active schema-aligned service in `time-entry.service.ts`.
 */

import prisma from "../prisma";
import { TimeEntryService as ModernTimeEntryService } from "./time-entry.service";

export interface TimeEntryCreateInput {
  jobId: number;
  employeeProfileId: number;
  dateWorked: Date;
  hours: number;
  minutes?: number;
  description?: string;
  billable: boolean;
  taskId?: number;
  manualEntry?: boolean;
}

export interface TimeEntryUpdateInput {
  hours?: number;
  minutes?: number;
  description?: string;
  billable?: boolean;
  taskId?: number;
}

export interface ListTimeEntriesOptions {
  page: number;
  pageSize: number;
  filters?: {
    status?: string;
    jobId?: number;
    employeeProfileId?: number;
    dateFrom?: Date;
    dateTo?: Date;
    billableOnly?: boolean;
  };
  sort?: {
    field?: string;
    order?: "asc" | "desc";
  };
}

export interface AuthContext {
  userId: number;
  profileId: number;
  roles?: string[];
}

class TimeEntryService {
  private toModernAuth(auth: AuthContext) {
    return {
      userId: auth.userId,
      profileId: auth.profileId,
      roleName: auth.roles?.[0],
    };
  }

  async createTimeEntry(input: TimeEntryCreateInput, authContext: AuthContext) {
    return ModernTimeEntryService.createTimeEntry(input, this.toModernAuth(authContext));
  }

  async updateTimeEntry(
    timeEntryId: number,
    input: TimeEntryUpdateInput,
    authContext: AuthContext
  ) {
    return ModernTimeEntryService.updateTimeEntry(
      timeEntryId,
      input,
      this.toModernAuth(authContext)
    );
  }

  async submitTimeEntry(timeEntryId: number, authContext: AuthContext) {
    return ModernTimeEntryService.submitTimeEntry(timeEntryId, this.toModernAuth(authContext));
  }

  async approveTimeEntry(timeEntryId: number, authContext: AuthContext) {
    return ModernTimeEntryService.approveTimeEntry(
      timeEntryId,
      "",
      this.toModernAuth(authContext)
    );
  }

  async rejectTimeEntry(
    timeEntryId: number,
    rejectionReason: string,
    authContext: AuthContext
  ) {
    return ModernTimeEntryService.rejectTimeEntry(
      timeEntryId,
      rejectionReason,
      this.toModernAuth(authContext)
    );
  }

  async requestMoreTime(
    timeEntryId: number,
    additionalHours: number,
    reason: string,
    authContext: AuthContext
  ) {
    const entry = await this.getTimeEntryById(timeEntryId);

    return ModernTimeEntryService.createApprovalRequest(
      {
        jobId: entry.jobId,
        additionalHours,
        justification: reason,
        requestType: "additional_hours",
      },
      this.toModernAuth(authContext)
    );
  }

  async startTimer(jobId: number, taskId?: number, authContext?: AuthContext) {
    if (!authContext) {
      throw new Error("Authentication context is required");
    }

    const seedEntry = await ModernTimeEntryService.createTimeEntry(
      {
        jobId,
        employeeProfileId: authContext.profileId,
        dateWorked: new Date(),
        hours: 0,
        taskId,
        billable: true,
        description: "Timer started",
      },
      this.toModernAuth(authContext)
    );

    return ModernTimeEntryService.startTimer(seedEntry.id, this.toModernAuth(authContext));
  }

  async stopTimer(timeEntryId: number) {
    const entry = await prisma.timeEntry.findUnique({
      where: { id: timeEntryId },
      select: { employeeProfileId: true },
    });

    if (!entry) {
      throw new Error("Time entry not found");
    }

    return ModernTimeEntryService.stopTimer(timeEntryId, {
      userId: 0,
      profileId: entry.employeeProfileId,
      roleName: "employee",
    });
  }

  async deleteTimeEntry(timeEntryId: number, authContext: AuthContext) {
    await ModernTimeEntryService.deleteTimeEntry(timeEntryId, this.toModernAuth(authContext));
    return { deleted: true, id: timeEntryId };
  }

  async getTimeEntryById(timeEntryId: number) {
    const entry = await prisma.timeEntry.findUnique({
      where: { id: timeEntryId },
    });
    if (!entry) throw new Error("Time entry not found");
    return entry;
  }

  async listTimeEntries(options: ListTimeEntriesOptions, authContext: AuthContext) {
    return ModernTimeEntryService.listTimeEntries(
      {
        page: options.page,
        pageSize: options.pageSize,
        status: options.filters?.status,
        jobId: options.filters?.jobId,
        dateFrom: options.filters?.dateFrom,
        dateTo: options.filters?.dateTo,
        billableOnly: options.filters?.billableOnly,
      },
      this.toModernAuth(authContext)
    );
  }

  async batchSubmitTimeEntries(timeEntryIds: number[], authContext: AuthContext) {
    return ModernTimeEntryService.batchSubmitTimeEntries(
      timeEntryIds,
      this.toModernAuth(authContext)
    );
  }

  async batchApproveTimeEntries(timeEntryIds: number[], authContext: AuthContext) {
    return ModernTimeEntryService.batchApproveTimeEntries(
      timeEntryIds,
      this.toModernAuth(authContext)
    );
  }

  // Legacy budget check shape retained for compatibility.
  private async checkBudget(jobId: number) {
    const summary = await ModernTimeEntryService.getJobTimeSummary(jobId, {
      userId: 0,
      profileId: 0,
      roleName: "admin",
    });
    return {
      status: summary.percentageUsed > 100 ? "exceeded" : "within_budget",
      remaining: summary.budgetRemaining,
      allowOverage: true,
    };
  }
}

export default new TimeEntryService();
