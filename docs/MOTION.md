# Money OS Motion System (MOTION.md)

Based on Emil Kowalski's principles and Impeccable guidelines.

## 1. Philosophy
- Motion must be purposeful, physics-based, and fast.
- "Nothing bounces or springs past its mark."
- Transitions should help the user maintain context, not distract them.

## 2. Global Transition Rules
- **Hover States**: 
  - `transition-colors duration-150 ease-out`.
  - Opacity and background color changes only. 
  - BANNED: Transform scaling on buttons/cards (`active:scale-95`, `hover:-translate-y-1`).
- **Modals & Drawers**:
  - Quick fade and slight scale up (e.g., `scale-95` to `scale-100`).
  - Duration: `150ms` (in), `100ms` (out).
  - Timing function: `cubic-bezier(0.16, 1, 0.3, 1)` (Custom crisp ease-out).

## 3. Micro-Interactions
- **Buttons**: Focus rings should fade in smoothly (`focus-visible:ring-2 focus-visible:ring-offset-2`).
- **Tabs**: Active state indicators should cross-fade or snap, avoiding clunky layout shifts.
- **Dropdowns**: `duration-100 ease-out`, opacity and slight vertical slide (`translate-y-1` to `0`).

## 4. Loading States
- Avoid heavy spinners blocking the UI.
- Use subtle skeleton pulses with a neutral background (`bg-neutral-200/50` or `bg-neutral-800/50`).
- Pulse duration: `1.5s` subtle fade, not high-contrast flashing.

## 5. Banned Motion (AI Slop)
- `.animate-in .slide-in-from-top-2 .duration-500` applied to entire page sections (makes the app feel slow and floaty).
- Generic bounce easing.
- Transform translations on cards on hover (makes the UI feel unstable).
