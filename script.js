// 🔥 Configuración Firebase (reemplaza con tus claves)
const firebaseConfig = {
  apiKey: "TU_API_KEY",
  authDomain: "TU_PROYECTO.firebaseapp.com",
  databaseURL: "https://TU_PROYECTO.firebaseio.com",
  projectId: "TU_PROYECTO",
  storageBucket: "TU_PROYECTO.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let salaActual = null;
let jugadorNombre = null;

// Crear sala
function crearSala() {
  jugadorNombre = document.getElementById("nombreJugador").value;
  if (!jugadorNombre) return alert("Ingresa tu nombre");

  salaActual = Math.floor(Math.random() * 100000);
  db.ref("salas/" + salaActual).set({
    jugadores: { [jugadorNombre]: { cartas: [] } }
  });

  mostrarSala();
}

// Unirse a sala
function unirseSala() {
  jugadorNombre = document.getElementById("nombreJugador").value;
  if (!jugadorNombre) return alert("Ingresa tu nombre");

  salaActual = prompt("Ingrese el ID de la sala:");
  db.ref("salas/" + salaActual + "/jugadores/" + jugadorNombre).set({ cartas: [] });

  mostrarSala();
}

// Mostrar sala
function mostrarSala() {
  document.getElementById("login").style.display = "none";
  document.getElementById("sala").style.display = "block";
  document.getElementById("salaId").innerText = salaActual;
  document.getElementById("jugadorNombre").innerText = jugadorNombre;

  escucharCambios();
}

// Escuchar cambios en la sala
function escucharCambios() {
  db.ref("salas/" + salaActual).on("value", snapshot => {
    const data = snapshot.val();
    if (data && data.jugadores) {
      let tablero = document.getElementById("tablero");
      tablero.innerHTML = "";
      Object.keys(data.jugadores).forEach(j => {
        let div = document.createElement("div");
        div.className = "card";
        div.innerHTML = `<h3>${j}</h3><p>Cartas: ${data.jugadores[j].cartas.length}</p>`;
        tablero.appendChild(div);
      });
    }
  });
}
