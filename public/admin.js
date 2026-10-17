(() => {
  const root = document.getElementById("adminRoot");
  const STATUS_OPTIONS = ["Новый", "Готовится", "В печи", "Готов", "Доставлен", "Отменён"];
  let toastTimer;

  function showToast(message) {
    let node = document.querySelector(".toast");
    if (!node) {
      node = document.createElement("div");
      node.className = "toast";
      node.setAttribute("role", "status");
      document.body.appendChild(node);
    }
    node.textContent = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.remove(), 3200);
  }

  async function jsonRequest(url, options = {}) {
    const response = await fetch(url, {
      credentials: "same-origin",
      cache: "no-store",
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    });
    let data = {};
    try { data = await response.json(); } catch { /* non-JSON response */ }
    if (!response.ok) {
      const error = new Error(data.error || `Ошибка сервера (${response.status}).`);
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function formatMoney(value) {
    return new Intl.NumberFormat("ru-RU").format(Number(value) || 0) + " ₽";
  }

  function formatScheduleDate(value) {
    if (!value) return "—";
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return value;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
    return date.toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "long" });
  }

  function statusClass(status) {
    return "status-" + String(status || "").replaceAll(" ", "-");
  }

  function renderLogin(message = "", configured = true) {
    root.className = "page-shell";
    root.replaceChildren();

    const masthead = element("header", "masthead");
    const brand = element("div", "brand");
    brand.append(element("span", "brand-mark", "✦"));
    const brandText = element("span", "", "Печка");
    brandText.append(element("small", "", "ПИЦЦА ИЗ ПЕЧИ"));
    brand.append(brandText);
    masthead.append(brand, element("div", "subhead", "ЗАКРЫТАЯ ЗОНА · ADMIN"));

    const wrap = element("section", "login-wrap");
    const panel = element("div", "panel login-panel");
    panel.append(element("div", "eyebrow", "ТОЛЬКО ДЛЯ КОМАНДЫ"));
    const title = element("h1");
    title.append(document.createTextNode("Рабочее "));
    title.append(element("em", "", "пространство."));
    panel.append(title, element("p", "muted", "Введи пароль администратора, чтобы открыть заказы, составы и статусы выпечки."));

    const form = element("form", "");
    const label = element("label", "field", "Пароль администратора");
    const input = element("input");
    input.type = "password";
    input.name = "password";
    input.autocomplete = "current-password";
    input.required = true;
    input.minLength = 1;
    input.placeholder = "Введите пароль";
    label.append(input);
    const submit = element("button", "primary", "Войти в панель");
    submit.type = "submit";
    const error = element("p", "message", message);
    error.setAttribute("aria-live", "polite");
    form.append(label, submit, error);
    form.addEventListener("submit", async event => {
      event.preventDefault();
      submit.disabled = true;
      error.textContent = "Проверяем пароль…";
      try {
        await jsonRequest("/api/admin/login", {
          method: "POST",
          body: JSON.stringify({ password: input.value }),
        });
        await renderDashboard();
      } catch (err) {
        error.textContent = err.message || "Не удалось выполнить вход.";
        input.value = "";
        input.focus();
      } finally {
        submit.disabled = false;
      }
    });
    panel.append(form);
    if (!configured) {
      panel.append(element("p", "message", "Вход не настроен: проверь ADMIN_PASSWORD и ADMIN_SESSION_SECRET в окружении сервера."));
      submit.disabled = true;
    }
    panel.append(element("p", "quiet-note", "Сессия защищена и действует ограниченное время. Не используй общедоступное устройство для входа."));
    wrap.append(panel);
    root.append(masthead, wrap, element("div", "footer-note", "Печка · ВНУТРЕННЕЕ РАБОЧЕЕ ПРОСТРАНСТВО"));
    input.focus({ preventScroll: true });
  }

  function makeStat(label, initialValue = "—") {
    const box = element("div", "stat");
    box.append(element("span", "", label), element("strong", "", initialValue));
    return { box, value: box.querySelector("strong") };
  }

  function createOrderCard(order, reload) {
    const card = element("article", "order-card");
    const top = element("div", "order-top");
    const identifiers = element("div", "");
    identifiers.append(element("div", "order-code", order.id || "Без номера"));
    identifiers.append(element("div", "order-time", `Создан: ${order.time || "—"}`));
    top.append(identifiers);

    const select = element("select", `status-control ${statusClass(order.status)}`);
    select.setAttribute("aria-label", `Статус заказа ${order.id || "без номера"}`);
    if (order.status === "Доставлен" || order.archived) {
      select.disabled = true;
      select.title = order.archived
        ? "Заказ находится в архиве. Верните его из архива, чтобы менять статус."
        : "Доставленный заказ нельзя изменить обычным способом.";
    }
    if (order.archived) identifiers.append(element("div", "order-time", "В архиве"));
    for (const status of STATUS_OPTIONS) {
      const option = element("option", "", status);
      option.value = status;
      option.selected = status === order.status;
      select.append(option);
    }
    select.addEventListener("change", async () => {
      const previousStatus = order.status;
      const nextStatus = select.value;
      select.disabled = true;
      try {
        await jsonRequest("/api/admin/orders", {
          method: "PATCH",
          body: JSON.stringify({ publicCode: order.id, status: nextStatus }),
        });
        order.status = nextStatus;
        select.className = `status-control ${statusClass(nextStatus)}`;
        if (nextStatus === "Доставлен") {
          select.disabled = true;
          select.title = "Доставленный заказ нельзя изменить обычным способом.";
        }
        showToast(`Статус ${order.id} сохранён: ${nextStatus}`);
      } catch (err) {
        select.value = previousStatus;
        if (err.status === 401) {
          renderLogin("Сессия завершена. Войди ещё раз.");
          return;
        }
        showToast(err.message || "Не удалось сохранить статус.");
      } finally {
        select.disabled = order.status === "Доставлен" || order.archived;
      }
      reloadStats();
    });
    const archiveButton = element("button", "secondary", order.archived ? "Вернуть из архива" : "В архив");
    archiveButton.type = "button";
    archiveButton.addEventListener("click", async () => {
      const action = order.archived ? "restore" : "archive";
      const question = action === "archive"
        ? `Переместить заказ ${order.id} в архив? Заказ останется в базе и его можно будет вернуть.`
        : `Вернуть заказ ${order.id} из архива?`;
      if (!window.confirm(question)) return;
      archiveButton.disabled = true;
      try {
        await jsonRequest("/api/admin/orders", {
          method: "PATCH",
          body: JSON.stringify({ publicCode: order.id, action }),
        });
        showToast(action === "archive" ? `Заказ ${order.id} перемещён в архив.` : `Заказ ${order.id} возвращён из архива.`);
        await renderDashboard();
      } catch (error) {
        if (error.status === 401) {
          renderLogin("Сессия завершена. Войди ещё раз.");
          return;
        }
        showToast(error.message || "Не удалось изменить архивный статус заказа.");
      } finally {
        archiveButton.disabled = false;
      }
    });
    const controls = element("div", "actions");
    controls.append(select, archiveButton);
    top.append(controls);
    card.append(top);

    const grid = element("div", "order-grid");
    const customer = element("div", "");
    customer.append(element("div", "detail-label", "Клиент"));
    customer.append(element("div", "detail-value", `${order.customer || "—"}\n${order.phone || "Телефон не указан"}`));
    const method = element("div", "");
    method.append(element("div", "detail-label", "Получение"));
    method.append(element("div", "detail-value", `${order.method || "—"}\n${order.address || "Адрес не указан"}`));
    const schedule = element("div", "");
    schedule.append(element("div", "detail-label", "Выпечка / выдача"));
    schedule.append(element("div", "detail-value", `${formatScheduleDate(order.scheduledDate)}\n${order.scheduledTime || "—"}`));
    grid.append(customer, method, schedule);
    card.append(grid);

    const items = element("div", "order-items");
    const left = element("div", "");
    left.append(element("div", "detail-label", "Состав заказа"));
    left.append(element("p", "", order.items || "Состав не указан"));
    if (order.comment) {
      left.append(element("div", "detail-label", "Комментарий"));
      left.append(element("p", "", order.comment));
    }
    items.append(left, element("div", "order-total", formatMoney(order.total)));
    card.append(items);
    return card;
  }

  // ADMIN_STATS_DASHBOARD_V1
  let loadedOrders = [];
  let statBoxes = null;
  let salesChartRoot = null;
  let topItemsRoot = null;
  let businessReportsRoot = null;
  let showArchived = false;
  let currentView = "orders";
  let chartDays = 7;

  function formatChartDay(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
    if (!match) return String(value || "—");
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
    return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }).replace(" г.", "");
  }

  function renderSalesChart(container, rows) {
    if (!container) return;
    container.replaceChildren();
    if (!rows.length) {
      container.append(element("div", "empty-state", "За выбранный период данных пока нет."));
      return;
    }
    const maximum = Math.max(1, ...rows.map(row => Number(row.amountRub) || 0));
    for (const row of rows) {
      const line = element("div", "chart-row");
      const label = element("div", "chart-day");
      label.append(element("strong", "", formatChartDay(row.day)));
      label.append(element("span", "chart-count", String(Number(row.orders) || 0) + " зак."));
      const track = element("div", "chart-track");
      const bar = element("div", "chart-bar");
      const amount = Math.max(0, Number(row.amountRub) || 0);
      bar.style.width = String(Math.max(0, Math.min(100, amount / maximum * 100))) + "%";
      track.append(bar);
      line.append(label, track, element("div", "chart-amount", formatMoney(amount)));
      container.append(line);
    }
  }

  function renderTopItems(container, items) {
    if (!container) return;
    container.replaceChildren();
    if (!items.length) {
      container.append(element("div", "empty-state", "Пока недостаточно заказов для рейтинга."));
      return;
    }
    items.forEach((item, index) => {
      const row = element("div", "top-item");
      row.append(element("span", "top-rank", String(index + 1).padStart(2, "0")));
      const description = element("div", "top-description");
      description.append(element("strong", "top-name", item.name || "Без названия"));
      description.append(element("span", "top-quantity", String(Number(item.quantity) || 0) + " шт."));
      row.append(description, element("strong", "top-amount", formatMoney(item.amountRub)));
      container.append(row);
    });
  }

  async function reloadStats() {
    if (!statBoxes || showArchived) return;
    try {
      const data = await jsonRequest("/api/admin/stats?days=" + chartDays, { method: "GET" });
      if (!statBoxes || showArchived) return;
      const today = data.today || {};
      statBoxes.orders.textContent = String(Number(today.orders) || 0);
      statBoxes.amount.textContent = formatMoney(today.amountRub);
      statBoxes.average.textContent = formatMoney(today.averageCheckRub);
      statBoxes.active.textContent = String(Number(today.activeOrders) || 0);
      statBoxes.ready.textContent = String(Number(today.readyOrders) || 0);
      statBoxes.cancelled.textContent = String(Number(today.canceledOrders) || 0) + " (" + String(Number(today.cancelSharePercent) || 0) + "%)";
      renderSalesChart(salesChartRoot, Array.isArray(data.chart) ? data.chart : []);
      renderTopItems(topItemsRoot, Array.isArray(data.topItems) ? data.topItems : []);
    } catch (error) {
      if (error.status === 401) {
        renderLogin("Сессия завершена. Войди ещё раз.");
        return;
      }
      showToast(error.message || "Не удалось загрузить статистику.");
    }
  }

  // OWNER_EXCEL_REPORTS_V1 — rendered only inside the authenticated admin page.
  function formatReportDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
    if (!match) return String(value || "—");
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
    return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  function reportTable(headers, rows) {
    const wrap = element("div", "owner-report-table-wrap");
    const table = element("table", "owner-report-table");
    const thead = element("thead", "");
    const headRow = element("tr", "");
    headers.forEach(label => headRow.append(element("th", "", label)));
    thead.append(headRow);
    table.append(thead);
    const tbody = element("tbody", "");
    if (!rows.length) {
      const emptyRow = element("tr", "");
      const cell = element("td", "", "Нет записей за этот период.");
      cell.colSpan = headers.length;
      emptyRow.append(cell);
      tbody.append(emptyRow);
    } else {
      rows.forEach(values => {
        const row = element("tr", "");
        values.forEach(value => row.append(element("td", "", value === null || value === undefined || value === "" ? "—" : value)));
        tbody.append(row);
      });
    }
    table.append(tbody);
    wrap.append(table);
    return wrap;
  }

  function reportMetrics(items) {
    const grid = element("div", "owner-report-metrics");
    items.forEach(item => {
      const box = element("div", "stat");
      box.append(element("span", "", item[0]), element("strong", "", item[1]));
      grid.append(box);
    });
    return grid;
  }

  function reportPanel(titleText, description) {
    const panel = element("section", "panel owner-report-panel");
    const header = element("div", "owner-report-header");
    header.append(element("h2", "", titleText));
    if (description) header.append(element("p", "", description));
    panel.append(header);
    return panel;
  }

  function renderOwnerReports(snapshot) {
    if (!businessReportsRoot) return;
    businessReportsRoot.replaceChildren();
    const titlePanel = reportPanel("Финансовые отчёты", "Внутренние данные из книги «Печка.xlsx». Раздел доступен только после входа в админку.");
    businessReportsRoot.append(titlePanel);

    if (!snapshot || !snapshot.payload) {
      titlePanel.append(element("p", "report-note", "Снимок Excel ещё не импортирован в базу. Выполни приватный SQL-файл owner-reports-seed.sql в Neon → SQL Editor после создания таблицы отчётов."));
      return;
    }

    const data = snapshot.payload;
    const meta = data.meta || {};
    const economics = data.economics || {};
    const operations = data.operations || {};
    const balance = data.balance || {};
    const sourceLine = "Источник: " + (snapshot.sourceFile || meta.workbook || "Excel") +
      ". Импортировано: " + (snapshot.importedAt ? new Date(snapshot.importedAt).toLocaleString("ru-RU") : "—") +
      ". Последняя запись в листе отчёта: " + formatReportDate(meta.lastActivityDate || operations.lastActivityDate) + ".";
    titlePanel.append(element("p", "report-source", sourceLine));
    titlePanel.append(element("p", "report-note", "Это снимок данных из Excel, а не автоматическая синхронизация. При обновлении книги потребуется повторный импорт. Продажи из Excel и онлайн-заказы сайта показаны отдельно."));

    const economicsPanel = reportPanel("Экономика Ф · план", "Плановая модель, не фактическая выручка. Постоянные расходы в исходном листе не заполнены; показатель после 4% — расчётное допущение, а не подтверждённая чистая прибыль.");
    economicsPanel.append(reportMetrics([
      ["Пицц в неделю по плану", String(Number(economics.weeklyUnits) || 0) + " шт."],
      ["Пицц в месяц по плану", String(Number(economics.monthlyUnits) || 0) + " шт."],
      ["Выручка в месяц по плану", formatMoney(economics.monthlyRevenueRub)],
      ["Себестоимость плана в месяц", formatMoney(economics.monthlyCostRub)],
      ["До вычета условных 4%", formatMoney(economics.monthlyProfitBeforeTaxRub)],
      ["Модель после 4%", formatMoney(economics.monthlyModelProfitAfter4PercentRub)],
    ]));
    economicsPanel.append(reportTable(
      ["Пицца", "Цена", "Штук/мес.", "Выручка/мес.", "Себестоимость/шт.", "Себестоимость/мес.", "До 4%", "После 4% по модели"],
      (economics.products || []).map(product => [
        product.name, formatMoney(product.priceRub), String(product.monthlyUnits) + " шт.",
        formatMoney(product.monthlyRevenueRub), formatMoney(product.unitFoodCostRub),
        formatMoney(product.monthlyCostRub), formatMoney(product.monthlyProfitBeforeTaxRub),
        formatMoney(product.monthlyModelProfitAfter4PercentRub),
      ])
    ));
    businessReportsRoot.append(economicsPanel);

    const operationsPanel = reportPanel("Отчёт по продажам и списаниям", "Продажи: " + formatReportDate(operations.salesPeriodStart) + " — " + formatReportDate(operations.salesPeriodEnd) + ". Списания внесены по " + formatReportDate(operations.lastActivityDate) + ".");
    operationsPanel.append(reportMetrics([
      ["Продано пицц", String(Number(operations.soldUnits) || 0) + " шт."],
      ["Выручка по продажам", formatMoney(operations.salesRevenueRub)],
      ["Надбавка за доставку", formatMoney(operations.deliverySurchargeRub)],
      ["Скидка, записанная в отчёте", formatMoney(operations.recordedDiscountRub)],
      ["Фудкост проданных пицц", formatMoney(operations.foodCostRub)],
      ["Списания ингредиентов по заполненным строкам", formatMoney(operations.writeoffs && operations.writeoffs.ingredientCostRub)],
    ]));
    operationsPanel.append(element("p", "report-note", "Скидка показана справочно отдельным полем и повторно не вычитается из записанной выручки. В исходном листе «Пеппер» и «Пепперони» объединены в одну позицию для сводной таблицы."));
    const dailyHeading = element("h3", "owner-report-subheading", "Продажи по дням");
    operationsPanel.append(dailyHeading, reportTable(
      ["Дата", "Продано", "Выручка", "Надбавка доставки", "Фудкост"],
      (operations.dailySales || []).map(row => [formatReportDate(row.date), String(row.quantity) + " шт.", formatMoney(row.revenueRub), formatMoney(row.deliverySurchargeRub), formatMoney(row.foodCostRub)])
    ));
    operationsPanel.append(element("h3", "owner-report-subheading", "По видам пиццы"), reportTable(
      ["Пицца", "Продано", "Выручка", "Фудкост"],
      (operations.salesByProduct || []).map(row => [row.name, String(row.quantity) + " шт.", formatMoney(row.revenueRub), formatMoney(row.foodCostRub)])
    ));
    const writeoffs = operations.writeoffs || {};
    operationsPanel.append(element("h3", "owner-report-subheading", "Списания ингредиентов"));
    operationsPanel.append(element("p", "muted", "Записей: " + String(Number(writeoffs.count) || 0) + ". Тесто: " + String(Number(writeoffs.doughUnits) || 0) + " порций. Стоимость рассчитана только по заполненным строкам ингредиентов."));
    operationsPanel.append(reportTable(
      ["Дата", "Порций теста", "Стоимость записанных ингредиентов"],
      (writeoffs.entries || []).map(row => [formatReportDate(row.date), String(row.doughUnits), formatMoney(row.ingredientCostRub)])
    ));
    const details = element("details", "owner-report-details");
    details.append(element("summary", "", "Подробные записи продаж"));
    details.append(reportTable(
      ["Дата", "Позиция", "Кол-во", "Выручка", "Доставка", "Оплата", "Скидка", "Фудкост"],
      (operations.transactions || []).map(row => [formatReportDate(row.date), row.name, String(row.quantity), formatMoney(row.revenueRub), formatMoney(row.deliverySurchargeRub), row.paymentMethod, formatMoney(row.discountRub), formatMoney(row.foodCostRub)])
    ));
    operationsPanel.append(details);
    businessReportsRoot.append(operationsPanel);

    const balancePanel = reportPanel("Баланс", "Записи из листа «Баланс»: " + formatReportDate(balance.periodStart) + " — " + formatReportDate(balance.periodEnd) + ".");
    balancePanel.append(reportMetrics([
      ["Поступления", formatMoney(balance.totalIncomeRub)],
      ["Расходы", formatMoney(balance.totalExpenseRub)],
      ["Разница по записям", formatMoney(balance.netCashFlowRub)],
      ["Наличные поступления", formatMoney(balance.cashIncomeRub)],
      ["Безналичные поступления", formatMoney(balance.cashlessIncomeRub)],
    ]));
    balancePanel.append(reportTable(
      ["Дата", "Поступление", "Расход", "Форма расчёта"],
      (balance.entries || []).map(row => [formatReportDate(row.date), formatMoney(row.incomeRub), formatMoney(row.expenseRub), row.paymentMethod])
    ));
    businessReportsRoot.append(balancePanel);
  }

  async function reloadOwnerReports() {
    if (!businessReportsRoot || showArchived) return;
    try {
      const data = await jsonRequest("/api/admin/business-reports", { method: "GET" });
      if (!businessReportsRoot || showArchived) return;
      renderOwnerReports(data.snapshot || null);
    } catch (error) {
      if (error.status === 401) {
        renderLogin("Сессия завершена. Войди ещё раз.");
        return;
      }
      businessReportsRoot.replaceChildren(element("section", "panel owner-report-panel", error.message || "Не удалось загрузить финансовые отчёты."));
    }
  }

  async function renderDashboard() {
    root.className = "page-shell";
    root.replaceChildren();
    root.append(element("section", "panel loading-panel", "Загружаем реальные заказы из Neon…"));

    try {
      const ordersUrl = showArchived ? "/api/admin/orders?includeArchived=true" : "/api/admin/orders";
      const data = await jsonRequest(ordersUrl, { method: "GET" });
      loadedOrders = Array.isArray(data.orders) ? data.orders.slice() : [];
      loadedOrders.sort((a, b) => {
        const timestamp = order => {
          const value = order.createdAt || order.created_at || order.created || order.timestamp;
          const parsed = value ? Date.parse(value) : NaN;
          return Number.isFinite(parsed) ? parsed : 0;
        };
        return timestamp(b) - timestamp(a);
      });
    } catch (error) {
      if (error.status === 401) {
        renderLogin("Сессия не найдена. Войди, чтобы продолжить.");
        return;
      }
      renderLogin(error.message || "Не удалось загрузить заказы.");
      return;
    }

    root.replaceChildren();
    const masthead = element("header", "masthead");
    const brand = element("div", "brand");
    brand.append(element("span", "brand-mark", "✦"));
    const brandText = element("span", "", "Печка");
    brandText.append(element("small", "", "ПИЦЦА ИЗ ПЕЧИ"));
    brand.append(brandText);
    masthead.append(brand, element("div", "subhead", "ЗАКРЫТАЯ ЗОНА · ADMIN"));

    const head = element("section", "dashboard-head");
    const titleBox = element("div", "dashboard-title");
    titleBox.append(element("div", "eyebrow", "РАБОЧЕЕ ПРОСТРАНСТВО"));
    const title = element("h1");
    if (currentView === "reports" && !showArchived) {
      title.append(document.createTextNode("Отчёты "));
      title.append(element("em", "", "и статистика."));
    } else {
      title.append(document.createTextNode("Заказы "));
      title.append(element("em", "", "из печи."));
    }
    titleBox.append(title, element("p", "muted", currentView === "reports" && !showArchived
      ? "Статистика заказов и внутренние финансовые отчёты из Excel."
      : "Последние заказы из базы Neon отображаются первыми. Изменения статуса сохраняются на сервере."));
    const actions = element("div", "actions");
    const ordersViewButton = element("button", "secondary" + (currentView === "orders" ? " nav-selected" : ""), "Заказы");
    ordersViewButton.type = "button";
    ordersViewButton.setAttribute("aria-pressed", String(currentView === "orders"));
    ordersViewButton.addEventListener("click", async () => {
      if (currentView === "orders" && !showArchived) return;
      currentView = "orders";
      showArchived = false;
      await renderDashboard();
    });
    const reportsViewButton = element("button", "secondary" + (currentView === "reports" ? " nav-selected" : ""), "Отчёты и статистика");
    reportsViewButton.type = "button";
    reportsViewButton.setAttribute("aria-pressed", String(currentView === "reports"));
    reportsViewButton.addEventListener("click", async () => {
      if (currentView === "reports" && !showArchived) return;
      currentView = "reports";
      showArchived = false;
      await renderDashboard();
    });
    const refresh = element("button", "secondary", currentView === "reports" ? "Обновить отчёты" : "Обновить заказы");
    refresh.type = "button";
    refresh.addEventListener("click", async () => {
      refresh.disabled = true;
      await renderDashboard();
      showToast("Список обновлён");
    });
    const archiveToggle = element("button", "secondary", showArchived ? "Скрыть архив" : "Показать архив");
    archiveToggle.type = "button";
    archiveToggle.addEventListener("click", async () => {
      showArchived = !showArchived;
      currentView = "orders";
      await renderDashboard();
    });
    const logout = element("button", "secondary", "Выйти");
    logout.type = "button";
    logout.addEventListener("click", async () => {
      logout.disabled = true;
      try { await jsonRequest("/api/admin/logout", { method: "POST", body: "{}" }); }
      catch (error) { showToast(error.message || "Не удалось завершить сессию."); }
      loadedOrders = [];
      renderLogin("Ты вышел из панели.");
    });
    actions.append(ordersViewButton, reportsViewButton, refresh);
    if (currentView === "orders") actions.append(archiveToggle);
    actions.append(logout);
    head.append(titleBox, actions);

    let stats = null;
    let analytics = null;
    statBoxes = null;
    salesChartRoot = null;
    topItemsRoot = null;
    businessReportsRoot = null;
    if (!showArchived && currentView === "reports") {
      stats = element("section", "stats");
      const ordersToday = makeStat("Заказов сегодня", "0");
      const amountToday = makeStat("Сумма сегодня · без отмен", "0 ₽");
      const averageToday = makeStat("Средний чек · без отмен", "0 ₽");
      const activeOrders = makeStat("В работе сейчас", "0");
      const readyOrders = makeStat("Ожидают выдачи", "0");
      const cancelledToday = makeStat("Отменено сегодня · доля", "0 (0%)");
      stats.append(ordersToday.box, amountToday.box, averageToday.box, activeOrders.box, readyOrders.box, cancelledToday.box);
      statBoxes = {
        orders: ordersToday.value,
        amount: amountToday.value,
        average: averageToday.value,
        active: activeOrders.value,
        ready: readyOrders.value,
        cancelled: cancelledToday.value,
      };

      analytics = element("section", "analytics");
      const chartPanel = element("section", "panel analytics-panel");
      const chartHeader = element("div", "analytics-header");
      const chartTitle = element("div", "");
      chartTitle.append(element("h2", "", "Динамика заказов"));
      chartTitle.append(element("p", "", "Сумма за день без отменённых заказов"));
      const rangeTabs = element("div", "range-tabs");
      for (const days of [7, 30]) {
        const rangeButton = element("button", "range-button" + (chartDays === days ? " selected" : ""), String(days) + " дней");
        rangeButton.type = "button";
        rangeButton.setAttribute("aria-pressed", String(chartDays === days));
        rangeButton.addEventListener("click", async () => {
          if (chartDays === days) return;
          chartDays = days;
          for (const button of rangeTabs.querySelectorAll("button")) {
            const selected = button === rangeButton;
            button.classList.toggle("selected", selected);
            button.setAttribute("aria-pressed", String(selected));
          }
          await reloadStats();
        });
        rangeTabs.append(rangeButton);
      }
      chartHeader.append(chartTitle, rangeTabs);
      salesChartRoot = element("div", "sales-chart");
      chartPanel.append(chartHeader, salesChartRoot);

      const topPanel = element("section", "panel analytics-panel");
      const topHeader = element("div", "analytics-header");
      const topTitle = element("div", "");
      topTitle.append(element("h2", "", "Топ-5 пицц"));
      topTitle.append(element("p", "", "По количеству проданных пицц за выбранный период"));
      topHeader.append(topTitle);
      topItemsRoot = element("div", "top-items");
      topPanel.append(topHeader, topItemsRoot);
      analytics.append(chartPanel, topPanel);
      businessReportsRoot = element("section", "owner-reports");
    }

    const panel = element("section", "panel");
    const sectionTitle = element("div", "section-title");
    const sectionHeading = element("div", "");
    sectionHeading.append(
      element("h2", "", showArchived ? "Заказы и архив" : "Последние заказы"),
      element("p", "", showArchived ? "Архивные записи сохранены в Neon; их можно вернуть." : "До 100 последних заказов из базы данных")
    );
    sectionTitle.append(sectionHeading, element("div", "order-count", `${loadedOrders.length} заказ(ов)`));
    const list = element("div", "order-list");
    if (!loadedOrders.length) {
      list.append(element("div", "empty-state", showArchived ? "В архиве пока нет заказов." : "Пока нет заказов. Когда клиент оформит заказ, он появится здесь."));
    } else {
      for (const order of loadedOrders) list.append(createOrderCard(order, reloadStats));
    }
    panel.append(sectionTitle, list);
    const dashboardChildren = [masthead, head];
    if (currentView === "orders" || showArchived) {
      dashboardChildren.push(panel);
    } else {
      dashboardChildren.push(stats, analytics, businessReportsRoot);
    }
    dashboardChildren.push(element("div", "footer-note", "Печка · ДАННЫЕ ИЗ NEON · СЕССИЯ ЗАЩИЩЕНА"));
    root.append(...dashboardChildren);
    if (!showArchived && currentView === "reports") await Promise.all([reloadStats(), reloadOwnerReports()]);
  }

  async function init() {
    try {
      const session = await jsonRequest("/api/admin/session", { method: "GET" });
      if (!session.configured) {
        renderLogin("Вход не настроен на сервере.", false);
        return;
      }
      if (session.authenticated) {
        await renderDashboard();
      } else {
        renderLogin();
      }
    } catch (error) {
      renderLogin("Не удалось связаться с сервером. Проверь, что сайт и API запущены.");
    }
  }

  init();
})();
