# Namaste intro photo

Save the generated image as `public/namaste-hands.jpg`. `src/components/NamasteIntro.tsx` uses it automatically
and falls back to the drawn hands if the file is missing.

## Prompt (Midjourney / DALL·E / Firefly / Imagen)

Photorealistic close-up of traditional Indian hands joined together in a respectful Namaste greeting, fingertips
pointing up, centred in the frame. Warm golden-hour sunlight from the side casting soft shadows, shallow depth of
field, softly blurred background of marigold garlands and warm temple stone with golden bokeh, high-detail skin
texture, natural medium-brown skin tone, a thin gold bangle on one wrist, elegant and welcoming mood, professional
commercial photography, 85mm lens, 16:9 landscape, 4k.

Keep the lower third and the area around the hands fairly uncluttered: the word "Namaste" is overlaid there.

## Negative prompt (where supported)

text, watermark, logo, extra fingers, fused fingers, distorted hands, jewelry glare, harsh flash, cartoon, illustration

## Export

- 1920×1080 or wider, JPG, under ~300 KB (e.g. quality 80 + a tool such as squoosh.app) so the intro loads fast.
- The photo is cropped with `object-cover`, so keep the subject near the centre.
