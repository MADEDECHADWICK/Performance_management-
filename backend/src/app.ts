/**
 * Express Application Setup
 * 
 * This is the main Express app configuration with:
 * - CORS enabled for frontend integration
 * - JSON middleware
 * - Health check endpoints
 * - Consolidated route imports via routes/index.ts
 */

import express from 'express';
import cors from 'cors';
import { errorHandler } from './middleware/error';
import routes from './routes';
import {
  buildFrameAncestorsDirective,
  buildCorsOptions,
  getJsonBodyLimit,
  getUrlEncodedParameterLimit,
  securityHeadersMiddleware,
  shouldTrustProxy,
} from './config/httpSecurity';
import { runtimeConfig } from './config/env';
import {
  getPublicUploadPrefix,
  getStoredUploadReadUrl,
  getUploadRoot,
  type UploadBucket,
} from './config/uploads';
import { logger, requestLoggingMiddleware, toLogContext } from './lib/logger';
import { httpRateLimitMiddleware } from './middleware/httpRateLimit';
import { requestMetricsMiddleware } from './middleware/observability';

const app = express();
app.disable('x-powered-by');

if (shouldTrustProxy()) {
  app.set('trust proxy', 1);
}

const toCamelKey = (key: string) =>
  key.replace(/_([a-zA-Z0-9])/g, (_, ch: string) => ch.toUpperCase());

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Object.prototype.toString.call(value) === '[object Object]';

const camelizePayload = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((entry) => camelizePayload(entry));
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        toCamelKey(key),
        camelizePayload(nested),
      ])
    );
  }

  return value;
};

const hasSnakeCaseSegment = (key: string) => /[a-z0-9]_[a-z0-9]/.test(key);

const findSnakeCaseKey = (value: unknown, prefix = ''): string | null => {
  if (!isPlainObject(value) && !Array.isArray(value)) return null;

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const found = findSnakeCaseKey(value[i], `${prefix}[${i}]`);
      if (found) return found;
    }
    return null;
  }

  for (const [key, nested] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (hasSnakeCaseSegment(key)) return path;
    const found = findSnakeCaseKey(nested, path);
    if (found) return found;
  }

  return null;
};

/**
 * ==========================================
 * MIDDLEWARE SETUP
 * ==========================================
 */

// CORS configuration
app.use(cors(buildCorsOptions()));
app.use(securityHeadersMiddleware);
app.use(requestLoggingMiddleware);
app.use(requestMetricsMiddleware);
app.use(httpRateLimitMiddleware);

// Bound request payload sizes to reduce abuse and accidental oversized payloads.
app.use(express.json({ limit: getJsonBodyLimit() }));
app.use(
  express.urlencoded({
    extended: true,
    limit: getJsonBodyLimit(),
    parameterLimit: getUrlEncodedParameterLimit(),
  })
);

// Enforce camelCase request keys for query/body payloads.
app.use((req, res, next) => {
  const invalidBodyKey = findSnakeCaseKey(req.body);
  if (invalidBodyKey) {
    return res.status(400).json({
      success: false,
      error: `Invalid request key '${invalidBodyKey}'. Use camelCase keys only.`,
    });
  }

  const invalidQueryKey = Object.keys(req.query || {}).find((key) => hasSnakeCaseSegment(key));
  if (invalidQueryKey) {
    return res.status(400).json({
      success: false,
      error: `Invalid query key '${invalidQueryKey}'. Use camelCase keys only.`,
    });
  }

  return next();
});

// Normalize API response payload keys to camelCase.
app.use((_req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = ((body: any) => originalJson(camelizePayload(body))) as typeof res.json;
  next();
});

// Serve uploaded files
const registerManagedUploadRoute = (bucket: UploadBucket) => {
  app.get(`${getPublicUploadPrefix(bucket)}/:fileName`, async (req, res, next) => {
    try {
      const readUrl = await getStoredUploadReadUrl(bucket, req.params.fileName);
      if (!readUrl) {
        return res.status(404).json({
          success: false,
          error: 'Uploaded file not found',
        });
      }

      return res.redirect(readUrl);
    } catch (error) {
      logger.error('managed_upload_read_failed', {
        bucket,
        fileName: req.params.fileName,
        ...toLogContext(error),
      });
      return next(error);
    }
  });
};

if (runtimeConfig.serveLocalUploads) {
  const uploadPreviewFrameAncestors = buildFrameAncestorsDirective();
  app.use(
    runtimeConfig.uploadPublicBasePath,
    express.static(getUploadRoot(), {
      dotfiles: 'deny',
      fallthrough: false,
      index: false,
      maxAge: '1d',
      setHeaders: (res) => {
        // Upload previews are embedded by the frontend in an iframe, so override
        // the global frame deny header only for static upload responses.
        res.removeHeader('X-Frame-Options');
        res.setHeader('Content-Security-Policy', uploadPreviewFrameAncestors);
      },
    })
  );
} else if (runtimeConfig.objectStorageEnabled) {
  registerManagedUploadRoute('documents');
  registerManagedUploadRoute('knowledge-hub');
} else {
  logger.warn('local_upload_serving_disabled', {
    uploadRoot: runtimeConfig.uploadRoot,
    uploadPublicBasePath: runtimeConfig.uploadPublicBasePath,
  });
}

/**
 * ==========================================
 * HEALTH CHECK ENDPOINTS
 * ==========================================
 */

app.get('/', (_req, res) => res.json({ 
  ok: true, 
  message: 'Backend running',
  timestamp: new Date().toISOString(),
}));

app.get('/health', (_req, res) => res.json({ 
  ok: true,
  timestamp: new Date().toISOString(),
}));

/**
 * ==========================================
 * API ROUTES
 * ==========================================
 * 
 * All routes are namespaced under /api
 * See routes/index.ts for route organization
 */

app.use('/api', routes);

/**
 * ==========================================
 * ERROR HANDLING & 404
 * ==========================================
 */

// 404 handler
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    statusCode: 404,
    error: 'Not found',
    timestamp: new Date().toISOString(),
  });
});

// Global error handler (last middleware)
app.use(errorHandler);

export default app;
