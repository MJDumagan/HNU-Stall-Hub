const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'products.json');

function readStore() {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeStore(store) {
  fs.writeFileSync(filePath, JSON.stringify(store, null, 2));
}

function listActiveProducts() {
  return readStore()
    .products
    .filter((product) => product.is_active !== false)
    .sort((a, b) => b.product_id - a.product_id);
}

function addProduct({ product_name, price }) {
  const store = readStore();
  const product = {
    product_id: store.nextId++,
    store_id: 1,
    category_id: 1,
    product_name,
    price: Number(price),
    is_active: true,
    category_name: 'Marketplace item',
  };

  store.products.push(product);
  writeStore(store);
  return product;
}

module.exports = {
  listActiveProducts,
  addProduct,
};
