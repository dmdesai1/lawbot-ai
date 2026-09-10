
// api/research.js

const API_BASE = "https://indiacode.ecourtsindia.com/api/v1";

function clean(value) {
  return String(value || "").trim();
}

function lower(value) {
  return clean(value).toLowerCase();
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

/* ---------------------------------------------------------
   KNOWN ACTS
--------------------------------------------------------- */

const ACTS = [
  {
    id: "ipc",
    names: [
      "ipc",
      "indian penal code",
      "penal code",
      "indian penal code 1860"
    ]
  },
  {
    id: "bns",
    names: [
      "bns",
      "bharatiya nyaya sanhita",
      "bharatiya nyaya sanhita 2023"
    ]
  },
  {
    id: "crpc",
    names: [
      "crpc",
      "code of criminal procedure",
      "criminal procedure code"
    ]
  },
  {
    id: "bnss",
    names: [
      "bnss",
      "bharatiya nagarik suraksha sanhita",
      "bharatiya nagarik suraksha sanhita 2023"
    ]
  },
  {
    id: "evidence-act",
    names: [
      "evidence act",
      "indian evidence act",
      "indian evidence act 1872"
    ]
  },
  {
    id: "bsa",
    names: [
      "bsa",
      "bharatiya sakshya adhiniyam",
      "bharatiya sakshya adhiniyam 2023"
    ]
  },
  {
    id: "cpc",
    names: [
      "cpc",
      "code of civil procedure",
      "civil procedure code"
    ]
  },
  {
    id: "ni-act",
    names: [
      "ni act",
      "negotiable instruments act",
      "negotiable instruments act 1881",
      "cheque bounce",
      "cheque dishonour"
    ]
  },
  {
    id: "it-act",
    names: [
      "it act",
      "information technology act",
      "information technology act 2000",
      "information technology act, 2000",
      "information technology law"
    ]
  },
  {
    id: "pocso",
    names: [
      "pocso",
      "pocso act",
      "protection of children from sexual offences act"
    ]
  },
  {
    id: "ndps-act",
    names: [
      "ndps",
      "ndps act",
      "narcotic drugs and psychotropic substances act"
    ]
  }
];

/* ---------------------------------------------------------
   DETECT ACTS
--------------------------------------------------------- */

function detectKnownActs(query) {
  const q = lower(query);
  const found = [];

  for (const act of ACTS) {
    let best = "";

    for (const name of act.names) {
      if (q.includes(name) && name.length > best.length) {
        best = name;
      }
    }

    if (best) {
      found.push({
        id: act.id,
        matched: best
      });
    }
  }

  return found;
}

/* ---------------------------------------------------------
   DETECT SECTION REFERENCES
   Supports:
   Section 302 IPC
   IPC Section 302
   IPC 302
   Section 66 Information Technology Act
   Information Technology Act Section 66
--------------------------------------------------------- */

function extractSectionNumbers(query) {
  const q = clean(query);

  const patterns = [
    /\bsection\s+([0-9]+[A-Za-z-]*)\b/gi,
    /\bsec\.?\s+([0-9]+[A-Za-z-]*)\b/gi
  ];

  const results = [];

  for (const regex of patterns) {
    let m;

    while ((m = regex.exec(q)) !== null) {
      if (!results.includes(m[1])) {
        results.push(m[1]);
      }
    }
  }

  return results;
}

/* ---------------------------------------------------------
   ACT + SECTION PAIR DETECTION
--------------------------------------------------------- */

function detectExplicitPairs(query) {
  const q = clean(query);
  const qLower = lower(query);

  const pairs = [];
  const knownActs = detectKnownActs(query);

  /*
    First look for patterns such as:

    IPC 302
    BNS 103
    CrPC 154
    IT Act 66
  */

  for (const act of knownActs) {
    for (const name of act.matched ? [act.matched] : []) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      const patterns = [
        new RegExp(
          "\\b" + escaped + "\\s+(?:section\\s*)?([0-9]+[A-Za-z-]*)\\b",
          "i"
        ),
        new RegExp(
          "\\bsection\\s+([0-9]+[A-Za-z-]*)\\s+(?:of\\s+)?(?:" +
            escaped +
            ")\\b",
          "i"
        )
      ];

      for (const regex of patterns) {
        const match = q.match(regex);

        if (match && match[1]) {
          const section = match[1];

          if (
            !pairs.some(
              p => p.act === act.id && p.section === section
            )
          ) {
            pairs.push({
              act: act.id,
              section
            });
          }
        }
      }
    }
  }

  /*
    Special handling for common shorthand:
    "IPC 302 vs BNS 103"
  */

  const shorthand = [
    ["ipc", /\bipc\s+([0-9]+[A-Za-z-]*)\b/gi],
    ["bns", /\bbns\s+([0-9]+[A-Za-z-]*)\b/gi],
    ["crpc", /\bcrpc\s+([0-9]+[A-Za-z-]*)\b/gi],
    ["bnss", /\bbnss\s+([0-9]+[A-Za-z-]*)\b/gi],
    ["cpc", /\bcpc\s+([0-9]+[A-Za-z-]*)\b/gi],
    ["bsa", /\bbsa\s+([0-9]+[A-Za-z-]*)\b/gi],
    ["pocso", /\bpocso\s+([0-9]+[A-Za-z-]*)\b/gi],
    ["it-act", /\bit\s+act\s+([0-9]+[A-Za-z-]*)\b/gi],
    ["ni-act", /\bni\s+act\s+([0-9]+[A-Za-z-]*)\b/gi]
  ];

  for (const [act, regex] of shorthand) {
    let m;

    while ((m = regex.exec(qLower)) !== null) {
      const section = m[1];

      if (
        !pairs.some(
          p => p.act === act && p.section === section
        )
      ) {
        pairs.push({
          act,
          section
        });
      }
    }
  }

  return pairs;
}

/* ---------------------------------------------------------
   DYNAMIC ACT DISCOVERY
--------------------------------------------------------- */

async function discoverAct(query) {
  const q = clean(query);

  if (!q) return null;

  const actsUrl =
    API_BASE +
    "/acts?q=" +
    encodeURIComponent(q) +
    "&limit=20";

  const actsData = await getJson(actsUrl);

  if (actsData?.acts?.length) {
    return chooseBestAct(actsData.acts, q);
  }

  const searchUrl =
    API_BASE +
    "/search?kind=act&q=" +
    encodeURIComponent(q) +
    "&limit=20";

  const searchData = await getJson(searchUrl);

  const results =
    searchData?.results ||
    searchData?.hits ||
    searchData?.search_results ||
    [];

  if (results.length) {
    return chooseBestAct(results, q);
  }

  return null;
}

function chooseBestAct(acts, query) {
  const q = lower(query);

  let best = null;
  let bestScore = -1;

  for (const item of acts) {
    const title = lower(
      item.short_title ||
      item.title ||
      item.name ||
      ""
    );

    const id = lower(item.id || item.act_id || "");

    let score = 0;

    if (title && q.includes(title)) score += 100;
    if (id && q.includes(id)) score += 80;

    const words = q
      .split(/\s+/)
      .filter(w => w.length > 3);

    for (const word of words) {
      if (title.includes(word)) score += 5;
    }

    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }

  return best;
}

/* ---------------------------------------------------------
   GET EXACT PROVISION
--------------------------------------------------------- */

async function getExactProvision(act, section) {
  if (!act || !section) return null;

  const url =
    API_BASE +
    "/" +
    encodeURIComponent(act) +
    "/section/" +
    encodeURIComponent(section);

  return await getJson(url);
}

/* ---------------------------------------------------------
   GET JUDGMENTS
--------------------------------------------------------- */

async function getJudgments(act, section, query = "") {
  const url =
    API_BASE +
    "/judgments?act=" +
    encodeURIComponent(act) +
    "&section=" +
    encodeURIComponent(section) +
    "&limit=20";

  const data = await getJson(url);

  if (data?.judgments) {
    return data.judgments;
  }

  /*
    Fallback to our own judgment API.
  */

  try {
    const ownUrl =
      "/api/judgments?act=" +
      encodeURIComponent(act) +
      "&section=" +
      encodeURIComponent(section) +
      "&query=" +
      encodeURIComponent(query);

    const r = await fetch(ownUrl);

    if (r.ok) {
      const own = await r.json();

      return (
        own.judgments ||
        own.results ||
        []
      );
    }
  } catch {}

  return [];
}

/* ---------------------------------------------------------
   NORMALIZE PROVISION
--------------------------------------------------------- */

function normalizeProvision(data, act, section) {
  if (!data) return null;

  const sectionData =
    data.section ||
    data.provision ||
    data;

  const actData =
    data.act ||
    {};

  return {
    act: act,
    actTitle:
      actData.short_title ||
      actData.title ||
      actData.name ||
      act,

    section:
      sectionData.number ||
      section,

    heading:
      sectionData.heading ||
      "",

    text:
      sectionData.text ||
      sectionData.body ||
      sectionData.content ||
      "",

    classification:
      data.classification ||
      [],

    correspondsTo:
      data.corresponds_to ||
      data.corresponding_provisions ||
      [],

    crossReferences:
      data.cross_references ||
      data.crossReferences ||
      [],

    judgments:
      data.judgments ||
      [],

    source:
      data.url ||
      `https://indiacode.ecourtsindia.com/${act}/section/${section}/`
  };
}

/* ---------------------------------------------------------
   RETRIEVE ONE ACT/SECTION
--------------------------------------------------------- */

async function retrievePair(pair, query) {
  let act = pair.act;
  let section = pair.section;

  const exact = await getExactProvision(act, section);

  if (!exact) {
    return {
      requestedAct: act,
      requestedSection: section,
      found: false,
      provision: null,
      judgments: []
    };
  }

  const provision = normalizeProvision(
    exact,
    act,
    section
  );

  let judgments = await getJudgments(
    act,
    section,
    query
  );

  if (
    (!judgments || !judgments.length) &&
    provision.judgments?.length
  ) {
    judgments = provision.judgments;
  }

  return {
    requestedAct: act,
    requestedSection: section,
    found: true,
    provision,
    judgments
  };
}

/* ---------------------------------------------------------
   SINGLE-ACT NATURAL LANGUAGE RESOLUTION
--------------------------------------------------------- */

async function resolveNaturalLanguagePair(query) {
  const sections = extractSectionNumbers(query);

  if (!sections.length) return [];

  const knownActs = detectKnownActs(query);

  /*
    If a known Act is present but pair detection failed,
    use the first section number with that Act.
  */

  if (knownActs.length) {
    const act = knownActs[0].id;

    return [
      {
        act,
        section: sections[0]
      }
    ];
  }

  /*
    Dynamic Act discovery.

    Remove section wording before searching for the Act,
    so "Section 66 ... unauthorized access" does not cause
    an unrelated Act to win.
  */

  let actSearchText = query
    .replace(
      /\bsection\s+[0-9]+[A-Za-z-]*\b/gi,
      ""
    )
    .replace(
      /\bsec\.?\s+[0-9]+[A-Za-z-]*\b/gi,
      ""
    )
    .trim();

  const discovered = await discoverAct(actSearchText);

  if (!discovered) return [];

  const act =
    discovered.id ||
    discovered.act_id ||
    discovered.actId;

  if (!act) return [];

  return [
    {
      act,
      section: sections[0]
    }
  ];
}

/* ---------------------------------------------------------
   FORMAT MATERIAL FOR GEMINI
--------------------------------------------------------- */

function buildResearchMaterial(results) {
  return results
    .map((result, index) => {
      if (!result.found || !result.provision) {
        return `
SOURCE ${index + 1}
Requested Act: ${result.requestedAct}
Requested Section: ${result.requestedSection}
STATUS: NOT FOUND
`;
      }

      const p = result.provision;

      const judgments = (result.judgments || [])
        .slice(0, 12)
        .map((j, i) => {
          return `
Judgment ${i + 1}
Case: ${j.title || j.caseName || ""}
Court: ${j.court_name || j.court || ""}
Date: ${j.date || ""}
Citation: ${j.citation || ""}
CNR: ${j.cnr || ""}
Applied to section: ${j.applied_to_this_section || j.appliedToSection || ""}
Basis: ${j.basis || ""}
Ratio: ${j.ratio_decidendi || j.ratio || ""}
Decision: ${j.decision || ""}
Source: ${j.url || ""}
`;
        })
        .join("\n");

      return `
SOURCE ${index + 1}

Act:
${p.actTitle}

Act ID:
${p.act}

Section:
${p.section}

Heading:
${p.heading}

STATUTORY TEXT:
${p.text}

CLASSIFICATION:
${JSON.stringify(p.classification || [])}

STATUTORY CORRESPONDENCE:
${JSON.stringify(p.correspondsTo || [])}

CROSS REFERENCES:
${JSON.stringify(p.crossReferences || [])}

VERIFIED JUDGMENTS:
${judgments}

SOURCE URL:
${p.source}
`;
    })
    .join("\n\n--------------------------------\n\n");
}

/* ---------------------------------------------------------
   GEMINI
--------------------------------------------------------- */

async function askGemini(query, results) {
  const material = buildResearchMaterial(results);

  const prompt = `
You are LawBot AI, a legal research assistant.

USER QUERY:
${query}

VERIFIED LEGAL RESEARCH MATERIAL:
${material}

IMPORTANT RULES:

1. The verified material above is the source of truth.
2. Do NOT invent statutory provisions.
3. Do NOT invent Acts.
4. Do NOT invent judgments.
5. Do NOT invent citations, CNR numbers, facts, ratios, decisions or punishments.
6. If a requested provision was not found, clearly say it was not retrieved.
7. If multiple provisions are supplied, analyze EACH provision separately.
8. If the question compares two provisions, directly compare them.
9. Do not confuse a section number from one Act with the same section number from another Act.
10. For natural-language legal issues, answer the actual legal issue using the retrieved provision.
11. Distinguish statutory text from judicial interpretation.
12. If a statutory mapping is supplied, explain it but do not call similarity-based mapping an official legislative equivalence unless the material explicitly says so.
13. Do not claim that the connected database contains every judgment in India.
14. Do not provide legal advice as if you are the user's lawyer.
15. Keep the answer useful and legally precise.

For a comparison, use a table when useful.

Use this structure where applicable:

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

When answering, prioritize the exact retrieved statutory text and verified judgment data.
`;

  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=" +
    encodeURIComponent(process.env.GEMINI_API_KEY || "");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: prompt
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.1,
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
      ?.map(p => p.text || "")
      .join("\n") ||
    "No answer generated."
  );
}

/* ---------------------------------------------------------
   MAIN HANDLER
--------------------------------------------------------- */

export default async function handler(req, res) {
  try {
    if (req.method !== "GET" && req.method !== "POST") {
      return res.status(405).json({
        error: "Method not allowed"
      });
    }

    let query = "";

    if (req.method === "POST") {
      query =
        req.body?.query ||
        req.body?.q ||
        req.body?.search ||
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

    /* ---------------------------------------------
       STEP 1 — Detect exact Act/Section pairs
    --------------------------------------------- */

    let pairs = detectExplicitPairs(query);

    /* ---------------------------------------------
       STEP 2 — Natural language fallback
    --------------------------------------------- */

    if (!pairs.length) {
      pairs = await resolveNaturalLanguagePair(query);
    }

    /* ---------------------------------------------
       STEP 3 — Retrieve exact provisions
    --------------------------------------------- */

    let results = [];

    for (const pair of pairs.slice(0, 8)) {
      const result = await retrievePair(
        pair,
        query
      );

      results.push(result);
    }

    /* ---------------------------------------------
       STEP 4 — If no exact pair found,
       perform broader research through sections API
    --------------------------------------------- */

    if (!results.length) {
      try {
        const fallbackUrl =
          "/api/sections?q=" +
          encodeURIComponent(query) +
          "&query=" +
          encodeURIComponent(query);

        const r = await fetch(fallbackUrl);

        if (r.ok) {
          const data = await r.json();

          const provisions =
            data.provisions ||
            data.sections ||
            data.results ||
            [];

          for (const item of provisions.slice(0, 5)) {
            if (
              item.act &&
              item.section
            ) {
              const result =
                await retrievePair(
                  {
                    act: item.act,
                    section: item.section
                  },
                  query
                );

              results.push(result);
            }
          }
        }
      } catch {}
    }

    /* ---------------------------------------------
       STEP 5 — Remove duplicates
    --------------------------------------------- */

    const seen = new Set();

    results = results.filter(result => {
      const key =
        result.requestedAct +
        ":" +
        result.requestedSection;

      if (seen.has(key)) return false;

      seen.add(key);
      return true;
    });

    /* ---------------------------------------------
       STEP 6 — Gemini
    --------------------------------------------- */

    let answer;

    if (process.env.GEMINI_API_KEY) {
      answer = await askGemini(
        query,
        results
      );
    } else {
      answer =
        "Gemini API key is not configured.";
    }

    /* ---------------------------------------------
       STEP 7 — Build frontend-friendly output
    --------------------------------------------- */

    const verifiedProvisions = results
      .filter(r => r.found && r.provision)
      .map(r => ({
        act: r.provision.act,
        actTitle: r.provision.actTitle,
        section: r.provision.section,
        heading: r.provision.heading,
        text: r.provision.text,
        classification:
          r.provision.classification,
        correspondsTo:
          r.provision.correspondsTo,
        crossReferences:
          r.provision.crossReferences,
        source:
          r.provision.source
      }));

    const verifiedJudgments = [];

    for (const result of results) {
      for (const j of result.judgments || []) {
        verifiedJudgments.push({
          ...j,
          verifiedAct:
            result.provision?.act ||
            result.requestedAct,
          verifiedSection:
            result.provision?.section ||
            result.requestedSection
        });
      }
    }

    const mappings = [];

    for (const provision of verifiedProvisions) {
      if (Array.isArray(provision.correspondsTo)) {
        mappings.push(
          ...provision.correspondsTo.map(m => ({
            fromAct: provision.act,
            fromSection: provision.section,
            ...m
          }))
        );
      }
    }

    return res.status(200).json({
      answer,

      verified:
        verifiedProvisions.length > 0,

      query,

      provisions:
        verifiedProvisions,

      sections:
        verifiedProvisions,

      verifiedProvisions,

      judgments:
        verifiedJudgments,

      verifiedJudgments,

      mappings,

      correspondingProvisions:
        mappings,

      sources:
        verifiedProvisions.map(
          p => ({
            act: p.actTitle,
            section: p.section,
            heading: p.heading,
            source: p.source
          })
        ),

      research: {
        exactPairsDetected: pairs,
        retrievedPairs: results.map(r => ({
          act: r.requestedAct,
          section: r.requestedSection,
          found: r.found
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
