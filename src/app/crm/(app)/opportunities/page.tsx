import { redirect } from "next/navigation";

/* The opportunity list is the pipeline's table view. */
export default function OpportunitiesIndex() {
  redirect("/crm/pipeline?view=table");
}
