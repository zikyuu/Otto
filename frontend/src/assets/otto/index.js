// Every piece of art goes through here. Drop your own file into this folder with the matching name
// (png, webp, jpg or svg all work) and it replaces the placeholder with no code change.
// The names and sizes Otto wants are listed in ASSETS_NEEDED.md at the project root.

const own = import.meta.glob('./*.{png,webp,jpg,jpeg,svg}', { eager: true, query: '?url', import: 'default' });
const stock = import.meta.glob('./placeholders/*.{png,webp,jpg,jpeg,svg}', { eager: true, query: '?url', import: 'default' });
const customIcons = import.meta.glob('./icons/*.svg', { eager: true, query: '?raw', import: 'default' });

const PREFER = ['webp', 'png', 'jpg', 'jpeg', 'svg'];                 // photographic formats beat vector placeholders
const find = (files, prefix, name) => PREFER.map(ext => files[`${prefix}${name}.${ext}`]).find(Boolean);

// -> { src, placeholder } or null
export function art(name) {
  const mine = find(own, './', name);
  if (mine) return { src: mine, placeholder: false };
  const fallback = find(stock, './placeholders/', name);
  return fallback ? { src: fallback, placeholder: true } : null;
}

// raw <svg> markup for a hand-drawn icon, if one was supplied (see icons/ and ASSETS_NEEDED.md)
export const customIcon = name => customIcons[`./icons/${name}.svg`] || null;
