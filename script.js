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
  document.getElementById("modalMensaje").textContent = mensaje;
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
    pista.textContent = `Pista: siguiente en la cadena → ${nextObj ? `${nextObj.simbolo} (${nextObj.nombre})` : nextSim}`;
  } else {
    pista.textContent = "Fin de la cadena.";
  }
}
function setTurnStateUI(soyTurno, requireDrawToPass, players, currentId) {
  const el = document.getElementById("estadoTurno");
  if (!currentId) {
    el.textContent = "Esperando…";
  } else if (soyTurno) {
    el.textContent = "¡Es tu turno! Jugá la siguiente carta correcta. Si no la tenés, robá 1 y luego podés pasar.";
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
  } else {
    topEl.style.display = "inline-block";
    topEl.innerHTML = `<p>(vacío)</p>`;
  }
}

// ------------------ Lobby ------------------
function renderLobby(playersMap, hostId, state) {
  const ul = document.getElementById("listaJugadores");
  const countEl = document.getElementById("cantJugadores");
  const btnIniciar = document.getElementById("btnIniciar");
  const estadoLobby = document.getElementById("estadoLobby");

  if (ul) {
    ul.innerHTML = "";
    const ids = Object.keys(playersMap || {});
    ids.forEach((pid) => {
      const li = document.createElement("li");
      const you = pid === playerId ? " (vos)" : "";
      const crown = pid === hostId ? " 👑" : "";
      li.textContent = `${playersMap[pid].name}${you}${crown}`;
      ul.appendChild(li);
    });
    if (countEl) countEl.textContent = ids.length;
  }

  if (!btnIniciar || !estadoLobby) return;
  if (state === "started") {
    btnIniciar.disabled = true;
    estadoLobby.textContent = "Partida iniciada.";
    return;
  }
  const ids = Object.keys(playersMap || {});
  const canStart = ids.length >= 2;
  btnIniciar.disabled = !(isHost && canStart);
  if (ids.length < 2) {
    estadoLobby.textContent = "Esperando más jugadores (mínimo 2, máximo 4)…";
  } else if (ids.length < 4) {
    estadoLobby.textContent = "Podés iniciar (o esperar al 4.º para auto-iniciar).";
  } else {
    estadoLobby.textContent = "Se alcanzó el máximo (4). Iniciando…";
  }
}

// ------------------ Crear / Unirse ------------------
window.crearSala = async function crearSala() {
  playerName = document.getElementById("nombreJugador").value.trim();
  if (!playerName) return alert("Poné tu nombre");
  playerId = String(Date.now());
  gameId = codigoSala();
  isHost = true;

  await db().ref(`games/${gameId}`).set({
    createdAt: Date.now(), host: playerId, state: "lobby", maxPlayers: 4, minPlayers: 2
  });
  await db().ref(`games/${gameId}/players/${playerId}`).set({ name: playerName, cards: [], score: 0 });

  document.getElementById("salaId").textContent = gameId;
  document.getElementById("jugadorNombre").textContent = playerName;
  document.getElementById("login").style.display = "none";
  document.getElementById("sala").style.display = "block";

  suscribirLobby(); suscribirGame();
};

window.unirseSala = async function unirseSala() {
  playerName = document.getElementById("nombreJugador").value.trim();
  if (!playerName) return alert("Poné tu nombre");
  const codigo = prompt("Ingresá el código de sala:");
  if (!codigo) return;
  playerId = String(Date.now());
  gameId = codigo.trim().toUpperCase();
  isHost = false;

  const gameSnap = await db().ref(`games/${gameId}`).get();
  if (!gameSnap.exists()) return alert("Esa sala no existe.");
  const game = gameSnap.val();
  if (game.state === "started") return alert("La partida ya empezó.");
  const playersSnap = await db().ref(`games/${gameId}/players`).get();
  const cant = playersSnap.exists() ? Object.keys(playersSnap.val()).length : 0;
  if (cant >= 4) return alert("La sala está llena.");

  await db().ref(`games/${gameId}/players/${playerId}`).set({ name: playerName, cards: [], score: 0 });

  document.getElementById("salaId").textContent = gameId;
  document.getElementById("jugadorNombre").textContent = playerName;
  document.getElementById("login").style.display = "none";
  document.getElementById("sala").style.display = "block";

  suscribirLobby(); suscribirGame();
};

// ------------------ Suscripciones ------------------
function suscribirLobby() {
  if (unsubscribePlayers) { unsubscribePlayers(); unsubscribePlayers=null; }
  const playersRef = db().ref(`games/${gameId}/players`);
  const hostRef = db().ref(`games/${gameId}/host`);
  const stateRef = db().ref(`games/${gameId}/state`);

  let currentPlayers = {}; let hostId=""; let state="lobby";
  const rerender = async () => {
    renderLobby(currentPlayers, hostId, state);
    const scoresSnap = await db().ref(`games/${gameId}/scores`).get();
    const scores = scoresSnap.exists() ? scoresSnap.val() : {};
    updateScoresUI(scores, currentPlayers);
  };

  const onValuePlayers = playersRef.on("value", async (snap) => {
    currentPlayers = snap.exists()? snap.val():{};
    await rerender();
    const cant = Object.keys(currentPlayers).length;
    if (isHost && state==="lobby" && cant===4) await iniciarPartidaInterno();
  });
  const onValueHost = hostRef.on("value", (snap)=>{hostId=snap.val()||""; rerender();});
  const onValueState = stateRef.on("value", async (snap)=>{
    state=snap.val()||"lobby"; await rerender();
    if (state==="started") {
      document.getElementById("lobby").style.display="none";
      document.getElementById("juego").style.display="block";
      await renderTableroDesdeDB();
    }
  });
  unsubscribePlayers=()=>{playersRef.off("value",onValuePlayers); hostRef.off("value",onValueHost); stateRef.off("value",onValueState);};
}

function suscribirGame() {
  if (unsubscribeGame){unsubscribeGame(); unsubscribeGame=null;}

  const stateRef=db().ref(`games/${gameId}/state`);
  const turnRef=db().ref(`games/${gameId}/currentTurn`);
  const turnStateRef=db().ref(`games/${gameId}/turnState`);
  const pileRef=db().ref(`games/${gameId}/discardPile`);
  const mesaRef=db().ref(`games/${gameId}/mesaActual`);
  const seqRef=db().ref(`games/${gameId}/decayIndex`);
  const scoresRef=db().ref(`games/${gameId}/scores`);
  const playersRef=db().ref(`games/${gameId}/players`);

  const onState=stateRef.on("value", async (snap)=>{
    if(snap.val()==="started"){ document.getElementById("juego").style.display="block"; await renderTableroDesdeDB(); }
  });
  const onTurn=turnRef.on("value", async (snap)=>{
    const current=snap.val();
    const [turnStateSnap, playersSnap] = await Promise.all([turnStateRef.get(), playersRef.get()]);
    const turnState = turnStateSnap.exists()? turnStateSnap.val(): { drew:false };
    const players = playersSnap.exists()? playersSnap.val(): {};
    const soyMiTurno = current === playerId;
    setTurnStateUI(soyMiTurno, turnState.drew, players, current);
  });
  const onTurnState=turnStateRef.on("value", async (snap)=>{
    const turnState = snap.exists()? snap.val(): { drew:false };
    const currentSnap = await turnRef.get();
    const playersSnap = await playersRef.get();
    const soyMiTurno = currentSnap.val() === playerId;
    const players = playersSnap.exists()? playersSnap.val(): {};
    setTurnStateUI(soyMiTurno, turnState.drew, players, currentSnap.val());
  });
  const onPile=pileRef.on("value",async()=>{await renderTableroDesdeDB();});
  const onMesa=mesaRef.on("value",async(snap)=>{const gameSnap = await db().ref(`games/${gameId}`).get(); updateMesaUI(gameSnap.val()||{});});
  const onSeq=seqRef.on("value",async()=>{const gameSnap = await db().ref(`games/${gameId}`).get(); updateMesaUI(gameSnap.val()||{});});
  const onScores=scoresRef.on("value",async()=>{
    const [playersSnap, scoresSnap] = await Promise.all([playersRef.get(), scoresRef.get()]);
    const players = playersSnap.exists()? playersSnap.val(): {};
    const scores = scoresSnap.exists()? scoresSnap.val(): {};
    updateScoresUI(scores, players);
  });

  unsubscribeGame=()=>{
    stateRef.off("value",onState); turnRef.off("value",onTurn); turnStateRef.off("value",onTurnState);
    pileRef.off("value",onPile); mesaRef.off("value",onMesa); seqRef.off("value",onSeq); scoresRef.off("value",onScores);
  };
}

// ------------------ Inicio de partida (host) ------------------
async function armarMazo(){
  await loadElements();
  return shuffle(localElementsCache);
}
async function repartirCartas(mazo, players, cartasPorJugador=5){
  const playerIds=Object.keys(players); const updates={}; let idx=0;
  for(const pid of playerIds){
    const hand=[];
    for(let i=0;i<cartasPorJugador;i++){ if(idx>=mazo.length) break; hand.push(mazo[idx++]); }
    updates[`games/${gameId}/players/${pid}/cards`]=hand;
  }
  updates[`games/${gameId}/deckRemaining`]=mazo.slice(idx);
  updates[`games/${gameId}/discardPile`]=[];
  return db().ref().update(updates);
}
async function setTurnOrderAndStart(players){
  const order=Object.keys(players);
  await db().ref(`games/${gameId}/turnOrder`).set(order);
  await db().ref(`games/${gameId}/currentTurn`).set(order[0]);
  await db().ref(`games/${gameId}/turnIndex`).set(0);
  await db().ref(`games/${gameId}/turnState`).set({ drew:false });
  await db().ref(`games/${gameId}/scores`).set(Object.fromEntries(order.map(id=>[id,0])));

  // Cadena y mesa inicial: URANIO en pantalla + pista del siguiente
  await loadElements();
  const sequence = DECAY_SEQUENCE.slice();
  const uranio = findElementBySymbol("U");
  const mesa = uranio || { simbolo:"U", nombre:"Uranio" };
  await db().ref(`games/${gameId}/decaySequence`).set(sequence);
  await db().ref(`games/${gameId}/decayIndex`).set(0);
  await db().ref(`games/${gameId}/mesaActual`).set(mesa);

  await db().ref(`games/${gameId}/state`).set("started");
  const gameSnap = await db().ref(`games/${gameId}`).get();
  updateMesaUI(gameSnap.val()||{});
}
async function iniciarPartidaInterno(){
  const gameSnap=await db().ref(`games/${gameId}`).get();
  if(!gameSnap.exists())return;
  const game=gameSnap.val(); if(game.state!=="lobby")return;

  const playersSnap=await db().ref(`games/${gameId}/players`).get();
  const players=playersSnap.exists()?playersSnap.val():{};
  const cant=Object.keys(players).length; if(cant<2){alert("Mínimo 2 jugadores."); return;}

  const mazo=await armarMazo(); await repartirCartas(mazo, players, 5); await setTurnOrderAndStart(players);
}
window.iniciarPartida=async function iniciarPartida(){ if(!isHost)return alert("Solo el host puede iniciar.");
  try{await iniciarPartidaInterno();}catch(err){console.error(err);alert("No pude iniciar.");}};

// ------------------ Núcleo de turno ------------------
async function getGameCore(){
  const [orderSnap,idxSnap,turnSnap,deckSnap,seqSnap,idxSeqSnap,gameSnap,playersSnap,scoresSnap,turnStateSnap] = await Promise.all([
    db().ref(`games/${gameId}/turnOrder`).get(),
    db().ref(`games/${gameId}/turnIndex`).get(),
    db().ref(`games/${gameId}/currentTurn`).get(),
    db().ref(`games/${gameId}/deckRemaining`).get(),
    db().ref(`games/${gameId}/decaySequence`).get(),
    db().ref(`games/${gameId}/decayIndex`).get(),
    db().ref(`games/${gameId}`).get(),
    db().ref(`games/${gameId}/players`).get(),
    db().ref(`games/${gameId}/scores`).get(),
    db().ref(`games/${gameId}/turnState`).get(),
  ]);
  return {
    order: orderSnap.exists()?orderSnap.val():[],
    turnIndex: idxSnap.exists()?idxSnap.val():0,
    currentTurn: turnSnap.val(),
    deck: deckSnap.exists()?deckSnap.val():[],
    decaySequence: seqSnap.exists()?seqSnap.val():[],
    decayIndex: idxSeqSnap.exists()?idxSeqSnap.val():0,
    game: gameSnap.exists()?gameSnap.val():{},
    players: playersSnap.exists()?playersSnap.val():{},
    scores: scoresSnap.exists()?scoresSnap.val():{},
    turnState: turnStateSnap.exists()?turnStateSnap.val():{drew:false},
  };
}
async function advanceTurn(core){
  const nextIndex=(core.turnIndex+1)%core.order.length; const nextPlayer=core.order[nextIndex];
  await db().ref().update({
    [`games/${gameId}/turnIndex`]:nextIndex,
    [`games/${gameId}/currentTurn`]:nextPlayer,
    [`games/${gameId}/turnState`]:{drew:false},
  });
}
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
  const pile = pileSnap.exists()?pileSnap.val():[]; pile.push(carta);

  const updates = {};
  updates[`games/${gameId}/players/${playerId}/cards`] = nuevaMano;
  updates[`games/${gameId}/discardPile`] = pile;

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
    updates[`games/${gameId}/scores`] = scores;
    await db().ref().update(updates);
    openModal("Incorrecto", `Esa carta no sigue en la cadena. -1 punto.`);
  }

  const afterCore = await getGameCore();
  cerrarModal();
  await advanceTurn(afterCore);
}
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
};
window.pasarTurno = async function pasarTurno(){
  const core = await getGameCore();
  if (core.currentTurn !== playerId) { openModal("No es tu turno", "Esperá a que te toque."); return; }
  if (!core.turnState?.drew) { openModal("Primero robá", "Si no tenés la carta, debés robar 1 antes de pasar."); return; }
  await advanceTurn(core);
};
