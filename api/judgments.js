export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    let query = "";
    let act = "";
    let section = "";
    let court = "";

    if (req.method === "POST") {
      const body = req.body || {};
      query = body.query || "";
      act = body.act || "";
      section = body.section || "";
      court = body.court || "";
    } else {
      query = req.query?.query || "";
      act = req.query?.act || "";
      section = req.query?.section || "";
      court = req.query?.court || "";
    }

    const userQuery = String(query).trim();
    const q = userQuery.toLowerCase();

    /* ---------------------------------------------
       AUTOMATIC ACT DETECTION
    --------------------------------------------- */

    const actMap = [
      ["it-act", [
        "information technology act",
        "it act",
        "information technology act 2000"
      ]],
      ["ipc", ["indian penal code", "ipc"]],
      ["bns", ["bharatiya nyaya sanhita", "bns"]],
      ["crpc", ["code of criminal procedure", "crpc"]],
      ["bnss", ["bharatiya nagarik suraksha sanhita", "bnss"]],
      ["bsa", ["bharatiya sakshya adhiniyam", "bsa"]],
      ["evidence-act", ["indian evidence act", "evidence act"]],
      ["cpc", ["code of civil procedure", "cpc"]],
      ["ni-act", [
        "negotiable instruments act",
        "ni act",
        "cheque bounce",
        "cheque dishonour",
        "cheque dishonor"
      ]],
      ["pocso", ["pocso", "protection of children from sexual offences act"]],
      ["ndps-act", [
        "ndps",
        "narcotic drugs and psychotropic substances act"
      ]]
    ];

    if (!act) {
      for (const [id, names] of actMap) {
        if (names.some(name => q.includes(name))) {
          act = id;
          break;
        }
      }
    }

    /* ---------------------------------------------
       CHEQUE BOUNCE
    --------------------------------------------- */

    if (
      !act &&
      (
        q.includes("cheque bounce") ||
        q.includes("check bounce") ||
        q.includes("dishonoured cheque") ||
        q.includes("dishonored cheque") ||
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

    /* ---------------------------------------------
       SECTION DETECTION
    --------------------------------------------- */

    if (!section) {
      const matches = [
        ...q.matchAll(
          /\b(?:section|sec\.?)\s*([0-9]+[a-z]?(?:\([a-z0-9]+\))?)\b/gi
        ),
        ...q.matchAll(
          /\b(?:ipc|bns|crpc|bnss|bsa|cpc)\s*[-:]?\s*([0-9]+[a-z]?)\b/gi
        )
      ];

      if (matches.length) {
        section = matches[0][1];
      }
    }

    /* ---------------------------------------------
       COURT DETECTION
    --------------------------------------------- */

    if (!court) {
      if (q.includes("supreme court")) {
        court = "SC";
      } else if (q.includes("high court")) {
        court = "HC";
      }
    }

    /* ---------------------------------------------
       SEARCH PARAMETERS
    --------------------------------------------- */

    const baseParams = new URLSearchParams();

    if (act) baseParams.set("act", act);
    if (section) baseParams.set("section", section);
    if (court) baseParams.set("court", court);

    baseParams.set("limit", "100");

    let url =
      `https://indiacode.ecourtsindia.com/api/v1/judgments?${baseParams}`;

    const all = [];
    let total = 0;

    /* ---------------------------------------------
       RETRIEVE JUDGMENTS
    --------------------------------------------- */

    while (url) {
      const response = await fetch(url);
      const data = await response.json();

      if (!response.ok) {
        return res.status(response.status).json({
          error: data.error || "Judgment search failed"
        });
      }

      total = data.total || total;

      if (Array.isArray(data.judgments)) {
        all.push(...data.judgments);
      }

      url = data.next || null;

      if (all.length >= 500) break;
    }

    /* ---------------------------------------------
       NORMALIZE
    --------------------------------------------- */

    function normalize(value) {
      return String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    const stopWords = new Set([
      "the", "and", "for", "where", "with", "from",
      "that", "this", "case", "cases", "judgment",
      "judgments", "judgement", "judgements",
      "supreme", "court", "high", "section",
      "sections", "act", "under", "about",
      "what", "which", "how", "does", "can",
      "tell", "explain", "meaning", "law",
      "legal", "provision", "india", "indian",
      "of", "to", "in", "on", "is", "are",
      "was", "were", "a", "an", "whether",
      "person", "persons"
    ]);

    const words = normalize(userQuery)
      .split(/\s+/)
      .filter(w =>
        w.length >= 3 &&
        !stopWords.has(w)
      );

    /* ---------------------------------------------
       FIELD EXTRACTION
    --------------------------------------------- */

    function fields(j) {
      return {
        title: normalize(
          j.title ||
          j.case_name ||
          j.caseName
        ),

        court: normalize(
          j.court_name ||
          j.court
        ),

        facts: normalize(
          j.facts ||
          j.case_facts
        ),

        issues: normalize(
          j.issues ||
          j.legal_issues
        ),

        ratio: normalize(
          j.ratio_decidendi ||
          j.ratio
        ),

        decision: normalize(
          j.decision ||
          j.holding
        ),

        applied: normalize(
          j.applied_to_this_section
        ),

        basis: normalize(
          j.basis
        ),

        decidedUnder: normalize(
          j.decided_under
        )
      };
    }

    /* ---------------------------------------------
       ISSUE PHRASES
    --------------------------------------------- */

    const issuePhrases = [];

    const phrases = [
      "unauthorized access",
      "unauthorised access",
      "computer related offence",
      "computer related offences",
      "civil dispute",
      "commercial dispute",
      "corporate dispute",
      "criminal proceedings",
      "quashing of fir",
      "quashing fir",
      "fir quashed",
      "bail",
      "anticipatory bail",
      "regular bail",
      "dishonest intention",
      "fraudulent intention",
      "mens rea",
      "electronic evidence",
      "digital evidence",
      "cheque bounce",
      "dishonour of cheque",
      "dishonor of cheque",
      "service of notice",
      "statutory notice"
    ];

    for (const phrase of phrases) {
      if (q.includes(phrase)) {
        issuePhrases.push(phrase);
      }
    }

    /* ---------------------------------------------
       SCORE
    --------------------------------------------- */

    function score(j) {
      const f = fields(j);

      let s = 0;

      const combined = [
        f.title,
        f.facts,
        f.issues,
        f.ratio,
        f.decision,
        f.applied,
        f.basis,
        f.decidedUnder
      ].join(" ");

      /* Exact section */
      if (section) {
        const sec = normalize(section);

        if (f.applied.includes(sec)) s += 100;
        if (f.decidedUnder.includes(sec)) s += 80;
        if (f.basis.includes(sec)) s += 60;

        if (
          combined.includes(`section ${sec}`)
        ) {
          s += 40;
        }
      }

      /* Query words */
      for (const word of words) {
        if (f.title.includes(word)) s += 18;
        if (f.issues.includes(word)) s += 15;
        if (f.ratio.includes(word)) s += 14;
        if (f.applied.includes(word)) s += 16;
        if (f.basis.includes(word)) s += 10;
        if (f.decision.includes(word)) s += 9;
        if (f.facts.includes(word)) s += 5;
      }

      /* Exact issue phrases */
      for (const phrase of issuePhrases) {
        if (combined.includes(phrase)) {
          s += 30;
        }

        if (f.issues.includes(phrase)) {
          s += 25;
        }

        if (f.ratio.includes(phrase)) {
          s += 25;
        }
      }

      /* IT Act specific */
      if (
        act === "it-act" &&
        (
          q.includes("unauthorized access") ||
          q.includes("unauthorised access")
        )
      ) {
        if (
          combined.includes("unauthorized access") ||
          combined.includes("unauthorised access") ||
          combined.includes("computer related")
        ) {
          s += 50;
        }
      }

      /* Civil/commercial dispute */
      if (
        q.includes("civil dispute") ||
        q.includes("commercial dispute") ||
        q.includes("corporate dispute")
      ) {
        if (
          combined.includes("civil") ||
          combined.includes("commercial") ||
          combined.includes("corporate")
        ) {
          s += 30;
        }
      }

      /* Quashing */
      if (
        q.includes("quash") ||
        q.includes("quashing")
      ) {
        if (
          combined.includes("quash") ||
          combined.includes("quashing")
        ) {
          s += 35;
        }
      }

      /* Bail */
      if (q.includes("bail")) {
        if (combined.includes("bail")) {
          s += 35;
        }
      }

      /* Court */
      if (
        court === "SC" &&
        f.court.includes("supreme")
      ) {
        s += 30;
      }

      if (
        court === "HC" &&
        f.court.includes("high")
      ) {
        s += 20;
      }

      /* Quality */
      if (f.ratio) s += 8;
      if (f.issues) s += 6;
      if (f.decision) s += 6;
      if (f.applied) s += 12;

      return s;
    }

    /* ---------------------------------------------
       DEDUPLICATE
    --------------------------------------------- */

    const seen = new Set();

    const unique = all.filter(j => {
      const key = normalize(
        j.title ||
        j.case_name ||
        j.url ||
        JSON.stringify(j)
      );

      if (!key || seen.has(key)) return false;

      seen.add(key);
      return true;
    });

    /* ---------------------------------------------
       RANK
    --------------------------------------------- */

    const ranked = unique
      .map(j => ({
        judgment: j,
        score: score(j)
      }))
      .sort((a, b) => b.score - a.score);

    /* ---------------------------------------------
       RELEVANCE LABEL
    --------------------------------------------- */

    function relevance(score) {
      if (score >= 100) return "Direct";
      if (score >= 50) return "Related";
      return "Low";
    }

    /* ---------------------------------------------
       OUTPUT
    --------------------------------------------- */

    const judgments = ranked
      .slice(0, 20)
      .map(item => {
        const j = item.judgment;

        const decision =
          j.decision &&
          !/\.(pdf|doc|docx)$/i.test(
            String(j.decision).trim()
          )
            ? j.decision
            : (
              j.holding &&
              !/\.(pdf|doc|docx)$/i.test(
                String(j.holding).trim()
              )
                ? j.holding
                : null
            );

        return {
          verified: true,

          relevanceScore: item.score,

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

          decision,

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

      query: userQuery || null,

      act: act || null,

      section: section || null,

      court: court || null,

      total,

      count: judgments.length,

      judgments
    });

  } catch (error) {
    console.error(
      "LawBot judgment search error:",
      error
    );

    return res.status(500).json({
      error:
        error.message ||
        "Server error while searching judgments"
    });
  }
}
