/**
 * WebSocket Service
 * 
 * Manages real-time connections, event broadcasting, and room-based subscriptions
 * for budget alerts, evaluations, and status updates.
 */


import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';

interface User {
  profileId: string;
  userId: string;
  roleName: string;
}

interface BudgetAlert {
  jobId: string;
  departmentId: string;
  utilization: number;
  threshold: number;
  message: string;
  severity: 'warning' | 'critical';
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
  action: 'allocated' | 'updated' | 'removed';
}

class WebSocketService {
  private io: SocketIOServer | null = null;
  private connectedUsers: Map<string, User> = new Map();

  /**
   * Initialize WebSocket server
   */
  initialize(httpServer: HTTPServer) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env.CORS_ORIGIN || '*',
        credentials: true,
      },
      transports: ['websocket', 'polling'],
    });

    this.setupMiddleware();
    this.setupConnectionHandlers();
    return this.io;
  }

  /**
   * Setup authentication middleware
   */
  private setupMiddleware() {
    if (!this.io) return;

    this.io.use((socket, next) => {
      const token = socket.handshake.auth.token;
      const profileId = socket.handshake.auth.profileId;
      const userId = socket.handshake.auth.userId;
      const roleName = socket.handshake.auth.roleName;

      if (!token || !profileId) {
        return next(new Error('Authentication failed'));
      }

      socket.data.user = {
        profileId,
        userId,
        roleName,
      };

      next();
    });
  }

  /**
   * Setup connection and disconnection handlers
   */
  private setupConnectionHandlers() {
    if (!this.io) return;

    this.io.on('connection', (socket: Socket) => {
      const user = socket.data.user as User;

      // Store connected user
      this.connectedUsers.set(socket.id, user);

      console.log(`✅ User ${user.profileId} connected: ${socket.id}`);

      // Join user to personal room (for individual notifications)
      socket.join(`user:${user.profileId}`);

      // Join role-based rooms
      socket.join(`role:${user.roleName}`);

      // Join department room if applicable
      if (user.roleName === 'manager' || user.roleName === 'admin') {
        socket.join(`admin:notifications`);
      }

      // Subscribe to specific alerts
      socket.on('subscribe:budget-alerts', (departmentId: string) => {
        socket.join(`budget:${departmentId}`);
        socket.emit('subscribed', { topic: 'budget-alerts', departmentId });
      });

      socket.on('subscribe:evaluations', (cycleId: string) => {
        socket.join(`evaluation:${cycleId}`);
        socket.emit('subscribed', { topic: 'evaluations', cycleId });
      });

      socket.on('subscribe:staffing', (jobId: string) => {
        socket.join(`staffing:${jobId}`);
        socket.emit('subscribed', { topic: 'staffing', jobId });
      });

      // Unsubscribe handlers
      socket.on('unsubscribe:budget-alerts', (departmentId: string) => {
        socket.leave(`budget:${departmentId}`);
      });

      socket.on('disconnect', () => {
        this.connectedUsers.delete(socket.id);
        console.log(`❌ User ${user.profileId} disconnected: ${socket.id}`);
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

    this.io.to(`budget:${alert.departmentId}`).emit('budget-alert', {
      jobId: alert.jobId,
      utilization: alert.utilization,
      threshold: alert.threshold,
      message: alert.message,
      severity: alert.severity,
      timestamp: new Date(),
    });

    // Also notify admins and finance
    if (alert.severity === 'critical') {
      this.io.to('role:admin').emit('critical-budget-alert', alert);
      this.io.to('role:finance').emit('critical-budget-alert', alert);
    }
  }

  /**
   * Broadcast evaluation update
   */
  broadcastEvaluationUpdate(update: EvaluationUpdate, departmentId: string) {
    if (!this.io) return;

    // Notify employee
    this.io.to(`user:${update.employeeId}`).emit('evaluation-update', {
      evaluationId: update.evaluationId,
      status: update.status,
      message: update.message,
      timestamp: new Date(),
    });

    // Notify managers and admins in department
    this.io.to(`evaluation:${departmentId}`).emit('evaluation-status-change', {
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

    // Notify employee
    this.io.to(`user:${employeeId}`).emit('staffing-update', {
      jobId: change.jobId,
      action: change.action,
      allocationPercentage: change.allocationPercentage,
      message: `You have been ${change.action} on job ${change.jobId}`,
      timestamp: new Date(),
    });

    // Notify job stakeholders
    this.io.to(`staffing:${change.jobId}`).emit('job-staffing-change', change);

    // Notify managers and admins
    this.io.to('role:manager').emit('staffing-alert', change);
  }

  /**
   * Broadcast revenue update
   */
  broadcastRevenueUpdate(jobId: string, revenue: number, departmentId: string) {
    if (!this.io) return;

    this.io.to(`budget:${departmentId}`).emit('revenue-update', {
      jobId,
      revenue,
      timestamp: new Date(),
    });

    this.io.to('role:finance').emit('revenue-recorded', {
      jobId,
      revenue,
      timestamp: new Date(),
    });
  }

  /**
   * Broadcast KPI update
   */
  broadcastKPIUpdate(employeeId: string, kpiId: string, achievement: number) {
    if (!this.io) return;

    this.io.to(`user:${employeeId}`).emit('kpi-update', {
      kpiId,
      achievement,
      message: `Your KPI ${kpiId} achievement has been updated to ${achievement}%`,
      timestamp: new Date(),
    });

    this.io.to('role:manager').emit('kpi-achievement', {
      employeeId,
      kpiId,
      achievement,
    });
  }

  /**
   * Send notification to specific user
   */
  notifyUser(profileId: string, notification: any) {
    if (!this.io) return;

    this.io.to(`user:${profileId}`).emit('notification', {
      ...notification,
      timestamp: new Date(),
    });
  }

  /**
   * Send notification to role group
   */
  notifyRole(roleName: string, notification: any) {
    if (!this.io) return;

    this.io.to(`role:${roleName}`).emit('notification', {
      ...notification,
      timestamp: new Date(),
    });
  }

  /**
   * Broadcast system-wide announcement
   */
  broadcastSystemAnnouncement(title: string, message: string, priority: 'low' | 'medium' | 'high') {
    if (!this.io) return;

    this.io.emit('system-announcement', {
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
  getConnectedUsersByRole(roleName: string): User[] {
    return Array.from(this.connectedUsers.values()).filter(
      (user) => user.roleName === roleName
    );
  }
}

export default new WebSocketService();
