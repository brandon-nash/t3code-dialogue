import { resolveDesktopBrand } from "@t3tools/shared/desktopBrand";

export type { DesktopBrand } from "@t3tools/shared/desktopBrand";
export { DESKTOP_BRANDS } from "@t3tools/shared/desktopBrand";

declare const __T3CODE_DESKTOP_BRAND__: string | undefined;

/** Fixed at bundle time from T3CODE_DESKTOP_BRAND; unset outside a bundle. */
export const DESKTOP_BRAND = resolveDesktopBrand(
  typeof __T3CODE_DESKTOP_BRAND__ === "undefined" ? undefined : __T3CODE_DESKTOP_BRAND__,
);
