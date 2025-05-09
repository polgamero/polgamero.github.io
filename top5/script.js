// Elementos del DOM
const imagesContainer = document.getElementById("images-container");
const podioSlots = document.querySelectorAll(".podio-slot");
let selectedImage = null;

// Cargar 20 imágenes de ejemplo
function loadImages() {
  for (let i = 1; i <= 20; i++) {
    const img = document.createElement("img");
    img.src = `https://picsum.photos/seed/${i}/195/130`;
    img.classList.add("img-item");
    img.setAttribute("draggable", "true");
    enableInteraction(img);
    imagesContainer.appendChild(img);
  }
}

// Habilitar interacción (drag-and-drop) para una imagen
function enableInteraction(img) {
  img.addEventListener("mousedown", () => {
    selectedImage = img;
    img.classList.add("selected");
    setMessage(img.parentElement, "INGRESAR AL PODIO");
  });

  img.addEventListener("dragstart", () => {
    selectedImage = img;
    setMessage(img.parentElement, "INGRESAR AL PODIO");
  });

  img.addEventListener("dragend", () => {
    if (selectedImage) {
      selectedImage.classList.remove("selected");
      setMessage(img.parentElement, "");
      selectedImage = null;
    }
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
      if (slot.querySelector("img")) {
        swapImages(slot); // Intercambiar imágenes si el slot está ocupado
      } else {
        // Limpiar y reconstruir el slot (evita superposición)
        const rank = slot.getAttribute("data-rank");
        slot.innerHTML = `
          <div class="rank-number rank-${rank}">${rank}</div>
          <div class="overlay-message"></div>
        `;
        slot.appendChild(selectedImage);
      }
      setMessage(slot, "");
    }
  });
});

// Eventos para el contenedor de imágenes
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
  
  if (selectedImage) {
    imagesContainer.appendChild(selectedImage);
    setMessage(imagesContainer, "");
  }
});

// Intercambiar imágenes entre slots/contenedor
function swapImages(slot) {
  const currentImg = slot.querySelector("img");
  const rank = slot.getAttribute("data-rank");
  
  // Reconstruir el slot
  slot.innerHTML = `
    <div class="rank-number rank-${rank}">${rank}</div>
    <div class="overlay-message"></div>
  `;
  
  // Mover imágenes
  slot.appendChild(selectedImage);
  if (currentImg) {
    imagesContainer.appendChild(currentImg);
    enableInteraction(currentImg); // Re-habilitar interacción
  }
}

// Mostrar mensaje en un elemento específico
function setMessage(element, message) {
  const overlay = element.querySelector(".overlay-message");
  if (!overlay) return;
  overlay.textContent = message;
  overlay.style.opacity = message ? 1 : 0;
}

// Resetear resaltados
function resetAllHighlights() {
  podioSlots.forEach(slot => slot.classList.remove("hovering"));
  imagesContainer.classList.remove("hovering");
}

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

// Inicializar
loadImages();
