// demo-data.js — Productos de muestra para GastroExperience
// Se usan como fallback si la base de datos está vacía
// ⚠️ El administrador puede sustituirlos añadiendo productos reales desde el panel

const DEMO_PRODUCTS = {

  raciones: [
    { name:"Croquetas de la Casa",        price:8.50,  info:"8 unidades. Bechamel cremosa con jamón ibérico.",  is_sugerencia:true,  allergens:{gluten:true,lacteos:true,huevos:true} },
    { name:"Patatas Bravas",              price:7.00,  info:"Con salsa brava casera y alioli.",                 is_sugerencia:false, allergens:{huevos:true} },
    { name:"Calamares a la Romana",       price:12.00, info:"Fritos en aceite de oliva. Con limón.",            is_sugerencia:false, allergens:{gluten:true,huevos:true,moluscos:true} },
    { name:"Gambas al Ajillo",            price:14.00, info:"En cazuela de barro. Con pan artesano.",           is_sugerencia:true,  allergens:{crustaceos:true} },
    { name:"Tabla de Ibéricos",           price:18.00, info:"Jamón ibérico, lomo y chorizo. Para 2 personas.", is_sugerencia:true,  allergens:{} },
    { name:"Pulpo a la Gallega",          price:16.00, info:"Con cachelos y pimentón de La Vera.",              is_sugerencia:false, allergens:{moluscos:true} },
    { name:"Pimientos de Padrón",         price:7.50,  info:"Fritos. Unos pican y otros no.",                  is_sugerencia:false, allergens:{} },
    { name:"Solomillo al Whisky",         price:15.00, info:"Medallones de solomillo con salsa al whisky.",    is_sugerencia:true,  allergens:{azufre:true} },
  ],

  hamburguesas: [
    { name:"Hamburguesa Clásica",         price:9.50,  info:"Ternera 180g, lechuga, tomate, cebolla y queso.", is_sugerencia:false, allergens:{gluten:true,sesamo:true,lacteos:true} },
    { name:"Hamburguesa BBQ",             price:11.00, info:"Bacon crujiente, cebolla caramelizada y BBQ.",    is_sugerencia:true,  allergens:{gluten:true,sesamo:true,lacteos:true,azufre:true} },
    { name:"Hamburguesa de Pollo Crispy", price:10.00, info:"Pechuga empanada, mayonesa de sriracha.",         is_sugerencia:true,  allergens:{gluten:true,sesamo:true,huevos:true,mostaza:true} },
    { name:"Burger Vegetal",              price:9.00,  info:"Veggie patty, aguacate, rúcula y hummus.",        is_sugerencia:false, allergens:{gluten:true,sesamo:true,cacahuetes:true} },
    { name:"Double Smash Burger",         price:13.50, info:"Doble carne 2x120g, doble queso, salsa secreta.",is_sugerencia:true,  allergens:{gluten:true,sesamo:true,lacteos:true,huevos:true} },
  ],

  entrantes: [
    { name:"Bruschetta de Tomate",        price:6.50,  info:"Pan tostado con tomate rallado, aceite y orégano.",is_sugerencia:false,allergens:{gluten:true} },
    { name:"Burrata con Jamón",           price:12.00, info:"Burrata fresca, jamón serrano y rúcula.",         is_sugerencia:true, allergens:{lacteos:true} },
    { name:"Ensalada César",              price:9.00,  info:"Lechuga romana, pollo, anchoas, parmesano.",      is_sugerencia:false,allergens:{gluten:true,lacteos:true,huevos:true,pescado:true} },
    { name:"Tabla de Quesos",             price:14.00, info:"Selección de quesos nacionales con mermelada.",   is_sugerencia:true, allergens:{lacteos:true} },
  ],

  principales: [
    { name:"Entrecot a la Brasa",         price:22.00, info:"300g de ternera con guarnición de patatas.",      is_sugerencia:true, allergens:{} },
    { name:"Merluza a la Plancha",        price:18.00, info:"Con verduras salteadas y salsa verde.",            is_sugerencia:false,allergens:{pescado:true} },
    { name:"Pollo al Horno",              price:14.00, info:"Medio pollo con patatas y ensalada.",              is_sugerencia:false,allergens:{} },
    { name:"Salmón con Risotto",          price:19.00, info:"Salmón fresco con risotto de parmesano.",          is_sugerencia:true, allergens:{pescado:true,lacteos:true} },
    { name:"Pasta Carbonara",             price:12.00, info:"Espaguetis, panceta, huevo y parmesano.",          is_sugerencia:false,allergens:{gluten:true,lacteos:true,huevos:true} },
  ],

  postres: [
    { name:"Tarta de Queso",              price:6.00,  info:"Estilo La Viña. Con mermelada de frambuesa.",     is_sugerencia:true, allergens:{lacteos:true,huevos:true} },
    { name:"Coulant de Chocolate",        price:6.50,  info:"Caliente por dentro. Con helado de vainilla.",    is_sugerencia:true, allergens:{gluten:true,lacteos:true,huevos:true} },
    { name:"Crema Catalana",              price:5.50,  info:"Tradicional con azúcar tostado.",                 is_sugerencia:false,allergens:{lacteos:true,huevos:true} },
    { name:"Fruta de Temporada",          price:5.00,  info:"Selección de fruta fresca del día.",              is_sugerencia:false,allergens:{} },
  ],

  bebidas: [
    { name:"Agua Mineral",                price:1.80,  info:"50cl. Natural o con gas.",                        is_sugerencia:false,allergens:{} },
    { name:"Refrescos",                   price:2.80,  info:"Coca-Cola, Fanta, Sprite, Nestea.",               is_sugerencia:false,allergens:{} },
    { name:"Zumos Naturales",             price:3.50,  info:"Naranja, piña o zanahoria.",                      is_sugerencia:false,allergens:{} },
    { name:"Cerveza",                     price:2.60,  info:"Caña o botellín.",                                is_sugerencia:false,allergens:{gluten:true} },
    { name:"Vino de la Casa",             price:3.00,  info:"Tinto, blanco o rosado.",                         is_sugerencia:false,allergens:{azufre:true} },
    { name:"Agua de Coco",                price:3.80,  info:"Natural. Sin azúcares añadidos.",                 is_sugerencia:true, allergens:{} },
  ],

  cervezas: [
    { name:"Caña",                        price:2.60,  info:"Cerveza de barril.",                              is_sugerencia:false,allergens:{gluten:true} },
    { name:"Jarra",                       price:4.50,  info:"50cl. Cerveza de barril.",                        is_sugerencia:false,allergens:{gluten:true} },
    { name:"Cerveza Sin Alcohol",         price:2.80,  info:"Botellín 33cl.",                                  is_sugerencia:false,allergens:{gluten:true} },
    { name:"Cerveza Artesana IPA",        price:4.50,  info:"Local. Lupulada y afrutada.",                     is_sugerencia:true, allergens:{gluten:true} },
  ],

  vinos: [
    { name:"Copa Vino Blanco",            price:3.20,  info:"Vino blanco de la casa.",                         is_sugerencia:false,allergens:{azufre:true} },
    { name:"Copa Vino Tinto",             price:3.20,  info:"Vino tinto de la casa.",                          is_sugerencia:false,allergens:{azufre:true} },
    { name:"Botella Rioja Reserva",       price:18.00, info:"DO Rioja. Crianza 12 meses en barrica.",          is_sugerencia:true, allergens:{azufre:true} },
    { name:"Cava Brut",                   price:4.50,  info:"Copa de cava catalán.",                           is_sugerencia:false,allergens:{azufre:true} },
    { name:"Tinto de Verano",             price:3.50,  info:"Con limón o naranja.",                            is_sugerencia:false,allergens:{azufre:true} },
  ],

  cafes: [
    { name:"Café Solo",                   price:1.50,  info:"Espresso doble.",                                 is_sugerencia:false,allergens:{} },
    { name:"Café con Leche",              price:1.80,  info:"",                                                is_sugerencia:false,allergens:{lacteos:true} },
    { name:"Cortado",                     price:1.60,  info:"",                                                is_sugerencia:false,allergens:{lacteos:true} },
    { name:"Capuccino",                   price:2.50,  info:"Con leche vaporizada y cacao.",                   is_sugerencia:true, allergens:{lacteos:true} },
    { name:"Té e Infusiones",             price:1.80,  info:"Verde, rojo, negro, manzanilla o menta.",         is_sugerencia:false,allergens:{} },
  ],

  bocadillos: [
    { name:"Bocadillo de Calamares",      price:7.50,  info:"Pan de barra con calamares fritos.",              is_sugerencia:true, allergens:{gluten:true,moluscos:true,huevos:true} },
    { name:"Bocadillo de Lomo",           price:6.50,  info:"Con queso fundido.",                              is_sugerencia:false,allergens:{gluten:true,lacteos:true} },
    { name:"Bocadillo de Jamón",          price:6.00,  info:"Jamón serrano y tomate.",                         is_sugerencia:false,allergens:{gluten:true} },
  ],

  sandwiches: [
    { name:"Sandwich Mixto",              price:5.50,  info:"Jamón york y queso.",                             is_sugerencia:false,allergens:{gluten:true,lacteos:true} },
    { name:"Sandwich Vegetal",            price:6.00,  info:"Lechuga, tomate, huevo y mayo.",                  is_sugerencia:false,allergens:{gluten:true,huevos:true} },
    { name:"Club Sandwich",               price:8.50,  info:"Pollo, bacon, lechuga, tomate y mayo.",           is_sugerencia:true, allergens:{gluten:true,huevos:true} },
  ],

  ensaladas: [
    { name:"Ensalada Mixta",              price:7.00,  info:"Lechuga, tomate, cebolla y atún.",                is_sugerencia:false,allergens:{pescado:true,azufre:true} },
    { name:"Ensalada de la Casa",         price:9.50,  info:"Con huevo, queso y jamón.",                       is_sugerencia:true, allergens:{huevos:true,lacteos:true} },
    { name:"Ensalada de Quinoa",          price:10.00, info:"Con aguacate, granada y aderezo de limón.",       is_sugerencia:true, allergens:{} },
  ],

  pizzas: [
    { name:"Margherita",                  price:10.00, info:"Tomate, mozzarella y albahaca fresca.",           is_sugerencia:false,allergens:{gluten:true,lacteos:true} },
    { name:"Pepperoni",                   price:12.00, info:"Tomate, mozzarella y pepperoni picante.",         is_sugerencia:true, allergens:{gluten:true,lacteos:true} },
    { name:"4 Quesos",                    price:13.00, info:"Mozzarella, gorgonzola, parmesano y brie.",       is_sugerencia:true, allergens:{gluten:true,lacteos:true} },
    { name:"Vegana",                      price:11.00, info:"Verduras asadas y queso vegano.",                 is_sugerencia:false,allergens:{gluten:true} },
  ],

  pastas: [
    { name:"Carbonara",                   price:11.00, info:"Espaguetis, panceta, huevo y parmesano.",         is_sugerencia:false,allergens:{gluten:true,lacteos:true,huevos:true} },
    { name:"Boloñesa",                    price:11.00, info:"Espaguetis con ragú de carne.",                   is_sugerencia:false,allergens:{gluten:true} },
    { name:"Pesto",                       price:12.00, info:"Fusilli con pesto de albahaca y parmesano.",      is_sugerencia:true, allergens:{gluten:true,lacteos:true,frutos_cascara:true} },
    { name:"Pasta Frutti di Mare",        price:15.00, info:"Linguine con mariscos al ajillo.",                is_sugerencia:true, allergens:{gluten:true,crustaceos:true,moluscos:true} },
  ],

  menu: [
    { name:"Menú del Día — Primer Plato", price:0,     info:"Consulta el menú del día en la pizarra.",        is_sugerencia:false,allergens:{} },
    { name:"Menú del Día — Segundo Plato",price:0,     info:"Incluye pan, agua o refresco.",                  is_sugerencia:false,allergens:{} },
    { name:"Menú del Día — Postre o Café",price:0,     info:"Precio total: consultar con el personal.",       is_sugerencia:true, allergens:{} },
  ],
};

// No modificar
if (typeof module !== 'undefined') module.exports = DEMO_PRODUCTS;
