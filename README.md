# Talent Flow ATS (Demo)

## Requisitos

- Node.js 18+
- PostgreSQL 13+
- Variables de entorno configuradas (ver `.env` y `client/.env.development`).

## Levantar el entorno de desarrollo

1. Instalar dependencias:
   ```
   npm install
   cd client && npm install
   ```
2. Aplicar migraciones:
   ```
   npm run db:migrate
   ```
3. (Opcional) sembrar usuarios de ejemplo:
   ```
   npm run db:seed:users
   ```
4. Ejecutar el script de enriquecimiento de datos para el demo:
   ```
   npm run demo:seed
   ```
5. Arrancar servicios:
   ```
   # backend (desde la raiz)
   npm run dev

   # cliente (otra terminal, dentro de client/)
   npm run dev
   ```
6. Iniciar sesion como superadmin (por defecto `superadmin@talentflow.app` / `TalentFlow2025!`).

## Dataset de demostracion

- El script `scripts/enrich-demo-data.js` crea postulaciones publicas, cambios de estado internos y eventos de invitaciones.
- Los detalles del escenario estan documentados en `docs/dataset-demo.md`.
- El dashboard "Radar de metricas del portal publico" reflejara la actividad simulada despues de ejecutar el script y reiniciar los servicios.

## Reset

- Para limpiar la base, reejecuta las migraciones o restaura un backup.
- El script de enriquecimiento es idempotente; volver a lanzarlo solo actualiza registros existentes.
