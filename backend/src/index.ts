import http from "http";
import app from "./app";
import websocketService from "./services/websocket.service";
import backgroundJobsService from "./services/background-jobs.service";
import { NotificationOutboxService } from "./services/notificationOutbox.service";
import { JobOverdueNotificationService } from "./services/jobOverdueNotifications.service";
import { assertRuntimeConfig, runtimeConfig } from "./config/env";
import { logger, toLogContext } from "./lib/logger";
import { ObservabilityService } from "./services/observability.service";

assertRuntimeConfig();

const PORT = runtimeConfig.port;

const server = http.createServer(app);

websocketService.initialize(server);
ObservabilityService.startMonitoring();
void backgroundJobsService.initialize();
NotificationOutboxService.startWorker();
JobOverdueNotificationService.startWorker();

if (
  runtimeConfig.nodeEnv === "production" &&
  (runtimeConfig.serveLocalUploads || runtimeConfig.diskUploadsEnabled)
) {
  logger.warn("production_local_disk_uploads_enabled", {
    uploadRoot: runtimeConfig.uploadRoot,
    serveLocalUploads: runtimeConfig.serveLocalUploads,
    diskUploadsEnabled: runtimeConfig.diskUploadsEnabled,
    recommendation:
      "Move uploads to managed object storage before wider production rollout.",
  });
}

server.listen(PORT, "0.0.0.0", () => {
  logger.info("server_started", {
    httpUrl: `http://localhost:${PORT}`,
    wsUrl: `ws://localhost:${PORT}`,
    nodeEnv: runtimeConfig.nodeEnv,
    serveLocalUploads: runtimeConfig.serveLocalUploads,
    diskUploadsEnabled: runtimeConfig.diskUploadsEnabled,
    uploadRoot: runtimeConfig.uploadRoot,
  });
});

server.on("error", (error: unknown) => {
  logger.error("server_error", toLogContext(error));
});

process.on("unhandledRejection", (reason: unknown) => {
  logger.error("unhandled_rejection", { reason });
  ObservabilityService.recordError({
    source: "process:unhandled_rejection",
    severity: "critical",
    error: reason,
  });
});

process.on("uncaughtException", (error: unknown) => {
  logger.error("uncaught_exception", toLogContext(error));
  ObservabilityService.recordError({
    source: "process:uncaught_exception",
    severity: "critical",
    error,
  });
  process.exit(1);
});

const shutdown = () => {
  ObservabilityService.stopMonitoring();
  void backgroundJobsService.shutdown().catch((error) => {
    logger.error("background_jobs_shutdown_failed", toLogContext(error));
  });
  NotificationOutboxService.stopWorker();
  JobOverdueNotificationService.stopWorker();
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
