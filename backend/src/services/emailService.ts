import nodemailer from "nodemailer";

const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = String(process.env.SMTP_SECURE || "false") === "true";

let transporter: nodemailer.Transporter | null = null;

const getTransporter = () => {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return transporter;
};

export const sendEmail = async (
  to: string,
  subject: string,
  text: string,
  html?: string
) => {
  const smtpUser = String(process.env.SMTP_USER || "").trim();
  const smtpPass = String(process.env.SMTP_PASS || "").trim();

  if (!smtpUser || !smtpPass) {
    throw new Error("SMTP_USER and SMTP_PASS must be configured");
  }

  const from = process.env.SMTP_FROM || `"Performance System" <${smtpUser}>`;

  await getTransporter().sendMail({
    from,
    to,
    subject,
    text,
    html,
  });
};

