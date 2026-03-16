const API_KEY = "969de0f6ebd36d04b40136010664f449"

const ROTATE_INTERVAL = 8000
const REFRESH_INTERVAL = 600000

/* IDs capitales */

const CITY_IDS = [
3435910,3432043,3860259,3836277,3841956,
3433955,3429577,3433899,3843444,3838233,
3836873,3835869,3862286,3848950,3837213,
3844421,3837056,3835994,3843123,3832899,
3839307,3838859,3833367
]

let weatherData = []
let index = 0

const clock = document.getElementById("clock")
const loader = document.getElementById("loader")
const content = document.getElementById("weatherContent")

const icon = document.getElementById("icon")
const temp = document.getElementById("temp")
const cityTrack = document.getElementById("cityTrack")

/* reloj */

function updateClock(){

const d = new Date()

const h = d.getHours().toString().padStart(2,"0")
const m = d.getMinutes().toString().padStart(2,"0")

clock.textContent = `${h}:${m}`

}

setInterval(updateClock,1000)
updateClock()


/* ICONOS */

function sunIcon(){

return `
<svg viewBox="0 0 24 24">
<circle cx="12" cy="12" r="5" fill="#FDB813"/>
</svg>
`

}

function cloudIcon(){

return `
<svg viewBox="0 0 24 24">
<ellipse cx="12" cy="14" rx="7" ry="4" fill="#bbb"/>
</svg>
`

}

function rainIcon(){

return `
<svg viewBox="0 0 24 24">
<ellipse cx="12" cy="9" rx="7" ry="4" fill="#bbb"/>
<line x1="9" y1="13" x2="9" y2="17" stroke="#4aa3ff"/>
<line x1="12" y1="13" x2="12" y2="17" stroke="#4aa3ff"/>
</svg>
`

}


/* FETCH CLIMA */

async function fetchWeather(){

loader.style.display = "block"

const ids = CITY_IDS.join(",")

const url =
`https://api.openweathermap.org/data/2.5/group?id=${ids}&units=metric&appid=${API_KEY}`

try{

const response = await fetch(url)

if(!response.ok){

console.error("API error",response.status)
return

}

const json = await response.json()

if(!json.list){

console.error("Respuesta inesperada",json)
return

}

weatherData = json.list

loader.style.display = "none"
content.style.display = "flex"

rotateCity()

}catch(err){

console.error("Fetch error",err)

}

}

setInterval(fetchWeather,REFRESH_INTERVAL)

fetchWeather()



/* ciudad */

function setCity(name){

cityTrack.classList.remove("scroll")
cityTrack.innerHTML = name

requestAnimationFrame(()=>{

if(cityTrack.scrollWidth > 60){

cityTrack.innerHTML = name + "   " + name
cityTrack.classList.add("scroll")

}

})

}


/* rotación */

function rotateCity(){

if(weatherData.length === 0) return

const city = weatherData[index]

temp.textContent = Math.round(city.main.temp) + "°"

const condition = city.weather[0].main

if(condition.includes("Rain")){
icon.innerHTML = rainIcon()
}
else if(condition.includes("Cloud")){
icon.innerHTML = cloudIcon()
}
else{
icon.innerHTML = sunIcon()
}

setCity(city.name)

index++

if(index >= weatherData.length){
index = 0
}

setTimeout(rotateCity, ROTATE_INTERVAL)

}
