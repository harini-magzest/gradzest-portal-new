const EDU_LEVEL_RANK = {
  '10th': 1, 'ssc': 1, 'hslc': 1,
  '12th': 2, 'intermediate': 2, 'hsc': 2, 'high school': 2, 'a-level': 2,
  'diploma': 2.5,
  "bachelor": 3, "b.tech": 3, "b.e": 3, "btech": 3, "undergraduate": 3,
  "master": 4, "m.tech": 4, "mtech": 4, "mba": 4, "postgraduate": 4,
  "phd": 5, "doctorate": 5,
};

function getStudentEduRank(educationLevel) {
  if (!educationLevel) return 0;
  const lower = educationLevel.toLowerCase();
  let best = 0;
  for (const [key, rank] of Object.entries(EDU_LEVEL_RANK)) {
    if (lower.includes(key) && rank > best) best = rank;
  }
  return best;
}

function calcWorkExpYears(experienceDetails) {
  if (!experienceDetails || !experienceDetails.length) return 0;
  const now = new Date();
  let totalMs = 0;
  for (const exp of experienceDetails) {
    if (!exp.from) continue;
    const from = new Date(exp.from);
    if (isNaN(from)) continue;
    const to = exp.current ? now : (exp.to ? new Date(exp.to) : now);
    if (to > from) totalMs += to - from;
  }
  return totalMs / (1000 * 60 * 60 * 24 * 365.25);
}

function parseRequirements(requirements) {
  const parsed = [];
  for (const raw of (requirements || [])) {
    if (!raw || typeof raw !== 'string') continue;
    const r = raw.trim();
    const lo = r.toLowerCase();

    // English tests: IELTS 6.5 | TOEFL 90 | PTE 65 | Duolingo 110
    const engRx = /^(ielts|toefl|pte|duolingo)[\s:]*(\d+\.?\d*)/i;
    const engM = r.match(engRx);
    if (engM) { parsed.push({ type: 'english', test: engM[1].toUpperCase(), minScore: parseFloat(engM[2]), raw: r }); continue; }

    // Education level
    if (/bachelor|b\.?tech|b\.?e\b|undergraduate/i.test(lo)) { parsed.push({ type: 'education', minRank: 3, label: "Bachelor's Degree", raw: r }); continue; }
    if (/master|postgraduate|m\.?tech|m\.?b\.?a/i.test(lo)) { parsed.push({ type: 'education', minRank: 4, label: "Master's Degree", raw: r }); continue; }
    if (/phd|doctorate/i.test(lo)) { parsed.push({ type: 'education', minRank: 5, label: 'PhD / Doctorate', raw: r }); continue; }
    if (/high school|12th|hsc|intermediate|a.level/i.test(lo)) { parsed.push({ type: 'education', minRank: 2, label: 'High School / 12th', raw: r }); continue; }
    if (/diploma/i.test(lo)) { parsed.push({ type: 'education', minRank: 2.5, label: 'Diploma', raw: r }); continue; }

    // GPA (4.0 scale)
    const gpaM = lo.match(/gpa[\s:]*(\d+\.?\d*)/i);
    if (gpaM) { parsed.push({ type: 'gpa', minScore: parseFloat(gpaM[1]), raw: r }); continue; }

    // CGPA (10-point scale)
    const cgpaM = lo.match(/cgpa[\s:]*(\d+\.?\d*)/i);
    if (cgpaM) { parsed.push({ type: 'cgpa', minScore: parseFloat(cgpaM[1]), raw: r }); continue; }

    // Percentage
    const pctM = r.match(/(\d+\.?\d*)\s*%/);
    if (pctM) { parsed.push({ type: 'percentage', minScore: parseFloat(pctM[1]), raw: r }); continue; }

    // Work experience
    const expM = lo.match(/(\d+\.?\d*)\+?\s*years?\s*(of\s*)?(work\s*)?(experience|exp)/i);
    if (expM) { parsed.push({ type: 'experience', minYears: parseFloat(expM[1]), raw: r }); continue; }
    if (/work\s*experience|experience\s*required/i.test(lo)) { parsed.push({ type: 'experience', minYears: 1, raw: r }); continue; }

    // GMAT / GRE — cannot check from profile, mark info
    if (/gmat/i.test(lo)) { parsed.push({ type: 'info', raw: r }); continue; }
    if (/gre/i.test(lo))  { parsed.push({ type: 'info', raw: r }); continue; }

    parsed.push({ type: 'info', raw: r });
  }
  return parsed;
}

function checkEligibility(student, requirements) {
  const parsed = parseRequirements(requirements);
  if (!parsed.length) return { eligible: true, checks: [], summary: 'No specific requirements' };

  const checks = [];
  let allPass = true;

  const eduRank  = getStudentEduRank(student.educationLevel);
  const expYears = calcWorkExpYears(student.experienceDetails);
  const rawGpa   = student.gpa || 0;
  // Determine if GPA stored as percentage (>10) or CGPA (<=10)
  const asPct    = rawGpa > 10 ? rawGpa : rawGpa * 10;
  const asCgpa   = rawGpa > 10 ? rawGpa / 10 : rawGpa;
  const asGpa4   = rawGpa > 10 ? rawGpa / 25 : rawGpa / 2.5;

  for (const req of parsed) {
    switch (req.type) {
      case 'english': {
        const eng = student.englishScore;
        if (!eng || !eng.score) {
          checks.push({ req: req.raw, status: 'missing', detail: `${req.test} score not on profile` });
          allPass = false;
        } else if (eng.type?.toUpperCase() === req.test) {
          const ok = eng.score >= req.minScore;
          checks.push({ req: req.raw, status: ok ? 'pass' : 'fail', detail: `${eng.type} ${eng.score} (required ${req.minScore})` });
          if (!ok) allPass = false;
        } else {
          // Different test — informational only
          checks.push({ req: req.raw, status: 'info', detail: `You have ${eng.type} ${eng.score}; ${req.test} ${req.minScore} required` });
        }
        break;
      }
      case 'education': {
        const ok = eduRank >= req.minRank;
        checks.push({ req: req.raw, status: ok ? 'pass' : 'fail', detail: ok ? `Meets requirement (${student.educationLevel || 'on profile'})` : `${req.label} required — your level: ${student.educationLevel || 'not specified'}` });
        if (!ok) allPass = false;
        break;
      }
      case 'percentage': {
        const ok = asPct >= req.minScore;
        checks.push({ req: req.raw, status: ok ? 'pass' : 'fail', detail: `${asPct.toFixed(1)}% (required ${req.minScore}%)` });
        if (!ok) allPass = false;
        break;
      }
      case 'cgpa': {
        const ok = asCgpa >= req.minScore;
        checks.push({ req: req.raw, status: ok ? 'pass' : 'fail', detail: `CGPA ${asCgpa.toFixed(1)} (required ${req.minScore})` });
        if (!ok) allPass = false;
        break;
      }
      case 'gpa': {
        const ok = asGpa4 >= req.minScore;
        checks.push({ req: req.raw, status: ok ? 'pass' : 'fail', detail: `GPA ${asGpa4.toFixed(2)}/4.0 (required ${req.minScore}/4.0)` });
        if (!ok) allPass = false;
        break;
      }
      case 'experience': {
        const ok = expYears >= req.minYears;
        checks.push({ req: req.raw, status: ok ? 'pass' : 'fail', detail: `${expYears.toFixed(1)} yrs experience (required ${req.minYears})` });
        if (!ok) allPass = false;
        break;
      }
      case 'info':
      default:
        checks.push({ req: req.raw, status: 'info', detail: 'Verify directly with university' });
        break;
    }
  }

  const failed = checks.filter(c => c.status === 'fail' || c.status === 'missing').length;
  const passed = checks.filter(c => c.status === 'pass').length;
  return {
    eligible: allPass,
    checks,
    summary: allPass ? `Meets all ${passed} requirement(s)` : `Does not meet ${failed} requirement(s)`,
  };
}

module.exports = { checkEligibility, parseRequirements };
