import { notFound } from "next/navigation";

/* Any /crm/* address no other route claims renders the CRM's own
   not-found inside the shell, instead of the public-site 404. Static
   routes (login, mfa, room, search, every page) still win. */
export default function MissingCrmPage() {
  notFound();
}
