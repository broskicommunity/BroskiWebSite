/**
 * Sistema Imprevisti Bomb Party
 * 
 * Ogni turno ha una probabilità di attivare un imprevisto (bomba speciale).
 * La bomba mostrata cambia visivamente e gli effetti si applicano
 * quando il giocatore risponde correttamente o sbaglia.
 */

export type BombType = 'normal' | 'dollar' | 'lightning' | 'striped' | 'star';

export interface BombEvent {
  type: BombType;
  name: string;
  description: string;
  image: string;
  glowColor: string; // Tailwind ring color per effetto visivo
}

export const BOMB_EVENTS: Record<BombType, BombEvent> = {
  normal: {
    type: 'normal',
    name: 'Bomba Normale',
    description: 'Nessun effetto speciale',
    image: '/bombparty-assets/bombs-with-fuse-props-game-icons-metal-balls (1).png',
    glowColor: 'ring-white/20',
  },
  dollar: {
    type: 'dollar',
    name: 'Bomba Dollaro',
    description: '💰 Punti doppi per parola valida!',
    image: '/bombparty-assets/bombs-with-fuse-props-game-icons-metal-balls (2).png',
    glowColor: 'ring-green-400',
  },
  lightning: {
    type: 'lightning',
    name: 'Bomba Fulmine',
    description: '⚡ Parola valida = tutti gli avversari perdono una vita!',
    image: '/bombparty-assets/bombs-with-fuse-props-game-icons-metal-balls (3).png',
    glowColor: 'ring-purple-400',
  },
  striped: {
    type: 'striped',
    name: 'Bomba Sillaba+',
    description: '🎯 Sillaba difficile, ma indovinare = +1 vita!',
    image: '/bombparty-assets/bombs-with-fuse-props-game-icons-metal-balls (4).png',
    glowColor: 'ring-orange-400',
  },
  star: {
    type: 'star',
    name: 'Bomba Stella',
    description: '⭐ Tempo dimezzato, ma punti triplicati!',
    image: '/bombparty-assets/bombs-with-fuse-props-game-icons-metal-balls (5).png',
    glowColor: 'ring-blue-400',
  },
};

/**
 * Determina casualmente quale bomba appare per il prossimo turno.
 * 
 * @param canLightning - se false, la bomba fulmine non può apparire
 *                       (quando qualche avversario ha solo 1 vita)
 * @returns il tipo di bomba per questo turno
 */
export function rollBombEvent(canLightning: boolean): BombType {
  // Probabilità: 60% normale, 10% ciascuna per le speciali
  const roll = Math.random();

  if (roll < 0.60) return 'normal';
  if (roll < 0.70) return 'dollar';
  if (roll < 0.80) return canLightning ? 'lightning' : 'normal';
  if (roll < 0.90) return 'striped';
  return 'star';
}

// Sillabe più difficili per la bomba striped (3-4 lettere)
export const HARD_SYLLABLES = [
  'STR', 'SPR', 'GRA', 'FRA', 'TRA', 'PRE', 'PRO',
  'SCR', 'SQU', 'GHI', 'CHI', 'GLI', 'GNO', 'BRI',
  'CRO', 'DRA', 'FRE', 'GRI', 'PRI', 'TRI', 'VER',
  'STRA', 'SPRE', 'MENT', 'CION', 'QUES',
];

export function getHardSyllable(): string {
  return HARD_SYLLABLES[Math.floor(Math.random() * HARD_SYLLABLES.length)];
}
