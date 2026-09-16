/**
 * products.js — static in-memory product catalog. No database.
 */

const PRODUCTS = [
  { id: 1, name: 'Casque audio sans fil', price: 79.99, category: 'audio' },
  { id: 2, name: 'Clavier mécanique', price: 129.0, category: 'informatique' },
  { id: 3, name: 'Souris ergonomique', price: 39.5, category: 'informatique' },
  { id: 4, name: 'Enceinte Bluetooth', price: 59.99, category: 'audio' },
  { id: 5, name: 'Webcam HD', price: 45.0, category: 'informatique' },
  { id: 6, name: 'Support pour ordinateur portable', price: 25.0, category: 'accessoire' },
  { id: 7, name: 'Chargeur USB-C rapide', price: 19.99, category: 'accessoire' },
  { id: 8, name: 'Écouteurs intra-auriculaires', price: 34.99, category: 'audio' },
];

function getAllProducts() {
  return PRODUCTS;
}

function getProductById(id) {
  return PRODUCTS.find((p) => p.id === Number(id));
}

module.exports = { getAllProducts, getProductById };
