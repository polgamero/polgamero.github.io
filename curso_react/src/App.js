import './app.css';
import 'bootstrap/dist/css/bootstrap.min.css';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import NavBar from './components/navBar/navBar.jsx';
import ItemListContainer from './components/ItemlistContainer/ItemListContainer';
import ItemDetailContainer from './components/ItemDetailContainer/ItemDetailContanier';
import Cart from './components/Cart/Cart';
import { CartProvider } from './context/CartContext';
import Checkout from './components/Checkout/Checkout';

const App = () => {
  return (
    <div className='App'>
      <BrowserRouter>
        <CartProvider>
          <NavBar />
          <Routes>
            <Route path='/' element={<ItemListContainer greeting={"POL SHOP"} />} />
            <Route path='/categoria/:categoriaId' element={<ItemListContainer />} />
            <Route path='/item/:itemId' element={<ItemDetailContainer />} />
            <Route path='/cart' element={<Cart />} />
            <Route path='/checkout' element={<Checkout />} />
            <Route path='*' element={<h1>404 NOT FOUND</h1>} />
          </Routes>
        </CartProvider>
      </BrowserRouter>
    </div>
  );
}
export default App;