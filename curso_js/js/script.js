alert("Bienvenidos a la 2da pre-entrega\nSe agregan objetos, arrays, métodos (join, push) y un constructor");
alert("Planificador de gastos viaje a Europa");

let viajeros = parseInt(prompt ("Ingrese la cantidad de personas que viajan"));

while (isNaN(viajeros) || viajeros <= 0 || viajeros > 5) {
    switch (viajeros) {
        case 1:
            viajeros = 1;
            break;
        case 2:
            viajeros = 2;
            break;
        case 3:
            viajeros = 3;
            break;
        case 4:
            viajeros = 4;
            break;
        case 5:
            viajeros = 5;
            break;
        default:
        alert("Elija un número de viajeros entre 1 y 5");
        viajeros = parseInt(prompt ("Ingrese la cantidad de personas que viajan"));
    }
}

console.log("Número de viajeros", viajeros);

let viajero = [];

/*
for (let i = 0; i < (viajeros); i++) {
    viajeroNum = i + 1;
    viajero[i] = prompt ("Ingrese el nombre del viajero " + viajeroNum);
    console.log("El nombre del viajero " + viajeroNum + " es " + viajero[i]);
}*/

/* Se mejora el anterior "for" para darle nombres a los viajeros, utilizando un do-while a continuación: */

let i = 0;
do {
    i += 1
    let unViajero = prompt ("Ingrese el nombre del viajero " + i);
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

let dias = parseInt(prompt("Ingrese los días de duración del viaje"));
let gastosPorDia = parseFloat(prompt("Ingrese una estimación de gastos diarios totales (en u$s)"));
valorDolarBlue = parseFloat(prompt("Ingrese el valor actual del dólar blue"));

imprimirPantalla = () => {return confirm("¿Desea imprimir los resultados en pantalla?")};

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
    persona[i] = new Personas(viajero[i],prompt("Ingresar edad de " + viajero[i]),prompt("Ingresar el teléfono de " + viajero[i]));
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