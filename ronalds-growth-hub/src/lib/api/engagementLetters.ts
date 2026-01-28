/**
 * Engagement Letters API - global list view
 */
import { api } from "./client";

interface EngagementLetterFilters {
  page?: number;
  pageSize?: number;
  status?: string;
  clientId?: number;
  search?: string;
}

export const engagementLettersAPI = {
  list: async (filters?: EngagementLetterFilters) => {
    const params = new URLSearchParams();
    if (filters?.page) params.append("page", String(filters.page));
    if (filters?.pageSize) params.append("pageSize", String(filters.pageSize));
    if (filters?.status) params.append("status", filters.status);
    if (filters?.clientId) params.append("clientId", String(filters.clientId));
    if (filters?.search) params.append("search", filters.search);

    const query = params.toString();
    return api.get(`/engagement-letters${query ? `?${query}` : ""}`);
  },
};

export default engagementLettersAPI;
