// Initial catalogue. Prices are exactly as supplied; null = "Price Not Added".
// No machine compatibility, stock or purchase prices are invented.
export const categories = [
  { id: 'bearings', nameEnglish: 'Bearings', nameTelugu: 'బేరింగ్స్', icon: '⚙️' },
  { id: 'stud-bolts', nameEnglish: 'Stud Bolts', nameTelugu: 'స్టడ్ బోల్టులు', icon: '🔩' },
  { id: 'bolts', nameEnglish: 'Bolts', nameTelugu: 'బోల్టులు', icon: '🔩' },
  { id: 'oil-seals', nameEnglish: 'Oil Seals', nameTelugu: 'ఆయిల్ సీల్స్', icon: '⭕' },
  { id: 'collars', nameEnglish: 'Collars', nameTelugu: 'కాలర్లు', icon: '🔘' },
  { id: 'joints', nameEnglish: 'Joints', nameTelugu: 'జాయింట్లు', icon: '✚' },
  { id: 'gear-oil', nameEnglish: 'Gear Oil', nameTelugu: 'గేర్ ఆయిల్', icon: '🛢️' },
  { id: 'hubs', nameEnglish: 'Hubs', nameTelugu: 'హబ్‌లు', icon: '🛞' },
  { id: 'axels', nameEnglish: 'Axels', nameTelugu: 'యాక్సిళ్లు', icon: '➖' },
  { id: 'cups', nameEnglish: 'Cups', nameTelugu: 'కప్పులు', icon: '🏺' },
  { id: 'accessories', nameEnglish: 'Rotavator Accessories', nameTelugu: 'రోటావేటర్ విడిభాగాలు', icon: '🧰' },
];

const P = (id, category, nameEnglish, nameTelugu, brand, size, productNumber, mrp) => ({
  id, category, nameEnglish, nameTelugu, brand, size, productNumber, mrp,
});

export const products = [
  P('bearing-skf-6311', 'bearings', 'SKF Bearing', 'ఎస్‌కెఎఫ్ బేరింగ్', 'SKF', '6311', '', 1811),
  P('bearing-skf-6309-2rs1', 'bearings', 'SKF Bearing', 'ఎస్‌కెఎఫ్ బేరింగ్', 'SKF', '6309-2RS1', '', 1905),
  P('bearing-skf-taper-bt1-0526', 'bearings', 'SKF Taper Roller Bearing', 'ఎస్‌కెఎఫ్ టేపర్ రోలర్ బేరింగ్', 'SKF', 'BT1-0526 (30210)', '', 883),
  P('bearing-skf-taper-30209', 'bearings', 'SKF Taper Roller Bearing', 'ఎస్‌కెఎఫ్ టేపర్ రోలర్ బేరింగ్', 'SKF', '30209 J2/Q', '', 895),
  P('bearing-skf-taper-30208', 'bearings', 'SKF Taper Roller Bearing', 'ఎస్‌కెఎఫ్ టేపర్ రోలర్ బేరింగ్', 'SKF', '30208 J2/Q', '', 1025),
  P('joint-bul-uj-cross-kit', 'joints', 'BUL UJ Cross Kit', 'బుల్ యూజే క్రాస్ కిట్', 'BUL', '', 'UJ Kit', 880),
  P('oil-3star-rotavator-gear-oil', 'gear-oil', '3 Star Rotavator Gear Oil', '3 స్టార్ రోటావేటర్ గేర్ ఆయిల్', '3 Star', '', '', 200),
  P('oilseal-shaktiman-6311', 'oil-seals', 'Shaktiman Oil Seal', 'శక్తిమాన్ ఆయిల్ సీల్', 'Shaktiman', '6311', '', 235),
  P('oilseal-shaktiman-6309', 'oil-seals', 'Shaktiman Oil Seal', 'శక్తిమాన్ ఆయిల్ సీల్', 'Shaktiman', '6309', '', 210),
  P('oilseal-ego-35-72-10', 'oil-seals', 'EGO Genuine Oil Seal', 'ఈజీఓ జెన్యూన్ ఆయిల్ సీల్', 'EGO', '35-72-10', '', null),
  P('oilseal-ego-35-80-10', 'oil-seals', 'EGO Genuine Oil Seal', 'ఈజీఓ జెన్యూన్ ఆయిల్ సీల్', 'EGO', '35-80-10', '', null),
  P('oilseal-ego-45-85-10', 'oil-seals', 'EGO Genuine Oil Seal', 'ఈజీఓ జెన్యూన్ ఆయిల్ సీల్', 'EGO', '45-85-10', '', null),
  P('oilseal-ego-35-85-10', 'oil-seals', 'EGO Genuine Oil Seal', 'ఈజీఓ జెన్యూన్ ఆయిల్ సీల్', 'EGO', '35-85-10', '', null),
  P('collar-shaktiman-6311', 'collars', 'Shaktiman Collar', 'శక్తిమాన్ కాలర్', 'Shaktiman', '6311', '', 281),
  P('collar-shaktiman-6309', 'collars', 'Shaktiman Collar', 'శక్తిమాన్ కాలర్', 'Shaktiman', '6309', '', 196),
  P('bolt-joint-lock', 'bolts', 'Joint Lock Bolt', 'జాయింట్ లాక్ బోల్టు', '', '', '', 50),
  P('bolt-door-1in-10mm', 'bolts', 'Door Bolt', 'డోర్ బోల్టు', '', '1 inch × 10 mm', '', 20),
  P('bolt-rotavator-plate-1-5in-12mm', 'bolts', 'Rotavator Plate Bolt', 'రోటావేటర్ ప్లేట్ బోల్టు', '', '1 1/2 inch × 12 mm', '', 25),
  P('bolt-spring-2-5in-10mm', 'bolts', 'Spring Bolt', 'స్ప్రింగ్ బోల్టు', '', '2 1/2 inch × 10 mm', '', 25),
  P('hub-left-6311', 'hubs', 'Hub – Left Side', 'హబ్ – ఎడమ వైపు', '', '6311', '', null),
  P('hub-right-6309', 'hubs', 'Hub – Right Side', 'హబ్ – కుడి వైపు', '', '6309', '', null),
  P('axel-right-6309', 'axels', 'Axel – Right Side', 'యాక్సిల్ – కుడి వైపు', '', '6309', '', null),
  P('axel-left-6311', 'axels', 'Axel – Left Side', 'యాక్సిల్ – ఎడమ వైపు', '', '6311', '', null),
  P('cup-right', 'cups', 'Right Side Cup', 'కుడి వైపు కప్పు', '', '', '', null),
  P('cup-left', 'cups', 'Left Side Cup', 'ఎడమ వైపు కప్పు', '', '', '', null),
];
