const response = await fetch(
  "http://localhost:5000/api/vendor/dashboard",
  {
    credentials: "include",
  }
);

const result = await response.json();

if (!response.ok || !result.success) {
  throw new Error(result.message || "Failed to load dashboard");
}

setStall(result.data.stall);
setProducts(result.data.products);
setOrders(result.data.orders);
setLowStock(result.data.lowStock);