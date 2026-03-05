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
export { default as clientOnboardingsAPI } from './clientOnboardings';
export { default as jobsAPI } from './jobs';
export { default as timeEntriesAPI } from './timeEntries';
export { default as employeesAPI } from './employees';
export { default as evaluationsAPI } from './evaluations';
export { default as kpisAPI } from './kpis';
export { default as kpiCascadeV2API } from './kpiCascadeV2';
export { default as dashboardsAPI } from './dashboards';
export { default as documentsAPI } from './documents';
export { default as departmentsAPI } from './departments';
export { default as surveysAPI } from './surveys';
export { default as proposalsAPI } from './proposals';
export { default as engagementLettersAPI } from './engagementLetters';
export { default as rolesAPI } from './roles';
export { default as recruitmentCandidatesAPI } from './recruitmentCandidates';
export { default as notificationTemplatesAPI } from './notificationTemplates';
export { default as performanceFrameworkAPI } from './performanceFramework';
export { default as moduleAccessAPI } from './moduleAccess';
export { default as knowledgeHubAPI } from './knowledgeHub';

// Convenience grouped import
import authAPI from './auth';
import clientsAPI from './clients';
import clientOnboardingsAPI from './clientOnboardings';
import jobsAPI from './jobs';
import timeEntriesAPI from './timeEntries';
import employeesAPI from './employees';
import evaluationsAPI from './evaluations';
import kpisAPI from './kpis';
import kpiCascadeV2API from './kpiCascadeV2';
import dashboardsAPI from './dashboards';
import documentsAPI from './documents';
import departmentsAPI from './departments';
import surveysAPI from './surveys';
import proposalsAPI from './proposals';
import engagementLettersAPI from './engagementLetters';
import rolesAPI from './roles';
import recruitmentCandidatesAPI from './recruitmentCandidates';
import notificationTemplatesAPI from './notificationTemplates';
import performanceFrameworkAPI from './performanceFramework';
import moduleAccessAPI from './moduleAccess';
import knowledgeHubAPI from './knowledgeHub';

const API = {
  auth: authAPI,
  clients: clientsAPI,
  clientOnboardings: clientOnboardingsAPI,
  jobs: jobsAPI,
  timeEntries: timeEntriesAPI,
  employees: employeesAPI,
  evaluations: evaluationsAPI,
  kpis: kpisAPI,
  kpiCascadeV2: kpiCascadeV2API,
  dashboards: dashboardsAPI,
  documents: documentsAPI,
  departments: departmentsAPI,
  surveys: surveysAPI,
  proposals: proposalsAPI,
  engagementLetters: engagementLettersAPI,
  roles: rolesAPI,
  recruitmentCandidates: recruitmentCandidatesAPI,
  notificationTemplates: notificationTemplatesAPI,
  performanceFramework: performanceFrameworkAPI,
  moduleAccess: moduleAccessAPI,
  knowledgeHub: knowledgeHubAPI,
};

export default API;
