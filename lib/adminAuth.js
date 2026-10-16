import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const ADMIN_COOKIE_NAME = "pechka_admin_session";
const SESSION_TTL_SECONDS = 8 * 60 * 60;

function cookieIsSecure(req) {
  const forwarded = String(req.headers?.["x-forwarded-proto"] || "").split(",")[0].trim();
  return process.env.NODE_ENV === "production" || forwarded === "https";
}

function setSessionCookie(res, req, value, maxAge) {
  const secure = cookieIsSecure(req) ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${ADMIN_COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`
  );
}

export function clearAdminSession(res, req) {
  setSessionCookie(res, req, "", 0);
}

function sign(value, secret) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function safeStringEqual(left, right) {
  const a = createHash("sha256").update(String(left)).digest();
  const b = createHash("sha256").update(String(right)).digest();
  return timingSafeEqual(a, b);
}

export function isAdminConfigured() {
  return Boolean(process.env.ADMIN_PASSWORD && process.env.ADMIN_SESSION_SECRET);
}

export function verifyAdminPassword(password) {
  const configured = process.env.ADMIN_PASSWORD;
  if (!configured || typeof password !== "string" || !password) return false;
  return safeStringEqual(password, configured);
}

export function createAdminSession(res, req) {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error("ADMIN_SESSION_SECRET is not configured");
  const payload = Buffer.from(JSON.stringify({
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    nonce: randomBytes(16).toString("hex"),
  })).toString("base64url");
  const token = `${payload}.${sign(payload, secret)}`;
  setSessionCookie(res, req, token, SESSION_TTL_SECONDS);
}

function getCookie(req, name) {
  const raw = req.headers?.cookie;
  if (typeof raw !== "string") return "";
  for (const piece of raw.split(";")) {
    const separator = piece.indexOf("=");
    if (separator < 0) continue;
    if (piece.slice(0, separator).trim() === name) {
      return piece.slice(separator + 1).trim();
    }
  }
  return "";
}

export function hasAdminSession(req) {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) return false;
  const token = getCookie(req, ADMIN_COOKIE_NAME);
  const separator = token.lastIndexOf(".");
  if (!token || separator <= 0) return false;

  const payload = token.slice(0, separator);
  const suppliedSignature = token.slice(separator + 1);
  const expectedSignature = sign(payload, secret);
  if (!safeStringEqual(suppliedSignature, expectedSignature)) return false;

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return Number.isFinite(decoded.exp) && decoded.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function requireAdmin(req, res) {
  if (!hasAdminSession(req)) {
    res.status(401).json({ error: "Требуется вход администратора." });
    return false;
  }
  return true;
}

export function parseJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body);
  return {};
}
