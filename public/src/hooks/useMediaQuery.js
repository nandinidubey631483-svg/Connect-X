/**
 * ConnectX Responsive Media Query Hook
 * Detects mobile (<768px), tablet (768px-1024px), and desktop (>1024px) viewports.
 */
import { useState, useEffect } from "react";

export function useMediaQuery() {
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1200
  );

  useEffect(() => {
    function handleResize() {
      setWindowWidth(window.innerWidth);
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return {
    isMobile: windowWidth < 768,
    isTablet: windowWidth >= 768 && windowWidth < 1024,
    isDesktop: windowWidth >= 1024,
    windowWidth,
  };
}

export default useMediaQuery;
