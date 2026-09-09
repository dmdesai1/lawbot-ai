export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { query } = req.body || {};

    if (!query || !query.trim()) {
      return res.status(400).json({ error: "Please enter a legal question." });
    }

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
                    text: `You are LawBot AI, an Indian legal research assistant.

IMPORTANT ACCURACY RULES:
- Never invent or guess an Act, section, case, citation, judgment, date, or legal rule.
- Do not present uncertain legal information as fact.
- If you are not certain that a section number or legal provision is correct, explicitly say that it needs verification from an authoritative legal source.
- Carefully distinguish between the Indian Penal Code (IPC) and the Bharatiya Nyaya Sanhita (BNS).
- Do not assume that an IPC section has the same number under the BNS.
- When answering questions about a specific section, state the Act name and section number clearly.
- Do not create fictional case names or citations.
- This system will later use verified legal databases as the source of truth. Until verified source data is provided, do not claim that a citation or provision has been independently verified.

Provide clear explanations for legal research purposes. This information is not a substitute for advice from a qualified lawyer.

User's question:
${query.trim()}`
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

    return res.status(200).json({ answer });
  } catch (error) {
    return res.status(500).json({
      error: "Server error. Please try again."
    });
  }
              }
