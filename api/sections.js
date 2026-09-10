
export default async function handler(req, res) {

  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {

    // --------------------------------------------------
    // GET QUERY
    // --------------------------------------------------

    let query = "";

    if (req.method === "POST") {
      query = String(req.body?.query || "").trim();
    } else {
      query = String(
        req.query?.q ||
        req.query?.query ||
        ""
      ).trim();
    }

    if (!query) {
      return res.status(400).json({
        error: "Please provide a legal section or Act to search."
      });
    }

    const q = query.toLowerCase();

    const API_BASE =
      "https://indiacode.ecourtsindia.com/api/v1";


    // --------------------------------------------------
    // KNOWN ACT ALIASES
    // --------------------------------------------------

    const actMap = [

      {
        id: "bns",
        name: "Bharatiya Nyaya Sanhita, 2023",
        patterns: [
          /\bbns\b/i,
          /bharatiya nyaya sanhita/i
        ]
      },

      {
        id: "bnss",
        name: "Bharatiya Nagarik Suraksha Sanhita, 2023",
        patterns: [
          /\bbnss\b/i,
          /bharatiya nagarik suraksha sanhita/i
        ]
      },

      {
        id: "bsa",
        name: "Bharatiya Sakshya Adhiniyam, 2023",
        patterns: [
          /\bbsa\b/i,
          /bharatiya sakshya adhiniyam/i,
          /evidence act/i
        ]
      },

      {
        id: "ipc",
        name: "Indian Penal Code, 1860",
        patterns: [
          /\bipc\b/i,
          /indian penal code/i
        ]
      },

      {
        id: "crpc",
        name: "Code of Criminal Procedure, 1973",
        patterns: [
          /\bcrpc\b/i,
          /code of criminal procedure/i
        ]
      },

      {
        id: "cpc",
        name: "Code of Civil Procedure, 1908",
        patterns: [
          /\bcpc\b/i,
          /code of civil procedure/i
        ]
      },

      {
        id: "ni-act",
        name: "Negotiable Instruments Act, 1881",
        patterns: [
          /\bni\s*act\b/i,
          /\bn\.i\.\s*act\b/i,
          /negotiable instruments act/i,
          /cheque bounce/i,
          /check bounce/i
        ]
      }

    ];


    // --------------------------------------------------
    // FIND KNOWN ACT
    // --------------------------------------------------

    let selectedAct =
      actMap.find(act =>
        act.patterns.some(pattern =>
          pattern.test(q)
        )
      ) || null;


    // --------------------------------------------------
    // DETECT SECTION
    // --------------------------------------------------

    const sectionMatch =
      q.match(
        /\b(?:section|sec\.?)\s*([0-9]+(?:[a-z]|-[a-z0-9]+)?)\b/i
      ) ||
      q.match(
        /\b(?:BNS|BNSS|BSA|IPC|CrPC|CPC)\s*[-:]?\s*([0-9]+(?:[a-z]|-[a-z0-9]+)?)\b/i
      ) ||
      q.match(
        /\b(?:NI\s*ACT|N\.I\.\s*ACT)\s*[-:]?\s*([0-9]+(?:[a-z]|-[a-z0-9]+)?)\b/i
      );

    const sectionNumber =
      sectionMatch
        ? sectionMatch[1]
        : null;


    // --------------------------------------------------
    // BUILD ACT SEARCH QUERY
    // --------------------------------------------------
    // Remove the legal-question wording and section number
    // so the Acts endpoint can match the Act's short title.

    function buildActSearchQuery(input) {

      let value = String(input || "");

      value = value
        .replace(
          /\b(?:what\s+is|what's|explain|explain\s+section|tell\s+me|give\s+me|show\s+me|define|meaning\s+of)\b/gi,
          " "
        )
        .replace(
          /\b(?:section|sec\.?)\s*[0-9]+(?:[a-z]|-[a-z0-9]+)?\b/gi,
          " "
        )
        .replace(
          /\b(?:article)\s*[0-9]+(?:[a-z]|-[a-z0-9]+)?\b/gi,
          " "
        )
        .replace(
          /\b(?:of|under|in|the|please|regarding|related\s+to)\b/gi,
          " "
        )
        .replace(
          /[?.,:;()[\]{}]/g,
          " "
        )
        .replace(/\s+/g, " ")
        .trim();

      return value;
    }


    // --------------------------------------------------
    // DYNAMIC ACT DISCOVERY
    // --------------------------------------------------
    // IMPORTANT:
    // Act is identified BEFORE searching for the section.
    // This prevents Section 66 Companies Act being selected
    // when the user actually asked for IT Act Section 66.

    if (!selectedAct) {

      const actSearchQuery =
        buildActSearchQuery(query);

      try {

        let candidates = [];


        // ----------------------------------------------
        // FIRST: /acts?q=
        // ----------------------------------------------

        const actsUrl =
          `${API_BASE}/acts?` +
          new URLSearchParams({
            q: actSearchQuery,
            limit: "50"
          }).toString();

        const actsResponse =
          await fetch(actsUrl);

        if (actsResponse.ok) {

          const actsData =
            await actsResponse.json();

          if (Array.isArray(actsData.acts)) {
            candidates =
              candidates.concat(
                actsData.acts
              );
          }
        }


        // ----------------------------------------------
        // SECOND: /search?kind=act
        // ----------------------------------------------

        if (candidates.length === 0) {

          const actSearchUrl =
            `${API_BASE}/search?` +
            new URLSearchParams({
              q: actSearchQuery,
              kind: "act",
              limit: "50"
            }).toString();

          const actSearchResponse =
            await fetch(actSearchUrl);

          if (actSearchResponse.ok) {

            const actSearchData =
              await actSearchResponse.json();

            if (
              Array.isArray(
                actSearchData.results
              )
            ) {

              candidates =
                actSearchData.results.map(
                  result => ({
                    id:
                      result.id ||
                      result.act_id ||
                      result.actId ||
                      null,

                    short_title:
                      result.short_title ||
                      result.act_title ||
                      result.actTitle ||
                      result.title ||
                      "",

                    url:
                      result.url ||
                      null
                  })
                );

            }

          }

        }


        // ----------------------------------------------
        // SCORE ACT CANDIDATES
        // ----------------------------------------------

        if (candidates.length > 0) {

          const wanted =
            actSearchQuery
              .toLowerCase()
              .replace(/\bthe\b/g, "")
              .replace(/[^\w\s-]/g, " ")
              .replace(/\s+/g, " ")
              .trim();

          const wantedWords =
            wanted
              .split(" ")
              .filter(word =>
                word.length > 2
              );


          let bestCandidate = null;
          let bestScore = -1;


          for (const candidate of candidates) {

            const title =
              String(
                candidate.short_title ||
                candidate.title ||
                candidate.act_title ||
                ""
              )
                .toLowerCase()
                .replace(/[^\w\s-]/g, " ")
                .replace(/\s+/g, " ")
                .trim();

            if (!title) {
              continue;
            }


            let score = 0;


            // Exact phrase match
            if (
              wanted &&
              title.includes(wanted)
            ) {
              score += 100;
            }


            // Individual word matches
            for (const word of wantedWords) {

              if (title.includes(word)) {
                score += 10;
              }

            }


            // Prefer exact IT Act / POCSO / NDPS style matches
            if (
              title === wanted
            ) {
              score += 200;
            }


            if (score > bestScore) {

              bestScore = score;

              bestCandidate =
                candidate;

            }

          }


          if (
            bestCandidate &&
            (
              bestCandidate.id ||
              bestCandidate.act_id ||
              bestCandidate.actId
            )
          ) {

            selectedAct = {

              id:
                bestCandidate.id ||
                bestCandidate.act_id ||
                bestCandidate.actId,

              name:
                bestCandidate.short_title ||
                bestCandidate.title ||
                bestCandidate.act_title ||
                bestCandidate.actTitle ||
                bestCandidate.id

            };

          }

        }

      } catch (dynamicActError) {

        console.error(
          "Dynamic Act discovery error:",
          dynamicActError
        );

      }

    }


    // --------------------------------------------------
    // EXACT PROVISION
    // --------------------------------------------------

    if (
      selectedAct &&
      sectionNumber
    ) {

      const exactUrl =
        `${API_BASE}/${selectedAct.id}/section/` +
        encodeURIComponent(sectionNumber);


      const exactResponse =
        await fetch(exactUrl);


      let exactData = null;


      try {

        exactData =
          await exactResponse.json();

      } catch {

        exactData = null;

      }


      // ----------------------------------------------
      // EXACT PROVISION FOUND
      // ----------------------------------------------

      if (
        exactResponse.ok &&
        exactData &&
        exactData.section
      ) {

        const section =
          exactData.section;


        const sourceUrl =
          exactData.url ||
          section.url ||
          `https://indiacode.ecourtsindia.com/${selectedAct.id}/section/${sectionNumber}/`;


        // --------------------------------------------
        // VERIFIED JUDGMENTS
        // --------------------------------------------

        let judgments =
          Array.isArray(
            exactData.judgments
          )
            ? exactData.judgments.map(
                judgment => ({

                  verified: true,

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
                    judgment.court ||
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

                  precedentialValue:
                    judgment.precedential_value ||
                    null,

                  courtMarking:
                    judgment.court_marking ||
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

                  decidedUnder:
                    judgment.decided_under ||
                    null,

                  source:
                    judgment.url ||
                    judgment.source ||
                    null

                })
              )
            : [];


        // --------------------------------------------
        // LAWBot JUDGMENT FALLBACK
        // --------------------------------------------

        if (judgments.length === 0) {

          try {

            const protocol =
              req.headers["x-forwarded-proto"] ||
              "https";

            const host =
              req.headers.host;


            if (host) {

              const judgmentUrl =
                `${protocol}://${host}/api/judgments?` +
                new URLSearchParams({

                  act:
                    selectedAct.id,

                  section:
                    sectionNumber

                }).toString();


              const judgmentResponse =
                await fetch(judgmentUrl);


              if (judgmentResponse.ok) {

                const judgmentData =
                  await judgmentResponse.json();


                if (
                  Array.isArray(
                    judgmentData.judgments
                  )
                ) {

                  judgments =
                    judgmentData.judgments
                      .filter(
                        judgment =>
                          judgment &&
                          judgment.verified !== false
                      )
                      .map(
                        judgment => ({

                          verified: true,

                          caseName:
                            judgment.caseName ||
                            judgment.case_name ||
                            judgment.title ||
                            null,

                          court:
                            judgment.court ||
                            judgment.court_name ||
                            null,

                          courtLevel:
                            judgment.courtLevel ||
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

                          precedentialValue:
                            judgment.precedentialValue ||
                            judgment.precedential_value ||
                            null,

                          courtMarking:
                            judgment.courtMarking ||
                            judgment.court_marking ||
                            null,

                          ratio:
                            judgment.ratio ||
                            judgment.ratio_decidendi ||
                            null,

                          appliedToSection:
                            judgment.appliedToSection ||
                            judgment.applied_to_this_section ||
                            null,

                          basis:
                            judgment.basis ||
                            null,

                          decidedUnder:
                            judgment.decidedUnder ||
                            judgment.decided_under ||
                            null,

                          source:
                            judgment.source ||
                            judgment.url ||
                            null

                        })
                      );

                }

              }

            }

          } catch (judgmentError) {

            console.error(
              "Verified judgment connection error:",
              judgmentError
            );

          }

        }


        // --------------------------------------------
        // STATUTORY MAPPING
        // --------------------------------------------

        const correspondingProvisions =
          Array.isArray(
            exactData.corresponds_to
          )
            ? exactData.corresponds_to.map(
                item => ({

                  act:
                    item.act ||
                    null,

                  section:
                    item.section ||
                    item.number ||
                    null,

                  relation:
                    item.relation ||
                    null,

                  score:
                    item.score ??
                    null,

                  url:
                    item.url ||
                    null

                })
              )
            : [];


        // --------------------------------------------
        // CROSS REFERENCES
        // --------------------------------------------

        const crossReferences =
          Array.isArray(
            exactData.xrefs
          )
            ? exactData.xrefs
            : [];


        // --------------------------------------------
        // CLASSIFICATION
        // --------------------------------------------

        const classification =
          Array.isArray(
            exactData.classification
          )
            ? exactData.classification
            : [];


        // --------------------------------------------
        // RETURN VERIFIED SECTION
        // --------------------------------------------

        return res.status(200).json({

          verified: true,

          query,

          total: 1,

          count: 1,

          sections: [

            {

              verified: true,

              title:
                section.heading ||
                `${selectedAct.name} Section ${section.number || sectionNumber}`,

              act:
                exactData.act?.short_title ||
                selectedAct.name,

              actId:
                selectedAct.id,

              section:
                section.number ||
                sectionNumber,

              heading:
                section.heading ||
                null,

              text:
                section.text ||
                null,

              url:
                sourceUrl,

              classification,

              crossReferences,

              judgments,

              judgmentCount:
                judgments.length,

              correspondingProvisions

            }

          ]

        });

      }


      // ----------------------------------------------
      // ACT FOUND BUT SECTION DOES NOT EXIST
      // ----------------------------------------------

      if (
        exactResponse.status === 404
      ) {

        return res.status(404).json({

          verified: false,

          query,

          total: 0,

          count: 0,

          sections: [],

          error:
            `${selectedAct.name}, Section ${sectionNumber} could not be verified in the connected legal database.`

        });

      }

    }


    // --------------------------------------------------
    // GENERAL SECTION SEARCH
    // --------------------------------------------------

    const apiUrl =
      `${API_BASE}/search?` +
      new URLSearchParams({

        q:
          query,

        kind:
          "section",

        limit:
          "40"

      }).toString();


    const response =
      await fetch(apiUrl);


    let data = null;


    try {

      data =
        await response.json();

    } catch {

      data = {};

    }


    if (!response.ok) {

      return res.status(
        response.status
      ).json({

        error:
          data.error ||
          data.message ||
          "Legal section search failed"

      });

    }


    const results =
      Array.isArray(
        data.results
      )
        ? data.results
        : [];


    // --------------------------------------------------
    // CONVERT GENERAL SEARCH RESULTS
    // --------------------------------------------------

    const sections =
      results.map(result => {

        let actId = null;
        let sectionNumberFromUrl = null;


        if (result.url) {

          const match =
            result.url.match(
              /\/([^/]+)\/section\/([^/?#]+)/i
            );


          if (match) {

            actId =
              match[1];

            sectionNumberFromUrl =
              decodeURIComponent(
                match[2]
              );

          }

        }


        return {

          verified: true,

          title:
            result.title ||
            null,

          act:
            result.act ||
            result.act_title ||
            actId ||
            null,

          actId,

          section:
            result.section ||
            result.number ||
            sectionNumberFromUrl ||
            null,

          heading:
            result.heading ||
            null,

          text:
            result.text ||
            null,

          snippet:
            result.snippet ||
            null,

          url:
            result.url ||
            null,

          judgments: [],

          judgmentCount: 0,

          correspondingProvisions: [],

          classification: [],

          crossReferences: []

        };

      });


    // --------------------------------------------------
    // RETURN GENERAL SEARCH
    // --------------------------------------------------

    return res.status(200).json({

      verified:
        sections.length > 0,

      query,

      total:
        data.total ||
        sections.length,

      count:
        sections.length,

      sections

    });


  } catch (error) {

    console.error(
      "LawBot sections error:",
      error
    );


    return res.status(500).json({

      error:
        "Server error while searching legal sections."

    });

  }

}
