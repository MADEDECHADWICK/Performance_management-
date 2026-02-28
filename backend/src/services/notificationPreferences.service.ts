import prisma from "../prisma";

export type NotificationPriority = "low" | "medium" | "high" | "critical";
export type NotificationDigestMode = "off" | "daily" | "weekly";

export interface NotificationChannels {
  inApp: boolean;
  email: boolean;
  sms: boolean;
  push: boolean;
}

export interface NotificationQuietHours {
  enabled: boolean;
  start: string;
  end: string;
  timezone: string;
}

export interface NotificationPreferenceModel {
  profileId: number;
  channels: NotificationChannels;
  quietHours: NotificationQuietHours;
  digestMode: NotificationDigestMode;
  severityThreshold: NotificationPriority;
  updatedAt: string;
}

export interface NotificationPreferenceInput {
  channels?: Partial<NotificationChannels>;
  quietHours?: Partial<NotificationQuietHours>;
  digestMode?: NotificationDigestMode;
  severityThreshold?: NotificationPriority;
}

interface AuthContext {
  userId: number;
  profileId: number;
  roleName?: string;
}

const DEFAULT_PREFERENCES: Omit<NotificationPreferenceModel, "profileId" | "updatedAt"> = {
  channels: {
    inApp: true,
    email: false,
    sms: false,
    push: false,
  },
  quietHours: {
    enabled: false,
    start: "22:00",
    end: "07:00",
    timezone: "Africa/Nairobi",
  },
  digestMode: "off",
  severityThreshold: "low",
};

const PRIORITY_RANK: Record<NotificationPriority, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const toMinutes = (value: string) => {
  const [hour, minute] = value.split(":").map((part) => Number(part));
  return hour * 60 + minute;
};

const parsePreferenceMetadata = (metadata: unknown): Partial<NotificationPreferenceModel> | null => {
  if (!metadata || Object.prototype.toString.call(metadata) !== "[object Object]") return null;
  const raw = metadata as Record<string, unknown>;
  const preference = raw.preference;
  if (!preference || Object.prototype.toString.call(preference) !== "[object Object]") return null;
  return preference as Partial<NotificationPreferenceModel>;
};

const currentMinutesForTimezone = (timezone: string): number => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = formatter.formatToParts(new Date());
  const hours = Number(parts.find((part) => part.type === "hour")?.value || "0");
  const minutes = Number(parts.find((part) => part.type === "minute")?.value || "0");
  return hours * 60 + minutes;
};

export class NotificationPreferenceService {
  private static validateAndNormalize(profileId: number, input?: Partial<NotificationPreferenceModel>) {
    const merged: NotificationPreferenceModel = {
      profileId,
      channels: {
        ...DEFAULT_PREFERENCES.channels,
        ...(input?.channels || {}),
      },
      quietHours: {
        ...DEFAULT_PREFERENCES.quietHours,
        ...(input?.quietHours || {}),
      },
      digestMode:
        input?.digestMode && ["off", "daily", "weekly"].includes(input.digestMode)
          ? input.digestMode
          : DEFAULT_PREFERENCES.digestMode,
      severityThreshold:
        input?.severityThreshold &&
        ["low", "medium", "high", "critical"].includes(input.severityThreshold)
          ? input.severityThreshold
          : DEFAULT_PREFERENCES.severityThreshold,
      updatedAt: new Date().toISOString(),
    };

    if (!TIME_PATTERN.test(merged.quietHours.start) || !TIME_PATTERN.test(merged.quietHours.end)) {
      throw {
        statusCode: 400,
        message: "quietHours.start and quietHours.end must be HH:mm",
      };
    }

    if (!merged.quietHours.timezone || String(merged.quietHours.timezone).trim().length < 3) {
      throw {
        statusCode: 400,
        message: "quietHours.timezone is required when quiet hours are configured",
      };
    }

    return merged;
  }

  static async getPreferences(profileId: number): Promise<NotificationPreferenceModel> {
    const latest = await prisma.statusTransition.findFirst({
      where: {
        entityType: "NotificationPreference",
        entityId: profileId,
        toStatus: "saved",
      },
      orderBy: { createdAt: "desc" },
      select: { metadata: true, createdAt: true },
    });

    const parsed = parsePreferenceMetadata(latest?.metadata);
    const normalized = this.validateAndNormalize(profileId, parsed || undefined);
    if (latest?.createdAt) {
      normalized.updatedAt = latest.createdAt.toISOString();
    }
    return normalized;
  }

  static async updatePreferences(
    profileId: number,
    input: NotificationPreferenceInput,
    auth: AuthContext
  ) {
    const current = await this.getPreferences(profileId);
    const merged = this.validateAndNormalize(profileId, {
      ...current,
      channels: { ...current.channels, ...(input.channels || {}) },
      quietHours: { ...current.quietHours, ...(input.quietHours || {}) },
      digestMode: input.digestMode ?? current.digestMode,
      severityThreshold: input.severityThreshold ?? current.severityThreshold,
    });

    await prisma.statusTransition.create({
      data: {
        entityType: "NotificationPreference",
        entityId: profileId,
        fromStatus: "saved",
        toStatus: "saved",
        changedByProfileId: auth.profileId || null,
        reason: "preferences_updated",
        metadata: {
          preference: merged,
          updatedByUserId: auth.userId,
          updatedByProfileId: auth.profileId,
        } as any,
      },
    });

    return merged;
  }

  static async getDeliveryDecision(
    profileId: number,
    priority: NotificationPriority
  ): Promise<{ allowInApp: boolean; deferUntil?: Date; reason?: string; preference: NotificationPreferenceModel }> {
    const preference = await this.getPreferences(profileId);

    if (!preference.channels.inApp) {
      return {
        allowInApp: false,
        reason: "channel_disabled",
        preference,
      };
    }

    if (PRIORITY_RANK[priority] < PRIORITY_RANK[preference.severityThreshold]) {
      return {
        allowInApp: false,
        reason: "below_severity_threshold",
        preference,
      };
    }

    if (!preference.quietHours.enabled || priority === "critical") {
      return { allowInApp: true, preference };
    }

    let currentMinutes: number;
    try {
      currentMinutes = currentMinutesForTimezone(preference.quietHours.timezone);
    } catch {
      return { allowInApp: true, preference };
    }

    const quietStart = toMinutes(preference.quietHours.start);
    const quietEnd = toMinutes(preference.quietHours.end);
    const crossesMidnight = quietStart > quietEnd;
    const inQuietWindow = crossesMidnight
      ? currentMinutes >= quietStart || currentMinutes < quietEnd
      : currentMinutes >= quietStart && currentMinutes < quietEnd;

    if (!inQuietWindow) {
      return { allowInApp: true, preference };
    }

    const minutesUntilEnd =
      currentMinutes < quietEnd ? quietEnd - currentMinutes : 24 * 60 - currentMinutes + quietEnd;
    const deferUntil = new Date(Date.now() + minutesUntilEnd * 60 * 1000);

    return {
      allowInApp: true,
      deferUntil,
      reason: "quiet_hours_deferred",
      preference,
    };
  }
}
