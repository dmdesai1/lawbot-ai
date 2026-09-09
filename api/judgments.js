export default async function handler(req, res) {

  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {

    let query = "";
    let act = "";
    let section = "";
    let court = "";

    // -----------------------------------------------
    // GET REQUEST DATA
    // -----------------------------------------------

    if (req.method === "POST") {

      const body = req.body || {};

      query = body.query || "";
      act = body.act || "";
      section = body.section || "";
      court = body.court || "";

    } else {

      query = req.query?.query || "";
      act = req.query?.act || "";
      section = req.query?.section || "";
      court = req.query?.court || "";

    }

    const userQuery = String(query).trim();
    const q = userQuery.toLowerCase();


    // -----------------------------------------------
    // AUTOMATIC LEGAL CONTEXT
    // -----------------------------------------------

    // Cheque bounce normally refers to Section 138
    if (
      !act &&
      (
        q.includes("cheque bounce") ||
        q.includes("check bounce") ||
        q.includes("dishonoured cheque") ||
        q.includes("dishonored cheque") ||
        q.includes("dishonour of cheque") ||
        q.includes("dishonor of cheque") ||
        q.includes("cheque dishonour") ||
        q.includes("cheque dishonor")
      )
    ) {
      act = "ni-act";
      section = section || "138";
    }


    // Negotiable Instruments Act
    if (
      !act &&
      (
        q.includes("negotiable instruments act") ||
        q.includes("negotiable instrument act") ||
        q.includes("ni act") ||
        q.includes("n.i. act")
      )
    ) {
      act = "ni-act";
    }


    // -----------------------------------------------
    // SECTION DETECTION
    // -----------------------------------------------

    if (!section) {

      const sectionMatch =
        q.match(
          /\b(?:section|sec\.?)\s*(\d+[a-z]?)\b/i
        ) ||
        q.match(
          /\b(?:BNS|BNSS|BSA|IPC|CrPC|CPC)\s*[-:]?\s*(\d+[a-z]?)\b/i
        ) ||
        q.match(
          /\b(?:NI\s*ACT|N\.I\.\s*ACT)\s*[-:]?\s*(\d+[a-z]?)\b/i
        );

      if (sectionMatch) {
        section = sectionMatch[1];
      }

    }


    // -----------------------------------------------
    // COURT DETECTION
    // -----------------------------------------------

    if (!court) {

      if (q.includes("supreme court")) {
        court = "SC";
      }

      else if (q.includes("high court")) {
        court = "HC";
      }

    }


    // -----------------------------------------------
    // NATURAL LANGUAGE DATABASE SEARCH
    // -----------------------------------------------

    if (!act && !section && userQuery) {

      const searchUrl =
        `https://indiacode.ecourtsindia.com/api/v1/search?q=${encodeURIComponent(userQuery)}&limit=20`;

      const searchResponse =
        await fetch(searchUrl);

      const searchData =
        await searchResponse.json();


      if (!searchResponse.ok) {

        return res.status(searchResponse.status).json({
          error:
            searchData.error ||
            "Legal search failed"
        });

      }


      const results =
        Array.isArray(searchData.results)
          ? searchData.results
          : [];


      const sectionResult =
        results.find(function(result) {
          return result.kind === "section";
        });


      if (sectionResult && sectionResult.ref) {

        const parts =
          String(sectionResult.ref).split("/");


        if (
          parts.length >= 3 &&
          parts[1] === "section"
        ) {

          act = parts[0];
          section = parts[2];

        }

      }

    }


    // -----------------------------------------------
    // SEARCH VERIFIED JUDGMENTS
    // -----------------------------------------------

    const params =
      new URLSearchParams();


    if (act) {
      params.set("act", act);
    }


    if (section) {
      params.set("section", section);
    }


    if (court) {
      params.set("court", court);
    }


    params.set("limit", "100");


    let url =
      `https://indiacode.ecourtsindia.com/api/v1/judgments?${params.toString()}`;


    const allJudgments = [];
    let total = 0;


    // -----------------------------------------------
    // FOLLOW PAGINATION
    // -----------------------------------------------

    while (url) {

      const response =
        await fetch(url);


      const data =
        await response.json();


      if (!response.ok) {

        return res.status(response.status).json({
          error:
            data.error ||
            "Judgment search failed"
        });

      }


      total =
        data.total || total;


      if (Array.isArray(data.judgments)) {

        allJudgments.push(
          ...data.judgments
        );

      }


      url =
        data.next || null;

    }


    // -----------------------------------------------
    // RELEVANCE SCORING
    // -----------------------------------------------

    const stopWords = new Set([
      "the",
      "and",
      "for",
      "where",
      "with",
      "from",
      "that",
      "this",
      "case",
      "cases",
      "judgment",
      "judgments",
      "judgement",
      "judgements",
      "supreme",
      "court",
      "high",
      "section",
      "act",
      "under",
      "on",
      "of",
      "to",
      "in",
      "was",
      "were",
      "is",
      "are",
      "a",
      "an",
      "what",
      "which",
      "how",
      "does",
      "can",
      "about"
    ]);


    const queryWords =
      q
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter(function(word) {

          return (
            word.length >= 3 &&
            !stopWords.has(word)
          );

        });


    function calculateScore(judgment) {

      const title =
        String(
          judgment.title || ""
        ).toLowerCase();

      const ratio =
        String(
          judgment.ratio_decidendi || ""
        ).toLowerCase();

      const applied =
        String(
          judgment.applied_to_this_section || ""
        ).toLowerCase();

      const basis =
        String(
          judgment.basis || ""
        ).toLowerCase();

      const facts =
        String(
          judgment.facts || ""
        ).toLowerCase();

      const issues =
        String(
          judgment.issues || ""
        ).toLowerCase();

      const decision =
        String(
          judgment.decision || ""
        ).toLowerCase();

      const text =
        `${title} ${ratio} ${applied} ${basis} ${facts} ${issues} ${decision}`;


      let score = 0;


      queryWords.forEach(function(word) {

        // Case title
        if (title.includes(word)) {
          score += 10;
        }

        // Ratio
        if (ratio.includes(word)) {
          score += 8;
        }

        // Application to section
        if (applied.includes(word)) {
          score += 6;
        }

        // Database basis
        if (basis.includes(word)) {
          score += 4;
        }

        // Facts
        if (facts.includes(word)) {
          score += 4;
        }

        // Issues
        if (issues.includes(word)) {
          score += 4;
        }

        // Decision
        if (decision.includes(word)) {
          score += 4;
        }

        // General match
        if (text.includes(word)) {
          score += 2;
        }

      });


      // ---------------------------------------------
      // NOTICE / SERVICE RELEVANCE
      // ---------------------------------------------

      const noticeWords = [
        "notice",
        "served",
        "service",
        "serving",
        "dispatch",
        "deemed",
        "address",
        "refused",
        "refusal"
      ];


      noticeWords.forEach(function(word) {

        if (
          q.includes(word) &&
          text.includes(word)
        ) {
          score += 12;
        }

      });


      // ---------------------------------------------
      // CHEQUE BOUNCE RELEVANCE
      // ---------------------------------------------

      if (
        (
          q.includes("cheque bounce") ||
          q.includes("check bounce") ||
          q.includes("dishonoured cheque") ||
          q.includes("dishonored cheque")
        )
        &&
        (
          text.includes("cheque") ||
          text.includes("dishonour") ||
          text.includes("dishonor")
        )
      ) {
        score += 10;
      }


      return score;

    }


    // -----------------------------------------------
    // SORT BY RELEVANCE
    // -----------------------------------------------

    const rankedJudgments =
      allJudgments
        .map(function(judgment) {

          return {
            judgment,
            score:
              calculateScore(judgment)
          };

        })
        .sort(function(a, b) {

          return b.score - a.score;

        });


    // -----------------------------------------------
    // RETURN TOP VERIFIED RESULTS
    // -----------------------------------------------

    const topJudgments =
      rankedJudgments
        .slice(0, 20)
        .map(function(item) {

          const judgment =
            item.judgment;


          return {

            verified: true,

            relevanceScore:
              item.score,

            // Identity
            caseName:
              judgment.title ||
              judgment.case_name ||
              null,

            court:
              judgment.court_name ||
              judgment.court ||
              null,

            courtLevel:
              judgment.court_level ||
              null,

            date:
              judgment.date ||
              judgment.decision_date ||
              null,

            citation:
              judgment.citation ||
              null,

            cnr:
              judgment.cnr ||
              null,

            // Research material
            facts:
              judgment.facts ||
              judgment.case_facts ||
              null,

            issues:
              judgment.issues ||
              judgment.legal_issues ||
              null,

            decision:
              judgment.decision ||
              judgment.order ||
              judgment.holding ||
              null,

            ratio:
              judgment.ratio_decidendi ||
              judgment.ratio ||
              null,

            appliedToSection:
              judgment.applied_to_this_section ||
              null,

            basis:
              judgment.basis ||
              null,

            precedentialValue:
              judgment.precedential_value ||
              null,

            courtMarking:
              judgment.court_marking ||
              null,

            decidedUnder:
              judgment.decided_under ||
              null,

            source:
              judgment.url ||
              judgment.source ||
              null

          };

        });


    // -----------------------------------------------
    // RESPONSE
    // -----------------------------------------------

    return res.status(200).json({

      verified: true,

      query:
        userQuery || null,

      act:
        act || null,

      section:
        section || null,

      court:
        court || null,

      total,

      count:
        topJudgments.length,

      judgments:
        topJudgments

    });


  } catch (error) {

    console.error(
      "LawBot judgment search error:",
      error
    );

    return res.status(500).json({

      error:
        "Server error while searching judgments"

    });

  }

}
