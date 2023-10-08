const products = [
    {
        id: '1',
        name: 'Nokia 1100',
        price: 250000,
        category: 'Celulares',
        img:'./Assets/nokia.png',
        stock: 25,
        description: 'Tremendo aparato. Indestructible.'
    },
    {
        id: '2',
        name: 'Producto 2',
        price: 4000,
        category: 'Category 1',
        img:'https://png.pngtree.com/element_our/sm/20180415/sm_5ad31a92cd6ca.jpg',
        stock: 15,
        description: 'Description 2'
    },
    {
        id: '3',
        name: 'Producto 3',
        price: 2500,
        category: 'Category 2',
        img:'https://png.pngtree.com/element_our/sm/20180415/sm_5ad31a92cd6ca.jpg',
        stock: 5,
        description: 'Description 3'
    },
]

export const getProducts = () => {
    return new Promise ((resolve) => {
        setTimeout(() => {
            resolve(products)
        }, 500)
    })
}

export const getProductById = (productId) => {
    return new Promise ((resolve) => {
        setTimeout(() => {
            resolve(products.find(prod => prod.id === productId))
        }, 500)
    })
}