import React, { useState, useRef, useCallback } from "react";
import apiClient from "../../services/apiClient";
import { v1AuthRoute } from "../../services/apiRoutes";

export default function CaptchaShield({ onVerify, isVerified = false, disabled = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [captchaId, setCaptchaId] = useState("");
  const [captchaCode, setCaptchaCode] = useState("");
  const [inputCode, setInputCode] = useState("");
  const [error, setError] = useState("");
  const canvasRef = useRef(null);

  const drawChallenge = useCallback((text) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = (canvas.width = 340);
    const h = (canvas.height = 70);
    const rnd = Math.random;

    ctx.clearRect(0, 0, w, h);

    // Background noise lines
    for (let i = 0; i < 7; i++) {
      ctx.strokeStyle = `hsla(${rnd() * 360}, 60%, 55%, 0.45)`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(rnd() * w, rnd() * h);
      ctx.bezierCurveTo(rnd() * w, rnd() * h, rnd() * w, rnd() * h, rnd() * w, rnd() * h);
      ctx.stroke();
    }

    // Characters with distortion & rotation
    const chars = [...text];
    chars.forEach((ch, i) => {
      ctx.save();
      ctx.translate(36 + i * 56, 44 + (rnd() - 0.5) * 8);
      ctx.rotate((rnd() - 0.5) * 0.5);
      ctx.font = "700 32px 'Inter Tight', Inter, sans-serif";
      ctx.fillStyle = "#1E293B";
      ctx.fillText(ch, 0, 0);
      ctx.restore();
    });

    // Random noise dots
    for (let i = 0; i < 50; i++) {
      ctx.fillStyle = "rgba(100, 116, 139, 0.4)";
      ctx.fillRect(rnd() * w, rnd() * h, 2, 2);
    }
  }, []);

  const fetchNewChallenge = useCallback(async () => {
    setIsLoading(true);
    setError("");
    setInputCode("");

    try {
      const res = await apiClient.post(`${v1AuthRoute}/captcha/generate`);
      if (res.data && res.data.captchaId) {
        setCaptchaId(res.data.captchaId);
        const code = res.data.code || "A7B9X";
        setCaptchaCode(code);
        setTimeout(() => drawChallenge(code), 50);
      }
    } catch (_) {
      // Fallback local challenge
      const fallbackChars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
      let code = "";
      for (let i = 0; i < 5; i++) {
        code += fallbackChars[Math.floor(Math.random() * fallbackChars.length)];
      }
      setCaptchaId(`cpt_local_${Date.now()}`);
      setCaptchaCode(code);
      setTimeout(() => drawChallenge(code), 50);
    } finally {
      setIsLoading(false);
    }
  }, [drawChallenge]);

  const handleOpen = () => {
    if (isVerified || disabled) return;
    if (!isOpen) {
      setIsOpen(true);
      fetchNewChallenge();
    }
  };

  const handleVerify = async (e) => {
    if (e) e.preventDefault();
    if (!inputCode.trim()) {
      setError("Please type the characters shown above.");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      if (captchaId && !captchaId.startsWith("cpt_local_")) {
        const res = await apiClient.post(`${v1AuthRoute}/captcha/verify`, {
          captchaId,
          solution: inputCode.trim(),
        });
        if (res.data && res.data.success) {
          setIsOpen(false);
          onVerify(res.data.verifiedToken || "cap_ok");
          return;
        }
      }

      // Local fallback verification
      if (inputCode.trim().toUpperCase() === captchaCode.toUpperCase()) {
        setIsOpen(false);
        onVerify("cap_ok_local");
      } else {
        setError("Characters do not match. Please try again.");
        fetchNewChallenge();
      }
    } catch (err) {
      setError(err.response?.data?.error?.message || "Verification failed. Try a new challenge.");
      fetchNewChallenge();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ margin: "14px 0" }}>
      <div
        className={`cap ${isVerified ? "ok" : ""}`}
        onClick={handleOpen}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && handleOpen()}
        tabIndex={isVerified ? -1 : 0}
        role="button"
        aria-label="I'm not a robot checkbox"
        style={{
          border: isVerified ? "1px solid #16A34A" : "1px solid var(--line)",
          background: "var(--surf)",
          borderRadius: "12px",
          padding: "11px 12px",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          cursor: isVerified ? "default" : "pointer",
          transition: "0.15s",
        }}
      >
        <div
          className="cb2"
          style={{
            width: "24px",
            height: "24px",
            border: isVerified ? "2px solid #16A34A" : "2px solid var(--mut)",
            borderRadius: "7px",
            display: "grid",
            placeItems: "center",
            flex: "none",
            background: isVerified ? "#16A34A" : "transparent",
            color: "#fff",
            transition: "0.2s",
          }}
        >
          {isVerified ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="m5 12.5 4.5 4.5L19 7.5" />
            </svg>
          ) : isLoading && !isOpen ? (
            <span className="spin"></span>
          ) : null}
        </div>
        <span style={{ fontWeight: "500", color: "var(--ink)", fontSize: "13.5px" }}>
          I’m not a robot
        </span>
        <small style={{ marginLeft: "auto", textAlign: "right", fontSize: "10px", color: "var(--mut)", lineHeight: "1.3" }}>
          Protected by
          <br />
          <b style={{ color: "var(--ink)" }}>ConnectX Shield</b>
        </small>
      </div>

      {isOpen && !isVerified && (
        <div
          className="chal"
          style={{
            border: "1px solid var(--line)",
            borderRadius: "12px",
            padding: "12px",
            marginTop: "6px",
            background: "var(--surf)",
            animation: "rise 0.2s ease",
          }}
        >
          <canvas
            ref={canvasRef}
            role="img"
            aria-label="Captcha security challenge"
            style={{ width: "100%", height: "70px", borderRadius: "8px", background: "var(--bg)", display: "block" }}
          />

          <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
            <input
              className="in"
              type="text"
              placeholder="Type the characters"
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && handleVerify(e)}
              autoFocus
              maxLength={6}
              style={{ height: "40px", flex: 1, letterSpacing: "0.1em", fontWeight: "600" }}
            />
            <button
              type="button"
              className="btn"
              onClick={fetchNewChallenge}
              disabled={isLoading}
              title="New Challenge"
              style={{ padding: "0 12px" }}
            >
              ↻
            </button>
            <button
              type="button"
              className="btn p"
              onClick={handleVerify}
              disabled={isLoading || !inputCode.trim()}
            >
              {isLoading ? <span className="spin"></span> : "Verify"}
            </button>
          </div>

          {error && <div className="errt" style={{ marginTop: "8px" }}>{error}</div>}
        </div>
      )}
    </div>
  );
}
