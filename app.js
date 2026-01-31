function uuidv4() {
  // Нормальный UUID если доступен
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();

  // Fallback (достаточно для idempotency)
  const rnd = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
  return `${rnd()}${rnd()}-${rnd()}-${rnd()}-${rnd()}-${rnd()}${rnd()}${rnd()}`;
}

function setStatus(text) {
  const el = document.getElementById("status");
  if (el) el.textContent = text || "";
}

function setLoading(isLoading) {
  const btn = document.getElementById("payBtn");
  if (btn) btn.disabled = !!isLoading;
}

function getBackendUrl() {
  const url = window.APP_CONFIG?.BACKEND_URL;
  if (!url) throw new Error("BACKEND_URL не задан в config.js");
  return url.replace(/\/+$/, "");
}

async function createOrder(items) {
  const BACKEND_URL = getBackendUrl();
  const client_order_id = uuidv4();

  const tg = window.Telegram?.WebApp;
  const telegram_init_data = tg?.initData || "";

  const payload = {
    items,
    client_order_id,
    telegram_init_data,
  };

  const r = await fetch(`${BACKEND_URL}/create-order`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "accept": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(`create-order failed: ${r.status} ${JSON.stringify(data)}`);
  }
  return data; // { order_id, pay_url }
}

function openPayUrl(url) {
  const tg = window.Telegram?.WebApp;

  // В Telegram лучше openLink
  if (tg?.openLink) {
    tg.openLink(url);
    return;
  }

  // fallback
  window.location.href = url;
}

async function onPayClick() {
  try {
    setLoading(true);
    setStatus("Создаю заказ...");

    const variation_id = parseInt(document.getElementById("size").value, 10);
    const quantity = parseInt(document.getElementById("qty").value, 10) || 1;

    const items = [{
      product_id: 62,
      variation_id,
      quantity,
    }];

    const res = await createOrder(items);

    setStatus(`Заказ #${res.order_id}. Открываю оплату...`);
    openPayUrl(res.pay_url);
  } catch (e) {
    console.error(e);
    setStatus(String(e.message || e));
    alert(String(e.message || e));
  } finally {
    setLoading(false);
  }
}

function init() {
  const tg = window.Telegram?.WebApp;
  if (tg?.ready) tg.ready();

  const btn = document.getElementById("payBtn");
  btn.addEventListener("click", onPayClick);

  setStatus("Готово. Выбери размер и нажми «Оплатить».");
}

document.addEventListener("DOMContentLoaded", init);
