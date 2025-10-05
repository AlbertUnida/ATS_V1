const { Pool } = require('pg');
require('dotenv/config');

async function run(table) {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'postgres',
  });

  try {
    const query = `
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position
    `;
    const { rows } = await pool.query(query, [table]);
    console.table(rows);
  } catch (error) {
    console.error(error);
  } finally {
    await pool.end();
  }
}

const table = process.argv[2];
if (!table) {
  console.error('Usage: node check-columns.js <table_name>');
  process.exit(1);
}
run(table);
