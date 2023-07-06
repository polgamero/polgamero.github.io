alert("Bienvenidos a la 1ra pre-entrega");

console.log("Inicio del Script");
console.log("");
let numero1 = Number(prompt ("Ingrese un número"));
let numero2 = Number(prompt ("Ingrese un número"));

function sumar(x,y) {
    return x + y;
};

console.log("Has ingresado los números " + numero1 + " y " + numero2);
console.log("");
console.log("El resultado de la suma de " + numero1 + " y " + numero2 + " es: " + sumar(numero1,numero2));
console.log("");