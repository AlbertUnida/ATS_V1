# Talent Flow Demo Dataset

This dataset seeds the minimal activity needed for the "Radar de metricas del portal publico" dashboard.

## 1. Public applications

| Candidate | Job | Job ID | Applied at (UTC) | Outcome | Notes |
|-----------|-----|--------|------------------|---------|-------|
| carlos.demo1@example.com | Devops & Cloud Engineer | d265ca6d-ce7e-4625-b586-ac10154b6661 | 2025-09-15 09:05 | Oferta | Offer recorded 2025-09-24 |
| mariana.demo2@example.com | Devops & Cloud Engineer | d265ca6d-ce7e-4625-b586-ac10154b6661 | 2025-09-17 10:30 | Entrevista | Stage change 2025-09-21 |
| laura.test+1@example.com | Devops & Cloud Engineer | d265ca6d-ce7e-4625-b586-ac10154b6661 | 2025-09-18 08:10 | Contratado | Hired 2025-09-30; duplicate attempt 2025-10-01 |
| pablo.demo3@example.com | Devops & Cloud Engineer | d265ca6d-ce7e-4625-b586-ac10154b6661 | 2025-09-20 14:45 | Nuevo | No further moves |
| sofia.analytics@example.com | Analista de Datos | 687f9817-4447-4a5a-80fb-334f5d4cf919 | 2025-09-29 08:20 | Nuevo | Prior rate limit on 2025-09-28 |
| jorge.data@example.com | Analista de Datos | 687f9817-4447-4a5a-80fb-334f5d4cf919 | 2025-09-30 09:40 | Nuevo | Prior rate limit on 2025-09-29 |

- public_applications_log includes received, rate_limited and duplicate entries from 15-Sep to 1-Oct.
- application_stage_history records the stage transitions listed above.

## 2. Internal invitations

| Email | Sent at | Outcome |
|-------|---------|---------|
| glori...@gmail.com | 2025-09-15 14:00 | Sent (pending acceptance) |
| demo.recruiter+1@pyme-demo.com | 2025-09-20 12:00 | Accepted 2025-09-20 16:30 |
| demo.hr+1@pyme-demo.com | 2025-09-27 11:00 | Accepted 2025-09-29 09:15 |

These rows feed the invitation activation metrics.

## 3. How to reproduce

1. Run migrations and seeds (npm run db:migrate, seed scripts as needed).
2. Execute npm run demo:seed.
3. Restart API (npm run dev in repo root) and frontend (npm run dev in client/).
4. Sign in as superadmin and open the dashboard.

## 4. Resetting

- To reset, restore the database from seeds/dumps.
- The enrichment script is idempotent; running it again updates existing rows without duplicating data.
