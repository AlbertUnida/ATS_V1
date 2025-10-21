# Configuracion de entorno

## Backend (`.env` en la raiz)

| Variable | Descripcion |
| --- | --- |
| `PORT` | Puerto HTTP para el servidor Express (por defecto 3000). |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Credenciales de conexion a PostgreSQL. |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | Firma y vencimiento del JWT emitido por `/api/auth/login`. Cambiar en produccion. |
| `DEV_DEFAULT_USER_EMAIL` | Correo usado por `tenantContext` cuando no llega token en desarrollo (fallback local). |
| `APP_BASE_URL` | URL base del panel interno; se usa en enlaces de invitacion, notificaciones y correos. |
| `PUBLIC_PORTAL_URL` | URL publica del portal de vacantes. Si no se define se reutiliza `APP_BASE_URL`. |
| `PUBLIC_APPLICATIONS_ENABLED` | Habilita o bloquea los endpoints bajo `/public/*`. Valor por defecto: `true`. |
| `PUBLIC_APPLICATIONS_RATE_LIMIT` | Intentos maximos por IP cada 10 minutos en el portal (default `5`). |
| `PUBLIC_CAPTCHA_REQUIRED` | Obliga a validar reCAPTCHA antes de aceptar postulaciones (default `true`). |
| `RECAPTCHA_SECRET_KEY` | Clave secreta de reCAPTCHA v3. Debe configurarse cuando el captcha es obligatorio. |
| `RECAPTCHA_MIN_SCORE` | Puntaje minimo aceptado para reCAPTCHA (default `0.5`). |
| `PUBLIC_LOG_APPLICATIONS` | Permite escribir auditoria en `public_applications_log` (default `true`). |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE`, `SMTP_FROM` | Parametros para enviar correos mediante SMTP. Si falta alguno, los correos se registran en consola. |

## Frontend (`client/.env.development`)

| Variable | Descripcion |
| --- | --- |
| `VITE_DEV_USER_EMAIL`, `VITE_DEV_COMPANY_ID` | Headers que Vite inyecta en desarrollo cuando no hay sesion activa. |
| `VITE_RECAPTCHA_SITE_KEY` | Clave publica de reCAPTCHA v3. Requerida si el backend exige validacion de captcha. |

## Scripts y utilidades

| Variable | Descripcion |
| --- | --- |
| `API_BASE_URL` | URL del backend que usa `npm run demo:seed` para crear datos via API (default `http://localhost:3000`). |
| `SEED_USER_PASSWORD` | Contrasena aplicada por `npm run db:seed:users`. Si se omite se usa `TalentFlow2025!`. |

## Comandos utiles

```bash
npm run db:migrate      # Ejecuta migraciones SQL
npm run build           # Valida compilacion del backend
cd client && npm run build   # Valida compilacion del frontend
```
