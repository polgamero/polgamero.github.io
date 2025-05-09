// Elementos del DOM
const imagesContainer = document.getElementById("images-container");
const podioSlots = document.querySelectorAll(".podio-slot");
const resetButton = document.getElementById("reset-button");
let selectedImage = null;

// Cargar imágenes iniciales
/*function loadImages() {
  imagesContainer.innerHTML = '';

  for (let i = 1; i <= 20; i++) {
    const img = document.createElement("img");
    img.src = `https://picsum.photos/seed/${i}/200/140`;
    img.classList.add("img-item");
    img.setAttribute("draggable", "true");
    img.setAttribute("data-id", `img-${i}`);
    enableInteraction(img);
    imagesContainer.appendChild(img);
  }
}*/

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

// Reconstruir slot del podio
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
      imagesContainer.appendChild(img);
    }
    rebuildSlot(slot, index + 1);
  });
  localStorage.removeItem("podioState");
}

// Intercambiar imágenes
function swapPodioImages(targetSlot) {
  const targetImg = targetSlot.querySelector("img");
  const selectedParent = selectedImage.parentElement;

  if (selectedParent === imagesContainer) {
    // Desde contenedor a podio
    const targetRank = targetSlot.getAttribute("data-rank");
    rebuildSlot(targetSlot, targetRank);
    targetSlot.appendChild(selectedImage);
    if (targetImg) imagesContainer.appendChild(targetImg);
  } 
  else if (selectedParent.classList.contains("podio-slot")) {
    // Entre slots del podio
    const selectedRank = selectedParent.getAttribute("data-rank");
    rebuildSlot(selectedParent, selectedRank);
    selectedParent.appendChild(targetImg || document.createElement("div"));
    rebuildSlot(targetSlot, targetSlot.getAttribute("data-rank"));
    targetSlot.appendChild(selectedImage);
  }
}

// Mostrar mensaje
function setMessage(element, message) {
  const overlay = element.querySelector(".overlay-message");
  if (overlay) {
    overlay.textContent = message;
    overlay.style.opacity = message ? 1 : 0;
  }
}

// Habilitar interacción
function enableInteraction(img) {
  img.addEventListener("dragstart", () => {
    selectedImage = img;
    img.classList.add("dragging");
    setMessage(img.parentElement, "INGRESAR AL PODIO");
  });

  img.addEventListener("dragend", () => {
    img.classList.remove("dragging");
    setMessage(img.parentElement, "");
    selectedImage = null;
  });
}

// Eventos del podio
podioSlots.forEach((slot) => {
  slot.addEventListener("dragover", (e) => {
    e.preventDefault();
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

// Eventos del contenedor
imagesContainer.addEventListener("dragover", (e) => {
  e.preventDefault();
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

// Evento del botón Reset
resetButton.addEventListener("click", resetPodio);

// Inicialización
document.addEventListener("DOMContentLoaded", () => {
  loadImages();
  loadState();
});
