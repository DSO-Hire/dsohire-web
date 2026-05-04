"use client";

/**
 * JobsStateFilter — client island wrapper for /jobs's state combobox.
 *
 * The /jobs search bar is a plain <form method="get">. We render a hidden
 * <input name="state"> so the selected canonical 2-letter code submits with
 * the rest of the URL params. When the user clears the selection, we drop
 * the `name` attribute so the param doesn't appear in the URL at all
 * (?state= → just absent), keeping shareable URLs clean.
 */

import * as React from "react";
import { StateCombobox } from "@/components/ui/state-combobox";

interface JobsStateFilterProps {
  defaultValue: string | null;
}

export function JobsStateFilter({ defaultValue }: JobsStateFilterProps) {
  const [value, setValue] = React.useState<string | null>(defaultValue);

  return (
    <>
      {value && <input type="hidden" name="state" value={value} />}
      <StateCombobox
        value={value}
        onValueChange={setValue}
        placeholder="Any state"
        className="!border-0 !bg-transparent !px-0 !py-0 !text-[14px] hover:!bg-transparent focus:!ring-0 focus:!border-transparent"
      />
    </>
  );
}
