import { pool } from "../config/db";

const LOG_ENABLED = process.env.PUBLIC_LOG_APPLICATIONS !== "false";

type LogStatus =
  | "received"
  | "duplicate"
  | "rate_limited"
  | "captcha_failed"
  | "job_closed"
  | "invalid"
  | "error";

type LogParams = {
  jobId: string;
  email: string;
  ip?: string | null;
  userAgent?: string | null;
  status: LogStatus;
  recaptchaScore?: number | null;
  error?: string | null;
};

export async function logPublicApplicationAttempt(params: LogParams): Promise<void> {
  if (!LOG_ENABLED) return;
  try {
    await pool.query(
      `
        INSERT INTO public_applications_log
          (job_id, candidate_email, status, error_message, ip, user_agent, recaptcha_score)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        params.jobId,
        params.email,
        params.status,
        params.error ?? null,
        params.ip ?? null,
        params.userAgent ?? null,
        typeof params.recaptchaScore === "number" ? params.recaptchaScore : null,
      ],
    );
  } catch (error) {
    console.warn("[public] No se pudo registrar el log de postulacion", error);
  }
}
