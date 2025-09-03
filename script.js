/* Juego de Cadena de Decaimiento – reglas (a–e)
   - Reparte 5 por jugador
   - Empieza con Uranio en la mesa
   - Solo se puede descartar la carta correcta del decaimiento
   - Si no tiene: Robar 1 => modal 3s => pasa turno automáticamente
   - Robar mazo completo en tu turno => modal 3s => pasa turno
   - +2 si acierta; −1 si descarta mal (va al pozo)
   - Pista con info aleatoria del siguiente elemento
*/

/* ================== Utilidades básicas ================== */
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

/* ================== Modal ================== */
function renderCardHeader(elObj) {
  if (!elObj) return "";
  return `<h3>${elObj.simbolo} — ${elObj.nombre}</h3>`;
}
function renderCardFull(elObj) {
  if (!elObj) return "<p>(sin datos)</p>";
  const lines = Object.keys(elObj).map(k => `${k}: ${elObj[k] === null ? "—" : elObj[k]}`);
  return `<pre>${lines.join("\n")}</pre>`;
}
function renderCard(elObj) {
  return `<div class="card">${renderCardHeader(elObj)}${renderCardFull(elObj)}</div>`;
}
function openModal(titulo, mensaje) {
  $("modalTitle").innerHTML = titulo;
  $("modalBody").innerHTML = mensaje;
  $("modalOverlay").classList.add("open");
}
function cerrarModal() {
  $("modalOverlay").classList.remove("open");
}

/* ================== Estado global mínimo ================== */
let gameId = null;
let playerId = null;
let playerName = null;
let elements = [];            // desde elements.json
let symbolMap = {};
let decayMap = {};            // { "U": "Th", "Th": "Pa", ... } ejemplo (cadena esperada)
let unsubscribe = null;

/* ================== Firebase ================== */
function db(){ return firebase.database(); }

/* ================== Datos (carga elements.json) ================== */
(async function cargarDatos(){
  const resp = await fetch("elements.json");
  elements = await resp.json();
  symbolMap = {};
  for (const e of elements) symbolMap[e.simbolo] = e;
})();

function findElementBySymbol(sym){ return symbolMap[sym] || null; }

/* ========== Lógica de decaimiento (cadena esperada) ==========
   NOTA: Como no podemos inferir físicamente la cadena exacta de cada isotopo a partir del JSON,
   dejamos una cadena “didáctica” predefinida que comienza en Uranio y recorre símbolos presentes.
   Si tu JSON ya trae un campo con “siguiente” o similar, reemplazá esta función para leer de ahí.
*/
function buildDecaySequenceStartingAtU() {
  // Lista base con símbolos comunes en una cadena histórica (didáctica).
  // Ajustá a tu set real; los símbolos deben existir en elements.json para que se puedan jugar.
  const candidates = ["U", "Th", "Pa", "Ac", "Ra", "Rn", "Po", "Pb", "Bi", "Tl", "Hg", "Au", "Pt", "Ir"];
  const seq = candidates.filter(s => !!findElementBySymbol(s));
  return seq.length ? seq : ["U"]; // al menos U
}

/* ================== UI de mesa / mano ================== */
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
    // Pista aleatoria con atributos realmente presentes (sin inventar)
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
}

function renderMano(mano, esMiTurno) {
  const cont = $("tablero");
  cont.innerHTML = "";
  mano.forEach((elObj, idx) => {
    const btn = document.createElement("button");
    btn.className = "card-button";
    btn.innerHTML = renderCardHeader(elObj); // estética: título arriba; detalles al abrir modal
    btn.onclick = () => jugarCartaDesdeMano(idx);
    if (!esMiTurno) btn.disabled = true;
    cont.appendChild(btn);
  });
}

/* ================== Control de turnos y botones ================== */
function setTurnStateUI(core) {
  const soyTurno = core.currentTurn === playerId;
  const requireDrawToPass = !(core.turnState && core.turnState.drew === true);
  $("turnoActual").textContent = soyTurno ? "¡Tu turno!" : `Turno de: ${core.turnName || "-"}`;

  setDisabled("btnRobar", !soyTurno);
  setDisabled("btnRobarMazo", !soyTurno);            // NUEVO (d)
  setDisabled("btnPasar", !(soyTurno && requireDrawToPass));
}

/* ================== Flujo de sala ================== */
async function crearSala() {
  playerName = ($("nombreJugador").value || "Jugador").trim();
  if (!playerName) playerName = "Jugador";
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
  playerName = ($("nombreJugador").value || "Jugador").trim();
  if (!playerName) playerName = "Jugador";
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

    // Lobby
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

    // En juego
    if (game.status === "playing") {
      show("lobby", false);
      show("game", true);

      // Marcadores
      const playersArr = Object.entries(game.players || {}).map(([pid, p]) => ({pid, ...p}));
      $("marcadores").innerHTML = playersArr.map(p => `<span class="pill">${p.name}: ${p.points ?? 0}</span>`).join(" ");

      // Mesa + pista + pozo
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
  // Construimos mazo de TODAS las cartas (tu JSON ya trae todo)
  const fullDeck = elements.map(e => e); // array de objetos elemento
  const deckShuffled = shuffle(fullDeck);

  // Repartir 5 por jugador
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

  // Mesa inicia con URANIO
  const start = findElementBySymbol("U") || deck.find(x => x.simbolo) || null;
  const decaySequence = buildDecaySequenceStartingAtU();

  updates[`games/${gameId}/status`] = "playing";
  updates[`games/${gameId}/deckRemaining`] = deck;
  updates[`games/${gameId}/discard`] = [];
  updates[`games/${gameId}/mesaActual`] = start;
  updates[`games/${gameId}/decaySequence`] = decaySequence;
  updates[`games/${gameId}/decayIndex`] = 0; // apunta al índice de la carta actual dentro de decaySequence
  updates[`games/${gameId}/currentTurn`] = pids[0] || null;
  updates[`games/${gameId}/turnState`] = { drew: false };

  await db().ref().update(updates);
}

/* ================== Turnos y acciones ================== */
async function getGameCore() {
  const s = await db().ref(`games/${gameId}`).get();
  return s.val();
}

async function setGameCore(obj) {
  await db().ref().update(obj);
}

async function advanceTurn(core) {
  // pasa al siguiente jugador, y resetea draw
  const snap = await db().ref(`games/${gameId}/players`).get();
  const players = Object.keys(snap.val() || {});
  const idx = Math.max(0, players.indexOf(core.currentTurn));
  const next = players[(idx + 1) % players.length] || null;

  await db().ref().update({
    [`games/${gameId}/currentTurn`]: next,
    [`games/${gameId}/turnState`]: { drew: false }
  });
}

window.robarCarta = async function robarCarta(){
  const core = await getGameCore();
  if (core.currentTurn !== playerId) { openModal("No es tu turno", "Esperá a que te toque."); return; }
  if (core.turnState?.drew) { openModal("Ya robaste", "Solo podés robar 1 carta por turno."); return; }

  const deck = core.deckRemaining || [];
  if (!deck.length) { openModal("Mazo vacío", "No quedan cartas para robar."); return; }

  const carta = deck[0];
  const resto = deck.slice(1);

  const myHandSnap = await db().ref(`games/${gameId}/players/${playerId}/cards`).get();
  const hand = myHandSnap.exists() ? myHandSnap.val() : [];
  const nueva = hand.concat([carta]);

  await db().ref().update({
    [`games/${gameId}/players/${playerId}/cards`]: nueva,
    [`games/${gameId}/deckRemaining`]: resto,
    [`games/${gameId}/turnState`]: { drew: true },
  });

  // Mostrar 3s y pasar turno
  openModal("Carta robada", `${renderCardHeader(carta)}${renderCardFull(carta)}`);
  setTimeout(async () => {
    cerrarModal();
    const updated = await getGameCore();
    await advanceTurn(updated);
  }, 3000);
};

window.robarMazo = async function robarMazo(){
  const core = await getGameCore();
  if (core.currentTurn !== playerId) { openModal("No es tu turno", "Esperá a que te toque."); return; }

  const deck = core.deckRemaining || [];
  if (!deck.length) { openModal("Mazo vacío", "No quedan cartas."); return; }

  const cant = deck.length;

  const myHandSnap = await db().ref(`games/${gameId}/players/${playerId}/cards`).get();
  const hand = myHandSnap.exists() ? myHandSnap.val() : [];
  const nueva = hand.concat(deck);

  await db().ref().update({
    [`games/${gameId}/players/${playerId}/cards`]: nueva,
    [`games/${gameId}/deckRemaining`]: [],
    [`games/${gameId}/turnState`]: { drew: true },
  });

  openModal("Robaste el mazo", `Te llevaste ${cant} cartas.`);
  setTimeout(async () => {
    cerrarModal();
    const updated = await getGameCore();
    await advanceTurn(updated);
  }, 3000);
};

window.pasarTurno = async function pasarTurno(){
  const core = await getGameCore();
  if (core.currentTurn !== playerId) { openModal("No es tu turno", "Esperá a que te toque."); return; }
  if (!core.turnState?.drew) { openModal("Primero robá", "Si no tenés la carta, debés robar 1 (o el mazo) antes de pasar."); return; }
  await advanceTurn(core);
};

window.jugarCartaDesdeMano = async function jugarCartaDesdeMano(indexInHand){
  const core = await getGameCore();
  if (core.currentTurn !== playerId) { openModal("No es tu turno", "Esperá a que te toque."); return; }

  const mySnap = await db().ref(`games/${gameId}/players/${playerId}`).get();
  const me = mySnap.val();
  const hand = (me && me.cards) ? me.cards.slice() : [];
  const carta = hand[indexInHand];
  if (!carta) return;

  // Comprobar si es la carta correcta de la cadena
  const seq = core.decaySequence || [];
  const idx = core.decayIndex || 0;
  const nextSym = seq[idx + 1];

  let updates = {};
  let nuevoPozo = core.discard ? core.discard.slice() : [];

  const isCorrect = (nextSym && carta.simbolo === nextSym);

  // Quitar de la mano la carta jugada
  hand.splice(indexInHand, 1);
  updates[`games/${gameId}/players/${playerId}/cards`] = hand;

  if (isCorrect) {
    // +2 puntos, avanzar mesa y decayIndex
    const points = (me.points || 0) + 2;
    updates[`games/${gameId}/players/${playerId}/points`] = points;

    updates[`games/${gameId}/mesaActual`] = carta;
    updates[`games/${gameId}/decayIndex`] = idx + 1;

    await db().ref().update(updates);
    // Turno NO avanza automáticamente al acertar (podés decidirlo). Aquí mantenemos turno para permitir cadenas rápidas,
    // pero si preferís que pase de turno, descomentá:
    // const core2 = await getGameCore(); await advanceTurn(core2);
  } else {
    // −1 punto y la carta va al pozo
    const points = (me.points || 0) - 1;
    updates[`games/${gameId}/players/${playerId}/points`] = points;

    nuevoPozo.push(carta);
    updates[`games/${gameId}/discard`] = nuevoPozo;

    await db().ref().update(updates);
    // opcional: podés forzar fin del turno tras un error:
    // const core2 = await getGameCore(); await advanceTurn(core2);
  }
};

/* ================== Helpers de inicio ================== */
window.addEventListener("load", () => {
  show("login", true);
  show("lobby", false);
  show("game", false);
});
