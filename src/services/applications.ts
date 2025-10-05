import type { PoolClient } from "pg";

export const applicationStatusValues = [
  "Nuevo",
  "En revision",
  "Entrevista",
  "Oferta",
  "Contratado",
  "Rechazado",
] as const;

export type ApplicationStatus = (typeof applicationStatusValues)[number];

export type CandidateInput = {
  nombre_completo: string;
  email: string;
  telefono?: string | null;
  resumen_url?: string | null;
  linkedin_url?: string | null;
  ciudad?: string | null;
  pais?: string | null;
  fuente?: string | null;
};

export type ApplicationUpsertParams = {
  jobId: string;
  candidate: CandidateInput;
  estado?: ApplicationStatus;
  source?: string | null;
  sourceDetails?: string | null;
  salarioExpectativa?: number | null;
  moneda?: string | null;
  changedBy?: string | null;
  historyComment?: string | null;
};

export type ApplicationUpsertResult = {
  application: {
    application_id: string;
    job_id: string;
    candidato_id: string;
    estado: ApplicationStatus;
    source: string | null;
    source_details: string | null;
    salario_expectativa: string | null;
    moneda: string | null;
    applied_at: string;
    updated_at: string;
  };
  wasExisting: boolean;
  previousStatus: ApplicationStatus | null;
};

async function upsertCandidate(client: PoolClient, candidate: CandidateInput) {
  const query = `
    INSERT INTO candidatos (
      nombre_completo,
      email,
      telefono,
      resumen_url,
      linkedin_url,
      ciudad,
      pais,
      fuente
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (email) DO UPDATE
      SET nombre_completo = EXCLUDED.nombre_completo,
          telefono = COALESCE(EXCLUDED.telefono, candidatos.telefono),
          resumen_url = COALESCE(EXCLUDED.resumen_url, candidatos.resumen_url),
          linkedin_url = COALESCE(EXCLUDED.linkedin_url, candidatos.linkedin_url),
          ciudad = COALESCE(EXCLUDED.ciudad, candidatos.ciudad),
          pais = COALESCE(EXCLUDED.pais, candidatos.pais),
          fuente = COALESCE(EXCLUDED.fuente, candidatos.fuente),
          updated_at = NOW()
    RETURNING candidato_id, nombre_completo, email
  `;

  const values = [
    candidate.nombre_completo,
    candidate.email,
    candidate.telefono ?? null,
    candidate.resumen_url ?? null,
    candidate.linkedin_url ?? null,
    candidate.ciudad ?? null,
    candidate.pais ?? null,
    candidate.fuente ?? null,
  ];

  const { rows } = await client.query(query, values);
  return rows[0];
}

export async function createOrUpdateApplication(
  client: PoolClient,
  params: ApplicationUpsertParams,
): Promise<ApplicationUpsertResult> {
  const estado = params.estado ?? "Nuevo";
  const candidateRow = await upsertCandidate(client, params.candidate);

  const existingApplication = await client.query<{ application_id: string; estado: ApplicationStatus }>(
    `SELECT application_id, estado FROM applications WHERE job_id = $1 AND candidato_id = $2`,
    [params.jobId, candidateRow.candidato_id],
  );

  const currency = params.moneda ? params.moneda.toUpperCase() : null;
  let applicationRow: ApplicationUpsertResult["application"];
  let previousStatus: ApplicationStatus | null = null;
  let wasExisting = false;

  if (existingApplication.rows.length > 0) {
    wasExisting = true;
    const applicationId = existingApplication.rows[0].application_id;
    previousStatus = existingApplication.rows[0].estado;

    const updateQuery = `
      UPDATE applications
      SET estado = $2::application_status,
          source = COALESCE($3, source),
          source_details = COALESCE($4, source_details),
          salario_expectativa = COALESCE($5, salario_expectativa),
          moneda = COALESCE($6, moneda),
          updated_at = NOW()
      WHERE application_id = $1
      RETURNING application_id, job_id, candidato_id, estado, source, source_details, salario_expectativa, moneda, applied_at, updated_at
    `;

    const { rows } = await client.query(updateQuery, [
      applicationId,
      estado,
      params.source ?? null,
      params.sourceDetails ?? null,
      params.salarioExpectativa ?? null,
      currency,
    ]);

    applicationRow = rows[0];

    if (previousStatus !== estado) {
      await client.query(
        `
          INSERT INTO application_stage_history (application_id, estado_anterior, estado_nuevo, comentario, cambiado_por)
          VALUES ($1, $2, $3, $4, $5)
        `,
        [applicationId, previousStatus, estado, params.historyComment ?? null, params.changedBy ?? null],
      );
    }
  } else {
    const insertQuery = `
      INSERT INTO applications (
        job_id,
        candidato_id,
        estado,
        source,
        source_details,
        salario_expectativa,
        moneda
      )
      VALUES ($1, $2, $3::application_status, $4, $5, $6, $7)
      RETURNING application_id, job_id, candidato_id, estado, source, source_details, salario_expectativa, moneda, applied_at, updated_at
    `;

    const { rows } = await client.query(insertQuery, [
      params.jobId,
      candidateRow.candidato_id,
      estado,
      params.source ?? null,
      params.sourceDetails ?? null,
      params.salarioExpectativa ?? null,
      currency,
    ]);

    applicationRow = rows[0];

    await client.query(
      `
        INSERT INTO application_stage_history (application_id, estado_anterior, estado_nuevo, comentario, cambiado_por)
        VALUES ($1, NULL, $2, $3, $4)
      `,
      [applicationRow.application_id, estado, params.historyComment ?? null, params.changedBy ?? null],
    );
  }

  return {
    application: applicationRow,
    wasExisting,
    previousStatus,
  };
}
