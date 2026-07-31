/**
 * Витрина PAULEA для Telegram Mini App.
 * Чистый JavaScript, без сборки и библиотек.
 */

const state = {
  catalog: null,
  cart: [],
  selectedSize: null,
  sending: false,
  error: '',
}

const app = document.getElementById('app')
const backBtn = document.getElementById('backBtn')
const cartBtn = document.getElementById('cartBtn')
const cartCount = document.getElementById('cartCount')
const shopName = document.getElementById('shopName')

// Фирменное написание названия магазина прописью
function wordmark(name) {
  const raw = String(name || '').trim()
  return raw.toLowerCase() === 'paulea' ? 'pauléa' : raw
}

let lastRoute = null

// -------------------------------------------------------------- Telegram

let tg = null

function waitForTelegram() {
  return new Promise((resolve) => {
    const started = Date.now()
    const tick = () => {
      if (window.Telegram && window.Telegram.WebApp) return resolve(window.Telegram.WebApp)
      if (Date.now() - started > 1500) return resolve(null)
      setTimeout(tick, 50)
    }
    tick()
  })
}

function setupTelegram(webApp) {
  tg = webApp
  if (!tg) return
  tg.ready()
  tg.expand()
  if (typeof tg.disableVerticalSwipes === 'function') tg.disableVerticalSwipes()
  if (typeof tg.setHeaderColor === 'function') {
    try {
      tg.setHeaderColor('#3c0e1b')
      tg.setBackgroundColor('#4a1222')
    } catch {}
  }
}

// ------------------------------------------------------------------ корзина

function loadCart() {
  try {
    state.cart = JSON.parse(localStorage.getItem('cart') || '[]')
  } catch {
    state.cart = []
  }
}

function saveCart() {
  localStorage.setItem('cart', JSON.stringify(state.cart))
  renderCartCount()
}

function addToCart(productId, size) {
  const existing = state.cart.find((i) => i.productId === productId && i.size === size)
  if (existing) existing.qty += 1
  else state.cart.push({ productId, size, qty: 1 })
  saveCart()
}

function removeFromCart(index) {
  state.cart.splice(index, 1)
  saveCart()
  render()
}

function cartTotal() {
  return state.cart.reduce((sum, line) => {
    const product = findProduct(line.productId)
    return product ? sum + product.price * line.qty : sum
  }, 0)
}

function renderCartCount() {
  const count = state.cart.reduce((n, i) => n + i.qty, 0)
  cartCount.textContent = String(count)
  cartCount.hidden = count === 0
}

// ------------------------------------------------------------------- данные

function findProduct(id) {
  return state.catalog.products.find((p) => p.id === id)
}

function money(value) {
  return value.toLocaleString('ru-RU') + ' ' + state.catalog.shop.currency
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
}

function imageOf(product) {
  return product.images && product.images[0] ? product.images[0] : '/photos/placeholder.svg'
}

function discountOf(product) {
  return product.oldPrice && product.oldPrice > product.price
    ? Math.round((1 - product.price / product.oldPrice) * 100)
    : 0
}

// ----------------------------------------------------- общие блоки витрины

function bannersHtml() {
  const banners = state.catalog.banners || []
  if (banners.length === 0) {
    return `
      <div class="banner-empty">
        Место для акций.<br />
        Загрузите PNG в админке — вкладка «Акции».
      </div>`
  }
  return `
    <div class="banners">
      ${banners
        .map(
          (b) => `<div class="banner"><img src="${escapeHtml(b.image)}" alt="Акция" loading="lazy" /></div>`,
        )
        .join('')}
    </div>`
}

/** Три центральные кнопки: Новинки / Каталог / Акции. */
function navHtml(active) {
  const items = [
    { id: 'new', label: 'Новинки', hash: '/' },
    { id: 'catalog', label: 'Каталог', hash: '/catalog' },
    { id: 'sale', label: 'Акции', hash: '/sale' },
  ]
  return `
    <nav class="nav">
      ${items
        .map(
          (i) =>
            `<button class="nav__btn ${active === i.id ? 'nav__btn--active' : ''}" data-nav="${i.hash}">${i.label}</button>`,
        )
        .join('')}
    </nav>`
}

function footerHtml() {
  const { shop } = state.catalog
  return `
    <div class="footer">
      ${escapeHtml(shop.address)}<br />
      ${escapeHtml(shop.workingHours)}
    </div>`
}

function sectionTitle(text) {
  return `<div class="toolbar"><h2 class="toolbar__title">${escapeHtml(text)}</h2></div>`
}

// ------------------------------------------------------------------- экраны

function productCard(product) {
  const discount = discountOf(product)

  return `
    <button class="card" data-open="${product.id}">
      <div class="card__media">
        <img src="${escapeHtml(imageOf(product))}" alt="${escapeHtml(product.name)}" loading="lazy" />
        <div class="badges">
          ${discount ? `<span class="badge">−${discount}%</span>` : ''}
          ${product.isHit ? '<span class="badge badge--hit">🔥 Хит</span>' : ''}
          ${product.isNew ? '<span class="badge badge--new">New</span>' : ''}
          ${!product.inStock ? '<span class="badge badge--out">Раскуплено</span>' : ''}
        </div>
      </div>
      <div class="card__name">${escapeHtml(product.name)}</div>
      <div class="card__price">
        ${money(product.price)}
        ${product.oldPrice ? `<span class="card__old">${money(product.oldPrice)}</span>` : ''}
      </div>
    </button>`
}

function gridHtml(list, emptyText) {
  return list.length
    ? `<div class="grid">${list.map(productCard).join('')}</div>`
    : `<div class="empty">${escapeHtml(emptyText)}</div>`
}

/** Главная: только новинки. */
function renderNew() {
  const products = state.catalog.products
  const list = products.filter((p) => p.isNew)

  app.innerHTML = `
    ${bannersHtml()}
    ${navHtml('new')}
    ${sectionTitle('Новинки')}
    ${gridHtml(list.length ? list : products, 'Новинок пока нет')}
    ${footerHtml()}`
}

/** Каталог: список категорий, раскрывающийся сверху вниз. */
function renderCatalogList() {
  const { categories, products } = state.catalog

  app.innerHTML = `
    ${navHtml('catalog')}
    ${sectionTitle('Каталог')}

    <div class="cats">
      ${categories
        .map((c) => {
          const inCategory = products.filter((p) => p.categoryId === c.id)
          const cover = inCategory[0] ? imageOf(inCategory[0]) : '/photos/placeholder.svg'
          return `
            <button class="cat" data-cat="${c.id}">
              <img class="cat__img" src="${escapeHtml(cover)}" alt="" loading="lazy" />
              <span class="cat__name">${escapeHtml(c.name)}</span>
              <span class="cat__count">${inCategory.length}</span>
              <span class="cat__arrow">→</span>
            </button>`
        })
        .join('')}
    </div>

    ${footerHtml()}`
}

/** Товары одной категории. */
function renderCategory(categoryId) {
  const { categories, products } = state.catalog
  const category = categories.find((c) => c.id === categoryId)
  const list = products.filter((p) => p.categoryId === categoryId)

  app.innerHTML = `
    ${navHtml('catalog')}
    <div class="toolbar">
      <h2 class="toolbar__title">${escapeHtml(category ? category.name : 'Каталог')}</h2>
      <button class="filter-btn" data-nav="/catalog">Все категории</button>
    </div>
    ${gridHtml(list, 'В этой категории пока пусто')}
    ${footerHtml()}`
}

/** Акции: картинки акций и товары со скидкой. */
function renderSale() {
  const list = state.catalog.products.filter((p) => discountOf(p) > 0)

  app.innerHTML = `
    ${navHtml('sale')}
    ${sectionTitle('Акции и скидки')}
    ${gridHtml(list, 'Сейчас скидок нет — загляните позже')}
    ${footerHtml()}`
}

function sizeButtonsHtml(product) {
  return product.variants
    .map((v) => {
      if (v.stock <= 0) return `<button class="size size--out" disabled>${escapeHtml(v.size)}</button>`
      const active = state.selectedSize === v.size ? 'size--active' : ''
      return `<button class="size ${active}" data-size="${escapeHtml(v.size)}">${escapeHtml(v.size)}</button>`
    })
    .join('')
}

function renderProduct(productId) {
  const product = findProduct(productId)
  if (!product) return renderNew()

  const available = product.variants.filter((v) => v.stock > 0)
  if (state.selectedSize && !available.some((v) => v.size === state.selectedSize)) {
    state.selectedSize = null
  }

  // Сумки и аксессуары: размер один, выбор не показываем.
  const oneSize = product.variants.length === 1 && product.variants[0].size === 'Один размер'
  if (oneSize && available.length) state.selectedSize = product.variants[0].size

  const discount = discountOf(product)

  const images = product.images && product.images.length ? product.images : ['/photos/placeholder.svg']
  state.images = images

  app.innerHTML = `
    <div class="gallery">
      <div class="gallery__track" id="galleryTrack">
        ${images
          .map(
            (src, i) => `
              <div class="gallery__slide">
                <img src="${escapeHtml(src)}" alt="${escapeHtml(product.name)}" data-zoom="${i}" />
              </div>`,
          )
          .join('')}
      </div>
      <div class="badges">
        ${discount ? `<span class="badge">−${discount}%</span>` : ''}
        ${product.isHit ? '<span class="badge badge--hit">🔥 Хит</span>' : ''}
        ${product.isNew ? '<span class="badge badge--new">New</span>' : ''}
      </div>
      ${images.length > 1 ? `<div class="gallery__count" id="galleryCount">1 / ${images.length}</div>` : ''}
    </div>
    ${
      images.length > 1
        ? `<div class="dots" id="galleryDots">${images
            .map((_, i) => `<span class="dot ${i === 0 ? 'dot--active' : ''}"></span>`)
            .join('')}</div>`
        : ''
    }

    <h2 class="product__title">${escapeHtml(product.name)}</h2>
    <div class="product__price">
      ${money(product.price)}
      ${product.oldPrice ? `<span class="product__old">${money(product.oldPrice)}</span>` : ''}
    </div>

    ${
      oneSize
        ? ''
        : `<div class="label">Размер</div>
           <div class="sizes" id="sizes">${sizeButtonsHtml(product)}</div>`
    }

    <div id="addWrap">
      ${
        available.length === 0
          ? '<div class="notice">Все размеры раскуплены. Напишите нам — возможно, привезём под заказ.</div>'
          : addButtonHtml()
      }
    </div>

    ${
      product.description
        ? `<div class="desc">
             <div class="desc__title">Описание</div>
             <p>${escapeHtml(product.description)}</p>
           </div>`
        : ''
    }

    ${
      product.composition
        ? `<div class="compo">
             <span class="compo__label">Состав</span>
             <span class="compo__value">${escapeHtml(product.composition)}</span>
           </div>`
        : ''
    }`

  setupGallery()
}

/** Счётчик и точки под галереей товара. */
function setupGallery() {
  const track = document.getElementById('galleryTrack')
  if (!track) return
  const count = document.getElementById('galleryCount')
  const dots = document.getElementById('galleryDots')

  track.addEventListener('scroll', () => {
    const index = Math.round(track.scrollLeft / track.clientWidth)
    if (count) count.textContent = index + 1 + ' / ' + state.images.length
    if (dots) {
      Array.from(dots.children).forEach((dot, i) => {
        dot.classList.toggle('dot--active', i === index)
      })
    }
  })
}

/** Полноэкранный просмотр: листание свайпом, тап — приблизить. */
function openLightbox(startIndex) {
  const images = state.images || []
  if (!images.length) return

  const box = document.createElement('div')
  box.className = 'lb'
  const pad = (n) => String(n).padStart(2, '0')

  box.innerHTML = `
    <div class="lb__bar">
      ${
        images.length > 1
          ? `<div class="lb__count">
               <span class="lb__num">${pad(startIndex + 1)}</span>
               <span class="lb__sep"></span>
               <span class="lb__total">${pad(images.length)}</span>
             </div>`
          : ''
      }
      <button class="lb__close" type="button" aria-label="Закрыть">✕</button>
    </div>
    <div class="lb__track">
      ${images
        .map(
          (src) => `
            <div class="lb__slide">
              <img class="lb__img" src="${escapeHtml(src)}" alt="" />
            </div>`,
        )
        .join('')}
    </div>
    ${
      images.length > 1
        ? '<div class="lb__hint">Листайте влево или вправо</div>'
        : ''
    }`

  document.body.appendChild(box)
  document.body.classList.add('no-scroll')

  const track = box.querySelector('.lb__track')
  const number = box.querySelector('.lb__num')
  track.scrollLeft = startIndex * track.clientWidth

  track.addEventListener('scroll', () => {
    if (!number) return
    const index = Math.round(track.scrollLeft / track.clientWidth)
    number.textContent = pad(index + 1)
  })

  const close = () => {
    box.remove()
    document.body.classList.remove('no-scroll')
  }

  box.querySelector('.lb__close').addEventListener('click', close)

  // Запасное листание свайпом: если Telegram перехватывает жесты,
  // сами перелистываем на соседнее фото
  let startX = null
  let startY = null
  let multi = false

  const goTo = (index) => {
    const safe = Math.max(0, Math.min(images.length - 1, index))
    track.scrollTo({ left: safe * track.clientWidth, behavior: 'smooth' })
    if (number) number.textContent = pad(safe + 1)
  }

  track.addEventListener(
    'touchstart',
    (event) => {
      multi = event.touches.length > 1
      startX = event.touches[0].clientX
      startY = event.touches[0].clientY
    },
    { passive: true },
  )

  track.addEventListener(
    'touchmove',
    (event) => {
      if (event.touches.length > 1) multi = true
    },
    { passive: true },
  )

  track.addEventListener(
    'touchend',
    (event) => {
      if (multi || startX === null) return
      const touch = event.changedTouches[0]
      const dx = touch.clientX - startX
      const dy = touch.clientY - startY
      startX = null
      if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return
      const current = Math.round(track.scrollLeft / track.clientWidth)
      goTo(dx < 0 ? current + 1 : current - 1)
    },
    { passive: true },
  )
}

function addButtonHtml() {
  return `<button class="btn" id="addBtn" ${state.selectedSize ? '' : 'disabled'}>
            ${state.selectedSize ? 'Добавить в корзину' : 'Выберите размер'}
          </button>`
}

/** Обновляет только ряд размеров и кнопку — страница не перерисовывается и не прокручивается. */
function updateSizeSelection(size) {
  state.selectedSize = size

  const sizes = document.getElementById('sizes')
  if (sizes) {
    for (const button of sizes.querySelectorAll('.size')) {
      button.classList.toggle('size--active', button.dataset.size === size)
    }
  }

  const addBtn = document.getElementById('addBtn')
  if (addBtn) {
    addBtn.disabled = false
    addBtn.textContent = 'Добавить в корзину'
  }
}

function renderCart() {
  if (state.cart.length === 0) {
    app.innerHTML = `
      <div class="empty">
        Корзина пуста<br /><br />
        <button class="btn btn--ghost" data-go="home" style="max-width:260px">В каталог</button>
      </div>`
    return
  }

  const lines = state.cart
    .map((line, index) => {
      const product = findProduct(line.productId)
      if (!product) return ''
      return `
        <div class="line">
          <div class="line__media"><img src="${escapeHtml(imageOf(product))}" alt="" /></div>
          <div class="line__body">
            <div class="line__name">${escapeHtml(product.name)}</div>
            <div class="line__meta">Размер ${escapeHtml(line.size)} · ${line.qty} шт. · ${money(product.price * line.qty)}</div>
            <button class="line__remove" data-remove="${index}">Убрать</button>
          </div>
        </div>`
    })
    .join('')

  app.innerHTML = `
    <div class="toolbar"><h2 class="toolbar__title">Ваша заявка</h2></div>
    ${lines}
    <div class="total"><span>Итого</span><b>${money(cartTotal())}</b></div>

    ${state.error ? `<div class="error">${escapeHtml(state.error)}</div>` : ''}

    <div class="notice">
      Оплачивать здесь ничего не нужно. Мы перезвоним, подтвердим наличие и вместе выберем способ доставки.
    </div>

    <div class="field">
      <label for="phone">Телефон для связи</label>
      <input class="input--phone" id="phone" type="tel" inputmode="tel" autocomplete="tel"
        placeholder="+7 (900) 000-00-00" value="${escapeHtml(formatPhone(localStorage.getItem('phone') || ''))}" />
    </div>

    <div class="field">
      <label for="telegram">Ваш Telegram для связи</label>
      <input class="input--tag" id="telegram" type="text" autocapitalize="off" autocomplete="off" spellcheck="false"
        placeholder="@username" value="${escapeHtml(localStorage.getItem('telegram') || '')}" />
      <div class="field__hint">Укажите ник — напишем вам в Telegram, если не дозвонимся</div>
    </div>

    <div class="field">
      <label for="comment">Комментарий</label>
      <textarea id="comment" placeholder="Город, удобное время звонка, вопросы по размеру"></textarea>
    </div>

    <button class="btn" id="sendBtn" ${state.sending ? 'disabled' : ''}>
      ${state.sending ? 'Отправляем…' : 'Отправить заявку'}
    </button>
    <button class="btn btn--ghost" data-go="home">Продолжить покупки</button>`

  setupCartForm()
}

// Приводит любой ввод к виду +7 (917) 767-92-25
function formatPhone(raw) {
  let digits = String(raw || '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits[0] === '8') digits = '7' + digits.slice(1)
  if (digits[0] !== '7') digits = '7' + digits
  digits = digits.slice(0, 11)

  const a = digits.slice(1, 4)
  const b = digits.slice(4, 7)
  const c = digits.slice(7, 9)
  const d = digits.slice(9, 11)

  let out = '+7'
  if (a) out += ' (' + a
  if (a.length === 3) out += ')'
  if (b) out += ' ' + b
  if (c) out += '-' + c
  if (d) out += '-' + d
  return out
}

// Подставляет @ и чистит ссылку на Telegram
function formatTelegram(raw) {
  let value = String(raw || '').trim()
  if (!value) return ''
  value = value.replace(/^https?:\/\//i, '').replace(/^t\.me\//i, '')
  value = value.replace(/[^A-Za-z0-9_@]/g, '')
  value = value.replace(/@/g, '')
  return value ? '@' + value : ''
}

function setupCartForm() {
  const phone = document.getElementById('phone')
  if (phone) {
    phone.addEventListener('input', () => {
      phone.value = formatPhone(phone.value)
    })
    phone.addEventListener('focus', () => {
      if (!phone.value) phone.value = '+7 ('
    })
  }

  const telegram = document.getElementById('telegram')
  if (telegram) {
    telegram.addEventListener('focus', () => {
      if (!telegram.value) telegram.value = '@'
    })
    telegram.addEventListener('blur', () => {
      telegram.value = formatTelegram(telegram.value)
    })
  }
}

function renderDone(number) {
  app.innerHTML = `
    <div class="done">
      <div class="done__mark">✓</div>
      <h2>Заявка ${escapeHtml(number)} отправлена</h2>
      <p>Менеджер свяжется с вами в течение рабочего дня.</p>
    </div>
    <button class="btn btn--ghost" data-go="home">Вернуться в каталог</button>`
}

// ----------------------------------------------------------------- роутинг

function render() {
  const hash = location.hash.slice(1) || '/'
  const [, section, param] = hash.split('/')

  backBtn.hidden = hash === '/'
  if (tg && tg.BackButton) {
    if (hash === '/') tg.BackButton.hide()
    else tg.BackButton.show()
  }

  if (section === 'catalog') renderCatalogList()
  else if (section === 'sale') renderSale()
  else if (section === 'c') renderCategory(param)
  else if (section === 'p') renderProduct(param)
  else if (section === 'cart') renderCart()
  else if (section === 'done') renderDone(decodeURIComponent(param || ''))
  else renderNew()

  // Прокручиваем наверх только при смене экрана.
  if (hash !== lastRoute) {
    window.scrollTo(0, 0)
    lastRoute = hash
  }
}

function go(hash) {
  if (location.hash.slice(1) === hash || (hash === '/' && !location.hash)) render()
  else location.hash = hash
}

// ------------------------------------------------------------- отправка

async function sendOrder() {
  const phone = formatPhone((document.getElementById('phone') || {}).value || '')
  const telegram = formatTelegram((document.getElementById('telegram') || {}).value || '')
  const comment = (document.getElementById('comment') || {}).value || ''

  if (phone.replace(/\D/g, '').length < 10) {
    state.error = 'Укажите, пожалуйста, корректный номер телефона.'
    return render()
  }

  localStorage.setItem('phone', phone)
  localStorage.setItem('telegram', telegram)
  state.error = ''
  state.sending = true
  render()

  try {
    const response = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: state.cart,
        phone,
        telegram,
        comment,
        initData: tg ? tg.initData : '',
      }),
    })
    const result = await response.json()

    if (!response.ok) {
      state.error = result.error || 'Не удалось отправить заявку. Попробуйте ещё раз.'
      state.sending = false
      return render()
    }

    state.cart = []
    saveCart()
    state.sending = false
    if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success')
    go('/done/' + encodeURIComponent(result.number))
  } catch {
    state.error = 'Сервер недоступен. Проверьте, что запущена команда node server.js'
    state.sending = false
    render()
  }
}

// -------------------------------------------------------------- обработчики

app.addEventListener('click', (event) => {
  const target = event.target.closest(
    '[data-open], [data-nav], [data-cat], [data-size], [data-remove], [data-go], [data-zoom], #addBtn, #sendBtn',
  )
  if (!target) return

  if (target.dataset.zoom !== undefined && target.dataset.zoom !== '') {
    return openLightbox(Number(target.dataset.zoom))
  }

  if (target.dataset.nav) return go(target.dataset.nav)
  if (target.dataset.cat) return go('/c/' + target.dataset.cat)
  if (target.dataset.open) {
    state.selectedSize = null
    return go('/p/' + target.dataset.open)
  }
  if (target.dataset.go === 'home') return go('/')
  if (target.dataset.remove !== undefined && target.dataset.remove !== '') {
    return removeFromCart(Number(target.dataset.remove))
  }
  if (target.dataset.size) return updateSizeSelection(target.dataset.size)
  if (target.id === 'addBtn') {
    const productId = location.hash.split('/')[2]
    addToCart(productId, state.selectedSize)
    if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light')
    return go('/cart')
  }
  if (target.id === 'sendBtn') return sendOrder()
})

// Название магазина всегда ведёт на главную.
shopName.addEventListener('click', () => {
  if (location.hash && location.hash !== '#/') location.hash = '/'
  else {
    render()
    window.scrollTo(0, 0)
  }
})

backBtn.addEventListener('click', () => history.back())
cartBtn.addEventListener('click', () => go('/cart'))
window.addEventListener('hashchange', render)

// ------------------------------------------------------------------- старт

async function init() {
  setupTelegram(await waitForTelegram())
  if (tg && tg.BackButton) tg.BackButton.onClick(() => history.back())

  loadCart()
  renderCartCount()

  try {
    const response = await fetch('/api/catalog')
    state.catalog = await response.json()
  } catch {
    app.innerHTML = '<div class="empty">Не удалось загрузить каталог.<br />Запущена ли команда node server.js?</div>'
    return
  }

  shopName.textContent = wordmark(state.catalog.shop.name)
  document.title = state.catalog.shop.name
  render()
}

init()
