
import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  throw new Error("Не задана переменная DATABASE_URL");
}

const sql = neon(process.env.DATABASE_URL);

export async function testDatabase() {
  const result = await sql`SELECT NOW() AS time`;
  return result[0];
}
