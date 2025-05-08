// Permitir que las imágenes se puedan soltar en los espacios
function allowDrop(event) {
    event.preventDefault();
}

// Función para iniciar el arrastre de las imágenes
function drag(event) {
    event.dataTransfer.setData("text", event.target.id);
}

// Función para manejar el evento de soltar las imágenes en el podio
function drop(event) {
    event.preventDefault();
    const data = event.dataTransfer.getData("text");
    const draggedImage = document.getElementById(data);
    
    // Obtener el slot donde se soltó la imagen
    const targetSlot = event.target;

    if (targetSlot.classList.contains('podio-slot')) {
        // Colocar la imagen dentro del slot
        targetSlot.innerHTML = '';  // Limpiar cualquier contenido previo
        targetSlot.appendChild(draggedImage);
    }
}

