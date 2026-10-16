import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Flame, ShoppingBag, Plus, Minus, X, ArrowRight, Clock3, Leaf, ChefHat, Check, LayoutDashboard, Pizza, ClipboardList, Settings, ChevronDown, Search, CalendarDays } from "lucide-react";
import "./styles.css";
import { initialMenu } from "./pizzaMenu.js";

const initialOrders = [
  { id: "OG-1042", customer: "Анна Смирнова", items: "Маргарита × 1, Пепперони × 1", total: 1340, status: "Готовится", time: "18:42" },
  { id: "OG-1041", customer: "Илья Петров", items: "Четыре сыра × 2", total: 1580, status: "В печи", time: "18:36" },
  { id: "OG-1040", customer: "Мария К.", items: "Ветчина и грибы × 1", total: 790, status: "Готов", time: "18:20" }
];
const money = n => new Intl.NumberFormat("ru-RU").format(n) + " ₽";

// Заказ можно оформить в любой день недели. Дата выпечки — четверг–воскресенье,
// время выпечки/получения 12:00–20:00, предзаказ минимум за 3 часа.
const BAKE_DAYS = new Set([0, 4, 5, 6]); // воскресенье, четверг, пятница, суббота
const ORDER_OPEN_MINUTES = 12 * 60;
const ORDER_CLOSE_MINUTES = 20 * 60;
const ORDER_SLOT_STEP_MINUTES = 30;
const MINIMUM_LEAD_TIME_MS = 3 * 60 * 60 * 1000;

function toLocalDateValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fromDateValue(dateValue) {
  return new Date(`${dateValue}T12:00:00`);
}

function isBakeDay(dateValue) {
  if (!dateValue) return false;
  return BAKE_DAYS.has(fromDateValue(dateValue).getDay());
}

function getAvailableTimeSlots(dateValue, now = new Date()) {
  if (!isBakeDay(dateValue)) return [];

  const slots = [];
  for (
    let minutes = ORDER_OPEN_MINUTES;
    minutes <= ORDER_CLOSE_MINUTES;
    minutes += ORDER_SLOT_STEP_MINUTES
  ) {
    const hours = String(Math.floor(minutes / 60)).padStart(2, "0");
    const mins = String(minutes % 60).padStart(2, "0");
    const slot = `${hours}:${mins}`;
    const slotDate = new Date(`${dateValue}T${slot}:00`);

    if (slotDate.getTime() >= now.getTime() + MINIMUM_LEAD_TIME_MS) {
      slots.push(slot);
    }
  }
  return slots;
}

function getFirstBookingChoice(now = new Date()) {
  for (let offset = 0; offset <= 45; offset += 1) {
    const candidate = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + offset,
      12,
      0,
      0,
      0
    );
    const dateValue = toLocalDateValue(candidate);
    const times = getAvailableTimeSlots(dateValue, now);

    if (times.length > 0) {
      return { date: dateValue, time: times[0] };
    }
  }
  return { date: "", time: "" };
}

function formatScheduleDate(dateValue) {
  if (!dateValue) return "";
  return fromDateValue(dateValue).toLocaleDateString("ru-RU", {
    weekday: "short",
    day: "numeric",
    month: "long",
  });
}

function App() {
  const [menu, setMenu] = useState(initialMenu);
  const [cart, setCart] = useState({});
  const [cartOpen, setCartOpen] = useState(false);
  const [checkout, setCheckout] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [customer, setCustomer] = useState(() => {
    const firstChoice = getFirstBookingChoice(new Date());
    return {
      name: "",
      phone: "",
      address: "",
      method: "Доставка",
      comment: "",
      orderDate: firstChoice.date,
      orderTime: firstChoice.time,
    };
  });
  const [orders, setOrders] = useState(initialOrders);
  const [admin, setAdmin] = useState(false);
  const [adminTab, setAdminTab] = useState("orders");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [notice, setNotice] = useState("");
  const cartItems = useMemo(() => menu.filter(p => cart[p.id]).map(p => ({ ...p, qty: cart[p.id] })), [menu, cart]);
  const totalQty = cartItems.reduce((s, p) => s + p.qty, 0);
  const total = cartItems.reduce((s, p) => s + p.price * p.qty, 0);
  const firstBookingChoice = getFirstBookingChoice(new Date());
  const availableOrderTimes = getAvailableTimeSlots(customer.orderDate, new Date());
  const validSchedule = isBakeDay(customer.orderDate) && availableOrderTimes.includes(customer.orderTime);
  const updateOrderDate = dateValue => {
    const availableTimes = getAvailableTimeSlots(dateValue, new Date());
    setCustomer(current => ({
      ...current,
      orderDate: dateValue,
      orderTime: availableTimes[0] || "",
    }));
  };
  const add = id => setCart(c => ({ ...c, [id]: (c[id] || 0) + 1 }));
  const change = (id, d) => setCart(c => { const n = (c[id] || 0) + d; const next = { ...c }; if (n <= 0) delete next[id]; else next[id] = n; return next; });
  const flash = text => { setNotice(text); setTimeout(() => setNotice(""), 2600); };
  const submitOrder = e => {
    e.preventDefault();

    // Повторно проверяем выбранный слот при отправке формы.
    const currentAvailableTimes = getAvailableTimeSlots(customer.orderDate, new Date());
    if (!isBakeDay(customer.orderDate) || !currentAvailableTimes.includes(customer.orderTime)) {
      flash("Выберите дату выпечки с четверга по воскресенье и время минимум за 3 часа.");
      return;
    }

    const order = {
      id: "OG-" + (1043 + orders.length - initialOrders.length),
      customer: customer.name,
      items: cartItems.map(p => `${p.name} × ${p.qty}`).join(", "),
      total,
      status: "Новый",
      time: new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
      scheduledDate: customer.orderDate,
      scheduledTime: customer.orderTime,
      method: customer.method,
      address: customer.address,
      phone: customer.phone,
      comment: customer.comment,
    };
    setOrders(o => [order, ...o]);
    setCart({});
    setConfirmed(true);
  };
  const statusOptions = ["Новый", "Готовится", "В печи", "Готов", "Доставлен", "Отменён"];

  return <div className="app">
    <div className="announcement"><Flame size={14}/> ПРИНИМАЕМ ЗАКАЗЫ ЕЖЕДНЕВНО <span>·</span> Выпечка и выдача: четверг–воскресенье, 12:00–20:00</div>
    <header className="nav">
      <a className="brand" href="#top" onClick={() => setAdmin(false)}><span className="brand-mark"><Flame size={25}/></span><span>огонёк<small>ПИЦЦА ИЗ ПЕЧИ</small></span></a>
      <nav><a href="#menu">Меню</a><a href="#story">Наша печь</a><a href="#details">Доставка</a></nav>
      <div className="nav-actions"><button className="admin-link" onClick={() => {setAdmin(!admin); setCartOpen(false);}}>{admin ? "На сайт" : "Администратор"}</button><button className="cart-button" onClick={() => {setCartOpen(true);setConfirmed(false)}}><ShoppingBag size={17}/><span>Корзина</span><b>{totalQty}</b></button></div>
    </header>

    {admin ? <main className="admin-page">
      <div className="admin-heading"><div><div className="eyebrow"><span className="dot"/> РАБОЧЕЕ ПРОСТРАНСТВО</div><h1>Панель <em>управления.</em></h1><p>Заказы, меню и немного порядка в горячем деле.</p></div><div className="admin-date">СЕГОДНЯ <strong>{new Date().toLocaleDateString("ru-RU", {day:"numeric",month:"long"})}</strong></div></div>
      <div className="stats"><div className="stat"><span>Заказов сегодня</span><strong>{orders.length + 18}</strong><small>↑ 12% к прошлой неделе</small></div><div className="stat"><span>Выручка сегодня</span><strong>{money(orders.reduce((s,o)=>s+o.total,0)+18450)}</strong><small>По демо-данным</small></div><div className="stat"><span>В работе</span><strong>{orders.filter(o=>!["Готов","Доставлен","Отменён"].includes(o.status)).length}</strong><small>Нуждаются во внимании</small></div><div className="stat"><span>Пицц в меню</span><strong>{menu.length}</strong><small>Все позиции доступны</small></div></div>
      <div className="admin-layout"><aside className="admin-side"><button className={adminTab==="orders"?"selected":""} onClick={()=>setAdminTab("orders")}><ClipboardList size={17}/> Заказы <span>{orders.length}</span></button><button className={adminTab==="menu"?"selected":""} onClick={()=>setAdminTab("menu")}><Pizza size={17}/> Меню</button><button className={adminTab==="settings"?"selected":""} onClick={()=>setAdminTab("settings")}><Settings size={17}/> Настройки</button><div className="side-note"><Flame size={18}/><b>Печь горячая</b><small>Принимаем заказы</small><span className="open-pill"><i/> Открыто</span></div></aside>
      <section className="admin-content">
        {adminTab==="orders" && <><div className="table-title"><div><h2>Последние заказы</h2><p>Следи за каждым заказом от печи до двери.</p></div><label className="search"><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Найти заказ..."/></label></div><div className="order-table"><div className="table-head"><span>ЗАКАЗ</span><span>КЛИЕНТ</span><span>СОСТАВ</span><span>СУММА</span><span>СТАТУС</span></div>{orders.filter(o=>(o.id+o.customer+o.items).toLowerCase().includes(search.toLowerCase())).map(o=><div className="order-row" key={o.id}>
  <div>
    <b>{o.id}</b>
    <small>Создан: {o.time}</small>
    {o.scheduledDate && (
      <small className="scheduled-time">
        На {formatScheduleDate(o.scheduledDate)}, {o.scheduledTime}
      </small>
    )}
  </div>
  <span>{o.customer}</span>
  <span className="items-cell">{o.items}</span>
  <b>{money(o.total)}</b>
  <select className={"status status-" + o.status.replaceAll(" ", "-")} value={o.status} onChange={e => setOrders(os => os.map(x => x.id === o.id ? { ...x, status: e.target.value } : x))}>
    {statusOptions.map(s => <option key={s}>{s}</option>)}
  </select>
</div>)}</div></>}
        {adminTab==="menu" && <><div className="table-title"><div><h2>Меню пицц</h2><p>Управляй позициями и ценами.</p></div><button className="primary small" onClick={()=>setEditing({name:"",tag:"НОВИНКА",description:"",price:"",weight:"400 г",color:"tomato",emoji:"🍕",image:"/images/pizzas/margherita.jpg"})}><Plus size={15}/> Добавить пиццу</button></div><div className="menu-admin-list">{menu.map(p=><div className="menu-admin-row" key={p.id}><span className={"mini-pizza "+p.color}>{p.emoji}</span><div><b>{p.name}</b><small>{p.description}</small></div><strong>{money(p.price)}</strong><button className="text-button" onClick={()=>setEditing({...p})}>Изменить</button><button className="icon-button" onClick={()=>setMenu(m=>m.filter(x=>x.id!==p.id))} aria-label="Удалить"><X size={16}/></button></div>)}</div></>}
        {adminTab==="settings" && <div className="settings-panel"><h2>Настройки пекарни</h2><p>Демо-настройки витрины и времени работы.</p><label>Название<input defaultValue="Печка — пицца из печи"/></label><label>Время выпечки и выдачи<input defaultValue="12:00 — 20:00 · четверг–воскресенье"/></label><label>Стоимость доставки<input defaultValue="250 ₽ · бесплатно от 1 800 ₽"/></label><button className="primary" onClick={()=>flash("Настройки сохранены в демо-режиме")}><Check size={16}/> Сохранить изменения</button><p className="hint">В этой версии данные хранятся в памяти браузера. Для реального запуска подключим базу данных и авторизацию.</p></div>}
      </section></div>
      {editing && <div className="modal-backdrop" onClick={()=>setEditing(null)}><form className="edit-modal" onClick={e=>e.stopPropagation()} onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);const p={id:editing.id||Date.now(),name:f.get("name"),tag:f.get("tag"),description:f.get("description"),price:Number(f.get("price")),weight:f.get("weight"),color:editing.color||"tomato",emoji:editing.emoji||"🍕",image:editing.image||"/images/pizzas/margherita.jpg"};setMenu(m=>editing.id?m.map(x=>x.id===editing.id?p:x):[...m,p]);setEditing(null);flash("Меню обновлено")}}><button type="button" className="modal-close" onClick={()=>setEditing(null)}><X/></button><h2>{editing.id?"Редактировать пиццу":"Новая пицца"}</h2><label>Название<input name="name" required defaultValue={editing.name}/></label><label>Метка<input name="tag" defaultValue={editing.tag}/></label><label>Описание<textarea name="description" required defaultValue={editing.description}/></label><div className="two-fields"><label>Цена, ₽<input name="price" type="number" required min="1" defaultValue={editing.price}/></label><label>Вес<input name="weight" defaultValue={editing.weight}/></label></div><button className="primary" type="submit">Сохранить пиццу</button></form></div>}
    </main> : <>
      <main id="top">
        <section className="hero">
          <div className="hero-copy"><div className="eyebrow"><span className="dot"/> МАЛЕНЬКАЯ ПЕКАРНЯ · БОЛЬШОЙ ОГОНЬ</div><h1>Настоящая<br/>пицца. <em>Живой</em><br/><em>огонь.</em></h1><p>Неаполитанский характер, долгое тесто и русская печь на дровах. Каждая пицца — вручную, с теплом и хрустящим бортиком.</p><div className="hero-actions"><a className="primary" href="#menu">Выбрать пиццу <ArrowRight size={17}/></a><span className="hero-note"><Flame size={17}/> 90 секунд в печи</span></div><div className="hero-foot"><div className="avatar-stack"><span>М</span><span>А</span><span>И</span></div><div><b>Тесто живёт 48 часов</b><small>И ни одной лишней спешки</small></div><span className="hero-star">✳</span></div></div>
          <div className="hero-art hero-art-photo" role="img" aria-label="Дровяная печь, пицца и деревянный стол"><div className="art-stamp">СДЕЛАНО<br/>С ОГНЁМ <Flame size={22}/></div><div className="art-caption"><span>01 / 06</span><b>Маргарита · наша классика</b><span>↗</span></div><div className="art-scribble">fatto a mano</div></div>
        </section>
        <div className="ticker"><span>ДОЛГОЕ ТЕСТО</span><i>✳</i><span>ЖИВОЙ ОГОНЬ</span><i>✳</i><span>РУЧНАЯ РАБОТА</span><i>✳</i><span>ТОЛЬКО СВЕЖЕЕ</span><i>✳</i><span>ДОЛГОЕ ТЕСТО</span></div>
        {/* МЕНЮ: фотографии чистые, без надписей и порядковых номеров */}
        <section className="menu-section section-wrap" id="menu">
          <div className="section-heading">
            <div>
              <div className="eyebrow">МЕНЮ / 01</div>
              <h2>Из печи <em>с любовью.</em></h2>
            </div>
            <p>
              Пицца на живом огне из свежих ингредиентов.<br />
              Готовим после вашего заказа.
            </p>
          </div>

          <div className="pizza-grid">
            {menu.map((p) => (
              <article className="pizza-card" key={p.id}>
                <div className={`pizza-visual ${p.color}`}>
                  <img
                    className="pizza-photo"
                    src={p.image}
                    alt={`Пицца «${p.name}»`}
                    loading="lazy"
                  />
                </div>

                <div className="pizza-info">
                  <div className="pizza-title-row">
                    <h3>{p.name}</h3>
                    <span className="weight">{p.weight}</span>
                  </div>
                  <p>{p.description}</p>

                  <div className="pizza-buy">
                    <strong>{money(p.price)}</strong>
                    {cart[p.id] ? (
                      <div className="qty">
                        <button onClick={() => change(p.id, -1)} aria-label={`Уменьшить количество: ${p.name}`}>
                          <Minus size={14} />
                        </button>
                        <b>{cart[p.id]}</b>
                        <button onClick={() => add(p.id)} aria-label={`Увеличить количество: ${p.name}`}>
                          <Plus size={14} />
                        </button>
                      </div>
                    ) : (
                      <button className="add-button" onClick={() => add(p.id)}>
                        <Plus size={16} /> В корзину
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div className="menu-bottom">
            <span>
              <Leaf size={17} />
              Если нужно убрать ингредиент — напишите об этом в комментарии к заказу.
            </span>
            <button onClick={() => setCartOpen(true)}>
              Перейти к заказу <ArrowRight size={16} />
            </button>
          </div>
        </section>
        <section className="story" id="story"><div className="story-art"><div className="fire-circle"><Flame size={78}/><span>485°</span></div><span className="story-label">ТЕПЛО, КОТОРОЕ ЧУВСТВУЕТСЯ</span></div><div className="story-copy"><div className="eyebrow">НАША ФИЛОСОФИЯ / 02</div><h2>Не ускоряем.<br/><em>Делаем хорошо.</em></h2><p>Мы вдохновились Неаполем, но печём по-своему — в русской дровяной печи. Огонь, камень и правильное тесто делают своё дело. А мы просто не мешаем хорошим продуктам быть собой.</p><div className="principles"><div><Clock3/><b>48 часов</b><small>ферментация теста</small></div><div><Flame/><b>Живой огонь</b><small>никаких конвейеров</small></div><div><ChefHat/><b>Вручную</b><small>от растяжки до подачи</small></div></div></div></section>
        <section className="details section-wrap" id="details"><div><div className="eyebrow">КАК ЭТО РАБОТАЕТ / 03</div><h2>Горячая пицца<br/><em>уже в пути.</em></h2></div><div className="detail-cards"><div><span>01</span><h3>Выбираете</h3><p>Добавьте любимую пиццу в корзину и оформите заказ.</p></div><div><span>02</span><h3>Мы разжигаем</h3><p>Готовим после заказа — прямо в дровяной печи.</p></div><div><span>03</span><h3>Вы наслаждаетесь</h3><p>Самовывоз или доставка. Главное — есть горячей.</p></div></div></section>
      </main>
      <footer><a className="brand" href="#top"><span className="brand-mark"><Flame size={25}/></span><span>огонёк<small>ПИЦЦА ИЗ ПЕЧИ</small></span></a><p>Сделано с огнём и хорошим тестом.</p><div><a href="#menu">Меню</a><a href="#story">О нас</a><a href="#details">Доставка</a><button onClick={()=>{setAdmin(true);window.scrollTo(0,0)}}>Вход для команды ↗</button></div><small>© 2026 Печка. Демо-сайт домашней пекарни.</small></footer>
    </>}

    {cartOpen && <div className="drawer-backdrop" onClick={()=>setCartOpen(false)}><aside className="cart-drawer" onClick={e=>e.stopPropagation()}><div className="drawer-head"><div><span className="eyebrow">ВАШ ЗАКАЗ</span><h2>{confirmed?"Уже в работе!":"Корзина"} <em>{confirmed?"✳":`(${totalQty})`}</em></h2></div><button className="icon-button" onClick={()=>{setCartOpen(false);setCheckout(false);setConfirmed(false)}}><X/></button></div>
      {confirmed ? <div className="success-state"><span className="success-icon"><Check size={34}/></span><h3>Спасибо за заказ!</h3><p>Заказ принят в демо-режиме. Наша команда уже разогревает печь.</p>
        <p className="success-schedule">
          Запланировано: {formatScheduleDate(customer.orderDate)}, {customer.orderTime}
        </p><button className="primary" onClick={()=>{setCartOpen(false);setCheckout(false);setConfirmed(false)}}>Продолжить выбирать</button></div> : checkout ? <form className="checkout-form" onSubmit={submitOrder}>
        <button type="button" className="back-link" onClick={() => setCheckout(false)}>
          ← Назад в корзину
        </button>
        <h3>Куда доставить тепло?</h3>

        <div className="method-switch">
          <button
            type="button"
            className={customer.method === "Доставка" ? "active" : ""}
            onClick={() => setCustomer({ ...customer, method: "Доставка" })}
          >
            Доставка
          </button>
          <button
            type="button"
            className={customer.method === "Самовывоз" ? "active" : ""}
            onClick={() => setCustomer({ ...customer, method: "Самовывоз" })}
          >
            Самовывоз
          </button>
        </div>

        <div className="date-time-grid">
          <label className="bake-date-label">
            Дата выпечки
            <span className="bake-date-control">
              <input
                className="bake-date-input"
                type="date"
                required
                min={firstBookingChoice.date}
                value={customer.orderDate}
                onClick={e => {
                  // На поддерживаемых браузерах открываем календарь по клику на всё поле.
                  if (typeof e.currentTarget.showPicker === "function") {
                    try { e.currentTarget.showPicker(); } catch { /* Браузер может уже открыть календарь сам. */ }
                  }
                }}
                onChange={e => updateOrderDate(e.target.value)}
                aria-label="Выберите дату выпечки"
              />
              <CalendarDays className="bake-date-icon" size={18} aria-hidden="true" />
            </span>
          </label>
          <label>
            Время получения
            <select
              required
              value={customer.orderTime}
              onChange={e => setCustomer({ ...customer, orderTime: e.target.value })}
              disabled={availableOrderTimes.length === 0}
            >
              <option value="">Выберите время</option>
              {availableOrderTimes.map(time => (
                <option key={time} value={time}>{time}</option>
              ))}
            </select>
          </label>
        </div>

        {!isBakeDay(customer.orderDate) && (
          <p className="booking-warning">
            Заказ можно оформить в любой день. Выпекаем только с четверга по воскресенье — выберите дату выпечки в эти дни.
          </p>
        )}
        {isBakeDay(customer.orderDate) && availableOrderTimes.length === 0 && (
          <p className="booking-warning">
            На выбранный день уже нет доступного времени с предзаказом за 3 часа. Выберите другую дату.
          </p>
        )}
        <p className="booking-help">
          Заказ можно оформить в любой день недели. Выпечка и получение — с четверга по воскресенье.
          Время: с 12:00 до 20:00. Предзаказ — минимум за 3 часа.
        </p>

        <label>
          Ваше имя
          <input
            required
            value={customer.name}
            onChange={e => setCustomer({ ...customer, name: e.target.value })}
            placeholder="Как к вам обращаться?"
          />
        </label>
        <label>
          Телефон
          <input
            required
            type="tel"
            value={customer.phone}
            onChange={e => setCustomer({ ...customer, phone: e.target.value })}
            placeholder="+7 (___) ___-__-__"
          />
        </label>
        {customer.method === "Доставка" && (
          <label>
            Адрес доставки
            <input
              required
              value={customer.address}
              onChange={e => setCustomer({ ...customer, address: e.target.value })}
              placeholder="Улица, дом, квартира"
            />
          </label>
        )}
        <label>
          Комментарий к заказу
          <textarea
            value={customer.comment}
            onChange={e => setCustomer({ ...customer, comment: e.target.value })}
            placeholder="Домофон, пожелания..."
            rows="2"
          />
        </label>

        <div className="checkout-total">
          <span>Итого за пиццу</span>
          <b>{money(total)}</b>
        </div>
        <p className="hint">
          Пока это демо-режим: заказ появится в панели администратора только до перезагрузки страницы.
          Доставка и онлайн-оплата ещё не подключены.
        </p>
        <button className="primary full" type="submit" disabled={!validSchedule}>
          Подтвердить заказ <ArrowRight size={16} />
        </button>
      </form> : <>{cartItems.length===0?<div className="empty-cart"><span>🍕</span><h3>Пока пустовато</h3><p>Добавьте пиццу из меню — печь уже готова.</p><button className="primary" onClick={()=>setCartOpen(false)}>Выбрать пиццу</button></div>:<><div className="cart-items">{cartItems.map(p=><div className="cart-item" key={p.id}><span className={"cart-emoji "+p.color}>{p.emoji}</span><div className="cart-item-main"><b>{p.name}</b><small>{p.weight}</small><strong>{money(p.price*p.qty)}</strong></div><div className="qty"><button onClick={()=>change(p.id,-1)}><Minus size={14}/></button><b>{p.qty}</b><button onClick={()=>add(p.id)}><Plus size={14}/></button></div></div>)}</div><div className="drawer-bottom"><div className="delivery-note"><Flame size={17}/><span>Готовим после заказа.<br/><b>Обычно 25–40 минут</b></span></div><div className="checkout-total"><span>Итого</span><b>{money(total)}</b></div><button className="primary full" onClick={()=>setCheckout(true)}>Оформить заказ <ArrowRight size={16}/></button><small>Нажимая кнопку, вы отправляете тестовый заказ.</small></div></>}</>}
      </aside></div>}
    {notice && <div className="toast"><Check size={16}/>{notice}</div>}
    <button className="floating-cart" onClick={()=>setCartOpen(true)}><ShoppingBag size={18}/>{totalQty>0&&<b>{totalQty}</b>}</button>
  </div>
}
createRoot(document.getElementById("root")).render(<App/>);