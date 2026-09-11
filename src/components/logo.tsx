import { cn } from "@/lib/utils";

/** User-selected GPT Image swift, with its generated transparent silhouette. */
export function LogoMark({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn("airo-mark inline-block size-8 shrink-0", className)} />
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span role="img" aria-label="아이로 AIRO" className={cn("airo-logo inline-block shrink-0 align-middle", className)} />
  );
}
