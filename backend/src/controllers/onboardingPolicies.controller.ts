import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { errorResponse, successResponse } from "../utils/response";
import {
  OnboardingPoliciesService,
  UpsertOnboardingPolicyInput,
} from "../services/onboardingPolicies.service";

const authFromReq = (req: AuthRequest) => ({
  userId: req.user!.userId,
  profileId: req.user!.profileId!,
  roles: req.userRoles ?? [],
});

export class OnboardingPoliciesController {
  static async list(req: AuthRequest, res: Response) {
    try {
      const policies = await OnboardingPoliciesService.list(authFromReq(req));
      res.json(successResponse({ policies }, "Onboarding policies retrieved"));
    } catch (e: any) {
      console.error("OnboardingPoliciesController.list error:", e);
      res
        .status(e.statusCode ?? 500)
        .json(errorResponse(e.message ?? "Failed to retrieve onboarding policies", e.statusCode ?? 500));
    }
  }

  static async getById(req: AuthRequest, res: Response) {
    try {
      const policyId = Number(req.params.policyId);
      const policy = await OnboardingPoliciesService.getById(policyId, authFromReq(req));
      res.json(successResponse(policy, "Onboarding policy retrieved"));
    } catch (e: any) {
      console.error("OnboardingPoliciesController.getById error:", e);
      res
        .status(e.statusCode ?? 500)
        .json(errorResponse(e.message ?? "Failed to retrieve onboarding policy", e.statusCode ?? 500));
    }
  }

  static async getBySlug(req: AuthRequest, res: Response) {
    try {
      const policy = await OnboardingPoliciesService.getBySlug(req.params.slug, authFromReq(req));
      res.json(successResponse(policy, "Onboarding policy retrieved"));
    } catch (e: any) {
      console.error("OnboardingPoliciesController.getBySlug error:", e);
      res
        .status(e.statusCode ?? 500)
        .json(errorResponse(e.message ?? "Failed to retrieve onboarding policy", e.statusCode ?? 500));
    }
  }

  static async create(req: AuthRequest, res: Response) {
    try {
      const payload: UpsertOnboardingPolicyInput = req.body ?? {};
      const created = await OnboardingPoliciesService.create(payload, authFromReq(req));
      res.status(201).json(successResponse(created, "Onboarding policy created", 201));
    } catch (e: any) {
      console.error("OnboardingPoliciesController.create error:", e);
      res
        .status(e.statusCode ?? 400)
        .json(errorResponse(e.message ?? "Failed to create onboarding policy", e.statusCode ?? 400));
    }
  }

  static async update(req: AuthRequest, res: Response) {
    try {
      const policyId = Number(req.params.policyId);
      const payload: Partial<UpsertOnboardingPolicyInput> = req.body ?? {};
      const updated = await OnboardingPoliciesService.update(policyId, payload, authFromReq(req));
      res.json(successResponse(updated, "Onboarding policy updated"));
    } catch (e: any) {
      console.error("OnboardingPoliciesController.update error:", e);
      res
        .status(e.statusCode ?? 400)
        .json(errorResponse(e.message ?? "Failed to update onboarding policy", e.statusCode ?? 400));
    }
  }
}
