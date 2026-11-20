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
});
