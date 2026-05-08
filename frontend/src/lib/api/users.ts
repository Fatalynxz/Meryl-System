import { supabase } from "../supabase";
import { getRowById, listRows, removeRow, updateRow } from "./_common";

export const usersApi = {
  list: () => listRows("user", "*, role:role(*)", "created_at"),
  getById: (id: string) => getRowById("user", id, "*, role:role(*)"),
  create: (payload: any) =>
    supabase.rpc("upsert_user", {
      p_actor_user_id: payload.actor_user_id,
      p_name: payload.name,
      p_username: payload.username,
      p_password: payload.password,
      p_role_id: payload.role_id,
      p_status: payload.status,
      p_email: payload.email,
    }).then(({ data, error }) => { if (error) throw error; return data; }),
  update: (id: string, payload: any) =>
    supabase.rpc("upsert_user", {
      p_actor_user_id: payload.actor_user_id,
      p_user_id: id,
      p_name: payload.name,
      p_username: payload.username,
      p_password: payload.password,
      p_role_id: payload.role_id,
      p_status: payload.status,
      p_email: payload.email,
    }).then(({ data, error }) => { if (error) throw error; return data; }),
  remove: (id: string) => removeRow("user", id),
  patch: (id: string, payload: any) => updateRow("user", id, payload),
};
