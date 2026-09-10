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
    // REQUEST DATA
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
          /\b(?:section|sec\.?)\s*(\d+[a-z]?(?:\([a-z0-9]+\))?)\b/i
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
    // NATURAL LANGUAGE ACT/SECTION DISCOVERY
    // -----------------------------------------------

    if ((!act || !section) && userQuery) {

      try {

        const searchUrl =
          `https://indiacode.ecourtsindia.com/api/v1/search?` +
          new URLSearchParams({
            q: userQuery,
            kind: "section",
            limit: "40"
          }).toString();

        const searchResponse =
          await fetch(searchUrl);

        if (searchResponse.ok) {

          const searchData =
            await searchResponse.json();

          const results =
            Array.isArray(searchData.results)
              ? searchData.results
              : [];


          const requestedSection =
            section
              ? String(section).toLowerCase()
              : null;


          const candidate =
            results.find(function(result) {

              const resultSection =
                String(
                  result.section ||
                  result.number ||
                  ""
                ).toLowerCase();

              return (
                requestedSection &&
                resultSection === requestedSection
              );

            }) ||
            results.find(function(result) {

              return result.kind === "section";

            });


          if (candidate) {

            let discoveredAct = null;
            let discoveredSection = null;


            if (candidate.ref) {

              const parts =
                String(candidate.ref).split("/");

              if (
                parts.length >= 3 &&
                parts[1] === "section"
              ) {

                discoveredAct = parts[0];
                discoveredSection = parts[2];

              }

            }


            if (candidate.url) {

              const urlMatch =
                candidate.url.match(
                  /\/([^/]+)\/section\/([^/?#]+)/i
                );

              if (urlMatch) {

                discoveredAct =
                  discoveredAct ||
                  urlMatch[1];

                discoveredSection =
                  discoveredSection ||
                  decodeURIComponent(
                    urlMatch[2]
                  );

              }

            }


            if (!act && discoveredAct) {
              act = discoveredAct;
            }

            if (!section && discoveredSection) {
              section = discoveredSection;
            }

          }

        }

      } catch (searchError) {

        console.error(
          "Natural language legal search error:",
          searchError
        );

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
    // STOP WORDS
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
      "sections",
      "act",
      "under",
      "about",
      "what",
      "which",
      "how",
      "does",
      "can",
      "tell",
      "explain",
      "meaning",
      "law",
      "legal",
      "provision",
      "india",
      "indian",
      "of",
      "to",
      "in",
      "on",
      "is",
      "are",
      "was",
      "were",
      "a",
      "an"
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


    // -----------------------------------------------
    // NORMALIZE
    // -----------------------------------------------

    function normalize(value) {

      return String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    }


    // -----------------------------------------------
    // RELEVANCE SCORING
    // -----------------------------------------------

    function calculateScore(judgment) {

      const title =
        normalize(
          judgment.title ||
          judgment.case_name
        );

      const ratio =
        normalize(
          judgment.ratio_decidendi ||
          judgment.ratio
        );

      const applied =
        normalize(
          judgment.applied_to_this_section
        );

      const basis =
        normalize(
          judgment.basis
        );

      const facts =
        normalize(
          judgment.facts ||
          judgment.case_facts
        );

      const issues =
        normalize(
          judgment.issues ||
          judgment.legal_issues
        );

      const decision =
        normalize(
          judgment.decision ||
          judgment.holding
        );

      const decidedUnder =
        normalize(
          judgment.decided_under
        );


      const text =
        [
          title,
          ratio,
          applied,
          basis,
          facts,
          issues,
          decision,
          decidedUnder
        ].join(" ");


      let score = 0;


      // ---------------------------------------------
      // VERY STRONG EXACT SECTION SIGNAL
      // ---------------------------------------------

      if (section) {

        const sectionNumber =
          normalize(section);

        const sectionPatterns = [

          `section ${sectionNumber}`,
          `section ${sectionNumber} of`,
          `section ${sectionNumber} it`,
          `section ${sectionNumber} act`

        ];


        sectionPatterns.forEach(function(pattern) {

          if (text.includes(pattern)) {
            score += 35;
          }

        });


        // Database says judgment applies directly
        if (
          applied &&
          applied.includes(sectionNumber)
        ) {
          score += 80;
        }


        // Database basis mentions section
        if (
          basis &&
          basis.includes(sectionNumber)
        ) {
          score += 45;
        }


        // Decided under the section
        if (
          decidedUnder &&
          decidedUnder.includes(sectionNumber)
        ) {
          score += 60;
        }

      }


      // ---------------------------------------------
      // FIELD-WEIGHTED QUERY MATCH
      // ---------------------------------------------

      queryWords.forEach(function(word) {

        if (title.includes(word)) {
          score += 12;
        }

        if (ratio.includes(word)) {
          score += 10;
        }

        if (applied.includes(word)) {
          score += 14;
        }

        if (basis.includes(word)) {
          score += 8;
        }

        if (issues.includes(word)) {
          score += 7;
        }

        if (decision.includes(word)) {
          score += 6;
        }

        if (facts.includes(word)) {
          score += 3;
        }

      });


      // ---------------------------------------------
      // PHRASE MATCH
      // ---------------------------------------------

      const importantPhrases = [];

      if (
        q.includes("computer related offence") ||
        q.includes("computer related offences")
      ) {
        importantPhrases.push(
          "computer related"
        );
      }

      if (
        q.includes("unauthorized access") ||
        q.includes("unauthorised access")
      ) {
        importantPhrases.push(
          "unauthorized access",
          "unauthorised access"
        );
      }

      if (
        q.includes("cheque bounce") ||
        q.includes("check bounce")
      ) {
        importantPhrases.push(
          "cheque bounce",
          "dishonour",
          "dishonor"
        );
      }

      if (
        q.includes("notice") ||
        q.includes("service of notice")
      ) {
        importantPhrases.push(
          "notice",
          "service of notice"
        );
      }


      importantPhrases.forEach(function(phrase) {

        if (text.includes(phrase)) {
          score += 20;
        }

      });


      // ---------------------------------------------
      // NOTICE / SERVICE
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
          score += 15;
        }

      });


      // ---------------------------------------------
      // CHEQUE BOUNCE
      // ---------------------------------------------

      if (
        (
          q.includes("cheque bounce") ||
          q.includes("check bounce") ||
          q.includes("dishonoured cheque") ||
          q.includes("dishonored cheque")
        ) &&
        (
          text.includes("cheque") ||
          text.includes("dishonour") ||
          text.includes("dishonor")
        )
      ) {

        score += 25;

      }


      // ---------------------------------------------
      // DATA QUALITY BONUS
      // ---------------------------------------------

      if (ratio) {
        score += 5;
      }

      if (applied) {
        score += 10;
      }

      if (issues) {
        score += 3;
      }

      if (decision) {
        score += 3;
      }


      // ---------------------------------------------
      // COURT BONUS
      // ---------------------------------------------

      const courtName =
        normalize(
          judgment.court_name ||
          judgment.court
        );


      if (
        court === "SC" &&
        courtName.includes("supreme")
      ) {
        score += 15;
      }

      if (
        court === "HC" &&
        courtName.includes("high")
      ) {
        score += 10;
      }


      return score;

    }


    // -----------------------------------------------
    // RANK
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


            facts:
              judgment.facts ||
              judgment.case_facts ||
              null,

            issues:
              judgment.issues ||
              judgment.legal_issues ||
              null,


            decision:
              (
                judgment.decision &&
                !/\.(pdf|doc|docx)$/i.test(
                  String(
                    judgment.decision
                  ).trim()
                )
              )
                ? judgment.decision
                : (
                    judgment.holding &&
                    !/\.(pdf|doc|docx)$/i.test(
                      String(
                        judgment.holding
                      ).trim()
                    )
                  )
                    ? judgment.holding
                    : null,


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
