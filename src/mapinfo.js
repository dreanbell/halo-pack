// Catálogo de mapas (sin dependencias: lo usan el navegador y la sala del servidor).
export const MAPS = [
  { id: 'valle', name: 'VALLE DEL ANILLO', tag: 'Pradera · Ruinas antiguas', sky: ['#2a64ad', '#cfe3f2', '#5f7448'],
    desc: 'Praderas bajo el arco del anillo. Plataforma central elevada, búnkeres en las esquinas y monolitos antiguos.' },
  { id: 'glaciar', name: 'CIUDADELA GLACIAL', tag: 'Nieve · Atardecer', sky: ['#2b3d73', '#e9b9a8', '#dfe8f2'],
    desc: 'Ruinas heladas al pie de la cordillera. Aguja central, terrazas laterales y cristales de hielo como cobertura.' },
  { id: 'canon', name: 'CAÑÓN ÁMBAR', tag: 'Desierto · Nave estrellada', sky: ['#4f7fb8', '#f2d3a0', '#c8955a'],
    desc: 'Un crucero alienígena partido en dos en el fondo del cañón. Mesetas, agujas violetas y mucho espacio para francotiradores.' },
  { id: 'cenit', name: 'PLATAFORMA CENIT', tag: 'Órbita · Noche', sky: ['#05060f', '#1d2350', '#3ad0ff'],
    desc: 'Instalación flotante sobre un gigante gaseoso. Torres con ascensores gravitatorios y barrera de energía.' },
];
export const DEFAULT_MAP = 'valle';
export const isMap = (id) => MAPS.some((m) => m.id === id);
export const mapInfo = (id) => MAPS.find((m) => m.id === id) ?? MAPS[0];
