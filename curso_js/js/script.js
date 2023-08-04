// Nuevo script

document.body.addEventListener("click", manejarBotones);

let numeroViajeros = 0;
let idViajeros = 0;
let datosViajeros = [];
let idViajerosGuardado = [];
let viajeros = document.getElementById("numeroViajeros");
viajeros.textContent = numeroViajeros;

const formularioAgregar = document.getElementById("nuevoViajeroForm");
const botonAgregar = document.getElementById("agregar");
const botonAceptar = document.getElementById("aceptar");
const botonCancelar = document.getElementById("cancelar");
const botonEliminar = document.getElementById("eliminar");
const formulario = document.getElementById("formularioViajero");
const errorNombre = document.getElementById("errorNombre");
const errorApellido = document.getElementById("errorApellido");
const errorTelefono = document.getElementById("errorTelefono");
const errorMail = document.getElementById("errorMail");
const ulDeViajeros = document.getElementById("listaViajeros");

// Carga del DOM y recuperación de localStorage
document.addEventListener('DOMContentLoaded', function() {
    if (localStorage.getItem("viajerosGuardados") != null) {
    numeroViajeros = Number(localStorage.getItem("viajerosGuardados"));
    viajeros.textContent = numeroViajeros;
    }

    if (localStorage.getItem("idViajeros") != null) {
        idViajeros = Number(localStorage.getItem("idViajeros"));
    }

    if (localStorage.getItem("idViajerosGuardado") != null) {
        idViajerosGuardado = JSON.parse(localStorage.getItem("idViajerosGuardado"));
    }

    if (localStorage.getItem("datosViajerosGuardados") != null) {
    datosViajeros = JSON.parse(localStorage.getItem("datosViajerosGuardados"));
    }
    
    for (var i=0 ; i < numeroViajeros; i++) {
    agregarViajeroALista(datosViajeros[i],idViajerosGuardado[i]);
    }
});

// Función que maneja todos los botones
function manejarBotones(event) {
const botonPresionado = event.target.id;

switch (botonPresionado) {
    case "agregar":
        if (numeroViajeros === 5) {
            botonAgregar.classList.add("btn-danger");
            botonAgregar.innerText="Máximo alcanzado";
            setTimeout(function() {
            botonAgregar.classList.remove("btn-danger");
            botonAgregar.innerText="Nuevo viajero";
            }, 1500);
        } else {
            abrirMenu();
        };
        break;
    case "aceptar":
        aceptarViajero();
        break;
    case "cancelar":
        cerrarMenu();
        break;
    case "eliminar":
        eliminarViajero(event.target.attributes[1].nodeValue);
        break;
    default:
        break;
}
}

class Viajeros {
    constructor(Id, nombre, apellido, telefono, mail) {
        this.Id = Id;
        this.nombre = nombre;
        this.apellido = apellido;
        this.telefono = telefono;
        this.mail = mail;
    }
}

function abrirMenu() {
    formularioAgregar.classList.remove("d-none");
    botonAgregar.classList.add("d-none");
};

function cerrarMenu() {
    formularioAgregar.classList.add("d-none");
    botonAgregar.classList.remove("d-none");
    errorNombre.classList.remove("d-block");
    errorApellido.classList.remove("d-block");
    errorTelefono.classList.remove("d-block");
    errorMail.classList.remove("d-block");
    formulario.reset();
};

function aceptarViajero() {

    let nombre = document.getElementById("nombre").value;
    let apellido = document.getElementById("apellido").value;
    let telefono = document.getElementById("telefono").value;
    let mail = document.getElementById("email").value;

    if (nombre == "" || apellido == "" || telefono == "" || mail == "") {
        if (nombre == ""){
            errorNombre.classList.add("d-block");
        }
        if (apellido == ""){
            errorApellido.classList.add("d-block");
        }
        if (telefono == ""){
            errorTelefono.classList.add("d-block");
        }
        if (mail == ""){
            errorMail.classList.add("d-block");
        }
    } else {
        datosViajeros[numeroViajeros] = new Viajeros (idViajeros,nombre,apellido,telefono,mail);
        agregarViajeroALista(datosViajeros[numeroViajeros],datosViajeros[numeroViajeros].Id);
        idViajerosGuardado.push(datosViajeros[numeroViajeros].Id);
        idViajeros += 1;
        numeroViajeros += 1;
        viajeros.textContent = numeroViajeros;
        localStorage.setItem("idViajeros",idViajeros);
        localStorage.setItem("idViajerosGuardado",JSON.stringify(idViajerosGuardado));
        localStorage.setItem("viajerosGuardados",numeroViajeros);
        localStorage.setItem("datosViajerosGuardados",JSON.stringify(datosViajeros));
        cerrarMenu();
    }
};

function agregarViajeroALista(viajero,idViajero) {
    const li = document.createElement("li");
    li.classList.add("list-group-item","d-flex","justify-content-between","1h-sm");
    li.setAttribute("id",idViajero);

    const div = document.createElement("div");
    div.classList.add("text-success");

    const h6 = document.createElement("h6");
    h6.classList.add("my-0");
    h6.innerText=viajero.nombre + " " + viajero.apellido;

    const small = document.createElement("small");
    small.innerText=viajero.mail;

    const small1 = document.createElement("small");
    small1.innerText="+54 " + viajero.telefono;

    const span = document.createElement("span");
    span.classList.add("text-success", "pointer");
    span.setAttribute("name",idViajero);
    span.setAttribute("id","eliminar");
    span.innerText="x";

    li.appendChild(div);
    div.appendChild(h6);
    div.appendChild(small);
    li.appendChild(small1);
    li.appendChild(span);
    ulDeViajeros.appendChild(li);
}

/*
<li class="list-group-item d-flex justify-content-between 1h-sm">
<div class="text-success">
<h6 class="my-0">Jorge Luis García</h6>
<small>mail@ejemplo.com</small>    
</div>
<small>+54 11 1564 7894</small>
<span class="" id="eliminar">x</span>
</li>
*/

function eliminarViajero(id) {
console.log("Se elimina el viajero " + id);

const idRemover = datosViajeros.findIndex(i => {
    return i.Id == id;
})

datosViajeros.splice(idRemover,1);

const li = document.getElementById(id);
ulDeViajeros.removeChild(li);
numeroViajeros -= 1;
viajeros.textContent = numeroViajeros;

idViajerosGuardado.splice(idRemover,1);

localStorage.setItem("idViajerosGuardado",JSON.stringify(idViajerosGuardado));
localStorage.setItem("viajerosGuardados",numeroViajeros);
localStorage.setItem("datosViajerosGuardados",JSON.stringify(datosViajeros));
};

/*

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

*/