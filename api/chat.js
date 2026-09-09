export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const { query } = req.body || {};

    if (!query || !query.trim()) {
      return res.status(400).json({
        error: "Please enter a legal question."
      });
    }

    const userQuery = query.trim();

    // --------------------------------------------------
    // ACT DETECTION
    // --------------------------------------------------

    const actMap = [
      {
        pattern: /\bBNS\b|Bharatiya Nyaya Sanhita/i,
        id: "bns",
        name: "Bharatiya Nyaya Sanhita, 2023"
      },
      {
        pattern: /\bBNSS\b|Bharatiya Nagarik Suraksha Sanhita/i,
        id: "bnss",
        name: "Bharatiya Nagarik Suraksha Sanhita, 2023"
      },
      {
        pattern: /\bBSA\b|Bharatiya Sakshya Adhiniyam|Evidence Act/i,
        id: "bsa",
        name: "Bharatiya Sakshya Adhiniyam, 2023"
      },
      {
        pattern: /\bIPC\b|Indian Penal Code/i,
        id: "ipc",
        name: "Indian Penal Code, 1860"
      },
      {
        pattern: /\bCrPC\b|Code of Criminal Procedure/i,
        id: "crpc",
        name: "Code of Criminal Procedure, 1973"
      },
      {
        pattern: /\bCPC\b|Code of Civil Procedure/i,
        id: "cpc",
        name: "Code of Civil Procedure, 1908"
      }
    ];

    const selectedAct = actMap.find(act =>
      act.pattern.test(userQuery)
    );

    // --------------------------------------------------
    // SECTION DETECTION
    // --------------------------------------------------

    const sectionMatch = userQuery.match(
      /\b(?:section|sec\.?)\s*([0-9]+[A-Za-z-]*)\b/i
    );

    let verifiedContext = "";
    let sourceUrl = "";
    let verified = false;

    let correspondingProvisions = [];

    // --------------------------------------------------
    // RETRIEVE VERIFIED LEGAL PROVISION
    // --------------------------------------------------

    if (selectedAct && sectionMatch) {
      const sectionNumber = sectionMatch[1];

      const apiUrl =
        `https://indiacode.ecourtsindia.com/api/v1/${selectedAct.id}/section/${encodeURIComponent(sectionNumber)}`;

      const legalResponse = await fetch(apiUrl);

      if (legalResponse.ok) {
        const legalData = await legalResponse.json();

        if (legalData.section) {
          const section = legalData.section;

          verified = true;

          sourceUrl =
            legalData.url ||
            section.url ||
            `https://indiacode.ecourtsindia.com/${selectedAct.id}/section/${sectionNumber}/`;

          // ------------------------------------------------
          // GET IPC -> BNS / CrPC -> BNSS / BSA MAPPINGS
          // ------------------------------------------------

          if (Array.isArray(legalData.corresponds_to)) {
            correspondingProvisions =
              legalData.corresponds_to.map(mapping => ({
                act: mapping.act || "",
                section: mapping.section || "",
                relation: mapping.relation || ""
              }));
          }

          verifiedContext = `
VERIFIED LEGAL SOURCE DATA

Act:
${legalData.act?.short_title || selectedAct.name}

Section:
${section.number || sectionNumber}

Heading:
${section.heading || "Heading unavailable"}

Actual statutory text:
${section.text || "Text unavailable"}

Source:
${sourceUrl}

VERIFICATION STATUS:
This provision was successfully retrieved from the connected legal database.

CORRESPONDING PROVISIONS:
${
  correspondingProvisions.length > 0
    ? correspondingProvisions
        .map(
          mapping =>
            `${mapping.act} Section ${mapping.section} (${mapping.relation || "corresponding provision"})`
        )
        .join("\n")
    : "No corresponding provision was returned by the legal database."
}

IMPORTANT:
The retrieved legal provision above is verified source data.
Treat it as the source of truth.
Do not invent, alter, or contradict the Act, section number, heading, or statutory text.
`;
        }
      } else if (legalResponse.status === 404) {
        verifiedContext = `
VERIFICATION RESULT

The requested ${selectedAct.name}, Section ${sectionNumber}, was not found in the connected legal database.

Do NOT invent or guess its contents.

Tell the user that the provision could not be verified.
`;
      }
    }

    // --------------------------------------------------
    // GEMINI PROMPT
    // --------------------------------------------------

    const prompt = `
You are LawBot AI, an Indian legal research assistant.

Your task is to explain Indian legal provisions using VERIFIED LEGAL SOURCE DATA whenever it is supplied.

CRITICAL RULES:

1. VERIFIED LEGAL SOURCE DATA is the source of truth.
2. If verified legal source data is provided, NEVER say that no verified source was provided.
3. Never invent a legal provision, section, case, citation, date, judgment, or statutory text.
4. The verified statutory text is displayed separately to the user.
5. Do NOT repeat the full statutory text unless the user specifically asks for the exact text.
6. Explain the provision in clear, concise language.
7. Explain its practical legal meaning.
8. If there are subsections, explain the subsections briefly.
9. Clearly distinguish IPC, BNS, CrPC, BNSS, BSA and other Acts.
10. If corresponding provisions are supplied, mention the mapping accurately.
11. Do not describe a similarity mapping as an officially enacted equivalence unless the source specifically establishes that.
12. Do not claim that a judgment exists unless it has been verified.
13. Do not invent case citations.
14. Do not provide legal advice as though you are the user's lawyer.
15. If the provision could not be verified, clearly say that it could not be verified.
16. Keep the answer focused and useful.

${verifiedContext || "NO VERIFIED LEGAL SOURCE DATA WAS RETRIEVED FOR THIS QUERY."}

User's question:
${userQuery}

${
  verified
    ? `
The legal provision above WAS successfully verified.

Therefore:
- Explain the verified provision.
- Do not say that the source was not provided.
- Do not say that the provision could not be verified.
`
    : ""
}

Give a concise legal explanation.

Do not repeat the full statutory text.
`;

    // --------------------------------------------------
    // GEMINI API
    // --------------------------------------------------

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY
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

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error:
          data.error?.message ||
          "Gemini API error"
      });
    }

    const answer =
      data.candidates?.[0]?.content?.parts?.[0]?.text ||
      "I could not generate an answer.";

    // --------------------------------------------------
    // RETURN RESULT
    // --------------------------------------------------

    return res.status(200).json({
      answer,
      verified,
      source: sourceUrl || null,
      correspondingProvisions
    });

  } catch (error) {
    console.error("LawBot chat error:", error);

    return res.status(500).json({
      error: "Server error. Please try again."
    });
  }
}
