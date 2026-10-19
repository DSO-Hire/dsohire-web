# DSO prospect list, October 2026

Companion to `prospects-2026-10.csv` (40 rows). Research date: 2026-10-19. Company-level data only: hiring-owner job titles appear, but no names, emails or phone numbers.

## Method

1. **Building the candidate list (54 groups).** Sources:
   - Group Dentistry Now's 2026 "Emerging Dental Groups to Watch" list.
   - Group Dentistry Now's August and September 2026 DSO deal roundups.
   - Becker's Dental Review headlines. Becker's blocks page fetches, so only search snippets from it were used.
   - Known mid-market groups.
2. **Checking each group (2026-10-19):**
   - Opened its own careers page and counted live openings on the job board it uses.
   - Identified the hiring software from the apply-link domains (for example `recruiting.paylocity.com` means Paylocity, `*.icims.com` means iCIMS).
   - Read location counts from the group's own site where possible.
   - Took growth signals from press releases and the two roundups.
   - Recorded hiring-owner titles. Each one is marked "inferred" unless the group's own leadership page shows it.
3. **Filtering.** 14 candidates were dropped:
   - Mid-Atlantic Dental Partners: part of Sonrava since 2022.
   - Gen4: merged into SGA Dental Partners (250+ locations), June 2026.
   - Ideal Dental: same company as DECA.
   - Select Dental: being absorbed by Guardian, July 2026.
   - Smile America Partners: school-based mobile model.
   - Large groups over the 2-large cap: Dental365, Premier Care, Sage, Guardian, InterDent, DECA, Smile Partners USA, 42 North, Dentive, The Smilist.

   I counted 100+ locations as "large". The two large slots went to Rock Dental Brands and Imagen Dental Partners, which had the strongest hiring and growth of the large groups.
4. **Tiers:**
   - **A:** 8 to 60 locations, plus clearly active hiring across several roles, plus a recent growth signal.
   - **B:** good size but a weaker or unverifiable signal. Groups over 60 locations are B by rule, even when their hiring is strong (Lone Peak, Elite, Park, Coast).
   - **C:** small or uncertain.

**Result:** 12 A, 19 B, 9 C.

## Sources used

- Groups' own careers pages and job boards: Paylocity, Workday, iCIMS, Greenhouse, Breezy, Workable, Paycor, JazzHR, Jobvite, UKG, HRMDirect, Betterteam.
- Groups' own homepages, location pages and leadership pages.
- Group Dentistry Now:
  - [Emerging Dental Groups 2026](https://www.groupdentistrynow.com/dso-group-blog/emerging-dental-groups-2/)
  - [Aug 2026 roundup](https://www.groupdentistrynow.com/dso-group-blog/dso-deals-august-2026/)
  - [Sep 2026 roundup](https://www.groupdentistrynow.com/dso-group-blog/dso-deal-roundup-2/)
- Becker's Dental Review (search snippets only), press releases, and third-party job boards (Indeed, ZipRecruiter, DentalPost, iHire). Third-party boards were used only as a fallback.

Every row's URLs are in the CSV `source_urls` column.

## Top 10: why now

| # | Group | Tier | Why now |
|---|---|---|---|
| 1 | Archway Dental Partners (CT/NY/MA) | A | Entered Massachusetts in Sep 2026 after NY and CT deals. About 20 open roles on Paylocity. Its own site lists a Director of HR. |
| 2 | Shared Practices Group (dentures/implants, about 49 offices) | A | Keeps opening new offices (Aug and Sep 2026) and has 41 open roles on Paylocity, so it is constantly staffing new locations. |
| 3 | Lumio Dental (OK HQ, 60+) | A | 83 open roles on Breezy, about half of them dentists, across many new states. Doctor recruiting is its bottleneck. |
| 4 | Mosaic Dental Collective (CA/WA/ID, about 55 to 60) | A | 53 open roles on Workable across every clinical role. 2026 Emerging Group honoree. |
| 5 | Rodeo Dental & Orthodontics (TX/CO/AZ, 47+) | A | About 78 openings split between two hiring systems (UKG and iCIMS). Opened in Glendale, AZ in Jul 2026. |
| 6 | Bright Direction Dental (Midwest, 40+) | A | 35 openings on Paycor. Owner-led with no private equity, and aiming for 50+ practices by end of 2026. |
| 7 | Chord Specialty Dental Partners (60+, incl. Cumberland Pediatric) | A | About 91 postings on iCIMS. Bought two Ohio pediatric groups in Sep 2026. |
| 8 | Wave Dental Professionals (MI/GA/TN/TX, 9+) | A | 20 postings, mostly from Aug to Oct 2026. New Buckhead office in Sep 2026, and a new Tennessee cluster is hiring now. |
| 9 | Orthodontic Experts (IL/WI/IN, about 32) | A | 58 openings on Paylocity and two new clinics in Sep 2026. Its official domain is unclear, so verify it before outreach. |
| 10 | Seva Dental Team (MI/OH) | A | Four Ohio acquisitions in 2026. 11 openings on JazzHR, 7 of them hygienists. |

## Patterns

- **Hiring software:** none dominates.
  - Paylocity is the most common (5 groups). iCIMS is next (4: Park, Chord, Lightwave, Imagen).
  - Then come lightweight tools: Breezy (3), Greenhouse (2), Jobvite (2), plus Workable, JazzHR, Paycor, HRMDirect and Betterteam.
  - 12 groups have no hiring software visible at all: 5 route applicants to Indeed or a plain web form, and 7 show nothing. These are the easiest groups to move.
  - Payroll-bundled tools (Paylocity, Paycor, Paycom, ADP) are common in this size band. They post jobs but have no dental-specific sourcing or fit scoring, which is our opening.
- **What they're hiring for:** dental assistants and front office make up the most openings. Hygienists are the scarcest role: several groups advertise $3k to $5k sign-on bonuses. Doctor recruiting dominates at Lumio, Familia, Nuvia and Rodeo.
- **Two common pains:** groups running separate staff and doctor hiring systems (Rodeo), and groups whose new acquisitions bring their own hiring setups (Archway, Seva, Chord, Park).
- **Regions:** the Midwest is densest (IL, MI, OH, IN, WI; 10+ rows), followed by Texas/Southwest and the Southeast (FL, GA, TN). The Northeast is represented by Archway, Qualitas, Tend and Oakwood.
- **Timing:** many groups are in integration mode after 2026 acquisitions. That is the best moment to pitch one hiring tool for the whole network before each acquired practice settles into its own job-board habits.

## Limitations

- Job counts are a single snapshot from 2026-10-19 and change daily.
  - Some boards load listings by script and couldn't be read, so no count is shown: Dental Depot (Paycom), Signature (PCRecruiter), Dentologie, and the Indeed-only groups.
  - Park's count is approximate because only 2 of its 4 pages were read.
- Becker's pages couldn't be fetched, so growth items that come only from Becker's search snippets carry "approx" or unverified dates.
- Most hiring-owner titles are inferred. Titles shown on a group's own site: Archway (Director of HR), Burch (Director of People), Innovate 32 (CHRO), Elite (Senior Director of Acquisition).
- Location counts sometimes conflict between sources. The CSV gives ranges and the source for each.
- Several domains need checking before outreach: Orthodontic Experts (redirects to a misspelled domain), Premier Care (no corporate site found), and Oral Surgery Partners (website not confirmed).
- MINT dentistry: search surfaced patient lawsuits (allegations only). Vet it before contact.
