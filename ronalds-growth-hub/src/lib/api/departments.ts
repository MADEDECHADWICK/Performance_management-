import { api } from "./client";
import type { Department } from "./types";

export const departmentsAPI = {
  list: async (params?: { page?: number; pageSize?: number }) => {
    const query = new URLSearchParams();
    if (params?.page) query.set("page", String(params.page));
    if (params?.pageSize) query.set("pageSize", String(params.pageSize));
    const qs = query.toString();
    return api.get(`/departments${qs ? `?${qs}` : ""}`);
  },

  getById: async (id: number): Promise<Department> => {
    return api.get(`/departments/${id}`);
  },
};

export default departmentsAPI;
