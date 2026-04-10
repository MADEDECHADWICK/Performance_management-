import { OnboardingStatus } from "@prisma/client";
import prisma from "../../src/prisma";

const DEFAULT_TARGET_EMAILS = [
  "marketing@ronalds.local",
  "manager@ronalds.local",
  "partner@ronalds.local",
  "employee@ronalds.local",
  "finance@ronalds.local",
];

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const emailArg = process.argv
  .slice(2)
  .find((value) => value.startsWith("--emails="));

const parseEmails = (raw?: string | null) =>
  String(raw || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

const requestedEmails =
  parseEmails(emailArg?.split("=")[1]) ||
  parseEmails(process.env.BYPASS_ONBOARDING_EMAILS);

const targetEmails = requestedEmails.length > 0 ? requestedEmails : DEFAULT_TARGET_EMAILS;

async function main() {
  const users = await prisma.user.findMany({
    where: {
      email: {
        in: targetEmails,
      },
    },
    select: {
      id: true,
      email: true,
      profile: {
        select: {
          id: true,
          onboardingStatus: true,
          onboardingChecklistCompleted: true,
          inductionCompleted: true,
        },
      },
    },
    orderBy: {
      email: "asc",
    },
  });

  const foundEmails = new Set(users.map((user) => user.email.toLowerCase()));
  const missingEmails = targetEmails.filter((email) => !foundEmails.has(email));
  const profileIds = users.map((user) => user.profile?.id).filter((id): id is number => Number.isFinite(id));

  if (users.length === 0 || profileIds.length === 0) {
    console.log("No matching seeded users with profiles were found.");
    if (missingEmails.length > 0) {
      console.log(`Missing emails: ${missingEmails.join(", ")}`);
    }
    return;
  }

  const onboardingCases = await prisma.employeeOnboardingCase.findMany({
    where: {
      profileId: {
        in: profileIds,
      },
    },
    select: {
      id: true,
      profileId: true,
      status: true,
      inductionChecklist: {
        select: {
          id: true,
          status: true,
          completionPercent: true,
        },
      },
    },
    orderBy: {
      id: "asc",
    },
  });

  console.log("Seeded onboarding bypass plan");
  console.log("--------------------------------");
  users.forEach((user) => {
    console.log(
      [
        user.email,
        `profileId=${user.profile?.id ?? "none"}`,
        `status=${user.profile?.onboardingStatus ?? "unknown"}`,
        `checklistComplete=${Boolean(user.profile?.onboardingChecklistCompleted)}`,
        `inductionComplete=${Boolean(user.profile?.inductionCompleted)}`,
      ].join(" | ")
    );
  });

  if (missingEmails.length > 0) {
    console.log(`Missing emails: ${missingEmails.join(", ")}`);
  }

  console.log(`Onboarding cases found: ${onboardingCases.length}`);
  console.log(`Mode: ${apply ? "APPLY" : "DRY RUN"}`);

  if (!apply) {
    console.log("");
    console.log("No data changed. Re-run with --apply to mark these profiles as onboarding-complete.");
    return;
  }

  const caseIds = onboardingCases.map((item) => item.id);
  const checklistIds = onboardingCases
    .map((item) => item.inductionChecklist?.id)
    .filter((id): id is number => Number.isFinite(id));

  const result = await prisma.$transaction(async (tx) => {
    const deletedNotifications = await tx.notification.deleteMany({
      where: {
        profileId: {
          in: profileIds,
        },
        OR: [
          {
            title: "Onboarding checklist assigned",
          },
          {
            link: "/profile?tab=onboarding",
          },
        ],
      },
    });

    const deletedPolicyAssignments =
      caseIds.length > 0
        ? await tx.statusTransition.deleteMany({
            where: {
              entityType: "OnboardingPolicyAssignment",
              entityId: {
                in: caseIds,
              },
            },
          })
        : { count: 0 };

    const deletedChecklists =
      checklistIds.length > 0
        ? await tx.inductionChecklist.deleteMany({
            where: {
              id: {
                in: checklistIds,
              },
            },
          })
        : { count: 0 };

    const deletedCases =
      caseIds.length > 0
        ? await tx.employeeOnboardingCase.deleteMany({
            where: {
              id: {
                in: caseIds,
              },
            },
          })
        : { count: 0 };

    const updatedProfiles = await tx.profile.updateMany({
      where: {
        id: {
          in: profileIds,
        },
      },
      data: {
        onboardingStatus: OnboardingStatus.completed,
        onboardingChecklistCompleted: true,
        inductionCompleted: true,
      },
    });

    return {
      deletedNotifications: deletedNotifications.count,
      deletedPolicyAssignments: deletedPolicyAssignments.count,
      deletedChecklists: deletedChecklists.count,
      deletedCases: deletedCases.count,
      updatedProfiles: updatedProfiles.count,
    };
  });

  console.log("");
  console.log("Bypass applied successfully.");
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error("Failed to bypass seeded onboarding.");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });
