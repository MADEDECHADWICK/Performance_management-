import nodemailer from "nodemailer";

type SendOnboardingEmailInput = {
  to: string;
  fullName: string;
  temporaryPassword: string;
  loginUrl: string;
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
  const subject = "Your Ronalds LLP account is ready";
  const text = [
    `Hello ${input.fullName},`,
    "",
    "Your account has been created in Ronalds LLP Performance Management.",
    "",
    `Temporary password: ${input.temporaryPassword}`,
    `Login: ${input.loginUrl}`,
    `Temporary password expiry: ${formatExpiry(input.expiresAt)}`,
    "",
    "After sign-in, you will be required to set a new password.",
  ].join("\n");

  const html = `
    <p>Hello ${input.fullName},</p>
    <p>Your account has been created in Ronalds LLP Performance Management.</p>
    <p><strong>Temporary password:</strong> ${input.temporaryPassword}</p>
    <p><strong>Login:</strong> <a href="${input.loginUrl}">${input.loginUrl}</a></p>
    <p><strong>Temporary password expiry:</strong> ${formatExpiry(input.expiresAt)}</p>
    <p>After sign-in, you will be required to set a new password.</p>
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
