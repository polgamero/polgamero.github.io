import { NavLink, Link } from 'react-router-dom';
import CartWidget from '../CartWidget/CartWidget';
import './nav.css';

const navBar = () => {
    return (
        <nav>
            <Link to='/' className='nombre-ecommerce'>POL</Link>
            <ul>
                <NavLink to={`/categoria/auriculares`} className='nav-categoria-links'>Auriculares</NavLink>
                <NavLink to={`/categoria/televisores`} className='nav-categoria-links'>Televisores</NavLink>
                <NavLink to={`/categoria/computadoras`} className='nav-categoria-links'>Computadoras</NavLink>
                <NavLink to={`/categoria/instrumentos`} className='nav-categoria-links'>Instrumentos</NavLink>
                <NavLink to={`/cart`} className='nav-categoria-links-cart'><CartWidget /></NavLink>
            </ul>
        </nav>
    )
}

export default navBar;