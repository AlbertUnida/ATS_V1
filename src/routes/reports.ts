import { Router } from "express";
import { z } from "zod";
import { pool } from "../config/db";

const router = Router();

const dateRegex = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const PUBLIC_STATUSES = [
  "received",
  "duplicate",
  "rate_limited",
  "captcha_failed",
  "job_closed",
  "invalid",
  "error",
] as const;

const reportQuerySchema = z.object({
  start: z.string().regex(dateRegex).optional(),
  end: z.string().regex(dateRegex).optional(),
  status: z.enum(PUBLIC_STATUSES).optional(),
  company_id: z.string().uuid().optional(),
});

const invitationsQuerySchema = z.object({
  start: z.string().regex(dateRegex).optional(),
  end: z.string().regex(dateRegex).optional(),
  company_id: z.string().uuid().optional(),
});

function canViewReports(user: Express.Request["currentUser"] | undefined) {
  if (!user) return false;
  if (user.is_super_admin) return true;
  return user.rol === "admin" || user.rol === "hr_admin";
}

function pushDateRange(column: string, start: string | undefined, end: string | undefined, values: unknown[], conditions: string[]) {
  if (start) {
    values.push(start);
    conditions.push(`${column} >= $${values.length}`);
  }
  if (end) {
    values.push(`${end} 23:59:59`);
    conditions.push(`${column} <= $${values.length}`);
  }
}

router.get("/api/reports/public-applications", async (req, res) => {
  const currentUser = req.currentUser;
  if (!canViewReports(currentUser)) {
    return res.status(403).json({ message: "No autorizado" });
  }

  const parsed = reportQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ message: "Parametros invalidos", errors: parsed.error.flatten() });
  }

  const { start, end, status, company_id: companyId } = parsed.data;
  const values: unknown[] = [];
  const conditions: string[] = ["p.job_id IS NOT NULL"];

  pushDateRange("p.created_at", start, end, values, conditions);

  if (status) {
    values.push(status);
    conditions.push(`p.status = $${values.length}`);
  }

  if (companyId) {
    values.push(companyId);
    conditions.push(`j.company_id = $${values.length}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  try {
    const summaryQuery = `
      SELECT date_trunc('day', p.created_at) AS day,
             p.status,
             COUNT(*)::bigint AS total
      FROM public_applications_log p
      LEFT JOIN jobs j ON j.job_id = p.job_id
      ${whereClause}
      GROUP BY day, p.status
      ORDER BY day DESC, p.status ASC
      LIMIT 365
    `;

    const { rows } = await pool.query(summaryQuery, values);

    const totalsQuery = `
      SELECT p.status, COUNT(*)::bigint AS total
      FROM public_applications_log p
      LEFT JOIN jobs j ON j.job_id = p.job_id
      ${whereClause}
      GROUP BY p.status
    `;

    const totals = await pool.query(totalsQuery, values);

    return res.json({
      items: rows,
      totals: totals.rows,
    });
  } catch (error) {
    console.error("[reports] Error fetching public applications report", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
});

router.get("/api/reports/public-applications/conversion", async (req, res) => {
  const currentUser = req.currentUser;
  if (!canViewReports(currentUser)) {
    return res.status(403).json({ message: "No autorizado" });
  }

  const parsed = reportQuerySchema.omit({ status: true }).safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ message: "Parametros invalidos", errors: parsed.error.flatten() });
  }

  const { start, end, company_id: companyId } = parsed.data;
  const values: unknown[] = [];
  const conditions: string[] = ["p.job_id IS NOT NULL"];

  pushDateRange("p.created_at", start, end, values, conditions);

  if (companyId) {
    values.push(companyId);
    conditions.push(`j.company_id = $${values.length}`);
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`;

  try {
    const conversionQuery = `
      WITH joined AS (
        SELECT
          p.log_id,
          p.created_at,
          app.application_id,
          app.candidato_id,
          app.application_status,
          hist.first_interview,
          hist.first_offer,
          hist.first_hire
        FROM public_applications_log p
        LEFT JOIN jobs j ON j.job_id = p.job_id
        LEFT JOIN LATERAL (
          SELECT
            a.application_id,
            c.candidato_id,
            a.estado::text AS application_status
          FROM applications a
          JOIN candidatos c ON c.candidato_id = a.candidato_id
          WHERE a.job_id = p.job_id
            AND LOWER(c.email) = LOWER(p.candidate_email)
          LIMIT 1
        ) app ON TRUE
        LEFT JOIN LATERAL (
          SELECT
            MIN(changed_at) FILTER (WHERE estado_nuevo = 'Entrevista') AS first_interview,
            MIN(changed_at) FILTER (WHERE estado_nuevo = 'Oferta') AS first_offer,
            MIN(changed_at) FILTER (WHERE estado_nuevo = 'Contratado') AS first_hire
          FROM application_stage_history h
          WHERE h.application_id = app.application_id
        ) hist ON TRUE
        ${whereClause}
      )
      SELECT
        COUNT(*)::bigint AS total_logs,
        COUNT(*) FILTER (WHERE candidato_id IS NOT NULL)::bigint AS matched,
        COUNT(*) FILTER (WHERE first_interview IS NOT NULL)::bigint AS interviews,
        COUNT(*) FILTER (WHERE first_offer IS NOT NULL)::bigint AS offers,
        COUNT(*) FILTER (WHERE first_hire IS NOT NULL)::bigint AS hires
      FROM joined;
    `;

    const conversion = await pool.query(conversionQuery, values);

    const statusBreakdownQuery = `
      WITH joined AS (
        SELECT
          p.log_id,
          app.application_status
        FROM public_applications_log p
        LEFT JOIN jobs j ON j.job_id = p.job_id
        LEFT JOIN LATERAL (
          SELECT
            a.estado::text AS application_status
          FROM applications a
          JOIN candidatos c ON c.candidato_id = a.candidato_id
          WHERE a.job_id = p.job_id
            AND LOWER(c.email) = LOWER(p.candidate_email)
          LIMIT 1
        ) app ON TRUE
        ${whereClause}
      )
      SELECT COALESCE(application_status, 'sin_match') AS status,
             COUNT(*)::bigint AS total
      FROM joined
      GROUP BY application_status
    `;

    const statusRows = await pool.query(statusBreakdownQuery, values);

    return res.json({ summary: conversion.rows[0] ?? null, status: statusRows.rows });
  } catch (error) {
    console.error("[reports] Error computing conversion", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
});

router.get("/api/reports/public-applications/response-time", async (req, res) => {
  const currentUser = req.currentUser;
  if (!canViewReports(currentUser)) {
    return res.status(403).json({ message: "No autorizado" });
  }

  const parsed = reportQuerySchema.omit({ status: true }).safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ message: "Parametros invalidos", errors: parsed.error.flatten() });
  }

  const { start, end, company_id: companyId } = parsed.data;
  const values: unknown[] = [];
  const conditions: string[] = ["p.job_id IS NOT NULL"];

  pushDateRange("p.created_at", start, end, values, conditions);

  if (companyId) {
    values.push(companyId);
    conditions.push(`j.company_id = $${values.length}`);
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`;

  try {
    const responseQuery = `
      WITH matched AS (
        SELECT
          p.created_at,
          hist.first_change
        FROM public_applications_log p
        LEFT JOIN jobs j ON j.job_id = p.job_id
        LEFT JOIN LATERAL (
          SELECT
            a.application_id
          FROM applications a
          JOIN candidatos c ON c.candidato_id = a.candidato_id
          WHERE a.job_id = p.job_id
            AND LOWER(c.email) = LOWER(p.candidate_email)
          LIMIT 1
        ) app ON TRUE
        LEFT JOIN LATERAL (
          SELECT MIN(changed_at) AS first_change
          FROM application_stage_history h
          WHERE h.application_id = app.application_id
        ) hist ON TRUE
        ${whereClause} AND app.application_id IS NOT NULL AND hist.first_change IS NOT NULL
      )
      SELECT
        COUNT(*)::bigint AS samples,
        AVG(EXTRACT(EPOCH FROM (first_change - created_at))/3600)::numeric(10,2) AS avg_hours,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (first_change - created_at))/3600)::numeric(10,2) AS median_hours,
        PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (first_change - created_at))/3600)::numeric(10,2) AS p90_hours
      FROM matched;
    `;

    const result = await pool.query(responseQuery, values);
    return res.json(result.rows[0] ?? null);
  } catch (error) {
    console.error("[reports] Error computing response time", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
});

router.get("/api/reports/public-applications/sources", async (req, res) => {
  const currentUser = req.currentUser;
  if (!canViewReports(currentUser)) {
    return res.status(403).json({ message: "No autorizado" });
  }

  const parsed = reportQuerySchema.omit({ status: true }).safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ message: "Parametros invalidos", errors: parsed.error.flatten() });
  }

  const { start, end, company_id: companyId } = parsed.data;
  const values: unknown[] = [];
  const conditions: string[] = ["p.job_id IS NOT NULL"];

  pushDateRange("p.created_at", start, end, values, conditions);

  if (companyId) {
    values.push(companyId);
    conditions.push(`j.company_id = $${values.length}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  try {
    const channelCte = `
      WITH enriched AS (
        SELECT
          date_trunc('day', p.created_at) AS day,
          COALESCE(
            NULLIF(app.details->>'campaign', ''),
            NULLIF(app.details->>'channel', ''),
            NULLIF((p.source_details)::jsonb->>'campaign', ''),
            NULLIF((p.source_details)::jsonb->>'channel', ''),
            COALESCE(app.source, p.source, 'desconocido')
          ) AS channel,
          app.candidato_id,
          hist.first_interview,
          hist.first_offer,
          hist.first_hire
        FROM public_applications_log p
        LEFT JOIN jobs j ON j.job_id = p.job_id
        LEFT JOIN LATERAL (
          SELECT
            a.application_id,
            a.source,
            c.candidato_id,
            jsonb_strip_nulls(
              COALESCE(a.source_details::jsonb, '{}'::jsonb) ||
              COALESCE(p.source_details, '{}'::jsonb)
            ) AS details
          FROM applications a
          JOIN candidatos c ON c.candidato_id = a.candidato_id
          WHERE a.job_id = p.job_id
            AND LOWER(c.email) = LOWER(p.candidate_email)
          LIMIT 1
        ) app ON TRUE
        LEFT JOIN LATERAL (
          SELECT
            MIN(changed_at) FILTER (WHERE estado_nuevo = 'Entrevista') AS first_interview,
            MIN(changed_at) FILTER (WHERE estado_nuevo = 'Oferta') AS first_offer,
            MIN(changed_at) FILTER (WHERE estado_nuevo = 'Contratado') AS first_hire
          FROM application_stage_history h
          WHERE h.application_id = app.application_id
        ) hist ON TRUE
        ${whereClause}
      )
    `;

    const channelBreakdownQuery = `
      ${channelCte}
      SELECT
        day,
        channel,
        COUNT(*)::bigint AS total_logs,
        COUNT(*) FILTER (WHERE candidato_id IS NOT NULL)::bigint AS matched,
        COUNT(*) FILTER (WHERE first_interview IS NOT NULL)::bigint AS interviews,
        COUNT(*) FILTER (WHERE first_offer IS NOT NULL)::bigint AS offers,
        COUNT(*) FILTER (WHERE first_hire IS NOT NULL)::bigint AS hires
      FROM enriched
      GROUP BY day, channel
      ORDER BY day DESC, channel
      LIMIT 365
    `;

    const channelTotalsQuery = `
      ${channelCte}
      SELECT
        channel,
        COUNT(*)::bigint AS total_logs,
        COUNT(*) FILTER (WHERE candidato_id IS NOT NULL)::bigint AS matched,
        COUNT(*) FILTER (WHERE first_interview IS NOT NULL)::bigint AS interviews,
        COUNT(*) FILTER (WHERE first_offer IS NOT NULL)::bigint AS offers,
        COUNT(*) FILTER (WHERE first_hire IS NOT NULL)::bigint AS hires
      FROM enriched
      GROUP BY channel
      ORDER BY total_logs DESC
    `;

    const [channelBreakdown, channelTotals] = await Promise.all([
      pool.query(channelBreakdownQuery, values),
      pool.query(channelTotalsQuery, values),
    ]);

    const platformQuery = `
      SELECT
        date_trunc('day', p.created_at) AS day,
        CASE
          WHEN p.user_agent ILIKE '%bot%' OR p.user_agent ILIKE '%crawl%' THEN 'bot'
          WHEN p.user_agent ILIKE '%mobile%' OR p.user_agent ILIKE '%android%' OR p.user_agent ILIKE '%iphone%' OR p.user_agent ILIKE '%ipad%' THEN 'mobile'
          WHEN p.user_agent IS NULL OR p.user_agent = '' THEN 'desconocido'
          ELSE 'desktop'
        END AS platform,
        COUNT(*)::bigint AS total
      FROM public_applications_log p
      LEFT JOIN jobs j ON j.job_id = p.job_id
      ${whereClause}
      GROUP BY day, platform
      ORDER BY day DESC, platform
      LIMIT 365
    `;

    const platformBreakdown = await pool.query(platformQuery, values);

    const platformTotalsQuery = `
      SELECT platform, SUM(total)::bigint AS total
      FROM (${platformQuery}) sub
      GROUP BY platform
    `;

    const platformTotals = await pool.query(platformTotalsQuery, values);

    return res.json({
      channels: {
        breakdown: channelBreakdown.rows,
        totals: channelTotals.rows,
      },
      platforms: {
        breakdown: platformBreakdown.rows,
        totals: platformTotals.rows,
      },
    });
  } catch (error) {
    console.error("[reports] Error computing sources", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
});

router.get("/api/reports/demo-status", async (req, res) => {
  const currentUser = req.currentUser;
  if (!canViewReports(currentUser)) {
    return res.status(403).json({ message: "No autorizado" });
  }

  try {
    const { rows } = await pool.query(
      "SELECT executed_at FROM demo_runs ORDER BY executed_at DESC LIMIT 1",
    );
    return res.json({ executed_at: rows[0]?.executed_at ?? null });
  } catch (error: any) {
    if (error?.code === "42P01") {
      return res.json({ executed_at: null });
    }
    console.error("[reports] Error fetching demo status", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
});

router.get("/api/reports/invitations", async (req, res) => {
  const currentUser = req.currentUser;
  if (!canViewReports(currentUser)) {
    return res.status(403).json({ message: "No autorizado" });
  }

  const parsed = invitationsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ message: "Parametros invalidos", errors: parsed.error.flatten() });
  }

  const { start, end, company_id: companyId } = parsed.data;
  const eventValues: unknown[] = [];
  const eventConditions: string[] = [];
  pushDateRange("e.sent_at", start, end, eventValues, eventConditions);
  if (companyId) {
    eventValues.push(companyId);
    eventConditions.push(`u.company_id = $${eventValues.length}`);
  }
  const eventWhere = eventConditions.length ? `WHERE ${eventConditions.join(" AND ")}` : "";

  const acceptanceValues: unknown[] = [];
  const acceptanceConditions: string[] = ["u.invitation_sent_at IS NOT NULL"];
  pushDateRange("u.invitation_sent_at", start, end, acceptanceValues, acceptanceConditions);
  if (companyId) {
    acceptanceValues.push(companyId);
    acceptanceConditions.push(`u.company_id = $${acceptanceValues.length}`);
  }
  const acceptanceWhere = acceptanceConditions.length ? `WHERE ${acceptanceConditions.join(" AND ")}` : "";

  const acceptedValues: unknown[] = [];
  const acceptedConditions: string[] = ["u.invitacion_aceptada = TRUE", "u.invitation_accepted_at IS NOT NULL"];
  pushDateRange("u.invitation_accepted_at", start, end, acceptedValues, acceptedConditions);
  if (companyId) {
    acceptedValues.push(companyId);
    acceptedConditions.push(`u.company_id = $${acceptedValues.length}`);
  }
  const acceptedWhere = acceptedConditions.length ? `WHERE ${acceptedConditions.join(" AND ")}` : "";

  try {
    const eventsQuery = `
      SELECT date_trunc('day', e.sent_at) AS day,
             COUNT(*)::bigint AS sent,
             COUNT(*) FILTER (WHERE e.reused_existing)::bigint AS reused,
             COUNT(*) FILTER (WHERE e.email_delivery_attempted AND COALESCE(e.email_delivery_success, FALSE))::bigint AS delivered
      FROM user_invitation_events e
      LEFT JOIN users u ON u.user_id = e.user_id
      ${eventWhere}
      GROUP BY day
      ORDER BY day DESC
      LIMIT 180
    `;
    const eventsRows = await pool.query(eventsQuery, eventValues);

    const acceptanceQuery = `
      SELECT
        COUNT(*)::bigint AS invited_users,
        COUNT(*) FILTER (WHERE u.invitacion_aceptada)::bigint AS accepted_users,
        AVG(EXTRACT(EPOCH FROM (u.invitation_accepted_at - u.invitation_sent_at))/3600)
          FILTER (WHERE u.invitacion_aceptada AND u.invitation_accepted_at IS NOT NULL)::numeric(10,2) AS avg_hours_to_accept
      FROM users u
      ${acceptanceWhere}
    `;
    const acceptanceRows = await pool.query(acceptanceQuery, acceptanceValues);

    const acceptedTimelineQuery = `
      SELECT date_trunc('day', u.invitation_accepted_at) AS day,
             COUNT(*)::bigint AS accepted
      FROM users u
      ${acceptedWhere}
      GROUP BY day
      ORDER BY day DESC
      LIMIT 180
    `;
    const acceptedTimelineRows = await pool.query(acceptedTimelineQuery, acceptedValues);

    return res.json({
      events: eventsRows.rows,
      acceptance: acceptanceRows.rows[0] ?? null,
      acceptedTimeline: acceptedTimelineRows.rows,
    });
  } catch (error) {
    console.error("[reports] Error computing invitation metrics", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
});

export default router;

