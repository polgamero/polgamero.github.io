import './App.css';
import NavBar from './Components/NavBar/NavBar';
import ItemListContainer from './Components/ItemListContainer/ItemListContainer';

function App() {
  return (
    <div className="App">
      <NavBar />
      <ItemListContainer bienvenida={'¡Bienvenidos a mi Shop Online!'}/>
    </div>
  );
}

export default App;
