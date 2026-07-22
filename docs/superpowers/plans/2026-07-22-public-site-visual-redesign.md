# Public Site Visual Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the 5 Stage 6 public routes to match the provided Stitch designs, consolidating `/life`+`/about` into one `/transparency` route and renaming `/contact` to `/booking`, replacing all placeholder branding with "Aabha Girls Hostel", expanding the public booking form within data-minimalism bounds, and adding `fonepay` as a payment method.

**Architecture:** No new tables. `site_content`/`site_media` are already flexible key-value/category stores - new sections are new keys/categories, not new schema. `bookings` gains four nullable columns. `payment_method` gains one enum value. The internal admin app (dashboard, chat, attendance, admission form fields) is explicitly untouched - this plan touches only the public route files, `PublicShell`, `SiteContentForm`, `BookingsQueue`'s display, and the fonepay option.

**Tech Stack:** Same as Stages 1-6 - React 19, Vite, TypeScript, Tailwind CSS v4, TanStack Router, `@supabase/supabase-js`, Vitest + `@testing-library/react`.

## Global Constraints

- **No new tables.** `site_content` (jsonb key/value) and `site_media` (free-text `category` column) already support every new section this plan adds - new keys/categories only.
- **`bookings`'s four new columns are all nullable** - `guardian_name`, `emergency_contact_name`, `emergency_contact_phone`, `note`, all `text`. No existing row (there may be none yet, since Stage 6 hasn't been used in production) needs a migration-time default.
- **No document uploads, no DOB/blood group/university/address fields, anywhere in this plan.** The Stitch "Digital Admission Form" screen's full field set is explicitly not built - the public Reserve-a-Bed form's field list is fixed to exactly: name, phone, guardian name, guardian phone, emergency contact name, emergency contact phone, room type, preferred date, and an optional free-text note.
- **Room feature bullets and status badges are hardcoded per `room_type` in the component**, not owner-editable content - they're structural facts about a room type (capacity, amenities), not marketing copy that changes.
- **Meal plan stays 3 meals** (breakfast/lunch/dinner) - do not add a "snacks" column or a 4th `meal_type` enum value.
- **Fee schedule is consolidated onto `/transparency` only.** `/rooms` shows only the live per-room-type starting price (already-built real data) - it must not render a second, separately-maintained fee table.
- **The internal admin app is untouched** except the two explicitly authorized exceptions: `fonepay` added to `payment_method`/`RecordPaymentForm`, and nothing else internal changes in this plan.
- **Every new/changed form follows the established try/catch + local error state pattern** already used throughout this codebase (`CheckInForm`, `PostNoticeForm`, `LinkGuardianForm` are the reference shape).
- Migrations are applied manually in the Supabase SQL Editor by the user (project `qektemgxthrxgnhfmgqg`) - no agent has DB credentials. Migration tasks end with an "apply + verify" step.
- `public/logo.png` (the real Aabha logo mark, already copied into the repo) is used in `PublicShell`'s nav and footer - not plain text, and not a new `site_media` upload (it's a static bundled asset, not owner-editable content).

---

## File Structure

```
aabha-hostel/
  public/
    logo.png                                    # already added
  supabase/
    migrations/
      0021_booking_details_and_fonepay.sql       # NEW
  src/
    lib/
      bookings.ts                                # MODIFIED: Booking type gains 4 fields
      bookings.test.ts                           # MODIFIED
      publicSite.ts                              # MODIFIED: submitBooking accepts 4 new fields
      publicSite.test.ts                         # MODIFIED
      fees.ts                                    # MODIFIED: PaymentMethod gains 'fonepay'
    components/
      admin/
        SiteContentForm.tsx                      # MODIFIED: all new site_content sections
        SiteContentForm.test.tsx                 # MODIFIED
        BookingsQueue.tsx                         # MODIFIED: show new booking fields
        BookingsQueue.test.tsx                    # MODIFIED
      fees/
        RecordPaymentForm.tsx                     # MODIFIED: fonepay option
      public/
        PublicShell.tsx                           # MODIFIED: logo, new nav, footer
        PublicShell.test.tsx                      # MODIFIED
    routes/
      _authenticated.site-content.tsx             # MODIFIED: MEDIA_CATEGORIES extended
      index.tsx                                   # MODIFIED: Home restyle
      rooms.tsx                                   # MODIFIED: Rooms & Fees restyle
      transparency.tsx                            # NEW: replaces life.tsx + about.tsx
      booking.tsx                                 # NEW: replaces contact.tsx (renamed + restyled)
      life.tsx                                    # DELETED
      about.tsx                                   # DELETED
      contact.tsx                                 # DELETED
```

---

### Task 1: Migration 0021 - `bookings` detail columns + `fonepay`

**Files:**
- Create: `supabase/migrations/0021_booking_details_and_fonepay.sql`

**Interfaces:**
- Consumes: `public.bookings` (Stage 6), `payment_method` enum (Stage 3).
- Produces: `bookings.guardian_name`, `bookings.emergency_contact_name`, `bookings.emergency_contact_phone`, `bookings.note` (all nullable `text`); `payment_method` gains `'fonepay'`.

- [ ] **Step 1: Write the migration SQL**

`supabase/migrations/0021_booking_details_and_fonepay.sql`:
```sql
-- Public site visual redesign: the Reserve-a-Bed form is expanded to
-- collect a guardian name (previously only guardian_phone existed) and
-- one emergency contact, plus an optional free-text note - still well
-- within the project's data-minimalism law (no DOB, no documents, no
-- address). All four columns are nullable; the anon insert policy's
-- with check (status = 'pending' and reserved_bed_id is null) does not
-- reference them, so it needs no change.
alter table public.bookings add column guardian_name text;
alter table public.bookings add column emergency_contact_name text;
alter table public.bookings add column emergency_contact_phone text;
alter table public.bookings add column note text;

alter type payment_method add value 'fonepay';
```

- [ ] **Step 2: Apply the migration**

Paste into the Supabase SQL Editor for project `qektemgxthrxgnhfmgqg` and run.
Expected: "Success. No rows returned."

- [ ] **Step 3: Verify**

```sql
select column_name from information_schema.columns where table_name = 'bookings' order by ordinal_position;
-- expect guardian_name, emergency_contact_name, emergency_contact_phone, note present

select enum_range(null::payment_method);
-- expect {cash,esewa,khalti,fonepay}
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0021_booking_details_and_fonepay.sql
git commit -m "feat: add booking detail columns and fonepay payment method"
```

---

### Task 2: `bookings.ts` + `publicSite.ts` - carry the new booking fields

**Files:**
- Modify: `src/lib/bookings.ts`, `src/lib/bookings.test.ts`
- Modify: `src/lib/publicSite.ts`, `src/lib/publicSite.test.ts`

**Interfaces:**
- Consumes: `bookings.guardian_name`/`emergency_contact_name`/`emergency_contact_phone`/`note` (Task 1).
- Produces:
  ```typescript
  // bookings.ts - Booking type gains 4 fields
  export type Booking = {
    id: string
    name: string
    phone: string
    guardian_name: string | null
    guardian_phone: string
    emergency_contact_name: string | null
    emergency_contact_phone: string | null
    note: string | null
    room_type: 'single' | 'twin' | 'triple'
    preferred_date: string
    status: BookingStatus
    reserved_bed_id: string | null
    created_at: string
  }
  ```
  ```typescript
  // publicSite.ts - submitBooking's input type gains 4 optional fields
  export async function submitBooking(input: {
    name: string
    phone: string
    guardianName?: string
    guardianPhone: string
    emergencyContactName?: string
    emergencyContactPhone?: string
    roomType: 'single' | 'twin' | 'triple'
    preferredDate: string
    note?: string
  }): Promise<void>
  ```
  Consumed by `BookingsQueue` (Task 5) and the `/booking` route (Task 10).

- [ ] **Step 1: Update `bookings.test.ts`**

In `src/lib/bookings.test.ts`, update the `mockBookings`/`mockApprovedBookings` fixtures to include the four new fields (use realistic values, e.g. `guardian_name: 'Guardian Sharma', emergency_contact_name: 'Aunt Gita', emergency_contact_phone: '9800000099', note: 'Arriving by evening bus'` for one row and `null` for the others), and update the type-level expectations in the existing `fetchPendingBookings`/`fetchApprovedBookings` assertions to include them (`toEqual` against the full fixture object already covers this - no new test case needed, just update the fixtures).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/bookings.test.ts`
Expected: FAIL - TypeScript error, `Booking` type doesn't have the new fields yet (or a runtime mismatch if the test file compiles loosely).

- [ ] **Step 3: Update `bookings.ts`**

Add the four fields to the `Booking` type as shown in Interfaces above (insert them between `phone`/`guardian_phone` and `room_type` to match the fixture's field order - order doesn't matter functionally, but keep it readable).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/bookings.test.ts`
Expected: PASS

- [ ] **Step 5: Update `publicSite.test.ts`**

In `src/lib/publicSite.test.ts`, update the `submitBooking` test:
```typescript
describe('submitBooking', () => {
  it('inserts a booking with the given fields, including the optional detail fields', async () => {
    const { submitBooking } = await import('./publicSite')
    await submitBooking({
      name: 'Sita',
      phone: '9800000003',
      guardianName: 'Guardian Sharma',
      guardianPhone: '9800000004',
      emergencyContactName: 'Aunt Gita',
      emergencyContactPhone: '9800000099',
      roomType: 'twin',
      preferredDate: '2026-08-01',
      note: 'Arriving by evening bus',
    })
    expect(insertMock).toHaveBeenCalledWith({
      name: 'Sita',
      phone: '9800000003',
      guardian_name: 'Guardian Sharma',
      guardian_phone: '9800000004',
      emergency_contact_name: 'Aunt Gita',
      emergency_contact_phone: '9800000099',
      room_type: 'twin',
      preferred_date: '2026-08-01',
      note: 'Arriving by evening bus',
    })
  })

  it('omits optional fields as null when not provided', async () => {
    const { submitBooking } = await import('./publicSite')
    await submitBooking({
      name: 'Sita',
      phone: '9800000003',
      guardianPhone: '9800000004',
      roomType: 'twin',
      preferredDate: '2026-08-01',
    })
    expect(insertMock).toHaveBeenCalledWith({
      name: 'Sita',
      phone: '9800000003',
      guardian_name: null,
      guardian_phone: '9800000004',
      emergency_contact_name: null,
      emergency_contact_phone: null,
      room_type: 'twin',
      preferred_date: '2026-08-01',
      note: null,
    })
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run src/lib/publicSite.test.ts`
Expected: FAIL - `submitBooking`'s insert doesn't send the new fields yet.

- [ ] **Step 7: Update `submitBooking` in `publicSite.ts`**

```typescript
export async function submitBooking(input: {
  name: string
  phone: string
  guardianName?: string
  guardianPhone: string
  emergencyContactName?: string
  emergencyContactPhone?: string
  roomType: 'single' | 'twin' | 'triple'
  preferredDate: string
  note?: string
}): Promise<void> {
  const { error } = await supabase.from('bookings').insert({
    name: input.name,
    phone: input.phone,
    guardian_name: input.guardianName ?? null,
    guardian_phone: input.guardianPhone,
    emergency_contact_name: input.emergencyContactName ?? null,
    emergency_contact_phone: input.emergencyContactPhone ?? null,
    room_type: input.roomType,
    preferred_date: input.preferredDate,
    note: input.note ?? null,
  })
  if (error) throw error
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run src/lib/publicSite.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/lib/bookings.ts src/lib/bookings.test.ts src/lib/publicSite.ts src/lib/publicSite.test.ts
git commit -m "feat: carry guardian name, emergency contact, and note through the booking flow"
```

---

### Task 3: FonePay - `fees.ts` + `RecordPaymentForm`

**Files:**
- Modify: `src/lib/fees.ts`
- Modify: `src/components/fees/RecordPaymentForm.tsx`

**Interfaces:**
- Consumes: `payment_method` enum's new `'fonepay'` value (Task 1).
- Produces: `PaymentMethod` type gains `'fonepay'`; the form gains a fourth option. No other fee-flow file changes.

- [ ] **Step 1: Update `fees.ts`**

Change:
```typescript
export type PaymentMethod = 'cash' | 'esewa' | 'khalti'
```
to:
```typescript
export type PaymentMethod = 'cash' | 'esewa' | 'khalti' | 'fonepay'
```

- [ ] **Step 2: Update `RecordPaymentForm.tsx`**

Add one option to the existing `<select id="method">`:
```tsx
<option value="fonepay">FonePay</option>
```
(placed after the existing `khalti` option).

- [ ] **Step 3: Run the full suite and build**

Run: `npx vitest run` - expect all existing tests pass unchanged (no test asserted the exhaustive option list, so this is additive).
Run: `npm run build` - expect success.

- [ ] **Step 4: Commit**

```bash
git add src/lib/fees.ts src/components/fees/RecordPaymentForm.tsx
git commit -m "feat: add FonePay as a payment method"
```

---

### Task 4: `SiteContentForm` - all new content sections

**Files:**
- Modify: `src/components/admin/SiteContentForm.tsx`, `src/components/admin/SiteContentForm.test.tsx`

**Interfaces:**
- Consumes: `updateSiteContent` (Stage 6 `lib/siteContent.ts`, unchanged).
- Produces: `SiteContentForm` now edits, in addition to the existing `hero`/`about`: `trust_stats` (4 fixed `{label, sublabel}` slots), `trust_points` (4 fixed `{title, description}` slots), `rooms_hero` (`{headline, subhead}`), `transparency_intro` (`{headline, text}`), `safety_protocol` (3 fixed `{title, description}` slots), `team` (2 fixed slots - `warden`/`owner` - each `{name, quote}`; photos are uploaded separately via `MediaGalleryManager`'s `team_warden`/`team_owner` categories, Task 5, not through this form), `fee_schedule` (4 fixed `{component, description, amount}` rows), and `contact` (`{phone, address}` - already existed as a key but had no editor UI until now).

Every section is a fixed number of slots (no add/remove UI) - this keeps the form a plain, predictable set of inputs rather than a dynamic array editor, matching the scope of what's actually needed (a known, small set of homepage/transparency sections, not an open-ended CMS).

- [ ] **Step 1: Write the failing test**

`src/components/admin/SiteContentForm.test.tsx` (replaces the existing file):
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SiteContentForm } from './SiteContentForm'

const updateSiteContent = vi.fn().mockResolvedValue(undefined)

vi.mock('../../lib/siteContent', () => ({
  updateSiteContent: (...args: unknown[]) => updateSiteContent(...args),
}))

const content = {
  hero: { headline: 'Home away from home', subhead: 'Safe, comfortable living' },
  about: { text: 'Aabha Girls Hostel...' },
  trust_stats: [
    { label: '10+ Years of Excellence', sublabel: '' },
    { label: '2 Mins from Global College', sublabel: '' },
    { label: '24/7 CCTV & Security', sublabel: '' },
    { label: 'Trusted by 500+ Families', sublabel: '' },
  ],
  trust_points: [
    { title: 'Healthy Meals', description: 'Hygienic, home-style meals.' },
    { title: 'Safe Environment', description: 'Gated community, biometric access.' },
    { title: 'Female Warden', description: '24/7 on-site female warden.' },
    { title: 'Prime Location', description: 'Steps from top colleges.' },
  ],
  rooms_hero: { headline: 'Comfortable Spaces for Focused Learning', subhead: '' },
  transparency_intro: { headline: 'Transparency is Our Commitment', text: 'We believe in radical honesty.' },
  safety_protocol: [
    { title: '24/7 CCTV Monitoring', description: 'Full coverage of common areas.' },
    { title: 'Fire Safety First', description: 'Extinguishers on every floor.' },
    { title: 'Strict Curfew Policy', description: 'Secure entry after 8:00 PM.' },
  ],
  team: {
    warden: { name: 'Mrs. Sunita Sharma', quote: 'My goal is to provide a safe environment.' },
    owner: { name: 'Ms. Aabha Shrestha', quote: 'Aabha was born from my own experience.' },
  },
  fee_schedule: [
    { component: 'Admission Fee', description: 'One-time registration', amount: 'Rs. 10,000' },
    { component: 'Monthly Rent', description: 'Varies by room type', amount: 'From Rs. 12,000' },
    { component: 'Food Charges', description: 'Includes 4 meals daily', amount: 'Rs. 8,500/mo' },
    { component: 'Refundable Deposit', description: 'Equivalent to one month rent', amount: '1 Month Rent' },
  ],
  contact: { phone: '+977 1-4XXXXXX', address: 'Mid-Baneshwor, Kathmandu' },
}

describe('SiteContentForm', () => {
  it('prefills every section from content and saves an edited hero headline', async () => {
    const onSaved = vi.fn()
    render(<SiteContentForm content={content} onSaved={onSaved} />)

    expect(screen.getByLabelText(/hero headline/i)).toHaveValue('Home away from home')
    expect(screen.getByDisplayValue('Healthy Meals')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Mrs. Sunita Sharma')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Admission Fee')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/hero headline/i), { target: { value: 'New headline' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() =>
      expect(updateSiteContent).toHaveBeenCalledWith('hero', { headline: 'New headline', subhead: 'Safe, comfortable living' }),
    )
    expect(updateSiteContent).toHaveBeenCalledWith('trust_stats', content.trust_stats)
    expect(updateSiteContent).toHaveBeenCalledWith('trust_points', content.trust_points)
    expect(updateSiteContent).toHaveBeenCalledWith('rooms_hero', content.rooms_hero)
    expect(updateSiteContent).toHaveBeenCalledWith('transparency_intro', content.transparency_intro)
    expect(updateSiteContent).toHaveBeenCalledWith('safety_protocol', content.safety_protocol)
    expect(updateSiteContent).toHaveBeenCalledWith('team', content.team)
    expect(updateSiteContent).toHaveBeenCalledWith('fee_schedule', content.fee_schedule)
    expect(updateSiteContent).toHaveBeenCalledWith('contact', content.contact)
    expect(onSaved).toHaveBeenCalled()
  })

  it('falls back to empty defaults when a key is missing entirely (first-ever save)', () => {
    render(<SiteContentForm content={{}} onSaved={vi.fn()} />)
    expect(screen.getByLabelText(/hero headline/i)).toHaveValue('')
    expect(screen.getAllByPlaceholderText(/stat label/i)).toHaveLength(4)
    expect(screen.getAllByPlaceholderText(/trust point title/i)).toHaveLength(4)
    expect(screen.getAllByPlaceholderText(/protocol title/i)).toHaveLength(3)
    expect(screen.getAllByPlaceholderText(/fee component/i)).toHaveLength(4)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/admin/SiteContentForm.test.tsx`
Expected: FAIL - the new sections don't exist yet.

- [ ] **Step 3: Write the implementation**

`src/components/admin/SiteContentForm.tsx`:
```tsx
import { useState, type FormEvent } from 'react'
import { updateSiteContent } from '../../lib/siteContent'

type HeroContent = { headline: string; subhead: string }
type AboutContent = { text: string }
type Stat = { label: string; sublabel: string }
type TrustPoint = { title: string; description: string }
type IntroContent = { headline: string; text: string }
type ProtocolItem = { title: string; description: string }
type TeamMember = { name: string; quote: string }
type Team = { warden: TeamMember; owner: TeamMember }
type FeeRow = { component: string; description: string; amount: string }
type ContactContent = { phone: string; address: string }

const EMPTY_STAT: Stat = { label: '', sublabel: '' }
const EMPTY_TRUST_POINT: TrustPoint = { title: '', description: '' }
const EMPTY_PROTOCOL: ProtocolItem = { title: '', description: '' }
const EMPTY_MEMBER: TeamMember = { name: '', quote: '' }
const EMPTY_FEE_ROW: FeeRow = { component: '', description: '', amount: '' }

function fourStats(value: unknown): Stat[] {
  const arr = Array.isArray(value) ? (value as Stat[]) : []
  return [0, 1, 2, 3].map((i) => arr[i] ?? { ...EMPTY_STAT })
}

function fourTrustPoints(value: unknown): TrustPoint[] {
  const arr = Array.isArray(value) ? (value as TrustPoint[]) : []
  return [0, 1, 2, 3].map((i) => arr[i] ?? { ...EMPTY_TRUST_POINT })
}

function threeProtocolItems(value: unknown): ProtocolItem[] {
  const arr = Array.isArray(value) ? (value as ProtocolItem[]) : []
  return [0, 1, 2].map((i) => arr[i] ?? { ...EMPTY_PROTOCOL })
}

function fourFeeRows(value: unknown): FeeRow[] {
  const arr = Array.isArray(value) ? (value as FeeRow[]) : []
  return [0, 1, 2, 3].map((i) => arr[i] ?? { ...EMPTY_FEE_ROW })
}

export function SiteContentForm({
  content,
  onSaved,
}: {
  content: Record<string, unknown>
  onSaved: () => void
}) {
  const hero = (content.hero as HeroContent) ?? { headline: '', subhead: '' }
  const about = (content.about as AboutContent) ?? { text: '' }
  const roomsHero = (content.rooms_hero as HeroContent) ?? { headline: '', subhead: '' }
  const transparencyIntro = (content.transparency_intro as IntroContent) ?? { headline: '', text: '' }
  const team = (content.team as Team) ?? { warden: { ...EMPTY_MEMBER }, owner: { ...EMPTY_MEMBER } }
  const contact = (content.contact as ContactContent) ?? { phone: '', address: '' }

  const [heroHeadline, setHeroHeadline] = useState(hero.headline)
  const [heroSubhead, setHeroSubhead] = useState(hero.subhead)
  const [aboutText, setAboutText] = useState(about.text)
  const [stats, setStats] = useState<Stat[]>(fourStats(content.trust_stats))
  const [trustPoints, setTrustPoints] = useState<TrustPoint[]>(fourTrustPoints(content.trust_points))
  const [roomsHeroHeadline, setRoomsHeroHeadline] = useState(roomsHero.headline)
  const [roomsHeroSubhead, setRoomsHeroSubhead] = useState(roomsHero.subhead)
  const [introHeadline, setIntroHeadline] = useState(transparencyIntro.headline)
  const [introText, setIntroText] = useState(transparencyIntro.text)
  const [protocolItems, setProtocolItems] = useState<ProtocolItem[]>(threeProtocolItems(content.safety_protocol))
  const [wardenName, setWardenName] = useState(team.warden?.name ?? '')
  const [wardenQuote, setWardenQuote] = useState(team.warden?.quote ?? '')
  const [ownerName, setOwnerName] = useState(team.owner?.name ?? '')
  const [ownerQuote, setOwnerQuote] = useState(team.owner?.quote ?? '')
  const [feeRows, setFeeRows] = useState<FeeRow[]>(fourFeeRows(content.fee_schedule))
  const [contactPhone, setContactPhone] = useState(contact.phone)
  const [contactAddress, setContactAddress] = useState(contact.address)
  const [error, setError] = useState<string | null>(null)

  function updateStat(index: number, field: keyof Stat, value: string) {
    setStats((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)))
  }

  function updateTrustPoint(index: number, field: keyof TrustPoint, value: string) {
    setTrustPoints((prev) => prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)))
  }

  function updateProtocolItem(index: number, field: keyof ProtocolItem, value: string) {
    setProtocolItems((prev) => prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)))
  }

  function updateFeeRow(index: number, field: keyof FeeRow, value: string) {
    setFeeRows((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await updateSiteContent('hero', { headline: heroHeadline, subhead: heroSubhead })
      await updateSiteContent('about', { text: aboutText })
      await updateSiteContent('trust_stats', stats)
      await updateSiteContent('trust_points', trustPoints)
      await updateSiteContent('rooms_hero', { headline: roomsHeroHeadline, subhead: roomsHeroSubhead })
      await updateSiteContent('transparency_intro', { headline: introHeadline, text: introText })
      await updateSiteContent('safety_protocol', protocolItems)
      await updateSiteContent('team', {
        warden: { name: wardenName, quote: wardenQuote },
        owner: { name: ownerName, quote: ownerQuote },
      })
      await updateSiteContent('fee_schedule', feeRows)
      await updateSiteContent('contact', { phone: contactPhone, address: contactAddress })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save content')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-10">
      <div className="bg-surface-container-lowest rounded-xxl shadow-premium p-8 space-y-6">
        <h3 className="font-display text-lg text-on-surface">Home Hero</h3>
        <div className="space-y-2">
          <label htmlFor="heroHeadline" className="block text-sm font-medium text-on-surface-variant">Hero Headline</label>
          <input id="heroHeadline" value={heroHeadline} onChange={(e) => setHeroHeadline(e.target.value)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" />
        </div>
        <div className="space-y-2">
          <label htmlFor="heroSubhead" className="block text-sm font-medium text-on-surface-variant">Hero Subhead</label>
          <input id="heroSubhead" value={heroSubhead} onChange={(e) => setHeroSubhead(e.target.value)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" />
        </div>
      </div>

      <div className="bg-surface-container-lowest rounded-xxl shadow-premium p-8 space-y-4">
        <h3 className="font-display text-lg text-on-surface">Trust Stats (4)</h3>
        {stats.map((stat, i) => (
          <div key={i} className="grid grid-cols-2 gap-4">
            <input aria-label={`Stat ${i + 1} label`} placeholder="Stat label" value={stat.label} onChange={(e) => updateStat(i, 'label', e.target.value)} className="bg-surface border border-outline-variant rounded-lg px-4 py-3" />
            <input aria-label={`Stat ${i + 1} sublabel`} placeholder="Stat sublabel" value={stat.sublabel} onChange={(e) => updateStat(i, 'sublabel', e.target.value)} className="bg-surface border border-outline-variant rounded-lg px-4 py-3" />
          </div>
        ))}
      </div>

      <div className="bg-surface-container-lowest rounded-xxl shadow-premium p-8 space-y-4">
        <h3 className="font-display text-lg text-on-surface">Why Parents Choose Us (4)</h3>
        {trustPoints.map((point, i) => (
          <div key={i} className="grid grid-cols-2 gap-4">
            <input aria-label={`Trust point ${i + 1} title`} placeholder="Trust point title" value={point.title} onChange={(e) => updateTrustPoint(i, 'title', e.target.value)} className="bg-surface border border-outline-variant rounded-lg px-4 py-3" />
            <input aria-label={`Trust point ${i + 1} description`} placeholder="Trust point description" value={point.description} onChange={(e) => updateTrustPoint(i, 'description', e.target.value)} className="bg-surface border border-outline-variant rounded-lg px-4 py-3" />
          </div>
        ))}
      </div>

      <div className="bg-surface-container-lowest rounded-xxl shadow-premium p-8 space-y-6">
        <h3 className="font-display text-lg text-on-surface">Rooms Page Hero</h3>
        <div className="space-y-2">
          <label htmlFor="roomsHeroHeadline" className="block text-sm font-medium text-on-surface-variant">Headline</label>
          <input id="roomsHeroHeadline" value={roomsHeroHeadline} onChange={(e) => setRoomsHeroHeadline(e.target.value)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" />
        </div>
        <div className="space-y-2">
          <label htmlFor="roomsHeroSubhead" className="block text-sm font-medium text-on-surface-variant">Subhead</label>
          <input id="roomsHeroSubhead" value={roomsHeroSubhead} onChange={(e) => setRoomsHeroSubhead(e.target.value)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" />
        </div>
      </div>

      <div className="bg-surface-container-lowest rounded-xxl shadow-premium p-8 space-y-6">
        <h3 className="font-display text-lg text-on-surface">Transparency Intro</h3>
        <div className="space-y-2">
          <label htmlFor="introHeadline" className="block text-sm font-medium text-on-surface-variant">Headline</label>
          <input id="introHeadline" value={introHeadline} onChange={(e) => setIntroHeadline(e.target.value)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" />
        </div>
        <div className="space-y-2">
          <label htmlFor="introText" className="block text-sm font-medium text-on-surface-variant">Text</label>
          <textarea id="introText" value={introText} onChange={(e) => setIntroText(e.target.value)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" />
        </div>
      </div>

      <div className="bg-surface-container-lowest rounded-xxl shadow-premium p-8 space-y-4">
        <h3 className="font-display text-lg text-on-surface">Safety Protocol (3)</h3>
        {protocolItems.map((item, i) => (
          <div key={i} className="grid grid-cols-2 gap-4">
            <input aria-label={`Protocol ${i + 1} title`} placeholder="Protocol title" value={item.title} onChange={(e) => updateProtocolItem(i, 'title', e.target.value)} className="bg-surface border border-outline-variant rounded-lg px-4 py-3" />
            <input aria-label={`Protocol ${i + 1} description`} placeholder="Protocol description" value={item.description} onChange={(e) => updateProtocolItem(i, 'description', e.target.value)} className="bg-surface border border-outline-variant rounded-lg px-4 py-3" />
          </div>
        ))}
      </div>

      <div className="bg-surface-container-lowest rounded-xxl shadow-premium p-8 space-y-6">
        <h3 className="font-display text-lg text-on-surface">Team Bios</h3>
        <div className="space-y-2">
          <label htmlFor="wardenName" className="block text-sm font-medium text-on-surface-variant">Warden Name</label>
          <input id="wardenName" value={wardenName} onChange={(e) => setWardenName(e.target.value)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" />
        </div>
        <div className="space-y-2">
          <label htmlFor="wardenQuote" className="block text-sm font-medium text-on-surface-variant">Warden Quote</label>
          <textarea id="wardenQuote" value={wardenQuote} onChange={(e) => setWardenQuote(e.target.value)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" />
        </div>
        <div className="space-y-2">
          <label htmlFor="ownerName" className="block text-sm font-medium text-on-surface-variant">Owner Name</label>
          <input id="ownerName" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" />
        </div>
        <div className="space-y-2">
          <label htmlFor="ownerQuote" className="block text-sm font-medium text-on-surface-variant">Owner Quote</label>
          <textarea id="ownerQuote" value={ownerQuote} onChange={(e) => setOwnerQuote(e.target.value)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" />
        </div>
        <p className="text-xs text-on-surface-variant">Upload warden/owner photos below under Photos - "team_warden" / "team_owner".</p>
      </div>

      <div className="bg-surface-container-lowest rounded-xxl shadow-premium p-8 space-y-4">
        <h3 className="font-display text-lg text-on-surface">Fee Schedule (4)</h3>
        {feeRows.map((row, i) => (
          <div key={i} className="grid grid-cols-3 gap-4">
            <input aria-label={`Fee ${i + 1} component`} placeholder="Fee component" value={row.component} onChange={(e) => updateFeeRow(i, 'component', e.target.value)} className="bg-surface border border-outline-variant rounded-lg px-4 py-3" />
            <input aria-label={`Fee ${i + 1} description`} placeholder="Fee description" value={row.description} onChange={(e) => updateFeeRow(i, 'description', e.target.value)} className="bg-surface border border-outline-variant rounded-lg px-4 py-3" />
            <input aria-label={`Fee ${i + 1} amount`} placeholder="Fee amount" value={row.amount} onChange={(e) => updateFeeRow(i, 'amount', e.target.value)} className="bg-surface border border-outline-variant rounded-lg px-4 py-3" />
          </div>
        ))}
      </div>

      <div className="bg-surface-container-lowest rounded-xxl shadow-premium p-8 space-y-6">
        <h3 className="font-display text-lg text-on-surface">Contact</h3>
        <div className="space-y-2">
          <label htmlFor="contactPhone" className="block text-sm font-medium text-on-surface-variant">Phone</label>
          <input id="contactPhone" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" />
        </div>
        <div className="space-y-2">
          <label htmlFor="contactAddress" className="block text-sm font-medium text-on-surface-variant">Address</label>
          <input id="contactAddress" value={contactAddress} onChange={(e) => setContactAddress(e.target.value)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" />
        </div>
      </div>

      {error && <p className="text-error text-sm">{error}</p>}
      <button type="submit" className="w-full bg-primary text-on-primary py-4 rounded-full font-medium active:scale-95 transition-transform">
        Save All Content
      </button>
    </form>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/admin/SiteContentForm.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/SiteContentForm.tsx src/components/admin/SiteContentForm.test.tsx
git commit -m "feat: extend SiteContentForm with all public-site content sections"
```

---

### Task 5: Media categories + `BookingsQueue` detail display

**Files:**
- Modify: `src/routes/_authenticated.site-content.tsx`
- Modify: `src/components/admin/BookingsQueue.tsx`, `src/components/admin/BookingsQueue.test.tsx`

**Interfaces:**
- Consumes: `Booking`'s new fields (Task 2).
- Produces: `MEDIA_CATEGORIES` extended; `BookingsQueue` renders the new fields when present.

- [ ] **Step 1: Extend `MEDIA_CATEGORIES`**

In `src/routes/_authenticated.site-content.tsx`, change:
```typescript
const MEDIA_CATEGORIES = ['highlight', 'room_single', 'room_twin', 'room_triple', 'facility'] as const
```
to:
```typescript
const MEDIA_CATEGORIES = ['hero', 'rooms_hero', 'team_warden', 'team_owner', 'highlight', 'room_single', 'room_twin', 'room_triple', 'facility'] as const
```

- [ ] **Step 2: Write the failing test for `BookingsQueue`**

Add to `src/components/admin/BookingsQueue.test.tsx` (extend the existing `bookings` fixture to include the new fields, then add a new test case):
```tsx
it('shows guardian name, emergency contact, and note when present', () => {
  const bookingWithDetails: Booking = {
    ...bookings[0],
    guardian_name: 'Guardian Sharma',
    emergency_contact_name: 'Aunt Gita',
    emergency_contact_phone: '9800000099',
    note: 'Arriving by evening bus',
  }
  render(<BookingsQueue bookings={[bookingWithDetails]} vacantBedsByType={() => vacantBeds} onDecided={vi.fn()} />)
  expect(screen.getByText(/Guardian Sharma/)).toBeInTheDocument()
  expect(screen.getByText(/Aunt Gita/)).toBeInTheDocument()
  expect(screen.getByText(/Arriving by evening bus/)).toBeInTheDocument()
})
```
(Update the existing `bookings` fixture array's objects to include `guardian_name: null, emergency_contact_name: null, emergency_contact_phone: null, note: null` so the type checks.)

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/components/admin/BookingsQueue.test.tsx`
Expected: FAIL - the new fields aren't rendered yet.

- [ ] **Step 4: Update `BookingsQueue.tsx`**

In `BookingRow`'s JSX, after the existing `room_type`/`preferred_date` line, add:
```tsx
{booking.guardian_name && <p className="text-on-surface-variant text-sm">Guardian: {booking.guardian_name}</p>}
{booking.emergency_contact_name && (
  <p className="text-on-surface-variant text-sm">
    Emergency contact: {booking.emergency_contact_name}{booking.emergency_contact_phone ? ` (${booking.emergency_contact_phone})` : ''}
  </p>
)}
{booking.note && <p className="text-on-surface-variant text-sm italic">"{booking.note}"</p>}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/components/admin/BookingsQueue.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/routes/_authenticated.site-content.tsx src/components/admin/BookingsQueue.tsx src/components/admin/BookingsQueue.test.tsx
git commit -m "feat: add new media categories and show booking details in the admin queue"
```

---

### Task 6: `PublicShell` - logo, nav, footer

**Files:**
- Modify: `src/components/public/PublicShell.tsx`, `src/components/public/PublicShell.test.tsx`

**Interfaces:**
- Consumes: `public/logo.png` (static asset, already in the repo).
- Produces: `PublicShell` now renders the real logo, the four-item nav (Home/Transparency/Rooms & Fees/Booking), a "Book a Visit" CTA, and a full footer - consumed by every public route (Tasks 7-10).

- [ ] **Step 1: Update the failing test**

Replace `src/components/public/PublicShell.test.tsx`'s assertions to match the new nav:
```tsx
describe('PublicShell', () => {
  it('renders the logo, nav links to every public page, a Book a Visit CTA, and the children', async () => {
    render(
      <PublicShell>
        <p>Page content</p>
      </PublicShell>,
      // ... existing RouterProvider wrapper stays as-is, just update the route paths registered to /, /transparency, /rooms, /booking
    )
    expect(screen.getByAltText(/aabha girls hostel/i)).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: /^home$/i })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: /transparency/i })).toHaveAttribute('href', '/transparency')
    expect(screen.getByRole('link', { name: /rooms & fees/i })).toHaveAttribute('href', '/rooms')
    expect(screen.getByRole('link', { name: /^booking$/i })).toHaveAttribute('href', '/booking')
    expect(screen.getByRole('link', { name: /book a visit/i })).toHaveAttribute('href', '/booking')
    expect(screen.getByText('Page content')).toBeInTheDocument()
    expect(screen.getByText(/aabha girls hostel/i)).toBeInTheDocument()
  })
})
```
(Keep the existing inline `createRootRoute`/`createRoute`/`createRouter`/`RouterProvider` scaffold from the current file - just register `/`, `/transparency`, `/rooms`, `/booking` as the test routes instead of `/`, `/rooms`, `/life`, `/about`, `/contact`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/public/PublicShell.test.tsx`
Expected: FAIL - old nav labels/paths still present.

- [ ] **Step 3: Write the implementation**

`src/components/public/PublicShell.tsx`:
```tsx
import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'

export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <nav className="flex items-center gap-8 px-gutter py-4 border-b border-outline-variant bg-surface/90 backdrop-blur">
        <Link to="/" className="flex items-center gap-3">
          <img src="/logo.png" alt="Aabha Girls Hostel" className="h-10 w-10 rounded-lg" />
          <span className="font-display text-xl text-primary">Aabha Girls Hostel</span>
        </Link>
        <div className="flex gap-6 ml-auto text-on-surface-variant text-sm uppercase tracking-wide">
          <Link to="/">Home</Link>
          <Link to="/transparency">Transparency</Link>
          <Link to="/rooms">Rooms & Fees</Link>
          <Link to="/booking">Booking</Link>
        </div>
        <Link to="/booking" className="bg-primary text-on-primary px-6 py-2.5 rounded-full font-medium text-sm active:scale-95 transition-transform">
          Book a Visit
        </Link>
      </nav>

      <main className="flex-1 px-gutter py-section-gap max-w-container-max mx-auto w-full">{children}</main>

      <footer className="bg-surface-container-low px-gutter py-16 mt-auto">
        <div className="max-w-container-max mx-auto grid grid-cols-1 md:grid-cols-3 gap-12">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <img src="/logo.png" alt="Aabha Girls Hostel" className="h-8 w-8 rounded" />
              <span className="font-display text-lg text-primary">Aabha Girls Hostel</span>
            </div>
            <p className="text-on-surface-variant text-sm max-w-xs">
              Nepal's premier boutique girls' hostel, dedicated to providing a safe, hygienic, and nurturing environment.
            </p>
          </div>
          <div className="space-y-2 text-sm">
            <p className="uppercase tracking-wide text-xs text-on-surface-variant">Explore</p>
            <Link to="/rooms" className="block text-on-surface-variant hover:text-primary">Rooms &amp; Pricing</Link>
            <Link to="/transparency" className="block text-on-surface-variant hover:text-primary">Facilities &amp; Amenities</Link>
            <Link to="/transparency" className="block text-on-surface-variant hover:text-primary">Rules &amp; Regulations</Link>
            <Link to="/booking" className="block text-on-surface-variant hover:text-primary">Book a Visit</Link>
          </div>
          <div className="space-y-2 text-sm">
            <p className="uppercase tracking-wide text-xs text-on-surface-variant">Location</p>
            <p className="text-on-surface-variant">Mid-Baneshwor, Kathmandu</p>
            <p className="text-on-surface-variant">Opposite Global College</p>
          </div>
        </div>
        <p className="text-center text-xs text-on-surface-variant mt-12">
          © {new Date().getFullYear()} Aabha Girls Hostel. All rights reserved.
        </p>
      </footer>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/public/PublicShell.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/public/PublicShell.tsx src/components/public/PublicShell.test.tsx
git commit -m "feat: restyle PublicShell with the real logo, new nav, and a full footer"
```

---

### Task 7: Home page restyle

**Files:**
- Modify: `src/routes/index.tsx`

**Interfaces:**
- Consumes: `fetchPublicSiteContent`, `fetchPublicMedia`, `fetchPublicReviews`, `fetchPublicRoomAvailability` (Stage 6 `lib/publicSite.ts`), `PublicShell` (Task 6), `content.trust_stats`/`content.trust_points` (Task 4).
- Produces: no new exports - route content only.

- [ ] **Step 1: Replace `src/routes/index.tsx`**

```tsx
import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import {
  fetchPublicSiteContent,
  fetchPublicMedia,
  fetchPublicReviews,
  fetchPublicRoomAvailability,
  type PublicMediaItem,
  type PublicReview,
  type PublicRoomAvailability,
} from '../lib/publicSite'
import { PublicShell } from '../components/public/PublicShell'

type Stat = { label: string; sublabel: string }
type TrustPoint = { title: string; description: string }

function HomePage() {
  const [content, setContent] = useState<Record<string, unknown>>({})
  const [highlights, setHighlights] = useState<PublicMediaItem[]>([])
  const [reviews, setReviews] = useState<PublicReview[]>([])
  const [availability, setAvailability] = useState<PublicRoomAvailability[]>([])

  useEffect(() => {
    fetchPublicSiteContent().then(setContent)
    fetchPublicMedia('highlight').then(setHighlights)
    fetchPublicReviews().then(setReviews)
    fetchPublicRoomAvailability().then(setAvailability)
  }, [])

  const hero = (content.hero as { headline?: string; subhead?: string } | undefined) ?? {}
  const stats = (content.trust_stats as Stat[] | undefined) ?? []
  const trustPoints = (content.trust_points as TrustPoint[] | undefined) ?? []
  const contact = (content.contact as { phone?: string } | undefined) ?? {}

  return (
    <PublicShell>
      <div className="space-y-20">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <span className="inline-block bg-secondary-container text-secondary text-xs font-medium uppercase tracking-wide px-4 py-1.5 rounded-full">
              Boutique Residence for Women
            </span>
            <h1 className="font-display text-4xl md:text-5xl text-on-surface leading-tight">{hero.headline ?? 'A Safe Home Away From Home for Your Daughter'}</h1>
            <p className="text-on-surface-variant text-lg max-w-lg">{hero.subhead}</p>
            <div className="flex gap-4">
              <Link to="/booking" className="bg-primary text-on-primary px-8 py-4 rounded-full font-medium active:scale-95 transition-transform">Book a Visit</Link>
              <Link to="/rooms" className="border border-outline text-on-surface px-8 py-4 rounded-full font-medium active:scale-95 transition-transform">View Rooms</Link>
            </div>
          </div>
          {highlights[0] && (
            <img src={highlights[0].url} alt={highlights[0].caption ?? ''} className="rounded-xxl w-full h-96 object-cover shadow-premium-lg" loading="lazy" />
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 bg-surface-container-low rounded-xxl p-8">
          {stats.map((stat, i) => (
            <div key={i} className="text-center space-y-1">
              <p className="font-display text-lg text-on-surface">{stat.label}</p>
              <p className="text-on-surface-variant text-xs">{stat.sublabel}</p>
            </div>
          ))}
        </div>

        <div className="space-y-8 text-center">
          <p className="text-secondary text-xs uppercase tracking-wide">Our Commitment</p>
          <h2 className="font-display text-3xl text-on-surface">Why Parents Choose Aabha</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {trustPoints.map((point, i) => (
              <div key={i} className="bg-surface-container-lowest rounded-xxl shadow-premium p-6 text-left space-y-2">
                <h3 className="font-display text-lg text-on-surface">{point.title}</h3>
                <p className="text-on-surface-variant text-sm">{point.description}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-8">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-secondary text-xs uppercase tracking-wide">The Sanctuary Rooms</p>
              <h2 className="font-display text-3xl text-on-surface">Designed for Focus and Comfort</h2>
            </div>
            <Link to="/rooms" className="text-primary font-medium hover:underline">View All Details →</Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {availability.map((room) => (
              <div key={room.room_type} className="bg-surface-container-lowest rounded-xxl shadow-premium overflow-hidden">
                <img
                  src={highlights.find((h) => h.category === `room_${room.room_type}`)?.url}
                  alt={room.room_type}
                  className="w-full h-48 object-cover"
                  loading="lazy"
                />
                <div className="p-6 space-y-1">
                  <h3 className="font-display text-lg text-on-surface capitalize">{room.room_type} Sharing</h3>
                  <p className="text-primary font-medium">NPR {room.monthly_price} / month</p>
                  <p className="text-on-surface-variant text-sm">{room.beds_available} beds left</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {reviews.length > 0 && (
          <div className="space-y-6">
            <h2 className="font-display text-2xl text-on-surface">What Families Say</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {reviews.map((review) => (
                <div key={review.id} className="bg-surface-container-lowest rounded-xxl shadow-premium p-6">
                  <p className="text-on-surface">{review.quote}</p>
                  <p className="text-on-surface-variant text-sm mt-2">- {review.author_name}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-surface-container-low rounded-xxl p-12 text-center space-y-6">
          <h2 className="font-display text-3xl text-on-surface">Ready to give her the best living experience?</h2>
          <p className="text-on-surface-variant max-w-xl mx-auto">Take a personalized tour of our facilities and see why Aabha is the preferred choice for parents.</p>
          <div className="flex justify-center gap-4">
            <Link to="/booking" className="bg-primary text-on-primary px-8 py-4 rounded-full font-medium active:scale-95 transition-transform">Schedule an In-Person Visit</Link>
            {contact.phone && (
              <a href={`tel:${contact.phone}`} className="border border-outline text-on-surface px-8 py-4 rounded-full font-medium active:scale-95 transition-transform">Call for Inquiry</a>
            )}
          </div>
        </div>
      </div>
    </PublicShell>
  )
}

export const Route = createFileRoute('/')({
  component: HomePage,
})
```

- [ ] **Step 2: Run the full suite and build**

Run: `npx vitest run` - expect all tests pass.
Run: `npm run build` - expect success.

- [ ] **Step 3: Commit**

```bash
git add src/routes/index.tsx
git commit -m "feat: restyle the public home page to match the Stitch design"
```

---

### Task 8: Rooms & Fees page restyle

**Files:**
- Modify: `src/routes/rooms.tsx`

**Interfaces:**
- Consumes: `fetchPublicRoomAvailability`, `fetchPublicMedia`, `fetchPublicSiteContent` (Stage 6 `lib/publicSite.ts`), `PublicShell` (Task 6), `content.rooms_hero` (Task 4).
- Produces: no new exports - route content only. Feature bullets and badges are hardcoded per `room_type`, per Global Constraints.

- [ ] **Step 1: Replace `src/routes/rooms.tsx`**

```tsx
import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { fetchPublicRoomAvailability, fetchPublicMedia, fetchPublicSiteContent, type PublicRoomAvailability, type PublicMediaItem } from '../lib/publicSite'
import { PublicShell } from '../components/public/PublicShell'

const ROOM_FEATURES: Record<string, string[]> = {
  single: ['1 Person Capacity', 'High Speed Fiber WiFi', 'Private Study Desk', 'Spacious Cupboard'],
  twin: ['2 Persons Sharing', 'Dedicated Hub Access', 'Dual Workstations', 'Partitioned Wardrobe'],
  triple: ['3 Persons Sharing', 'Shared High Speed WiFi', 'Modular Study Ledge', 'Individual Lockers'],
}

const ROOM_BADGES: Record<string, string> = {
  single: 'Available',
  twin: 'Popular',
  triple: 'Value',
}

function RoomsPage() {
  const [availability, setAvailability] = useState<PublicRoomAvailability[]>([])
  const [media, setMedia] = useState<PublicMediaItem[]>([])
  const [content, setContent] = useState<Record<string, unknown>>({})

  useEffect(() => {
    fetchPublicRoomAvailability().then(setAvailability)
    fetchPublicMedia().then(setMedia)
    fetchPublicSiteContent().then(setContent)
  }, [])

  const heroContent = (content.rooms_hero as { headline?: string; subhead?: string } | undefined) ?? {}
  const heroImage = media.find((m) => m.category === 'rooms_hero')?.url

  return (
    <PublicShell>
      <div className="space-y-16">
        <div className="relative rounded-xxl overflow-hidden h-80">
          {heroImage && <img src={heroImage} alt="" className="absolute inset-0 w-full h-full object-cover" />}
          <div className="absolute inset-0 bg-inverse-surface/50 flex flex-col justify-center items-center text-center px-8 space-y-2">
            <h1 className="font-display text-4xl text-inverse-on-surface">{heroContent.headline ?? 'Comfortable Spaces for Focused Learning'}</h1>
            <p className="text-inverse-on-surface/90 max-w-xl">{heroContent.subhead}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {availability.map((room) => (
            <div key={room.room_type} className="bg-surface-container-lowest rounded-xxl shadow-premium overflow-hidden">
              <div className="relative">
                <img src={media.find((m) => m.category === `room_${room.room_type}`)?.url} alt={room.room_type} className="w-full h-44 object-cover" loading="lazy" />
                <span className="absolute top-3 left-3 bg-primary-container text-on-primary-container text-xs font-medium px-3 py-1 rounded-full uppercase">
                  {ROOM_BADGES[room.room_type]}
                </span>
              </div>
              <div className="p-6 space-y-3">
                <h3 className="font-display text-xl text-on-surface capitalize">{room.room_type} {room.room_type === 'single' ? 'Premium' : room.room_type === 'twin' ? 'Sharing' : 'Social'}</h3>
                <ul className="space-y-1 text-sm text-on-surface-variant">
                  {ROOM_FEATURES[room.room_type]?.map((feature) => (
                    <li key={feature}>• {feature}</li>
                  ))}
                </ul>
                <div className="flex justify-between items-center pt-3 border-t border-outline-variant">
                  <div>
                    <p className="text-xs text-on-surface-variant">Starting from</p>
                    <p className="text-primary font-medium">NPR {room.monthly_price}/mo</p>
                  </div>
                  <Link to="/booking" className="bg-primary text-on-primary w-10 h-10 rounded-full flex items-center justify-center">→</Link>
                </div>
                <p className="text-on-surface text-sm font-medium">{room.beds_available} beds left</p>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-surface-container-low rounded-xxl p-12 text-center space-y-6">
          <h2 className="font-display text-3xl text-on-surface">Ready to Experience Aabha Girls Hostel?</h2>
          <div className="flex justify-center gap-4">
            <Link to="/booking" className="bg-primary text-on-primary px-8 py-4 rounded-full font-medium active:scale-95 transition-transform">Schedule a Private Tour</Link>
            <Link to="/transparency" className="border border-outline text-on-surface px-8 py-4 rounded-full font-medium active:scale-95 transition-transform">See Full Fee Schedule</Link>
          </div>
        </div>
      </div>
    </PublicShell>
  )
}

export const Route = createFileRoute('/rooms')({
  component: RoomsPage,
})
```

- [ ] **Step 2: Run the full suite and build**

Run: `npx vitest run` - expect all tests pass.
Run: `npm run build` - expect success.

- [ ] **Step 3: Commit**

```bash
git add src/routes/rooms.tsx
git commit -m "feat: restyle the public rooms page to match the Stitch design"
```

---

### Task 9: `/transparency` route (replaces `/life` + `/about`)

**Files:**
- Create: `src/routes/transparency.tsx`
- Delete: `src/routes/life.tsx`, `src/routes/about.tsx`

**Interfaces:**
- Consumes: `fetchPublicWeeklyMenu`, `fetchPublicSiteContent`, `fetchPublicMedia` (Stage 6 `lib/publicSite.ts`), `PublicShell` (Task 6), `content.transparency_intro`/`safety_protocol`/`team`/`fee_schedule`/`contact` (Task 4).
- Produces: no new exports - route content only. This is the ONE page with a fee schedule table, per Global Constraints.

- [ ] **Step 1: Delete the old routes**

```bash
git rm src/routes/life.tsx src/routes/about.tsx
```

- [ ] **Step 2: Create `src/routes/transparency.tsx`**

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { fetchPublicWeeklyMenu, fetchPublicSiteContent, fetchPublicMedia, type PublicMenuItem, type PublicMediaItem } from '../lib/publicSite'
import { PublicShell } from '../components/public/PublicShell'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MEALS = ['breakfast', 'lunch', 'dinner'] as const

type ProtocolItem = { title: string; description: string }
type TeamMember = { name: string; quote: string }
type FeeRow = { component: string; description: string; amount: string }

function TransparencyPage() {
  const [menu, setMenu] = useState<PublicMenuItem[]>([])
  const [content, setContent] = useState<Record<string, unknown>>({})
  const [media, setMedia] = useState<PublicMediaItem[]>([])

  useEffect(() => {
    fetchPublicWeeklyMenu().then(setMenu)
    fetchPublicSiteContent().then(setContent)
    fetchPublicMedia().then(setMedia)
  }, [])

  const intro = (content.transparency_intro as { headline?: string; text?: string } | undefined) ?? {}
  const protocolItems = (content.safety_protocol as ProtocolItem[] | undefined) ?? []
  const team = (content.team as { warden?: TeamMember; owner?: TeamMember } | undefined) ?? {}
  const feeRows = (content.fee_schedule as FeeRow[] | undefined) ?? []
  const contact = (content.contact as { phone?: string; address?: string } | undefined) ?? {}
  const wardenPhoto = media.find((m) => m.category === 'team_warden')?.url
  const ownerPhoto = media.find((m) => m.category === 'team_owner')?.url

  return (
    <PublicShell>
      <div className="space-y-16">
        <div className="space-y-3 max-w-2xl">
          <h1 className="font-display text-3xl text-on-surface">{intro.headline ?? 'Transparency is Our Commitment'}</h1>
          <p className="text-on-surface-variant">{intro.text}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 bg-surface-container-lowest rounded-xxl shadow-premium overflow-hidden overflow-x-auto">
            <h2 className="font-display text-lg text-on-surface p-6 pb-0">Weekly Meal Plan</h2>
            <table className="w-full text-left text-sm mt-4">
              <thead className="text-on-surface-variant uppercase text-xs">
                <tr>
                  <th className="px-6 py-3">Day</th>
                  {MEALS.map((meal) => (
                    <th key={meal} className="px-6 py-3 capitalize">{meal}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {DAYS.map((dayName, dayOfWeek) => (
                  <tr key={dayName}>
                    <td className="px-6 py-3 font-medium text-on-surface">{dayName}</td>
                    {MEALS.map((meal) => (
                      <td key={meal} className="px-6 py-3 text-on-surface-variant">
                        {menu.find((m) => m.day_of_week === dayOfWeek && m.meal === meal)?.description ?? ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-primary text-on-primary rounded-xxl p-6 space-y-4">
            <h2 className="font-display text-lg">Our Safety Protocol</h2>
            {protocolItems.map((item, i) => (
              <div key={i} className="space-y-1">
                <p className="font-medium">{item.title}</p>
                <p className="text-sm opacity-90">{item.description}</p>
              </div>
            ))}
            {contact.phone && (
              <div className="pt-4 border-t border-on-primary/20">
                <p className="text-xs uppercase tracking-wide opacity-80">Emergency Support</p>
                <a href={`tel:${contact.phone}`} className="font-medium">{contact.phone}</a>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-8">
          <h2 className="font-display text-2xl text-on-surface text-center">The Hearts Behind the House</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {team.warden && (
              <div className="bg-surface-container-lowest rounded-xxl shadow-premium p-6 flex gap-4">
                {wardenPhoto && <img src={wardenPhoto} alt={team.warden.name} className="w-20 h-20 rounded-full object-cover flex-shrink-0" />}
                <div>
                  <p className="text-xs uppercase tracking-wide text-secondary">Hostel Warden</p>
                  <p className="font-display text-lg text-on-surface">{team.warden.name}</p>
                  <p className="text-on-surface-variant text-sm mt-1">"{team.warden.quote}"</p>
                </div>
              </div>
            )}
            {team.owner && (
              <div className="bg-surface-container-lowest rounded-xxl shadow-premium p-6 flex gap-4">
                {ownerPhoto && <img src={ownerPhoto} alt={team.owner.name} className="w-20 h-20 rounded-full object-cover flex-shrink-0" />}
                <div>
                  <p className="text-xs uppercase tracking-wide text-secondary">Founder &amp; Owner</p>
                  <p className="font-display text-lg text-on-surface">{team.owner.name}</p>
                  <p className="text-on-surface-variant text-sm mt-1">"{team.owner.quote}"</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="bg-surface-container-low rounded-xxl p-8 space-y-6">
          <h2 className="font-display text-2xl text-on-surface">Clear Fee Structure</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {feeRows.map((row, i) => (
              <div key={i} className="bg-surface-container-lowest rounded-xxl p-6 flex justify-between items-center">
                <div>
                  <p className="font-medium text-on-surface">{row.component}</p>
                  <p className="text-on-surface-variant text-sm">{row.description}</p>
                </div>
                <p className="text-primary font-display text-lg">{row.amount}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PublicShell>
  )
}

export const Route = createFileRoute('/transparency')({
  component: TransparencyPage,
})
```

- [ ] **Step 3: Run `npm run dev` once to regenerate `routeTree.gen.ts`**

Run: `npm run dev`, wait for it to finish generating, stop it. This both registers `/transparency` and removes the now-deleted `/life`/`/about` entries.

- [ ] **Step 4: Run the full suite and build**

Run: `npx vitest run` - expect all tests pass.
Run: `npm run build` - expect success.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: replace /life and /about with a single /transparency page"
```

---

### Task 10: `/booking` route (renamed from `/contact`, restyled, expanded fields)

**Files:**
- Create: `src/routes/booking.tsx`
- Delete: `src/routes/contact.tsx`

**Interfaces:**
- Consumes: `submitInquiry`, `submitBooking` (Task 2's expanded signature), `fetchPublicSiteContent` (Stage 6 `lib/publicSite.ts`), `PublicShell` (Task 6).
- Produces: no new exports - route content only. This is the last task; after it, the public site is fully restyled.

- [ ] **Step 1: Delete the old route**

```bash
git rm src/routes/contact.tsx
```

- [ ] **Step 2: Create `src/routes/booking.tsx`**

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState, type FormEvent } from 'react'
import { submitInquiry, submitBooking, fetchPublicSiteContent } from '../lib/publicSite'
import { PublicShell } from '../components/public/PublicShell'

function BookingPage() {
  const [content, setContent] = useState<Record<string, unknown>>({})

  useEffect(() => {
    fetchPublicSiteContent().then(setContent)
  }, [])

  const contact = (content.contact as { phone?: string } | undefined) ?? {}

  const [inquiryName, setInquiryName] = useState('')
  const [inquiryPhone, setInquiryPhone] = useState('')
  const [inquiryMessage, setInquiryMessage] = useState('')
  const [inquirySent, setInquirySent] = useState(false)
  const [inquiryError, setInquiryError] = useState<string | null>(null)

  const [bookingName, setBookingName] = useState('')
  const [bookingPhone, setBookingPhone] = useState('')
  const [guardianName, setGuardianName] = useState('')
  const [guardianPhone, setGuardianPhone] = useState('')
  const [emergencyContactName, setEmergencyContactName] = useState('')
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('')
  const [roomType, setRoomType] = useState<'single' | 'twin' | 'triple'>('single')
  const [preferredDate, setPreferredDate] = useState('')
  const [note, setNote] = useState('')
  const [bookingSent, setBookingSent] = useState(false)
  const [bookingError, setBookingError] = useState<string | null>(null)

  async function handleInquirySubmit(e: FormEvent) {
    e.preventDefault()
    setInquiryError(null)
    try {
      await submitInquiry({ name: inquiryName, phone: inquiryPhone, message: inquiryMessage || undefined })
      setInquirySent(true)
    } catch (err) {
      setInquiryError(err instanceof Error ? err.message : 'Could not send inquiry')
    }
  }

  async function handleBookingSubmit(e: FormEvent) {
    e.preventDefault()
    setBookingError(null)
    try {
      await submitBooking({
        name: bookingName,
        phone: bookingPhone,
        guardianName: guardianName || undefined,
        guardianPhone,
        emergencyContactName: emergencyContactName || undefined,
        emergencyContactPhone: emergencyContactPhone || undefined,
        roomType,
        preferredDate,
        note: note || undefined,
      })
      setBookingSent(true)
    } catch (err) {
      setBookingError(err instanceof Error ? err.message : 'Could not send reservation request')
    }
  }

  return (
    <PublicShell>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <section className="bg-surface-container-lowest rounded-xxl shadow-premium p-8 space-y-6">
            <h2 className="font-display text-xl text-on-surface">Ask a Question</h2>
            {inquirySent ? (
              <p className="text-primary">Thanks - we'll get back to you soon.</p>
            ) : (
              <form onSubmit={handleInquirySubmit} className="space-y-4">
                <input value={inquiryName} onChange={(e) => setInquiryName(e.target.value)} placeholder="Name" className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" required />
                <input value={inquiryPhone} onChange={(e) => setInquiryPhone(e.target.value)} placeholder="Phone" className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" required />
                <textarea value={inquiryMessage} onChange={(e) => setInquiryMessage(e.target.value)} placeholder="Message" className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" />
                {inquiryError && <p className="text-error text-sm">{inquiryError}</p>}
                <button type="submit" className="w-full bg-primary text-on-primary py-4 rounded-full font-medium active:scale-95 transition-transform">Send Inquiry</button>
              </form>
            )}
          </section>

          <section className="bg-surface-container-lowest rounded-xxl shadow-premium p-8 space-y-6">
            <h2 className="font-display text-xl text-on-surface">Reserve a Bed</h2>
            {bookingSent ? (
              <p className="text-primary">Reservation request sent - we'll confirm shortly.</p>
            ) : (
              <form onSubmit={handleBookingSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <input value={bookingName} onChange={(e) => setBookingName(e.target.value)} placeholder="Student Name" className="bg-surface border border-outline-variant rounded-lg px-4 py-3" required />
                  <input value={bookingPhone} onChange={(e) => setBookingPhone(e.target.value)} placeholder="Student Phone" className="bg-surface border border-outline-variant rounded-lg px-4 py-3" required />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <input value={guardianName} onChange={(e) => setGuardianName(e.target.value)} placeholder="Guardian Name" className="bg-surface border border-outline-variant rounded-lg px-4 py-3" />
                  <input value={guardianPhone} onChange={(e) => setGuardianPhone(e.target.value)} placeholder="Guardian Phone" className="bg-surface border border-outline-variant rounded-lg px-4 py-3" required />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <input value={emergencyContactName} onChange={(e) => setEmergencyContactName(e.target.value)} placeholder="Emergency Contact Name" className="bg-surface border border-outline-variant rounded-lg px-4 py-3" />
                  <input value={emergencyContactPhone} onChange={(e) => setEmergencyContactPhone(e.target.value)} placeholder="Emergency Contact Phone" className="bg-surface border border-outline-variant rounded-lg px-4 py-3" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <select value={roomType} onChange={(e) => setRoomType(e.target.value as typeof roomType)} className="bg-surface border border-outline-variant rounded-lg px-4 py-3">
                    <option value="single">Single</option>
                    <option value="twin">Twin</option>
                    <option value="triple">Triple</option>
                  </select>
                  <input type="date" value={preferredDate} onChange={(e) => setPreferredDate(e.target.value)} className="bg-surface border border-outline-variant rounded-lg px-4 py-3" required />
                </div>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything we should know? (optional)" className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" />
                {bookingError && <p className="text-error text-sm">{bookingError}</p>}
                <button type="submit" className="w-full bg-primary text-on-primary py-4 rounded-full font-medium active:scale-95 transition-transform">Reserve a Bed</button>
              </form>
            )}
          </section>
        </div>

        <aside className="bg-surface-container-low rounded-xxl p-8 space-y-3 h-fit">
          <h3 className="font-display text-lg text-on-surface">Need Help?</h3>
          <p className="text-on-surface-variant text-sm">Our concierge is available to assist with your booking.</p>
          {contact.phone && <a href={`tel:${contact.phone}`} className="block text-primary font-medium">{contact.phone}</a>}
        </aside>
      </div>
    </PublicShell>
  )
}

export const Route = createFileRoute('/booking')({
  component: BookingPage,
})
```

- [ ] **Step 3: Run `npm run dev` once to regenerate `routeTree.gen.ts`**

Run: `npm run dev`, wait for it to finish generating, stop it. This registers `/booking` and removes the deleted `/contact` entry.

- [ ] **Step 4: Run the full suite and build**

Run: `npx vitest run` - expect all tests pass.
Run: `npm run build` - expect success.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: replace /contact with a restyled /booking page with expanded reservation fields"
```

---

## Self-Review Notes

- **Spec coverage:** route restructuring (Task 9-10), branding replacement via the real logo + "Aabha Girls Hostel" text everywhere in `PublicShell` (Task 6) and every route (Tasks 7-10), the `bookings` schema expansion bounded to exactly the user's field list (Task 1-2), `fonepay` (Task 3), all new `site_content` sections wired end-to-end from CMS form (Task 4) through to the public pages that read them (Tasks 7-9), fee-schedule consolidation onto `/transparency` only (Task 8 shows no fee table, Task 9 has the one authoritative table), and 3-meal (not 4) menu (Task 9). All spec items covered.
- **Placeholder scan:** no TBD/TODO; every step has full code or an exact command.
- **Type consistency:** `Booking`'s new fields (`guardian_name`, `emergency_contact_name`, `emergency_contact_phone`, `note`) match exactly between `lib/bookings.ts` (Task 2), `BookingsQueue.tsx` (Task 5), and the DB migration (Task 1); `submitBooking`'s camelCase input fields map 1:1 to the snake_case columns they insert.
- **No internal-app scope creep:** grepped this plan's own task list against the Global Constraints - no task touches the admin dashboard, message center, parent portal, or attendance/outpass; the only internal-app touches are the two explicitly authorized ones (`fonepay`, Task 3) and nothing else.
- **Known bug classes from this project's history, guarded against proactively:** every new/modified form (Task 4's `SiteContentForm`, Task 10's booking form) keeps the established try/catch + local error state pattern; `MEDIA_CATEGORIES` extension (Task 5) is additive only, not reordering existing categories that `MediaGalleryManager` instances already render by index/key; the route rename (`/contact` → `/booking`) explicitly regenerates `routeTree.gen.ts` via `npm run dev` in the same task, avoiding the "stale route tree" version of the "built but not wired" bug class.
