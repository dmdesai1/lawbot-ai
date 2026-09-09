export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    let query = "";

    if (req.method === "POST") {
      query = (req.body?.query || "").trim();
    } else {
      query = (req.query?.q || "").trim();
    }

    if (!query) {
      return res.status(400).json({
        error: "Please provide a legal section or Act to search."
      });
    }

    const apiUrl =
      "https://indiacode.ecourtsindia.com/api/v1/search?" +
      new URLSearchParams({
        q: query,
        kind: "section",
        limit: "40"
      }).toString();

    const response = await fetch(apiUrl);
    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error || "Legal section search failed"
      });
    }

    const results = Array.isArray(data.results)
      ? data.results
      : [];

    const sections = results.map(result => ({
      verified: true,
      title: result.title || null,
      act: result.act || result.act_title || null,
      section: result.section || result.number || null,
      heading: result.heading || null,
      url: result.url || null
    }));

    return res.status(200).json({
      verified: true,
      query,
      total: data.total || sections.length,
      count: sections.length,
      sections
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Server error while searching legal sections."
    });
  }
        }
