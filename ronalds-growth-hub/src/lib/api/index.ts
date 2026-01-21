/**
 * API Index - Central export for all API modules
 */

// Core utilities
export { api, apiFetch, setToken, getToken, setUser, getUser, clearAuth, ApiError } from './client';

// Type exports
export * from './types';

// API modules
export { default as authAPI } from './auth';
export { default as clientsAPI } from './clients';
export { default as jobsAPI } from './jobs';
export { default as timeEntriesAPI } from './timeEntries';
export { default as employeesAPI } from './employees';
export { default as evaluationsAPI } from './evaluations';
export { default as kpisAPI } from './kpis';
export { default as dashboardsAPI } from './dashboards';
export { default as documentsAPI } from './documents';
export { default as surveysAPI } from './surveys';
export { default as rolesAPI } from './roles';

// Convenience grouped import
import authAPI from './auth';
import clientsAPI from './clients';
import jobsAPI from './jobs';
import timeEntriesAPI from './timeEntries';
import employeesAPI from './employees';
import evaluationsAPI from './evaluations';
import kpisAPI from './kpis';
import dashboardsAPI from './dashboards';
import documentsAPI from './documents';
import surveysAPI from './surveys';
import rolesAPI from './roles';

const API = {
  auth: authAPI,
  clients: clientsAPI,
  jobs: jobsAPI,
  timeEntries: timeEntriesAPI,
  employees: employeesAPI,
  evaluations: evaluationsAPI,
  kpis: kpisAPI,
  dashboards: dashboardsAPI,
  documents: documentsAPI,
  surveys: surveysAPI,
  roles: rolesAPI,
};

export default API;
