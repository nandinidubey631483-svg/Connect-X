import React, { useState } from "react";

export default function CaptchaShield({ onVerify, isVerified = false, disabled = false }) {
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = () => {
    if (disabled || isLoading) return;
    if (isVerified) {
      if (onVerify) {
        onVerify(null);
      }
      return;
    }
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      if (onVerify) {
        onVerify("cap_shield_ok_" + Date.now());
      }
    }, 300);
  };

  return (
    <div style={{ margin: "14px 0" }}>
      <div
        className={`cap ${isVerified ? "ok" : ""}`}
        onClick={handleClick}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && handleClick()}
        tabIndex={0}
        role="checkbox"
        aria-checked={isVerified}
        aria-label="I'm not a robot checkbox"
        title={isVerified ? "Click to uncheck" : "Click to verify you are human"}
        style={{
          border: isVerified ? "1.5px solid #16A34A" : "1.5px solid var(--line, #E2E8F0)",
          background: isVerified ? "rgba(22, 163, 74, 0.04)" : "var(--surf, #FFFFFF)",
          borderRadius: "12px",
          padding: "11px 14px",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          cursor: "pointer",
          transition: "all 0.2s ease",
          userSelect: "none",
          boxShadow: isVerified ? "0 2px 10px rgba(22, 163, 74, 0.12)" : "0 1px 3px rgba(0, 0, 0, 0.04)",
        }}
      >
        <div
          className="cb2"
          style={{
            width: "24px",
            height: "24px",
            border: isVerified ? "2px solid #16A34A" : "2px solid var(--mut, #7A756F)",
            borderRadius: "6px",
            display: "grid",
            placeItems: "center",
            flex: "none",
            background: isVerified ? "#16A34A" : "var(--surf, #FFFFFF)",
            color: "#FFFFFF",
            transition: "all 0.18s ease",
            boxShadow: isVerified ? "0 2px 8px rgba(22, 163, 74, 0.35)" : "none",
          }}
        >
          {isVerified ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m5 12.5 4.5 4.5L19 7.5" />
            </svg>
          ) : isLoading ? (
            <span className="spin" style={{ width: "13px", height: "13px", borderWidth: "2px" }}></span>
          ) : null}
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontWeight: "600", color: isVerified ? "#15803D" : "var(--ink, #252321)", fontSize: "13.5px" }}>
            I’m not a robot
          </span>
          <span style={{ fontSize: "10.5px", color: isVerified ? "#16A34A" : "var(--mut, #7A756F)", marginTop: "1px" }}>
            {isVerified ? "✓ Verification complete" : "Click to verify you're human"}
          </span>
        </div>
        <small style={{ marginLeft: "auto", textAlign: "right", fontSize: "10px", color: "var(--mut, #7A756F)", lineHeight: "1.3" }}>
          Protected by
          <br />
          <b style={{ color: "var(--ink, #252321)" }}>ConnectX Shield</b>
        </small>
      </div>
    </div>
  );
}
