/* INICIO SCRIPT 3ra ENTREGA CODERHOUSE - PABLO GAMERO -*/

document.body.addEventListener("click", manejarBotones);

let numeroViajeros = 0;
let idViajeros = 0;
let datosViajeros = [];
let idViajerosGuardado = [];

let numeroGastos = 0;
let idGastos = 0;
let datosGastos = [];
let idGastosGuardado = [];

let viajeros = document.getElementById("numeroViajeros");
viajeros.textContent = numeroViajeros;

const formulario = document.getElementById("formularioViajero");
const ulDeViajeros = document.getElementById("listaViajeros");
const divDeViajeros = document.getElementById("opcionesViajeros");

const ulDeGastos = document.getElementById("listaGastos");
const ulResultados = document.getElementById("listaResultados");

// Botones formulario Viajeros
const formularioAgregar = document.getElementById("nuevoViajeroForm");
const botonAgregar = document.getElementById("agregar");
const botonAceptar = document.getElementById("aceptar");
const botonCancelar = document.getElementById("cancelar");
const botonEliminar = document.getElementById("eliminar");

    // Errores formulario Viajeros
    const errorNombre = document.getElementById("errorNombre");
    const errorApellido = document.getElementById("errorApellido");
    const errorTelefono = document.getElementById("errorTelefono");
    const errorMail = document.getElementById("errorMail");
    const errorEliminar = document.getElementById("errorEliminar");

// Botones formulario Gastos
const formularioAgregarGasto = document.getElementById("nuevoGastoForm");
const botonAgregarGasto = document.getElementById("agregarGasto");
const botonAceptarGasto = document.getElementById("aceptarGasto");
const botonCancelarGasto = document.getElementById("cancelarGasto");
const botonEliminarGasto = document.getElementById("eliminarGasto");

    // Errores formulario Gastos
    const errorViajero = document.getElementById("errorViajero");
    const errorMonto = document.getElementById("errorMonto");
    const errorComentario = document.getElementById("errorComentario");
    const aviso = document.getElementById("aviso");

/* MÓDULO DE CARGA DEL DOM Y RECUPERACIÓN DE LOCALSTORAGE */

document.addEventListener('DOMContentLoaded', function() {

    // VIAJEROS //

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

    // GASTOS //

    if (localStorage.getItem("gastosGuardados") != null) {
        numeroGastos = Number(localStorage.getItem("gastosGuardados"));
    }

    if (localStorage.getItem("idGastos") != null) {
        idGastos = Number(localStorage.getItem("idGastos"));
    }

    if (localStorage.getItem("idGastosGuardado") != null) {
        idGastosGuardado = JSON.parse(localStorage.getItem("idGastosGuardado"));
    }

    if (localStorage.getItem("datosGastosGuardados") != null) {
        datosGastos = JSON.parse(localStorage.getItem("datosGastosGuardados"));
    }

    for (var i=0 ; i < numeroGastos; i++) {
        agregarGasto(datosGastos[i],idGastosGuardado[i]);
    }
});

/* MÓDULO DE MANEJO DE BOTONES */

function manejarBotones(event) {
const botonPresionado = event.target.id;

switch (botonPresionado) {
    case "agregar":
        if (datosGastos != "") {
            botonAgregar.classList.add("btn-danger");
            botonAgregar.innerText="Eliminar Gastos";
            setTimeout(function() {
            botonAgregar.classList.remove("btn-danger");
            botonAgregar.innerText="Nuevo viajero";
            }, 1500);
        } else {
            if (numeroViajeros === 5) {
                botonAgregar.classList.add("btn-danger");
                botonAgregar.innerText="Máximo alcanzado";
                setTimeout(function() {
                botonAgregar.classList.remove("btn-danger");
                botonAgregar.innerText="Nuevo viajero";
                }, 1500);
            } else {
                abrirMenu("viajero");
            };
        };
        break;
    case "aceptar":
        aceptarViajero();
        break;
    case "cancelar":
        cerrarMenu("viajero");
        break;
    case "eliminar":
        if (datosGastos == "") {
        eliminarViajero(event.target.attributes[1].nodeValue);
        } else {
            errorEliminar.classList.add("d-block");
            setTimeout(function() {
            errorEliminar.classList.remove("d-block");
            }, 2500);
        }
        break;
    case "agregarGasto":
        if (numeroViajeros <= 1) {
            botonAgregarGasto.classList.add("btn-danger");
            botonAgregarGasto.innerText="Agregue al menos 2 viajeros";
            setTimeout(function() {
            botonAgregarGasto.classList.remove("btn-danger");
            botonAgregarGasto.innerText="Nuevo Gasto";
            }, 1500);
        } else {
            abrirMenu("gasto");
        };
        break;
    case "aceptarGasto":
        aceptarGasto();
        break;
    case "cancelarGasto":
        cerrarMenu("gasto");
        break;
    case "eliminarGasto":
        eliminarGasto(event.target.attributes[1].nodeValue);
        break;
    default:
        break;
}
}

/* CONSTRUCTOR DE DATOS VIAJEROS Y GASTOS */

class Viajeros {
    constructor(Id, nombre, apellido, telefono, mail) {
        this.Id = Id;
        this.nombre = nombre;
        this.apellido = apellido;
        this.telefono = telefono;
        this.mail = mail;
    }
}

class Gastos {
    constructor(Id, IdViajero, viajero, monto, comentario) {
        this.Id = Id;
        this.IdViajero = IdViajero;
        this.viajero = viajero;
        this.monto = monto;
        this.comentario = comentario;
    }
}

/* MÓDULO DE MANEJO DE LA INTERFAZ */

function abrirMenu(menu) {
    if (menu == "viajero") {
        formularioAgregar.classList.remove("d-none");
        botonAgregar.classList.add("d-none");
        botonAgregarGasto.classList.add("d-none");
    }
    if (menu == "gasto") {

        if (datosGastos == "") {
            aviso.classList.remove("d-none");
        } else {
            aviso.classList.add("d-none");
        }

        formularioAgregarGasto.classList.remove("d-none");
        botonAgregarGasto.classList.add("d-none");
        botonAgregar.classList.add("d-none");

        divDeViajeros.innerHTML = "";

        for (i=0; i < numeroViajeros; i++) {
            const input = document.createElement("input");
            const label = document.createElement("label");
            const enter = document.createElement("br");
            input.setAttribute("type","radio");
            input.setAttribute("id",i);
            input.setAttribute("name","Viajero");
            input.setAttribute("value",String(datosViajeros[i].nombre + " " + datosViajeros[i].apellido));
            label.setAttribute("for",i);
            label.classList.add("mx-2");
            label.innerHTML = String(" " + datosViajeros[i].nombre + " " + datosViajeros[i].apellido);
            divDeViajeros.appendChild(input);
            divDeViajeros.appendChild(label);
            divDeViajeros.appendChild(enter);
        }
    }
};

function cerrarMenu(menu) {
    if (menu == "viajero") {
        formularioAgregar.classList.add("d-none");
        botonAgregar.classList.remove("d-none");
        botonAgregarGasto.classList.remove("d-none");
        errorNombre.classList.remove("d-block");
        errorApellido.classList.remove("d-block");
        errorTelefono.classList.remove("d-block");
        errorMail.classList.remove("d-block");
        formulario.reset();
    }
    if (menu == "gasto") {
        formularioAgregarGasto.classList.add("d-none");
        botonAgregarGasto.classList.remove("d-none");
        botonAgregar.classList.remove("d-none");
        errorViajero.classList.remove("d-block");
        errorMonto.classList.remove("d-block");
        errorComentario.classList.remove("d-block");
        formulario.reset();
    }
};

/* MANEJO DEL ENTER PARA SUBMITEAR */

document.getElementById("email").onkeydown = function(e) {
    if (e.key === "Enter") {
        aceptarViajero();
    };
}

document.getElementById("comentario").onkeydown = function(e) {
    if (e.key === "Enter") {
        aceptarGasto();
    };
}

/* MÓDULO DE MANEJO DE VIAJEROS */

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
        cerrarMenu("viajero");
    }
};

function agregarViajeroALista(viajero,idViajero) {
    const li = document.createElement("li");
    li.classList.add("list-group-item", "1h-sm");
    li.setAttribute("id",idViajero);

    const div = document.createElement("div");
    div.classList.add("text-success", "d-flex", "justify-content-between", "align-items-center", "mb-1");

    const h6 = document.createElement("h6");
    h6.classList.add("my-0");
    h6.innerText = viajero.nombre + " " + viajero.apellido;

    const small1 = document.createElement("small");
    small1.classList.add("flex-grow-1", "px-3", "estiloMonto");
    small1.innerText="+54 " + viajero.telefono;

    const span = document.createElement("span");
    span.classList.add("text-success", "pointer");
    span.setAttribute("name",idViajero);
    span.setAttribute("id","eliminar");
    span.innerText="❌";

    const small = document.createElement("small");
    small.classList.add("estiloComentario");
    small.innerText = viajero.mail;

    li.appendChild(div);
    div.appendChild(h6);
    div.appendChild(small1);
    div.appendChild(span);
    li.appendChild(small);
    ulDeViajeros.appendChild(li);
}

function eliminarViajero(id) {
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

/* MÓDULO DE MANEJO DE GASTOS */

function aceptarGasto() {

    let viajeros = document.getElementsByName('Viajero');
    let viajero;
    let idViajeroGasto;
    let monto = document.getElementById("monto").value;
    let comentario = document.getElementById("comentario").value;

    for(var i = 0; i < viajeros.length; i++){
        if(viajeros[i].checked){
            viajero = viajeros[i].value;
            idViajeroGasto = viajeros[i].id;
        }
    }

    if (viajero == undefined || monto == "" || comentario == "") {
        if (viajero == undefined){
            errorViajero.classList.add("d-block");
        }
        if (monto == ""){
            errorMonto.classList.add("d-block");
        }
        if (comentario == ""){
            errorComentario.classList.add("d-block");
        }
    } else {
        datosGastos[numeroGastos] = new Gastos (idGastos,idViajeroGasto,viajero,monto,comentario);
        agregarGasto(datosGastos[numeroGastos],datosGastos[numeroGastos].Id);
        idGastosGuardado.push(datosGastos[numeroGastos].Id);
        idGastos += 1;
        numeroGastos += 1;
        localStorage.setItem("idGastos",idGastos);
        localStorage.setItem("idGastosGuardado",JSON.stringify(idGastosGuardado));
        localStorage.setItem("gastosGuardados",numeroGastos);
        localStorage.setItem("datosGastosGuardados",JSON.stringify(datosGastos));
        cerrarMenu("gasto");

        actualizarGasto();
    }
};

function agregarGasto(gasto,idGasto) {
    const li = document.createElement("li");
    li.classList.add("list-group-item", "1h-sm");
    li.setAttribute("id","Gasto" + idGasto);

    const div = document.createElement("div");
    div.classList.add("d-flex", "justify-content-between", "align-items-center", "mb-1");

    const h6 = document.createElement("h6");
    h6.classList.add("my-0");
    h6.innerText = gasto.viajero;

    const small1 = document.createElement("small");
    small1.classList.add("flex-grow-1", "px-3", "estiloMonto");
    small1.innerText="$ " + gasto.monto;

    const span = document.createElement("span");
    span.classList.add("text-success", "pointer");
    span.setAttribute("name",idGasto);
    span.setAttribute("id","eliminarGasto");
    span.innerText="❌";

    const small = document.createElement("small");
    small.classList.add("estiloComentario");
    small.innerText = gasto.comentario;

    li.appendChild(div);
    div.appendChild(h6);
    div.appendChild(small1);
    div.appendChild(span);
    li.appendChild(small);
    ulDeGastos.appendChild(li);
}

function eliminarGasto(id) {
    const idRemover = datosGastos.findIndex(i => {
        return i.Id == id;
    })

    datosGastos.splice(idRemover,1);

    const li = document.getElementById("Gasto" + id);
    ulDeGastos.removeChild(li);
    numeroGastos -= 1;

    idGastosGuardado.splice(idRemover,1);

    localStorage.setItem("idGastosGuardado",JSON.stringify(idGastosGuardado));
    localStorage.setItem("gastosGuardados",numeroGastos);
    localStorage.setItem("datosGastosGuardados",JSON.stringify(datosGastos));

    actualizarGasto();
}

function repartirGastos(cantidad) {

    let gasto = [0,0,0,0,0];

    console.log("La cantidad de viajeros es: " + datosViajeros.length);
    console.log("La cantidad de gastos es: " + datosGastos.length);

    for (i=0 ; i < (cantidad) ; i++) {
        console.log("Hice " + i + " ciclos.")
        for (j=0 ; j < datosGastos.length ; j++) {
            if (datosGastos[j].IdViajero == i) {
                console.log("Los gastos del viajero " + datosGastos[i].viajero + " son: " + datosGastos[j].monto)
                gasto[i] = gasto[i] + Number(datosGastos[j].monto);
            }
        }
    }

    console.log("La cantidad es: " + cantidad);
    console.log("El array de gastos acumulados es: " + gasto);
}

function actualizarGasto() {

    repartirGastos(datosViajeros.length);

    /*
    const li = document.createElement("li");
    li.classList.add("list-group-item", "1h-sm");
    //li.setAttribute("id","Gasto" + idGasto);

    const div = document.createElement("div");
    div.classList.add("d-flex", "justify-content-between", "align-items-center", "mb-1");

    const h6 = document.createElement("h6");
    h6.classList.add("my-0");
    h6.innerText = gasto.viajero;

    const small1 = document.createElement("small");
    small1.classList.add("flex-grow-1", "px-3", "estiloMonto");
    small1.innerText="$ " + gasto.monto;

    const span = document.createElement("span");
    span.classList.add("text-success", "pointer");
    span.setAttribute("name",idGasto);
    span.setAttribute("id","eliminarGasto");
    span.innerText="❌";

    const small = document.createElement("small");
    small.classList.add("estiloComentario");
    small.innerText = gasto.comentario;

    li.appendChild(div);
    div.appendChild(h6);
    div.appendChild(small1);
    div.appendChild(span);
    li.appendChild(small);
    ulDeGastos.appendChild(li);
    */

}

/*

<li class="list-group-item 1h-sm" id="Gasto19">
    <div class="d-flex justify-content-between align-items-center mb-1">
        <h6 class="my-0">Brian Lopez</h6>
        <small class="flex-grow-1 px-3 estiloMonto">Gasto total $ 13.456</small>
    </div>
    <small class="recibe">Recibe $ 1.203 de Lucas</small>
</li>
<li class="list-group-item 1h-sm" id="Gasto19">
    <div class="d-flex justify-content-between align-items-center mb-1">
        <h6 class="my-0">Lucas Luiselli</h6>
        <small class="flex-grow-1 px-3 estiloMonto">Gasto total $ 1.456</small>
    </div>
    <small class="debe">Debe $ 12.203 a Brian</small>
</li>

*/


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