// Editor-Overlay einblenden
const overlay = document.createElement("div");
overlay.style.position = "fixed";
overlay.style.top = "0";
overlay.style.left = "0";
overlay.style.right = "0";
overlay.style.bottom = "0";
overlay.style.background = "rgba(0,0,0,0.8)";
overlay.style.color = "white";
overlay.style.zIndex = "9999";
overlay.style.padding = "20px";
overlay.innerHTML = `
  <h1>R.A.L.F. – Live Editor</h1>
  <button id="closeEditor" style="margin-top:20px;padding:10px 20px;background:red;">Schließen</button>
  <button id="addSong" style="margin-top:20px;padding:10px 20px;background:green;">Neuen Song einfügen</button>
`;

document.body.appendChild(overlay);

// Close-Button
document.getElementById("closeEditor").onclick = () => {
  overlay.remove();
};

// Beispiel: neuen Song in songs.json laden
document.getElementById("addSong").onclick = async () => {
  alert("Hier könnte später ein Formular zum Song-Einfügen erscheinen!");
};
