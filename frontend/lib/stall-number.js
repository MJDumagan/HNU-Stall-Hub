const STALL_NUMBER_BY_STORE_ID = {
  1: 3,
};

export function getStallNumber(storeId) {
  const id = Number(storeId);
  return STALL_NUMBER_BY_STORE_ID[id] || id;
}
