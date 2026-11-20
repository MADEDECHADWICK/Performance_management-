import type { Prisma } from "@prisma/client";
import prisma from "../prisma";

type DbClient = Prisma.TransactionClient | typeof prisma;

const utcDateOnly = (value: Date) =>
  new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));

const dateKey = (value: Date) => utcDateOnly(value).toISOString().slice(0, 10);

const isWeekend = (value: Date) => {
  const weekday = utcDateOnly(value).getUTCDay();
  return weekday === 0 || weekday === 6;
};

export class TimesheetProjectionService {
  /**
   * Create or update the timesheet entries for an approved leave request.
   * Each non-voided leave segment maps to one approved, non-billable entry.
   */
  static async projectLeaveRequest(db: DbClient, leaveRequestId: number) {
    if (
      !(db as any).leaveRequest?.findUnique ||
      !(db as any).timeEntry?.create ||
      !(db as any).leaveRequestSegment?.update
    ) {
      return [];
    }

    const request = await db.leaveRequest.findUnique({
      where: { id: leaveRequestId },
      include: {
        leaveType: { select: { name: true } },
        segments: {
          select: {
            id: true,
            leaveDate: true,
            hours: true,
            syncStatus: true,
            timeEntryId: true,
          },
        },
      },
    });

    if (!request || request.status !== "approved") return [];

    const segments = request.segments.filter(
      (segment) =>
        segment.syncStatus !== "voided" && Number(segment.hours || 0) > 0
    );

    const description = `Leave - ${request.leaveType?.name || "Leave"}`;
    const entries = [];

    for (const segment of segments) {
      if (segment.timeEntryId && (db as any).timeEntry?.update) {
        const updated = await db.timeEntry
          .update({
            where: { id: segment.timeEntryId },
            data: {
              dateWorked: segment.leaveDate,
              hours: Number(segment.hours),
              billable: false,
              nonBillableCategory: "leave",
              description,
              billableAmount: 0,
              costAmount: 0,
              profitLoss: 0,
              status: "approved",
            },
          })
          .catch(() => null);
        if (updated) {
          entries.push(updated);
          continue;
        }
      }

      const entry = await db.timeEntry.create({
        data: {
          jobId: null,
          proposalId: null,
          taskId: null,
          employeeProfileId: request.employeeProfileId,
          dateWorked: segment.leaveDate,
          hours: Number(segment.hours),
          billable: false,
          nonBillableCategory: "leave",
          description,
          billableAmount: 0,
          costAmount: 0,
          profitLoss: 0,
          status: "approved",
        },
      });

      await db.leaveRequestSegment.update({
        where: { id: segment.id },
        data: { timeEntryId: entry.id },
      });

      entries.push(entry);
    }

    return entries;
  }

  /**
   * Remove timesheet entries generated for a leave request that is no longer approved.
   */
  static async unprojectLeaveRequest(db: DbClient, leaveRequestId: number) {
    if (!(db as any).leaveRequestSegment?.findMany || !(db as any).timeEntry?.deleteMany) {
      return;
    }

    const segments = await db.leaveRequestSegment.findMany({
      where: { leaveRequestId },
      select: { id: true, timeEntryId: true },
    });

    for (const segment of segments) {
      if (!segment.timeEntryId) continue;
      await db.timeEntry.deleteMany({ where: { id: segment.timeEntryId } });
      await db.leaveRequestSegment.update({
        where: { id: segment.id },
        data: { timeEntryId: null },
      });
    }
  }

  /**
   * Ensure approved public holiday entries exist for all active employees.
   * Weekends are skipped because they are not standard working days.
   */
  static async ensurePublicHolidayEntries(
    db: DbClient,
    options: { dateFrom?: Date; dateTo?: Date } = {}
  ) {
    if (!(db as any).publicHoliday?.findMany || !(db as any).timeEntry?.create) {
      return 0;
    }

    const from = options.dateFrom ? utcDateOnly(options.dateFrom) : null;
    const to = options.dateTo ? utcDateOnly(options.dateTo) : null;

    const holidays = await db.publicHoliday.findMany();
    if (holidays.length === 0) return 0;

    const today = utcDateOnly(new Date());
    const startYear = from ? from.getUTCFullYear() : today.getUTCFullYear();
    const endYear = to ? to.getUTCFullYear() : startYear;

    const occurrences: Array<{ name: string; date: Date }> = [];
    for (const holiday of holidays) {
      const holidayDate = utcDateOnly(new Date(holiday.holidayDate));
      if (holiday.isRecurring) {
        for (let year = startYear; year <= endYear; year += 1) {
          const occurrence = new Date(
            Date.UTC(year, holidayDate.getUTCMonth(), holidayDate.getUTCDate())
          );
          if ((!from || occurrence >= from) && (!to || occurrence <= to)) {
            occurrences.push({ name: holiday.name, date: occurrence });
          }
        }
      } else if (
        (!from || holidayDate >= from) &&
        (!to || holidayDate <= to)
      ) {
        occurrences.push({ name: holiday.name, date: holidayDate });
      }
    }

    const workingOccurrences = occurrences.filter(
      (occurrence) => !isWeekend(occurrence.date)
    );
    if (workingOccurrences.length === 0) return 0;

    const employees = await db.profile.findMany({
      where: { status: "active" },
      select: { id: true, standardDailyHours: true },
    });
    if (employees.length === 0) return 0;

    const occurrenceDates = Array.from(
      new Set(workingOccurrences.map((occurrence) => dateKey(occurrence.date)))
    ).map((key) => new Date(`${key}T00:00:00.000Z`));

    const existing = await db.timeEntry.findMany({
      where: {
        nonBillableCategory: "public_holiday",
        dateWorked: { in: occurrenceDates },
      },
      select: { employeeProfileId: true, dateWorked: true },
    });
    const existingKeys = new Set(
      existing.map(
        (entry) => `${entry.employeeProfileId}:${dateKey(entry.dateWorked)}`
      )
    );

    let createdCount = 0;
    for (const occurrence of workingOccurrences) {
      for (const employee of employees) {
        const key = `${employee.id}:${dateKey(occurrence.date)}`;
        if (existingKeys.has(key)) continue;

        await db.timeEntry.create({
          data: {
            jobId: null,
            proposalId: null,
            taskId: null,
            employeeProfileId: employee.id,
            dateWorked: occurrence.date,
            hours: Number(employee.standardDailyHours || 8) || 8,
            billable: false,
            nonBillableCategory: "public_holiday",
            description: `Public holiday - ${occurrence.name}`,
            billableAmount: 0,
            costAmount: 0,
            profitLoss: 0,
            status: "approved",
          },
        });
        existingKeys.add(key);
        createdCount += 1;
      }
    }

    return createdCount;
  }

  /**
   * Remove generated entries when a public holiday is updated or deleted.
   */
  static async removePublicHolidayEntries(
    db: DbClient,
    holiday: { name: string; holidayDate: Date; isRecurring: boolean }
  ) {
    if (!(db as any).timeEntry?.deleteMany) return;

    const description = `Public holiday - ${holiday.name}`;
    if (holiday.isRecurring) {
      await db.timeEntry.deleteMany({
        where: {
          nonBillableCategory: "public_holiday",
          description,
        },
      });
      return;
    }

    await db.timeEntry.deleteMany({
      where: {
        nonBillableCategory: "public_holiday",
        dateWorked: utcDateOnly(new Date(holiday.holidayDate)),
        description,
      },
    });
  }
}

export default TimesheetProjectionService;
