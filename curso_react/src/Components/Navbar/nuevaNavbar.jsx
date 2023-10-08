import React from 'react'
import './Navbar.css'
import { Link, NavLink } from 'react-router-dom'

const Navbar = () => {
return (
    <div style={styles.Navbar}>
        <h1>
            Mi tienda online
        </h1>
        <div style={styles.Links}>
            <NavLink activeClassName to={"/"} >Inicio</NavLink>
            <NavLink activeClassName to={"/cart"} >Carrito</NavLink>
            <NavLink activeClassName to={"/products"} >Productos</NavLink>
        </div>
    </div>
    )
}

export default Navbar

const styles = {
    Navbar: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '2rem',
        borderBottom: '1px solid black'
    },
    Links: {
        width: '30%',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
    }
}