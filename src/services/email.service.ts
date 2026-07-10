import nodemailer from "nodemailer";
import { env } from "../config/env";

const transporter = nodemailer.createTransport({
  host: env.smtp.host,
  port: env.smtp.port,
  secure: env.smtp.port === 465,
  auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
});

async function send(to: string, subject: string, html: string) {
  if (!env.smtp.host) {
    // In local/dev environments without SMTP configured, log instead of sending.
    // eslint-disable-next-line no-console
    console.log(`[email:dev] to=${to} subject="${subject}"\n${html}`);
    return;
  }
  await transporter.sendMail({ from: env.smtp.from, to, subject, html });
}

export const emailService = {
  async sendVerificationEmail(to: string, token: string) {
    const link = `${env.clientUrl}/verify-email?token=${token}`;
    await send(
      to,
      "Verify your email",
      `<p>Welcome! Please verify your email by clicking the link below:</p>
       <p><a href="${link}">${link}</a></p>`
    );
  },

  async sendPasswordResetEmail(to: string, token: string) {
    const link = `${env.clientUrl}/reset-password?token=${token}`;
    await send(
      to,
      "Reset your password",
      `<p>We received a request to reset your password. This link expires in 1 hour.</p>
       <p><a href="${link}">${link}</a></p>
       <p>If you didn't request this, you can safely ignore this email.</p>`
    );
  },
};
