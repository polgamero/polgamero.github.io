// Nuevo script

document.addEventListener("DOMContentLoaded", agregarViajero);
const botonAgregar = document.getElementById("nuevoViajero");
const formularioAgregar = document.getElementById("nuevoViajeroForm");
const botonAceptar = document.getElementById("aceptar");
const botonCancelar = document.getElementById("cancelar");

let numeroViajeros = 0;
let datosViajeros = [];

class Viajeros {
    constructor(nombre, apellido, telefono, mail) {
        this.nombre = nombre;
        this.apellido = apellido;
        this.telefono = telefono;
        this.mail = mail;
    }
}

function abrirMenu() {
    formularioAgregar.classList.remove("d-none");
    botonAgregar.classList.add("d-none");

    botonAceptar.addEventListener("click",aceptarViajero);
    botonCancelar.addEventListener("click",cerrarMenu);
};

function cerrarMenu() {
    formularioAgregar.classList.add("d-none");
    botonAgregar.classList.remove("d-none");
    document.getElementById("formularioViajero").reset();
};

function agregarViajero() {
    let viajeros = document.getElementById("numeroViajeros");
    viajeros.textContent = numeroViajeros;

    botonAgregar.addEventListener("click",abrirMenu);
};

function aceptarViajero() {
    formularioAgregar.classList.add("d-none");
    botonAgregar.classList.remove("d-none");

    let nombre = document.getElementById("nombre").value;
    let apellido = document.getElementById("apellido").value;
    let telefono = document.getElementById("telefono").value;
    let mail = document.getElementById("email").value;
    datosViajeros[numeroViajeros] = new Viajeros (nombre,apellido,telefono,mail);

    numeroViajeros += 1;
    let viajeros = document.getElementById("numeroViajeros");
    viajeros.textContent = numeroViajeros;
    document.getElementById("formularioViajero").reset();
};

/*
let viajeros = parseInt(("Ingrese la cantidad de personas que viajan"));

let viajero = [];


for (let i = 0; i < (viajeros); i++) {
    viajeroNum = i + 1;
    viajero[i] = prompt ("Ingrese el nombre del viajero " + viajeroNum);
    console.log("El nombre del viajero " + viajeroNum + " es " + viajero[i]);
}

/* Se mejora el anterior "for" para darle nombres a los viajeros, utilizando un do-while a continuación: 

let i = 0;
do {
    i += 1
    let unViajero = ("Ingrese el nombre del viajero " + i);
    viajero.push(unViajero);
} while (viajero.length != viajeros)


let gastosTotales = 0;
let gastosPorViajero = 0;
let valorDolarBlue = 0;
let gastoPesos = 0;
let gastosPorViajeroPesos = 0;

function planificador(dias,gastosPorDia,viajeros,valorDolarBlue) {
    gastosTotales = gastosPorDia * dias;
    gastosPorViajero = gastosTotales / viajeros;
    gastoPesos = gastosTotales * valorDolarBlue;
    gastosPorViajeroPesos = gastosPorViajero * valorDolarBlue;
};

let dias = parseInt(("Ingrese los días de duración del viaje"));
let gastosPorDia = parseFloat(("Ingrese una estimación de gastos diarios totales (en u$s)"));
valorDolarBlue = parseFloat(("Ingrese el valor actual del dólar blue"));

imprimirPantalla = () => {return ("¿Desea imprimir los resultados en pantalla?")};

planificador (dias, gastosPorDia,viajeros,valorDolarBlue);

enPesos = gastoPesos.toLocaleString('es-AR');
enPesosPorViajero = gastosPorViajeroPesos.toLocaleString('es-AR');

console.log("");
console.log("Para un viaje a Europa de " + dias + " días y " + viajeros + " viajero/s (" + viajero.join(", ") + "), se estima un gasto total de: $" + gastosTotales.toFixed(2) + " y un gasto total por viajero de: $" + gastosPorViajero.toFixed(2))
console.log("");
console.log("Dichos gastos en pesos argentinos son: ARS $" + enPesos + " total y: ARS $" + enPesosPorViajero + " por viajero.")
console.log("");
let date = new Date().toLocaleDateString("es-AR");
console.log("Con un valor actual del dólar blue de ARS $" + valorDolarBlue + " a la fecha de hoy: " + date);
console.log("");

let persona = []

class Personas {
    constructor(nombre, edad, telefono) {
        this.nombre = nombre;
        this.edad = edad;
        this.telefono = telefono;
    }
}

for (let i = 0; i < (viajeros); i++) {
    persona[i] = new Personas(viajero[i],("Ingresar edad de " + viajero[i]),("Ingresar el teléfono de " + viajero[i]));
    console.log(persona[i].nombre, persona[i].edad, persona[i].telefono);
}

if (imprimirPantalla()) {
document.write ('<br><div class="fin centrado"><u>Planificación de gastos del viaje</u></div><br>');
document.write ('<div class="fin">Para un viaje a Europa de ' + dias + ' días y ' + viajeros + ' viajero/s (' + viajero.join(", ") + '), se estima un gasto total de: u$s ' + gastosTotales.toFixed(2) + ' y un gasto total por viajero de: u$s ' + gastosPorViajero.toFixed(2) + '.</div><br>');
document.write ('<div class="fin">Dichos gastos en pesos argentinos son: ARS $ ' + enPesos + ' total y: ARS $ ' + enPesosPorViajero + ' por viajero.' + '</div><br>');
document.write ('<div class="fin">Con un valor actual del dólar blue de ARS $ ' + valorDolarBlue + ' a la fecha de hoy: ' + date + '.</div><br>');
document.write ('<br><div class="fin">Detalle de los viajeros:</div><br>');
for (let i = 0; i < (viajeros); i++) {
let viajeroNum = i + 1;
document.write ('<div class="lista">Viajero ' + viajeroNum + '- <u>Nombre:</u> ' + persona[i].nombre + '. <u>Edad:</u> ' + persona[i].edad + '. <u>Teléfono:</u> ' + persona[i].telefono + '</div><br>');
}
} else {
    document.write ('<br><div class="fin">Podrá visualizar todos los resultados en la consola. Muchas gracias.</div><br>');
}
*/