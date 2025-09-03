/* Juego de Cadena de Decaimiento – turnos, puntaje, robar/pasar, modal, carta completa */

// ------------------ Utilidades ------------------
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
function setDisabled(id, v) { const el = document.getElementById(id); if (el) el.disabled = v; }
function show(id, v) { const el = document.getElementById(id); if (el) el.style.display = v ? "block" : "none"; }

function renderCardFull(elObj) {
  if (!elObj) return "<p>(sin datos)</p>";
  const lines = Object.keys(elObj).map(k => `${k}: ${elObj[k] === null ? "—" : elObj[k]}`);
  return `<pre>${lines.join("\n")}</pre>`;
}
function renderCardHeader(elObj) {
  if (!elObj) return "";
  return `<h3>${elObj.simbolo} — ${elObj.nombre}</h3>`;
}
function renderCard(elObj) {
  return `<div class="card">${renderCardHeader(elObj)}${renderCardFull(elObj)}</div>`;
}
function openModal(titulo, mensaje) {
  document.getElementById("modalTitulo").textContent = titulo;
  document.getElementById("modalMensaje").innerHTML = mensaje;
  document.getElementById("modalOverlay").style.display = "flex";
}
window.cerrarModal = function cerrarModal() {
  document.getElementById("modalOverlay").style.display = "none";
};

// ------------------ Estado ------------------
let playerId = "";
let playerName = "";
let gameId = "";
let isHost = false;
let unsubscribePlayers = null;
let unsubscribeGame = null;
let localElementsCache = [];

// Firebase
const db = () => firebase.database();

// ------------------ Cadena de Decaimiento (por elementos) ------------------
const DECAY_SEQUENCE = ["U", "Th", "Pa", "U", "Th", "Ra", "Rn", "Po", "Pb", "Bi", "Po", "Pb", "Bi", "Po", "Pb"];

// ------------------ UI helpers ------------------
function updateScoresUI(scores = {}, players = {}) {
  const marc = document.getElementById("marcadores");
  const ids = Object.keys(players || {});
  const rows = ids.map(id => {
    const s = (scores && (id in scores)) ? scores[id] : 0;
    const me = id === playerId ? " (vos)" : "";
    const name = players[id]?.name || id;
    return `${name}${me}: ${s} pts`;
  });
  marc.textContent = rows.length ? "Puntajes — " + rows.join(" · ") : "";
}
function updateMesaUI(game) {
  const cartaDiv = document.getElementById("cartaActual");
  const pista = document.getElementById("pistaSiguiente");

  const current = game.mesaActual || null;
  cartaDiv.innerHTML = current ? renderCard(current) : "<p>(sin carta actual)</p>";

  const seq = game.decaySequence || [];
  const idx = game.decayIndex || 0;
  const nextSim = seq[idx + 1];
  if (nextSim) {
    const nextObj = findElementBySymbol(nextSim);
    if (!nextObj) return;

    const opciones = [];
    if (nextObj.electronegatividad != null) opciones.push(`Electronegatividad ≈ ${nextObj.electronegatividad}`);
    if (nextObj.numero_atomico != null) opciones.push(`Número atómico = ${nextObj.numero_atomico}`);
    if (nextObj.numero_masico != null) opciones.push(`Número másico ≈ ${nextObj.numero_masico}`);
    if (nextObj.electrones != null) opciones.push(`Electrones = ${nextObj.electrones}`);
    if (nextObj.neutrones != null) opciones.push(`Neutrones ≈ ${nextObj.neutrones}`);
    if (nextObj.protones != null) opciones.push(`Protones = ${nextObj.protones}`);
    if (nextObj.radio_atomico_pm != null) opciones.push(`Radio atómico ≈ ${nextObj.radio_atomico_pm} pm`);
    if (nextObj.isotopos != null) opciones.push(`Isótopos conocidos ≈ ${nextObj.isotopos}`);

    if (opciones.length) {
      const hint = opciones[Math.floor(Math.random() * opciones.length)];
      pista.textContent = `Pista: ${hint}`;
    } else {
      pista.textContent = "Pista: característica no disponible";
    }
  } else {
    pista.textContent = "Fin de la cadena.";
  }
}
function setTurnStateUI(soyTurno, requireDrawToPass, players, currentId) {
  const el = document.getElementById("estadoTurno");
  if (!currentId) {
    el.textContent = "Esperando…";
  } else if (soyTurno) {
    el.textContent = "¡Es tu turno! Jugá la siguiente carta correcta. Si no la tenés, robá 1 y luego podés pasar o robar el pozo.";
  } else {
    const name = (players && players[currentId] && players[currentId].name) ? players[currentId].name : "otro jugador";
    el.textContent = `Turno de ${name}…`;
  }
  setDisabled("btnRobar", !soyTurno);
  setDisabled("btnPasar", !(soyTurno && requireDrawToPass));
}

// ------------------ Carga y búsqueda de elementos ------------------
async function loadElements() {
  if (localElementsCache.length) return localElementsCache;
  const resp = await fetch("elements.json");
  const arr = await resp.json();
  localElementsCache = arr;
  return localElementsCache;
}
function findElementBySymbol(sym) {
  return localElementsCache.find(x => x.simbolo === sym) || null;
}

// ------------------ Render mano + pozo ------------------
async function renderTableroDesdeDB() {
  const tablero = document.getElementById("tablero");
  tablero.innerHTML = "";

  const handSnap = await db().ref(`games/${gameId}/players/${playerId}/cards`).get();
  const misCartas = handSnap.exists() ? handSnap.val() : [];
  if (!misCartas.length) {
    tablero.innerHTML = "<p>No tenés cartas en mano.</p>";
  } else {
    misCartas.forEach((el, idx) => {
      const card = document.createElement("div");
      card.className = "card";
      card.style.cursor = "pointer";
      card.title = "Click para jugar si es tu turno";
      card.innerHTML = `${renderCardHeader(el)}${renderCardFull(el)}`;
      card.addEventListener("click", () => jugarCartaDesdeMano(idx));
      tablero.appendChild(card);
    });
  }

  const topEl = document.getElementById("topDiscard");
  const pileSnap = await db().ref(`games/${gameId}/discardPile`).get();
  const pile = pileSnap.exists() ? pileSnap.val() : [];
  if (pile.length) {
    const top = pile[pile.length - 1];
    topEl.style.display = "inline-block";
    topEl.innerHTML = `${renderCardHeader(top)}${renderCardFull(top)}`;
    topEl.onclick = () => robarPozo();
  } else {
    topEl.style.display = "inline-block";
    topEl.innerHTML = `<p>(vacío)</p>`;
    topEl.onclick = null;
  }
}

// ------------------ Jugar carta desde mano ------------------
async function jugarCartaDesdeMano(indexEnMano){
  const core = await getGameCore();
  if (core.currentTurn !== playerId) { openModal("No es tu turno", "Esperá a que te toque para jugar una carta."); return; }

  const myHandSnap=await db().ref(`games/${gameId}/players/${playerId}/cards`).get();
  const hand=myHandSnap.exists()?myHandSnap.val():[];
  if (indexEnMano<0 || indexEnMano>=hand.length) return;

  const carta = hand[indexEnMano];
  const nuevaMano = hand.filter((_,i)=>i!==indexEnMano);

  const seq = core.decaySequence;
  const idx = core.decayIndex;
  const expectedSym = seq[idx+1];
  let correct = false;
  if (expectedSym) { correct = (carta.simbolo === expectedSym); }
  else { openModal("Cadena completa", "Ya se alcanzó el final de la cadena."); return; }

  const pileSnap = await db().ref(`games/${gameId}/discardPile`).get();
  const pile = pileSnap.exists()?pileSnap.val():[];

  const updates = {};
  updates[`games/${gameId}/players/${playerId}/cards`] = nuevaMano;

  const scores = core.scores || {};
  const curScore = scores[playerId] || 0;
  if (correct) {
    scores[playerId] = curScore + 2;
    const newIdx = idx + 1;
    const mesa = carta;
    updates[`games/${gameId}/scores`] = scores;
    updates[`games/${gameId}/decayIndex`] = newIdx;
    updates[`games/${gameId}/mesaActual`] = mesa;
    await db().ref().update(updates);
    openModal("¡Correcto!", `Jugaste ${carta.simbolo} (${carta.nombre}) y avanzaste en la cadena. +2 puntos.`);
  } else {
    scores[playerId] = curScore - 1;
    pile.push(carta);
    updates[`games/${gameId}/scores`] = scores;
    updates[`games/${gameId}/discardPile`] = pile;
    await db().ref().update(updates);
    openModal("Incorrecto", `Esa carta no sigue en la cadena. -1 punto.`);
  }

  const afterCore = await getGameCore();
  cerrarModal();
  await advanceTurn(afterCore);
}

// ------------------ Robar carta ------------------
window.robarCarta = async function robarCarta(){
  const core = await getGameCore();
  if (core.currentTurn !== playerId) { openModal("No es tu turno", "Esperá a que te toque."); return; }
  if (core.turnState?.drew) { openModal("Ya robaste", "Solo podés robar 1 carta por turno."); return; }

  if (!core.deck.length) return openModal("Mazo vacío", "No quedan cartas para robar.");
  const carta = core.deck[0]; const resto = core.deck.slice(1);

  const myHandSnap=await db().ref(`games/${gameId}/players/${playerId}/cards`).get();
  const hand=myHandSnap.exists()?myHandSnap.val():[]; hand.push(carta);

  await db().ref().update({
    [`games/${gameId}/players/${playerId}/cards`]: hand,
    [`games/${gameId}/deckRemaining`]: resto,
    [`games/${gameId}/turnState`]: { drew: true },
  });

  openModal("Robaste una carta", `${renderCard(carta)}<p>Se agregó a tu mano.</p>`);
};

// ------------------ Robar pozo completo ------------------
window.robarPozo = async function robarPozo(){
  const core = await getGameCore();
  if (core.currentTurn !== playerId) return openModal("No es tu turno", "Esperá tu turno para robar el pozo.");
  if (core.turnState?.drew) return openModal("Ya robaste", "Solo podés robar una vez por turno.");

  const pileSnap = await db().ref(`games/${gameId}/discardPile`).get();
  const pile = pileSnap.exists()?pileSnap.val():[];
  if (!pile.length) return openModal("Pozo vacío", "No hay cartas en el pozo.");

  const myHandSnap=await db().ref(`games/${gameId}/players/${playerId}/cards`).get();
  const hand=myHandSnap.exists()?myHandSnap.val():[];
  const nuevaMano = hand.concat(pile);

  await db().ref().update({
    [`games/${gameId}/players/${playerId}/cards`]: nuevaMano,
    [`games/${gameId}/discardPile`]: [],
    [`games/${gameId}/turnState`]: { drew: true },
  });
  openModal("Robaste el pozo", `<p>Te llevaste ${pile.length} cartas del pozo.</p>`);
};

// ------------------ Pasar turno ------------------
window.pasarTurno = async function pasarTurno(){
  const core = await getGameCore();
  if (core.currentTurn !== playerId) { openModal("No es tu turno", "Esperá a que te toque."); return; }
  if (!core.turnState?.drew) { openModal("Primero robá", "Si no tenés la carta, debés robar 1 antes de pasar."); return; }
  await advanceTurn(core);
};
