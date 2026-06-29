import { expect, test, type Page, type Route } from "@playwright/test";

const API_ORIGIN = "http://localhost:4000";
const APP_ORIGIN = "http://127.0.0.1:4173";
const TIMESTAMP = "2026-03-12T09:00:00.000Z";

type MockUser = {
  id: number;
  email: string;
  roles: Array<{ role: { name: string } }>;
  moduleAccess: Record<string, string[]>;
  viewAccessKeys: string[];
  homeViewKey: string;
  profile: {
    id: number;
    firstName: string;
    lastName: string;
    onboardingStatus: string;
    onboardingChecklistCompleted: boolean;
    inductionCompleted: boolean;
  };
};

const corsHeaders = {
  "access-control-allow-origin": APP_ORIGIN,
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
};

const hrUser: MockUser = {
  id: 7,
  email: "hr@ronalds.local",
  roles: [{ role: { name: "HR" } }],
  moduleAccess: {
    dashboard: ["read"],
    evaluations: ["read", "write", "approve"],
  },
  viewAccessKeys: [
    "dashboard.hr",
    "evaluations.management",
    "evaluations.my",
    "notifications.center",
  ],
  homeViewKey: "dashboard.hr",
  profile: {
    id: 701,
    firstName: "Harriet",
    lastName: "Ronalds",
    onboardingStatus: "completed",
    onboardingChecklistCompleted: true,
    inductionCompleted: true,
  },
};

const managerUser: MockUser = {
  id: 8,
  email: "manager@ronalds.local",
  roles: [{ role: { name: "Manager" } }],
  moduleAccess: {
    dashboard: ["read"],
    evaluations: ["read", "write"],
  },
  viewAccessKeys: [
    "dashboard.manager",
    "evaluations.my",
    "notifications.center",
  ],
  homeViewKey: "dashboard.manager",
  profile: {
    id: 702,
    firstName: "Moses",
    lastName: "Manager",
    onboardingStatus: "completed",
    onboardingChecklistCompleted: true,
    inductionCompleted: true,
  },
};

const evaluatorUser: MockUser = {
  id: 9,
  email: "reviewer@ronalds.local",
  roles: [{ role: { name: "Manager" } }],
  moduleAccess: {
    dashboard: ["read"],
    evaluations: ["read", "write"],
  },
  viewAccessKeys: [
    "dashboard.manager",
    "evaluations.my",
    "notifications.center",
  ],
  homeViewKey: "dashboard.manager",
  profile: {
    id: 703,
    firstName: "Grace",
    lastName: "Lead",
    onboardingStatus: "completed",
    onboardingChecklistCompleted: true,
    inductionCompleted: true,
  },
};

const evaluationDirectory = {
  employees: [
    {
      id: 101,
      firstName: "Ann",
      lastName: "Mutie",
      managerId: 201,
      positionTitle: "Audit Associate",
      department: { id: 11, name: "Audit" },
    },
    {
      id: 201,
      firstName: "Grace",
      lastName: "Lead",
      managerId: 301,
      positionTitle: "Audit Manager",
      department: { id: 11, name: "Audit" },
    },
    {
      id: 301,
      firstName: "Ronald",
      lastName: "Bwosi",
      managerId: null,
      positionTitle: "Partner",
      department: { id: 11, name: "Audit" },
    },
    {
      id: 804,
      firstName: "Eli",
      lastName: "Analyst",
      managerId: 702,
      positionTitle: "Senior Associate",
      department: { id: 11, name: "Audit" },
    },
  ],
  departments: [{ id: 11, name: "Audit" }],
};

const buildEnvelope = (data: unknown, status = 200) => ({
  status,
  contentType: "application/json",
  headers: corsHeaders,
  body: JSON.stringify({
    success: status >= 200 && status < 400,
    statusCode: status,
    message: status >= 200 && status < 400 ? "OK" : "Error",
    data,
    timestamp: TIMESTAMP,
  }),
});

const fulfillJson = async (route: Route, data: unknown, status = 200) => {
  await route.fulfill(buildEnvelope(data, status));
};

const fulfillNoContent = async (route: Route) => {
  await route.fulfill({
    status: 204,
    headers: corsHeaders,
    body: "",
  });
};

const handleOptions = async (route: Route) => {
  if (route.request().method() !== "OPTIONS") return false;
  await fulfillNoContent(route);
  return true;
};

const withSession = async (page: Page, user: MockUser, token = "playwright-token") => {
  await page.addInitScript(
    ({ seededUser, seededToken }) => {
      window.localStorage.setItem("rg_token", seededToken);
      window.localStorage.setItem("rg_user", JSON.stringify(seededUser));
    },
    { seededUser: user, seededToken: token }
  );
};

const installDefaultApiFallbacks = async (page: Page, currentUser?: MockUser | null) => {
  await page.route(`${API_ORIGIN}/api/**`, async (route) => {
    if (await handleOptions(route)) return;

    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api/, "");
    const method = request.method();

    if (method === "GET" && path === "/auth/me" && currentUser) {
      await fulfillJson(route, currentUser);
      return;
    }

    if (method === "GET" && path === "/notifications/unread-count") {
      await fulfillJson(route, { unreadCount: 0 });
      return;
    }

    if (method === "GET" && path.startsWith("/notifications")) {
      await fulfillJson(route, []);
      return;
    }

    if (method === "PATCH" && path.startsWith("/notifications/")) {
      await fulfillJson(route, { updated: true });
      return;
    }

    if (method === "GET" && path === "/performance-scores/me") {
      await fulfillJson(route, {});
      return;
    }

    if (method === "GET" && path.startsWith("/employee-project-allocations")) {
      await fulfillJson(route, []);
      return;
    }

    if (method === "GET" && path.startsWith("/reports")) {
      await fulfillJson(route, []);
      return;
    }

    if (method === "GET" && path.startsWith("/time-entries")) {
      await fulfillJson(route, []);
      return;
    }

    if (method === "GET" && path.startsWith("/jobs")) {
      await fulfillJson(route, []);
      return;
    }

    if (method === "GET" && path.startsWith("/finance")) {
      await fulfillJson(route, {});
      return;
    }

    if (path === "/auth/logout") {
      await fulfillJson(route, { ok: true });
      return;
    }

    await fulfillJson(route, {});
  });
};

const selectRadixOption = async (page: Page, testId: string, optionName: RegExp | string) => {
  await page.getByTestId(testId).click();
  const option = page.getByRole("option", { name: optionName }).first();
  await option.scrollIntoViewIfNeeded();
  await option.click({ force: true });
};

test("logs in through the UI and lands on the HR dashboard", async ({ page }) => {
  const loginRequests: Array<{ email: string; password: string }> = [];

  await page.route(`${API_ORIGIN}/api/**`, async (route) => {
    if (await handleOptions(route)) return;

    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api/, "");
    const method = request.method();

    if (method === "POST" && path === "/auth/login") {
      loginRequests.push(request.postDataJSON() as { email: string; password: string });
      await fulfillJson(route, {
        token: "login-token",
        user: hrUser,
      });
      return;
    }

    if (method === "GET" && path === "/auth/me") {
      await fulfillJson(route, hrUser);
      return;
    }

    if (method === "GET" && path === "/notifications/unread-count") {
      await fulfillJson(route, { unreadCount: 0 });
      return;
    }

    if (method === "GET" && path.startsWith("/notifications")) {
      await fulfillJson(route, []);
      return;
    }

    if (method === "PATCH" && path.startsWith("/notifications/")) {
      await fulfillJson(route, { updated: true });
      return;
    }

    if (method === "GET" && path === "/performance-scores/me") {
      await fulfillJson(route, {});
      return;
    }

    if (method === "GET" && path.startsWith("/employee-project-allocations")) {
      await fulfillJson(route, []);
      return;
    }

    await fulfillJson(route, {});
  });

  await page.goto("/auth", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email").fill("hr@ronalds.local");
  await page.getByLabel("Password").fill("Password123!");
  await page.getByTestId("auth-submit").click();

  await page.waitForURL("**/hr-dashboard");
  await expect(page).toHaveURL(/\/hr-dashboard$/);
  expect(loginRequests).toEqual([
    {
      email: "hr@ronalds.local",
      password: "Password123!",
    },
  ]);
});

test("creates an evaluation cycle and publishes the staged assignments", async ({ page }) => {
  const state: {
    cycles: Array<Record<string, unknown>>;
    createPayload: Record<string, unknown> | null;
    assignPayload: Record<string, unknown> | null;
  } = {
    cycles: [],
    createPayload: null,
    assignPayload: null,
  };

  await withSession(page, hrUser);
  await page.route(`${API_ORIGIN}/api/**`, async (route) => {
    if (await handleOptions(route)) return;

    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api/, "");
    const method = request.method();

    if (method === "GET" && path === "/auth/me") {
      await fulfillJson(route, hrUser);
      return;
    }

    if (method === "GET" && path === "/evaluations/cycles") {
      await fulfillJson(route, state.cycles);
      return;
    }

    if (method === "GET" && path === "/evaluations/directory") {
      await fulfillJson(route, evaluationDirectory);
      return;
    }

    if (method === "GET" && path === "/evaluation-templates") {
      await fulfillJson(route, []);
      return;
    }

    if (method === "POST" && path === "/evaluations/cycles") {
      state.createPayload = request.postDataJSON() as Record<string, unknown>;
      const cycle = {
        id: 42,
        title: state.createPayload.title,
        description: state.createPayload.description || null,
        cycleType: state.createPayload.cycleType || "annual",
        startDate: state.createPayload.startDate,
        endDate: state.createPayload.endDate,
        status: "draft",
        totalAssignments: 0,
        submittedAssignments: 0,
        pendingAssignments: 0,
        completionPercent: 0,
        departmentProgress: [],
      };
      state.cycles = [cycle];
      await fulfillJson(route, cycle);
      return;
    }

    if (method === "POST" && path === "/evaluations/cycles/42/assign") {
      state.assignPayload = request.postDataJSON() as Record<string, unknown>;
      const assignments = Array.isArray(state.assignPayload.assignments)
        ? (state.assignPayload.assignments as Array<Record<string, unknown>>)
        : [];
      state.cycles = state.cycles.map((cycle) =>
        cycle.id === 42
          ? {
              ...cycle,
              totalAssignments: assignments.length,
              pendingAssignments: assignments.length,
            }
          : cycle
      );
      await fulfillJson(route, {
        cycleId: 42,
        count: assignments.length,
        assignments,
      });
      return;
    }

    await fulfillJson(route, {});
  });

  await page.goto("/evaluations/cycles");
  await expect(page.getByRole("heading", { name: "Create and Launch Evaluation" })).toBeVisible();

  await page.getByTestId("evaluation-cycle-title").fill("Q2 Audit Performance Review");
  await selectRadixOption(page, "evaluation-select-person-trigger", /Ann Mutie/i);
  await page.getByTestId("evaluation-add-person").click();
  await page.getByTestId("evaluation-save-cycle-draft").click();
  await page.getByTestId("evaluation-publish-assignments").click();

  await expect(page.getByText("Assignments published", { exact: true })).toBeVisible();
  expect(state.createPayload).toMatchObject({
    title: "Q2 Audit Performance Review",
    cycleType: "annual",
    enableDownwardEvaluation: true,
    enablePeerEvaluation: false,
  });
  expect(state.assignPayload).toEqual({
    assignments: [
      {
        evaluateeId: 101,
        evaluatorId: 201,
        relationship: "manager",
        dueDate: expect.any(String),
      },
    ],
  });
});

test("submits an evaluation assignment with a score and evaluator signature", async ({ page }) => {
  let submitPayload: Record<string, unknown> | null = null;

  await withSession(page, evaluatorUser);
  await page.route(`${API_ORIGIN}/api/**`, async (route) => {
    if (await handleOptions(route)) return;

    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api/, "");
    const method = request.method();

    if (method === "GET" && path === "/auth/me") {
      await fulfillJson(route, evaluatorUser);
      return;
    }

    if (method === "GET" && path === "/evaluations/assignments/88") {
      await fulfillJson(route, {
        id: 88,
        cycleId: 42,
        evaluateeId: 101,
        evaluatorId: 201,
        relationship: "manager",
        status: "pending",
        dueDate: "2026-03-20",
        evaluatee: {
          id: 101,
          firstName: "Ann",
          lastName: "Mutie",
        },
        evaluator: {
          id: 201,
          firstName: "Grace",
          lastName: "Lead",
        },
        cycle: {
          id: 42,
          title: "Q2 Audit Performance Review",
          status: "active",
        },
        template: {
          id: 5,
          name: "AssessTEAM Streamlined 360 Template",
          questions: [
            {
              id: 1,
              text: "Quality of deliverables",
              category: "competency",
              weight: 1,
              order: 1,
            },
          ],
        },
        responses: [],
        definition: {
          id: 900,
          requireEvaluatorSignature: true,
          requireEvaluateeSignature: false,
          processAnonymously: false,
          excludeFromScore: false,
        },
        workflow: {
          dueDate: "2026-03-20",
          isOverdue: false,
          cancelIfPastDue: false,
          reminderCadence: "weekly",
        },
        viewerContext: {
          isEvaluator: true,
          isEvaluatee: false,
          canSubmit: true,
          canAcknowledge: false,
          canViewScoreReport: false,
        },
        anonymity: {
          processAnonymously: false,
          viewerSeesEvaluatorIdentity: true,
          evaluatorLabel: "Grace Lead",
        },
        signatureStatus: {
          evaluatorSigned: false,
          evaluateeAcknowledged: false,
        },
        submissionSummary: {
          evaluatorComment: "",
          evaluatorSigned: false,
          evaluateeAcknowledged: false,
        },
      });
      return;
    }

    if (method === "POST" && path === "/evaluations/assignments/88/submit") {
      submitPayload = request.postDataJSON() as Record<string, unknown>;
      await fulfillJson(route, {
        id: 88,
        cycleId: 42,
        evaluateeId: 101,
        evaluatorId: 201,
        relationship: "manager",
        status: "submitted",
        dueDate: "2026-03-20",
        submittedAt: TIMESTAMP,
        template: {
          id: 5,
          name: "AssessTEAM Streamlined 360 Template",
          questions: [
            {
              id: 1,
              text: "Quality of deliverables",
              category: "competency",
              weight: 1,
              order: 1,
            },
          ],
        },
        responses: [
          {
            questionId: 1,
            score: 5,
            comment: "",
          },
        ],
        definition: {
          id: 900,
          requireEvaluatorSignature: true,
          processAnonymously: false,
          excludeFromScore: false,
        },
        viewerContext: {
          isEvaluator: true,
          isEvaluatee: false,
          canSubmit: true,
          canAcknowledge: false,
          canViewScoreReport: false,
        },
        signatureStatus: {
          evaluatorSigned: true,
          evaluatorSignedAt: TIMESTAMP,
          evaluateeAcknowledged: false,
        },
        submissionSummary: {
          evaluatorComment: "Strong quarter overall.",
          submittedAt: TIMESTAMP,
          evaluatorSigned: true,
          evaluateeAcknowledged: false,
        },
      });
      return;
    }

    await fulfillJson(route, {});
  });

  await page.goto("/evaluations/assignments/88");
  await expect(page.getByRole("heading", { name: /Workspace$/ })).toBeVisible();

  await page.getByTestId("evaluation-score-1-5").click();
  await page.getByTestId("evaluation-evaluator-signature").click();
  await page.getByTestId("evaluation-submit").click();

  await expect(page.getByText("Evaluation submitted", { exact: true })).toBeVisible();
  expect(submitPayload).toEqual({
    responses: [
      {
        questionId: 1,
        score: 5,
        comment: "",
      },
    ],
    evaluatorSigned: true,
  });
});
