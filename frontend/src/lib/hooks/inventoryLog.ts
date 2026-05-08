import { inventoryLogApi } from "../api/inventoryLog";
import { useEntityById, useEntityList, useEntityMutations } from "./_common";

export function useInventoryLog() {
  return useEntityList("inventoryLog", inventoryLogApi.list);
}

export function useInventoryLogById(id: string | undefined) {
  return useEntityById("inventoryLog", id, inventoryLogApi.getById);
}

export function useInventoryLogMutations() {
  return useEntityMutations("inventoryLog", {
    create: inventoryLogApi.create,
    update: inventoryLogApi.update,
    remove: inventoryLogApi.remove,
  });
}
