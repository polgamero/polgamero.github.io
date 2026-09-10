var cursor = true;
var speed = 220;

setInterval(() => {
  if(cursor) {
    document.getElementById('cursor').style.opacity = 0;
    cursor = false;
  }else {
    document.getElementById('cursor').style.opacity = 1;
    cursor = true;
  }
}, speed);

const front = document.getElementById('front')
const back = document.getElementById('back')
const btn = document.getElementById('flip-btn')
const eeuu = document.getElementById('eeuu')
const arg = document.getElementById('arg')

function handleFlip() {
  front.classList.toggle('flipped')
  back.classList.toggle('flipped')
  eeuu.classList.toggle('hidden')
  arg.classList.toggle('hidden')
}

btn.addEventListener('click', handleFlip)
