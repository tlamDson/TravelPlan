export type FilterStatus =
  | "all"
  | "UPCOMING"
  | "IN_TRIP"
  | "COMPLETED"
  | "CANCELLED"
  | "GENERATING"
  | "FAILED";

export type SortOption = "newest" | "oldest" | "az" | "za";

// Each status/lifecycle value's accent, using the tag-* tokens exposed in
// PR #66 -- unifies this switch with the "sort"/"all" branches below,
// which already used a tinted-accent idiom (bg-primary/20 + text-primary)
// instead of the solid-color-with-white-text look the status branches
// used to have. Written out as full literal class strings, not built by
// interpolating a token name -- Tailwind's JIT scanner only picks up
// complete class names it can find verbatim in the source, so a
// template-interpolated `bg-${token}/20` would silently generate no CSS.
const FILTER_ACCENT_CLASSES: Record<Exclude<FilterStatus, "all">, string> = {
  UPCOMING:
    "data-[state=checked]:bg-tag-blue-text/20 data-[state=checked]:text-tag-blue-text focus:bg-tag-blue-text/10",
  IN_TRIP:
    "data-[state=checked]:bg-tag-green-text/20 data-[state=checked]:text-tag-green-text focus:bg-tag-green-text/10",
  COMPLETED:
    "data-[state=checked]:bg-tag-gray-text/20 data-[state=checked]:text-tag-gray-text focus:bg-tag-gray-text/10",
  CANCELLED:
    "data-[state=checked]:bg-tag-red-text/20 data-[state=checked]:text-tag-red-text focus:bg-tag-red-text/10",
  GENERATING:
    "data-[state=checked]:bg-tag-yellow-text/20 data-[state=checked]:text-tag-yellow-text focus:bg-tag-yellow-text/10",
  FAILED:
    "data-[state=checked]:bg-tag-red-text/20 data-[state=checked]:text-tag-red-text focus:bg-tag-red-text/10",
};

export const getStatusColor = (status: FilterStatus | "sort") => {
  const baseClasses =
    "pl-3 [&>span.absolute]:hidden mx-1 my-0.5 font-medium transition-colors";

  if (status === "sort") {
    // For sort options: generic highlight
    return `${baseClasses} data-[state=checked]:bg-primary/20 data-[state=checked]:text-primary focus:bg-accent`;
  }

  if (status === "all") {
    return `${baseClasses} data-[state=checked]:bg-accent data-[state=checked]:text-accent-foreground focus:bg-accent focus:text-accent-foreground`;
  }

  return `${baseClasses} ${FILTER_ACCENT_CLASSES[status]}`;
};
