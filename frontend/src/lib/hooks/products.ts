import { productsApi } from "../api/products";
import { useEntityById, useEntityList, useEntityMutations } from "./_common";

export function useProducts() {
  return useEntityList("products", productsApi.list);
}

export function useProductsById(id: string | undefined) {
  return useEntityById("products", id, productsApi.getById);
}

export function useProductsMutations() {
  return useEntityMutations("products", {
    create: productsApi.create,
    update: productsApi.update,
    remove: productsApi.remove,
  });
}
