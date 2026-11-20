import { expect, test, type Page } from "@playwright/test";

const API_ORIGIN = process.env.PLAYWRIGHT_LIVE_API_ORIGIN || "http://127.0.0.1:4000";
const HR_EMAIL = process.env.SMOKE_HR_EMAIL || "hr@ronalds.local";
const MANAGER_EMAIL = process.env.SMOKE_MANAGER_EMAIL || "manager@ronalds.local";
const PASSWORD = process.env.SMOKE_PASSWORD || "Password123!";
const LIVE_SMOKE_PREFIX = "[PLAYWRIGHT_LIVE_SMOKE]";

type AuthenticatedUser = {
  id: number;
  email: string;
  profile?: {
    id: number;
    firstName?: string;
    lastName?: string;
  };
  roles?: Array<{ role: { name: string } }>;
};

type LoginResponse = {
  token: string;
  user: AuthenticatedUser;
};

type TeamDirectoryPerson = {
  id: number;
  firstName: string;
  lastName: string;
  managerId?: number | null;
};

const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);

const addDays = (date: Date, days: number) =>
  new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

async function requestJson<T>(
  method: string,
  path: string,
  options: { token?: string; body?: unknown } = {}
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${API_ORIGIN}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`${method} ${path} failed with ${response.status}: ${JSON.stringify(payload)}`);
  }

  return payload as T;
}

const unwrap = <T>(payload: T | { data: T }) =>
  payload && typeof payload === "object" && "data" in payload
    ? (payload as { data: T }).data
    : (payload as T);

const login = (email: string) =>
  requestJson<LoginResponse>("POST", "/api/auth/login", {
    body: { email, password: PASSWORD },
  });

const withSession = async (page: Page, session: LoginResponse) => {
  await page.addInitScript(
    ({ token, user }) => {
      window.localStorage.setItem("rg_token", token);
      window.localStorage.setItem("rg_user", JSON.stringify(user));
    },
    {
      token: session.token,
      user: session.user,
    }
  );
};

const getManagedEvaluatee = async (token: string, managerProfileId: number) => {
  const directory = unwrap(
    await requestJson<{ data?: { employees: TeamDirectoryPerson[] }; employees?: TeamDirectoryPerson[] }>(
      "GET",
      "/api/evaluations/directory",
      { token }
    )
  ) as { employees?: TeamDirectoryPerson[] };
  const employees = Array.isArray(directory?.employees) ? directory.employees : [];
  const evaluatee = employees.find((employee) => employee.managerId === managerProfileId);

  if (!evaluatee) {
    throw new Error("No managed employee found in evaluation directory for seeded manager");
  }

  return evaluatee;
};

const createLiveAssignment = async (hrToken: string, managerToken: string, managerProfileId: number) => {
  const evaluatee = await getManagedEvaluatee(hrToken, managerProfileId);
  const now = new Date();
  const cycle = unwrap(
    await requestJson<any>("POST", "/api/evaluations/cycles", {
      token: hrToken,
      body: {
        title: `${LIVE_SMOKE_PREFIX} Cycle ${Date.now()}`,
        description: "Live Playwright evaluation cycle",
        cycleType: "quarterly",
        startDate: toIsoDate(now),
        endDate: toIsoDate(addDays(now, 30)),
        dueDate: toIsoDate(addDays(now, 7)),
        enableSelfEvaluation: false,
        enablePeerEvaluation: false,
        enableUpwardEvaluation: false,
        enableDownwardEvaluation: true,
        processAnonymously: false,
        requireEvaluatorSignature: true,
      },
    })
  ) as { id: number };

  await requestJson("POST", `/api/evaluations/cycles/${cycle.id}/assign`, {
    token: hrToken,
    body: {
      assignments: [
        {
          evaluateeId: evaluatee.id,
          evaluatorId: managerProfileId,
          relationship: "manager",
          dueDate: toIsoDate(addDays(now, 7)),
        },
      ],
    },
  });

  const assignments = unwrap(
    await requestJson<any>("GET", "/api/evaluations/assignments/mine", {
      token: managerToken,
    })
  ) as Array<{ id: number; cycleId?: number | null }>;

  const assignment = assignments.find((item) => item.cycleId === cycle.id);
  if (!assignment?.id) {
    throw new Error("Published assignment was not visible to the manager");
  }

  return {
    assignmentId: assignment.id,
    cycleId: cycle.id,
  };
};

test.describe("live launch readiness", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(
    !process.env.PLAYWRIGHT_LIVE_BACKEND,
    "Live backend smoke is only enabled through the dedicated runner."
  );

  test("logs in through the live backend and lands on the HR dashboard", async ({ page }) => {
    await page.goto("/auth", { waitUntil: "domcontentloaded" });
    await page.getByLabel("Email").fill(HR_EMAIL);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByTestId("auth-submit").click();

    await page.waitForURL("**/hr-dashboard");
    await expect(page).toHaveURL(/\/hr-dashboard$/);
  });

  test.skip("submits a live evaluation assignment from the workspace", async ({ page }) => {
    const hrSession = await login(HR_EMAIL);
    const managerSession = await login(MANAGER_EMAIL);
    const managerProfileId = managerSession.user.profile?.id;

    if (!managerProfileId) {
      throw new Error("Manager login did not include a profile id");
    }

    const { assignmentId } = await createLiveAssignment(
      hrSession.token,
      managerSession.token,
      managerProfileId
    );

    const detail = unwrap(
      await requestJson<any>("GET", `/api/evaluations/assignments/${assignmentId}`, {
        token: managerSession.token,
      })
    ) as { template?: { questions?: Array<{ id: number }> } };
    const questionIds = (detail.template?.questions || []).map((question) => question.id);

    if (questionIds.length === 0) {
      throw new Error("Live assignment did not include any evaluation questions");
    }

    await withSession(page, managerSession);
    await page.goto(`/evaluations/assignments/${assignmentId}`);
    await expect(page.getByRole("heading", { name: /Workspace$/ })).toBeVisible();

    for (const questionId of questionIds) {
      const scoreButton = page.getByTestId(`evaluation-score-${questionId}-5`);
      await scoreButton.scrollIntoViewIfNeeded();
      await scoreButton.click();
    }
    await page.getByTestId("evaluation-evaluator-signature").click();
    await page.getByTestId("evaluation-submit").click();

    await expect(page.getByTestId("evaluation-submit")).toHaveCount(0);
    await expect(
      page.getByText("This assignment is complete. Review the responses and score summary above.")
    ).toBeVisible();

    const submitted = unwrap(
      await requestJson<any>("GET", `/api/evaluations/assignments/${assignmentId}`, {
        token: managerSession.token,
      })
    ) as { status?: string };

    expect(String(submitted.status || "").toLowerCase()).toBe("submitted");
  });

});
