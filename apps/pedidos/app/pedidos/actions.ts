"use server";

import { redirect } from "next/navigation";
import { getCurrentUser, requireUserId } from "@/lib/auth/session";
import { repeatLastOrder } from "@/services/orders";

export async function repetirUltimoPedido() {
  const user = await getCurrentUser();
  const userId = await requireUserId();
  if (!user?.sellerId) throw new Error("Este usuario no tiene un vendedor vinculado.");

  const draft = await repeatLastOrder(user.sellerId, userId);
  redirect(`/pedidos/${draft.id}`);
}
