import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import "./App.css";
import "./premium-ui.css";

function App() {
  const [text, setText] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState("message");
  const [darkMode, setDarkMode] = useState(false);

  const particles = useMemo(() => {
    const count = 14;
    return Array.from({ length: count }).map((_, i) => {
      const rand = (min, max) => Math.random() * (max - min) + min;
      return {
        s: rand(8, 18) + (i % 3) * 2,
        x: `${rand(8, 92).toFixed(2)}%`,
        y: `${rand(8, 92).toFixed(2)}%`,
        o: rand(0.35, 0.85).toFixed(2),
        d: `${rand(8, 14).toFixed(2)}s`,
        dx: `${rand(-90, 90).toFixed(0)}px`,
        dy: `${rand(-90, 90).toFixed(0)}px`,
        key: i,
      };
    });
  }, []);

  useEffect(() => {
    const dot = document.getElementById("bb-cursorDot");
    const trail = document.getElementById("bb-cursorTrail");
    const dotsWrap = document.getElementById("bb-cursorDots");
    if (!dot || !trail || !dotsWrap) return;

    const dotCount = 10;
    const dotEls = Array.from({ length: dotCount }).map(() => {
      const el = document.createElement("div");
      el.className = "bb-cursor-dot";
      el.setAttribute("aria-hidden", "true");
      dotsWrap.appendChild(el);
      return el;
    });

    let targetX = -999;
    let targetY = -999;
    let currentX = -999;
    let currentY = -999;
    let rafId = 0;
    let hasMoved = false;
    let hoverInteractive = false;
    let hoverCard = false;

    const dotX = new Array(dotCount).fill(-999);
    const dotY = new Array(dotCount).fill(-999);

    const updateActive = () => {
      const shouldActivate = hasMoved && (hoverInteractive || hoverCard);
      document.body.classList.toggle("bb-cursor-active", shouldActivate);
    };

    const onPointerMove = (e) => {
      targetX = e.clientX;
      targetY = e.clientY;
      if (!hasMoved) {
        hasMoved = true;
        updateActive();
      }
    };

    const onPointerLeave = () => {
      hoverInteractive = false;
      hoverCard = false;
      updateActive();
    };

    const tick = () => {
      currentX += (targetX - currentX) * 0.18;
      currentY += (targetY - currentY) * 0.18;

      dot.style.transform = `translate3d(${targetX - 7}px, ${targetY - 7}px, 0)`;
      trail.style.transform = `translate3d(${currentX - 22}px, ${currentY - 22}px, 0)`;

      for (let i = 0; i < dotCount; i += 1) {
        const t = i / (dotCount - 1);
        const follow = 0.2 + (1 - t) * 0.5;
        dotX[i] += (targetX - dotX[i]) * (follow * 0.12);
        dotY[i] += (targetY - dotY[i]) * (follow * 0.12);

        const el = dotEls[i];
        const hue = (t * 320 + performance.now() * 0.06) % 360;
        const size = 8 - t * 4;
        const opacity = 0.65 - t * 0.45;

        el.style.width = `${size}px`;
        el.style.height = `${size}px`;
        el.style.opacity = `${opacity}`;
        el.style.background = `hsla(${hue}, 100%, 62%, 0.95)`;
        el.style.boxShadow = `0 0 12px hsla(${hue}, 100%, 62%, 0.50), 0 0 22px hsla(${hue}, 100%, 62%, 0.22)`;
        el.style.transform = `translate3d(${dotX[i] - size / 2}px, ${dotY[i] - size / 2}px, 0)`;
      }

      rafId = requestAnimationFrame(tick);
    };

    const setHoverActive = (active) => {
      hoverInteractive = active;
      updateActive();
    };

    const interactiveEls = document.querySelectorAll(
      "button, [role='button'], input, textarea, select, [data-cursor='interactive'], .bb-glass, .bb-glow-border, .bb-card-float",
    );
    const onEnter = () => setHoverActive(true);
    const onLeave = () => setHoverActive(false);

    interactiveEls.forEach((el) => {
      el.addEventListener("mouseenter", onEnter);
      el.addEventListener("mouseleave", onLeave);
      el.addEventListener("focusin", onEnter);
      el.addEventListener("focusout", onLeave);
    });

    let onCardEnter = null;
    let onCardLeave = null;
    const cardEl = document.querySelector(".bb-card-float");
    if (cardEl) {
      onCardEnter = () => {
        hoverCard = true;
        updateActive();
      };
      onCardLeave = () => {
        hoverCard = false;
        updateActive();
      };
      cardEl.addEventListener("mouseenter", onCardEnter);
      cardEl.addEventListener("mouseleave", onCardLeave);
    }

    const ripplesWrap = document.createElement("div");
    ripplesWrap.id = "bb-cursorRipples";
    ripplesWrap.setAttribute("aria-hidden", "true");
    document.body.appendChild(ripplesWrap);

    const makeRipple = (x, y) => {
      const ripple = document.createElement("div");
      ripple.className = "bb-cursor-ripple";
      ripple.style.left = `${x}px`;
      ripple.style.top = `${y}px`;
      ripplesWrap.appendChild(ripple);
      window.setTimeout(() => ripple.remove(), 650);
    };

    const onClick = (e) => makeRipple(e.clientX, e.clientY);

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", onPointerLeave, { passive: true });
    document.addEventListener("click", onClick, { passive: true });
    rafId = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);
      document.removeEventListener("click", onClick);
      cancelAnimationFrame(rafId);
      document.body.classList.remove("bb-cursor-active");

      interactiveEls.forEach((el) => {
        el.removeEventListener("mouseenter", onEnter);
        el.removeEventListener("mouseleave", onLeave);
        el.removeEventListener("focusin", onEnter);
        el.removeEventListener("focusout", onLeave);
      });

      if (cardEl && onCardEnter && onCardLeave) {
        cardEl.removeEventListener("mouseenter", onCardEnter);
        cardEl.removeEventListener("mouseleave", onCardLeave);
      }

      dotsWrap.innerHTML = "";
      ripplesWrap.remove();
    };
  }, []);

  const handlePredict = async () => {
    if (!text) return;

    try {
      setLoading(true);
      const res = await axios.post(import.meta.env.VITE_API_URI, {
        text,
        type,
      });

      setResult(res.data.prediction);
    } catch {
      setResult("Error");
    } finally {
      setLoading(false);
    }
  };

  const getColor = () => {
    if (result === "ham") return "text-green-600";
    if (result === "spam") return "text-red-600";
    if (result === "smishing") return "text-orange-500";
    return "text-gray-600";
  };

  const getBg = () => {
    if (result === "ham") return "bg-[#81912F]/25 backdrop-blur-md border border-white/30";
    if (result === "spam") return "bg-red-400/20 backdrop-blur-md border border-white/30";
    if (result === "smishing") return "bg-orange-400/20 backdrop-blur-md border border-white/30";
    return "bg-white/20 backdrop-blur-md border border-white/30";
  };

  return (
    <div
      className={`bb-premium-root min-h-screen flex items-center justify-center px-4 transition-all duration-500 ${
        darkMode ? "bb-dark" : "bb-light"
      }`}
    >
      <div className="bb-premium-bg" aria-hidden="true">
        <div className="bb-premium-bg__gradient" />
        <div className="bb-premium-bg__noise" />
        <div className="bb-premium-bg__particles">
          {particles.map((p) => (
            <div
              key={p.key}
              className="bb-particle"
              style={{
                "--s": `${p.s}px`,
                "--x": p.x,
                "--y": p.y,
                "--o": p.o,
                "--d": p.d,
                "--dx": p.dx,
                "--dy": p.dy,
              }}
            />
          ))}
        </div>
        <div className="bb-premium-bg__vignette" />
      </div>

      <div id="bb-cursorTrail" aria-hidden="true" />
      <div id="bb-cursorDot" aria-hidden="true" />
      <div id="bb-cursorDots" aria-hidden="true" />

      <div className="absolute top-4 right-4 z-10">
        <button
          data-cursor="interactive"
          onClick={() => setDarkMode(!darkMode)}
          className={`bb-btn px-4 py-2 rounded-xl font-semibold transition-all duration-300 ${
            darkMode
              ? "bg-yellow-400 text-black hover:bg-yellow-300"
              : "bg-gray-800 text-white hover:bg-gray-700"
          }`}
        >
          {darkMode ? "Light mode" : "Dark mode"}
        </button>
      </div>

      <div
        className={`bb-glass bb-glow-border w-full max-w-lg rounded-3xl p-6 sm:p-8 text-center transition-all duration-500 bb-card-float z-10 ${
          darkMode ? "text-white" : "text-black"
        }`}
      >
        <div className="max-w-md mx-auto">
          <h1 className={`text-3xl sm:text-4xl font-bold mb-2 ${darkMode ? "text-white" : "text-black"}`}>
            Spam Detector
          </h1>

          <p className={`font-semibold text-sm sm:text-base mb-5 ${darkMode ? "text-gray-200" : "text-gray-700"}`}>
            Analyze messages and emails instantly with the same prediction engine.
          </p>

          <div className="flex mb-4 rounded-xl overflow-hidden bg-transparent">
            <select
              data-cursor="interactive"
              value={type}
              onChange={(e) => setType(e.target.value)}
              className={`bb-field bb-interactive bb-input w-full p-3 rounded-xl border focus:outline-none focus:ring-0 text-sm sm:text-base ${
                darkMode ? "text-white" : "text-black"
              } bb-focus-glow`}
            >
              <option value="message">Message</option>
              <option value="email">Email</option>
            </select>
          </div>

          <textarea
            data-cursor="interactive"
            className={`bb-field bb-input bb-focus-glow w-full p-3 rounded-xl resize-none text-sm sm:text-base transition mt-1 border ${
              darkMode ? "text-white" : "text-black"
            }`}
            rows="4"
            placeholder={type === "message" ? "Type your message..." : "Paste your email content..."}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />

          <button
            data-cursor="interactive"
            onClick={handlePredict}
            className="mt-4 w-full py-3 rounded-xl font-medium bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-cyan-400 text-white bb-btn shadow-lg active:scale-95"
          >
            {loading ? "Analyzing..." : `Analyze ${type}`}
          </button>

          {result && (
            <div className="mt-3 rounded-xl p-2">
              <div
                data-cursor="interactive"
                className={`p-4 rounded-xl font-semibold transition-all duration-300 ${getBg()} ${getColor()} bb-interactive bb-focus-glow`}
              >
                {result === "ham" && "Safe Message"}
                {result === "spam" && "Spam Detected"}
                {result === "smishing" && "Fraud Alert"}
                {result === "Error" && "Something went wrong"}
              </div>
            </div>
          )}

          <button
            data-cursor="interactive"
            onClick={() => {
              setText("");
              setResult("");
              setType("message");
            }}
            className={`mt-3 w-full py-3 rounded-xl font-medium transition-all bb-btn ${
              darkMode ? "bg-white/10 text-white hover:bg-white/15" : "bg-gray-200 text-black hover:bg-gray-300"
            }`}
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
