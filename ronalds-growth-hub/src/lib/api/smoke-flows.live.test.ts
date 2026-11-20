process.env.NODE_ENV = "test";
process.env.JWT_SECRET =
  process.env.JWT_SECRET || "frontend-live-smoke-secret-12345678901234567890";
process.env.REQUEST_LOGGING_ENABLED = "false";
process.env.OBSERVABILITY_ENABLED = "false";

import http from "http";
import type { Server } from "http";
const mockTokenKey = "rg_token";
const mockUserKey = "rg_user";
const mockApiBaseUrl = "http://127.0.0.1:4000/api";

class MemoryStorage {
  private readonly store = new Map<string, string>();

  clear() {
    this.store.clear();
  }

  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  removeItem(key: string) {
    this.store.delete(key);
  }

  setItem(key: string, value: string) {
    this.store.set(key, String(value));
  }
}

const mockStorage = new MemoryStorage();

const mockNormalizeApiResponse = (payload: any) => {
  if (payload && typeof payload === "object" && "success" in payload && "data" in payload) {
    const data = payload.data;
    if (data && typeof data === "object" && "items" in data && "pagination" in data) {
      return {
        data: data.items,
        ...data.pagination,
      };
    }
    return data;
  }

  return payload;
};

const mockGetToken = () => mockStorage.getItem(mockTokenKey);

const mockGetUser = () => {
  const value = mockStorage.getItem(mockUserKey);
  return value ? JSON.parse(value) : null;
};

const mockSetToken = (token: string | null) => {
  if (token) {
    mockStorage.setItem(mockTokenKey, token);
    return;
  }
  mockStorage.removeItem(mockTokenKey);
};

const mockSetUser = (user: unknown) => {
  if (user) {
    mockStorage.setItem(mockUserKey, JSON.stringify(user));
    return;
  }
  mockStorage.removeItem(mockUserKey);
};

const mockClearAuth = () => {
  mockStorage.removeItem(mockTokenKey);
  mockStorage.removeItem(mockUserKey);
};

const mockApiFetch = async (method: string, path: string, body?: unknown) => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const token = mockGetToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${mockApiBaseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(payload.error || payload.message || `HTTP ${response.status}`);
  }

  return mockNormalizeApiResponse(payload);
};

jest.mock("./client", () => ({
  api: {
    get: (path: string) => mockApiFetch("GET", path),
    post: (path: string, body?: unknown) => mockApiFetch("POST", path, body),
    patch: (path: string, body?: unknown) => mockApiFetch("PATCH", path, body),
    delete: (path: string) => mockApiFetch("DELETE", path),
  },
  setToken: (token: string | null) => mockSetToken(token),
  getToken: () => mockGetToken(),
  setUser: (user: unknown) => mockSetUser(user),
  getUser: () => mockGetUser(),
  clearAuth: () => mockClearAuth(),
}));

import authAPI, { type LoginSuccessResponse, type LoginResponse } from "./auth";
import { clearAuth, getToken, getUser, setToken, setUser } from "./client";

jest.setTimeout(120_000);

const API_BASE_URL = "http://127.0.0.1:4000";
const FRONTEND_SMOKE_PREFIX = "[FRONTEND_LIVE_SMOKE]";
const RUN_FRONTEND_LIVE_SMOKE =
  process.env.FRONTEND_SMOKE_LIVE === "true" ||
  process.env.npm_lifecycle_event === "test:frontend-smoke:live";
let server: Server | null = null;
let prismaClient: any = null;
let seedDatabaseFn: null | (() => Promise<unknown>) = null;

const loadBackendApp = async () => {
  const module = await import("../../../../backend/src/app");
  return module.default;
};

const loadBackendTestRuntime = async () => {
  if (prismaClient && seedDatabaseFn) {
    return { prisma: prismaClient, seedDatabase: seedDatabaseFn };
  }

  const [prismaModule, seedModule] = await Promise.all([
    import("../../../../backend/src/prisma"),
    import("../../../../backend/prisma/seed"),
  ]);

  prismaClient = prismaModule.default;
  seedDatabaseFn = seedModule.seedDatabase;

  return { prisma: prismaClient, seedDatabase: seedDatabaseFn };
};

const assertLoginSuccess = (response: LoginResponse): LoginSuccessResponse => {
  if (!("token" in response) || !response.token) {
    throw new Error("Expected seeded login to return an authenticated session");
  }
  return response;
};

const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);

const addDays = (date: Date, days: number) =>
  new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

const isServerHealthy = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    return response.ok;
  } catch {
    return false;
  }
};

const startLocalBackend = async () => {
  if (await isServerHealthy()) {
    return;
  }

  const app = await loadBackendApp();
  server = http.createServer(app);
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server?.off("error", onError);
      reject(error);
    };

    server?.once("error", onError);
    server?.listen(4000, "127.0.0.1", () => {
      server?.off("error", onError);
      resolve();
    });
  });
};

const completeOnboardingForProfiles = async (profileIds: number[]) => {
  const ids = profileIds.filter((id): id is number => Number.isFinite(id) && id > 0);
  if (!ids.length) return;

  const { prisma } = await loadBackendTestRuntime();
  await prisma.profile.updateMany({
    where: { id: { in: ids } },
    data: {
      onboardingStatus: "completed",
      onboardingChecklistCompleted: true,
      inductionCompleted: true,
    },
  });
};

const useSession = (session: LoginSuccessResponse) => {
  setToken(session.token);
  setUser(session.user);
};

const describeLive = RUN_FRONTEND_LIVE_SMOKE ? describe : describe.skip;

describeLive("frontend live smoke flows", () => {
  beforeAll(async () => {
    const { seedDatabase } = await loadBackendTestRuntime();
    await seedDatabase();
    await startLocalBackend();
  });

  beforeEach(() => {
    clearAuth();
    mockStorage.clear();
  });

  afterAll(async () => {
    clearAuth();

    if (server) {
      await new Promise<void>((resolve, reject) => {
        server?.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }

    if (prismaClient) {
      await prismaClient.$disconnect();
    }
  });

  it("logs in against the live backend and persists the authenticated session", async () => {
    const response = assertLoginSuccess(
      await authAPI.login("hr@ronalds.local", "Password123!")
    );

    expect(response.user.email).toBe("hr@ronalds.local");
    expect(response.user.profile?.id).toBeDefined();
    expect(Array.isArray(response.user.roles)).toBe(true);
    expect(getToken()).toBe(response.token);
    expect(getUser()).toEqual(response.user);
  });

});
