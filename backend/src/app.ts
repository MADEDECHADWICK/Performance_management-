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
import dotenv from 'dotenv';
import { errorHandler } from './middleware/error';
import routes from './routes';

dotenv.config();

const app = express();

/**
 * ==========================================
 * MIDDLEWARE SETUP
 * ==========================================
 */

// CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));

// JSON body parser
app.use(express.json());

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
