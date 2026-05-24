// js/index.js
import { db } from './firebase-config.js';
import { collection, query, where, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let allRestaurants = [];
window._activeFilter = 'all';

async function loadRestaurants() {
  const grid = document.getElementById('restaurantsGrid');
  try {
    const q = query(collection(db, 'restaurants'), where('active', '==', true), orderBy('name'));
    const snap = await getDocs(q);
    allRestaurants = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error('Error cargando restaurantes:', e);
    grid.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><h3>Error de conexión</h3><p>No se pudieron cargar los restaurantes. Comprueba tu configuración de Firebase.</p></div>`;
    return;
  }
  renderRestaurants();
}

function renderRestaurants() {
  const grid = document.getElementById('restaurantsGrid');
  const countEl = document.getElementById('resultsCount');
  const tpl = document.getElementById('restaurantCardTpl');
  const filter = window._activeFilter || 'all';
  const search = (document.getElementById('searchInput')?.value || '').toLowerCase();
  const city = (document.getElementById('cityInput')?.value || '').toLowerCase();

  let filtered = allRestaurants.filter(r => {
    const matchFilter = filter === 'all' || r.category === filter;
    const matchSearch = !search || r.name.toLowerCase().includes(search) ||
                        r.cuisine.toLowerCase().includes(search) ||
                        r.city.toLowerCase().includes(search);
    const matchCity = !city || r.city.toLowerCase().includes(city) || r.address.toLowerCase().includes(city);
    return matchFilter && matchSearch && matchCity;
  });

  grid.innerHTML = '';
  countEl.textContent = `${filtered.length} restaurante${filtered.length !== 1 ? 's' : ''}`;

  if (!filtered.length) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-icon">🍽</div><h3>Sin resultados</h3><p>Prueba con otros filtros o búsqueda</p></div>`;
    return;
  }

  filtered.forEach(r => {
    const clone = tpl.content.cloneNode(true);
    clone.querySelector('.card-image img').src = r.image || 'https://images.unsplash.com/photo-1514190051997-0f6f39ca5cde?w=600&q=80';
    clone.querySelector('.card-image img').alt = r.name;
    clone.querySelector('.card-badge').textContent = r.cuisine;
    clone.querySelector('.card-cuisine').textContent = r.cuisine;
    clone.querySelector('.card-rating span').textContent = r.rating?.toFixed(1) || '—';
    clone.querySelector('.card-name a').textContent = r.name;
    clone.querySelector('.card-location span').textContent = `${r.city} · ${r.address}`;
    clone.querySelector('.card-description').textContent = r.description;
    clone.querySelector('.card-price').textContent = `${r.priceRange || '€€'} · Hasta ${r.maxPartySize || 10} personas`;

    const url = `reserva.html?id=${r.id}`;
    clone.querySelectorAll('.btn-reserve, .card-image-link, .card-name a').forEach(l => l.href = url);
    clone.querySelector('.card-image-link').href = url;

    grid.appendChild(clone);
  });
}

window.renderRestaurants = renderRestaurants;
window.filterRestaurants = () => renderRestaurants();

document.getElementById('searchInput')?.addEventListener('input', renderRestaurants);
document.getElementById('cityInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') renderRestaurants(); });

loadRestaurants();
