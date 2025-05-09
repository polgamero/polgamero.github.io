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

// Cargar imágenes iniciales (20 aleatorias)
    function loadImages() {
        imagesContainer.innerHTML = '';
        
        // Crear copia del array original para no modificarlo
        const imagenesAleatorias = [...imagenes];
        
        // Mezclar el array aleatoriamente
        for (let i = imagenesAleatorias.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [imagenesAleatorias[i], imagenesAleatorias[j]] = [imagenesAleatorias[j], imagenesAleatorias[i]];
        }
        
        // Tomar solo las primeras 20 imágenes
        const imagenesParaMostrar = imagenesAleatorias.slice(0, 20);
        
        imagenesParaMostrar.forEach((imagen) => {
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
  const icons = ['🥇', '🥈', '🥉', '⭐', '🔥'];
  slot.innerHTML = `
    <div class="rank-icon rank-${rank}">${icons[rank-1]}</div>
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

// Habilitar interacción
function enableInteraction(img) {
  img.addEventListener("dragstart", (e) => {
    selectedImage = img;
    img.classList.add("dragging");
    
    // Mostrar mensaje adecuado
    const message = img.parentElement.classList.contains("podio-slot") 
      ? "REEMPLAZAR POSICIÓN" 
      : "INGRESAR AL PODIO";
      
    if (img.parentElement.querySelector(".overlay-message")) {
      img.parentElement.querySelector(".overlay-message").textContent = message;
    }
    
    // Usar efecto de fantasma para drag
    e.dataTransfer.setDragImage(img, e.offsetX, e.offsetY);
  });

  img.addEventListener("dragend", () => {
    img.classList.remove("dragging");
    if (img.parentElement.querySelector(".overlay-message")) {
      img.parentElement.querySelector(".overlay-message").textContent = "";
    }
    selectedImage = null;
  });
}

// Eventos del podio
podioSlots.forEach((slot) => {
  slot.addEventListener("dragover", (e) => {
    e.preventDefault();
    slot.classList.add("hovering");
    const message = slot.querySelector("img") ? "REEMPLAZAR POSICIÓN" : "INGRESAR AL PODIO";
    slot.querySelector(".overlay-message").textContent = message;
  });

  slot.addEventListener("dragleave", () => {
    slot.classList.remove("hovering");
    slot.querySelector(".overlay-message").textContent = "";
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

let hoverTimeout;
let isOverContainer = false;

imagesContainer.addEventListener("dragover", (e) => {
  e.preventDefault();
  clearTimeout(hoverTimeout);
  
  if (!isOverContainer) {
    isOverContainer = true;
    imagesContainer.classList.add("hovering");
  }
});

imagesContainer.addEventListener("dragleave", (e) => {
  // Solo activar si el dragleave es realmente fuera del contenedor
  if (!e.currentTarget.contains(e.relatedTarget)) {
    hoverTimeout = setTimeout(() => {
      isOverContainer = false;
      imagesContainer.classList.remove("hovering");
    }, 50); // Pequeño delay para evitar parpadeo
  }
});

imagesContainer.addEventListener("drop", (e) => {
  e.preventDefault();
  clearTimeout(hoverTimeout);
  isOverContainer = false;
  imagesContainer.classList.remove("hovering");
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
