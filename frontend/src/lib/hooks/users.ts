import { usersApi } from "../api/users";
import { useEntityById, useEntityList, useEntityMutations } from "./_common";

export function useUsers() {
  return useEntityList("users", usersApi.list);
}

export function useUsersById(id: string | undefined) {
  return useEntityById("users", id, usersApi.getById);
}

export function useUsersMutations() {
  return useEntityMutations("users", {
    create: usersApi.create,
    update: usersApi.update,
    remove: usersApi.remove,
  });
}
