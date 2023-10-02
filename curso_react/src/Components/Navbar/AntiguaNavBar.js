import CartWidget from "../CartWidget/CartWidget"

const NavBar = () => {
    return (
        <nav class="navbar navbar-dark bg-primary">
            <span class="navbar-brand px-2" href="#">POLSHOP</span>
            <button class="navbar-toggler" type="button" data-toggle="collapse" data-target="#navbarSupportedContent" aria-controls="navbarSupportedContent" aria-expanded="false" aria-label="Toggle navigation">
                <span class="navbar-toggler-icon"></span>
            </button>

            <div class="collapse navbar-collapse" id="navbarSupportedContent">
                <ul class="navbar-nav mr-auto">
                <li class="nav-item active">
                    <a class="nav-link" href="/">Home <span class="sr-only">(current)</span></a>
                </li>
                <li class="nav-item">
                    <a class="nav-link" href="catalogo">Catálogo</a>
                </li>
                </ul>
            </div>
            <CartWidget />
        </nav>
    )
}

export default NavBar