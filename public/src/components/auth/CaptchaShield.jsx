import React, { useState } from "react";

export default function CaptchaShield({ onVerify, isVerified = false, disabled = false, onDisabledClick }) {
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = () => {
    if (isVerified || isLoading) return;
    if (disabled) {
      if (onDisabledClick) {
        onDisabledClick();
      }
      return;
    }
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      if (onVerify) {
        onVerify("cap_shield_ok_" + Date.now());
      }
    }, 350);
  };

  return (
    <div style={{ margin: "14px 0" }}>
      <div
        className={`cap ${isVerified ? "ok" : ""} ${disabled ? "disabled" : ""}`}
        onClick={handleClick}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && handleClick()}
        tabIndex={isVerified ? -1 : 0}
        role="checkbox"
        aria-checked={isVerified}
        aria-disabled={disabled}
        aria-label="I'm not a robot checkbox"
        title={disabled ? "Please fill in the required fields above first" : isVerified ? "Verified Human" : "Click to verify you are human"}
        style={{
          border: isVerified ? "1px solid #16A34A" : "1px solid var(--line)",
          background: isVerified ? "rgba(22, 163, 74, 0.04)" : "var(--surf)",
          borderRadius: "12px",
          padding: "11px 12px",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          cursor: disabled ? "not-allowed" : isVerified ? "default" : "pointer",
          opacity: disabled ? 0.62 : 1,
          transition: "all 0.2s ease",
          userSelect: "none",
        }}
      >
        <div
          className="cb2"
          style={{
            width: "24px",
            height: "24px",
            border: isVerified ? "2px solid #16A34A" : disabled ? "2px solid var(--line)" : "2px solid var(--mut)",
            borderRadius: "7px",
            display: "grid",
            placeItems: "center",
            flex: "none",
            background: isVerified ? "#16A34A" : disabled ? "var(--bg)" : "transparent",
            color: "#fff",
            transition: "all 0.2s ease",
          }}
        >
          {isVerified ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="m5 12.5 4.5 4.5L19 7.5" />
            </svg>
          ) : isLoading ? (
            <span className="spin" style={{ width: "14px", height: "14px", borderWidth: "2px" }}></span>
          ) : null}
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontWeight: "500", color: isVerified ? "#15803D" : disabled ? "var(--mut)" : "var(--ink)", fontSize: "13.5px" }}>
            {isVerified ? "✓ Verified Human" : "I’m not a robot"}
          </span>
          {disabled && !isVerified && (
            <span style={{ fontSize: "10.5px", color: "var(--mut)", marginTop: "1px" }}>
              Fill in the fields above first
            </span>
          )}
        </div>
        <small style={{ marginLeft: "auto", textAlign: "right", fontSize: "10px", color: "var(--mut)", lineHeight: "1.3" }}>
          Protected by
          <br />
          <b style={{ color: "var(--ink)" }}>ConnectX Shield</b>
        </small>
      </div>
    </div>
  );
}
