// js/firebase-config.js
// ⚠️  IMPORTANTE: Reemplaza estos valores con los de tu proyecto Firebase
// Crea tu proyecto en https://console.firebase.google.com/

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// 🔧 CONFIGURA AQUÍ TU FIREBASE
const firebaseConfig = {
  apiKey: "AIzaSyBzidosSZRxKmjMIrg0zAjYRt_rbohcHLU",
  authDomain: "saas-45027.firebaseapp.com",
  projectId: "saas-45027",
  storageBucket: "saas-45027.firebasestorage.app",
  messagingSenderId: "117144809845",
  appId: "1:117144809845:web:83153cf3aa6bc97851233c"
};

// ─── Demo mode (datos de muestra cuando no hay Firebase) ───
export const DEMO_MODE = false;

const app = DEMO_MODE ? null : initializeApp(firebaseConfig);
export const db = DEMO_MODE ? null : getFirestore(app);
export const auth = DEMO_MODE ? null : getAuth(app);

if (db) {
  enableIndexedDbPersistence(db).catch(() => {});
}

// Datos de muestra para demo
export const DEMO_RESTAURANTS = [
  {
    id: "rest1",
    name: "El Rincón de Pepa",
    cuisine: "Tapas",
    category: "tapas",
    city: "Sevilla",
    address: "Calle Sierpes 42, Sevilla",
    description: "Auténtica cocina sevillana con los mejores montaditos y tapas tradicionales en el corazón de Triana.",
    phone: "+34 954 123 456",
    email: "info@rincondepepa.com",
    image: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&q=80",
    rating: 4.7,
    priceRange: "€€",
    capacity: 60,
    active: true,
    schedule: { opens: "13:00", closes: "23:00", closedDays: [1] },
    maxAdvanceDays: 30,
    minPartySize: 1,
    maxPartySize: 12
  },
  {
    id: "rest2",
    name: "La Taberna del Puerto",
    cuisine: "Mariscos",
    category: "mariscos",
    city: "Málaga",
    address: "Muelle Uno, Local 8, Málaga",
    description: "Frescos pescados y mariscos del Mediterráneo con vistas al puerto. La mejor fritura malagueña.",
    phone: "+34 952 456 789",
    email: "reservas@tabernalpuerto.es",
    image: "https://images.unsplash.com/photo-1579631542720-3a87824fff86?w=600&q=80",
    rating: 4.5,
    priceRange: "€€€",
    capacity: 80,
    active: true,
    schedule: { opens: "12:30", closes: "00:00", closedDays: [] },
    maxAdvanceDays: 21,
    minPartySize: 1,
    maxPartySize: 20
  },
  {
    id: "rest3",
    name: "Mesón Castilla",
    cuisine: "Cocina española",
    category: "cocina-española",
    city: "Madrid",
    address: "Calle Fuencarral 12, Madrid",
    description: "Cocina castellana de toda la vida. Cocidos, asados y estofados en un ambiente de taberna clásica.",
    phone: "+34 913 789 012",
    email: "hola@mesoncastilla.com",
    image: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=600&q=80",
    rating: 4.3,
    priceRange: "€€",
    capacity: 45,
    active: true,
    schedule: { opens: "13:30", closes: "22:30", closedDays: [1] },
    maxAdvanceDays: 14,
    minPartySize: 2,
    maxPartySize: 8
  },
  {
    id: "rest4",
    name: "Nikkei 225",
    cuisine: "Fusión",
    category: "fusion",
    city: "Barcelona",
    address: "Carrer del Consell de Cent 220, Barcelona",
    description: "Fusión japano-peruana con niguiris de autor, ceviches y tiraditos que fusionan dos culturas milenarias.",
    phone: "+34 932 100 200",
    email: "reservas@nikkei225.es",
    image: "https://images.unsplash.com/photo-1563245372-f21724e3856d?w=600&q=80",
    rating: 4.8,
    priceRange: "€€€€",
    capacity: 40,
    active: true,
    schedule: { opens: "14:00", closes: "23:30", closedDays: [0, 1] },
    maxAdvanceDays: 45,
    minPartySize: 1,
    maxPartySize: 6
  },
  {
    id: "rest5",
    name: "La Brasa del Sur",
    cuisine: "Carnes",
    category: "carnes",
    city: "Córdoba",
    address: "Av. Medina Azahara 34, Córdoba",
    description: "Las mejores carnes a la brasa de Andalucía. Novillos de campo, chuletones y secreto ibérico.",
    phone: "+34 957 333 444",
    email: "info@labrasadelsur.es",
    image: "https://images.unsplash.com/photo-1544025162-d76594e948c7?w=600&q=80",
    rating: 4.6,
    priceRange: "€€€",
    capacity: 70,
    active: true,
    schedule: { opens: "13:00", closes: "23:00", closedDays: [1] },
    maxAdvanceDays: 30,
    minPartySize: 1,
    maxPartySize: 15
  },
  {
    id: "rest6",
    name: "Verde & Fresco",
    cuisine: "Vegetariano",
    category: "vegetariano",
    city: "Valencia",
    address: "Calle de la Paz 18, Valencia",
    description: "Restaurante vegetariano y vegano de temporada. Productos locales, recetas creativas y sabores del mundo.",
    phone: "+34 961 555 666",
    email: "hola@verdefresco.com",
    image: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600&q=80",
    rating: 4.4,
    priceRange: "€€",
    capacity: 35,
    active: true,
    schedule: { opens: "12:00", closes: "22:00", closedDays: [1] },
    maxAdvanceDays: 21,
    minPartySize: 1,
    maxPartySize: 10
  }
];
