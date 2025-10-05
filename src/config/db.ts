import { Pool } from "pg";
import "dotenv/config";

console.log("[db] PG config:", {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  database: process.env.DB_NAME,
  passwordLength: (process.env.DB_PASSWORD ?? "").length,
});

export const pool = new Pool({
  host: process.env.DB_HOST ?? "localhost",
  port: Number(process.env.DB_PORT ?? 5432),
  user: process.env.DB_USER ?? "postgres",
  password: process.env.DB_PASSWORD ?? "",
  database: process.env.DB_NAME ?? "postgres",
});

pool
  .query("SELECT NOW()")
  .then((result) => console.log("[db] Connected to Postgres:", result.rows[0]))
  .catch((error) => console.error("[db] Error connecting to Postgres:", error));

