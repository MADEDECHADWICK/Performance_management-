import { api } from "./client";

export interface KnowledgeHubResource {
  id: number;
  title: string;
  summary: string | null;
  domain: string;
  resourceType: string;
  assetKind: string;
  submodules: string[];
  tags: string[];
  linkUrl: string | null;
  assetFileName: string | null;
  assetMimeType: string | null;
  content: string | null;
  allowDownload: boolean;
  isFeatured: boolean;
  isPublished: boolean;
  publishedAt: string | null;
  createdByProfileId: number | null;
  updatedByProfileId: number | null;
  createdAt: string;
  updatedAt: string;
  createdByName: string | null;
  updatedByName: string | null;
}

export interface KnowledgeHubListResponse {
  resources: KnowledgeHubResource[];
  total: number;
  page: number;
  pageSize: number;
}

export interface KnowledgeHubModuleOption {
  key: string;
  label: string;
}

export interface KnowledgeHubMeta {
  domains: string[];
  resourceTypes: string[];
  assetKinds: string[];
  modules: KnowledgeHubModuleOption[];
}

export interface KnowledgeHubListParams {
  search?: string;
  domain?: string;
  resourceType?: string;
  moduleKey?: string;
  featured?: boolean;
  includeDrafts?: boolean;
  page?: number;
  pageSize?: number;
}

export interface UpsertKnowledgeHubResourceInput {
  title: string;
  summary?: string | null;
  domain: string;
  resourceType: string;
  assetKind?: string;
  submodules?: string[];
  tags?: string[];
  linkUrl?: string | null;
  content?: string | null;
  allowDownload?: boolean;
  isFeatured?: boolean;
  isPublished?: boolean;
}

const toQueryString = (params?: KnowledgeHubListParams) => {
  if (!params) return "";
  const search = new URLSearchParams();

  if (params.search) search.set("search", params.search);
  if (params.domain) search.set("domain", params.domain);
  if (params.resourceType) search.set("resourceType", params.resourceType);
  if (params.moduleKey) search.set("moduleKey", params.moduleKey);
  if (typeof params.featured === "boolean") search.set("featured", String(params.featured));
  if (typeof params.includeDrafts === "boolean") {
    search.set("includeDrafts", String(params.includeDrafts));
  }
  if (typeof params.page === "number") search.set("page", String(params.page));
  if (typeof params.pageSize === "number") search.set("pageSize", String(params.pageSize));

  const query = search.toString();
  return query ? `?${query}` : "";
};

const knowledgeHubAPI = {
  list: (params?: KnowledgeHubListParams) =>
    api.get<KnowledgeHubListResponse>(`/knowledge-hub${toQueryString(params)}`),

  meta: () => api.get<KnowledgeHubMeta>("/knowledge-hub/meta"),

  get: (resourceId: number) =>
    api.get<KnowledgeHubResource>(`/knowledge-hub/${resourceId}`),

  create: (payload: UpsertKnowledgeHubResourceInput | FormData) =>
    api.post<KnowledgeHubResource>("/knowledge-hub", payload),

  update: (resourceId: number, payload: Partial<UpsertKnowledgeHubResourceInput> | FormData) =>
    api.patch<KnowledgeHubResource>(`/knowledge-hub/${resourceId}`, payload),

  remove: (resourceId: number) =>
    api.delete<{ success: boolean }>(`/knowledge-hub/${resourceId}`),
};

export default knowledgeHubAPI;
