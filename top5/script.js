function allowDrop(event) {
    event.preventDefault();
}

function drag(event) {
    event.dataTransfer.setData("text", event.target.id);
}

function drop(event) {
    event.preventDefault();
    const imgId = event.dataTransfer.getData("text");
    const draggedImg = document.getElementById(imgId);

    // Evita duplicados: si ya está en otro contenedor, lo mueve
    if (event.target.classList.contains("podio-slot") || event.target.id === "images-container") {
        // Si el target es una imagen dentro de un slot, redirige al slot padre
        const dropTarget = event.target.classList.contains("draggable")
            ? event.target.parentElement
            : event.target;

        // Limpia el slot si ya tenía imagen
        if (dropTarget.classList.contains("podio-slot")) {
            dropTarget.innerHTML = `<p>${dropTarget.querySelector('p').textContent}</p>`;
        }

        dropTarget.appendChild(draggedImg);
    }
}
