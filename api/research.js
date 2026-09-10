// api/research.js

const API_BASE = "https://indiacode.ecourtsindia.com/api/v1";

const ACTS = [
  { id: "ipc", names: ["ipc", "indian penal code", "penal code"] },
  { id: "bns", names: ["bns", "bharatiya nyaya sanhita"] },
  { id: "crpc", names: ["crpc", "code of criminal procedure", "criminal procedure code"] },
  { id: "bnss", names: ["bnss", "bharatiya nagarik suraksha sanhita"] },
  { id: "cpc", names: ["cpc", "code of civil procedure"] },
  { id: "bsa", names: ["bsa", "bharatiya sakshya adhiniyam"] },
  { id: "evidence-act", names: ["evidence act", "indian evidence act"] },
  { id: "ni-act", names: ["ni act", "negotiable instruments act", "cheque bounce", "cheque dishonour"] },
  { id: "it-act", names: ["it act", "information technology act", "information technology act 2000"] },
  { id: "pocso", names: ["pocso", "pocso act", "protection of children from sexual offences act"] },
  { id: "ndps-act", names: ["ndps", "ndps act", "narcotic drugs and psychotropic substances act"] }
];

function clean(v) {
  return String(v || "").trim();
}

function lower(v) {
  return clean(v).toLowerCase();
}

async function getJson(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

/* ---------------- ACT DETECTION ---------------- */

function detectActs(query) {
  const q = lower(query);
  const found = [];

  for (const act of ACTS) {
    let matched = "";

    for (const name of act.names) {
      if (q.includes(name) && name.length > matched.length) {
        matched = name;
      }
    }

    if (matched) {
      found.push({
        id: act.id,
        matched
      });
    }
  }

  return found;
}

/* ---------------- SECTION DETECTION ---------------- */

function sectionsInText(query) {
  const result = [];

  const patterns = [
    /\bsection\s+([0-9]+[A-Za-z-]*)\b/gi,
    /\bsec\.?\s+([0-9]+[A-Za-z-]*)\b/gi
  ];

  for (const regex of patterns) {
    let m;

    while ((m = regex.exec(query)) !== null) {
      if (!result.includes(m[1])) {
        result.push(m[1]);
      }
    }
  }

  return result;
}

/* ---------------- EXACT ACT + SECTION PAIRS ---------------- */

function detectPairs(query) {
  const q = lower(query);
  const pairs = [];

  const shorthand = [
    ["ipc", /\bipc\s+(?:section\s*)?([0-9]+[A-Za-z-]*)\b/gi],
    ["bns", /\bbns\s+(?:section\s*)?([0-9]+[A-Za-z-]*)\b/gi],
    ["crpc", /\bcrpc\s+(?:section\s*)?([0-9]+[A-Za-z-]*)\b/gi],
    ["bnss", /\bbnss\s+(?:section\s*)?([0-9]+[A-Za-z-]*)\b/gi],
    ["cpc", /\bcpc\s+(?:section\s*)?([0-9]+[A-Za-z-]*)\b/gi],
    ["bsa", /\bbsa\s+(?:section\s*)?([0-9]+[A-Za-z-]*)\b/gi],
    ["pocso", /\bpocso\s+(?:section\s*)?([0-9]+[A-Za-z-]*)\b/gi],
    ["it-act", /\bit\s+act\s+(?:section\s*)?([0-9]+[A-Za-z-]*)\b/gi],
    ["ni-act", /\bni\s+act\s+(?:section\s*)?([0-9]+[A-Za-z-]*)\b/gi]
  ];

  for (const [act, regex] of shorthand) {
    let m;

    while ((m = regex.exec(q)) !== null) {
      if (!pairs.some(x => x.act === act && x.section === m[1])) {
        pairs.push({
          act,
          section: m[1]
        });
      }
    }
  }

  const acts = detectActs(query);
  const sections = sectionsInText(query);

  if (acts.length && sections.length) {
    /*
      For a single explicit Act + natural language section query:
      "Section 66 of the Information Technology Act..."
    */
    if (acts.length === 1 && sections.length === 1) {
      if (!pairs.some(
        x => x.act === acts[0].id &&
             x.section === sections[0]
      )) {
        pairs.push({
          act: acts[0].id,
          section: sections[0]
        });
      }
    }
  }

  return pairs;
}

/* ---------------- DYNAMIC ACT DISCOVERY ---------------- */

async function discoverAct(query) {
  const cleaned = query
    .replace(/\bsection\s+[0-9]+[A-Za-z-]*\b/gi, "")
    .replace(/\bsec\.?\s+[0-9]+[A-Za-z-]*\b/gi, "")
    .trim();

  if (!cleaned) return null;

  let data = await getJson(
    API_BASE +
    "/acts?q=" +
    encodeURIComponent(cleaned) +
    "&limit=20"
  );

  if (data?.acts?.length) {
    return data.acts[0];
  }

  data = await getJson(
    API_BASE +
    "/search?kind=act&q=" +
    encodeURIComponent(cleaned) +
    "&limit=20"
  );

  const results =
    data?.results ||
    data?.hits ||
    [];

  return results[0] || null;
}

/* ---------------- EXACT PROVISION ---------------- */

async function exactProvision(act, section) {
  return await getJson(
    API_BASE +
    "/" +
    encodeURIComponent(act) +
    "/section/" +
    encodeURIComponent(section)
  );
}

/* ---------------- EXACT JUDGMENTS ---------------- */

async function exactJudgments(act, section, query) {
  const url =
    API_BASE +
    "/judgments?act=" +
    encodeURIComponent(act) +
    "&section=" +
    encodeURIComponent(section) +
    "&limit=30";

  const data = await getJson(url);

  if (data?.judgments) {
    return data.judgments;
  }

  /*
    Fallback to LawBot's judgment endpoint.
  */
  try {
    const r = await fetch(
      "/api/judgments?act=" +
      encodeURIComponent(act) +
      "&section=" +
      encodeURIComponent(section) +
      "&query=" +
      encodeURIComponent(query)
    );

    if (r.ok) {
      const d = await r.json();

      return d.judgments ||
             d.results ||
             [];
    }
  } catch {}

  return [];
}

/* ---------------- RETRIEVE ---------------- */

async function retrieve(pair, query) {
  const data = await exactProvision(
    pair.act,
    pair.section
  );

  if (!data) {
    return {
      act: pair.act,
      section: pair.section,
      found: false,
      provision: null,
      judgments: []
    };
  }

  const s = data.section || data.provision || data;
  const a = data.act || {};

  const provision = {
    act: pair.act,
    actTitle:
      a.short_title ||
      a.title ||
      a.name ||
      pair.act,

    section:
      s.number ||
      pair.section,

    heading:
      s.heading ||
      "",

    text:
      s.text ||
      s.body ||
      s.content ||
      "",

    classification:
      data.classification || [],

    correspondsTo:
      data.corresponds_to ||
      [],

    crossReferences:
      data.cross_references ||
      [],

    source:
      data.url ||
      `https://indiacode.ecourtsindia.com/${pair.act}/section/${pair.section}/`
  };

  let judgments =
    await exactJudgments(
      pair.act,
      pair.section,
      query
    );

  /*
    IMPORTANT:
    Only judgments actually returned by the database/API
    are passed to Gemini.
  */

  judgments = Array.isArray(judgments)
    ? judgments.slice(0, 30)
    : [];

  return {
    act: pair.act,
    section: pair.section,
    found: true,
    provision,
    judgments
  };
}

/* ---------------- NATURAL LANGUAGE ---------------- */

async function naturalPair(query) {
  const sections = sectionsInText(query);
  const acts = detectActs(query);

  if (!sections.length) return [];

  if (acts.length) {
    return [{
      act: acts[0].id,
      section: sections[0]
    }];
  }

  const discovered = await discoverAct(query);

  if (!discovered) return [];

  const act =
    discovered.id ||
    discovered.act_id ||
    discovered.actId;

  if (!act) return [];

  return [{
    act,
    section: sections[0]
  }];
}

/* ---------------- GEMINI MATERIAL ---------------- */

function material(results) {
  return results.map((r, index) => {
    if (!r.found) {
      return `
SOURCE ${index + 1}

ACT: ${r.act}
SECTION: ${r.section}

STATUS: PROVISION NOT RETRIEVED.
`;
    }

    const p = r.provision;

    const judgments =
      (r.judgments || [])
        .map((j, i) => `
JUDGMENT ${i + 1}

Case:
${j.title || j.caseName || ""}

Court:
${j.court_name || j.court || ""}

Date:
${j.date || ""}

Citation:
${j.citation || ""}

CNR:
${j.cnr || ""}

Facts:
${j.facts || ""}

Issues:
${j.issues || ""}

Decision:
${j.decision || ""}

Ratio:
${j.ratio || j.ratio_decidendi || ""}

Applied Section:
${j.applied_to_this_section || j.appliedToSection || ""}

Basis:
${j.basis || ""}

Source:
${j.url || j.source || ""}
`)
        .join("\n");

    return `
SOURCE ${index + 1}

ACT:
${p.actTitle}

ACT ID:
${p.act}

SECTION:
${p.section}

HEADING:
${p.heading}

STATUTORY TEXT:
${p.text}

CLASSIFICATION:
${JSON.stringify(p.classification)}

STATUTORY MAPPING:
${JSON.stringify(p.correspondsTo)}

CROSS REFERENCES:
${JSON.stringify(p.crossReferences)}

DATABASE-RETRIEVED JUDGMENTS:
${judgments}

PROVISION SOURCE:
${p.source}
`;
  }).join("\n\n==============================\n\n");
}

/* ---------------- GEMINI ---------------- */

async function gemini(query, results) {
  const prompt = `
You are LawBot AI, a legal research assistant.

USER QUESTION:
${query}

VERIFIED DATABASE MATERIAL:
${material(results)}

STRICT CASE-LAW RULES:

1. ONLY discuss judgments appearing under
   "DATABASE-RETRIEVED JUDGMENTS".

2. NEVER add a case from your own knowledge.

3. NEVER invent a case name.

4. NEVER invent a citation.

5. NEVER invent a court.

6. NEVER invent a date.

7. NEVER invent facts.

8. NEVER invent a ratio.

9. NEVER invent a decision.

10. If no judgment was retrieved, write:
   "No judgment was retrieved from the connected legal database for this provision/query."

11. Do not convert your background knowledge into a
    "Verified Judgment".

12. A judgment is "verified" only because it was supplied
    by the connected database/API.

13. Use the retrieved statutory text as the source of truth
    for the provision.

14. If multiple Acts or sections are supplied,
    analyze each separately.

15. Never confuse identical section numbers belonging
    to different Acts.

16. If this is a comparison, clearly compare the provisions.

17. Do not claim the database contains every Indian judgment.

18. Distinguish:
    - statutory text
    - statutory mapping
    - judicial decision
    - legal principle
    - practical significance

19. Do not give invented legal advice.

Use this format when appropriate:

## Legal Issue

## Relevant Law

## Provision-by-Provision Analysis

## Comparison

## Essential Elements

## Legal Effect / Punishment

## Exceptions / Provisos / Explanations

## Statutory Mapping

## Verified Judgments

## Judicial Position

## Practical Significance

## Illustrative Example

## Research Limitations

## Sources
`;

  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=" +
    encodeURIComponent(
      process.env.GEMINI_API_KEY || ""
    );

  const response = await fetch(url, {
    method: "POST",

    headers: {
      "Content-Type": "application/json"
    },

    body: JSON.stringify({
      contents: [{
        role: "user",
        parts: [{
          text: prompt
        }]
      }],

      generationConfig: {
        temperature: 0.05,
        maxOutputTokens: 7000
      }
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
      "Gemini request failed"
    );
  }

  return (
    data?.candidates?.[0]?.content?.parts
      ?.map(x => x.text || "")
      .join("\n") ||
    "No answer generated."
  );
}

/* ---------------- MAIN ---------------- */

export default async function handler(req, res) {
  try {
    if (
      req.method !== "GET" &&
      req.method !== "POST"
    ) {
      return res.status(405).json({
        error: "Method not allowed"
      });
    }

    let query = "";

    if (req.method === "POST") {
      query =
        req.body?.query ||
        req.body?.q ||
        "";
    } else {
      query =
        req.query?.query ||
        req.query?.q ||
        "";
    }

    query = clean(query);

    if (!query) {
      return res.status(400).json({
        error: "Missing query"
      });
    }

    /* Detect exact pairs first */
    let pairs = detectPairs(query);

    /* Natural-language fallback */
    if (!pairs.length) {
      pairs = await naturalPair(query);
    }

    /* Retrieve */
    const results = [];

    for (const pair of pairs.slice(0, 8)) {
      results.push(
        await retrieve(pair, query)
      );
    }

    /* Deduplicate */
    const seen = new Set();

    const uniqueResults =
      results.filter(r => {
        const key =
          r.act + ":" + r.section;

        if (seen.has(key)) {
          return false;
        }

        seen.add(key);
        return true;
      });

    /* Gemini */
    let answer;

    if (process.env.GEMINI_API_KEY) {
      answer =
        await gemini(
          query,
          uniqueResults
        );
    } else {
      answer =
        "Gemini API key is not configured.";
    }

    /* Frontend data */
    const provisions =
      uniqueResults
        .filter(r => r.found)
        .map(r => r.provision);

    const judgments = [];

    for (const r of uniqueResults) {
      for (const j of r.judgments || []) {
        judgments.push({
          ...j,
          verifiedAct: r.act,
          verifiedSection: r.section
        });
      }
    }

    const mappings = [];

    for (const p of provisions) {
      if (Array.isArray(p.correspondsTo)) {
        for (const m of p.correspondsTo) {
          mappings.push({
            fromAct: p.act,
            fromSection: p.section,
            ...m
          });
        }
      }
    }

    return res.status(200).json({
      answer,

      verified:
        provisions.length > 0,

      query,

      provisions,

      sections: provisions,

      verifiedProvisions: provisions,

      judgments,

      verifiedJudgments: judgments,

      mappings,

      correspondingProvisions: mappings,

      sources:
        provisions.map(p => ({
          act: p.actTitle,
          section: p.section,
          heading: p.heading,
          source: p.source
        })),

      research: {
        exactPairsDetected: pairs,

        retrievedPairs:
          uniqueResults.map(r => ({
            act: r.act,
            section: r.section,
            found: r.found,
            judgmentCount:
              (r.judgments || []).length
          }))
      }
    });

  } catch (error) {
    console.error(
      "Research API error:",
      error
    );

    return res.status(500).json({
      error:
        error.message ||
        "Research failed"
    });
  }
}
