export const items = [
    {
        title: 'Camisa',
        precio: 1000,
        id: 1
    },
    {
        title: 'Remera',
        precio: 500,
        id: 2
    },
    {
        title: 'Pantalon',
        precio: 2000,
        id: 3
    },
    {
        title: 'Zapatillas',
        precio: 1000,
        id: 4
    },
    {
        title: 'Medias',
        precio: 500,
        id: 5
    },
    {
        title: 'Cinturon',
        precio: 2000,
        id: 6
    },
]

export function getItemById (id){
    return items.find((item) => item.id == id)
}