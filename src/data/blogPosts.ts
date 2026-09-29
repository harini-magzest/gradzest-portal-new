export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  category: 'Destinations' | 'Scholarships' | 'Visa & Immigration' | 'Test Prep' | 'Career';
  readTime: number;
  publishedAt: string;
  author: { name: string; role: string };
  coverEmoji: string;
  tags: string[];
}

export const blogPosts: BlogPost[] = [
  {
    id: '1',
    slug: 'study-in-uk-complete-guide-2025',
    title: 'Complete Guide to Studying in the UK in 2025',
    excerpt: 'Everything Indian students need to know — from choosing a university and applying for a Student visa to managing finances and settling in.',
    category: 'Destinations',
    readTime: 8,
    publishedAt: '2025-05-10',
    author: { name: 'Priya Sharma', role: 'Education Counselor' },
    coverEmoji: '🇬🇧',
    tags: ['UK', 'Student Visa', 'Tuition Fees', 'Top Universities'],
    content: `## Why Study in the UK?

The United Kingdom is home to some of the world's most prestigious universities, including Oxford, Cambridge, Imperial College London, and UCL. For Indian students, the UK offers:

- **World-class education** recognised globally by employers
- **Shorter degree durations** — most Master's degrees take just 1 year
- **Post-Study Work Visa (Graduate Route)** — 2 years (3 for PhD) to work after graduation
- A large, welcoming Indian diaspora community

## Top Universities for Indian Students

| University | QS World Rank 2025 | Popular Courses |
|---|---|---|
| University of Oxford | 3 | PPE, Medicine, Law |
| Imperial College London | 6 | Engineering, Business |
| University College London | 9 | Architecture, Laws, Sciences |
| University of Edinburgh | 22 | CS, Business, Medicine |
| University of Manchester | 34 | Engineering, MBA |

## Intake Seasons

- **September/October** — main intake, widest course choice
- **January** — limited options, good for those who missed September

## Tuition Fees

Expect to pay **£15,000–£35,000 per year** for undergraduate and postgraduate courses. Medicine and MBA programmes can exceed £45,000/year.

## Student Visa (Subclass Student Visa)

You need a Confirmation of Acceptance for Studies (CAS) from your university before applying.

**Requirements:**
- Valid passport
- CAS reference number
- Proof of financial maintenance (at least £1,334/month for 9 months in London)
- English language proof (IELTS 6.0+ typically)
- Tuberculosis test certificate (for Indian nationals)

**Apply online** at least 3 months before your course starts.

## Living Costs

Budget **£1,000–£1,500/month** in London; £700–£1,000/month outside London, covering accommodation, food, transport, and personal expenses.

## Scholarships

- **Chevening Scholarship** — fully funded, for outstanding leaders
- **Commonwealth Scholarships** — for Commonwealth citizens
- **University-specific merit scholarships** — 10–30% tuition discounts common

## Ready to Apply?

Create your Gradzest profile and let our counselors guide you through every step from shortlisting universities to visa submission.`,
  },
  {
    id: '2',
    slug: 'top-scholarships-indian-students-2025',
    title: 'Top 10 Scholarships for Indian Students Abroad in 2025',
    excerpt: 'Discover fully-funded and partial scholarships specifically available to Indian students planning to study in the UK, Canada, Australia, Germany, and the US.',
    category: 'Scholarships',
    readTime: 6,
    publishedAt: '2025-04-22',
    author: { name: 'Amit Verma', role: 'Scholarship Advisor' },
    coverEmoji: '🎓',
    tags: ['Scholarships', 'Funding', 'Fully Funded', 'India'],
    content: `## Scholarships That Cover Everything

Studying abroad is expensive, but these scholarships can dramatically reduce — or eliminate — your costs.

---

### 1. Chevening Scholarships (UK)
**Coverage:** Tuition + living allowance + flights + extras
**Eligibility:** 2+ years work experience, leadership potential
**Deadline:** November each year
**Apply at:** chevening.org

---

### 2. Commonwealth Scholarship (UK)
**Coverage:** Fully funded
**For:** Low and middle-income Commonwealth countries
**Deadline:** December each year

---

### 3. Inlaks Shivdasani Foundation (Various)
**Coverage:** Up to USD 100,000
**For:** Outstanding young Indians for postgrad abroad
**Deadline:** March each year

---

### 4. DAAD Scholarships (Germany)
**Coverage:** Monthly stipend + travel allowance + health insurance
**For:** Postgraduate and doctoral studies in Germany
**Deadline:** October–November each year

---

### 5. Australia Awards
**Coverage:** Fully funded (tuition, living, travel)
**For:** Development-linked fields
**Deadline:** April each year

---

### 6. Aga Khan Foundation International Scholarship
**Coverage:** 50% grant + 50% loan
**For:** Postgraduate students with limited financial means
**Deadline:** March each year

---

### 7. Erasmus Mundus (Europe)
**Coverage:** Tuition + monthly stipend + travel
**For:** Joint Master's programmes across European universities
**Deadline:** January–February each year

---

### 8. Ontario Trillium Scholarship (Canada)
**Coverage:** CAD 40,000/year for 4 years (PhD)
**For:** International students at Ontario universities

---

### 9. Vanier Canada Graduate Scholarship
**Coverage:** CAD 50,000/year for 3 years
**For:** Doctoral students at Canadian universities
**Deadline:** November each year

---

### 10. University Merit Scholarships
Most universities offer scholarships based on academic merit — ranging from 10% to 100% tuition waiver. Ask your Gradzest counselor to help you identify and apply for institution-specific awards.

---

## Tips to Win Scholarships

- Apply early — most deadlines are 6–12 months before the course starts
- Tailor your Statement of Purpose to the scholarship's values
- Get strong recommendation letters from professors or employers
- Demonstrate community impact and leadership

Need help shortlisting scholarships you qualify for? Our counselors can build a personalised scholarship plan.`,
  },
  {
    id: '3',
    slug: 'ielts-vs-toefl-which-to-choose',
    title: 'IELTS vs TOEFL: Which English Test Should You Take?',
    excerpt: 'A head-to-head comparison of IELTS and TOEFL to help you pick the right test for your target universities and countries.',
    category: 'Test Prep',
    readTime: 5,
    publishedAt: '2025-03-15',
    author: { name: 'Neha Reddy', role: 'Test Prep Expert' },
    coverEmoji: '📝',
    tags: ['IELTS', 'TOEFL', 'English Test', 'Test Prep'],
    content: `## Why English Proficiency Matters

Almost every English-speaking country requires proof of English proficiency for international students. The two most widely accepted tests are **IELTS Academic** and **TOEFL iBT**.

## Quick Comparison

| Factor | IELTS Academic | TOEFL iBT |
|---|---|---|
| Format | Paper or Computer-based | Computer-based only |
| Speaking | Face-to-face with examiner | Speaking into a microphone |
| Duration | 2 hrs 45 min | ~3 hrs |
| Scoring | Band 0–9 (0.5 increments) | Score 0–120 |
| Accepted by | UK, Australia, Canada, NZ, US | Mainly US; accepted globally |
| Fee (India) | ~₹17,000 | ~₹19,000 |
| Results | 3–5 days (computer); 13 days (paper) | 6–10 days |

## Which Universities Prefer Which?

- **UK universities** — IELTS preferred; many require minimum 6.0–6.5
- **US universities** — TOEFL preferred; some accept IELTS
- **Canada** — Both accepted widely
- **Australia** — IELTS strongly preferred (6.0–7.0 required)
- **Germany** — Both accepted, though IELTS more common

## Who Should Choose IELTS?

- Applying to UK, Australia, or Canada
- Prefer speaking to a real person
- Stronger in reading comprehension than integrated tasks

## Who Should Choose TOEFL?

- Primarily targeting US universities
- Comfortable with computer-based testing
- Better at integrated (reading + listening + writing) tasks

## Score Requirements (typical)

| Level | IELTS Band | TOEFL Score |
|---|---|---|
| Undergraduate | 6.0–6.5 | 80–90 |
| Postgraduate | 6.5–7.0 | 90–100 |
| MBA / Law / Medicine | 7.0–7.5 | 100–110 |

## Preparation Tips

1. **Start 3–4 months early** — aim to attempt twice if needed
2. **Practice under timed conditions** — the clock is your biggest challenge
3. **For IELTS Speaking** — practice with a partner or mock interview
4. **For TOEFL Writing** — practice integrated essays (read + listen + write)
5. Use official prep materials from the British Council (IELTS) or ETS (TOEFL)

Your Gradzest counselor can tell you the exact score requirements for your shortlisted universities.`,
  },
  {
    id: '4',
    slug: 'study-in-canada-student-visa-guide',
    title: 'How to Get a Canada Student Visa: Step-by-Step for Indians',
    excerpt: 'Everything you need to know about the Canadian Study Permit — eligibility, documents, processing time, and common rejection reasons.',
    category: 'Visa & Immigration',
    readTime: 7,
    publishedAt: '2025-02-28',
    author: { name: 'Rahul Mehta', role: 'Immigration Specialist' },
    coverEmoji: '🇨🇦',
    tags: ['Canada', 'Study Permit', 'Visa', 'Immigration'],
    content: `## Canada: A Top Destination for Indian Students

Canada accepted over **800,000 international students** in 2024. With affordable tuition, a pathway to permanent residency, and the Post-Graduation Work Permit (PGWP), it remains one of the most attractive destinations for Indian students.

## What is a Study Permit?

A **Study Permit** (commonly called a student visa) is required for any course lasting more than 6 months. It is not a visa itself — you also need a **Temporary Resident Visa (TRV)** or an **Electronic Travel Authorization (eTA)** to enter Canada.

## Step-by-Step Application Process

### Step 1: Get an Acceptance Letter
You need a **Letter of Acceptance (LOA)** from a **Designated Learning Institution (DLI)** in Canada.

### Step 2: Gather Documents
- Valid passport (valid for at least 6 months beyond your study period)
- Letter of Acceptance from DLI
- Proof of financial support:
  - Tuition fees for 1st year + CAD 10,000 living costs (outside Quebec)
  - Tuition fees + CAD 11,000 (in Quebec)
- Statement of Purpose / Study plan
- Academic transcripts (10th, 12th, Degree with mark sheets)
- Language test scores (IELTS 6.0+ typically)
- Passport-size photos
- Biometrics (enrolled at a VAC)

### Step 3: Apply Online via IRCC Portal
Go to ircc.canada.ca and create an account. Apply for the Study Permit (and TRV if needed) together.

### Step 4: Biometrics
After applying, you'll receive a Biometric Collection Letter. Visit the nearest **Visa Application Centre (VAC)** to give biometrics.

### Step 5: Wait for a Decision
Processing times currently range from **4–12 weeks** for Indian applicants. Check IRCC's website for current estimates.

## Common Rejection Reasons

1. **Weak financial proof** — bank statements showing recent large deposits look suspicious. Maintain stable funds for 6+ months.
2. **Poor Statement of Purpose** — vague reasons for choosing Canada
3. **Ties to home country not demonstrated** — officers want to see you'll return
4. **Gap years unexplained** — always address gaps honestly

## Post-Graduation Work Permit (PGWP)

After graduating from an eligible DLI:
- 1-year program → PGWP valid for up to 1 year
- 2-year program → PGWP valid for up to 3 years

PGWP holders can work full-time for any employer, and it's a stepping stone to Permanent Residency through Express Entry.

## Ready to Study in Canada?

Let your Gradzest counselor guide you through university selection, application, and visa preparation.`,
  },
  {
    id: '5',
    slug: 'germany-free-education-indian-students',
    title: 'Study in Germany for Free: What Indian Students Need to Know',
    excerpt: 'Germany offers tuition-free education at public universities. Learn how Indian students can benefit, what it costs to live there, and how to apply.',
    category: 'Destinations',
    readTime: 6,
    publishedAt: '2025-01-18',
    author: { name: 'Priya Sharma', role: 'Education Counselor' },
    coverEmoji: '🇩🇪',
    tags: ['Germany', 'Free Education', 'Public Universities', 'Europe'],
    content: `## Why Germany?

Germany is one of the few countries where public universities charge **no tuition fees** for both domestic and international students. You only pay a semester contribution of **€150–€350**, which often includes a public transport pass.

## Top Universities for International Students

- **Technical University of Munich (TUM)** — QS Rank 37
- **Ludwig Maximilian University of Munich** — QS Rank 54
- **Heidelberg University** — QS Rank 47
- **Karlsruhe Institute of Technology (KIT)**
- **RWTH Aachen University** — Europe's top engineering school

## Courses Available in English

While many programmes are in German, Germany offers **1,500+ Master's programmes in English**, especially in:
- Engineering & Technology
- Business & Management
- Data Science & AI
- Natural Sciences

## Language Requirements

- **English programmes** — IELTS 6.5 / TOEFL 90 typically required
- **German programmes** — TestDaF or DSH German language certificate required (C1 level)

## Cost of Living

Germany is affordable compared to UK or USA:
| City | Monthly Budget |
|---|---|
| Munich | €900–€1,200 |
| Berlin | €700–€950 |
| Hamburg | €750–€1,000 |
| Smaller cities | €600–€800 |

This includes accommodation (student dorm: €200–€400/month), food, and transport.

## Student Visa for Germany

1. Apply for a **National Visa (Type D)** at the German consulate in India
2. Documents needed:
   - Admission letter from a German university or blocked account letter (Sperrkonto) showing €11,208 for 12 months
   - IELTS/TOEFL scores or German language certificate
   - Degree certificates and transcripts
   - Health insurance
   - Motivation letter

Processing typically takes **6–12 weeks**. Apply well in advance.

## Blocked Account (Sperrkonto)

Germany requires proof of funds via a blocked account:
- **Amount:** ~€11,208 for one year (€934/month)
- **Providers:** Deutsche Bank, Fintiba, Expatrio
- You can withdraw the monthly amount once in Germany

## Working While Studying

International students can work **120 full days or 240 half-days per year** — enough to cover a significant portion of living costs.

## After Graduation

Germany offers an **18-month Job Seeker Visa** after graduation to find employment related to your degree. Once employed, you can apply for a work permit and eventually permanent residency.

Interested in Germany? Talk to a Gradzest counselor to identify the right university and programme for you.`,
  },
  {
    id: '6',
    slug: 'career-after-ms-in-usa-guide',
    title: 'Career After MS in the USA: OPT, H-1B, and Green Card Explained',
    excerpt: 'A clear guide to the US work visa pathway for Indian students after completing their Master\'s degree — from OPT to H-1B to Green Card.',
    category: 'Career',
    readTime: 7,
    publishedAt: '2024-12-05',
    author: { name: 'Kiran Patel', role: 'Career Counselor' },
    coverEmoji: '🇺🇸',
    tags: ['USA', 'OPT', 'H-1B', 'Career', 'Work Visa'],
    content: `## The US Career Pathway for International Students

Many Indian students choose the US for their Master's degree with a long-term plan to build a career there. Here is a clear breakdown of the path.

## Step 1: Optional Practical Training (OPT)

After completing your degree, you are eligible for **OPT** — work authorisation to work in your field of study.

- **Duration:** 12 months for all STEM and non-STEM degrees
- **STEM OPT Extension:** Additional 24 months (total 36 months) for STEM graduates
- Must work in a job related to your degree
- Apply through your university's Designated School Official (DSO) before graduation

## Step 2: H-1B Visa

H-1B is a work visa sponsored by an employer for speciality occupations.

**Key facts:**
- Annual cap: **65,000 regular + 20,000 US Master's quota**
- Selection is by **lottery** — roughly 30–40% chance of selection in recent years
- Must be sponsored by a US employer
- Initial validity: 3 years, extendable to 6 years

**Timeline:**
- Lottery registration: March each year
- Selections announced: April
- Work start date: October 1

If you are not selected in the H-1B lottery during your OPT/STEM OPT period, you can:
- Try the lottery again the following year
- Explore other visa categories (O-1, L-1 via multinational companies)
- Consider transferring to Canada on a work permit

## Step 3: Green Card (Permanent Residency)

The most common pathway for Indian professionals is **EB-2 or EB-3** employment-based Green Card:

- Sponsored by employer after at least 1 year of H-1B
- Processing time: Currently **50–80 years** for Indian nationals due to country-specific backlogs
- Indian nationals born in India face the longest waits

### Alternative: Canada or Australia

Due to the Green Card backlog, many Indian professionals choose to:
- Apply for Canadian PR via Express Entry (1–2 years)
- Apply for Australian PR via skilled migration (1–2 years)

Both countries offer faster pathways to permanent residency.

## Fields with Best H-1B Success Rates

1. Software Engineering / Computer Science
2. Data Science & AI/ML
3. Electrical & Computer Engineering
4. Finance & Accounting (CPA holders)
5. Healthcare (nurses, pharmacists)

## Key Tips for Indian MS Students

- **Start OPT application early** — apply 90 days before graduation
- **Choose a STEM-designated programme** for the 3-year work window
- **Network aggressively** — most H-1B jobs are through referrals
- **Consider companies that file H-1B every year** — large tech firms, consulting companies, and healthcare systems are reliable sponsors

Have questions about your career options after your MS? Gradzest counselors can help you plan your degree and career path together.`,
  },
];

export function getBlogPost(slug: string): BlogPost | undefined {
  return blogPosts.find(p => p.slug === slug);
}

export function getRelatedPosts(post: BlogPost, count = 3): BlogPost[] {
  return blogPosts
    .filter(p => p.id !== post.id && (p.category === post.category || p.tags.some(t => post.tags.includes(t))))
    .slice(0, count);
}
