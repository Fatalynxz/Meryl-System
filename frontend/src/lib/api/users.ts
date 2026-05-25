import { supabase } from "../supabase";
import { getRowById, listRows, removeRow, updateRow } from "./_common";

function shouldFallbackFromRpc(error: any) {
  const message = String(error?.message ?? "").toLowerCase();
  return (
    message.includes("gen_salt") ||
    message.includes("upsert_user") ||
    message.includes("function") && message.includes("does not exist")
  );
}

function isMissingStaffCodeColumn(error: any) {
  const message = String(error?.message ?? "").toLowerCase();
  return message.includes("staff_code") && message.includes("column");
}

async function createUserFallback(payload: any) {
  let { data, error } = await supabase
    .from("user")
    .insert({
      name: payload.name,
      username: payload.username,
      password: payload.password,
      role_id: payload.role_id,
      status: payload.status,
      email: payload.email,
      staff_code: payload.staff_code || null,
    } as any)
    .select("*, role:role(*)")
    .single();
  if (error && isMissingStaffCodeColumn(error)) {
    ({ data, error } = await supabase
      .from("user")
      .insert({
        name: payload.name,
        username: payload.username,
        password: payload.password,
        role_id: payload.role_id,
        status: payload.status,
        email: payload.email,
      } as any)
      .select("*, role:role(*)")
      .single());
  }
  if (error) throw error;
  return data;
}

async function updateUserFallback(id: string, payload: any) {
  const updatePayload: any = {
    name: payload.name,
    username: payload.username,
    role_id: payload.role_id,
    status: payload.status,
    email: payload.email,
    staff_code: payload.staff_code || null,
  };
  if (String(payload.password ?? "").trim()) {
    updatePayload.password = payload.password;
  }
  let { data, error } = await supabase
    .from("user")
    .update(updatePayload)
    .eq("user_id", id)
    .select("*, role:role(*)")
    .single();
  if (error && isMissingStaffCodeColumn(error)) {
    delete updatePayload.staff_code;
    ({ data, error } = await supabase
      .from("user")
      .update(updatePayload)
      .eq("user_id", id)
      .select("*, role:role(*)")
      .single());
  }
  if (error) throw error;
  return data;
}

export const usersApi = {
  list: () => listRows("user", "*, role:role(*)", "created_at"),
  getById: (id: string) => getRowById("user", id, "*, role:role(*)"),
  create: async (payload: any) => {
    const { data, error } = await supabase.rpc("upsert_user", {
      p_actor_user_id: payload.actor_user_id,
      p_name: payload.name,
      p_username: payload.username,
      p_password: payload.password,
      p_role_id: payload.role_id,
      p_status: payload.status,
      p_email: payload.email,
    });
    if (!error) {
      if (payload.staff_code) {
        const { error: patchError } = await supabase
          .from("user")
          .update({ staff_code: payload.staff_code } as any)
          .eq("user_id", String((data as any)?.user_id ?? ""));
        if (patchError && !isMissingStaffCodeColumn(patchError)) throw patchError;
      }
      return data;
    }
    if (!shouldFallbackFromRpc(error)) throw error;
    return createUserFallback(payload);
  },
  update: async (id: string, payload: any) => {
    const { data, error } = await supabase.rpc("upsert_user", {
      p_actor_user_id: payload.actor_user_id,
      p_user_id: id,
      p_name: payload.name,
      p_username: payload.username,
      p_password: payload.password,
      p_role_id: payload.role_id,
      p_status: payload.status,
      p_email: payload.email,
    });
    if (!error) {
      if (payload.staff_code !== undefined) {
        const { error: patchError } = await supabase
          .from("user")
          .update({ staff_code: payload.staff_code || null } as any)
          .eq("user_id", id);
        if (patchError && !isMissingStaffCodeColumn(patchError)) throw patchError;
      }
      return data;
    }
    if (!shouldFallbackFromRpc(error)) throw error;
    return updateUserFallback(id, payload);
  },
  remove: (id: string) => removeRow("user", id),
  patch: (id: string, payload: any) => updateRow("user", id, payload),
};
