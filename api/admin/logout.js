import { clearAdminSession } from "../../lib/adminAuth.js";

export default function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Метод не поддерживается." });
  }
  clearAdminSession(res, req);
  return res.status(200).json({ ok: true });
}
