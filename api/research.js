export default async function handler(req, res) {

  try {

    // ==================================================
    // GET USER QUERY
    // ==================================================

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


    const q =
      query.toLowerCase();


    let act = "";
    let section = "";


    // ==================================================
    // KNOWN ACT DETECTION
    // ==================================================

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
      /\bBSA\b|bharatiya sakshya adhiniyam|evidence act/i.test(query)
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
      /\bNI\s*Act\b|negotiable instruments act|cheque bounce|check bounce/i.test(query)
    ) {

      act = "ni-act";

    }


    // ==================================================
    // SECTION DETECTION
    // ==================================================

    const sectionMatch =

      query.match(
        /\b(?:section|sec\.?)\s*([0-9]+(?:[a-z]|-[a-z0-9]+)?)\b/i
      )

      ||

      query.match(
        /\b(?:BNS|BNSS|BSA|IPC|CrPC|CPC)\s*[-:]?\s*([0-9]+(?:[a-z]|-[a-z0-9]+)?)\b/i
      )

      ||

      query.match(
        /\b(?:NI\s*ACT|N\.I\.\s*ACT)\s*[-:]?\s*([0-9]+(?:[a-z]|-[a-z0-9]+)?)\b/i
      );


    if (sectionMatch) {

      section =
        sectionMatch[1];

    }


    // ==================================================
    // RETRIEVE VERIFIED PROVISIONS
    // ==================================================

    const sectionResponse =
      await fetch(
        `${API_BASE}/api/sections?q=${encodeURIComponent(query)}`
      );


    if (!sectionResponse.ok) {

      throw new Error(
        "Legal provision search failed."
      );

    }


    const sectionData =
      await sectionResponse.json();


    const sections =
      Array.isArray(sectionData.sections)
        ? sectionData.sections
        : [];


    // ==================================================
    // INFER ACT / SECTION FROM VERIFIED RESULT
    // ==================================================
    // Only infer missing information.
    // Never overwrite an explicitly detected Act.

    if (sections.length > 0) {

      let exactSection = null;


      if (section) {

        exactSection =
          sections.find(function(item) {

            const itemSection =
              String(
                item.section ||
                item.number ||
                ""
              ).toLowerCase();

            return (
              itemSection ===
              String(section).toLowerCase()
            );

          });

      }


      const bestSection =
        exactSection ||
        sections[0];


      if (bestSection) {

        if (!act) {

          act =
            bestSection.actId ||
            bestSection.act_id ||
            "";

        }


        if (!section) {

          section =
            bestSection.section ||
            bestSection.number ||
            "";

        }

      }

    }


    // ==================================================
    // BUILD VERIFIED PROVISIONS
    // ==================================================

    const verifiedSections =
      sections

        .map(function(item) {

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
              item.act ||
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
              Array.isArray(
                item.correspondingProvisions
              )
                ? item.correspondingProvisions
                : [],

            crossReferences:
              Array.isArray(
                item.crossReferences
              )
                ? item.crossReferences
                : [],

            source:
              item.source ||
              item.url ||
              null

          };

        })

        .filter(function(item) {

          return item.text;

        });


    // ==================================================
    // DETERMINE RESEARCH TYPE
    // ==================================================

    let researchType =
      "general legal research";


    if (act && section) {

      researchType =
        "exact statutory section research";

    }

    else if (act && !section) {

      researchType =
        "Act-specific issue research";

    }

    else if (!act && !section) {

      researchType =
        "natural-language issue research";

    }


    // ==================================================
    // RETRIEVE VERIFIED JUDGMENTS
    // ==================================================

    let judgments = [];


    const judgmentParams =
      new URLSearchParams();


    /*
      Always send the original query.

      If an Act was confidently identified,
      restrict by Act.

      If a section was confidently identified,
      restrict by section too.

      For pure issue searches with no identified
      Act/section, allow the judgment engine to
      perform natural-language searching.
    */

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
        `${API_BASE}/api/judgments?${judgmentParams.toString()}`
      );


    if (judgmentResponse.ok) {

      const judgmentData =
        await judgmentResponse.json();


      judgments =
        Array.isArray(
          judgmentData.judgments
        )
          ? judgmentData.judgments
          : [];

    }


    // ==================================================
    // BUILD VERIFIED JUDGMENTS
    // ==================================================

    const verifiedJudgments =
      judgments.map(function(judgment) {

        return {

          caseName:
            judgment.caseName ||
            null,

          court:
            judgment.court ||
            null,

          courtLevel:
            judgment.courtLevel ||
            null,

          date:
            judgment.date ||
            null,

          citation:
            judgment.citation ||
            null,

          cnr:
            judgment.cnr ||
            null,

          facts:
            judgment.facts ||
            null,

          issues:
            judgment.issues ||
            null,

          decision:
            judgment.decision ||
            null,

          ratio:
            judgment.ratio ||
            null,

          appliedToSection:
            judgment.appliedToSection ||
            null,

          basis:
            judgment.basis ||
            null,

          precedentialValue:
            judgment.precedentialValue ||
            null,

          courtMarking:
            judgment.courtMarking ||
            null,

          decidedUnder:
            judgment.decidedUnder ||
            null,

          relevanceScore:
            judgment.relevanceScore ??
            null,

          source:
            judgment.source ||
            null

        };

      });


    // ==================================================
    // VERIFIED SOURCE MATERIAL
    // ==================================================

    const verifiedMaterial = {

      researchType,

      query,

      detectedAct:
        act ||
        null,

      detectedSection:
        section ||
        null,

      provisions:
        verifiedSections,

      judgments:
        verifiedJudgments

    };


    // ==================================================
    // GEMINI PROMPT
    // ==================================================

    const geminiPrompt = `

You are LawBot AI, an Indian legal research assistant.

The user asked:

"${query}"

RESEARCH TYPE:

${researchType}


==================================================
CRITICAL SOURCE RULE
==================================================

The VERIFIED LEGAL MATERIAL below was retrieved from
the connected legal database.

Treat the retrieved material as the source of truth.

Do NOT invent:

- Acts
- sections
- subsections
- legal rules
- case names
- citations
- facts
- issues
- decisions
- ratios
- holdings
- precedents
- statutory mappings
- quotations
- penalties
- procedural requirements

If information is not contained in the retrieved
material, clearly say that it was not supplied by
the connected database.

Do not use your own memory to create a case citation
or statutory provision.

Do not claim that the results represent every
judgment in India.

The judgment results are only the verified judgments
returned by the connected legal database.


==================================================
IMPORTANT RESEARCH PRINCIPLES
==================================================

For an exact statutory question:

Focus on the exact retrieved provision.

For a natural-language legal issue:

Identify the legal issue from the user's question,
then connect it to the retrieved provisions and
judgments.

For an Act-specific question:

Stay within the identified Act unless the verified
material contains a legitimate cross-reference.

For a multi-issue question:

Separate each legal issue clearly.

For judicial decisions:

Only state facts, issues, decisions and ratios when
those fields are actually supplied.

Never manufacture missing case details.


==================================================
VERIFIED LEGAL MATERIAL
==================================================

${JSON.stringify(
  verifiedMaterial,
  null,
  2
)}


==================================================
ANSWER FORMAT
==================================================

## Legal Issue

Identify and explain the user's actual legal question.

If there are multiple issues, list them separately.


## Relevant Law

Identify the verified Act, section or other legal
provision relevant to the query.

Explain the retrieved statutory text accurately.


## Essential Elements

Explain the legal ingredients, conditions or
requirements contained in the verified provision.


## Legal Effect / Punishment

Explain the punishment, penalty, liability,
consequence or legal effect only where supported
by the retrieved material.

Do not invent punishment.


## Exceptions / Provisos / Explanations

Explain relevant provisos, exceptions,
explanations or qualifications found in the
retrieved provision.


## Related Provisions

Discuss verified corresponding provisions,
cross-references and related sections.

Only use relationships supplied by the database.


## Statutory Mapping

Explain any verified relationship between
old and new legislation.

If the database describes a relationship as
"near-identical", "successor", "predecessor",
or another computed relationship, describe it
as a database relationship.

Do not call a computed similarity score an
official legislative declaration.


## Verified Judgments

List the most relevant retrieved judgments.

For each judgment provide, where supplied:

- Case name
- Court
- Date
- Citation
- Facts
- Issues
- Decision
- Ratio / Legal Principle
- Application to the issue

Prioritize judgments that actually discuss the
user's legal issue.

Do not manufacture missing information.


## Judicial Position

Based only on the verified judgments, explain
what courts have actually held.

If the retrieved cases do not establish a clear
position, say so.


## Practical Significance

Explain how the verified law and judgments may
matter in practice.

Do not present speculation as established law.


## Illustrative Example

Give one simple hypothetical example.

Clearly label it:

Illustration — not a real case.


## Research Limitations

Briefly state when:

- no verified provision was found, or
- no verified judgment was found, or
- the database did not supply particular details.


## Sources

List the actual source URLs supplied by the
connected legal database.

Do not invent URLs.


==================================================
NO-RESULT RULES
==================================================

If no verified statutory provision was retrieved,
say:

"No verified statutory provision was retrieved from
the connected legal database."

If no verified judgments were retrieved, say:

"No verified judgments were retrieved from the
connected legal database for this query."


End with:

"LawBot AI provides legal research information and
does not replace advice from a qualified advocate."


Return only the research answer.

`;


    // ==================================================
    // GEMINI API KEY
    // ==================================================

    if (!process.env.GEMINI_API_KEY) {

      return res.status(500).json({

        error:
          "GEMINI_API_KEY is not configured."

      });

    }


    // ==================================================
    // GEMINI REQUEST
    // ==================================================

    const geminiResponse =
      await fetch(

        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${encodeURIComponent(
          process.env.GEMINI_API_KEY
        )}`,

        {

          method:
            "POST",

          headers: {

            "Content-Type":
              "application/json"

          },

          body:
            JSON.stringify({

              contents: [

                {

                  parts: [

                    {

                      text:
                        geminiPrompt

                    }

                  ]

                }

              ]

            })

        }

      );


    if (!geminiResponse.ok) {

      const errorText =
        await geminiResponse.text();


      throw new Error(
        `Gemini request failed: ${errorText}`
      );

    }


    const geminiData =
      await geminiResponse.json();


    const answer =
      geminiData
        ?.candidates?.[0]
        ?.content?.parts?.[0]
        ?.text ||

      "Unable to generate a research answer.";


    // ==================================================
    // FINAL RESPONSE
    // ==================================================

    return res.status(200).json({

      verified:
        verifiedSections.length > 0 ||
        verifiedJudgments.length > 0,

      query,

      researchType,

      act:
        act ||
        null,

      section:
        section ||
        null,

      sections:
        verifiedSections,

      judgments:
        verifiedJudgments,

      sectionCount:
        verifiedSections.length,

      judgmentCount:
        verifiedJudgments.length,

      answer

    });


  } catch (error) {

    console.error(
      "Research API error:",
      error
    );


    return res.status(500).json({

      error:
        error?.message ||
        "Unable to complete legal research."

    });

  }

}
