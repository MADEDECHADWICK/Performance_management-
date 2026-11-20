const DAY_MS = 24 * 60 * 60 * 1000;

const toUtcDate = (value: Date) =>
  new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));

const toDateInput = (value: Date) => toUtcDate(value).toISOString().slice(0, 10);

const addDays = (value: Date, days: number) =>
  new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate() + days));

export type ReportPeriodPreset = "daily" | "weekly" | "monthly" | "quarterly" | "yearly";

export const getPeriodRange = (period: ReportPeriodPreset, anchor = new Date()) => {
  const day = toUtcDate(anchor);
  const year = day.getUTCFullYear();
  const month = day.getUTCMonth();

  if (period === "daily") {
    const key = toDateInput(day);
    return { startDate: key, endDate: key };
  }

  if (period === "weekly") {
    const weekday = day.getUTCDay();
    const diffToMonday = weekday === 0 ? -6 : 1 - weekday;
    const start = addDays(day, diffToMonday);
    return {
      startDate: toDateInput(start),
      endDate: toDateInput(new Date(start.getTime() + 6 * DAY_MS)),
    };
  }

  if (period === "quarterly") {
    const quarterStartMonth = Math.floor(month / 3) * 3;
    return {
      startDate: toDateInput(new Date(Date.UTC(year, quarterStartMonth, 1))),
      endDate: toDateInput(new Date(Date.UTC(year, quarterStartMonth + 3, 0))),
    };
  }

  if (period === "yearly") {
    return {
      startDate: toDateInput(new Date(Date.UTC(year, 0, 1))),
      endDate: toDateInput(new Date(Date.UTC(year, 11, 31))),
    };
  }

  return {
    startDate: toDateInput(new Date(Date.UTC(year, month, 1))),
    endDate: toDateInput(new Date(Date.UTC(year, month + 1, 0))),
  };
};
