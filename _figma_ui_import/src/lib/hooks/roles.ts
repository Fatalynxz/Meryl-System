import { rolesApi } from "../api/roles";
import { useEntityById, useEntityList, useEntityMutations } from "./_common";

export function useRoles() {
  return useEntityList("roles", rolesApi.list);
}

export function useRolesById(id: string | undefined) {
  return useEntityById("roles", id, rolesApi.getById);
}

export function useRolesMutations() {
  return useEntityMutations("roles", {
    create: rolesApi.create,
    update: rolesApi.update,
    remove: rolesApi.remove,
  });
}
