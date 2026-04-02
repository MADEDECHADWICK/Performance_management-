/**
 * WebSocket Service
 *
 * Security and reliability improvements:
 * - JWT authentication and DB-backed claim resolution
 * - Session-token revocation/expiry validation
 * - Server-side room authorization only
 * - Per-IP and per-user rate limiting
 * - Notification sequence IDs + ACK + replay on reconnect
 */

import { Server as SocketIOServer, Socket } from "socket.io";
import { Server as HTTPServer } from "http";
import jwt from "jsonwebtoken";
import prisma from "../prisma";
import { getJwtSecret } from "../config/jwt";
import { buildCorsOptions } from "../config/httpSecurity";
import { logger, toLogContext } from "../lib/logger";

type NotificationPayload = Record<string, unknown>;

interface BudgetAlert {
  jobId: string;
  departmentId: string;
  utilization: number;
  threshold: number;
  message: string;
  severity: "warning" | "critical";
}

interface EvaluationUpdate {
  evaluationId: string;
  employeeId: string;
  status: string;
  message: string;
}

interface StaffingChange {
  jobId: string;
  employeeId: string;
  allocationPercentage: number;
  action: "allocated" | "updated" | "removed";
}

interface AccessTokenPayload {
  userId?: number | string;
  sub?: number | string;
  email?: string;
  authRoles?: string[];
  sessionToken?: string;
  iat?: number;
  exp?: number;
}

interface SocketUserContext {
  userId: number;
  profileId: number;
  email: string;
  roles: string[];
  departmentId: number | null;
  sessionToken?: string;
  ipAddress: string;
}

type SequencedNotification = {
  sequenceId: number;
  payload: NotificationPayload;
  createdAt: string;
};

const SOCKET_RATE_LIMITS = {
  connectPerIpPerMinute: 25,
  subscribePerUserPerMinute: 80,
  actionPerUserPerMinute: 160,
};

const SOCKET_REPLAY_BACKLOG_LIMIT = 300;
const SOCKET_SESSION_REVALIDATION_MS = 60_000;

const normalizeRole = (role: string) =>
  String(role || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

const toPositiveInt = (value: unknown): number | null => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.trunc(parsed);
};

class WebSocketService {
  private io: SocketIOServer | null = null;
  private connectedUsers: Map<string, SocketUserContext> = new Map();
  private sessionCheckTimers: Map<string, NodeJS.Timeout> = new Map();

  private connectAttemptsByIp: Map<string, number[]> = new Map();
  private subscribeAttemptsByUser: Map<string, number[]> = new Map();
  private actionAttemptsByUser: Map<string, number[]> = new Map();

  private sequenceByProfile: Map<string, number> = new Map();
  private replayBufferByProfile: Map<string, SequencedNotification[]> = new Map();
  private lastAckByProfile: Map<string, number> = new Map();

  private metrics = {
    authFailures: 0,
    rateLimited: 0,
    delivered: 0,
    replayed: 0,
    acked: 0,
  };

  /**
   * Initialize WebSocket server
   */
  initialize(httpServer: HTTPServer) {
    this.io = new SocketIOServer(httpServer, {
      cors: buildCorsOptions(),
      transports: ["websocket", "polling"],
    });

    this.tryEnableRedisAdapter().catch((error) => {
      logger.error("socketio_redis_adapter_init_failed", toLogContext(error));
    });
    this.setupMiddleware();
    this.setupConnectionHandlers();
    return this.io;
  }

  private async tryEnableRedisAdapter() {
    if (!this.io) return;
    const redisUrl = String(process.env.REDIS_URL || "").trim();
    if (!redisUrl) return;

    try {
      // Loaded dynamically so local development does not hard-depend on redis packages.
      const { createClient } = require("redis");
      const { createAdapter } = require("@socket.io/redis-adapter");

      const pubClient = createClient({ url: redisUrl });
      const subClient = pubClient.duplicate();
      await Promise.all([pubClient.connect(), subClient.connect()]);
      this.io.adapter(createAdapter(pubClient, subClient));
      logger.info("socketio_redis_adapter_enabled");
    } catch (error) {
      logger.warn("socketio_redis_adapter_disabled", {
        redisUrlConfigured: true,
        ...toLogContext(error),
      });
    }
  }

  private consumeRateLimit(
    bucket: Map<string, number[]>,
    key: string,
    maxRequests: number,
    windowMs: number
  ) {
    const now = Date.now();
    const current = bucket.get(key) || [];
    const recent = current.filter((timestamp) => now - timestamp <= windowMs);
    if (recent.length >= maxRequests) {
      this.metrics.rateLimited += 1;
      bucket.set(key, recent);
      return false;
    }
    recent.push(now);
    bucket.set(key, recent);
    return true;
  }

  private parseAuthToken(socket: Socket): string | null {
    const authToken = socket.handshake?.auth?.token;
    if (typeof authToken === "string" && authToken.trim()) {
      return authToken.trim();
    }

    const header = socket.handshake?.headers?.authorization;
    if (typeof header === "string" && header.startsWith("Bearer ")) {
      return header.slice(7).trim();
    }

    return null;
  }

  private getClientIp(socket: Socket): string {
    const xff = socket.handshake.headers["x-forwarded-for"];
    if (typeof xff === "string" && xff.trim()) {
      return xff.split(",")[0].trim();
    }
    return socket.handshake.address || "unknown";
  }

  private async resolveSocketUser(socket: Socket): Promise<SocketUserContext> {
    const token = this.parseAuthToken(socket);
    if (!token) {
      throw new Error("Authentication failed: missing token");
    }

    const verifiedPayload = jwt.verify(token, getJwtSecret());
    if (!verifiedPayload || typeof verifiedPayload === "string") {
      throw new Error("Authentication failed: invalid token payload");
    }

    const decoded = verifiedPayload as AccessTokenPayload;
    const userId = toPositiveInt(decoded.userId ?? decoded.sub);
    if (!userId) {
      throw new Error("Authentication failed: invalid token payload");
    }

    if (decoded.sessionToken) {
      const activeSession = await prisma.session.findFirst({
        where: {
          token: decoded.sessionToken,
          userId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        select: { id: true },
      });
      if (!activeSession) {
        throw new Error("Authentication failed: session expired");
      }
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: {
          select: {
            id: true,
            status: true,
            departmentId: true,
          },
        },
        roles: {
          include: {
            role: {
              select: {
                name: true,
                isActive: true,
              },
            },
          },
        },
      },
    });

    if (!user || !user.isActive || !user.profile) {
      throw new Error("Authentication failed: inactive account");
    }

    const profileStatus = String(user.profile.status || "").toLowerCase();
    if (profileStatus === "inactive" || profileStatus === "separated") {
      throw new Error("Authentication failed: profile inactive");
    }

    const roles = user.roles
      .filter((entry) => entry.role.isActive)
      .map((entry) => normalizeRole(entry.role.name))
      .filter(Boolean);

    return {
      userId: user.id,
      profileId: user.profile.id,
      email: user.email,
      roles,
      departmentId: user.profile.departmentId ?? null,
      sessionToken: decoded.sessionToken,
      ipAddress: this.getClientIp(socket),
    };
  }

  /**
   * Setup authentication middleware
   */
  private setupMiddleware() {
    if (!this.io) return;

    this.io.use(async (socket, next) => {
      try {
        const ip = this.getClientIp(socket);
        const allowed = this.consumeRateLimit(
          this.connectAttemptsByIp,
          ip,
          SOCKET_RATE_LIMITS.connectPerIpPerMinute,
          60_000
        );
        if (!allowed) {
          return next(new Error("Rate limit exceeded for socket connect"));
        }

        const user = await this.resolveSocketUser(socket);
        socket.data.user = user;
        socket.data.lastAckSeq = 0;
        return next();
      } catch (error) {
        this.metrics.authFailures += 1;
        return next(new Error("Authentication failed"));
      }
    });
  }

  private canSubscribeToBudget(user: SocketUserContext, departmentId: number) {
    const privilegedRoles = new Set([
      "super_admin",
      "hr",
      "finance",
      "finance_manager",
      "gmp",
    ]);
    if (user.roles.some((role) => privilegedRoles.has(role))) return true;
    return user.departmentId === departmentId;
  }

  private async canSubscribeToStaffing(user: SocketUserContext, jobId: number) {
    const privilegedRoles = new Set([
      "super_admin",
      "hr",
      "gmp",
    ]);
    if (user.roles.some((role) => privilegedRoles.has(role))) return true;

    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: {
        managerProfileId: true,
        partnerProfileId: true,
        staffing: {
          where: { employeeProfileId: user.profileId },
          select: { employeeProfileId: true },
          take: 1,
        },
      },
    });

    if (!job) return false;
    if (job.managerProfileId === user.profileId) return true;
    if (job.partnerProfileId === user.profileId) return true;
    return job.staffing.length > 0;
  }

  private canSubscribeToEvaluations(user: SocketUserContext) {
    const allowed = new Set([
      "super_admin",
      "hr",
      "manager",
      "partner",
      "gmp",
      "employee",
      "associate",
      "intern",
    ]);
    return user.roles.some((role) => allowed.has(role));
  }

  private enqueueNotification(profileId: string, payload: NotificationPayload): SequencedNotification {
    const lastSeq = this.sequenceByProfile.get(profileId) || 0;
    const sequenceId = lastSeq + 1;
    this.sequenceByProfile.set(profileId, sequenceId);

    const sequenced: SequencedNotification = {
      sequenceId,
      payload,
      createdAt: new Date().toISOString(),
    };

    const queue = this.replayBufferByProfile.get(profileId) || [];
    queue.push(sequenced);
    if (queue.length > SOCKET_REPLAY_BACKLOG_LIMIT) {
      queue.splice(0, queue.length - SOCKET_REPLAY_BACKLOG_LIMIT);
    }
    this.replayBufferByProfile.set(profileId, queue);

    return sequenced;
  }

  private replayNotifications(socket: Socket, profileId: string, sinceSeq: number) {
    const queue = this.replayBufferByProfile.get(profileId) || [];
    const missed = queue.filter((entry) => entry.sequenceId > sinceSeq);
    missed.forEach((entry) => {
      socket.emit("notification", {
        ...entry.payload,
        sequenceId: entry.sequenceId,
        replay: true,
        timestamp: entry.createdAt,
      });
      this.metrics.replayed += 1;
    });
  }

  private registerSessionRevalidation(socket: Socket, user: SocketUserContext) {
    if (!user.sessionToken) return;

    const timer = setInterval(async () => {
      try {
        const activeSession = await prisma.session.findFirst({
          where: {
            token: user.sessionToken,
            userId: user.userId,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
          select: { id: true },
        });

        if (!activeSession) {
          socket.emit("auth:expired", { reason: "session_revoked_or_expired" });
          socket.disconnect(true);
        }
      } catch {
        socket.disconnect(true);
      }
    }, SOCKET_SESSION_REVALIDATION_MS);

    this.sessionCheckTimers.set(socket.id, timer);
  }

  private clearSessionRevalidation(socketId: string) {
    const timer = this.sessionCheckTimers.get(socketId);
    if (!timer) return;
    clearInterval(timer);
    this.sessionCheckTimers.delete(socketId);
  }

  private consumeUserRateLimit(
    user: SocketUserContext,
    bucket: Map<string, number[]>,
    maxRequests: number
  ) {
    return this.consumeRateLimit(
      bucket,
      String(user.userId),
      maxRequests,
      60_000
    );
  }

  /**
   * Setup connection and disconnection handlers
   */
  private setupConnectionHandlers() {
    if (!this.io) return;

    this.io.on("connection", (socket: Socket) => {
      const user = socket.data.user as SocketUserContext;
      this.connectedUsers.set(socket.id, user);
      this.registerSessionRevalidation(socket, user);

      socket.join(`user:${user.profileId}`);
      user.roles.forEach((role) => socket.join(`role:${role}`));

      if (user.roles.some((role) => ["super_admin", "hr"].includes(role))) {
        socket.join("admin:notifications");
      }

      const sinceSeq = toPositiveInt(socket.handshake.auth?.sinceSeq) || 0;
      this.replayNotifications(socket, String(user.profileId), sinceSeq);

      socket.emit("socket:ready", {
        profileId: user.profileId,
        roles: user.roles,
        sinceSeqApplied: sinceSeq,
      });

      socket.on("notification:ack", (payload: { sequenceId?: number }) => {
        if (!this.consumeUserRateLimit(user, this.actionAttemptsByUser, SOCKET_RATE_LIMITS.actionPerUserPerMinute)) {
          socket.emit("rate_limit", { scope: "action" });
          return;
        }

        const sequenceId = toPositiveInt(payload?.sequenceId);
        if (!sequenceId) return;
        const profileKey = String(user.profileId);
        const currentAck = this.lastAckByProfile.get(profileKey) || 0;
        if (sequenceId > currentAck) {
          this.lastAckByProfile.set(profileKey, sequenceId);
          const queue = this.replayBufferByProfile.get(profileKey) || [];
          const ackedEntry = queue.find((entry) => entry.sequenceId === sequenceId);
          this.replayBufferByProfile.set(
            profileKey,
            queue.filter((entry) => entry.sequenceId > sequenceId)
          );
          this.metrics.acked += 1;

          const notificationId = toPositiveInt((ackedEntry?.payload as any)?.id);
          if (notificationId) {
            void prisma.statusTransition
              .create({
                data: {
                  entityType: "NotificationDispatch",
                  entityId: notificationId,
                  fromStatus: "delivered",
                  toStatus: "acked",
                  changedByProfileId: user.profileId,
                  reason: "client_ack",
                  metadata: {
                    channel: "websocket",
                    sequenceId,
                    profileId: user.profileId,
                  } as any,
                },
              })
              .catch(() => {
                // Do not fail ack if audit logging fails.
              });
          }
        }
        socket.data.lastAckSeq = sequenceId;
      });

      socket.on("subscribe:budget-alerts", (departmentIdRaw: unknown) => {
        if (
          !this.consumeUserRateLimit(
            user,
            this.subscribeAttemptsByUser,
            SOCKET_RATE_LIMITS.subscribePerUserPerMinute
          )
        ) {
          socket.emit("rate_limit", { scope: "subscribe" });
          return;
        }

        const departmentId = toPositiveInt(departmentIdRaw);
        if (!departmentId) {
          socket.emit("subscription:error", { topic: "budget-alerts", error: "Invalid departmentId" });
          return;
        }

        if (!this.canSubscribeToBudget(user, departmentId)) {
          socket.emit("subscription:error", { topic: "budget-alerts", error: "Forbidden" });
          return;
        }

        socket.join(`budget:${departmentId}`);
        socket.emit("subscribed", { topic: "budget-alerts", departmentId });
      });

      socket.on("subscribe:evaluations", (cycleIdRaw: unknown) => {
        if (
          !this.consumeUserRateLimit(
            user,
            this.subscribeAttemptsByUser,
            SOCKET_RATE_LIMITS.subscribePerUserPerMinute
          )
        ) {
          socket.emit("rate_limit", { scope: "subscribe" });
          return;
        }

        if (!this.canSubscribeToEvaluations(user)) {
          socket.emit("subscription:error", { topic: "evaluations", error: "Forbidden" });
          return;
        }

        const cycleId = String(cycleIdRaw || "").trim();
        if (!cycleId || cycleId.length > 64) {
          socket.emit("subscription:error", { topic: "evaluations", error: "Invalid cycleId" });
          return;
        }

        socket.join(`evaluation:${cycleId}`);
        socket.emit("subscribed", { topic: "evaluations", cycleId });
      });

      socket.on("subscribe:staffing", async (jobIdRaw: unknown) => {
        if (
          !this.consumeUserRateLimit(
            user,
            this.subscribeAttemptsByUser,
            SOCKET_RATE_LIMITS.subscribePerUserPerMinute
          )
        ) {
          socket.emit("rate_limit", { scope: "subscribe" });
          return;
        }

        const jobId = toPositiveInt(jobIdRaw);
        if (!jobId) {
          socket.emit("subscription:error", { topic: "staffing", error: "Invalid jobId" });
          return;
        }

        const allowed = await this.canSubscribeToStaffing(user, jobId);
        if (!allowed) {
          socket.emit("subscription:error", { topic: "staffing", error: "Forbidden" });
          return;
        }

        socket.join(`staffing:${jobId}`);
        socket.emit("subscribed", { topic: "staffing", jobId });
      });

      socket.on("unsubscribe:budget-alerts", (departmentIdRaw: unknown) => {
        const departmentId = toPositiveInt(departmentIdRaw);
        if (!departmentId) return;
        socket.leave(`budget:${departmentId}`);
      });

      socket.on("unsubscribe:evaluations", (cycleIdRaw: unknown) => {
        const cycleId = String(cycleIdRaw || "").trim();
        if (!cycleId) return;
        socket.leave(`evaluation:${cycleId}`);
      });

      socket.on("unsubscribe:staffing", (jobIdRaw: unknown) => {
        const jobId = toPositiveInt(jobIdRaw);
        if (!jobId) return;
        socket.leave(`staffing:${jobId}`);
      });

      socket.on("disconnect", () => {
        this.connectedUsers.delete(socket.id);
        this.clearSessionRevalidation(socket.id);
      });
    });
  }

  /**
   * Get WebSocket server instance
   */
  getIO(): SocketIOServer | null {
    return this.io;
  }

  /**
   * Broadcast budget alert to department
   */
  broadcastBudgetAlert(alert: BudgetAlert) {
    if (!this.io) return;

    this.io.to(`budget:${alert.departmentId}`).emit("budget-alert", {
      jobId: alert.jobId,
      utilization: alert.utilization,
      threshold: alert.threshold,
      message: alert.message,
      severity: alert.severity,
      timestamp: new Date(),
    });

    if (alert.severity === "critical") {
      this.io.to("role:admin").emit("critical-budget-alert", alert);
      this.io.to("role:super_admin").emit("critical-budget-alert", alert);
      this.io.to("role:finance").emit("critical-budget-alert", alert);
      this.io.to("role:finance_manager").emit("critical-budget-alert", alert);
    }
  }

  /**
   * Broadcast evaluation update
   */
  broadcastEvaluationUpdate(update: EvaluationUpdate, departmentOrCycleId: string) {
    if (!this.io) return;

    this.io.to(`user:${update.employeeId}`).emit("evaluation-update", {
      evaluationId: update.evaluationId,
      status: update.status,
      message: update.message,
      timestamp: new Date(),
    });

    this.io.to(`evaluation:${departmentOrCycleId}`).emit("evaluation-status-change", {
      evaluationId: update.evaluationId,
      employeeId: update.employeeId,
      status: update.status,
      timestamp: new Date(),
    });
  }

  /**
   * Broadcast staffing change
   */
  broadcastStaffingChange(change: StaffingChange, employeeId: string) {
    if (!this.io) return;

    this.io.to(`user:${employeeId}`).emit("staffing-update", {
      jobId: change.jobId,
      action: change.action,
      allocationPercentage: change.allocationPercentage,
      message: `You have been ${change.action} on job ${change.jobId}`,
      timestamp: new Date(),
    });

    this.io.to(`staffing:${change.jobId}`).emit("job-staffing-change", change);
    this.io.to("role:manager").emit("staffing-alert", change);
  }

  /**
   * Broadcast revenue update
   */
  broadcastRevenueUpdate(jobId: string, revenue: number, departmentId: string) {
    if (!this.io) return;

    this.io.to(`budget:${departmentId}`).emit("revenue-update", {
      jobId,
      revenue,
      timestamp: new Date(),
    });

    this.io.to("role:finance").emit("revenue-recorded", {
      jobId,
      revenue,
      timestamp: new Date(),
    });
  }

  /**
   * Send notification to specific user with sequence ID.
   */
  notifyUser(profileId: string, notification: NotificationPayload): number | null {
    if (!this.io) return null;

    const sequenced = this.enqueueNotification(String(profileId), notification);
    this.metrics.delivered += 1;

    this.io.to(`user:${profileId}`).emit("notification", {
      ...notification,
      sequenceId: sequenced.sequenceId,
      timestamp: sequenced.createdAt,
    });

    const notificationId = toPositiveInt((notification as any)?.id);
    if (notificationId) {
      void prisma.statusTransition
        .create({
          data: {
            entityType: "NotificationDispatch",
            entityId: notificationId,
            fromStatus: "created",
            toStatus: "delivered",
            changedByProfileId: null,
            reason: "websocket_delivery",
            metadata: {
              channel: "websocket",
              sequenceId: sequenced.sequenceId,
              recipientProfileId: toPositiveInt(profileId),
            } as any,
          },
        })
        .catch(() => {
          // Do not fail delivery if audit logging fails.
        });
    }

    return sequenced.sequenceId;
  }

  /**
   * Emit a namespaced domain event to a specific user room.
   */
  emitToUser(profileId: string, eventName: string, payload: NotificationPayload) {
    if (!this.io) return;
    this.io.to(`user:${profileId}`).emit(eventName, {
      ...payload,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit a namespaced domain event to multiple user rooms.
   */
  emitToUsers(profileIds: Array<string | number>, eventName: string, payload: NotificationPayload) {
    if (!this.io) return;
    Array.from(new Set(profileIds.map((id) => String(id))))
      .filter(Boolean)
      .forEach((profileId) => {
        this.io?.to(`user:${profileId}`).emit(eventName, {
          ...payload,
          timestamp: new Date().toISOString(),
        });
      });
  }

  emitToRole(roleName: string, eventName: string, payload: NotificationPayload) {
    if (!this.io) return;
    const normalizedRole = normalizeRole(roleName);
    this.io.to(`role:${normalizedRole}`).emit(eventName, {
      ...payload,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Send notification to role group
   */
  notifyRole(roleName: string, notification: NotificationPayload) {
    if (!this.io) return;

    const normalizedRole = normalizeRole(roleName);
    this.io.to(`role:${normalizedRole}`).emit("notification", {
      ...notification,
      timestamp: new Date(),
    });
  }

  /**
   * Broadcast system-wide announcement
   */
  broadcastSystemAnnouncement(title: string, message: string, priority: "low" | "medium" | "high") {
    if (!this.io) return;

    this.io.emit("system-announcement", {
      title,
      message,
      priority,
      timestamp: new Date(),
    });
  }

  /**
   * Get connected users count
   */
  getConnectedUsersCount(): number {
    return this.connectedUsers.size;
  }

  /**
   * Get connected users by role
   */
  getConnectedUsersByRole(roleName: string): SocketUserContext[] {
    const normalized = normalizeRole(roleName);
    return Array.from(this.connectedUsers.values()).filter((user) =>
      user.roles.includes(normalized)
    );
  }

  /**
   * Operational visibility for socket delivery health.
   */
  getMetrics() {
    return { ...this.metrics };
  }
}

export default new WebSocketService();
