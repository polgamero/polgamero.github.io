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
