const { Pool } = require("pg");
require("dotenv/config");

const pool = new Pool({
  host: process.env.DB_HOST ?? "localhost",
  port: Number(process.env.DB_PORT ?? 5432),
  user: process.env.DB_USER ?? "postgres",
  password: process.env.DB_PASSWORD ?? "",
  database: process.env.DB_NAME ?? "postgres",
});

const applicationScenarios = [
  {
    applicationId: "d8a3de08-a703-4192-9d0e-b6cd231939b2",
    jobId: "d265ca6d-ce7e-4625-b586-ac10154b6661",
    email: "carlos.demo1@example.com",
    appliedAt: "2025-09-15T09:05:00Z",
    updatedAt: "2025-09-24T15:10:00Z",
    stageUpdates: [
      { estado: "Nuevo", changedAt: "2025-09-15T09:05:30Z" },
      { estado: "Oferta", changedAt: "2025-09-24T15:10:00Z" },
    ],
    logTimestamps: [
      { status: "received", createdAt: "2025-09-15T09:05:00Z" },
    ],
  },
  {
    applicationId: "95731147-bd48-43d9-8fa9-4fc29b91fc3a",
    jobId: "d265ca6d-ce7e-4625-b586-ac10154b6661",
    email: "mariana.demo2@example.com",
    appliedAt: "2025-09-17T10:30:00Z",
    updatedAt: "2025-09-21T13:00:00Z",
    stageUpdates: [
      { estado: "Nuevo", changedAt: "2025-09-17T10:30:25Z" },
      { estado: "Entrevista", changedAt: "2025-09-21T13:00:00Z" },
    ],
    logTimestamps: [
      { status: "received", createdAt: "2025-09-17T10:30:00Z" },
    ],
  },
  {
    applicationId: "d3178206-0ef9-4616-9fb5-3ba7e1d4a851",
    jobId: "d265ca6d-ce7e-4625-b586-ac10154b6661",
    email: "pablo.demo3@example.com",
    appliedAt: "2025-09-20T14:45:00Z",
    updatedAt: "2025-09-20T14:45:30Z",
    stageUpdates: [{ estado: "Nuevo", changedAt: "2025-09-20T14:45:30Z" }],
    logTimestamps: [
      { status: "received", createdAt: "2025-09-20T14:45:00Z" },
    ],
  },
  {
    applicationId: "be67384e-7f76-432e-9000-509e9abf7358",
    jobId: "d265ca6d-ce7e-4625-b586-ac10154b6661",
    email: "laura.test+1@example.com",
    appliedAt: "2025-09-18T08:10:00Z",
    updatedAt: "2025-09-30T16:20:00Z",
    stageUpdates: [
      { estado: "Nuevo", changedAt: "2025-09-18T08:10:20Z" },
      { estado: "Contratado", changedAt: "2025-09-30T16:20:00Z" },
    ],
    logTimestamps: [
      { status: "received", createdAt: "2025-09-18T08:10:00Z" },
      { status: "duplicate", createdAt: "2025-10-01T09:00:00Z" },
    ],
  },
  {
    applicationId: "4fc647e1-01d0-4a55-8e98-836016a62d64",
    jobId: "687f9817-4447-4a5a-80fb-334f5d4cf919",
    email: "sofia.analytics@example.com",
    appliedAt: "2025-09-29T08:20:00Z",
    updatedAt: "2025-09-29T08:20:30Z",
    stageUpdates: [{ estado: "Nuevo", changedAt: "2025-09-29T08:20:30Z" }],
    logTimestamps: [
      { status: "rate_limited", createdAt: "2025-09-28T07:55:00Z" },
      { status: "received", createdAt: "2025-09-29T08:20:00Z" },
    ],
  },
  {
    applicationId: "442c6477-b7df-4b2a-830f-84a0d2e68b1d",
    jobId: "687f9817-4447-4a5a-80fb-334f5d4cf919",
    email: "jorge.data@example.com",
    appliedAt: "2025-09-30T09:40:00Z",
    updatedAt: "2025-09-30T09:40:30Z",
    stageUpdates: [{ estado: "Nuevo", changedAt: "2025-09-30T09:40:30Z" }],
    logTimestamps: [
      { status: "rate_limited", createdAt: "2025-09-29T09:05:00Z" },
      { status: "received", createdAt: "2025-09-30T09:40:00Z" },
    ],
  },
];

const invitationAdjustments = [
  {
    eventId: "70b288e9-f855-40ad-a514-63c8c860bbbf",
    sentAt: "2025-09-15T14:00:00Z",
    delivered: true,
    reused: false,
    user: {
      userId: "3c4f0784-c0eb-473e-ba92-d4df7c489ba0",
      invitationSentAt: "2025-09-15T14:00:00Z",
      invitationAcceptedAt: null,
      accepted: false,
    },
  },
  {
    eventId: null,
    newEvent: {
      userEmail: "demo.recruiter+1@pyme-demo.com",
      sentAt: "2025-09-20T12:00:00Z",
      acceptedAt: "2025-09-20T16:30:00Z",
      companyId: "300ff950-69f0-4bd4-938b-50d309a5415e",
    },
  },
  {
    eventId: null,
    newEvent: {
      userEmail: "demo.hr+1@pyme-demo.com",
      sentAt: "2025-09-27T11:00:00Z",
      acceptedAt: "2025-09-29T09:15:00Z",
      companyId: "300ff950-69f0-4bd4-938b-50d309a5415e",
    },
  },
];

async function buildIndexes(client) {
  const logRows = await client.query(
    "SELECT log_id, job_id, candidate_email, status FROM public_applications_log"
  );
  const logIndex = new Map();
  for (const row of logRows.rows) {
    const key = `${row.job_id}|${row.candidate_email.toLowerCase()}|${row.status}`;
    logIndex.set(key, row.log_id);
  }

  const stageRows = await client.query(
    "SELECT stage_history_id, application_id, estado_nuevo FROM application_stage_history"
  );
  const stageIndex = new Map();
  for (const row of stageRows.rows) {
    const key = `${row.application_id}|${row.estado_nuevo}`;
    stageIndex.set(key, row.stage_history_id);
  }

  return { logIndex, stageIndex };
}

async function adjustApplications(client) {
  const { logIndex, stageIndex } = await buildIndexes(client);

  for (const scenario of applicationScenarios) {
    console.log(`Adjusting application ${scenario.applicationId}`);
    await client.query(
      "UPDATE applications SET applied_at = $1, updated_at = $2 WHERE application_id = $3",
      [scenario.appliedAt, scenario.updatedAt, scenario.applicationId]
    );

    for (const stage of scenario.stageUpdates) {
      const historyId = stageIndex.get(`${scenario.applicationId}|${stage.estado}`);
      if (!historyId) continue;
      await client.query(
        "UPDATE application_stage_history SET changed_at = $1 WHERE stage_history_id = $2",
        [stage.changedAt, historyId]
      );
    }

    for (const logEntry of scenario.logTimestamps) {
      const key = `${scenario.jobId}|${scenario.email.toLowerCase()}|${logEntry.status}`;
      const logId = logIndex.get(key);
      if (!logId) continue;
      await client.query(
        "UPDATE public_applications_log SET created_at = $1 WHERE log_id = $2",
        [logEntry.createdAt, logId]
      );
    }
  }
}

async function ensureUser(client, email, companyId) {
  const existing = await client.query("SELECT user_id FROM users WHERE LOWER(email) = LOWER($1)", [email]);
  if (existing.rowCount > 0) {
    return existing.rows[0].user_id;
  }

  const userInsert = await client.query(
    `INSERT INTO users (user_id, email, nombre, rol, company_id, is_super_admin, invitacion_aceptada, activo, password_hash, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, 'recruiter', $3, FALSE, FALSE, TRUE, '$2a$10$O4Z61WgWQqG0QppmZzEwOOdY9Q6pVXrDMAYA9Yg3.aCBXlI3Vzsu2', NOW(), NOW())
     RETURNING user_id`,
    [email, email.split("@")[0], companyId]
  );
  return userInsert.rows[0].user_id;
}

async function adjustInvitations(client) {
  for (const item of invitationAdjustments) {
    if (item.eventId) {
      console.log(`Updating invitation event ${item.eventId}`);
      await client.query(
        `UPDATE user_invitation_events
         SET sent_at = $1,
             email_delivery_attempted = TRUE,
             email_delivery_success = $2,
             reused_existing = $3
         WHERE event_id = $4`,
        [item.sentAt, item.delivered, item.reused, item.eventId]
      );
      if (item.user) {
        await client.query(
          `UPDATE users
             SET invitation_sent_at = $1,
                 invitation_accepted_at = $2,
                 invitacion_aceptada = $3
           WHERE user_id = $4`,
          [item.user.invitationSentAt, item.user.invitationAcceptedAt, item.user.accepted, item.user.userId]
        );
      }
    } else if (item.newEvent) {
      const userId = await ensureUser(client, item.newEvent.userEmail, item.newEvent.companyId);
      console.log(`Creating invitation event for ${item.newEvent.userEmail}`);
      await client.query(
        `INSERT INTO user_invitation_events (event_id, user_id, sent_at, reused_existing, email_delivery_attempted, email_delivery_success, created_at)
         VALUES (gen_random_uuid(), $1, $2, FALSE, TRUE, TRUE, $2)`,
        [userId, item.newEvent.sentAt]
      );
      await client.query(
        `UPDATE users
            SET invitation_sent_at = $1,
                invitation_accepted_at = $2,
                invitacion_aceptada = $3
          WHERE user_id = $4`,
        [item.newEvent.sentAt, item.newEvent.acceptedAt, Boolean(item.newEvent.acceptedAt), userId]
      );
    }
  }
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `CREATE TABLE IF NOT EXISTS demo_runs (
         run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
         executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
       )`
    );
    await adjustApplications(client);
    await adjustInvitations(client);
    await client.query("INSERT INTO demo_runs (executed_at) VALUES (NOW())");
    await client.query("COMMIT");
    console.log("[demo] Data enrichment completed");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("[demo] Error enriching data", error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[demo] Unexpected error", error);
  process.exit(1);
});
