import React, { useState, useEffect, useCallback } from "react";
import { FiWifiOff, FiCheckCircle, FiRefreshCw } from "react-icons/fi";
import apiClient from "../../services/apiClient";
import { v1AuthRoute } from "../../services/apiRoutes";

export default function NetworkStatusBanner() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [justReconnected, setJustReconnected] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  const checkConnectivity = useCallback(async () => {
    setIsChecking(true);
    try {
      // Lightweight probe to verify actual server reachability
      await apiClient.get(`${v1AuthRoute}/csrf-token`, { timeout: 4000 });
      setIsOnline(true);
      setJustReconnected(true);
      setTimeout(() => setJustReconnected(false), 3500);
    } catch (_) {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setIsOnline(false);
      }
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setJustReconnected(true);
      const timer = setTimeout(() => {
        setJustReconnected(false);
      }, 3500);
      return () => clearTimeout(timer);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setJustReconnected(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (isOnline && !justReconnected) {
    return null;
  }

  if (justReconnected) {
    return (
      <div
        role="status"
        aria-live="polite"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 9999,
          background: "linear-gradient(135deg, #16A34A 0%, #15803D 100%)",
          color: "#FFFFFF",
          padding: "10px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "10px",
          fontSize: "13px",
          fontWeight: "500",
          boxShadow: "0 2px 10px rgba(22, 163, 74, 0.3)",
          animation: "slideDown 0.25s ease-out",
        }}
      >
        <FiCheckCircle size={16} />
        <span>You are back online! Reconnected to ConnectX.</span>
      </div>
    );
  }

  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: "linear-gradient(135deg, #252321 0%, #1C1A19 100%)",
        color: "#F5F2ED",
        borderBottom: "1px solid rgba(217, 139, 112, 0.4)",
        padding: "10px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px",
        flexWrap: "wrap",
        fontSize: "13px",
        boxShadow: "0 4px 16px rgba(0, 0, 0, 0.25)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <span
          style={{
            display: "grid",
            placeItems: "center",
            width: "28px",
            height: "28px",
            borderRadius: "8px",
            background: "rgba(217, 139, 112, 0.18)",
            color: "var(--acc, #D98B70)",
          }}
        >
          <FiWifiOff size={16} />
        </span>
        <div>
          <strong style={{ color: "#FFFFFF", marginRight: "6px" }}>Offline Mode:</strong>
          <span style={{ color: "rgba(245, 242, 237, 0.85)" }}>
            Unable to reach ConnectX servers. Check your network connection.
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={checkConnectivity}
        disabled={isChecking}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          padding: "6px 14px",
          borderRadius: "8px",
          background: "var(--acc, #D98B70)",
          color: "#FFFFFF",
          border: "none",
          fontWeight: "600",
          fontSize: "12px",
          cursor: isChecking ? "wait" : "pointer",
          transition: "opacity 0.2s ease",
          opacity: isChecking ? 0.7 : 1,
        }}
      >
        <FiRefreshCw
          size={12}
          style={{
            animation: isChecking ? "spin 1s linear infinite" : "none",
          }}
        />
        {isChecking ? "Reconnecting..." : "Retry Connection"}
      </button>
    </div>
  );
}
