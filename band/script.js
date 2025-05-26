document.addEventListener('DOMContentLoaded', () => {
    // ========== GENERACIÓN DINÁMICA DE ARTISTAS ==========
    function generateArtists(role, count) {
        const roleNames = {
            singer: 'Cantante',
            guitarist: 'Guitarrista',
            bassist: 'Bajista',
            drummer: 'Baterista'
        };
        
        return Array.from({length: count}, (_, i) => ({
            id: `${role.charAt(0)}${i+1}`,
            name: `${roleNames[role]} ${i+1}`,
            image: `assets/artists/${role}s/${role}${i+1}.jpg`
        }));
    }

    const artistsConfig = {
        singer: 15,
        guitarist: 15,
        bassist: 3,
        drummer: 3
    };

    const artistsData = Object.fromEntries(
        Object.entries(artistsConfig).map(([role, count]) => [role, generateArtists(role, count)])
    );

    // ========== SELECTORES DEL DOM ==========
    const dropZones = document.querySelectorAll('.drop-zone');
    const artistGrids = document.querySelectorAll('.artists-grid');
    const resetButton = document.getElementById('reset-button');

    // ========== FUNCIÓN PRINCIPAL DE INICIO ==========
    function init() {
        loadSavedBand();
        renderArtists();
        setupListeners();
        setupBandNameEditor();
    }

    // ========== EDITOR DE NOMBRE DE BANDA ==========
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

    // ========== RENDERIZADO DE ARTISTAS ==========
    function renderArtists() {
        const savedBand = JSON.parse(localStorage.getItem('dreamBand')) || {};

        artistGrids.forEach(grid => {
            const role = grid.dataset.role;
            grid.innerHTML = '';
            
            // Obtener una copia aleatorizada del array de artistas
            const shuffledArtists = [...artistsData[role]].sort(() => Math.random() - 0.5);

            shuffledArtists.forEach(artist => {
                const isInBand = savedBand[role] && savedBand[role].id === artist.id;
                if (isInBand) return;

                const el = document.createElement('div');
                el.className = 'artist-item';
                el.draggable = true;
                el.dataset.id = artist.id;
                el.dataset.role = role;
                el.innerHTML = `
                    <img src="${artist.image}" alt="${artist.name}" onerror="this.src='assets/instruments/placeholder.png'">
                    <div class="artist-name" style="display:none">${artist.name}</div>
                `;
                grid.appendChild(el);
            });
        });
    }

    // ========== CONFIGURACIÓN DE EVENTOS ==========
    function setupListeners() {
        // Drag & Drop
        document.addEventListener('dragstart', onDragStart);
        document.addEventListener('dragend', onDragEnd);

        dropZones.forEach(zone => {
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

    // ========== FUNCIONES DRAG & DROP ==========
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

    // ========== MANEJO DE ZONAS DE DROP ==========
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

    // ========== MANEJO DEL PANEL DE ARTISTAS ==========
    function removeFromPanel(id, role) {
        const grid = document.querySelector(`.artists-grid[data-role="${role}"]`);
        const item = grid.querySelector(`.artist-item[data-id="${id}"]`);
        if (item) item.remove();
    }

    function restoreToPanel(data, role) {
        const grid = document.querySelector(`.artists-grid[data-role="${role}"]`);
        if (grid.querySelector(`.artist-item[data-id="${data.id}"]`)) return;

        const el = document.createElement('div');
        el.className = 'artist-item';
        el.draggable = true;
        el.dataset.id = data.id;
        el.dataset.role = role;
        el.innerHTML = `
            <img src="${data.image}" alt="${data.name}" onerror="this.src='assets/instruments/placeholder.png'">
            <div class="artist-name" style="display:none">${data.name}</div>
        `;
        grid.appendChild(el);
    }

    // ========== FUNCIONES AUXILIARES ==========
    function getRoleName(role) {
        const roles = {
            singer: 'Cantante',
            guitarist: 'Guitarrista',
            bassist: 'Bajista',
            drummer: 'Baterista'
        };
        return roles[role];
    }

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
            console.error("Error al cargar la banda:", e);
            localStorage.removeItem('dreamBand');
        }
    }

    // ========== RESET COMPLETO ==========
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

    // ========== INICIAR APLICACIÓN ==========
    init();
});
