// Pixel sprites: 48×54 frames, 4 rows (idle, walk, wave, signature). Mark, Jaimi and Megan bring their pets.
export const CAST = {
  mark: { name: 'Mark', sig: 'cheer' },
  jaimi: { name: 'Jaimi', sig: 'pet' },
  megan: { name: 'Megan', sig: 'dance' },
  nate: { name: 'Nate', sig: 'photo' },
  matthew: { name: 'Matthew', sig: 'sing' },
  riley: { name: 'Riley', sig: 'mustache' },
  julia: { name: 'Julia', sig: 'rocket' },
  staci: { name: 'Staci', sig: 'touchdown' },
  carol: { name: 'Carol', sig: 'cheers' },
};
const ROWS = { idle: [0, 2], walk: [1, 4], wave: [2, 2], sig: [3, 2] };
const FW = 48, FH = 54, DOGW = 30, DOG_OFFSET = 33;

// Pets stand 33px right of their owner and play the same row
const ASSET_V = '20261126160150'; // bumped by tools/bump_version.py so phones fetch new art
const PETS = { jaimi: 'jaimi_collie', mark: 'mark_livy', megan: 'megan_bunny' };

export function spriteHTML(key, anim = 'idle', scale = 3, extraClass = '') {
  key = CAST[key] ? key : 'megan';
  const pet = PETS[key];
  const w = (pet ? DOG_OFFSET + DOGW : FW) * scale;
  return `<span class="spr ${extraClass}" data-key="${key}" data-anim="${anim}" data-scale="${scale}"
    style="width:${w}px;height:${FH * scale}px" aria-hidden="true">
    <span class="spr-body" style="width:${FW * scale}px;height:${FH * scale}px;background-image:url(assets/sprites/${key}.png?v=${ASSET_V});background-size:${192 * scale}px ${216 * scale}px"></span>
    ${pet ? `<span class="spr-dog" style="left:${DOG_OFFSET * scale}px;width:${DOGW * scale}px;height:${FH * scale}px;background-image:url(assets/sprites/pets/${pet}.png?v=${ASSET_V});background-size:${120 * scale}px ${216 * scale}px"></span>` : ''}
  </span>`;
}

// Play an animation for a moment, then go back to what it was doing
export function playOnce(el, anim, ms = 2400) {
  if (!el) return;
  const prev = el.dataset.restAnim || el.dataset.anim;
  el.dataset.restAnim = prev;
  el.dataset.anim = anim;
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.dataset.anim = prev; delete el.dataset.restAnim; }, ms);
}

let tick = 0;
function frame() {
  tick++;
  document.querySelectorAll('.spr').forEach((el) => {
    const s = Number(el.dataset.scale);
    const [row, n] = ROWS[el.dataset.anim] || ROWS.idle;
    // stagger idle bobs so the whole fam doesn't move in lockstep
    const offset = el.dataset.anim === 'idle' ? (el.dataset.key.length + (el._seed ??= Math.floor(Math.random() * 4))) : 0;
    const f = (tick + offset) % n;
    const body = el.firstElementChild;
    body.style.backgroundPosition = `${-f * FW * s}px ${-row * FH * s}px`;
    const dog = el.querySelector('.spr-dog');
    if (dog) dog.style.backgroundPosition = `${-f * DOGW * s}px ${-row * FH * s}px`;
  });
}
setInterval(frame, 210);
requestAnimationFrame(frame);
