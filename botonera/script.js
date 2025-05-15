document.addEventListener("DOMContentLoaded", function () {
  const sounds = [
    { name: "Ping Pong", file: "https://polgamero.github.io/botonera/sounds/ping.wav", key: "0" },
    { name: "Momento Fogón", file: "https://polgamero.github.io/botonera/sounds/momento.wav", key: "1" },
    { name: "Top 5", file: "https://polgamero.github.io/botonera/sounds/five.wav", key: "2" },
    { name: "Lo tocás?", file: "https://polgamero.github.io/botonera/sounds/tocas.wav", key: "3" },
    { name: "Playlist prohibida", file: "https://polgamero.github.io/botonera/sounds/playlist.wav", key: "4" },
    { name: "LOL1", file: "https://polgamero.github.io/botonera/sounds/LOL.wav", key: "5" },
    { name: "Pedo1", file: "https://polgamero.github.io/botonera/sounds/pedo.wav", key: "6" },
    { name: "Buuu1", file: "https://polgamero.github.io/botonera/sounds/buuu.wav", key: "7" },
    { name: "Risas", file: "https://polgamero.github.io/botonera/sounds/risas.wav", key: "8" },
    { name: "Buuu1", file: "https://polgamero.github.io/botonera/sounds/buuu.wav", key: "9" }
];

const buttonGrid = document.getElementById("buttonGrid");

  sounds.forEach(sound => {
    const buttonContainer = document.createElement("div");
    buttonContainer.classList.add("button-container");

    const button = document.createElement("button");
    button.classList.add("button");
    button.innerHTML = sound.name;
    button.dataset.key = sound.key;

    button.addEventListener("click", () => {
      playSound(sound.file);
    });

    const keyCombination = document.createElement("div");
    keyCombination.classList.add("key-combination");
    keyCombination.textContent = `Ctrl + ${sound.key}`;

    buttonContainer.appendChild(button);
    buttonContainer.appendChild(keyCombination);

    buttonGrid.appendChild(buttonContainer);
  });

  const stopButton = document.getElementById("stopButton");
  stopButton.addEventListener("click", stopSound);

  let currentSound = null;

  function playSound(file) {
    if (currentSound) {
      currentSound.pause();
      currentSound.currentTime = 0;
    }
    currentSound = new Audio(file);
    currentSound.play();
  }

  function stopSound() {
    if (currentSound) {
      currentSound.pause();
      currentSound.currentTime = 0;
    }
  }

  document.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
      e.preventDefault();
      stopSound();
    }
    if (e.ctrlKey) {
      e.preventDefault();
      const sound = sounds.find(s => s.key === e.key);
      if (sound) {
        playSound(sound.file);
      }
    }
  });
});
