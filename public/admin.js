/** Простая админка: заявки и остатки по размерам. */

const root = document.getElementById('admin')
let password = localStorage.getItem('adminPassword') || ''
let data = null
let tab = 'orders'

const STATUS = {
  new: 'Новая',
  contacted: 'Связались',
  confirmed: 'Подтверждена',
  done: 'Выдана',
  cancelled: 'Отмена',
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
}

async function api(path, body) {
  const response = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', 'x-admin-password': password },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (response.status === 401) throw new Error('unauthorized')
  return response.json()
}

function renderLogin(message) {
  root.innerHTML = `
    <div class="panel" style="max-width:420px;margin:48px auto">
      <h2 style="margin-top:0">Вход в админку</h2>
      ${message ? `<div class="error">${escapeHtml(message)}</div>` : ''}
      <div class="field">
        <label for="pwd">Пароль из файла .env</label>
        <input id="pwd" type="password" placeholder="admin" />
      </div>
      <button class="btn" id="loginBtn">Войти</button>
    </div>`

  document.getElementById('loginBtn').onclick = async () => {
    password = document.getElementById('pwd').value
    localStorage.setItem('adminPassword', password)
    load()
  }
  document.getElementById('pwd').onkeydown = (e) => {
    if (e.key === 'Enter') document.getElementById('loginBtn').click()
  }
}

function orderCard(order) {
  const tagClass = order.status === 'done' ? 'tag--done' : order.status === 'cancelled' ? 'tag--cancel' : ''
  const when = new Date(order.createdAt).toLocaleString('ru-RU')

  return `
    <div class="panel">
      <div class="row row--between">
        <strong>Заявка ${escapeHtml(order.number)}</strong>
        <span class="tag ${tagClass}">${escapeHtml(STATUS[order.status] || order.status)}</span>
      </div>
      <p class="muted">${escapeHtml(when)}</p>
      <ul style="padding-left:20px;margin:12px 0">
        ${order.items
          .map((i) => `<li>${escapeHtml(i.title)} — размер <b>${escapeHtml(i.size)}</b> × ${i.qty} — ${i.price * i.qty} ₽</li>`)
          .join('')}
      </ul>
      <p><b>Итого: ${order.total} ₽</b></p>
      <p>
        ${escapeHtml(order.customer.name)}
        ${order.customer.username ? ' · @' + escapeHtml(order.customer.username) : ''}
        ${order.customer.phone ? ' · ' + escapeHtml(order.customer.phone) : ''}
      </p>
      ${order.comment ? `<p class="muted">Комментарий: ${escapeHtml(order.comment)}</p>` : ''}
      <div class="row" style="margin-top:12px">
        ${Object.keys(STATUS)
          .map(
            (key) =>
              `<button class="chip ${order.status === key ? 'chip--active' : ''}" data-status="${key}" data-order="${order.id}">${STATUS[key]}</button>`,
          )
          .join('')}
      </div>
    </div>`
}

function productRow(product) {
  return `
    <div class="prod-row">
      <img src="${escapeHtml(product.images[0] || '/photos/placeholder.svg')}" alt="" />
      <div style="flex:1;min-width:0">
        <div><b>${escapeHtml(product.name)}</b></div>
        <div class="muted">${product.price} ₽${product.oldPrice ? ' · было ' + product.oldPrice + ' ₽' : ''}</div>
        <label class="muted" style="display:inline-flex;align-items:center;gap:6px;margin-top:6px">
          <input class="hit-input" type="checkbox" data-product="${product.id}" ${product.isHit ? 'checked' : ''} />
          🔥 Хит продаж
        </label>
        <label class="muted" style="display:inline-flex;align-items:center;gap:6px;margin:6px 0 0 14px">
          <input class="new-input" type="checkbox" data-product="${product.id}" ${product.isNew ? 'checked' : ''} />
          Новинка
        </label>
        <div class="row" style="margin-top:8px">
          ${product.variants
            .map(
              (v) => `
              <label class="muted" style="display:flex;align-items:center;gap:6px">
                ${escapeHtml(v.size)}
                <input class="stock-input" type="number" min="0" value="${v.stock}"
                       data-product="${product.id}" data-size="${escapeHtml(v.size)}" />
              </label>`,
            )
            .join('')}
        </div>
      </div>
    </div>`
}

function bannersPanel() {
  const banners = data.banners || []
  return `
    <div class="panel">
      <h3 style="margin-top:0">Картинки акций</h3>
      <p class="muted">Загрузите PNG или JPG — они появятся в самом верху витрины. Лучше всего смотрятся горизонтальные картинки, например 1200×600. До 8 МБ.</p>
      <input id="bannerFile" type="file" accept="image/png,image/jpeg,image/webp" />
      <div id="bannerStatus" class="muted" style="margin-top:8px"></div>

      ${
        banners.length
          ? banners
              .map(
                (b) => `
                <div class="prod-row">
                  <img src="${escapeHtml(b.image)}" alt="" />
                  <div style="flex:1;min-width:0">
                    <div class="muted">${escapeHtml(b.image)}</div>
                    <button class="chip" data-banner-delete="${b.id}" style="margin-top:8px">Удалить</button>
                  </div>
                </div>`,
              )
              .join('')
          : '<p class="muted">Пока нет ни одной акции.</p>'
      }
    </div>`
}

function render() {
  const newCount = data.orders.filter((o) => o.status === 'new').length

  root.innerHTML = `
    ${
      data.telegramConfigured
        ? ''
        : '<div class="notice" style="margin-top:16px">Telegram не настроен — заявки пока видны только здесь и в терминале. Заполните файл .env, чтобы получать их в чат.</div>'
    }

    <div class="tabs">
      <button class="chip ${tab === 'orders' ? 'chip--active' : ''}" data-tab="orders">Заявки ${newCount ? '(' + newCount + ')' : ''}</button>
      <button class="chip ${tab === 'products' ? 'chip--active' : ''}" data-tab="products">Товары и остатки</button>
      <button class="chip ${tab === 'banners' ? 'chip--active' : ''}" data-tab="banners">Акции</button>
    </div>

    ${
      tab === 'orders'
        ? data.orders.length
          ? data.orders.map(orderCard).join('')
          : '<div class="panel"><p class="muted" style="margin:0">Заявок пока нет.</p></div>'
        : tab === 'products'
          ? `<div class="panel">
               <p class="muted">Измените число рядом с размером — остаток сохранится автоматически. Ноль — размер пропадает из витрины.</p>
               ${data.products.map(productRow).join('')}
             </div>`
          : bannersPanel()
    }`
}

root.addEventListener('click', async (event) => {
  const tabBtn = event.target.closest('[data-tab]')
  if (tabBtn) {
    tab = tabBtn.dataset.tab
    return render()
  }

  const bannerDelete = event.target.closest('[data-banner-delete]')
  if (bannerDelete) {
    await api('/api/admin/banner-delete', { id: bannerDelete.dataset.bannerDelete })
    return load()
  }

  const statusBtn = event.target.closest('[data-status]')
  if (statusBtn) {
    await api('/api/admin/order-status', { id: statusBtn.dataset.order, status: statusBtn.dataset.status })
    return load()
  }
})

root.addEventListener('change', async (event) => {
  const hit = event.target.closest('.hit-input')
  if (hit) {
    const product = data.products.find((p) => p.id === hit.dataset.product)
    product.isHit = hit.checked
    await api('/api/admin/product', { product })
    return
  }

  const isNew = event.target.closest('.new-input')
  if (isNew) {
    const product = data.products.find((p) => p.id === isNew.dataset.product)
    product.isNew = isNew.checked
    await api('/api/admin/product', { product })
    return
  }

  const file = event.target.closest('#bannerFile')
  if (file) {
    const chosen = file.files && file.files[0]
    if (!chosen) return
    const status = document.getElementById('bannerStatus')
    status.textContent = 'Загружаем…'

    const dataUrl = await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.readAsDataURL(chosen)
    })

    const result = await api('/api/admin/banner-upload', { dataUrl })
    if (result.error) {
      status.textContent = result.error
      return
    }
    return load()
  }

  const input = event.target.closest('.stock-input')
  if (!input) return

  const product = data.products.find((p) => p.id === input.dataset.product)
  const variant = product.variants.find((v) => v.size === input.dataset.size)
  variant.stock = Math.max(0, Number(input.value) || 0)

  await api('/api/admin/product', { product })
  input.style.borderColor = '#46a171'
  setTimeout(() => (input.style.borderColor = ''), 800)
})

async function load() {
  if (!password) return renderLogin()
  try {
    data = await api('/api/admin/state')
    render()
  } catch (err) {
    localStorage.removeItem('adminPassword')
    password = ''
    renderLogin(err.message === 'unauthorized' ? 'Неверный пароль' : 'Сервер недоступен')
  }
}

load()
