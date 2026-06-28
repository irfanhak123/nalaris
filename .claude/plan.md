# Plan: Add a Weather block

## Goal
Render a new `weather` block type with the sample payload:
```json
{
  "id": "rc-mqx4dz2s-1",
  "type": "weather",
  "weight": 50,
  "data": {
    "location": "Inspire Arena, Parongpong",
    "temp": "22-24C",
    "condition": "Light drizzle most of the afternoon",
    "rain_chance": "100%",
    "wind": "Bandung highland breeze",
    "advice": "Rain starts around 2pm and drizzles through 7pm. At 4pm there's a brief gap (0mm) but the field will be wet. Bring shoes for slippery ground."
  }
}
```

## Approach

### 1. Component
Create `panel/src/components/blocks/weather/WeatherBlock.tsx`.
- Display location as a mono label.
- Big temperature as the value.
- Condition, rain chance, wind as detail rows.
- Advice in a callout-style section because it is actionable guidance.
- Keep it black/white + information-only colors (no decorative weather icons, emojis, or blue skies).

### 2. Register
Import and add `weather: WeatherBlock` in `panel/src/components/blocks/index.tsx`.

### 3. CSS
Add `.weather-*` styles to `panel/src/styles/base.css` using existing tokens, matching the bordered-card + left-accent pattern used by stat/callout.

### 4. Schema
Add the weather entry to `panel/tools/verify-blocks.py` `BLOCK_TYPES`:
- required: none
- optional: location, temp, condition, rain_chance, wind, advice

### 5. Demo (optional but nice)
Add a sample weather block to `panel/src/lib/demo-blocks.ts` so `?demo=1` shows it.

## Files to edit
- `panel/src/components/blocks/weather/WeatherBlock.tsx` (new)
- `panel/src/components/blocks/index.tsx`
- `panel/src/styles/base.css`
- `panel/tools/verify-blocks.py`
- `panel/src/lib/demo-blocks.ts`

## Verification
- `npm run typecheck`
- `npm run build`
- `python3 tools/verify-blocks.py --types` lists `weather`
