const postMock = jest.fn();
const patchMock = jest.fn();
const getMock = jest.fn();
const deleteMock = jest.fn();
const setTokenMock = jest.fn();
const setUserMock = jest.fn();
const clearAuthMock = jest.fn();

jest.mock("./client", () => ({
  api: {
    post: (...args: any[]) => postMock(...args),
    patch: (...args: any[]) => patchMock(...args),
    get: (...args: any[]) => getMock(...args),
    delete: (...args: any[]) => deleteMock(...args),
  },
  setToken: (...args: any[]) => setTokenMock(...args),
  setUser: (...args: any[]) => setUserMock(...args),
  clearAuth: (...args: any[]) => clearAuthMock(...args),
}));

import authAPI from "./auth";
import evaluationsAPI from "./evaluations";

describe("frontend smoke flows", () => {
  beforeEach(() => {
    postMock.mockReset();
    patchMock.mockReset();
    getMock.mockReset();
    deleteMock.mockReset();
    setTokenMock.mockReset();
    setUserMock.mockReset();
    clearAuthMock.mockReset();
  });

  it("logs in and persists the authenticated session", async () => {
    postMock.mockResolvedValueOnce({
      token: "session-token",
      user: {
        id: 7,
        email: "hr@ronalds.local",
        roles: [{ role: { name: "HR" } }],
      },
    });

    const result = await authAPI.login("hr@ronalds.local", "Password123!");

    expect(result).toEqual({
      token: "session-token",
      user: {
        id: 7,
        email: "hr@ronalds.local",
        roles: [{ role: { name: "HR" } }],
      },
    });
    expect(postMock).toHaveBeenCalledWith("/auth/login", {
      email: "hr@ronalds.local",
      password: "Password123!",
    });
    expect(setTokenMock).toHaveBeenCalledWith("session-token");
    expect(setUserMock).toHaveBeenCalledWith({
      id: 7,
      email: "hr@ronalds.local",
      roles: [{ role: { name: "HR" } }],
    });
  });

  it("launches an evaluation cycle and publishes evaluator assignments", async () => {
    postMock
      .mockResolvedValueOnce({
        id: 42,
        title: "Q2 360 Review",
        cycleType: "quarterly",
        startDate: "2026-04-01",
        endDate: "2026-06-30",
        status: "draft",
        totalAssignments: 0,
        submittedAssignments: 0,
        pendingAssignments: 0,
        completionPercent: 0,
        departmentProgress: [],
      })
      .mockResolvedValueOnce({
        cycleId: 42,
        count: 2,
        assignments: [],
      });

    await evaluationsAPI.createCycle({
      title: "Q2 360 Review",
      startDate: "2026-04-01",
      endDate: "2026-06-30",
      cycleType: "quarterly",
      processAnonymously: true,
      requireEvaluatorSignature: true,
    });

    await evaluationsAPI.assignEvaluators(42, {
      assignments: [
        {
          evaluateeId: 101,
          evaluatorId: 201,
          relationship: "manager",
          dueDate: "2026-06-20",
        },
        {
          evaluateeId: 101,
          evaluatorId: 202,
          relationship: "peer",
          dueDate: "2026-06-20",
        },
      ],
    });

    expect(postMock).toHaveBeenNthCalledWith(1, "/evaluations/cycles", {
      title: "Q2 360 Review",
      startDate: "2026-04-01",
      endDate: "2026-06-30",
      cycleType: "quarterly",
      processAnonymously: true,
      requireEvaluatorSignature: true,
    });
    expect(postMock).toHaveBeenNthCalledWith(2, "/evaluations/cycles/42/assign", {
      assignments: [
        {
          evaluateeId: 101,
          evaluatorId: 201,
          relationship: "manager",
          dueDate: "2026-06-20",
        },
        {
          evaluateeId: 101,
          evaluatorId: 202,
          relationship: "peer",
          dueDate: "2026-06-20",
        },
      ],
    });
  });

  it("submits an evaluation assignment with scored responses and signature state", async () => {
    postMock.mockResolvedValueOnce({
      id: 88,
      status: "submitted",
      submittedAt: "2026-06-21T08:00:00.000Z",
    });

    await evaluationsAPI.submitEvaluation(88, {
      responses: [
        { questionId: 1, score: 5, comment: "Strong stakeholder handling." },
        { questionId: 2, score: 4 },
      ],
      evaluatorComment: "Solid quarter overall.",
      evaluatorSigned: true,
    });

    expect(postMock).toHaveBeenCalledWith("/evaluations/assignments/88/submit", {
      responses: [
        { questionId: 1, score: 5, comment: "Strong stakeholder handling." },
        { questionId: 2, score: 4 },
      ],
      evaluatorComment: "Solid quarter overall.",
      evaluatorSigned: true,
    });
  });
});
