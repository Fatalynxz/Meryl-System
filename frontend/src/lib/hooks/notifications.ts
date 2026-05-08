import { notificationsApi } from "../api/notifications";
import { useEntityById, useEntityList, useEntityMutations } from "./_common";

export function useNotifications() {
  return useEntityList("notifications", notificationsApi.list);
}

export function useNotificationsById(id: string | undefined) {
  return useEntityById("notifications", id, notificationsApi.getById);
}

export function useNotificationsMutations() {
  return useEntityMutations("notifications", {
    create: notificationsApi.create,
    update: notificationsApi.update,
    remove: notificationsApi.remove,
  });
}
