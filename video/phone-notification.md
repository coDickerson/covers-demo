# Phone notification clips

The morning-after beat: the card is charged, Covers pings the rep, one tap opens the close-out.

| File | Size | Use |
|---|---|---|
| `phone-notification-16x9.mp4` | 1920×1080, 60 fps, 7.4 s | The video. Ends on the site background (`#FBFAF8`), so a ~0.3 s dissolve into the screen recording of `/m/{id}` reads as one shot. |
| `phone-notification.mp4` | 1440×2000, 30 fps, 6 s | Portrait v1, phone only. |

Timeline (16:9): phone rises in 0–0.9 s · notification drops 1.4–2.1 s · tap 3.0 s · close-out screen opens 3.4–4.0 s · tap "Take a photo" 5.1 s · zoom out and fade 6.2–7.0 s.

Source: Figma, Covers-Design → page "06 Motion" → frame "Close-out notification (16:9)"
(https://www.figma.com/design/amtGh7fESBeXnQx49BDXDj/Covers-Design?node-id=31-2). Edit the layers there and export the frame as MP4 again.
The close-out screen copies the real `/m/plan-okafor` page (`apps/web/components/close-out.tsx`), with the same dinner and the same $612.40 charge.
