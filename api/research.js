export default async function handler(req, res) {

  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {

    let query = "";

    if (req.method === "POST") {
      query = String(req.body?.query || "").trim();
    } else {
      query = String(req.query?.q || req.query?.query || "").trim();
    }

    if (!query) {
      return res.status(400).json({
        error: "Please enter a legal research question."
      });
    }

    /*
      --------------------------------------------------
      BASIC ACT / SECTION DETECTION
      --------------------------------------------------
    */

    const q = query.toLowerCase();

    let act = "";
    let section = "";

    if (/\bBNS\b|bharatiya nyaya sanhita/i.test(query)) {
      act = "bns";
    }
    else if (/\bBNSS\b|bharatiya nagarik suraksha sanhita/i.test(query)) {
      act = "bnss";
    }
    else if (/\bBSA\b|bharatiya sakshya adhiniyam|evidence act/i.test(query)) {
      act = "bsa";
    }
    else if (/\bIPC\b|indian penal code/i.test(query)) {
      act = "ipc";
    }
    else if (/\bCrPC\b|code of criminal procedure/i.test(query)) {
      act = "crpc";
    }
    else if (/\bCPC\b|code of civil procedure/i.test(query)) {
      act = "cpc";
    }
    else if (/\bNI Act\b|negotiable instruments act|cheque bounce/i.test(query)) {
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
      req.headers["x-forwarded-proto"] || "https";

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
      RETRIEVE VERIFIED LEGAL SECTIONS
      --------------------------------------------------
    */

    let sectionResults = [];

    try {

      const sectionParams =
        new URLSearchParams();

      sectionParams.set("q", query);


      const sectionResponse =
        await fetch(
          `${baseUrl}/api/sections?${sectionParams.toString()}`
        );


      if (sectionResponse.ok) {

        const sectionData =
          await sectionResponse.json();


        if (
          Array.isArray(sectionData.sections)
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
      IF EXACT ACT + SECTION WAS IDENTIFIED,
      PRIORITIZE THAT PROVISION
      --------------------------------------------------
    */

    if (act && section) {

      const exactSection =
        sectionResults.find(item => {

          return (
            String(item.actId || "").toLowerCase() ===
              act.toLowerCase() &&
            String(item.section || "").toLowerCase() ===
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
      BUILD VERIFIED MATERIAL FOR GEMINI
      --------------------------------------------------
    */

    const verifiedSectionsText =
      sectionResults.length > 0
        ? sectionResults.map((item, index) => {

            const mappings =
              item.correspondingProvisions
                .map(mapping =>
                  `${mapping.act || ""} Section ${mapping.section || ""} (${mapping.relation || "corresponding provision"})`
                )
                .join("; ");


            return `
VERIFIED PROVISION ${index + 1}

Act: ${item.act || "Unknown"}
Section: ${item.section || "Unknown"}
Heading: ${item.heading || "Not provided"}

Statutory Text:
${item.text || "Not provided"}

Corresponding Provisions:
${mappings || "None returned"}

Source:
${item.url || "Not provided"}
`;

          }).join("\n")
        : "NO VERIFIED PROVISIONS WERE RETRIEVED.";


    const verifiedJudgmentsText =
      judgmentResults.length > 0
        ? judgmentResults.map((item, index) => {

            return `
VERIFIED JUDGMENT ${index + 1}

Case Name:
${item.caseName || "Not provided"}

Court:
${item.court || "Not provided"}

Date:
${item.date || "Not provided"}

Citation:
${item.citation || "Not provided"}

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

Precedential Value:
${item.precedentialValue || "Not provided by source"}

Source:
${item.source || "Not provided"}
`;

          }).join("\n")
        : "NO VERIFIED JUDGMENTS WERE RETRIEVED.";


    /*
      --------------------------------------------------
      GEMINI RESEARCH PROMPT
      --------------------------------------------------
    */

    const prompt = `
You are LawBot AI, an Indian legal research assistant.

Answer the user's legal research question using ONLY the verified legal material supplied below.

USER QUESTION:
${query}

==============================
VERIFIED LEGAL PROVISIONS
==============================

${verifiedSectionsText}

==============================
VERIFIED JUDGMENTS
==============================

${verifiedJudgmentsText}

==============================
STRICT RESEARCH RULES
==============================

1. The retrieved legal database material is the source of truth.

2. NEVER invent a case, citation, court, date, judgment, statutory provision, fact, issue, decision or ratio.

3. NEVER create a citation from your own knowledge.

4. Only discuss a judgment if it appears in VERIFIED JUDGMENTS above.

5. If a judgment field says "Not provided by source", do not fill it using your own knowledge.

6. If verified judgments are available, clearly identify them as verified from the connected legal database.

7. If no verified judgment is available, say:
   "No verified judgment was retrieved for this research query."

8. If no verified statutory provision is available, say:
   "No verified statutory provision was retrieved for this research query."

9. Do not confuse IPC with BNS, CrPC with BNSS, or Evidence Act with BSA.

10. If a statutory mapping is supplied, report the mapping accurately.

11. Do not call a similarity mapping an officially enacted equivalence unless the source specifically establishes that.

12. Do not repeat large amounts of statutory text. Explain it instead.

13. Distinguish clearly between:
   - statutory provision
   - judgment
   - legal principle
   - practical significance

14. Do not provide legal advice as though you are the user's lawyer.

15. If the available verified material is insufficient to answer part of the question, clearly say what information is missing.

==============================
RESPONSE FORMAT
==============================

## Legal Issue

Briefly identify the legal question.

## Relevant Provisions

Explain the verified provisions relevant to the question.

## Verified Judgments

For each relevant verified judgment, provide:

- Case name
- Court
- Date
- Citation, if supplied
- Facts, if supplied
- Issues, if supplied
- Decision, if supplied
- Ratio / legal principle, if supplied
- Why it is relevant

Do not invent missing information.

## Statutory Mapping

Mention any verified corresponding provision supplied by the database.

## Practical Significance

Give a concise explanation of what the retrieved law and judgments mean in practice.

## Sources

List the supplied source links.

End with:

"⚠️ This information is for legal research and educational purposes and does not constitute formal legal advice."
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
            "Content-Type": "application/json",
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
