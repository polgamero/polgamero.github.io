document.addEventListener('DOMContentLoaded', async () => {
    // ========== CARGAR DATOS DESDE JSON ==========
    let artistsData = {};
    try {
        const response = await fetch('artists-data.json');
        artistsData = await response.json();
    } catch (error) {
        console.error("Error cargando datos de artistas:", error);
        alert("Error al cargar los datos. Recarga la página.");
        return;
    }

    // ========== SELECTORES DEL DOM ==========
    const dropZones = document.querySelectorAll('.drop-zone');
    const artistGrids = document.querySelectorAll('.artists-grid');
    const resetButton = document.getElementById('reset-button');

    // ========== FUNCIÓN PRINCIPAL DE INICIO ==========
    async function init() {
        await loadSavedBand();
        renderArtists();
        setupListeners();
        setupBandNameEditor();
    }

    // ========== RENDERIZADO DE ARTISTAS (ALEATORIO) ==========
    function renderArtists() {
        const savedBand = JSON.parse(localStorage.getItem('dreamBand')) || {};

        artistGrids.forEach(grid => {
            const role = grid.dataset.role;
            grid.innerHTML = '';
            
            // Mezclar artistas y filtrar los que ya están en la banda
            const availableArtists = shuffleArray(artistsData[role] || [])
                .filter(artist => !(savedBand[role]?.id === artist.id));

            // Crear elementos del DOM
            availableArtists.forEach(artist => {
                const artistElement = createArtistElement(artist, role);
                grid.appendChild(artistElement);
            });
        });
    }

    // ========== FUNCIONES AUXILIARES ==========
    function shuffleArray(array) {
        return [...array].sort(() => Math.random() - 0.5);
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

    function getRoleName(role) {
        const roles = {
            singer: 'Cantante',
            guitarist: 'Guitarrista',
            bassist: 'Bajista',
            drummer: 'Baterista'
        };
        return roles[role];
    }

    // ========== DRAG & DROP ==========
    function setupListeners() {
        document.addEventListener('dragstart', onDragStart);
        document.addEventListener('dragend', onDragEnd);

        dropZones.forEach(zone => {
            zone.addEventListener('dragover', e => e.preventDefault());
            zone.addEventListener('dragenter', onDragEnter);
            zone.addEventListener('dragleave', onDragLeave);
            zone.addEventListener('drop', onDrop);
        });

        document.querySelectorAll('.tab-button').forEach(button => {
            button.addEventListener('click', () => {
                document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
                button.classList.add('active');
                document.getElementById(button.dataset.tab + '-tab').classList.add('active');
            });
        });

        resetButton.addEventListener('click', resetBand);
    }

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
            if (zone.dataset.role === data.role) {
                zone.classList.add('active-drop-zone');
            } else {
                zone.classList.add('inactive-drop-zone');
            }
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
        zone.classList.remove('highlight');

        updateDropZone(zone, data);
        removeFromPanel(data.id, data.role);
        saveBand();

        dropZones.forEach(z => z.classList.remove('active-drop-zone', 'inactive-drop-zone'));
    }

    // ========== MANEJO DE ZONAS ==========
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

    function removeFromPanel(id, role) {
        const grid = document.querySelector(`.artists-grid[data-role="${role}"]`);
        const item = grid.querySelector(`.artist-item[data-id="${id}"]`);
        if (item) item.remove();
    }

    function restoreToPanel(data, role) {
        const grid = document.querySelector(`.artists-grid[data-role="${role}"]`);
        if (grid.querySelector(`.artist-item[data-id="${data.id}"]`)) return;

        const el = createArtistElement(data, role);
        grid.appendChild(el);
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

    async function loadSavedBand() {
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
            console.error("Error al cargar la banda:", e);
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

    // ========== INICIAR ==========
    init();
});
