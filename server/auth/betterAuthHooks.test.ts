import { randomUUID } from "crypto";
import { afterSignInHook } from "./betterAuthHooks";

const mockFindUserById = jest.fn();
const mockFindAccounts = jest.fn();
const mockUpdateUser = jest.fn();
const mockUpdateSession = jest.fn();
const mockDeleteSession = jest.fn();

jest.mock("./betterAuth", () => ({
  getBetterAuth: () =>
    Promise.resolve({
      $context: Promise.resolve({
        internalAdapter: {
          findUserById: mockFindUserById,
          findAccounts: mockFindAccounts,
          updateUser: mockUpdateUser,
          updateSession: mockUpdateSession,
          deleteSession: mockDeleteSession,
        },
      }),
    }),
}));

jest.mock("@server/commands/accountProvisioner", () => ({
  __esModule: true,
  default: jest.fn().mockRejectedValue(new Error("provisioning failed")),
}));

describe("afterSignInHook", () => {
  const session = {
    id: "test-session-id",
    userId: "test-ba-user-id",
    token: "test-session-token",
    ipAddress: "127.0.0.1",
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should revoke the session when provisioning fails", async () => {
    mockFindUserById.mockResolvedValue({
      id: session.userId,
      name: "Jenny Tester",
      email: "jenny.tester@example.com",
      outlineUserId: null,
    });
    mockFindAccounts.mockResolvedValue([
      {
        providerId: "microsoft",
        accountId: "external-id",
        scope: "openid profile email",
      },
    ]);

    await afterSignInHook(session);

    expect(mockDeleteSession).toHaveBeenCalledTimes(1);
    expect(mockDeleteSession).toHaveBeenCalledWith(session.token);
    expect(mockUpdateSession).not.toHaveBeenCalled();
  });

  it("should not revoke the session for an already provisioned user", async () => {
    const outlineUserId = randomUUID();
    mockFindUserById.mockResolvedValue({
      id: session.userId,
      name: "Jenny Tester",
      email: "jenny.tester@example.com",
      outlineUserId,
    });
    mockFindAccounts.mockResolvedValue([
      {
        providerId: "microsoft",
        accountId: "external-id",
        scope: "openid profile email",
      },
    ]);

    await afterSignInHook(session);

    expect(mockUpdateSession).toHaveBeenCalledWith(session.token, {
      outlineUserId,
    });
    expect(mockDeleteSession).not.toHaveBeenCalled();
  });
});
