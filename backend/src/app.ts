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
import businessLogicRoutes from './routes/businessLogic';
import phase6Routes from './routes/phase6.routes';

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

// ✅ REGISTER BUSINESS LOGIC ROUTES
app.use('/api/business-logic', businessLogicRoutes);

// ✅ REGISTER PHASE 6 ROUTES (Real-time, Reports, Analytics)
app.use('/api/phase6', phase6Routes);

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
