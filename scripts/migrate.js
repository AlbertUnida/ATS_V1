const path = require('path');
const fs = require('fs/promises');
const { Pool } = require('pg');
require('dotenv/config');

async function main() {
  const migrationsDir = path.join(__dirname, '..', 'db', 'migrations');
  const files = (await fs.readdir(migrationsDir))
    .filter((file) => file.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.log('[migrate] No hay migraciones para ejecutar');
    return;
  }

  const pool = new Pool({
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME ?? 'postgres',
  });

  const client = await pool.connect();
  try {
    for (const file of files) {
      const fullPath = path.join(migrationsDir, file);
      const sql = await fs.readFile(fullPath, 'utf8');
      console.log(`[migrate] Ejecutando ${file}`);
      await client.query(sql);
    }
    console.log('[migrate] Migraciones completadas');
  } catch (error) {
    console.error('[migrate] Error durante la migración:', error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('[migrate] Error inesperado:', error);
  process.exit(1);
});
