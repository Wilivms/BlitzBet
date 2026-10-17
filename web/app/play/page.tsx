import { redirect } from "next/navigation";

/** Ancien lien du QR code : tout se joue maintenant dans le salon. */
export default function Play() {
  redirect("/");
}
