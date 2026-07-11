/* ==========================================================================
   POKÉMON GEN 1 - BATTLE SIMULATOR
   game.js — Lógica completa del juego (ES6, modular, sin dependencias)
   --------------------------------------------------------------------------
   Índice de secciones:
     1. Tipos y tabla de efectividad (Gen 1)
     2. Base de datos de movimientos
     3. Base de datos de Pokémon (roster representativo Gen 1)
     4. Utilidades generales
     5. Clase BattlePokemon (instancia de combate)
     6. BattleRenderer (Canvas: sprites y animaciones)
     7. AIController (IA del Bot)
     8. BattleSystem (máquina de estados del combate)
     9. Pokedex / Team Builder (UI)
    10. Navegación de pantallas y menús
    11. KeyboardMenu + Controles (teclado hotseat)
    12. GameState global + inicialización
   ========================================================================== */

'use strict';

/* ==========================================================================
   1. TIPOS Y TABLA DE EFECTIVIDAD (Gen 1)
   ========================================================================== */

const TYPES = ['normal','fire','water','electric','grass','ice','fighting','poison',
               'ground','flying','psychic','bug','rock','ghost','dragon'];

// Regla auténtica de Gen 1: la categoría (física/especial) depende del TIPO
// del movimiento, no del movimiento en sí (esto cambió a partir de Gen 4).
const PHYSICAL_TYPES = new Set(['normal','fighting','flying','ground','rock','bug','poison','ghost']);
function categoryForType(type) {
  if (!type) return 'physical'; // movimientos sin tipo (Forcejeo)
  return PHYSICAL_TYPES.has(type) ? 'physical' : 'special';
}

// Tabla de efectividad de tipos, fiel a Generación 1 (incluye el famoso "bug"
// de Gen 1 donde Fantasma NO es súper efectivo contra Psíquico; esto se
// corrigió en Generación 2 en adelante).
const TYPE_CHART = {
  normal:   { rock: 0.5, ghost: 0 },
  fire:     { fire: 0.5, water: 0.5, grass: 2, ice: 2, bug: 2, rock: 0.5, dragon: 0.5 },
  water:    { fire: 2, water: 0.5, grass: 0.5, ground: 2, rock: 2, dragon: 0.5 },
  electric: { water: 2, electric: 0.5, grass: 0.5, ground: 0, flying: 2, dragon: 0.5 },
  grass:    { fire: 0.5, water: 2, grass: 0.5, poison: 0.5, ground: 2, flying: 0.5, bug: 0.5, rock: 2, dragon: 0.5 },
  ice:      { fire: 0.5, water: 0.5, ice: 0.5, grass: 2, ground: 2, flying: 2, dragon: 2 },
  fighting: { normal: 2, ice: 2, poison: 0.5, flying: 0.5, psychic: 0.5, bug: 0.5, rock: 2, ghost: 0 },
  poison:   { grass: 2, bug: 2, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5 },
  ground:   { fire: 2, electric: 2, poison: 2, rock: 2, grass: 0.5, bug: 0.5, flying: 0 },
  flying:   { grass: 2, fighting: 2, bug: 2, electric: 0.5, rock: 0.5 },
  psychic:  { fighting: 2, poison: 2, psychic: 0.5 },
  bug:      { grass: 2, psychic: 2, fire: 0.5, fighting: 0.5, poison: 0.5, flying: 0.5, ghost: 0.5 },
  rock:     { fire: 2, ice: 2, flying: 2, bug: 2, fighting: 0.5, ground: 0.5 },
  ghost:    { ghost: 2, psychic: 1, normal: 0 }, // psychic:1 -> bug histórico de Gen1 (a propósito)
  dragon:   { dragon: 2 }
};

function getEffectiveness(moveType, defenderTypes) {
  if (!moveType) return 1;
  let mult = 1;
  const row = TYPE_CHART[moveType];
  if (!row) return 1;
  for (const dType of defenderTypes) {
    if (row[dType] !== undefined) mult *= row[dType];
  }
  return mult;
}

/* ==========================================================================
   2. BASE DE DATOS DE MOVIMIENTOS
   ========================================================================== */
// Cada movimiento: { name, type, power (null = movimiento de estado), accuracy,
// pp, effect?, highCrit? }
// effect puede contener: status, stat{target,stages}, heal, confuse, recoil,
// drain, fixedDamage:'level', fixedDamageFlat, chance (para efectos secundarios)

const MOVES = {
  // --- Normal ---
  tackle:      { name: 'Placaje',        type: 'normal', power: 40,  accuracy: 100, pp: 35 },
  scratch:     { name: 'Arañazo',        type: 'normal', power: 40,  accuracy: 100, pp: 35 },
  quickAttack: { name: 'Ataque Rápido',  type: 'normal', power: 40,  accuracy: 100, pp: 30, priority: 1 },
  slam:        { name: 'Golpazo',        type: 'normal', power: 80,  accuracy: 75,  pp: 20 },
  bodySlam:    { name: 'Cuerpo Pesado',  type: 'normal', power: 85,  accuracy: 100, pp: 15, effect: { status: 'PAR', chance: 0.3 } },
  doubleEdge:  { name: 'Doble Filo',     type: 'normal', power: 100, accuracy: 100, pp: 15, effect: { recoil: 0.25 } },
  hyperBeam:   { name: 'Hiperrayo',      type: 'normal', power: 150, accuracy: 90,  pp: 5 },
  growl:       { name: 'Gruñido',        type: 'normal', power: null, accuracy: 100, pp: 40, effect: { stat: 'atk', stages: -1, target: 'enemy' } },
  tailWhip:    { name: 'Látigo',         type: 'normal', power: null, accuracy: 100, pp: 30, effect: { stat: 'def', stages: -1, target: 'enemy' } },
  swordsDance: { name: 'Espadas Danza',  type: 'normal', power: null, accuracy: 100, pp: 20, effect: { stat: 'atk', stages: 2, target: 'self' } },
  softboiled:  { name: 'Ovo Doble',      type: 'normal', power: null, accuracy: 100, pp: 10, effect: { heal: 0.5, target: 'self' } },
  recover:     { name: 'Recuperación',   type: 'normal', power: null, accuracy: 100, pp: 20, effect: { heal: 0.5, target: 'self' } },

  // --- Fuego ---
  ember:        { name: 'Ascuas',        type: 'fire', power: 40,  accuracy: 100, pp: 25, effect: { status: 'BRN', chance: 0.1 } },
  flamethrower: { name: 'Lanzallamas',   type: 'fire', power: 95,  accuracy: 100, pp: 15, effect: { status: 'BRN', chance: 0.1 } },
  fireBlast:    { name: 'Llamarada',     type: 'fire', power: 110, accuracy: 85,  pp: 5,  effect: { status: 'BRN', chance: 0.3 } },

  // --- Agua ---
  waterGun:  { name: 'Pistola Agua', type: 'water', power: 40,  accuracy: 100, pp: 25 },
  bubbleBeam:{ name: 'Rayo Burbuja', type: 'water', power: 65,  accuracy: 100, pp: 20, effect: { stat: 'spd', stages: -1, chance: 0.1, target: 'enemy' } },
  surf:      { name: 'Surf',         type: 'water', power: 95,  accuracy: 100, pp: 15 },
  hydroPump: { name: 'Hidrobomba',   type: 'water', power: 110, accuracy: 80,  pp: 5 },

  // --- Eléctrico ---
  thunderShock: { name: 'Impactrueno', type: 'electric', power: 40,  accuracy: 100, pp: 30, effect: { status: 'PAR', chance: 0.1 } },
  thunderbolt:  { name: 'Rayo',        type: 'electric', power: 95,  accuracy: 100, pp: 15, effect: { status: 'PAR', chance: 0.1 } },
  thunder:      { name: 'Trueno',      type: 'electric', power: 110, accuracy: 70,  pp: 10, effect: { status: 'PAR', chance: 0.3 } },
  thunderWave:  { name: 'Onda Trueno', type: 'electric', power: null, accuracy: 100, pp: 20, effect: { status: 'PAR', chance: 1, target: 'enemy' } },

  // --- Planta ---
  vineWhip:    { name: 'Látigo Cepa', type: 'grass', power: 35,  accuracy: 100, pp: 10 },
  razorLeaf:   { name: 'Hoja Afilada',type: 'grass', power: 55,  accuracy: 95,  pp: 25, highCrit: true },
  solarBeam:   { name: 'Rayo Solar',  type: 'grass', power: 120, accuracy: 100, pp: 10 },
  megaDrain:   { name: 'Mega Agot.',  type: 'grass', power: 40,  accuracy: 100, pp: 10, effect: { drain: 0.5 } },
  sleepPowder: { name: 'Somnífero',   type: 'grass', power: null, accuracy: 75,  pp: 15, effect: { status: 'SLP', chance: 1, target: 'enemy' } },
  poisonPowder:{ name: 'Polvo Veneno',type: 'grass', power: null, accuracy: 75,  pp: 35, effect: { status: 'PSN', chance: 1, target: 'enemy' } },

  // --- Hielo ---
  iceBeam:   { name: 'Rayo Hielo', type: 'ice', power: 95,  accuracy: 100, pp: 10, effect: { status: 'FRZ', chance: 0.1 } },
  blizzard:  { name: 'Ventisca',   type: 'ice', power: 110, accuracy: 70,  pp: 5,  effect: { status: 'FRZ', chance: 0.1 } },
  auroraBeam:{ name: 'Aurora',     type: 'ice', power: 65,  accuracy: 100, pp: 20, effect: { stat: 'atk', stages: -1, chance: 0.1, target: 'enemy' } },

  // --- Lucha ---
  karateChop:  { name: 'Karatazo',     type: 'fighting', power: 50,  accuracy: 100, pp: 25, highCrit: true },
  lowKick:     { name: 'Patada Baja',  type: 'fighting', power: 50,  accuracy: 90,  pp: 20 },
  submission:  { name: 'Sumisión',     type: 'fighting', power: 80,  accuracy: 80,  pp: 25, effect: { recoil: 0.25 } },
  highJumpKick:{ name: 'Patada Salto', type: 'fighting', power: 85,  accuracy: 90,  pp: 20, effect: { recoil: 0.5 } },

  // --- Veneno ---
  poisonSting: { name: 'Picotazo Veneno', type: 'poison', power: 15, accuracy: 100, pp: 35, effect: { status: 'PSN', chance: 0.3 } },
  sludge:      { name: 'Lodo',            type: 'poison', power: 65, accuracy: 100, pp: 20, effect: { status: 'PSN', chance: 0.3 } },
  acidArmor:   { name: 'Armadura Ácida',  type: 'poison', power: null, accuracy: 100, pp: 20, effect: { stat: 'def', stages: 2, target: 'self' } },
  toxic:       { name: 'Tóxico',          type: 'poison', power: null, accuracy: 85,  pp: 10, effect: { status: 'PSN', chance: 1, target: 'enemy' } },

  // --- Tierra ---
  earthquake: { name: 'Terremoto', type: 'ground', power: 100, accuracy: 100, pp: 10 },
  dig:        { name: 'Excavar',   type: 'ground', power: 80,  accuracy: 100, pp: 10 },
  boneClub:   { name: 'Hueso Palo',type: 'ground', power: 65,  accuracy: 85,  pp: 20 },

  // --- Volador ---
  gust:      { name: 'Tornado',     type: 'flying', power: 40, accuracy: 100, pp: 35 },
  wingAttack:{ name: 'Ataque Ala',  type: 'flying', power: 35, accuracy: 100, pp: 35 },
  peck:      { name: 'Picotazo',    type: 'flying', power: 35, accuracy: 100, pp: 35 },
  drillPeck: { name: 'Pico Taladro',type: 'flying', power: 80, accuracy: 100, pp: 20 },

  // --- Psíquico ---
  confusion:  { name: 'Confusión',  type: 'psychic', power: 50, accuracy: 100, pp: 25, effect: { confuse: 1.0, target: 'enemy' } },
  psybeam:    { name: 'Psicorrayo', type: 'psychic', power: 65, accuracy: 100, pp: 20, effect: { confuse: 0.1, target: 'enemy' } },
  psychicMove:{ name: 'Psíquico',   type: 'psychic', power: 90, accuracy: 100, pp: 10, effect: { stat: 'spc', stages: -1, chance: 0.1, target: 'enemy' } },
  agility:    { name: 'Agilidad',   type: 'psychic', power: null, accuracy: 100, pp: 30, effect: { stat: 'spd', stages: 2, target: 'self' } },
  hypnosis:   { name: 'Hipnosis',   type: 'psychic', power: null, accuracy: 60, pp: 20, effect: { status: 'SLP', chance: 1, target: 'enemy' } },

  // --- Bicho ---
  stringShot: { name: 'Disparo Demora', type: 'bug', power: null, accuracy: 95, pp: 40, effect: { stat: 'spd', stages: -1, target: 'enemy' } },
  twineedle:  { name: 'Doble Ataque',   type: 'bug', power: 25,  accuracy: 100, pp: 20, effect: { status: 'PSN', chance: 0.2 } },
  leechLife:  { name: 'Chupavidas',     type: 'bug', power: 20,  accuracy: 100, pp: 15, effect: { drain: 0.5 } },

  // --- Roca ---
  rockThrow: { name: 'Lanzarrocas', type: 'rock', power: 50, accuracy: 90, pp: 15 },
  rockSlide: { name: 'Avalancha',   type: 'rock', power: 75, accuracy: 90, pp: 10 },

  // --- Fantasma ---
  lick:      { name: 'Lengüetazo', type: 'ghost', power: 20, accuracy: 100, pp: 30, effect: { status: 'PAR', chance: 0.3 } },
  nightShade:{ name: 'Tinieblas',  type: 'ghost', power: null, accuracy: 100, pp: 15, effect: { fixedDamage: 'level' } },
  confuseRay:{ name: 'Rayo Confuso', type: 'ghost', power: null, accuracy: 100, pp: 10, effect: { confuse: 1.0, target: 'enemy' } },

  // --- Dragón ---
  dragonRage: { name: 'Ira Dragón', type: 'dragon', power: null, accuracy: 100, pp: 10, effect: { fixedDamageFlat: 40 } },

  // --- Especial: sin PP (fallback) ---
  struggle: { name: 'Forcejeo', type: null, power: 50, accuracy: 100, pp: 999, effect: { recoil: 0.25 } },
};

/* ==========================================================================
   3. BASE DE DATOS DE POKÉMON (roster representativo de Gen 1: 78 especies)
   ========================================================================== */
// Nota de diseño: incluir los 151 + Mewtwo/Mew con 4 movimientos curados cada
// uno excede el alcance razonable de una sola entrega. Este roster cubre todas
// las líneas evolutivas icónicas y los 15 tipos de Gen 1. Para añadir más
// Pokémon, solo hay que agregar un objeto más a POKEDEX con el mismo formato.

function spriteFront(id) { return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`; }
function spriteBack(id)  { return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/back/${id}.png`; }

// Array de referencia de URLs de sprites públicas y confiables (PokeAPI / GitHub raw):
const SPRITE_URLS_REFERENCE = [
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/{id}.png',
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/back/{id}.png',
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-i/red-blue/{id}.png',
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-i/red-blue/transparent/{id}.png',
];

const POKEDEX = [
  { id: 1,   name: 'Bulbasaur',  types: ['grass','poison'],  base: { hp: 45, atk: 49, def: 49, spd: 45, spc: 65 },  moves: ['vineWhip','poisonPowder','growl','megaDrain'] },
  { id: 2,   name: 'Ivysaur',    types: ['grass','poison'],  base: { hp: 60, atk: 62, def: 63, spd: 60, spc: 80 },  moves: ['vineWhip','razorLeaf','poisonPowder','sleepPowder'] },
  { id: 3,   name: 'Venusaur',   types: ['grass','poison'],  base: { hp: 80, atk: 82, def: 83, spd: 80, spc: 100 }, moves: ['razorLeaf','solarBeam','sludge','sleepPowder'] },
  { id: 4,   name: 'Charmander', types: ['fire'],            base: { hp: 39, atk: 52, def: 43, spd: 65, spc: 50 },  moves: ['ember','scratch','growl','quickAttack'] },
  { id: 5,   name: 'Charmeleon', types: ['fire'],            base: { hp: 58, atk: 64, def: 58, spd: 80, spc: 65 },  moves: ['ember','slam','flamethrower','quickAttack'] },
  { id: 6,   name: 'Charizard',  types: ['fire','flying'],   base: { hp: 78, atk: 84, def: 78, spd: 100, spc: 85 }, moves: ['flamethrower','fireBlast','wingAttack','slam'] },
  { id: 7,   name: 'Squirtle',   types: ['water'],           base: { hp: 44, atk: 48, def: 65, spd: 43, spc: 50 },  moves: ['waterGun','tackle','tailWhip','bubbleBeam'] },
  { id: 8,   name: 'Wartortle',  types: ['water'],           base: { hp: 59, atk: 63, def: 80, spd: 58, spc: 65 },  moves: ['waterGun','bubbleBeam','bodySlam','surf'] },
  { id: 9,   name: 'Blastoise',  types: ['water'],           base: { hp: 79, atk: 83, def: 100, spd: 78, spc: 85 }, moves: ['surf','hydroPump','bodySlam','bubbleBeam'] },
  { id: 25,  name: 'Pikachu',    types: ['electric'],        base: { hp: 35, atk: 55, def: 30, spd: 90, spc: 50 },  moves: ['thunderShock','thunderbolt','quickAttack','slam'] },
  { id: 26,  name: 'Raichu',     types: ['electric'],        base: { hp: 60, atk: 90, def: 55, spd: 100, spc: 90 }, moves: ['thunderbolt','thunder','quickAttack','slam'] },
  { id: 31,  name: 'Nidoqueen',  types: ['poison','ground'], base: { hp: 90, atk: 82, def: 87, spd: 76, spc: 75 },  moves: ['sludge','earthquake','bodySlam','tailWhip'] },
  { id: 34,  name: 'Nidoking',   types: ['poison','ground'], base: { hp: 81, atk: 92, def: 77, spd: 85, spc: 75 },  moves: ['earthquake','sludge','bodySlam','doubleEdge'] },
  { id: 36,  name: 'Clefable',   types: ['normal'],          base: { hp: 95, atk: 70, def: 73, spd: 60, spc: 85 },  moves: ['bodySlam','doubleEdge','softboiled','growl'] },
  { id: 38,  name: 'Ninetales',  types: ['fire'],            base: { hp: 73, atk: 76, def: 75, spd: 100, spc: 100 },moves: ['flamethrower','fireBlast','quickAttack','confuseRay'] },
  { id: 40,  name: 'Wigglytuff', types: ['normal'],          base: { hp: 140, atk: 70, def: 45, spd: 45, spc: 50 }, moves: ['doubleEdge','bodySlam','softboiled','growl'] },
  { id: 42,  name: 'Golbat',     types: ['poison','flying'], base: { hp: 75, atk: 80, def: 70, spd: 90, spc: 75 },  moves: ['wingAttack','sludge','poisonSting','confuseRay'] },
  { id: 45,  name: 'Vileplume',  types: ['grass','poison'],  base: { hp: 75, atk: 80, def: 85, spd: 50, spc: 100 }, moves: ['razorLeaf','solarBeam','sleepPowder','sludge'] },
  { id: 47,  name: 'Parasect',   types: ['bug','grass'],     base: { hp: 60, atk: 95, def: 80, spd: 30, spc: 80 },  moves: ['leechLife','sleepPowder','stringShot','megaDrain'] },
  { id: 49,  name: 'Venomoth',   types: ['bug','poison'],    base: { hp: 70, atk: 65, def: 60, spd: 90, spc: 90 },  moves: ['leechLife','sludge','poisonPowder','psybeam'] },
  { id: 51,  name: 'Dugtrio',    types: ['ground'],          base: { hp: 35, atk: 80, def: 50, spd: 120, spc: 70 },moves: ['earthquake','dig','quickAttack','slam'] },
  { id: 53,  name: 'Persian',    types: ['normal'],          base: { hp: 65, atk: 70, def: 60, spd: 115, spc: 65 },moves: ['slam','doubleEdge','quickAttack','scratch'] },
  { id: 55,  name: 'Golduck',    types: ['water','psychic'], base: { hp: 80, atk: 82, def: 78, spd: 85, spc: 80 }, moves: ['surf','psychicMove','psybeam','hydroPump'] },
  { id: 57,  name: 'Primeape',   types: ['fighting'],        base: { hp: 65, atk: 105, def: 60, spd: 95, spc: 60 },moves: ['karateChop','lowKick','submission','quickAttack'] },
  { id: 59,  name: 'Arcanine',   types: ['fire'],            base: { hp: 90, atk: 110, def: 80, spd: 95, spc: 80 },moves: ['flamethrower','fireBlast','quickAttack','doubleEdge'] },
  { id: 62,  name: 'Poliwrath',  types: ['water','fighting'],base: { hp: 90, atk: 85, def: 95, spd: 70, spc: 70 }, moves: ['surf','submission','lowKick','bodySlam'] },
  { id: 65,  name: 'Alakazam',   types: ['psychic'],         base: { hp: 55, atk: 50, def: 45, spd: 120, spc: 135 },moves: ['psychicMove','psybeam','confusion','agility'] },
  { id: 68,  name: 'Machamp',    types: ['fighting'],        base: { hp: 90, atk: 130, def: 80, spd: 55, spc: 65 },moves: ['submission','lowKick','karateChop','bodySlam'] },
  { id: 71,  name: 'Victreebel', types: ['grass','poison'],  base: { hp: 80, atk: 105, def: 65, spd: 70, spc: 100 },moves: ['razorLeaf','sludge','sleepPowder','solarBeam'] },
  { id: 73,  name: 'Tentacruel', types: ['water','poison'],  base: { hp: 80, atk: 70, def: 65, spd: 100, spc: 120 },moves: ['surf','sludge','bubbleBeam','hydroPump'] },
  { id: 76,  name: 'Golem',      types: ['rock','ground'],   base: { hp: 80, atk: 110, def: 130, spd: 45, spc: 55 },moves: ['earthquake','rockSlide','dig','rockThrow'] },
  { id: 78,  name: 'Rapidash',   types: ['fire'],            base: { hp: 65, atk: 100, def: 70, spd: 105, spc: 80 },moves: ['flamethrower','fireBlast','quickAttack','slam'] },
  { id: 80,  name: 'Slowbro',    types: ['water','psychic'], base: { hp: 95, atk: 75, def: 110, spd: 30, spc: 80 },moves: ['surf','psychicMove','confusion','bodySlam'] },
  { id: 82,  name: 'Magneton',   types: ['electric'],        base: { hp: 50, atk: 60, def: 95, spd: 70, spc: 120 },moves: ['thunderbolt','thunder','thunderShock','hyperBeam'] },
  { id: 85,  name: 'Dodrio',     types: ['normal','flying'], base: { hp: 60, atk: 110, def: 70, spd: 100, spc: 60 },moves: ['drillPeck','wingAttack','quickAttack','doubleEdge'] },
  { id: 87,  name: 'Dewgong',    types: ['water','ice'],     base: { hp: 90, atk: 70, def: 80, spd: 70, spc: 95 }, moves: ['surf','iceBeam','blizzard','hydroPump'] },
  { id: 89,  name: 'Muk',        types: ['poison'],          base: { hp: 105, atk: 105, def: 75, spd: 50, spc: 65 },moves: ['sludge','toxic','bodySlam','doubleEdge'] },
  { id: 91,  name: 'Cloyster',   types: ['water','ice'],     base: { hp: 50, atk: 95, def: 180, spd: 70, spc: 85 },moves: ['iceBeam','blizzard','surf','hydroPump'] },
  { id: 94,  name: 'Gengar',     types: ['ghost','poison'],  base: { hp: 60, atk: 65, def: 60, spd: 110, spc: 130 },moves: ['lick','nightShade','confuseRay','sludge'] },
  { id: 95,  name: 'Onix',       types: ['rock','ground'],   base: { hp: 35, atk: 45, def: 160, spd: 70, spc: 30 },moves: ['rockThrow','rockSlide','earthquake','dig'] },
  { id: 97,  name: 'Hypno',      types: ['psychic'],         base: { hp: 85, atk: 73, def: 70, spd: 67, spc: 115 },moves: ['psychicMove','confusion','psybeam','hypnosis'] },
  { id: 99,  name: 'Kingler',    types: ['water'],           base: { hp: 55, atk: 130, def: 115, spd: 75, spc: 50 },moves: ['surf','hydroPump','bubbleBeam','slam'] },
  { id: 101, name: 'Electrode',  types: ['electric'],        base: { hp: 60, atk: 50, def: 70, spd: 140, spc: 80 },moves: ['thunderbolt','thunder','thunderShock','doubleEdge'] },
  { id: 103, name: 'Exeggutor',  types: ['grass','psychic'], base: { hp: 95, atk: 95, def: 85, spd: 55, spc: 125 },moves: ['solarBeam','psychicMove','sleepPowder','megaDrain'] },
  { id: 105, name: 'Marowak',    types: ['ground'],          base: { hp: 60, atk: 80, def: 110, spd: 45, spc: 50 },moves: ['boneClub','earthquake','dig','bodySlam'] },
  { id: 106, name: 'Hitmonlee',  types: ['fighting'],        base: { hp: 50, atk: 120, def: 53, spd: 87, spc: 35 },moves: ['highJumpKick','lowKick','karateChop','quickAttack'] },
  { id: 107, name: 'Hitmonchan', types: ['fighting'],        base: { hp: 50, atk: 105, def: 79, spd: 76, spc: 35 },moves: ['karateChop','submission','quickAttack','bodySlam'] },
  { id: 108, name: 'Lickitung',  types: ['normal'],          base: { hp: 90, atk: 55, def: 75, spd: 30, spc: 60 },moves: ['slam','bodySlam','doubleEdge','growl'] },
  { id: 110, name: 'Weezing',    types: ['poison'],          base: { hp: 65, atk: 90, def: 120, spd: 60, spc: 85 },moves: ['sludge','toxic','acidArmor','bodySlam'] },
  { id: 112, name: 'Rhydon',     types: ['ground','rock'],   base: { hp: 105, atk: 130, def: 120, spd: 40, spc: 45 },moves: ['earthquake','rockSlide','rockThrow','doubleEdge'] },
  { id: 113, name: 'Chansey',    types: ['normal'],          base: { hp: 250, atk: 5, def: 5, spd: 50, spc: 105 },moves: ['softboiled','doubleEdge','growl','tailWhip'] },
  { id: 114, name: 'Tangela',    types: ['grass'],           base: { hp: 65, atk: 55, def: 115, spd: 60, spc: 100 },moves: ['vineWhip','razorLeaf','sleepPowder','megaDrain'] },
  { id: 115, name: 'Kangaskhan', types: ['normal'],          base: { hp: 105, atk: 95, def: 80, spd: 90, spc: 40 },moves: ['bodySlam','doubleEdge','slam','tailWhip'] },
  { id: 121, name: 'Starmie',    types: ['water','psychic'], base: { hp: 60, atk: 75, def: 85, spd: 115, spc: 100 },moves: ['surf','hydroPump','psychicMove','thunderbolt'] },
  { id: 122, name: 'Mr. Mime',   types: ['psychic'],         base: { hp: 40, atk: 45, def: 65, spd: 90, spc: 100 },moves: ['psychicMove','confusion','psybeam','agility'] },
  { id: 123, name: 'Scyther',    types: ['bug','flying'],    base: { hp: 70, atk: 110, def: 80, spd: 105, spc: 55 },moves: ['wingAttack','leechLife','quickAttack','slam'] },
  { id: 124, name: 'Jynx',       types: ['ice','psychic'],   base: { hp: 65, atk: 50, def: 35, spd: 95, spc: 95 }, moves: ['iceBeam','blizzard','psychicMove','lick'] },
  { id: 125, name: 'Electabuzz', types: ['electric'],        base: { hp: 65, atk: 83, def: 57, spd: 105, spc: 85 },moves: ['thunderbolt','thunder','thunderShock','quickAttack'] },
  { id: 126, name: 'Magmar',     types: ['fire'],            base: { hp: 65, atk: 95, def: 57, spd: 93, spc: 85 },moves: ['fireBlast','flamethrower','ember','quickAttack'] },
  { id: 127, name: 'Pinsir',     types: ['bug'],             base: { hp: 65, atk: 125, def: 100, spd: 85, spc: 55 },moves: ['leechLife','doubleEdge','quickAttack','slam'] },
  { id: 128, name: 'Tauros',     types: ['normal'],          base: { hp: 75, atk: 100, def: 95, spd: 110, spc: 70 },moves: ['doubleEdge','bodySlam','quickAttack','tailWhip'] },
  { id: 130, name: 'Gyarados',   types: ['water','flying'],  base: { hp: 95, atk: 125, def: 79, spd: 81, spc: 100 },moves: ['hydroPump','surf','dragonRage','bodySlam'] },
  { id: 131, name: 'Lapras',     types: ['water','ice'],     base: { hp: 130, atk: 85, def: 80, spd: 60, spc: 95 },moves: ['surf','iceBeam','blizzard','bodySlam'] },
  { id: 132, name: 'Ditto',      types: ['normal'],          base: { hp: 48, atk: 48, def: 48, spd: 48, spc: 48 },moves: ['tackle','scratch','growl','tailWhip'] },
  { id: 133, name: 'Eevee',      types: ['normal'],          base: { hp: 55, atk: 55, def: 50, spd: 55, spc: 65 },moves: ['quickAttack','bodySlam','tailWhip','growl'] },
  { id: 134, name: 'Vaporeon',   types: ['water'],           base: { hp: 130, atk: 65, def: 60, spd: 65, spc: 110 },moves: ['surf','hydroPump','bubbleBeam','bodySlam'] },
  { id: 135, name: 'Jolteon',    types: ['electric'],        base: { hp: 65, atk: 65, def: 60, spd: 130, spc: 110 },moves: ['thunderbolt','thunder','thunderShock','quickAttack'] },
  { id: 136, name: 'Flareon',    types: ['fire'],            base: { hp: 65, atk: 130, def: 60, spd: 65, spc: 95 },moves: ['flamethrower','fireBlast','ember','quickAttack'] },
  { id: 137, name: 'Porygon',    types: ['normal'],          base: { hp: 65, atk: 60, def: 70, spd: 40, spc: 75 },moves: ['thunderbolt','psychicMove','tackle','doubleEdge'] },
  { id: 142, name: 'Aerodactyl', types: ['rock','flying'],   base: { hp: 80, atk: 105, def: 65, spd: 130, spc: 60 },moves: ['wingAttack','rockSlide','drillPeck','rockThrow'] },
  { id: 143, name: 'Snorlax',    types: ['normal'],          base: { hp: 160, atk: 110, def: 65, spd: 30, spc: 65 },moves: ['bodySlam','doubleEdge','hyperBeam','tackle'] },
  { id: 144, name: 'Articuno',   types: ['ice','flying'],    base: { hp: 90, atk: 85, def: 100, spd: 85, spc: 95 },moves: ['iceBeam','blizzard','wingAttack','agility'] },
  { id: 145, name: 'Zapdos',     types: ['electric','flying'],base: { hp: 90, atk: 90, def: 85, spd: 100, spc: 125 },moves: ['thunderbolt','thunder','drillPeck','agility'] },
  { id: 146, name: 'Moltres',    types: ['fire','flying'],   base: { hp: 90, atk: 100, def: 90, spd: 90, spc: 125 },moves: ['flamethrower','fireBlast','wingAttack','drillPeck'] },
  { id: 147, name: 'Dratini',    types: ['dragon'],          base: { hp: 41, atk: 64, def: 45, spd: 50, spc: 50 },moves: ['dragonRage','slam','tackle','tailWhip'] },
  { id: 149, name: 'Dragonite',  types: ['dragon','flying'], base: { hp: 91, atk: 134, def: 95, spd: 80, spc: 100 },moves: ['dragonRage','hyperBeam','wingAttack','slam'] },
  { id: 150, name: 'Mewtwo',     types: ['psychic'],         base: { hp: 106, atk: 110, def: 90, spd: 130, spc: 154 },moves: ['psychicMove','psybeam','confusion','recover'] },
  { id: 151, name: 'Mew',        types: ['psychic'],         base: { hp: 100, atk: 100, def: 100, spd: 100, spc: 100 },moves: ['psychicMove','psybeam','softboiled','swordsDance'] },
];

/* ==========================================================================
   4. UTILIDADES GENERALES
   ========================================================================== */

function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
function choice(arr) { return arr[randInt(0, arr.length - 1)]; }
function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

// Fórmula simplificada de stats (nivel fijo = 50 para todos los combates)
const BATTLE_LEVEL = 50;
function calcStat(base, level, isHP) {
  const v = Math.floor((2 * base * level) / 100);
  return isHP ? v + level + 10 : v + 5;
}

function playSfx(id) {
  const el = document.getElementById(id);
  if (!el) return;
  try {
    el.currentTime = 0;
    el.play().catch(() => {});
  } catch (e) { /* audio opcional: se ignora si falla */ }
}

function playBgm(id) {
  stopAllBgm();
  const el = document.getElementById(id);
  if (!el) return;
  try { el.volume = 0.5; el.play().catch(() => {}); } catch (e) { /* opcional */ }
}
function stopAllBgm() {
  ['bgm-title', 'bgm-battle'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { try { el.pause(); el.currentTime = 0; } catch (e) {} }
  });
}

/* ==========================================================================
   5. CLASE BattlePokemon (instancia de combate)
   ========================================================================== */

class BattlePokemon {
  constructor(species, level = BATTLE_LEVEL) {
    this.species = species;
    this.level = level;
    this.stats = {
      hp:  calcStat(species.base.hp, level, true),
      atk: calcStat(species.base.atk, level, false),
      def: calcStat(species.base.def, level, false),
      spd: calcStat(species.base.spd, level, false),
      spc: calcStat(species.base.spc, level, false),
    };
    this.maxHp = this.stats.hp;
    this.currentHp = this.maxHp;
    this.status = null;      // 'PSN' | 'PAR' | 'SLP' | 'BRN' | 'FRZ'
    this.sleepTurns = 0;
    this.confusedTurns = 0;
    this.stages = { atk: 0, def: 0, spd: 0, spc: 0 };
    this.moves = species.moves.map(key => {
      const data = MOVES[key];
      return { key, ...data, pp: data.pp, maxPp: data.pp };
    });
    this.fainted = false;
  }

  get hpPercent() { return this.currentHp / this.maxHp; }

  modifiedStat(statKey) {
    const stage = this.stages[statKey] || 0;
    const base = this.stats[statKey];
    const mult = stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage);
    let val = Math.floor(base * mult);
    if (statKey === 'spd' && this.status === 'PAR') val = Math.floor(val * 0.25);
    return Math.max(1, val);
  }

  changeStat(statKey, delta) {
    const before = this.stages[statKey] || 0;
    this.stages[statKey] = clamp(before + delta, -6, 6);
    return this.stages[statKey] !== before;
  }

  applyDamage(dmg) {
    this.currentHp = clamp(this.currentHp - dmg, 0, this.maxHp);
    if (this.currentHp === 0) this.fainted = true;
  }

  heal(fraction) {
    this.currentHp = clamp(this.currentHp + Math.floor(this.maxHp * fraction), 0, this.maxHp);
  }

  critChance(move) {
    const base = this.species.base.spd;
    let chance = base / 512;
    if (move.highCrit) chance *= 8;
    return clamp(chance, 0.015, 0.85);
  }
}

/* ==========================================================================
   DAÑO Y EFECTOS DE MOVIMIENTOS
   ========================================================================== */

function calcDamage(attacker, defender, move, isCritical) {
  if (move.effect && move.effect.fixedDamageFlat) {
    const eff = getEffectiveness(move.type, defender.species.types);
    return { damage: eff === 0 ? 0 : move.effect.fixedDamageFlat, effectiveness: eff };
  }
  if (move.effect && move.effect.fixedDamage === 'level') {
    const eff = getEffectiveness(move.type, defender.species.types);
    return { damage: eff === 0 ? 0 : attacker.level, effectiveness: eff };
  }
  if (move.power == null) return { damage: 0, effectiveness: 1 };

  const category = categoryForType(move.type);
  let atkStat = category === 'physical' ? attacker.modifiedStat('atk') : attacker.modifiedStat('spc');
  const defStat = category === 'physical' ? defender.modifiedStat('def') : defender.modifiedStat('spc');

  if (attacker.status === 'BRN' && category === 'physical') atkStat = Math.floor(atkStat / 2);

  const critMult = isCritical ? 2 : 1;
  const level = attacker.level;
  const base = Math.floor((((2 * level * critMult) / 5) + 2) * move.power * atkStat / defStat / 50) + 2;

  const stab = move.type && attacker.species.types.includes(move.type) ? 1.5 : 1;
  const eff = getEffectiveness(move.type, defender.species.types);
  const rand = randInt(85, 100) / 100;

  let dmg = Math.floor(base * stab * eff * rand);
  dmg = eff > 0 ? Math.max(dmg, 1) : 0;

  return { damage: dmg, effectiveness: eff };
}

function statName(key) {
  return { atk: 'Ataque', def: 'Defensa', spd: 'Velocidad', spc: 'Especial' }[key] || key;
}
function statusName(code) {
  return { PSN: 'envenenado', PAR: 'paralizado', SLP: 'dormido', BRN: 'quemado', FRZ: 'congelado' }[code] || code;
}
function canApplyStatus(target) {
  return !target.status && !target.fainted;
}

/* ==========================================================================
   6. BattleRenderer — dibuja sprites y animaciones en <canvas>
   ========================================================================== */

class BattleRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.W = canvas.width;
    this.H = canvas.height;
    this.playerImg = new Image();
    this.enemyImg = new Image();
    this.playerImg.crossOrigin = 'anonymous';
    this.enemyImg.crossOrigin = 'anonymous';
    this.playerPos = { x: this.W * 0.28, y: this.H * 0.72, scale: 1, alpha: 1, shakeX: 0 };
    this.enemyPos  = { x: this.W * 0.72, y: this.H * 0.30, scale: 1, alpha: 1, shakeX: 0 };
    this.particles = [];
    this.flashSide = null;
    this._loop();
  }

  loadSprites(playerSpecies, enemySpecies) {
    return new Promise(resolve => {
      let loaded = 0;
      const done = () => { loaded++; if (loaded >= 2) resolve(); };
      this.playerImg.onload = done;
      this.playerImg.onerror = done;
      this.enemyImg.onload = done;
      this.enemyImg.onerror = done;
      this.playerImg.src = spriteBack(playerSpecies.id);
      this.enemyImg.src = spriteFront(enemySpecies.id);
      this.playerPos.alpha = 1; this.playerPos.scale = 1;
      this.enemyPos.alpha = 1; this.enemyPos.scale = 1;
    });
  }

  _loop() {
    this._draw();
    requestAnimationFrame(() => this._loop());
  }

  _draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.W, this.H);

    // Sombras ovaladas bajo cada Pokémon
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(this.playerPos.x, this.playerPos.y + 30, 55, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(this.enemyPos.x, this.enemyPos.y + 34, 42, 11, 0, 0, Math.PI * 2);
    ctx.fill();

    this._drawSprite(this.enemyImg, this.enemyPos, 128);
    this._drawSprite(this.playerImg, this.playerPos, 160);

    // Partículas de efectos
    this.particles.forEach(p => {
      ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.fillStyle = p.color;
      if (p.shape === 'circle') {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
    });
    ctx.globalAlpha = 1;

    // Flash blanco/rojo
    if (this.flashSide) {
      const pos = this.flashSide === 'A' ? this.playerPos : this.enemyPos;
      ctx.fillStyle = this.flashColor || 'rgba(255,255,255,0.6)';
      ctx.fillRect(pos.x - 90, pos.y - 130, 180, 180);
    }

    this._updateParticles();
  }

  _drawSprite(img, pos, baseSize) {
    if (!img.complete || img.naturalWidth === 0) return;
    const ctx = this.ctx;
    const size = baseSize * pos.scale;
    ctx.save();
    ctx.globalAlpha = pos.alpha;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, pos.x - size / 2 + (pos.shakeX || 0), pos.y - size, size, size);
    ctx.restore();
  }

  _updateParticles() {
    this.particles.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.life -= 1;
    });
    this.particles = this.particles.filter(p => p.life > 0);
  }

  spawnParticles(type, side) {
    const pos = side === 'A' ? this.playerPos : this.enemyPos;
    const colors = {
      fire: '#F08030', water: '#6890F0', electric: '#F8D030', grass: '#78C850',
      ice: '#98D8D8', poison: '#A040A0', psychic: '#F85888', rock: '#B8A038',
      ground: '#E0C068', flying: '#A890F0', bug: '#A8B820', ghost: '#705898',
      dragon: '#7038F8', fighting: '#C03028', normal: '#A8A878',
    };
    const color = colors[type] || '#FFFFFF';
    const count = 14;
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: pos.x + randInt(-30, 30),
        y: pos.y - 60 + randInt(-20, 20),
        vx: randInt(-3, 3) * 0.5,
        vy: randInt(-4, -1) * 0.6,
        size: randInt(4, 9),
        color,
        shape: (type === 'water' || type === 'ice') ? 'circle' : (Math.random() > 0.5 ? 'circle' : 'square'),
        life: 26,
        maxLife: 26,
      });
    }
  }

  async slideAttack(side) {
    const pos = side === 'A' ? this.playerPos : this.enemyPos;
    const dir = side === 'A' ? 1 : -1;
    const steps = 8;
    for (let i = 0; i < steps; i++) { pos.shakeX = dir * (i * 4); await delay(12); }
    for (let i = steps; i >= 0; i--) { pos.shakeX = dir * (i * 4); await delay(12); }
    pos.shakeX = 0;
  }

  async shake(side) {
    const pos = side === 'A' ? this.playerPos : this.enemyPos;
    const original = pos.shakeX || 0;
    for (let i = 0; i < 6; i++) {
      pos.shakeX = (i % 2 === 0) ? 10 : -10;
      await delay(45);
    }
    pos.shakeX = original;
  }

  async flashHit(side) {
    this.flashSide = side;
    this.flashColor = 'rgba(255,255,255,0.75)';
    await delay(80);
    this.flashColor = 'rgba(255,60,60,0.45)';
    await delay(80);
    this.flashSide = null;
  }

  async faintAnimation(side) {
    const pos = side === 'A' ? this.playerPos : this.enemyPos;
    const steps = 16;
    for (let i = 0; i <= steps; i++) {
      pos.y += 4;
      pos.alpha = 1 - (i / steps);
      await delay(25);
    }
  }

  resetPosition(side) {
    const pos = side === 'A' ? this.playerPos : this.enemyPos;
    pos.alpha = 1; pos.scale = 1; pos.shakeX = 0;
    pos.y = side === 'A' ? this.H * 0.72 : this.H * 0.30;
  }
}

/* ==========================================================================
   7. AIController — IA del modo Vs Bot
   ========================================================================== */

class AIController {
  chooseAction(active, opponent) {
    const usable = active.moves
      .map((m, i) => ({ m, i }))
      .filter(x => x.m.pp > 0);

    if (usable.length === 0) return { type: 'struggle' };

    let best = null;
    let bestScore = -Infinity;

    for (const { m, i } of usable) {
      let score = 0;
      if (m.power != null || (m.effect && (m.effect.fixedDamage || m.effect.fixedDamageFlat))) {
        const eff = getEffectiveness(m.type, opponent.species.types);
        if (eff === 0) {
          score = -999;
        } else {
          const stab = active.species.types.includes(m.type) ? 1.5 : 1;
          const power = m.power || 60;
          score = power * eff * stab * (m.accuracy / 100);
          const { damage } = calcDamage(active, opponent, m, false);
          if (damage >= opponent.currentHp) score += 1000;
        }
      } else {
        score = 22;
        if (m.effect && m.effect.status && canApplyStatus(opponent)) score += 22 * (m.accuracy / 100);
        if (m.effect && m.effect.heal && active.currentHp < active.maxHp * 0.6) score += 45;
        if (m.effect && m.effect.stat && m.effect.target === 'self') score += 12;
        if (m.effect && m.effect.confuse && !opponent.confusedTurns) score += 16 * (m.accuracy / 100);
      }
      score += Math.random() * 8; // desempate con variación natural
      if (score > bestScore) { bestScore = score; best = { m, i }; }
    }

    return { type: 'move', index: best.i };
  }
}

/* ==========================================================================
   8. BattleSystem — máquina de estados principal del combate
   ========================================================================== */

class BattleSystem {
  constructor(teamASpecies, teamBSpecies, mode) {
    this.teamA = teamASpecies.map(sp => new BattlePokemon(sp));
    this.teamB = teamBSpecies.map(sp => new BattlePokemon(sp));
    this.activeA = 0;
    this.activeB = 0;
    this.mode = mode; // 'bot' | 'hotseat'
    this.labelA = 'Jugador 1';
    this.labelB = mode === 'bot' ? 'Rival' : 'Jugador 2';
    this.ai = new AIController();
    this.renderer = new BattleRenderer(document.getElementById('battle-canvas'));
    this.skipTyping = false;
    this.over = false;
  }

  getActive(side) { return side === 'A' ? this.teamA[this.activeA] : this.teamB[this.activeB]; }
  getTeam(side) { return side === 'A' ? this.teamA : this.teamB; }

  async start() {
    document.getElementById('enemy-name').textContent = this.getActive('B').species.name;
    document.getElementById('player-name').textContent = this.getActive('A').species.name;
    await this.renderer.loadSprites(this.getActive('A').species, this.getActive('B').species);
    this.updateHUD();
    playBgm('bgm-battle');
    await this.battleText(`¡${this.labelB} envía a ${this.getActive('B').species.name}!`);
    await this.battleText(`¡Adelante, ${this.getActive('A').species.name}!`);
    this.loop();
  }

  updateHUD() {
    const a = this.getActive('A'), b = this.getActive('B');
    document.getElementById('player-name').textContent = a.species.name;
    document.getElementById('enemy-name').textContent = b.species.name;
    document.getElementById('player-hp-current').textContent = a.currentHp;
    document.getElementById('player-hp-max').textContent = a.maxHp;
    this._setHpBar('player-hp-bar', a.hpPercent);
    this._setHpBar('enemy-hp-bar', b.hpPercent);
    this._setStatusBadges('player-status', a);
    this._setStatusBadges('enemy-status', b);
  }

  _setHpBar(elId, pct) {
    const el = document.getElementById(elId);
    el.style.width = `${clamp(pct * 100, 0, 100)}%`;
    el.style.background = pct > 0.5 ? 'var(--hp-green)' : pct > 0.2 ? 'var(--hp-yellow)' : 'var(--hp-red)';
  }

  _setStatusBadges(elId, poke) {
    const el = document.getElementById(elId);
    el.innerHTML = '';
    if (poke.status) {
      const span = document.createElement('span');
      span.className = `status-badge status-${poke.status}`;
      span.textContent = poke.status;
      el.appendChild(span);
    }
    if (poke.confusedTurns > 0) {
      const span = document.createElement('span');
      span.className = 'status-badge status-CNF';
      span.style.background = '#888';
      span.textContent = 'CNF';
      el.appendChild(span);
    }
  }

  battleText(msg) {
    const el = document.getElementById('battle-text');
    return new Promise(resolve => {
      el.textContent = '';
      let i = 0;
      const speed = 16;
      const step = () => {
        if (this.skipTyping) { el.textContent = msg; resolve(); return; }
        if (i >= msg.length) { resolve(); return; }
        el.textContent += msg[i];
        i++;
        setTimeout(step, speed);
      };
      step();
    }).then(() => delay(350));
  }

  async loop() {
    while (!this.over) {
      if (this.checkGameOver()) return;

      const a = this.getActive('A');
      const actionA = await this.getPlayerAction('A');
      if (actionA.type === 'run') {
        await this.battleText('No puedes huir de un combate de entrenadores.');
        continue;
      }

      let actionB;
      if (this.mode === 'bot') {
        actionB = this.ai.chooseAction(this.getActive('B'), this.getActive('A'));
      } else {
        actionB = await this.getPlayerAction('B');
      }

      await this.resolveTurn(actionA, actionB);
      if (this.checkGameOver()) return;
    }
  }

  // ---------------- Selección de acción del jugador ----------------
  getPlayerAction(side) {
    return new Promise(resolve => {
      const isP2 = side === 'B' && this.mode === 'hotseat';
      GameState.inputOwner = isP2 ? 2 : 1;
      document.getElementById('turn-indicator').textContent =
        isP2 ? `Turno de ${this.labelB}` : `Turno de ${this.labelA}`;

      const actionMenu = document.getElementById('battle-action-menu');
      const movesMenu = document.getElementById('battle-moves-menu');
      const switchMenu = document.getElementById('battle-switch-menu');
      actionMenu.classList.remove('hidden');
      movesMenu.classList.add('hidden');
      switchMenu.classList.add('hidden');

      const active = this.getActive(side);
      const opponent = this.getActive(side === 'A' ? 'B' : 'A');

      const finish = (action) => {
        actionMenu.classList.add('hidden');
        movesMenu.classList.add('hidden');
        switchMenu.classList.add('hidden');
        resolve(action);
      };

      const showMoves = () => {
        actionMenu.classList.add('hidden');
        movesMenu.classList.remove('hidden');
        this._renderMoves(active, (idx) => finish({ type: 'move', index: idx }), () => {
          movesMenu.classList.add('hidden');
          actionMenu.classList.remove('hidden');
          setupActionMenu();
        });
      };

      const showSwitch = (forced) => {
        actionMenu.classList.add('hidden');
        switchMenu.classList.remove('hidden');
        this._renderSwitch(this.getTeam(side), active, forced, (idx) => finish({ type: 'switch', index: idx }), () => {
          if (forced) return; // no se puede cancelar un cambio forzado
          switchMenu.classList.add('hidden');
          actionMenu.classList.remove('hidden');
          setupActionMenu();
        });
      };

      const setupActionMenu = () => {
        const btns = Array.from(actionMenu.querySelectorAll('.action-btn'));
        const items = btns.map(btn => ({
          el: btn,
          disabled: false,
          action: () => {
            const act = btn.dataset.action;
            playSfx('sfx-confirm');
            if (act === 'fight') showMoves();
            else if (act === 'pokemon') showSwitch(false);
            else if (act === 'run') finish({ type: 'run' });
          },
        }));
        btns.forEach((btn, i) => {
          btn.onclick = () => items[i].action();
        });
        GameState.activeMenu = new KeyboardMenu(items, 1);
      };

      setupActionMenu();
    });
  }

  _renderMoves(active, onPick, onBack) {
    const grid = document.getElementById('moves-grid');
    grid.innerHTML = '';
    const infoType = document.getElementById('move-info-type');
    const infoPp = document.getElementById('move-info-pp');
    const allOut = active.moves.every(m => m.pp <= 0);

    const items = [];
    if (allOut) {
      const btn = document.createElement('button');
      btn.className = 'move-btn';
      btn.textContent = 'FORCEJEO';
      grid.appendChild(btn);
      items.push({
        el: btn, disabled: false,
        action: () => { playSfx('sfx-confirm'); onPick(-1); },
        onFocus: () => { infoType.textContent = '—'; infoType.className = 'type-badge'; infoPp.textContent = 'PP 1/1'; },
      });
    } else {
      active.moves.forEach((m, i) => {
        const btn = document.createElement('button');
        btn.className = 'move-btn';
        btn.textContent = m.name;
        btn.disabled = m.pp <= 0;
        grid.appendChild(btn);
        items.push({
          el: btn, disabled: m.pp <= 0,
          action: () => { if (m.pp > 0) { playSfx('sfx-confirm'); onPick(i); } },
          onFocus: () => {
            infoType.textContent = m.type || 'normal';
            infoType.className = `type-badge type-${m.type || 'normal'}`;
            infoPp.textContent = `PP ${m.pp}/${m.maxPp}`;
          },
        });
      });
    }
    const backBtn = document.getElementById('btn-move-back');
    items.push({ el: backBtn, disabled: false, action: () => onBack(), onFocus: () => {} });

    items.forEach((it, i) => { it.el.onclick = () => { GameState.activeMenu.index = i; it.action(); }; });
    GameState.activeMenu = new KeyboardMenu(items, 2);
    if (items[0] && items[0].onFocus) items[0].onFocus();
  }

  _renderSwitch(team, active, forced, onPick, onBack) {
    const grid = document.getElementById('switch-grid');
    grid.innerHTML = '';
    const items = [];
    team.forEach((p, i) => {
      const card = document.createElement('div');
      const isCurrent = p === active;
      const isFainted = p.fainted;
      card.className = 'switch-card' + (isCurrent ? ' current' : '') + (isFainted ? ' fainted' : '');
      card.innerHTML = `<img src="${spriteFront(p.species.id)}" alt="${p.species.name}">
        <div>${p.species.name}</div><div>${p.currentHp}/${p.maxHp} HP</div>`;
      grid.appendChild(card);
      items.push({
        el: card,
        disabled: isFainted || (isCurrent && !forced),
        action: () => {
          if (isFainted || (isCurrent && !forced)) return;
          playSfx('sfx-confirm');
          onPick(i);
        },
      });
    });
    if (!forced) {
      const backBtn = document.getElementById('btn-switch-back');
      items.push({ el: backBtn, disabled: false, action: () => onBack() });
    }
    items.forEach((it, i) => { it.el.onclick = () => { GameState.activeMenu.index = i; it.action(); }; });
    GameState.activeMenu = new KeyboardMenu(items, 3);
  }

  // ---------------- Resolución de turno ----------------
  async resolveTurn(actionA, actionB) {
    // 1. Cambios de Pokémon se resuelven primero (ambos lados si aplica)
    if (actionA.type === 'switch') await this.performSwitch('A', actionA.index);
    if (actionB.type === 'switch') await this.performSwitch('B', actionB.index);

    const pending = [];
    if (actionA.type === 'move' || actionA.type === 'struggle') pending.push({ side: 'A', action: actionA });
    if (actionB.type === 'move' || actionB.type === 'struggle') pending.push({ side: 'B', action: actionB });

    // 2. Orden por velocidad (con parálisis ya aplicada en modifiedStat)
    pending.sort((x, y) => {
      const spdX = this.getActive(x.side).modifiedStat('spd');
      const spdY = this.getActive(y.side).modifiedStat('spd');
      const prioX = (x.action.type === 'move' && this.getActive(x.side).moves[x.action.index] && this.getActive(x.side).moves[x.action.index].priority) || 0;
      const prioY = (y.action.type === 'move' && this.getActive(y.side).moves[y.action.index] && this.getActive(y.side).moves[y.action.index].priority) || 0;
      if (prioX !== prioY) return prioY - prioX;
      if (spdX !== spdY) return spdY - spdX;
      return Math.random() - 0.5;
    });

    for (const entry of pending) {
      const attackerSide = entry.side;
      const defenderSide = attackerSide === 'A' ? 'B' : 'A';
      const attacker = this.getActive(attackerSide);
      if (attacker.fainted) continue;

      const move = entry.action.type === 'struggle' ? MOVES.struggle : attacker.moves[entry.action.index];
      await this.executeMove(attackerSide, defenderSide, move, entry.action.type === 'struggle');

      if (this.checkGameOver()) return;
      // Si el defensor se debilitó, forzar cambio antes de continuar
      const defender = this.getActive(defenderSide);
      if (defender.fainted) {
        await this.handleFaint(defenderSide);
        if (this.checkGameOver()) return;
      }
    }

    // 3. Efectos de estado de fin de turno (veneno/quemadura)
    await this.applyResidualEffects('A');
    if (this.checkGameOver()) return;
    await this.applyResidualEffects('B');
    if (this.checkGameOver()) return;

    this.updateHUD();
  }

  async performSwitch(side, index) {
    const team = this.getTeam(side);
    if (side === 'A') this.activeA = index; else this.activeB = index;
    this.renderer.resetPosition(side);
    if (side === 'A') this.renderer.playerImg.src = spriteBack(team[index].species.id);
    else this.renderer.enemyImg.src = spriteFront(team[index].species.id);
    this.updateHUD();
    const label = side === 'A' ? this.labelA : this.labelB;
    await this.battleText(`¡${label} cambia a ${team[index].species.name}!`);
  }

  async handleFaint(side) {
    playSfx('sfx-faint');
    await this.renderer.faintAnimation(side);
    const label = side === 'A' ? this.labelA : this.labelB;
    await this.battleText(`¡${this.getActive(side).species.name} de ${label} se debilitó!`);
    const team = this.getTeam(side);
    const anyAlive = team.some(p => !p.fainted);
    if (!anyAlive) return; // checkGameOver lo detectará

    if (side === 'A' || this.mode === 'hotseat') {
      // El humano (o ambos en hotseat) elige el reemplazo
      const idx = await this.forcedSwitchPrompt(side);
      await this.performSwitch(side, idx);
    } else {
      // Bot elige automáticamente el primer disponible
      const idx = team.findIndex(p => !p.fainted);
      await this.performSwitch(side, idx);
    }
    this.renderer.resetPosition(side);
  }

  forcedSwitchPrompt(side) {
    return new Promise(resolve => {
      const isP2 = side === 'B' && this.mode === 'hotseat';
      GameState.inputOwner = isP2 ? 2 : 1;
      document.getElementById('turn-indicator').textContent =
        `${isP2 ? this.labelB : this.labelA}: ¡Elige tu próximo Pokémon!`;
      document.getElementById('battle-action-menu').classList.add('hidden');
      document.getElementById('battle-moves-menu').classList.add('hidden');
      const switchMenu = document.getElementById('battle-switch-menu');
      switchMenu.classList.remove('hidden');
      this._renderSwitch(this.getTeam(side), this.getActive(side), true, (idx) => {
        switchMenu.classList.add('hidden');
        resolve(idx);
      }, () => {});
    });
  }

  async executeMove(attackerSide, defenderSide, move, isStruggle) {
    const attacker = this.getActive(attackerSide);
    const defender = this.getActive(defenderSide);
    const attackerLabel = attackerSide === 'A' ? this.labelA : this.labelB;

    await this.battleText(`¡${attackerLabel} usó ${move.name}!`);

    // --- Estados que impiden actuar ---
    if (attacker.status === 'PAR' && Math.random() < 0.25) {
      await this.battleText(`¡${attacker.species.name} está paralizado y no puede moverse!`);
      return;
    }
    if (attacker.status === 'SLP') {
      attacker.sleepTurns--;
      if (attacker.sleepTurns > 0) {
        await this.battleText(`¡${attacker.species.name} está profundamente dormido!`);
        return;
      }
      attacker.status = null;
      await this.battleText(`¡${attacker.species.name} se despertó!`);
    }
    if (attacker.status === 'FRZ') {
      if (Math.random() < 0.2) {
        attacker.status = null;
        await this.battleText(`¡${attacker.species.name} se descongeló!`);
      } else {
        await this.battleText(`¡${attacker.species.name} está congelado y no puede moverse!`);
        return;
      }
    }
    if (attacker.confusedTurns > 0) {
      attacker.confusedTurns--;
      if (attacker.confusedTurns <= 0) {
        await this.battleText(`¡${attacker.species.name} ya no está confuso!`);
      } else if (Math.random() < 0.5) {
        await this.battleText(`¡${attacker.species.name} está confuso!`);
        const selfDmg = Math.max(1, Math.floor(attacker.modifiedStat('atk') * 0.5));
        attacker.applyDamage(selfDmg);
        await this.renderer.shake(attackerSide);
        this.updateHUD();
        await this.battleText('¡Se hizo daño a sí mismo por la confusión!');
        if (attacker.fainted) await this.handleFaint(attackerSide);
        return;
      }
    }

    if (!isStruggle) {
      const moveRef = attacker.moves.find(m => m.key === move.key);
      if (moveRef) moveRef.pp = Math.max(0, moveRef.pp - 1);
    }

    // --- Precisión ---
    const acc = move.accuracy || 100;
    if (Math.random() * 100 > acc) {
      await this.battleText('¡Pero falló!');
      return;
    }

    await this.renderer.slideAttack(attackerSide);

    if (move.power != null || (move.effect && (move.effect.fixedDamage || move.effect.fixedDamageFlat))) {
      const isCrit = Math.random() < attacker.critChance(move);
      const { damage, effectiveness } = calcDamage(attacker, defender, move, isCrit);

      defender.applyDamage(damage);
      await this.renderer.flashHit(defenderSide);
      await this.renderer.shake(defenderSide);
      this.renderer.spawnParticles(move.type || 'normal', defenderSide);
      this.updateHUD();

      if (isCrit) await this.battleText('¡Golpe crítico!');
      if (effectiveness > 1) await this.battleText('¡Es súper efectivo!');
      else if (effectiveness > 0 && effectiveness < 1) await this.battleText('No es muy efectivo...');
      else if (effectiveness === 0) await this.battleText(`No afectó a ${defender.species.name}...`);

      if (move.effect && move.effect.recoil && !attacker.fainted) {
        const recoilDmg = Math.max(1, Math.floor(damage * move.effect.recoil));
        attacker.applyDamage(recoilDmg);
        this.updateHUD();
        await this.battleText(`¡${attacker.species.name} se dañó por el retroceso!`);
      }
      if (move.effect && move.effect.drain && damage > 0) {
        attacker.heal(0);
        attacker.currentHp = clamp(attacker.currentHp + Math.floor(damage * move.effect.drain), 0, attacker.maxHp);
        this.updateHUD();
        await this.battleText(`¡${attacker.species.name} absorbió energía!`);
      }
      if (defender.fainted) return;

      if (move.effect && move.effect.status && move.effect.chance && Math.random() < move.effect.chance) {
        if (canApplyStatus(defender)) {
          defender.status = move.effect.status;
          if (move.effect.status === 'SLP') defender.sleepTurns = randInt(1, 3);
          this.updateHUD();
          await this.battleText(`¡${defender.species.name} quedó ${statusName(move.effect.status)}!`);
        }
      }
      if (move.effect && move.effect.confuse && move.effect.chance && Math.random() < move.effect.chance) {
        if (!defender.confusedTurns) {
          defender.confusedTurns = randInt(2, 5);
          await this.battleText(`¡${defender.species.name} quedó confuso!`);
        }
      }
      if (move.effect && move.effect.stat && move.effect.chance && Math.random() < move.effect.chance) {
        const target = move.effect.target === 'self' ? attacker : defender;
        if (target.changeStat(move.effect.stat, move.effect.stages)) {
          await this.battleText(`¡${statName(move.effect.stat)} de ${target.species.name} cambió!`);
        }
      }
    } else {
      // Movimiento de estado puro
      const eff = move.effect || {};
      if (eff.status) {
        if (canApplyStatus(defender)) {
          defender.status = eff.status;
          if (eff.status === 'SLP') defender.sleepTurns = randInt(1, 3);
          this.updateHUD();
          await this.battleText(`¡${defender.species.name} quedó ${statusName(eff.status)}!`);
        } else {
          await this.battleText('¡Pero falló!');
        }
      } else if (eff.heal) {
        attacker.heal(eff.heal);
        this.updateHUD();
        await this.battleText(`¡${attacker.species.name} recuperó salud!`);
      } else if (eff.confuse) {
        const target = eff.target === 'self' ? attacker : defender;
        if (!target.confusedTurns) {
          target.confusedTurns = randInt(2, 5);
          await this.battleText(`¡${target.species.name} quedó confuso!`);
        } else {
          await this.battleText('¡Pero falló!');
        }
      } else if (eff.stat) {
        const target = eff.target === 'self' ? attacker : defender;
        if (target.changeStat(eff.stat, eff.stages)) {
          const dir = eff.stages > 0 ? 'subió' : 'bajó';
          await this.battleText(`¡${statName(eff.stat)} de ${target.species.name} ${dir}!`);
        } else {
          await this.battleText('¡No tuvo efecto!');
        }
      }
    }
  }

  async applyResidualEffects(side) {
    const poke = this.getActive(side);
    if (poke.fainted) return;
    if (poke.status === 'PSN') {
      const dmg = Math.max(1, Math.floor(poke.maxHp / 8));
      poke.applyDamage(dmg);
      this.updateHUD();
      await this.battleText(`¡${poke.species.name} sufre por el veneno!`);
    } else if (poke.status === 'BRN') {
      const dmg = Math.max(1, Math.floor(poke.maxHp / 8));
      poke.applyDamage(dmg);
      this.updateHUD();
      await this.battleText(`¡${poke.species.name} sufre por la quemadura!`);
    }
    if (poke.fainted) await this.handleFaint(side);
  }

  checkGameOver() {
    const aAlive = this.teamA.some(p => !p.fainted);
    const bAlive = this.teamB.some(p => !p.fainted);
    if (!aAlive || !bAlive) {
      this.over = true;
      const win = aAlive && !bAlive;
      showEndScreen(win);
      return true;
    }
    return false;
  }
}

/* ==========================================================================
   9. POKEDEX / TEAM BUILDER (UI)
   ========================================================================== */

const TeamBuilder = {
  selected: [],
  focusIndex: 0,
  onComplete: null,

  reset(titlePrefix) {
    this.selected = [];
    this.focusIndex = 0;
    document.getElementById('pokedex-title').textContent = `${titlePrefix} (0/6)`;
    this.renderGrid();
    this.renderTeamPreview();
    document.getElementById('btn-confirm-team').disabled = true;
  },

  renderGrid() {
    const grid = document.getElementById('pokedex-grid');
    grid.innerHTML = '';
    const items = [];
    POKEDEX.forEach((sp, i) => {
      const inTeam = this.selected.includes(sp);
      const card = document.createElement('div');
      card.className = 'poke-card' + (inTeam ? ' in-team' : '');
      const hpTotal = calcStat(sp.base.hp, BATTLE_LEVEL, true);
      card.innerHTML = `
        <img src="${spriteFront(sp.id)}" alt="${sp.name}" loading="lazy">
        <div class="pc-name">${sp.name}</div>
        <div class="pc-types">${sp.types.map(t => `<span class="type-badge type-${t}">${t}</span>`).join('')}</div>
        <div class="pc-hp">HP ${hpTotal}</div>
      `;
      grid.appendChild(card);
      items.push({
        el: card, disabled: false,
        action: () => { this.focusIndex = i; this.showDetail(sp); this.renderGrid(); },
      });
      card.onclick = () => items[i].action();
    });
    const cols = Math.max(1, Math.floor(grid.clientWidth / 84) || 4);
    GameState.activeMenu = new KeyboardMenu(items, cols);
    GameState.activeMenu.index = this.focusIndex;
    GameState.activeMenu.render();
  },

  showDetail(sp) {
    const detail = document.getElementById('pokedex-detail');
    const alreadyIn = this.selected.includes(sp);
    const teamFull = this.selected.length >= 6;
    const hp = calcStat(sp.base.hp, BATTLE_LEVEL, true);
    const atk = calcStat(sp.base.atk, BATTLE_LEVEL, false);
    const def = calcStat(sp.base.def, BATTLE_LEVEL, false);
    const spd = calcStat(sp.base.spd, BATTLE_LEVEL, false);
    const spc = calcStat(sp.base.spc, BATTLE_LEVEL, false);
    const maxStat = 200;

    const statBar = (label, val) => `
      <div class="stat-row">
        <span class="stat-label">${label}</span>
        <div class="stat-bar-outer"><div class="stat-bar-inner" style="width:${clamp(val / maxStat * 100, 4, 100)}%"></div></div>
        <span class="stat-value">${val}</span>
      </div>`;

    detail.innerHTML = `
      <div class="detail-header">
        <img src="${spriteFront(sp.id)}" alt="${sp.name}">
        <div>
          <div class="detail-name">${sp.name}</div>
          <div class="detail-types">${sp.types.map(t => `<span class="type-badge type-${t}">${t}</span>`).join('')}</div>
        </div>
      </div>
      <div class="detail-stats">
        ${statBar('HP', hp)}
        ${statBar('ATK', atk)}
        ${statBar('DEF', def)}
        ${statBar('SPD', spd)}
        ${statBar('SPC', spc)}
      </div>
      <ul class="detail-moves">
        ${sp.moves.map(k => {
          const m = MOVES[k];
          return `<li><span>${m.name}</span><span class="type-badge type-${m.type || 'normal'}">${m.type || '—'}</span></li>`;
        }).join('')}
      </ul>
      <button class="detail-add-btn" id="btn-toggle-team" ${teamFull && !alreadyIn ? 'disabled' : ''}>
        ${alreadyIn ? '✖ Quitar del equipo' : '✔ Añadir al equipo'}
      </button>
    `;
    document.getElementById('btn-toggle-team').onclick = () => {
      if (alreadyIn) {
        this.selected = this.selected.filter(s => s !== sp);
      } else if (this.selected.length < 6) {
        this.selected.push(sp);
        playSfx('sfx-select');
      }
      this.updateHeader();
      this.renderGrid();
      this.renderTeamPreview();
      this.showDetail(sp);
    };
  },

  renderTeamPreview() {
    const el = document.getElementById('team-preview-p1');
    el.innerHTML = this.selected.map(sp => `<img src="${spriteFront(sp.id)}" alt="${sp.name}" title="${sp.name}">`).join('');
  },

  updateHeader() {
    const prefix = document.getElementById('pokedex-title').textContent.split('(')[0].trim();
    document.getElementById('pokedex-title').textContent = `${prefix} (${this.selected.length}/6)`;
    document.getElementById('btn-confirm-team').disabled = this.selected.length === 0;
  },

  randomFill() {
    const pool = POKEDEX.filter(sp => !this.selected.includes(sp));
    while (this.selected.length < 6 && pool.length > 0) {
      const idx = randInt(0, pool.length - 1);
      this.selected.push(pool[idx]);
      pool.splice(idx, 1);
    }
    this.updateHeader();
    this.renderGrid();
    this.renderTeamPreview();
  },
};

document.getElementById('btn-random-team').addEventListener('click', () => TeamBuilder.randomFill());
document.getElementById('btn-confirm-team').addEventListener('click', () => {
  if (TeamBuilder.selected.length === 0) return;
  playSfx('sfx-confirm');
  if (TeamBuilder.onComplete) TeamBuilder.onComplete([...TeamBuilder.selected]);
});

/* ==========================================================================
   10. NAVEGACIÓN DE PANTALLAS Y MENÚS
   ========================================================================== */

const GameState = {
  currentScreen: 'screen-title',
  activeMenu: null,
  inputOwner: 1,
  mode: null,
  battle: null,
  teamA: null,
  teamB: null,
};

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  GameState.currentScreen = id;
  GameState.inputOwner = 1;
}

function setupMainMenu() {
  const items = Array.from(document.querySelectorAll('#main-menu .menu-item')).map(btn => ({
    el: btn, disabled: false,
    action: () => handleMenuAction(btn.dataset.action),
  }));
  items.forEach((it, i) => { it.el.onclick = () => { GameState.activeMenu.index = i; it.action(); }; });
  GameState.activeMenu = new KeyboardMenu(items, 1);
}

function handleMenuAction(action) {
  playSfx('sfx-confirm');
  if (action === 'new-battle') {
    GameState.mode = null;
    showScreen('screen-mode');
    setupModeMenu();
  } else if (action === 'pokedex') {
    startPokedexStandalone();
  } else if (action === 'how-to-play') {
    showScreen('screen-help');
    setupBackOnly('screen-help');
  } else if (action === 'credits') {
    showScreen('screen-credits');
    setupBackOnly('screen-credits');
  } else if (action === 'back-title') {
    stopAllBgm();
    playBgm('bgm-title');
    showScreen('screen-title');
    setupMainMenu();
  } else if (action === 'rematch') {
    startBattleWithTeams(GameState.teamA, GameState.teamB, GameState.mode);
  } else if (action === 'menu-team') {
    showScreen('screen-mode');
    setupModeMenu();
  }
}

function setupBackOnly(screenId) {
  const btn = document.querySelector(`#${screenId} .back-btn`);
  const items = [{ el: btn, disabled: false, action: () => handleMenuAction('back-title') }];
  btn.onclick = () => items[0].action();
  GameState.activeMenu = new KeyboardMenu(items, 1);
}

function setupModeMenu() {
  const items = Array.from(document.querySelectorAll('#mode-menu .menu-item')).map(btn => ({
    el: btn, disabled: false,
    action: () => {
      playSfx('sfx-confirm');
      GameState.mode = btn.dataset.mode;
      startPokedexForBattle();
    },
  }));
  const backBtn = document.querySelector('#screen-mode .back-btn');
  items.push({ el: backBtn, disabled: false, action: () => handleMenuAction('back-title') });
  items.forEach((it, i) => { it.el.onclick = () => { GameState.activeMenu.index = i; it.action(); }; });
  GameState.activeMenu = new KeyboardMenu(items, 1);
}

// --- Flujo Pokedex standalone (explorar / armar equipo sin batallar) ---
function startPokedexStandalone() {
  showScreen('screen-pokedex');
  TeamBuilder.reset('Explora y arma tu equipo');
  TeamBuilder.onComplete = () => {
    handleMenuAction('back-title');
  };
}

// --- Flujo Pokedex previo a una batalla ---
function startPokedexForBattle() {
  showScreen('screen-pokedex');
  TeamBuilder.reset('Jugador 1: Selecciona tu equipo');
  TeamBuilder.onComplete = (teamP1) => {
    GameState.teamA = teamP1;
    if (GameState.mode === 'hotseat') {
      TeamBuilder.reset('Jugador 2: Selecciona tu equipo');
      TeamBuilder.onComplete = (teamP2) => {
        GameState.teamB = teamP2;
        startBattleWithTeams(GameState.teamA, GameState.teamB, GameState.mode);
      };
    } else {
      // Bot: equipo aleatorio de 6
      const pool = [...POKEDEX];
      const teamBot = [];
      while (teamBot.length < 6 && pool.length > 0) {
        const idx = randInt(0, pool.length - 1);
        teamBot.push(pool[idx]);
        pool.splice(idx, 1);
      }
      GameState.teamB = teamBot;
      startBattleWithTeams(GameState.teamA, GameState.teamB, GameState.mode);
    }
  };
}

function startBattleWithTeams(teamA, teamB, mode) {
  showScreen('screen-battle');
  GameState.battle = new BattleSystem(teamA, teamB, mode);
  GameState.battle.start();
}

function showEndScreen(playerWon) {
  stopAllBgm();
  showScreen('screen-end');
  document.getElementById('end-title').textContent = playerWon ? '¡Victoria!' : '¡Derrota!';
  document.getElementById('end-subtitle').textContent = playerWon
    ? 'Has vencido a todo el equipo rival.'
    : 'Todos tus Pokémon se han debilitado.';
  const items = Array.from(document.querySelectorAll('#screen-end .menu-item')).map(btn => ({
    el: btn, disabled: false,
    action: () => handleMenuAction(btn.dataset.action),
  }));
  items.forEach((it, i) => { it.el.onclick = () => { GameState.activeMenu.index = i; it.action(); }; });
  GameState.activeMenu = new KeyboardMenu(items, 1);
}

/* ==========================================================================
   11. KeyboardMenu + CONTROLES DE TECLADO
   ========================================================================== */

class KeyboardMenu {
  constructor(items, columns = 1) {
    this.items = items;
    this.columns = columns;
    this.index = 0;
    this.render();
  }
  render() {
    this.items.forEach((it, i) => {
      if (it.el) it.el.classList.toggle('selected', i === this.index);
    });
    const current = this.items[this.index];
    if (current && current.onFocus) current.onFocus();
  }
  move(dir) {
    const cols = this.columns;
    let idx = this.index;
    if (dir === 'up') idx -= cols;
    else if (dir === 'down') idx += cols;
    else if (dir === 'left') idx -= 1;
    else if (dir === 'right') idx += 1;
    idx = clamp(idx, 0, this.items.length - 1);
    this.index = idx;
    playSfx('sfx-select');
    this.render();
  }
  confirm() {
    const it = this.items[this.index];
    if (it && !it.disabled) it.action();
  }
}

document.addEventListener('keydown', (e) => {
  if (!GameState.activeMenu) return;
  const owner = GameState.inputOwner;

  if (owner === 1) {
    switch (e.key) {
      case 'ArrowUp': GameState.activeMenu.move('up'); e.preventDefault(); break;
      case 'ArrowDown': GameState.activeMenu.move('down'); e.preventDefault(); break;
      case 'ArrowLeft': GameState.activeMenu.move('left'); e.preventDefault(); break;
      case 'ArrowRight': GameState.activeMenu.move('right'); e.preventDefault(); break;
      case 'Enter':
      case ' ': GameState.activeMenu.confirm(); e.preventDefault(); break;
    }
  } else if (owner === 2) {
    const k = e.key.toLowerCase();
    if (k === 'w') { GameState.activeMenu.move('up'); e.preventDefault(); }
    else if (k === 's') { GameState.activeMenu.move('down'); e.preventDefault(); }
    else if (k === 'a') { GameState.activeMenu.move('left'); e.preventDefault(); }
    else if (k === 'd') { GameState.activeMenu.move('right'); e.preventDefault(); }
    else if (e.key === 'Shift' || e.key === 'Control') { GameState.activeMenu.confirm(); e.preventDefault(); }
  }
});

// Click en la caja de texto de batalla = adelantar el efecto máquina de escribir
document.getElementById('battle-textbox').addEventListener('click', () => {
  if (GameState.battle) {
    GameState.battle.skipTyping = true;
    setTimeout(() => { if (GameState.battle) GameState.battle.skipTyping = false; }, 50);
  }
});

/* ==========================================================================
   12. INICIALIZACIÓN
   ========================================================================== */

function init() {
  showScreen('screen-title');
  setupMainMenu();
  playBgm('bgm-title');
}

document.addEventListener('DOMContentLoaded', init);
