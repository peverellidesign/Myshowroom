import Link from "next/link";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "subtle";
type Size = "sm" | "md" | "lg" | "icon";

const variants: Record<Variant, string> = {
  primary: "bg-charcoal text-white hover:bg-black disabled:bg-[#B9BCBC]",
  secondary: "border border-line bg-white text-ink hover:border-ink/30",
  ghost: "text-ink hover:bg-selected",
  subtle: "bg-selected text-ink hover:bg-[#E2E3E5]",
  danger: "border border-danger-line bg-white text-danger hover:bg-danger-bg",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-4 text-[13px]",
  md: "h-11 px-6 text-[15px]",
  lg: "h-[52px] px-7 text-base",
  icon: "h-10 w-10",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(
    "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-normal transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 disabled:cursor-not-allowed",
    variants[variant],
    sizes[size],
    className,
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", className, type = "button", ...props },
  ref,
) {
  return <button ref={ref} type={type} className={buttonClass(variant, size, className)} {...props} />;
});

export function LinkButton({
  href,
  children,
  variant = "primary",
  size = "md",
  className,
  target,
  prefetch,
}: {
  href: string;
  children: ReactNode;
  variant?: Variant;
  size?: Size;
  className?: string;
  target?: string;
  prefetch?: boolean;
}) {
  return (
    <Link href={href} target={target} prefetch={prefetch} className={buttonClass(variant, size, className)}>
      {children}
    </Link>
  );
}
