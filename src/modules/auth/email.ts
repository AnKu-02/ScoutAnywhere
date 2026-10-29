import nodemailer from "nodemailer";

export function emailReady() {
  const port = Number(process.env.SMTP_PORT || 587);
  const local = ["localhost", "127.0.0.1", "mailpit"].includes(process.env.SMTP_HOST || "");
  return Boolean(process.env.SMTP_HOST && process.env.MAIL_FROM
    && !/[\r\n]/.test(process.env.MAIL_FROM)
    && Number.isInteger(port) && port > 0 && port <= 65535
    && (!process.env.SMTP_SECURE || ["true", "false"].includes(process.env.SMTP_SECURE))
    && (Boolean(process.env.SMTP_USER) === Boolean(process.env.SMTP_PASSWORD))
    && (local || process.env.SMTP_SECURE === "true" || port === 587));
}

export async function sendAccountEmail(to: string, url: string, kind: "verify" | "reset") {
  if (!emailReady()) throw new Error("Account email delivery is not configured");
  const port = Number(process.env.SMTP_PORT || 587);
  const local = ["localhost", "127.0.0.1", "mailpit"].includes(process.env.SMTP_HOST!);
  if (!local && process.env.SMTP_SECURE !== "true" && port !== 587) throw new Error("Remote SMTP requires TLS");
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST, port,
    secure: process.env.SMTP_SECURE === "true",
    requireTLS: !local && process.env.SMTP_SECURE !== "true",
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
    connectionTimeout: 10000, socketTimeout: 10000,
  });
  const subject = kind === "verify" ? "Verify your ScoutAnywhere email" : "Reset your ScoutAnywhere password";
  // Never log recipient addresses, token links, SMTP responses or credentials.
  await transport.sendMail({ from: process.env.MAIL_FROM, to, subject,
    text: `${subject}\n\n${url}\n\nIf you did not request this, ignore this email. Email verification is not identity or property verification.` });
}