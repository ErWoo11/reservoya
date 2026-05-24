// js/dashboard.js
import { db, auth } from './firebase-config.js';
import {
  collection, query, where, getDocs, addDoc, updateDoc, doc,
  orderBy, serverTimestamp, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── Auth guard ────────────────────────────────────────────────────
const adminData = JSON.parse(sessionStorage.getItem('mesaya_admin') || 'null');
if (!adminData) { location.href = 'login.html'; }

const restId = adminData?.restaurantId;
if (!restId) { location.href = 'login.html'; }

let restaurant = null;
let allBookings = [];
let calMonth = new Date().getMonth();
let calYear = new Date().getFullYear();

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
function genCode() { return 'MY' + Math.random().toString(36).substring(2,8).toUpperCase(); }
function statusBadge(s) {
  const labels = { confirmed: 'Confirmada', pending: 'Pendiente', cancelled: 'Cancelada', completed: 'Completada' };
  return `<span class="badge badge-${s}">${labels[s] || s}</span>`;
}

// ── Init ──────────────────────────────────────────────────────────
async function init() {
  const now = new Date();
  document.getElementById('dashDate').textContent = now.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  document.getElementById('todayDate2').textContent = formatDate(today());

  // Cargar restaurante
  try {
    const snap = await getDoc(doc(db, 'restaurants', restId));
    if (!snap.exists()) {
      showToast('Restaurante no encontrado en Firestore', 'error');
      return;
    }
    restaurant = { id: snap.id, ...snap.data() };
  } catch(e) {
    console.error('Error cargando restaurante:', e);
    showToast('Error de conexión con Firebase', 'error');
    return;
  }

  document.getElementById('sidebarRestName').textContent = restaurant.name;

  // Cargar reservas
  try {
    const q = query(
      collection(db, 'bookings'),
      where('restaurantId', '==', restId),
      orderBy('date', 'desc')
    );
    const snap = await getDocs(q);
    allBookings = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch(e) {
    console.error('Error cargando reservas:', e);
    showToast('Error cargando reservas', 'error');
  }

  renderDashboard();
  renderAllBookings();
  renderCalendar();
  fillConfig();
}

// ── Dashboard ─────────────────────────────────────────────────────
function renderDashboard() {
  const t = today();
  const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const monthStr = t.substring(0, 7);

  const todayB = allBookings.filter(b => b.date === t && b.status !== 'cancelled');
  const thisWeek = allBookings.filter(b => {
    const d = new Date(b.date); return d >= weekStart && b.status !== 'cancelled';
  });
  const thisMonth = allBookings.filter(b => b.date?.startsWith(monthStr) && b.status !== 'cancelled');

  document.getElementById('statHoy').textContent = todayB.length;
  document.getElementById('statComensales').textContent = todayB.reduce((s, b) => s + (b.guests || 0), 0);
  document.getElementById('statSemana').textContent = thisWeek.length;
  document.getElementById('statMes').textContent = thisMonth.length;

  renderBookingList('todayBookings', todayB.sort((a,b) => a.time.localeCompare(b.time)));

  const upcoming = allBookings
    .filter(b => b.date > t && b.status !== 'cancelled')
    .sort((a,b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
    .slice(0, 8);
  renderBookingList('upcomingBookings', upcoming, true);
}

function renderBookingList(elId, bookings, showDate = false) {
  const el = document.getElementById(elId);
  if (!bookings.length) {
    el.innerHTML = `<div style="padding:24px;text-align:center;color:var(--muted);font-size:0.9rem">Sin reservas</div>`;
    return;
  }
  el.innerHTML = bookings.map(b => `
    <div class="booking-item">
      <div class="booking-time">${b.time}</div>
      <div class="booking-details">
        <div class="booking-name">${b.client?.name || ''} ${b.client?.lastname || ''}</div>
        <div class="booking-meta">${showDate ? formatDate(b.date) + ' · ' : ''}👥 ${b.guests} · ${statusBadge(b.status)} · <span class="code-cell" style="font-size:0.78rem">${b.code}</span></div>
      </div>
      <div class="booking-actions">
        ${b.status === 'confirmed' ? `<button class="btn-icon" title="Completar" onclick="changeStatus('${b.id}','completed')">✅</button>` : ''}
        ${b.status !== 'cancelled' ? `<button class="btn-icon" title="Cancelar" onclick="changeStatus('${b.id}','cancelled')">✕</button>` : ''}
      </div>
    </div>
  `).join('');
}

// ── Tabla de reservas ─────────────────────────────────────────────
window.loadAllBookings = function() {
  const dateFilter = document.getElementById('filterDate').value;
  const statusFilter = document.getElementById('filterStatus').value;

  let filtered = [...allBookings];
  if (dateFilter) filtered = filtered.filter(b => b.date === dateFilter);
  if (statusFilter) filtered = filtered.filter(b => b.status === statusFilter);
  filtered.sort((a,b) => b.date.localeCompare(a.date) || a.time.localeCompare(b.time));

  const tbody = document.getElementById('bookingsTableBody');
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
        <div style="display:flex;gap:6px">
          ${b.status === 'pending' ? `<button class="btn-icon" title="Confirmar" onclick="changeStatus('${b.id}','confirmed')">✅</button>` : ''}
          ${b.status === 'confirmed' ? `<button class="btn-icon" title="Completar" onclick="changeStatus('${b.id}','completed')">🏁</button>` : ''}
          ${b.status !== 'cancelled' ? `<button class="btn-icon" title="Cancelar" onclick="changeStatus('${b.id}','cancelled')">✕</button>` : ''}
        </div>
      </td>
    </tr>
  `).join('');
};

function renderAllBookings() { loadAllBookings(); }

// ── Cambiar estado ────────────────────────────────────────────────
window.changeStatus = async function(id, newStatus) {
  try {
    await updateDoc(doc(db, 'bookings', id), { status: newStatus });
  } catch(e) {
    console.error('Error actualizando estado:', e);
    showToast('Error al actualizar', 'error');
    return;
  }
  const booking = allBookings.find(b => b.id === id);
  if (booking) booking.status = newStatus;
  const msgs = { confirmed: 'Reserva confirmada', cancelled: 'Reserva cancelada', completed: 'Reserva completada' };
  showToast(msgs[newStatus] || 'Estado actualizado');
  renderDashboard();
  renderAllBookings();
  renderCalendar();
};

// ── Calendario ────────────────────────────────────────────────────
function renderCalendar() {
  const cal = document.getElementById('calendar');
  const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  document.getElementById('calMonthTitle').textContent = `${months[calMonth]} ${calYear}`;

  const first = new Date(calYear, calMonth, 1);
  const last = new Date(calYear, calMonth + 1, 0);
  const startDay = first.getDay();

  const days = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  let html = `<div class="cal-grid">`;
  days.forEach(d => html += `<div class="cal-day-name">${d}</div>`);

  const byDay = {};
  allBookings.filter(b => b.status !== 'cancelled').forEach(b => {
    if (b.date) byDay[b.date] = (byDay[b.date] || 0) + 1;
  });

  for (let i = 0; i < startDay; i++) html += `<div class="cal-cell other-month"></div>`;

  const todayStr = today();
  for (let d = 1; d <= last.getDate(); d++) {
    const dateStr = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const count = byDay[dateStr] || 0;
    const isToday = dateStr === todayStr;
    const dots = count > 0
      ? `<div class="cal-dots">${Array(Math.min(count,5)).fill('<div class="cal-dot"></div>').join('')}${count > 5 ? `<span style="font-size:0.7rem;color:var(--amber)">+${count-5}</span>` : ''}</div>`
      : '';
    html += `<div class="cal-cell${isToday ? ' today' : ''}${count > 0 ? ' has-bookings' : ''}" onclick="filterToDate('${dateStr}')">
      <div class="cal-num">${d}</div>${dots}</div>`;
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
  calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; }
  renderCalendar();
});
document.getElementById('calNext').addEventListener('click', () => {
  calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; }
  renderCalendar();
});

// ── Configuración ─────────────────────────────────────────────────
function fillConfig() {
  if (!restaurant) return;
  document.getElementById('cfgName').value = restaurant.name || '';
  document.getElementById('cfgCuisine').value = restaurant.cuisine || '';
  document.getElementById('cfgCity').value = restaurant.city || '';
  document.getElementById('cfgAddress').value = restaurant.address || '';
  document.getElementById('cfgPhone').value = restaurant.phone || '';
  document.getElementById('cfgEmail').value = restaurant.email || '';
  document.getElementById('cfgDesc').value = restaurant.description || '';
  document.getElementById('cfgCapacity').value = restaurant.capacity || '';
  document.getElementById('cfgMaxParty').value = restaurant.maxPartySize || '';
  document.getElementById('cfgOpens').value = restaurant.schedule?.opens || '';
  document.getElementById('cfgCloses').value = restaurant.schedule?.closes || '';
  document.querySelectorAll('.cfgClosed').forEach(cb => {
    cb.checked = (restaurant.schedule?.closedDays || []).includes(parseInt(cb.value));
  });
}

document.getElementById('saveConfigBtn').addEventListener('click', async () => {
  const closedDays = Array.from(document.querySelectorAll('.cfgClosed:checked')).map(cb => parseInt(cb.value));
  const data = {
    name: document.getElementById('cfgName').value,
    cuisine: document.getElementById('cfgCuisine').value,
    city: document.getElementById('cfgCity').value,
    address: document.getElementById('cfgAddress').value,
    phone: document.getElementById('cfgPhone').value,
    email: document.getElementById('cfgEmail').value,
    description: document.getElementById('cfgDesc').value,
    capacity: parseInt(document.getElementById('cfgCapacity').value) || 50,
    maxPartySize: parseInt(document.getElementById('cfgMaxParty').value) || 10,
    schedule: {
      opens: document.getElementById('cfgOpens').value,
      closes: document.getElementById('cfgCloses').value,
      closedDays
    }
  };

  try {
    await updateDoc(doc(db, 'restaurants', restId), data);
  } catch(e) {
    console.error('Error guardando configuración:', e);
    showToast('Error al guardar', 'error');
    return;
  }

  Object.assign(restaurant, data);
  document.getElementById('sidebarRestName').textContent = data.name;
  showToast('Configuración guardada ✓');
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
  const name = document.getElementById('mName').value.trim();
  const lastname = document.getElementById('mLastname').value.trim();
  const email = document.getElementById('mEmail').value.trim();
  const phone = document.getElementById('mPhone').value.trim();
  const date = document.getElementById('mDate').value;
  const time = document.getElementById('mTime').value;
  const guests = parseInt(document.getElementById('mGuests').value) || 2;
  const notes = document.getElementById('mNotes').value.trim();

  if (!name || !email || !date || !time) {
    showToast('Completa los campos obligatorios', 'error'); return;
  }

  const code = genCode();
  const bookingData = {
    restaurantId: restId,
    restaurantName: restaurant.name,
    date, time, guests,
    client: { name, lastname, email, phone },
    notes, code, status: 'confirmed',
    createdAt: serverTimestamp()
  };

  let newId;
  try {
    const ref = await addDoc(collection(db, 'bookings'), bookingData);
    newId = ref.id;
  } catch(e) {
    console.error('Error guardando reserva:', e);
    showToast('Error al guardar', 'error');
    return;
  }

  allBookings.unshift({ ...bookingData, id: newId });
  closeModal();
  showToast(`Reserva creada: ${code}`);
  renderDashboard();
  renderAllBookings();
  renderCalendar();
  ['mName','mLastname','mEmail','mPhone','mDate','mTime','mNotes'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('mGuests').value = 2;
});

// ── Navegación ────────────────────────────────────────────────────
const viewTitles = { dashboard: 'Dashboard', reservas: 'Reservas', calendario: 'Calendario', configuracion: 'Configuración' };

function switchView(v) {
  document.querySelectorAll('.dash-view').forEach(el => el.style.display = 'none');
  document.getElementById(`view-${v}`).style.display = 'block';
  document.querySelectorAll('.sidebar-link[data-view]').forEach(l => l.classList.remove('active'));
  document.querySelector(`.sidebar-link[data-view="${v}"]`)?.classList.add('active');
  document.getElementById('dashHeaderTitle').textContent = viewTitles[v] || v;
  if (window.innerWidth < 768) document.getElementById('sidebar').classList.remove('open');
}

document.querySelectorAll('.sidebar-link[data-view]').forEach(link => {
  link.addEventListener('click', e => { e.preventDefault(); switchView(link.dataset.view); });
});

document.getElementById('logoutBtn').addEventListener('click', e => {
  e.preventDefault();
  sessionStorage.removeItem('mesaya_admin');
  location.href = 'login.html';
});

document.getElementById('menuToggle').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
});
document.getElementById('sidebarClose').addEventListener('click', () => {
  document.getElementById('sidebar').classList.remove('open');
});

init();
