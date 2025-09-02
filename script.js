/**********************
 * Utilidades
 **********************/
function codigoSala(len = 5) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function showSalaUI({ salaId, playerName }) {
  document.getElementById("salaId").textContent = salaId;
  document.getElementById("jugadorNombre").textContent = playerName;
  document.getElementById("login").style.display = "none";
  document.getElementById("sala").style.display = "block";
}

/**********************
 * Estado
 **********************/
let playerId = "";
let playerName = "";
let gameId = "";
let isHost = false;
let unsubscribePlayers = null;

/**********************
 * Firebase
 **********************/
const db = () => firebase.database();

/**********************
 * Lobby UI
 **********************/
function renderLobby(playersMap, hostId, state) {
  const ul = document.getElementById("listaJugadores");
  const countEl = document.getElementById("cantJugadores");
  const btnIniciar = document.getElementById("btnIniciar");
  const estadoLobby = document.getElementById("estadoLobby");

  ul.innerHTML = "";
  const ids = Object.keys(playersMap || {});
  ids.forEach((pid) => {
    const li = document.createElement("li");
    const you = pid === playerId ? " (vos)" : "";
    const crown = pid === hostId ? " 👑" : "";
    li.textContent = `${playersMap[pid].name}${you}${crown}`;
    ul.appendChild(li);
  });
  countEl.textContent = ids.length;

  // Estado
  if (state === "started") {
    btnIniciar.disabled = true;
    estadoLobby.textContent = "Partida iniciada.";
    return;
  }

  // Habilitar/Deshabilitar "Iniciar"
  const canStart = ids.length >= 2; // mínimo 2
  btnIniciar.disabled = !(isHost && canStart);

  if (ids.length < 2) {
    estadoLobby.textContent = "Esperando más jugadores (mínimo 2, máximo 4)...";
  } else if (ids.length < 4) {
    estadoLobby.textContent = "Podés iniciar cuando quieras (o esperar al 4.º para auto-iniciar).";
  } else {
    estadoLobby.textContent = "Se alcanzó el máximo (4). Iniciando...";
  }
}

/**********************
 * Carga y render de cartas (una vez iniciada la partida)
 **********************/
async function renderTableroDesdeDB() {
  const tablero = document.getElementById("tablero");
  tablero.innerHTML = "";

  // Traemos nuestras cartas guardadas en DB (las del jugador actual)
  const snap = await db().ref(`games/${gameId}/players/${playerId}/cards`).get();
  const misCartas = snap.exists() ? snap.val() : [];

  if (!misCartas.length) {
    tablero.innerHTML = "<p>Aún no recibiste cartas...</p>";
    return;
  }

  misCartas.forEach((el) => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <h3>${el.simbolo} — ${el.nombre}</h3>
      <p>N° atómico: ${el.numero_atomico}</p>
      <p>Electronegatividad: ${el.electronegatividad ?? "—"}</p>
    `;
    tablero.appendChild(card);
  });
}

/**********************
 * Crear / Unirse
 **********************/
window.crearSala = async function crearSala() {
  playerName = document.getElementById("nombreJugador").value.trim();
  if (!playerName) return alert("Poné tu nombre");

  playerId = String(Date.now());
  gameId = codigoSala();
  isHost = true;

  try {
    // Crear sala
    await db().ref(`games/${gameId}`).set({
      createdAt: Date.now(),
      host: playerId,
      state: "lobby",
      maxPlayers: 4,
      minPlayers: 2
    });

    // Registrar host como jugador
    await db().ref(`games/${gameId}/players/${playerId}`).set({
      name: playerName,
      cards: []
    });

    showSalaUI({ salaId: gameId, playerName });
    alert(`Sala creada: ${gameId}. Compartí este código para que se unan.`);

    // Escuchar jugadores
    suscribirLobby();
  } catch (err) {
    console.error(err);
    alert("No pude crear la sala. Revisá las reglas de tu Realtime Database.");
  }
};

window.unirseSala = async function unirseSala() {
  playerName = document.getElementById("nombreJugador").value.trim();
  if (!playerName) return alert("Poné tu nombre");

  const codigo = prompt("Ingresá el código de sala (por ej. ABCD2):");
  if (!codigo) return;

  playerId = String(Date.now());
  gameId = codigo.trim().toUpperCase();
  isHost = false;

  try {
    const gameSnap = await db().ref(`games/${gameId}`).get();
    if (!gameSnap.exists()) return alert("Esa sala no existe.");

    const game = gameSnap.val();
    if (game.state === "started") return alert("La partida ya empezó.");

    const playersSnap = await db().ref(`games/${gameId}/players`).get();
    const cant = playersSnap.exists() ? Object.keys(playersSnap.val()).length : 0;
    if (cant >= 4) return alert("La sala está llena (máximo 4).");

    await db().ref(`games/${gameId}/players/${playerId}`).set({
      name: playerName,
      cards: []
    });

    showSalaUI({ salaId: gameId, playerName });
    suscribirLobby();
  } catch (err) {
    console.error(err);
    alert("No pude unirme a la sala.");
  }
};

/**********************
 * Suscripción al lobby (jugadores/state)
 **********************/
function suscribirLobby() {
  // Limpiar suscripción previa si hubiera
  if (unsubscribePlayers) {
    unsubscribePlayers();
    unsubscribePlayers = null;
  }

  const playersRef = db().ref(`games/${gameId}/players`);
  const hostRef = db().ref(`games/${gameId}/host`);
  const stateRef = db().ref(`games/${gameId}/state`);

  let currentPlayers = {};
  let hostId = "";
  let state = "lobby";

  const rerender = () => renderLobby(currentPlayers, hostId, state);

  // Players
  const onValuePlayers = playersRef.on("value", async (snap) => {
    currentPlayers = snap.exists() ? snap.val() : {};
    rerender();

    // Auto-inicio si llega el 4.º
    const cant = Object.keys(currentPlayers).length;
    if (isHost && state === "lobby" && cant === 4) {
      await iniciarPartidaInterno();
    }
  });

  // Host
  const onValueHost = hostRef.on("value", (snap) => {
    hostId = snap.val() || "";
    rerender();
  });

  // State
  const onValueState = stateRef.on("value", async (snap) => {
    state = snap.val() || "lobby";
    rerender();

    if (state === "started") {
      // Mostrar mis cartas
      renderTableroDesdeDB();
      // Ocultar controles del lobby
      document.getElementById("lobby").style.display = "none";
    }
  });

  unsubscribePlayers = () => {
    playersRef.off("value", onValuePlayers);
    hostRef.off("value", onValueHost);
    stateRef.off("value", onValueState);
  };
}

/**********************
 * Inicio de partida (host)
 **********************/
async function armarMazo() {
  // Cargar elementos desde el JSON del proyecto
  const resp = await fetch("elements.json");
  const data = await resp.json(); // lista de elementos (cartas)
  // Podrías filtrar o transformar si querés menos/más cartas
  return shuffle(data);
}

async function repartirCartas(mazo, players, cartasPorJugador = 5) {
  const playerIds = Object.keys(players);
  const updates = {};

  let idx = 0;
  for (const pid of playerIds) {
    const hand = [];
    for (let i = 0; i < cartasPorJugador; i++) {
      if (idx >= mazo.length) break;
      hand.push(mazo[idx++]);
    }
    updates[`games/${gameId}/players/${pid}/cards`] = hand;
  }

  // Guardar resto del mazo como “deckRemaining” por si más adelante querés robar
  updates[`games/${gameId}/deckRemaining`] = mazo.slice(idx);
  return db().ref().update(updates);
}

async function iniciarPartidaInterno() {
  // Validaciones
  const gameSnap = await db().ref(`games/${gameId}`).get();
  if (!gameSnap.exists()) return;

  const game = gameSnap.val();
  if (game.state !== "lobby") return;

  const playersSnap = await db().ref(`games/${gameId}/players`).get();
  const players = playersSnap.exists() ? playersSnap.val() : {};
  const cant = Object.keys(players).length;

  if (cant < 2) {
    alert("Se necesitan al menos 2 jugadores.");
    return;
  }

  // Armar mazo y repartir
  const mazo = await armarMazo();
  await repartirCartas(mazo, players, 5);

  // Cambiar estado a started
  await db().ref(`games/${gameId}/state`).set("started");
}

window.iniciarPartida = async function iniciarPartida() {
  if (!isHost) return alert("Solo el host puede iniciar la partida.");
  try {
    await iniciarPartidaInterno();
  } catch (err) {
    console.error(err);
    alert("No pude iniciar la partida.");
  }
};
