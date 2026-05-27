// js/dashboard.js
import { db, auth } from './firebase-config.js';
import {
  collection, query, where, getDocs, addDoc, updateDoc, doc,
  orderBy, serverTimestamp, getDoc, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── Auth guard ────────────────────────────────────────────────────
const adminData = JSON.parse(sessionStorage.getItem('mesaya_admin') || 'null');
if (!adminData) location.href = 'login.html';
const restId = adminData?.restaurantId;
if (!restId) location.href = 'login.html';

let restaurant = null;
let allBookings = [];
let calMonth = new Date().getMonth();
let calYear  = new Date().getFullYear();

// Estructura de horarios: { 0: [{from:'13:00',to:'16:00'},{from:'21:00',to:'23:00'}], 1:[], ... }
// interval: número de minutos entre citas
let scheduleData = { interval: 30, days: { 0:[], 1:[], 2:[], 3:[], 4:[], 5:[], 6:[] } };

const DAY_NAMES = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const DAY_SHORT = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

// ── Helpers ───────────────────────────────────────────────────────
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = `toast ${type} show`;
  setTimeout(() => t.classList.remove('show'), 3200);
}
function today() { return new Date().toISOString().split('T')[0]; }
function formatDate(d) {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${parseInt(day)} ${months[parseInt(m)-1]} ${y}`;
}
function formatTs(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('es-ES', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
}
function genCode() { return 'MY' + Math.random().toString(36).substring(2,8).toUpperCase(); }
function statusBadge(s) {
  const cfg = {
    pending:   { label: 'Pendiente',   cls: 'badge-pending' },
    confirmed: { label: 'Confirmada',  cls: 'badge-confirmed' },
    cancelled: { label: 'Cancelada',   cls: 'badge-cancelled' },
    completed: { label: 'Completada',  cls: 'badge-completed' }
  };
  const c = cfg[s] || { label: s, cls: '' };
  return `<span class="badge ${c.cls}">${c.label}</span>`;
}

// ── Init ──────────────────────────────────────────────────────────
async function init() {
  const now = new Date();
  document.getElementById('dashDate').textContent =
    now.toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long' });
  document.getElementById('todayDate2').textContent = formatDate(today());

  // Cargar restaurante
  try {
    const snap = await getDoc(doc(db, 'restaurants', restId));
    if (!snap.exists()) { showToast('Restaurante no encontrado', 'error'); return; }
    restaurant = { id: snap.id, ...snap.data() };
  } catch(e) {
    console.error(e); showToast('Error de conexión con Firebase', 'error'); return;
  }

  document.getElementById('sidebarRestName').textContent = restaurant.name;

  // Cargar horarios guardados
  if (restaurant.scheduleConfig) {
    scheduleData = restaurant.scheduleConfig;
    // Asegurar estructura completa
    for (let i = 0; i < 7; i++) {
      if (!scheduleData.days[i]) scheduleData.days[i] = [];
    }
  }

  renderScheduleEditor();
  fillConfig();

  // Suscripción en tiempo real a reservas
  const q = query(
    collection(db, 'bookings'),
    where('restaurantId', '==', restId),
    orderBy('date', 'desc')
  );
  onSnapshot(q, snap => {
    allBookings = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderDashboard();
    renderAllBookings();
    loadPendingView();
    renderCalendar();
    updatePendingBadge();
  }, err => {
    console.error(err);
    showToast('Error cargando reservas', 'error');
  });
}

// ── Badge pendientes ──────────────────────────────────────────────
function updatePendingBadge() {
  const count = allBookings.filter(b => b.status === 'pending').length;
  const badge = document.getElementById('pendingBadge');
  if (count > 0) {
    badge.textContent = count;
    badge.style.display = 'inline-flex';
  } else {
    badge.style.display = 'none';
  }
}

// ── Dashboard ─────────────────────────────────────────────────────
function renderDashboard() {
  const t = today();
  const monthStr = t.substring(0, 7);

  const todayConfirmed = allBookings.filter(b => b.date === t && b.status === 'confirmed');
  const todayPending   = allBookings.filter(b => b.date === t && b.status === 'pending');
  const allPending     = allBookings.filter(b => b.status === 'pending');
  const thisMonth      = allBookings.filter(b => b.date?.startsWith(monthStr) && b.status !== 'cancelled');

  document.getElementById('statPendientes').textContent = allPending.length;
  document.getElementById('statHoy').textContent = todayConfirmed.length;
  document.getElementById('statComensales').textContent =
    todayConfirmed.reduce((s, b) => s + (b.guests || 0), 0);
  document.getElementById('statMes').textContent = thisMonth.length;

  renderBookingList('pendingBookings', allPending.sort((a,b) =>
    a.date.localeCompare(b.date) || a.time.localeCompare(b.time)), false, true);
  renderBookingList('todayBookings', todayConfirmed.sort((a,b) => a.time.localeCompare(b.time)));
}

function renderBookingList(elId, bookings, showDate = false, isPending = false) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (!bookings.length) {
    el.innerHTML = `<div style="padding:24px;text-align:center;color:var(--muted);font-size:0.9rem">
      ${isPending ? '👍 Sin solicitudes pendientes' : 'Sin reservas'}</div>`;
    return;
  }
  el.innerHTML = bookings.map(b => `
    <div class="booking-item">
      <div class="booking-time">${b.time}</div>
      <div class="booking-details">
        <div class="booking-name">${b.client?.name || ''} ${b.client?.lastname || ''}</div>
        <div class="booking-meta">
          ${showDate ? formatDate(b.date) + ' · ' : ''}
          👥 ${b.guests} · ${statusBadge(b.status)}
          ${b.notes ? ` · <em style="color:var(--muted);font-size:0.78rem">${b.notes}</em>` : ''}
        </div>
      </div>
      <div class="booking-actions">
        ${isPending || b.status === 'pending' ? `
          <button class="btn-icon btn-confirm" title="Confirmar" onclick="changeStatus('${b.id}','confirmed')">✅</button>
          <button class="btn-icon btn-cancel"  title="Cancelar"  onclick="changeStatus('${b.id}','cancelled')">✕</button>
        ` : ''}
        ${b.status === 'confirmed' ? `
          <button class="btn-icon" title="Completar" onclick="changeStatus('${b.id}','completed')">🏁</button>
          <button class="btn-icon btn-cancel" title="Cancelar" onclick="changeStatus('${b.id}','cancelled')">✕</button>
        ` : ''}
        <button class="btn-icon" title="Ver detalle" onclick="showDetail('${b.id}')">👁</button>
      </div>
    </div>
  `).join('');
}

// ── Vista Pendientes ──────────────────────────────────────────────
window.loadPendingView = function() {
  const pending = allBookings
    .filter(b => b.status === 'pending')
    .sort((a,b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

  const tbody = document.getElementById('pendingTableBody');
  if (!tbody) return;
  if (!pending.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--muted)">
      👍 No hay solicitudes pendientes</td></tr>`;
    return;
  }
  tbody.innerHTML = pending.map(b => `
    <tr>
      <td><span class="code-cell">${b.code}</span></td>
      <td>
        <div style="font-weight:600">${b.client?.name || ''} ${b.client?.lastname || ''}</div>
        <div style="font-size:0.78rem;color:var(--muted)">${b.client?.email || ''}<br>${b.client?.phone || ''}</div>
      </td>
      <td>${formatDate(b.date)}</td>
      <td><strong>${b.time}</strong></td>
      <td>👥 ${b.guests}</td>
      <td style="max-width:140px;font-size:0.82rem;color:var(--muted)">${b.notes || '—'}</td>
      <td style="font-size:0.78rem;color:var(--muted)">${formatTs(b.createdAt)}</td>
      <td>
        <div style="display:flex;gap:6px">
          <button class="btn-confirm-sm" onclick="changeStatus('${b.id}','confirmed')">✅ Confirmar</button>
          <button class="btn-cancel-sm"  onclick="changeStatus('${b.id}','cancelled')">✕ Rechazar</button>
        </div>
      </td>
    </tr>
  `).join('');
};

// ── Tabla reservas ────────────────────────────────────────────────
window.loadAllBookings = function() {
  const dateFilter   = document.getElementById('filterDate')?.value;
  const statusFilter = document.getElementById('filterStatus')?.value;

  let filtered = [...allBookings];
  if (dateFilter)   filtered = filtered.filter(b => b.date === dateFilter);
  if (statusFilter) filtered = filtered.filter(b => b.status === statusFilter);
  filtered.sort((a,b) => b.date.localeCompare(a.date) || a.time.localeCompare(b.time));

  const tbody = document.getElementById('bookingsTableBody');
  if (!tbody) return;
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--muted)">Sin reservas</td></tr>`;
    return;
  }
  tbody.innerHTML = filtered.map(b => `
    <tr>
      <td><span class="code-cell">${b.code}</span></td>
      <td>
        <div style="font-weight:600">${b.client?.name || ''} ${b.client?.lastname || ''}</div>
        <div style="font-size:0.78rem;color:var(--muted)">${b.client?.phone || ''}</div>
      </td>
      <td>${formatDate(b.date)}</td>
      <td>${b.time}</td>
      <td>👥 ${b.guests}</td>
      <td>${statusBadge(b.status)}</td>
      <td>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${b.status === 'pending'    ? `<button class="btn-icon btn-confirm" title="Confirmar" onclick="changeStatus('${b.id}','confirmed')">✅</button>` : ''}
          ${b.status === 'confirmed'  ? `<button class="btn-icon" title="Completar" onclick="changeStatus('${b.id}','completed')">🏁</button>` : ''}
          ${['pending','confirmed'].includes(b.status) ? `<button class="btn-icon btn-cancel" title="Cancelar" onclick="changeStatus('${b.id}','cancelled')">✕</button>` : ''}
          <button class="btn-icon" title="Ver" onclick="showDetail('${b.id}')">👁</button>
        </div>
      </td>
    </tr>
  `).join('');
};

function renderAllBookings() { loadAllBookings(); }

// ── Cambiar estado ────────────────────────────────────────────────
window.changeStatus = async function(id, newStatus) {
  try {
    await updateDoc(doc(db, 'bookings', id), {
      status: newStatus,
      [`${newStatus}At`]: serverTimestamp()
    });
  } catch(e) {
    console.error(e); showToast('Error al actualizar', 'error'); return;
  }
  const msgs = { confirmed:'✅ Reserva confirmada', cancelled:'✕ Reserva cancelada', completed:'🏁 Marcada como completada' };
  showToast(msgs[newStatus] || 'Estado actualizado');
  closeDetailModal();
};

// ── Detalle reserva ───────────────────────────────────────────────
window.showDetail = function(id) {
  const b = allBookings.find(x => x.id === id);
  if (!b) return;
  document.getElementById('bookingDetailContent').innerHTML = `
    <div class="detail-grid">
      <div class="detail-row"><span class="detail-label">Código</span><span class="conf-code">${b.code}</span></div>
      <div class="detail-row"><span class="detail-label">Estado</span>${statusBadge(b.status)}</div>
      <div class="detail-row"><span class="detail-label">Nombre</span><span>${b.client?.name || ''} ${b.client?.lastname || ''}</span></div>
      <div class="detail-row"><span class="detail-label">Email</span><span>${b.client?.email || '—'}</span></div>
      <div class="detail-row"><span class="detail-label">Teléfono</span><span>${b.client?.phone || '—'}</span></div>
      <div class="detail-row"><span class="detail-label">Fecha</span><span>${formatDate(b.date)}</span></div>
      <div class="detail-row"><span class="detail-label">Hora</span><span><strong>${b.time}</strong></span></div>
      <div class="detail-row"><span class="detail-label">Personas</span><span>👥 ${b.guests}</span></div>
      ${b.notes ? `<div class="detail-row"><span class="detail-label">Notas</span><span>${b.notes}</span></div>` : ''}
      <div class="detail-row"><span class="detail-label">Solicitada</span><span>${formatTs(b.createdAt)}</span></div>
    </div>
  `;
  const actions = document.getElementById('bookingDetailActions');
  actions.innerHTML = '';
  if (b.status === 'pending') {
    actions.innerHTML = `
      <button class="btn-secondary" onclick="closeDetailModal()">Cerrar</button>
      <button class="btn-cancel-sm" onclick="changeStatus('${b.id}','cancelled')">✕ Rechazar</button>
      <button class="btn-primary"   onclick="changeStatus('${b.id}','confirmed')">✅ Confirmar</button>
    `;
  } else if (b.status === 'confirmed') {
    actions.innerHTML = `
      <button class="btn-secondary" onclick="closeDetailModal()">Cerrar</button>
      <button class="btn-cancel-sm" onclick="changeStatus('${b.id}','cancelled')">✕ Cancelar</button>
      <button class="btn-primary"   onclick="changeStatus('${b.id}','completed')">🏁 Completar</button>
    `;
  } else {
    actions.innerHTML = `<button class="btn-primary" onclick="closeDetailModal()">Cerrar</button>`;
  }
  document.getElementById('bookingDetailModal').style.display = 'flex';
};
window.closeDetailModal = function() {
  document.getElementById('bookingDetailModal').style.display = 'none';
};
document.getElementById('bookingDetailModal').addEventListener('click', function(e) {
  if (e.target === this) closeDetailModal();
});

// ── Calendario ────────────────────────────────────────────────────
function renderCalendar() {
  const cal = document.getElementById('calendar');
  if (!cal) return;
  const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  document.getElementById('calMonthTitle').textContent = `${months[calMonth]} ${calYear}`;

  const first = new Date(calYear, calMonth, 1);
  const last  = new Date(calYear, calMonth + 1, 0);
  const startDay = first.getDay();

  let html = `<div class="cal-grid">`;
  DAY_SHORT.forEach(d => html += `<div class="cal-day-name">${d}</div>`);

  const byDay = {};
  const pendByDay = {};
  allBookings.filter(b => b.status !== 'cancelled').forEach(b => {
    if (!b.date) return;
    byDay[b.date] = (byDay[b.date] || 0) + 1;
    if (b.status === 'pending') pendByDay[b.date] = (pendByDay[b.date] || 0) + 1;
  });

  for (let i = 0; i < startDay; i++) html += `<div class="cal-cell other-month"></div>`;

  const todayStr = today();
  for (let d = 1; d <= last.getDate(); d++) {
    const dateStr = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const count  = byDay[dateStr]    || 0;
    const pcount = pendByDay[dateStr] || 0;
    const isToday = dateStr === todayStr;
    const dots = count > 0 ? `
      <div class="cal-dots">
        ${Array(Math.min(count,5)).fill('<div class="cal-dot"></div>').join('')}
        ${count > 5 ? `<span style="font-size:0.65rem;color:var(--amber)">+${count-5}</span>` : ''}
      </div>` : '';
    const pendDot = pcount > 0 ? `<div class="cal-pend-dot">${pcount}</div>` : '';
    html += `<div class="cal-cell${isToday?' today':''}${count>0?' has-bookings':''}" onclick="filterToDate('${dateStr}')">
      <div class="cal-num">${d}${pendDot}</div>${dots}</div>`;
  }
  html += '</div>';
  cal.innerHTML = html;
}

window.filterToDate = function(date) {
  document.getElementById('filterDate').value = date;
  switchView('reservas');
  loadAllBookings();
};

document.getElementById('calPrev').addEventListener('click', () => {
  calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } renderCalendar();
});
document.getElementById('calNext').addEventListener('click', () => {
  calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } renderCalendar();
});

// ── Editor de horarios ────────────────────────────────────────────
function renderScheduleEditor() {
  const editor = document.getElementById('scheduleEditor');
  if (!editor) return;

  let html = `
    <div class="schedule-global">
      <div class="schedule-global-row">
        <label class="form-label">⏱ Intervalo entre citas</label>
        <div class="interval-selector">
          ${[15,20,30,45,60,90].map(v => `
            <button type="button" class="interval-btn${scheduleData.interval === v ? ' active' : ''}"
              onclick="setInterval(${v})">${v} min</button>
          `).join('')}
        </div>
      </div>
    </div>
    <div class="days-schedule">
  `;

  for (let d = 0; d < 7; d++) {
    const tramos = scheduleData.days[d] || [];
    const isOpen = tramos.length > 0;
    html += `
      <div class="day-row" id="dayRow${d}">
        <div class="day-header">
          <div class="day-toggle">
            <label class="toggle-switch">
              <input type="checkbox" id="dayOpen${d}" ${isOpen ? 'checked' : ''} onchange="toggleDay(${d})">
              <span class="toggle-slider"></span>
            </label>
            <span class="day-name">${DAY_NAMES[d]}</span>
          </div>
          ${isOpen ? `<button type="button" class="btn-add-tramo" onclick="addTramo(${d})">+ Añadir tramo</button>` : ''}
        </div>
        <div class="tramos-container" id="tramosContainer${d}" style="${isOpen ? '' : 'display:none'}">
          ${tramos.map((t, i) => renderTramoHTML(d, i, t)).join('')}
          ${!tramos.length ? `<p class="no-tramos">Activa el día y añade tramos horarios</p>` : ''}
        </div>
      </div>
    `;
  }
  html += '</div>';
  editor.innerHTML = html;
}

function renderTramoHTML(dayIdx, tramoIdx, tramo) {
  return `
    <div class="tramo-row" id="tramo_${dayIdx}_${tramoIdx}">
      <div class="tramo-fields">
        <div class="tramo-field">
          <label>Apertura</label>
          <input type="time" class="form-input tramo-from" value="${tramo.from || ''}"
            onchange="updateTramo(${dayIdx},${tramoIdx},'from',this.value)">
        </div>
        <span class="tramo-sep">→</span>
        <div class="tramo-field">
          <label>Cierre</label>
          <input type="time" class="form-input tramo-to" value="${tramo.to || ''}"
            onchange="updateTramo(${dayIdx},${tramoIdx},'to',this.value)">
        </div>
      </div>
      <button type="button" class="btn-del-tramo" onclick="removeTramo(${dayIdx},${tramoIdx})" title="Eliminar tramo">✕</button>
    </div>
  `;
}

window.setInterval = function(mins) {
  scheduleData.interval = mins;
  document.querySelectorAll('.interval-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
};

window.toggleDay = function(d) {
  const checked = document.getElementById(`dayOpen${d}`).checked;
  const container = document.getElementById(`tramosContainer${d}`);
  const row = document.getElementById(`dayRow${d}`);
  if (checked) {
    scheduleData.days[d] = [];
    container.style.display = '';
    // Añadir botón
    row.querySelector('.day-header').innerHTML = `
      <div class="day-toggle">
        <label class="toggle-switch">
          <input type="checkbox" id="dayOpen${d}" checked onchange="toggleDay(${d})">
          <span class="toggle-slider"></span>
        </label>
        <span class="day-name">${DAY_NAMES[d]}</span>
      </div>
      <button type="button" class="btn-add-tramo" onclick="addTramo(${d})">+ Añadir tramo</button>
    `;
    container.innerHTML = `<p class="no-tramos">Pulsa "+ Añadir tramo" para configurar los horarios</p>`;
  } else {
    scheduleData.days[d] = [];
    container.style.display = 'none';
    row.querySelector('.day-header').innerHTML = `
      <div class="day-toggle">
        <label class="toggle-switch">
          <input type="checkbox" id="dayOpen${d}" onchange="toggleDay(${d})">
          <span class="toggle-slider"></span>
        </label>
        <span class="day-name">${DAY_NAMES[d]}</span>
      </div>
    `;
  }
};

window.addTramo = function(d) {
  if (!scheduleData.days[d]) scheduleData.days[d] = [];
  const newTramo = { from: '', to: '' };
  scheduleData.days[d].push(newTramo);
  const container = document.getElementById(`tramosContainer${d}`);
  const noTramos = container.querySelector('.no-tramos');
  if (noTramos) noTramos.remove();
  const idx = scheduleData.days[d].length - 1;
  const div = document.createElement('div');
  div.innerHTML = renderTramoHTML(d, idx, newTramo);
  container.appendChild(div.firstElementChild);
};

window.updateTramo = function(d, i, field, value) {
  if (!scheduleData.days[d] || !scheduleData.days[d][i]) return;
  scheduleData.days[d][i][field] = value;
};

window.removeTramo = function(d, i) {
  scheduleData.days[d].splice(i, 1);
  renderScheduleEditor(); // Re-render para actualizar índices
};

document.getElementById('saveScheduleBtn').addEventListener('click', async () => {
  // Validar que los tramos activos tienen from y to
  for (let d = 0; d < 7; d++) {
    for (const t of scheduleData.days[d] || []) {
      if (!t.from || !t.to) {
        showToast(`Completa todos los tramos del día ${DAY_NAMES[d]}`, 'error'); return;
      }
      if (t.from >= t.to) {
        showToast(`En ${DAY_NAMES[d]}: la apertura debe ser anterior al cierre`, 'error'); return;
      }
    }
  }

  try {
    await updateDoc(doc(db, 'restaurants', restId), { scheduleConfig: scheduleData });
    restaurant.scheduleConfig = scheduleData;
    showToast('Horarios guardados ✓');
  } catch(e) {
    console.error(e); showToast('Error al guardar horarios', 'error');
  }
});

// ── Configuración ─────────────────────────────────────────────────
function fillConfig() {
  if (!restaurant) return;
  document.getElementById('cfgName').value         = restaurant.name || '';
  document.getElementById('cfgCuisine').value      = restaurant.cuisine || '';
  document.getElementById('cfgCity').value         = restaurant.city || '';
  document.getElementById('cfgAddress').value      = restaurant.address || '';
  document.getElementById('cfgPhone').value        = restaurant.phone || '';
  document.getElementById('cfgEmail').value        = restaurant.email || '';
  document.getElementById('cfgDesc').value         = restaurant.description || '';
  document.getElementById('cfgCapacity').value     = restaurant.capacity || '';
  document.getElementById('cfgMaxParty').value     = restaurant.maxPartySize || '';
  document.getElementById('cfgMinParty').value     = restaurant.minPartySize || 1;
  document.getElementById('cfgAdvanceDays').value  = restaurant.maxAdvanceDays || 30;
  document.getElementById('cfgImage').value        = restaurant.image || '';
  document.getElementById('cfgPrice').value        = restaurant.priceRange || '€€';
  document.getElementById('cfgCategory').value     = restaurant.category || 'tapas';
}

document.getElementById('saveConfigBtn').addEventListener('click', async () => {
  const data = {
    name:           document.getElementById('cfgName').value,
    cuisine:        document.getElementById('cfgCuisine').value,
    city:           document.getElementById('cfgCity').value,
    address:        document.getElementById('cfgAddress').value,
    phone:          document.getElementById('cfgPhone').value,
    email:          document.getElementById('cfgEmail').value,
    description:    document.getElementById('cfgDesc').value,
    capacity:       parseInt(document.getElementById('cfgCapacity').value) || 50,
    maxPartySize:   parseInt(document.getElementById('cfgMaxParty').value) || 10,
    minPartySize:   parseInt(document.getElementById('cfgMinParty').value) || 1,
    maxAdvanceDays: parseInt(document.getElementById('cfgAdvanceDays').value) || 30,
    image:          document.getElementById('cfgImage').value,
    priceRange:     document.getElementById('cfgPrice').value,
    category:       document.getElementById('cfgCategory').value,
  };
  try {
    await updateDoc(doc(db, 'restaurants', restId), data);
    Object.assign(restaurant, data);
    document.getElementById('sidebarRestName').textContent = data.name;
    showToast('Configuración guardada ✓');
  } catch(e) {
    console.error(e); showToast('Error al guardar', 'error');
  }
});

// ── Nueva reserva manual ──────────────────────────────────────────
window.showNewReservaModal = function() {
  document.getElementById('newReservaModal').style.display = 'flex';
  document.getElementById('mDate').min = today();
};
window.closeModal = function() {
  document.getElementById('newReservaModal').style.display = 'none';
};
document.getElementById('newReservaModal').addEventListener('click', function(e) {
  if (e.target === this) closeModal();
});

document.getElementById('saveReservaBtn').addEventListener('click', async () => {
  const name    = document.getElementById('mName').value.trim();
  const lastname= document.getElementById('mLastname').value.trim();
  const email   = document.getElementById('mEmail').value.trim();
  const phone   = document.getElementById('mPhone').value.trim();
  const date    = document.getElementById('mDate').value;
  const time    = document.getElementById('mTime').value;
  const guests  = parseInt(document.getElementById('mGuests').value) || 2;
  const notes   = document.getElementById('mNotes').value.trim();

  if (!name || !email || !date || !time) {
    showToast('Completa los campos obligatorios', 'error'); return;
  }

  const bookingData = {
    restaurantId:   restId,
    restaurantName: restaurant.name,
    date, time, guests,
    client: { name, lastname, email, phone },
    notes, code: genCode(),
    status: 'confirmed', // manual = directamente confirmada
    createdAt: serverTimestamp()
  };

  try {
    await addDoc(collection(db, 'bookings'), bookingData);
  } catch(e) {
    console.error(e); showToast('Error al guardar', 'error'); return;
  }

  closeModal();
  showToast(`Reserva creada y confirmada: ${bookingData.code}`);
  ['mName','mLastname','mEmail','mPhone','mDate','mTime','mNotes'].forEach(id =>
    document.getElementById(id).value = '');
  document.getElementById('mGuests').value = 2;
});

// ── Navegación ────────────────────────────────────────────────────
const viewTitles = {
  dashboard: 'Dashboard', pendientes: 'Solicitudes pendientes',
  reservas: 'Todas las reservas', calendario: 'Calendario',
  configuracion: 'Configuración', horarios: 'Horarios y tramos'
};

window.switchView = function(v) {
  document.querySelectorAll('.dash-view').forEach(el => el.style.display = 'none');
  document.getElementById(`view-${v}`).style.display = 'block';
  document.querySelectorAll('.sidebar-link[data-view]').forEach(l => l.classList.remove('active'));
  document.querySelector(`.sidebar-link[data-view="${v}"]`)?.classList.add('active');
  document.getElementById('dashHeaderTitle').textContent = viewTitles[v] || v;
  if (window.innerWidth < 768) document.getElementById('sidebar').classList.remove('open');
};

document.querySelectorAll('.sidebar-link[data-view]').forEach(link => {
  link.addEventListener('click', e => { e.preventDefault(); switchView(link.dataset.view); });
});

document.getElementById('logoutBtn').addEventListener('click', e => {
  e.preventDefault();
  sessionStorage.removeItem('mesaya_admin');
  location.href = 'login.html';
});
document.getElementById('menuToggle').addEventListener('click', () =>
  document.getElementById('sidebar').classList.toggle('open'));
document.getElementById('sidebarClose').addEventListener('click', () =>
  document.getElementById('sidebar').classList.remove('open'));

init();
