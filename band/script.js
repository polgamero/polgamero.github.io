document.addEventListener('DOMContentLoaded', async () => {
    // ========== CARGAR DATOS DE ARTISTAS ==========
    let artistsData = {};
    try {
        const response = await fetch('artists-data.json');
        artistsData = await response.json();
    } catch (error) {
        console.error("Error cargando datos:", error);
        alert("Error al cargar los artistas. Recarga la página.");
        return;
    }

    // ========== SELECTORES DEL DOM ==========
    const dropZones = document.querySelectorAll('.drop-zone');
    const artistGrids = document.querySelectorAll('.artists-grid');
    const resetButton = document.getElementById('reset-button');
    let selectedArtist = null; // Para el sistema touch

    // ========== INICIALIZACIÓN ==========
    init();

    async function init() {
        loadSavedBand();
        renderArtists();
        setupListeners();
        setupBandNameEditor();
        detectTouchDevice();
    }

    // ========== SISTEMA TOUCH (MÓVIL) ==========
    function detectTouchDevice() {
        if ('ontouchstart' in window || navigator.maxTouchPoints) {
            document.body.classList.add('touch-mode');
        }
    }

    function handleTouchSelection(e) {
        const item = e.currentTarget;
        
        // Resetear selección anterior
        document.querySelectorAll('.artist-item').forEach(el => {
            el.classList.remove('selected-touch');
            el.dataset.touch = "false";
        });
        
        // Seleccionar nuevo artista
        if (!selectedArtist || selectedArtist !== item) {
            selectedArtist = item;
            item.classList.add('selected-touch');
            item.dataset.touch = "true";
            
            // Activar zonas compatibles
            document.querySelectorAll('.drop-zone').forEach(zone => {
                zone.classList.remove('active-touch');
                if (zone.dataset.role === item.dataset.role) {
                    zone.dataset.active = "true";
                    zone.classList.add('active-touch');
                } else {
                    zone.dataset.active = "false";
                }
            });
        } else {
            selectedArtist = null;
        }
    }

    function handleTouchDrop(e) {
        const zone = e.currentTarget;
        
        if (zone.dataset.active === "true" && selectedArtist) {
            const data = {
                id: selectedArtist.dataset.id,
                role: selectedArtist.dataset.role,
                image: selectedArtist.querySelector('img').src,
                name: selectedArtist.querySelector('.artist-name').textContent
            };
            
            if (!zone.querySelector('img')) {
                updateDropZone(zone, data);
                removeFromPanel(data.id, data.role);
                saveBand();
            }
        }
        
        // Resetear selección
        resetTouchSelection();
    }

    function resetTouchSelection() {
        document.querySelectorAll('.artist-item, .drop-zone').forEach(el => {
            el.classList.remove('selected-touch', 'active-touch');
            el.dataset.touch = "false";
            el.dataset.active = "false";
        });
        selectedArtist = null;
    }

    // ========== SISTEMA DRAG & DROP (DESKTOP) ==========
    function onDragStart(e) {
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
            zone.classList.toggle('active-drop-zone', zone.dataset.role === data.role);
            zone.classList.toggle('inactive-drop-zone', zone.dataset.role !== data.role);
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

        const existingImg = zone.querySelector('img');
        if (existingImg) return;

        const data = JSON.parse(e.dataTransfer.getData('text/plain'));
        processArtistDrop(zone, data);
    }

    // ========== FUNCIONES COMPARTIDAS ==========
    function processArtistDrop(zone, data) {
        zone.classList.remove('highlight');
        updateDropZone(zone, data);
        removeFromPanel(data.id, data.role);
        saveBand();
        resetTouchSelection();
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

    // ========== RENDERIZADO DE ARTISTAS ==========
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
            edit.style.display = 'none';
            display.style.display = 'flex';
        });

        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') saveBtn.click();
        });
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
