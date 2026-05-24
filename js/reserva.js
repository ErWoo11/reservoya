// js/reserva.js
import { db, DEMO_MODE, DEMO_RESTAURANTS } from './firebase-config.js';
import {
  doc, getDoc, collection, addDoc, query, where, getDocs, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const params = new URLSearchParams(location.search);
const restId = params.get('id');
let restaurant = null;
let selectedDate = null;
let selectedTime = null;
let guests = 2;

// ── Helpers ──────────────────────────────────────────────────────
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = `toast ${type} show`;
  setTimeout(() => t.classList.remove('show'), 3500);
}

function genCode() {
  return 'MY' + Math.random().toString(36).substring(2, 8).toUpperCase();
}

function formatDate(d) {
  const [y, m, day] = d.split('-');
  const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${parseInt(day)} ${months[parseInt(m)-1]} ${y}`;
}

// ── Load restaurant ───────────────────────────────────────────────
async function loadRestaurant() {
  if (!restId) { location.href = 'index.html'; return; }
  
  if (DEMO_MODE) {
    restaurant = DEMO_RESTAURANTS.find(r => r.id === restId) || DEMO_RESTAURANTS[0];
  } else {
    try {
      const snap = await getDoc(doc(db, 'restaurants', restId));
      if (!snap.exists()) { location.href = 'index.html'; return; }
      restaurant = { id: snap.id, ...snap.data() };
    } catch(e) {
      restaurant = DEMO_RESTAURANTS[0];
    }
  }
  
  renderRestaurantInfo();
  initBookingForm();
  document.getElementById('loadingPage').style.display = 'none';
  document.getElementById('pageContent').style.display = 'block';
}

function renderRestaurantInfo() {
  const r = restaurant;
  document.title = `Reservar en ${r.name} — MesaYa`;
  document.getElementById('heroImg').src = r.image;
  document.getElementById('heroImg').alt = r.name;
  document.getElementById('heroBadge').textContent = r.cuisine;
  document.getElementById('heroName').textContent = r.name;
  document.getElementById('heroLocation').textContent = `📍 ${r.city}`;
  document.getElementById('heroRating').textContent = `⭐ ${r.rating?.toFixed(1) || '—'}`;
  document.getElementById('heroPrice').textContent = r.priceRange || '€€';
  document.getElementById('heroSchedule').textContent = `🕐 ${r.schedule?.opens || '—'} – ${r.schedule?.closes || '—'}`;

  document.getElementById('restDesc').textContent = r.description;
  document.getElementById('restPhone').textContent = r.phone;
  document.getElementById('restEmail').textContent = r.email;
  document.getElementById('restAddress').textContent = r.address;
  document.getElementById('restSchedule').textContent = `${r.schedule?.opens || '—'} – ${r.schedule?.closes || '—'}`;
  document.getElementById('restCapacity').textContent = `Aforo: ${r.capacity} personas · Grupos de ${r.minPartySize || 1}–${r.maxPartySize || 10}`;
}

// ── Booking form logic ────────────────────────────────────────────
function initBookingForm() {
  const r = restaurant;
  // Date min/max
  const today = new Date();
  const maxDate = new Date();
  maxDate.setDate(today.getDate() + (r.maxAdvanceDays || 30));
  const dateInput = document.getElementById('bookingDate');
  dateInput.min = today.toISOString().split('T')[0];
  dateInput.max = maxDate.toISOString().split('T')[0];

  // Guests
  document.getElementById('guestsDown').addEventListener('click', () => {
    if (guests > (r.minPartySize || 1)) { guests--; document.getElementById('guestsCount').textContent = guests; }
  });
  document.getElementById('guestsUp').addEventListener('click', () => {
    if (guests < (r.maxPartySize || 10)) { guests++; document.getElementById('guestsCount').textContent = guests; }
  });

  // Date change
  dateInput.addEventListener('change', async () => {
    selectedDate = dateInput.value;
    selectedTime = null;
    await renderTimeSlots();
  });

  // Step 1 next
  document.getElementById('step1Next').addEventListener('click', () => {
    if (!selectedDate || !selectedTime) return;
    goStep(2);
    document.getElementById('bookingSummary').innerHTML = `
      <div><strong>📅 ${formatDate(selectedDate)}</strong></div>
      <div><strong>🕐 ${selectedTime}</strong></div>
      <div><strong>👥 ${guests} personas</strong></div>
    `;
  });

  // Step 2 confirm
  document.getElementById('step2Next').addEventListener('click', submitBooking);
}

async function renderTimeSlots() {
  const r = restaurant;
  const group = document.getElementById('timeSlotsGroup');
  const container = document.getElementById('timeSlots');
  const nextBtn = document.getElementById('step1Next');
  
  group.style.display = 'block';
  container.innerHTML = '<div class="spinner" style="margin: 8px auto"></div>';

  // Get taken slots for this day
  let takenTimes = [];
  if (!DEMO_MODE && db) {
    try {
      const q = query(
        collection(db, 'bookings'),
        where('restaurantId', '==', restId),
        where('date', '==', selectedDate),
        where('status', 'in', ['confirmed', 'pending'])
      );
      const snap = await getDocs(q);
      const guestsByTime = {};
      snap.docs.forEach(d => {
        const data = d.data();
        guestsByTime[data.time] = (guestsByTime[data.time] || 0) + data.guests;
      });
      takenTimes = Object.entries(guestsByTime)
        .filter(([, g]) => g >= r.capacity)
        .map(([t]) => t);
    } catch(e) {}
  }

  // Check if day is closed
  const dayOfWeek = new Date(selectedDate + 'T12:00:00').getDay();
  const closedDays = r.schedule?.closedDays || [];
  
  container.innerHTML = '';

  if (closedDays.includes(dayOfWeek)) {
    container.innerHTML = '<p style="color:var(--muted);font-size:0.9rem">Cerrado este día. Por favor elige otra fecha.</p>';
    nextBtn.disabled = true;
    return;
  }

  const slots = generateTimeSlots(r.schedule?.opens || '13:00', r.schedule?.closes || '23:00');

  slots.forEach(time => {
    const btn = document.createElement('button');
    btn.className = 'time-slot' + (takenTimes.includes(time) ? ' unavailable' : '');
    btn.textContent = time;
    btn.type = 'button';
    if (!takenTimes.includes(time)) {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.time-slot').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedTime = time;
        nextBtn.disabled = false;
      });
    } else {
      btn.disabled = true;
    }
    container.appendChild(btn);
  });
}

function generateTimeSlots(opens, closes) {
  const slots = [];
  let [h, m] = opens.split(':').map(Number);
  const [ch, cm] = closes.split(':').map(Number);
  const closeMinutes = ch * 60 + cm - 90; // stop 90min before close
  while (h * 60 + m <= closeMinutes) {
    slots.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
    m += 30;
    if (m >= 60) { h++; m -= 60; }
  }
  return slots;
}

async function submitBooking() {
  const name = document.getElementById('clientName').value.trim();
  const lastname = document.getElementById('clientLastname').value.trim();
  const email = document.getElementById('clientEmail').value.trim();
  const phone = document.getElementById('clientPhone').value.trim();
  const notes = document.getElementById('clientNotes').value.trim();
  const privacy = document.getElementById('privacyCheck').checked;

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
  btn.disabled = true; btn.textContent = 'Guardando…';

  const code = genCode();
  const bookingData = {
    restaurantId: restId,
    restaurantName: restaurant.name,
    date: selectedDate,
    time: selectedTime,
    guests,
    client: { name, lastname, email, phone },
    notes,
    code,
    status: 'confirmed',
    createdAt: DEMO_MODE ? new Date().toISOString() : serverTimestamp()
  };

  if (!DEMO_MODE && db) {
    try {
      await addDoc(collection(db, 'bookings'), bookingData);
    } catch(e) {
      showToast('Error al guardar. Inténtalo de nuevo.', 'error');
      btn.disabled = false; btn.textContent = 'Confirmar reserva →';
      return;
    }
  }

  showConfirmation(bookingData, code);
  goStep(3);
}

function showConfirmation(data, code) {
  document.getElementById('confirmCard').innerHTML = `
    <div class="conf-row"><span class="conf-label">Código de reserva</span><span class="conf-value conf-code">${code}</span></div>
    <div class="conf-row"><span class="conf-label">Restaurante</span><span class="conf-value">${data.restaurantName}</span></div>
    <div class="conf-row"><span class="conf-label">Fecha</span><span class="conf-value">${formatDate(data.date)}</span></div>
    <div class="conf-row"><span class="conf-label">Hora</span><span class="conf-value">${data.time}</span></div>
    <div class="conf-row"><span class="conf-label">Personas</span><span class="conf-value">${data.guests}</span></div>
    <div class="conf-row"><span class="conf-label">Nombre</span><span class="conf-value">${data.client.name} ${data.client.lastname}</span></div>
    <div class="conf-row"><span class="conf-label">Email</span><span class="conf-value">${data.client.email}</span></div>
    ${data.notes ? `<div class="conf-row"><span class="conf-label">Notas</span><span class="conf-value">${data.notes}</span></div>` : ''}
  `;
}

// ── Step navigation ───────────────────────────────────────────────
window.goStep = function(n) {
  [1,2,3].forEach(i => {
    document.getElementById(`step${i}`).style.display = i === n ? 'block' : 'none';
    const stepEl = document.querySelector(`.bstep[data-step="${i}"]`);
    stepEl.classList.remove('active','done');
    if (i === n) stepEl.classList.add('active');
    if (i < n) stepEl.classList.add('done');
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

loadRestaurant();
