import React, { useLayoutEffect, useRef, useState } from "react";

// Original responsive HUD linework; native text and hit targets sit above it.
export function CircuitFrame() {
  const ref = useRef(null);
  const [{ w, h }, setSize] = useState({ w: 600, h: 240 });
  useLayoutEffect(() => {
    const host = ref.current.parentElement;
    const measure = () => {
      const w = Math.max(80, host.clientWidth),
        h = Math.max(60, host.clientHeight);
      setSize((previous) =>
        previous.w === w && previous.h === h ? previous : { w, h },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);
  const tab = Math.min(138, w * 0.28),
    lower = w - Math.min(145, w * 0.3);
  return (
    <svg
      ref={ref}
      className="circuit-frame"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        className="circuit-outline"
        d={`M1 18 18 1H${tab}L${tab + 9} 7H${w - 19}L${w - 1} 25V${h - 18}L${w - 18} ${h - 1}H${lower}L${lower - 9} ${h - 7}H18L1 ${h - 24}Z`}
      />
      <path
        className="circuit-inner"
        d={`M7 22 22 7H${tab - 10}M${tab + 15} 13H${w - 24}L${w - 7} 30V${h - 29}M${w - 12} ${h - 18} ${w - 22} ${h - 7}H${lower + 12}M${lower - 15} ${h - 13}H23L7 ${h - 29}V32`}
      />
      <path
        className="circuit-plate"
        d={`M24 1H${tab - 18}L${tab - 12} 7H18ZM${lower + 25} ${h - 7}H${w - 28}L${w - 22} ${h - 1}H${lower + 31}Z`}
      />
      <path
        className="circuit-ticks"
        d={`m${w - 62} 9 5 5m3-5 5 5m3-5 5 5M4 ${h * 0.65}v12m0 4v6M${w - 4} ${h * 0.3}v12m0 4v6`}
      />
    </svg>
  );
}
export function ReactorRings() {
  return (
    <svg
      className="reactor-rings"
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
    >
      <circle className="reactor-track" cx="32" cy="32" r="29" />
      <circle
        className="reactor-segments"
        cx="32"
        cy="32"
        r="29"
        pathLength="100"
      />
      <circle
        className="reactor-inner"
        cx="32"
        cy="32"
        r="24"
        pathLength="100"
      />
      <path className="reactor-notch" d="M27 1h10M63 27v10M27 63h10M1 27v10" />
    </svg>
  );
}

export function ControlFrame() {
  const ref = useRef(null);
  const [{ w, h }, setSize] = useState({ w: 240, h: 80 });
  useLayoutEffect(() => {
    const host = ref.current.parentElement;
    const measure = () => {
      const w = Math.max(40, host.clientWidth),
        h = Math.max(30, host.clientHeight);
      setSize((previous) =>
        previous.w === w && previous.h === h ? previous : { w, h },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);
  return (
    <svg
      ref={ref}
      className="control-frame"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        className="control-edge"
        d={`M1 9 9 1H${w - 9}L${w - 1} 9V${h - 9}L${w - 9} ${h - 1}H1Z`}
      />
      <path
        className="control-led"
        d={`M16 1H${Math.min(w * 0.3, 56)}M${w - 1} 16V${Math.min(h - 16, 38)}M${w - 53} ${h - 1}H${w - 16}`}
      />
    </svg>
  );
}
