const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv/config');

const companies = [
  {
    nombre: 'Pyme Demo Paraguay',
    slug: 'pyme-demo-paraguay',
    ruc: '80012345-6',
    plan_codigo: 'demo',
    is_active: true,
  },
];

const platformUsers = [
  {
    nombre: 'Super Admin TF',
    email: 'superadmin@talentflow.app',
    rol: 'admin',
    is_super_admin: true,
  },
];

const companyUsers = [
  {
    nombre: 'Ana González',
    email: 'ana.gonzalez@pyme-demo.com',
    rol: 'hr_admin',
    company_slug: 'pyme-demo-paraguay',
  },
  {
    nombre: 'Luis Martínez',
    email: 'luis.martinez@pyme-demo.com',
    rol: 'recruiter',
    company_slug: 'pyme-demo-paraguay',
  },
  {
    nombre: 'Carolina Rivas',
    email: 'carolina.rivas@pyme-demo.com',
    rol: 'hiring_manager',
    company_slug: 'pyme-demo-paraguay',
  },
];

async function upsertCompany(client, company) {
  const query = `
    INSERT INTO companies (nombre, slug, ruc, plan_codigo, is_active)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (slug) DO UPDATE
      SET nombre = EXCLUDED.nombre,
          ruc = EXCLUDED.ruc,
          plan_codigo = EXCLUDED.plan_codigo,
          is_active = EXCLUDED.is_active,
          updated_at = NOW()
    RETURNING company_id, slug;
  `;
  const values = [company.nombre, company.slug, company.ruc ?? null, company.plan_codigo ?? null, company.is_active ?? true];
  const { rows } = await client.query(query, values);
  return rows[0];
}

async function upsertUser(client, user, passwordHash) {
  const query = `
    INSERT INTO users (nombre, email, rol, company_id, is_super_admin, activo, invitacion_aceptada, password_hash, password_updated_at)
    VALUES ($1, $2, $3::user_role, $4, $5, TRUE, TRUE, $6, NOW())
    ON CONFLICT (email) DO UPDATE
      SET nombre = EXCLUDED.nombre,
          rol = EXCLUDED.rol,
          company_id = EXCLUDED.company_id,
          is_super_admin = EXCLUDED.is_super_admin,
          activo = TRUE,
          invitacion_aceptada = TRUE,
          password_hash = EXCLUDED.password_hash,
          password_updated_at = NOW(),
          updated_at = NOW()
    RETURNING user_id, nombre, email, rol, company_id, is_super_admin;
  `;
  const values = [
    user.nombre,
    user.email,
    user.rol,
    user.company_id ?? null,
    user.is_super_admin ?? false,
    passwordHash,
  ];
  const { rows } = await client.query(query, values);
  return rows[0];
}

async function main() {
  const pool = new Pool({
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME ?? 'postgres',
  });

  const client = await pool.connect();
  try {
    const plainPassword = process.env.SEED_USER_PASSWORD ?? 'TalentFlow2025!';
    const passwordHash = await bcrypt.hash(plainPassword, 10);

    console.log('[seed] Upserting companies...');
    const companyMap = new Map();
    for (const company of companies) {
      const result = await upsertCompany(client, company);
      companyMap.set(result.slug, result.company_id);
      console.log('[seed] company', result.slug, result.company_id);
    }

    console.log('[seed] Upserting platform users...');
    for (const user of platformUsers) {
      const result = await upsertUser(client, { ...user, company_id: null }, passwordHash);
      console.log('[seed] platform user', result.email, 'super_admin?', result.is_super_admin);
    }

    console.log('[seed] Upserting company users...');
    for (const user of companyUsers) {
      const companyId = companyMap.get(user.company_slug);
      if (!companyId) {
        throw new Error(`Company slug ${user.company_slug} not found`);
      }
      const result = await upsertUser(client, { ...user, company_id: companyId, is_super_admin: false }, passwordHash);
      console.log('[seed] company user', result.email, 'company', user.company_slug);
    }

    console.log('[seed] Completed');
    console.log('[seed] Default password:', plainPassword);
  } catch (error) {
    console.error('[seed] Error:', error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('[seed] Unexpected error:', error);
  process.exit(1);
});
