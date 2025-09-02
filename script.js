let playerName = "";
let playerId = "";
let gameId = "partida1"; // siempre la misma por ahora

document.getElementById("joinBtn").addEventListener("click", () => {
  playerName = document.getElementById("playerName").value;
  if (!playerName) return alert("Poné tu nombre");

  playerId = Date.now();

  // Registrar jugador en Firebase
  firebase.database().ref("games/" + gameId + "/players/" + playerId).set({
    name: playerName,
    cards: []
  });

  document.getElementById("jugadorNombre").innerText = playerName;
  document.getElementById("login").style.display = "none";
  document.getElementById("sala").style.display = "block";
});
