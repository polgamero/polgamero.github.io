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

  // Si soltás sobre la imagen misma, usá su contenedor
  if (dropTarget.classList.contains("draggable")) {
    dropTarget = dropTarget.parentElement;
  }

  // Si soltás sobre un podio-slot con una imagen, intercambiamos
  if (dropTarget.classList.contains("podio-slot")) {
    const existingImg = dropTarget.querySelector("img");

    if (existingImg && existingImg.id !== draggedId) {
      const originSlot = draggedImg.parentElement;

      // Intercambiar lugares
      dropTarget.replaceChild(draggedImg, existingImg);
      originSlot.appendChild(existingImg);
    } else {
      // Si está vacío o es la misma, simplemente mover
      const label = dropTarget.querySelector("p").textContent;
      dropTarget.innerHTML = `<p>${label}</p>`;
      dropTarget.appendChild(draggedImg);
    }
  }

  // Si se suelta sobre el contenedor de imágenes
  else if (dropTarget.id === "images-container") {
    dropTarget.appendChild(draggedImg);
  }
}
