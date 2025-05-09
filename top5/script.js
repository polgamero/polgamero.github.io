// Elementos del DOM
const imagesContainer = document.getElementById("images-container");
const podioSlots = document.querySelectorAll(".podio-slot");
const resetButton = document.getElementById("reset-button");
let selectedImage = null;

// Cargar imágenes iniciales
function loadImages() {
  imagesContainer.innerHTML = '';

  for (let i = 1; i <= 20; i++) {
    const img = document.createElement("img");
    img.src = `https://picsum.photos/seed/${i}/195/130`;
    img.classList.add("img-item");
    img.setAttribute("draggable", "true");
    img.setAttribute("data-id", `img-${i}`);
    enableInteraction(img);
    imagesContainer.appendChild(img);
  }
}

// Guardar estado en localStorage
function saveState() {
  const state = Array.from(podioSlots).map(slot => {
    const img = slot.querySelector("img");
    return img ? img.getAttribute("data-id") : null;
  });
  localStorage.setItem("podioState", JSON.stringify(state));
}

// Cargar estado guardado
function loadState() {
  const savedState = localStorage.getItem("podioState");
  if (!savedState) return;

  const state = JSON.parse(savedState);
  state.forEach((imgId, index) => {
    if (imgId) {
      const img = document.querySelector(`img[data-id="${imgId}"]`);
      if (img) {
        const slot = podioSlots[index];
        rebuildSlot(slot, index + 1);
        slot.appendChild(img);
      }
    }
  });
}

// Reconstruir un slot del podio
function rebuildSlot(slot, rank) {
  slot.innerHTML = `
    <div class="rank-number rank-${rank}">${rank}</div>
    <div class="overlay-message"></div>
  `;
}

// Resetear podio
function resetPodio() {
  podioSlots.forEach((slot, index) => {
    const img = slot.querySelector("img");
    if (img) {
      img.classList.add("reset-animation");
      setTimeout(() => {
        imagesContainer.appendChild(img);
        img.classList.remove("reset-animation");
      }, 500);
    }
    rebuildSlot(slot, index + 1);
  });
  localStorage.removeItem("podioState");
}

// Intercambiar imágenes entre slots del podio (FIXED)
function swapPodioImages(targetSlot) {
  const targetImg = targetSlot.querySelector("img");
  const selectedParent = selectedImage.parentElement;

  // Reconstruir el slot destino
  const targetRank = targetSlot.getAttribute("data-rank");
  rebuildSlot(targetSlot, targetRank);

  // Si viene de otro slot del podio
  if (selectedParent.classList.contains("podio-slot")) {
    const selectedRank = selectedParent.getAttribute("data-rank");
    rebuildSlot(selectedParent, selectedRank);
    selectedParent.appendChild(targetImg || document.createElement("div"));
  }

  // Mover la imagen seleccionada al destino
  targetSlot.appendChild(selectedImage);
}

// Mostrar mensaje en un elemento específico
function setMessage(element, message) {
  let overlay;
  
  if (element.id === "images-container") {
    overlay = element.querySelector(".overlay-message");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = "overlay-message";
      element.appendChild(overlay);
    }
  } else {
    overlay = element.querySelector(".overlay-message");
  }

  if (!overlay) return;
  
  overlay.textContent = message;
  overlay.style.opacity = message ? 1 : 0;
}

// Resetear resaltados
function resetAllHighlights() {
  podioSlots.forEach(slot => slot.classList.remove("hovering"));
  imagesContainer.classList.remove("hovering");
}

// Habilitar interacción drag-and-drop
function enableInteraction(img) {
  // Zoom al hacer hover
  img.addEventListener("mouseenter", () => {
    if (!selectedImage) {
      img.style.transform = "scale(2)";
      img.style.zIndex = "1000";
    }
  });

  img.addEventListener("mouseleave", () => {
    if (!selectedImage) {
      img.style.transform = "scale(1)";
      img.style.zIndex = "";
    }
  });

  img.addEventListener("dragstart", () => {
    selectedImage = img;
    img.classList.add("dragging");
    img.style.transform = "scale(1)";
    img.style.zIndex = "1001";
    setMessage(img.parentElement, "INGRESAR AL PODIO");
  });

  img.addEventListener("dragend", () => {
    img.classList.remove("dragging");
    setMessage(img.parentElement, "");
    selectedImage = null;
  });
}

// Eventos para los slots del podio
podioSlots.forEach((slot) => {
  slot.addEventListener("dragover", (e) => {
    e.preventDefault();
    resetAllHighlights();
    slot.classList.add("hovering");
    const message = slot.querySelector("img") ? "REEMPLAZAR POSICIÓN" : "INGRESAR AL PODIO";
    setMessage(slot, message);
  });

  slot.addEventListener("dragleave", () => {
    slot.classList.remove("hovering");
    setMessage(slot, "");
  });

  slot.addEventListener("drop", (e) => {
    e.preventDefault();
    slot.classList.remove("hovering");
    
    if (selectedImage) {
      swapPodioImages(slot);
      saveState();
    }
  });
});

// Eventos para el contenedor de imágenes
imagesContainer.addEventListener("dragover", (e) => {
  e.preventDefault();
  resetAllHighlights();
  imagesContainer.classList.add("hovering");
  setMessage(imagesContainer, "DEVOLVER A LA PILA");
});

imagesContainer.addEventListener("dragleave", () => {
  imagesContainer.classList.remove("hovering");
  setMessage(imagesContainer, "");
});

imagesContainer.addEventListener("drop", (e) => {
  e.preventDefault();
  imagesContainer.classList.remove("hovering");
  setMessage(imagesContainer, "");
  
  if (selectedImage) {
    imagesContainer.appendChild(selectedImage);
    saveState();
  }
});

// Manejar drops fuera de áreas válidas
document.addEventListener("dragover", (e) => e.preventDefault());
document.addEventListener("drop", (e) => {
  if (!e.target.closest(".podio-slot, .images-container")) {
    resetAllHighlights();
    document.querySelectorAll(".overlay-message").forEach(msg => {
      msg.style.opacity = 0;
    });
  }
});

// Evento del botón Reset
resetButton.addEventListener("click", resetPodio);

// Inicialización
document.addEventListener("DOMContentLoaded", () => {
  loadImages();
  loadState();
});
