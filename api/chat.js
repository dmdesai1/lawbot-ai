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
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
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
                  text:
                    "You are LawBot AI, an Indian legal research assistant. " +
                    "Answer questions about Indian law clearly and accurately. " +
                    "Explain relevant Acts, sections and legal principles. " +
                    "Do not invent cases, sections or citations. " +
                    "If you are uncertain, clearly say so. " +
                    "This information is for legal research and is not a substitute for advice from a qualified lawyer.\\n\\n" +
                    "User's question: " +
                    query.trim()
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
