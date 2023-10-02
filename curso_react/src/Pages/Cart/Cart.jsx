import React from 'react'
import CartWidget from '../../Components/CartWidget/CartWidget'

const Cart = () => {
return (
<div style={{display:"flex", flexDirection:"column", justifyContent:"center", alignItems:"center"}}>
    <h2>Carrito</h2>
    <CartWidget />
</div>
)
}

export default Cart