const imagesContainer = document.getElementById("images-container");
const podioSlots = document.querySelectorAll(".podio-slot");
let selectedImage = null;
let hoveredSlot = null;

// Cargar 20 imágenes
for (let i = 1; i <= 20; i++) {
  const img = document.createElement("img");
  img.src = `https://picsum.photos/seed/${i}/195/130`;
  img.classList.add("img-item");
  img.setAttribute("data-origin", "container");
  img.setAttribute("draggable", true);
  enableInteraction(img);
  imagesContainer.appendChild(img);
}

function enableInteraction(img) {
  img.addEventListener("mousedown", () => {
    selectedImage = img;
    img.classList.add("selected");
    setMessage("INGRESAR AL PODIO");
  });

  img.addEventListener("touchstart", () => {
    selectedImage = img;
    img.classList.add("selected");
    setMessage("INGRESAR AL PODIO");
  });

  img.addEventListener("dragstart", () => {
    setMessage("INGRESAR AL PODIO");
  });

  img.addEventListener("dragend", () => {
    setMessage(""); // Limpiar mensaje al soltar
    if (selectedImage) {
      selectedImage.classList.remove("selected");
      selectedImage = null;
    }
  });
}

// Agregar resaltado en hover y mensaje
podioSlots.forEach((slot) => {
  slot.addEventListener("dragover", (event) => {
    event.preventDefault();
    hoveredSlot = slot; // Almacenar la referencia del slot actual
    resetAllHighlights(); // Resetear los resaltados
    slot.classList.add("hovering");
    if (!slot.querySelector("img")) {
      setMessage("INGRESAR AL PODIO");
    } else {
      setMessage("REEMPLAZAR POSICIÓN");
    }
  });

  slot.addEventListener("dragleave", () => {
    slot.classList.remove("hovering");
    setMessage(""); // Limpiar mensaje
  });

  slot.addEventListener("drop", () => {
    if (hoveredSlot && selectedImage) {
      hoveredSlot.classList.remove("hovering");
      if (!hoveredSlot.querySelector("img")) {
        hoveredSlot.appendChild(selectedImage);
      } else {
        swapImages(hoveredSlot); // Llamar a la lógica de intercambio
      }
      setMessage(""); // Limpiar mensaje
    }
  });
});

// Contenedor de imágenes
imagesContainer.addEventListener("dragover", (event) => {
  event.preventDefault();
  imagesContainer.classList.add("hovering");
  setMessage("DEVOLVER A LA PILA");
});

imagesContainer.addEventListener("dragleave", () => {
  imagesContainer.classList.remove("hovering");
  setMessage(""); // Limpiar mensaje
});

imagesContainer.addEventListener("drop", () => {
  if (selectedImage) {
    imagesContainer.appendChild(selectedImage);
    setMessage(""); // Limpiar mensaje
  }
  imagesContainer.classList.remove("hovering");
});

function swapImages(slot) {
  const currentImg = slot.querySelector("img");
  const currentParent = currentImg.parentElement;
  slot.appendChild(selectedImage);
  currentParent.appendChild(currentImg);
}

function setMessage(message) {
  const messages = document.querySelectorAll(".overlay-message");
  messages.forEach((msg) => {
    msg.textContent = message;
    if (message) {
      msg.style.opacity = 1;
    } else {
      msg.style.opacity = 0;
    }
  });
}

function resetAllHighlights() {
  // Limpiar resaltado de todos los slots
  podioSlots.forEach(slot => slot.classList.remove("hovering"));
  imagesContainer.classList.remove("hovering");
}
