const API_KEY="969de0f6ebd36d04b40136010664f449"

const ROTATE_INTERVAL=8000
const REFRESH_INTERVAL=600000

/* ciudades */

const cities=[
{name:"Buenos Aires",lat:-34.61,lon:-58.38},
{name:"La Plata",lat:-34.92,lon:-57.95},
{name:"Córdoba",lat:-31.42,lon:-64.18},
{name:"Santa Fe",lat:-31.63,lon:-60.70},
{name:"Paraná",lat:-31.73,lon:-60.53},
{name:"Corrientes",lat:-27.47,lon:-58.83},
{name:"Resistencia",lat:-27.45,lon:-58.98},
{name:"Formosa",lat:-26.18,lon:-58.17},
{name:"San Salvador de Jujuy",lat:-24.19,lon:-65.30},
{name:"Salta",lat:-24.79,lon:-65.41},
{name:"San Miguel de Tucumán",lat:-26.82,lon:-65.22},
{name:"Santiago del Estero",lat:-27.78,lon:-64.27},
{name:"Catamarca",lat:-28.47,lon:-65.78},
{name:"La Rioja",lat:-29.41,lon:-66.85},
{name:"San Juan",lat:-31.53,lon:-68.52},
{name:"Mendoza",lat:-32.89,lon:-68.84},
{name:"San Luis",lat:-33.30,lon:-66.34},
{name:"Santa Rosa",lat:-36.62,lon:-64.29},
{name:"Neuquén",lat:-38.95,lon:-68.06},
{name:"Viedma",lat:-40.81,lon:-63.00},
{name:"Rawson",lat:-43.30,lon:-65.10},
{name:"Río Gallegos",lat:-51.62,lon:-69.21},
{name:"Ushuaia",lat:-54.80,lon:-68.30}
]

let weatherData=[]
let index=0

const clock=document.getElementById("clock")
const loader=document.getElementById("loader")
const content=document.getElementById("weatherContent")

const icon=document.getElementById("icon")
const temp=document.getElementById("temp")
const cityTrack=document.getElementById("cityTrack")

/* reloj */

function updateClock(){

const d=new Date()

clock.textContent=
d.getHours().toString().padStart(2,'0')+
":"+
d.getMinutes().toString().padStart(2,'0')

}

setInterval(updateClock,1000)
updateClock()

/* iconos */

function sun(){
return `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5" fill="#FDB813"/></svg>`
}

function cloud(){
return `<svg viewBox="0 0 24 24"><ellipse cx="12" cy="14" rx="7" ry="4" fill="#bbb"/></svg>`
}

function rain(){
return `<svg viewBox="0 0 24 24"><ellipse cx="12" cy="9" rx="7" ry="4" fill="#bbb"/><line x1="9" y1="13" x2="9" y2="17" stroke="#4aa3ff"/></svg>`
}

/* fetch paralelo */

async function fetchWeather(){

loader.style.display="block"

weatherData=[]

cities.forEach(async(city)=>{

const url=`https://api.openweathermap.org/data/2.5/weather?lat=${city.lat}&lon=${city.lon}&units=metric&appid=${API_KEY}`

try{

const r=await fetch(url)
const j=await r.json()

weatherData.push({
name:city.name,
temp:Math.round(j.main.temp),
condition:j.weather[0].main
})

/* mostrar en cuanto llegue el primero */

if(weatherData.length===1){

loader.style.display="none"
content.style.display="flex"

}

}catch(e){

console.log("error ciudad",city.name)

}

})

}

setInterval(fetchWeather,REFRESH_INTERVAL)
fetchWeather()

/* ticker ciudad */

function setCity(name){

cityTrack.classList.remove("scroll")
cityTrack.innerHTML=name

requestAnimationFrame(()=>{

if(cityTrack.scrollWidth>60){

cityTrack.innerHTML=name+"   "+name
cityTrack.classList.add("scroll")

}

})

}

/* rotacion */

function rotate(){

if(weatherData.length===0)return

const c=weatherData[index]

temp.textContent=c.temp+"°"

if(c.condition.includes("Rain")) icon.innerHTML=rain()
else if(c.condition.includes("Cloud")) icon.innerHTML=cloud()
else icon.innerHTML=sun()

setCity(c.name)

index++

if(index>=weatherData.length) index=0

}

setInterval(rotate,ROTATE_INTERVAL)
rotate()
