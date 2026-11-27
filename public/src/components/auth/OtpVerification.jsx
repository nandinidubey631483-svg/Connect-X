import React, { useState, useEffect, useRef } from "react";
import apiClient from "../../services/apiClient";
import { v1AuthRoute } from "../../services/apiRoutes";

export default function OtpVerification({
  email,
  initialCooldown = 30,
  onVerified,
  onBack,
}) {
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState("");
  const [lockoutSec, setLockoutSec] = useState(0);
  const [cooldownSec, setCooldownSec] = useState(initialCooldown);
  const [trustDevice, setTrustDevice] = useState(true);
  const [shake, setShake] = useState(false);

  const inputsRef = useRef([]);

  // Auto-focus first input box
  useEffect(() => {
    if (inputsRef.current[0]) {
      inputsRef.current[0].focus();
    }
  }, []);

  // Cooldown & Lockout Countdown Timer
  useEffect(() => {
    const timer = setInterval(() => {
      setCooldownSec((prev) => (prev > 0 ? prev - 1 : 0));
      setLockoutSec((prev) => {
        if (prev <= 1) {
          if (prev === 1) setError("");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const formatTime = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const handleDigitChange = (index, val) => {
    const cleaned = val.replace(/\D/g, "").slice(-1);
    const newDigits = [...digits];
    newDigits[index] = cleaned;
    setDigits(newDigits);
    setError("");
    setShake(false);

    if (cleaned && index < 5 && inputsRef.current[index + 1]) {
      inputsRef.current[index + 1].focus();
    }

    if (newDigits.every((d) => d !== "") && newDigits.join("").length === 6) {
      submitOtp(newDigits.join(""));
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace") {
      if (!digits[index] && index > 0 && inputsRef.current[index - 1]) {
        inputsRef.current[index - 1].focus();
        const newDigits = [...digits];
        newDigits[index - 1] = "";
        setDigits(newDigits);
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      inputsRef.current[index - 1].focus();
    } else if (e.key === "ArrowRight" && index < 5) {
      inputsRef.current[index + 1].focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = (e.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;

    const newDigits = [...digits];
    for (let i = 0; i < 6; i++) {
      newDigits[i] = pasted[i] || "";
    }
    setDigits(newDigits);

    const focusIdx = Math.min(pasted.length, 5);
    if (inputsRef.current[focusIdx]) {
      inputsRef.current[focusIdx].focus();
    }

    if (pasted.length === 6) {
      submitOtp(pasted);
    }
  };

  const submitOtp = async (codeToVerify) => {
    const code = codeToVerify || digits.join("");
    if (code.length < 6 || lockoutSec > 0 || isVerifying) return;

    setIsVerifying(true);
    setError("");

    try {
      const res = await apiClient.post(`${v1AuthRoute}/otp/verify`, {
        email,
        code,
        purpose: "SIGNUP",
      });

      if (res.data && res.data.verified) {
        onVerified(res.data.otpVerificationToken || "otp_tok_ok");
        return;
      }
    } catch (err) {
      setShake(true);
      const resData = err.response?.data;
      if (err.response?.status === 423) {
        const remaining = resData?.error?.details?.remainingSec || 60;
        setLockoutSec(remaining);
        setError(`Too many attempts. Try again in ${formatTime(remaining)}.`);
      } else {
        const msg = resData?.error?.message || "Incorrect code. Please try again.";
        setError(msg);
      }
      setTimeout(() => setShake(false), 500);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResend = async () => {
    if (cooldownSec > 0 || lockoutSec > 0) return;

    setError("");
    try {
      const res = await apiClient.post(`${v1AuthRoute}/otp/send`, {
        email,
        purpose: "SIGNUP",
      });

      if (res.data && res.data.success) {
        setCooldownSec(res.data.cooldown || 30);
      }
    } catch (err) {
      const msg = err.response?.data?.error?.message || "Failed to resend code.";
      setError(msg);
    }
  };

  const isComplete = digits.every((d) => d !== "");

  return (
    <div className="otp-container">
      <button
        type="button"
        className="btn sm2"
        onClick={onBack}
        style={{ marginBottom: "16px", color: "var(--mut)" }}
      >
        ← Back
      </button>

      <h2 className="serif" style={{ fontSize: "28px", letterSpacing: "-0.01em" }}>
        Enter the 6-digit code
      </h2>
      <p className="mut" style={{ marginTop: "6px", fontSize: "13.5px" }}>
        We sent a temporary verification code to{" "}
        <b style={{ color: "var(--ink)" }}>{email}</b>.
      </p>

      <div
        className={`otp ${shake ? "bad" : ""}`}
        style={{
          display: "flex",
          gap: "8px",
          margin: "24px 0 8px",
        }}
        onPaste={handlePaste}
      >
        {digits.map((digit, i) => (
          <input
            key={i}
            ref={(el) => (inputsRef.current[i] = el)}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(e) => handleDigitChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            disabled={isVerifying || lockoutSec > 0}
            style={{
              flex: 1,
              minWidth: 0,
              width: "100%",
              height: "54px",
              textAlign: "center",
              font: "600 22px Inter, system-ui, sans-serif",
              border: shake ? "1px solid var(--bad)" : "1px solid var(--line)",
              borderRadius: "12px",
              background: "var(--surf)",
              transition: "0.15s",
            }}
          />
        ))}
      </div>

      {error && (
        <div className="errt" style={{ textAlign: "center", margin: "6px 0 10px" }}>
          {error}
        </div>
      )}

      <label className="chk" style={{ marginTop: "14px", display: "flex", gap: "9px", alignItems: "flex-start", fontSize: "13px", cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={trustDevice}
          onChange={(e) => setTrustDevice(e.target.checked)}
          style={{ marginTop: "2px", width: "16px", height: "16px", accentColor: "var(--acc)" }}
        />
        <span>
          Trust this device for 30 days
          <br />
          <span className="mut sm">Skip the code next time on this browser.</span>
        </span>
      </label>

      <button
        type="button"
        className="btn p w"
        onClick={() => submitOtp()}
        disabled={!isComplete || lockoutSec > 0 || isVerifying}
        style={{ marginTop: "16px" }}
      >
        {isVerifying ? <span className="spin"></span> : "Verify and continue"}
      </button>

      <p className="sm mut" style={{ textAlign: "center", marginTop: "16px" }}>
        Didn’t get it?{" "}
        <button
          type="button"
          className="lnk"
          onClick={handleResend}
          disabled={cooldownSec > 0 || lockoutSec > 0}
          style={{
            background: "none",
            border: "none",
            color: cooldownSec > 0 || lockoutSec > 0 ? "var(--mut)" : "var(--acc)",
            fontWeight: "500",
            cursor: cooldownSec > 0 || lockoutSec > 0 ? "default" : "pointer",
          }}
        >
          {cooldownSec > 0 ? `Resend in ${formatTime(cooldownSec)}` : "Resend code"}
        </button>
      </p>
    </div>
  );
}
