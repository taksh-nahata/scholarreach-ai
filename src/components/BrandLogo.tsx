import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

type BrandLogoProps = {
  href?: string | null;
  className?: string;
  /** Icon only (graduation cap + envelope) */
  markOnly?: boolean;
  /** Wordmark height in px (width scales) */
  height?: number;
  priority?: boolean;
};

/**
 * ScholarReach brand mark / wordmark.
 * Wordmark already includes the name — do not pair with extra "ScholarReach" text.
 */
export function BrandLogo({
  href = "/",
  className,
  markOnly = false,
  height = 32,
  priority = false,
}: BrandLogoProps) {
  const img = markOnly ? (
    <Image
      src="/brand/scholarreach-mark.png"
      alt="ScholarReach"
      width={height}
      height={height}
      className="size-auto"
      style={{ height, width: height }}
      priority={priority}
    />
  ) : (
    <Image
      src="/brand/scholarreach-logo.png"
      alt="ScholarReach"
      width={Math.round(height * (545 / 128))}
      height={height}
      className="h-auto w-auto"
      style={{ height, width: "auto" }}
      priority={priority}
    />
  );

  if (href === null) {
    return <span className={cn("inline-flex items-center", className)}>{img}</span>;
  }

  return (
    <Link
      href={href}
      className={cn("inline-flex items-center transition-opacity hover:opacity-90", className)}
      aria-label="ScholarReach home"
    >
      {img}
    </Link>
  );
}
