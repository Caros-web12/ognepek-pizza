import dbTest from "../../api/db-test.js";
import createOrder from "../../api/orders.js";
import adminBusinessReports from "../../api/admin/business-reports.js";
import adminFinancialPlans from "../../api/admin/financial-plans.js";
import adminLogin from "../../api/admin/login.js";
import adminLogout from "../../api/admin/logout.js";
import adminOrders from "../../api/admin/orders.js";
import adminSession from "../../api/admin/session.js";
import adminStats from "../../api/admin/stats.js";

const handlers = {
  "/api/db-test": dbTest,
  "/api/orders": createOrder,
  "/api/admin/business-reports": adminBusinessReports,
  "/api/admin/financial-plans": adminFinancialPlans,
  "/api/admin/login": adminLogin,
  "/api/admin/logout": adminLogout,
  "/api/admin/orders": adminOrders,
  "/api/admin/session": adminSession,
  "/api/admin/stats": adminStats,
};

function createResponseAdapter() {
  let statusCode = 200;
  let body;
  const headers = new Headers();

  return {
    headers,
    get body() {
      return body;
    },
    get statusCode() {
      return statusCode;
    },
    status(code) {
      statusCode = code;
      return this;
    },
    setHeader(name, value) {
      headers.set(name, String(value));
      return this;
    },
    json(value) {
      if (!headers.has("content-type")) {
        headers.set("content-type", "application/json; charset=utf-8");
      }
      body = JSON.stringify(value);
      return this;
    },
    send(value) {
      body = value == null ? null : String(value);
      return this;
    },
  };
}

async function makeRequestAdapter(request, url) {
  const headers = Object.fromEntries(request.headers.entries());
  // The admin session helper uses this to mark cookies Secure behind HTTPS.
  headers["x-forwarded-proto"] = url.protocol.replace(":", "");
  let body;

  if (request.method !== "GET" && request.method !== "HEAD") {
    const text = await request.text();
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
  }

  return {
    method: request.method,
    path: url.pathname,
    url: request.url,
    headers,
    query: Object.fromEntries(url.searchParams.entries()),
    body,
  };
}

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const handler = handlers[url.pathname];

  if (!handler) {
    return Response.json({ error: "API-адрес не найден." }, { status: 404 });
  }

  try {
    const req = await makeRequestAdapter(request, url);
    const res = createResponseAdapter();
    await handler(req, res);

    return new Response(res.body ?? null, {
      status: res.statusCode,
      headers: res.headers,
    });
  } catch (error) {
    console.error("Cloudflare API handler failed:", error);
    return Response.json(
      { error: "Внутренняя ошибка сервера." },
      { status: 500 },
    );
  }
}
