export default async function handler(req, res) {

  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {

    /*
      --------------------------------------------------
      GET USER QUERY
      --------------------------------------------------
    */

    let query = "";

    if (req.method === "POST") {
      query = String(req.body?.query || "").trim();
    } else {
      query = String(
        req.query?.q ||
        req.query?.query ||
        ""
      ).trim();
    }

    if (!query) {
      return res.status(400).json({
        error: "Please enter a legal research question."
      });
    }


    /*
      --------------------------------------------------
      ACT / SECTION DETECTION
      --------------------------------------------------
    */

    let act = "";
    let section = "";

    if (
      /\bBNS\b|bharatiya nyaya sanhita/i.test(query)
    ) {
      act = "bns";
    }

    else if (
      /\bBNSS\b|bharatiya nagarik suraksha sanhita/i.test(query)
    ) {
      act = "bnss";
    }

    else if (
      /\bBSA\b|
      bharatiya sakshya adhiniyam|
      evidence act/i.test(query)
    ) {
      act = "bsa";
    }

    else if (
      /\bIPC\b|indian penal code/i.test(query)
    ) {
      act = "ipc";
    }

    else if (
      /\bCrPC\b|code of criminal procedure/i.test(query)
    ) {
      act = "crpc";
    }

    else if (
      /\bCPC\b|code of civil procedure/i.test(query)
    ) {
      act = "cpc";
    }

    else if (
      /\bNI\s*Act\b|
      negotiable instruments act|
      cheque bounce/i.test(query)
    ) {
      act = "ni-act";
    }


    const sectionMatch =
      query.match(
        /\b(?:section|sec\.?)\s*(\d+[A-Za-z]?)\b/i
      ) ||
      query.match(
        /\b(?:BNS|BNSS|BSA|IPC|CrPC|CPC)\s*[-:]?\s*(\d+[A-Za-z]?)\b/i
      ) ||
      query.match(
        /\b(?:NI\s*ACT|N\.I\.\s*ACT)\s*[-:]?\s*(\d+[A-Za-z]?)\b/i
      );

    if (sectionMatch) {
      section = sectionMatch[1];
    }


    /*
      --------------------------------------------------
      INTERNAL API BASE
      --------------------------------------------------
    */

    const protocol =
      req.headers["x-forwarded-proto"] ||
      "https";

    const host =
      req.headers.host;

    if (!host) {
      return res.status(500).json({
        error: "Unable to determine research server."
      });
    }

    const baseUrl =
      `${protocol}://${host}`;


    /*
      --------------------------------------------------
      RETRIEVE VERIFIED SECTIONS
      --------------------------------------------------
    */

    let sectionResults = [];

    try {

      const sectionParams =
        new URLSearchParams();

      sectionParams.set(
        "q",
        query
      );


      const sectionResponse =
        await fetch(
          `${baseUrl}/api/sections?${sectionParams.toString()}`
        );


      if (sectionResponse.ok) {

        const sectionData =
          await sectionResponse.json();


        if (
          Array.isArray(
            sectionData.sections
          )
        ) {

          sectionResults =
            sectionData.sections
              .slice(0, 10)
              .map(sectionItem => ({

                verified:
                  sectionItem.verified === true,

                act:
                  sectionItem.act || null,

                actId:
                  sectionItem.actId || null,

                section:
                  sectionItem.section || null,

                heading:
                  sectionItem.heading || null,

                text:
                  sectionItem.text || null,

                url:
                  sectionItem.url || null,

                correspondingProvisions:
                  Array.isArray(
                    sectionItem.correspondingProvisions
                  )
                    ? sectionItem.correspondingProvisions
                    : []

              }));

        }

      }

    } catch (sectionError) {

      console.error(
        "Research section retrieval error:",
        sectionError
      );

    }


    /*
      --------------------------------------------------
      PRIORITIZE EXACT PROVISION
      --------------------------------------------------
    */

    if (act && section) {

      const exactSection =
        sectionResults.find(item => {

          return (
            String(
              item.actId || ""
            ).toLowerCase() ===
              act.toLowerCase() &&

            String(
              item.section || ""
            ).toLowerCase() ===
              section.toLowerCase()
          );

        });


      if (exactSection) {

        sectionResults = [
          exactSection,

          ...sectionResults.filter(
            item => item !== exactSection
          )

        ];

      }

    }


    /*
      --------------------------------------------------
      RETRIEVE VERIFIED JUDGMENTS
      --------------------------------------------------
    */

    let judgmentResults = [];

    try {

      const judgmentParams =
        new URLSearchParams();

      judgmentParams.set(
        "query",
        query
      );


      if (act) {

        judgmentParams.set(
          "act",
          act
        );

      }


      if (section) {

        judgmentParams.set(
          "section",
          section
        );

      }


      const judgmentResponse =
        await fetch(
          `${baseUrl}/api/judgments?${judgmentParams.toString()}`
        );


      if (judgmentResponse.ok) {

        const judgmentData =
          await judgmentResponse.json();


        if (
          Array.isArray(
            judgmentData.judgments
          )
        ) {

          judgmentResults =
            judgmentData.judgments
              .filter(
                judgment =>
                  judgment &&
                  judgment.verified === true
              )
              .slice(0, 20)
              .map(judgment => ({

                verified: true,

                caseName:
                  judgment.caseName || null,

                court:
                  judgment.court || null,

                courtLevel:
                  judgment.courtLevel || null,

                date:
                  judgment.date || null,

                citation:
                  judgment.citation || null,

                cnr:
                  judgment.cnr || null,

                facts:
                  judgment.facts || null,

                issues:
                  judgment.issues || null,

                decision:
                  judgment.decision || null,

                ratio:
                  judgment.ratio || null,

                appliedToSection:
                  judgment.appliedToSection || null,

                basis:
                  judgment.basis || null,

                precedentialValue:
                  judgment.precedentialValue || null,

                source:
                  judgment.source || null

              }));

        }

      }

    } catch (judgmentError) {

      console.error(
        "Research judgment retrieval error:",
        judgmentError
      );

    }


    /*
      --------------------------------------------------
      BUILD VERIFIED PROVISION MATERIAL
      --------------------------------------------------
    */

    const verifiedSectionsText =
      sectionResults.length > 0

        ? sectionResults
            .map((item, index) => {

              const mappings =
                item.correspondingProvisions
                  .map(mapping => {

                    return `
${mapping.act || "Unknown Act"}
Section ${mapping.section || "Unknown"}
Relationship: ${
  mapping.relation ||
  "Corresponding provision"
}
Score: ${
  mapping.score ??
  "Not provided"
}
Source: ${
  mapping.url ||
  "Not provided"
}
`;

                  })
                  .join("\n");


              return `
========================================
VERIFIED PROVISION ${index + 1}
========================================

Act:
${item.act || "Unknown"}

Act ID:
${item.actId || "Unknown"}

Section:
${item.section || "Unknown"}

Heading:
${item.heading || "Not provided"}

FULL STATUTORY TEXT:
${item.text || "Not provided"}

CORRESPONDING PROVISIONS:
${mappings || "None returned"}

ORIGINAL SOURCE:
${item.url || "Not provided"}
`;

            })
            .join("\n")

        : "NO VERIFIED PROVISIONS WERE RETRIEVED.";


    /*
      --------------------------------------------------
      BUILD VERIFIED JUDGMENT MATERIAL
      --------------------------------------------------
    */

    const verifiedJudgmentsText =
      judgmentResults.length > 0

        ? judgmentResults
            .map((item, index) => {

              return `
========================================
VERIFIED JUDGMENT ${index + 1}
========================================

Case Name:
${item.caseName || "Not provided"}

Court:
${item.court || "Not provided"}

Court Level:
${item.courtLevel || "Not provided"}

Date:
${item.date || "Not provided"}

Citation:
${item.citation || "Not provided by source"}

CNR:
${item.cnr || "Not provided"}

Facts:
${item.facts || "Not provided by source"}

Issues:
${item.issues || "Not provided by source"}

Decision:
${item.decision || "Not provided by source"}

Ratio / Legal Principle:
${item.ratio || "Not provided by source"}

Application to Section:
${item.appliedToSection || "Not provided by source"}

Basis:
${item.basis || "Not provided by source"}

Precedential Value:
${item.precedentialValue || "Not provided by source"}

Original Source:
${item.source || "Not provided"}
`;

            })
            .join("\n")

        : "NO VERIFIED JUDGMENTS WERE RETRIEVED.";


    /*
      --------------------------------------------------
      GEMINI PROMPT
      --------------------------------------------------
    */

    const prompt = `

You are LawBot AI, an Indian legal research assistant.

The user's question is:

${query}


==================================================
IMPORTANT SOURCE RULE
==================================================

You MUST use the retrieved verified legal material
below as your primary and controlling research material.

Do NOT invent legal information.

Do NOT pretend that information exists when the
connected legal database did not provide it.


==================================================
VERIFIED STATUTORY MATERIAL
==================================================

${verifiedSectionsText}


==================================================
VERIFIED JUDGMENTS
==================================================

${verifiedJudgmentsText}


==================================================
DETAILED SECTION RESEARCH
==================================================

When the user asks about a particular statutory
section, provide a substantially detailed explanation.

Where the verified material supports it, explain:

1. What the section means.

2. The purpose and legal effect of the section.

3. Essential ingredients / elements.

4. What must generally be established for the
   provision to apply.

5. Punishment, penalty or consequence.

6. Exceptions, provisos or explanations.

7. Important definitions or cross-references.

8. Related statutory provisions.

9. Corresponding provisions under earlier/current
   legislation where the database provides them.

10. Verified judgments interpreting or applying
    the provision.

11. Practical significance.

12. A simple illustrative example where useful.

IMPORTANT:

If the retrieved material does not provide a fact,
do not manufacture it.

You may explain a statutory concept using general
legal reasoning only when it is directly supported
by the retrieved statutory material.

Do not invent section numbers.

Do not invent punishment.

Do not invent exceptions.

Do not invent case law.

Do not invent citations.


==================================================
JUDGMENT RULES
==================================================

Only discuss judgments appearing in VERIFIED JUDGMENTS.

For each relevant judgment, distinguish:

- Facts
- Issues
- Decision
- Ratio / legal principle
- Application to the section
- Precedential value

If a field says:

"Not provided by source"

do NOT fill it from memory.

If there are many judgments, prioritize the judgments
most directly relevant to the user's question.

Never claim that the retrieved corpus contains every
judgment in India.

Use wording such as:

"Judgments retrieved from the connected legal database."


==================================================
STATUTORY MAPPING RULES
==================================================

If a corresponding provision is supplied, report it.

For example:

IPC Section 302
→ BNS Section 103

But do NOT describe a database similarity mapping as
an officially enacted equivalence unless the source
specifically establishes that.

Clearly distinguish:

- statutory text
- database mapping
- judicial interpretation


==================================================
NO VERIFIED MATERIAL
==================================================

If no verified statutory provision was retrieved,
say:

"No verified statutory provision was retrieved for
this research query."

If no verified judgment was retrieved, say:

"No verified judgment was retrieved for this research
query."


==================================================
DO NOT OVERQUOTE
==================================================

Do not reproduce unnecessarily large amounts of
statutory text.

Explain the provision in your own words and use only
the retrieved text necessary to identify the law.


==================================================
RESPONSE FORMAT
==================================================

## Legal Issue

Clearly identify what the legal question is.

## Relevant Provision

Give:

- Act
- Section
- Heading
- Meaning
- Legal effect

## Essential Elements

Explain the important ingredients/elements of the
provision.

If the retrieved source does not provide enough
information to identify them confidently, say so.

## Punishment / Consequence

State the punishment, penalty or legal consequence
only when supported by the retrieved material.

## Exceptions / Provisos / Explanations

Explain these only when supported by the retrieved
material.

## Related Provisions

Identify relevant connected provisions supplied by
the retrieved material.

## Statutory Mapping

Explain any verified mapping supplied by the database.

## Verified Judgments

For each relevant judgment:

### Case Name

- Court:
- Date:
- Citation:
- Facts:
- Issues:
- Decision:
- Ratio / Legal Principle:
- Application to Section:
- Why Relevant:

Never invent missing fields.

## Practical Significance

Explain how the retrieved provision and judgments
matter in practice.

## Illustrative Example

Give a simple hypothetical example when useful.

Clearly label it as an illustration and not as an
additional legal authority.

## Sources

List the source links supplied by the connected
legal database.

End with:

"⚠️ This information is for legal research and
educational purposes and does not constitute formal
legal advice."


==================================================
FINAL SAFETY RULE
==================================================

Accuracy is more important than completeness.

If the connected legal material is insufficient,
say what is missing rather than guessing.

`;


    /*
      --------------------------------------------------
      GEMINI API
      --------------------------------------------------
    */

    const geminiResponse =
      await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            "x-goog-api-key":
              process.env.GEMINI_API_KEY
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

            ]

          })

        }
      );


    const geminiData =
      await geminiResponse.json();


    if (!geminiResponse.ok) {

      return res.status(
        geminiResponse.status
      ).json({

        error:
          geminiData.error?.message ||
          "Gemini API error"

      });

    }


    const answer =
      geminiData.candidates?.[0]
        ?.content?.parts?.[0]
        ?.text ||
      "I could not generate the legal research answer.";


    /*
      --------------------------------------------------
      FINAL RESPONSE
      --------------------------------------------------
    */

    return res.status(200).json({

      verified:
        sectionResults.some(
          item => item.verified
        ) ||
        judgmentResults.some(
          item => item.verified
        ),

      query,

      act:
        act || null,

      section:
        section || null,

      sections:
        sectionResults,

      judgments:
        judgmentResults,

      sectionCount:
        sectionResults.length,

      judgmentCount:
        judgmentResults.length,

      answer

    });


  } catch (error) {

    console.error(
      "LawBot research error:",
      error
    );


    return res.status(500).json({

      error:
        "Server error while conducting legal research."

    });

  }

}
