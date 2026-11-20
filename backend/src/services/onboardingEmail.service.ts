import nodemailer from "nodemailer";

type SendOnboardingEmailInput = {
  to: string;
  fullName: string;
  inviteUrl: string;
  expiresAt: Date;
};

type SendOnboardingEmailResult = {
  delivered: boolean;
  reason?: string;
};

const formatExpiry = (date: Date) =>
  date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

const buildMessage = (input: SendOnboardingEmailInput) => {
  const subject = "Set your Ronalds LLP password and start onboarding";
  const text = [
    `Hello ${input.fullName},`,
    "",
    "Your account has been created in Ronalds LLP Performance Management.",
    "",
    `Set your password and start onboarding: ${input.inviteUrl}`,
    `This one-time link expires: ${formatExpiry(input.expiresAt)}`,
    "",
    "If the link has expired, contact HR to resend your invitation.",
  ].join("\n");

  const html = `
    <p>Hello ${input.fullName},</p>
    <p>Your account has been created in Ronalds LLP Performance Management.</p>
    <p><a href="${input.inviteUrl}"><strong>Set your password and start onboarding</strong></a></p>
    <p>This one-time link expires: ${formatExpiry(input.expiresAt)}</p>
    <p>If the link has expired, contact HR to resend your invitation.</p>
  `;

  return { subject, text, html };
};

const sendViaSmtp = async (
  input: SendOnboardingEmailInput,
  smtpHost: string,
  smtpPort: number,
  smtpSecure: boolean,
  smtpUser: string | undefined,
  smtpPass: string | undefined,
  from: string
): Promise<SendOnboardingEmailResult> => {
  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: smtpUser && smtpPass ? { user: smtpUser, pass: smtpPass } : undefined,
  });

  const message = buildMessage(input);
  try {
    await transporter.sendMail({
      from,
      to: input.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    return { delivered: true };
  } catch (error: any) {
    console.error(
      `[onboarding-email] Failed to deliver onboarding email to ${input.to}:`,
      error?.message || error
    );
    return { delivered: false, reason: "smtp_send_failed" };
  }
};

export const sendOnboardingEmail = async (
  input: SendOnboardingEmailInput
): Promise<SendOnboardingEmailResult> => {
  const smtpHost = process.env.SMTP_HOST || "smtp.gmail.com";
  const smtpPort = Number(process.env.SMTP_PORT || 587);
  const smtpSecure = process.env.SMTP_SECURE === "true";
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpFrom =
    process.env.SMTP_FROM ||
    (smtpUser ? `"Performance System" <${smtpUser}>` : "noreply@ronalds.local");

  if (!smtpUser || !smtpPass) {
    console.warn(
      `[onboarding-email] SMTP credentials are not configured. Onboarding email not delivered for ${input.to}.`
    );
    return { delivered: false, reason: "smtp_not_configured" };
  }

  return sendViaSmtp(input, smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass, smtpFrom);
};
