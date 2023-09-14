import CartWidget from "../CartWidget/CartWidget"

const NavBar = () => {
    return (
        <nav>
            <h3>Ecommerce</h3>
            <div>
                <button>Categoría 1</button>
                <button>Categoría 2</button>
                <button>Categoría 3</button>
            </div>
            <CartWidget />
        </nav>
    )
}

export default NavBar