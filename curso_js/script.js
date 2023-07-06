alert("Bienvenidos a la 1ra pre-entrega");
alert("Planificador de gastos viaje a Europa");

console.log("Inicio del Script");
console.log("");
let viajeros = Number(prompt ("Ingrese la cantidad de personas que viajan"));

while (viajeros <= 0 || viajeros > 5) {
    alert("Elija una cantidad de viajeros de 1 a 5");
    viajeros = parseInt(prompt ("Ingrese la cantidad de personas que viajan"));
};

console.log("Número de viajeros", viajeros);

let viajero = [];

for (let i = 1; i < (viajeros+1); i++) {
    viajero[i] = prompt ("Ingrese el nombre del viajero " + i);
    console.log("El nombre del viajero " + i + " es " + viajero[i]);
}

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

planificador (dias, gastosPorDia,viajeros,valorDolarBlue);

console.log("");
console.log("Para un viaje a Europa de " + dias + " días y " + viajeros + " viajero/s, se estima un gasto total de: $" + gastosTotales.toFixed(2) + " y un gasto total por viajero de: $" + gastosPorViajero.toFixed(2))
console.log("");
console.log("Dichos gastos en pesos argentinos son: ARS $" + gastoPesos.toFixed(2) + " total y: ARS $" + gastosPorViajeroPesos.toFixed(2) + " por viajero.")
console.log("");
let date = new Date().toLocaleDateString("es-AR");
console.log("Con un valor actual del dólar blue de ARS $" + valorDolarBlue + " a la fecha de hoy: " + date);
console.log("");

/*
let numero1 = Number(prompt ("Ingrese un número"));
let numero2 = Number(prompt ("Ingrese un número"));

function sumar(x,y) {
    return x + y;
};

console.log("Has ingresado los números " + numero1 + " y " + numero2);
console.log("");
console.log("El resultado de la suma de " + numero1 + " y " + numero2 + " es: " + sumar(numero1,numero2));
console.log("");
*/