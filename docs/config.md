# Configuración de Entorno

## Backend (`.env` raíz)

| Variable | Descripción |
| --- | --- |
| `PORT` | Puerto del backend Express (default 3000). |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Credenciales de PostgreSQL. |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | Firma y expiración del token JWT. |
| `DEV_DEFAULT_USER_EMAIL` | Correo utilizado por el middleware tenant en desarrollo cuando no hay token. |
| `APP_BASE_URL` | URL base del frontend interno; se usa para construir enlaces (invitaciones, notificaciones). |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE`, `SMTP_FROM` | Configuración de correo para invitaciones y notificaciones. |
| `PUBLIC_APPLICATIONS_ENABLED` | Controla el acceso a los endpoints públicos (`true` por defecto). |
| `PUBLIC_APPLICATIONS_RATE_LIMIT` | Número de intentos por IP cada 10 minutos para el portal público (default `5`). |
| `PUBLIC_CAPTCHA_REQUIRED` | Habilita la validación de captcha en el portal público (default `true`). |
| `RECAPTCHA_SECRET_KEY` | Clave secreta de Google reCAPTCHA v3. Obligatoria si `PUBLIC_CAPTCHA_REQUIRED` es `true`. |
| `RECAPTCHA_MIN_SCORE` | Puntaje mínimo aceptado para el captcha (default `0.5`). |
| `PUBLIC_LOG_APPLICATIONS` | Activa la escritura en `public_applications_log` (default `true`). |
| `PUBLIC_PORTAL_URL` | URL pública del portal de vacantes (si se omite, se usa `APP_BASE_URL`). |
| `EMPLOYEE_MANAGER_MUST_MATCH_DEPARTMENT` *(futuro)* | Bandera para validaciones adicionales entre manager y departamento (actualmente implícita). |

## Frontend (`client/.env`)

| Variable | Descripción |
| --- | --- |
| `VITE_DEV_USER_EMAIL`, `VITE_DEV_COMPANY_ID` | Headers de desarrollo cuando no existe sesión. |
| `VITE_RECAPTCHA_SITE_KEY` | Clave pública de reCAPTCHA (necesaria si el backend requiere captcha). |

## Tablas/Índices Relevantes

- `employees`, `employee_job_history`, `employee_notes`, `employee_attachments`: núcleo del directorio interno. La migración `006_employees.sql` crea índices para búsquedas por empresa, departamento y manager.
- `public_applications_log`: almacena auditoría del portal público. Índices por `job_id`, `status` y `created_at` facilitan reportes (`GET /api/reports/public-applications`).

## Comandos útiles

```bash
npm run db:migrate    # Aplica las migraciones
npm run build         # Verifica compilación del backend
cd client && npm run build   # Verifica compilación del frontend
```

