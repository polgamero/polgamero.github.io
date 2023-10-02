import React, { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useItems } from '../../Hooks/useItems'
import { items } from '../../Helpers/Items' 

const Products = () => {

return (

<>
<div style={{display:"flex", flexDirection:"row", justifyContent:"center"}}>
    <h2>Productos</h2>
</div>
{
    items.map((item) => {
    return (
        <div key={item.id} style={{display:"flex", flexDirection:"row", justifyContent:"center"}}>
        <Link to={`/products/${item.id}`}>{item.title}</Link>
        </div>
    )
    })
}
</>

)
}

export default Products