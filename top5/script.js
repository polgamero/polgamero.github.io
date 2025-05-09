// Prevenir flickering en hover
document.querySelectorAll('.img-item').forEach(img => {
  img.style.transformOrigin = 'center center';
});

// Elementos del DOM
const imagesContainer = document.getElementById("images-container");
const podioSlots = document.querySelectorAll(".podio-slot");
const resetButton = document.getElementById("reset-button");
let selectedImage = null;

// Path de las imagenes
const imagenes = [
  { src: "https://polgamero.github.io/img/bandas/atahualpa.jpg", id: "img-1" },
  { src: "https://polgamero.github.io/img/bandas/charly.jpg", id: "img-2" },
  { src: "https://polgamero.github.io/img/bandas/fito.jpg", id: "img-3" },
  { src: "https://polgamero.github.io/img/bandas/soda.jpg", id: "img-4" },
  { src: "https://polgamero.github.io/img/bandas/divididos.png", id: "img-5" },
  { src: "https://polgamero.github.io/img/bandas/sandro.jpg", id: "img-6" },
  { src: "https://polgamero.github.io/img/bandas/lali.jpg", id: "img-7" },
  { src: "https://polgamero.github.io/img/bandas/tini.jpg", id: "img-8" },
  { src: "https://polgamero.github.io/img/bandas/redondos.jpg", id: "img-9" },
  { src: "https://polgamero.github.io/img/bandas/spinetta.jpg", id: "img-10" },
  { src: "https://polgamero.github.io/img/bandas/sosa.jpg", id: "img-11" },
  { src: "https://polgamero.github.io/img/bandas/gardel.jpg", id: "img-12" },
  { src: "https://polgamero.github.io/img/bandas/taylor.jpg", id: "img-13" },
  { src: "https://polgamero.github.io/img/bandas/beyonce.jpg", id: "img-14" },
  { src: "https://polgamero.github.io/img/bandas/nirvana.png", id: "img-15" },
  { src: "https://polgamero.github.io/img/bandas/bowie.png", id: "img-16" },
  { src: "https://polgamero.github.io/img/bandas/floyd.jpg", id: "img-17" },
  { src: "https://polgamero.github.io/img/bandas/beatles.png", id: "img-18" },
  { src: "https://polgamero.github.io/img/bandas/MJ.png", id: "img-19" },
  { src: "https://polgamero.github.io/img/bandas/elvis.png", id: "img-20" },
  { src: "https://polgamero.github.io/img/bandas/madonna.png", id: "img-21" },
  { src: "https://polgamero.github.io/img/bandas/queen.jpg", id: "img-22" },
  { src: "https://polgamero.github.io/img/bandas/U2.png", id: "img-23" },
  { src: "https://polgamero.github.io/img/bandas/zeppelin.jpg", id: "img-24" },
  { src: "https://polgamero.github.io/img/bandas/rolling.jpg", id: "img-25" }
];

// Cargar imágenes iniciales
function loadImages() {
  imagesContainer.innerHTML = '';

imagenes.forEach((imagen, index) => {
    const img = document.createElement("img");
    img.src = imagen.src;
    img.classList.add("img-item");
    img.setAttribute("draggable", "true");
    img.setAttribute("data-id", imagen.id);
    enableInteraction(img);
    imagesContainer.appendChild(img);
   });
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
