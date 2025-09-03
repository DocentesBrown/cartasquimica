/* Juego de Cadena de Decaimiento – ajustes:
   - Modal de "TOMAR UNA CARTA" garantizado (display:flex + z-index) y carta añadida a la mano antes de mostrar.
   - Cadena mostrada SIN anticipar el siguiente (solo lo jugado).
   - Estética: se mantiene la estructura; overrides en HTML (<style>) para paleta Docentes Brown.
   - Reglas: +2 acierto; −1 error (al pozo). "Pasar" solo si ya actuó.
*/

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
function $(id){ return document.getElementById(id); }
function show(id, v) { const el = $(id); if (el) el.style.display = v ? "block" : "none"; }
function setDisabled(id, v) { const el = $(id); if (el) el.disabled = v; }

/* ================== Modal robusto ================== */
function renderCardHeader(elObj) { return elObj ? `<h3>${elObj.simbolo} — ${elObj.nombre}</h3>` : ""; }
function renderCardFull(elObj) {
  if (!elObj) return "<p>(sin datos)</p>";
  const lines = Object.keys(elObj).map(k => `${k}: ${elObj[k] === null ? "—" : elObj[k]}`);
  return `<pre>${lines.join("\n")}</pre>`;
}
function renderCard(elObj) { return `<div class="card">${renderCardHeader(elObj)}${renderCardFull(elObj)}</div>`; }

function openModal(titulo, mensaje) {
  const overlay = $("modalOverlay");
  $("modalTitle").innerHTML = titulo;
  $("modalBody").innerHTML = mensaje;
  // Forzamos visibilidad independientemente del CSS previo
  overlay.classList.add("open");
  overlay.style.display = "flex";
  overlay.style.zIndex = "9999";
}
function cerrarModal() {
  const overlay = $("modalOverlay");
  overlay.classList.remove("open");
  overlay.style.display = "none";
}

/* ================== Estado global ================== */
let gameId = null;
let playerId = null;
let playerName = null;
let elements = [];
let symbolMap = {};
let unsubscribe = null;

function db(){ return firebase.database(); }

/* ================== Cargar elementos ================== */
(async function cargarDatos(){
  const resp = await fetch("elements.json");
  elements = await resp.json();
  symbolMap = {};
  for (const e of elements) symbolMap[e.simbolo] = e;
})();
function findElementBySymbol(sym){ return symbolMap[sym] || null; }

/* ========== Secuencia de decaimiento didáctica ========== */
function buildDecaySequenceStartingAtU() {
  const candidates = ["U", "Th", "Pa", "Ac", "Ra", "Rn", "Po", "Pb", "Bi", "Tl", "Hg", "Au", "Pt", "Ir"];
  const seq = candidates.filter(s => !!findElementBySymbol(s));
  return seq.length ? seq : ["U"];
}

/* ================== UI: mesa, pista, pozo, cadena ================== */
function updateCadenaUI(game) {
  const box = $("cadenaDecaimiento");
  if (!box) return;

  const seq = game.decaySequence || [];
  const idx = game.decayIndex || 0;

  // Solo lo JUGADO (incluye la carta actual en mesa). No mostramos el siguiente.
  const jugados = seq.slice(0, Math.min(idx + 1, seq.length))
    .map(sym => (findElementBySymbol(sym)?.nombre) || sym);

  const html = jugados.length ? jugados.join(" &rarr; ") : "(sin cadena)";
  box.innerHTML = html;
}

function updateMesaUI(game) {
  const cartaDiv = $("cartaActual");
  const pista = $("pistaSiguiente");

  const current = game.mesaActual || null;
  cartaDiv.innerHTML = current ? renderCard(current) : "<p>(sin carta actual)</p>";

  const seq = game.decaySequence || [];
  const idx = game.decayIndex || 0;
  const nextSym = seq[idx + 1];

  if (nextSym) {
    const nextObj = findElementBySymbol(nextSym);
    const candidates = [
      ["Electronegatividad", "electronegatividad", v => `≈ ${v}`],
      ["Número atómico", "numero_atomico", v => `= ${v}`],
      ["Número másico", "numero_masico", v => `≈ ${v}`],
      ["Electrones", "electrones", v => `= ${v}`],
      ["Neutrones", "neutrones", v => `≈ ${v}`],
      ["Protones", "protones", v => `= ${v}`],
      ["Radio atómico", "radio_atomico_pm", v => `≈ ${v} pm`],
      ["Isótopos conocidos", "isotopos", v => `≈ ${v}`],
    ].filter(([_, key]) => nextObj && nextObj[key] != null);

    if (candidates.length) {
      const [label, key, fmt] = candidates[Math.floor(Math.random() * candidates.length)];
      pista.textContent = `Pista: ${label} ${fmt(nextObj[key])}`;
    } else {
      pista.textContent = "Pista: característica no disponible";
    }
  } else {
    pista.textContent = "Fin de la cadena.";
  }

  // Pozo (tope)
  const top = game.discard?.length ? game.discard[game.discard.length - 1] : null;
  $("topDiscard").innerHTML = top ? renderCard(top) : "<div class='card'>(vacío)</div>";

  // Cadena (solo jugados)
  updateCadenaUI(game);
}

function renderMano(mano, esMiTurno) {
  const cont = $("tablero");
  cont.innerHTML = "";
  mano.forEach((elObj, idx) => {
    const wrapper = document.createElement("div");
    wrapper.className = "card mt";
    wrapper.innerHTML = renderCardHeader(elObj) + renderCardFull(elObj);
    wrapper.onclick = () => { if (esMiTurno) jugarCartaDesdeMano(idx); };
    if (!esMiTurno) wrapper.style.opacity = "0.9";
    cont.appendChild(wrapper);
  });
}

/* ================== Control de turnos y botones ================== */
function setTurnStateUI(core) {
  const soyTurno = core.currentTurn === playerId;
  const acted = !!(core.turnState && core.turnState.acted === true);
  $("turnoActual").textContent = soyTurno ? "¡Tu turno!" : `Turno de: ${core.turnName || "-"}`;

  setDisabled("btnRobarPozo", !soyTurno);
  setDisabled("btnTomarUna", !soyTurno);
  setDisabled("btnPasar", !(soyTurno && acted));
}

/* ================== Flujo de sala ================== */
async function crearSala() {
  playerName = ($("nombreJugador").value || "Jugador").trim() || "Jugador";
  playerId = "P_" + Math.random().toString(36).slice(2, 9);
  const code = codigoSala();
  gameId = code;

  const base = db().ref(`games/${gameId}`);
  await base.set({
    createdAt: Date.now(),
    code: gameId,
    players: {
      [playerId]: { name: playerName, points: 0, cards: [] }
    },
    status: "lobby",
    owner: playerId
  });

  $("codigoSala").textContent = gameId;
  show("login", false);
  show("lobby", true);
  suscribirSala();
}

async function unirseSala() {
  playerName = ($("nombreJugador").value || "Jugador").trim() || "Jugador";
  playerId = "P_" + Math.random().toString(36).slice(2, 9);

  const code = prompt("Ingresá el código de sala:").trim().toUpperCase();
  if (!code) return;
  gameId = code;

  const base = db().ref(`games/${gameId}`);
  const snap = await base.get();
  if (!snap.exists()) { alert("La sala no existe."); return; }

  await db().ref(`games/${gameId}/players/${playerId}`).set({
    name: playerName, points: 0, cards: []
  });

  $("codigoSala").textContent = gameId;
  show("login", false);
  show("lobby", true);
  suscribirSala();
}

function suscribirSala() {
  if (unsubscribe) unsubscribe();
  const ref = db().ref(`games/${gameId}`);
  ref.on("value", (s) => {
    const game = s.val();
    if (!game) return;

    if (game.status === "lobby") {
      show("lobby", true);
      show("game", false);
      const lista = $("listaJugadores");
      lista.innerHTML = "<h3>Jugadores:</h3>";
      const ul = document.createElement("ul");
      Object.entries(game.players || {}).forEach(([pid, p]) => {
        const li = document.createElement("li");
        li.textContent = `${p.name}`;
        ul.appendChild(li);
      });
      lista.appendChild(ul);
      $("btnIniciar").style.display = game.owner === playerId ? "inline-block" : "none";
      return;
    }

    if (game.status === "playing") {
      show("lobby", false);
      show("game", true);

      // Marcadores
      const playersArr = Object.entries(game.players || {}).map(([pid, p]) => ({pid, ...p}));
      $("marcadores").innerHTML = playersArr.map(p => `<span class="pill">${p.name}: ${p.points ?? 0}</span>`).join(" ");

      // Mesa + pista + pozo + cadena
      updateMesaUI(game);

      // Mano propia
      const my = game.players?.[playerId] || { cards: [] };
      const isMyTurn = game.currentTurn === playerId;
      renderMano(my.cards || [], isMyTurn);

      // Botones
      setTurnStateUI({
        currentTurn: game.currentTurn,
        currentName: playersArr.find(p => p.pid === game.currentTurn)?.name,
        turnState: game.turnState,
        turnName: playersArr.find(p => p.pid === game.currentTurn)?.name
      });
    }
  });
  unsubscribe = () => ref.off();
}

async function iniciarPartida() {
  const fullDeck = elements.map(e => e);
  const deckShuffled = shuffle(fullDeck);

  const snap = await db().ref(`games/${gameId}/players`).get();
  const players = snap.val() || {};
  const pids = Object.keys(players);

  const updates = {};
  let deck = deckShuffled.slice();
  for (const pid of pids) {
    const mano = deck.slice(0, 5);
    deck = deck.slice(5);
    updates[`games/${gameId}/players/${pid}/cards`] = mano;
    updates[`games/${gameId}/players/${pid}/points`] = 0;
  }

  const start = findElementBySymbol("U") || deck.find(x => x.simbolo) || null;
  const decaySequence = buildDecaySequenceStartingAtU();

  updates[`games/${gameId}/status`] = "playing";
  updates[`games/${gameId}/deckRemaining`] = deck;
  updates[`games/${gameId}/discard`] = [];
  updates[`games/${gameId}/mesaActual`] = start;
  updates[`games/${gameId}/decaySequence`] = decaySequence;
  updates[`games/${gameId}/decayIndex`] = 0;
  updates[`games/${gameId}/currentTurn`] = pids[0] || null;
  updates[`games/${gameId}/turnState`] = { acted: false };

  await db().ref().update(updates);
}

/* ================== Turnos y acciones ================== */
async function getGameCore() {
  const s = await db().ref(`games/${gameId}`).get();
  return s.val();
}

async function advanceTurn(core) {
  const snap = await db().ref(`games/${gameId}/players`).get();
  const players = Object.keys(snap.val() || {});
  const idx = Math.max(0, players.indexOf(core.currentTurn));
  const next = players[(idx + 1) % players.length] || null;

  await db().ref().update({
    [`games/${gameId}/currentTurn`]: next,
    [`games/${gameId}/turnState`]: { acted: false }
  });
}

/* === Acciones === */

// TOMAR UNA CARTA (del mazo): añade a la mano, muestra modal 3s y pasa
window.tomarUnaCarta = async function tomarUnaCarta(){
  const core = await getGameCore();
  if (core.currentTurn !== playerId) { openModal("No es tu turno", "Esperá a que te toque."); return; }

  const deck = core.deckRemaining || [];
  if (!deck.length) { openModal("Mazo vacío", "No quedan cartas para robar."); return; }

  const carta = deck[0];
  const resto = deck.slice(1);

  // 1) Añadir PRIMERO a la mano en BD
  const myHandSnap = await db().ref(`games/${gameId}/players/${playerId}/cards`).get();
  const hand = myHandSnap.exists() ? myHandSnap.val() : [];
  const nueva = hand.concat([carta]);

  await db().ref().update({
    [`games/${gameId}/players/${playerId}/cards`]: nueva,
    [`games/${gameId}/deckRemaining`]: resto,
    [`games/${gameId}/turnState`]: { acted: true }
  });

  // 2) Mostrar modal 3s (garantizado) con la carta tomada
  openModal("Tomaste una carta", `${renderCardHeader(carta)}${renderCardFull(carta)}`);
  setTimeout(async () => {
    cerrarModal();
    const updated = await getGameCore();
    await advanceTurn(updated);
  }, 3000);
};

// ROBAR POZO (todo el descarte): modal 3s y pasa el turno
window.robarPozo = async function robarPozo(){
  const core = await getGameCore();
  if (core.currentTurn !== playerId) { openModal("No es tu turno", "Esperá a que te toque."); return; }

  const pozo = core.discard || [];
  if (!pozo.length) { openModal("Pozo vacío", "No hay cartas en el pozo."); return; }

  const myHandSnap = await db().ref(`games/${gameId}/players/${playerId}/cards`).get();
  const hand = myHandSnap.exists() ? myHandSnap.val() : [];
  const nueva = hand.concat(pozo);

  await db().ref().update({
    [`games/${gameId}/players/${playerId}/cards`]: nueva,
    [`games/${gameId}/discard`]: [],
    [`games/${gameId}/turnState`]: { acted: true }
  });

  openModal("Robaste el pozo", `Te llevaste ${pozo.length} cartas del descarte.`);
  setTimeout(async () => {
    cerrarModal();
    const updated = await getGameCore();
    await advanceTurn(updated);
  }, 3000);
};

window.pasarTurno = async function pasarTurno(){
  const core = await getGameCore();
  if (core.currentTurn !== playerId) { openModal("No es tu turno", "Esperá a que te toque."); return; }
  if (!core.turnState?.acted) { openModal("Acción requerida", "Debés jugar una carta o robar (pozo o mazo) antes de pasar."); return; }
  await advanceTurn(core);
};

// Jugar carta desde la mano (+2 si correcta; −1 y al pozo si no)
window.jugarCartaDesdeMano = async function jugarCartaDesdeMano(indexInHand){
  const core = await getGameCore();
  if (core.currentTurn !== playerId) { openModal("No es tu turno", "Esperá a que te toque."); return; }

  const mySnap = await db().ref(`games/${gameId}/players/${playerId}`).get();
  const me = mySnap.val();
  const hand = (me && me.cards) ? me.cards.slice() : [];
  const carta = hand[indexInHand];
  if (!carta) return;

  const seq = core.decaySequence || [];
  const idx = core.decayIndex || 0;
  const nextSym = seq[idx + 1];

  let updates = {};
  let nuevoPozo = core.discard ? core.discard.slice() : [];

  const isCorrect = (nextSym && carta.simbolo === nextSym);

  // quitar de la mano
  hand.splice(indexInHand, 1);
  updates[`games/${gameId}/players/${playerId}/cards`] = hand;

  if (isCorrect) {
    const points = (me.points || 0) + 2;
    updates[`games/${gameId}/players/${playerId}/points`] = points;
    updates[`games/${gameId}/mesaActual`] = carta;
    updates[`games/${gameId}/decayIndex`] = idx + 1;
    updates[`games/${gameId}/turnState`] = { acted: true };
    await db().ref().update(updates);
  } else {
    const points = (me.points || 0) - 1;
    updates[`games/${gameId}/players/${playerId}/points`] = points;
    nuevoPozo.push(carta);
    updates[`games/${gameId}/discard`] = nuevoPozo;
    updates[`games/${gameId}/turnState`] = { acted: true };
    await db().ref().update(updates);
  }
};

/* ================== Inicio ================== */
window.addEventListener("load", () => {
  show("login", true);
  show("lobby", false);
  show("game", false);
});
