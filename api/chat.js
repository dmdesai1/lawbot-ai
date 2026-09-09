export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { query } = req.body || {};

    if (!query || !query.trim()) {
      return res.status(400).json({
        error: "Please enter a legal question."
      });
    }

    const userQuery = query.trim();

    // Detect common Indian Acts
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
        pattern: /\bBSA\b|Bharatiya Sakshya Adhiniyam/i,
        id: "bsa",
        name: "Bharatiya Sakshya Adhiniyam, 2023"
      },
      {
        pattern: /\bIPC\b|Indian Penal Code/i,
        id: "ipc",
        name: "Indian Penal Code, 1860"
      }
    ];

    const selectedAct = actMap.find(act => act.pattern.test(userQuery));

    // Detect section number
    const sectionMatch = userQuery.match(
      /\b(?:section|sec\.?)\s*([0-9]+[A-Za-z-]*)\b/i
    );

    let verifiedContext = "";
    let sourceUrl = "";

    // Retrieve the actual legal provision
    if (selectedAct && sectionMatch) {
      const sectionNumber = sectionMatch[1];

      const apiUrl =
        `https://indiacode.ecourtsindia.com/api/v1/${selectedAct.id}/section/${encodeURIComponent(sectionNumber)}`;

      const legalResponse = await fetch(apiUrl);

      if (legalResponse.ok) {
        const legalData = await legalResponse.json();

        if (legalData.section) {
          const section = legalData.section;

          sourceUrl =
            legalData.url ||
            `https://indiacode.ecourtsindia.com/${selectedAct.id}/section/${sectionNumber}/`;

          verifiedContext = `
VERIFIED LEGAL SOURCE DATA

Act: ${legalData.act?.short_title || selectedAct.name}
Section: ${section.number}
Heading: ${section.heading}

Actual statutory text:
${section.text || "Text unavailable"}

Source:
${sourceUrl}

IMPORTANT:
The above section data was retrieved directly from the legal database API.
Use this retrieved data as the source of truth.
Do not change the section number, heading, or statutory text.
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

    const prompt = `You are LawBot AI, an Indian legal research assistant.

Your job is to explain verified Indian legal provisions clearly and accurately.

CRITICAL RULES:

1. When VERIFIED LEGAL SOURCE DATA is provided, treat it as the source of truth.
2. Never change or contradict the verified Act, section number, heading, or statutory text.
3. Never invent legal provisions, cases, citations, dates, or judgments.
4. The verified statutory text is already displayed separately to the user.
5. DO NOT repeat the full statutory text in your answer unless the user specifically asks for the exact text.
6. Instead, explain the provision in simple language.
7. Give the practical legal meaning and important points.
8. If the provision has subsections, explain each subsection briefly.
9. Clearly distinguish IPC, BNS, BNSS and BSA.
10. If a provision could not be verified, clearly say so.
11. Do not claim that a judgment exists unless it has been verified.
12. Do not say that information is officially verified unless the source data supports that statement.
13. Do not give legal advice as if you are the user's lawyer.
14. Keep the explanation focused and useful.

${verifiedContext || "No specific verified provision was retrieved for this question."}

User's question:
${userQuery}

Give a concise legal explanation based on the verified information above.

Do not repeat the full statutory text.`;

    // Ask Gemini to explain the verified material
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
        error: data.error?.message || "Gemini API error"
      });
    }

    const answer =
      data.candidates?.[0]?.content?.parts?.[0]?.text ||
      "I could not generate an answer.";

    return res.status(200).json({
      answer,
      verified: Boolean(verifiedContext),
      source: sourceUrl || null
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Server error. Please try again."
    });
  }
}
