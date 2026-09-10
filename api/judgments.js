export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    let query = "";
    let act = "";
    let section = "";
    let court = "";
    let source = "";
    let id = "";
    let caseName = "";

    if (req.method === "POST") {
      const body = req.body || {};
      query = body.query || "";
      act = body.act || "";
      section = body.section || "";
      court = body.court || "";
      source = body.source || "";
      id = body.id || body.cnr || "";
      caseName = body.caseName || "";
    } else {
      query = req.query?.query || "";
      act = req.query?.act || "";
      section = req.query?.section || "";
      court = req.query?.court || "";
      source = req.query?.source || "";
      id = req.query?.id || req.query?.cnr || "";
      caseName = req.query?.caseName || "";
    }

    const userQuery = String(query).trim();
    const q = userQuery.toLowerCase();

    const API_BASE =
      "https://indiacode.ecourtsindia.com/api/v1";

    /* =====================================================
       JUDGMENT READER
       ===================================================== */

    if (source || id || caseName) {

      /* Direct source */
      if (source) {
        try {
          const r = await fetch(source);

          if (r.ok) {
            const data = await r.json();

            return res.status(200).json({
              verified: true,
              mode: "reader",
              judgment: normalizeJudgment(
                data.judgment || data.result || data
              )
            });
          }
        } catch {}
      }

      /* Judgment ID / CNR */
      if (id) {
        const urls = [
          `${API_BASE}/judgments/${encodeURIComponent(id)}`,
          `${API_BASE}/judgment/${encodeURIComponent(id)}`
        ];

        for (const url of urls) {
          try {
            const r = await fetch(url);

            if (r.ok) {
              const data = await r.json();

              return res.status(200).json({
                verified: true,
                mode: "reader",
                judgment: normalizeJudgment(
                  data.judgment || data.result || data
                )
              });
            }
          } catch {}
        }
      }

      /* Case name */
      if (caseName) {
        try {
          const searchUrl =
            `${API_BASE}/search?` +
            new URLSearchParams({
              q: caseName,
              kind: "judgment",
              limit: "20"
            }).toString();

          const r = await fetch(searchUrl);

          if (r.ok) {
            const data = await r.json();

            const results =
              data.results ||
              data.judgments ||
              [];

            if (results.length) {
              return res.status(200).json({
                verified: true,
                mode: "reader",
                judgment:
                  normalizeJudgment(results[0]),
                results:
                  results.map(normalizeJudgment)
              });
            }
          }
        } catch {}
      }

      return res.status(404).json({
        verified: false,
        mode: "reader",
        error:
          "Judgment not found in the connected legal database"
      });
    }

    /* =====================================================
       SEARCH MODE
       ===================================================== */

    /* Automatic IT Act */
    if (!act && q.includes("information technology act")) {
      act = "it-act";
    }

    if (!act && q.includes("it act")) {
      act = "it-act";
    }

    /* IPC */
    if (!act && q.includes("indian penal code")) {
      act = "ipc";
    }

    if (!act && /\bipc\b/i.test(q)) {
      act = "ipc";
    }

    /* BNS */
    if (!act && q.includes("bharatiya nyaya sanhita")) {
      act = "bns";
    }

    if (!act && /\bbns\b/i.test(q)) {
      act = "bns";
    }

    /* CrPC */
    if (!act && q.includes("code of criminal procedure")) {
      act = "crpc";
    }

    if (!act && /\bcrpc\b/i.test(q)) {
      act = "crpc";
    }

    /* BNSS */
    if (!act && q.includes("bharatiya nagarik suraksha sanhita")) {
      act = "bnss";
    }

    if (!act && /\bbnss\b/i.test(q)) {
      act = "bnss";
    }

    /* BSA */
    if (!act && q.includes("bharatiya sakshya adhiniyam")) {
      act = "bsa";
    }

    if (!act && /\bbsa\b/i.test(q)) {
      act = "bsa";
    }

    /* Evidence Act */
    if (!act && q.includes("evidence act")) {
      act = "evidence-act";
    }

    /* CPC */
    if (!act && q.includes("code of civil procedure")) {
      act = "cpc";
    }

    if (!act && /\bcpc\b/i.test(q)) {
      act = "cpc";
    }

    /* NI Act */
    if (
      !act &&
      (
        q.includes("negotiable instruments act") ||
        q.includes("cheque bounce") ||
        q.includes("cheque dishonour") ||
        q.includes("cheque dishonor")
      )
    ) {
      act = "ni-act";
    }

    if (
      act === "ni-act" &&
      !section &&
      (
        q.includes("cheque bounce") ||
        q.includes("dishonour") ||
        q.includes("dishonor")
      )
    ) {
      section = "138";
    }

    /* POCSO */
    if (
      !act &&
      (
        q.includes("pocso") ||
        q.includes("protection of children from sexual offences")
      )
    ) {
      act = "pocso";
    }

    /* NDPS */
    if (
      !act &&
      (
        q.includes("ndps") ||
        q.includes("narcotic drugs and psychotropic substances")
      )
    ) {
      act = "ndps-act";
    }

    /* =====================================================
       SECTION DETECTION
       ===================================================== */

    if (!section) {
      const m =
        q.match(
          /\b(?:section|sec\.?)\s*([0-9]+[a-z]?(?:\([a-z0-9]+\))?)\b/i
        ) ||
        q.match(
          /\b(?:ipc|bns|crpc|bnss|bsa|cpc)\s*[-:]?\s*([0-9]+[a-z]?)\b/i
        ) ||
        q.match(
          /\bit\s+act\s+(?:section\s*)?([0-9]+[a-z]?)\b/i
        );

      if (m) section = m[1];
    }

    /* =====================================================
       COURT
       ===================================================== */

    if (!court) {
      if (q.includes("supreme court")) {
        court = "SC";
      } else if (q.includes("high court")) {
        court = "HC";
      }
    }

    /* =====================================================
       DATABASE SEARCH
       ===================================================== */

    const params = new URLSearchParams();

    if (act) params.set("act", act);
    if (section) params.set("section", section);
    if (court) params.set("court", court);

    params.set("limit", "100");

    let url =
      `${API_BASE}/judgments?${params.toString()}`;

    const allJudgments = [];
    let total = 0;

    while (url) {
      const response = await fetch(url);
      const data = await response.json();

      if (!response.ok) {
        return res.status(response.status).json({
          error:
            data.error ||
            "Judgment search failed"
        });
      }

      total = data.total || total;

      if (Array.isArray(data.judgments)) {
        allJudgments.push(
          ...data.judgments
        );
      }

      url = data.next || null;

      if (allJudgments.length >= 500) break;
    }

    /* =====================================================
       SEARCH SCORING
       ===================================================== */

    function normalize(value) {
      return String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    const stopWords = new Set([
      "the","and","for","where","with","from",
      "that","this","case","cases","judgment",
      "judgments","judgement","judgements",
      "supreme","court","high","section",
      "sections","act","under","about","what",
      "which","how","does","can","tell","explain",
      "meaning","law","legal","provision","india",
      "indian","of","to","in","on","is","are",
      "was","were","a","an","whether","find"
    ]);

    const words =
      normalize(userQuery)
        .split(/\s+/)
        .filter(
          w =>
            w.length >= 3 &&
            !stopWords.has(w)
        );

    function score(j) {
      const title = normalize(
        j.title || j.case_name
      );

      const facts = normalize(
        j.facts || j.case_facts
      );

      const issues = normalize(
        j.issues || j.legal_issues
      );

      const ratio = normalize(
        j.ratio_decidendi || j.ratio
      );

      const decision = normalize(
        j.decision || j.holding
      );

      const applied = normalize(
        j.applied_to_this_section
      );

      const basis = normalize(
        j.basis
      );

      const decided = normalize(
        j.decided_under
      );

      const text = [
        title,
        facts,
        issues,
        ratio,
        decision,
        applied,
        basis,
        decided
      ].join(" ");

      let score = 0;

      if (section) {
        const sec = normalize(section);

        if (applied.includes(sec)) score += 100;
        if (decided.includes(sec)) score += 80;
        if (basis.includes(sec)) score += 60;
        if (text.includes(`section ${sec}`)) score += 40;
      }

      for (const word of words) {
        if (title.includes(word)) score += 18;
        if (issues.includes(word)) score += 15;
        if (ratio.includes(word)) score += 14;
        if (applied.includes(word)) score += 16;
        if (basis.includes(word)) score += 10;
        if (decision.includes(word)) score += 9;
        if (facts.includes(word)) score += 5;
      }

      const phrases = [
        "unauthorized access",
        "unauthorised access",
        "civil dispute",
        "commercial dispute",
        "corporate dispute",
        "quashing",
        "quashed",
        "bail",
        "anticipatory bail",
        "mens rea",
        "dishonest intention",
        "fraudulent intention",
        "cheque bounce",
        "dishonour of cheque",
        "dishonor of cheque",
        "service of notice"
      ];

      for (const phrase of phrases) {
        if (q.includes(phrase)) {
          if (text.includes(phrase)) score += 30;
          if (issues.includes(phrase)) score += 25;
          if (ratio.includes(phrase)) score += 25;
        }
      }

      if (
        court === "SC" &&
        normalize(j.court_name || j.court)
          .includes("supreme")
      ) {
        score += 30;
      }

      if (
        court === "HC" &&
        normalize(j.court_name || j.court)
          .includes("high")
      ) {
        score += 20;
      }

      if (ratio) score += 8;
      if (issues) score += 6;
      if (decision) score += 6;
      if (applied) score += 12;

      return score;
    }

    /* =====================================================
       DEDUPLICATION
       ===================================================== */

    const seen = new Set();

    const unique =
      allJudgments.filter(j => {
        const key = normalize(
          j.title ||
          j.case_name ||
          j.cnr ||
          j.url
        );

        if (!key || seen.has(key)) return false;

        seen.add(key);
        return true;
      });

    /* =====================================================
       RANK
       ===================================================== */

    const ranked =
      unique
        .map(j => ({
          judgment: j,
          score: score(j)
        }))
        .sort(
          (a, b) =>
            b.score - a.score
        );

    function relevance(score) {
      if (score >= 100) return "Direct";
      if (score >= 50) return "Related";
      return "Low";
    }

    /* =====================================================
       FINAL RESULTS
       ===================================================== */

    const judgments =
      ranked
        .slice(0, 20)
        .map(item => {
          const j = item.judgment;

          return {
            verified: true,

            relevanceScore:
              item.score,

            relevance:
              relevance(item.score),

            caseName:
              j.title ||
              j.case_name ||
              null,

            court:
              j.court_name ||
              j.court ||
              null,

            courtLevel:
              j.court_level ||
              null,

            date:
              j.date ||
              j.decision_date ||
              null,

            citation:
              j.citation ||
              null,

            cnr:
              j.cnr ||
              null,

            facts:
              j.facts ||
              j.case_facts ||
              null,

            issues:
              j.issues ||
              j.legal_issues ||
              null,

            decision:
              cleanDecision(
                j.decision ||
                j.holding
              ),

            ratio:
              j.ratio_decidendi ||
              j.ratio ||
              null,

            appliedToSection:
              j.applied_to_this_section ||
              null,

            basis:
              j.basis ||
              null,

            precedentialValue:
              j.precedential_value ||
              null,

            courtMarking:
              j.court_marking ||
              null,

            decidedUnder:
              j.decided_under ||
              null,

            source:
              j.url ||
              j.source ||
              null
          };
        });

    return res.status(200).json({
      verified: true,
      mode: "search",

      query:
        userQuery || null,

      act:
        act || null,

      section:
        section || null,

      court:
        court || null,

      total,

      count:
        judgments.length,

      judgments
    });

  } catch (error) {
    console.error(
      "LawBot judgment error:",
      error
    );

    return res.status(500).json({
      verified: false,
      error:
        error.message ||
        "Judgment operation failed"
    });
  }
}


/* =========================================================
   JUDGMENT READER NORMALIZER
   ========================================================= */

function normalizeJudgment(j) {
  return {
    verified: true,

    caseName:
      j.title ||
      j.case_name ||
      j.caseName ||
      null,

    court:
      j.court_name ||
      j.court ||
      null,

    courtLevel:
      j.court_level ||
      null,

    date:
      j.date ||
      j.decision_date ||
      null,

    citation:
      j.citation ||
      null,

    cnr:
      j.cnr ||
      null,

    judge:
      j.judge ||
      j.judges ||
      j.coram ||
      null,

    petitioner:
      j.petitioner ||
      j.appellant ||
      null,

    respondent:
      j.respondent ||
      j.respondents ||
      null,

    facts:
      j.facts ||
      j.case_facts ||
      null,

    issues:
      j.issues ||
      j.legal_issues ||
      null,

    arguments:
      j.arguments ||
      j.submissions ||
      null,

    findings:
      j.findings ||
      null,

    decision:
      cleanDecision(
        j.decision ||
        j.holding
      ),

    ratio:
      j.ratio_decidendi ||
      j.ratio ||
      null,

    relevantSections:
      j.applied_to_this_section ||
      j.relevant_sections ||
      j.sections ||
      null,

    basis:
      j.basis ||
      null,

    precedentialValue:
      j.precedential_value ||
      null,

    courtMarking:
      j.court_marking ||
      null,

    decidedUnder:
      j.decided_under ||
      null,

    source:
      j.url ||
      j.source ||
      null,

    document:
      j.document ||
      j.pdf ||
      j.document_url ||
      null
  };
}


/* =========================================================
   CLEAN PDF/DOC FILE NAMES
   ========================================================= */

function cleanDecision(value) {
  if (!value) return null;

  const text = String(value).trim();

  if (
    /\.(pdf|doc|docx)$/i.test(text)
  ) {
    return null;
  }

  return text;
}
