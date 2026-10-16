import {
  createAdminSession,
  isAdminConfigured,
  parseJsonBody,
  verifyAdminPassword,
} from "../../lib/adminAuth.js";

export default function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Метод не поддерживается." });
  }

  if (!isAdminConfigured()) {
    return res.status(503).json({ error: "Вход администратора не настроен на сервере." });
  }

  let body;
  try {
    body = parseJsonBody(req);
  } catch {
    return res.status(400).json({ error: "Не удалось прочитать запрос." });
  }

  if (!verifyAdminPassword(body?.password)) {
    return res.status(401).json({ error: "Неверный пароль." });
  }

  createAdminSession(res, req);
  return res.status(200).json({ ok: true });
}
