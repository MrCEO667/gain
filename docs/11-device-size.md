# 11. Device size: first estimate

*October 2026. An engineering estimate to start industrial design from, not a final spec.
It will change once a real module and battery are picked and measured.*

## Inputs

| Decision | Choice |
|---|---|
| Connectivity | Own LTE with eSIM, works without a phone |
| On-device intelligence | Small offline brain: local speech recognition, voice, and a small language model |
| Battery | One full day per charge |
| Form factor | Like an IQOS case: carried in a pocket or held in the hand, worn with Bluetooth headphones |
| Market | Worldwide, premium. Possible collaboration with a premium clothing brand on the case |

## Result

**About 102 × 46 × 13.5 mm, 115–140 g.**

That is roughly the footprint of an IQOS ILUMA charger, but about 40% thinner.

| Object | Size, mm | Weight |
|---|---|---|
| IQOS ILUMA Prime charger | 117 × 45 × 22 | ~140 g |
| IQOS ILUMA i ONE | 122 × 31 × 16 | ~74 g |
| **Gain (estimate)** | **~102 × 46 × 13.5** | **~115–140 g** |

## How the numbers were calculated

### 1. Battery: how much energy one day takes

| Mode | Power | Hours per day | Energy |
|---|---|---|---|
| Standby: LTE idle, Bluetooth link kept, chip asleep | 40–80 mW | 13.5 | ~0.8 Wh |
| Active talk: LTE, local speech recognition, audio to headphones | 1.2–1.8 W | 2.5 | ~3.8 Wh |
| Offline brain in bursts: CPU and NPU under load | 3–5 W | 0.5 | ~2.0 Wh |
| **Total** | | **16.5** | **~6.5 Wh** |

Then add margin. Batteries lose about 20% of their capacity after two years, and the device should never reach 0% before evening:
6.5 Wh ÷ 0.8 ÷ 0.9 ≈ **9 Wh ≈ 2300–2500 mAh** at 3.85 V.

A good pouch cell stores about 550 Wh per litre, so 9 Wh takes about **16–17 cm³**, for example **80 × 42 × 5 mm**.
The battery is the largest single part, and it sets the footprint.

### 2. Electronics

- **Main module:** an LTE "smart module" that combines the modem, processor, NPU, Wi-Fi and Bluetooth in one pre-certified
  package. These are about **43 × 44 × 2.9 mm**. For the offline brain it needs a strong NPU (QCM6490 class, ~12 TOPS);
  the exact part is still to be chosen with a vendor.
- **Main board:** about 44 × 70 mm, components on both sides: module, power and charging, eSIM, NFC, three microphones,
  fingerprint connector, haptics driver, USB-C.

### 3. Thickness: the board sits on top of the battery

| Layer | mm |
|---|---|
| Shell walls (front and back), 1.0 each | 2.0 |
| Battery | 5.0 |
| Room for battery swelling over its life (~8%) | 0.4 |
| Board, module, shields, parts on the back side | 5.2 |
| Heat spreader (graphite sheet or thin vapour chamber) | 0.3 |
| Assembly tolerances and adhesive | 0.6 |
| **Total** | **~13.5** |

### 4. Length and width

- **Length:** battery 80 mm + about 10 mm at each end for the LTE antennas, which must not sit inside metal + walls → **~102 mm**.
- **Width:** battery 42 mm + walls + clearance → **~46 mm**.

### 5. Weight

| Part | Aluminium | Titanium | Ceramic |
|---|---|---|---|
| Shell (~13 cm³ of material) | ~36 g | ~45–60 g | ~80 g |
| Battery | ~45 g | ~45 g | ~45 g |
| Board, module, shields | ~20 g | ~20 g | ~20 g |
| End caps, sensor, haptics, screws, adhesive | ~16 g | ~16 g | ~16 g |
| **Total** | **~115 g** | **~125–140 g** | **~160 g** |

## Three sizes to choose from

| Option | What changes | Size, mm | Weight |
|---|---|---|---|
| Slim | No offline brain, speech recognition only, ~1500 mAh | ~95 × 42 × 10 | ~85 g |
| **Target** | What was decided above | **~102 × 46 × 13.5** | **~115–140 g** |
| Two days | Battery ~4500 mAh | ~105 × 47 × 19 | ~170 g |

The offline brain costs about 3.5 mm of thickness and 30 g. That is the main trade-off in the design.

## Rules for the designer

These come from physics, not taste. The designer should know them before the first sketch.

1. **Radio windows.** Metal blocks radio. Both ends need about 10–12 mm of non-metal material (ceramic, glass, polymer
   or the brand's material) for the LTE antennas. NFC needs a non-metal patch of about 30 × 20 mm on one face.
   This can become the signature look: a metal body with ends in a different material, the way phones use antenna bands.
2. **Heat.** The device can shed only about **2 W** continuously without getting uncomfortable in the hand
   (target surface temperature around 43 °C). Leather and textile insulate, so the side over the processor stays metal
   and the brand's material goes over the battery side. The offline brain works in short bursts for this reason.
3. **Microphones.** Three openings: two on the top edge, toward the mouth when the device is held, and one on a face.
   They must not be where fingers naturally cover them.
4. **Fingerprint sensor is also the main button.** On the side, where the thumb rests when the device is held.
   Press to talk, long press to stop all agents. Size about 4 × 12 mm.
5. **Haptics.** A small vibration motor (~10 mm) near the grip, to notify when headphones are off.
6. **Recording indicator.** A tiny light (light pipe) that shows when the microphones are listening. This is about the privacy of people nearby.
7. **eSIM only, no SIM tray.** One less hole in the shell.
8. **USB-C on the bottom end.** Wireless charging is possible only if the back is not metal.
9. **Water resistance.** IP54 (splashes, rain) is the minimum. IP67 (submersion) adds seals and about 0.5 mm.

## Brand collaboration

A clothing brand fits this device technically, not only as marketing. Leather, textile and other soft materials let
radio through, so they can be exactly the parts that must not be metal: the ends, the NFC zone, the back with wireless
charging. The one place they can't go is over the processor, because they trap heat.

## Next steps

1. Pick the main module with a vendor and get its exact size and power numbers.
2. Order a battery of about 2400 mAh in a size close to 80 × 42 × 5 mm.
3. Print a block of 102 × 46 × 13.5 mm and carry it in your pocket for a week. It's the cheapest way to check size and weight.
4. Brief an industrial designer with this document.

## Sources

- [IQOS: why is IQOS ILUMA bigger and heavier](https://www.iqos.com/ma/fr/support/faq/pourquoi-iqos-iluma-est-il-plus-grand-et-plus-lourd-que-les-appareils-pr%C3%A9c%C3%A9dents.html)
- [IQOS: compare devices](https://www.iqos.com/my/en/discover-heated-tobacco/comparison.html)
- [Ecigone: IQOS ILUMA i ONE](https://ecigone.co.uk/products/iqos-iluma-i-one-starter-kit)
- [Quectel SC686A smart module datasheet (43 × 44 × 2.85 mm)](https://cdn.soselectronic.com/productdata/21/09/fcde3301/sc686aempa-e56-ugada.pdf)
- [CNX Software: Quectel QSM560DR, QCM6490 with 12 TOPS NPU](https://www.cnx-software.com/news/quectel/page/2/?amp=1)
