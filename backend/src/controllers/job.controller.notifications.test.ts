import { JobController } from "./job.controller";
import jobService from "../services/jobs.service";
import * as recipientNotifications from "../services/notificationRecipients";
import * as surveyRouting from "../services/surveyRouting.service";

jest.mock("../services/jobs.service", () => ({
  __esModule: true,
  default: {
    createJob: jest.fn(),
    createJobFromOnboarding: jest.fn(),
    updateJobStatus: jest.fn(),
  },
}));

jest.mock("../services/notificationRecipients", () => ({
  notifyJobCreation: jest.fn(),
  notifyJobCompletion: jest.fn(),
}));

jest.mock("../services/surveyRouting.service", () => ({
  createClientSurveyForJobCompletion: jest.fn(),
}));

const mockedJobService = jobService as jest.Mocked<typeof jobService>;
const mockedRecipientNotifications = recipientNotifications as jest.Mocked<
  typeof recipientNotifications
>;
const mockedSurveyRouting = surveyRouting as jest.Mocked<typeof surveyRouting>;

const createRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe("JobController notification producer boundaries", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("does not emit duplicate job-created notifications from controller", async () => {
    const req: any = {
      user: { userId: 1, profileId: 700, authRoles: ["hr"] },
      body: {
        managerProfileId: 300,
        jobName: "FY26 Audit",
      },
    };
    const res = createRes();
    mockedJobService.createJob.mockResolvedValue({
      id: 77,
      jobName: "FY26 Audit",
    } as any);

    await JobController.createJob(req, res);

    expect(mockedJobService.createJob).toHaveBeenCalledTimes(1);
    expect(mockedRecipientNotifications.notifyJobCreation).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("does not emit completion notifications/survey from controller (service owns event)", async () => {
    const req: any = {
      user: { userId: 1, profileId: 700, authRoles: ["hr"] },
      params: { jobId: "90" },
      body: {
        status: "completed",
        reason: "Delivered",
      },
    };
    const res = createRes();
    mockedJobService.updateJobStatus.mockResolvedValue({
      id: 90,
      status: "completed",
    } as any);

    await JobController.updateJobStatus(req, res);

    expect(mockedJobService.updateJobStatus).toHaveBeenCalledTimes(1);
    expect(mockedRecipientNotifications.notifyJobCompletion).not.toHaveBeenCalled();
    expect(mockedSurveyRouting.createClientSurveyForJobCompletion).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledTimes(1);
  });
});
