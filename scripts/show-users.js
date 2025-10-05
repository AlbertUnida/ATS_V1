const { Pool } = require('pg');
require('dotenv/config');

async function main() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'postgres',
  });

  try {
    const { rows } = await pool.query(
      'SELECT email, rol, is_super_admin, company_id, invitacion_aceptada, invitation_sent_at, invitation_expires_at FROM users ORDER BY email',
    );
    console.table(rows);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

