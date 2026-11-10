# Video assets

All clips are 1920×1080, 60 fps, on the site background (`#FBFAF8`) unless noted, so they cut straight into screen recordings of the app.
They were made in Figma Motion: Covers-Design → page "06 Motion"
(https://www.figma.com/design/amtGh7fESBeXnQx49BDXDj/Covers-Design?node-id=31-2). Edit the layers there and export the frame as MP4 again.

## Clips

| File | Length | What happens |
|---|---|---|
| `01-title.mp4` | 4.5 s | The bell drops in and squashes on landing, "Covers" rises in, then the tagline and an accent bar. The bell hops twice. |
| `02-problem.mp4` | 6 s | "$678 million", the Novartis line, then "Today these dinners are checked after the money is spent." The bell walks in at the bottom right. Source credit included. |
| `03-chapter-before-the-dinner.mp4` | 3 s | Chapter card: the bell walks in and "01 Before the dinner · Plan · Check · Fund" rises. |
| `04-chapter-the-morning-after.mp4` | 3 s | Chapter 02: "The morning after · Charge · Notify · Close out". |
| `05-chapter-oversight.mp4` | 3 s | Chapter 03: "Oversight · Settle · Compliance · Report". |
| `06-end.mp4` | 5 s | "Covers", the tagline and the repo link. A green SETTLED stamp slams down and the bell hops. |
| `phone-notification-16x9.mp4` | 7.4 s | Full-frame phone beat with captions. It ends zooming in and fading to the site background. |
| `phone-overlay-greenscreen.mp4` | 7.4 s | The same phone motion with no captions, on chroma green (`#00B140`). The phone slides in from the right, then out. Key it over the laptop recording. |
| `phone-notification.mp4` | 6 s | Portrait v1, phone only. |
| `phone-frame.png` | 1242×2604 | Phone bezel with a transparent screen (3× of 414×868; the screen opening is 390×844 at an offset of 12, 12). Drop a screen recording of `/m/{id}` behind it. |

Phone clip timeline: notification drops 1.4–2.1 s · tap 3.0 s · close-out screen opens 3.4–4.0 s · tap "Take a photo" 5.1 s.

## Edit: one canvas, two devices

1. **Title → problem → chapter 01.**
2. **Laptop, full frame:** plan the dinner, the checks block it, fix it, then the real Ramp card is issued. Cut to Ramp's own UI for the fund.
3. **Chapter 02.**
4. **The charge lands.** The dinner map flips to "Charged" by itself, since it polls Ramp. On that beat, shrink the laptop recording to about 60% on the left and key `phone-overlay-greenscreen.mp4` over it, so the notification drops on the right while the charge shows on the left.
5. **In the phone:** after the tap, switch the phone screen to a screen recording of `/m/{id}`. Record it in browser device mode at 390×844 and put it under `phone-frame.png`. Show the receipt photo being read and who came.
6. **The laptop reacts.** When "Close it out" is tapped, the dinner map on the left moves to Settle by itself, because it also watches for a close-out made on the phone.
7. **Chapter 03:** the phone slides out and the laptop grows back to full frame. Show the compliance decision, the audit log and Proof.
8. **End card.**

Recording tips: use local live mode (`COVERS_MODE=live`). For a clean run, plan the dinner at a restaurant that Ramp's sandbox categorizes as Restaurants (La Pecora Bianca, Eataly, The Wilson) and charge it there. Charge somewhere else if you want to show the venue flag.
