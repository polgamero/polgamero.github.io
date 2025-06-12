// Variables globales
let currentQuestion = 0;
let score = 0;
let selectedPhrases = [];
let isAnswering = false;
const totalQuestions = 10;
let timePerQuestion = 10;
let timer;
let totalTime = 0;
let timeLeft = timePerQuestion;

// Elementos DOM
const sidebarEl = document.getElementById('sidebar');
const quoteEl = document.getElementById('quote');
const optionsEl = document.getElementById('options');
const correctSound = document.getElementById('correctSound');
const wrongSound = document.getElementById('wrongSound');

// Base de datos de frases (ejemplo)
const phrases = [
    {
        number: 1,
        quote: "El arte es la única manera de huir sin salir de casa.",
        options: ["Fito Páez", "Charly García", "Mercedes Sosa", "Frase Inventada"],
        correct: 1
    },
    // ... (agregar más frases)
];

// Cargar frases
async function loadPhrases() {
    try {
        const response = await fetch('phrases.json');
        const data = await response.json();
        return data.sort(() => 0.5 - Math.random()).slice(0, totalQuestions);
    } catch (error) {
        console.error("Error cargando frases:", error);
        return phrases.sort(() => 0.5 - Math.random()).slice(0, totalQuestions);
    }
}

// Iniciar juego
async function initGame() {
    selectedPhrases = await loadPhrases();
    if (selectedPhrases.length === 0) {
        quoteEl.textContent = "Error al cargar las frases. Recarga la página.";
        return;
    }

    sidebarEl.innerHTML = '';
    for (let i = 0; i < totalQuestions; i++) {
        const circle = document.createElement('div');
        circle.className = 'circle';
        circle.textContent = i + 1;
        sidebarEl.appendChild(circle);
    }

    loadQuestion();
    showHighscores();
}

// Cargar pregunta
function loadQuestion() {
    document.getElementById('timer-container').style.display = 'block'; // Muestra el timer al cargar nueva pregunta
    
    isAnswering = false;
    clearInterval(timer);
    timeLeft = timePerQuestion;
    updateTimerDisplay();

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
   
    setTimeout(() => {
        timer = setInterval(() => {
            timeLeft--;
            totalTime++;
            updateTimerDisplay();
            
            if (timeLeft <= 0) {
                clearInterval(timer);
                handleTimeOut();
            }
        }, 1000);
    }, 2000);

}

// Manejar tiempo agotado
function handleTimeOut() {
    const circles = document.querySelectorAll('.circle');
    circles[currentQuestion].classList.add('incorrect');
    playSound(wrongSound);
    nextQuestion();
}

// Actualizar timer visual
function updateTimerDisplay() {
    const timerBar = document.getElementById('timer-bar');
    const timerText = document.getElementById('timer-text');
    
    timerText.textContent = timeLeft;
    const percentage = (timeLeft / timePerQuestion) * 100;
    timerBar.style.width = `${percentage}%`;
    
    if (percentage < 30) {
        timerBar.style.backgroundColor = '#f44336';
    } else if (percentage < 60) {
        timerBar.style.backgroundColor = '#ff9800';
    } else {
        timerBar.style.backgroundColor = '#4CAF50';
    }
}

// Verificar respuesta
function checkAnswer(selectedIndex) {
    isAnswering = true;
    clearInterval(timer);
    
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

    nextQuestion();
}

// Siguiente pregunta
function nextQuestion() {
    currentQuestion++;
    if (currentQuestion < totalQuestions) {
        setTimeout(loadQuestion, 1000);
    } else {
        setTimeout(endGame, 1000);
    }
}

// Finalizar juego
function endGame() {
    clearInterval(timer);
    document.getElementById('timer-container').style.display = 'none'; // Oculta el timer
    
    const playerName = prompt(`¡Juego terminado!\nAciertos: ${score}/${totalQuestions}\nTiempo total: ${totalTime} segundos\nIngresa tu nombre:`);
    
    if (playerName) {
        saveScore(playerName.trim() || 'Anónimo', score, totalTime);
    }
    
    quoteEl.textContent = `¡Gracias por jugar!`;
    optionsEl.innerHTML = '<button class="option-btn replay-btn" onclick="location.reload()">Jugar de nuevo</button>';
}

// Formatear tiempo
function formatTime(seconds) {
    return `${seconds} seg`;
}

// Guardar puntaje
function saveScore(name, points, time) {
    const highscores = JSON.parse(localStorage.getItem('triviaHighscores')) || [];
    highscores.push({ 
        name, 
        points, 
        time,
        displayText: `${name} | ${points}/10 | ${formatTime(time)}`
    });
    
    highscores.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        return a.time - b.time;
    });
    
    localStorage.setItem('triviaHighscores', JSON.stringify(highscores));
    showHighscores();
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
            <span>${score.points}/10 - ${formatTime(score.time)}</span>
        `;
        highscoresList.appendChild(li);
    });
}

// Reproducir sonido
function playSound(sound) {
    sound.currentTime = 0;
    sound.volume = 0.3;
    sound.play().catch(e => console.log("Click en la pantalla para activar sonidos"));
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
