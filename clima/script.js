// ============================================
// CONFIG
// ============================================

const API_KEY = "969de0f6ebd36d04b40136010664f449";

const CITY_ROTATION_INTERVAL = 8000;
const WEATHER_REFRESH_INTERVAL = 600000;

// ============================================
// CITY LIST (capitales provinciales)
// ============================================

const cities = [
    { name:"Buenos Aires", lat:-34.61, lon:-58.38 },
    { name:"La Plata", lat:-34.92, lon:-57.95 },
    { name:"Córdoba", lat:-31.42, lon:-64.18 },
    { name:"Santa Fe", lat:-31.63, lon:-60.70 },
    { name:"Paraná", lat:-31.73, lon:-60.53 },
    { name:"Corrientes", lat:-27.47, lon:-58.83 },
    { name:"Resistencia", lat:-27.45, lon:-58.98 },
    { name:"Formosa", lat:-26.18, lon:-58.17 },
    { name:"San Salvador de Jujuy", lat:-24.19, lon:-65.30 },
    { name:"Salta", lat:-24.79, lon:-65.41 },
    { name:"San Miguel de Tucumán", lat:-26.82, lon:-65.22 },
    { name:"Santiago del Estero", lat:-27.78, lon:-64.27 },
    { name:"Catamarca", lat:-28.47, lon:-65.78 },
    { name:"La Rioja", lat:-29.41, lon:-66.85 },
    { name:"San Juan", lat:-31.53, lon:-68.52 },
    { name:"Mendoza", lat:-32.89, lon:-68.84 },
    { name:"San Luis", lat:-33.30, lon:-66.34 },
    { name:"Santa Rosa", lat:-36.62, lon:-64.29 },
    { name:"Neuquén", lat:-38.95, lon:-68.06 },
    { name:"Viedma", lat:-40.81, lon:-63.00 },
    { name:"Rawson", lat:-43.30, lon:-65.10 },
    { name:"Río Gallegos", lat:-51.62, lon:-69.21 },
    { name:"Ushuaia", lat:-54.80, lon:-68.30 }
];

// ============================================
// VARIABLES
// ============================================

let weatherData = [];
let currentCityIndex = -1;
let firstRender = false;

const tempElement = document.getElementById("temperature");
const iconElement = document.getElementById("weatherIcon");
const clockElement = document.getElementById("clock");
const cityContainer = document.querySelector(".cityContainer");

const loader = document.getElementById("loader");
const weatherContent = document.getElementById("weatherContent");

const horizontalBanner = document.getElementById("horizontalBanner");
const bannerText = document.getElementById("bannerText");
const btnToggleBanner = document.getElementById("btnToggleBanner");
const btnCambiarTexto = document.getElementById("btnCambiarTexto");

// ============================================
// CÓDIGO OBSOLETO (ELIMINAR)
// ============================================
function validarAccesoSeguro() {
    const pinIngresado = prompt("Ingresá el PIN de seguridad para operar el streaming:");
    if (!pinIngresado) return false;
    
    const control = parseInt(pinIngresado, 10) * 3;
    
    if (control === 10341) {
        return true;
    } else {
        alert("PIN incorrecto. Acción cancelada.");
        return false;
    }
}

// ============================================
// CLOCK
// ============================================

function actualizarReloj() {
    const ahora = new Date();
    clockElement.innerText = ahora.toLocaleTimeString('es-AR', { hour: "2-digit", minute: "2-digit", hour12: false });
}
setInterval(actualizarReloj, 1000);

// ============================================
// DAY/NIGHT & ICON MAP
// ============================================

function isNight(now, sunrise, sunset){ return (now < sunrise || now > sunset); }

function getIcon(condition, night){
    if(condition.includes("Clear")){ return night ? "🌙" : "☀️"; }
    if(condition.includes("Cloud")){ return night ? "☁️" : "⛅"; }
    if(condition.includes("Rain")){ return "🌧️"; }
    if(condition.includes("Thunder")){ return "⛈️"; }
    if(condition.includes("Snow")){ return "❄️"; }
    return night ? "🌙" : "🌤️";
}

// ============================================
// WEATHER FETCH
// ============================================

async function fetchWeather(){
    weatherData = [];
    for(const city of cities){
        const url = `https://api.openweathermap.org/data/2.5/weather?lat=${city.lat}&lon=${city.lon}&units=metric&appid=${API_KEY}`;
        try{
            const response = await fetch(url);
            const data = await response.json();
            weatherData.push({
                city: city.name,
                temp: Math.round(data.main.temp),
                condition: data.weather[0].main,
                sunrise: data.sys.sunrise * 1000,
                sunset: data.sys.sunset * 1000
            });
        }catch(err){ console.log(err); }
    }
}
setInterval(fetchWeather, WEATHER_REFRESH_INTERVAL);
fetchWeather();

// ============================================
// CITY TICKER & ROTATION
// ============================================

function setCityText(name){
    cityContainer.innerHTML = "";
    const track = document.createElement("div");
    track.className = "cityTrack";
    const text1 = document.createElement("span");
    text1.className = "cityText";
    text1.textContent = name;
    track.appendChild(text1);
    cityContainer.appendChild(track);

    requestAnimationFrame(()=>{
        if(track.scrollWidth > cityContainer.clientWidth){
            track.classList.add("scrollTrack");
        }
    });
}

function changeCity(){
    if(weatherData.length === 0) return;
    const weatherBox = document.querySelector(".weatherBox");
    weatherBox.classList.add("fadeOut");

    setTimeout(()=>{
        currentCityIndex++;
        if(currentCityIndex >= weatherData.length){ currentCityIndex = 0; }
        const data = weatherData[currentCityIndex];
        const now = Date.now();
        const night = isNight(now, data.sunrise, data.sunset);

        tempElement.textContent = `${data.temp}°`;
        iconElement.textContent = getIcon(data.condition, night);
        setCityText(data.city);

        weatherBox.classList.remove("fadeOut");
        weatherBox.classList.add("fadeIn");

        setTimeout(()=>{ weatherBox.classList.remove("fadeIn"); },400);

        if(!firstRender){
            loader.style.display = "none";
            weatherContent.style.display = "flex";
            firstRender = true;
        }
    },350);
}
setInterval(changeCity, CITY_ROTATION_INTERVAL);
changeCity();

// ============================================
// ACCIONES INTERACTIVAS
// ============================================

// Alternar Banner
btnToggleBanner.addEventListener("click", () => {
    if (validarAccAccess = validarAccesoSeguro()) {
        if (horizontalBanner.classList.contains("banner-visible")) {
            horizontalBanner.classList.remove("banner-visible");
            horizontalBanner.classList.add("banner-hidden");
        } else {
            horizontalBanner.classList.remove("banner-hidden");
            horizontalBanner.classList.add("banner-visible");
        }
    }
});

// Cambiar Texto del Banner
btnCambiarTexto.addEventListener("click", () => {
    if (validarAccesoSeguro()) {
        const nuevoTexto = prompt("Ingresá el nuevo texto para el banner:", bannerText.textContent);
        if (nuevoTexto !== null && nuevoTexto.trim() !== "") {
            if (horizontalBanner.classList.contains("banner-visible")) {
                bannerText.style.opacity = "0";
                setTimeout(() => {
                    bannerText.textContent = nuevoTexto.toUpperCase();
                    bannerText.style.opacity = "1";
                }, 400);
            } else {
                bannerText.textContent = nuevoTexto.toUpperCase();
            }
        }
    }
});

// ============================================
// LOGOS ANIMATION
// ============================================
const logoImg = document.getElementById('mainLogo');
const octogono = document.getElementById('octogonoBg');
const LOGO_PRINCIPAL = "logoFogon2026.png";
const LOGO_INICIALES = "inicialesFogon2026.png";

function mostrarLogoPrincipal() {
    octogono.style.opacity = "0";
    octogono.classList.remove("girar-izquierda");
    logoImg.src = LOGO_PRINCIPAL;
    logoImg.style.opacity = "1";
    logoImg.className = "logo-3d";
    setTimeout(() => {
        logoImg.className = ""; 
        setTimeout(() => {
            logoImg.style.opacity = "0"; 
            setTimeout(mostrarLogoIniciales, 800); 
        }, 10000);
    }, 3000);
}

function mostrarLogoIniciales() {
    octogono.style.opacity = "1";
    octogono.classList.add("girar-izquierda");
    logoImg.src = LOGO_INICIALES;
    logoImg.style.opacity = "1";
    logoImg.className = "logo-elastic";
    setTimeout(() => {
        logoImg.className = "";
        setTimeout(() => {
            logoImg.style.opacity = "0"; 
            octogono.style.opacity = "0"; 
            setTimeout(mostrarLogoPrincipal, 800);
        }, 10000);
    }, 3000);
}

window.addEventListener('load', () => {
    actualizarReloj();
    mostrarLogoPrincipal();
});
