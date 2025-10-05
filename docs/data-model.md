# Data Model Overview

Resumen del esquema actual del ATS (Talent Flow) orientado a pymes paraguayas. Incluye soporte multi-tenant, usuarios con roles, candidatos y autenticaci??n con JWT.

## Entidades principales

### Companies
- Representa a la pyme cliente.
- Campos: `company_id`, `nombre`, `slug` (??nico), `ruc`, `plan_codigo`, `plan_expira`, `is_active`, `created_at`, `updated_at`.

### Users
- Operadores internos de la plataforma y usuarios de cada pyme.
- Campos: `user_id`, `nombre`, `email` (??nico, indexado en min??sculas), `rol` (`admin|hr_admin|recruiter|hiring_manager|interviewer|super_admin` v??a `is_super_admin`), `is_super_admin`, `company_id` (NULL s??lo para super admin), `invitacion_aceptada`, `activo`, `password_hash`, `password_updated_at`, `last_login`, `failed_attempts`, `created_at`, `updated_at`.
- Restricci??n: si `is_super_admin = TRUE` entonces `company_id` es NULL; de lo contrario es obligatorio.

### Departments
- Cat??logo por compa????a.
- Campos: `department_id`, `nombre`, `descripcion`, `lead_user_id`, `company_id`, `created_at`, `updated_at`.
- Restricci??n: `UNIQUE(company_id, nombre)`.

### Jobs
- Oferta de empleo publicada por una compa????a.
- Campos: `job_id`, `titulo`, `descripcion`, `departamento_id`, `departamento` (texto legacy), `company_id`, `estado`, `tipo_empleo`, `modalidad_trabajo`, `ubicacion`, `rango_salarial_min/max`, `moneda`, `fecha_publicacion`, `fecha_cierre`, `notas_internas`, `creado_por`, `fecha_registro`, `updated_at`.

### Candidates (`candidatos`)
- Maestro de postulantes (deduplicado por email).
- Campos: `candidato_id`, `nombre_completo`, `email`, `telefono`, `resumen_url`, `linkedin_url`, `ciudad`, `pais`, `fuente`, `fecha_registro`, `created_at`, `updated_at`.

### Applications y relacionados
- `applications`: `application_id`, `job_id`, `candidato_id`, `estado`, `source`, `source_details`, `salario_expectativa`, `moneda`, `applied_at`, `updated_at`.
- `application_stage_history`, `application_notes`, `interviews`: permanecen igual, ahora asociados a usuarios autenticados (`cambiado_por`, `autor_id`, etc.).
- `user_invitation_events`: historial de invitaciones enviadas a cada usuario (`sent_at`, `expires_at`, estado de entrega, qui?n la gener?, token usado).

## Relaciones clave
- `companies.company_id` 1???N `users.company_id`, `departments.company_id`, `jobs.company_id`.
- `users.user_id` 1???N `jobs.creado_por`, `departments.lead_user_id`, `application_stage_history.cambiado_por`, `application_notes.autor_id`, `interviews.creado_por`.
- `departments.department_id` 1???N `jobs.departamento_id`.
- `jobs.job_id` 1???N `applications.job_id` y (v??a `application_id`) a `stage_history`, `notes`, `interviews`.
- `candidatos.candidato_id` 1???N `applications.candidato_id`.

## Autenticaci??n y contexto de tenant
- `POST /api/auth/login`: recibe `email` + `password`, valida con `bcrypt` y devuelve JWT (payload con `sub`, `email`, `company_id`, `rol`, `is_super_admin`).
- Middleware `tenantContext` lee `Authorization: Bearer <token>` y carga al usuario desde la BD. En desarrollo, si no hay token utiliza los encabezados `x-user-email` / `x-company-id` o `DEV_DEFAULT_USER_EMAIL`.
- El resto de rutas (`/api/departments`, `/api/jobs`, `/api/applications`, `/api/applications/:id/...`) ya filtran por `req.companyId` y utilizan `req.currentUser`.

## Utilidades disponibles
1. `npm run db:migrate` ??? aplica `001_init.sql`, `002_multitenant.sql`, `003_auth.sql`.
2. `npm run db:seed:users` ??? crea la compa????a demo (`pyme-demo-paraguay`), un super admin (`superadmin@talentflow.app`) y tres usuarios de la pyme. Todos comparten la contrase??a `TalentFlow2025!` (puedes cambiarla con `SEED_USER_PASSWORD`).
3. `node scripts/show-users.js` ??? lista usuarios, roles y compa????a para verificaci??n r??pida.
4. `node scripts/demo-seed.js` ??? demo completa (levanta API, crea departamento/job/aplicaci??n y apaga).

## Variables de entorno relevantes
```
DB_HOST=localhost
DB_PORT=5432
DB_USER=...
DB_PASSWORD=...
DB_NAME=...
PORT=3000
JWT_SECRET=dev-secret-change-me
JWT_EXPIRES_IN=1h
DEV_DEFAULT_USER_EMAIL=ana.gonzalez@pyme-demo.com
APP_BASE_URL=http://localhost:5173
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASSWORD=
SMTP_SECURE=false
SMTP_FROM=
```
- Cambia `JWT_SECRET` en producci??n y evita el fallback `DEV_DEFAULT_USER_EMAIL`.

## Pr??ximos pasos sugeridos
- Implementar flujo de alta/invitaci??n de usuarios (Admin crea recruiter ??? mail con link para fijar contrase??a).
- A??adir endpoints para entrevistas y portal p??blico de candidatos.
- Integrar el cliente con el login (pantalla de inicio de sesi??n, almacenamiento del token, logout, refresco de token si es necesario).


## Flujo de invitaciones de usuario
- `POST /api/users/invitations` crea o renueva la invitacion para un correo de la empresa (requiere rol `admin` o `hr_admin`, o bien super admin). Devuelve el token temporal y la fecha de expiracion para compartir el enlace.
- `GET /api/users` lista los usuarios de la empresa junto con los metadatos de invitacion (usar `company_id` cuando se actua como super admin).
- `GET /api/auth/invitations/:token` permite validar el token y obtener datos basicos antes de fijar la contrasena.
- `POST /api/auth/invitations/:token/accept` recibe contrasena (y nombre opcional) para activar la cuenta, limpiar el token y dejarla lista para el login.
- Los correos de invitacion se envian mediante SMTP (si se configura), de lo contrario se registran en consola. Usa `APP_BASE_URL` para construir el enlace de activacion.
- GET /api/companies devuelve la lista de empresas accesibles para el usuario (todas si es super admin, solo la propia en caso contrario).







