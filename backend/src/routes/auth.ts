// This file defines the authentication routes for the application, including user registration, login, logout, token refresh, and password setup. It implements an onboarding flow for new users, allowing HR to create accounts with temporary passwords and send onboarding emails. The routes also handle access token generation, session management, and enforce security measures such as checking for inactive accounts and expired temporary passwords. By providing these endpoints, we enable secure authentication and onboarding processes for users of the application. The routes are protected with appropriate middleware to ensure that only authorized users can perform certain actions, such as onboarding new users. Additionally, the implementation includes error handling to provide meaningful responses in case of issues during authentication or onboarding. Overall, this file serves as the central point for managing user authentication and onboarding-related functionality in the backend API.

import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { Prisma } from "@prisma/client";
import prisma from "../prisma";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { requireModuleAccess } from "../middleware/requireModuleAccess";
import { buildModuleAccessMatrix } from "../services/moduleAccess.service";
import { sendOnboardingEmail } from "../services/onboardingEmail.service";
import { sendEmail } from "../services/emailService";
import { getJwtSecret } from "../config/jwt";
import { ensureOnboardingProvisioning } from "../services/onboardingProvisioning.service";
import {
  resolvePreferredHomeViewKey,
  resolveViewAccessKeysForRoleEntries,
} from "../services/viewAccess.service";
import {
  CANONICAL_ROLES,
  type CanonicalRole,
  canonicalizeRoleName,
  canonicalizeRoles,
  normalizeRoleName,
  resolveCanonicalRole,
} from "../auth/canonicalRoles";

const router = Router();

const ONBOARDING_MARKER_PREFIX = "onboarding";
const TEMP_PASSWORD_VALID_HOURS = Number(process.env.TEMP_PASSWORD_VALID_HOURS || 12);
const SETUP_TOKEN_VALID_MINUTES = Number(process.env.SETUP_TOKEN_VALID_MINUTES || 15);
const MIN_PASSWORD_LENGTH = 8;
const ACCESS_TOKEN_VALID_HOURS = Math.max(
  1,
  Number(process.env.ACCESS_TOKEN_VALID_HOURS || 12)
);
const SESSION_VALID_DAYS = Math.max(1, Number(process.env.SESSION_VALID_DAYS || 7));

type PasswordSetupTokenPayload = {
  userId?: number;
  email?: string;
  purpose?: string;
  iat?: number;
  exp?: number;
};

type AccessTokenPayload = {
  userId?: number | string;
  sub?: number | string;
  email?: string;
  authRoles?: CanonicalRole[];
  sessionToken?: string;
  profileId?: number;
  iat?: number;
  exp?: number;
};

const parsePositiveInt = (value: unknown): number | null => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

const parseDateValue = (value: unknown): Date | null => {
  if (!value) return null;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const resolveEmployeeStatus = (value: unknown): "active" | "inactive" | "separated" => {
  const normalized = String(value || "active").toLowerCase().trim();
  if (normalized === "inactive" || normalized === "on_leave") return "inactive";
  if (normalized === "separated" || normalized === "terminated") return "separated";
  return "active";
};

//Creating the temporary password to the user
const createTemporaryPassword = () => {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const numbers = "23456789";
  const symbols = "!@#$%&*";
  const all = upper + lower + numbers + symbols;

  const pick = (chars: string) => chars[Math.floor(Math.random() * chars.length)];

  const chars = [
    pick(upper),
    pick(lower),
    pick(numbers),
    pick(symbols),
    ...Array.from({ length: 8 }, () => pick(all)),
  ];

  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join("");
};

const buildOnboardingMarker = (expiresAt: Date) =>
  `${ONBOARDING_MARKER_PREFIX}:${expiresAt.getTime()}:${crypto.randomBytes(8).toString("hex")}`;

const parseOnboardingMarker = (value: string | null | undefined): { expiresAt: Date } | null => {
  if (!value) return null;
  const [prefix, expiresAtRaw] = value.split(":");
  if (prefix !== ONBOARDING_MARKER_PREFIX || !expiresAtRaw) return null;

  const expiresAtMs = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAtMs)) return null;

  const expiresAt = new Date(expiresAtMs);
  if (Number.isNaN(expiresAt.getTime())) return null;
  return { expiresAt };
};

const isExpired = (date: Date) => date.getTime() < Date.now();

const createPasswordSetupToken = (userId: number, email: string) =>
  jwt.sign(
    {
      userId,
      email,
      purpose: "password_setup",
    },
    getJwtSecret(),
    { expiresIn: `${SETUP_TOKEN_VALID_MINUTES}m` }
  );

const createSessionToken = () => crypto.randomBytes(32).toString("hex");

const createSession = async (userId: number) => {
  const token = createSessionToken();
  const expiresAt = new Date(
    Date.now() + SESSION_VALID_DAYS * 24 * 60 * 60 * 1000
  );

  await prisma.session.create({
    data: {
      userId,
      token,
      expiresAt,
    },
  });

  return { token, expiresAt };
};

const revokeSession = async (sessionToken?: string) => {
  if (!sessionToken) return;
  await prisma.session.updateMany({
    where: {
      token: sessionToken,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });
};

const resolveUserRoleAssignments = (user: any) => {
  const activeRoleEntries = (user.roles || []).filter((entry: any) => entry.role?.isActive);
  const overrideRoleName = `user_override_${user.id}`.toLowerCase();
  const overrideEntry = activeRoleEntries.find(
    (entry: any) => normalizeRoleName(entry.role?.name) === overrideRoleName
  );
  const effectiveRoleEntries = overrideEntry ? [overrideEntry] : activeRoleEntries;
  const authRoles = canonicalizeRoles(
    activeRoleEntries
      .map((entry: any) => entry.role.name)
      .filter((roleName: string) => normalizeRoleName(roleName) !== overrideRoleName)
  );

  return {
    activeRoleEntries,
    effectiveRoleEntries,
    authRoles,
  };
};

const buildAuthSnapshot = (user: any) => {
  const { authRoles, effectiveRoleEntries } = resolveUserRoleAssignments(user);

  const rolePolicies = effectiveRoleEntries.map((entry: any) => ({
    roleName: canonicalizeRoleName(entry.role.name),
    permissionKeys: entry.role.permissions.map(
      (permissionEntry: any) => permissionEntry.permission.key
    ),
  }));
  const moduleAccess = buildModuleAccessMatrix({
    rolePolicies,
  });
  const jobRole = user.profile?.role
    ? {
        id: user.profile.role.id,
        name: user.profile.role.name,
        billingRate: user.profile.role.billingRate,
        defaultAccess: user.profile.role.defaultAccess,
      }
    : null;

  return { authRoles, moduleAccess, jobRole };
};

const buildAuthUserPayload = (user: any) => {
  const { authRoles, effectiveRoleEntries } = resolveUserRoleAssignments(user);
  const { moduleAccess, jobRole } = buildAuthSnapshot(user);
  const viewAccessKeys = resolveViewAccessKeysForRoleEntries(
    effectiveRoleEntries,
    authRoles
  );
  const allowedModuleActions = Array.isArray(moduleAccess?.reports)
    ? moduleAccess.reports.map((action: unknown) => String(action).toLowerCase())
    : [];
  const shouldExposeReportsWorkspace =
    authRoles.some((role) =>
      ["hr", "gmp", "partner", "manager", "employee"].includes(role)
    ) &&
    (
      allowedModuleActions.includes("admin") ||
      allowedModuleActions.includes("read") ||
      allowedModuleActions.includes("write") ||
      allowedModuleActions.includes("approve")
    );
  const effectiveViewAccessKeys = shouldExposeReportsWorkspace
    ? Array.from(new Set([...viewAccessKeys, "reports.workspace"]))
    : viewAccessKeys;
  const homeViewKey = resolvePreferredHomeViewKey(authRoles, effectiveViewAccessKeys);

  return {
    id: user.id,
    email: user.email,
    name: user.profile
      ? `${user.profile.firstName} ${user.profile.lastName}`.trim()
      : undefined,
    roles: authRoles,
    authRoles,
    moduleAccess,
    viewAccessKeys: effectiveViewAccessKeys,
    homeViewKey,
    jobRole,
    profile: user.profile ?? null,
    isPartner: authRoles.includes("partner") || !!user.profile?.isPartner,
    is_partner: authRoles.includes("partner") || !!user.profile?.isPartner,
  };
};

const isUserBlockedFromLogin = (user: any) => {
  if (!user?.isActive) return true;
  const profileStatus = String(user?.profile?.status || "").toLowerCase();
  return profileStatus === "inactive" || profileStatus === "separated";
};

const loadAuthUser = async (email: string) =>
  prisma.user.findUnique({
    where: { email },
    include: {
      roles: {
        include: {
          role: {
            include: {
              permissions: {
                include: {
                  permission: {
                    select: { key: true },
                  },
                },
              },
              viewPermissions: {
                include: {
                  viewPermission: {
                    select: { key: true },
                  },
                },
              },
            },
          },
        },
      },
      profile: { include: { role: true, department: true } },
    },
  });

const buildAccessToken = (
  user: any,
  authRoles: CanonicalRole[],
  sessionToken?: string
) =>
  jwt.sign(
    {
      userId: user.id,
      sub: user.id,
      email: user.email,
      profileId: user.profile?.id,
      authRoles,
      sessionToken,
    },
    getJwtSecret(),
    { expiresIn: `${ACCESS_TOKEN_VALID_HOURS}h` }
  );

const getBearerToken = (headerValue?: string | null) => {
  if (!headerValue?.startsWith("Bearer ")) return null;
  const token = headerValue.substring(7).trim();
  return token || null;
};

const canOnboardUsers = [
  authMiddleware,
  requireModuleAccess("users", "admin"),
] as const;


const onboardUser = async (req: AuthRequest, res: any) => {
  const {
    email,
    first_name,
    last_name,
    firstName,
    lastName,
    phone,
    position,
    department_id,
    departmentId,
    manager_id,
    managerId,
    hire_date,
    hireDate,
    status,
    role_id,
    roleId,
    positionRoleId,
    authRole,
  } = req.body || {};

  if (!email) return res.status(400).json({ error: "Email is required" });

  const resolvedFirstName = String(firstName || first_name || "").trim();
  const resolvedLastName = String(lastName || last_name || "").trim();
  if (!resolvedFirstName || !resolvedLastName) {
    return res.status(400).json({ error: "first_name and last_name are required" });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const normalizedAccessRole = normalizeRoleName(authRole);
  if (!normalizedAccessRole) {
    return res.status(400).json({ error: "authRole is required" });
  }
  const canonicalAccessRole = resolveCanonicalRole(normalizedAccessRole);
  if (!canonicalAccessRole) {
    return res.status(400).json({
      error: `Invalid authRole '${normalizedAccessRole}'. Expected one of: ${CANONICAL_ROLES.join(
        ", "
      )}`,
    });
  }

  try {
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existingUser) {
      return res.status(409).json({ error: "Email already in use" });
    }

    const accessRoleRecord = await prisma.authRole.findFirst({
      where: {
        name: canonicalAccessRole,
        isActive: true,
      },
      select: { id: true, name: true },
    });
    if (!accessRoleRecord) {
      return res.status(400).json({ error: `Invalid authRole '${canonicalAccessRole}'` });
    }

    const resolvedRoleId = parsePositiveInt(positionRoleId ?? roleId ?? role_id);
    if (resolvedRoleId) {
      const billingRole = await prisma.positionRole.findUnique({
        where: { id: resolvedRoleId },
        select: { id: true, isActive: true },
      });
      if (!billingRole || !billingRole.isActive) {
        return res.status(400).json({ error: "Selected billing role is invalid or inactive" });
      }
    }

    const resolvedDepartmentId = parsePositiveInt(departmentId ?? department_id);
    const resolvedManagerId = parsePositiveInt(managerId ?? manager_id);
    const resolvedHireDate = parseDateValue(hireDate ?? hire_date);
    const resolvedStatus = resolveEmployeeStatus(status);
    const resolvedPosition = String(position || "").trim() || null;
    const resolvedPhone = String(phone || "").trim() || null;

    const temporaryPassword = createTemporaryPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, 10);
    const tempPasswordExpiry = new Date(
      Date.now() + TEMP_PASSWORD_VALID_HOURS * 60 * 60 * 1000
    );
    const onboardingMarker = buildOnboardingMarker(tempPasswordExpiry);

    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          password: passwordHash,
          isActive: true,
          isVerified: false,
          resetToken: onboardingMarker,
        },
      });

      const profile = await tx.profile.create({
        data: {
          userId: user.id,
          firstName: resolvedFirstName,
          lastName: resolvedLastName,
          phoneNumber: resolvedPhone,
          positionTitle: resolvedPosition,
          status: resolvedStatus,
          roleId: resolvedRoleId || undefined,
          departmentId: resolvedDepartmentId || undefined,
          managerId: resolvedManagerId || undefined,
          hireDate: resolvedHireDate || undefined,
          onboardingStatus: "pending",
        },
      });

      await tx.userAuthRole.create({
        data: {
          userId: user.id,
          roleId: accessRoleRecord.id,
        },
      });

      const provisioning = await ensureOnboardingProvisioning(
        {
          profileId: profile.id,
          hrOwnerProfileId: req.user?.profileId ?? null,
          assignedByProfileId: req.user?.profileId ?? null,
          startDate: new Date(),
          notes: "Created during HR onboarding flow.",
        },
        { tx }
      );

      return { user, profile, provisioning };
    });

    const frontendUrl = process.env.FRONTEND_URL || process.env.APP_URL || "http://localhost:8080";
    const loginUrl = `${frontendUrl.replace(/\/$/, "")}/auth`;

    const emailResult = await sendOnboardingEmail({
      to: normalizedEmail,
      fullName: `${resolvedFirstName} ${resolvedLastName}`.trim(),
      temporaryPassword,
      loginUrl,
      expiresAt: tempPasswordExpiry,
    });

    const responsePayload: Record<string, unknown> = {
      message: "User onboarded successfully",
      user: {
        id: created.user.id,
        email: created.user.email,
        profileId: created.profile.id,
        authRole: accessRoleRecord.name,
        onboardingCaseId: created.provisioning.onboardingCaseId,
        checklistId: created.provisioning.checklistId,
      },
      onboarding: {
        onboardingCaseId: created.provisioning.onboardingCaseId,
        checklistId: created.provisioning.checklistId,
      },
      emailDelivery: emailResult.delivered ? "sent" : "not_sent",
      temporaryPasswordExpiresAt: tempPasswordExpiry.toISOString(),
    };

    if (!emailResult.delivered) {
      responsePayload.emailDeliveryReason = emailResult.reason || "unknown";
    }

    return res.status(201).json(responsePayload);
  } catch (err: any) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return res.status(409).json({ error: "Email already in use" });
    }
    console.error("Onboard user error:", err);
    return res.status(500).json({ error: "Failed to onboard user" });
  }
};

router.post("/register", ...canOnboardUsers, onboardUser);
router.post("/onboard-user", ...canOnboardUsers, onboardUser);

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "Email and password required" });
  try {
    let user = await loadAuthUser(String(email).trim().toLowerCase());
    if (!user || !user.password)
      return res.status(401).json({ error: "Invalid credentials" });
    if (isUserBlockedFromLogin(user)) {
      return res.status(403).json({
        error: "Account is inactive. Contact HR to reactivate your account.",
      });
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    const onboardingState = parseOnboardingMarker(user.resetToken);
    if (onboardingState) {
      if (isExpired(onboardingState.expiresAt)) {
        return res.status(401).json({
          error: "Temporary password expired. Contact HR for a new onboarding invite.",
          code: "TEMP_PASSWORD_EXPIRED",
        });
      }

      const setupToken = createPasswordSetupToken(user.id, user.email);
      return res.json({
        requiresPasswordChange: true,
        setupToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.profile
            ? `${user.profile.firstName} ${user.profile.lastName}`.trim()
            : user.email,
        },
      });
    }

    const profileNeedsProvisioning =
      !!user.profile &&
      (String(user.profile.onboardingStatus || "").toLowerCase() !== "completed" ||
        !user.profile.onboardingChecklistCompleted ||
        !user.profile.inductionCompleted);

    if (profileNeedsProvisioning && user.profile?.id) {
      await ensureOnboardingProvisioning({
        profileId: user.profile.id,
      });
      const refreshedUser = await loadAuthUser(user.email);
      if (refreshedUser) user = refreshedUser;
    }

    const { authRoles } = buildAuthSnapshot(user);
    const session = await createSession(user.id);
    const token = buildAccessToken(user, authRoles, session.token);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLogin: new Date(),
        isVerified: true,
      },
    });

    res.json({
      token,
      sessionExpiresAt: session.expiresAt.toISOString(),
      user: buildAuthUserPayload(user),
    });
  } catch (err: any) {
    console.error("Login error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/logout", authMiddleware, async (req: AuthRequest, res) => {
  try {
    await revokeSession(req.user?.sessionToken);
    return res.json({ success: true, message: "Logged out" });
  } catch (error) {
    console.error("Logout error:", error);
    return res.status(500).json({ error: "Failed to logout cleanly" });
  }
});

router.post("/refresh", async (req, res) => {
  const authorizationToken = getBearerToken(req.headers.authorization);
  const providedToken =
    authorizationToken || String(req.body?.token || "").trim() || null;

  if (!providedToken) {
    return res.status(400).json({ error: "Refresh token is required" });
  }

  try {
    const verifiedPayload = jwt.verify(providedToken, getJwtSecret(), {
      ignoreExpiration: true,
    });

    if (!verifiedPayload || typeof verifiedPayload === "string") {
      return res.status(401).json({ error: "Invalid refresh token" });
    }

    const decoded = verifiedPayload as AccessTokenPayload;

    if ((decoded as any).purpose) {
      return res.status(401).json({ error: "Invalid refresh token" });
    }

    const userId = parsePositiveInt(decoded.userId ?? decoded.sub);
    const email = String(decoded.email || "").toLowerCase();
    const sessionToken = String(decoded.sessionToken || "");

    if (!userId || !email || !sessionToken) {
      return res.status(401).json({ error: "Invalid refresh token" });
    }

    const session = await prisma.session.findFirst({
      where: {
        token: sessionToken,
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true, expiresAt: true },
    });

    if (!session) {
      return res.status(401).json({ error: "Session expired. Please sign in again." });
    }

    const user = await loadAuthUser(email);
    if (!user || user.id !== userId) {
      return res.status(401).json({ error: "Invalid refresh token" });
    }

    if (isUserBlockedFromLogin(user)) {
      return res.status(403).json({
        error: "Account is inactive. Contact HR to reactivate your account.",
      });
    }

    const { authRoles } = buildAuthSnapshot(user);
    const token = buildAccessToken(user, authRoles, sessionToken);

    return res.json({
      token,
      sessionExpiresAt: session.expiresAt.toISOString(),
      user: buildAuthUserPayload(user),
    });
  } catch (error) {
    return res.status(401).json({ error: "Invalid refresh token" });
  }
});

router.post("/set-password", async (req, res) => {
  const { setupToken, newPassword } = req.body || {};
  if (!setupToken || !newPassword) {
    return res.status(400).json({ error: "setupToken and newPassword are required" });
  }
  if (String(newPassword).length < MIN_PASSWORD_LENGTH) {
    return res
      .status(400)
      .json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }

  try {
    const decoded = jwt.verify(
      String(setupToken),
      getJwtSecret()
    ) as PasswordSetupTokenPayload;

    if (decoded.purpose !== "password_setup" || !decoded.userId || !decoded.email) {
      return res.status(401).json({ error: "Invalid setup token" });
    }

    const user = await loadAuthUser(decoded.email.toLowerCase());
    if (!user || user.id !== decoded.userId || !user.password) {
      return res.status(401).json({ error: "Invalid setup token" });
    }
    if (isUserBlockedFromLogin(user)) {
      return res.status(403).json({
        error: "Account is inactive. Contact HR to reactivate your account.",
      });
    }

    const onboardingState = parseOnboardingMarker(user.resetToken);
    if (!onboardingState) {
      return res.status(400).json({ error: "Password setup is not required for this account" });
    }
    if (isExpired(onboardingState.expiresAt)) {
      return res.status(401).json({
        error: "Temporary password expired. Contact HR for a new onboarding invite.",
        code: "TEMP_PASSWORD_EXPIRED",
      });
    }

    const sameAsCurrent = await bcrypt.compare(String(newPassword), user.password);
    if (sameAsCurrent) {
      return res
        .status(400)
        .json({ error: "New password must be different from your temporary password" });
    }

    const hashedPassword = await bcrypt.hash(String(newPassword), 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetToken: null,
        isVerified: true,
        lastLogin: new Date(),
      },
    });

    const refreshedUser = await loadAuthUser(user.email);
    if (!refreshedUser) {
      return res.status(500).json({ error: "Failed to complete password setup" });
    }

    const { authRoles } = buildAuthSnapshot(refreshedUser);
    const session = await createSession(refreshedUser.id);
    const token = buildAccessToken(refreshedUser, authRoles, session.token);

    res.json({
      token,
      sessionExpiresAt: session.expiresAt.toISOString(),
      user: buildAuthUserPayload(refreshedUser),
    });
  } catch (error: any) {
    if (error?.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Setup token expired" });
    }
    return res.status(401).json({ error: "Invalid setup token" });
  }
});

router.get("/test-email", async (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(404).json({ error: "Not found" });
  }

  const recipient =
    String(req.query.to || "").trim() || String(process.env.SMTP_TEST_TO || "").trim();
  if (!recipient) {
    return res.status(400).json({
      error: "Recipient is required. Use ?to=email@example.com or set SMTP_TEST_TO in .env",
    });
  }

  try {
    await sendEmail(
      recipient,
      "SMTP Test Email",
      "Email sending works!",
      "<p>Email sending works!</p>"
    );
    return res.json({
      success: true,
      message: `Email sent to ${recipient}`,
      smtpHost: process.env.SMTP_HOST || "smtp.gmail.com",
    });
  } catch (error: any) {
    console.error("SMTP test email failed:", error);
    return res.status(500).json({
      success: false,
      error: "Email failed.",
      details: error?.message || "unknown_error",
    });
  }
});

router.get("/debug-me", authMiddleware, async (req: AuthRequest, res) => {
  const userId = req.user?.userId;
  const requesterEmail = req.user?.email;
  if (!userId || !requesterEmail) return res.status(401).json({ error: "Unauthorized" });

  try {
    const user = await loadAuthUser(requesterEmail);
    if (!user) return res.status(404).json({ error: "Not found" });

    res.json({
      jwt_payload: req.user,
      database_user: {
        id: user.id,
        email: user.email,
        name: user.profile
          ? `${user.profile.firstName} ${user.profile.lastName}`.trim()
          : undefined,
        roles_in_db: user.roles.map((r: any) => r.role.name),
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/me", authMiddleware, async (req: AuthRequest, res) => {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: {
                    permission: {
                      select: { key: true },
                    },
                  },
                },
                viewPermissions: {
                  include: {
                    viewPermission: {
                      select: { key: true },
                    },
                  },
                },
              },
            },
          },
        },
        profile: { include: { role: true, department: true } },
      },
    });
    if (!user) return res.status(404).json({ error: "Not found" });

    let partner = null;
    if (user.profile) {
      partner = await prisma.partner.findUnique({
        where: { profileId: user.profile.id },
        include: { company: true },
      });
    }

    const payload = buildAuthUserPayload(user);

    res.json({
      ...payload,
      profileId: user.profile?.id,
      profile_id: user.profile?.id,
      partner: partner
        ? {
            id: partner.id,
            profileId: partner.profileId,
            profile_id: partner.profileId,
            companyName: partner.company?.companyName,
            company_name: partner.company?.companyName,
            commissionRate: partner.commissionRate,
            commission_rate: partner.commissionRate,
            performanceThreshold: partner.performanceThreshold,
            performance_threshold: partner.performanceThreshold,
          }
        : null,
    });
  } catch (err: any) {
    console.error("Get user error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
