const LS_CART = "miniapp_cart_v1";

const $ = (id) => document.getElementById(id);

function cfg() {
  const url = window.APP_CONFIG?.BACKEND_URL;
  if (!url) throw new Error("BACKEND_URL не задан в config.js");
  return { BACKEND_URL: String(url).replace(/\/+$/, "") };
}

function tg() { return window.Telegram?.WebApp || null; }

function openLink(url) {
  const t = tg();
  if (t?.openLink) return t.openLink(url);
  window.location.href = url;
}

function uuidv4() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  const rnd = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
  return `${rnd()}${rnd()}-${rnd()}-${rnd()}-${rnd()}-${rnd()}${rnd()}${rnd()}`;
}

function setStatus(txt) { $("status").textContent = txt || ""; }
function setPayStatus(txt) { $("payStatus").textContent = txt || ""; }

function money(v) {
  const n = Number(v || 0);
  return `${n.toFixed(2)} BYN`;
}

function loadCart() {
  try { return JSON.parse(localStorage.getItem(LS_CART) || "{}"); }
  catch { return {}; }
}
function saveCart(cart) {
  localStorage.setItem(LS_CART, JSON.stringify(cart));
  renderCartBadge();
}

function cartKey(product_id, variation_id) {
  return `${product_id}:${variation_id || 0}`;
}

function cartHash() {
  const cart = loadCart();
  const keys = Object.keys(cart).sort();
  return keys.map(k => `${cart[k].product_id}-${cart[k].variation_id || 0}-${cart[k].quantity}`).join("|") || "empty";
}

// Один client_order_id на текущую корзину (idempotency)
function getClientOrderIdForCart() {
  const storeKey = "client_order_id_by_cart";
  const map = JSON.parse(sessionStorage.getItem(storeKey) || "{}");
  const h = cartHash();
  if (!map[h]) map[h] = uuidv4();
  sessionStorage.setItem(storeKey, JSON.stringify(map));
  return map[h];
}

let PRODUCTS = [];
let FILTERED = [];

function getCategories() {
  const set = new Set();
  for (const p of PRODUCTS) if (p.category) set.add(p.category);
  return Array.from(set).sort();
}

async function loadCatalog() {
  const url = `${cfg().BACKEND_URL}/catalog`;
  const r = await fetch(url, { headers: { "accept": "application/json" } });
  if (!r.ok) throw new Error(`catalog failed: ${r.status}`);
  const data = await r.json();
  if (!Array.isArray(data)) throw new Error("catalog: ожидался массив");
  PRODUCTS = data;
  FILTERED = data;
}

function renderCategorySelect() {
  const sel = $("category");
  sel.innerHTML = `<option value="">Все категории</option>`;
  for (const c of getCategories()) {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    sel.appendChild(opt);
  }
}

function applyFilters() {
  const q = ($("search").value || "").trim().toLowerCase();
  const cat = $("category").value || "";

  FILTERED = PRODUCTS.filter(p => {
    const okCat = !cat || p.category === cat;
    const okQ = !q || (p.title || "").toLowerCase().includes(q) || (p.sku || "").toLowerCase().includes(q);
    return okCat && okQ;
  });

  renderCatalog();
}

function renderCatalog() {
  const root = $("catalog");
  root.innerHTML = "";

  for (const p of FILTERED) {
    const card = document.createElement("div");
    card.className = "card";

    const img = document.createElement("img");
    img.className = "cardImg";
    img.src = p.photo_url || "https://placehold.co/1200x800/png?text=No+Image";
    img.alt = p.title || `Product ${p.id}`;

    const body = document.createElement("div");
    body.className = "cardBody";

    const title = document.createElement("div");
    title.className = "cardTitle";
    title.textContent = p.title || `Product #${p.id}`;

    const sku = document.createElement("div");
    sku.className = "cardSku";
    sku.textContent = [p.sku, p.category].filter(Boolean).join(" • ");

    const price = document.createElement("div");
    price.className = "price";
    price.textContent = money(p.price_byn);

    const row = document.createElement("div");
    row.className = "cardRow";

    const sel = document.createElement("select");
    sel.className = "select";

    const variations = Array.isArray(p.variations) ? p.variations : [];
    if (variations.length > 0) {
      for (const v of variations) {
        const opt = document.createElement("option");
        opt.value = String(v.variation_id);
        opt.textContent = v.label;
        sel.appendChild(opt);
      }
    } else {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "Стандарт";
      sel.appendChild(opt);
      sel.disabled = true;
    }

    const qty = document.createElement("input");
    qty.className = "qty";
    qty.type = "number";
    qty.min = "1";
    qty.max = "99";
    qty.value = "1";

    row.appendChild(sel);
    row.appendChild(qty);

    const btn = document.createElement("button");
    btn.className = "btn";
    btn.textContent = "Добавить в корзину";
    btn.onclick = () => {
      const variation_id = sel.disabled ? null : (parseInt(sel.value, 10) || null);
      const quantity = Math.max(1, Math.min(99, parseInt(qty.value, 10) || 1));
      addToCart(p.id, variation_id, quantity);
      openCart();
    };

    body.appendChild(title);
    body.appendChild(sku);
    body.appendChild(price);
    body.appendChild(row);
    body.appendChild(btn);

    card.appendChild(img);
    card.appendChild(body);

    root.appendChild(card);
  }
}

function addToCart(product_id, variation_id, quantity) {
  const cart = loadCart();
  const key = cartKey(product_id, variation_id);

  if (!cart[key]) {
    cart[key] = { product_id, variation_id, quantity };
  } else {
    cart[key].quantity = Math.min(99, (cart[key].quantity || 0) + quantity);
  }
  saveCart(cart);
}

function renderCartBadge() {
  const cart = loadCart();
  let sum = 0;
  for (const k in cart) sum += (cart[k].quantity || 0);
  $("cartCount").textContent = String(sum);
}

function openCart() {
  $("backdrop").classList.remove("hidden");
  $("drawer").classList.remove("hidden");
  renderCart();
}

function closeCart() {
  $("backdrop").classList.add("hidden");
  $("drawer").classList.add("hidden");
}

function renderCart() {
  const cart = loadCart();
  const keys = Object.keys(cart);

  $("cartItemsCount").textContent = String(keys.length);

  const list = $("cartList");
  list.innerHTML = "";

  if (keys.length === 0) {
    const div = document.createElement("div");
    div.className = "muted";
    div.textContent = "Корзина пустая";
    list.appendChild(div);
    $("payBtn").disabled = true;
    return;
  }

  $("payBtn").disabled = false;

  for (const k of keys) {
    const it = cart[k];
    const p = PRODUCTS.find(x => x.id === it.product_id);
    const title = p?.title || `Product #${it.product_id}`;

    let sizeText = "Стандарт";
    if (it.variation_id && p?.variations?.length) {
      const v = p.variations.find(x => x.variation_id === it.variation_id);
      if (v) sizeText = v.label;
    }

    const item = document.createElement("div");
    item.className = "cartItem";
    item.innerHTML = `
      <div class="cartTop">
        <div>
          <div class="cartName">${title}</div>
          <div class="cartMeta">Размер: ${sizeText} • Кол-во: ${it.quantity}</div>
        </div>
        <div class="muted">#${it.product_id}</div>
      </div>
      <div class="cartActions">
        <button class="smallBtn" data-act="minus">−</button>
        <button class="smallBtn" data-act="plus">+</button>
        <button class="smallBtn" data-act="del">Удалить</button>
      </div>
    `;

    item.querySelector('[data-act="minus"]').onclick = () => {
      it.quantity = Math.max(1, (it.quantity || 1) - 1);
      cart[k] = it;
      saveCart(cart);
      renderCart();
    };
    item.querySelector('[data-act="plus"]').onclick = () => {
      it.quantity = Math.min(99, (it.quantity || 1) + 1);
      cart[k] = it;
      saveCart(cart);
      renderCart();
    };
    item.querySelector('[data-act="del"]').onclick = () => {
      delete cart[k];
      saveCart(cart);
      renderCart();
    };

    list.appendChild(item);
  }
}

let payInFlight = false;

async function pay() {
  if (payInFlight) return;

  const cart = loadCart();
  const keys = Object.keys(cart);
  if (keys.length === 0) return;

  try {
    payInFlight = true;
    $("payBtn").disabled = true;
    setPayStatus("Создаю заказ...");

    const items = keys.map(k => {
      const it = cart[k];
      return {
        product_id: it.product_id,
        variation_id: it.variation_id || undefined,
        quantity: it.quantity,
      };
    });

    const body = {
      items,
      client_order_id: getClientOrderIdForCart(),
      telegram_init_data: tg()?.initData || "",
    };

    const r = await fetch(`${cfg().BACKEND_URL}/create-order`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "accept": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`create-order ${r.status}: ${JSON.stringify(data)}`);

    setPayStatus(`Заказ #${data.order_id}. Открываю оплату...`);
    openLink(data.pay_url);
  } catch (e) {
    console.error(e);
    setPayStatus(String(e.message || e));
    $("payBtn").disabled = false;
  } finally {
    payInFlight = false;
  }
}

function clearCart() {
  saveCart({});
  setPayStatus("");
  renderCart();
  renderCartBadge();
}

async function init() {
  tg()?.ready?.();

  setStatus("Загружаю каталог...");
  await loadCatalog();
  setStatus("");

  renderCategorySelect();
  renderCartBadge();
  renderCatalog();

  $("search").addEventListener("input", applyFilters);
  $("category").addEventListener("change", applyFilters);

  $("cartBtn").addEventListener("click", openCart);
  $("closeCart").addEventListener("click", closeCart);
  $("backdrop").addEventListener("click", closeCart);

  $("payBtn").addEventListener("click", pay);
  $("clearBtn").addEventListener("click", clearCart);
}

init().catch(err => {
  console.error(err);
  setStatus("Ошибка загрузки каталога. Проверь BACKEND_URL и backend /catalog.");
});
