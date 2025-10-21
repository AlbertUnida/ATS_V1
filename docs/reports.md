# Reports API

Las rutas bajo `/api/reports/*` entregan metricas para el dashboard interno. Solo estan disponibles para usuarios con `is_super_admin = true` o roles `admin` / `hr_admin`. Todas las respuestas usan formato JSON.

## Filtros comunes

- `start`, `end`: cadenas `YYYY-MM-DD`. El filtro se aplica sobre `created_at` (fin de rango incluye las 23:59:59 del dia).
- `company_id`: UUID opcional. Solo se respeta para super admins; fuerza que los datos provengan de la empresa indicada.
- `status`: solo para `/public-applications`, admite valores `received`, `duplicate`, `rate_limited`, `captcha_failed`, `job_closed`, `invalid`, `error`.

## Endpoints de postulaciones publicas

### `GET /api/reports/public-applications`
- Datos: actividad diaria del portal publico.
- Respuesta:
  - `items`: lista de objetos `{ day, status, total }` (a lo sumo 365 filas).
  - `totals`: agregados por `status` sin agrupar por fecha.

### `GET /api/reports/public-applications/conversion`
- Coincide logs del portal con aplicaciones internas.
- Respuesta:
  - `summary`: `{ total_logs, matched, interviews, offers, hires }`.
  - `status`: conteo de logs por `application_status` (o `sin_match` si no se encontro aplicacion).

### `GET /api/reports/public-applications/response-time`
- Mide el tiempo desde que llega la postulacion hasta el primer cambio de etapa.
- Respuesta: `{ samples, avg_hours, median_hours, p90_hours }`.

### `GET /api/reports/public-applications/sources`
- Agrega datos por canal de origen y plataforma (segun `user_agent`).
- Respuesta:
  - `channels.breakdown`: filas por dia y canal con metrica de conversion (`total_logs`, `matched`, `interviews`, `offers`, `hires`).
  - `channels.totals`: agregados por canal para todo el rango.
  - `platforms.breakdown`: conteo de logs por dia y `platform` (`desktop`, `mobile`, `bot`, `desconocido`).
  - `platforms.totals`: totales acumulados por plataforma.

## Otros reportes

### `GET /api/reports/demo-status`
- Respuesta: `{ executed_at }`. Devuelve `null` si nunca corrio `scripts/enrich-demo-data.js` o si la tabla `demo_runs` no existe.

### `GET /api/reports/invitations`
- Query params: `start`, `end`, `company_id` (mismos formatos que arriba).
- Respuesta:
  - `events`: filas diarias `{ day, sent, reused, delivered }` basadas en `user_invitation_events`.
  - `acceptance`: `{ invited_users, accepted_users, avg_hours_to_accept }` calculado desde la tabla `users`.
  - `acceptedTimeline`: lineas `{ day, accepted }` para fechas de aceptacion (`invitation_accepted_at`).
