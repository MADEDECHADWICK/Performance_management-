import prisma from './src/prisma';
import { NotificationOutboxService } from './src/services/notificationOutbox.service';
import { JobOverdueNotificationService } from './src/services/jobOverdueNotifications.service';

afterAll(async () => {
  // Defensive cleanup for background timers in case a test imports server services.
  try {
    NotificationOutboxService.stopWorker();
  } catch {
    // no-op
  }

  try {
    JobOverdueNotificationService.stopWorker();
  } catch {
    // no-op
  }

  // Ensure Prisma connections are closed even when individual suites forget to disconnect.
  try {
    const disconnect = (prisma as any)?.$disconnect;
    if (typeof disconnect === 'function') {
      await disconnect.call(prisma);
    }
  } catch {
    // no-op
  }
});

