const imagesContainer = document.getElementById("images-container");
const podioSlots = document.querySelectorAll(".podio-slot");
let selectedImage = null;

// Cargar 20 imágenes
for (let i = 1; i <= 20; i++) {
  const img = document.createElement("img");
  img.src = `https://picsum.photos/seed/${i}/195/130`;
  img.classList.add("img-item");
  img.setAttribute("data-origin", "container");
  enableInteraction(img);
  imagesContainer.appendChild(img);
}

function enableInteraction(img) {
  // PC
  img.addEventListener("mousedown", () => {
    selectedImage = img;
    img.classList.add("selected");
  });

  // Touch
  img.addEventListener("touchstart", () => {
    selectedImage = img;
    img.classList.add("selected");
  });
}

// Limpiar selección al soltar
document.addEventListener("mouseup", () => {
  if (selectedImage) selectedImage.classList.remove("selected");
});

document.addEventListener("touchend", (e) => {
  if (!selectedImage) return;

  const touch = e.changedTouches[0];
  const dropTarget = document.elementFromPoint(touch.clientX, touch.clientY);
  handleDrop(dropTarget);
});

document.addEventListener("click", (e) => {
  if (!selectedImage) return;
  handleDrop(e.target);
});

function handleDrop(target) {
  if (!selectedImage) return;

  if (target.classList.contains("podio-slot")) {
    placeInSlot(target);
  } else if (target.closest(".podio-slot")) {
    placeInSlot(target.closest(".podio-slot"));
  } else if (target.id === "images-container" || target.closest("#images-container")) {
    imagesContainer.appendChild(selectedImage);
  }

  selectedImage.classList.remove("selected");
  selectedImage = null;
}

function placeInSlot(slot) {
  const existingImg = slot.querySelector("img");

  if (existingImg) {
    const parentOfSelected = selectedImage.parentElement;
    slot.appendChild(selectedImage);
    parentOfSelected.appendChild(existingImg);
  } else {
    slot.appendChild(selectedImage);
  }
}
