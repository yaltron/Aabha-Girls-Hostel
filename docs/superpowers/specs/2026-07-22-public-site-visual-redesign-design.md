# Public Site Visual Redesign - Design Spec

Date: 2026-07-22
Status: Approved

## 1. Overview

The user provided a full Stitch export (`stitch_aabha_girls_hostel_website/`)
containing 10 screens. Investigation found it covers far more than the
public site: half the screens redesign the already-shipped internal
admin/parent/fee pages, and one screen (the admission form) collects
personal data that directly violates this project's data-minimalism law.
After review, scope was explicitly narrowed by the user:

- **In scope:** restyle the 5 public routes built in Stage 6
  (`/`, `/rooms`, `/life`, `/about`, `/contact`) to match the Stitch
  public-facing screens (Home, Rooms & Fees, Booking, Transparency),
  consolidating `/life` + `/about` into one `/transparency` route and
  renaming `/contact` to `/booking` to match the Stitch nav's own
  labels.
- **Explicitly out of scope:** rebuilding the internal admin dashboard,
  message center (two-way chat), parent portal dashboard, or
  attendance/outpass tracking shown in the other 6 screens. None of
  those are built.
- **Two narrow, explicitly authorized exceptions** to "public only":
  adding `fonepay` as a 4th payment method (schema + `RecordPaymentForm`
  UI only - Stage 3's internal fee flow), and an optional light visual
  pass on the internal `CheckInForm` if it fits cleanly - not required,
  not blocking.
- **Data-minimalism holds.** The Stitch "Digital Admission Form" screen
  (DOB, blood group, university, permanent address, father/mother
  fields, guardian occupation, document uploads) is not built. The
  public "Reserve a Bed" form gets four new columns bounded by the
  user's explicit field list - nothing resembling the Stitch screen's
  full field set.
- **Branding.** Every occurrence of "Aabha Boutique Living", "The
  Sanctuary", or "Lumbini House" in the new copy is replaced with
  "Aabha Girls Hostel" - those were design-tool placeholder names, not
  a real naming decision.

Design tokens (colors, Playfair Display + Inter, radii, shadows) in the
Stitch `DESIGN.md` are already byte-identical to this project's
`tailwind.config.ts` - confirmed, zero token changes needed. The actual
Aabha logo mark (`stitch_.../aabha_girls_hostel_logo/screen.png`) is a
real asset, copied to `public/logo.png`, used in the nav/footer instead
of plain text.

## 2. Route restructuring

| Before | After | Content |
|---|---|---|
| `/` | `/` | Home - unchanged path, restyled |
| `/rooms` | `/rooms` | Rooms & Fees - unchanged path, restyled, room cards only (no fee table - see Section 4) |
| `/life` | *(removed, folded into `/transparency`)* | |
| `/about` | *(removed, folded into `/transparency`)* | |
| *(new)* | `/transparency` | Weekly menu + safety protocol + team bios + fee schedule + contact/location |
| `/contact` | `/booking` | Inquiry form + Reserve-a-Bed form, restyled |

`PublicShell`'s nav becomes exactly: **Home, Transparency, Rooms & Fees,
Booking**, plus a pill "Book a Visit" CTA button linking to `/booking` -
matching the Stitch nav on every public screen. The footer (brand blurb
+ logo, Explore links, location/contact) moves from being absent to
being part of `PublicShell` itself, rendered once across all four pages
- not duplicated per-route the way a static HTML export would.

## 3. Content model additions (no new tables - `site_content`/`site_media` are already flexible key/value stores)

New `site_content` keys (all owner/warden-editable, added to
`SiteContentForm`):
- `trust_stats`: array of `{ label, sublabel }` (4 items - "10+ Years of
  Excellence", "2 Mins from Global College", "24/7 CCTV & Security",
  "Trusted by 500+ Families"). Icons are fixed per position in the
  component, not owner-editable - they're a design decision, not
  marketing copy.
- `trust_points`: array of `{ title, description }` (4 items - Healthy
  Meals, Safe Environment, Female Warden, Prime Location). Same
  icon-is-fixed reasoning.
- `rooms_hero`: `{ headline, subhead }` for the `/rooms` banner.
- `transparency_intro`: `{ headline, text }`.
- `safety_protocol`: array of `{ title, description }` (replaces the
  single-blob `safety_rules` shape that was never wired to any UI -
  this is the first time it's actually built).
- `team`: two fixed slots, `warden` and `owner`, each
  `{ name, quote, photo_url }`.
- `fee_schedule`: array of `{ component, description, amount }` (e.g.
  Admission Fee, Monthly Rent, Food Charges, Refundable Deposit). This
  is the **one** authoritative fee table - the Stitch export shows a
  fee breakdown on both "Rooms & Fees" and "Transparency", which would
  mean maintaining two numbers that could drift. Consolidated onto
  `/transparency` only; `/rooms` shows just the live starting price per
  room type (already-built data), not a static breakdown.
- `contact`: extended (already exists with `phone`/`address`) - no
  shape change, just now actually rendered in the footer and the
  booking sidebar.

New `site_media` categories (the column is free text, no migration
needed - just extending which categories the admin's tab list and the
public pages read): `hero` (home hero image), `rooms_hero` (rooms page
banner), `team_warden`, `team_owner` (the two bio photos). `highlight`,
`room_single`, `room_twin`, `room_triple`, `facility` already exist.

Room feature bullets ("High Speed Fiber WiFi", "Private Study Desk",
etc.) and the "Available/Popular/Value" badges are hardcoded per
`room_type` in the component - they're structural facts about a room
type, not text that changes often enough to justify more CMS surface.

Meal plan stays 3 meals (breakfast/lunch/dinner), matching the existing
`meal_type` enum - the Stitch table shows a 4th "Snacks" column; not
adding a 4th meal type is a deliberate, disclosed simplification, not an
oversight.

## 4. `bookings` table: four new columns

```sql
alter table public.bookings add column guardian_name text;
alter table public.bookings add column emergency_contact_name text;
alter table public.bookings add column emergency_contact_phone text;
alter table public.bookings add column note text;
```

All nullable (existing rows, if any, stay valid). The anon insert
policy's `with check (status = 'pending' and reserved_bed_id is null)`
is unaffected - it doesn't reference these columns, and the new columns
carry no authorization weight (nothing downstream branches on them).
`submitBooking()` (`lib/publicSite.ts`) and the `/booking` page's
Reserve-a-Bed form both extend to collect/send the four new fields. The
admin `BookingsQueue` component gains a short display of the new fields
(guardian name, emergency contact, note) so a warden reviewing a
pending booking has full context before approving.

## 5. FonePay (the one internal-app touch)

```sql
alter type payment_method add value 'fonepay';
```

`lib/fees.ts`'s `PaymentMethod` type gains `'fonepay'`;
`RecordPaymentForm.tsx` gains a fourth `<option>`. Nothing else in the
fees flow changes.

## 6. Testing plan (given to user at end of implementation)

- Visit all four public routes on a fresh (logged-out) browser session;
  confirm nav, footer, and logo render identically across all four.
- Confirm Home's hero, trust stats, trust points, room preview cards,
  and reviews all pull real data (edit something in Site Content, see
  it change on the public page).
- Confirm `/rooms` shows the three room types with live availability
  counts and prices, matching the bed board.
- Confirm `/transparency` shows the real weekly menu, safety protocol,
  both team bios, and the one fee schedule table.
- Submit the expanded Reserve-a-Bed form (`/booking`) with guardian
  name, emergency contact, and a note; confirm all fields appear in the
  admin's Bookings queue.
- As owner, record a payment and confirm "FonePay" is selectable and
  saves correctly.
- Confirm `/life` and `/about` no longer exist as routes (404 or
  redirect-free removal - TanStack Router will simply not have them
  registered).
