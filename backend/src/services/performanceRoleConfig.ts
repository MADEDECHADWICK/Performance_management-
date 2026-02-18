export type PerformanceRoleKey =
  | "group_managing_partner"
  | "partner"
  | "manager"
  | "marketing"
  | "business_development"
  | "senior"
  | "semi_senior"
  | "associate"
  | "intern";

export type JobScope = "assigned" | "managed" | "partnered";

export interface RolePerformanceConfig {
  role: PerformanceRoleKey;
  jobScope: JobScope;
  financial: {
    revenue: number;
    profit: number;
    bd: number;
  };
  efficiency: {
    utilization: number;
    jobCompletion: number;
    timeToDelivery: number;
  };
}

const roleConfigs: Record<PerformanceRoleKey, RolePerformanceConfig> = {
  group_managing_partner: {
    role: "group_managing_partner",
    jobScope: "partnered",
    financial: { revenue: 0.4, profit: 0.3, bd: 0.3 },
    efficiency: { utilization: 0, jobCompletion: 0.5, timeToDelivery: 0.5 },
  },
  partner: {
    role: "partner",
    jobScope: "partnered",
    financial: { revenue: 0.4, profit: 0.3, bd: 0.3 },
    efficiency: { utilization: 0, jobCompletion: 0.5, timeToDelivery: 0.5 },
  },
  manager: {
    role: "manager",
    jobScope: "managed",
    financial: { revenue: 0.4, profit: 0.3, bd: 0.3 },
    efficiency: { utilization: 0.2, jobCompletion: 0.4, timeToDelivery: 0.4 },
  },
  marketing: {
    role: "marketing",
    jobScope: "assigned",
    financial: { revenue: 0.7, profit: 0, bd: 0.3 },
    // Marketing/BD efficiency is captured outside job-hours timing.
    // Keep this neutral so missing job-timing signals do not unfairly penalize.
    efficiency: { utilization: 0, jobCompletion: 0, timeToDelivery: 0 },
  },
  business_development: {
    role: "business_development",
    jobScope: "assigned",
    financial: { revenue: 0.7, profit: 0, bd: 0.3 },
    efficiency: { utilization: 0, jobCompletion: 0, timeToDelivery: 0 },
  },
  senior: {
    role: "senior",
    jobScope: "assigned",
    financial: { revenue: 0.6, profit: 0.4, bd: 0 },
    efficiency: { utilization: 0.4, jobCompletion: 0.3, timeToDelivery: 0.3 },
  },
  semi_senior: {
    role: "semi_senior",
    jobScope: "assigned",
    financial: { revenue: 0.6, profit: 0.4, bd: 0 },
    efficiency: { utilization: 0.4, jobCompletion: 0.3, timeToDelivery: 0.3 },
  },
  associate: {
    role: "associate",
    jobScope: "assigned",
    financial: { revenue: 0.6, profit: 0.4, bd: 0 },
    efficiency: { utilization: 0.4, jobCompletion: 0.3, timeToDelivery: 0.3 },
  },
  intern: {
    role: "intern",
    jobScope: "assigned",
    financial: { revenue: 0.6, profit: 0.4, bd: 0 },
    efficiency: { utilization: 0.4, jobCompletion: 0.3, timeToDelivery: 0.3 },
  },
};

const normalizeRoleKey = (value: string | null | undefined): PerformanceRoleKey | null => {
  if (!value) return null;
  const normalized = value.trim().toLowerCase().replace(/\s+/g, "_");
  const aliases: Record<string, PerformanceRoleKey> = {
    gmp: "group_managing_partner",
    group_managing_partner: "group_managing_partner",
    marketing_manager: "marketing",
    business_development_manager: "business_development",
    business_development: "business_development",
    business_development_executive: "business_development",
  };
  if (normalized in roleConfigs) {
    return normalized as PerformanceRoleKey;
  }
  if (aliases[normalized]) {
    return aliases[normalized];
  }
  if (normalized.includes("business_development")) {
    return "business_development";
  }
  if (normalized.includes("marketing")) {
    return "marketing";
  }
  return null;
};

export const resolveRoleConfig = (profile: {
  role?: { name?: string | null } | null;
  positionTitle?: string | null;
}): RolePerformanceConfig => {
  const roleFromRole = normalizeRoleKey(profile.role?.name ?? undefined);
  if (roleFromRole) return roleConfigs[roleFromRole];
  const roleFromTitle = normalizeRoleKey(profile.positionTitle ?? undefined);
  if (roleFromTitle) return roleConfigs[roleFromTitle];
  return roleConfigs.associate;
};

export const normalizeWeights = (weights: Record<string, number>) => {
  const total = Object.values(weights).reduce((sum, value) => sum + (value || 0), 0);
  if (total <= 0) {
    return { total: 0 };
  }
  const normalized: Record<string, number> = {};
  Object.entries(weights).forEach(([key, value]) => {
    normalized[key] = (value || 0) / total;
  });
  return { total, ...normalized };
};
