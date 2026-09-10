export default async function handler(req, res) {
  try {
    const body = req.body || {};
    const query = String(
      body.query ||
      body.q ||
      req.query?.query ||
      req.query?.q ||
      ""
    ).trim();

    if (!query) {
      return res.status(400).json({
        error: "Please enter a legal research query."
      });
    }

    const API_BASE =
      `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`;

    const q = query.toLowerCase();

    let act = "";
    let section = "";

    // -----------------------------
    // Known Act detection
    // -----------------------------
    if (/\bBNS\b|bharatiya nyaya sanhita/i.test(query)) {
      act = "bns";
    } else if (
      /\bBNSS\b|bharatiya nagarik suraksha sanhita/i.test(query)
    ) {
      act = "bnss";
    } else if (
      /\bBSA\b|bharatiya sakshya adhiniyam|evidence act/i.test(query)
    ) {
      act = "bsa";
    } else if (/\bIPC\b|indian penal code/i.test(query)) {
      act = "ipc";
    } else if (
      /\bCrPC\b|code of criminal procedure/i.test(query)
    ) {
      act = "crpc";
    } else if (
      /\bCPC\b|code of civil procedure/i.test(query)
    ) {
      act = "cpc";
    } else if (
      /\bNI\s*Act\b|negotiable instruments act|cheque bounce/i.test(query)
    ) {
      act = "ni-act";
    }

    // -----------------------------
    // Section detection
    // -----------------------------
    const sectionMatch =
      query.match(
        /\b(?:section|sec\.?)\s*([0-9]+(?:[a-z]|-[a-z0-9]+)?)\b/i
      ) ||
      query.match(
        /\b(?:BNS|BNSS|BSA|IPC|CrPC|CPC)\s*[-:]?\s*([0-9]+(?:[a-z]|-[a-z0-9]+)?)\b/i
      ) ||
      query.match(
        /\b(?:NI\s*ACT|N\.I\.\s*ACT)\s*[-:]?\s*([0-9]+(?:[a-z]|-[a-z0-9]+)?)\b/i
      );

    if (sectionMatch) {
      section = sectionMatch[1];
    }

    // -----------------------------
    // Retrieve verified provisions
    // -----------------------------
    const sectionResponse = await fetch(
      `${API_BASE}/api/sections?q=${encodeURIComponent(query)}`
    );

    if (!sectionResponse.ok) {
      throw new Error("Legal provision search failed.");
    }

    const sectionData = await sectionResponse.json();

    const sections = Array.isArray(sectionData.sections)
      ? sectionData.sections
      : [];

    // -----------------------------
    // Dynamically infer Act + Section
    // -----------------------------
    if (!act && sections.length > 0) {
      const exact =
        sections.find((item) => {
          const itemSection = String(
            item.section ||
            item.number ||
            ""
          ).toLowerCase();

          return section && itemSection === String(section).toLowerCase();
        }) || sections[0];

      if (exact) {
        act =
          exact.actId ||
          exact.act_id ||
          exact.act ||
          "";

        if (!section) {
          section =
            exact.section ||
            exact.number ||
            "";
        }
      }
    }

    // -----------------------------
    // Retrieve verified judgments
    // -----------------------------
    let judgments = [];

    const judgmentParams = new URLSearchParams();

    judgmentParams.set("query", query);

    if (act) {
      judgmentParams.set("act", act);
    }

    if (section) {
      judgmentParams.set("section", section);
    }

    const judgmentResponse = await fetch(
      `${API_BASE}/api/judgments?${judgmentParams.toString()}`
    );

    if (judgmentResponse.ok) {
      const judgmentData = await judgmentResponse.json();

      judgments = Array.isArray(judgmentData.judgments)
        ? judgmentData.judgments
        : [];
    }

    // -----------------------------
    // Build verified provision text
    // -----------------------------
    const verifiedSections = sections
      .map((item) => {
        return {
          actId:
            item.actId ||
            item.act_id ||
            item.act ||
            null,

          actName:
            item.actName ||
            item.act_name ||
            item.title ||
            null,

          section:
            item.section ||
            item.number ||
            null,

          heading:
            item.heading ||
            item.title ||
            null,

          text:
            item.text ||
            item.content ||
            item.snippet ||
            null,

          classification:
            item.classification ||
            null,

          correspondingProvisions:
            Array.isArray(item.correspondingProvisions)
              ? item.correspondingProvisions
              : [],

          crossReferences:
            Array.isArray(item.crossReferences)
              ? item.crossReferences
              : [],

          source:
            item.source ||
            item.url ||
            null
        };
      })
      .filter((item) => item.text);

    // -----------------------------
    // Build verified judgment text
    // -----------------------------
    const verifiedJudgments = judgments.map((judgment) => {
      return {
        caseName: judgment.caseName || null,
        court: judgment.court || null,
        courtLevel: judgment.courtLevel || null,
        date: judgment.date || null,
        citation: judgment.citation || null,
        cnr: judgment.cnr || null,
        facts: judgment.facts || null,
        issues: judgment.issues || null,
        decision: judgment.decision || null,
        ratio: judgment.ratio || null,
        appliedToSection:
          judgment.appliedToSection || null,
        basis: judgment.basis || null,
        precedentialValue:
          judgment.precedentialValue || null,
        source: judgment.source || null
      };
    });

    // -----------------------------
    // Gemini
    // -----------------------------
    const geminiPrompt = `
You are LawBot AI, an Indian legal research assistant.

The user asked:

"${query}"

IMPORTANT SOURCE RULE:

The VERIFIED LEGAL MATERIAL below comes from the connected legal database.

Use that material as the source of truth.

Do NOT invent:
- sections
- Acts
- case names
- citations
- facts
- issues
- decisions
- ratios
- precedential value
- statutory mappings
- legal quotations

If a field is not supplied by the verified data, say that the field was not provided.

Do not pretend that every judgment in India has been searched.
The judgment results are only the verified judgments returned by the connected database.

Clearly distinguish between:
1. Statutory provision
2. Judicial decision
3. Legal principle
4. Practical significance

For statutory provisions, explain the actual retrieved text accurately.

For judgments, only discuss facts, issues, decision and ratio when those fields are actually supplied.

VERIFIED PROVISIONS:

${JSON.stringify(verifiedSections, null, 2)}

VERIFIED JUDGMENTS:

${JSON.stringify(verifiedJudgments, null, 2)}

ACT DETECTED:

${act || "Not conclusively detected"}

SECTION DETECTED:

${section || "Not conclusively detected"}

Prepare a detailed legal research answer using this structure:

## Legal Issue

Explain what the user's query concerns.

## Relevant Provision

Give the relevant Act, section/article and explain the retrieved statutory provision.

## Essential Elements

Explain the elements or requirements contained in the retrieved provision.

## Punishment / Consequence

Explain the punishment, penalty, consequence or legal effect only if supported by the retrieved material.

## Exceptions / Provisos / Explanations

Explain any provisos, explanations, exceptions or qualifications present in the retrieved material.

## Related Provisions

Discuss retrieved corresponding provisions and cross-references.

## Statutory Mapping

Explain any database-provided relationship with earlier or corresponding legislation.

If the database gives a relation such as "near-identical", "successor", "predecessor" or another relationship, describe it carefully.

Do not call a computed similarity relationship an official legislative declaration unless the source says so.

## Verified Judgments

For each relevant retrieved judgment, provide:

- Case name
- Court
- Date
- Citation, if supplied
- Facts, if supplied
- Issues, if supplied
- Decision, if supplied
- Ratio / legal principle, if supplied
- Application to the provision, if supplied

Do not manufacture missing details.

## Practical Significance

Explain how the retrieved provision and judgments may matter in practice.

## Illustrative Example

Give a simple hypothetical example based only on the legal rule actually established by the retrieved provision.

Clearly label it as an illustration, not as a real case.

## Sources

List the retrieved legal sources.

Use the actual source URLs supplied by the database.

If no verified provision was found, say:

"No verified statutory provision was retrieved from the connected legal database."

If no verified judgments were found, say:

"No verified judgments were retrieved from the connected legal database for this query."

End with:

"LawBot AI provides legal research information and does not replace advice from a qualified advocate."

Return only the research answer.
`;

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: "GEMINI_API_KEY is not configured."
      });
    }

    const geminiResponse = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: geminiPrompt
                }
              ]
            }
          ]
        })
      }
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();

      throw new Error(
        `Gemini request failed: ${errorText}`
      );
    }

    const geminiData = await geminiResponse.json();

    const answer =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Unable to generate a research answer.";

    return res.status(200).json({
      verified:
        verifiedSections.length > 0 ||
        verifiedJudgments.length > 0,

      query,

      act: act || null,

      section: section || null,

      sections: verifiedSections,

      judgments: verifiedJudgments,

      sectionCount: verifiedSections.length,

      judgmentCount: verifiedJudgments.length,

      answer
    });

  } catch (error) {
    console.error("Research API error:", error);

    return res.status(500).json({
      error:
        error?.message ||
        "Unable to complete legal research."
    });
  }
}
