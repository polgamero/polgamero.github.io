import { useEffect, useState } from "react";

export const useItems = () => {
    const [items, setItems] = useState([]);
    const fetchItems = () => {
        fetch("https://jsonplaceholder.typicode.com/photos")
        .then(response => response.json())
        .then(json => setItems(json))
        .catch(error => console.log(error))
        .finally(() => console.log("Finalizado"))
    };

    useEffect(() => {
        fetchItems();
    }, []);
    
    return (items);
};