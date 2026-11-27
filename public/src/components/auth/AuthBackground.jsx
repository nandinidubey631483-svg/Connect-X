import React, { useEffect, useRef } from "react";

export default function AuthBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof canvas.getContext !== "function") return;

    let ctx;
    try {
      ctx = canvas.getContext("2d");
    } catch (_) {
      return;
    }
    if (!ctx) return;

    let animId;
    let width = 0;
    let height = 0;
    const dp = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dp;
      canvas.height = height * dp;
      if (ctx.setTransform) ctx.setTransform(dp, 0, 0, dp, 0, 0);
    };

    window.addEventListener("resize", resize);
    resize();

    // Floating warm ambient particles
    const particleCount = Math.min(Math.floor((width * height) / 30000), 45);
    const particles = [];
    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        r: Math.random() * 2.2 + 0.9,
        vx: (Math.random() - 0.5) * 0.32,
        vy: -Math.random() * 0.42 - 0.12, // gentle upward drift
        alpha: Math.random() * 0.45 + 0.15,
        baseAlpha: Math.random() * 0.45 + 0.15,
        pulseSpeed: Math.random() * 0.02 + 0.01,
        phase: Math.random() * Math.PI * 2,
      });
    }

    // Occasional shooting stardust embers
    const shootingStars = [];
    let nextSpawnTime = performance.now() + 1800;

    const spawnShootingStar = (now) => {
      const angle = (Math.PI / 6) + (Math.random() - 0.5) * 0.3; // diagonal
      const speed = Math.random() * 4 + 4;
      shootingStars.push({
        x: Math.random() * width * 0.7,
        y: Math.random() * height * 0.4,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        len: Math.random() * 45 + 25,
        alpha: 0.7,
        decay: Math.random() * 0.015 + 0.012,
      });
      nextSpawnTime = now + Math.random() * 3500 + 2500;
    };

    let mouse = { x: width * 0.5, y: height * 0.5, active: false };
    const onMouseMove = (e) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      mouse.active = true;
    };
    const onMouseLeave = () => {
      mouse.active = false;
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseleave", onMouseLeave);

    let startTime = performance.now();

    const loop = (now) => {
      const elapsed = (now - startTime) * 0.001;
      ctx.clearRect(0, 0, width, height);

      // Check current theme
      const isDark = document.documentElement.getAttribute("data-theme") === "dark";
      const terracotta = isDark ? "224, 152, 127" : "217, 139, 112";

      // Spawn shooting stars periodically
      if (now > nextSpawnTime) {
        spawnShootingStar(now);
      }

      // Draw and update shooting stars
      for (let s = shootingStars.length - 1; s >= 0; s--) {
        const star = shootingStars[s];
        star.x += star.vx;
        star.y += star.vy;
        star.alpha -= star.decay;

        if (star.alpha <= 0 || star.x > width + 50 || star.y > height + 50) {
          shootingStars.splice(s, 1);
          continue;
        }

        const tailX = star.x - (star.vx / Math.hypot(star.vx, star.vy)) * star.len;
        const tailY = star.y - (star.vy / Math.hypot(star.vx, star.vy)) * star.len;

        const grad = ctx.createLinearGradient(star.x, star.y, tailX, tailY);
        grad.addColorStop(0, `rgba(${terracotta}, ${star.alpha})`);
        grad.addColorStop(1, `rgba(${terracotta}, 0)`);

        ctx.beginPath();
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.4;
        ctx.moveTo(star.x, star.y);
        ctx.lineTo(tailX, tailY);
        ctx.stroke();

        // Small head glow
        ctx.beginPath();
        ctx.arc(star.x, star.y, 1.6, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${terracotta}, ${star.alpha * 1.2})`;
        ctx.fill();
      }

      // Draw subtle connecting strands between nearby particles
      for (let i = 0; i < particles.length; i++) {
        const p1 = particles[i];
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 115) {
            const lineAlpha = (1 - dist / 115) * 0.14 * Math.min(p1.alpha, p2.alpha);
            ctx.beginPath();
            ctx.strokeStyle = `rgba(${terracotta}, ${lineAlpha})`;
            ctx.lineWidth = 0.85;
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
          }
        }

        // Draw interactive strand to cursor if nearby
        if (mouse.active) {
          const cdx = p1.x - mouse.x;
          const cdy = p1.y - mouse.y;
          const cdist = Math.sqrt(cdx * cdx + cdy * cdy);
          if (cdist < 140) {
            const cursorAlpha = (1 - cdist / 140) * 0.28 * p1.alpha;
            ctx.beginPath();
            ctx.strokeStyle = `rgba(${terracotta}, ${cursorAlpha})`;
            ctx.lineWidth = 1;
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(mouse.x, mouse.y);
            ctx.stroke();
          }
        }
      }

      // Draw and update particles
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // Pulse alpha
        p.alpha = p.baseAlpha + Math.sin(elapsed * 2.2 + p.phase) * 0.16;
        p.alpha = Math.max(0.06, Math.min(0.7, p.alpha));

        // Subtle mouse repulsion
        if (mouse.active) {
          const mdx = p.x - mouse.x;
          const mdy = p.y - mouse.y;
          const mdist = Math.sqrt(mdx * mdx + mdy * mdy);
          if (mdist < 150 && mdist > 0) {
            const force = (1 - mdist / 150) * 0.55;
            p.x += (mdx / mdist) * force;
            p.y += (mdy / mdist) * force;
          }
        }

        // Drift
        p.x += p.vx;
        p.y += p.vy;

        // Wrap around
        if (p.x < -10) p.x = width + 10;
        if (p.x > width + 10) p.x = -10;
        if (p.y < -10) p.y = height + 10;
        if (p.y > height + 10) p.y = -10;

        // Draw particle
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${terracotta}, ${p.alpha})`;
        ctx.fill();
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseleave", onMouseLeave);
    };
  }, []);

  return (
    <div className="auth-bg-container" aria-hidden="true">
      {/* Dynamic ambient floating gradient orbs */}
      <div className="auth-orb auth-orb-1" />
      <div className="auth-orb auth-orb-2" />
      <div className="auth-orb auth-orb-3" />
      <div className="auth-orb auth-orb-4" />

      {/* Rotating ambient orbital rings */}
      <div className="auth-ring auth-ring-1" />
      <div className="auth-ring auth-ring-2" />

      {/* Gentle horizontal ambient aurora glow */}
      <div className="auth-aurora auth-aurora-top" />
      <div className="auth-aurora auth-aurora-bottom" />

      {/* Subtle modern geometric dot mesh */}
      <div className="auth-bg-grid" />

      {/* Interactive floating particle constellation canvas */}
      <canvas ref={canvasRef} className="auth-bg-canvas" />
    </div>
  );
}
