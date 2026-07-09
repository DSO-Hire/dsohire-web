import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * The DSO Hire Button (design-excellence program 2a, 2026-07-09).
 *
 * Rebuilt from the stock shadcn button around the HOUSE look — the
 * variants below are the exact CTA recipes the marketing + app surfaces
 * have been hand-rolling (px-7 py-3.5 bg-primary text-sm font-bold, and
 * friends), canonized. Square corners (brand: --radius 0), sentence-case
 * labels, bold weight, heritage focus ring.
 *
 * Variants — color is EARNED (house doctrine):
 *   primary   — navy. The default action everywhere.
 *   heritage  — green. Reserved for fit/match/success/hired-adjacent
 *               actions and THE standout CTA of a surface — not decoration.
 *   inverse   — ivory-on-navy, for buttons sitting on hero/navy panels.
 *   outline   — hairline card button; border warms to heritage on hover.
 *   ghost     — quiet text button for tertiary actions.
 *   destructive — for genuinely destructive confirms only.
 *   link      — inline text-link shape.
 *
 * Sizes: sm (dense app chrome) · md (default app) · lg (page-level CTAs)
 * · xl (marketing heroes) · icon / icon-sm (square icon buttons).
 *
 * `asChild` renders the styles onto a child (e.g. next/link):
 *   <Button asChild variant="heritage" size="lg"><Link href="…">…</Link></Button>
 *
 * Adoption is incremental (732 raw <button>s at program start) —
 * marketing CTAs first, then app surfaces sprint by sprint.
 */

const buttonVariants = cva(
  // Every variant carries a border (transparent on filled ones) so filled
  // and outline buttons sit at IDENTICAL heights side by side — no more
  // py-[13px] optical compensation hacks.
  "inline-flex shrink-0 items-center justify-center gap-2.5 whitespace-nowrap border border-transparent font-bold transition-colors outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary/90",
        heritage:
          "bg-heritage text-primary-foreground hover:bg-heritage-deep",
        inverse: "bg-ivory text-ink hover:bg-ivory-deep",
        outline:
          "border-[var(--rule-strong)] bg-card text-ink hover:border-heritage",
        ghost: "text-slate-body hover:bg-muted hover:text-ink",
        destructive: "bg-danger text-danger-foreground hover:bg-danger/90",
        link: "text-heritage underline-offset-2 hover:underline hover:text-heritage-deep p-0 h-auto font-semibold",
      },
      size: {
        sm: "px-4 py-2 text-xs",
        md: "px-5 py-2.5 text-sm",
        lg: "px-7 py-3.5 text-sm",
        xl: "px-9 py-4 text-sm",
        icon: "size-9 [&_svg:not([class*='size-'])]:size-4",
        "icon-sm": "size-7 [&_svg:not([class*='size-'])]:size-3.5",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
)

function Button({
  className,
  variant = "primary",
  size = "md",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
