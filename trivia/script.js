// Variables globales
let currentQuestion = 0;
let score = 0;
let selectedPhrases = [];
let isAnswering = false;
let isTransitioning = false;
const totalQuestions = 10;
let timePerQuestion = 10;
let timer;
let totalTime = 0;
let timeLeft = timePerQuestion;
let timerDelay;

// Elementos DOM
const sidebarEl = document.getElementById('sidebar');
const quoteEl = document.getElementById('quote');
const optionsEl = document.getElementById('options');
const correctSound = document.getElementById('correctSound');
const wrongSound = document.getElementById('wrongSound');
const timerContainer = document.getElementById('timer-container');
const timerBar = document.getElementById('timer-bar');
const timerText = document.getElementById('timer-text');
const highscoresList = document.getElementById('highscores-list');

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

// Función para deshabilitar/habilitar botones
function toggleOptions(disabled) {
    const buttons = document.querySelectorAll('.option-btn');
    buttons.forEach(button => {
        button.disabled = disabled;
        if (disabled) {
            button.classList.add('disabled');
        } else {
            button.classList.remove('disabled');
        }
    });
}

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

    // Reiniciar variables del juego
    currentQuestion = 0;
    score = 0;
    totalTime = 0;
    isAnswering = false;
    isTransitioning = false;

    // Configurar sidebar
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
    timerContainer.style.display = 'block';
    isAnswering = false;
    clearInterval(timer);
    clearTimeout(timerDelay);
    timeLeft = timePerQuestion;
    updateTimerDisplay();

    const question = selectedPhrases[currentQuestion];
    quoteEl.textContent = `"${question.quote}"`;

    // Deshabilitar botones durante el período de gracia
    isTransitioning = true;
    toggleOptions(true);

    // Iniciar timer después de 1 segundo (período de gracia)
    timerDelay = setTimeout(() => {
        isTransitioning = false;
        toggleOptions(false);
        
        timer = setInterval(() => {
            timeLeft--;
            totalTime++;
            updateTimerDisplay();
            
            if (timeLeft <= 0) {
                clearInterval(timer);
                handleTimeOut();
            }
        }, 1000);
    }, 1000);

    // Crear botones de opciones
    optionsEl.innerHTML = '';
    question.options.forEach((option, index) => {
        const button = document.createElement('button');
        button.className = 'option-btn';
        button.textContent = option;
        button.onclick = () => {
            if (!isAnswering && !isTransitioning) {
                checkAnswer(index);
            }
        };
        optionsEl.appendChild(button);
    });
}

// Actualizar visualización del timer
function updateTimerDisplay() {
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
    clearTimeout(timerDelay);
    
    const question = selectedPhrases[currentQuestion];
    const circles = document.querySelectorAll('.circle');
    const optionButtons = document.querySelectorAll('.option-btn');

    // Marcar respuesta incorrecta (rojo) y correcta (verde)
    if (selectedIndex !== question.correct) {
        optionButtons[selectedIndex].classList.add('incorrect-answer'); // Rojo para la seleccionada
        optionButtons[question.correct].classList.add('correct-answer'); // Verde para la correcta
        circles[currentQuestion].classList.add('incorrect');
        playSound(wrongSound);
    } else {
        optionButtons[selectedIndex].classList.add('correct-answer'); // Verde si acertó
        circles[currentQuestion].classList.add('correct');
        playSound(correctSound);
        score++;
    }

    // Feedback visual después de 1.5 segundos
    setTimeout(() => {

        // Quitar estilos temporales de los botones
        optionButtons.forEach(button => {
            button.classList.remove('incorrect-answer', 'correct-answer');
        });
        
        nextQuestion();
    }, 1500); // Tiempo que se muestra la respuesta correcta
}
/*function checkAnswer(selectedIndex) {
    isAnswering = true;
    clearInterval(timer);
    clearTimeout(timerDelay);
    
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
}*/

// Manejar tiempo agotado
function handleTimeOut() {
    const circles = document.querySelectorAll('.circle');
    circles[currentQuestion].classList.add('incorrect');
    playSound(wrongSound);
    nextQuestion();
}

// Siguiente pregunta
function nextQuestion() {
    isTransitioning = true;
    toggleOptions(true);
    
    currentQuestion++;
    if (currentQuestion < totalQuestions) {
        setTimeout(() => {
            loadQuestion();
        }, 1500);
    } else {
        setTimeout(endGame, 1500);
    }
}

// Finalizar juego
function endGame() {
    clearInterval(timer);
    clearTimeout(timerDelay);
    document.getElementById('timer-container').style.display = 'none';
    
    // Crear el contenido del diálogo
    const dialogContent = `
        <div id="score-dialog">
            <h2>¡Juego Terminado!</h2>
            <p>Aciertos: <strong>${score}/${totalQuestions}</strong></p>
            <p>Tiempo total: <strong>${totalTime} segundos</strong></p>
            <input type="text" id="player-name" placeholder="Ingresa tu nombre" autofocus>
        </div>
    `;
    
    // Insertar en el DOM
    document.body.insertAdjacentHTML('beforeend', dialogContent);
    
    // Configurar el diálogo
    $('#score-dialog').dialog({
        modal: true,
        title: 'Guardar Puntaje',
        width: 350,
        buttons: {
            "Guardar": function() {
                const playerName = $('#player-name').val().trim() || 'Anónimo';
                saveScore(playerName, score, totalTime);
                $(this).dialog("close");
                showGameOverMessage();
            },
            "Cancelar": function() {
                $(this).dialog("close");
                showGameOverMessage();
            }
        },
        close: function() {
            $(this).remove();
        }
    });
}

function showGameOverMessage() {
    quoteEl.textContent = `¡Gracias por jugar!`;
    optionsEl.innerHTML = '<button class="option-btn replay-btn" onclick="location.reload()">Jugar de nuevo</button>';
    showHighscores();
}

/*function endGame() {
    clearInterval(timer);
    timerContainer.style.display = 'none';
    isTransitioning = false;
    
    const playerName = prompt(`¡Juego terminado!\nAciertos: ${score}/${totalQuestions}\nTiempo total: ${totalTime} segundos\nIngresa tu nombre:`);
    
    if (playerName) {
        saveScore(playerName.trim() || 'Anónimo', score, totalTime);
    }
    
    quoteEl.textContent = `¡Gracias por jugar!`;
    optionsEl.innerHTML = '<button class="option-btn replay-btn" onclick="initGame()">Jugar de nuevo</button>';
}*/

// Guardar puntaje
function saveScore(name, points, time) {
    const highscores = JSON.parse(localStorage.getItem('triviaHighscores')) || [];
    highscores.push({ 
        name, 
        points, 
        time,
        date: new Date().toISOString(),
        displayText: `${name} | ${points}/10 | ${time}s`
    });
    
    // Ordenar por puntaje (descendente) y tiempo (ascendente)
    highscores.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        return a.time - b.time;
    });
    
    localStorage.setItem('triviaHighscores', JSON.stringify(highscores.slice(0, 10)));
    showHighscores();
}

// Mostrar highscores
function showHighscores() {
    const highscores = JSON.parse(localStorage.getItem('triviaHighscores')) || [];
    highscoresList.innerHTML = '';
    
    highscores.slice(0, 10).forEach((score, index) => {
        const li = document.createElement('li');
        li.innerHTML = `
            <span class="rank">${index + 1}.</span>
            <span class="name">${score.name}</span>
            <span class="score">${score.points}/10</span>
            <span class="time">${score.time}s</span>
        `;
        highscoresList.appendChild(li);
    });
}

// Reproducir sonido
function playSound(sound) {
    sound.currentTime = 0;
    sound.volume = 0.3;
    sound.play().catch(e => console.log("Error al reproducir sonido"));
}

// Borrar highscores
document.getElementById('clear-highscores').addEventListener('click', () => {
    if (confirm("¿Borrar todos los puntajes guardados?")) {
        localStorage.removeItem('triviaHighscores');
        showHighscores();
    }
});

// Iniciar juego al cargar
window.addEventListener('DOMContentLoaded', () => {
    // Solicitar interacción para activar sonidos
    document.addEventListener('click', () => {
        correctSound.volume = 0;
        correctSound.play().then(() => {
            correctSound.pause();
            correctSound.currentTime = 0;
        }).catch(e => console.log("Sonidos activados"));
    }, { once: true });
    
    initGame();
});
