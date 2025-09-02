// --- utilidades ---
function codigoSala(len = 5) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function showSalaUI({ salaId, playerName }) {
  document.getElementById("salaId").textContent = salaId;
  document.getElementById("jugadorNombre").textContent = playerName;
  document.getElementById("login").style.display = "none";
  document.getElementById("sala").style.display = "block";
}

// --- estado ---
let playerId = "";
let playerName = "";
let gameId = "";

// --- Firebase Realtime Database (compat) ---
const db = () => firebase.database();

// --- cargar algunas cartas de ejemplo (render) ---
async function renderEjemploCartas() {
  try {
    const resp = await fetch("elements.json"); // existe en tu proyecto
    const data = await resp.json();
    const tablero = document.getElementById("tablero");
    tablero.innerHTML = "";

    // Render de las primeras 8 cartas como demo
    data.slice(0, 8).forEach((el) => {
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <h3>${el.simbolo} — ${el.nombre}</h3>
        <p>N° atómico: ${el.numero_atomico}</p>
        <p>Electronegatividad: ${el.electronegatividad ?? "—"}</p>
      `;
      tablero.appendChild(card);
    });
  } catch (e) {
    console.error("Error cargando elements.json", e);
  }
}

// --- acciones ---
window.crearSala = async function crearSala() {
  playerName = document.getElementById("nombreJugador").value.trim();
  if (!playerName) {
    alert("Poné tu nombre");
    return;
  }

  playerId = String(Date.now());
  gameId = codigoSala(); // código tipo ABCD2

  try {
    // Crear la sala y registrar al host
    await db().ref(`games/${gameId}`).set({
      createdAt: Date.now(),
      host: playerId
    });

    await db().ref(`games/${gameId}/players/${playerId}`).set({
      name: playerName,
      cards: []
    });

    showSalaUI({ salaId: gameId, playerName });
    alert(`Sala creada: ${gameId}\nCompartí este código para que se unan.`);
    renderEjemploCartas(); // demo visual con tus cartas
  } catch (err) {
    console.error(err);
    alert("No pude crear la sala. Revisá la consola y las reglas de tu Realtime Database.");
  }
};

window.unirseSala = async function unirseSala() {
  playerName = document.getElementById("nombreJugador").value.trim();
  if (!playerName) {
    alert("Poné tu nombre");
    return;
  }

  const codigo = prompt("Ingresá el código de sala (por ej. ABCD2):");
  if (!codigo) return;

  playerId = String(Date.now());
  gameId = codigo.trim().toUpperCase();

  try {
    // Verificar que exista la sala
    const snap = await db().ref(`games/${gameId}`).get();
    if (!snap.exists()) {
      alert("Esa sala no existe.");
      return;
    }

    // Registrar jugador
    await db().ref(`games/${gameId}/players/${playerId}`).set({
      name: playerName,
      cards: []
    });

    showSalaUI({ salaId: gameId, playerName });
    renderEjemploCartas(); // demo visual
  } catch (err) {
    console.error(err);
    alert("No pude unirme a la sala. Revisá la consola y las reglas de tu Realtime Database.");
  }
};
