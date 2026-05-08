import { categoriesApi } from "../api/categories";
import { useEntityById, useEntityList, useEntityMutations } from "./_common";

export function useCategories() {
  return useEntityList("categories", categoriesApi.list);
}

export function useCategoriesById(id: string | undefined) {
  return useEntityById("categories", id, categoriesApi.getById);
}

export function useCategoriesMutations() {
  return useEntityMutations("categories", {
    create: categoriesApi.create,
    update: categoriesApi.update,
    remove: categoriesApi.remove,
  });
}
