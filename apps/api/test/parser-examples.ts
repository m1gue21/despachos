// Set de mensajes reales-ish de grupos de WhatsApp de Manizales (spec §11).
// Lo usan el test del parser por reglas y el eval del parser con Claude.
// Criterio: service, sectores y teléfono deben coincidir exactamente; los
// campos marcados null deben salir null (nunca inventar). Los textos de
// lugar solo se exigen si se indica `pickupIncludes` / `dropoffIncludes`.
import type { SectorRef } from '../src/parser/types.js';

export interface ParserExample {
  text: string;
  service: 'delivery' | 'ride' | 'errand' | 'unknown';
  pickup: string | null; // slug del sector o null
  dropoff: string | null;
  phone: string | null;
  name?: string | null;
  pickupIncludes?: string;
  dropoffIncludes?: string;
}

export const MANIZALES_SECTORS: SectorRef[] = [
  { slug: 'manizales-centro', name: 'Centro', aliases: ['el centro', 'cra 23', 'carrera 23'] },
  { slug: 'manizales-chipre', name: 'Chipre', aliases: ['chipre', 'el monumento'] },
  { slug: 'manizales-cable', name: 'Cable', aliases: ['el cable', 'la torre del cable'] },
  { slug: 'manizales-palogrande', name: 'Palogrande', aliases: ['palogrande', 'el estadio'] },
  { slug: 'manizales-av-santander', name: 'Av. Santander', aliases: ['la santander', 'avenida santander'] },
  { slug: 'manizales-fatima', name: 'Fátima', aliases: ['fatima'] },
  { slug: 'manizales-milan', name: 'Milán', aliases: ['milan', 'el bosque de milan'] },
  { slug: 'manizales-la-sultana', name: 'La Sultana', aliases: ['sultana'] },
  { slug: 'manizales-la-enea', name: 'La Enea', aliases: ['enea', 'el aeropuerto'] },
  { slug: 'manizales-san-jorge', name: 'San Jorge', aliases: ['san jorge'] },
];

export const PARSER_EXAMPLES: ParserExample[] = [
  {
    text: 'domi del cable pa chipre, recoger en la drogueria, a nombre de Luisa 320 123 4567',
    service: 'delivery',
    pickup: 'manizales-cable',
    dropoff: 'manizales-chipre',
    phone: '3201234567',
    name: 'Luisa',
    pickupIncludes: 'drogueria',
  },
  {
    text: 'carro para la enea ya, sale de palogrande. Marta 3159876543',
    service: 'ride',
    pickup: 'manizales-palogrande',
    dropoff: 'manizales-la-enea',
    phone: '3159876543',
    name: 'Marta',
  },
  {
    text: 'Se necesita domiciliario urgente en milan',
    service: 'delivery',
    pickup: 'manizales-milan',
    dropoff: null,
    phone: null,
    name: null,
  },
  {
    text: 'mandado: pagar recibo de la luz en el centro, cel 3004445566',
    service: 'errand',
    pickup: 'manizales-centro',
    dropoff: null,
    phone: '3004445566',
  },
  {
    text: 'taxi desde fatima hasta el aeropuerto a las 5am porfa',
    service: 'ride',
    pickup: 'manizales-fatima',
    dropoff: 'manizales-la-enea',
    phone: null,
  },
  {
    text: 'quien me hace una vuelta en la santander? 311 222 3344',
    service: 'errand',
    pickup: 'manizales-av-santander',
    dropoff: null,
    phone: '3112223344',
  },
  {
    text: 'Domicilio de Chipre a San Jorge, paquete pequeño. Pagan contraentrega',
    service: 'delivery',
    pickup: 'manizales-chipre',
    dropoff: 'manizales-san-jorge',
    phone: null,
  },
  {
    text: 'nesecito un carrito q me lleve del centro a la sultana',
    service: 'ride',
    pickup: 'manizales-centro',
    dropoff: 'manizales-la-sultana',
    phone: null,
  },
  {
    text: 'Recoger almuerzo en restaurante del estadio y llevar a milan. +57 310 987 6543',
    service: 'delivery',
    pickup: 'manizales-palogrande',
    dropoff: 'manizales-milan',
    phone: '3109876543',
    pickupIncludes: 'restaurante',
  },
  {
    text: 'hay alguien disponible?',
    service: 'unknown',
    pickup: null,
    dropoff: null,
    phone: null,
    name: null,
  },
  {
    text: 'domi pa villa pilar, recoje en la cra 23 con 20',
    service: 'delivery',
    pickup: 'manizales-centro',
    dropoff: null,
    phone: null,
    pickupIncludes: 'cra 23',
  },
  {
    text: 'Servicio para 2 personas del monumento al cable, preguntar por Andrés 3205556677',
    service: 'ride',
    pickup: 'manizales-chipre',
    dropoff: 'manizales-cable',
    phone: '3205556677',
    name: 'Andrés',
  },
  {
    text: 'encomienda pa la enea, sale de la torre del cable',
    service: 'delivery',
    pickup: 'manizales-cable',
    dropoff: 'manizales-la-enea',
    phone: null,
  },
  {
    text: 'diligencia en el banco del centro, hacer fila y consignar',
    service: 'errand',
    pickup: 'manizales-centro',
    dropoff: null,
    phone: null,
  },
  {
    text: 'Moto pa llevar un sobre de palogrande a fatima wpp 3001234567',
    service: 'delivery',
    pickup: 'manizales-palogrande',
    dropoff: 'manizales-fatima',
    phone: '3001234567',
  },
  {
    text: 'urgente domicilio, llamar al 3017778899',
    service: 'delivery',
    pickup: null,
    dropoff: null,
    phone: '3017778899',
  },
];
