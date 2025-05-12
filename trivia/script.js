// Variables globales
let currentQuestion = 0;
let score = 0;
let selectedPhrases = [];
let isAnswering = false; // Bloquear múltiples clicks
const totalQuestions = 10;

// Elementos DOM
const sidebarEl = document.getElementById('sidebar');
const quoteEl = document.getElementById('quote');
const optionsEl = document.getElementById('options');

// Sonidos
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
    isAnswering = false; // Resetear bloqueo
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
    isAnswering = true; // Bloquear nuevos clicks
    
    const question = selectedPhrases[currentQuestion];
    const circles = document.querySelectorAll('.circle');

    // Marcar respuesta
    if (selectedIndex === question.correct) {
        circles[currentQuestion].classList.add('correct');
        playSound(correctSound);
        score++;
    } else {
        circles[currentQuestion].classList.add('incorrect');
        playSound(wrongSound);
    }

    // Siguiente pregunta o fin del juego
    currentQuestion++;
    if (currentQuestion < totalQuestions) {
        setTimeout(loadQuestion, 500); // 500ms en lugar de 1000ms
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

// Finalizar juego
function endGame() {
    quoteEl.textContent = `¡Juego terminado! Puntuación: ${score}/${totalQuestions}`;
    optionsEl.innerHTML = '<button class="option-btn" onclick="location.reload()">Jugar de nuevo</button>';
}

// Iniciar al cargar la página
window.onload = initGame;