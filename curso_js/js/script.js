/* INICIO SCRIPT 3ra ENTREGA CODERHOUSE - PABLO GAMERO -*/

/* NINGUNA DE LAS IMÁGENES UTILIZADAS TIENE DERECHO DE AUTOR, YA QUE FUERON CREADAS CON IA: https://neural.love/ */

document.body.addEventListener("click", manejarBotones);

/* DECLARACIÓN DE VARIABLES GLOBALES */

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

let gasto = [0,0,0,0,0];
let gastoTotal = 0;
let gastoRepartido = [0,0,0,0,0];

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

    for (let i=0 ; i < numeroViajeros; i++) {
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

    for (let i=0 ; i < numeroGastos; i++) {
        agregarGasto(datosGastos[i],idGastosGuardado[i]);
    }

    if (localStorage.getItem("gastoTotal") != null) {
        gastoTotal = JSON.parse(localStorage.getItem("gastoTotal"));
    }

    if (localStorage.getItem("gasto") != null) {
        gasto = JSON.parse(localStorage.getItem("gasto"));
    }

    if (localStorage.getItem("gastoRepartido") != null) {
        gastoRepartido = JSON.parse(localStorage.getItem("gastoRepartido"));
    }

    actualizarGasto();

});

/* MÓDULO DE MANEJO DE BOTONES */

function manejarBotones(event) {
const botonPresionado = event.target.id;

switch (botonPresionado) {
    case "agregar":
        if (datosGastos != "") {
            error("Elimine los gastos para modificar la lista de viajeros.",'error','Ooops...');
        } else {
            if (numeroViajeros === 5) {
                error("Máximo de viajeros alcanzado.",'error','Ooops...');
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
            error("Elimine los gastos para modificar la lista de viajeros.",'error','Ooops...');
        }
        break;
    case "agregarGasto":
        if (numeroViajeros <= 1) {
            error("Agregue al menos 2 viajeros.",'info','Imposible repartir');
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

/* MÓDULO DE MANEJO DE LA INTERFAZ DE CARGA DE DATOS */

function abrirMenu(menu) {
    if (menu == "viajero") {
        formularioAgregar.classList.remove("d-none");
        botonAgregar.classList.add("d-none");
        botonAgregarGasto.classList.add("d-none");
    }
    if (menu == "gasto") {

        if (datosGastos == "") {
            error("Tenga en cuenta que al agregar un gasto, ya no podrá modificar la lista de viajeros.",'warning','Atención');
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
            input.setAttribute("id","radio" + i);
            input.setAttribute("name","Viajero");
            input.setAttribute("value",String(datosViajeros[i].nombre + " " + datosViajeros[i].apellido));
            label.setAttribute("for","radio" + i);
            label.classList.add("mx-2");
            label.innerText = String(datosViajeros[i].nombre + " " + datosViajeros[i].apellido);
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

/* ERRORES DE LIBRERÍA SWEET ALERT */

function error(parametro,icono,titulo) {
    Swal.fire({
        icon: icono,
        title: titulo,
        text: parametro,
    })
}

/* MÓDULO DE MANEJO DE VIAJEROS */

function aceptarViajero() {

    const regexNomApe = /^[A-Za-zÁÉÍÓÚáéíóúÜüÑñ\s'-]+$/;
    const regexTel = /^(11|221|223|261|264|266|280|290|291|297|298|299)[0-9]{8}$/;
    const regexMail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    let nombre = document.getElementById("nombre").value;
    let apellido = document.getElementById("apellido").value;
    let telefono = document.getElementById("telefono").value;
    let mail = document.getElementById("email").value;

    if (nombre == "" || apellido == "" || telefono == "" || mail == "" || !regexNomApe.test(nombre) || !regexNomApe.test(apellido) || !regexTel.test(telefono) || !regexMail.test(mail)) {
        if (nombre == "" || !regexNomApe.test(nombre)){
            errorNombre.classList.add("d-block");
            errorNombre.classList.remove("d-none");
        } else {
            errorNombre.classList.remove("d-block");
            errorNombre.classList.add("d-none");
        }
        if (apellido == "" || !regexNomApe.test(apellido)){
            errorApellido.classList.add("d-block");
            errorApellido.classList.remove("d-none");
        } else {
            errorApellido.classList.remove("d-block");
            errorApellido.classList.add("d-none");
        }
        if (telefono == "" || !regexTel.test(telefono)){
            errorTelefono.classList.add("d-block");
            errorTelefono.classList.remove("d-none");
        } else {
            errorTelefono.classList.remove("d-block");
            errorTelefono.classList.add("d-none");
        }
        if (mail == "" || !regexMail.test(mail)){
            errorMail.classList.add("d-block");
            errorMail.classList.remove("d-none");
        } else {
            errorMail.classList.remove("d-block");
            errorMail.classList.add("d-none");
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
        actualizarGasto();
    }
};

function agregarViajeroALista(viajero,idViajero) {
    const li = document.createElement("li");
    li.classList.add("list-group-item", "1h-sm");
    li.setAttribute("id","Viajero" + idViajero);

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

    const li = document.getElementById("Viajero" + id);
    ulDeViajeros.removeChild(li);
    numeroViajeros -= 1;
    viajeros.textContent = numeroViajeros;

    idViajerosGuardado.splice(idRemover,1);

    localStorage.setItem("idViajerosGuardado",JSON.stringify(idViajerosGuardado));
    localStorage.setItem("viajerosGuardados",numeroViajeros);
    localStorage.setItem("datosViajerosGuardados",JSON.stringify(datosViajeros));

    actualizarGasto();
};

/* MÓDULO DE MANEJO DE GASTOS */

function formatear(num) {
    return num.toLocaleString("es-AR", {style:"currency", currency:"ARS"});
}

function aceptarGasto() {

    const regexMonto = /^[0-9]{1,7}(?:\.\d{1,2})?$/;
    let viajeros = document.getElementsByName('Viajero');
    let viajero;
    let idViajeroGasto;
    let id;
    let monto = document.getElementById("monto").value;
    let comentario = document.getElementById("comentario").value;
    
    for(let i = 0; i < viajeros.length; i++){
        if(viajeros[i].checked){
            viajero = viajeros[i].value;
            id = viajeros[i].id.charAt(5);
            idViajeroGasto = Number(id);
        }
    }

    if (viajero == undefined || monto == "" || comentario == "" || !regexMonto.test(monto)) {
        if (viajero == undefined){
            errorViajero.classList.add("d-block");
        }
        if (monto == "" || !regexMonto.test(monto)){
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
    small1.innerText= formatear(Number(gasto.monto));

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

/* MÓDULO DE MANEJO DE RESULTADOS */

function repartirGastos(cantidad) {

    gastoTotal = 0;
    gasto = [0,0,0,0,0];
    gastoRepartido = [0,0,0,0,0];

    for (i=0 ; i < (cantidad) ; i++) {
        for (j=0 ; j < datosGastos.length ; j++) {
            if (datosGastos[j].IdViajero == i) {
                gasto[i] = gasto[i] + Number(datosGastos[j].monto);
            }
        }
        gastoTotal = gastoTotal + gasto[i];
    }

    for (i=0 ; i < (cantidad) ; i++) {
    gastoRepartido[i] = gasto[i] - (gastoTotal/cantidad);
    }

    localStorage.setItem("gastoTotal",gastoTotal);
    localStorage.setItem("gasto",JSON.stringify(gasto));
    localStorage.setItem("gastoRepartido",JSON.stringify(gastoRepartido));
}

function actualizarGasto() {

    repartirGastos(datosViajeros.length);

    const mostrarGastoTotal = document.getElementById("gastoFinal");
    mostrarGastoTotal.innerText = "Gasto total del viaje: " + formatear(gastoTotal);
    ulResultados.innerHTML = "";

    if (numeroGastos > 0) {
        for (i=0 ; i < datosViajeros.length ; i++) {
        
            const li = document.createElement("li");
            li.classList.add("list-group-item", "1h-sm", "d-flex", "align-items-center");
            const div1 = document.createElement("div");
            const div2 = document.createElement("div");
            div2.classList.add("flex-grow-1");
            const div3 = document.createElement("div");
            div3.classList.add("d-flex","justify-content-between","align-items-center","mb-1");
            const h6 = document.createElement("h6");
            h6.classList.add("my-0");
            const small = document.createElement("small");
            small.classList.add("flex-grow-1", "px-3", "estiloMonto");
            const small1 = document.createElement("small");
            const img = document.createElement("img");

            h6.innerText = datosViajeros[i].nombre + " " + datosViajeros[i].apellido;
            small.innerText="Gasto total " + formatear(gasto[i]);
            if (gastoRepartido[i] < 0) {
                small1.classList.add("estiloComentario", "debe");
                img.classList.add("monstruoRepartir");
                img.setAttribute("src","img/monstruoDebe.png");
                img.setAttribute("alt","Mounstruo Debe");
                small1.innerText = datosViajeros[i].nombre + " " + datosViajeros[i].apellido + " Debe: " + formatear(-gastoRepartido[i]);
            } else {
                small1.classList.add("estiloComentario", "recibe");
                img.classList.add("monstruoRepartir");
                img.setAttribute("src","img/monstruoRecibe.png");
                img.setAttribute("alt","Mounstruo Recibe");
                small1.innerText = datosViajeros[i].nombre + " " + datosViajeros[i].apellido + " recibe: " + formatear(gastoRepartido[i]);
            }

            ulResultados.appendChild(li);
            li.appendChild(div1);
            div1.appendChild(img);
            li.appendChild(div2);
            div2.appendChild(div3);
            div3.appendChild(h6);
            div3.appendChild(small);
            div2.appendChild(small1);

        };
    } else {
        for (i=0 ; i < datosViajeros.length ; i++) {

            const li = document.createElement("li");
            li.classList.add("list-group-item", "1h-sm");
            const div = document.createElement("div");
            div.classList.add("d-flex", "justify-content-between", "align-items-center", "mb-1");
            const h6 = document.createElement("h6");
            h6.classList.add("my-0");
            const small1 = document.createElement("small");
            small1.classList.add("flex-grow-1", "px-3", "estiloMonto");
            const span = document.createElement("span");
            span.classList.add("text-success", "pointer");
            const small = document.createElement("small");

            h6.innerText = datosViajeros[i].nombre + " " + datosViajeros[i].apellido;
            small1.innerText="Gasto total $ 0";
            small.innerText = "Aún no hay gastos";

            li.appendChild(div);
            div.appendChild(h6);
            div.appendChild(small1);
            div.appendChild(span);
            li.appendChild(small);
            ulResultados.appendChild(li);
        };
    };

}

/* MÓDULO DE FETCH API PARA EL CLIMA DE LA CIUDAD DESTINO */

const ciudadElegida = document.getElementById('ciudad');

ciudadElegida.onchange = (event) => {
    const ciudad = event.target.value;
    const key = "969de0f6ebd36d04b40136010664f449";
    let url = `https://api.openweathermap.org/data/2.5/weather?q=${ciudad}&appid=${key}`;
    
    fetch(url)
        .then((res) => {
            return res.json();
        })
        .then((clima) => {
            let temp = clima.main.temp;
            let tempC = temp - 273.15;
            let divClima = document.getElementById('temperatura');
            divClima.innerHTML = tempC.toFixed(0) + "°C";

            if (tempC < 10) {
                divClima.className = 'frio';
            } else {
                divClima.className = 'calido';
            }
        })
        .catch((err) => {
            let divClima = document.getElementById('temperatura');
            divClima.innerHTML = "Ciudad inexistente";
        });
}