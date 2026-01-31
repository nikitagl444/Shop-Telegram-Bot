// ===== FAQ (можешь менять тексты как хочешь) =====
const demoFaq = [
  { id: 1, question: "Как выбрать размер?", answer: "Смотрите размеры в карточке товара. Если сомневаетесь — напишите в поддержку." },
  { id: 2, question: "Сколько доставка?", answer: "Доставка по РБ. Срок и стоимость зависят от города (уточним при оформлении)." },
  { id: 3, question: "Можно ли вернуть?", answer: "Да, в течение 14 дней при сохранении товарного вида." }
];

// ===== Helpers =====
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const money = (n) => `${Number(n || 0).toFixed(2)} BYN`;

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function stripHtmlToText(html) {
  // превращаем Woo description (html) в текст
  const div = document.createElement("div");
  div.innerHTML = String(html || "");
  return (div.textContent || div.innerText || "").trim();
}

function declOfNum(n, titles) {
  const cases = [2, 0, 1, 1, 1, 2];
  return titles[(n % 100 > 4 && n % 100 < 20) ? 2 : cases[(n % 10 < 5) ? n % 10 : 5]];
}

function cfg() {
  const url = window.APP_CONFIG?.BACKEND_URL;
  if (!url) throw new Error("BACKEND_URL не задан. Добавь config.js и подключи его в index.html");
  return { BACKEND_URL: String(url).replace(/\/+$/, "") };
}

function tg() { return window.Telegram?.WebApp; }

function openPayUrl(url) {
  const t = tg();
  if (t?.openLink) return t.openLink(url);
  window.location.href = url;
}

function uuidv4() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  const rnd = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
  return `${rnd()}${rnd()}-${rnd()}-${rnd()}-${rnd()}-${rnd()}${rnd()}${rnd()}`;
}

// ===== Catalog (from backend) =====
let products = []; // normalized

const PLACEHOLDER_IMG = "https://placehold.co/1200x800/png?text=No+Image";

function normalizeProduct(p) {
  const id = Number(p.id);
  const title = String(p.title || p.name || "");
  const sku = String(p.sku || "");
  const category = String(p.category || "Без категории");
  const photo_url = String(p.photo_url || p.image_url || "") || PLACEHOLDER_IMG;

  const basePrice = Number(p.price_byn ?? p.price ?? 0) || 0;

  const variations = Array.isArray(p.variations) ? p.variations : [];
  const sizeLabels = variations.length > 0
    ? variations.map(v => String(v.label || v.option || v.name || `Var ${v.variation_id}`))
    : ["Стандарт"];

  const sizeToVariationId = {};
  const variationIdToPrice = {};
  for (const v of variations) {
    const label = String(v.label || v.option || v.name || `Var ${v.variation_id}`);
    const vid = Number(v.variation_id || v.id || 0) || 0;
    sizeToVariationId[label] = vid;

    const vp = Number(v.price_byn ?? v.price ?? basePrice) || basePrice;
    variationIdToPrice[vid] = vp;
  }

  const descText = stripHtmlToText(p.description || p.short_description || "");

  // price for list: if basePrice=0 and have variations, show min variation price
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
    description_text: descText,
    price_byn: listPrice,
    base_price_byn: basePrice,
    sizes: sizeLabels,
    sizeToVariationId,
    variationIdToPrice,
    raw: p
  };
}

async function loadCatalog() {
  const url = `${cfg().BACKEND_URL}/catalog`;
  const r = await fetch(url, { headers: { "accept": "application/json" } });
  if (!r.ok) throw new Error(`catalog failed: ${r.status}`);
  const data = await r.json();
  if (!Array.isArray(data)) throw new Error("catalog: ожидался массив");
  products = data.map(normalizeProduct);
}

// ===== Cart =====
const LS_KEY = "miniapp_cart_v2";
// cart: { "productId|variationId": { productId, variationId, size, qty } }
function loadCart() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); }
  catch { return {}; }
}
function saveCart(cart) {
  localStorage.setItem(LS_KEY, JSON.stringify(cart));
  updateCartDot();
}

function cartKey(productId, variationId) {
  return `${productId}|${Number(variationId || 0)}`;
}

function updateCartDot() {
  const cart = loadCart();
  const has = Object.keys(cart).length > 0;
  const dot = $("#cartDot");
  if (dot) dot.classList.toggle("hidden", !has);
}

function getCartQtyForProduct(productId) {
  const cart = loadCart();
  let sum = 0;
  for (const k in cart) if (cart[k].productId === productId) sum += cart[k].qty;
  return sum;
}

function cartHashForIdempotency() {
  const cart = loadCart();
  const keys = Object.keys(cart).sort();
  return keys.map(k => {
    const it = cart[k];
    return `${it.productId}:${Number(it.variationId || 0)}:${it.qty}`;
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

function findProduct(productId) {
  return products.find(p => p.id === productId);
}

function getItemUnitPrice(product, variationId) {
  if (!product) return 0;
  const vid = Number(variationId || 0);
  if (vid && product.variationIdToPrice && product.variationIdToPrice[vid] != null) {
    return Number(product.variationIdToPrice[vid]) || 0;
  }
  // fallback to base/list price
  return Number(product.base_price_byn || product.price_byn || 0) || 0;
}

// ===== Splash (anti-freeze) =====
function getUserName() {
  const t = tg();
  const n = t?.initDataUnsafe?.user?.first_name;
  return n || "друг";
}

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
      <div class="row" style="grid-column:1 / -1; cursor:default">
        <div class="row__left">
          <div class="row__title">Нет товаров</div>
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
      <img class="card__img" src="${escapeHtml(p.photo_url)}" alt="${escapeHtml(p.title)}" />
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
  const cats = Array.from(new Set(products.map(p => p.category || "Без категории"))).sort();
  const root = $("#catList");
  if (!root) return;
  root.innerHTML = "";

  for (const c of cats) {
    const count = products.filter(p => (p.category || "Без категории") === c).length;
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

  const list = products.filter(p => (p.category || "Без категории") === categoryName);

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
      <img class="card__img" src="${escapeHtml(p.photo_url)}" alt="${escapeHtml(p.title)}" />
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

  const sizes = Array.isArray(p.sizes) && p.sizes.length ? p.sizes : ["Стандарт"];

  let selectedSize = sizes[0];
  let qty = 1;

  const root = $("#productView");
  if (!root) return;

  const selectedVariationId = () => Number(p.sizeToVariationId?.[selectedSize] || 0) || 0;
  const selectedPrice = () => getItemUnitPrice(p, selectedVariationId());

  root.innerHTML = `
    <img class="product__img" src="${escapeHtml(p.photo_url)}" alt="${escapeHtml(p.title)}" />
    <div class="product__title">${escapeHtml(p.title)}</div>
    <div class="product__meta">
      <span>${escapeHtml(p.sku)}</span>
      <span>•</span>
      <span>${escapeHtml(p.category)}</span>
      <span>•</span>
      <strong id="prodPrice">${money(selectedPrice())}</strong>
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
      ${escapeHtml(p.description_text || "")}
    </div>
  `;

  const pills = $("#sizePills");

  const renderPills = () => {
    if (!pills) return;
    pills.innerHTML = "";

    for (const s of sizes) {
      const b = document.createElement("button");
      b.className = "pill" + (s === selectedSize ? " active" : "");
      b.textContent = s;

      // если товара без вариаций — оставляем одну “Стандарт” и не кликаем
      const hasVariations = Object.keys(p.sizeToVariationId || {}).length > 0;
      if (!hasVariations) {
        b.disabled = true;
        b.style.opacity = "0.9";
        b.style.cursor = "default";
      } else {
        b.addEventListener("click", () => {
          selectedSize = s;
          renderPills();
          renderInCartInfo();
          const priceEl = $("#prodPrice");
          if (priceEl) priceEl.textContent = money(selectedPrice());
        });
      }
      pills.appendChild(b);
    }
  };

  const renderInCartInfo = () => {
    const cart = loadCart();
    const vid = selectedVariationId();
    const k = cartKey(p.id, vid);
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

    const vid = selectedVariationId(); // 0 если simple
    const k = cartKey(p.id, vid);
    const prev = cart[k]?.qty || 0;

    cart[k] = {
      productId: p.id,
      variationId: vid || null,
      size: selectedSize,
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

// ===== Cart render =====
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

    const unit = getItemUnitPrice(p, item.variationId);
    const line = unit * item.qty;
    total += line;

    const sizeText = item.size || "Стандарт";
    const skuText = p.sku ? escapeHtml(p.sku) : "—";

    const row = document.createElement("div");
    row.className = "cartItem";
    row.innerHTML = `
      <img class="cartItem__img" src="${escapeHtml(p.photo_url)}" alt="${escapeHtml(p.title)}"/>
      <div class="cartItem__mid">
        <div class="cartItem__title">${escapeHtml(p.title)}</div>
        <div class="cartItem__sub">${skuText} • размер ${escapeHtml(sizeText)}</div>
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
      c[k].qty = Math.min(99, (c[k].qty || 0) + 1);
      saveCart(c);
      renderCart();
      renderHome(products);
    });

    row.querySelector('[data-act="minus"]').addEventListener("click", () => {
      const c = loadCart();
      c[k].qty = (c[k].qty || 0) - 1;
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

// ===== Checkout (REAL) =====
let checkoutInFlight = false;

async function createOrderFromCart() {
  const cart = loadCart();
  const keys = Object.keys(cart);
  if (keys.length === 0) throw new Error("Корзина пустая");

  const items = keys.map(k => {
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
    client_order_id: getClientOrderIdForCart(),
    telegram_init_data: tg()?.initData || ""
  };

  const url = `${cfg().BACKEND_URL}/create-order`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "accept": "application/json" },
    body: JSON.stringify(body)
  });

  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`create-order ${r.status}: ${JSON.stringify(data)}`);
  return data; // {order_id, pay_url}
}

function initCheckout() {
  const btn = $("#checkoutBtn");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    if (checkoutInFlight) return;

    const cart = loadCart();
    if (Object.keys(cart).length === 0) {
      alert("Корзина пустая");
      return;
    }

    try {
      checkoutInFlight = true;
      btn.disabled = true;
      btn.textContent = "Создаю заказ…";

      const res = await createOrderFromCart();

      // возвращаем кнопку, но обычно пользователь уже ушёл на оплату
      btn.textContent = "Оформить";
      btn.disabled = false;
      checkoutInFlight = false;

      openPayUrl(res.pay_url);
    } catch (e) {
      console.error(e);
      alert(String(e.message || e));
      btn.textContent = "Оформить";
      btn.disabled = false;
      checkoutInFlight = false;
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

// ===== Init =====
async function init() {
  const t = tg();
  try { t?.ready?.(); t?.expand?.(); } catch {}

  initSplash();
  initTabs();
  initCategoryHeaderBack();
  initSearch();
  initCheckout();

  updateCartDot();
  navStack = [];

  // небольшой “лоадер” в виде карточки
  const home = $("#homeList");
  if (home) {
    home.innerHTML = `
      <div class="row" style="grid-column:1 / -1; cursor:default">
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
    alert("Не удалось загрузить каталог. Проверь BACKEND_URL и endpoint /catalog на backend.");
  });
});
