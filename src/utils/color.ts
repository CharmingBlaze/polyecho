import { Palette } from '../types/texture'
export type { Palette }

export const DEFAULT_PALETTES: Palette[] = [
  // ==========================================
  // 1. RETRO CONSOLES & CLASSIC HARDWARE
  // ==========================================
  {
    id: 'psx-classic',
    name: 'PSX Classic 16',
    category: 'Consoles',
    colors: [
      '#000000', '#181425', '#262b44', '#3a4466', '#5a6988', '#8b9bb4', '#c0cbdc', '#ffffff',
      '#b13e53', '#ef7d57', '#ffcd75', '#a7f070', '#38b764', '#257179', '#29366f', '#3b5dc9'
    ]
  },
  {
    id: 'pico-8',
    name: 'PICO-8 16',
    category: 'Consoles',
    colors: [
      '#000000', '#1D2B53', '#7E2553', '#008751', '#AB5236', '#5F574F', '#C2C3C7', '#FFF1E8',
      '#FF004D', '#FFA300', '#FFEC27', '#00E436', '#29ADFF', '#83769C', '#FF77A8', '#FFCCAA'
    ]
  },
  {
    id: 'tic-80',
    name: 'TIC-80 Sweetie 16',
    category: 'Consoles',
    colors: [
      '#1a1c2c', '#5d275d', '#b13e53', '#ef7d57', '#ffcd75', '#a7f070', '#38b764', '#257179',
      '#29366f', '#3b5dc9', '#41a6f6', '#73eff7', '#f4f4f4', '#94b0c2', '#566c86', '#333c57'
    ]
  },
  {
    id: 'gameboy-dmg',
    name: 'Game Boy DMG-01 (4)',
    category: 'Consoles',
    colors: [
      '#0f380f', '#306230', '#8bac0f', '#9bbc0f'
    ]
  },
  {
    id: 'gameboy-pocket',
    name: 'Game Boy Pocket (4)',
    category: 'Consoles',
    colors: [
      '#2b2b26', '#706b66', '#a8a29e', '#e6e1da'
    ]
  },
  {
    id: 'gameboy-light',
    name: 'Game Boy Light (4-Teal)',
    category: 'Consoles',
    colors: [
      '#003830', '#006b5a', '#00bfa5', '#80ffea'
    ]
  },
  {
    id: 'gbc-16',
    name: 'Game Boy Color 16',
    category: 'Consoles',
    colors: [
      '#000000', '#ffffff', '#e79c21', '#ad3900', '#ff0000', '#ff8484', '#009c00', '#84de00',
      '#0000ff', '#00b5de', '#ad0084', '#de84ff', '#848484', '#cecece', '#ffde84', '#845200'
    ]
  },
  {
    id: 'nes-classic',
    name: 'NES / Famicom 32',
    category: 'Consoles',
    colors: [
      '#000000', '#7c7c7c', '#0000fc', '#0000bc', '#4428bc', '#940084', '#a80020', '#a81000',
      '#881400', '#503000', '#007800', '#006800', '#005800', '#004058', '#ffffff', '#bcbcbc',
      '#0078f8', '#0058f8', '#6844fc', '#d800cc', '#e40058', '#f83800', '#e45c10', '#ac7c00',
      '#00b800', '#00a800', '#00a844', '#008888', '#f8b800', '#3cbcfc', '#f878f8', '#b8b8f8'
    ]
  },
  {
    id: 'c64-palette',
    name: 'Commodore 64 (16)',
    category: 'Consoles',
    colors: [
      '#000000', '#ffffff', '#880000', '#aaffee', '#cc44cc', '#00cc55', '#0000aa', '#eeee77',
      '#dd8855', '#664400', '#ff7777', '#333333', '#777777', '#aaff66', '#0088ff', '#bbbbbb'
    ]
  },
  {
    id: 'zx-spectrum',
    name: 'ZX Spectrum (15)',
    category: 'Consoles',
    colors: [
      '#000000', '#0000d7', '#d70000', '#d700d7', '#00d700', '#00d7d7', '#d7d700', '#d7d7d7',
      '#0000ff', '#ff0000', '#ff00ff', '#00ff00', '#00ffff', '#ffff00', '#ffffff'
    ]
  },
  {
    id: 'genesis-16',
    name: 'Sega Mega Drive (16)',
    category: 'Consoles',
    colors: [
      '#000000', '#222244', '#444488', '#8888cc', '#ffffff', '#ee2222', '#ff8800', '#ffcc00',
      '#00cc00', '#0088ff', '#aa00ee', '#884422', '#cc8855', '#444444', '#888888', '#cccccc'
    ]
  },
  {
    id: 'master-system',
    name: 'Sega Master System (16)',
    category: 'Consoles',
    colors: [
      '#000000', '#0000aa', '#00aa00', '#00aaaa', '#aa0000', '#aa00aa', '#aa5500', '#aaaaaa',
      '#555555', '#5555ff', '#55ff55', '#55ffff', '#ff5555', '#ff55ff', '#ffff55', '#ffffff'
    ]
  },
  {
    id: 'apple-ii',
    name: 'Apple II (16)',
    category: 'Consoles',
    colors: [
      '#000000', '#722640', '#40337f', '#e434fe', '#0e5940', '#808080', '#1b9afe', '#b9b5fe',
      '#464a00', '#e46501', '#808080', '#f1a6be', '#1bcbbb', '#bfe280', '#8cd9bf', '#ffffff'
    ]
  },
  {
    id: 'cga-mode1',
    name: 'CGA Mode 1 (4)',
    category: 'Consoles',
    colors: [
      '#000000', '#00aaaa', '#aa00aa', '#aaaaaa'
    ]
  },
  {
    id: 'cga-mode2',
    name: 'CGA Mode 2 (4)',
    category: 'Consoles',
    colors: [
      '#000000', '#00aa00', '#aa0000', '#aa5500'
    ]
  },
  {
    id: 'ega-16',
    name: 'EGA Standard 16',
    category: 'Consoles',
    colors: [
      '#000000', '#0000aa', '#00aa00', '#00aaaa', '#aa0000', '#aa00aa', '#aa5500', '#aaaaaa',
      '#555555', '#5555ff', '#55ff55', '#55ffff', '#ff5555', '#ff55ff', '#ffff55', '#ffffff'
    ]
  },
  {
    id: 'msx-16',
    name: 'MSX Classic (16)',
    category: 'Consoles',
    colors: [
      '#000000', '#010101', '#3eb849', '#74d07d', '#5955e0', '#8076f1', '#b95e51', '#65dbef',
      '#db6559', '#ff897d', '#ccc35e', '#ded087', '#3aa241', '#b766b5', '#cccccc', '#ffffff'
    ]
  },
  {
    id: 'neo-geo-pocket',
    name: 'Neo Geo Pocket (16)',
    category: 'Consoles',
    colors: [
      '#000000', '#302830', '#706870', '#b0a8b0', '#f8f0f8', '#c81818', '#f87830', '#f8d038',
      '#48b048', '#186830', '#3878f8', '#103890', '#c84890', '#702048', '#b86030', '#683818'
    ]
  },

  // ==========================================
  // 2. PIXEL ART CHAMPIONS (LOSPEC CLASSICS)
  // ==========================================
  {
    id: 'endesga-32',
    name: 'ENDESGA 32 (EDG32)',
    category: 'Pixel Art',
    colors: [
      '#be4a2f', '#d77643', '#ead4aa', '#e4a672', '#b86f56', '#733e39', '#3e2731', '#a22633',
      '#e43b44', '#f77622', '#feae34', '#fee761', '#63c74d', '#3e8948', '#265c42', '#193c3e',
      '#124e89', '#0099db', '#2ce8f5', '#ffffff', '#c0cbdc', '#8b9bb4', '#5a6988', '#3a4466',
      '#262b44', '#181425', '#ff0044', '#68386c', '#b55088', '#f6757a', '#e8b796', '#c28569'
    ]
  },
  {
    id: 'endesga-64',
    name: 'ENDESGA 64 (EDG64)',
    category: 'Pixel Art',
    colors: [
      '#ff0044', '#68386c', '#b55088', '#f6757a', '#e8b796', '#c28569', '#be4a2f', '#d77643',
      '#ead4aa', '#e4a672', '#b86f56', '#733e39', '#3e2731', '#a22633', '#e43b44', '#f77622',
      '#feae34', '#fee761', '#63c74d', '#3e8948', '#265c42', '#193c3e', '#124e89', '#0099db',
      '#2ce8f5', '#ffffff', '#c0cbdc', '#8b9bb4', '#5a6988', '#3a4466', '#262b44', '#181425',
      '#1b1c2b', '#2c2d3f', '#444559', '#636577', '#87899c', '#b3b5c6', '#e0e2ee', '#ffffff',
      '#8f563b', '#663931', '#45283c', '#222034', '#524b24', '#323c39', '#3f3f74', '#306082',
      '#5b6ee1', '#639bff', '#5fcde4', '#cbdbfc', '#9badb7', '#847e87', '#696a6a', '#595652',
      '#76428a', '#ac3232', '#d95763', '#d77bba', '#8f974a', '#8a6f30', '#df7126', '#d9a066'
    ]
  },
  {
    id: 'dawnbringer-16',
    name: 'DawnBringer 16 (DB16)',
    category: 'Pixel Art',
    colors: [
      '#140c1c', '#442434', '#30346d', '#4e4a4e', '#854c30', '#346524', '#d04648', '#757161',
      '#597dce', '#d27d2c', '#8595a1', '#6daa2c', '#d2aa99', '#6dc2ca', '#dad45e', '#deeed6'
    ]
  },
  {
    id: 'dawnbringer-32',
    name: 'DawnBringer 32 (DB32)',
    category: 'Pixel Art',
    colors: [
      '#000000', '#222034', '#45283c', '#663931', '#8f563b', '#df7126', '#d9a066', '#eec39a',
      '#fbf236', '#99e550', '#6abe30', '#37946e', '#4b692f', '#524b24', '#323c39', '#3f3f74',
      '#306082', '#5b6ee1', '#639bff', '#5fcde4', '#cbdbfc', '#ffffff', '#9badb7', '#847e87',
      '#696a6a', '#595652', '#76428a', '#ac3232', '#d95763', '#d77bba', '#8f974a', '#8a6f30'
    ]
  },
  {
    id: 'resurrect-64',
    name: 'Resurrect 64',
    category: 'Pixel Art',
    colors: [
      '#2e222f', '#3e3546', '#625565', '#966c6c', '#ab947a', '#697b54', '#4e4a4e', '#757161',
      '#8595a1', '#d2aa99', '#deeed6', '#ffffff', '#fad6b8', '#e8b796', '#c28569', '#a55648',
      '#752438', '#511e43', '#3d253b', '#261b2e', '#873555', '#a65455', '#d4804d', '#e4a672',
      '#fee761', '#ffccaa', '#b86f56', '#733e39', '#3e2731', '#be4a2f', '#d77643', '#f77622',
      '#feae34', '#a22633', '#e43b44', '#ff0044', '#68386c', '#b55088', '#f6757a', '#63c74d',
      '#3e8948', '#265c42', '#193c3e', '#124e89', '#0099db', '#2ce8f5', '#5a6988', '#3a4466',
      '#262b44', '#181425', '#c0cbdc', '#8b9bb4', '#8ea64e', '#c1db70', '#3e4a28', '#63753b'
    ]
  },
  {
    id: 'aap-64',
    name: 'AAP-64 (Adigun Polack)',
    category: 'Pixel Art',
    colors: [
      '#060608', '#141013', '#3b1725', '#73172d', '#b4202a', '#df3e23', '#fa6a0a', '#f9a31b',
      '#ffd541', '#fffc40', '#d6f264', '#9cdb43', '#5daf15', '#368925', '#20612d', '#12402d',
      '#0b2926', '#091921', '#0d2b45', '#203c56', '#415d66', '#6e8979', '#a5ba8a', '#e1e3a9',
      '#ffffff', '#c7cfcc', '#8d9c98', '#5c6865', '#333c3e', '#1c2124', '#0d1011', '#542b14',
      '#8a481c', '#b86f2d', '#d99752', '#f2c185', '#fadbb7', '#301828', '#5e2a4a', '#8a3a62',
      '#bd5175', '#e3778a', '#f2a7a7', '#fad7d2', '#211832', '#3e2759', '#633980', '#8e519e',
      '#b96fc2', '#d99be3', '#f4ccf7', '#14203b', '#233d6b', '#3b629b', '#5c8ec4', '#8bb8e8',
      '#bee0f7', '#e8f6fc', '#1c3838', '#2c5e54', '#46876c', '#6db387', '#9ee0a7', '#d6ffd4'
    ]
  },
  {
    id: 'arne-16',
    name: 'Arne 16',
    category: 'Pixel Art',
    colors: [
      '#000000', '#9D9D9D', '#FFFFFF', '#BE2633', '#E06F8B', '#493C2B', '#A46422', '#EB8931',
      '#FEE761', '#2CE8F5', '#1B2632', '#005784', '#31A2F2', '#B2DCEF', '#323C39', '#44891A'
    ]
  },
  {
    id: 'fantasy-24',
    name: 'Fantasy 24',
    category: 'Pixel Art',
    colors: [
      '#1f102a', '#3e1e3b', '#732c49', '#b33e4f', '#e66854', '#f7a361', '#fce28b', '#ffffff',
      '#232a3f', '#364d63', '#497e7b', '#62b584', '#99e080', '#daf593', '#1e1c2e', '#393352',
      '#5c5075', '#8a779c', '#bdabd1', '#ebdff2', '#3b2427', '#6e3c32', '#ab623d', '#e09858'
    ]
  },
  {
    id: 'rosy-42',
    name: 'Rosy 42',
    category: 'Pixel Art',
    colors: [
      '#111116', '#221c2b', '#3d2943', '#5f3a5e', '#885177', '#b46e92', '#dc93ac', '#f6c3c5',
      '#fcf4e4', '#e2d3b4', '#bfa780', '#967b54', '#6c5339', '#463223', '#261917', '#160d08',
      '#a22633', '#e43b44', '#f77622', '#feae34', '#fee761', '#63c74d', '#3e8948', '#265c42',
      '#193c3e', '#124e89', '#0099db', '#2ce8f5', '#c0cbdc', '#8b9bb4', '#5a6988', '#3a4466',
      '#262b44', '#181425', '#ff0044', '#68386c', '#b55088', '#f6757a', '#e8b796', '#c28569',
      '#752438', '#511e43'
    ]
  },
  {
    id: 'zughy-32',
    name: 'Zughy 32',
    category: 'Pixel Art',
    colors: [
      '#000000', '#1c1c1c', '#383838', '#555555', '#717171', '#8e8e8e', '#aaaaaa', '#c7c7c7',
      '#e3e3e3', '#ffffff', '#2e1f27', '#4f2b35', '#7c3f42', '#ad5a4b', '#d87e58', '#fca868',
      '#ffcc80', '#ffe5a3', '#1e282d', '#284144', '#38615c', '#4e8674', '#6db18d', '#96dba7',
      '#c8ffc7', '#251e3e', '#39295c', '#573b7d', '#7d529f', '#a96ec0', '#d78ee0', '#ffb5f7'
    ]
  },
  {
    id: 'sweet-16',
    name: 'Sweet 16',
    category: 'Pixel Art',
    colors: [
      '#1a1c2c', '#5d275d', '#b13e53', '#ef7d57', '#ffcd75', '#a7f070', '#38b764', '#257179',
      '#29366f', '#3b5dc9', '#41a6f6', '#73eff7', '#f4f4f4', '#94b0c2', '#566c86', '#333c57'
    ]
  },
  {
    id: 'bubblegum-16',
    name: 'Bubblegum 16',
    category: 'Pixel Art',
    colors: [
      '#161324', '#382b47', '#5f466b', '#8f688e', '#c491b2', '#f2c4d6', '#ffffff', '#f4777f',
      '#e04156', '#a11f3d', '#4d1630', '#ff9859', '#ffcc66', '#8fe06b', '#48b87e', '#45858c'
    ]
  },
  {
    id: 'cozy-16',
    name: 'Cozy Autumn 16',
    category: 'Pixel Art',
    colors: [
      '#21151b', '#392026', '#592e2b', '#80442f', '#a85f36', '#cf8244', '#ebaa59', '#fadb7d',
      '#fff5ba', '#475437', '#637a44', '#869e51', '#322d3b', '#48435c', '#686580', '#9593a8'
    ]
  },
  {
    id: 'pear36',
    name: 'Pear 36',
    category: 'Pixel Art',
    colors: [
      '#24142c', '#3c233d', '#61324c', '#894357', '#b55a5b', '#dc7859', '#f3a059', '#f9c968',
      '#fbf088', '#fff8b3', '#252e38', '#38484e', '#536b64', '#759379', '#9ec08f', '#cfecaa',
      '#181a2f', '#242c4b', '#35476e', '#4c6c97', '#6d9ac3', '#9ecbf0', '#4a1e35', '#7a2d48',
      '#af4254', '#e0605a', '#f58a69', '#3b241e', '#5e3826', '#875231', '#b6733e', '#e19a50',
      '#1c1c24', '#363848', '#5b5d72', '#ffffff'
    ]
  },

  // ==========================================
  // 3. BIOMES & ENVIRONMENTS
  // ==========================================
  {
    id: 'lush-forest',
    name: 'Lush Forest 16',
    category: 'Biomes',
    colors: [
      '#0f2310', '#1c3d1e', '#295a2c', '#3c7d41', '#54a35b', '#73cc7b', '#9bf2a3', '#dafce0',
      '#2d1f14', '#4a3321', '#704f33', '#9c7149', '#c9996d', '#f0c79e', '#e63946', '#ffb703'
    ]
  },
  {
    id: 'warm-earth',
    name: 'Warm Earth & Clay 16',
    category: 'Biomes',
    colors: [
      '#2b1810', '#4a2818', '#734125', '#a06037', '#cd8852', '#e5b682', '#f3d9b1', '#fff4e4',
      '#2d381e', '#485c2c', '#6d8a3c', '#9bb859', '#7f2814', '#a84123', '#cb683c', '#e89764'
    ]
  },
  {
    id: 'deep-ocean',
    name: 'Deep Ocean & Coral 16',
    category: 'Biomes',
    colors: [
      '#03071e', '#0b132b', '#1c2541', '#3a506b', '#0077b6', '#0096c7', '#00b4d8', '#48cae4',
      '#90e0ef', '#ade8f4', '#caf0f8', '#ffffff', '#ff6b6b', '#f72585', '#7209b7', '#4361ee'
    ]
  },
  {
    id: 'volcanic-magma',
    name: 'Volcanic Magma 16',
    category: 'Biomes',
    colors: [
      '#121113', '#221f24', '#38333c', '#534d58', '#4a1515', '#7a1c1c', '#b3261e', '#e63946',
      '#f3722c', '#f8961e', '#f9c74f', '#fff3b0', '#ffffff', '#8d99ae', '#457b9d', '#1d3557'
    ]
  },
  {
    id: 'desert-dunes',
    name: 'Desert & Sandstorm 16',
    category: 'Biomes',
    colors: [
      '#24150b', '#3d2311', '#5c381c', '#80502a', '#a66d3d', '#cb8e55', '#e8b274', '#f7d39a',
      '#fef0c7', '#ffffff', '#4a251a', '#753b27', '#a65636', '#d67949', '#637848', '#8fa865'
    ]
  },
  {
    id: 'frozen-glacier',
    name: 'Frozen Tundra & Ice 16',
    category: 'Biomes',
    colors: [
      '#0c1524', '#15253d', '#223d5e', '#345982', '#4c7aa8', '#6fa1ce', '#99caf0', '#c7e5fc',
      '#ecf6ff', '#ffffff', '#2c3545', '#49566d', '#6e7d96', '#9ba9bf', '#cfd9e8', '#e8385d'
    ]
  },
  {
    id: 'ghibli-nature',
    name: 'Studio Ghibli Nature 16',
    category: 'Biomes',
    colors: [
      '#132320', '#1c3d31', '#2f5e3e', '#538a4d', '#86b85a', '#c7dc6d', '#f7f6af', '#ffffff',
      '#192336', '#2b4461', '#4d758f', '#81abc4', '#bde2e6', '#f4d29c', '#dc8e58', '#994a3a'
    ]
  },
  {
    id: 'gothic-dungeon',
    name: 'Gothic Obsidian 16',
    category: 'Biomes',
    colors: [
      '#09090d', '#13131c', '#20202e', '#323245', '#484861', '#636382', '#8484a8', '#abb0cf',
      '#3b111a', '#611624', '#8f1d2f', '#c4273d', '#2e2417', '#4f3b23', '#7a5a31', '#a87d40'
    ]
  },

  // ==========================================
  // 4. MATERIALS, TONES & ANATOMY
  // ==========================================
  {
    id: 'character-skin',
    name: 'Skin & Anatomy 16',
    category: 'Materials',
    colors: [
      '#1f140e', '#3b2219', '#5c3826', '#804e35', '#a66a49', '#cc8966', '#e6aa8a', '#f5cbaf',
      '#fce2d2', '#fff5ed', '#2c1e13', '#54361c', '#8a5c2e', '#c49156', '#e0bc84', '#f7e7c4'
    ]
  },
  {
    id: 'metallurgy-gold',
    name: 'Metals & Gold 16',
    category: 'Materials',
    colors: [
      '#1c1d21', '#31353d', '#4a505c', '#6d7582', '#97a1b0', '#c8d1de', '#ffffff', '#4d3319',
      '#7a5226', '#ad783b', '#dca258', '#ffd08a', '#ffeaaf', '#803d29', '#ba5e3f', '#f28e6b'
    ]
  },
  {
    id: 'gemstones-16',
    name: 'Gemstones & Crystals 16',
    category: 'Materials',
    colors: [
      '#7f1d1d', '#dc2626', '#f87171', '#064e3b', '#059669', '#34d399', '#0c4a6e', '#0284c7',
      '#38bdf8', '#4c1d95', '#7c3aed', '#a78bfa', '#78350f', '#d97706', '#fbbf24', '#ffffff'
    ]
  },
  {
    id: 'dungeon-stone',
    name: 'Dungeon Stone 16',
    category: 'Materials',
    colors: [
      '#111318', '#1e232d', '#323b4c', '#4e5b72', '#7b8aa2', '#a8b5c9', '#5c3a21', '#8c5932',
      '#c2854d', '#e0b27e', '#852d2d', '#b84343', '#8a7d3b', '#c7b659', '#e8dc8e', '#f4f6fa'
    ]
  },
  {
    id: 'wood-timber',
    name: 'Wood & Timber 16',
    category: 'Materials',
    colors: [
      '#170c08', '#2b160e', '#452214', '#66321b', '#8f4724', '#bd6230', '#e08341', '#f5aa62',
      '#fcd095', '#ffebcc', '#36241a', '#543725', '#7a5135', '#a37048', '#cc9464', '#ebb88a'
    ]
  },

  // ==========================================
  // 5. STYLIZED & MOODS
  // ==========================================
  {
    id: 'cyberpunk-16',
    name: 'Cyberpunk Neon 16',
    category: 'Stylized',
    colors: [
      '#050510', '#131124', '#261b40', '#4a154b', '#7e105e', '#b80c6c', '#ff007f', '#ff66b2',
      '#00f0ff', '#00b8ff', '#0072ff', '#00ff9f', '#39ff14', '#ffe600', '#ff6600', '#ffffff'
    ]
  },
  {
    id: 'pastel-vaporwave',
    name: 'Pastel Vaporwave 16',
    category: 'Stylized',
    colors: [
      '#2e1f47', '#493267', '#7b4e85', '#b36a8c', '#e38d94', '#f8b595', '#ffe0b5', '#ffffff',
      '#8be9fd', '#50fa7b', '#ffb86c', '#ff79c6', '#bd93f9', '#ff5555', '#f1fa8c', '#6272a4'
    ]
  },
  {
    id: 'anime-cel',
    name: 'Anime Cel Shading 16',
    category: 'Stylized',
    colors: [
      '#1f1934', '#3c295a', '#6d3b7d', '#b15392', '#e87498', '#f8b2b2', '#fdf1dc', '#ffffff',
      '#103848', '#1a6473', '#2ba29b', '#57d3a0', '#a4f29e', '#fdf396', '#f29f57', '#d94f57'
    ]
  },
  {
    id: 'monochrome-16',
    name: 'Grayscale & Charcoal 16',
    category: 'Stylized',
    colors: [
      '#000000', '#111111', '#222222', '#333333', '#444444', '#555555', '#666666', '#777777',
      '#888888', '#999999', '#aaaaaa', '#bbbbbb', '#cccccc', '#dddddd', '#eeeeee', '#ffffff'
    ]
  }
]

export interface ShadingRampTones {
  highlight: string
  light: string
  base: string
  shadow: string
  deepShadow: string
}

export function generateShadingRamp(baseHex: string): ShadingRampTones {
  const rgb = hexToRgb(baseHex)
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b)

  // Highlight: brighter, warmer
  const hlH = (hsl.h + 0.03) % 1.0
  const hlS = Math.max(0, hsl.s * 0.85)
  const hlL = Math.min(0.98, hsl.l + (1.0 - hsl.l) * 0.45)
  const hlRgb = hslToRgb(hlH, hlS, hlL)

  // Light: slightly brighter
  const ltL = Math.min(0.95, hsl.l + (1.0 - hsl.l) * 0.22)
  const ltRgb = hslToRgb(hsl.h, hsl.s, ltL)

  // Shadow: cooler, richer saturation
  const shH = (hsl.h - 0.05 + 1.0) % 1.0
  const shS = Math.min(1.0, hsl.s * 1.15 + 0.05)
  const shL = Math.max(0.04, hsl.l * 0.65)
  const shRgb = hslToRgb(shH, shS, shL)

  // Deep Shadow: dark ambient occlusion
  const dpH = (hsl.h - 0.08 + 1.0) % 1.0
  const dpS = Math.min(1.0, hsl.s * 1.25 + 0.1)
  const dpL = Math.max(0.02, hsl.l * 0.35)
  const dpRgb = hslToRgb(dpH, dpS, dpL)

  return {
    highlight: rgbToHex(hlRgb.r, hlRgb.g, hlRgb.b),
    light: rgbToHex(ltRgb.r, ltRgb.g, ltRgb.b),
    base: baseHex,
    shadow: rgbToHex(shRgb.r, shRgb.g, shRgb.b),
    deepShadow: rgbToHex(dpRgb.r, dpRgb.g, dpRgb.b)
  }
}

export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break
      case g: h = (b - r) / d + 2; break
      case b: h = (r - g) / d + 4; break
    }
    h /= 6
  }
  return { h, s, l }
}

export function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  let r: number, g: number, b: number

  if (s === 0) {
    r = g = b = l
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1
      if (t > 1) t -= 1
      if (t < 1 / 6) return p + (q - p) * 6 * t
      if (t < 1 / 2) return q
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
      return p
    }

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hue2rgb(p, q, h + 1 / 3)
    g = hue2rgb(p, q, h)
    b = hue2rgb(p, q, h - 1 / 3)
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255)
  }
}

// ----------------------------------------------------
// LOCAL STORAGE CUSTOM PALETTE PERSISTENCE
// ----------------------------------------------------
const CUSTOM_PALETTES_KEY = 'polyecho_custom_palettes_v1'

export function loadCustomPalettes(): Palette[] {
  try {
    const raw = localStorage.getItem(CUSTOM_PALETTES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return parsed.map((p: any) => ({
        id: p.id || `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: p.name || 'Custom Palette',
        category: 'Custom',
        isCustom: true,
        colors: Array.isArray(p.colors) ? p.colors : ['#ffffff', '#000000']
      }))
    }
    return []
  } catch {
    return []
  }
}

export function saveCustomPalettes(palettes: Palette[]) {
  try {
    const customOnly = palettes.filter(p => p.isCustom)
    localStorage.setItem(CUSTOM_PALETTES_KEY, JSON.stringify(customOnly))
  } catch (err) {
    console.error('Failed to save custom palettes:', err)
  }
}

export interface RGB {
  r: number
  g: number
  b: number
}

export function hexToRgb(hex: string): RGB {
  let cleanHex = hex.replace('#', '').trim()
  if (cleanHex.length === 3) {
    cleanHex = cleanHex.split('').map(c => c + c).join('')
  }
  const num = parseInt(cleanHex, 16)
  if (isNaN(num)) return { r: 255, g: 255, b: 255 }
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  }
}

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  return '#' + [clamp(r), clamp(g), clamp(b)].map(x => x.toString(16).padStart(2, '0')).join('')
}

export function findClosestPaletteColor(rgb: RGB, paletteHexList: string[]): string {
  if (!paletteHexList || paletteHexList.length === 0) return '#ffffff'
  let closestHex = paletteHexList[0]
  let minDistance = Infinity

  for (const hex of paletteHexList) {
    const palRgb = hexToRgb(hex)
    const dr = rgb.r - palRgb.r
    const dg = rgb.g - palRgb.g
    const db = rgb.b - palRgb.b
    const dist = dr * dr * 0.299 + dg * dg * 0.587 + db * db * 0.114

    if (dist < minDistance) {
      minDistance = dist
      closestHex = hex
    }
  }

  return closestHex
}

export const BAYER_4X4: number[][] = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5]
]

export function getBayerOffset(x: number, y: number, scale: number = 32): number {
  const norm = (BAYER_4X4[((y % 4) + 4) % 4][((x % 4) + 4) % 4] / 16.0) - 0.5
  return norm * scale
}

export function snapColorToPalette(hex: string, paletteHexList: string[]): string {
  const rgb = hexToRgb(hex)
  return findClosestPaletteColor(rgb, paletteHexList)
}

// ----------------------------------------------------
// PALETTE IMPORT & EXPORT UTILITIES (LOSPEC / GPL / HEX / PNG)
// ----------------------------------------------------

export function parseHexPalette(text: string): string[] {
  const lines = text.split(/[\r\n,;\s]+/)
  const colors: string[] = []
  const hexRegex = /^#?([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith(';')) continue
    if (hexRegex.test(trimmed)) {
      let hex = trimmed.startsWith('#') ? trimmed : `#${trimmed}`
      if (hex.length === 4) {
        hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
      }
      hex = hex.toLowerCase()
      if (!colors.includes(hex)) {
        colors.push(hex)
      }
    }
  }
  return colors
}

export function parseGplPalette(text: string): { name?: string; colors: string[] } {
  const lines = text.split(/\r?\n/)
  const colors: string[] = []
  let name: string | undefined

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('GIMP Palette')) {
      if (trimmed.toLowerCase().startsWith('name:')) {
        name = trimmed.slice(5).trim()
      }
      continue
    }
    if (trimmed.toLowerCase().startsWith('columns:')) continue

    const parts = trimmed.split(/\s+/).filter(Boolean)
    if (parts.length >= 3) {
      const r = parseInt(parts[0], 10)
      const g = parseInt(parts[1], 10)
      const b = parseInt(parts[2], 10)
      if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
        const hex = rgbToHex(r, g, b).toLowerCase()
        if (!colors.includes(hex)) {
          colors.push(hex)
        }
      }
    }
  }
  return { name, colors }
}

export function parseJascPal(text: string): string[] {
  const lines = text.split(/\r?\n/)
  const colors: string[] = []
  let isJasc = false

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (!trimmed) continue
    if (i === 0 && trimmed === 'JASC-PAL') {
      isJasc = true
      continue
    }
    if (isJasc && (i === 1 || i === 2)) continue // 0100 or count
    const parts = trimmed.split(/\s+/).filter(Boolean)
    if (parts.length >= 3) {
      const r = parseInt(parts[0], 10)
      const g = parseInt(parts[1], 10)
      const b = parseInt(parts[2], 10)
      if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
        const hex = rgbToHex(r, g, b).toLowerCase()
        if (!colors.includes(hex)) {
          colors.push(hex)
        }
      }
    }
  }
  return colors
}

export async function extractColorsFromImage(file: File, maxColors = 64): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = Math.min(img.width, 256)
        canvas.height = Math.min(img.height, 256)
        const ctx = canvas.getContext('2d')
        if (!ctx) return resolve(['#ffffff', '#000000'])

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
        const colorCounts = new Map<string, number>()

        for (let i = 0; i < data.length; i += 4) {
          const a = data[i + 3]
          if (a < 128) continue
          const hex = rgbToHex(data[i], data[i + 1], data[i + 2]).toLowerCase()
          colorCounts.set(hex, (colorCounts.get(hex) || 0) + 1)
        }

        const sorted = Array.from(colorCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([hex]) => hex)
          .slice(0, maxColors)

        resolve(sorted.length > 0 ? sorted : ['#ffffff', '#000000'])
      }
      img.onerror = () => reject(new Error('Failed to load image'))
      img.src = e.target?.result as string
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

export function exportPaletteToHex(palette: Palette): string {
  return palette.colors.map(c => c.replace('#', '').toLowerCase()).join('\n')
}

export function exportPaletteToGpl(palette: Palette): string {
  let out = `GIMP Palette\nName: ${palette.name}\nColumns: 8\n#\n`
  for (const c of palette.colors) {
    const rgb = hexToRgb(c)
    out += `${rgb.r.toString().padStart(3, ' ')} ${rgb.g.toString().padStart(3, ' ')} ${rgb.b.toString().padStart(3, ' ')}\t${c}\n`
  }
  return out
}

export function exportPaletteToPng(palette: Palette, chipSize = 16): string {
  const count = palette.colors.length
  const canvas = document.createElement('canvas')
  canvas.width = count * chipSize
  canvas.height = chipSize
  const ctx = canvas.getContext('2d')
  if (ctx) {
    for (let i = 0; i < count; i++) {
      ctx.fillStyle = palette.colors[i]
      ctx.fillRect(i * chipSize, 0, chipSize, chipSize)
    }
  }
  return canvas.toDataURL('image/png')
}

export function sortPaletteColors(colors: string[], by: 'hue' | 'brightness' | 'saturation'): string[] {
  return [...colors].sort((a, b) => {
    const rgbA = hexToRgb(a)
    const rgbB = hexToRgb(b)
    const hslA = rgbToHsl(rgbA.r, rgbA.g, rgbA.b)
    const hslB = rgbToHsl(rgbB.r, rgbB.g, rgbB.b)

    if (by === 'hue') {
      return hslA.h - hslB.h || hslA.l - hslB.l
    } else if (by === 'brightness') {
      return hslA.l - hslB.l || hslA.h - hslB.h
    } else if (by === 'saturation') {
      return hslA.s - hslB.s || hslA.l - hslB.l
    }
    return 0
  })
}
