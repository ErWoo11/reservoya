// js/index.js
import { db, DEMO_MODE, DEMO_RESTAURANTS } from './firebase-config.js';
import { collection, query, where, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let allRestaurants = [];
window._activeFilter = 'all';
window._searchText = '';

async function loadRestaurants() {
  if (DEMO_MODE) {
    allRestaurants = DEMO_RESTAURANTS;
  } else {
    try {
      const q = query(collection(db, 'restaurants'), where('active', '==', true), orderBy('name'));
      const snap = await getDocs(q);
      allRestaurants = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
      console.error(e);
      allRestaurants = DEMO_RESTAURANTS;
    }
  }
  renderRestaurants();
}

function renderRestaurants() {
  const grid = document.getElementById('restaurantsGrid');
  const countEl = document.getElementById('resultsCount');
  const tpl = document.getElementById('restaurantCardTpl');
  const filter = window._activeFilter || 'all';
  const search = (document.getElementById('searchInput')?.value || '').toLowerCase();

  let filtered = allRestaurants.filter(r => {
    const matchFilter = filter === 'all' || r.category === filter;
    const matchSearch = !search || r.name.toLowerCase().includes(search) || 
                        r.cuisine.toLowerCase().includes(search) ||
                        r.city.toLowerCase().includes(search);
    return matchFilter && matchSearch;
  });

  // City filter
  const city = (document.getElementById('cityInput')?.value || '').toLowerCase();
  if (city) {
    filtered = filtered.filter(r => r.city.toLowerCase().includes(city) || r.address.toLowerCase().includes(city));
  }

  grid.innerHTML = '';
  countEl.textContent = `${filtered.length} restaurante${filtered.length !== 1 ? 's' : ''}`;

  if (!filtered.length) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-icon">🍽</div><h3>Sin resultados</h3><p>Prueba con otros filtros o búsqueda</p></div>`;
    return;
  }

  filtered.forEach(r => {
    const clone = tpl.content.cloneNode(true);
    const card = clone.querySelector('.restaurant-card');
    const img = clone.querySelector('.card-image img');
    const badge = clone.querySelector('.card-badge');
    const cuisine = clone.querySelector('.card-cuisine');
    const ratingSpan = clone.querySelector('.card-rating span');
    const nameLink = clone.querySelector('.card-name a');
    const location = clone.querySelector('.card-location span');
    const desc = clone.querySelector('.card-description');
    const price = clone.querySelector('.card-price');
    const reserveLinks = clone.querySelectorAll('.btn-reserve, .card-image-link, .card-name a');

    img.src = r.image || 'https://images.unsplash.com/photo-1514190051997-0f6f39ca5cde?w=600&q=80';
    img.alt = r.name;
    badge.textContent = r.cuisine;
    cuisine.textContent = r.cuisine;
    ratingSpan.textContent = r.rating?.toFixed(1) || '—';
    nameLink.textContent = r.name;
    location.textContent = `${r.city} · ${r.address}`;
    desc.textContent = r.description;
    price.textContent = `${r.priceRange || '€€'} · Hasta ${r.maxPartySize || 10} personas`;

    const url = `reserva.html?id=${r.id}`;
    reserveLinks.forEach(l => l.href = url);
    clone.querySelector('.card-image-link').href = url;

    grid.appendChild(clone);
  });
}

window.renderRestaurants = renderRestaurants;

window.filterRestaurants = function() { renderRestaurants(); };

document.getElementById('searchInput')?.addEventListener('input', renderRestaurants);
document.getElementById('cityInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') renderRestaurants(); });

loadRestaurants();
