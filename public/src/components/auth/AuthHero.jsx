import React, { useEffect, useRef } from "react";
import LogoImg from "../../assets/connectx-logo.png";

export default function AuthHero() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof canvas.getContext !== "function") return;

    const parent = canvas.parentNode;
    if (!parent) return;

    let ctx;
    try {
      ctx = canvas.getContext("2d");
    } catch (_) {
      return;
    }
    if (!ctx) return;

    const dp = Math.min(window.devicePixelRatio || 1, 2);
    let animId;
    let ro;
    let width = 0;
    let height = 0;

    // Ambient floating glow orbs
    const orbs = [
      { x: 0.25, y: 0.22, r: 260, rBase: 260, color: "rgba(79, 70, 229, ", maxAlpha: 0.35, speedX: 0.0007, speedY: 0.0009, phase: 0 },
      { x: 0.78, y: 0.32, r: 280, rBase: 280, color: "rgba(124, 58, 237, ", maxAlpha: 0.28, speedX: -0.0008, speedY: 0.0006, phase: 2.1 },
      { x: 0.35, y: 0.72, r: 310, rBase: 310, color: "rgba(255, 106, 61, ", maxAlpha: 0.18, speedX: 0.0006, speedY: -0.0007, phase: 4.3 },
      { x: 0.82, y: 0.78, r: 240, rBase: 240, color: "rgba(6, 182, 212, ", maxAlpha: 0.22, speedX: -0.0005, speedY: -0.0008, phase: 1.5 },
    ];

    // Subtle ambient starlight dust (clean floating particles, no spiderweb lines!)
    let stars = [];

    const fit = () => {
      width = parent.clientWidth || 400;
      height = parent.clientHeight || 600;
      canvas.width = width * dp;
      canvas.height = height * dp;
      if (ctx.setTransform) ctx.setTransform(dp, 0, 0, dp, 0, 0);

      const count = Math.min(36, Math.max(16, Math.round((width * height) / 18000)));
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        r: Math.random() * 1.4 + 0.6,
        alpha: Math.random() * 0.4 + 0.15,
        baseAlpha: Math.random() * 0.4 + 0.15,
        speed: Math.random() * 0.002 + 0.001,
        phase: Math.random() * Math.PI * 2,
        vy: -(Math.random() * 0.18 + 0.05),
      }));
    };

    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(fit);
      ro.observe(parent);
    }
    fit();

    let targetMouse = { x: width * 0.5, y: height * 0.4 };
    let currentMouse = { x: width * 0.5, y: height * 0.4 };

    const handleMouseMove = (e) => {
      const rect = parent.getBoundingClientRect();
      targetMouse.x = e.clientX - rect.left;
      targetMouse.y = e.clientY - rect.top;
    };

    const handleMouseLeave = () => {
      targetMouse.x = width * 0.5;
      targetMouse.y = height * 0.4;
    };

    parent.addEventListener("mousemove", handleMouseMove);
    parent.addEventListener("mouseleave", handleMouseLeave);

    let startTime = performance.now();

    const loop = (now) => {
      const t = (now - startTime) * 0.001;
      ctx.clearRect(0, 0, width, height);

      // Smooth mouse easing
      currentMouse.x += (targetMouse.x - currentMouse.x) * 0.03;
      currentMouse.y += (targetMouse.y - currentMouse.y) * 0.03;

      // 1. Draw glowing ambient aurora orbs
      for (const orb of orbs) {
        // Organic sinusoidal floating drift
        const driftX = Math.sin(t * 0.6 + orb.phase) * (width * 0.08);
        const driftY = Math.cos(t * 0.5 + orb.phase) * (height * 0.08);
        
        // Gentle lean toward mouse
        const mouseLeanX = (currentMouse.x - width * 0.5) * 0.06;
        const mouseLeanY = (currentMouse.y - height * 0.5) * 0.06;

        const cx = orb.x * width + driftX + mouseLeanX;
        const cy = orb.y * height + driftY + mouseLeanY;
        const r = orb.rBase * (width / 500);

        try {
          const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
          grad.addColorStop(0, `${orb.color}${orb.maxAlpha})`);
          grad.addColorStop(0.5, `${orb.color}${orb.maxAlpha * 0.35})`);
          grad.addColorStop(1, `${orb.color}0)`);

          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fill();
        } catch (_) {}
      }

      // 2. Draw soft ambient starlight dust particles
      for (const star of stars) {
        star.y += star.vy;
        if (star.y < 0) {
          star.y = height;
          star.x = Math.random() * width;
        }

        const pulse = Math.sin(t * 2 + star.phase);
        const a = Math.max(0.08, star.baseAlpha + pulse * 0.15);

        ctx.fillStyle = `rgba(255, 255, 255, ${a})`;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
        ctx.fill();
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animId);
      if (ro) ro.disconnect();
      parent.removeEventListener("mousemove", handleMouseMove);
      parent.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, []);

  return (
    <div className="hero">
      {/* Ambient background canvas */}
      <canvas ref={canvasRef} className="net" />

      {/* Brand Header */}
      <div className="brand">
        <img src={LogoImg} alt="ConnectX" className="lg2" style={{ height: "36px", width: "auto" }} />
        <span className="wm" style={{ fontSize: "22px", fontWeight: "700", letterSpacing: "-0.03em" }}>
          Connect<i>X</i>
        </span>
      </div>

      {/* Hero Headline & Social Proof */}
      <div>
        <h1 className="serif">
          The messenger for teams that <em>move fast.</em>
        </h1>
        <p>High-signal chats, verified devices, media sharing, and real-time receipts. Clean by design.</p>
        <div className="pres">
          <span className="live"></span>
          <span><b>1,248</b> people online now</span>
        </div>
      </div>

      {/* Modern Upright Glassmorphic Showcase Card */}
      <div className="stage">
        {/* Header */}
        <div className="sh">
          <div className="av">
            <span>AM</span>
          </div>
          <div style={{ lineHeight: 1.25 }}>
            <b style={{ color: "#fff", fontSize: "13.5px" }}>Aarav Mehta</b>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "2px" }}>
              <span className="live" style={{ width: "6px", height: "6px" }}></span>
              <span className="sm mut" style={{ color: "#9CA3AF" }}>Product Lead</span>
            </div>
          </div>
          <div className="stage-badge">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span>256-bit Encrypted</span>
          </div>
        </div>

        {/* Incoming Bubble */}
        <div className="b">
          Hey team! Dropping the final ConnectX design tokens & mocks here 🎨
        </div>

        {/* Attachment Card */}
        <div className="b-file">
          <div style={{ width: "30px", height: "30px", borderRadius: "8px", background: "rgba(79,70,229,0.22)", color: "#A5B4FC", display: "grid", placeItems: "center", flexShrink: 0 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "12px", fontWeight: "600", color: "#F3F4F6", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              ConnectX_v2_Tokens.fig
            </div>
            <div style={{ fontSize: "10.5px", color: "#9CA3AF" }}>4.2 MB • Verified safe</div>
          </div>
          <div style={{ fontSize: "11px", color: "#8F88FF", fontWeight: "500", background: "rgba(143,136,255,0.12)", padding: "2px 7px", borderRadius: "6px" }}>
            Ready
          </div>
        </div>

        {/* Outgoing Bubble */}
        <div className="b me" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span>Looks crisp! Real-time receipts & sync feel instant ⚡</span>
          <span style={{ fontSize: "11px", color: "#C7D2FE", display: "inline-flex", alignItems: "center" }} title="Read">
            ✓✓
          </span>
        </div>

        {/* Micro-metrics Footer */}
        <div className="stage-foot">
          <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <span style={{ color: "#F59E0B" }}>⚡</span> 12ms latency
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <span style={{ color: "#3B82F6" }}>🛡️</span> Multi-device
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <span style={{ color: "#10B981" }}>✓✓</span> Instant receipts
          </span>
        </div>
      </div>

      {/* Feature Chips */}
      <div className="chips">
        <span>End-to-end encrypted</span>
        <span>Zero spam</span>
        <span>Multi-device sync</span>
        <span>Read receipts</span>
      </div>
    </div>
  );
}
