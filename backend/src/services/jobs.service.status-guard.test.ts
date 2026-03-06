import prisma from "../prisma";
import jobService from "./jobs.service";

jest.mock("../prisma", () => {
  const prismaMock = {
    job: {
      update: jest.fn(),
    },
  };

  return {
    __esModule: true,
    default: prismaMock,
    prisma: prismaMock,
  };
});

type PrismaMock = {
  job: {
    update: jest.Mock;
  };
};

const mockedPrisma = prisma as unknown as PrismaMock;

describe("JobService.updateJob status guard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("rejects direct status updates and requires the status endpoint", async () => {
    const getJobByIdSpy = jest
      .spyOn(jobService as any, "getJobById")
      .mockResolvedValue({ id: 44, managerProfileId: 77 });

    await expect(
      jobService.updateJob(
        44,
        { status: "completed" as any },
        { userId: 900, profileId: 77, roles: ["manager"] }
      )
    ).rejects.toEqual(
      expect.objectContaining({
        statusCode: 400,
        message: expect.stringContaining("PATCH /jobs/:jobId/status"),
      })
    );

    expect(mockedPrisma.job.update).not.toHaveBeenCalled();
    getJobByIdSpy.mockRestore();
  });
});
