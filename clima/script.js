// =================
// CONFIG
// =================

const API_KEY = "969de0f6ebd36d04b40136010664f449";

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

const CITY_ROTATION_INTERVAL = 8000;
const WEATHER_REFRESH_INTERVAL = 600000;


// =================
// VARIABLES
// =================

let weatherData = [];
let currentCityIndex = -1;

const tempElement = document.getElementById("temperature");
const iconElement = document.getElementById("weatherIcon");
const clockElement = document.getElementById("clock");

const cityContainer = document.querySelector(".cityContainer");


// =================
// CLOCK
// =================

function updateClock(){

const now = new Date();

let h = now.getHours().toString().padStart(2,'0');
let m = now.getMinutes().toString().padStart(2,'0');

clockElement.textContent = `${h}:${m}`;

}

setInterval(updateClock,1000);
updateClock();


// =================
// ICON MAP
// =================

function getIcon(condition){

if(condition.includes("Cloud")) return "☁️";
if(condition.includes("Rain")) return "🌧️";
if(condition.includes("Clear")) return "☀️";
if(condition.includes("Snow")) return "❄️";
if(condition.includes("Thunder")) return "⛈️";

return "🌤️";

}


// =================
// WEATHER FETCH
// =================

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
condition: data.weather[0].main

});

}catch(err){

console.log(err);

}

}

}

setInterval(fetchWeather,WEATHER_REFRESH_INTERVAL);
fetchWeather();


// =================
// CITY DISPLAY
// =================

function setCityText(name){

cityContainer.innerHTML = "";

const track = document.createElement("div");
track.className = "cityTrack";

const text1 = document.createElement("span");
text1.className = "cityText";
text1.textContent = name;

track.appendChild(text1);

cityContainer.appendChild(track);

// medir si hace falta scroll

requestAnimationFrame(()=>{

if(track.scrollWidth > cityContainer.clientWidth){

const text2 = text1.cloneNode(true);
track.appendChild(text2);

track.classList.add("scrollTrack");

}

});

}


// =================
// ROTATION
// =================

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

tempElement.textContent = `${data.temp}°`;

iconElement.textContent = getIcon(data.condition);

setCityText(data.city);

weatherBox.classList.remove("fadeOut");
weatherBox.classList.add("fadeIn");

setTimeout(()=>{
weatherBox.classList.remove("fadeIn");
},400);

},350);

}

setInterval(changeCity,CITY_ROTATION_INTERVAL);
changeCity();
