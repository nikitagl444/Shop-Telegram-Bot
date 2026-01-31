// ===== FAQ (оставил твой) =====
const demoFaq = [
  { id: 1, question: "Как выбрать размер?", answer: "Смотрите таблицу размеров в карточке товара. Если сомневаетесь — берите на размер больше для oversize." },
  { id: 2, question: "Сколько доставка?", answer: "Демо-ответ: доставка 1–3 дня по РБ. Стоимость зависит от города и будет добавлена позже." },
  { id: 3, question: "Можно ли вернуть?", answer: "Да, в течение 14 дней при сохранении товарного вида (демо-правило)." }
];

// ===== Helpers =====
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const money = (n) => `${Number(n || 0).toFixed(2)} BYN`;

const LS_KEY = "mini_cart_v2";
// cart: { "productId|size": { productId, size, variationId, qty } }
function loadCart() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); }
  catch { return {}; }
}
function saveCart(cart) {
  localStorage.setItem(LS_KEY, JSON.stringify(cart));
  updateCartDot();
}
function cartKey(productId, size) { return `${productId}|${size}`; }

function getCartQtyForProduct(productId) {
  const cart = loadCart();
  let sum = 0;
  for (const k in cart) if (cart[k].productId === productId) sum += cart[k].qty;
  return sum;
}

function updateCartDot() {
  const cart = loadCart();
  const has = Object.keys(cart).length > 0;
  const dot = $("#cartDot");
  if (dot) dot.classList.toggle("hidden", !has);
}

function getUserName() {
  const tg = window.Telegram?.WebApp;
  const n = tg?.initDataUnsafe?.user?.first_name;
  return n || "друг";
}

function apiBase() {
  const u = (window.APP_CONFIG?.BACKEND_URL || "").trim().replace(/\/+$/, "");
  if (!u) throw new Error("BACKEND_URL не задан. Проверь config.js");
  return u;
}

function openPayUrl(url) {
  const tg = window.Telegram?.WebApp;
  if (tg?.openLink) return tg.openLink(url);
  window.location.href = url;
}

function uuidv4() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  const rnd = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
  return `${rnd()}${rnd()}-${rnd()}-${rnd()}-${rnd()}-${rnd()}${rnd()}${rnd()}`;
}

function cartHashForIdempotency() {
  const cart = loadCart();
  const keys = Object.keys(cart).sort();
  return keys.map(k => {
    const it = cart[k];
    const vid = Number(it.variationId || 0);
    return `${it.productId}:${vid}:${it.qty}`;
  }).join("|") || "empty";
}

function getClientOrderIdForCart() {
  const storeKey = "client_order_id_by_cart_v1";
  const map = JSON.parse(sessionStorage.getItem(storeKey) || "{}");
  const h = cartHashForIdempotency();
  if (!map[h]) map[h] = uuidv4();
  sessionStorage.setItem(storeKey, JSON.stringify(map));
  return map[h];
}

// ===== Catalog (from backend) =====
let products = [];

const PLACEHOLDER_IMG = "https://placehold.co/1200x800/png?text=No+Image";

function normalizeProduct(p) {
  const id = Number(p.id);
  const title = String(p.title || p.name || "");
  const sku = String(p.sku || "");
  const category = String(p.category || "Без категории");
  const photo_url = String(p.photo_url || "") || PLACEHOLDER_IMG;

  const desc = String(p.description || p.short_description || "");

  const basePrice = Number(p.price_byn ?? p.price ?? 0) || 0;

  const sizeToVariationId = {};
  const sizeToPrice = {};
  const variations = Array.isArray(p.variations) ? p.variations : [];

  let sizes = ["Стандарт"];
  if (variations.length > 0) {
    sizes = variations.map(v => String(v.label || v.option || `Var ${v.variation_id}`));
    for (const v of variations) {
      const label = String(v.label || v.option || `Var ${v.variation_id}`);
      const vid = Number(v.variation_id || 0) || 0;
      const vp = Number(v.price_byn ?? v.price ?? basePrice) || basePrice;

      sizeToVariationId[label] = vid;
      sizeToPrice[label] = vp;
    }
  }

  // price for list (если у variable basePrice пустой — берём min вариаций)
  let listPrice = basePrice;
  if ((!listPrice || listPrice <= 0) && variations.length > 0) {
    const prices = variations.map(v => Number(v.price_byn ?? v.price ?? 0)).filter(x => x > 0);
    if (prices.length) listPrice = Math.min(...prices);
  }

  return {
    id,
    title,
    sku,
    category,
    photo_url,
    description: desc,
    price_byn: listPrice || 0,
    sizes,
    sizeToVariationId,
    sizeToPrice
  };
}

async function loadCatalog() {
  const r = await fetch(`${apiBase()}/catalog`, { headers: { "accept": "application/json" } });
  if (!r.ok) throw new Error(`catalog failed: ${r.status}`);
  const data = await r.json();
  if (!Array.isArray(data)) throw new Error("catalog: ожидался массив");
  products = data.map(normalizeProduct);
}

function findProduct(productId) {
  return products.find(x => x.id === productId);
}

function getUnitPrice(p, size) {
  if (!p) return 0;
  if (p.sizeToPrice && p.sizeToPrice[size] != null) return Number(p.sizeToPrice[size]) || 0;
  return Number(p.price_byn || 0) || 0;
}

function getVariationId(p, size) {
  const vid = Number(p?.sizeToVariationId?.[size] || 0);
  return vid || null;
}

// ===== Splash (anti-freeze) =====
function initSplash() {
  try {
    const hello = $("#hello");
    if (hello) hello.textContent = `Здравствуй, ${getUserName()}`;
  } catch {
    const hello = document.getElementById("hello");
    if (hello) hello.textContent = "Здравствуй!";
  }

  const hide = () => {
    const splash = document.getElementById("splash");
    if (splash) splash.classList.add("hidden");
  };

  setTimeout(hide, 900);
  setTimeout(hide, 3000);
}

// ===== Navigation / Screens =====
const screenMap = {
  home: "#screen-home",
  categories: "#screen-categories",
  cart: "#screen-cart",
  faq: "#screen-faq",
  categoryProducts: "#screen-category-products",
  product: "#screen-product"
};

let navStack = [];

function showScreen(key, { push = true, title = null } = {}) {
  Object.values(screenMap).forEach(sel => {
    const el = $(sel);
    if (el) el.classList.remove("active");
  });

  const current = $(screenMap[key]);
  if (current) current.classList.add("active");

  const topTitle = $("#topTitle");
  if (topTitle) {
    if (title) topTitle.textContent = title;
    else {
      const defaultTitles = { home: "Главная", categories: "Категории", cart: "Корзина", faq: "FAQ" };
      topTitle.textContent = defaultTitles[key] || "";
    }
  }

  const isSub = (key === "product" || key === "categoryProducts");
  const back = $("#backBtn");
  if (back) back.classList.toggle("hidden", !isSub);

  if (push) navStack.push(key);
}

function goBack() {
  navStack.pop();
  const prev = navStack[navStack.length - 1] || "home";
  showScreen(prev, { push: false });
}

function setActiveTab(tabKey) {
  $$(".tab").forEach(btn => {
    const active = btn.dataset.tab === tabKey;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });
}

// ===== Home =====
function renderHome(list) {
  const root = $("#homeList");
  if (!root) return;
  root.innerHTML = "";

  if (!list || list.length === 0) {
    root.innerHTML = `
      <div class="row" style="grid-column: 1 / -1; cursor: default">
        <div class="row__left">
          <div class="row__title">Товаров пока нет</div>
          <div class="row__sub">Добавь товары в WooCommerce — они появятся тут</div>
        </div>
      </div>
    `;
    return;
  }

  for (const p of list) {
    const qtyInCart = getCartQtyForProduct(p.id);
    const inCart = qtyInCart > 0;

    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <img class="card__img" src="${p.photo_url}" alt="${escapeHtml(p.title)}" />
      <div class="card__body">
        <div class="card__title">${escapeHtml(p.title)}</div>
        <div class="card__sku">${escapeHtml(p.sku)} • ${escapeHtml(p.category)}</div>
        <div class="card__row">
          <div class="price">${money(p.price_byn)}</div>
          ${inCart ? `<div class="badge">В корзине (${qtyInCart})</div>` : ``}
        </div>
      </div>
    `;
    card.addEventListener("click", () => openProduct(p.id));
    root.appendChild(card);
  }
}

function initSearch() {
  const input = $("#searchInput");
  if (!input) return;
  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    const filtered = products.filter(p =>
      (p.title || "").toLowerCase().includes(q) ||
      (p.sku || "").toLowerCase().includes(q)
    );
    renderHome(filtered);
  });
}

// ===== Categories =====
function renderCategories() {
  const cats = Array.from(new Set(products.map(p => p.category))).sort();
  const root = $("#catList");
  if (!root) return;
  root.innerHTML = "";

  for (const c of cats) {
    const count = products.filter(p => p.category === c).length;
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `
      <div class="row__left">
        <div class="row__title">${escapeHtml(c)}</div>
        <div class="row__sub">${count} ${declOfNum(count, ["товар", "товара", "товаров"])}</div>
      </div>
      <div aria-hidden="true">›</div>
    `;
    row.addEventListener("click", () => openCategory(c));
    root.appendChild(row);
  }
}

function openCategory(categoryName) {
  const catTitle = $("#catTitle");
  if (catTitle) catTitle.textContent = categoryName;

  const list = products.filter(p => p.category === categoryName);

  const cc = $("#catCount");
  if (cc) cc.textContent = `${list.length} ${declOfNum(list.length, ["товар", "товара", "товаров"])}`;

  renderCategoryProducts(list);
  showScreen("categoryProducts", { title: categoryName });
}

function renderCategoryProducts(list) {
  const root = $("#catProducts");
  if (!root) return;
  root.innerHTML = "";

  for (const p of list) {
    const qtyInCart = getCartQtyForProduct(p.id);
    const inCart = qtyInCart > 0;

    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <img class="card__img" src="${p.photo_url}" alt="${escapeHtml(p.title)}" />
      <div class="card__body">
        <div class="card__title">${escapeHtml(p.title)}</div>
        <div class="card__sku">${escapeHtml(p.sku)}</div>
        <div class="card__row">
          <div class="price">${money(p.price_byn)}</div>
          ${inCart ? `<div class="badge">В корзине (${qtyInCart})</div>` : ``}
        </div>
      </div>
    `;
    card.addEventListener("click", () => openProduct(p.id));
    root.appendChild(card);
  }
}

// ===== Product page =====
function openProduct(productId) {
  const p = findProduct(productId);
  if (!p) return;

  let selectedSize = p.sizes[0];
  let qty = 1;

  const root = $("#productView");
  if (!root) return;

  root.innerHTML = `
    <img class="product__img" src="${p.photo_url}" alt="${escapeHtml(p.title)}" />
    <div class="product__title">${escapeHtml(p.title)}</div>
    <div class="product__meta">
      <span>${escapeHtml(p.sku)}</span>
      <span>•</span>
      <span>${escapeHtml(p.category)}</span>
      <span>•</span>
      <strong id="prodPrice">${money(getUnitPrice(p, selectedSize))}</strong>
    </div>

    <div class="pills" id="sizePills"></div>

    <div class="qty">
      <button class="qty__btn" id="qtyMinus">−</button>
      <div class="qty__val" id="qtyVal">1</div>
      <button class="qty__btn" id="qtyPlus">+</button>
    </div>

    <div id="inCartInfo"></div>

    <button class="btn btn--primary" id="addToCartBtn">Добавить в корзину</button>

    <div style="color: rgba(154,163,178,.92); line-height:1.35; font-size:13px">
      ${escapeHtml(p.description || "")}
    </div>
  `;

  const pills = $("#sizePills");

  const renderPills = () => {
    if (!pills) return;
    pills.innerHTML = "";
    for (const s of p.sizes) {
      const b = document.createElement("button");
      b.className = "pill" + (s === selectedSize ? " active" : "");
      b.textContent = s;
      b.addEventListener("click", () => {
        selectedSize = s;
        renderPills();
        renderInCartInfo();
        const priceEl = $("#prodPrice");
        if (priceEl) priceEl.textContent = money(getUnitPrice(p, selectedSize));
      });
      pills.appendChild(b);
    }
  };

  const renderInCartInfo = () => {
    const cart = loadCart();
    const k = cartKey(p.id, selectedSize);
    const cur = cart[k]?.qty || 0;
    const el = $("#inCartInfo");
    if (!el) return;
    el.innerHTML = cur > 0
      ? `<div class="badge" style="display:inline-flex">Уже в корзине: ${cur} шт. (размер ${escapeHtml(selectedSize)})</div>`
      : "";
  };

  const renderQty = () => {
    const val = $("#qtyVal");
    const minus = $("#qtyMinus");
    if (val) val.textContent = String(qty);
    if (minus) {
      minus.disabled = qty <= 1;
      minus.style.opacity = qty <= 1 ? "0.5" : "1";
    }
  };

  const plus = $("#qtyPlus");
  const minus = $("#qtyMinus");
  if (plus) plus.addEventListener("click", () => { qty++; renderQty(); });
  if (minus) minus.addEventListener("click", () => { qty = Math.max(1, qty - 1); renderQty(); });

  const addBtn = $("#addToCartBtn");
  if (addBtn) addBtn.addEventListener("click", () => {
    const cart = loadCart();
    const k = cartKey(p.id, selectedSize);
    const prev = cart[k]?.qty || 0;

    cart[k] = {
      productId: p.id,
      size: selectedSize,
      variationId: getVariationId(p, selectedSize),
      qty: Math.min(99, prev + qty)
    };
    saveCart(cart);

    renderHome(products);
    renderInCartInfo();
    alert("Добавлено в корзину ✅");
  });

  renderPills();
  renderQty();
  renderInCartInfo();

  showScreen("product", { title: "Товар" });
}

// ===== Cart =====
function renderCart() {
  const cart = loadCart();
  const keys = Object.keys(cart);
  const root = $("#cartList");
  if (!root) return;

  root.innerHTML = "";
  let total = 0;

  if (keys.length === 0) {
    root.innerHTML = `
      <div class="row" style="cursor:default">
        <div class="row__left">
          <div class="row__title">Корзина пустая</div>
          <div class="row__sub">Добавьте товары на главной странице</div>
        </div>
      </div>
    `;
    const totalEl = $("#cartTotal");
    if (totalEl) totalEl.textContent = money(0);
    return;
  }

  for (const k of keys) {
    const item = cart[k];
    const p = findProduct(item.productId);
    if (!p) continue;

    const unit = getUnitPrice(p, item.size);
    const line = unit * item.qty;
    total += line;

    const row = document.createElement("div");
    row.className = "cartItem";
    row.innerHTML = `
      <img class="cartItem__img" src="${p.photo_url}" alt="${escapeHtml(p.title)}"/>
      <div class="cartItem__mid">
        <div class="cartItem__title">${escapeHtml(p.title)}</div>
        <div class="cartItem__sub">${escapeHtml(p.sku)} • размер ${escapeHtml(item.size)}</div>
        <div class="cartItem__sub"><strong>${money(unit)}</strong> за шт.</div>
      </div>
      <div class="cartItem__right">
        <div class="qty" style="gap:8px">
          <button class="qty__btn" data-act="minus" style="width:36px;height:36px">−</button>
          <div class="qty__val" style="min-width:22px">${item.qty}</div>
          <button class="qty__btn" data-act="plus" style="width:36px;height:36px">+</button>
        </div>
        <div style="font-weight:900">${money(line)}</div>
      </div>
    `;

    row.querySelector('[data-act="plus"]').addEventListener("click", () => {
      const c = loadCart();
      c[k].qty = Math.min(99, c[k].qty + 1);
      saveCart(c);
      renderCart();
      renderHome(products);
    });

    row.querySelector('[data-act="minus"]').addEventListener("click", () => {
      const c = loadCart();
      c[k].qty -= 1;
      if (c[k].qty <= 0) delete c[k];
      saveCart(c);
      renderCart();
      renderHome(products);
    });

    root.appendChild(row);
  }

  const totalEl = $("#cartTotal");
  if (totalEl) totalEl.textContent = money(total);
}

let checkoutInFlight = false;

function initCheckout() {
  const btn = $("#checkoutBtn");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    const cart = loadCart();
    if (Object.keys(cart).length === 0) {
      alert("Корзина пустая");
      return;
    }
    if (checkoutInFlight) return;

    try {
      checkoutInFlight = true;
      btn.disabled = true;
      btn.textContent = "Создаю заказ…";

      const items = Object.keys(cart).map(k => {
        const it = cart[k];
        const payload = {
          product_id: Number(it.productId),
          quantity: Number(it.qty || 1),
        };
        const vid = Number(it.variationId || 0);
        if (vid) payload.variation_id = vid;
        return payload;
      });

      const body = {
        items,
        telegram_init_data: window.Telegram?.WebApp?.initData || "",
        client_order_id: getClientOrderIdForCart()
      };

      const r = await fetch(`${apiBase()}/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "accept": "application/json" },
        body: JSON.stringify(body)
      });

      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(`create-order ${r.status}: ${JSON.stringify(data)}`);

      openPayUrl(data.pay_url);
    } catch (e) {
      console.error(e);
      alert(String(e.message || e));
    } finally {
      checkoutInFlight = false;
      btn.disabled = false;
      btn.textContent = "Оформить";
    }
  });
}

// ===== FAQ =====
function renderFaq() {
  const root = $("#faqList");
  if (!root) return;
  root.innerHTML = "";

  for (const f of demoFaq) {
    const item = document.createElement("div");
    item.className = "faqItem";
    item.innerHTML = `
      <div class="faqQ">
        <span>${escapeHtml(f.question)}</span>
        <span aria-hidden="true">+</span>
      </div>
      <div class="faqA">${escapeHtml(f.answer)}</div>
    `;
    item.querySelector(".faqQ").addEventListener("click", () => {
      item.classList.toggle("open");
    });
    root.appendChild(item);
  }
}

// ===== Whole category header tap = back =====
function initCategoryHeaderBack() {
  const tap = document.getElementById("catHeaderTap");
  if (!tap) return;

  const go = () => {
    renderCategories();
    setActiveTab("categories");
    showScreen("categories", { title: "Категории" });
  };

  tap.addEventListener("click", go);
  tap.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      go();
    }
  });
}

// ===== Tabs binding =====
function initTabs() {
  $$(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      setActiveTab(tab);

      if (tab === "home") {
        renderHome(products);
        showScreen("home", { title: "Главная" });
      }
      if (tab === "categories") {
        renderCategories();
        showScreen("categories", { title: "Категории" });
      }
      if (tab === "cart") {
        renderCart();
        showScreen("cart", { title: "Корзина" });
      }
      if (tab === "faq") {
        renderFaq();
        showScreen("faq", { title: "FAQ" });
      }
    });
  });

  const back = $("#backBtn");
  if (back) back.addEventListener("click", goBack);
}

// ===== Utils =====
function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function declOfNum(n, titles) {
  const cases = [2, 0, 1, 1, 1, 2];
  return titles[(n % 100 > 4 && n % 100 < 20) ? 2 : cases[(n % 10 < 5) ? n % 10 : 5]];
}

// ===== Init =====
async function init() {
  const tg = window.Telegram?.WebApp;
  try { tg?.ready?.(); tg?.expand?.(); } catch {}

  initSplash();
  initTabs();
  initCategoryHeaderBack();
  initSearch();
  initCheckout();

  updateCartDot();

  navStack = [];

  // небольшой placeholder пока грузится каталог
  const home = $("#homeList");
  if (home) {
    home.innerHTML = `
      <div class="row" style="grid-column: 1 / -1; cursor: default">
        <div class="row__left">
          <div class="row__title">Загрузка каталога…</div>
          <div class="row__sub">Подключаемся к серверу</div>
        </div>
      </div>
    `;
  }

  await loadCatalog();

  renderHome(products);
  showScreen("home", { title: "Главная" });
  setActiveTab("home");
}

document.addEventListener("DOMContentLoaded", () => {
  init().catch(err => {
    console.error(err);
    alert("Не удалось загрузить каталог. Проверь BACKEND_URL в config.js и endpoint /catalog на backend.");
  });
});
