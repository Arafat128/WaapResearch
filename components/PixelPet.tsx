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
        setHidden((value) => !value);
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
            <rect x="29" y="3" width="22" height="3" fill="#effff2" />
            <rect x="22" y="6" width="7" height="3" fill="#effff2" />
            <rect x="51" y="6" width="7" height="3" fill="#effff2" />
            <rect x="19" y="9" width="3" height="5" fill="#effff2" />
            <rect x="58" y="9" width="3" height="5" fill="#effff2" />
            <rect x="24" y="1" width="5" height="5" fill="#ff9fe9" />
            <rect x="53" y="2" width="5" height="5" fill="#76f7ff" />
            <rect x="37" y="0" width="6" height="5" fill="#fff2a5" />
          </g>

          <g className="pixel-pet-art-leg pixel-pet-art-leg-left">
            <rect x="30" y="94" width="7" height="16" fill="#10182f" />
            <rect x="27" y="108" width="13" height="5" fill="#0a1023" />
            <rect x="34" y="95" width="3" height="11" fill="#243454" />
          </g>
          <g className="pixel-pet-art-leg pixel-pet-art-leg-right">
            <rect x="43" y="94" width="7" height="16" fill="#10182f" />
            <rect x="40" y="108" width="13" height="5" fill="#0a1023" />
            <rect x="47" y="95" width="3" height="11" fill="#243454" />
          </g>

          <g className="pixel-pet-art-body">
            <rect x="27" y="68" width="28" height="7" fill="#11172f" />
            <rect x="24" y="75" width="35" height="7" fill="#11172f" />
            <rect x="21" y="82" width="41" height="23" fill="#11172f" />
            <rect x="29" y="69" width="24" height="7" fill="#fbfff6" />
            <rect x="27" y="76" width="28" height="7" fill="#eefaf4" />
            <rect x="25" y="83" width="34" height="20" fill="#dceee8" />
            <rect x="45" y="76" width="6" height="29" fill="#c18a34" />
            <rect x="51" y="78" width="3" height="25" fill="#fff0a6" />
            <rect x="26" y="91" width="9" height="12" fill="#f9fff8" />
            <rect x="55" y="90" width="4" height="13" fill="#96aba5" />
          </g>

          <g className="pixel-pet-art-arm pixel-pet-art-arm-left">
            <rect x="17" y="74" width="7" height="23" fill="#11172f" />
            <rect x="19" y="76" width="6" height="19" fill="#eaf8f1" />
            <rect x="17" y="95" width="8" height="6" fill="#9f6251" />
          </g>
          <g className="pixel-pet-art-arm pixel-pet-art-arm-right">
            <rect x="57" y="74" width="7" height="23" fill="#11172f" />
            <rect x="56" y="76" width="6" height="19" fill="#d4e8e3" />
            <rect x="56" y="95" width="8" height="6" fill="#9f6251" />
          </g>

          <g className="pixel-pet-art-neck">
            <rect x="36" y="59" width="10" height="12" fill="#11172f" />
            <rect x="38" y="58" width="9" height="11" fill="#8c544b" />
            <rect x="45" y="61" width="4" height="8" fill="#623b3b" />
          </g>

          <g className="pixel-pet-art-head">
            <rect x="19" y="24" width="43" height="34" fill="#11172f" />
            <rect x="23" y="21" width="37" height="42" fill="#11172f" />
            <rect x="25" y="27" width="33" height="33" fill="#a96a56" />
            <rect x="52" y="30" width="6" height="24" fill="#73433e" />
            <rect x="29" y="28" width="18" height="8" fill="#c98b65" />
            <rect x="31" y="49" width="12" height="3" fill="#21172a" />
          </g>

          <g className="pixel-pet-art-hair-back">
            <rect x="17" y="19" width="10" height="14" fill="#11172f" />
            <rect x="24" y="13" width="29" height="14" fill="#11172f" />
            <rect x="49" y="17" width="12" height="17" fill="#11172f" />
            <rect x="13" y="31" width="13" height="20" fill="#11172f" />
            <rect x="55" y="32" width="9" height="25" fill="#11172f" />
          </g>
          <g className="pixel-pet-art-hair-fill">
            <rect x="21" y="18" width="11" height="13" fill="#f7cf68" />
            <rect x="29" y="14" width="22" height="11" fill="#ffd96f" />
            <rect x="48" y="19" width="10" height="14" fill="#eebf58" />
            <rect x="17" y="33" width="9" height="13" fill="#e5ad4e" />
            <rect x="55" y="34" width="6" height="19" fill="#c68a46" />
            <rect x="36" y="16" width="5" height="30" fill="#ffe07b" />
          </g>
          <g className="pixel-pet-art-hair-front">
            <rect x="20" y="25" width="18" height="7" fill="#11172f" />
            <rect x="42" y="24" width="18" height="7" fill="#11172f" />
            <rect x="17" y="30" width="12" height="12" fill="#11172f" />
            <rect x="30" y="27" width="10" height="19" fill="#11172f" />
            <rect x="49" y="29" width="9" height="18" fill="#11172f" />
            <rect x="22" y="25" width="15" height="6" fill="#ffd76b" />
            <rect x="42" y="25" width="15" height="6" fill="#f2c45d" />
            <rect x="20" y="31" width="8" height="9" fill="#efbd58" />
            <rect x="31" y="29" width="7" height="15" fill="#ffe07b" />
            <rect x="50" y="31" width="6" height="14" fill="#d79c4b" />
            <rect x="26" y="18" width="23" height="5" fill="#fff09a" />
          </g>

          <g className="pixel-pet-art-eyes">
            <rect x="27" y="39" width="10" height="9" fill="#07101f" />
            <rect x="45" y="39" width="9" height="9" fill="#07101f" />
            <rect className="pixel-pet-art-eye-glow" x="30" y="41" width="5" height="4" fill="#58efff" />
            <rect className="pixel-pet-art-eye-glow" x="47" y="41" width="5" height="4" fill="#58efff" />
            <rect x="28" y="38" width="26" height="3" fill="#d9ffff" opacity="0.9" />
            <rect x="37" y="42" width="7" height="2" fill="#ffaceb" opacity="0.9" />
          </g>

          <g className="pixel-pet-art-hair-lines" opacity="0.75">
            <rect x="34" y="20" width="3" height="18" fill="#8d644a" />
            <rect x="43" y="21" width="3" height="15" fill="#8d644a" />
            <rect x="23" y="29" width="3" height="11" fill="#8d644a" />
            <rect x="53" y="31" width="3" height="12" fill="#7c563d" />
          </g>
        </svg>
        <div className="pixel-pet-shadow" />
      </div>
    </div>
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
