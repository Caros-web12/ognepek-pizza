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

  let loadedOrders = [];
  let statBoxes = null;
  let showArchived = false;
  function reloadStats() {
    if (!statBoxes) return;
    statBoxes.count.textContent = String(loadedOrders.length);
    statBoxes.sum.textContent = formatMoney(loadedOrders.filter(order => !order.archived).reduce((sum, order) => sum + Number(order.total || 0), 0));
    statBoxes.open.textContent = String(loadedOrders.filter(order => !order.archived && !["Готов", "Доставлен", "Отменён"].includes(order.status)).length);
  }

  async function renderDashboard() {
    root.className = "page-shell";
    root.replaceChildren();
    root.append(element("section", "panel loading-panel", "Загружаем реальные заказы из Neon…"));

    try {
      const ordersUrl = showArchived ? "/api/admin/orders?includeArchived=true" : "/api/admin/orders";
      const data = await jsonRequest(ordersUrl, { method: "GET" });
      loadedOrders = Array.isArray(data.orders) ? data.orders : [];
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
    title.append(document.createTextNode("Заказы "));
    title.append(element("em", "", "из печи."));
    titleBox.append(title, element("p", "muted", "Здесь отображаются заказы из базы Neon. Изменения статуса сохраняются на сервере."));
    const actions = element("div", "actions");
    const refresh = element("button", "secondary", "Обновить список");
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
    actions.append(refresh, archiveToggle, logout);
    head.append(titleBox, actions);

    const stats = element("section", "stats");
    const count = makeStat("Заказов в списке", "0");
    const sum = makeStat("Сумма заказов", "0 ₽");
    const open = makeStat("В работе", "0");
    stats.append(count.box, sum.box, open.box);
    statBoxes = { count: count.value, sum: sum.value, open: open.value };
    reloadStats();

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
    root.append(masthead, head, stats, panel, element("div", "footer-note", "Печка · ДАННЫЕ ИЗ NEON · СЕССИЯ ЗАЩИЩЕНА"));
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
