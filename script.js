// Estética clásica + nuevas features:
// - Modal al robar del mazo (preview) y luego va a la mano
// - Carta correcta NO va al pozo: se agrega a la cadena (decaimiento)
// - Pistas aleatorias coherentes con la regla Z->Z-1
// - Robar del pozo toma TODAS las cartas

const el = (s)=>document.querySelector(s);
const manoWrap = el("#manoWrap");
const cartaActualEl = el("#cartaActual");
const pistaEl = el("#pistaSiguiente");
const topDiscardEl = el("#topDiscard");
const cadenaWrap = el("#cadenaWrap");
const mazoCountEl = el("#mazoCount");
const pozoCountEl = el("#pozoCount");

// Botones
const btnRobar = el("#btnRobar");
const btnRobarPozo = el("#btnRobarPozo");
const btnPasar = el("#btnPasar");

// Modal
const modalOverlay = el("#modalOverlay");
const modalTitulo = el("#modalTitulo");
const modalMensaje = el("#modalMensaje");

let deck = [];
let discardPile = []; // pozo (todas las cartas)
let hand = [];
let chain = []; // cadena correcta
let current = null;

// Normalizador flexible para elements.json variados
function normalizeCard(raw) {
  const number = Number(
    raw.number ?? raw.atomicNumber ?? raw.atomic_number ?? raw.Z ?? raw.numero_atomico ?? 0
  );
  return {
    id: raw.id ?? raw.symbol ?? raw.simbolo ?? raw.name ?? raw.nombre ?? Math.random().toString(36).slice(2),
    name: raw.name ?? raw.nombre ?? "Elemento",
    symbol: raw.symbol ?? raw.simbolo ?? "?",
    number,
    group: raw.group ?? raw.grupo ?? null,
    period: raw.period ?? raw.periodo ?? null,
  };
}

async function loadDeck() {
  try{
    const res = await fetch("elements.json");
    const data = await res.json();
    deck = data.map(normalizeCard);
  }catch(e){
    deck = [
      {id:"H", name:"Hidrógeno", symbol:"H", number:1, group:1, period:1},
      {id:"He", name:"Helio", symbol:"He", number:2, group:18, period:1},
      {id:"Li", name:"Litio", symbol:"Li", number:3, group:1, period:2},
      {id:"Be", name:"Berilio", symbol:"Be", number:4, group:2, period:2},
      {id:"B", name:"Boro", symbol:"B", number:5, group:13, period:2},
      {id:"C", name:"Carbono", symbol:"C", number:6, group:14, period:2},
      {id:"N", name:"Nitrógeno", symbol:"N", number:7, group:15, period:2},
      {id:"O", name:"Oxígeno", symbol:"O", number:8, group:16, period:2},
      {id:"F", name:"Flúor", symbol:"F", number:9, group:17, period:2},
      {id:"Ne", name:"Neón", symbol:"Ne", number:10, group:18, period:2},
    ];
  }
  shuffle(deck);
  current = deck.pop();
  chain = [current];
  updateUIAll();
}

function shuffle(a){
  for(let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}

function renderCard(c){
  const d = document.createElement("div");
  d.className = "card";
  d.innerHTML = `
    <header>${c.symbol} · ${c.name}</header>
    <div class="kv">N° atómico: <strong>${c.number}</strong></div>
    ${c.group!=null?`<div class="kv">Grupo: <strong>${c.group}</strong></div>`:""}
    ${c.period!=null?`<div class="kv">Período: <strong>${c.period}</strong></div>`:""}
  `;
  return d;
}

function renderHand(){
  manoWrap.innerHTML = "";
  hand.forEach((c, i) => {
    const d = renderCard(c);
    d.style.cursor = "pointer";
    d.title = "Jugar carta";
    d.addEventListener("click", () => playFromHand(i));
    manoWrap.appendChild(d);
  });
}

function renderTopDiscard(){
  topDiscardEl.innerHTML = discardPile.length ? renderCard(discardPile.at(-1)).innerHTML : "—";
}

function renderChain(){
  cadenaWrap.innerHTML = "";
  chain.forEach(c => {
    const d = renderCard(c);
    d.style.width = "160px";
    cadenaWrap.appendChild(d);
  });
}

function updateHint(){
  const zNext = current.number - 1;
  const pool = [
    `La próxima carta tiene <strong>N° atómico ${zNext}</strong>`,
    `Buscá el elemento anterior en la tabla (Z=${zNext})`,
    `Decaimiento: Z disminuye en 1 → ${zNext}`,
    `Pista: desde Z=${current.number} a Z=${zNext}`,
  ];
  const i = Math.floor(Math.random()*pool.length);
  el("#pistaSiguiente").innerHTML = "Pista: " + pool[i];
}

function updateCounts(){
  el("#mazoCount").textContent = deck.length;
  el("#pozoCount").textContent = discardPile.length;
}

function updateCurrentUI(){
  cartaActualEl.innerHTML = renderCard(current).innerHTML;
  renderChain();
}

function updateUIAll(){
  updateCurrentUI();
  renderTopDiscard();
  renderHand();
  updateCounts();
  updateHint();
}

// Modal helpers
function modal(html, title="Carta robada"){
  el("#modalTitulo").textContent = title;
  el("#modalMensaje").innerHTML = html;
  el("#modalOverlay").style.display = "flex";
}
function cerrarModal(){ el("#modalOverlay").style.display = "none"; }
window.cerrarModal = cerrarModal;

// Reglas
function isCorrect(next){ return next.number === current.number - 1; }

// Acciones
btnRobar.addEventListener("click", () => {
  if (!deck.length){ modal("<p>No hay más cartas en el mazo.</p>", "Mazo vacío"); return; }
  const card = deck.pop();
  modal(renderCard(card).outerHTML, "Robaste una carta");
  hand.push(card);      // luego de mostrarla, va a la mano
  renderHand();
  updateCounts();
});

btnRobarPozo.addEventListener("click", () => {
  if (!discardPile.length){ modal("<p>No hay cartas en el pozo.</p>", "Pozo vacío"); return; }
  // Llevarse TODAS las cartas del pozo
  const cant = discardPile.length;
  const todas = discardPile.splice(0, cant);
  hand.push(...todas);
  modal(`<p>Te llevaste <strong>${cant}</strong> carta(s) del pozo.</p>`, "Robaste el pozo");
  renderHand();
  updateCounts();
  renderTopDiscard();
});

btnPasar.addEventListener("click", () => {
  updateHint(); // cambia la pista al pasar
});

function playFromHand(idx){
  const card = hand[idx];
  if (isCorrect(card)){
    // Correcta → a la cadena, NO al pozo
    chain.push(card);
    current = card;
    hand.splice(idx,1);
    updateCurrentUI();
    renderHand();
    updateHint();
  }else{
    // Incorrecta → al pozo
    const thrown = hand.splice(idx,1)[0];
    discardPile.push(thrown);
    renderHand();
    renderTopDiscard();
    updateCounts();
  }
}

// Start
loadDeck();
