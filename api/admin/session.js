import { hasAdminSession, isAdminConfigured } from "../../lib/adminAuth.js";

export default function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Метод не поддерживается." });
  }
  return res.status(200).json({
    authenticated: hasAdminSession(req),
    configured: isAdminConfigured(),
  });
}
