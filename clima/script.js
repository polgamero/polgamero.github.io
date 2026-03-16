const API_KEY="969de0f6ebd36d04b40136010664f449"

const CITY_ROTATION_INTERVAL=8000
const WEATHER_REFRESH_INTERVAL=600000

/* IDs OpenWeatherMap capitales */

const CITY_IDS=[
3435910, // Buenos Aires
3432043, // La Plata
3860259, // Córdoba
3836277, // Santa Fe
3841956, // Paraná
3433955, // Corrientes
3429577, // Resistencia
3433899, // Formosa
3843444, // Jujuy
3838233, // Salta
3836873, // Tucumán
3835869, // Santiago del Estero
3862286, // Catamarca
3848950, // La Rioja
3837213, // San Juan
3844421, // Mendoza
3837056, // San Luis
3835994, // Santa Rosa
3843123, // Neuquén
3832899, // Viedma
3839307, // Rawson
3838859, // Río Gallegos
3833367  // Ushuaia
]

let weatherData=[]
let currentCityIndex=-1
let firstRender=false

const tempElement=document.getElementById("temperature")
const iconElement=document.getElementById("weatherIcon")
const clockElement=document.getElementById("clock")
const cityContainer=document.querySelector(".cityContainer")

const loader=document.getElementById("loader")
const weatherContent=document.getElementById("weatherContent")

/* clock */

function updateClock(){

const now=new Date()

let h=now.getHours().toString().padStart(2,'0')
let m=now.getMinutes().toString().padStart(2,'0')

clockElement.textContent=`${h}:${m}`

}

setInterval(updateClock,1000)
updateClock()

/* icons */

function iconSun(){
return `<svg viewBox="0 0 24 24"><g class="sun"><circle cx="12" cy="12" r="5" fill="#FDB813"/></g></svg>`
}

function iconMoon(){
return `<svg viewBox="0 0 24 24"><g class="moon"><path d="M14 2a9 9 0 1 0 8 12A7 7 0 0 1 14 2z" fill="#ccc"/></g></svg>`
}

function iconCloud(){
return `<svg viewBox="0 0 24 24"><g class="cloud"><ellipse cx="12" cy="14" rx="7" ry="4" fill="#bbb"/></g></svg>`
}

function iconRain(){
return `<svg viewBox="0 0 24 24">
<g class="cloud"><ellipse cx="12" cy="9" rx="7" ry="4" fill="#bbb"/></g>
<g class="rain" stroke="#4aa3ff" stroke-width="1.5">
<line x1="9" y1="13" x2="9" y2="17"/>
<line x1="12" y1="13" x2="12" y2="17"/>
<line x1="15" y1="13" x2="15" y2="17"/>
</g>
</svg>`
}

/* fetch unico */

async function fetchWeather(){

loader.style.display="block"

const ids=CITY_IDS.join(",")

const url=`https://api.openweathermap.org/data/2.5/group?id=${ids}&units=metric&appid=${API_KEY}`

const res=await fetch(url)
const data=await res.json()

weatherData=data.list.map(city=>({

city:city.name,
temp:Math.round(city.main.temp),
condition:city.weather[0].main

}))

}

/* city text */

function setCityText(name){

cityContainer.innerHTML=""

const track=document.createElement("div")
track.className="cityTrack"

const text1=document.createElement("span")
text1.className="cityText"
text1.textContent=name

track.appendChild(text1)
cityContainer.appendChild(track)

requestAnimationFrame(()=>{

if(track.scrollWidth>cityContainer.clientWidth){

const text2=text1.cloneNode(true)
track.appendChild(text2)

track.classList.add("scrollTrack")

}

})

}

/* rotation */

function changeCity(){

if(weatherData.length===0)return

const weatherBox=document.querySelector(".weatherBox")

weatherBox.classList.add("fadeOut")

setTimeout(()=>{

currentCityIndex++

if(currentCityIndex>=weatherData.length){
currentCityIndex=0
}

const data=weatherData[currentCityIndex]

tempElement.textContent=`${data.temp}°`

if(data.condition.includes("Rain")){
iconElement.innerHTML=iconRain()
}else if(data.condition.includes("Cloud")){
iconElement.innerHTML=iconCloud()
}else{
iconElement.innerHTML=iconSun()
}

setCityText(data.city)

weatherBox.classList.remove("fadeOut")
weatherBox.classList.add("fadeIn")

setTimeout(()=>{
weatherBox.classList.remove("fadeIn")
},400)

if(!firstRender){

loader.style.display="none"
weatherContent.style.display="flex"

firstRender=true

}

},350)

}

setInterval(changeCity,CITY_ROTATION_INTERVAL)
setInterval(fetchWeather,WEATHER_REFRESH_INTERVAL)

fetchWeather()
changeCity()
