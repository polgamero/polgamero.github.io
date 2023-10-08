import CartWidget from "../CartWidget/CartWidget"

const NavBar = () => {
    return (
        <nav class="navbar navbar-dark bg-primary">
            <span class="navbar-brand px-2" href="#">POLSHOP</span>

            <div class="" id="navbarSupportedContent">
                <ul class="navbar-nav flex-row">
                <li class="nav-item px-2">
                    <a class="nav-link" href="/">Inicio</a>
                </li>
                <li class="nav-item px-2">
                    <a class="nav-link" href="productos">Productos</a>
                </li>
                <li class="nav-item px-2">
                    <a class="nav-link" href="carrito">Carrito</a>
                </li>
                </ul>
            </div>
        </nav>
    )
}

export default NavBar