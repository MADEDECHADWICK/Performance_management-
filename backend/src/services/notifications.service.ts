/**
 * Notifications Service
 *
 * Provides:
 * - Notification CRUD and listing
 * - Standardized event payload contract
 * - Recipient policy resolution helpers
 * - Idempotent dispatch via deduplication keys
 */

import { NotificationType } from "@prisma/client";
import { prisma } from "../prisma";
import { NotificationOutboxService } from "./notificationOutbox.service";
import {
  NotificationPreferenceService,
  NotificationPreferenceInput,
} from "./notificationPreferences.service";

interface AuthContext {
  userId: number;
  profileId: number;
  roleName?: string;
}

interface ListOptions {
  page: number;
  pageSize: number;
  type?: string;
  status?: "read" | "unread";
}

export type NotificationPriority = "low" | "medium" | "high" | "critical";

export interface NotificationAction {
  id: string;
  label: string;
  endpoint: string;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
}

interface TargetEntityRef {
  type?: string;
  id?: number;
}

interface NotificationContractMetadata {
  eventType: string;
  priority: NotificationPriority;
  targetEntityType?: string;
  targetEntityId?: number;
  canonicalRoute?: string;
  actions: NotificationAction[];
  requiredPermission?: string;
  eventId?: string;
  templateLabel?: string;
  correlationId?: string;
  deduplicationKey?: string;
}

interface CreateNotificationInput {
  recipientProfileId: number;
  type: NotificationType;
  title: string;
  message: string;
  actionRequired?: boolean;
  dueDate?: Date;
  escalationLevel?: number;
  jobId?: number;
  clientId?: number;
  evaluationDefinitionId?: number;
  timeEntryId?: number;
  workflowAssignmentId?: number;
  link?: string;

  // Standardized event contract
  eventType?: string;
  priority?: NotificationPriority;
  targetEntityType?: string;
  targetEntityId?: number;
  canonicalRoute?: string;
  actions?: NotificationAction[];
  requiredPermission?: string;

  // Idempotency / tracing
  eventId?: string;
  templateLabel?: string;
  correlationId?: string;
  deduplicationKey?: string;
}

interface TemplateNotificationInput {
  recipientProfileId: number;
  label: string;
  data?: Record<string, unknown>;
  type?: NotificationType;
  title?: string;
  message?: string;
  actionRequired?: boolean;
  dueDate?: Date;
  escalationLevel?: number;
  jobId?: number;
  clientId?: number;
  evaluationDefinitionId?: number;
  timeEntryId?: number;
  workflowAssignmentId?: number;
  link?: string;

  eventType?: string;
  priority?: NotificationPriority;
  targetEntityType?: string;
  targetEntityId?: number;
  canonicalRoute?: string;
  actions?: NotificationAction[];
  requiredPermission?: string;
  eventId?: string;
  correlationId?: string;
  deduplicationKey?: string;
}

export interface RecipientRolePolicy {
  roles: string[];
  departmentId?: number | null;
  fallbackRoles?: string[];
}

export interface DispatchEventInput {
  eventType: string;
  title: string;
  message: string;
  type?: NotificationType;
  priority?: NotificationPriority;
  actionRequired?: boolean;
  dueDate?: Date;
  escalationLevel?: number;
  canonicalRoute: string;
  actions?: NotificationAction[];
  requiredPermission?: string;
  targetEntityType: string;
  targetEntityId: number;
  jobId?: number;
  clientId?: number;
  evaluationDefinitionId?: number;
  timeEntryId?: number;
  workflowAssignmentId?: number;
  ownerProfileIds?: Array<number | null | undefined>;
  recipientProfileIds?: Array<number | null | undefined>;
  rolePolicies?: RecipientRolePolicy[];
  eventId?: string;
  templateLabel?: string;
  correlationId?: string;
  deduplicationKey?: string;
}

const renderTemplateString = (template: string, data: Record<string, unknown>) =>
  template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key) => {
    const value = data[key];
    if (value === null || value === undefined) return "";
    return String(value);
  });

const normalizeRole = (role: string) =>
  String(role || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

const toPositiveInt = (value: unknown): number | undefined => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.trunc(parsed);
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  Object.prototype.toString.call(value) === "[object Object]";

const allowedHttpMethods = new Set(["GET", "POST", "PATCH", "DELETE"]);

export class NotificationService {
  private static inferPriorityFromType(type: NotificationType): NotificationPriority {
    switch (type) {
      case "escalation":
        return "critical";
      case "warning":
        return "high";
      case "action":
        return "medium";
      default:
        return "low";
    }
  }

  private static inferTargetFromLegacyFields(input: {
    targetEntityType?: string;
    targetEntityId?: number;
    jobId?: number;
    clientId?: number;
    evaluationDefinitionId?: number;
    timeEntryId?: number;
    workflowAssignmentId?: number;
  }): TargetEntityRef {
    if (input.targetEntityType && toPositiveInt(input.targetEntityId)) {
      return {
        type: input.targetEntityType,
        id: toPositiveInt(input.targetEntityId),
      };
    }
    if (toPositiveInt(input.jobId)) return { type: "Job", id: toPositiveInt(input.jobId) };
    if (toPositiveInt(input.clientId)) return { type: "Client", id: toPositiveInt(input.clientId) };
    if (toPositiveInt(input.evaluationDefinitionId)) {
      return {
        type: "EvaluationDefinition",
        id: toPositiveInt(input.evaluationDefinitionId),
      };
    }
    if (toPositiveInt(input.timeEntryId)) return { type: "TimeEntry", id: toPositiveInt(input.timeEntryId) };
    if (toPositiveInt(input.workflowAssignmentId)) {
      return {
        type: "WorkflowAssignment",
        id: toPositiveInt(input.workflowAssignmentId),
      };
    }
    return {};
  }

  private static defaultRouteForEntity(target: TargetEntityRef, fallbackLink?: string | null) {
    if (fallbackLink) return fallbackLink;
    switch (target.type) {
      case "Job":
        return target.id ? `/jobs/${target.id}` : "/jobs";
      case "Client":
        return target.id ? `/clients/${target.id}` : "/clients";
      case "EvaluationDefinition":
        return "/evaluations";
      case "TimeEntry":
        return "/timesheets";
      case "WorkflowAssignment":
        return "/todos";
      default:
        return "/notifications";
    }
  }

  private static defaultPermissionForEntity(targetEntityType?: string) {
    switch (String(targetEntityType || "").toLowerCase()) {
      case "job":
        return "module.jobs.read";
      case "client":
        return "module.clients.read";
      case "evaluationdefinition":
        return "module.evaluations.read";
      case "timeentry":
        return "module.time_entries.read";
      case "workflowassignment":
        return "module.todos.read";
      default:
        return "module.notifications.read";
    }
  }

  private static sanitizeActions(
    actions: NotificationAction[] | undefined,
    canonicalRoute: string,
    actionRequired: boolean
  ): NotificationAction[] {
    const sanitized: NotificationAction[] = [];
    (actions || []).forEach((action, index) => {
      const endpoint = String(action?.endpoint || "").trim();
      if (!endpoint) return;
      const id = String(action?.id || `action_${index + 1}`).trim();
      const label = String(action?.label || (actionRequired ? "Open" : "View")).trim();
      const method = String(action?.method || "GET").toUpperCase();
      sanitized.push({
        id,
        label,
        endpoint,
        method: allowedHttpMethods.has(method) ? (method as NotificationAction["method"]) : "GET",
      });
    });

    if (sanitized.length > 0) return sanitized;

    return [
      {
        id: "view",
        label: actionRequired ? "Review" : "View",
        endpoint: canonicalRoute,
        method: "GET",
      },
    ];
  }

  private static buildContract(input: CreateNotificationInput): NotificationContractMetadata {
    const target = this.inferTargetFromLegacyFields(input);
    const eventType =
      String(input.eventType || "").trim() ||
      (target.type ? `notification.${target.type.toLowerCase()}.${input.type}` : "notification.generic");
    const priority = input.priority ?? this.inferPriorityFromType(input.type);
    const canonicalRoute = String(
      input.canonicalRoute || this.defaultRouteForEntity(target, input.link ?? null)
    ).trim();
    const actionRequired = Boolean(input.actionRequired);
    const deduplicationKey = String(input.deduplicationKey || "").trim() || undefined;

    return {
      eventType,
      priority,
      targetEntityType: target.type,
      targetEntityId: target.id,
      canonicalRoute,
      actions: this.sanitizeActions(input.actions, canonicalRoute, actionRequired),
      requiredPermission: input.requiredPermission || this.defaultPermissionForEntity(target.type),
      eventId: input.eventId,
      templateLabel: input.templateLabel,
      correlationId: input.correlationId,
      deduplicationKey,
    };
  }

  private static async fetchDispatchMetadata(notificationIds: number[]) {
    if (!notificationIds.length) return new Map<number, NotificationContractMetadata>();

    const dispatchRows = await prisma.statusTransition.findMany({
      where: {
        entityType: "NotificationDispatch",
        entityId: { in: notificationIds },
      },
      orderBy: { createdAt: "desc" },
      select: {
        entityId: true,
        metadata: true,
      },
    });

    const byNotificationId = new Map<number, NotificationContractMetadata>();
    for (const row of dispatchRows) {
      const metadata = row.metadata;
      if (!isObject(metadata)) continue;

      const hasContractMetadata =
        Boolean(metadata.eventType) ||
        Boolean(metadata.canonicalRoute) ||
        Boolean(metadata.targetEntityType) ||
        Boolean(metadata.targetEntityId) ||
        Boolean(metadata.requiredPermission) ||
        Array.isArray(metadata.actions);
      if (!hasContractMetadata) continue;
      if (byNotificationId.has(row.entityId)) continue;

      const metadataActions: NotificationAction[] = [];
      if (Array.isArray(metadata.actions)) {
        (metadata.actions as unknown[]).forEach((action, index) => {
          if (!isObject(action)) return;
          const endpoint = String(action.endpoint || "").trim();
          if (!endpoint) return;
          const method = String(action.method || "GET").toUpperCase();
          metadataActions.push({
            id: String(action.id || `action_${index + 1}`),
            label: String(action.label || "View"),
            endpoint,
            method: allowedHttpMethods.has(method)
              ? (method as NotificationAction["method"])
              : "GET",
          });
        });
      }

      byNotificationId.set(row.entityId, {
        eventType: String(metadata.eventType || "notification.generic"),
        priority: (metadata.priority as NotificationPriority) || "low",
        targetEntityType: metadata.targetEntityType ? String(metadata.targetEntityType) : undefined,
        targetEntityId: toPositiveInt(metadata.targetEntityId),
        canonicalRoute: metadata.canonicalRoute ? String(metadata.canonicalRoute) : undefined,
        actions:
          metadataActions.length > 0
            ? metadataActions
            : [{ id: "view", label: "View", endpoint: "/notifications", method: "GET" }],
        requiredPermission: metadata.requiredPermission
          ? String(metadata.requiredPermission)
          : undefined,
        eventId: metadata.eventId ? String(metadata.eventId) : undefined,
        templateLabel: metadata.templateLabel ? String(metadata.templateLabel) : undefined,
        correlationId: metadata.correlationId ? String(metadata.correlationId) : undefined,
        deduplicationKey: metadata.deduplicationKey
          ? String(metadata.deduplicationKey)
          : undefined,
      });
    }

    return byNotificationId;
  }

  private static decorateNotification(
    notification: any,
    metadata?: NotificationContractMetadata
  ) {
    const target = this.inferTargetFromLegacyFields({
      targetEntityType: metadata?.targetEntityType,
      targetEntityId: metadata?.targetEntityId,
      jobId: notification.jobId,
      clientId: notification.clientId,
      evaluationDefinitionId: notification.evaluationDefinitionId,
      timeEntryId: notification.timeEntryId,
      workflowAssignmentId: notification.workflowAssignmentId,
    });
    const canonicalRoute =
      metadata?.canonicalRoute ||
      this.defaultRouteForEntity(target, notification.link || null);

    return {
      ...notification,
      eventType:
        metadata?.eventType ||
        (target.type
          ? `notification.${target.type.toLowerCase()}.${notification.type}`
          : "notification.generic"),
      priority: metadata?.priority || this.inferPriorityFromType(notification.type),
      targetEntityType: metadata?.targetEntityType || target.type,
      targetEntityId: metadata?.targetEntityId || target.id,
      canonicalRoute,
      actions:
        metadata?.actions ||
        this.sanitizeActions([], canonicalRoute, Boolean(notification.actionRequired)),
      requiredPermission:
        metadata?.requiredPermission || this.defaultPermissionForEntity(target.type),
      templateLabel: metadata?.templateLabel,
      eventId: metadata?.eventId,
      correlationId: metadata?.correlationId,
      deduplicationKey: metadata?.deduplicationKey,
    };
  }

  private static async decorateNotifications(notifications: any[]) {
    const ids = notifications.map((notification) => notification.id).filter((id) => id > 0);
    const metadataById = await this.fetchDispatchMetadata(ids);
    return notifications.map((notification) =>
      this.decorateNotification(notification, metadataById.get(notification.id))
    );
  }

  private static async findExistingByDedupKey(
    recipientProfileId: number,
    deduplicationKey?: string
  ) {
    if (!deduplicationKey) return null;

    const dedupeRecord = await prisma.statusTransition.findFirst({
      where: {
        entityType: "NotificationDedupe",
        entityId: recipientProfileId,
        reason: deduplicationKey,
      },
      orderBy: { createdAt: "desc" },
      select: { metadata: true },
    });

    const metadata = dedupeRecord?.metadata;
    if (!isObject(metadata)) return null;

    const existingNotificationId = toPositiveInt(metadata.notificationId);
    if (!existingNotificationId) return null;

    const existingNotification = await prisma.notification.findUnique({
      where: { id: existingNotificationId },
    });

    if (!existingNotification) return null;

    const decorated = (await this.decorateNotifications([existingNotification]))[0];
    return decorated || null;
  }

  private static buildDeduplicationKey(input: CreateNotificationInput) {
    if (String(input.deduplicationKey || "").trim()) {
      return String(input.deduplicationKey).trim();
    }

    const eventId = String(input.eventId || "").trim();
    if (!eventId) return undefined;
    const label = String(input.templateLabel || input.eventType || "notification").trim();
    return `${eventId}:${input.recipientProfileId}:${label}`;
  }

  private static async findProfileIdsByRoles(
    roles: string[],
    departmentId?: number | null
  ) {
    const normalizedRoles = Array.from(
      new Set(roles.map((role) => normalizeRole(role)).filter(Boolean))
    );
    if (!normalizedRoles.length) return [];

    const where: any = {
      user: {
        roles: {
          some: {
            role: {
              name: {
                in: normalizedRoles,
              },
            },
          },
        },
      },
    };

    if (typeof departmentId === "number" && departmentId > 0) {
      where.departmentId = departmentId;
    }

    const profiles = await prisma.profile.findMany({
      where,
      select: { id: true },
    });
    return profiles.map((profile) => profile.id);
  }

  /**
   * Resolve recipients once and deliver through a single notification path.
   */
  static async dispatchEvent(input: DispatchEventInput, auth: AuthContext) {
    const recipients = new Set<number>();

    (input.ownerProfileIds || []).forEach((id) => {
      const profileId = toPositiveInt(id);
      if (profileId) recipients.add(profileId);
    });

    (input.recipientProfileIds || []).forEach((id) => {
      const profileId = toPositiveInt(id);
      if (profileId) recipients.add(profileId);
    });

    for (const policy of input.rolePolicies || []) {
      const roleRecipients = await this.findProfileIdsByRoles(
        policy.roles || [],
        policy.departmentId
      );

      if (roleRecipients.length === 0 && Array.isArray(policy.fallbackRoles) && policy.fallbackRoles.length > 0) {
        const fallback = await this.findProfileIdsByRoles(policy.fallbackRoles);
        fallback.forEach((profileId) => recipients.add(profileId));
        continue;
      }

      roleRecipients.forEach((profileId) => recipients.add(profileId));
    }

    const recipientList = Array.from(recipients);
    const baseEventId =
      String(input.eventId || "").trim() ||
      `${input.eventType}:${input.targetEntityType}:${input.targetEntityId}`;
    const baseDeduplicationKey =
      String(input.deduplicationKey || "").trim() || `${input.eventType}:${input.targetEntityId}`;

    const notifications = await Promise.all(
      recipientList.map((recipientProfileId) =>
        this.createNotification(
          {
            recipientProfileId,
            type: input.type || (input.actionRequired ? "action" : "info"),
            title: input.title,
            message: input.message,
            actionRequired: input.actionRequired ?? false,
            dueDate: input.dueDate,
            escalationLevel: input.escalationLevel,
            jobId: input.jobId,
            clientId: input.clientId,
            evaluationDefinitionId: input.evaluationDefinitionId,
            timeEntryId: input.timeEntryId,
            workflowAssignmentId: input.workflowAssignmentId,
            link: input.canonicalRoute,
            eventType: input.eventType,
            priority: input.priority,
            targetEntityType: input.targetEntityType,
            targetEntityId: input.targetEntityId,
            canonicalRoute: input.canonicalRoute,
            actions: input.actions,
            requiredPermission: input.requiredPermission,
            eventId: baseEventId,
            templateLabel: input.templateLabel,
            correlationId: input.correlationId,
            deduplicationKey: `${baseDeduplicationKey}:${recipientProfileId}`,
          },
          auth
        )
      )
    );

    return {
      count: notifications.length,
      recipients: recipientList,
      notifications,
    };
  }

  /**
   * List notifications for profile
   */
  static async listNotifications(options: ListOptions, auth: AuthContext) {
    const { page, pageSize, type, status } = options;
    const skip = (page - 1) * pageSize;

    const where: any = {
      profileId: auth.profileId,
    };

    if (type) where.type = type;
    if (status === "read") where.isRead = true;
    if (status === "unread") where.isRead = false;

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
      }),
      prisma.notification.count({ where }),
    ]);

    const decorated = await this.decorateNotifications(notifications);
    return { notifications: decorated, total };
  }

  /**
   * List notifications across all profiles (HR/Admin only)
   */
  static async listAllNotifications(options: ListOptions) {
    const { page, pageSize, type, status } = options;
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (type) where.type = type;
    if (status === "read") where.isRead = true;
    if (status === "unread") where.isRead = false;

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
      }),
      prisma.notification.count({ where }),
    ]);

    const decorated = await this.decorateNotifications(notifications);
    return { notifications: decorated, total };
  }

  /**
   * Create notification
   */
  static async createNotification(input: CreateNotificationInput, auth: AuthContext) {
    const {
      recipientProfileId,
      type,
      title,
      message,
      actionRequired,
      dueDate,
      escalationLevel,
      jobId,
      clientId,
      evaluationDefinitionId,
      timeEntryId,
      workflowAssignmentId,
      link,
    } = input;

    const recipient = await prisma.profile.findUnique({
      where: { id: recipientProfileId },
      select: { id: true },
    });

    if (!recipient) {
      throw {
        statusCode: 404,
        message: "Recipient not found",
      };
    }

    const deduplicationKey = this.buildDeduplicationKey(input);
    const withDedup = { ...input, deduplicationKey };
    const contract = this.buildContract(withDedup);
    const existingNotification = await this.findExistingByDedupKey(
      recipientProfileId,
      contract.deduplicationKey
    );
    if (existingNotification) {
      return existingNotification;
    }

    const deliveryDecision = await NotificationPreferenceService.getDeliveryDecision(
      recipientProfileId,
      contract.priority
    );

    if (!deliveryDecision.allowInApp) {
      await prisma.statusTransition.create({
        data: {
          entityType: "NotificationDispatch",
          entityId: recipientProfileId,
          fromStatus: "queued",
          toStatus: "suppressed",
          changedByProfileId: auth.profileId || null,
          reason: deliveryDecision.reason || "preference_suppressed",
          metadata: {
            eventType: contract.eventType,
            priority: contract.priority,
            targetEntityType: contract.targetEntityType,
            targetEntityId: contract.targetEntityId,
            canonicalRoute: contract.canonicalRoute,
            actions: contract.actions,
            requiredPermission: contract.requiredPermission,
            eventId: contract.eventId,
            templateLabel: contract.templateLabel,
            correlationId: contract.correlationId,
            deduplicationKey: contract.deduplicationKey,
            recipientProfileId,
            suppressionReason: deliveryDecision.reason,
            preference: deliveryDecision.preference,
          } as any,
        },
      });

      return {
        id: 0,
        profileId: recipientProfileId,
        type,
        title,
        message,
        actionRequired: actionRequired ?? false,
        isRead: true,
        link: link ?? contract.canonicalRoute ?? null,
        suppressed: true,
        suppressionReason: deliveryDecision.reason,
        eventType: contract.eventType,
        priority: contract.priority,
        targetEntityType: contract.targetEntityType,
        targetEntityId: contract.targetEntityId,
        canonicalRoute: contract.canonicalRoute,
        actions: contract.actions,
        requiredPermission: contract.requiredPermission,
      };
    }

    const notification = await prisma.$transaction(async (tx) => {
      const created = await tx.notification.create({
        data: {
          profile: { connect: { id: recipientProfileId } },
          type,
          title,
          message,
          actionRequired: actionRequired ?? false,
          dueDate: dueDate ?? null,
          escalationLevel: escalationLevel ?? 1,
          jobId: jobId ?? null,
          clientId: clientId ?? null,
          evaluationDefinitionId: evaluationDefinitionId ?? null,
          timeEntryId: timeEntryId ?? null,
          workflowAssignmentId: workflowAssignmentId ?? null,
          link: link ?? contract.canonicalRoute ?? null,
        },
      });

      await tx.statusTransition.create({
        data: {
          entityType: "NotificationDispatch",
          entityId: created.id,
          fromStatus: "queued",
          toStatus: "created",
          changedByProfileId: auth.profileId || null,
          reason: contract.eventType,
          metadata: {
            eventType: contract.eventType,
            priority: contract.priority,
            targetEntityType: contract.targetEntityType,
            targetEntityId: contract.targetEntityId,
            canonicalRoute: contract.canonicalRoute,
            actions: contract.actions,
            requiredPermission: contract.requiredPermission,
            eventId: contract.eventId,
            templateLabel: contract.templateLabel,
            correlationId: contract.correlationId,
            deduplicationKey: contract.deduplicationKey,
            recipientProfileId,
            createdByProfileId: auth.profileId,
            createdByUserId: auth.userId,
          } as any,
        },
      });

      if (contract.deduplicationKey) {
        await tx.statusTransition.create({
          data: {
            entityType: "NotificationDedupe",
            entityId: recipientProfileId,
            fromStatus: "pending",
            toStatus: "created",
            changedByProfileId: auth.profileId || null,
            reason: contract.deduplicationKey,
            metadata: {
              notificationId: created.id,
              eventId: contract.eventId,
              templateLabel: contract.templateLabel,
              eventType: contract.eventType,
              targetEntityType: contract.targetEntityType,
              targetEntityId: contract.targetEntityId,
            } as any,
          },
        });
      }

      await tx.statusTransition.create({
        data: {
          entityType: "NotificationOutbox",
          entityId: created.id,
          fromStatus: "pending",
          toStatus: deliveryDecision.deferUntil ? "retry_scheduled" : "queued",
          changedByProfileId: auth.profileId || null,
          reason: "notification_outbox_enqueue",
          metadata: {
            attempt: 0,
            maxAttempts: 5,
            nextAttemptAt: (
              deliveryDecision.deferUntil ? deliveryDecision.deferUntil : new Date()
            ).toISOString(),
            channel: "websocket",
            deferReason: deliveryDecision.reason || null,
            profileId: recipientProfileId,
          } as any,
        },
      });

      return created;
    });

    const decorated = this.decorateNotification(notification, contract);
    NotificationOutboxService.requestImmediateProcessing();

    return decorated;
  }

  /**
   * Create notification from a template label (fallbacks to provided defaults)
   */
  static async createFromTemplate(input: TemplateNotificationInput, auth: AuthContext) {
    const template = await prisma.notificationTemplate.findFirst({
      where: { label: input.label, isActive: true },
      select: { title: true, message: true, type: true, actionRequired: true },
    });

    const data = input.data || {};
    const resolvedTitle = renderTemplateString(
      template?.title ?? input.title ?? "Notification",
      data
    );
    const resolvedMessage = renderTemplateString(
      template?.message ?? input.message ?? "",
      data
    );

    return this.createNotification(
      {
        recipientProfileId: input.recipientProfileId,
        type: template?.type ?? input.type ?? "info",
        title: resolvedTitle,
        message: resolvedMessage,
        actionRequired: template?.actionRequired ?? input.actionRequired ?? false,
        dueDate: input.dueDate,
        escalationLevel: input.escalationLevel,
        jobId: input.jobId,
        clientId: input.clientId,
        evaluationDefinitionId: input.evaluationDefinitionId,
        timeEntryId: input.timeEntryId,
        workflowAssignmentId: input.workflowAssignmentId,
        link: input.link,
        eventType: input.eventType ?? `template.${input.label}`,
        priority: input.priority,
        targetEntityType: input.targetEntityType,
        targetEntityId: input.targetEntityId,
        canonicalRoute: input.canonicalRoute,
        actions: input.actions,
        requiredPermission: input.requiredPermission,
        eventId: input.eventId,
        templateLabel: input.label,
        correlationId: input.correlationId,
        deduplicationKey: input.deduplicationKey,
      },
      auth
    );
  }

  /**
   * Mark notification as read
   */
  static async markAsRead(notificationId: number, auth: AuthContext) {
    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      throw {
        statusCode: 404,
        message: "Notification not found",
      };
    }

    if (
      notification.profileId !== auth.profileId &&
      !["super_admin", "hr"].includes(
        String(auth.roleName || "").toLowerCase()
      )
    ) {
      throw {
        statusCode: 403,
        message: "You can only update your own notifications",
      };
    }

    const updated = await prisma.notification.update({
      where: { id: notificationId },
      data: {
        isRead: true,
      },
    });

    await prisma.statusTransition.create({
      data: {
        entityType: "NotificationDispatch",
        entityId: updated.id,
        fromStatus: "delivered",
        toStatus: "read",
        changedByProfileId: auth.profileId,
        reason: "notification_marked_read",
        metadata: {
          profileId: auth.profileId,
        } as any,
      },
    });

    const decorated = (await this.decorateNotifications([updated]))[0];
    return decorated || updated;
  }

  static async executeAction(
    notificationId: number,
    actionId: string,
    auth: AuthContext,
    payload?: Record<string, unknown>
  ) {
    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      throw { statusCode: 404, message: "Notification not found" };
    }

    if (
      notification.profileId !== auth.profileId &&
      !["super_admin", "hr"].includes(
        String(auth.roleName || "").toLowerCase()
      )
    ) {
      throw { statusCode: 403, message: "You can only act on your own notifications" };
    }

    const metadataById = await this.fetchDispatchMetadata([notificationId]);
    const metadata = metadataById.get(notificationId);
    const actions = metadata?.actions || [];
    const action = actions.find((item) => item.id === actionId);

    if (!action) {
      throw { statusCode: 404, message: "Action not found for this notification" };
    }

    const method = String(action.method || "GET").toUpperCase();
    if (method !== "GET" && action.id !== "mark_read") {
      throw {
        statusCode: 409,
        message:
          "Server-side execution is currently supported for GET/mark_read actions only",
      };
    }

    const updated = await this.markAsRead(notificationId, auth);

    await prisma.statusTransition.create({
      data: {
        entityType: "NotificationDispatch",
        entityId: notificationId,
        fromStatus: "read",
        toStatus: "acted",
        changedByProfileId: auth.profileId,
        reason: "notification_action_executed",
        metadata: {
          actionId: action.id,
          action,
          actorUserId: auth.userId,
          actorProfileId: auth.profileId,
          payload: payload || null,
        } as any,
      },
    });

    return {
      executed: true,
      action,
      notification: updated,
    };
  }

  /**
   * Mark all notifications as read
   */
  static async markAllAsRead(auth: AuthContext) {
    const result = await prisma.notification.updateMany({
      where: {
        profileId: auth.profileId,
        isRead: false,
      },
      data: {
        isRead: true,
      },
    });

    return result;
  }

  /**
   * Delete notification
   */
  static async deleteNotification(notificationId: number, auth: AuthContext) {
    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      throw {
        statusCode: 404,
        message: "Notification not found",
      };
    }

    if (
      notification.profileId !== auth.profileId &&
      !["super_admin", "hr"].includes(
        String(auth.roleName || "").toLowerCase()
      )
    ) {
      throw {
        statusCode: 403,
        message: "You can only delete your own notifications",
      };
    }

    await prisma.notification.delete({
      where: { id: notificationId },
    });

    return true;
  }

  /**
   * Get unread count
   */
  static async getUnreadCount(auth: AuthContext) {
    const count = await prisma.notification.count({
      where: {
        profileId: auth.profileId,
        isRead: false,
      },
    });

    return { unreadCount: count };
  }

  /**
   * Delete all notifications
   */
  static async deleteAllNotifications(auth: AuthContext) {
    const result = await prisma.notification.deleteMany({
      where: {
        profileId: auth.profileId,
      },
    });

    return result;
  }

  static async getPreferences(auth: AuthContext) {
    return NotificationPreferenceService.getPreferences(auth.profileId);
  }

  static async updatePreferences(
    input: NotificationPreferenceInput,
    auth: AuthContext
  ) {
    return NotificationPreferenceService.updatePreferences(auth.profileId, input, auth);
  }

  static async replayDeadLetter(notificationId: number, auth: AuthContext) {
    return NotificationOutboxService.replayDeadLetter(notificationId, auth);
  }

  static async getOutboxSummary() {
    return NotificationOutboxService.getOutboxSummary();
  }

  /**
   * Operational metrics for notification pipeline health.
   */
  static async getOperationalMetrics(days = 7) {
    const lookbackDays = Number.isFinite(days) && days > 0 ? Math.min(days, 90) : 7;
    const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

    const [createdCount, deliveredCount, ackedCount, readCount, failedCount, createdRows, deliveredRows] =
      await Promise.all([
        prisma.statusTransition.count({
          where: {
            entityType: "NotificationDispatch",
            toStatus: "created",
            createdAt: { gte: since },
          },
        }),
        prisma.statusTransition.count({
          where: {
            entityType: "NotificationDispatch",
            toStatus: "delivered",
            createdAt: { gte: since },
          },
        }),
        prisma.statusTransition.count({
          where: {
            entityType: "NotificationDispatch",
            toStatus: "acked",
            createdAt: { gte: since },
          },
        }),
        prisma.statusTransition.count({
          where: {
            entityType: "NotificationDispatch",
            toStatus: "read",
            createdAt: { gte: since },
          },
        }),
        prisma.statusTransition.count({
          where: {
            entityType: "NotificationDispatch",
            toStatus: { in: ["failed", "dead_letter"] },
            createdAt: { gte: since },
          },
        }),
        prisma.statusTransition.findMany({
          where: {
            entityType: "NotificationDispatch",
            toStatus: "created",
            createdAt: { gte: since },
          },
          select: { entityId: true, createdAt: true },
        }),
        prisma.statusTransition.findMany({
          where: {
            entityType: "NotificationDispatch",
            toStatus: "delivered",
            createdAt: { gte: since },
          },
          select: { entityId: true, createdAt: true },
        }),
      ]);

    const deliveredByNotificationId = new Map<number, Date>();
    deliveredRows.forEach((row) => {
      if (!deliveredByNotificationId.has(row.entityId)) {
        deliveredByNotificationId.set(row.entityId, row.createdAt);
      }
    });

    const latenciesMs = createdRows
      .map((row) => {
        const deliveredAt = deliveredByNotificationId.get(row.entityId);
        if (!deliveredAt) return null;
        return deliveredAt.getTime() - row.createdAt.getTime();
      })
      .filter((value): value is number => value !== null && value >= 0)
      .sort((a, b) => a - b);

    const percentile = (values: number[], p: number) => {
      if (!values.length) return null;
      const index = Math.min(values.length - 1, Math.max(0, Math.ceil((p / 100) * values.length) - 1));
      return values[index];
    };

    return {
      windowDays: lookbackDays,
      created: createdCount,
      delivered: deliveredCount,
      acked: ackedCount,
      opened: readCount,
      acted: 0,
      failed: failedCount,
      retryCount: 0,
      latencyPercentilesMs: {
        p50: percentile(latenciesMs, 50),
        p95: percentile(latenciesMs, 95),
        p99: percentile(latenciesMs, 99),
      },
    };
  }

  /**
   * Send batch notifications
   */
  static async sendBatchNotifications(
    recipientProfileIds: number[],
    input: Omit<CreateNotificationInput, "recipientProfileId">,
    auth: AuthContext
  ) {
    const roleName = String(auth.roleName || "").toLowerCase();
    if (!["super_admin", "manager", "hr"].includes(roleName)) {
      throw {
        statusCode: 403,
        message: "Only admins/managers can send batch notifications",
      };
    }

    const uniqueRecipients = Array.from(
      new Set(
        recipientProfileIds
          .map((id) => toPositiveInt(id))
          .filter((id): id is number => Boolean(id))
      )
    );

    const results = await Promise.all(
      uniqueRecipients.map((recipientProfileId) =>
        this.createNotification(
          {
            ...input,
            recipientProfileId,
            eventType: input.eventType || "notification.batch",
            eventId: input.eventId || `batch:${Date.now()}`,
            deduplicationKey: input.deduplicationKey
              ? `${input.deduplicationKey}:${recipientProfileId}`
              : undefined,
          },
          auth
        )
      )
    );

    return {
      count: results.length,
      notifications: results,
    };
  }
}
