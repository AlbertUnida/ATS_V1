# Data model overview

El backend usa PostgreSQL con soporte multi tenant. Este documento resume tablas, columnas clave e indices presentes en las migraciones `001` a `007`, ademas de los registros auxiliares creados por los scripts de seeds.

## Enumeraciones clave

- `user_role`: `admin`, `hr_admin`, `recruiter`, `hiring_manager`, `interviewer`.
- `job_status`: `abierto`, `pausado`, `cerrado`.
- `employment_type`: `tiempo_completo`, `medio_tiempo`, `contrato`, `practicas`, `temporal`.
- `work_modality`: `presencial`, `remoto`, `hibrido`.
- `application_status`: `Nuevo`, `En revision`, `Entrevista`, `Oferta`, `Contratado`, `Rechazado`.
- `interview_mode`: `presencial`, `remoto`, `telefono`.
- `interview_result`: `pendiente`, `aprobado`, `rechazado`, `cancelado`.
- `employee_status`: `activo`, `suspendido`, `baja`.

## Catalogos y usuarios

### companies
- `company_id` (PK), `nombre`, `slug` (unico), `ruc`, `plan_codigo`, `plan_expira`, `is_active`, timestamps (`created_at`, `updated_at`).
- Trigger `trg_companies_updated` mantiene `updated_at`.

### users
- `company_id` referencia `companies`. Super admins tienen `company_id = NULL`; el resto debe pertenecer a una empresa (`users_company_scope_check`).
- Columnas de autenticacion: `password_hash`, `failed_attempts`, `last_login`, `password_updated_at`.
- Flujo de invitaciones: `invitation_token_hash`, `invitation_sent_at`, `invitation_expires_at`, `invitation_accepted_at`, `invitation_created_by`, `invitacion_aceptada`.
- Indices: `idx_users_email_ci` (sobre `LOWER(email)`), `idx_users_invitation_token_hash`, `idx_users_invitation_expires_at`.

### user_invitation_events
- Historial de cada envio o regeneracion de invitaciones (`event_id`, `user_id`, `token_hash`, `accept_url`, `sent_at`, `expires_at`, `reused_existing`, `email_delivery_attempted/success/message`, `created_by`, `created_at`).
- Fuente de datos para `/api/reports/invitations`.

## Organizacion interna (RRHH)

### departments
- `department_id`, `company_id`, `nombre`, `descripcion`, `lead_user_id`, timestamps.
- Restriccion `UNIQUE(company_id, nombre)` garantiza nombres no repetidos dentro de la empresa.

### employees
- Representa colaboradores activos o historicos.
- Campos clave: `employee_number`, `first_name`, `last_name`, `display_name`, correos corporativo/personal, `phone`, fechas (`hire_date`, `end_date`, `probation_end`), `employment_type`, `department_id`, `manager_id`, `job_title`, `location`, `status`, datos salariales (`salary_amount`, `salary_currency`, `salary_period`), `created_by`, `updated_by`.
- Indices: `idx_employees_company`, `idx_employees_manager`, `idx_employees_department`.

### employee_job_history
- Cambios de puesto/salario (`history_id`, `employee_id`, `started_at`, `ended_at`, `job_title`, `department_id`, `manager_id`, `employment_type`, datos salariales, `note`, `created_by`).
- Indice `idx_employee_job_history_employee`.

### employee_notes
- Comentarios privados (`note_id`, `employee_id`, `contenido`, `categoria`, `created_by`, timestamps). Trigger `set_updated_at` mantiene `updated_at`.

### employee_attachments
- Archivos vinculados (`attachment_id`, `employee_id`, `filename`, `storage_path`, `mime_type`, `size_bytes`, `uploaded_by`, `uploaded_at`).

## Reclutamiento

### jobs
- Ofertas de empleo asociadas a `companies` y `departments`.
- Campos destacados: `titulo`, `descripcion`, `departamento_id`, `estado`, `tipo_empleo`, `modalidad_trabajo`, `ubicacion`, rango salarial (`rango_salarial_min`, `rango_salarial_max`, `moneda`), fechas (`fecha_publicacion`, `fecha_cierre`, `fecha_registro`), `notas_internas`, `creado_por`.
- Indices: `idx_jobs_company_id`, `idx_jobs_estado`, `idx_jobs_departamento_id`.

### candidatos y aplicaciones
- `candidatos`: deduplicado por email (`UNIQUE(LOWER(email))`). Campos: `nombre_completo`, `email`, `telefono`, `resumen_url`, `linkedin_url`, `ciudad`, `pais`, `fuente`, `created_at`, `updated_at`.
- `applications`: relacion `job_id` + `candidato_id`. Contiene `estado`, `source`, `source_details`, `salario_expectativa`, `moneda`, `applied_at`, `updated_at`.
- `application_stage_history`: pipeline por aplicacion (`estado_anterior`, `estado_nuevo`, `comentario`, `cambiado_por`, `changed_at`).
- `application_notes`: colaboracion (`autor_id`, `contenido`, `categoria`, timestamps).
- `interviews`: entrevistas agendadas (`programada_para`, `duracion_minutos`, `modalidad`, `ubicacion`, `enlace`, `resultado`, `feedback`, `entrevistadores`, `creado_por`).
- Indices claves: `idx_applications_job_id`, `idx_applications_estado`, `idx_stage_history_application_id`, `idx_application_notes_application_id`, `idx_interviews_application_id`.

## Portal publico y auditoria

### public_applications_log
- Auditoria de `POST /public/jobs/:id/apply`.
- Columnas: `log_id`, `job_id`, `candidate_email`, `status`, `error_message`, `ip`, `user_agent`, `recaptcha_score`, `source`, `source_details` (JSONB), `created_at`.
- `status` observados: `received`, `duplicate`, `rate_limited`, `captcha_failed`, `job_closed`, `invalid`, `error`.
- Indices: `idx_public_app_log_job`, `idx_public_app_log_status`, `idx_public_app_log_created`, `idx_public_app_log_source`.

### demo_runs
- Tabla auxiliar creada por `scripts/enrich-demo-data.js`.
- Guarda `executed_at` para informar `/api/reports/demo-status` sobre la ultima corrida del dataset demo.

## Relaciones clave

- `companies.company_id` aparece en `users`, `departments`, `jobs`, `employees` y tablas derivadas (`employee_job_history`, `employee_notes`, `employee_attachments`).
- `users.user_id` se usa en `jobs.creado_por`, `departments.lead_user_id`, `application_stage_history.cambiado_por`, `application_notes.autor_id`, `interviews.creado_por`, `employees.created_by/updated_by`, `user_invitation_events.created_by`.
- `departments.department_id` enlaza `jobs` y `employees`.
- `jobs.job_id` enlaza `applications`, `application_stage_history`, `application_notes`, `interviews`, `public_applications_log`.
- `candidatos.candidato_id` enlaza `applications`.
- `employees.employee_id` enlaza `employee_job_history`, `employee_notes`, `employee_attachments`.

## Migraciones y scripts

- `npm run db:migrate` aplica los archivos en `db/migrations` en orden cronologico.
- `npm run db:seed:users` registra la empresa demo y cuentas base (`SEED_USER_PASSWORD` controla la contrasena inicial).
- `npm run demo:seed` ejecuta `scripts/enrich-demo-data.js`, ajusta el dataset publico y agrega una fila en `demo_runs`.
- `npm run demo:preview` encadena `demo:seed` y levanta backend y frontend en paralelo mediante `concurrently`.
