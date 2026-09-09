export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    let act;
    let section;
    let court;

    if (req.method === "POST") {
      const body = req.body || {};
      act = body.act;
      section = body.section;
      court = body.court;
    } else {
      act = req.query?.act;
      section = req.query?.section;
      court = req.query?.court;
    }

    const params = new URLSearchParams();

    if (act) params.set("act", act);
    if (section) params.set("section", section);
    if (court) params.set("court", court);

    params.set("limit", "100");

    let url =
      `https://indiacode.ecourtsindia.com/api/v1/judgments?${params.toString()}`;

    const allJudgments = [];
    let total = 0;

    while (url) {
      const response = await fetch(url);
      const data = await response.json();

      if (!response.ok) {
        return res.status(response.status).json({
          error: data.error || "Judgment search failed"
        });
      }

      total = data.total || total;

      if (Array.isArray(data.judgments)) {
        allJudgments.push(...data.judgments);
      }

      url = data.next || null;
    }

    const judgments = allJudgments.map(judgment => ({
      verified: true,
      caseName: judgment.title,
      court: judgment.court_name,
      date: judgment.date,
      citation: judgment.citation,
      cnr: judgment.cnr,
      source: judgment.url,
      precedentialValue: judgment.precedential_value
    }));

    return res.status(200).json({
      verified: true,
      total,
      count: judgments.length,
      judgments
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Server error"
    });
  }
}
