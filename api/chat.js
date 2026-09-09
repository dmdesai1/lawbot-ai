import bns from "../data/bns.json";

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

    // Check whether the user asked for a BNS section
    const sectionMatch = userQuery.match(
      /\b(?:section|sec\.?)\s*(\d+)\b.*\b(?:BNS|Bharatiya Nyaya Sanhita)\b/i
    );

    let verifiedContext = "";

    if (sectionMatch) {
      const sectionNumber = sectionMatch[1];
      const section = bns.sections[sectionNumber];

      if (section) {
        verifiedContext = `
VERIFIED LEGAL SOURCE:
Act: ${bns.act}
Section: ${sectionNumber}
Title: ${section.title}
Verified: ${section.verified ? "YES" : "NO"}
${section.text ? `Official text available: ${section.text}` : ""}
${section.note ? `Note: ${section.note}` : ""}
Source: ${bns.source}
`;
      } else {
        verifiedContext = `
VERIFICATION RESULT:
The requested BNS Section ${sectionNumber} was NOT found in LawBot's current verified database.

Do NOT invent or guess its contents.
Tell the user that this provision is not currently available in the verified database.
`;
      }
    }

    const prompt = `You are LawBot AI, an Indian legal research assistant.

STRICT ACCURACY RULES:
- Never invent or guess legal provisions, cases, citations, dates, or judgments.
- When verified legal information is supplied below, treat it as the source of truth.
- Do not contradict verified information.
- If the requested provision is not in the verified database, clearly say that it could not be verified.
- Never pretend that an AI-generated answer is an officially verified legal text.
- Clearly distinguish BNS from IPC.
- Give concise, useful explanations.
- Do not claim that a judgment exists unless it has been verified from a legal source.

${verifiedContext}

User's question:
${userQuery}

Answer the user based on the verified information above.`;

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
      verified: Boolean(verifiedContext)
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Server error. Please try again."
    });
  }
}
