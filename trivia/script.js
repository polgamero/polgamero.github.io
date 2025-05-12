// Variables globales
let currentQuestion = 0;
let score = 0;
let selectedPhrases = [];
let isAnswering = false;
const totalQuestions = 10;

// Elementos DOM
const sidebarEl = document.getElementById('sidebar');
const quoteEl = document.getElementById('quote');
const optionsEl = document.getElementById('options');
const correctSound = document.getElementById('correctSound');
const wrongSound = document.getElementById('wrongSound');

// Cargar frases desde JSON
async function loadPhrases() {
    try {
        const response = await fetch('phrases.json');
        const phrases = await response.json();
        return phrases.sort(() => 0.5 - Math.random()).slice(0, totalQuestions);
    } catch (error) {
        console.error("Error cargando frases:", error);
        return [];
    }
}

// Iniciar juego
async function initGame() {
    selectedPhrases = await loadPhrases();
    if (selectedPhrases.length === 0) {
        quoteEl.textContent = "Error al cargar las frases. Recarga la página.";
        return;
    }

    // Crear círculos en sidebar
    sidebarEl.innerHTML = '';
    for (let i = 0; i < totalQuestions; i++) {
        const circle = document.createElement('div');
        circle.className = 'circle';
        circle.textContent = i + 1;
        sidebarEl.appendChild(circle);
    }

    loadQuestion();
}

// Cargar pregunta
function loadQuestion() {
    isAnswering = false;
    const question = selectedPhrases[currentQuestion];
    quoteEl.textContent = `"${question.quote}"`;

    optionsEl.innerHTML = '';
    question.options.forEach((option, index) => {
        const button = document.createElement('button');
        button.className = 'option-btn';
        button.textContent = option;
        button.onclick = () => !isAnswering && checkAnswer(index);
        optionsEl.appendChild(button);
    });
}

// Verificar respuesta
function checkAnswer(selectedIndex) {
    isAnswering = true;
    const question = selectedPhrases[currentQuestion];
    const circles = document.querySelectorAll('.circle');

    if (selectedIndex === question.correct) {
        circles[currentQuestion].classList.add('correct');
        playSound(correctSound);
        score++;
    } else {
        circles[currentQuestion].classList.add('incorrect');
        playSound(wrongSound);
    }

    currentQuestion++;
    if (currentQuestion < totalQuestions) {
        setTimeout(loadQuestion, 500);
    } else {
        setTimeout(endGame, 500);
    }
}

// Reproducir sonido
function playSound(sound) {
    sound.currentTime = 0;
    sound.volume = 0.3;
    sound.play().catch(e => console.log("Click en la pantalla para activar sonidos"));
}

// Mostrar highscores
function showHighscores() {
    const highscores = JSON.parse(localStorage.getItem('triviaHighscores')) || [];
    const highscoresList = document.getElementById('highscores-list');
    
    highscoresList.innerHTML = '';
    highscores.slice(0, 10).forEach((score, index) => {
        const li = document.createElement('li');
        li.innerHTML = `
            <span>${index + 1}. ${score.name}</span>
            <span>${score.points}/${totalQuestions}</span>
        `;
        highscoresList.appendChild(li);
    });
}

// Guardar score
function saveScore(playerName, points) {
    const highscores = JSON.parse(localStorage.getItem('triviaHighscores')) || [];
    highscores.push({ name: playerName, points });
    highscores.sort((a, b) => b.points - a.points);
    localStorage.setItem('triviaHighscores', JSON.stringify(highscores));
    showHighscores();
}

// Finalizar juego
function endGame() {
    const playerName = prompt(`¡Juego terminado! Puntuación: ${score}/${totalQuestions}\nIngresa tu nombre:`);
    
    if (playerName && playerName.trim() !== '') {
        saveScore(playerName.trim(), score);
    } else {
        saveScore('Anónimo', score);
    }
    
    quoteEl.textContent = `¡Gracias por jugar!`;
    optionsEl.innerHTML = '<button class="option-btn" onclick="location.reload()">Jugar de nuevo</button>';
}

// Borrar highscores
document.getElementById('clear-highscores').onclick = () => {
    if (confirm("¿Borrar todos los puntajes guardados?")) {
        localStorage.removeItem('triviaHighscores');
        showHighscores();
    }
};

// Iniciar al cargar
window.onload = function() {
    initGame();
    showHighscores();
};
