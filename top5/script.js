function allowDrop(event) {
  event.preventDefault();
}

function drag(event) {
  event.dataTransfer.setData("text/plain", event.target.id);
}

function drop(event) {
  event.preventDefault();
  const draggedId = event.dataTransfer.getData("text/plain");
  const draggedImg = document.getElementById(draggedId);

  let dropTarget = event.target;

  // Si se suelta sobre la imagen en vez del contenedor
  if (dropTarget.classList.contains("draggable")) {
    dropTarget = dropTarget.parentElement;
  }

  // Intercambio si el destino es un slot con imagen
  if (dropTarget.classList.contains("podio-slot")) {
    const existingImg = dropTarget.querySelector("img");

    if (existingImg && existingImg.id !== draggedId) {
      const originSlot = draggedImg.parentElement;

      // Intercambiar imágenes entre slots
      dropTarget.replaceChild(draggedImg, existingImg);
      originSlot.appendChild(existingImg);
    } else {
      // Slot vacío o misma imagen
      const rankNum = dropTarget.querySelector(".rank-number")?.outerHTML || "";
      dropTarget.innerHTML = rankNum;
      dropTarget.appendChild(draggedImg);
    }
  }

  // Volver al contenedor derecho
  else if (dropTarget.id === "images-container") {
    dropTarget.appendChild(draggedImg);
  }
}

// Eventos táctiles (para móviles)
let touchStartX = 0;
let touchStartY = 0;
let isTouchMove = false;

function touchStart(event) {
  touchStartX = event.touches[0].clientX;
  touchStartY = event.touches[0].clientY;
  isTouchMove = false;
}

function touchMove(event) {
  const dx = Math.abs(event.touches[0].clientX - touchStartX);
  const dy = Math.abs(event.touches[0].clientY - touchStartY);

  if (dx > 5 || dy > 5) {
    isTouchMove = true;
  }
}

function touchEnd(event) {
  if (isTouchMove) {
    const draggedImg = event.target;
    if (draggedImg && draggedImg.classList.contains("draggable")) {
      const container = draggedImg.parentElement;

      // Aquí el código para simular un "drop" similar al drag
      const dropTarget = document.elementFromPoint(event.changedTouches[0].clientX, event.changedTouches[0].clientY);
      if (dropTarget) {
        drop(dropTarget);
      }
    }
  }
}

document.querySelectorAll(".draggable").forEach(img => {
  img.addEventListener("touchstart", touchStart, { passive: false });
  img.addEventListener("touchmove", touchMove, { passive: false });
  img.addEventListener("touchend", touchEnd, { passive: false });
});
