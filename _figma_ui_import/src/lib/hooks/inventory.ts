import { inventoryApi } from "../api/inventory";
import { useEntityById, useEntityList, useEntityMutations } from "./_common";

export function useInventory() {
  return useEntityList("inventory", inventoryApi.list);
}

export function useInventoryById(id: string | undefined) {
  return useEntityById("inventory", id, inventoryApi.getById);
}

export function useInventoryMutations() {
  return useEntityMutations("inventory", {
    create: inventoryApi.create,
    update: inventoryApi.update,
    remove: inventoryApi.remove,
  });
}
