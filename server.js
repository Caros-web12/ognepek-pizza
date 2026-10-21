import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

import dbTest from "./api/db-test.js";
import createOrder from "./api/orders.js";
import adminBusinessReports from "./api/admin/business-reports.js";
import adminFinancialPlans from "./api/admin/financial-plans.js";
import adminLogin from "./api/admin/login.js";
import adminLogout from "./api/admin/logout.js";
import adminOrders from "./api/admin/orders.js";
import adminSession from "./api/admin/session.js";
import adminStats from "./api/admin/stats.js";

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));
const distDirectory = path.join(rootDirectory, "dist");
const app = express();
const port = Number(process.env.PORT || 8080);

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

function route(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res)).catch(next);
  };
}

const apiRoutes = {
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

for (const [routePath, handler] of Object.entries(apiRoutes)) {
  app.all(routePath, route(handler));
}

app.get(["/admin", "/admin/"], (req, res) => {
  res.sendFile(path.join(distDirectory, "admin.html"));
});

app.use(express.static(distDirectory, {
  index: "index.html",
  maxAge: "1h",
}));

app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "API-адрес не найден." });
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    return res.status(404).send("Not found");
  }
  return res.sendFile(path.join(distDirectory, "index.html"));
});

app.use((error, req, res, next) => {
  console.error("Unhandled application error:", error);
  if (res.headersSent) return next(error);
  if (req.path.startsWith("/api/")) {
    return res.status(500).json({ error: "Внутренняя ошибка сервера." });
  }
  return res.status(500).send("Внутренняя ошибка сервера.");
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Печка запущена на порту ${port}`);
});
