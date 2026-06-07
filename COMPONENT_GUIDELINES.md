# Money OS Component Guidelines (COMPONENT_GUIDELINES.md)

## 1. Modals & Dialogs
- **Current Issue**: Massive `rounded-[2rem]` cards covering the screen.
- **New Pattern**: 
  - Standard max-width (`max-w-md` or `max-w-lg`).
  - Sharp corners (`rounded-xl`).
  - Neutral backdrop (`bg-black/40 backdrop-blur-sm`).
  - Simple, border-bottom header. 

## 2. Buttons
- **Primary**: Monochrome (Black in light mode, White in dark mode). Solid. `rounded-md`. Text `13px` medium.
- **Secondary**: `bg-transparent border border-neutral-200 dark:border-neutral-800 text-neutral-900 dark:text-neutral-100`.
- **Destructive**: Only red on hover or in highly destructive confirmation modals. Default to secondary styling with a red text accent if necessary.
- **Padding**: `px-3 py-1.5` or `px-4 py-2`. No massive `py-3.5` bubbly buttons.

## 3. Tables (Data Grids)
- **Current Issue**: Bulky rows, large font sizes, generic HTML table styling.
- **New Pattern**:
  - Font size: `text-[13px]`.
  - Padding: `py-2 px-3`. Tight density.
  - Hover: Subtle background shift (`hover:bg-neutral-50 dark:hover:bg-neutral-900`).
  - Dividers: `border-b border-neutral-200 dark:border-neutral-800`.
  - Financial Data: Monospace/Tabular numbers aligned to the right.

## 4. Inputs & Forms
- **Style**: Standard `border-neutral-200 dark:border-neutral-800`.
- **Focus**: Remove generic thick indigo outlines. Use subtle monochrome focus rings (`focus:ring-1 focus:ring-neutral-900 dark:focus:ring-neutral-100`).
- **Labels**: `text-[12px] font-medium text-neutral-500`. No uppercase `font-bold` shouting.

## 5. Metric Cards
- **Current Issue**: Gradients, massive rotated icons in the background, shadow-lg, scale on hover.
- **New Pattern**:
  - Pure monochrome backgrounds (`bg-white dark:bg-[#000000]`).
  - Crisp 1px border (`border-neutral-200 dark:border-neutral-800`).
  - Top left: Muted label (`text-[13px] text-neutral-500`).
  - Bottom left: Large tabular metric (`text-2xl font-semibold tracking-tight`).
  - No background icons. No hover transforms.

## 6. Badges / Status
- Small, `px-2 py-0.5 text-[11px] font-medium rounded-full`.
- Use translucent backgrounds (`bg-emerald-500/10 text-emerald-600`).
