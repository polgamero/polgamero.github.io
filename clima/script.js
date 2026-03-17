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


// ============================================
// CLOCK
// ============================================

function updateClock(){

const now = new Date();

let h = now.getHours().toString().padStart(2,'0');
let m = now.getMinutes().toString().padStart(2,'0');

clockElement.textContent = `${h}:${m}`;

}

setInterval(updateClock,1000);
updateClock();


// ============================================
// DAY/NIGHT
// ============================================

function isNight(now, sunrise, sunset){
return (now < sunrise || now > sunset);
}


// ============================================
// ICON MAP
// ============================================

function getIcon(condition, night){

if(condition.includes("Clear")){
return night ? "🌙" : "☀️";
}

if(condition.includes("Cloud")){
return night ? "☁️" : "⛅";
}

if(condition.includes("Rain")){
return "🌧️";
}

if(condition.includes("Thunder")){
return "⛈️";
}

if(condition.includes("Snow")){
return "❄️";
}

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

}catch(err){

console.log(err);

}

}

}

setInterval(fetchWeather, WEATHER_REFRESH_INTERVAL);
fetchWeather();


// ============================================
// CITY TICKER
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

const text2 = text1.cloneNode(true);
track.appendChild(text2);

track.classList.add("scrollTrack");

}

});

}


// ============================================
// ROTATION
// ============================================

function changeCity(){

if(weatherData.length === 0) return;

const weatherBox = document.querySelector(".weatherBox");

weatherBox.classList.add("fadeOut");

setTimeout(()=>{

currentCityIndex++;

if(currentCityIndex >= weatherData.length){
currentCityIndex = 0;
}

const data = weatherData[currentCityIndex];

const now = Date.now();
const night = isNight(now, data.sunrise, data.sunset);

tempElement.textContent = `${data.temp}°`;
iconElement.textContent = getIcon(data.condition, night);

setCityText(data.city);

weatherBox.classList.remove("fadeOut");
weatherBox.classList.add("fadeIn");

setTimeout(()=>{
weatherBox.classList.remove("fadeIn");
},400);


// ocultar loader SOLO después del primer render
if(!firstRender){

loader.style.display = "none";
weatherContent.style.display = "flex";

firstRender = true;

}

},350);

}

setInterval(changeCity, CITY_ROTATION_INTERVAL);
changeCity();

// ANIMACION DE LOS LOGOS

const logoImg = document.getElementById('mainLogo');
const octogono = document.getElementById('octogonoBg'); // Nueva referencia
const LOGO_PRINCIPAL = "logoFogon2026.png";
const LOGO_INICIALES = "inicialesFogon2026.png";

function mostrarLogoPrincipal() {
    // 1. Aseguramos que el octógono esté oculto y sin animar
    octogono.style.opacity = "0";
    octogono.classList.remove("girar-izquierda");

    // 2. Cambiamos la imagen y aplicamos la animación 3D
    logoImg.src = LOGO_PRINCIPAL;
    logoImg.style.opacity = "1";
    logoImg.className = "logo-3d";

    // 3. Esperamos a que termine la animación (3s) para quitar la clase
    setTimeout(() => {
        logoImg.className = ""; 
        
        // 4. Esperamos 10 segundos estáticos con el Logo Principal
        setTimeout(() => {
            logoImg.style.opacity = "0"; // Desvanecemos para el cambio
            
            // 5. Una vez desvanecido, pasamos al siguiente logo
            setTimeout(mostrarLogoIniciales, 800); 
        }, 10000);
    }, 3000);
}

function mostrarLogoIniciales() {
    // 1. Activamos el octógono: opacidad y animación de giro
    octogono.style.opacity = "1";
    octogono.classList.add("girar-izquierda");

    // 2. Cambiamos la imagen y aplicamos la animación Elastic
    logoImg.src = LOGO_INICIALES;
    logoImg.style.opacity = "1";
    logoImg.className = "logo-elastic";

    // 3. Esperamos a que termine la animación (3s) para quitar la clase
    setTimeout(() => {
        logoImg.className = "";

        // 4. Esperamos 10 segundos estáticos con el Logo de Iniciales (y el octógono girando)
        setTimeout(() => {
            // 5. Desvanecemos tanto el logo como el octógono
            logoImg.style.opacity = "0"; 
            octogono.style.opacity = "0"; // También ocultamos el fondo rojo
            
            // 6. Volvemos al inicio del ciclo
            setTimeout(mostrarLogoPrincipal, 800);
        }, 10000);
    }, 3000);
}

// Iniciar el ciclo cuando cargue la página
window.addEventListener('load', mostrarLogoPrincipal);

// NOTI FOGON

const seccionesRSS = [
    { nombre: "AHORA", url: "https://www.c5n.com/rss/pages/ultimas-noticias.xml" },
    { nombre: "POLÍTICA", url: "https://www.c5n.com/rss/pages/politica.xml" },
    { nombre: "DEPORTES", url: "https://www.c5n.com/rss/pages/deportes.xml" },
    { nombre: "ECONOMÍA", url: "https://www.c5n.com/rss/pages/economia.xml" },
    { nombre: "MUNDO", url: "https://www.c5n.com/rss/pages/mundo.xml" },
    { nombre: "TECNOLOGÍA", url: "https://www.c5n.com/rss/pages/tecnologia.xml" },
    { nombre: "SOCIEDAD", url: "https://www.c5n.com/rss/pages/sociedad.xml" }
];

const newsWrapper = document.getElementById('newsWrapper');
const newsTicker = document.getElementById('newsTicker');
const newsSection = document.getElementById('newsSection');

let noticiasFogon = [];
let indexNoticia = 0;
const DELAY_ENTRE_NOTICIAS = 5000; // 5 segundos para tus pruebas

async function fetchUltimaDeSeccion(seccion) {
    const proxyUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(seccion.url)}&t=${new Date().getTime()}`;
    try {
        const res = await fetch(proxyUrl);
        const data = await res.json();
        if (data.status === "ok" && data.items.length > 0) {
            const item = data.items[0];
            let desc = item.description.replace(/<[^>]*>/g, '').trim();
            return {
                seccion: seccion.nombre,
                contenido: `${item.title.toUpperCase()}: ${desc.toUpperCase()}`
            };
        }
    } catch (e) {
        return null;
    }
}

async function cargarTodasLasNoticias() {
    console.log("Actualizando noticias de C5N...");
    const resultados = await Promise.all(seccionesRSS.map(s => fetchUltimaDeSeccion(s)));
    noticiasFogon = resultados.filter(n => n !== null);

    if (noticiasFogon.length > 0) {
        indexNoticia = 0;
        cicloNoticias();
    }
}

function cicloNoticias() {
    const data = noticiasFogon[indexNoticia];
    
    newsSection.innerText = data.seccion;
    // Duplicamos el contenido
    newsTicker.innerText = data.contenido + "          •          " + data.contenido; 

    // 1. CALCULAMOS VELOCIDAD
    // Usamos scrollWidth para saber cuánto mide el texto realmente en píxeles
    const largoTexto = newsTicker.scrollWidth;
    
    // Queremos que pase a unos 100 píxeles por segundo (ajustá este nro si querés más/menos velocidad)
    const velocidadPxSeg = 110; 
    const duracionUnaVuelta = largoTexto / velocidadPxSeg;
    const duracionTotalAnimacion = duracionUnaVuelta * 2; // 2 vueltas

    newsWrapper.classList.add('news-active');

    setTimeout(() => {
        newsTicker.style.animation = 'none';
        newsTicker.offsetHeight; 
        
        // Aplicamos el tiempo calculado dinámicamente
        newsTicker.style.animation = `marqueeScroll ${duracionUnaVuelta}s linear infinite`;

        // 2. EL BANNER SE QUEDA LO QUE DURA LA ANIMACIÓN + UN MARGEN
        // El banner se cierra después de que pasen las 2 vueltas completas
        setTimeout(() => {
            newsWrapper.classList.remove('news-active');
            
            setTimeout(() => {
                newsTicker.style.animation = 'none';
                indexNoticia++;

                if (indexNoticia >= noticiasFogon.length) {
                    cargarTodasLasNoticias(); 
                } else {
                    setTimeout(cicloNoticias, DELAY_ENTRE_NOTICIAS);
                }
            }, 800);
        }, (duracionTotalAnimacion * 1000)); // Pasamos a milisegundos

    }, 800);
}

window.addEventListener('load', cargarTodasLasNoticias);
