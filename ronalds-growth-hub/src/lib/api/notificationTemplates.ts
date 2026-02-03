import apiFetch from "@/integrations/apiClient";

export type NotificationTemplate = {
  id: number;
  label: string;
  title: string;
  message: string;
  type: string;
  actionRequired: boolean;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
};

const notificationTemplatesAPI = {
  list: async (params?: { isActive?: boolean }) => {
    const query = new URLSearchParams();
    if (typeof params?.isActive === "boolean") {
      query.set("is_active", String(params.isActive));
    }
    const response = await apiFetch(
      "GET",
      `/notification-templates${query.toString() ? `?${query.toString()}` : ""}`
    );
    return response?.data ?? response;
  },
  create: async (payload: Partial<NotificationTemplate>) =>
    apiFetch("POST", "/notification-templates", payload),
  update: async (id: number, payload: Partial<NotificationTemplate>) =>
    apiFetch("PATCH", `/notification-templates/${id}`, payload),
  remove: async (id: number) => apiFetch("DELETE", `/notification-templates/${id}`),
};

export default notificationTemplatesAPI;
