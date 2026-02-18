import { NotificationType } from "@prisma/client";

export type DefaultNotificationTemplate = {
  label: string;
  title: string;
  message: string;
  type: NotificationType;
  actionRequired?: boolean;
};

export const DEFAULT_EVALUATION_NOTIFICATION_TEMPLATES: DefaultNotificationTemplate[] = [
  {
    label: "evaluation.submitted.evaluatee",
    title: "Evaluation submitted",
    message:
      "Your evaluation was submitted by {{evaluatorName}}. Please acknowledge it to complete the workflow.",
    type: "action",
    actionRequired: true,
  },
  {
    label: "evaluation.submitted.hr",
    title: "Evaluation submitted",
    message:
      "Evaluation for {{evaluateeName}} was submitted by {{evaluatorName}} and is ready for calibration review.",
    type: "info",
    actionRequired: false,
  },
  {
    label: "evaluation.signed.evaluatee",
    title: "Evaluation signed",
    message: "Your evaluator {{evaluatorName}} has signed the evaluation.",
    type: "info",
    actionRequired: false,
  },
  {
    label: "evaluation.signed.hr",
    title: "Evaluation signed",
    message: "Evaluator {{evaluatorName}} signed the evaluation for {{evaluateeName}}.",
    type: "info",
    actionRequired: false,
  },
  {
    label: "evaluation.acknowledged.evaluator",
    title: "Evaluation acknowledged",
    message: "{{evaluateeName}} has acknowledged the evaluation.",
    type: "info",
    actionRequired: false,
  },
  {
    label: "evaluation.acknowledged.hr",
    title: "Evaluation acknowledged",
    message: "{{evaluateeName}} acknowledged the evaluation submitted by {{evaluatorName}}.",
    type: "info",
    actionRequired: false,
  },
  {
    label: "evaluation.reopened.evaluator",
    title: "Evaluation returned for updates",
    message: "HR has reopened the evaluation for {{evaluateeName}}. Reason: {{reason}}",
    type: "action",
    actionRequired: true,
  },
  {
    label: "evaluation.reopened.evaluatee",
    title: "Evaluation reopened",
    message: "HR has reopened your evaluation for updates. Reason: {{reason}}",
    type: "info",
    actionRequired: false,
  },
];
