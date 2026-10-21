// Closed vector presets. Authored documents never supply SVG markup or paths.
export const EDITORIAL_SHAPES=Object.freeze({speech:'Globo de diálogo',thought:'Nube de pensamiento',rectangle:'Rectángulo',square:'Cuadrado',triangle:'Triángulo',circle:'Círculo'});
const NS='http://www.w3.org/2000/svg';
export function renderEditorialShape(doc,block){
  const box=doc.createElement('div');box.className='ed-shape-box';
  const figure=doc.createElement('div');figure.className='ed-shape-figure';figure.dataset.shape=block.shape;
  if(['circle','square'].includes(block.shape))figure.dataset.equalSides='true';
  const svg=doc.createElementNS(NS,'svg');svg.setAttribute('viewBox','0 0 100 100');svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('aria-hidden','true');svg.classList.add('ed-shape-art');
  const add=(tag,attrs)=>{const node=doc.createElementNS(NS,tag);for(const [k,v] of Object.entries({...attrs,fill:block.fill,stroke:block.stroke,'stroke-width':block.strokeWidth,'stroke-linejoin':'round','vector-effect':'non-scaling-stroke'}))node.setAttribute(k,String(v));svg.append(node);};
  // Four-unit inset keeps borders inside the authored bounds, including at export.
  if(block.shape==='circle')add('ellipse',{cx:50,cy:50,rx:46,ry:46});
  else if(block.shape==='triangle')add('polygon',{points:'50,4 96,96 4,96'});
  else if(block.shape==='speech')add('path',{d:'M14 4 H86 Q96 4 96 14 V61 Q96 73 84 73 H40 L16 96 L22 73 H14 Q4 73 4 61 V16 Q4 4 14 4 Z'});
  else if(block.shape==='thought'){
    add('path',{d:'M20 65 C3 66 1 48 10 39 C1 25 15 12 28 17 C33 2 52 1 61 13 C74 4 91 15 88 28 C102 33 100 52 88 57 C89 71 68 80 57 69 C45 81 26 79 20 65 Z'});
    add('ellipse',{cx:23,cy:83,rx:7,ry:6});add('ellipse',{cx:12,cy:95,rx:3,ry:2});
  }else add('rect',{x:4,y:4,width:92,height:92,rx:block.shape==='square'?0:5});
  if(['speech','thought'].includes(block.shape)&&block.tail==='right')svg.style.transform='scaleX(-1)';
  figure.append(svg);box.append(figure);return {box,figure};
}
