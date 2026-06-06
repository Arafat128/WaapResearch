"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const MESSAGES = [
  "hi, you are the best",
  "peekaboo, wallet hero",
  "you got this",
  "safe clicks only",
  "dream route found",
  "cute wallet energy",
  "test tiny, then fly",
  "I am watching the gas",
  "tiny guardian mode",
  "fresh quote sparkle",
  "mainnet needs respect",
  "your dashboard is glowing"
];

type PetPose = "idle" | "walk" | "happy" | "peek-left" | "peek-right" | "hang-top" | "sit-edge";

type PetAction = {
  pose: PetPose;
  x: number;
  y: number;
  duration: number;
  showMessage?: boolean;
};

type Point = {
  x: number;
  y: number;
};

type BubbleState = {
  vertical: "top" | "bottom";
  align: "left" | "center" | "right";
};

const PET_SIZE = { width: 132, height: 166 };
const PET_EDGE_PAD = 12;
const PET_LERP = 0.085;
const IDLE_ACTION_MS = 6200;
const HIDDEN_STORAGE_KEY = "waap-pet-hidden";

export function PixelPet() {
  const petRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<Point>({ x: 120, y: 420 });
  const targetRef = useRef<Point>({ x: 120, y: 420 });
  const animationRef = useRef<number | undefined>(undefined);
  const idleActionRef = useRef<number | undefined>(undefined);
  const poseResetRef = useRef<number | undefined>(undefined);
  const bubbleResetRef = useRef<number | undefined>(undefined);
  const bubbleStateRef = useRef<BubbleState>({ vertical: "top", align: "center" });
  const [messageIndex, setMessageIndex] = useState(0);
  const [messageVisible, setMessageVisible] = useState(true);
  const [pose, setPose] = useState<PetPose>("idle");
  const [facingLeft, setFacingLeft] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [playful, setPlayful] = useState(false);
  const [bubbleState, setBubbleState] = useState<BubbleState>({ vertical: "top", align: "center" });

  const message = useMemo(() => MESSAGES[messageIndex % MESSAGES.length], [messageIndex]);

  const persistHidden = useCallback((value: boolean) => {
    setHidden(value);
    try {
      window.localStorage.setItem(HIDDEN_STORAGE_KEY, value ? "1" : "0");
    } catch {
      // localStorage may be unavailable (private mode); state still updates in-memory.
    }
  }, []);

  const writePetTransform = useCallback((point: Point) => {
    if (!petRef.current) return;
    petRef.current.style.transform = `translate3d(${point.x}px, ${point.y}px, 0)`;
    const viewport = getViewport();
    const nextBubbleState: BubbleState = {
      vertical: point.y < 180 ? "bottom" : "top",
      align: point.x < 150 ? "left" : point.x > viewport.width - PET_SIZE.width - 150 ? "right" : "center"
    };
    const current = bubbleStateRef.current;
    if (current.vertical !== nextBubbleState.vertical || current.align !== nextBubbleState.align) {
      bubbleStateRef.current = nextBubbleState;
      setBubbleState(nextBubbleState);
    }
  }, []);

  const runAction = useCallback((action: PetAction) => {
    window.clearTimeout(poseResetRef.current);
    window.clearTimeout(bubbleResetRef.current);
    setPose(action.pose);
    setFacingLeft(action.x < targetRef.current.x || action.pose === "peek-right");
    targetRef.current = clampPoint({ x: action.x, y: action.y });

    if (action.showMessage) {
      setMessageIndex((value) => value + 1);
      setMessageVisible(true);
      bubbleResetRef.current = window.setTimeout(() => setMessageVisible(false), 5200);
    }

    poseResetRef.current = window.setTimeout(() => setPose("idle"), action.duration);
  }, []);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(HIDDEN_STORAGE_KEY) === "1") {
        setHidden(true);
      }
    } catch {
      // ignore
    }

    const start = clampPoint({
      x: Math.round(window.innerWidth * 0.14),
      y: Math.round(window.innerHeight * 0.68)
    });
    currentRef.current = start;
    targetRef.current = start;
    writePetTransform(start);

    const animate = () => {
      const current = currentRef.current;
      const target = targetRef.current;
      const next = {
        x: current.x + (target.x - current.x) * PET_LERP,
        y: current.y + (target.y - current.y) * PET_LERP
      };
      currentRef.current = next;
      writePetTransform(next);
      animationRef.current = window.requestAnimationFrame(animate);
    };

    const performIdleAction = () => {
      runAction(chooseAction());
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        setHidden((value) => {
          const next = !value;
          try {
            window.localStorage.setItem(HIDDEN_STORAGE_KEY, next ? "1" : "0");
          } catch {
            // ignore
          }
          return next;
        });
      }
    };

    animationRef.current = window.requestAnimationFrame(animate);
    idleActionRef.current = window.setInterval(performIdleAction, IDLE_ACTION_MS);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      if (animationRef.current) window.cancelAnimationFrame(animationRef.current);
      window.clearInterval(idleActionRef.current);
      window.clearTimeout(poseResetRef.current);
      window.clearTimeout(bubbleResetRef.current);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [runAction, writePetTransform]);

  function play() {
    window.clearTimeout(poseResetRef.current);
    setPose("happy");
    setPlayful(true);
    setMessageIndex((value) => value + 1);
    setMessageVisible(true);
    targetRef.current = clampPoint({
      x: targetRef.current.x + randomBetween(-70, 70),
      y: targetRef.current.y + randomBetween(-55, 45)
    });
    poseResetRef.current = window.setTimeout(() => setPose("idle"), 1800);
    window.setTimeout(() => setPlayful(false), 700);
  }

  return (
    <>
      {hidden && (
        <button
          type="button"
          className="pixel-pet-summon"
          onClick={() => persistHidden(false)}
          aria-label="Show pixel companion"
        >
          <span aria-hidden="true">✦</span>
        </button>
      )}
      <div
        ref={petRef}
        className={cn("pixel-pet", hidden && "pixel-pet-hidden", playful && "pixel-pet-playful")}
        onClick={play}
        onMouseEnter={() => {
          setPose("happy");
          setMessageVisible(true);
        }}
        onMouseLeave={() => setPose("idle")}
        role="button"
        tabIndex={hidden ? -1 : 0}
        aria-label="Pixel companion. Press Control P to hide or show."
        aria-hidden={hidden}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") play();
        }}
      >
        <button
          type="button"
          className="pixel-pet-close"
          onClick={(event) => {
            event.stopPropagation();
            persistHidden(true);
          }}
          onKeyDown={(event) => event.stopPropagation()}
          aria-label="Hide pixel companion"
          tabIndex={hidden ? -1 : 0}
        >
          <span aria-hidden="true">×</span>
        </button>
        <div
          className={cn(
            "pixel-pet-bubble",
            `pixel-pet-bubble-${bubbleState.vertical}`,
            `pixel-pet-bubble-${bubbleState.align}`,
            messageVisible && "pixel-pet-bubble-visible"
          )}
        >
          {message}
        </div>
        <div className={cn("pixel-pet-sprite", `pixel-pet-${pose}`, facingLeft && "pixel-pet-left")}>
          <div className="pixel-pet-sparkles" />
          <svg className="pixel-pet-art" viewBox="0 0 80 118" aria-hidden="true" shapeRendering="crispEdges">
            <g className="pixel-pet-art-halo">
              <rect x="17" y="7" width="46" height="1" fill="#ffffff" opacity="0.85" />
              <rect x="17" y="8" width="46" height="1" fill="#cffcff" opacity="0.55" />
              <rect x="15" y="6" width="2" height="2" fill="#ffffff" opacity="0.7" />
              <rect x="63" y="6" width="2" height="2" fill="#ffffff" opacity="0.7" />

              <rect x="18" y="3" width="4" height="4" fill="#ff9fe9" />
              <rect x="19" y="2" width="2" height="1" fill="#ffd0f4" />
              <rect x="18" y="6" width="4" height="1" fill="#d77fc4" />

              <rect x="23" y="2" width="4" height="5" fill="#76f7ff" />
              <rect x="24" y="1" width="2" height="1" fill="#cffcff" />
              <rect x="23" y="6" width="4" height="1" fill="#4ac7d8" />

              <rect x="28" y="1" width="5" height="6" fill="#fff2a5" />
              <rect x="29" y="0" width="3" height="1" fill="#ffffff" />
              <rect x="28" y="6" width="5" height="1" fill="#d9c46b" />

              <rect x="34" y="2" width="4" height="5" fill="#ffffff" />
              <rect x="35" y="1" width="2" height="1" fill="#ffffff" />
              <rect x="34" y="6" width="4" height="1" fill="#b8c8d0" />

              <rect x="39" y="2" width="5" height="5" fill="#a3ffd6" />
              <rect x="40" y="1" width="3" height="1" fill="#dafff0" />
              <rect x="39" y="6" width="5" height="1" fill="#6dceaa" />

              <rect x="45" y="1" width="5" height="6" fill="#c2a4ff" />
              <rect x="46" y="0" width="3" height="1" fill="#e9d8ff" />
              <rect x="45" y="6" width="5" height="1" fill="#8c70cf" />

              <rect x="51" y="2" width="4" height="5" fill="#76f7ff" />
              <rect x="52" y="1" width="2" height="1" fill="#cffcff" />
              <rect x="51" y="6" width="4" height="1" fill="#4ac7d8" />

              <rect x="56" y="3" width="4" height="4" fill="#ff9fe9" />
              <rect x="57" y="2" width="2" height="1" fill="#ffd0f4" />
              <rect x="56" y="6" width="4" height="1" fill="#d77fc4" />
            </g>

            <g className="pixel-pet-art-leg pixel-pet-art-leg-left">
              <rect x="30" y="95" width="8" height="14" fill="#1a1325" />
              <rect x="31" y="96" width="6" height="12" fill="#3a2d52" />
              <rect x="32" y="97" width="3" height="10" fill="#5c4a7a" />
              <rect x="29" y="108" width="11" height="4" fill="#0a0712" />
              <rect x="30" y="107" width="9" height="2" fill="#352746" />
            </g>
            <g className="pixel-pet-art-leg pixel-pet-art-leg-right">
              <rect x="42" y="95" width="8" height="14" fill="#1a1325" />
              <rect x="43" y="96" width="6" height="12" fill="#3a2d52" />
              <rect x="44" y="97" width="3" height="10" fill="#5c4a7a" />
              <rect x="41" y="108" width="11" height="4" fill="#0a0712" />
              <rect x="42" y="107" width="9" height="2" fill="#352746" />
            </g>

            <g className="pixel-pet-art-body">
              <rect x="29" y="64" width="22" height="3" fill="#1a1325" />
              <rect x="26" y="67" width="28" height="3" fill="#1a1325" />
              <rect x="23" y="70" width="34" height="4" fill="#1a1325" />
              <rect x="21" y="74" width="38" height="6" fill="#1a1325" />
              <rect x="20" y="80" width="40" height="22" fill="#1a1325" />
              <rect x="22" y="102" width="36" height="3" fill="#1a1325" />

              <rect x="30" y="65" width="20" height="3" fill="#fbfff6" />
              <rect x="27" y="68" width="26" height="3" fill="#f7fbf6" />
              <rect x="24" y="71" width="32" height="4" fill="#f0f6ef" />
              <rect x="22" y="75" width="36" height="6" fill="#eaf3e9" />
              <rect x="21" y="81" width="38" height="21" fill="#e3edda" />
              <rect x="23" y="102" width="34" height="2" fill="#cbd9c1" />

              <rect x="30" y="66" width="20" height="2" fill="#ffffff" />
              <rect x="28" y="69" width="24" height="1" fill="#ffffff" opacity="0.7" />
              <rect x="25" y="72" width="29" height="1" fill="#ffffff" opacity="0.5" />

              <rect x="44" y="68" width="3" height="36" fill="#c89a3a" />
              <rect x="47" y="68" width="2" height="36" fill="#f0c45a" />
              <rect x="49" y="68" width="2" height="36" fill="#ffe07b" />
              <rect x="46" y="69" width="1" height="34" fill="#fff8c8" opacity="0.85" />

              <rect x="25" y="86" width="6" height="13" fill="#f7fbf6" opacity="0.9" />
              <rect x="50" y="86" width="4" height="13" fill="#cdd6c4" opacity="0.85" />
            </g>

            <g className="pixel-pet-art-arm pixel-pet-art-arm-left">
              <rect x="16" y="72" width="6" height="4" fill="#1a1325" />
              <rect x="15" y="76" width="7" height="20" fill="#1a1325" />
              <rect x="16" y="73" width="5" height="3" fill="#f7fbf6" />
              <rect x="16" y="76" width="6" height="18" fill="#f0f6ef" />
              <rect x="17" y="78" width="3" height="14" fill="#ffffff" opacity="0.55" />
              <rect x="15" y="94" width="8" height="6" fill="#8a5a3a" />
              <rect x="16" y="95" width="6" height="5" fill="#a87553" />
              <rect x="16" y="98" width="6" height="2" fill="#5e3a25" />
              <rect x="14" y="96" width="2" height="3" fill="#5e3a25" />
            </g>
            <g className="pixel-pet-art-arm pixel-pet-art-arm-right">
              <rect x="58" y="72" width="6" height="4" fill="#1a1325" />
              <rect x="58" y="76" width="7" height="20" fill="#1a1325" />
              <rect x="59" y="73" width="5" height="3" fill="#f7fbf6" />
              <rect x="59" y="76" width="6" height="18" fill="#dde7d4" />
              <rect x="60" y="78" width="2" height="14" fill="#ffffff" opacity="0.35" />
              <rect x="57" y="94" width="8" height="6" fill="#8a5a3a" />
              <rect x="57" y="95" width="6" height="5" fill="#6d4128" />
              <rect x="57" y="98" width="6" height="2" fill="#3e2615" />
              <rect x="64" y="96" width="2" height="3" fill="#3e2615" />
            </g>

            <g className="pixel-pet-art-neck">
              <rect x="35" y="58" width="12" height="8" fill="#1a1325" />
              <rect x="36" y="58" width="10" height="7" fill="#7a4a2e" />
              <rect x="37" y="59" width="8" height="5" fill="#8a5a3a" />
              <rect x="44" y="60" width="3" height="5" fill="#5e3a25" />
              <rect x="37" y="64" width="9" height="1" fill="#4a2c1a" />
            </g>

            <g className="pixel-pet-art-head">
              <rect x="22" y="20" width="2" height="2" fill="#1a1325" />
              <rect x="56" y="20" width="2" height="2" fill="#1a1325" />
              <rect x="20" y="22" width="40" height="2" fill="#1a1325" />
              <rect x="19" y="24" width="2" height="32" fill="#1a1325" />
              <rect x="59" y="24" width="2" height="32" fill="#1a1325" />
              <rect x="21" y="56" width="38" height="2" fill="#1a1325" />
              <rect x="23" y="58" width="34" height="1" fill="#1a1325" />

              <rect x="21" y="24" width="38" height="32" fill="#8a5a3a" />
              <rect x="23" y="22" width="34" height="2" fill="#8a5a3a" />
              <rect x="22" y="56" width="36" height="2" fill="#8a5a3a" />

              <rect x="22" y="24" width="14" height="3" fill="#a87553" />
              <rect x="22" y="27" width="3" height="22" fill="#a87553" />
              <rect x="25" y="29" width="2" height="14" fill="#a87553" opacity="0.7" />

              <rect x="52" y="26" width="7" height="28" fill="#5e3a25" opacity="0.85" />
              <rect x="54" y="28" width="5" height="26" fill="#3e2615" opacity="0.55" />

              <rect x="29" y="32" width="3" height="3" fill="#a87553" opacity="0.45" />
              <rect x="48" y="32" width="3" height="3" fill="#a87553" opacity="0.45" />

              <rect x="31" y="51" width="11" height="2" fill="#2a1828" />
              <rect x="32" y="52" width="9" height="1" fill="#5e2a3e" opacity="0.7" />
            </g>

            <g className="pixel-pet-art-hair-back">
              <rect x="15" y="18" width="11" height="14" fill="#1a1325" />
              <rect x="23" y="11" width="34" height="14" fill="#1a1325" />
              <rect x="54" y="14" width="10" height="20" fill="#1a1325" />
              <rect x="13" y="30" width="13" height="22" fill="#1a1325" />
              <rect x="58" y="32" width="8" height="22" fill="#1a1325" />

              <rect x="17" y="20" width="7" height="11" fill="#b8862c" />
              <rect x="14" y="32" width="11" height="19" fill="#b8862c" />
              <rect x="56" y="34" width="8" height="18" fill="#a8762a" />

              <rect x="24" y="13" width="32" height="11" fill="#f4c95a" />
              <rect x="26" y="11" width="28" height="2" fill="#f4c95a" />
              <rect x="22" y="22" width="3" height="6" fill="#d4a83c" />
              <rect x="55" y="22" width="3" height="6" fill="#d4a83c" />

              <rect x="27" y="13" width="20" height="6" fill="#ffe27a" />
              <rect x="30" y="12" width="14" height="2" fill="#fff5b8" />
              <rect x="33" y="11" width="8" height="1" fill="#ffffff" opacity="0.7" />
            </g>

            <g className="pixel-pet-art-hair-front">
              <rect x="20" y="22" width="40" height="3" fill="#1a1325" />
              <rect x="19" y="25" width="14" height="11" fill="#1a1325" />
              <rect x="33" y="25" width="8" height="16" fill="#1a1325" />
              <rect x="41" y="25" width="8" height="15" fill="#1a1325" />
              <rect x="49" y="25" width="11" height="11" fill="#1a1325" />
              <rect x="17" y="32" width="6" height="8" fill="#1a1325" />

              <rect x="20" y="24" width="13" height="9" fill="#f4c95a" />
              <rect x="33" y="24" width="8" height="14" fill="#ffe27a" />
              <rect x="41" y="24" width="8" height="13" fill="#e8b948" />
              <rect x="49" y="24" width="11" height="9" fill="#d4a83c" />

              <rect x="22" y="25" width="9" height="6" fill="#ffe27a" />
              <rect x="34" y="25" width="6" height="11" fill="#fff5b8" />
              <rect x="42" y="25" width="6" height="10" fill="#f4c95a" />
              <rect x="50" y="25" width="8" height="6" fill="#e8b948" />

              <rect x="36" y="24" width="2" height="14" fill="#ffffff" opacity="0.55" />
              <rect x="44" y="25" width="1" height="10" fill="#ffffff" opacity="0.4" />
              <rect x="25" y="25" width="1" height="6" fill="#ffffff" opacity="0.4" />
              <rect x="53" y="25" width="1" height="5" fill="#ffffff" opacity="0.4" />

              <rect x="18" y="32" width="5" height="7" fill="#b8862c" />
              <rect x="19" y="33" width="3" height="5" fill="#d4a83c" />
            </g>

            <g className="pixel-pet-art-hair-fill">
              <rect x="14" y="48" width="3" height="6" fill="#1a1325" opacity="0.6" />
              <rect x="62" y="49" width="3" height="6" fill="#1a1325" opacity="0.6" />
            </g>

            <g className="pixel-pet-art-eyes">
              <rect x="26" y="38" width="12" height="9" fill="#1a1325" />
              <rect x="42" y="38" width="12" height="9" fill="#1a1325" />

              <rect x="27" y="39" width="10" height="7" fill="#0a0e1c" />
              <rect x="43" y="39" width="10" height="7" fill="#0a0e1c" />

              <rect className="pixel-pet-art-eye-glow" x="28" y="40" width="8" height="5" fill="#2a3a8a" />
              <rect className="pixel-pet-art-eye-glow" x="44" y="40" width="8" height="5" fill="#2a3a8a" />

              <rect x="29" y="41" width="6" height="3" fill="#58cfff" />
              <rect x="45" y="41" width="6" height="3" fill="#58cfff" />

              <rect x="30" y="42" width="2" height="1" fill="#b97aff" />
              <rect x="34" y="41" width="1" height="1" fill="#ff8fce" />
              <rect x="33" y="43" width="2" height="1" fill="#ff8fce" />

              <rect x="46" y="42" width="2" height="1" fill="#b97aff" />
              <rect x="50" y="41" width="1" height="1" fill="#ff8fce" />
              <rect x="49" y="43" width="2" height="1" fill="#ff8fce" />

              <rect x="31" y="40" width="2" height="1" fill="#ffffff" />
              <rect x="47" y="40" width="2" height="1" fill="#ffffff" />
              <rect x="36" y="44" width="1" height="1" fill="#ffffff" />
              <rect x="52" y="44" width="1" height="1" fill="#ffffff" />

              <rect x="26" y="37" width="12" height="1" fill="#5e3a25" opacity="0.85" />
              <rect x="42" y="37" width="12" height="1" fill="#5e3a25" opacity="0.85" />
            </g>

            <g className="pixel-pet-art-hair-lines" opacity="0.85">
              <rect x="28" y="14" width="2" height="9" fill="#b8862c" />
              <rect x="44" y="14" width="2" height="9" fill="#b8862c" />
              <rect x="51" y="15" width="2" height="9" fill="#a8762a" />
              <rect x="38" y="13" width="1" height="10" fill="#fff8c8" opacity="0.7" />
            </g>

            <g className="pixel-pet-art-sparkle-floats">
              <rect x="64" y="38" width="2" height="2" fill="#76f7ff" opacity="0.9" />
              <rect x="65" y="37" width="1" height="1" fill="#ffffff" />
              <rect x="68" y="46" width="2" height="2" fill="#ff9fe9" opacity="0.9" />
              <rect x="71" y="52" width="1" height="1" fill="#fff2a5" />
              <rect x="66" y="58" width="2" height="2" fill="#a3ffd6" opacity="0.85" />
              <rect x="69" y="64" width="1" height="1" fill="#c2a4ff" />
            </g>
          </svg>
          <div className="pixel-pet-shadow" />
        </div>
      </div>
    </>
  );
}

function chooseAction(): PetAction {
  const roll = Math.random();
  const viewport = getViewport();
  const safeLeft = PET_EDGE_PAD;
  const safeRight = viewport.width - PET_SIZE.width - PET_EDGE_PAD;
  const safeTop = PET_EDGE_PAD + 18;
  const safeBottom = viewport.height - PET_SIZE.height - PET_EDGE_PAD;

  if (roll < 0.18) {
    return { pose: "peek-left", x: safeLeft, y: randomBetween(safeTop + 120, safeBottom), duration: 3200, showMessage: true };
  }

  if (roll < 0.36) {
    return { pose: "peek-right", x: safeRight, y: randomBetween(safeTop + 120, safeBottom), duration: 3200, showMessage: true };
  }

  if (roll < 0.52) {
    return { pose: "hang-top", x: randomBetween(safeLeft + 80, safeRight - 40), y: safeTop, duration: 3800, showMessage: true };
  }

  if (roll < 0.68) {
    return { pose: "sit-edge", x: randomBetween(safeLeft + 80, safeRight - 40), y: safeBottom, duration: 4200, showMessage: Math.random() > 0.35 };
  }

  return { pose: "walk", x: randomBetween(safeLeft + 30, safeRight - 30), y: randomBetween(safeTop + 120, safeBottom), duration: 2300, showMessage: Math.random() > 0.55 };
}

function randomBetween(min: number, max: number) {
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  return Math.round(low + Math.random() * (high - low));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function clampPoint(point: Point): Point {
  const viewport = getViewport();
  return {
    x: clamp(point.x, PET_EDGE_PAD, Math.max(PET_EDGE_PAD, viewport.width - PET_SIZE.width - PET_EDGE_PAD)),
    y: clamp(point.y, PET_EDGE_PAD, Math.max(PET_EDGE_PAD, viewport.height - PET_SIZE.height - PET_EDGE_PAD))
  };
}

function getViewport() {
  if (typeof window === "undefined") return { width: 1280, height: 720 };
  return {
    width: window.innerWidth,
    height: window.innerHeight
  };
}
