import { useContext } from "react";
import { CartContext } from "../../context/CartContext";
import { Link } from "react-router-dom";
import CartItem from "../CartItem/CartItem";
import './Cart.css';

const Cart = () => {

    const {cart, clearCart, totalQuantity, cartTotal} = useContext(CartContext)

    if(totalQuantity() === 0){
        return(
            <div className="empty-cart-container">
                <p className="empty-cart-message">Ups. No hay nada en el carrito por el momento.</p>
                <Link to='/' className="counter-button">Ver productos</Link>
            </div>
        )
    }
    else{
        return (
            <div className="cart-container">
            <div className="cart-items-list">
                { cart.map(item => <CartItem key={item.id} item={item} />)}
            </div>
            <h3 className="cart-total">Total: ${cartTotal()}</h3>
            <button className="clear-cart-btn" onClick={() => clearCart()}>Vaciar carrito</button>
            <Link to='/checkout' className="checkout-link">Finalizar compra</Link>
        </div>
    )
    }
}

export default Cart;
