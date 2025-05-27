document.addEventListener('DOMContentLoaded', async () => {
    // ========== CARGAR DATOS ==========
    let artistsData = {};
    try {
        const response = await fetch('artists-data.json');
        artistsData = await response.json();
    } catch (error) {
        console.error("Error cargando artistas:", error);
        alert("Error al cargar los datos. Recarga la página.");
        return;
    }

    // ========== SELECTORES ==========
    const dropZones = document.querySelectorAll('.drop-zone');
    const artistGrids = document.querySelectorAll('.artists-grid');
    const resetButton = document.getElementById('reset-button');
    let selectedArtist = null;

    // ========== INICIALIZACIÓN ==========
    init();

    function init() {
        loadSavedBand();
        renderArtists();
        setupListeners();
        setupBandNameEditor();
        detectTouchDevice();
        setupShareButton();
    }

    // ========== SISTEMA TOUCH (MÓVIL) ==========
    function detectTouchDevice() {
        if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
            document.body.classList.add('touch-mode');
        }
    }

    function handleTouchSelection(e) {
        const item = e.currentTarget;
        
        // Deseleccionar si ya está seleccionado
        if (selectedArtist === item) {
            resetTouchSelection();
            return;
        }

        resetTouchSelection(); // Limpiar selección previa
        selectedArtist = item;
        item.classList.add('selected-touch');
        item.dataset.touch = "true";

        // Activar solo zonas compatibles
        dropZones.forEach(zone => {
            zone.classList.remove('active-touch');
            if (zone.dataset.role === item.dataset.role) {
                zone.dataset.active = "true";
                zone.classList.add('active-touch');
            } else {
                zone.dataset.active = "false";
            }
        });
    }

    function handleTouchDrop(e) {
        const zone = e.currentTarget;
        if (zone.dataset.active !== "true" || !selectedArtist) return;

        const data = {
            id: selectedArtist.dataset.id,
            role: selectedArtist.dataset.role,
            image: selectedArtist.querySelector('img').src,
            name: selectedArtist.querySelector('.artist-name').textContent
        };

        if (!zone.querySelector('img')) {
            processArtistDrop(zone, data);
        }
        resetTouchSelection();
    }

    function resetTouchSelection() {
        if (selectedArtist) {
            selectedArtist.classList.remove('selected-touch');
            selectedArtist.dataset.touch = "false";
            selectedArtist = null;
        }
        dropZones.forEach(zone => {
            zone.classList.remove('active-touch');
            zone.dataset.active = "false";
        });
    }

    // ========== SISTEMA DRAG & DROP (DESKTOP) ==========
    function onDragStart(e) {
        resetTouchSelection(); // Limpiar selección touch si existe
        
        const item = e.target.closest('.artist-item');
        if (!item) return;

        const data = {
            id: item.dataset.id,
            role: item.dataset.role,
            image: item.querySelector('img').src,
            name: item.querySelector('.artist-name').textContent
        };
        e.dataTransfer.setData('text/plain', JSON.stringify(data));

        dropZones.forEach(zone => {
            zone.classList.remove('active-drop-zone', 'inactive-drop-zone');
            zone.classList.add(zone.dataset.role === data.role ? 'active-drop-zone' : 'inactive-drop-zone');
        });
    }

    function onDragEnd() {
        dropZones.forEach(zone => {
            zone.classList.remove('active-drop-zone', 'inactive-drop-zone', 'highlight');
        });
    }

    function onDragEnter(e) {
        const zone = e.target.closest('.drop-zone');
        if (!zone || zone.classList.contains('inactive-drop-zone')) return;
        zone.classList.add('highlight');
    }

    function onDragLeave(e) {
        const zone = e.target.closest('.drop-zone');
        if (zone) zone.classList.remove('highlight');
    }

    function onDrop(e) {
        e.preventDefault();
        const zone = e.target.closest('.drop-zone');
        if (!zone || zone.classList.contains('inactive-drop-zone')) return;

        const data = JSON.parse(e.dataTransfer.getData('text/plain'));
        processArtistDrop(zone, data);
    }

    // ========== FUNCIONES COMPARTIDAS ==========
    function processArtistDrop(zone, data) {
        // Resetear todos los estados visuales
        dropZones.forEach(z => {
            z.classList.remove('highlight', 'active-drop-zone', 'inactive-drop-zone', 'active-touch');
            z.dataset.active = "false";
        });

        if (!zone.querySelector('img')) {
            updateDropZone(zone, data);
            removeFromPanel(data.id, data.role);
            saveBand();
        }
    }

    function updateDropZone(zone, data) {
        zone.innerHTML = `
            <img src="${data.image}" class="artist-image" alt="${data.name}" onerror="this.src='assets/instruments/placeholder.png'">
            <button class="remove-artist" data-id="${data.id}">✕</button>
        `;
        zone.querySelector('.remove-artist').addEventListener('click', () => {
            resetZone(zone, data);
        });
    }

    function resetZone(zone, data) {
        const role = zone.dataset.role;
        zone.innerHTML = `<div class="placeholder">${getRoleName(role)}</div>`;
        restoreToPanel(data, role);
        saveBand();
    }

    // ========== RENDERIZADO ==========
    function renderArtists() {
        const savedBand = JSON.parse(localStorage.getItem('dreamBand')) || {};

        artistGrids.forEach(grid => {
            const role = grid.dataset.role;
            grid.innerHTML = '';
            
            shuffleArray(artistsData[role] || []).forEach(artist => {
                if (!(savedBand[role]?.id === artist.id)) {
                    grid.appendChild(createArtistElement(artist, role));
                }
            });
        });
    }

    function createArtistElement(artist, role) {
        const el = document.createElement('div');
        el.className = 'artist-item';
        el.draggable = true;
        el.dataset.id = artist.id;
        el.dataset.role = role;
        el.innerHTML = `
            <img src="${artist.image}" alt="${artist.name}" onerror="this.src='assets/instruments/placeholder.png'">
            <div class="artist-name">${artist.name}</div>
        `;
        return el;
    }

    // ========== UTILIDADES ==========
    function shuffleArray(array) {
        return [...array].sort(() => Math.random() - 0.5);
    }

    function getRoleName(role) {
        const roles = {
            singer: 'Cantante',
            guitarist: 'Guitarrista',
            bassist: 'Bajista',
            drummer: 'Baterista'
        };
        return roles[role];
    }

    function removeFromPanel(id, role) {
        const grid = document.querySelector(`.artists-grid[data-role="${role}"]`);
        const item = grid.querySelector(`.artist-item[data-id="${id}"]`);
        if (item) item.remove();
    }

    function restoreToPanel(data, role) {
        const grid = document.querySelector(`.artists-grid[data-role="${role}"]`);
        if (!grid.querySelector(`.artist-item[data-id="${data.id}"]`)) {
            grid.appendChild(createArtistElement(data, role));
        }
    }

    // ========== PERSISTENCIA ==========
    function saveBand() {
        const band = {};
        dropZones.forEach(zone => {
            const img = zone.querySelector('img');
            const removeBtn = zone.querySelector('.remove-artist');
            if (img && removeBtn) {
                band[zone.dataset.role] = {
                    id: removeBtn.dataset.id,
                    name: img.alt,
                    image: img.src
                };
            }
        });
        localStorage.setItem('dreamBand', JSON.stringify(band));
         // Disparar evento personalizado
        document.dispatchEvent(new CustomEvent('bandUpdated'));
    }

    function loadSavedBand() {
        try {
            const saved = JSON.parse(localStorage.getItem('dreamBand'));
            if (!saved) return;

            Object.entries(saved).forEach(([role, data]) => {
                const zone = document.querySelector(`.drop-zone[data-role="${role}"]`);
                if (zone && data.id) {
                    updateDropZone(zone, data);
                }
            });
        } catch (e) {
            console.error("Error al cargar banda:", e);
            localStorage.removeItem('dreamBand');
        }
    }

    // ========== EDITOR DE NOMBRE ==========
    function setupBandNameEditor() {
        const display = document.getElementById('band-name-display');
        const edit = document.getElementById('band-name-edit');
        const text = document.getElementById('band-name-text');
        const input = document.getElementById('band-name-input');
        const saveBtn = document.querySelector('.save-band-name');

        const savedName = localStorage.getItem('bandName');
        if (savedName) text.textContent = savedName;

        text.addEventListener('click', () => {
            display.style.display = 'none';
            edit.style.display = 'flex';
            input.value = text.textContent === "Nombre de tu banda" ? "" : text.textContent;
            input.focus();
        });

        saveBtn.addEventListener('click', () => {
            const newName = input.value.trim() || "Nombre de tu banda";
            text.textContent = newName;
            localStorage.setItem('bandName', newName);
            document.dispatchEvent(new CustomEvent('bandUpdated'));
            edit.style.display = 'none';
            display.style.display = 'flex';
        });

        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') saveBtn.click();
        });
    }

    // ========== COMPARTIR BANDA ==========
    function setupShareButton() {
        const shareButton = document.getElementById('share-button');
        const checkShareConditions = () => {
            const isBandComplete = [...dropZones].every(zone => zone.querySelector('img'));
            const bandName = document.getElementById('band-name-text').textContent;
            const isDefaultName = bandName === "Nombre de tu banda";
            
            shareButton.style.display = (isBandComplete && !isDefaultName) ? 'block' : 'none';
        };
    
        // Verificar condiciones al cambiar cualquier cosa
        document.addEventListener('bandUpdated', checkShareConditions);
        
        // Configurar el compartir
        shareButton.addEventListener('click', shareBand);
    }
    
    async function shareBand() {
        const stage = document.querySelector('.stage');
        
        // Usamos html2canvas para capturar el div
        const canvas = await html2canvas(stage, {
            backgroundColor: null,
            scale: 1 // Mejor calidad para móviles
        });
        
        canvas.toBlob(async (blob) => {
            const file = new File([blob], "mi_banda.png", { type: "image/png" });
            
            // API de compartir nativa
            if (navigator.share) {
                try {
                    await navigator.share({
                        title: "Mirá mi banda creada con 'La Banda de tus Sueños'",
                        files: [file]
                    });
                } catch (err) {
                    console.log("Compartir cancelado:", err);
                }
            } else {
                // Fallback para desktop
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = "mi_banda.png";
                link.click();
            }
        }, 'image/png');
    }
    // ========== RESET ==========
    function resetBand() {
        if (!confirm('¿Reiniciar tu banda?')) return;

        dropZones.forEach(zone => {
            const role = zone.dataset.role;
            const img = zone.querySelector('img');
            if (img) {
                const removeBtn = zone.querySelector('.remove-artist');
                resetZone(zone, {
                    id: removeBtn.dataset.id,
                    name: img.alt,
                    image: img.src
                });
            } else {
                zone.innerHTML = `<div class="placeholder">${getRoleName(role)}</div>`;
            }
        });

        document.getElementById('band-name-text').textContent = "Nombre de tu banda";
        localStorage.removeItem('bandName');
        localStorage.removeItem('dreamBand');
    }

    // ========== CONFIGURAR EVENTOS ==========
    function setupListeners() {
        // Sistema DRAG (desktop)
        document.addEventListener('dragstart', onDragStart);
        document.addEventListener('dragend', onDragEnd);

        // Sistema TOUCH (móvil)
        document.querySelectorAll('.artist-item').forEach(item => {
            item.addEventListener('click', handleTouchSelection);
        });

        document.querySelectorAll('.drop-zone').forEach(zone => {
            zone.addEventListener('click', handleTouchDrop);
            zone.addEventListener('dragover', e => e.preventDefault());
            zone.addEventListener('dragenter', onDragEnter);
            zone.addEventListener('dragleave', onDragLeave);
            zone.addEventListener('drop', onDrop);
        });

        // Tabs
        document.querySelectorAll('.tab-button').forEach(button => {
            button.addEventListener('click', () => {
                document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
                button.classList.add('active');
                document.getElementById(button.dataset.tab + '-tab').classList.add('active');
            });
        });

        // Reset
        resetButton.addEventListener('click', resetBand);
    }
});
