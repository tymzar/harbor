import { useEffect, type ReactNode } from "react";
import { Toast } from "@heroui/react";
// Inter, bundled with the extension (no network request), as in the SmartWebDS design.
import "@fontsource-variable/inter/wght.css";
import "../../assets/css/index.css";

// Extension pages can't run an inline theme script (MV3 CSP), so follow the OS scheme here.
function useSystemTheme(): void {
  useEffect(() => {
    const query = globalThis.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.classList.toggle("dark", query.matches);
      document.documentElement.dataset.theme = query.matches ? "dark" : "light";
    };

    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);
}

export function PageRoot({ children }: { children: ReactNode }) {
  useSystemTheme();

  return (
    <>
      <Toast.Provider placement="bottom" />
      <div className="min-h-full w-full">{children}</div>
    </>
  );
}
