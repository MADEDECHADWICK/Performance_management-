const API_BASE = process.env.SMOKE_API_BASE || "http://localhost:4000/api";
const HR_EMAIL = process.env.SMOKE_HR_EMAIL || "hr@ronalds.local";
const MANAGER_EMAIL = process.env.SMOKE_MANAGER_EMAIL || "manager@ronalds.local";
const PASSWORD = process.env.SMOKE_PASSWORD || "Password123!";

const now = new Date();
const stamp = [
  now.getFullYear(),
  String(now.getMonth() + 1).padStart(2, "0"),
  String(now.getDate()).padStart(2, "0"),
  String(now.getHours()).padStart(2, "0"),
  String(now.getMinutes()).padStart(2, "0"),
  String(now.getSeconds()).padStart(2, "0"),
].join("");

const toIsoDate = (date) => date.toISOString().slice(0, 10);
const addDays = (date, days) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

async function request(method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    const error = new Error(`${method} ${path} failed with ${response.status}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

function unwrap(payload) {
  if (payload && typeof payload === "object" && "data" in payload) {
    return payload.data;
  }
  return payload;
}

async function login(email, password) {
  return request("POST", "/auth/login", {
    body: { email, password },
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function logStep(label, data) {
  console.log(`\n[ok] ${label}`);
  if (data !== undefined) {
    console.log(JSON.stringify(data, null, 2));
  }
}

async function main() {
  console.log(`[info] Using API base ${API_BASE}`);

  const hrLogin = await login(HR_EMAIL, PASSWORD);
  const managerLogin = await login(MANAGER_EMAIL, PASSWORD);
  const hrToken = hrLogin.token;
  const managerToken = managerLogin.token;
  const managerProfileId = managerLogin.user?.profile?.id;

  assert(hrToken, "HR login did not return a token");
  assert(managerToken, "Manager login did not return a token");
  assert(managerProfileId, "Manager login did not include a profile id");

  logStep("Authenticated seeded users", {
    hrProfileId: hrLogin.user.profile.id,
    managerProfileId,
  });

  const directory = unwrap(await request("GET", "/evaluations/directory", { token: hrToken }));
  const employees = Array.isArray(directory?.employees) ? directory.employees : [];
  const evaluatee = employees.find((employee) => employee.managerId === managerProfileId);

  assert(employees.length > 0, "Evaluation directory returned no employees");
  assert(evaluatee, "No employee in the evaluation directory is assigned to the seeded manager");

  logStep("Loaded evaluation directory", {
    employeeCount: employees.length,
    evaluatee: {
      id: evaluatee.id,
      name: `${evaluatee.firstName} ${evaluatee.lastName}`,
      managerId: evaluatee.managerId,
    },
  });

  const cyclePayload = {
    title: `[SMOKE] Live Evaluation ${stamp}`,
    description: "Automated live smoke cycle",
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
  };

  const cycle = unwrap(await request("POST", "/evaluations/cycles", {
    token: hrToken,
    body: cyclePayload,
  }));

  assert(cycle?.id, "Cycle creation did not return an id");

  logStep("Created evaluation cycle", {
    cycleId: cycle.id,
    title: cycle.title,
    status: cycle.status,
  });

  const assignPayload = {
    assignments: [
      {
        evaluateeId: evaluatee.id,
        evaluatorId: managerProfileId,
        relationship: "manager",
        dueDate: cyclePayload.dueDate,
      },
    ],
  };

  const assignmentPublish = unwrap(await request("POST", `/evaluations/cycles/${cycle.id}/assign`, {
    token: hrToken,
    body: assignPayload,
  }));

  logStep("Published evaluator assignment", {
    cycleId: assignmentPublish.cycleId,
    assignmentCount: assignmentPublish.count,
  });

  const myAssignments = unwrap(await request("GET", "/evaluations/assignments/mine", {
    token: managerToken,
  }));
  const assignment = Array.isArray(myAssignments)
    ? myAssignments.find((item) => item.cycleId === cycle.id)
    : null;

  assert(assignment?.id, "Published assignment was not visible to the manager evaluator");

  logStep("Manager can see assignment", {
    assignmentId: assignment.id,
    status: assignment.status,
  });

  const assignmentDetail = unwrap(await request("GET", `/evaluations/assignments/${assignment.id}`, {
    token: managerToken,
  }));
  const questions = Array.isArray(assignmentDetail?.template?.questions)
    ? assignmentDetail.template.questions
    : [];

  assert(questions.length > 0, "Assignment template did not include any questions");

  const submitPayload = {
    responses: questions.map((question) => ({
      questionId: question.id,
      score: 4,
      comment: `Smoke answer for question ${question.id}`,
    })),
    evaluatorComment: "Live smoke submission",
    evaluatorSigned: true,
  };

  const submittedAssignment = unwrap(
    await request("POST", `/evaluations/assignments/${assignment.id}/submit`, {
      token: managerToken,
      body: submitPayload,
    })
  );

  assert(String(submittedAssignment?.status || "").toLowerCase() === "submitted", "Assignment did not submit");

  logStep("Submitted evaluation assignment", {
    assignmentId: assignment.id,
    submittedAt: submittedAssignment.submittedAt,
    questionCount: questions.length,
  });

  const cycleResults = unwrap(await request("GET", `/evaluations/cycles/${cycle.id}/results`, {
    token: hrToken,
  }));
  const result = Array.isArray(cycleResults?.results)
    ? cycleResults.results.find((row) => row.evaluateeId === evaluatee.id)
    : null;

  assert(result, "Cycle results did not include the evaluated employee");

  logStep("Aggregated cycle results", {
    cycleId: cycle.id,
    evaluateeId: result.evaluateeId,
    overallScore: result.overallScore,
    ratingBand: result.ratingBand,
  });

  const kpiPayload = {
    ownerProfileId: evaluatee.id,
    title: `[SMOKE] KPI ${stamp}`,
    description: "Automated live KPI smoke test",
    baseline: 50,
    target: 100,
    actual: 60,
    unit: "%",
    weight: 1,
    dueDate: toIsoDate(addDays(now, 30)),
    targetFrequency: "monthly",
    targetType: "higher_better",
    reviewFrequency: "monthly",
    commentaryRequired: true,
    dataSourceType: "manual",
  };

  const createdKpi = unwrap(await request("POST", "/kpis", {
    token: managerToken,
    body: kpiPayload,
  }));

  assert(createdKpi?.id, "KPI creation did not return an id");

  logStep("Created KPI", {
    kpiId: createdKpi.id,
    ownerProfileId: createdKpi.ownerProfileId,
    status: createdKpi.status,
  });

  const progressPayload = {
    actual: 85,
    note: "Live smoke progress update",
    measuredAt: new Date().toISOString(),
  };

  const updatedKpi = unwrap(await request("PATCH", `/kpis/${createdKpi.id}/progress`, {
    token: managerToken,
    body: progressPayload,
  }));

  const kpiDetail = unwrap(await request("GET", `/kpis/${createdKpi.id}`, {
    token: managerToken,
  }));
  const kpiDashboard = unwrap(await request("GET", `/kpis/dashboard/${evaluatee.id}`, {
    token: managerToken,
  }));

  assert(Number(updatedKpi?.actual) === 85, "KPI actual did not update to the new measurement");
  assert(Array.isArray(kpiDetail?.history) && kpiDetail.history.length > 0, "KPI history was not recorded");
  assert(kpiDashboard?.summary, "KPI dashboard did not return summary data");

  logStep("Updated KPI progress and verified measurement history", {
    kpiId: createdKpi.id,
    actual: updatedKpi.actual,
    status: updatedKpi.status,
    achievementPercent: kpiDetail.metrics?.achievementPercent,
    historyCount: kpiDetail.history.length,
    dashboardTotal: kpiDashboard.summary.total,
  });

  console.log("\n[live-smoke] completed successfully");
}

main().catch((error) => {
  console.error("\n[live-smoke] failed");
  console.error(error.message || error);
  if (error.status || error.payload) {
    console.error(
      JSON.stringify(
        {
          status: error.status || null,
          payload: error.payload || null,
        },
        null,
        2
      )
    );
  }
  process.exit(1);
});
