import { createContext, useContext, useState, useEffect } from "react";

const ThemeContext = createContext(null);

// eslint-disable-next-line react-refresh/only-export-components -- shared constant colocated with its provider
export const THEME_PALETTES = {
  ocean: {
    name: "🌊 Ocean",
    light: "bg-gradient-to-br from-blue-500 via-cyan-400 to-teal-500",
    dark: "bg-gradient-to-br from-blue-900 via-cyan-900 to-teal-900",
    card: "bg-white/20 border-white/20 text-slate-800",
    cardDark: "bg-slate-900/60 border-slate-700/60 text-slate-100",
    accent: "bg-blue-600 hover:bg-blue-700 text-white",
    btnSecondary: "bg-slate-200/50 hover:bg-slate-200 text-slate-800",
    btnSecondaryDark: "bg-slate-800/80 hover:bg-slate-700 text-slate-200",
    input: "bg-white/80 border-slate-200 text-slate-900 focus:ring-blue-500",
    inputDark: "bg-slate-800/90 border-slate-700 text-slate-100 focus:ring-blue-400",
  },
  sunset: {
    name: "🌅 Sunset",
    light: "bg-gradient-to-br from-orange-400 via-pink-400 to-red-500",
    dark: "bg-gradient-to-br from-orange-950 via-pink-950 to-red-950",
    card: "bg-white/20 border-white/20 text-amber-950",
    cardDark: "bg-stone-900/60 border-stone-800 text-stone-100",
    accent: "bg-orange-600 hover:bg-orange-700 text-white",
    btnSecondary: "bg-stone-200/50 hover:bg-stone-200 text-stone-800",
    btnSecondaryDark: "bg-stone-800/80 hover:bg-stone-700 text-stone-200",
    input: "bg-white/80 border-stone-200 text-stone-900 focus:ring-orange-500",
    inputDark: "bg-stone-800/90 border-stone-750 text-stone-105 focus:ring-orange-450",
  },
  forest: {
    name: "🌿 Forest",
    light: "bg-gradient-to-br from-green-400 via-emerald-400 to-teal-500",
    dark: "bg-gradient-to-br from-green-950 via-emerald-950 to-teal-950",
    card: "bg-white/20 border-white/20 text-emerald-950",
    cardDark: "bg-emerald-950/60 border-emerald-900 text-emerald-100",
    accent: "bg-emerald-700 hover:bg-emerald-800 text-white",
    btnSecondary: "bg-emerald-100/50 hover:bg-emerald-100 text-emerald-800",
    btnSecondaryDark: "bg-emerald-900/80 hover:bg-emerald-850 text-emerald-200",
    input: "bg-white/80 border-emerald-200 text-emerald-900 focus:ring-emerald-600",
    inputDark: "bg-emerald-900/90 border-emerald-800 text-emerald-100 focus:ring-emerald-500",
  },
  purple: {
    name: "💜 Purple",
    light: "bg-gradient-to-br from-purple-500 via-violet-400 to-pink-500",
    dark: "bg-gradient-to-br from-purple-950 via-violet-950 to-pink-950",
    card: "bg-white/20 border-white/20 text-indigo-950",
    cardDark: "bg-purple-950/60 border-purple-900 text-purple-100",
    accent: "bg-purple-700 hover:bg-purple-800 text-white",
    btnSecondary: "bg-purple-100/50 hover:bg-purple-100 text-purple-850",
    btnSecondaryDark: "bg-purple-900/80 hover:bg-purple-850 text-purple-200",
    input: "bg-white/80 border-purple-200 text-purple-900 focus:ring-purple-600",
    inputDark: "bg-purple-900/90 border-purple-800 text-purple-100 focus:ring-purple-500",
  },
  mono: {
    name: "🖤 Mono",
    light: "bg-gradient-to-br from-gray-300 via-gray-400 to-gray-500",
    dark: "bg-gradient-to-br from-gray-950 via-gray-900 to-black",
    card: "bg-white/20 border-white/20 text-gray-900",
    cardDark: "bg-neutral-900/60 border-neutral-800 text-neutral-100",
    accent: "bg-zinc-700 hover:bg-zinc-800 text-white",
    btnSecondary: "bg-zinc-200/50 hover:bg-zinc-200 text-zinc-800",
    btnSecondaryDark: "bg-zinc-800/80 hover:bg-zinc-700 text-zinc-200",
    input: "bg-white/80 border-zinc-250 text-zinc-900 focus:ring-zinc-650",
    inputDark: "bg-zinc-800/90 border-zinc-700 text-zinc-100 focus:ring-zinc-500",
  },
};

export const ThemeProvider = ({ children }) => {
  const [themeMode, setThemeMode] = useState(() => {
    return localStorage.getItem("themeMode") || "system";
  });
  const [colorTheme, setColorTheme] = useState(() => {
    return localStorage.getItem("colorTheme") || "ocean";
  });
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    localStorage.setItem("themeMode", themeMode);
    localStorage.setItem("colorTheme", colorTheme);
  }, [themeMode, colorTheme]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    
    const resolveDarkState = () => {
      if (themeMode === "system") {
        setIsDark(mediaQuery.matches);
      } else {
        setIsDark(themeMode === "dark");
      }
    };

    resolveDarkState();

    const listener = () => {
      if (themeMode === "system") {
        setIsDark(mediaQuery.matches);
      }
    };

    mediaQuery.addEventListener("change", listener);
    return () => mediaQuery.removeEventListener("change", listener);
  }, [themeMode]);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [isDark]);

  const activeTheme = THEME_PALETTES[colorTheme] || THEME_PALETTES.ocean;

  return (
    <ThemeContext.Provider
      value={{
        themeMode,
        setThemeMode,
        colorTheme,
        setColorTheme,
        isDark,
        activeTheme,
        THEME_PALETTES,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components -- hook colocated with its provider
export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};
