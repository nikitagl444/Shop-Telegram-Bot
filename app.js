// =========================
// CONFIG (ВАЖНО)
// =========================
// 1) Вставь домен WordPress с WooCommerce (с https://)
// Пример: "https://shop.site.by"
const WP_BASE = "https://example.com";

// 2) Пути страниц WooCommerce (обычно /cart/ и /checkout/)
const WP_CART_PATH = "/cart/";
const WP_CHECKOUT_PATH = "/checkout/";

// 3) Store API (публичный, без ключей)
const API_PRODUCTS = `${WP_BASE}/wp-json/wc/store/v1/products`;
const API_CATEGORIES = `${WP_BASE}/wp-json/wc/store/v1/products/categories`;

// =========================
// STATE
// =========================
let PRODUCTS = [];
let CATEGORIES = [];

// FAQ пока демо. Если хочешь FAQ из WP — сделаем через WP Page/ACF или REST endpoint.
const FAQ = [
  { id: 1, question: "Как выбрать размер?", answer: "В этой версии размеры отключены. Если нужно — добавим позже." },
  { id: 2, question: "Как происходит оплата?", answer: "Оплата проходит на сайте через WooCommerce и плагин EasyPay." },
  { id: 3, question: "Сколько доставка?", answer: "Все варианты доставки оформляются на сайте при оплате." }
];

// =========================
// HELPERS
// =========================
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const money = (n) => `${Number(n).toFixed(2)} BYN`;

const LS_KEY = "miniapp_cart_v2";
// cart: { productId: qty }
function loadCart() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); }
  catch { return {}; }
}
function saveCart(cart) {
  localStorage.setItem(LS_KEY, JSON.stringify(cart));
  updateCartDot();
}
function cartHasItems() {
  const cart = loadCart();
  return Object.keys(cart).length > 0;
}
function cartTotalQty() {
  const cart = loadCart();
  return Object.values(cart).reduce((a,b) => a + Number(b||0), 0);
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// склонение: 1 товар, 2 товара, 5 товаров
function declOfNum(n, titles) {
  const cases = [2, 0, 1, 1, 1, 2];
  return titles[(n % 100 > 4 && n % 100 < 20) ? 2 : cases[(n % 10 < 5) ? n % 10 : 5]];
}

function getUserName() {
  const tg = window.Telegram?.WebApp;
  const n = tg?.initDataUnsafe?.user?.first_name;
  return n || "друг";
}

function stripHtml(html) {
  return String(html || "").replace(/<[^>]*>/g, "").trim();
}

// Woo Store API цены приходят в minor units (копейки)
function priceFromStore(prices) {
  const minor = Number(prices?.price ?? 0);
  const unit = Number(prices?.currency_minor_unit ?? 2);
  return minor / Math.pow(10, unit);
}

function mainImageSrc(images) {
  if (images && images[0] && images[0].src) return images[0].src;
  return "https://placehold.co/1200x800/png?text=No+Image";
}

function mapStoreProduct(p) {
  const firstCat = (p.categories && p.categories[0]) ? p.categories[0].name : "Без категории";
  return {
    id: p.id,
    title: p.name,
    sku: p.sku || `ID-${p.id}`,
    price_byn: priceFromStore(p.prices),
    category: firstCat,
    photos: (p.images || []).map(i => i.src).filter(Boolean),
    photo_url: mainImageSrc(p.images),
    description: stripHtml(p.short_description || p.description || "")
  };
}

// =========================
// SPLASH (anti-freeze)
// =========================
function initSplash() {
  const hello = $("#hello");
  if (hello) hello.textContent = `Здравствуй, ${getUserName()}`;

  const hide = () => $("#splash")?.classList.add("hidden");
  setTimeout(hide, 900);
  setTimeout(hide, 3000);
}

// =========================
// NAVIGATION
// =========================
const screenMap = {
  home: "#screen-home",
  categories: "#screen-categories",
  cart: "#screen-cart",
  faq: "#screen-faq",
  categoryProducts: "#screen-category-products",
  product: "#screen-product",
  error: "#screen-error"
};

let navStack = [];

function showScreen(key, { push = true, title = null } = {}) {
  Object.values(screenMap).forEach(sel => $(sel)?.classList.remove("active"));
  $(screenMap[key])?.classList.add("active");

  const topTitle = $("#topTitle");
  if (topTitle) {
    if (title) topTitle.textContent = title;
    else {
      const defaultTitles = { home: "Главная", categories: "Категории", cart: "Корзина", faq: "FAQ" };
      topTitle.textContent = defaultTitles[key] || "";
    }
  }

  const isSub = (key === "product" || key === "categoryProducts");
  $("#backBtn")?.classList.toggle("hidden", !isSub);

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

// =========================
// LOAD DATA FROM WP STORE API
// =========================
async function loadStoreData() {
  const [prodRes, catRes] = await Promise.all([
    fetch(API_PRODUCTS),
    fetch(API_CATEGORIES)
  ]);

  if (!prodRes.ok) throw new Error(`Products load failed: ${prodRes.status}`);
  if (!catRes.ok) throw new Error(`Categories load failed: ${catRes.status}`);

  const prodJson = await prodRes.json();
  const catJson = await catRes.json();

  PRODUCTS = (prodJson || []).map(mapStoreProduct);
  CATEGORIES = (catJson || []).map(c => ({ id: c.id, name: c.name, slug: c.slug, count: c.count }));
}

// =========================
// HOME
// =========================
function getCartQtyForProduct(productId) {
  const cart = loadCart();
  return Number(cart[String(productId)] || 0);
}

function renderHome(list) {
  const root = $("#homeList");
  if (!root) return;
  root.innerHTML = "";

  if (!list || list.length === 0) {
    root.innerHTML = `
      <div class="row" style="grid-column: 1 / -1; cursor:default">
        <div class="row__left">
          <div class="row__title">Ничего не найдено</div>
          <div class="row__sub">Попробуйте другой запрос</div>
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
    if (!q) {
      renderHome(PRODUCTS);
      return;
    }
    const filtered = PRODUCTS.filter(p =>
      String(p.title).toLowerCase().includes(q) ||
      String(p.sku).toLowerCase().includes(q)
    );
    renderHome(filtered);
  });
}

// =========================
// CATEGORIES
// =========================
function renderCategories() {
  const root = $("#catList");
  if (!root) return;
  root.innerHTML = "";

  if (!CATEGORIES || CATEGORIES.length === 0) {
    root.innerHTML = `
      <div class="row" style="cursor:default">
        <div class="row__left">
          <div class="row__title">Категорий нет</div>
          <div class="row__sub">Добавьте категории в WooCommerce</div>
        </div>
      </div>
    `;
    return;
  }

  for (const c of CATEGORIES) {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `
      <div class="row__left">
        <div class="row__title">${escapeHtml(c.name)}</div>
        <div class="row__sub">${c.count} ${declOfNum(c.count, ["товар","товара","товаров"])}</div>
      </div>
      <div aria-hidden="true">›</div>
    `;
    row.addEventListener("click", () => openCategory(c.name));
    root.appendChild(row);
  }
}

function openCategory(categoryName) {
  const list = PRODUCTS.filter(p => p.category === categoryName);

  $("#catTitle").textContent = categoryName;
  $("#catCount").textContent = `${list.length} ${declOfNum(list.length, ["товар","товара","товаров"])}`;

  renderCategoryProducts(list);
  showScreen("categoryProducts", { title: categoryName });
}

function renderCategoryProducts(list) {
  const root = $("#catProducts");
  if (!root) return;
  root.innerHTML = "";

  if (!list || list.length === 0) {
    root.innerHTML = `
      <div class="row" style="grid-column: 1 / -1; cursor:default">
        <div class="row__left">
          <div class="row__title">Пусто</div>
          <div class="row__sub">В этой категории пока нет товаров</div>
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

// весь блок заголовка категории = назад
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

// =========================
// PRODUCT PAGE
// =========================
function openProduct(productId) {
  const p = PRODUCTS.find(x => x.id === productId);
  if (!p) return;

  let qty = 1;

  const root = $("#productView");
  if (!root) return;

  const inCartQty = getCartQtyForProduct(p.id);

  // простая галерея: показываем главную картинку + мини-лента если фото > 1
  const thumbs = (p.photos && p.photos.length > 1)
    ? `<div style="display:flex; gap:8px; overflow:auto; padding-bottom:4px">
         ${p.photos.map(src => `
           <img data-thumb="${src}" src="${src}" alt="" style="width:74px;height:54px;object-fit:cover;border-radius:14px;border:1px solid rgba(255,255,255,.08);cursor:pointer" />
         `).join("")}
       </div>`
    : "";

  root.innerHTML = `
    <img id="mainProdImg" class="product__img" src="${p.photo_url}" alt="${escapeHtml(p.title)}" />
    <div class="product__title">${escapeHtml(p.title)}</div>
    <div class="product__meta">
      <span>${escapeHtml(p.sku)}</span>
      <span>•</span>
      <span>${escapeHtml(p.category)}</span>
      <span>•</span>
      <strong>${money(p.price_byn)}</strong>
    </div>

    ${thumbs}

    <div class="qty">
      <button class="qty__btn" id="qtyMinus">−</button>
      <div class="qty__val" id="qtyVal">1</div>
      <button class="qty__btn" id="qtyPlus">+</button>
    </div>

    <div id="inCartInfo">${inCartQty > 0 ? `<div class="badge" style="display:inline-flex">Уже в корзине: ${inCartQty} шт.</div>` : ""}</div>

    <button class="btn btn--primary" id="addToCartBtn">Добавить в корзину</button>

    <div style="color: rgba(154,163,178,.92); line-height:1.35; font-size:13px">
      ${escapeHtml(p.description || "")}
    </div>
  `;

  const renderQty = () => {
    $("#qtyVal").textContent = String(qty);
    const minus = $("#qtyMinus");
    minus.disabled = qty <= 1;
    minus.style.opacity = qty <= 1 ? "0.5" : "1";
  };

  $("#qtyPlus").addEventListener("click", () => { qty++; renderQty(); });
  $("#qtyMinus").addEventListener("click", () => { qty = Math.max(1, qty - 1); renderQty(); });

  $("#addToCartBtn").addEventListener("click", () => {
    const cart = loadCart();
    const key = String(p.id);
    cart[key] = Number(cart[key] || 0) + qty;
    saveCart(cart);

    // обновим бейджи на списках
    renderHome(PRODUCTS);

    const cur = getCartQtyForProduct(p.id);
    $("#inCartInfo").innerHTML = `<div class="badge" style="display:inline-flex">Уже в корзине: ${cur} шт.</div>`;
    alert("Добавлено в корзину ✅");
  });

  // thumb clicks
  $$("#productView img[data-thumb]").forEach(img => {
    img.addEventListener("click", () => {
      const src = img.getAttribute("data-thumb");
      $("#mainProdImg").src = src;
    });
  });

  renderQty();
  showScreen("product", { title: "Товар" });
}

// =========================
// CART
// =========================
function updateCartDot() {
  const dot = $("#cartDot");
  if (!dot) return;
  dot.classList.toggle("hidden", !cartHasItems());
}

function calcCartTotal() {
  const cart = loadCart();
  let total = 0;
  for (const [id, qty] of Object.entries(cart)) {
    const p = PRODUCTS.find(x => String(x.id) === String(id));
    if (!p) continue;
    total += p.price_byn * Number(qty);
  }
  return total;
}

function renderCart() {
  const cart = loadCart();
  const keys = Object.keys(cart);
  const root = $("#cartList");
  if (!root) return;

  root.innerHTML = "";

  if (keys.length === 0) {
    root.innerHTML = `
      <div class="row" style="cursor:default">
        <div class="row__left">
          <div class="row__title">Корзина пустая</div>
          <div class="row__sub">Добавьте товары на главной странице</div>
        </div>
      </div>
    `;
    $("#cartTotal").textContent = money(0);
    return;
  }

  for (const id of keys) {
    const qty = Number(cart[id] || 0);
    const p = PRODUCTS.find(x => String(x.id) === String(id));
    if (!p) continue;

    const line = p.price_byn * qty;

    const row = document.createElement("div");
    row.className = "cartItem";
    row.innerHTML = `
      <img class="cartItem__img" src="${p.photo_url}" alt="${escapeHtml(p.title)}"/>
      <div class="cartItem__mid">
        <div class="cartItem__title">${escapeHtml(p.title)}</div>
        <div class="cartItem__sub">${escapeHtml(p.sku)} • ${escapeHtml(p.category)}</div>
        <div class="cartItem__sub"><strong>${money(p.price_byn)}</strong> за шт.</div>
      </div>
      <div class="cartItem__right">
        <div class="qty" style="gap:8px">
          <button class="qty__btn" data-act="minus" style="width:36px;height:36px">−</button>
          <div class="qty__val" style="min-width:22px">${qty}</div>
          <button class="qty__btn" data-act="plus" style="width:36px;height:36px">+</button>
        </div>
        <div style="font-weight:900">${money(line)}</div>
      </div>
    `;

    row.querySelector('[data-act="plus"]').addEventListener("click", () => {
      const c = loadCart();
      c[id] = Number(c[id] || 0) + 1;
      saveCart(c);
      renderCart();
      renderHome(PRODUCTS);
    });

    row.querySelector('[data-act="minus"]').addEventListener("click", () => {
      const c = loadCart();
      c[id] = Number(c[id] || 0) - 1;
      if (c[id] <= 0) delete c[id];
      saveCart(c);
      renderCart();
      renderHome(PRODUCTS);
    });

    root.appendChild(row);
  }

  $("#cartTotal").textContent = money(calcCartTotal());
}

// Генерация ссылки для WP multi-add plugin
function buildWpAddToCartUrl() {
  const cart = loadCart();
  const pairs = Object.entries(cart)
    .filter(([_, qty]) => Number(qty) > 0)
    .map(([id, qty]) => `${encodeURIComponent(id)}:${encodeURIComponent(qty)}`)
    .join(",");

  // Требуется плагин "Add multiple products to cart via url for WooCommerce"
  // URL: /cart/?add-to-cart=12:2,34:1
  const cartUrl = `${WP_BASE}${WP_CART_PATH}?add-to-cart=${pairs}`;

  // Если вы поставите плагин "Direct Checkout", он сам перекинет на checkout.
  // Иначе пользователь попадёт на корзину и нажмёт "Оформить".
  return cartUrl;
}

function initCheckoutButton() {
  const btn = $("#checkoutBtn");
  if (!btn) return;

  btn.addEventListener("click", () => {
    const cart = loadCart();
    if (Object.keys(cart).length === 0) {
      alert("Корзина пустая");
      return;
    }

    // Открываем ссылку на WP
    const url = buildWpAddToCartUrl();

    // В Telegram Mini App безопаснее открывать так:
    const tg = window.Telegram?.WebApp;
    if (tg?.openLink) tg.openLink(url);
    else window.open(url, "_blank");
  });
}

// =========================
// FAQ
// =========================
function renderFaq() {
  const root = $("#faqList");
  if (!root) return;
  root.innerHTML = "";

  for (const f of FAQ) {
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

// =========================
// TABS + BACK
// =========================
function initTabs() {
  $$(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      setActiveTab(tab);

      if (tab === "home") {
        renderHome(PRODUCTS);
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

  $("#backBtn")?.addEventListener("click", goBack);
}

function initRetry() {
  $("#retryBtn")?.addEventListener("click", async () => {
    await boot();
  });
}

// =========================
// BOOT
// =========================
async function boot() {
  const tg = window.Telegram?.WebApp;
  try { tg?.ready?.(); tg?.expand?.(); } catch {}

  initSplash();
  initTabs();
  initSearch();
  initCheckoutButton();
  initCategoryHeaderBack();
  initRetry();

  updateCartDot();
  navStack = [];

  // защита от забытых настроек
  if (!WP_BASE || WP_BASE === "https://example.com") {
    $("#errorText").textContent = "Сначала вставь домен WordPress в app.js (WP_BASE).";
    showScreen("error", { title: "Ошибка" });
    return;
  }

  try {
    await loadStoreData();
    renderHome(PRODUCTS);
    showScreen("home", { title: "Главная" });
    setActiveTab("home");
  } catch (e) {
    console.error(e);
    $("#errorText").textContent = "Store API не доступен. Проверь: /wp-json/wc/store/v1/products";
    showScreen("error", { title: "Ошибка" });
  }
}

document.addEventListener("DOMContentLoaded", boot);
