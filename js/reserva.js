// js/reserva.js
import { db } from './firebase-config.js';
import {
  doc, getDoc, collection, addDoc, query, where, getDocs, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const params  = new URLSearchParams(location.search);
const restId  = params.get('id');
let restaurant  = null;
let selectedDate = null;
let selectedTime = null;
let guests = 2;

// ── Helpers ───────────────────────────────────────────────────────
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = `toast ${type} show`;
  setTimeout(() => t.classList.remove('show'), 3500);
}
function genCode() { return 'MY' + Math.random().toString(36).substring(2, 8).toUpperCase(); }
function formatDate(d) {
  const [y, m, day] = d.split('-');
  const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${parseInt(day)} ${months[parseInt(m)-1]} ${y}`;
}

// ── Generar slots a partir de los tramos del día ──────────────────
function generateSlotsForDay(dayIdx, scheduleConfig) {
  const interval = scheduleConfig?.interval || 30;
  const tramos   = scheduleConfig?.days?.[dayIdx] || [];

  if (!tramos.length) return null; // día cerrado

  const slots = [];
  for (const tramo of tramos) {
    if (!tramo.from || !tramo.to) continue;
    let [h, m] = tramo.from.split(':').map(Number);
    const [ch, cm] = tramo.to.split(':').map(Number);
    const endMinutes = ch * 60 + cm;
    while (h * 60 + m < endMinutes) {
      slots.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
      m += interval;
      if (m >= 60) { h += Math.floor(m / 60); m = m % 60; }
    }
  }
  return slots;
}

// ── Fallback: generar slots con horario simple ────────────────────
function generateSlotsSimple(opens, closes, interval) {
  const slots = [];
  let [h, m] = opens.split(':').map(Number);
  const [ch, cm] = closes.split(':').map(Number);
  const closeMinutes = ch * 60 + cm - interval;
  while (h * 60 + m <= closeMinutes) {
    slots.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
    m += interval;
    if (m >= 60) { h++; m -= 60; }
  }
  return slots;
}

// ── Cargar restaurante ────────────────────────────────────────────
async function loadRestaurant() {
  if (!restId) { location.href = 'index.html'; return; }
  try {
    const snap = await getDoc(doc(db, 'restaurants', restId));
    if (!snap.exists()) { location.href = 'index.html'; return; }
    restaurant = { id: snap.id, ...snap.data() };
  } catch(e) {
    console.error(e);
    document.getElementById('loadingPage').innerHTML =
      `<div class="empty-state"><div class="empty-icon">⚠️</div><h3>Error de conexión</h3>
       <p>No se pudo cargar el restaurante.</p></div>`;
    return;
  }
  renderRestaurantInfo();
  initBookingForm();
  document.getElementById('loadingPage').style.display = 'none';
  document.getElementById('pageContent').style.display = 'block';
}

function renderRestaurantInfo() {
  const r = restaurant;
  document.title = `Reservar en ${r.name} — MesaYa`;
  document.getElementById('heroImg').src = r.image || '';
  document.getElementById('heroImg').alt = r.name;
  document.getElementById('heroBadge').textContent = r.cuisine;
  document.getElementById('heroName').textContent = r.name;
  document.getElementById('heroLocation').textContent = `📍 ${r.city}`;
  document.getElementById('heroRating').textContent = `⭐ ${r.rating?.toFixed(1) || '—'}`;
  document.getElementById('heroPrice').textContent = r.priceRange || '€€';

  // Mostrar resumen de horarios
  const sc = r.scheduleConfig;
  if (sc) {
    const openDays = Object.entries(sc.days)
      .filter(([, tramos]) => tramos.length > 0)
      .map(([d]) => ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][d])
      .join(', ');
    document.getElementById('heroSchedule').textContent = `🕐 Abierto: ${openDays || '—'} · Intervalo ${sc.interval} min`;
  } else {
    const s = r.schedule;
    document.getElementById('heroSchedule').textContent = `🕐 ${s?.opens || '—'} – ${s?.closes || '—'}`;
  }

  document.getElementById('restDesc').textContent = r.description;
  document.getElementById('restPhone').textContent = r.phone;
  document.getElementById('restEmail').textContent = r.email;
  document.getElementById('restAddress').textContent = r.address;

  // Horario detallado en sidebar
  const sc2 = r.scheduleConfig;
  if (sc2) {
    const dayNames = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
    let schedHtml = '';
    for (let d = 0; d < 7; d++) {
      const tramos = sc2.days[d] || [];
      if (tramos.length) {
        schedHtml += `<div style="font-size:0.82rem;margin-bottom:4px">
          <strong>${dayNames[d]}:</strong> ${tramos.map(t => `${t.from}–${t.to}`).join(', ')}
        </div>`;
      }
    }
    document.getElementById('restSchedule').innerHTML = schedHtml || '—';
  } else {
    document.getElementById('restSchedule').textContent =
      `${r.schedule?.opens || '—'} – ${r.schedule?.closes || '—'}`;
  }

  document.getElementById('restCapacity').textContent =
    `Aforo: ${r.capacity} personas · Grupos de ${r.minPartySize || 1}–${r.maxPartySize || 10}`;
}

// ── Formulario de reserva ─────────────────────────────────────────
function initBookingForm() {
  const r = restaurant;
  const todayStr = new Date().toISOString().split('T')[0];
  const maxDate  = new Date();
  maxDate.setDate(maxDate.getDate() + (r.maxAdvanceDays || 30));
  const dateInput = document.getElementById('bookingDate');
  dateInput.min = todayStr;
  dateInput.max = maxDate.toISOString().split('T')[0];

  // Deshabilitar días sin horario configurado
  if (r.scheduleConfig) {
    dateInput.addEventListener('input', () => {
      const d = new Date(dateInput.value + 'T12:00:00').getDay();
      const tramos = r.scheduleConfig?.days?.[d] || [];
      if (!tramos.length) {
        showToast('El restaurante está cerrado ese día. Elige otra fecha.', 'error');
        dateInput.value = '';
        document.getElementById('timeSlotsGroup').style.display = 'none';
        document.getElementById('step1Next').disabled = true;
      }
    });
  }

  document.getElementById('guestsDown').addEventListener('click', () => {
    if (guests > (r.minPartySize || 1)) {
      guests--;
      document.getElementById('guestsCount').textContent = guests;
    }
  });
  document.getElementById('guestsUp').addEventListener('click', () => {
    if (guests < (r.maxPartySize || 10)) {
      guests++;
      document.getElementById('guestsCount').textContent = guests;
    }
  });

  dateInput.addEventListener('change', async () => {
    selectedDate = dateInput.value;
    selectedTime = null;
    document.getElementById('step1Next').disabled = true;
    await renderTimeSlots();
  });

  document.getElementById('step1Next').addEventListener('click', () => {
    if (!selectedDate || !selectedTime) return;
    goStep(2);
    document.getElementById('bookingSummary').innerHTML = `
      <div><strong>📅 ${formatDate(selectedDate)}</strong></div>
      <div><strong>🕐 ${selectedTime}</strong></div>
      <div><strong>👥 ${guests} personas</strong></div>
    `;
  });

  document.getElementById('step2Next').addEventListener('click', submitBooking);
}

async function renderTimeSlots() {
  const r = restaurant;
  const group     = document.getElementById('timeSlotsGroup');
  const container = document.getElementById('timeSlots');
  const nextBtn   = document.getElementById('step1Next');

  group.style.display = 'block';
  container.innerHTML = '<div class="spinner" style="margin: 8px auto"></div>';

  const dayOfWeek  = new Date(selectedDate + 'T12:00:00').getDay();
  const sc         = r.scheduleConfig;

  // Determinar slots del día
  let slots = [];
  if (sc) {
    const generated = generateSlotsForDay(dayOfWeek, sc);
    if (generated === null || !generated.length) {
      container.innerHTML = '<p style="color:var(--muted);font-size:0.9rem">Cerrado este día. Por favor elige otra fecha.</p>';
      nextBtn.disabled = true;
      return;
    }
    slots = generated;
  } else {
    // Fallback: horario simple legado
    const closedDays = r.schedule?.closedDays || [];
    if (closedDays.includes(dayOfWeek)) {
      container.innerHTML = '<p style="color:var(--muted);font-size:0.9rem">Cerrado este día. Por favor elige otra fecha.</p>';
      nextBtn.disabled = true;
      return;
    }
    slots = generateSlotsSimple(r.schedule?.opens || '13:00', r.schedule?.closes || '23:00', 30);
  }

  // Consultar reservas ocupadas en Firestore
  let guestsByTime = {};
  try {
    const q = query(
      collection(db, 'bookings'),
      where('restaurantId', '==', restId),
      where('date', '==', selectedDate),
      where('status', 'in', ['confirmed', 'pending'])
    );
    const snap = await getDocs(q);
    snap.docs.forEach(d => {
      const data = d.data();
      guestsByTime[data.time] = (guestsByTime[data.time] || 0) + data.guests;
    });
  } catch(e) {
    console.error('Error consultando disponibilidad:', e);
  }

  container.innerHTML = '';
  const capacity = r.capacity || 999;

  slots.forEach(time => {
    const occupied = guestsByTime[time] || 0;
    const available = capacity - occupied;
    const isFull = available <= 0;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'time-slot' + (isFull ? ' unavailable' : '');
    btn.innerHTML = `<span class="slot-time">${time}</span>
      <span class="slot-avail">${isFull ? 'Completo' : `${available} libre${available !== 1 ? 's' : ''}`}</span>`;
    btn.disabled = isFull;

    if (!isFull) {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.time-slot').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedTime = time;
        nextBtn.disabled = false;
      });
    }
    container.appendChild(btn);
  });
}

// ── Enviar reserva (status = pending) ────────────────────────────
async function submitBooking() {
  const name     = document.getElementById('clientName').value.trim();
  const lastname = document.getElementById('clientLastname').value.trim();
  const email    = document.getElementById('clientEmail').value.trim();
  const phone    = document.getElementById('clientPhone').value.trim();
  const notes    = document.getElementById('clientNotes').value.trim();
  const privacy  = document.getElementById('privacyCheck').checked;

  if (!name || !lastname || !email || !phone) {
    showToast('Por favor completa todos los campos obligatorios', 'error'); return;
  }
  if (!privacy) {
    showToast('Debes aceptar la política de privacidad', 'error'); return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showToast('Email no válido', 'error'); return;
  }

  const btn = document.getElementById('step2Next');
  btn.disabled = true; btn.textContent = 'Enviando solicitud…';

  const code = genCode();
  const bookingData = {
    restaurantId:   restId,
    restaurantName: restaurant.name,
    date:           selectedDate,
    time:           selectedTime,
    guests,
    client: { name, lastname, email, phone },
    notes,
    code,
    status:    'pending',   // ← el admin confirma después
    createdAt: serverTimestamp()
  };

  try {
    await addDoc(collection(db, 'bookings'), bookingData);
  } catch(e) {
    console.error(e);
    showToast('Error al enviar. Inténtalo de nuevo.', 'error');
    btn.disabled = false; btn.textContent = 'Enviar solicitud →';
    return;
  }

  showConfirmation(bookingData, code);
  goStep(3);
}

function showConfirmation(data, code) {
  document.getElementById('confirmCard').innerHTML = `
    <div class="conf-row"><span class="conf-label">Código de solicitud</span><span class="conf-value conf-code">${code}</span></div>
    <div class="conf-row"><span class="conf-label">Restaurante</span><span class="conf-value">${data.restaurantName}</span></div>
    <div class="conf-row"><span class="conf-label">Fecha</span><span class="conf-value">${formatDate(data.date)}</span></div>
    <div class="conf-row"><span class="conf-label">Hora</span><span class="conf-value">${data.time}</span></div>
    <div class="conf-row"><span class="conf-label">Personas</span><span class="conf-value">${data.guests}</span></div>
    <div class="conf-row"><span class="conf-label">Nombre</span><span class="conf-value">${data.client.name} ${data.client.lastname}</span></div>
    <div class="conf-row"><span class="conf-label">Email</span><span class="conf-value">${data.client.email}</span></div>
    ${data.notes ? `<div class="conf-row"><span class="conf-label">Notas</span><span class="conf-value">${data.notes}</span></div>` : ''}
  `;
  // Ajustar texto de confirmación: es solicitud, no reserva
  document.querySelector('.confirmation-icon').textContent = '📨';
  document.querySelector('#step3 .booking-title').textContent = '¡Solicitud enviada!';
  document.querySelector('.confirmation-text').textContent =
    'Tu solicitud está pendiente de confirmación por el restaurante. Te avisarán lo antes posible.';
}

window.goStep = function(n) {
  [1,2,3].forEach(i => {
    document.getElementById(`step${i}`).style.display = i === n ? 'block' : 'none';
    const stepEl = document.querySelector(`.bstep[data-step="${i}"]`);
    stepEl.classList.remove('active','done');
    if (i === n) stepEl.classList.add('active');
    if (i < n)  stepEl.classList.add('done');
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

loadRestaurant();
