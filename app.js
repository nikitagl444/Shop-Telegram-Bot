// ===== DEMO DATA =====
const demoProducts = [
  {
    id: 1,
    title: "Худи Oversize",
    sku: "HD-001",
    price_byn: 149.0,
    category: "Худи",
    sizes: ["S", "M", "L", "XL"],
    // FIX: стабильный источник, чтобы не пропадало в WebView
    photo_url: "https://placehold.co/1200x800/png?text=Hoodie",
    description: "Тёплое худи свободного кроя."
  },
  {
    id: 2,
    title: "Футболка Basic",
    sku: "TS-014",
    price_byn: 49.9,
    category: "Футболки",
    sizes: ["XS", "S", "M", "L"],
    photo_url: "https://placehold.co/1200x800/png?text=T-shirt",
    description: "Базовая футболка на каждый день."
  },
  {
    id: 3,
    title: "Джинсы Straight",
    sku: "JN-210",
    price_byn: 199.0,
    category: "Джинсы",
    sizes: ["28", "30", "32", "34"],
    photo_url: "https://placehold.co/1200x800/png?text=Jeans",
    description: "Прямой крой, плотный деним."
  }
];

const demoFaq = [
  { id: 1, question: "Как выбрать размер?", answer: "Смотрите таблицу размеров в карточке товара. Если сомневаетесь — берите на размер больше для oversize." },
  { id: 2, question: "Сколько стоит доставка?", answer: "Доставка 1–3 дня по РБ. Стоимость зависит от города и будет добавлена позже." },
  { id: 3, question: "Можно ли вернуть?", answer: "Да, в течение 14 дней при сохранении товарного вида." }
];

// ===== Helpers =====
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const money = (n) => `${Number(n).toFixed(2)} BYN`;

const LS_KEY = "demo_cart_v1";
// cart: { "productId|size": { productId, size, qty } }
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
    const filtered = demoProducts.filter(p =>
      p.title.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
    );
    renderHome(filtered);
  });
}

// ===== Categories =====
function renderCategories() {
  const cats = Array.from(new Set(demoProducts.map(p => p.category))).sort();
  const root = $("#catList");
  if (!root) return;
  root.innerHTML = "";

  for (const c of cats) {
    const count = demoProducts.filter(p => p.category === c).length;
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

  const list = demoProducts.filter(p => p.category === categoryName);

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
  const p = demoProducts.find(x => x.id === productId);
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
      <strong>${money(p.price_byn)}</strong>
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
    cart[k] = { productId: p.id, size: selectedSize, qty: prev + qty };
    saveCart(cart);

    renderHome(demoProducts);
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
    const p = demoProducts.find(x => x.id === item.productId);
    if (!p) continue;

    const line = p.price_byn * item.qty;
    total += line;

    const row = document.createElement("div");
    row.className = "cartItem";
    row.innerHTML = `
      <img class="cartItem__img" src="${p.photo_url}" alt="${escapeHtml(p.title)}"/>
      <div class="cartItem__mid">
        <div class="cartItem__title">${escapeHtml(p.title)}</div>
        <div class="cartItem__sub">${escapeHtml(p.sku)} • размер ${escapeHtml(item.size)}</div>
        <div class="cartItem__sub"><strong>${money(p.price_byn)}</strong> за шт.</div>
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
      c[k].qty += 1;
      saveCart(c);
      renderCart();
      renderHome(demoProducts);
    });

    row.querySelector('[data-act="minus"]').addEventListener("click", () => {
      const c = loadCart();
      c[k].qty -= 1;
      if (c[k].qty <= 0) delete c[k];
      saveCart(c);
      renderCart();
      renderHome(demoProducts);
    });

    root.appendChild(row);
  }

  const totalEl = $("#cartTotal");
  if (totalEl) totalEl.textContent = money(total);
}

function initCheckoutDemo() {
  const btn = $("#checkoutBtn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const cart = loadCart();
    if (Object.keys(cart).length === 0) {
      alert("Корзина пустая");
      return;
    }
    alert("Демо: оформление заказа (дальше подключим EasyPay)");
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

// ===== Tabs binding =====
function initTabs() {
  $$(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      setActiveTab(tab);

      if (tab === "home") {
        renderHome(demoProducts);
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
  return String(str)
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

// ===== Init =====
function init() {
  // Telegram safe calls
  const tg = window.Telegram?.WebApp;
  try {
    tg?.ready?.();
    tg?.expand?.();
  } catch {}

  initSplash();
  initTabs();
  initSearch();
  initCheckoutDemo();

  updateCartDot();

  navStack = [];
  renderHome(demoProducts);
  showScreen("home", { title: "Главная" });
  setActiveTab("home");
}

document.addEventListener("DOMContentLoaded", init);
