
import { neon } from "../lib/pg-compat.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!process.env.DATABASE_URL) {
    return res.status(500).json({
      error: "DATABASE_URL is not configured",
    });
  }

  try {
    const sql = neon(process.env.DATABASE_URL);
    const result = await sql`SELECT NOW() AS time`;

    return res.status(200).json({
      ok: true,
      message: "Database connected",
      time: result[0].time,
    });
  } catch (error) {
    console.error("Database connection failed");
    return res.status(500).json({
      error: "Database connection failed",
    });
  }
}
