/* script.js: lógica del juego con turnos, robar y descarte */

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
function setTurnControlsEnabled(enabled) {
  document.getElementById("btnRobar").disabled = !enabled;
  document.getElementById("btnTerminar").disabled = !enabled;
}

let playerId = "";
let playerName = "";
let gameId = "";
let isHost = false;
let unsubscribePlayers = null;
let unsubscribeGame = null;

const db = () => firebase.database();

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
      card.title = "Click para descartar si es tu turno";
      card.innerHTML = `<h3>${el.simbolo} — ${el.nombre}</h3>
        <p>N° atómico: ${el.numero_atomico}</p>
        <p>Electronegatividad: ${el.electronegatividad ?? "—"}</p>`;
      card.addEventListener("click", () => descartarCarta(idx));
      tablero.appendChild(card);
    });
  }
  const topEl = document.getElementById("topDiscard");
  const pileSnap = await db().ref(`games/${gameId}/discardPile`).get();
  const pile = pileSnap.exists() ? pileSnap.val() : [];
  if (pile.length) {
    const top = pile[pile.length - 1];
    topEl.style.display = "inline-block";
    topEl.innerHTML = `<h3>${top.simbolo} — ${top.nombre}</h3>
      <p>N° atómico: ${top.numero_atomico}</p>
      <p>Electronegatividad: ${top.electronegatividad ?? "—"}</p>`;
  } else {
    topEl.style.display = "inline-block";
    topEl.innerHTML = `<p>(vacío)</p>`;
  }
}

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

window.crearSala = async function crearSala() {
  playerName = document.getElementById("nombreJugador").value.trim();
  if (!playerName) return alert("Poné tu nombre");
  playerId = String(Date.now());
  gameId = codigoSala();
  isHost = true;
  await db().ref(`games/${gameId}`).set({
    createdAt: Date.now(), host: playerId, state: "lobby", maxPlayers: 4, minPlayers: 2
  });
  await db().ref(`games/${gameId}/players/${playerId}`).set({ name: playerName, cards: [] });
  showSalaUI({ salaId: gameId, playerName });
  alert(`Sala creada: ${gameId}. Compartí este código.`);
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
  await db().ref(`games/${gameId}/players/${playerId}`).set({ name: playerName, cards: [] });
  showSalaUI({ salaId: gameId, playerName });
  suscribirLobby(); suscribirGame();
};

function suscribirLobby() {
  if (unsubscribePlayers) { unsubscribePlayers(); unsubscribePlayers=null; }
  const playersRef = db().ref(`games/${gameId}/players`);
  const hostRef = db().ref(`games/${gameId}/host`);
  const stateRef = db().ref(`games/${gameId}/state`);
  let currentPlayers = {}; let hostId=""; let state="lobby";
  const rerender = () => renderLobby(currentPlayers, hostId, state);
  const onValuePlayers = playersRef.on("value", async (snap) => {
    currentPlayers = snap.exists()? snap.val():{};
    rerender();
    const cant = Object.keys(currentPlayers).length;
    if (isHost && state==="lobby" && cant===4) await iniciarPartidaInterno();
  });
  const onValueHost = hostRef.on("value", (snap)=>{hostId=snap.val()||""; rerender();});
  const onValueState = stateRef.on("value", async (snap)=>{
    state=snap.val()||"lobby"; rerender();
    if (state==="started"){ document.getElementById("lobby").style.display="none"; await renderTableroDesdeDB(); }
  });
  unsubscribePlayers=()=>{playersRef.off("value",onValuePlayers); hostRef.off("value",onValueHost); stateRef.off("value",onValueState);};
}

function suscribirGame() {
  if (unsubscribeGame){unsubscribeGame(); unsubscribeGame=null;}
  const stateRef=db().ref(`games/${gameId}/state`);
  const turnRef=db().ref(`games/${gameId}/currentTurn`);
  const pileRef=db().ref(`games/${gameId}/discardPile`);
  const myHandRef=db().ref(`games/${gameId}/players/${playerId}/cards`);
  const onState=stateRef.on("value", async (snap)=>{if(snap.val()==="started")await renderTableroDesdeDB();});
  const onTurn=turnRef.on("value", async (snap)=>{
    const current=snap.val(); const estadoTurno=document.getElementById("estadoTurno");
    if(!current){setTurnControlsEnabled(false); if(estadoTurno)estadoTurno.textContent="Esperando…"; return;}
    const soyMiTurno=current===playerId; setTurnControlsEnabled(soyMiTurno);
    if(estadoTurno)estadoTurno.textContent=soyMiTurno?"¡Es tu turno!":"Turno de otro jugador…";
  });
  const onPile=pileRef.on("value",async()=>{await renderTableroDesdeDB();});
  const onMyHand=myHandRef.on("value",async()=>{await renderTableroDesdeDB();});
  unsubscribeGame=()=>{stateRef.off("value",onState); turnRef.off("value",onTurn); pileRef.off("value",onPile); myHandRef.off("value",onMyHand);};
}

async function armarMazo(){ const resp=await fetch("elements.json"); const data=await resp.json(); return shuffle(data); }
async function repartirCartas(mazo, players, cartasPorJugador=5){
  const playerIds=Object.keys(players); const updates={}; let idx=0;
  for(const pid of playerIds){const hand=[]; for(let i=0;i<cartasPorJugador;i++){if(idx>=mazo.length)break; hand.push(mazo[idx++]);}
    updates[`games/${gameId}/players/${pid}/cards`]=hand;}
  updates[`games/${gameId}/deckRemaining`]=mazo.slice(idx); updates[`games/${gameId}/discardPile`]=[];
  return db().ref().update(updates);
}
async function setTurnOrderAndStart(players){
  const order=Object.keys(players);
  await db().ref(`games/${gameId}/turnOrder`).set(order);
  await db().ref(`games/${gameId}/currentTurn`).set(order[0]);
  await db().ref(`games/${gameId}/turnIndex`).set(0);
  await db().ref(`games/${gameId}/state`).set("started");
}
async function iniciarPartidaInterno(){
  const gameSnap=await db().ref(`games/${gameId}`).get(); if(!gameSnap.exists())return;
  const game=gameSnap.val(); if(game.state!=="lobby")return;
  const playersSnap=await db().ref(`games/${gameId}/players`).get(); const players=playersSnap.exists()?playersSnap.val():{};
  const cant=Object.keys(players).length; if(cant<2){alert("Mínimo 2 jugadores."); return;}
  const mazo=await armarMazo(); await repartirCartas(mazo, players, 5); await setTurnOrderAndStart(players);
}
window.iniciarPartida=async function iniciarPartida(){ if(!isHost)return alert("Solo el host puede iniciar.");
  try{await iniciarPartidaInterno();}catch(err){console.error(err);alert("No pude iniciar.");}};

async function getGameCore(){
  const [orderSnap,idxSnap,turnSnap,deckSnap]=await Promise.all([
    db().ref(`games/${gameId}/turnOrder`).get(),
    db().ref(`games/${gameId}/turnIndex`).get(),
    db().ref(`games/${gameId}/currentTurn`).get(),
    db().ref(`games/${gameId}/deckRemaining`).get(),
  ]);
  return {order:orderSnap.exists()?orderSnap.val():[], turnIndex:idxSnap.exists()?idxSnap.val():0,
    currentTurn:turnSnap.val(), deck:deckSnap.exists()?deckSnap.val():[]};
}

window.robarCarta=async function(){ const {currentTurn,deck}=await getGameCore();
  if(currentTurn!==playerId)return alert("No es tu turno."); if(!deck.length)return alert("No quedan cartas.");
  const carta=deck[0]; const resto=deck.slice(1);
  const myHandSnap=await db().ref(`games/${gameId}/players/${playerId}/cards`).get(); const hand=myHandSnap.exists()?myHandSnap.val():[];
  hand.push(carta);
  await db().ref().update({[`games/${gameId}/players/${playerId}/cards`]:hand, [`games/${gameId}/deckRemaining`]:resto});
};

async function descartarCarta(indexEnMano){
  const {currentTurn}=await getGameCore(); if(currentTurn!==playerId)return alert("No es tu turno.");
  const myHandSnap=await db().ref(`games/${gameId}/players/${playerId}/cards`).get(); const hand=myHandSnap.exists()?myHandSnap.val():[];
  if(indexEnMano<0||indexEnMano>=hand.length)return;
  const carta=hand[indexEnMano]; const nuevaMano=hand.filter((_,i)=>i!==indexEnMano);
  const pileSnap=await db().ref(`games/${gameId}/discardPile`).get(); const pile=pileSnap.exists()?pileSnap.val():[]; pile.push(carta);
  await db().ref().update({[`games/${gameId}/players/${playerId}/cards`]:nuevaMano, [`games/${gameId}/discardPile`]:pile});
}

window.terminarTurno=async function(){ const core=await getGameCore();
  if(core.currentTurn!==playerId)return alert("No es tu turno.");
  const nextIndex=(core.turnIndex+1)%core.order.length; const nextPlayer=core.order[nextIndex];
  await db().ref().update({[`games/${gameId}/turnIndex`]:nextIndex, [`games/${gameId}/currentTurn`]:nextPlayer});
};
