export interface CarouselMember {
  name: string;
  image: string;
  bgColor: string; // Colore HEX per lo sfondo del box nel carousel
}

// Configurazione del carousel: durata di ogni slide in millisecondi
export const CAROUSEL_INTERVAL_MS = 4000;

export const carouselMembers: CarouselMember[] = [
  { name: 'un1verso_', image: '/skins/un1verso.png', bgColor: '#4e4e4eff' }, // Esempio: Viola
  { name: 'zZalix', image: '/skins/zZalix.png', bgColor: '#89abffff' }, // Esempio: Primary Blue
  { name: 'Pirata91', image: '/skins/Pirata91.png', bgColor: '#212222ff' }, // Esempio: Blu chiaro
  { name: "aeveloy", image: '/skins/a\'.png', bgColor: '#BD9462' },
  { name: 'gabryX2', image: '/skins/gabryX2.png', bgColor: '#36a336ff' }, // Esempio: Verde Lime
  { name: 'Zeph', image: '/skins/Zeph.png', bgColor: '#5d4d2e' }, // Arancione
  { name: "erRossinho", image: '/skins/erRossinho.png', bgColor: '#CFAA42' },
  { name: "il_Muffin", image: '/skins/il_Muffin.png', bgColor: "#751C1C"},
  { name: "BlimMC", image: '/skins/BlimMC_.png', bgColor: "#B8E9F2"},
  { name: 'Zlem', image: '/skins/Zlem.png', bgColor: '#dddcdcff' },
  { name: 'Antoneitorus', image: '/skins/Antoneitorus.png', bgColor: '#452A08'},
  { name: 'SuperStepp', image: '/skins/Super_Stepp.png', bgColor: '#27A9DB'}
];
